"use server";

import {
  StatusFechamentoTemperaturaEquipamento,
  StatusTemperaturaEquipamento,
  TipoOpcaoTemperaturaEquipamento,
  TurnoTemperaturaEquipamento
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
  findCatalogOptionByName,
  getCategoryParameterByCategory,
  hasCatalogOptionWithSameName,
  parseEquipmentCategory,
  parseOptionType,
  sanitizeCatalogName
} from "./catalog";
import {
  findMatchingTemperatureRule,
  getAutomaticCorrectiveAction,
  getCurrentShift,
  getCurrentSystemDateTime,
  getMonthDateRange,
  getMonthYear,
  getTodaySystemDate,
  isCorrectiveActionRequired,
  parseNullableTemperatureInput,
  parsePositiveInt,
  parseTemperatureInput
} from "./utils";

const MODULE_PATH = "/controle-temperatura-equipamentos";
const HISTORY_PATH = "/controle-temperatura-equipamentos/historico";
const OPTIONS_PATH = "/controle-temperatura-equipamentos/opcoes";

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
  url.searchParams.delete("editEquipamentoId");
  url.searchParams.delete("editAcaoId");
  url.searchParams.delete("editCategoriaId");
  url.searchParams.delete("editRegraId");
  url.searchParams.delete("novaRegraCategoriaId");
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
  const fechamento = await prisma.controleTemperaturaEquipamentoFechamento.findUnique({
    where: { mes_ano: { mes, ano } }
  });

  return fechamento?.status === StatusFechamentoTemperaturaEquipamento.ASSINADO;
}

async function getRegistroPayload(formData: FormData) {
  const equipamentoInput = getInputValue(formData, "equipamento");
  const temperaturaAferidaInput = getInputValue(formData, "temperaturaAferida");
  const responsavel = getInputValue(formData, "responsavel");
  // Mantido manual nesta fase; futuramente deve vir do usuário autenticado.
  const observacoes = getInputValue(formData, "observacoes");

  if (!equipamentoInput || !temperaturaAferidaInput || !responsavel) {
    throw new Error("Preencha todos os campos obrigatórios do registro.");
  }

  const equipamentoOption = await findCatalogOptionByName(
    TipoOpcaoTemperaturaEquipamento.EQUIPAMENTO,
    equipamentoInput,
    true
  );
  if (!equipamentoOption) {
    throw new Error("Selecione uma opção válida no campo Equipamento.");
  }

  if (!equipamentoOption.categoriaEquipamento) {
    throw new Error("O equipamento selecionado está sem categoria configurada.");
  }

  const temperaturaAferida = parseTemperatureInput(temperaturaAferidaInput);
  if (temperaturaAferida === null) {
    throw new Error("Informe uma temperatura válida.");
  }

  const categoriaParametro = await getCategoryParameterByCategory(
    equipamentoOption.categoriaEquipamento,
    false
  );

  if (!categoriaParametro) {
    throw new Error(
      "A categoria deste equipamento está sem parâmetros configurados. Atualize em Gerenciar Opções."
    );
  }

  const regrasAtivas = await prisma.controleTemperaturaCategoriaRegra.findMany({
    where: {
      categoriaId: categoriaParametro.id,
      isActive: true
    },
    orderBy: [{ ordem: "asc" }, { id: "asc" }]
  });

  if (regrasAtivas.length === 0) {
    throw new Error(
      "A categoria deste equipamento está sem regras de temperatura ativas. Atualize em Gerenciar Opções."
    );
  }

  const regraCorrespondente = findMatchingTemperatureRule(
    temperaturaAferida,
    regrasAtivas
  );

  if (!regraCorrespondente) {
    throw new Error(
      "Não existe regra de temperatura correspondente para esta categoria. Ajuste as regras em Gerenciar Opções."
    );
  }

  const status = regraCorrespondente.status;
  const acaoCorretiva =
    regraCorrespondente.acaoCorretiva.trim() ||
    getAutomaticCorrectiveAction(status, categoriaParametro);

  if (isCorrectiveActionRequired(status) && !acaoCorretiva) {
    throw new Error(
      "A Ação Corretiva é obrigatória quando a temperatura estiver em Alerta ou Crítico."
    );
  }

  return {
    equipamento: equipamentoOption.nome,
    categoriaEquipamento: equipamentoOption.categoriaEquipamento,
    temperaturaAferida,
    status,
    acaoCorretiva,
    responsavel,
    observacoes: observacoes || null
  };
}

