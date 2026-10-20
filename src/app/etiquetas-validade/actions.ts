"use server";
import { deleteOperationalRecord } from "@/lib/operational-deletion";

import { EtiquetaValidadeOrigemRegra } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUserForAction } from "@/lib/auth-session";
import { ensureCanAccessValidityLabels } from "@/lib/authz";
import {
  APP_TIME_ZONE,
  formatAppDateInput,
  getAppDate,
  getAppNow,
  parseAppDateInput
} from "@/lib/date-time";
import { prisma } from "@/lib/prisma";
import { rethrowIfRedirectError } from "@/lib/redirect-error";

import { HISTORY_PATH, MODULE_PATH, OPTIONS_PATH, UNIT_OPTIONS } from "./constants";

type FeedbackType = "success" | "error";

const APP_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MAX_PRINT_COPIES = 20;

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

function parsePositiveInt(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseOptionalPositiveInt(value: string): number | null {
  return value ? parsePositiveInt(value) : null;
}

function parsePositiveNumber(value: string): number | null {
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function parseNonNegativeInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function parsePrintCopies(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return Math.min(parsed, MAX_PRINT_COPIES);
}

function sanitizeText(value: string, maxLength = 1000): string | null {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function sanitizeRequiredText(value: string, label: string, maxLength = 160): string {
  const cleaned = sanitizeText(value, maxLength);
  if (!cleaned) {
    throw new Error(`Informe ${label}.`);
  }

  return cleaned;
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
  extraParams?: Record<string, string>
): never {
  const url = new URL(returnTo, "http://localhost");
  if (feedbackType === "success") {
    url.searchParams.delete("editGrupoId");
    url.searchParams.delete("editProdutoId");
    url.searchParams.delete("editMetodoId");
    url.searchParams.delete("editRegraId");
    url.searchParams.delete("etiquetaId");
    url.searchParams.delete("copias");
  }
  url.searchParams.set("feedbackType", feedbackType);
  url.searchParams.set("feedback", feedback);

  for (const [key, value] of Object.entries(extraParams ?? {})) {
    url.searchParams.set(key, value);
  }

  redirect(`${url.pathname}?${url.searchParams.toString()}`);
}

async function ensureDevAction() {
  const actor = await getCurrentUserForAction();
  ensureCanAccessValidityLabels(actor);
  return actor;
}

function revalidateEtiquetaPaths() {
  revalidatePath(MODULE_PATH);
  revalidatePath(OPTIONS_PATH);
  revalidatePath(HISTORY_PATH);
}

function formatEtiquetaCode(id: number): string {
  return `STS-${String(id).padStart(6, "0")}`;
}

function getCurrentAppTimeInput(date = getAppNow()): string {
  return APP_TIME_FORMATTER.format(date);
}

function getValidityDateTime(params: {
  now: Date;
  validadeDias: number | null;
  validadeHoras: number | null;
}): Date {
  const days = params.validadeDias ?? 0;
  const hours = params.validadeHoras ?? 0;
  return new Date(params.now.getTime() + days * DAY_MS + hours * HOUR_MS);
}

function getGroupPayload(formData: FormData) {
  const nome = sanitizeRequiredText(getInputValue(formData, "nome"), "o nome do grupo");
  const grupoPaiId = parseOptionalPositiveInt(getInputValue(formData, "grupoPaiId"));
  const icone = sanitizeText(getInputValue(formData, "icone"), 40);
  const ordem = parseNonNegativeInt(getInputValue(formData, "ordem"));
  const ativo = getInputValue(formData, "ativo") !== "false";

  return { nome, grupoPaiId, icone, ordem, ativo };
}

function getProductPayload(formData: FormData) {
  const nome = sanitizeRequiredText(getInputValue(formData, "nome"), "o nome do produto");
  const unidadePadrao = sanitizeRequiredText(
    getInputValue(formData, "unidadePadrao"),
    "a unidade padrão",
    40
  );
  const observacao = sanitizeText(getInputValue(formData, "observacao"), 1000);
  const ativo = getInputValue(formData, "ativo") !== "false";
  const grupoIds = Array.from(
    new Set(getInputValues(formData, "grupoIds").map(parsePositiveInt).filter(Boolean))
  ) as number[];

  if (!(UNIT_OPTIONS as readonly string[]).includes(unidadePadrao)) {
    throw new Error("Selecione uma unidade padrão válida.");
  }

  if (grupoIds.length === 0) {
    throw new Error("Vincule o produto a pelo menos um grupo ou subgrupo.");
  }

  return { nome, unidadePadrao, observacao, ativo, grupoIds };
}

function getMethodPayload(formData: FormData) {
  const nome = sanitizeRequiredText(getInputValue(formData, "nome"), "o nome do método");
  const tipo = sanitizeText(getInputValue(formData, "tipo"), 80);
  const icone = sanitizeText(getInputValue(formData, "icone"), 40);
  const ordem = parseNonNegativeInt(getInputValue(formData, "ordem"));
  const ativo = getInputValue(formData, "ativo") !== "false";

  return { nome, tipo, icone, ordem, ativo };
}

function getRulePayload(formData: FormData) {
  const produtoId = parseOptionalPositiveInt(getInputValue(formData, "produtoId"));
  const grupoId = parseOptionalPositiveInt(getInputValue(formData, "grupoId"));
  const metodoId = parsePositiveInt(getInputValue(formData, "metodoId"));
  const validadeDias = parseOptionalPositiveInt(getInputValue(formData, "validadeDias"));
  const validadeHoras = parseOptionalPositiveInt(getInputValue(formData, "validadeHoras"));
  const exigeValidadeManual = getInputValue(formData, "exigeValidadeManual") === "on";
  const temperaturaReferencia = sanitizeText(
    getInputValue(formData, "temperaturaReferencia"),
    120
  );
  const observacao = sanitizeText(getInputValue(formData, "observacao"), 1000);
  const prioridade = parseNonNegativeInt(getInputValue(formData, "prioridade"));
  const ativo = getInputValue(formData, "ativo") !== "false";

  if (!metodoId) {
    throw new Error("Selecione um método/conservação.");
  }

  if (!exigeValidadeManual && !validadeDias && !validadeHoras) {
    throw new Error("Informe dias/horas de validade ou marque validade manual.");
  }

  return {
    produtoId,
    grupoId,
    metodoId,
    validadeDias,
    validadeHoras,
    exigeValidadeManual,
    temperaturaReferencia,
    observacao,
    prioridade,
    ativo
  };
}

export async function createGroupAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    await ensureDevAction();
    const payload = getGroupPayload(formData);
    await prisma.etiquetaValidadeGrupo.create({ data: payload });
    revalidateEtiquetaPaths();
    redirectWithFeedback(returnTo, "success", "Grupo cadastrado com sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error, "Não foi possível cadastrar o grupo."));
  }
}

export async function updateGroupAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    await ensureDevAction();
    const id = parsePositiveInt(getInputValue(formData, "id"));
    if (!id) throw new Error("Grupo inválido para edição.");
    const payload = getGroupPayload(formData);
    if (payload.grupoPaiId === id) {
      throw new Error("Um grupo não pode ser subgrupo dele mesmo.");
    }
    await prisma.etiquetaValidadeGrupo.update({ where: { id }, data: payload });
    revalidateEtiquetaPaths();
    redirectWithFeedback(returnTo, "success", "Grupo atualizado com sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error, "Não foi possível atualizar o grupo."));
  }
}

export async function toggleGroupStatusAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    await ensureDevAction();
    const id = parsePositiveInt(getInputValue(formData, "id"));
    if (!id) throw new Error("Grupo inválido para atualização.");
    const existing = await prisma.etiquetaValidadeGrupo.findUnique({
      where: { id },
      select: { ativo: true }
    });
    if (!existing) throw new Error("Grupo não encontrado.");
    await prisma.etiquetaValidadeGrupo.update({
      where: { id },
      data: { ativo: !existing.ativo }
    });
    revalidateEtiquetaPaths();
    redirectWithFeedback(returnTo, "success", "Status do grupo atualizado.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error, "Não foi possível atualizar o grupo."));
  }
}

