"use server";

import {
  StatusFechamentoQualidadeOleo
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUserForAction } from "@/lib/auth-session";
import {
  createSignatureLog,
  ensureCanCloseMonth,
  ensureCanManageOptions,
  ensureCanReopenMonth,
  validateSignaturePassword
} from "@/lib/authz";
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
  isTemperatureCritical,
  parsePositiveInt,
  parseTemperatureInput
} from "./utils";

const MODULE_PATH = "/controle-qualidade-oleo";
const HISTORY_PATH = "/controle-qualidade-oleo/historico";
const OPTIONS_PATH = "/controle-qualidade-oleo/opcoes";

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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Não foi possível processar a operação.";
}

function redirectWithFeedback(
  returnTo: string,
  feedbackType: FeedbackType,
  feedback: string
): never {
  const url = new URL(returnTo, "http://localhost");
  url.searchParams.delete("new");
  url.searchParams.delete("editId");
  url.searchParams.delete("editOptionId");
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
  const fechamento = await prisma.controleQualidadeOleoFechamento.findUnique({
    where: { mes_ano: { mes, ano } }
  });

  return fechamento?.status === StatusFechamentoQualidadeOleo.ASSINADO;
}

async function getRegistroPayload(formData: FormData, responsavelLogado: string) {
  const fitaInput = getInputValue(formData, "fitaOleo");
  const temperaturaInput = getInputValue(formData, "temperatura");
  const observacao = getInputValue(formData, "observacao");

  if (!fitaInput || !temperaturaInput) {
    throw new Error("Preencha todos os campos obrigatórios do registro.");
  }

  if (!responsavelLogado.trim()) {
    throw new Error("Não foi possível identificar o usuário logado para o campo Responsável.");
  }

  const fitaOption = await findOilOptionByLabel(fitaInput, true);
  if (!fitaOption) {
    throw new Error("Selecione uma opção válida no campo % da Fita do Óleo.");
  }

  const canonicalRule = findCanonicalOilStripRuleByLabel(fitaOption.rotulo);

  const temperatura = parseTemperatureInput(temperaturaInput);
  if (temperatura === null) {
    throw new Error("Informe uma temperatura válida.");
  }

  return {
    fitaOleo: fitaOption.rotulo,
    temperatura,
    status: canonicalRule?.statusAssociado ?? fitaOption.statusAssociado,
    orientacao: canonicalRule?.descricao ?? fitaOption.descricao,
    temperaturaCritica: isTemperatureCritical(temperatura),
    responsavel: responsavelLogado.trim(),
    observacao: observacao || null
  };
}

export async function createRegistroAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();

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
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
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

    const payload = await getRegistroPayload(formData, actor.nomeCompleto);

    await prisma.controleQualidadeOleoRegistro.update({
      where: { id },
      data: payload
    });

    revalidateModulePaths();
    redirectWithFeedback(returnTo, "success", "Registro Atualizado com Sucesso.");
  } catch (error) {
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function deleteRegistroAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    await getCurrentUserForAction();

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

    const { mes, ano } = getMonthYear(existing.data);
    if (await isMonthSigned(mes, ano)) {
      throw new Error("O mês deste registro já foi fechado e o item não pode ser excluído.");
    }

    await prisma.controleQualidadeOleoRegistro.delete({ where: { id } });

    revalidateModulePaths();
    redirectWithFeedback(returnTo, "success", "Registro Excluído com Sucesso.");
  } catch (error) {
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function closeMonthAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanCloseMonth(actor.perfil);

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
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function reopenMonthAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanReopenMonth(actor.perfil);

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
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function createFitaOptionAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanManageOptions(actor.perfil);

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
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function updateFitaOptionAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanManageOptions(actor.perfil);

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
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function toggleFitaOptionStatusAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanManageOptions(actor.perfil);

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
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}
