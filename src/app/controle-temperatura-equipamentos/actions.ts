"use server";
import { createFromOriginalForm } from "@/app/historico-operacional/compatible-create";
import { deleteOperationalRecord } from "@/lib/operational-deletion";

import { closeOperationalMonth } from "@/lib/monthly-periods";

import { saveTemperatureWorkflowAction } from "./workflow-actions";

import {
  ModuloDocumento,
  StatusTemperaturaEquipamento,
  TipoOpcaoTemperaturaEquipamento,
  TurnoTemperaturaEquipamento
} from "@prisma/client";
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
  hasCatalogOptionWithSameName,
  parseEquipmentCategory,
  parseOptionType,
  sanitizeCatalogName
} from "./catalog";
import {
  getMonthDateRange,
  parseNullableTemperatureInput,
  parsePositiveInt,
} from "./utils";

const MODULE_PATH = "/controle-temperatura-equipamentos";
const HISTORY_PATH = "/controle-temperatura-equipamentos/historico";
const OPTIONS_PATH = "/controle-temperatura-equipamentos/opcoes";
type FeedbackType = "success" | "error";

function getInputValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getInputValues(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
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
  feedback: string
): never {
  const url = new URL(returnTo, "http://localhost");
  if (feedbackType === "success") {
    url.searchParams.delete("new");
    url.searchParams.delete("editId");
    url.searchParams.delete("editEquipamentoId");
    url.searchParams.delete("editAcaoId");
    url.searchParams.delete("editCategoriaId");
    url.searchParams.delete("editRegraId");
    url.searchParams.delete("novaRegraCategoriaId");
    url.searchParams.delete("deleteId");
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

function parseConfiguredShiftsFromFormData(formData: FormData): {
  turnoManha: boolean;
  turnoTarde: boolean;
} {
  const selectedShifts = new Set(getInputValues(formData, "turnosConferencia"));
  const turnoManha = selectedShifts.has(TurnoTemperaturaEquipamento.MANHA);
  const turnoTarde = selectedShifts.has(TurnoTemperaturaEquipamento.TARDE);

  if (!turnoManha && !turnoTarde) {
    throw new Error("Selecione pelo menos um turno de conferência.");
  }

  return { turnoManha, turnoTarde };
}

async function isMonthSigned(mes: number, ano: number): Promise<boolean> {
  return isOperationalMonthClosed("temperatura", mes, ano);
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
  return createFromOriginalForm("temperatura",formData);
}

export async function updateRegistroAction(formData: FormData) {
  const actor = await getCurrentUserForAction();
  ensurePermission(actor, "modulo.temperatura.acessar", "Sem acesso ao módulo.");
  const record = await prisma.controleTemperaturaEquipamento.findUnique({where:{id:Number(getInputValue(formData,"id"))}});
  if (!record) throw new Error("Registro não encontrado.");
  if (record.fluxoId || !getInputValue(formData,"originalUpdatedAt")) redirect(MODULE_PATH+"/registro/"+record.id);
  formData.set("chave","legacy:"+record.id);
  formData.set("versao","0");
  return saveTemperatureWorkflowAction(formData);
}

export async function updatePhotoRequirementAction(formData: FormData) {
  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "modulo.temperatura.gerenciar_cadastros", "Você não tem permissão para gerenciar cadastros de temperatura.");
    const value = getInputValue(formData, "exigirFotoEmAlertaCritico");
    if (value !== "true" && value !== "false") {
      throw new Error("Selecione Habilitado ou Desabilitado para a exigência de foto.");
    }
    const exigirFotoEmAlertaCritico = value === "true";
    await prisma.moduloConfiguracao.upsert({
      where: { modulo: ModuloDocumento.CONTROLE_TEMPERATURA },
      create: {
        modulo: ModuloDocumento.CONTROLE_TEMPERATURA,
        exigirFotoEmAlertaCritico,
        atualizadoPorUsuarioId: actor.id
      },
      update: { exigirFotoEmAlertaCritico, atualizadoPorUsuarioId: actor.id }
    });
    revalidatePath(MODULE_PATH);
    revalidatePath(OPTIONS_PATH);
    redirectWithFeedback(OPTIONS_PATH, "success", "Configuração de foto salva com sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(OPTIONS_PATH, "error", getErrorMessage(error, "Não foi possível salvar a configuração de foto."));
  }
}

export async function deleteRegistroAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);
  try {
    await deleteOperationalRecord({ user: await getCurrentUserForAction(), target: "temperatura", id: Number(getInputValue(formData, "id")), reason: getInputValue(formData, "justificativaExclusao") });
    redirectWithFeedback(returnTo, "success", "Registro excluído com justificativa e auditoria.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error, "Não foi possível excluir o registro."));
  }
}

