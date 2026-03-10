"use server";

import { StatusFechamentoHortifruti, TipoOpcaoHigienizacao } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";

import {
  ensureInitialCatalogOptions,
  findCatalogOptionByName,
  hasCatalogOptionWithSameName,
  parseOptionType,
  sanitizeCatalogName
} from "./catalog";
import {
  getCurrentSystemDateTime,
  getDurationInMinutes,
  getMonthDateRange,
  getMonthYear,
  getTodaySystemDate,
  parsePositiveInt
} from "./utils";

const MODULE_PATH = "/higienizacao-hortifruti";

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
  url.searchParams.set("feedbackType", feedbackType);
  url.searchParams.set("feedback", feedback);

  redirect(`${url.pathname}?${url.searchParams.toString()}`);
}

async function isMonthSigned(mes: number, ano: number): Promise<boolean> {
  const fechamento = await prisma.higienizacaoHortifrutiFechamento.findUnique({
    where: { mes_ano: { mes, ano } }
  });

  return fechamento?.status === StatusFechamentoHortifruti.ASSINADO;
}

function canReopenMonthForCurrentUser(): boolean {
  // Preparado para autorização futura por perfil (ex.: responsável técnico/nutricionista).
  // Nesta etapa, sem autenticação, a reabertura está permitida em ambiente de testes.
  return true;
}

async function getRegistroPayload(formData: FormData) {
  await ensureInitialCatalogOptions();

  const hortifrutiInput = getInputValue(formData, "hortifruti");
  const produtoInput = getInputValue(formData, "produtoUtilizado");
  const inicioProcesso = getInputValue(formData, "inicioProcesso");
  const terminoProcesso = getInputValue(formData, "terminoProcesso");
  // Mantido manual nesta fase; futuramente deve vir do usuário autenticado.
  const responsavel = getInputValue(formData, "responsavel");
  const observacoes = getInputValue(formData, "observacoes");

  if (!hortifrutiInput || !produtoInput || !responsavel) {
    throw new Error("Preencha todos os campos obrigatórios do registro.");
  }

  const hortifruti = await findCatalogOptionByName(
    TipoOpcaoHigienizacao.HORTIFRUTI,
    hortifrutiInput
  );
  if (!hortifruti) {
    throw new Error("Selecione uma opção válida no campo Hortifruti.");
  }

  const produtoUtilizado = await findCatalogOptionByName(
    TipoOpcaoHigienizacao.PRODUTO_UTILIZADO,
    produtoInput
  );
  if (!produtoUtilizado) {
    throw new Error("Selecione uma opção válida no campo Produto Utilizado.");
  }

  const duracaoMinutos = getDurationInMinutes(inicioProcesso, terminoProcesso);
  if (duracaoMinutos === null) {
    throw new Error("Informe horários válidos no formato HH:MM.");
  }

  if (duracaoMinutos < 0) {
    throw new Error(
      "O término do processo não pode ser menor que o início do processo."
    );
  }

  return {
    hortifruti,
    produtoUtilizado,
    inicioProcesso,
    terminoProcesso,
    duracaoMinutos,
    responsavel,
    observacoes: observacoes || null
  };
}

