import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth-session";
import { refreshWorkflowActor } from "@/app/controle-temperatura-equipamentos/workflow-adapter";
import { canSignCleaningReview } from "@/lib/signature-authorization";
import { hasPermission } from "@/lib/permissions";
import { verifyPassword } from "@/lib/password";
import { getAppDate, getAppNow } from "@/lib/date-time";
import { isOperationalMonthClosed } from "@/lib/monthly-reopening";
import { prisma } from "@/lib/prisma";
import { getWeekDateRangeForDate, formatDateInput } from "./utils";

export type CleaningReviewModule = "limpeza_diaria" | "limpeza_semanal";
export function cleaningScopeToken(rows: readonly { id: number; updatedAt: Date }[]) {
  return createHash("sha256").update(JSON.stringify([...rows].sort((a,b)=>a.id-b.id).map(r=>({ id:r.id, updatedAt:r.updatedAt.toISOString() })))).digest("hex");
}

export async function cleaningReviewScope(tx: Prisma.TransactionClient, module: CleaningReviewModule, date: Date, area?: string) {
  const week = getWeekDateRangeForDate(date);
  const rows = module === "limpeza_diaria"
    ? await tx.planoLimpezaDiarioRegistro.findMany({ where: { data: date, excluidoEm: null, status: "AGUARDANDO_SUPERVISOR", assinaturaSupervisor: "" }, orderBy: { id: "asc" } })
    : await tx.planoLimpezaSemanalExecucao.findMany({ where: { area, excluidoEm: null, dataExecucao: { gte: week.start, lte: week.end } }, orderBy: { id: "asc" } });
  return { rows, token: cleaningScopeToken(rows) };
}

export function cleaningReviewEligibility(user: AuthenticatedUser, module: CleaningReviewModule, rows: Awaited<ReturnType<typeof cleaningReviewScope>>["rows"]) {
  if (!canSignCleaningReview(user, `modulo.${module}.${module === "limpeza_diaria" ? "assinar_historico" : "assinar_dia"}`)
    || module === "limpeza_diaria" && !hasPermission(user,"modulo.limpeza_diaria.assinar_todos"))
    return "A supervisão operacional exige gerente ou nutricionista com as permissões específicas.";
  if (!rows.length) return "Não há itens elegíveis para supervisão.";
  const pending = rows.filter(r=>!r.assinaturaSupervisor.trim());
  if (!pending.length) return "Este escopo já foi assinado pelo supervisor.";
  if (pending.some(r=>!r.assinaturaResponsavel.trim())) return "Conclua separadamente a assinatura dos executores antes da supervisão. O supervisor não pode assumir itens pendentes nesta operação.";
  if (pending.some(r=>!r.assinaturaResponsavelUsuarioId)) return "Há executores antigos sem identificação comprovada. É necessária regularização autorizada.";
  if (pending.some(r=>r.assinaturaResponsavelUsuarioId===user.id)) return "Quem executou qualquer atividade selecionada não pode assinar sua supervisão.";
  return "";
}

export async function signCleaningReview(params: { authenticated: AuthenticatedUser; module: CleaningReviewModule; date: Date; area?: string; token: string; password: string; observation: string }) {
  return prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${params.module}),17326)`;
    const actor=await refreshWorkflowActor(tx,params.authenticated);
    if (params.date>getAppDate()) throw Error("Não é possível assinar períodos futuros.");
    if (params.module==="limpeza_semanal"&&!params.area?.trim()) throw Error("Informe a área da semana.");
    const scope=await cleaningReviewScope(tx,params.module,params.date,params.area);
    const reason=cleaningReviewEligibility(actor,params.module,scope.rows);if(reason)throw Error(reason);
    if (!params.token||params.token!==scope.token) throw Error("Os itens mudaram desde a consulta. Recarregue antes de assinar.");
    for(const row of scope.rows){
      const date="dataExecucao" in row?row.dataExecucao:row.data;
      if(date>getAppDate())throw Error("Não é possível validar uma atividade futura.");
      if(await isOperationalMonthClosed(params.module,date.getUTCMonth()+1,date.getUTCFullYear(),tx))throw Error("A competência está fechada.");
    }
    const credentials=await tx.usuario.findUniqueOrThrow({where:{id:actor.id},select:{senhaHash:true}});
    if(!params.password||!verifyPassword(params.password,credentials.senhaHash))throw Error("Senha inválida para assinatura.");
    const signedAt=getAppNow(),pending=scope.rows.filter(r=>!r.assinaturaSupervisor.trim());
    for(const row of pending){
      const data={assinaturaSupervisor:actor.nomeCompleto,assinaturaSupervisorUsuarioId:actor.id,assinaturaSupervisorNomeUsuario:actor.nomeUsuario,assinaturaSupervisorPerfil:actor.perfil,assinaturaSupervisorDataHora:signedAt,status:"CONCLUIDO" as const,observacaoSupervisor:params.observation||null};
      const where={id:row.id,updatedAt:row.updatedAt,assinaturaSupervisor:""};
      if(params.module==="limpeza_diaria")await tx.planoLimpezaDiarioRegistro.update({where,data});
      else await tx.planoLimpezaSemanalExecucao.update({where,data});
    }
    await tx.logAssinatura.create({data:{usuarioId:actor.id,nomeUsuario:actor.nomeUsuario,nomeCompleto:actor.nomeCompleto,perfil:actor.perfil,tipo:"SUPERVISOR",modulo:params.module==="limpeza_diaria"?"plano-limpeza/diario":"plano-limpeza/semanal",referenciaId:params.module==="limpeza_diaria"?formatDateInput(params.date):`${params.area}|${formatDateInput(getWeekDateRangeForDate(params.date).start)}`,assinadoEm:signedAt,observacao:JSON.stringify({responsabilidade:"supervisao_operacional",escopo:scope.token,registros:pending.map(r=>({id:r.id,updatedAt:r.updatedAt})),observacao:params.observation})}});
    return pending.length;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}
