import "server-only";
import { Prisma } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth-session";
import { getAppNow } from "@/lib/date-time";
import type { OperationalSignatureModuleCode } from "@/lib/module-signatures";
import { canSignModuleMonthlyClosure } from "@/lib/module-signatures";
import { canCloseMonthlyPeriod } from "@/lib/monthly-period-permissions";
import { findLegacyMonthlyClosure, revalidateMonthlyPeriod, validateMonthlyPeriod } from "@/lib/monthly-reopening";
import { prisma } from "@/lib/prisma";

export async function listLegacyMonthlyClosures(code: OperationalSignatureModuleCode) {
  const where = { status: "ASSINADO" as const };
  switch (code) {
    case "hortifruti": return prisma.higienizacaoHortifrutiFechamento.findMany({ where });
    case "temperatura": return prisma.controleTemperaturaEquipamentoFechamento.findMany({ where });
    case "oleo": return prisma.controleQualidadeOleoFechamento.findMany({ where });
    case "amostras": return prisma.controleBuffetAmostraFechamento.findMany({ where });
    case "rastreabilidade": return prisma.rastreabilidadeRecebimentoFechamento.findMany({ where });
    case "limpeza_diaria": case "limpeza_semanal": return prisma.planoLimpezaFechamento.findMany({ where: { ...where, tipo: code === "limpeza_diaria" ? "DIARIO" : "SEMANAL" } });
  }
}

export function monthlyDateRange(mes: number, ano: number) {
  validateMonthlyPeriod(mes, ano);
  return { gte: new Date(Date.UTC(ano, mes - 1, 1)), lt: new Date(Date.UTC(ano, mes, 1)) };
}

// The same counts and blocking conditions used by the module closing actions.
// Missing daily supervisor signatures remain advisory under the existing policy.
export async function monthlyPeriodCounts(code: OperationalSignatureModuleCode, mes: number, ano: number, db: Prisma.TransactionClient = prisma) {
  const data = monthlyDateRange(mes, ano);
  let records = 0;
  let pending: number | null = null;
  switch (code) {
    case "hortifruti": records = await db.higienizacaoHortifruti.count({ where: { data } }); break;
    case "temperatura": records = await db.controleTemperaturaEquipamento.count({ where: { data } }); break;
    case "oleo": records = await db.controleQualidadeOleoRegistro.count({ where: { data } }); break;
    case "limpeza_diaria": records = await db.planoLimpezaDiarioRegistro.count({ where: { data } }); break;
    case "limpeza_semanal": records = await db.planoLimpezaSemanalExecucao.count({ where: { dataExecucao: data } }); break;
    case "rastreabilidade":
      records = await db.rastreabilidadeRecebimentoNota.count({ where: { data } });
      pending = await db.rastreabilidadeRecebimentoNota.count({ where: { data, statusNota: { not: "FINALIZADA" } } }); break;
    case "amostras":
      records = await db.controleBuffetAmostraRegistro.count({ where: { data } });
      pending = await db.controleBuffetAmostraRegistro.count({ where: { data, status: { notIn: ["ASSINADO", "NAO_SERVIDO"] } } }); break;
  }
  return { records, pending };
}

export async function validateMonthlyClosing(code: OperationalSignatureModuleCode, mes: number, ano: number, db: Prisma.TransactionClient = prisma) {
  const counts = await monthlyPeriodCounts(code, mes, ano, db);
  if (!counts.records) throw new Error("Não há registros no período selecionado para fechamento.");
  if (counts.pending) throw new Error(code === "rastreabilidade"
    ? "Existem notas pendentes no período. Finalize todas as notas antes de fechar o mês."
    : "Existem itens ainda não assinados no período. Conclua as assinaturas antes de fechar o mês.");
  return counts;
}

async function updateLegacyClosing(db: Prisma.TransactionClient, code: OperationalSignatureModuleCode, id: number, user: AuthenticatedUser, signedAt: Date) {
  const args = { where: { id }, data: { status: "ASSINADO" as const, responsavelTecnico: user.nomeCompleto, dataAssinatura: signedAt } };
  switch (code) {
    case "hortifruti": return db.higienizacaoHortifrutiFechamento.update(args);
    case "temperatura": return db.controleTemperaturaEquipamentoFechamento.update(args);
    case "oleo": return db.controleQualidadeOleoFechamento.update(args);
    case "amostras": return db.controleBuffetAmostraFechamento.update(args);
    case "rastreabilidade": return db.rastreabilidadeRecebimentoFechamento.update(args);
    case "limpeza_diaria": case "limpeza_semanal": return db.planoLimpezaFechamento.update(args);
  }
}

export async function closeReopenedOperationalMonth(params: { user: AuthenticatedUser; moduleCode: OperationalSignatureModuleCode; mes: number; ano: number; observacao?: string }) {
  return closeOperationalMonth(params, "management");
}

// This context is chosen by server code, never by a submitted form field.
export async function closeOperationalMonth(params: { user: AuthenticatedUser; moduleCode: OperationalSignatureModuleCode; mes: number; ano: number; observacao?: string }, context: "history" | "legacy" | "management" = "history") {
  const { user, moduleCode, mes, ano } = params;
  const management = context === "management";
  validateMonthlyPeriod(mes, ano);
  if (context !== "history" ? !canCloseMonthlyPeriod(user, moduleCode) : !canSignModuleMonthlyClosure(user, moduleCode)) throw new Error("Seu perfil não pode fechar este período.");
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${moduleCode}), 17326)`;
    const period = await tx.fechamentoMensalModulo.findUnique({ where: { moduloCodigo_ano_mes: { moduloCodigo: moduleCode, mes, ano } } });
    if (management && period?.status !== "REABERTO") throw new Error("Este período não está reaberto. Atualize a página.");
    if (!management && period?.status === "REABERTO") throw new Error("Feche este mês reaberto pela área Gerenciamento de Períodos.");
    const legacy = await findLegacyMonthlyClosure(moduleCode, mes, ano, tx);
    if (!management && (period || legacy?.status === "ASSINADO")) throw new Error("Este período já está fechado.");
    const counts = await validateMonthlyClosing(moduleCode, mes, ano, tx);
    const signedAt = getAppNow();
    await tx.logAssinatura.create({ data: {
      usuarioId: user.id, nomeUsuario: user.nomeUsuario, nomeCompleto: user.nomeCompleto, perfil: user.perfil,
      tipo: "FECHAMENTO_MENSAL", modulo: moduleCode, referenciaId: `${String(mes).padStart(2, "0")}/${ano}`, assinadoEm: signedAt,
      observacao: JSON.stringify({ operacao: management ? "NOVO_FECHAMENTO_MENSAL" : "FECHAMENTO_MENSAL", mes, ano, modulo: moduleCode, fechamentoAnterior: period, fechamentoEspecificoAnterior: legacy, observacao: params.observacao || null })
    } });
    const data = {
      status: "FECHADO", usuarioId: user.id, usuarioNomeSnapshot: user.nomeCompleto, usuarioPerfilSnapshot: user.perfil,
      assinadoEm: signedAt, indicadoresSnapshot: counts, observacao: params.observacao || null
    };
    await tx.fechamentoMensalModulo.upsert({ where: { moduloCodigo_ano_mes: { moduloCodigo: moduleCode, mes, ano } }, create: { moduloCodigo: moduleCode, mes, ano, ...data }, update: data });
    if (legacy) await updateLegacyClosing(tx, moduleCode, legacy.id, user, signedAt);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  revalidateMonthlyPeriod(moduleCode);
}