export async function deleteGroupAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    await ensureDevAction();
    const id = parsePositiveInt(getInputValue(formData, "id"));
    if (!id) throw new Error("Grupo inválido para exclusão.");

    const [subgrupos, produtos, regras, emissoes] = await Promise.all([
      prisma.etiquetaValidadeGrupo.count({ where: { grupoPaiId: id } }),
      prisma.etiquetaValidadeProdutoGrupo.count({ where: { grupoId: id } }),
      prisma.etiquetaValidadeRegra.count({ where: { grupoId: id } }),
      prisma.etiquetaValidadeEmissao.count({
        where: { OR: [{ grupoId: id }, { subgrupoId: id }] }
      })
    ]);

    if (subgrupos + produtos + regras + emissoes > 0) {
      throw new Error("Não é possível excluir este grupo porque existem vínculos. Inative-o ou remova os vínculos antes.");
    }

    await prisma.etiquetaValidadeGrupo.delete({ where: { id } });
    revalidateEtiquetaPaths();
    redirectWithFeedback(returnTo, "success", "Grupo excluído com sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error, "Não foi possível excluir o grupo."));
  }
}

export async function createProductAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    await ensureDevAction();
    const payload = getProductPayload(formData);
    await prisma.$transaction(async (tx) => {
      const produto = await tx.etiquetaValidadeProduto.create({
        data: {
          nome: payload.nome,
          unidadePadrao: payload.unidadePadrao,
          observacao: payload.observacao,
          ativo: payload.ativo
        }
      });
      await tx.etiquetaValidadeProdutoGrupo.createMany({
        data: payload.grupoIds.map((grupoId) => ({ produtoId: produto.id, grupoId }))
      });
    });
    revalidateEtiquetaPaths();
    redirectWithFeedback(returnTo, "success", "Produto cadastrado com sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error, "Não foi possível cadastrar o produto."));
  }
}