export async function createRegistroAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const data = getTodaySystemDate();
    const payload = await getRegistroPayload(formData);
    const { mes, ano } = getMonthYear(data);

    if (await isMonthSigned(mes, ano)) {
      throw new Error(
        `O mês ${String(mes).padStart(2, "0")}/${ano} já está fechado e não aceita novos registros.`
      );
    }

    await prisma.higienizacaoHortifruti.create({
      data: {
        ...payload,
        data
      }
    });

    revalidatePath(MODULE_PATH);
    redirectWithFeedback(returnTo, "success", "Registro Criado com Sucesso.");
  } catch (error) {
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function updateRegistroAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const id = parsePositiveInt(getInputValue(formData, "id"));
    if (!id) {
      throw new Error("Registro inválido para edição.");
    }

    const existing = await prisma.higienizacaoHortifruti.findUnique({
      where: { id }
    });

    if (!existing) {
      throw new Error("Registro não encontrado.");
    }

    const existingPeriod = getMonthYear(existing.data);
    if (await isMonthSigned(existingPeriod.mes, existingPeriod.ano)) {
      throw new Error("O mês deste registro já foi fechado e não pode ser editado.");
    }

    const payload = await getRegistroPayload(formData);

    await prisma.higienizacaoHortifruti.update({
      where: { id },
      data: payload
    });

    revalidatePath(MODULE_PATH);
    redirectWithFeedback(returnTo, "success", "Registro Atualizado com Sucesso.");
  } catch (error) {
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function deleteRegistroAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const id = parsePositiveInt(getInputValue(formData, "id"));
    if (!id) {
      throw new Error("Registro inválido para exclusão.");
    }

    const existing = await prisma.higienizacaoHortifruti.findUnique({
      where: { id }
    });

    if (!existing) {
      throw new Error("Registro não encontrado.");
    }

    const { mes, ano } = getMonthYear(existing.data);
    if (await isMonthSigned(mes, ano)) {
      throw new Error(
        "O mês deste registro já foi fechado e o item não pode ser excluído."
      );
    }

    await prisma.higienizacaoHortifruti.delete({ where: { id } });

    revalidatePath(MODULE_PATH);
    redirectWithFeedback(returnTo, "success", "Registro Excluído com Sucesso.");
  } catch (error) {
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function closeMonthAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const mes = parsePositiveInt(getInputValue(formData, "mes"));
    const ano = parsePositiveInt(getInputValue(formData, "ano"));
    const responsavelTecnico = getInputValue(formData, "responsavelTecnico");

    if (!mes || mes < 1 || mes > 12 || !ano) {
      throw new Error("Informe um mês e ano válidos para fechamento.");
    }

    if (!responsavelTecnico) {
      throw new Error("Preencha o responsável técnico ou nutricionista.");
    }

    const dataAssinatura = getCurrentSystemDateTime();

    const signed = await isMonthSigned(mes, ano);
    if (signed) {
      throw new Error(`O mês ${String(mes).padStart(2, "0")}/${ano} já está assinado.`);
    }

    const { start, end } = getMonthDateRange(mes, ano);
    const quantidadeRegistros = await prisma.higienizacaoHortifruti.count({
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

    await prisma.higienizacaoHortifrutiFechamento.upsert({
      where: { mes_ano: { mes, ano } },
      create: {
        mes,
        ano,
        responsavelTecnico,
        dataAssinatura,
        status: StatusFechamentoHortifruti.ASSINADO
      },
      update: {
        responsavelTecnico,
        dataAssinatura,
        status: StatusFechamentoHortifruti.ASSINADO
      }
    });

    revalidatePath(MODULE_PATH);
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
    const mes = parsePositiveInt(getInputValue(formData, "mes"));
    const ano = parsePositiveInt(getInputValue(formData, "ano"));

    if (!mes || mes < 1 || mes > 12 || !ano) {
      throw new Error("Informe um mês e ano válidos para reabertura.");
    }

    if (!canReopenMonthForCurrentUser()) {
      throw new Error("Você não tem permissão para reabrir este mês.");
    }

    const fechamento = await prisma.higienizacaoHortifrutiFechamento.findUnique({
      where: { mes_ano: { mes, ano } }
    });

    if (!fechamento || fechamento.status !== StatusFechamentoHortifruti.ASSINADO) {
      throw new Error(`O mês ${String(mes).padStart(2, "0")}/${ano} não está assinado.`);
    }

    await prisma.higienizacaoHortifrutiFechamento.update({
      where: { id: fechamento.id },
      data: {
        status: StatusFechamentoHortifruti.ABERTO
      }
    });

    revalidatePath(MODULE_PATH);
    redirectWithFeedback(
      returnTo,
      "success",
      `Mês ${String(mes).padStart(2, "0")}/${ano} Reaberto com Sucesso.`
    );
  } catch (error) {
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function createCatalogOptionAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    await ensureInitialCatalogOptions();

    const tipo = parseOptionType(getInputValue(formData, "tipo"));
    const nome = sanitizeCatalogName(getInputValue(formData, "nome"));

    if (!tipo) {
      throw new Error("Tipo de opção inválido.");
    }

    if (!nome) {
      throw new Error("Informe o nome da opção para cadastro.");
    }

    const optionExists = await hasCatalogOptionWithSameName(tipo, nome);
    if (optionExists) {
      throw new Error("Esta opção já está cadastrada.");
    }

    await prisma.higienizacaoHortifrutiOpcao.create({
      data: { tipo, nome }
    });

    revalidatePath(MODULE_PATH);
    redirectWithFeedback(returnTo, "success", "Opção Cadastrada com Sucesso.");
  } catch (error) {
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function deleteCatalogOptionAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const optionId = parsePositiveInt(getInputValue(formData, "optionId"));
    if (!optionId) {
      throw new Error("Opção inválida para exclusão.");
    }

    const option = await prisma.higienizacaoHortifrutiOpcao.findUnique({
      where: { id: optionId }
    });

    if (!option) {
      throw new Error("Opção não encontrada.");
    }

    if (option.tipo === TipoOpcaoHigienizacao.HORTIFRUTI) {
      const usageCount = await prisma.higienizacaoHortifruti.count({
        where: { hortifruti: option.nome }
      });

      if (usageCount > 0) {
        throw new Error(
          "Não é possível excluir esta opção de Hortifruti porque ela já está em uso nos registros."
        );
      }
    } else {
      const usageCount = await prisma.higienizacaoHortifruti.count({
        where: { produtoUtilizado: option.nome }
      });

      if (usageCount > 0) {
        throw new Error(
          "Não é possível excluir esta opção de Produto Utilizado porque ela já está em uso nos registros."
        );
      }
    }

    await prisma.higienizacaoHortifrutiOpcao.delete({ where: { id: optionId } });

    revalidatePath(MODULE_PATH);
    redirectWithFeedback(returnTo, "success", "Opção Excluída com Sucesso.");
  } catch (error) {
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}
