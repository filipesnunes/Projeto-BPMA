"use server";
import {validateAndBuildItemPayload,parseTemperaturaRecebimentoTipo,FieldValidationError,type CategoryItem,type ValidatedItemPayload} from "./workflow-payload";
import {startReceivingWorkflow,saveReceivingWorkflowState} from "./workflow-actions";
import { readExecutionTime } from "@/lib/procedure-time";
import { deleteOperationalRecord } from "@/lib/operational-deletion";

import { closeOperationalMonth } from "@/lib/monthly-periods";

import {
  StatusNotaRecebimento,
  TipoTemperaturaRecebimento
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { rethrowIfRedirectError } from "@/lib/redirect-error";

import { getCurrentUserForAction, type AuthenticatedUser } from "@/lib/auth-session";
import {
  ensureCanCloseMonth,
  ensureCanManageOptions,
  validateSignaturePassword
} from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { reopenOperationalMonth, isOperationalMonthClosed, assertNotReopenedMonth } from "@/lib/monthly-reopening";
import type { UserRole } from "@/lib/rbac";

import {
  hasCategoryWithSameName,
  sanitizeCategoryName
} from "./catalog";
import {
  formatDateInput,
  getMonthDateRange,
  getMonthYear,
  getTodaySystemDate,
  parsePositiveInt,
  parseTemperatureInput
} from "./utils";
import { getReceivingNoteEditAccessReason } from "./note-permissions";

const MODULE_PATH = "/rastreabilidade-recebimento";

function canEditImportedXmlFields(role: UserRole): boolean {
  return role === "DEV" || role === "GERENTE";
}

function getReceivingNoteEditAccessMessage(
  reason: ReturnType<typeof getReceivingNoteEditAccessReason>
): string {
  if (reason === "FINALIZED") {
    return "Notas finalizadas ficam disponíveis apenas para consulta.";
  }

  if (reason === "MONTH_SIGNED") {
    return "O mês desta nota já foi fechado e não pode ser alterado.";
  }

  return "Seu perfil não pode conferir esta nota de recebimento.";
}

function ensureCanEditReceivingNote(
  actor: AuthenticatedUser,
  note: {
    data: Date;
    statusNota: StatusNotaRecebimento;
  },
  monthSigned = false
) {
  const reason = getReceivingNoteEditAccessReason({
    user: actor,
    noteDate: note.data,
    statusNota: note.statusNota,
    today: getTodaySystemDate(),
    monthSigned
  });

  if (reason !== "EDITABLE") {
    throw new Error(getReceivingNoteEditAccessMessage(reason));
  }
}

type FeedbackType = "success" | "error";
type FormActionState = {
  status: "idle" | "success" | "error";
  message: string;
  invalidRowKey?: string;
  invalidField?: string;
};

const FORM_ACTION_INITIAL_STATE: FormActionState = {
  status: "idle",
  message: ""
};

function getInputValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getItemInputValue(formData: FormData, itemId: number, field: string): string {
  return getInputValue(formData, `item-${itemId}-${field}`);
}

function getBooleanInput(formData: FormData, key: string): boolean {
  const value = formData.get(key);
  return value === "true" || value === "on";
}

function getItemBooleanInput(formData: FormData, itemId: number, field: string): boolean {
  return getBooleanInput(formData, `item-${itemId}-${field}`);
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
    const technicalPattern =
      /next_redirect|invalid `prisma|prismaclient|typeerror|referenceerror|syntaxerror|p20\d{2}|stack/i;
    if (technicalPattern.test(error.message)) {
      return "Não foi possível processar a operação.";
    }
    return error.message;
  }

  return "Não foi possível processar a operação.";
}

function getInvalidField(error: unknown): string | undefined {
  if (error instanceof FieldValidationError) {
    return error.invalidField;
  }

  const message = getErrorMessage(error).toLocaleLowerCase("pt-BR");
  if (message.includes("sif")) {
    return "sif";
  }
  if (message.includes("temperatura")) {
    return "temperatura";
  }
  if (message.includes("ação corretiva") || message.includes("acao corretiva")) {
    return "acaoCorretiva";
  }
  if (message.includes("validade")) {
    return "dataValidade";
  }
  if (message.includes("fabricação") || message.includes("fabricacao")) {
    return "dataFabricacao";
  }

  return undefined;
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
    url.searchParams.delete("editCategoriaId");
    url.searchParams.delete("importXml");
    url.searchParams.delete("finalizar");
  }
  url.searchParams.set("feedbackType", feedbackType);
  url.searchParams.set("feedback", feedback);

  redirect(`${url.pathname}?${url.searchParams.toString()}`);
}

function redirectToNoteWithFeedback(
  noteId: number,
  feedbackType: FeedbackType,
  feedback: string
): never {
  const url = new URL(`${MODULE_PATH}/nota/${noteId}`, "http://localhost");
  url.searchParams.set("feedbackType", feedbackType);
  url.searchParams.set("feedback", feedback);
  redirect(`${url.pathname}?${url.searchParams.toString()}`);
}

function revalidateModulePaths() {
  revalidatePath(MODULE_PATH);
  revalidatePath(`${MODULE_PATH}/historico`);
  revalidatePath(`${MODULE_PATH}/opcoes`);
  revalidatePath(`${MODULE_PATH}/nota/[id]`);
  revalidatePath(`${MODULE_PATH}/nota/nova`);
}

async function isMonthSigned(mes: number, ano: number): Promise<boolean> {
  return isOperationalMonthClosed("rastreabilidade", mes, ano);
}

async function getActiveCategories(): Promise<CategoryItem[]> {
  const categories = await prisma.rastreabilidadeRecebimentoCategoria.findMany({
    where: { ativo: true },
    orderBy: [{ nome: "asc" }]
  });

  if (!categories.length) {
    throw new Error("Não há categorias ativas cadastradas para validação de temperatura.");
  }

  return categories;
}

export async function importXmlAction(formData:FormData) {
  const returnTo=getReturnToPath(formData);
  try{const id=await startReceivingWorkflow(formData,"xml");redirectToNoteWithFeedback(id,"success","XML importado. Complete a conferência.");}
  catch(error){rethrowIfRedirectError(error);redirectWithFeedback(returnTo,"error",getErrorMessage(error));}
}

async function createManualNoteFromForm(formData:FormData):Promise<number> { return startReceivingWorkflow(formData,"manual"); }

export async function createManualNoteAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const noteId = await createManualNoteFromForm(formData);
    revalidateModulePaths();
    redirectToNoteWithFeedback(noteId, "success", "Nota Criada com Sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function createManualNoteStateAction(
  _previousState: FormActionState = FORM_ACTION_INITIAL_STATE,
  formData: FormData
): Promise<FormActionState> {
  try {
    const noteId = await createManualNoteFromForm(formData);
    revalidateModulePaths();
    redirectToNoteWithFeedback(noteId, "success", "Nota Criada com Sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    return {
      status: "error",
      message: getErrorMessage(error),
      invalidField: getInvalidField(error)
    };
  }
}

export async function saveNotaItemsAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();

    const notaId = parsePositiveInt(getInputValue(formData, "notaId"));
    if (!notaId) {
      throw new Error("Nota inválida para atualização.");
    }

    const note = await prisma.rastreabilidadeRecebimentoNota.findUnique({
      where: { id: notaId },
      include: { itens: true }
    });

    if (!note) {
      throw new Error("Nota não encontrada.");
    }

    const period = getMonthYear(note.data);
    if (await isMonthSigned(period.mes, period.ano)) {
      throw new Error("O mês desta nota já foi fechado e não pode ser alterado.");
    }
    ensureCanEditReceivingNote(actor, note);

    const categories = await getActiveCategories();
    const xmlProductLocked =
      note.origemXml && !canEditImportedXmlFields(actor.perfil);

    const updates = note.itens.map((item) => {
      const produtoInput = xmlProductLocked
        ? item.produto
        : getItemInputValue(formData, item.id, "produto");

      const payload = validateAndBuildItemPayload(
        {
          produto: produtoInput,
          lote: getItemInputValue(formData, item.id, "lote"),
          dataFabricacao: getItemInputValue(formData, item.id, "dataFabricacao"),
          semDataFabricacao: getItemBooleanInput(formData, item.id, "semDataFabricacao"),
          dataValidade: getItemInputValue(formData, item.id, "dataValidade"),
          validadeNaoAplicavel: getItemBooleanInput(formData, item.id, "validadeNaoAplicavel"),
          sif: getItemInputValue(formData, item.id, "sif"),
          temperatura: getItemInputValue(formData, item.id, "temperatura"),
          temperaturaTipo: parseTemperaturaRecebimentoTipo(
            getItemInputValue(formData, item.id, "temperaturaTipo")
          ),
          transporteEntregador: getItemInputValue(formData, item.id, "transporteEntregador"),
          aspectoSensorial: getItemInputValue(formData, item.id, "aspectoSensorial"),
          embalagem: getItemInputValue(formData, item.id, "embalagem"),
          acaoCorretiva: getItemInputValue(formData, item.id, "acaoCorretiva"),
          observacoes: getItemInputValue(formData, item.id, "observacoes")
        },
        categories,
        actor.nomeCompleto
      );

      return {
        id: item.id,
        data: {
          ...payload,
          ...readExecutionTime(formData, note.data),
          fornecedor: note.fornecedor,
          notaFiscal: note.notaFiscal
        }
      };
    });

    const responsavelGeral = actor.nomeCompleto;

    await prisma.$transaction(async (tx) => {
      for (const update of updates) {
        await tx.rastreabilidadeRecebimentoRegistro.update({
          where: { id: update.id },
          data: update.data
        });
      }

      await tx.rastreabilidadeRecebimentoNota.update({
        where: { id: note.id },
        data: {
          statusNota: StatusNotaRecebimento.EM_CONFERENCIA,
          responsavelGeral
        }
      });
    });

    revalidateModulePaths();
    redirectToNoteWithFeedback(note.id, "success", "Itens da Nota Atualizados com Sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function saveNotaItemsStateAction(
  _previousState: FormActionState = FORM_ACTION_INITIAL_STATE,
  formData: FormData
): Promise<FormActionState> {
  if(formData.has("versao")) {const state=await saveReceivingWorkflowState(formData);if(state.status==="success")redirectToNoteWithFeedback(Number(formData.get("notaId")),"success",state.message);return state;}
  try {
    const intent = getInputValue(formData, "intent") === "finalize" ? "finalize" : "save";
    const actor = await getCurrentUserForAction();

    const notaId = parsePositiveInt(getInputValue(formData, "notaId"));
    if (!notaId) {
      throw new Error("Nota inválida para atualização.");
    }

    const note = await prisma.rastreabilidadeRecebimentoNota.findUnique({
      where: { id: notaId },
      include: { itens: true }
    });

    if (!note) {
      throw new Error("Nota não encontrada.");
    }

    const period = getMonthYear(note.data);
    if (await isMonthSigned(period.mes, period.ano)) {
      throw new Error("O mês desta nota já foi fechado e não pode ser alterado.");
    }
    ensureCanEditReceivingNote(actor, note);

    const categories = await getActiveCategories();
    const xmlProductLocked =
      note.origemXml && !canEditImportedXmlFields(actor.perfil);

    const updates: Array<{
      id: number;
      data: ValidatedItemPayload & {
        fornecedor: string;
        notaFiscal: string;
      };
    }> = [];

    for (const item of note.itens) {
      const rowKey = `item-${item.id}`;
      try {
        const produtoInput = xmlProductLocked
          ? item.produto
          : getItemInputValue(formData, item.id, "produto");

        const payload = validateAndBuildItemPayload(
          {
            produto: produtoInput,
            lote: getItemInputValue(formData, item.id, "lote"),
            dataFabricacao: getItemInputValue(formData, item.id, "dataFabricacao"),
            semDataFabricacao: getItemBooleanInput(formData, item.id, "semDataFabricacao"),
            dataValidade: getItemInputValue(formData, item.id, "dataValidade"),
            validadeNaoAplicavel: getItemBooleanInput(formData, item.id, "validadeNaoAplicavel"),
            sif: getItemInputValue(formData, item.id, "sif"),
            temperatura: getItemInputValue(formData, item.id, "temperatura"),
            temperaturaTipo: parseTemperaturaRecebimentoTipo(
              getItemInputValue(formData, item.id, "temperaturaTipo")
            ),
            transporteEntregador: getItemInputValue(formData, item.id, "transporteEntregador"),
            aspectoSensorial: getItemInputValue(formData, item.id, "aspectoSensorial"),
            embalagem: getItemInputValue(formData, item.id, "embalagem"),
            acaoCorretiva: getItemInputValue(formData, item.id, "acaoCorretiva"),
            observacoes: getItemInputValue(formData, item.id, "observacoes")
          },
          categories,
          actor.nomeCompleto
        );

        updates.push({
          id: item.id,
          data: {
            ...payload,
          ...readExecutionTime(formData, note.data),
            fornecedor: note.fornecedor,
            notaFiscal: note.notaFiscal
          }
        });
      } catch (error) {
        return {
          status: "error",
          message: getErrorMessage(error),
          invalidRowKey: rowKey,
          invalidField: getInvalidField(error)
        };
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const update of updates) {
        await tx.rastreabilidadeRecebimentoRegistro.update({
          where: { id: update.id },
          data: update.data
        });
      }

      await tx.rastreabilidadeRecebimentoNota.update({
        where: { id: note.id },
        data: {
          statusNota:
            intent === "finalize"
              ? StatusNotaRecebimento.FINALIZADA
              : StatusNotaRecebimento.EM_CONFERENCIA,
          responsavelGeral: actor.nomeCompleto
        }
      });
    });

    revalidateModulePaths();

    if (intent === "finalize") {
      redirectWithFeedback(
        MODULE_PATH,
        "success",
        `Nota ${note.notaFiscal} Finalizada com Sucesso.`
      );
    }

    return {
      status: "success",
      message: "Itens da Nota Atualizados com Sucesso."
    };
  } catch (error) {
    rethrowIfRedirectError(error);
    return {
      status: "error",
      message: getErrorMessage(error),
      invalidField: getInvalidField(error)
    };
  }
}

export async function finalizeNotaAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();

    const notaId = parsePositiveInt(getInputValue(formData, "notaId"));
    if (!notaId) {
      throw new Error("Nota inválida para finalização.");
    }

    const note = await prisma.rastreabilidadeRecebimentoNota.findUnique({
      where: { id: notaId },
      include: { itens: true }
    });

    if (!note) {
      throw new Error("Nota não encontrada.");
    }

    const period = getMonthYear(note.data);
    if (await isMonthSigned(period.mes, period.ano)) {
      throw new Error("O mês desta nota já foi fechado e não pode ser finalizado.");
    }
    ensureCanEditReceivingNote(actor, note);

    if (!note.itens.length) {
      throw new Error("A nota não possui itens para finalização.");
    }

    const categories = await getActiveCategories();

    const updates = note.itens.map((item) =>
      validateAndBuildItemPayload(
        {
          produto: item.produto,
          lote: item.lote ?? "",
          dataFabricacao: item.dataFabricacao ? formatDateInput(item.dataFabricacao) : "",
          semDataFabricacao: item.semDataFabricacao,
          dataValidade: item.dataValidade ? formatDateInput(item.dataValidade) : "",
          validadeNaoAplicavel: item.validadeNaoAplicavel,
          sif: item.sif ?? "",
          temperatura:
            item.temperaturaTipo === TipoTemperaturaRecebimento.NUMERICA &&
            item.temperatura !== null
              ? String(item.temperatura)
              : "",
          temperaturaTipo: item.temperaturaTipo,
          transporteEntregador: item.transporteEntregador ?? "",
          aspectoSensorial: item.aspectoSensorial ?? "",
          embalagem: item.embalagem ?? "",
          acaoCorretiva: item.acaoCorretiva ?? "",
          observacoes: item.observacoes ?? ""
        },
        categories,
        actor.nomeCompleto
      )
    );

    const responsavelGeral = actor.nomeCompleto;

    await prisma.$transaction(async (tx) => {
      for (let index = 0; index < note.itens.length; index += 1) {
        await tx.rastreabilidadeRecebimentoRegistro.update({
          where: { id: note.itens[index].id },
          data: {
            ...updates[index],
            fornecedor: note.fornecedor,
            notaFiscal: note.notaFiscal
          }
        });
      }

      await tx.rastreabilidadeRecebimentoNota.update({
        where: { id: note.id },
        data: {
          statusNota: StatusNotaRecebimento.FINALIZADA,
          responsavelGeral
        }
      });
    });

    revalidateModulePaths();
    redirectWithFeedback(
      MODULE_PATH,
      "success",
      `Nota ${note.notaFiscal} Finalizada com Sucesso.`
    );
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function deleteItemAction(formData: FormData) {
 const returnTo = getReturnToPath(formData);
 try {
 await deleteOperationalRecord({ user: await getCurrentUserForAction(), target: "rastreabilidade", id: Number(getInputValue(formData,"itemId")), reason: getInputValue(formData,"justificativaExclusao") });
 revalidateModulePaths();
 redirectWithFeedback(returnTo,"success","Registro excluído com auditoria.");
 } catch(error) { rethrowIfRedirectError(error); redirectWithFeedback(returnTo,"error",getErrorMessage(error)); }
}

export async function deleteNoteAction(formData: FormData) {
 const returnTo = getReturnToPath(formData);
 try {
 await deleteOperationalRecord({ user: await getCurrentUserForAction(), target: "nota", id: Number(getInputValue(formData,"notaId")), reason: getInputValue(formData,"justificativaExclusao") });
 revalidateModulePaths();
 redirectWithFeedback(returnTo,"success","Registro excluído com auditoria.");
 } catch(error) { rethrowIfRedirectError(error); redirectWithFeedback(returnTo,"error",getErrorMessage(error)); }
}

export async function closeMonthAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanCloseMonth(actor);

    const mes = parsePositiveInt(getInputValue(formData, "mes"));
    const ano = parsePositiveInt(getInputValue(formData, "ano"));
    const senhaConfirmacao = getInputValue(formData, "senhaConfirmacao");

    if (!mes || mes < 1 || mes > 12 || !ano) {
      throw new Error("Informe um mês e ano válidos para fechamento.");
    }

    await assertNotReopenedMonth("rastreabilidade", mes, ano);

    await validateSignaturePassword({ user: actor, password: senhaConfirmacao });

    if (await isMonthSigned(mes, ano)) {
      throw new Error(`O mês ${String(mes).padStart(2, "0")}/${ano} já está assinado.`);
    }

    const { start, end } = getMonthDateRange(mes, ano);
    const quantidadeNotas = await prisma.rastreabilidadeRecebimentoNota.count({
      where: {
        data: {
          gte: start,
          lte: end
        }
      }
    });

    if (quantidadeNotas === 0) {
      throw new Error("Não há notas no período selecionado para fechamento.");
    }

    const pendentes = await prisma.rastreabilidadeRecebimentoNota.count({
      where: {
        data: { gte: start, lte: end },
        statusNota: { not: StatusNotaRecebimento.FINALIZADA }
      }
    });

    if (pendentes > 0) {
      throw new Error(
        "Existem notas pendentes no período. Finalize todas as notas antes de fechar o mês."
      );
    }

    await closeOperationalMonth({ user: actor, moduleCode: "rastreabilidade", mes, ano }, "legacy");

    revalidateModulePaths();
    redirectWithFeedback(
      returnTo,
      "success",
      `Mês ${String(mes).padStart(2, "0")}/${ano} Fechado com Sucesso.`
    );
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
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

    await reopenOperationalMonth({ user: actor, moduleCode: "rastreabilidade", mes, ano });

    revalidateModulePaths();
    redirectWithFeedback(
      returnTo,
      "success",
      `Mês ${String(mes).padStart(2, "0")}/${ano} Reaberto com Sucesso.`
    );
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function createCategoryAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanManageOptions(actor);

    const nome = sanitizeCategoryName(getInputValue(formData, "nome"));
    const temperaturaMaxima = parseTemperatureInput(getInputValue(formData, "temperaturaMaxima"));

    if (!nome || temperaturaMaxima === null) {
      throw new Error("Preencha todos os campos obrigatórios da categoria.");
    }

    if (await hasCategoryWithSameName(nome)) {
      throw new Error("Esta categoria já está cadastrada.");
    }

    await prisma.rastreabilidadeRecebimentoCategoria.create({
      data: {
        nome,
        temperaturaMaxima,
        ativo: true
      }
    });

    revalidateModulePaths();
    redirectWithFeedback(returnTo, "success", "Categoria Cadastrada com Sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function updateCategoryAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanManageOptions(actor);

    const categoriaId = parsePositiveInt(getInputValue(formData, "categoriaId"));
    if (!categoriaId) {
      throw new Error("Categoria inválida para edição.");
    }

    const categoria = await prisma.rastreabilidadeRecebimentoCategoria.findUnique({
      where: { id: categoriaId }
    });

    if (!categoria) {
      throw new Error("Categoria não encontrada.");
    }

    const nome = sanitizeCategoryName(getInputValue(formData, "nome"));
    const temperaturaMaxima = parseTemperatureInput(getInputValue(formData, "temperaturaMaxima"));
    const ativo = getInputValue(formData, "ativo") === "true";

    if (!nome || temperaturaMaxima === null) {
      throw new Error("Preencha todos os campos obrigatórios da categoria.");
    }

    if (await hasCategoryWithSameName(nome, categoriaId)) {
      throw new Error("Já existe outra categoria com este nome.");
    }

    await prisma.rastreabilidadeRecebimentoCategoria.update({
      where: { id: categoriaId },
      data: {
        nome,
        temperaturaMaxima,
        ativo
      }
    });

    revalidateModulePaths();
    redirectWithFeedback(returnTo, "success", "Categoria Atualizada com Sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function toggleCategoryStatusAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanManageOptions(actor);

    const categoriaId = parsePositiveInt(getInputValue(formData, "categoriaId"));
    if (!categoriaId) {
      throw new Error("Categoria inválida para atualização.");
    }

    const categoria = await prisma.rastreabilidadeRecebimentoCategoria.findUnique({
      where: { id: categoriaId }
    });

    if (!categoria) {
      throw new Error("Categoria não encontrada.");
    }

    const ativo = getInputValue(formData, "ativo") === "true";

    await prisma.rastreabilidadeRecebimentoCategoria.update({
      where: { id: categoriaId },
      data: { ativo }
    });

    revalidateModulePaths();
    redirectWithFeedback(
      returnTo,
      "success",
      ativo ? "Categoria Ativada com Sucesso." : "Categoria Inativada com Sucesso."
    );
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}


