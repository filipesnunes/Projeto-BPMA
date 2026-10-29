"use server";
import { createFromOriginalForm } from "@/app/historico-operacional/compatible-create";
import { saveOilWorkflowAction, signOilWorkflowAction } from "./workflow-actions";
import { deleteOperationalRecord } from "@/lib/operational-deletion";

import { closeOperationalMonth } from "@/lib/monthly-periods";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { rethrowIfRedirectError } from "@/lib/redirect-error";

import { getCurrentUserForAction } from "@/lib/auth-session";
import {
  ensurePermission,
  validateSignaturePassword
} from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { reopenOperationalMonth, isOperationalMonthClosed, assertNotReopenedMonth } from "@/lib/monthly-reopening";

import {
  hasOilOptionWithSameLabel,
  parseOilStatus,
  sanitizeDescription,
  sanitizeLabel
} from "./catalog";
import {
  getMonthDateRange,
  parsePositiveInt,
} from "./utils";

const MODULE_PATH = "/controle-qualidade-oleo";
const HISTORY_PATH = "/controle-qualidade-oleo/historico";
const OPTIONS_PATH = "/controle-qualidade-oleo/opcoes";
const REGISTRO_FORM_PARAM_KEYS = [
  "formDataReferencia",
  "formFita",
  "formTemperatura",
  "formSemUtilizacao",
  "formObservacao"
] as const;

type FeedbackType = "success" | "error";

function getInputValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getReturnToPath(formData: FormData): string {
  const value = getInputValue(formData, "returnTo");

  if (!value.startsWith(MODULE_PATH)) {
    return MODULE_PATH;
  }

  return value;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    const technicalPattern =
      /next_redirect|invalid `prisma|prismaclient|typeerror|referenceerror|syntaxerror|p20\d{2}|stack/i;
    if (technicalPattern.test(error.message)) {
      return fallback;
    }
    return error.message;
  }

  return fallback;
}

function redirectWithFeedback(
  returnTo: string,
  feedbackType: FeedbackType,
  feedback: string,
  formState?: Record<(typeof REGISTRO_FORM_PARAM_KEYS)[number], string>
): never {
  const url = new URL(returnTo, "http://localhost");

  for (const key of REGISTRO_FORM_PARAM_KEYS) {
    url.searchParams.delete(key);
  }

  if (feedbackType === "success") {
    url.searchParams.delete("new");
    url.searchParams.delete("editId");
    url.searchParams.delete("editOptionId");
    url.searchParams.delete("deleteId");
    url.searchParams.delete("signSupervisorId");
  } else if (formState) {
    for (const key of REGISTRO_FORM_PARAM_KEYS) {
      url.searchParams.set(key, formState[key]);
    }
  }

  url.searchParams.set("feedbackType", feedbackType);
  url.searchParams.set("feedback", feedback);

  redirect(`${url.pathname}?${url.searchParams.toString()}`);
}

function revalidateModulePaths() {
  revalidatePath(MODULE_PATH);
  revalidatePath(HISTORY_PATH);
  revalidatePath(OPTIONS_PATH);
}

async function isMonthSigned(mes: number, ano: number): Promise<boolean> {
  return isOperationalMonthClosed("oleo", mes, ano);
}

export async function createRegistroAction(formData: FormData) { return createFromOriginalForm("oleo",formData); }

export async function updateRegistroAction(formData: FormData) {
  const id = parsePositiveInt(getInputValue(formData, "id"));
  if (!id) throw new Error("Registro inv?lido para edi??o.");
  formData.set("chave", `legacy:${id}`);
  if (!formData.has("versao")) formData.set("versao", "0");
  return saveOilWorkflowAction(formData);
}

export async function deleteRegistroAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);
  try {
    await deleteOperationalRecord({ user: await getCurrentUserForAction(), target: "oleo", id: Number(getInputValue(formData, "id")), reason: getInputValue(formData, "justificativaExclusao") });
    redirectWithFeedback(returnTo, "success", "Registro excluído com justificativa e auditoria.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error, "Não foi possível excluir o registro."));
  }
}

export async function signRegistroSupervisorAction(formData: FormData) {
  formData.set("legacyRecordId", getInputValue(formData,"id"));
  formData.set("senha", getInputValue(formData,"senhaConfirmacao"));
  formData.set("mecanismo", "individual");
  return signOilWorkflowAction(formData);
}

export async function closeMonthAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "modulo.oleo.fechar_mes", "Seu perfil não pode assinar fechamento mensal de óleo.");

    const mes = parsePositiveInt(getInputValue(formData, "mes"));
    const ano = parsePositiveInt(getInputValue(formData, "ano"));
    const senhaConfirmacao = getInputValue(formData, "senhaConfirmacao");

    if (!mes || mes < 1 || mes > 12 || !ano) {
      throw new Error("Informe um mês e ano válidos para fechamento.");
    }

    await assertNotReopenedMonth("oleo", mes, ano);

    await validateSignaturePassword({ user: actor, password: senhaConfirmacao });

    if (await isMonthSigned(mes, ano)) {
      throw new Error(`O mês ${String(mes).padStart(2, "0")}/${ano} já está assinado.`);
    }

    const { start, end } = getMonthDateRange(mes, ano);
    const quantidadeRegistros = await prisma.controleQualidadeOleoRegistro.count({
      where: {
        data: {
          gte: start,
          lte: end
        }
      }
    });

    if (quantidadeRegistros === 0) {
      throw new Error("Não há registros no período selecionado para fechamento.");
    }

    await closeOperationalMonth({ user: actor, moduleCode: "oleo", mes, ano }, "legacy");

    revalidateModulePaths();
    redirectWithFeedback(
      returnTo,
      "success",
      `Mês ${String(mes).padStart(2, "0")}/${ano} Fechado com Sucesso.`
    );
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(
      returnTo,
      "error",
      getErrorMessage(error, "Não foi possível fechar o mês. Verifique se ainda existem pendências.")
    );
  }
}

export async function reopenMonthAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();

    const mes = parsePositiveInt(getInputValue(formData, "mes"));
    const ano = parsePositiveInt(getInputValue(formData, "ano"));

    if (!mes || mes < 1 || mes > 12 || !ano) {
      throw new Error("Informe um mês e ano válidos para reabertura.");
    }

    await reopenOperationalMonth({ user: actor, moduleCode: "oleo", mes, ano });

    revalidateModulePaths();
    redirectWithFeedback(
      returnTo,
      "success",
      `Mês ${String(mes).padStart(2, "0")}/${ano} Reaberto com Sucesso.`
    );
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(
      returnTo,
      "error",
      getErrorMessage(error, "Não foi possível processar a operação.")
    );
  }
}

export async function createFitaOptionAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "modulo.oleo.gerenciar_cadastros", "Você não tem permissão para gerenciar cadastros de óleo.");

    const rotulo = sanitizeLabel(getInputValue(formData, "rotulo"));
    const descricao = sanitizeDescription(getInputValue(formData, "descricao"));
    const statusAssociado = parseOilStatus(getInputValue(formData, "statusAssociado"));
    const ordem = parsePositiveInt(getInputValue(formData, "ordem"));

    if (!rotulo || !descricao || !statusAssociado || !ordem) {
      throw new Error("Preencha todos os campos obrigatórios da opção de fita.");
    }

    if (await hasOilOptionWithSameLabel(rotulo)) {
      throw new Error("Esta opção de fita já está cadastrada.");
    }

    await prisma.controleQualidadeOleoOpcaoFita.create({
      data: {
        rotulo,
        descricao,
        statusAssociado,
        ordem,
        ativo: true
      }
    });

    revalidateModulePaths();
    redirectWithFeedback(returnTo, "success", "Opção Cadastrada com Sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(
      returnTo,
      "error",
      getErrorMessage(error, "Não foi possível processar a operação.")
    );
  }
}

export async function updateFitaOptionAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "modulo.oleo.gerenciar_cadastros", "Você não tem permissão para gerenciar cadastros de óleo.");

    const optionId = parsePositiveInt(getInputValue(formData, "optionId"));
    if (!optionId) {
      throw new Error("Opção inválida para edição.");
    }

    const option = await prisma.controleQualidadeOleoOpcaoFita.findUnique({
      where: { id: optionId }
    });

    if (!option) {
      throw new Error("Opção não encontrada.");
    }

    const rotulo = sanitizeLabel(getInputValue(formData, "rotulo"));
    const descricao = sanitizeDescription(getInputValue(formData, "descricao"));
    const statusAssociado = parseOilStatus(getInputValue(formData, "statusAssociado"));
    const ordem = parsePositiveInt(getInputValue(formData, "ordem"));

    if (!rotulo || !descricao || !statusAssociado || !ordem) {
      throw new Error("Preencha todos os campos obrigatórios da opção de fita.");
    }

    if (await hasOilOptionWithSameLabel(rotulo, optionId)) {
      throw new Error("Já existe outra opção de fita com este rótulo.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.controleQualidadeOleoOpcaoFita.update({
        where: { id: optionId },
        data: {
          rotulo,
          descricao,
          statusAssociado,
          ordem
        }
      });

      if (option.rotulo !== rotulo) {
        await tx.controleQualidadeOleoRegistro.updateMany({
          where: { fitaOleo: option.rotulo },
          data: { fitaOleo: rotulo }
        });
      }
    });

    revalidateModulePaths();
    redirectWithFeedback(returnTo, "success", "Opção Atualizada com Sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(
      returnTo,
      "error",
      getErrorMessage(error, "Não foi possível processar a operação.")
    );
  }
}

export async function toggleFitaOptionStatusAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "modulo.oleo.gerenciar_cadastros", "Você não tem permissão para gerenciar cadastros de óleo.");

    const optionId = parsePositiveInt(getInputValue(formData, "optionId"));
    if (!optionId) {
      throw new Error("Opção inválida para atualização.");
    }

    const option = await prisma.controleQualidadeOleoOpcaoFita.findUnique({
      where: { id: optionId }
    });

    if (!option) {
      throw new Error("Opção não encontrada.");
    }

    const nextStatus = getInputValue(formData, "ativo") === "true";

    await prisma.controleQualidadeOleoOpcaoFita.update({
      where: { id: optionId },
      data: { ativo: nextStatus }
    });

    revalidateModulePaths();
    redirectWithFeedback(
      returnTo,
      "success",
      nextStatus ? "Opção Ativada com Sucesso." : "Opção Inativada com Sucesso."
    );
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(
      returnTo,
      "error",
      getErrorMessage(error, "Não foi possível processar a operação.")
    );
  }
}