function parseTemperatureField(formData: FormData, key: string): number | null {
  const parsed = parseNullableTemperatureInput(getInputValue(formData, key));

  if (parsed === "invalid") {
    throw new Error("Informe valores de temperatura válidos para os parâmetros.");
  }

  return parsed;
}

function validateRangeBounds(
  min: number | null,
  max: number | null,
  label: string
) {
  if (min !== null && max !== null && min > max) {
    throw new Error(
      `A faixa de ${label} está inválida. O valor mínimo não pode ser maior que o máximo.`
    );
  }
}

function parseStatusValue(value: string): StatusTemperaturaEquipamento | null {
  if (value === StatusTemperaturaEquipamento.CONFORME) {
    return StatusTemperaturaEquipamento.CONFORME;
  }

  if (value === StatusTemperaturaEquipamento.ALERTA) {
    return StatusTemperaturaEquipamento.ALERTA;
  }

  if (value === StatusTemperaturaEquipamento.CRITICO) {
    return StatusTemperaturaEquipamento.CRITICO;
  }

  return null;
}

async function validateRuleOrderAvailability(
  categoriaId: number,
  ordem: number,
  ignoreRuleId?: number
) {
  const existingRule = await prisma.controleTemperaturaCategoriaRegra.findFirst({
    where: {
      categoriaId,
      ordem,
      ...(ignoreRuleId ? { id: { not: ignoreRuleId } } : {})
    }
  });

  if (existingRule) {
    throw new Error("Já existe uma regra com esta ordem para a categoria.");
  }
}

async function ensureCategoryHasAnotherActiveRule(
  categoriaId: number,
  ignoreRuleId: number
) {
  const remainingActiveRules = await prisma.controleTemperaturaCategoriaRegra.count({
    where: {
      categoriaId,
      isActive: true,
      id: { not: ignoreRuleId }
    }
  });

  if (remainingActiveRules === 0) {
    throw new Error("Mantenha ao menos uma regra ativa por categoria.");
  }
}