export async function updateProductAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    await ensureDevAction();
    const id = parsePositiveInt(getInputValue(formData, "id"));
    if (!id) throw new Error("Produto inválido para edição.");
    const payload = getProductPayload(formData);
    await prisma.$transaction(async (tx) => {
      await tx.etiquetaValidadeProduto.update({
        where: { id },
        data: {
          nome: payload.nome,
          unidadePadrao: payload.unidadePadrao,
          observacao: payload.observacao,
          ativo: payload.ativo
        }
      });
      await tx.etiquetaValidadeProdutoGrupo.deleteMany({ where: { produtoId: id } });
      await tx.etiquetaValidadeProdutoGrupo.createMany({
        data: payload.grupoIds.map((grupoId) => ({ produtoId: id, grupoId }))
      });
    });
    revalidateEtiquetaPaths();
    redirectWithFeedback(returnTo, "success", "Produto atualizado com sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error, "Não foi possível atualizar o produto."));
  }
}

export async function toggleProductStatusAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    await ensureDevAction();
    const id = parsePositiveInt(getInputValue(formData, "id"));
    if (!id) throw new Error("Produto inválido para atualização.");
    const existing = await prisma.etiquetaValidadeProduto.findUnique({
      where: { id },
      select: { ativo: true }
    });
    if (!existing) throw new Error("Produto não encontrado.");
    await prisma.etiquetaValidadeProduto.update({
      where: { id },
      data: { ativo: !existing.ativo }
    });
    revalidateEtiquetaPaths();
    redirectWithFeedback(returnTo, "success", "Status do produto atualizado.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error, "Não foi possível atualizar o produto."));
  }
}

export async function deleteProductAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    await ensureDevAction();
    const id = parsePositiveInt(getInputValue(formData, "id"));
    if (!id) throw new Error("Produto inválido para exclusão.");
    const emissoes = await prisma.etiquetaValidadeEmissao.count({ where: { produtoId: id } });
    if (emissoes > 0) {
      await prisma.etiquetaValidadeProduto.update({ where: { id }, data: { ativo: false } });
      revalidateEtiquetaPaths();
      redirectWithFeedback(returnTo, "success", "Produto inativado para preservar o histórico.");
    }
    await prisma.etiquetaValidadeProduto.delete({ where: { id } });
    revalidateEtiquetaPaths();
    redirectWithFeedback(returnTo, "success", "Produto excluído com sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error, "Não foi possível excluir o produto."));
  }
}

export async function createMethodAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    await ensureDevAction();
    await prisma.etiquetaValidadeMetodo.create({ data: getMethodPayload(formData) });
    revalidateEtiquetaPaths();
    redirectWithFeedback(returnTo, "success", "Método cadastrado com sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error, "Não foi possível cadastrar o método."));
  }
}

export async function updateMethodAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    await ensureDevAction();
    const id = parsePositiveInt(getInputValue(formData, "id"));
    if (!id) throw new Error("Método inválido para edição.");
    await prisma.etiquetaValidadeMetodo.update({
      where: { id },
      data: getMethodPayload(formData)
    });
    revalidateEtiquetaPaths();
    redirectWithFeedback(returnTo, "success", "Método atualizado com sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error, "Não foi possível atualizar o método."));
  }
}

