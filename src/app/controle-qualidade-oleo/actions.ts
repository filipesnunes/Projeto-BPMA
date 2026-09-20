"use server";

import {
  StatusQualidadeOleo,
  StatusFechamentoQualidadeOleo
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { rethrowIfRedirectError } from "@/lib/redirect-error";

import { getCurrentUserForAction } from "@/lib/auth-session";
import {
  createSignatureLog,
  ensurePermission,
  validateSignaturePassword
} from "@/lib/authz";
import { canEditRecordDate } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

import {
  findOilOptionByLabel,
  hasOilOptionWithSameLabel,
  parseOilStatus,
  sanitizeDescription,
  sanitizeLabel
} from "./catalog";
import { findCanonicalOilStripRuleByLabel } from "./options";
import {
  getCurrentSystemDateTime,
  getMonthDateRange,
  getMonthYear,
  getTodaySystemDate,
  isTemperatureBelowOilStripMinimum,
  isTemperatureCritical,
  OIL_STRIP_TEMPERATURE_SAVE_MESSAGE,
  parsePositiveInt,
  parseTemperatureInput
} from "./utils";

const MODULE_PATH = "/controle-qualidade-oleo";
const HISTORY_PATH = "/controle-qualidade-oleo/historico";
const OPTIONS_PATH = "/controle-qualidade-oleo/opcoes";
const REGISTRO_FORM_PARAM_KEYS = [
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

function getRegistroFormState(
  formData: FormData
): Record<(typeof REGISTRO_FORM_PARAM_KEYS)[number], string> {
  return {
    formFita: getInputValue(formData, "fitaOleo"),
    formTemperatura: getInputValue(formData, "temperatura"),
    formSemUtilizacao: getInputValue(formData, "semUtilizacao") === "true" ? "true" : "false",
    formObservacao: getInputValue(formData, "observacao")
  };
}

function revalidateModulePaths() {
  revalidatePath(MODULE_PATH);
  revalidatePath(HISTORY_PATH);
  revalidatePath(OPTIONS_PATH);
}

async function isMonthSigned(mes: number, ano: number): Promise<boolean> {
  const fechamento = await prisma.controleQualidadeOleoFechamento.findUnique({
    where: { mes_ano: { mes, ano } }
  });

  return fechamento?.status === StatusFechamentoQualidadeOleo.ASSINADO;
}

async function getRegistroPayload(formData: FormData, responsavelLogado: string) {
  const fitaInput = getInputValue(formData, "fitaOleo");
  const temperaturaInput = getInputValue(formData, "temperatura");
  const semUtilizacao = getInputValue(formData, "semUtilizacao") === "true";
  const observacao = getInputValue(formData, "observacao");

  if (!responsavelLogado.trim()) {
    throw new Error("Não foi possível identificar o usuário logado para o campo Responsável.");
  }

  if (semUtilizacao) {
    return {
      fitaOleo: null,
      temperatura: null,
      status: StatusQualidadeOleo.SEM_UTILIZACAO,
      orientacao: "Sem utilização no período.",
      temperaturaCritica: false,
      semUtilizacao: true,
      responsavel: responsavelLogado.trim(),
      observacao: observacao || null
    };
  }

  if (!temperaturaInput) {
    throw new Error("Preencha todos os campos obrigatórios do registro.");
  }

  const fitaOption = fitaInput ? await findOilOptionByLabel(fitaInput, true) : null;
  if (fitaInput && !fitaOption) {
    throw new Error("Selecione uma opção válida no campo % da Fita do Óleo.");
  }

  const canonicalRule = fitaOption ? findCanonicalOilStripRuleByLabel(fitaOption.rotulo) : null;

  const temperatura = parseTemperatureInput(temperaturaInput);
  if (temperatura === null) {
    throw new Error("Informe uma temperatura válida.");
  }
  if (fitaOption && isTemperatureBelowOilStripMinimum(temperatura)) {
    throw new Error(OIL_STRIP_TEMPERATURE_SAVE_MESSAGE);
  }

  return {
    fitaOleo: fitaOption?.rotulo ?? null,
    temperatura,
    status: canonicalRule?.statusAssociado ?? fitaOption?.statusAssociado ?? null,
    orientacao: canonicalRule?.descricao ?? fitaOption?.descricao ?? "",
    temperaturaCritica: isTemperatureCritical(temperatura),
    semUtilizacao: false,
    responsavel: responsavelLogado.trim(),
    observacao: observacao || null
  };
}

export async function createRegistroAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(
      actor,
      "modulo.oleo.criar_registro",
      "Seu perfil não pode criar registros de óleo."
    );

    const data = getTodaySystemDate();
    const payload = await getRegistroPayload(formData, actor.nomeCompleto);
    const { mes, ano } = getMonthYear(data);

    if (await isMonthSigned(mes, ano)) {
      throw new Error(
        `O mês ${String(mes).padStart(2, "0")}/${ano} já está fechado e não aceita novos registros.`
      );
    }

    await prisma.controleQualidadeOleoRegistro.create({
      data: {
        ...payload,
        data
      }
    });

    revalidateModulePaths();
    redirectWithFeedback(returnTo, "success", "Registro Criado com Sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(
      returnTo,
      "error",
      getErrorMessage(error, "Não foi possível salvar o registro. Verifique os campos obrigatórios."),
      getRegistroFormState(formData)
    );
  }
}

