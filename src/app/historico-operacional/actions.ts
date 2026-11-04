"use server";
import {Prisma} from "@prisma/client";
import {refreshWorkflowActor} from "@/app/controle-temperatura-equipamentos/workflow-adapter";
import {legacyReviewScope} from "@/lib/legacy-review-scope";
import {isOperationalMonthClosed} from "@/lib/monthly-reopening";
import {verifyPassword} from "@/lib/password";


import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUserForAction } from "@/lib/auth-session";
import { validateSignaturePassword } from "@/lib/authz";
import { formatAppDateInput, getAppDate, getAppNow, parseAppDateInput } from "@/lib/date-time";
import {
  canSignModuleDay,
  canSignModuleMonthlyClosure,
  getOperationalSignatureModule
} from "@/lib/module-signatures";
import { prisma } from "@/lib/prisma";
import { reopenOperationalMonth } from "@/lib/monthly-reopening";
import { closeOperationalMonth } from "@/lib/monthly-periods";
import { rethrowIfRedirectError } from "@/lib/redirect-error";

type FeedbackType = "success" | "error";

function getInputValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function redirectWithFeedback(
  returnTo: string,
  feedbackType: FeedbackType,
  feedback: string
): never {
  const url = new URL(returnTo, "http://localhost");
  if (feedbackType === "success") {
    url.searchParams.delete("dia");
    url.searchParams.delete("signDia");
    url.searchParams.delete("signFechamentoMensal");
  }
  url.searchParams.set("feedbackType", feedbackType);
  url.searchParams.set("feedback", feedback);

  redirect(`${url.pathname}?${url.searchParams.toString()}`);
}

function getSafeReturnTo(formData: FormData, fallback: string): string {
  const returnTo = getInputValue(formData, "returnTo");
  return returnTo.startsWith(fallback) ? returnTo : fallback;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    const technicalPattern =
      /next_redirect|invalid `prisma|prismaclient|typeerror|referenceerror|syntaxerror|p20\d{2}|stack/i;
    if (technicalPattern.test(error.message)) {
      return "Não foi possível registrar a assinatura.";
    }

    return error.message;
  }

  return "Não foi possível registrar a assinatura.";
}

function parseMonth(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 12 ? parsed : null;
}

function parseYear(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 2020 && parsed <= 2100 ? parsed : null;
}


export async function reopenModuleMonthlyClosureAction(formData: FormData) {
  let returnTo = "/";
  try {
    const config = getOperationalSignatureModule(getInputValue(formData, "moduloCodigo"));
    returnTo = getSafeReturnTo(formData, config.historyPath);
    const mes = Number(getInputValue(formData, "mes"));
    const ano = Number(getInputValue(formData, "ano"));
    await reopenOperationalMonth({ user: await getCurrentUserForAction(), moduleCode: config.codigo, mes, ano, password: getInputValue(formData, "senhaConfirmacao"), reason: getInputValue(formData, "justificativa") });
    redirectWithFeedback(returnTo, "success", `Mês ${String(mes).padStart(2, "0")}/${ano} Reaberto com Sucesso.`);
  } catch (error) {
    rethrowIfRedirectError(error);
    const message = error instanceof Error && !/prisma|p20\d{2}|transaction|stack/i.test(error.message)
      ? error.message : "Não foi possível reabrir o mês. Tente novamente.";
    redirectWithFeedback(returnTo, "error", message);
  }
}

async function persistModuleDay(formData: FormData) {
  const moduleConfig = getOperationalSignatureModule(getInputValue(formData, "moduloCodigo"));
    const actor = await getCurrentUserForAction();
    if (!canSignModuleDay(actor, moduleConfig.codigo)) {
      throw new Error("Seu perfil não pode assinar dias como responsável técnico.");
    }

    const dataReferencia = parseAppDateInput(getInputValue(formData, "dataReferencia"));
    const senhaConfirmacao = getInputValue(formData, "senhaConfirmacao");
    const observacao = getInputValue(formData, "observacao");

    if (!dataReferencia) {
      throw new Error("Data inválida para assinatura do dia.");
    }
    if(moduleConfig.codigo==="oleo") {
      const {signLegacyOilDay}=await import("@/app/controle-qualidade-oleo/legacy-day-signature");
      await signLegacyOilDay(actor,dataReferencia,senhaConfirmacao,observacao);
      revalidatePath(moduleConfig.historyPath);
      return;
    }

    if(["temperatura","amostras","rastreabilidade"].includes(moduleConfig.codigo))throw Error("Utilize a revisão das versões selecionadas. No Buffet, abra o serviço completo. Registros sem autoria comprovada exigem regularização autorizada.");
    await prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${moduleConfig.codigo}),17326)`;
      const reviewer=await refreshWorkflowActor(tx,actor);
      if(!canSignModuleDay(reviewer,moduleConfig.codigo))throw Error("Sem habilitação e permissão para revisão técnica deste dia.");
      if(dataReferencia>getAppDate())throw Error("Não é possível assinar dias futuros.");
      if(await isOperationalMonthClosed(moduleConfig.codigo,dataReferencia.getUTCMonth()+1,dataReferencia.getUTCFullYear(),tx))throw Error("A competência está fechada.");
      const scope=await legacyReviewScope(tx,moduleConfig.codigo,dataReferencia);
      if(!scope.rows.length)throw Error("Não há registros elegíveis neste dia.");
      if(getInputValue(formData,"escopo")!==scope.token)throw Error("O conteúdo mudou. Recarregue o dia antes de assinar.");
      if(moduleConfig.codigo!=="hortifruti"&&scope.rows.some(row=>"status" in row&&(!["CONCLUIDO","AGUARDANDO_SUPERVISOR"].includes(row.status)||!("assinaturaResponsavel" in row)||!row.assinaturaResponsavel.trim())))throw Error("Conclua a execução e a assinatura dos executores antes da revisão do dia.");
      if(scope.rows.some(row=>"assinaturaResponsavelUsuarioId" in row&&(!row.assinaturaResponsavelUsuarioId||row.assinaturaResponsavelUsuarioId===reviewer.id)))throw Error("A revisão técnica exige executor identificado e independente.");
      const credentials=await tx.usuario.findUniqueOrThrow({where:{id:reviewer.id},select:{senhaHash:true}});
      if(!senhaConfirmacao||!verifyPassword(senhaConfirmacao,credentials.senhaHash))throw Error("Senha inválida para assinatura.");
      if(await tx.assinaturaDiariaModulo.findUnique({where:{moduloCodigo_dataReferencia:{moduloCodigo:moduleConfig.codigo,dataReferencia}}}))throw Error("Este dia já foi assinado pelo supervisor.");
      const signedAt=getAppNow();
      if (moduleConfig.codigo === "limpeza_diaria" || moduleConfig.codigo === "limpeza_semanal") {
        for (const row of scope.rows) {
          if (!("assinaturaSupervisor" in row) || row.assinaturaSupervisor.trim()) continue;
          const data = { assinaturaSupervisor: reviewer.nomeCompleto, assinaturaSupervisorUsuarioId: reviewer.id,
            assinaturaSupervisorNomeUsuario: reviewer.nomeUsuario, assinaturaSupervisorPerfil: reviewer.perfil,
            assinaturaSupervisorDataHora: signedAt, status: "CONCLUIDO" as const, observacaoSupervisor: observacao || null };
          const where = { id: row.id, updatedAt: row.updatedAt, assinaturaSupervisor: "" };
          if (moduleConfig.codigo === "limpeza_diaria") await tx.planoLimpezaDiarioRegistro.update({ where, data });
          else await tx.planoLimpezaSemanalExecucao.update({ where, data });
        }
      }
      await tx.assinaturaDiariaModulo.create({data:{moduloCodigo:moduleConfig.codigo,dataReferencia,usuarioId:reviewer.id,usuarioNomeSnapshot:reviewer.nomeCompleto,usuarioPerfilSnapshot:reviewer.perfil,responsavelTecnico:true,assinadoEm:signedAt,observacao:observacao||null}});
      await tx.logAssinatura.create({data:{usuarioId:reviewer.id,nomeUsuario:reviewer.nomeUsuario,nomeCompleto:reviewer.nomeCompleto,perfil:reviewer.perfil,tipo:"RESPONSAVEL_TECNICO",modulo:moduleConfig.codigo,referenciaId:formatAppDateInput(dataReferencia),assinadoEm:signedAt,observacao:JSON.stringify({responsabilidade:"revisao_tecnica_do_dia",escopo:scope.token,registros:scope.rows.map(row=>({id:row.id,updatedAt:row.updatedAt})),observacao})}});
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});


  revalidatePath(moduleConfig.historyPath);
  revalidatePath("/relatorios", "layout");
}

