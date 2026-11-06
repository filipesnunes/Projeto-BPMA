import { isNonTechnicalRetroactive } from "./review-presentation";
import "server-only";
import { Prisma } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth-session";
import { getAppNow } from "@/lib/date-time";
import type { OperationalSignatureModuleCode } from "@/lib/module-signatures";
import { canSignModuleMonthlyClosure } from "@/lib/module-signatures";
import { canCloseMonthlyPeriod } from "@/lib/monthly-period-permissions";
import { findLegacyMonthlyClosure, revalidateMonthlyPeriod, validateMonthlyPeriod } from "@/lib/monthly-reopening";
import { prisma } from "@/lib/prisma";
import { assertNoReopenedWorkflow } from "@/lib/operational-workflow/service";
import { buffetMonthlyEligibility, buffetMonthlyBlockingMessage } from "@/app/controle-buffet-amostras/monthly-eligibility";

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

export async function pendingOilReviewDates(mes: number, ano: number, db: Prisma.TransactionClient = prisma) {
  const range=monthlyDateRange(mes,ano);
  const [rows,daily]=await Promise.all([
    db.controleQualidadeOleoRegistro.findMany({where:{data:range,excluidoEm:null},include:{fluxo:{select:{assinaturaVigenteId:true,estado:true,assinaturaVigente:{select:{mecanismo:true}}}}}}),
    db.assinaturaDiariaModulo.findMany({where:{moduloCodigo:"oleo",dataReferencia:range},select:{dataReferencia:true}})
  ]);
  const days=new Set(daily.map(row=>row.dataReferencia.toISOString().slice(0,10)));
  return [...new Set(rows.filter(row=>row.fluxo ? !row.fluxo.assinaturaVigenteId || row.fluxo.estado!=="FECHADO" || isNonTechnicalRetroactive(row.fluxo.assinaturaVigente?.mecanismo) : !row.assinaturaSupervisorEm&&!days.has(row.data.toISOString().slice(0,10))).map(row=>row.data.toISOString().slice(0,10)))].sort();
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
      {const month=await buffetMonthlyEligibility(db,mes,ano);records=month.records;pending=month.pending;} break;
  }
  return { records, pending };
}

export async function validateMonthlyClosing(code: OperationalSignatureModuleCode, mes: number, ano: number, db: Prisma.TransactionClient = prisma) {
  if(code==="amostras"){
    monthlyDateRange(mes,ano);
    const month=await buffetMonthlyEligibility(db,mes,ano);
    if(!month.records&&!month.services.length&&!month.pending)throw Error("Não há registros no período selecionado para fechamento.");
    if(month.pending)throw Error(buffetMonthlyBlockingMessage(month,mes,ano));
    return {records:month.records,pending:month.pending};
  }
  if (["temperatura","oleo","rastreabilidade"].includes(code)) {
    const range = monthlyDateRange(mes, ano);
    await assertNoReopenedWorkflow(db, code, range.gte, range.lt);
  }
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

export async function closeReopenedOperationalMonth(params: { user: AuthenticatedUser; moduleCode: OperationalSignatureModuleCode; mes: number; ano: number; observacao?: string; password?: string; confirmPending?: boolean }) {
  return closeOperationalMonth(params, "management");
}

// This context is chosen by server code, never by a submitted form field.
export async function closeOperationalMonth(params: { user: AuthenticatedUser; moduleCode: OperationalSignatureModuleCode; mes: number; ano: number; observacao?: string; password?: string; confirmPending?: boolean }, context: "history" | "legacy" | "management" = "history") {
  const { moduleCode, mes, ano } = params;
  let user = params.user;
  const management = context === "management";
  validateMonthlyPeriod(mes, ano);
  if (context !== "history" ? !canCloseMonthlyPeriod(user, moduleCode) : !canSignModuleMonthlyClosure(user, moduleCode)) throw new Error("Seu perfil não pode fechar este período.");
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${moduleCode}), 17326)`;
    if (["temperatura","oleo","amostras","rastreabilidade"].includes(moduleCode)) {
      const { refreshWorkflowActor } = await import("@/app/controle-temperatura-equipamentos/workflow-adapter");
      user = await refreshWorkflowActor(tx, user);
      if (context !== "history" ? !canCloseMonthlyPeriod(user, moduleCode) : !canSignModuleMonthlyClosure(user, moduleCode)) throw new Error("Seu perfil não pode fechar este período.");
    }
    const period = await tx.fechamentoMensalModulo.findUnique({ where: { moduloCodigo_ano_mes: { moduloCodigo: moduleCode, mes, ano } } });
    if(moduleCode==="amostras"){
      const {verifyPassword}=await import("./password");
      const credentials=await tx.usuario.findUniqueOrThrow({where:{id:user.id},select:{senhaHash:true}});
      if(!params.password?.trim()||!verifyPassword(params.password.trim(),credentials.senhaHash))throw Error("Senha inválida para confirmar a assinatura.");
    }
    let oilAuthorization;
    if(moduleCode === "oleo") {
      const { canSignOilSupervisor } = await import("./oil-signature-permissions");
      if(!canSignOilSupervisor(user,"monthly"))throw new Error("Sem habilitação e permissão para o fechamento mensal do óleo.");
      const { verifyPassword } = await import("./password");
      const credentials=await tx.usuario.findUniqueOrThrow({where:{id:user.id},select:{senhaHash:true}});
      if(!params.password?.trim()||!verifyPassword(params.password.trim(),credentials.senhaHash))throw new Error("Senha inválida para confirmar a assinatura.");
      const { oilAuthorizationEvidence } = await import("@/app/controle-qualidade-oleo/signature-policy");
      oilAuthorization=oilAuthorizationEvidence(user,"monthly");
    }
    if (management && period?.status !== "REABERTO") throw new Error("Este período não está reaberto. Atualize a página.");
    if (!management && period?.status === "REABERTO") throw new Error("Feche este mês reaberto pela área Gerenciamento de Períodos.");
    const legacy = await findLegacyMonthlyClosure(moduleCode, mes, ano, tx);
    if (!management && (period || legacy?.status === "ASSINADO")) throw new Error("Este período já está fechado.");
    const counts = await validateMonthlyClosing(moduleCode, mes, ano, tx);
    const pendingDates = moduleCode === "oleo" ? await pendingOilReviewDates(mes,ano,tx) : [];
    if (pendingDates.length && (!params.confirmPending || !params.observacao?.trim() || params.observacao.trim().length>4000)) {
      throw Error(`Há ${pendingDates.length} dia(s) com assinatura pendente: ${pendingDates.join(", ")}. Confirme especificamente o fechamento com pendências e informe a justificativa.`);
    }
    const signedAt = getAppNow();
    await tx.logAssinatura.create({ data: {
      usuarioId: user.id, nomeUsuario: user.nomeUsuario, nomeCompleto: user.nomeCompleto, perfil: user.perfil,
      tipo: "FECHAMENTO_MENSAL", modulo: moduleCode, referenciaId: `${String(mes).padStart(2, "0")}/${ano}`, assinadoEm: signedAt,
      observacao: JSON.stringify({ operacao: management ? "NOVO_FECHAMENTO_MENSAL" : "FECHAMENTO_MENSAL", mes, ano, modulo: moduleCode, fechamentoAnterior: period, fechamentoEspecificoAnterior: legacy, observacao: params.observacao || null, ...(pendingDates.length?{excecaoAssinaturasPendentes:{datas:pendingDates,confirmacaoExplicita:true}}:{}), ...(oilAuthorization?{autorizacao:oilAuthorization}:{}) })
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