export async function toggleMethodStatusAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    await ensureDevAction();
    const id = parsePositiveInt(getInputValue(formData, "id"));
    if (!id) throw new Error("Método inválido para atualização.");
    const existing = await prisma.etiquetaValidadeMetodo.findUnique({
      where: { id },
      select: { ativo: true }
    });
    if (!existing) throw new Error("Método não encontrado.");
    await prisma.etiquetaValidadeMetodo.update({
      where: { id },
      data: { ativo: !existing.ativo }
    });
    revalidateEtiquetaPaths();
    redirectWithFeedback(returnTo, "success", "Status do método atualizado.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error, "Não foi possível atualizar o método."));
  }
}

export async function deleteMethodAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    await ensureDevAction();
    const id = parsePositiveInt(getInputValue(formData, "id"));
    if (!id) throw new Error("Método inválido para exclusão.");
    const [regras, emissoes] = await Promise.all([
      prisma.etiquetaValidadeRegra.count({ where: { metodoId: id } }),
      prisma.etiquetaValidadeEmissao.count({ where: { metodoId: id } })
    ]);
    if (regras + emissoes > 0) {
      await prisma.etiquetaValidadeMetodo.update({ where: { id }, data: { ativo: false } });
      revalidateEtiquetaPaths();
      redirectWithFeedback(returnTo, "success", "Método inativado porque possui vínculos.");
    }
    await prisma.etiquetaValidadeMetodo.delete({ where: { id } });
    revalidateEtiquetaPaths();
    redirectWithFeedback(returnTo, "success", "Método excluído com sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error, "Não foi possível excluir o método."));
  }
}

export async function createValidityRuleAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    await ensureDevAction();
    await prisma.etiquetaValidadeRegra.create({ data: getRulePayload(formData) });
    revalidateEtiquetaPaths();
    redirectWithFeedback(returnTo, "success", "Regra de validade cadastrada com sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error, "Não foi possível cadastrar a regra."));
  }
}

export async function updateValidityRuleAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    await ensureDevAction();
    const id = parsePositiveInt(getInputValue(formData, "id"));
    if (!id) throw new Error("Regra inválida para edição.");
    await prisma.etiquetaValidadeRegra.update({
      where: { id },
      data: getRulePayload(formData)
    });
    revalidateEtiquetaPaths();
    redirectWithFeedback(returnTo, "success", "Regra de validade atualizada.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error, "Não foi possível atualizar a regra."));
  }
}

export async function toggleValidityRuleStatusAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    await ensureDevAction();
    const id = parsePositiveInt(getInputValue(formData, "id"));
    if (!id) throw new Error("Regra inválida para atualização.");
    const existing = await prisma.etiquetaValidadeRegra.findUnique({
      where: { id },
      select: { ativo: true }
    });
    if (!existing) throw new Error("Regra não encontrada.");
    await prisma.etiquetaValidadeRegra.update({
      where: { id },
      data: { ativo: !existing.ativo }
    });
    revalidateEtiquetaPaths();
    redirectWithFeedback(returnTo, "success", "Status da regra atualizado.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error, "Não foi possível atualizar a regra."));
  }
}

export async function deleteValidityRuleAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    await ensureDevAction();
    const id = parsePositiveInt(getInputValue(formData, "id"));
    if (!id) throw new Error("Regra inválida para exclusão.");
    const emissoes = await prisma.etiquetaValidadeEmissao.count({
      where: { regraValidadeId: id }
    });
    if (emissoes > 0) {
      await prisma.etiquetaValidadeRegra.update({ where: { id }, data: { ativo: false } });
      revalidateEtiquetaPaths();
      redirectWithFeedback(returnTo, "success", "Regra inativada para preservar o histórico.");
    }
    await prisma.etiquetaValidadeRegra.delete({ where: { id } });
    revalidateEtiquetaPaths();
    redirectWithFeedback(returnTo, "success", "Regra excluída com sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error, "Não foi possível excluir a regra."));
  }
}