export async function updateRegistroAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();

    const id = parsePositiveInt(getInputValue(formData, "id"));
    if (!id) {
      throw new Error("Registro inválido para edição.");
    }

    const existing = await prisma.controleQualidadeOleoRegistro.findUnique({
      where: { id }
    });

    if (!existing) {
      throw new Error("Registro não encontrado.");
    }

    const existingPeriod = getMonthYear(existing.data);
    if (await isMonthSigned(existingPeriod.mes, existingPeriod.ano)) {
      throw new Error("O mês deste registro já foi fechado e não pode ser editado.");
    }
    if (!canEditRecordDate(actor, "modulo.oleo", existing.data, getTodaySystemDate())) {
      throw new Error("Seu perfil não pode editar este registro de óleo.");
    }

    const payload = await getRegistroPayload(formData, actor.nomeCompleto);

    await prisma.controleQualidadeOleoRegistro.update({
      where: { id },
      data: payload
    });

    revalidateModulePaths();
    redirectWithFeedback(returnTo, "success", "Registro Atualizado com Sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(
      returnTo,
      "error",
      getErrorMessage(error, "Não foi possível salvar o registro. Verifique os campos obrigatórios."),
      getRegistroFormState(formData)
    );
  }
}

export async function deleteRegistroAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "modulo.oleo.excluir_registro", "Seu perfil não pode excluir registros de óleo.");

    const id = parsePositiveInt(getInputValue(formData, "id"));
    if (!id) {
      throw new Error("Registro inválido para exclusão.");
    }

    const existing = await prisma.controleQualidadeOleoRegistro.findUnique({
      where: { id }
    });

    if (!existing) {
      throw new Error("Registro não encontrado.");
    }

    if (!canEditRecordDate(actor, "modulo.oleo", existing.data, getTodaySystemDate())) {
      throw new Error(
        "Registros históricos não podem ser editados. Apenas registros do dia atual podem ser ajustados."
      );
    }

    const { mes, ano } = getMonthYear(existing.data);
    if (await isMonthSigned(mes, ano)) {
      throw new Error("O mês deste registro já foi fechado e o item não pode ser excluído.");
    }

    await prisma.controleQualidadeOleoRegistro.delete({ where: { id } });

    revalidateModulePaths();
    redirectWithFeedback(returnTo, "success", "Registro Excluído com Sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(
      returnTo,
      "error",
      getErrorMessage(error, "Não foi possível processar a operação.")
    );
  }
}