export async function createRegistroAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    await getCurrentUserForAction();

    const data = getTodaySystemDate();
    const payload = await getRegistroPayload(formData);
    const { mes, ano } = getMonthYear(data);

    if (await isMonthSigned(mes, ano)) {
      throw new Error(
        `O mês ${String(mes).padStart(2, "0")}/${ano} já está fechado e não aceita novos registros.`
      );
    }

    const turno =
      getCurrentShift() === "MANHA"
        ? TurnoTemperaturaEquipamento.MANHA
        : TurnoTemperaturaEquipamento.TARDE;

    await prisma.controleTemperaturaEquipamento.create({
      data: {
        ...payload,
        data,
        turno
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
    await getCurrentUserForAction();

    const id = parsePositiveInt(getInputValue(formData, "id"));
    if (!id) {
      throw new Error("Registro inválido para edição.");
    }

    const existing = await prisma.controleTemperaturaEquipamento.findUnique({
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

    await prisma.controleTemperaturaEquipamento.update({
      where: { id },
      data: {
        ...payload,
        turno: existing.turno
      }
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

    const existing = await prisma.controleTemperaturaEquipamento.findUnique({
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

    await prisma.controleTemperaturaEquipamento.delete({ where: { id } });

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

    const dataAssinatura = getCurrentSystemDateTime();

    const signed = await isMonthSigned(mes, ano);
    if (signed) {
      throw new Error(`O mês ${String(mes).padStart(2, "0")}/${ano} já está assinado.`);
    }

    const { start, end } = getMonthDateRange(mes, ano);
    const quantidadeRegistros = await prisma.controleTemperaturaEquipamento.count({
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

    await prisma.controleTemperaturaEquipamentoFechamento.upsert({
      where: { mes_ano: { mes, ano } },
      create: {
        mes,
        ano,
        responsavelTecnico,
        dataAssinatura,
        status: StatusFechamentoTemperaturaEquipamento.ASSINADO
      },
      update: {
        responsavelTecnico,
        dataAssinatura,
        status: StatusFechamentoTemperaturaEquipamento.ASSINADO
      }
    });
    await createSignatureLog({
      user: actor,
      tipo: "FECHAMENTO_MENSAL",
      modulo: "controle-temperatura-equipamentos",
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

    const fechamento = await prisma.controleTemperaturaEquipamentoFechamento.findUnique({
      where: { mes_ano: { mes, ano } }
    });

    if (
      !fechamento ||
      fechamento.status !== StatusFechamentoTemperaturaEquipamento.ASSINADO
    ) {
      throw new Error(`O mês ${String(mes).padStart(2, "0")}/${ano} não está assinado.`);
    }

    await prisma.controleTemperaturaEquipamentoFechamento.update({
      where: { id: fechamento.id },
      data: {
        status: StatusFechamentoTemperaturaEquipamento.ABERTO
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

export async function createCatalogOptionAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanManageOptions(actor.perfil);

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

    const categoriaEquipamento =
      tipo === TipoOpcaoTemperaturaEquipamento.EQUIPAMENTO
        ? parseEquipmentCategory(getInputValue(formData, "categoriaEquipamento"))
        : null;

    if (tipo === TipoOpcaoTemperaturaEquipamento.EQUIPAMENTO && !categoriaEquipamento) {
      throw new Error("Selecione a categoria do equipamento.");
    }

    await prisma.controleTemperaturaEquipamentoOpcao.create({
      data: {
        tipo,
        nome,
        categoriaEquipamento,
        ativo: true
      }
    });

    revalidateModulePaths();
    redirectWithFeedback(returnTo, "success", "Opção Cadastrada com Sucesso.");
  } catch (error) {
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function updateCatalogOptionAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanManageOptions(actor.perfil);

    const optionId = parsePositiveInt(getInputValue(formData, "optionId"));
    if (!optionId) {
      throw new Error("Opção inválida para edição.");
    }

    const option = await prisma.controleTemperaturaEquipamentoOpcao.findUnique({
      where: { id: optionId }
    });

    if (!option) {
      throw new Error("Opção não encontrada.");
    }

    const nome = sanitizeCatalogName(getInputValue(formData, "nome"));
    if (!nome) {
      throw new Error("Informe o nome da opção.");
    }

    const optionExists = await hasCatalogOptionWithSameName(option.tipo, nome, optionId);
    if (optionExists) {
      throw new Error("Já existe outra opção com este nome.");
    }

    const categoriaEquipamento =
      option.tipo === TipoOpcaoTemperaturaEquipamento.EQUIPAMENTO
        ? parseEquipmentCategory(getInputValue(formData, "categoriaEquipamento"))
        : null;

    if (option.tipo === TipoOpcaoTemperaturaEquipamento.EQUIPAMENTO && !categoriaEquipamento) {
      throw new Error("Selecione a categoria do equipamento.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.controleTemperaturaEquipamentoOpcao.update({
        where: { id: optionId },
        data: {
          nome,
          categoriaEquipamento
        }
      });

      if (option.nome !== nome) {
        if (option.tipo === TipoOpcaoTemperaturaEquipamento.EQUIPAMENTO) {
          await tx.controleTemperaturaEquipamento.updateMany({
            where: { equipamento: option.nome },
            data: { equipamento: nome }
          });
        }

        if (option.tipo === TipoOpcaoTemperaturaEquipamento.ACAO_CORRETIVA) {
          await tx.controleTemperaturaEquipamento.updateMany({
            where: { acaoCorretiva: option.nome },
            data: { acaoCorretiva: nome }
          });
        }
      }
    });

    revalidateModulePaths();
    redirectWithFeedback(returnTo, "success", "Opção Atualizada com Sucesso.");
  } catch (error) {
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function toggleCatalogOptionStatusAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanManageOptions(actor.perfil);

    const optionId = parsePositiveInt(getInputValue(formData, "optionId"));
    if (!optionId) {
      throw new Error("Opção inválida para atualização.");
    }

    const option = await prisma.controleTemperaturaEquipamentoOpcao.findUnique({
      where: { id: optionId }
    });

    if (!option) {
      throw new Error("Opção não encontrada.");
    }

    const nextStatus = getInputValue(formData, "ativo") === "true";

    await prisma.controleTemperaturaEquipamentoOpcao.update({
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

export async function updateCategoryParameterAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanManageOptions(actor.perfil);

    const parameterId = parsePositiveInt(getInputValue(formData, "parameterId"));
    if (!parameterId) {
      throw new Error("Parâmetro de categoria inválido para edição.");
    }

    const parameter = await prisma.controleTemperaturaCategoriaParametro.findUnique({
      where: { id: parameterId }
    });

    if (!parameter) {
      throw new Error("Parâmetro de categoria não encontrado.");
    }

    const nome = sanitizeCatalogName(getInputValue(formData, "nome"));
    const acaoIdeal = sanitizeCatalogName(getInputValue(formData, "acaoIdeal"));
    const acaoAlerta = sanitizeCatalogName(getInputValue(formData, "acaoAlerta"));
    const acaoCritica = sanitizeCatalogName(getInputValue(formData, "acaoCritica"));
    const orientacaoCorretivaPadrao = sanitizeCatalogName(
      getInputValue(formData, "orientacaoCorretivaPadrao")
    );

    if (!nome) {
      throw new Error("Informe o nome da categoria.");
    }

    if (!orientacaoCorretivaPadrao) {
      throw new Error("Informe a orientação corretiva padrão da categoria.");
    }

    if (!acaoIdeal || !acaoAlerta || !acaoCritica) {
      throw new Error(
        "Preencha as ações corretivas de Ideal, Alerta e Crítica para a categoria."
      );
    }

    const temperaturaIdealMin = parseTemperatureField(formData, "temperaturaIdealMin");
    const temperaturaIdealMax = parseTemperatureField(formData, "temperaturaIdealMax");
    const temperaturaAlertaMin = parseTemperatureField(formData, "temperaturaAlertaMin");
    const temperaturaAlertaMax = parseTemperatureField(formData, "temperaturaAlertaMax");
    const temperaturaCriticaMin = parseTemperatureField(formData, "temperaturaCriticaMin");
    const temperaturaCriticaMax = parseTemperatureField(formData, "temperaturaCriticaMax");

    validateRangeBounds(temperaturaIdealMin, temperaturaIdealMax, "ideal");
    validateRangeBounds(temperaturaAlertaMin, temperaturaAlertaMax, "alerta");
    validateRangeBounds(temperaturaCriticaMin, temperaturaCriticaMax, "crítica");

    if (temperaturaIdealMin === null && temperaturaIdealMax === null) {
      throw new Error("Configure ao menos um limite para a faixa ideal.");
    }

    if (temperaturaAlertaMin === null && temperaturaAlertaMax === null) {
      throw new Error("Configure ao menos um limite para a faixa de alerta.");
    }

    const isActive = getInputValue(formData, "isActive") === "true";

    await prisma.controleTemperaturaCategoriaParametro.update({
      where: { id: parameterId },
      data: {
        nome,
        temperaturaIdealMin,
        temperaturaIdealMax,
        temperaturaAlertaMin,
        temperaturaAlertaMax,
        temperaturaCriticaMin,
        temperaturaCriticaMax,
        acaoIdeal,
        acaoAlerta,
        acaoCritica,
        orientacaoCorretivaPadrao,
        isActive
      }
    });

    revalidateModulePaths();
    redirectWithFeedback(
      returnTo,
      "success",
      "Parâmetros da Categoria Atualizados com Sucesso."
    );
  } catch (error) {
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function createCategoryRuleAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanManageOptions(actor.perfil);

    const categoriaId = parsePositiveInt(getInputValue(formData, "categoriaId"));
    if (!categoriaId) {
      throw new Error("Categoria inválida para criar regra.");
    }

    const categoria = await prisma.controleTemperaturaCategoriaParametro.findUnique({
      where: { id: categoriaId }
    });

    if (!categoria) {
      throw new Error("Categoria não encontrada.");
    }

    const temperaturaMin = parseTemperatureField(formData, "temperaturaMin");
    const temperaturaMax = parseTemperatureField(formData, "temperaturaMax");
    const status = parseStatusValue(getInputValue(formData, "status"));
    const acaoCorretiva = sanitizeCatalogName(getInputValue(formData, "acaoCorretiva"));
    const ordem = parsePositiveInt(getInputValue(formData, "ordem"));
    const isActive = getInputValue(formData, "isActive") !== "false";

    if (temperaturaMin === null && temperaturaMax === null) {
      throw new Error("Informe ao menos temperatura mínima ou máxima para a regra.");
    }

    if (!status) {
      throw new Error("Selecione um status válido para a regra.");
    }

    if (!acaoCorretiva) {
      throw new Error("Informe a ação corretiva da regra.");
    }

    if (!ordem) {
      throw new Error("Informe uma ordem válida para a regra.");
    }

    validateRangeBounds(temperaturaMin, temperaturaMax, "regra");
    await validateRuleOrderAvailability(categoriaId, ordem);

    await prisma.controleTemperaturaCategoriaRegra.create({
      data: {
        categoriaId,
        temperaturaMin,
        temperaturaMax,
        status,
        acaoCorretiva,
        ordem,
        isActive
      }
    });

    revalidateModulePaths();
    redirectWithFeedback(returnTo, "success", "Regra Cadastrada com Sucesso.");
  } catch (error) {
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function updateCategoryRuleAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanManageOptions(actor.perfil);

    const regraId = parsePositiveInt(getInputValue(formData, "regraId"));
    if (!regraId) {
      throw new Error("Regra inválida para edição.");
    }

    const regra = await prisma.controleTemperaturaCategoriaRegra.findUnique({
      where: { id: regraId }
    });

    if (!regra) {
      throw new Error("Regra não encontrada.");
    }

    const temperaturaMin = parseTemperatureField(formData, "temperaturaMin");
    const temperaturaMax = parseTemperatureField(formData, "temperaturaMax");
    const status = parseStatusValue(getInputValue(formData, "status"));
    const acaoCorretiva = sanitizeCatalogName(getInputValue(formData, "acaoCorretiva"));
    const ordem = parsePositiveInt(getInputValue(formData, "ordem"));
    const isActive = getInputValue(formData, "isActive") !== "false";

    if (temperaturaMin === null && temperaturaMax === null) {
      throw new Error("Informe ao menos temperatura mínima ou máxima para a regra.");
    }

    if (!status) {
      throw new Error("Selecione um status válido para a regra.");
    }

    if (!acaoCorretiva) {
      throw new Error("Informe a ação corretiva da regra.");
    }

    if (!ordem) {
      throw new Error("Informe uma ordem válida para a regra.");
    }

    validateRangeBounds(temperaturaMin, temperaturaMax, "regra");
    await validateRuleOrderAvailability(regra.categoriaId, ordem, regra.id);

    if (regra.isActive && !isActive) {
      await ensureCategoryHasAnotherActiveRule(regra.categoriaId, regra.id);
    }

    await prisma.controleTemperaturaCategoriaRegra.update({
      where: { id: regra.id },
      data: {
        temperaturaMin,
        temperaturaMax,
        status,
        acaoCorretiva,
        ordem,
        isActive
      }
    });

    revalidateModulePaths();
    redirectWithFeedback(returnTo, "success", "Regra Atualizada com Sucesso.");
  } catch (error) {
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function toggleCategoryRuleStatusAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanManageOptions(actor.perfil);

    const regraId = parsePositiveInt(getInputValue(formData, "regraId"));
    if (!regraId) {
      throw new Error("Regra inválida para atualização.");
    }

    const regra = await prisma.controleTemperaturaCategoriaRegra.findUnique({
      where: { id: regraId }
    });

    if (!regra) {
      throw new Error("Regra não encontrada.");
    }

    const nextStatus = getInputValue(formData, "isActive") === "true";

    if (regra.isActive && !nextStatus) {
      await ensureCategoryHasAnotherActiveRule(regra.categoriaId, regra.id);
    }

    await prisma.controleTemperaturaCategoriaRegra.update({
      where: { id: regra.id },
      data: { isActive: nextStatus }
    });

    revalidateModulePaths();
    redirectWithFeedback(
      returnTo,
      "success",
      nextStatus ? "Regra Ativada com Sucesso." : "Regra Inativada com Sucesso."
    );
  } catch (error) {
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function deleteCategoryRuleAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanManageOptions(actor.perfil);

    const regraId = parsePositiveInt(getInputValue(formData, "regraId"));
    if (!regraId) {
      throw new Error("Regra inválida para exclusão.");
    }

    const regra = await prisma.controleTemperaturaCategoriaRegra.findUnique({
      where: { id: regraId }
    });

    if (!regra) {
      throw new Error("Regra não encontrada.");
    }

    if (regra.isActive) {
      await ensureCategoryHasAnotherActiveRule(regra.categoriaId, regra.id);
    }

    await prisma.controleTemperaturaCategoriaRegra.delete({
      where: { id: regra.id }
    });

    revalidateModulePaths();
    redirectWithFeedback(returnTo, "success", "Regra Excluída com Sucesso.");
  } catch (error) {
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}