export async function updatePrintConfigAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    await ensureDevAction();
    const larguraMm = parsePositiveNumber(getInputValue(formData, "larguraMm"));
    const alturaMm = parsePositiveNumber(getInputValue(formData, "alturaMm"));
    const margemMm = parsePositiveNumber(getInputValue(formData, "margemMm"));
    const tamanhoFonte = parsePositiveNumber(getInputValue(formData, "tamanhoFonte"));

    if (!larguraMm || !alturaMm || !margemMm || !tamanhoFonte) {
      throw new Error("Informe medidas e fonte com valores maiores que zero.");
    }

    await prisma.etiquetaValidadeConfiguracaoImpressao.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        larguraMm,
        alturaMm,
        margemMm,
        tamanhoFonte,
        mostrarQrCode: getInputValue(formData, "mostrarQrCode") === "on",
        mostrarSif: getInputValue(formData, "mostrarSif") === "on",
        mostrarLote: getInputValue(formData, "mostrarLote") === "on",
        mostrarMarcaFornecedor:
          getInputValue(formData, "mostrarMarcaFornecedor") === "on"
      },
      update: {
        larguraMm,
        alturaMm,
        margemMm,
        tamanhoFonte,
        mostrarQrCode: getInputValue(formData, "mostrarQrCode") === "on",
        mostrarSif: getInputValue(formData, "mostrarSif") === "on",
        mostrarLote: getInputValue(formData, "mostrarLote") === "on",
        mostrarMarcaFornecedor:
          getInputValue(formData, "mostrarMarcaFornecedor") === "on"
      }
    });

    revalidateEtiquetaPaths();
    redirectWithFeedback(returnTo, "success", "Configuração da etiqueta atualizada.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error, "Não foi possível atualizar a configuração."));
  }
}

async function upsertRule(params: {
  grupoId?: number | null;
  produtoId?: number | null;
  metodoId: number;
  validadeDias?: number | null;
  validadeHoras?: number | null;
  temperaturaReferencia?: string | null;
  observacao?: string | null;
  prioridade?: number;
}) {
  const existing = await prisma.etiquetaValidadeRegra.findFirst({
    where: {
      grupoId: params.grupoId ?? null,
      produtoId: params.produtoId ?? null,
      metodoId: params.metodoId
    },
    select: { id: true }
  });
  const data = {
    grupoId: params.grupoId ?? null,
    produtoId: params.produtoId ?? null,
    metodoId: params.metodoId,
    validadeDias: params.validadeDias ?? null,
    validadeHoras: params.validadeHoras ?? null,
    temperaturaReferencia: params.temperaturaReferencia ?? null,
    observacao: params.observacao ?? null,
    prioridade: params.prioridade ?? 0,
    exigeValidadeManual: false,
    ativo: true
  };

  if (existing) {
    await prisma.etiquetaValidadeRegra.update({ where: { id: existing.id }, data });
    return;
  }

  await prisma.etiquetaValidadeRegra.create({ data });
}

