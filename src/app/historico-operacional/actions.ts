"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUserForAction } from "@/lib/auth-session";
import { createSignatureLog, validateSignaturePassword } from "@/lib/authz";
import { formatAppDateInput, getAppNow, parseAppDateInput } from "@/lib/date-time";
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
    await reopenOperationalMonth({ user: await getCurrentUserForAction(), moduleCode: config.codigo, mes, ano });
    redirectWithFeedback(returnTo, "success", `Mês ${String(mes).padStart(2, "0")}/${ano} Reaberto com Sucesso.`);
  } catch (error) {
    rethrowIfRedirectError(error);
    const message = error instanceof Error && !/prisma|p20\d{2}|transaction|stack/i.test(error.message)
      ? error.message : "Não foi possível reabrir o mês. Tente novamente.";
    redirectWithFeedback(returnTo, "error", message);
  }
}

export async function signModuleDayAction(formData: FormData) {
  const moduloCodigo = getInputValue(formData, "moduloCodigo");
  const moduleConfig = getOperationalSignatureModule(moduloCodigo);
  const returnTo = getSafeReturnTo(formData, moduleConfig.historyPath);

  try {
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

    await validateSignaturePassword({ user: actor, password: senhaConfirmacao });

    const existing = await prisma.assinaturaDiariaModulo.findUnique({
      where: {
          moduloCodigo_dataReferencia: {
          moduloCodigo: moduleConfig.codigo,
          dataReferencia
        }
      }
    });

    if (existing) {
      throw new Error("Este dia já foi assinado pelo supervisor.");
    }

    const signedAt = getAppNow();
    await prisma.assinaturaDiariaModulo.create({
      data: {
        moduloCodigo: moduleConfig.codigo,
        dataReferencia,
        usuarioId: actor.id,
        usuarioNomeSnapshot: actor.nomeCompleto,
        usuarioPerfilSnapshot: actor.perfil,
        responsavelTecnico: true,
        assinadoEm: signedAt,
        observacao: observacao || null
      }
    });

    await createSignatureLog({
      user: actor,
      tipo: "RESPONSAVEL_TECNICO",
      modulo: moduleConfig.codigo,
      referenciaId: formatAppDateInput(dataReferencia),
      observacao: observacao || "Assinatura diária em bloco."
    });

    revalidatePath(moduleConfig.historyPath);
    revalidatePath(new URL(returnTo, "http://localhost").pathname);
    redirectWithFeedback(returnTo, "success", "Dia assinado pelo supervisor com sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
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

    await closeOperationalMonth({ user: actor, moduleCode: moduleConfig.codigo, mes, ano, observacao });

    revalidatePath(moduleConfig.historyPath);
    revalidatePath(new URL(returnTo, "http://localhost").pathname);
    redirectWithFeedback(returnTo, "success", "Fechamento mensal assinado com sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}
