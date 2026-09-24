"use server";

import {
  Prisma,
  ConformidadeRecebimento,
  StatusFechamentoRastreabilidadeRecebimento,
  StatusNotaRecebimento,
  StatusRecebimento,
  TipoTemperaturaRecebimento
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { rethrowIfRedirectError } from "@/lib/redirect-error";

import { getCurrentUserForAction, type AuthenticatedUser } from "@/lib/auth-session";
import {
  createSignatureLog,
  ensureCanCloseMonth,
  ensureCanManageOptions,
  ensureCanReopenMonth,
  ensurePermission,
  validateSignaturePassword
} from "@/lib/authz";
import { canEditRecordDate, hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/lib/rbac";

import {
  hasCategoryWithSameName,
  sanitizeCategoryName
} from "./catalog";
import { canDeleteImportedReceivingNote } from "./note-permissions";
import { parseRecebimentoXml } from "./xml-parser";
import {
  calculateOverallStatus,
  calculateTemperatureStatus,
  formatDateInput,
  getCurrentSystemDateTime,
  getMonthDateRange,
  getMonthYear,
  getTodaySystemDate,
  isActionCorrectiveRequired,
  parseConformidade,
  parseDateInput,
  parsePositiveInt,
  parseTemperatureInput
} from "./utils";
import type { Conformidade } from "./utils";
import {
  normalizeSifValue,
  SIF_BACKEND_REQUIRED_MESSAGE
} from "./sif";
import { getReceivingNoteEditAccessReason } from "./note-permissions";

const MODULE_PATH = "/rastreabilidade-recebimento";
const MODULE_CODE = "rastreabilidade";
const DUPLICATE_NFE_MESSAGE =
  "Esta nota fiscal já foi importada anteriormente e não pode ser cadastrada novamente.";

function canImportXmlAsGerente(role: UserRole): boolean {
  return role === "DEV" || role === "GERENTE";
}

function canEditImportedXmlFields(role: UserRole): boolean {
  return role === "DEV" || role === "GERENTE";
}

function canCreateManualReceiving(role: UserRole): boolean {
  return role !== "COLABORADOR";
}

function ensureCanCreateManualReceiving(actor: AuthenticatedUser) {
  if (
    !hasPermission(actor, "modulo.rastreabilidade.criar_registro") &&
    !canCreateManualReceiving(actor.perfil)
  ) {
    throw new Error("Seu perfil não pode criar notas manuais de recebimento.");
  }
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

type CategoryItem = {
  id: number;
  nome: string;
  temperaturaMaxima: number;
  ativo: boolean;
};

type ItemInputValues = {
  produto: string;
  lote: string;
  dataFabricacao: string;
  semDataFabricacao: boolean;
  dataValidade: string;
  validadeNaoAplicavel: boolean;
  sif: string;
  temperatura: string;
  temperaturaTipo: TipoTemperaturaRecebimento;
  transporteEntregador: string;
  aspectoSensorial: string;
  embalagem: string;
  acaoCorretiva: string;
  observacoes: string;
};

type ValidatedItemPayload = {
  produto: string;
  lote: string;
  dataFabricacao: Date | null;
  semDataFabricacao: boolean;
  dataValidade: Date | null;
  validadeNaoAplicavel: boolean;
  sif: string;
  temperatura: number | null;
  temperaturaTipo: TipoTemperaturaRecebimento;
  categoriaId: number;
  temperaturaStatus: ConformidadeRecebimento;
  transporteEntregador: ConformidadeRecebimento;
  aspectoSensorial: ConformidadeRecebimento;
  embalagem: ConformidadeRecebimento;
  acaoCorretiva: string | null;
  responsavelRecebimento: string;
  observacoes: string | null;
  statusGeral: StatusRecebimento;
};

class FieldValidationError extends Error {
  invalidField: string;

  constructor(message: string, invalidField: string) {
    super(message);
    this.name = "FieldValidationError";
    this.invalidField = invalidField;
  }
}

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

function buildFiscalIdentifier(params: {
  notaFiscal: string;
  cnpjFornecedor: string | null;
  serieNota: string | null;
}): string | null {
  if (!params.notaFiscal || !params.cnpjFornecedor) {
    return null;
  }

  const base = `${params.cnpjFornecedor}|${params.notaFiscal}`;
  if (params.serieNota) {
    return `${base}|${params.serieNota}`;
  }

  return base;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
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
  const fechamento = await prisma.rastreabilidadeRecebimentoFechamento.findUnique({
    where: { mes_ano: { mes, ano } }
  });

  return fechamento?.status === StatusFechamentoRastreabilidadeRecebimento.ASSINADO;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function findCategoryByNamePart(
  categories: CategoryItem[],
  keyword: string
): CategoryItem | null {
  const normalizedKeyword = normalizeText(keyword);
  return (
    categories.find((category) => normalizeText(category.nome).includes(normalizedKeyword)) ??
    null
  );
}

function determineCategoryForProduct(
  productName: string,
  categories: CategoryItem[]
): CategoryItem {
  const normalizedProduct = normalizeText(productName);

  if (
    /(pescad|peixe|camarao|salmao|tilapia|atum|bacalhau)/.test(normalizedProduct)
  ) {
    const pescados = findCategoryByNamePart(categories, "pescados");
    if (pescados) return pescados;
  }

  if (
    /(congel|freezer|sorvet|gelad)/.test(normalizedProduct)
  ) {
    const congelados = findCategoryByNamePart(categories, "congelados");
    if (congelados) return congelados;
  }

  if (
    /(carne|frango|bovina|suina|linguica|hamburg)/.test(normalizedProduct)
  ) {
    const carnes = findCategoryByNamePart(categories, "carnes");
    if (carnes) return carnes;
  }

  if (
    /(pao|bolo|torta|confeitar|panifica|recheio)/.test(normalizedProduct)
  ) {
    const panificacao = findCategoryByNamePart(categories, "panificação");
    if (panificacao) return panificacao;
  }

  const demais = findCategoryByNamePart(categories, "demais");
  if (demais) return demais;

  return categories[0];
}

function parseRequiredDate(value: string, fieldLabel: string): Date {
  if (!value) {
    throw new Error(`O campo ${fieldLabel} é obrigatório.`);
  }

  const parsed = parseDateInput(value);
  if (!parsed) {
    throw new Error(`Informe uma ${fieldLabel.toLowerCase()} válida.`);
  }

  return parsed;
}

function parseRequiredTemperature(value: string): number {
  const parsed = parseTemperatureInput(value);
  if (parsed === null) {
    throw new Error("Informe uma temperatura válida.");
  }
  return parsed;
}

function formatTemperatureValue(value: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 1
  });
}

function buildCorrectiveActionReasons(params: {
  temperatura: number | null;
  temperaturaStatus: Conformidade;
  categoria: CategoryItem;
  transporteEntregador: Conformidade | null;
  aspectoSensorial: Conformidade | null;
  embalagem: Conformidade | null;
}): string[] {
  const reasons: string[] = [];

  if (params.temperaturaStatus === "NAO_CONFORME" && params.temperatura !== null) {
    reasons.push(
      `Temperatura fora do padrão: ${formatTemperatureValue(
        params.temperatura
      )} °C acima do limite de ${formatTemperatureValue(
        params.categoria.temperaturaMaxima
      )} °C para ${params.categoria.nome}.`
    );
  }

  if (params.transporteEntregador === "NAO_CONFORME") {
    reasons.push("Transporte/entregador marcado como não conforme.");
  }

  if (params.aspectoSensorial === "NAO_CONFORME") {
    reasons.push("Aspecto sensorial marcado como não conforme.");
  }

  if (params.embalagem === "NAO_CONFORME") {
    reasons.push("Embalagem marcada como não conforme.");
  }

  return reasons;
}

function parseTemperaturaRecebimentoTipo(value: string): TipoTemperaturaRecebimento {
  if (value === TipoTemperaturaRecebimento.AMBIENTE) {
    return TipoTemperaturaRecebimento.AMBIENTE;
  }

  if (value === TipoTemperaturaRecebimento.NAO_APLICAVEL) {
    return TipoTemperaturaRecebimento.NAO_APLICAVEL;
  }

  return TipoTemperaturaRecebimento.NUMERICA;
}

function validateAndBuildItemPayload(
  input: ItemInputValues,
  categories: CategoryItem[],
  responsavelLogado: string
): ValidatedItemPayload {
  if (!input.produto) {
    throw new Error("O campo Produto é obrigatório.");
  }

  if (!input.lote) {
    throw new FieldValidationError("O campo Lote é obrigatório.", "lote");
  }

  const sifNormalizado = input.sif.trim();
  if (!sifNormalizado) {
    throw new FieldValidationError(SIF_BACKEND_REQUIRED_MESSAGE, "sif");
  }
  const sifValue = normalizeSifValue(sifNormalizado);

  if (!responsavelLogado.trim()) {
    throw new Error("Não foi possível identificar o usuário logado para o campo Responsável.");
  }

  const dataFabricacao = input.semDataFabricacao
    ? null
    : parseRequiredDate(input.dataFabricacao, "Data de Fabricação");
  const dataValidade = input.validadeNaoAplicavel
    ? null
    : parseRequiredDate(input.dataValidade, "Validade");
  const temperaturaTipo = input.temperaturaTipo;

  const transporteEntregador = parseConformidade(input.transporteEntregador);
  const aspectoSensorial = parseConformidade(input.aspectoSensorial);
  const embalagem = parseConformidade(input.embalagem);

  if (!transporteEntregador || !aspectoSensorial || !embalagem) {
    throw new Error(
      "Preencha Transporte/Entregador, Aspecto Sensorial e Embalagem como Conforme ou Não Conforme."
    );
  }

  const category = determineCategoryForProduct(input.produto, categories);
  let temperatura: number | null = null;
  let temperaturaStatus: Conformidade = "CONFORME";
  if (temperaturaTipo === TipoTemperaturaRecebimento.NUMERICA) {
    temperatura = parseRequiredTemperature(input.temperatura);
    temperaturaStatus = calculateTemperatureStatus(temperatura, category.temperaturaMaxima);
  }
  const correctiveActionReasons = buildCorrectiveActionReasons({
    temperatura,
    temperaturaStatus,
    categoria: category,
    transporteEntregador,
    aspectoSensorial,
    embalagem
  });
  const needsCorrectiveAction = isActionCorrectiveRequired({
    temperaturaStatus,
    transporteEntregador,
    aspectoSensorial,
    embalagem
  });

  if (needsCorrectiveAction && !input.acaoCorretiva) {
    const reasonText = correctiveActionReasons.length
      ? correctiveActionReasons.join(" ")
      : "Há campos não conformes neste item.";
    throw new FieldValidationError(
      `Este item possui não conformidade. ${reasonText} Informe a ação corretiva para salvar.`,
      "acaoCorretiva"
    );
  }

  const statusGeral = calculateOverallStatus({
    temperaturaStatus,
    transporteEntregador,
    aspectoSensorial,
    embalagem
  });

  return {
    produto: input.produto,
    lote: input.lote,
    dataFabricacao,
    semDataFabricacao: input.semDataFabricacao,
    dataValidade,
    validadeNaoAplicavel: input.validadeNaoAplicavel,
    sif: sifValue,
    temperatura,
    temperaturaTipo,
    categoriaId: category.id,
    temperaturaStatus: temperaturaStatus as ConformidadeRecebimento,
    transporteEntregador: transporteEntregador as ConformidadeRecebimento,
    aspectoSensorial: aspectoSensorial as ConformidadeRecebimento,
    embalagem: embalagem as ConformidadeRecebimento,
    acaoCorretiva: input.acaoCorretiva || null,
    responsavelRecebimento: responsavelLogado.trim(),
    observacoes: input.observacoes || null,
    statusGeral: statusGeral as StatusRecebimento
  };
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

async function ensureXmlNoteIsNotDuplicated(params: {
  chaveNFe: string | null;
  notaFiscal: string;
  cnpjFornecedor: string | null;
  serieNota: string | null;
}) {
  if (params.chaveNFe) {
    const existingByKey = await prisma.rastreabilidadeRecebimentoNota.findFirst({
      where: { chaveNfe: params.chaveNFe },
      select: { id: true }
    });

    if (existingByKey) {
      throw new Error(DUPLICATE_NFE_MESSAGE);
    }
  }

  if (params.cnpjFornecedor) {
    const existingByNumberAndDocument = await prisma.rastreabilidadeRecebimentoNota.findFirst({
      where: {
        notaFiscal: params.notaFiscal,
        cnpjFornecedor: params.cnpjFornecedor,
        ...(params.serieNota
          ? {
              OR: [{ serieNota: params.serieNota }, { serieNota: null }, { serieNota: "" }]
            }
          : {})
      },
      select: { id: true }
    });

    if (existingByNumberAndDocument) {
      throw new Error(DUPLICATE_NFE_MESSAGE);
    }
  }
}

export async function importXmlAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    if (!canImportXmlAsGerente(actor.perfil)) {
      throw new Error("A importação de XML é permitida apenas para DEV e GERENTE.");
    }

    const file = formData.get("xmlFile");
    if (!(file instanceof File)) {
      throw new Error("Selecione um arquivo XML válido.");
    }

    if (!file.name.toLowerCase().endsWith(".xml")) {
      throw new Error("O arquivo precisa estar no formato XML.");
    }

    const content = await file.text();
    const parsed = parseRecebimentoXml(content);
    const categories = await getActiveCategories();

    const data = getTodaySystemDate();
    const { mes, ano } = getMonthYear(data);
    if (await isMonthSigned(mes, ano)) {
      throw new Error(
        `O mês ${String(mes).padStart(2, "0")}/${ano} já está fechado e não aceita importações.`
      );
    }

    await ensureXmlNoteIsNotDuplicated({
      chaveNFe: parsed.chaveNFe,
      notaFiscal: parsed.notaFiscal,
      cnpjFornecedor: parsed.cnpjFornecedor,
      serieNota: parsed.serieNota
    });

    const fiscalIdentifier = buildFiscalIdentifier({
      notaFiscal: parsed.notaFiscal,
      cnpjFornecedor: parsed.cnpjFornecedor,
      serieNota: parsed.serieNota
    });

    const noteId = await prisma.$transaction(async (tx) => {
      const note = await tx.rastreabilidadeRecebimentoNota.create({
        data: {
          data,
          fornecedor: parsed.fornecedor,
          notaFiscal: parsed.notaFiscal,
          chaveNfe: parsed.chaveNFe,
          cnpjFornecedor: parsed.cnpjFornecedor,
          serieNota: parsed.serieNota,
          identificadorFiscal: fiscalIdentifier,
          statusNota: StatusNotaRecebimento.IMPORTADA,
          origemXml: true,
          responsavelGeral: actor.nomeCompleto
        }
      });

      await tx.rastreabilidadeRecebimentoRegistro.createMany({
        data: parsed.items.map((item) => {
          const category = determineCategoryForProduct(item.produto, categories);
          return {
            notaId: note.id,
            data,
            produto: item.produto,
            codigoProdutoXml: item.codigoProdutoXml,
            ncm: item.ncm,
            cfop: item.cfop,
            quantidadeComprada: item.quantidadeComprada,
            unidadeMedidaCompra: item.unidadeMedidaCompra,
            valorUnitario: item.valorUnitario,
            valorTotalItem: item.valorTotalItem,
            quantidadeTributavel: item.quantidadeTributavel,
            unidadeMedidaTributavel: item.unidadeMedidaTributavel,
            valorUnitarioTributavel: item.valorUnitarioTributavel,
            fornecedor: parsed.fornecedor,
            notaFiscal: parsed.notaFiscal,
            lote: item.lote,
            dataFabricacao: item.dataFabricacao,
            dataValidade: item.dataValidade,
            categoriaId: category.id,
            statusGeral: StatusRecebimento.PENDENTE,
            origemXml: true
          };
        })
      });

      return note.id;
    });

    revalidateModulePaths();
    redirectToNoteWithFeedback(
      noteId,
      "success",
      `${parsed.items.length} Item(ns) Importado(s). Complete a conferência e finalize a nota.`
    );
  } catch (error) {
    rethrowIfRedirectError(error);
    if (isUniqueViolation(error)) {
      redirectWithFeedback(returnTo, "error", DUPLICATE_NFE_MESSAGE);
    }

    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

async function createManualNoteFromForm(formData: FormData): Promise<number> {
  const actor = await getCurrentUserForAction();
  ensureCanCreateManualReceiving(actor);

  const fornecedor = getInputValue(formData, "fornecedor");
  const notaFiscal = getInputValue(formData, "notaFiscal");

  if (!fornecedor || !notaFiscal) {
    throw new Error("Fornecedor e Nota Fiscal são obrigatórios.");
  }

  const data = getTodaySystemDate();
  const { mes, ano } = getMonthYear(data);
  if (await isMonthSigned(mes, ano)) {
    throw new Error(
      `O mês ${String(mes).padStart(2, "0")}/${ano} já está fechado e não aceita novos registros.`
    );
  }

  const categories = await getActiveCategories();
  const itemPayload = validateAndBuildItemPayload(
    {
      produto: getInputValue(formData, "produto"),
      lote: getInputValue(formData, "lote"),
      dataFabricacao: getInputValue(formData, "dataFabricacao"),
      semDataFabricacao: getBooleanInput(formData, "semDataFabricacao"),
      dataValidade: getInputValue(formData, "dataValidade"),
      validadeNaoAplicavel: getBooleanInput(formData, "validadeNaoAplicavel"),
      sif: getInputValue(formData, "sif"),
      temperatura: getInputValue(formData, "temperatura"),
      temperaturaTipo: parseTemperaturaRecebimentoTipo(
        getInputValue(formData, "temperaturaTipo")
      ),
      transporteEntregador: getInputValue(formData, "transporteEntregador"),
      aspectoSensorial: getInputValue(formData, "aspectoSensorial"),
      embalagem: getInputValue(formData, "embalagem"),
      acaoCorretiva: getInputValue(formData, "acaoCorretiva"),
      observacoes: getInputValue(formData, "observacoes")
    },
    categories,
    actor.nomeCompleto
  );

  const note = await prisma.rastreabilidadeRecebimentoNota.create({
    data: {
      data,
      fornecedor,
      notaFiscal,
      statusNota: StatusNotaRecebimento.EM_CONFERENCIA,
      origemXml: false,
      responsavelGeral: actor.nomeCompleto
    }
  });

  await prisma.rastreabilidadeRecebimentoRegistro.create({
    data: {
      ...itemPayload,
      notaId: note.id,
      data,
      fornecedor,
      notaFiscal,
      origemXml: false
    }
  });

  return note.id;
}

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
    const actor = await getCurrentUserForAction();
    ensurePermission(
      actor,
      "modulo.rastreabilidade.excluir_registro",
      "Seu perfil não pode excluir itens de recebimento."
    );

    const itemId = parsePositiveInt(getInputValue(formData, "itemId"));
    if (!itemId) {
      throw new Error("Item inválido para exclusão.");
    }

    const item = await prisma.rastreabilidadeRecebimentoRegistro.findUnique({
      where: { id: itemId }
    });

    if (!item || !item.notaId) {
      throw new Error("Item não encontrado.");
    }

    if (!canEditRecordDate(actor, "modulo.rastreabilidade", item.data, getTodaySystemDate())) {
      throw new Error(
        "Registros históricos não podem ser editados. Apenas registros do dia atual podem ser ajustados."
      );
    }

    const period = getMonthYear(item.data);
    if (await isMonthSigned(period.mes, period.ano)) {
      throw new Error("O mês deste item já foi fechado e não pode ser excluído.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.rastreabilidadeRecebimentoRegistro.delete({
        where: { id: item.id }
      });

      const remaining = await tx.rastreabilidadeRecebimentoRegistro.count({
        where: { notaId: item.notaId }
      });

      if (remaining === 0) {
        await tx.rastreabilidadeRecebimentoNota.delete({
          where: { id: item.notaId! }
        });
      }
    });

    revalidateModulePaths();
    redirectWithFeedback(returnTo, "success", "Item Excluído com Sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function deleteNoteAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(
      actor,
      "modulo.rastreabilidade.excluir_registro",
      "Seu perfil não pode excluir notas de recebimento."
    );

    const notaId = parsePositiveInt(getInputValue(formData, "notaId"));
    if (!notaId) {
      throw new Error("Nota inválida para exclusão.");
    }

    const note = await prisma.rastreabilidadeRecebimentoNota.findUnique({
      where: { id: notaId },
      include: { itens: true }
    });

    if (!note) {
      throw new Error("Nota não encontrada.");
    }

    const period = getMonthYear(note.data);
    const [legacyMonthSigned, monthlyClosure, dailySignature] = await Promise.all([
      isMonthSigned(period.mes, period.ano),
      prisma.fechamentoMensalModulo.findUnique({
        where: {
          moduloCodigo_ano_mes: {
            moduloCodigo: MODULE_CODE,
            ano: period.ano,
            mes: period.mes
          }
        }
      }),
      prisma.assinaturaDiariaModulo.findUnique({
        where: {
          moduloCodigo_dataReferencia: {
            moduloCodigo: MODULE_CODE,
            dataReferencia: note.data
          }
        }
      })
    ]);

    if (legacyMonthSigned || monthlyClosure) {
      throw new Error("Esta nota pertence a um período já fechado e não pode ser excluída.");
    }

    if (dailySignature) {
      throw new Error("Esta nota pertence a um dia já assinado e não pode ser excluída.");
    }

    if (!canDeleteImportedReceivingNote(note)) {
      throw new Error("Somente notas importadas e ainda não conferidas podem ser excluídas.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.rastreabilidadeRecebimentoRegistro.deleteMany({
        where: { notaId: note.id }
      });

      await tx.rastreabilidadeRecebimentoNota.delete({
        where: { id: note.id }
      });
    });

    revalidateModulePaths();
    redirectWithFeedback(returnTo, "success", "Nota excluída com sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function closeMonthAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanCloseMonth(actor);

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

    await prisma.rastreabilidadeRecebimentoFechamento.upsert({
      where: { mes_ano: { mes, ano } },
      create: {
        mes,
        ano,
        responsavelTecnico,
        dataAssinatura: getCurrentSystemDateTime(),
        status: StatusFechamentoRastreabilidadeRecebimento.ASSINADO
      },
      update: {
        responsavelTecnico,
        dataAssinatura: getCurrentSystemDateTime(),
        status: StatusFechamentoRastreabilidadeRecebimento.ASSINADO
      }
    });
    await createSignatureLog({
      user: actor,
      tipo: "FECHAMENTO_MENSAL",
      modulo: "rastreabilidade-recebimento",
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
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function reopenMonthAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanReopenMonth(actor);

    const mes = parsePositiveInt(getInputValue(formData, "mes"));
    const ano = parsePositiveInt(getInputValue(formData, "ano"));

    if (!mes || mes < 1 || mes > 12 || !ano) {
      throw new Error("Informe um mês e ano válidos para reabertura.");
    }

    const fechamento = await prisma.rastreabilidadeRecebimentoFechamento.findUnique({
      where: { mes_ano: { mes, ano } }
    });

    if (
      !fechamento ||
      fechamento.status !== StatusFechamentoRastreabilidadeRecebimento.ASSINADO
    ) {
      throw new Error(`O mês ${String(mes).padStart(2, "0")}/${ano} não está assinado.`);
    }

    await prisma.rastreabilidadeRecebimentoFechamento.update({
      where: { id: fechamento.id },
      data: {
        status: StatusFechamentoRastreabilidadeRecebimento.ABERTO
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