export async function createManualBaseAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    await ensureDevAction();
    const groups = [
      { nome: "Proteínas", ordem: 10 },
      { nome: "Proteínas - Aves", pai: "Proteínas", ordem: 11 },
      { nome: "Proteínas - Carnes Bovinas", pai: "Proteínas", ordem: 12 },
      { nome: "Proteínas - Peixes", pai: "Proteínas", ordem: 13 },
      { nome: "Proteínas - Frutos do Mar", pai: "Proteínas", ordem: 14 },
      { nome: "Proteínas - Suínos", pai: "Proteínas", ordem: 15 },
      { nome: "Proteínas - Ovos", pai: "Proteínas", ordem: 16 },
      { nome: "Hortifruti", ordem: 20 },
      { nome: "Hortifruti - Frutas", pai: "Hortifruti", ordem: 21 },
      { nome: "Hortifruti - Legumes", pai: "Hortifruti", ordem: 22 },
      { nome: "Hortifruti - Verduras", pai: "Hortifruti", ordem: 23 },
      { nome: "Itens Secos", ordem: 30 },
      { nome: "Produtos Refrigerados", ordem: 40 },
      { nome: "Frios e Laticínios", ordem: 50 }
    ];
    const methods = [
      { nome: "Resfriado", tipo: "Conservação", ordem: 10 },
      { nome: "Congelado", tipo: "Conservação", ordem: 20 },
      { nome: "Temperatura Ambiente", tipo: "Conservação", ordem: 30 },
      { nome: "Descongelando", tipo: "Processo", ordem: 40 },
      { nome: "Amostra Resfriada", tipo: "Amostra", ordem: 50 },
      { nome: "Pista Fria", tipo: "Buffet", ordem: 60 },
      { nome: "Pista Quente", tipo: "Buffet", ordem: 70 },
      { nome: "Aberto", tipo: "Processo", ordem: 80 },
      { nome: "Manipulado", tipo: "Processo", ordem: 90 }
    ];
    const products = [
      { nome: "Bacon", unidadePadrao: "g", grupos: ["Proteínas - Suínos"] },
      { nome: "Pernil suíno", unidadePadrao: "g", grupos: ["Proteínas - Suínos"] },
      { nome: "Frango cozido", unidadePadrao: "g", grupos: ["Proteínas - Aves"] },
      { nome: "Peixe em posta", unidadePadrao: "g", grupos: ["Proteínas - Peixes"] },
      { nome: "Abacate", unidadePadrao: "unidade", grupos: ["Hortifruti - Frutas"] },
      { nome: "Abacaxi", unidadePadrao: "unidade", grupos: ["Hortifruti - Frutas"] },
      { nome: "Bolo", unidadePadrao: "porção", grupos: ["Produtos Refrigerados"] },
      { nome: "Presunto", unidadePadrao: "g", grupos: ["Frios e Laticínios"] },
      { nome: "Queijo mussarela", unidadePadrao: "g", grupos: ["Frios e Laticínios"] },
      { nome: "Salada de frutas", unidadePadrao: "porção", grupos: ["Produtos Refrigerados"] },
      { nome: "Suco natural", unidadePadrao: "L", grupos: ["Produtos Refrigerados"] },
      { nome: "Pães", unidadePadrao: "unidade", grupos: ["Itens Secos"] },
      { nome: "Torradas", unidadePadrao: "pacote", grupos: ["Itens Secos"] },
      { nome: "Croutons", unidadePadrao: "pacote", grupos: ["Itens Secos"] }
    ];

    for (const group of groups) {
      const parent = group.pai
        ? await prisma.etiquetaValidadeGrupo.findUnique({ where: { nome: group.pai } })
        : null;
      await prisma.etiquetaValidadeGrupo.upsert({
        where: { nome: group.nome },
        create: {
          nome: group.nome,
          grupoPaiId: parent?.id ?? null,
          ordem: group.ordem,
          ativo: true
        },
        update: {
          grupoPaiId: parent?.id ?? null,
          ordem: group.ordem,
          ativo: true
        }
      });
    }

    for (const method of methods) {
      await prisma.etiquetaValidadeMetodo.upsert({
        where: { nome: method.nome },
        create: { ...method, ativo: true },
        update: { tipo: method.tipo, ordem: method.ordem, ativo: true }
      });
    }

    for (const product of products) {
      const created = await prisma.etiquetaValidadeProduto.upsert({
        where: { nome: product.nome },
        create: {
          nome: product.nome,
          unidadePadrao: product.unidadePadrao,
          ativo: true
        },
        update: {
          unidadePadrao: product.unidadePadrao,
          ativo: true
        }
      });
      const productGroups = await prisma.etiquetaValidadeGrupo.findMany({
        where: { nome: { in: product.grupos } },
        select: { id: true }
      });
      await prisma.etiquetaValidadeProdutoGrupo.deleteMany({
        where: { produtoId: created.id }
      });
      await prisma.etiquetaValidadeProdutoGrupo.createMany({
        data: productGroups.map((group) => ({ produtoId: created.id, grupoId: group.id })),
        skipDuplicates: true
      });
    }

    const groupByName = Object.fromEntries(
      (await prisma.etiquetaValidadeGrupo.findMany()).map((group) => [group.nome, group.id])
    );
    const methodByName = Object.fromEntries(
      (await prisma.etiquetaValidadeMetodo.findMany()).map((method) => [method.nome, method.id])
    );
    const productByName = Object.fromEntries(
      (await prisma.etiquetaValidadeProduto.findMany()).map((product) => [product.nome, product.id])
    );
    const manualObservation = "Sugestão editável baseada no Manual de Boas Práticas K-Platz, item 13.8.";

    for (const groupName of [
      "Proteínas - Aves",
      "Proteínas - Carnes Bovinas",
      "Proteínas - Suínos"
    ]) {
      await upsertRule({
        grupoId: groupByName[groupName],
        metodoId: methodByName.Resfriado,
        validadeDias: 3,
        observacao: manualObservation
      });
      await upsertRule({
        grupoId: groupByName[groupName],
        metodoId: methodByName.Congelado,
        validadeDias: 30,
        observacao: manualObservation
      });
    }

    for (const groupName of ["Proteínas - Peixes", "Proteínas - Frutos do Mar"]) {
      await upsertRule({
        grupoId: groupByName[groupName],
        metodoId: methodByName.Resfriado,
        validadeDias: 1,
        observacao: manualObservation
      });
      await upsertRule({
        grupoId: groupByName[groupName],
        metodoId: methodByName.Congelado,
        validadeDias: 30,
        observacao: manualObservation
      });
    }

    await upsertRule({
      grupoId: groupByName["Proteínas - Ovos"],
      metodoId: methodByName.Resfriado,
      validadeDias: 1,
      observacao: manualObservation
    });
    await upsertRule({
      grupoId: groupByName["Itens Secos"],
      metodoId: methodByName["Temperatura Ambiente"],
      validadeDias: 30,
      observacao: "30 dias ou conforme fabricante. Sugestão editável do Manual de Boas Práticas."
    });

    for (const [productName, days] of [
      ["Pães", 5],
      ["Torradas", 5],
      ["Croutons", 5],
      ["Bolo", 3],
      ["Salada de frutas", 1],
      ["Suco natural", 3],
      ["Presunto", 3],
      ["Queijo mussarela", 3]
    ] as const) {
      await upsertRule({
        produtoId: productByName[productName],
        metodoId:
          productName === "Pães" || productName === "Torradas" || productName === "Croutons"
            ? methodByName["Temperatura Ambiente"]
            : methodByName.Resfriado,
        validadeDias: days,
        temperaturaReferencia:
          productName === "Pães" || productName === "Torradas" || productName === "Croutons"
            ? "Ambiente"
            : "Até 4°C",
        observacao: manualObservation,
        prioridade: 10
      });
    }

    revalidateEtiquetaPaths();
    redirectWithFeedback(returnTo, "success", "Base sugerida do Manual preparada com sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error, "Não foi possível preparar a base sugerida."));
  }
}

export async function deleteEtiquetaGeradaAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await ensureDevAction();
    const id = parsePositiveInt(getInputValue(formData, "id"));
    if (!id) throw new Error("Etiqueta inválida para exclusão.");
    await deleteOperationalRecord({ user: actor, target: "etiquetas", id, reason: getInputValue(formData, "justificativaExclusao") });
    revalidateEtiquetaPaths();
    redirectWithFeedback(returnTo, "success", "Etiqueta excluída do histórico.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error, "Não foi possível excluir a etiqueta."));
  }
}

export async function generateEtiquetaAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await ensureDevAction();
    if (!actor.nomeCompleto.trim()) {
      throw new Error("Responsável obrigatório para gerar etiqueta.");
    }

    const now = getAppNow();
    const dataManipulacao = getAppDate(now);
    const horaManipulacao = getCurrentAppTimeInput(now);
    const produtoId = parseOptionalPositiveInt(getInputValue(formData, "produtoId"));
    const grupoId = parseOptionalPositiveInt(getInputValue(formData, "grupoId"));
    const subgrupoId = parseOptionalPositiveInt(getInputValue(formData, "subgrupoId"));
    const metodoId = parseOptionalPositiveInt(getInputValue(formData, "metodoId"));
    const regraId = parseOptionalPositiveInt(getInputValue(formData, "regraId"));
    const produtoManual = getInputValue(formData, "produtoManual") === "true";
    const validadeManual = getInputValue(formData, "validadeManual") === "true";
    const quantidade = sanitizeRequiredText(getInputValue(formData, "quantidade"), "a quantidade", 80);
    const unidadeManual = sanitizeText(getInputValue(formData, "unidadeManual"), 40);
    const marcaFornecedor = sanitizeText(getInputValue(formData, "marcaFornecedor"), 160);
    const sif = sanitizeText(getInputValue(formData, "sif"), 40);
    const lote = sanitizeText(getInputValue(formData, "lote"), 80);
    const observacao = sanitizeText(getInputValue(formData, "observacao"), 1000);
    const validadeOriginal = parseAppDateInput(getInputValue(formData, "validadeOriginal"));
    const numeroCopias = parsePrintCopies(getInputValue(formData, "numeroCopias"));

    let produtoNomeSnapshot: string;
    let unidadeSnapshot: string;
    let produtoDbId: number | null = null;
    if (produtoManual) {
      produtoNomeSnapshot = sanitizeRequiredText(
        getInputValue(formData, "produtoManualNome"),
        "o nome do produto manual"
      );
      unidadeSnapshot = sanitizeRequiredText(getInputValue(formData, "unidadeManual"), "a unidade", 40);
    } else {
      if (!produtoId) throw new Error("Selecione um produto.");
      const produto = await prisma.etiquetaValidadeProduto.findUnique({
        where: { id: produtoId },
        select: { id: true, nome: true, unidadePadrao: true, ativo: true }
      });
      if (!produto?.ativo) {
        throw new Error("Produto inativo ou inexistente.");
      }
      produtoDbId = produto.id;
      produtoNomeSnapshot = produto.nome;
      unidadeSnapshot = unidadeManual || produto.unidadePadrao;
    }

    if (!(UNIT_OPTIONS as readonly string[]).includes(unidadeSnapshot)) {
      throw new Error("Selecione uma unidade válida para a etiqueta.");
    }

    const [grupo, subgrupo, metodo] = await Promise.all([
      grupoId
        ? prisma.etiquetaValidadeGrupo.findUnique({ where: { id: grupoId } })
        : Promise.resolve(null),
      subgrupoId
        ? prisma.etiquetaValidadeGrupo.findUnique({ where: { id: subgrupoId } })
        : Promise.resolve(null),
      metodoId
        ? prisma.etiquetaValidadeMetodo.findUnique({ where: { id: metodoId } })
        : Promise.resolve(null)
    ]);
    const metodoManualNome = sanitizeText(getInputValue(formData, "metodoManualNome"), 120);
    const metodoNomeSnapshot = metodo?.nome ?? metodoManualNome;
    if (!metodoNomeSnapshot) {
      throw new Error("Selecione ou informe a conservação/método.");
    }

    const regra = regraId
      ? await prisma.etiquetaValidadeRegra.findUnique({ where: { id: regraId } })
      : null;
    if (regra) {
      const regraGrupoOk =
        !regra.grupoId || regra.grupoId === grupo?.id || regra.grupoId === subgrupo?.id;
      const regraProdutoOk = !regra.produtoId || regra.produtoId === produtoDbId;
      const regraMetodoOk = !metodo?.id || regra.metodoId === metodo.id;

      if (!regra.ativo || !regraGrupoOk || !regraProdutoOk || !regraMetodoOk) {
        throw new Error("Regra de validade incompatível com a seleção da etiqueta.");
      }
    }
    const exigeManual = validadeManual || produtoManual || !regra || regra.exigeValidadeManual;
    const dataValidadeManual = parseAppDateInput(getInputValue(formData, "dataValidadeManual"));
    let dataValidade: Date;
    let horaValidade: string;

    if (exigeManual) {
      if (!dataValidadeManual) {
        throw new Error("Informe a data de validade manual.");
      }
      if (dataValidadeManual.getTime() < dataManipulacao.getTime()) {
        throw new Error("A validade não pode ser anterior à manipulação.");
      }
      dataValidade = dataValidadeManual;
      horaValidade = horaManipulacao;
    } else {
      const validadeDateTime = getValidityDateTime({
        now,
        validadeDias: regra.validadeDias,
        validadeHoras: regra.validadeHoras
      });
      dataValidade = getAppDate(validadeDateTime);
      horaValidade = getCurrentAppTimeInput(validadeDateTime);
    }

    const etiqueta = await prisma.$transaction(async (tx) => {
      const created = await tx.etiquetaValidadeEmissao.create({
        data: {
          codigoEtiqueta: `STS-TMP-${actor.id}-${Date.now()}`,
          produtoId: produtoDbId,
          grupoId: grupo?.id ?? null,
          subgrupoId: subgrupo?.id ?? null,
          metodoId: metodo?.id ?? null,
          regraValidadeId: regra?.id ?? null,
          produtoNomeSnapshot,
          grupoNomeSnapshot: grupo?.nome ?? null,
          subgrupoNomeSnapshot: subgrupo?.nome ?? null,
          metodoNomeSnapshot,
          validadeDiasSnapshot: regra?.validadeDias ?? null,
          validadeHorasSnapshot: regra?.validadeHoras ?? null,
          temperaturaReferenciaSnapshot: regra?.temperaturaReferencia ?? null,
          quantidade,
          unidadeSnapshot,
          dataManipulacao,
          horaManipulacao,
          dataValidade,
          horaValidade,
          responsavelUsuarioId: actor.id,
          responsavelNomeSnapshot: actor.nomeCompleto,
          responsavelPerfilSnapshot: actor.perfil,
          marcaFornecedor,
          sif,
          lote,
          validadeOriginal,
          observacao,
          origem: exigeManual
            ? EtiquetaValidadeOrigemRegra.MANUAL
            : EtiquetaValidadeOrigemRegra.AUTOMATICA
        }
      });

      return tx.etiquetaValidadeEmissao.update({
        where: { id: created.id },
        data: { codigoEtiqueta: formatEtiquetaCode(created.id) }
      });
    });

    revalidateEtiquetaPaths();
    redirectWithFeedback(
      returnTo,
      "success",
      `Etiqueta ${etiqueta.codigoEtiqueta} gerada com validade em ${formatAppDateInput(etiqueta.dataValidade)}.`,
      { etiquetaId: String(etiqueta.id), copias: String(numeroCopias) }
    );
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error, "Não foi possível gerar a etiqueta."));
  }
}