export async function closeMonthAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "modulo.temperatura.fechar_mes", "Seu perfil não pode assinar fechamento mensal de temperatura.");

    const mes = parsePositiveInt(getInputValue(formData, "mes"));
    const ano = parsePositiveInt(getInputValue(formData, "ano"));
    const senhaConfirmacao = getInputValue(formData, "senhaConfirmacao");

    if (!mes || mes < 1 || mes > 12 || !ano) {
      throw new Error("Informe um mês e ano válidos para fechamento.");
    }

    await assertNotReopenedMonth("temperatura", mes, ano);

    await validateSignaturePassword({ user: actor, password: senhaConfirmacao });


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

    await closeOperationalMonth({ user: actor, moduleCode: "temperatura", mes, ano }, "legacy");

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

    await reopenOperationalMonth({ user: actor, moduleCode: "temperatura", mes, ano });

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

export async function signRegistroNutricionistaAction(formData: FormData) {
  const actor=await getCurrentUserForAction();
  ensurePermission(actor,"modulo.temperatura.assinar_historico","Sem permissão para assinar.");
  const id=parsePositiveInt(getInputValue(formData,"id"));
  if (!id) throw new Error("Registro inválido.");
  // Cached unversioned forms must display the current content/scope first.
  redirect(MODULE_PATH+"/registro/"+id);
}

export async function createCatalogOptionAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "modulo.temperatura.gerenciar_cadastros", "Você não tem permissão para gerenciar cadastros de temperatura.");

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

    const turnosConferencia =
      tipo === TipoOpcaoTemperaturaEquipamento.EQUIPAMENTO
        ? parseConfiguredShiftsFromFormData(formData)
        : { turnoManha: true, turnoTarde: true };

    await prisma.controleTemperaturaEquipamentoOpcao.create({
      data: {
        tipo,
        nome,
        categoriaEquipamento,
        ...turnosConferencia,
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

export async function updateCatalogOptionAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "modulo.temperatura.gerenciar_cadastros", "Você não tem permissão para gerenciar cadastros de temperatura.");

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

    const turnosConferencia =
      option.tipo === TipoOpcaoTemperaturaEquipamento.EQUIPAMENTO
        ? parseConfiguredShiftsFromFormData(formData)
        : null;
    const ativoInput = getInputValue(formData, "ativo");
    const ativo =
      ativoInput === "true" ? true : ativoInput === "false" ? false : option.ativo;

    await prisma.$transaction(async (tx) => {
      await tx.controleTemperaturaEquipamentoOpcao.update({
        where: { id: optionId },
        data: {
          nome,
          categoriaEquipamento,
          ativo,
          ...(turnosConferencia ?? {})
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
    rethrowIfRedirectError(error);
    redirectWithFeedback(
      returnTo,
      "error",
      getErrorMessage(error, "Não foi possível processar a operação.")
    );
  }
}

export async function toggleCatalogOptionStatusAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "modulo.temperatura.gerenciar_cadastros", "Você não tem permissão para gerenciar cadastros de temperatura.");

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
    rethrowIfRedirectError(error);
    redirectWithFeedback(
      returnTo,
      "error",
      getErrorMessage(error, "Não foi possível processar a operação.")
    );
  }
}

export async function updateCategoryParameterAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "modulo.temperatura.gerenciar_cadastros", "Você não tem permissão para gerenciar cadastros de temperatura.");

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
    rethrowIfRedirectError(error);
    redirectWithFeedback(
      returnTo,
      "error",
      getErrorMessage(error, "Não foi possível processar a operação.")
    );
  }
}

export async function createCategoryRuleAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "modulo.temperatura.gerenciar_cadastros", "Você não tem permissão para gerenciar cadastros de temperatura.");

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
    rethrowIfRedirectError(error);
    redirectWithFeedback(
      returnTo,
      "error",
      getErrorMessage(error, "Não foi possível processar a operação.")
    );
  }
}

export async function updateCategoryRuleAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "modulo.temperatura.gerenciar_cadastros", "Você não tem permissão para gerenciar cadastros de temperatura.");

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
    rethrowIfRedirectError(error);
    redirectWithFeedback(
      returnTo,
      "error",
      getErrorMessage(error, "Não foi possível processar a operação.")
    );
  }
}

export async function toggleCategoryRuleStatusAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "modulo.temperatura.gerenciar_cadastros", "Você não tem permissão para gerenciar cadastros de temperatura.");

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
    rethrowIfRedirectError(error);
    redirectWithFeedback(
      returnTo,
      "error",
      getErrorMessage(error, "Não foi possível processar a operação.")
    );
  }
}

export async function deleteCategoryRuleAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "modulo.temperatura.gerenciar_cadastros", "Você não tem permissão para gerenciar cadastros de temperatura.");

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
    rethrowIfRedirectError(error);
    redirectWithFeedback(
      returnTo,
      "error",
      getErrorMessage(error, "Não foi possível processar a operação.")
    );
  }
}


