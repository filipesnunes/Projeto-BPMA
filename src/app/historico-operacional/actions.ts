"use server";

import { Prisma } from "@prisma/client";
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

function parseIndicatorsSnapshot(value: string): Prisma.InputJsonValue | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    return parsed as Prisma.InputJsonValue;
  } catch {
    return null;
  }
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
    const indicadoresSnapshot = parseIndicatorsSnapshot(
      getInputValue(formData, "indicadoresSnapshot")
    );

    if (!mes || !ano) {
      throw new Error("Informe mês e ano válidos para assinatura do fechamento.");
    }

    await validateSignaturePassword({ user: actor, password: senhaConfirmacao });

    const existing = await prisma.fechamentoMensalModulo.findUnique({
      where: {
          moduloCodigo_ano_mes: {
          moduloCodigo: moduleConfig.codigo,
          ano,
          mes
        }
      }
    });

    if (existing) {
      throw new Error("Este fechamento mensal já foi assinado.");
    }

    const signedAt = getAppNow();
    await prisma.fechamentoMensalModulo.create({
      data: {
        moduloCodigo: moduleConfig.codigo,
        ano,
        mes,
        usuarioId: actor.id,
        usuarioNomeSnapshot: actor.nomeCompleto,
        usuarioPerfilSnapshot: actor.perfil,
        assinadoEm: signedAt,
        ...(indicadoresSnapshot ? { indicadoresSnapshot } : {}),
        observacao: observacao || null
      }
    });

    await createSignatureLog({
      user: actor,
      tipo: "FECHAMENTO_MENSAL",
      modulo: moduleConfig.codigo,
      referenciaId: `${String(mes).padStart(2, "0")}/${ano}`,
      observacao: observacao || "Fechamento mensal assinado pelo responsável técnico."
    });

    revalidatePath(moduleConfig.historyPath);
    revalidatePath(new URL(returnTo, "http://localhost").pathname);
    redirectWithFeedback(returnTo, "success", "Fechamento mensal assinado com sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}
