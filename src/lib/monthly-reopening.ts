import "server-only";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import type { AuthenticatedUser } from "@/lib/auth-session";
import { getAppNow, formatAppDateTime } from "@/lib/date-time";
import { getOperationalSignatureModule, type OperationalSignatureModuleCode } from "@/lib/module-signatures";
import { prisma } from "@/lib/prisma";
import { canReopenMonthlyPeriod, monthlyPeriodsPath } from "@/lib/monthly-period-permissions";

export function validateMonthlyPeriod(mes: number, ano: number) {
  if (!Number.isInteger(mes) || mes < 1 || mes > 12 || !Number.isInteger(ano) || ano < 2020 || ano > 2100) {
    throw new Error("Informe um mês e ano válidos.");
  }
}

export async function isOperationalMonthClosed(code: OperationalSignatureModuleCode, mes: number, ano: number, db: Prisma.TransactionClient = prisma) {
  const generic = await db.fechamentoMensalModulo.findUnique({ where: { moduloCodigo_ano_mes: { moduloCodigo: code, mes, ano } } });
  if (generic) return generic.status !== "REABERTO";
  return (await findLegacyMonthlyClosure(code, mes, ano, db))?.status === "ASSINADO";
}

export async function assertNotReopenedMonth(code: OperationalSignatureModuleCode, mes: number, ano: number) {
  const period = await prisma.fechamentoMensalModulo.findUnique({ where: { moduloCodigo_ano_mes: { moduloCodigo: code, mes, ano } } });
  if (period?.status === "REABERTO") throw new Error("Feche este mês reaberto pela área Gerenciamento de Períodos.");
}

export async function reopenedMonthlyReportLabel(code: OperationalSignatureModuleCode, mes: number, ano: number) {
  const period = await prisma.fechamentoMensalModulo.findUnique({ where: { moduloCodigo_ano_mes: { moduloCodigo: code, mes, ano } } });
  return period?.status === "REABERTO" ? `Reaberto. Fechamento anterior: ${period.usuarioNomeSnapshot} em ${formatAppDateTime(period.assinadoEm)}.` : null;
}

export function revalidateMonthlyPeriod(code: OperationalSignatureModuleCode) {
  const config = getOperationalSignatureModule(code);
  revalidatePath(config.historyPath);
  revalidatePath(config.historyPath.replace(/\/historico$/, ""), "layout");
  revalidatePath(monthlyPeriodsPath(code));
  revalidatePath("/");
  revalidatePath("/api/dashboard/insights");
  revalidatePath("/api/dashboard/details");
  revalidatePath("/relatorios", "layout");
}

export async function findLegacyMonthlyClosure(
  code: OperationalSignatureModuleCode, mes: number, ano: number,
  db: Prisma.TransactionClient = prisma
) {
  const where = { mes_ano: { mes, ano } };
  switch (code) {
    case "hortifruti": return db.higienizacaoHortifrutiFechamento.findUnique({ where });
    case "temperatura": return db.controleTemperaturaEquipamentoFechamento.findUnique({ where });
    case "oleo": return db.controleQualidadeOleoFechamento.findUnique({ where });
    case "amostras": return db.controleBuffetAmostraFechamento.findUnique({ where });
    case "rastreabilidade": return db.rastreabilidadeRecebimentoFechamento.findUnique({ where });
    case "limpeza_diaria": case "limpeza_semanal":
      return db.planoLimpezaFechamento.findUnique({ where: { tipo_mes_ano: {
        tipo: code === "limpeza_diaria" ? "DIARIO" : "SEMANAL", mes, ano
      } } });
  }
}

async function openLegacyClosure(db: Prisma.TransactionClient, code: OperationalSignatureModuleCode, id: number) {
  const args = { where: { id }, data: { status: "ABERTO" as const } };
  switch (code) {
    case "hortifruti": return db.higienizacaoHortifrutiFechamento.update(args);
    case "temperatura": return db.controleTemperaturaEquipamentoFechamento.update(args);
    case "oleo": return db.controleQualidadeOleoFechamento.update(args);
    case "amostras": return db.controleBuffetAmostraFechamento.update(args);
    case "rastreabilidade": return db.rastreabilidadeRecebimentoFechamento.update(args);
    case "limpeza_diaria": case "limpeza_semanal": return db.planoLimpezaFechamento.update(args);
  }
}

export async function reopenOperationalMonth(params: {
  user: AuthenticatedUser; moduleCode: OperationalSignatureModuleCode; mes: number; ano: number;
}) {
  const { user, moduleCode, mes, ano } = params;
  getOperationalSignatureModule(moduleCode);
  if (!canReopenMonthlyPeriod(user, moduleCode)) {
    throw new Error("Apenas o usuário DEV pode reabrir meses.");
  }
  validateMonthlyPeriod(mes, ano);

  await prisma.$transaction(async (tx) => {
    // All period transitions acquire the same module-specific lock. Other modules are independent.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${moduleCode}), 17326)`;
    const reopened = await tx.fechamentoMensalModulo.findFirst({ where: { moduloCodigo: moduleCode, status: "REABERTO" } });
    if (reopened) throw new Error(`Não é possível reabrir este mês porque ${String(reopened.mes).padStart(2, "0")}/${reopened.ano} já está reaberto. Finalize as pendências e feche esse período antes de reabrir outro mês.`);
    const generic = await tx.fechamentoMensalModulo.findUnique({ where: {
      moduloCodigo_ano_mes: { moduloCodigo: moduleCode, ano, mes }
    } });
    const legacy = await findLegacyMonthlyClosure(moduleCode, mes, ano, tx);
    if (!generic && legacy?.status !== "ASSINADO") {
      throw new Error(`O mês ${String(mes).padStart(2, "0")}/${ano} não está fechado.`);
    }

    // Archive the entire previous closure before changing its explicit state.
    // Existing signature logs, daily signatures and operational records remain intact.
    await tx.logAssinatura.create({ data: {
      usuarioId: user.id, nomeUsuario: user.nomeUsuario, nomeCompleto: user.nomeCompleto,
      perfil: user.perfil, tipo: "FECHAMENTO_MENSAL", modulo: moduleCode,
      referenciaId: `${String(mes).padStart(2, "0")}/${ano}`, assinadoEm: getAppNow(),
      observacao: JSON.stringify({ operacao: "REABERTURA_MENSAL", modulo: moduleCode, mes, ano,
        fechamentoGenericoAnterior: generic, fechamentoEspecificoAnterior: legacy,
        assinaturasDiariasPreservadas: true })
    } });
    if (legacy?.status === "ASSINADO") await openLegacyClosure(tx, moduleCode, legacy.id);
    const reabertura = { status: "REABERTO", reabertoEm: getAppNow(), reabertoPorUsuarioId: user.id, reabertoPorNome: user.nomeCompleto };
    if (generic) await tx.fechamentoMensalModulo.update({ where: { id: generic.id }, data: reabertura });
    else await tx.fechamentoMensalModulo.create({ data: {
      moduloCodigo: moduleCode, mes, ano, ...reabertura,
      usuarioNomeSnapshot: legacy!.responsavelTecnico, usuarioPerfilSnapshot: null,
      assinadoEm: legacy!.dataAssinatura, observacao: "Fechamento legado; perfil original não disponível. Consulte a auditoria."
    } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  revalidateMonthlyPeriod(moduleCode);
}