export async function signModuleDayState(_state: {status:string;message:string}, formData: FormData) {
  try { await persistModuleDay(formData); return {status:"success",message:"Dia assinado pelo supervisor com sucesso."}; }
  catch(error) { return {status:"error",message:getErrorMessage(error)}; }
}

export async function signModuleDayAction(formData: FormData) {
  const moduleConfig = getOperationalSignatureModule(getInputValue(formData, "moduloCodigo"));
  const returnTo = getSafeReturnTo(formData, moduleConfig.historyPath);
  try { await persistModuleDay(formData); redirectWithFeedback(returnTo,"success","Dia assinado pelo supervisor com sucesso."); }
  catch(error) { rethrowIfRedirectError(error); redirectWithFeedback(returnTo,"error",getErrorMessage(error)); }
}

export async function signModuleMonthlyClosureAction(formData: FormData) {
  const moduloCodigo = getInputValue(formData, "moduloCodigo");
  const moduleConfig = getOperationalSignatureModule(moduloCodigo);
  const returnTo = getSafeReturnTo(formData, moduleConfig.historyPath);

  try {
    const actor = await getCurrentUserForAction();
    if (!canSignModuleMonthlyClosure(actor, moduleConfig.codigo)) {
      throw new Error("Seu perfil não pode assinar fechamento mensal como responsável técnico.");
    }

    const mes = parseMonth(getInputValue(formData, "mes"));
    const ano = parseYear(getInputValue(formData, "ano"));
    const senhaConfirmacao = getInputValue(formData, "senhaConfirmacao");
    const observacao = getInputValue(formData, "observacao");

    if (!mes || !ano) {
      throw new Error("Informe mês e ano válidos para assinatura do fechamento.");
    }

    await validateSignaturePassword({ user: actor, password: senhaConfirmacao });

    await closeOperationalMonth({ user: actor, moduleCode: moduleConfig.codigo, mes, ano, observacao, password: senhaConfirmacao, confirmPending: getInputValue(formData,"confirmarPendencias")==="sim" });

    revalidatePath(moduleConfig.historyPath);
    revalidatePath(new URL(returnTo, "http://localhost").pathname);
    redirectWithFeedback(returnTo, "success", "Fechamento mensal assinado com sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}