export async function signRegistroSupervisorAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "modulo.oleo.assinar_historico", "Você não tem permissão para assinar o histórico de óleo.");

    const id = parsePositiveInt(getInputValue(formData, "id"));
    const senhaConfirmacao = getInputValue(formData, "senhaConfirmacao");

    if (!id) {
      throw new Error("Registro inválido para assinatura do supervisor.");
    }

    const registro = await prisma.controleQualidadeOleoRegistro.findUnique({
      where: { id },
      select: {
        id: true,
        assinaturaSupervisorEm: true
      }
    });

    if (!registro) {
      throw new Error("Registro não encontrado.");
    }

    if (registro.assinaturaSupervisorEm) {
      throw new Error("Este registro já foi assinado pelo supervisor.");
    }

    await validateSignaturePassword({ user: actor, password: senhaConfirmacao });

    const now = getCurrentSystemDateTime();
    await prisma.controleQualidadeOleoRegistro.update({
      where: { id },
      data: {
        assinaturaSupervisorUsuarioId: actor.id,
        assinaturaSupervisorNome: actor.nomeCompleto,
        assinaturaSupervisorPerfil: actor.perfil,
        assinaturaSupervisorEm: now
      }
    });

    await createSignatureLog({
      user: actor,
      tipo: "SUPERVISOR",
      modulo: "controle-qualidade-oleo/registro",
      referenciaId: String(id)
    });

    revalidateModulePaths();
    redirectWithFeedback(returnTo, "success", "Registro assinado pelo supervisor com sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(
      returnTo,
      "error",
      getErrorMessage(error, "Não foi possível assinar o registro como revisado pelo supervisor.")
    );
  }
}

export async function closeMonthAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "modulo.oleo.fechar_mes", "Seu perfil não pode assinar fechamento mensal de óleo.");

    const mes = parsePositiveInt(getInputValue(formData, "mes"));
    const ano = parsePositiveInt(getInputValue(formData, "ano"));
    const senhaConfirmacao = getInputValue(formData, "senhaConfirmacao");
    const responsavelTecnico = actor.nomeCompleto;

    if (!mes || mes < 1 || mes > 12 || !ano) {
      throw new Error("Informe um mês e ano válidos para fechamento.");
    }

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

    await prisma.controleQualidadeOleoFechamento.upsert({
      where: { mes_ano: { mes, ano } },
      create: {
        mes,
        ano,
        responsavelTecnico,
        dataAssinatura: getCurrentSystemDateTime(),
        status: StatusFechamentoQualidadeOleo.ASSINADO
      },
      update: {
        responsavelTecnico,
        dataAssinatura: getCurrentSystemDateTime(),
        status: StatusFechamentoQualidadeOleo.ASSINADO
      }
    });
    await createSignatureLog({
      user: actor,
      tipo: "FECHAMENTO_MENSAL",
      modulo: "controle-qualidade-oleo",
      referenciaId: `${mes}-${ano}`
    });

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
    ensurePermission(actor, "modulo.oleo.reabrir_mes", "Seu perfil não pode reabrir períodos de óleo.");

    const mes = parsePositiveInt(getInputValue(formData, "mes"));
    const ano = parsePositiveInt(getInputValue(formData, "ano"));

    if (!mes || mes < 1 || mes > 12 || !ano) {
      throw new Error("Informe um mês e ano válidos para reabertura.");
    }

    const fechamento = await prisma.controleQualidadeOleoFechamento.findUnique({
      where: { mes_ano: { mes, ano } }
    });

    if (!fechamento || fechamento.status !== StatusFechamentoQualidadeOleo.ASSINADO) {
      throw new Error(`O mês ${String(mes).padStart(2, "0")}/${ano} não está assinado.`);
    }

    await prisma.controleQualidadeOleoFechamento.update({
      where: { id: fechamento.id },
      data: {
        status: StatusFechamentoQualidadeOleo.ABERTO
      }
    });

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


