import "server-only";
import {ConformidadeRecebimento,StatusRecebimento,TipoTemperaturaRecebimento} from "@prisma/client";
import {calculateOverallStatus,calculateTemperatureStatus,isActionCorrectiveRequired,parseConformidade,parseDateInput,parseTemperatureInput,type Conformidade} from "./utils";
import {normalizeSifValue,SIF_BACKEND_REQUIRED_MESSAGE} from "./sif";
export type CategoryItem = {
  id: number;
  nome: string;
  temperaturaMaxima: number;
  ativo: boolean;
};

export type ItemInputValues = {
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

export type ValidatedItemPayload = {
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

export class FieldValidationError extends Error {
  invalidField: string;

  constructor(message: string, invalidField: string) {
    super(message);
    this.name = "FieldValidationError";
    this.invalidField = invalidField;
  }
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

export function determineCategoryForProduct(
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

export function parseTemperaturaRecebimentoTipo(value: string): TipoTemperaturaRecebimento {
  if (value === TipoTemperaturaRecebimento.AMBIENTE) {
    return TipoTemperaturaRecebimento.AMBIENTE;
  }

  if (value === TipoTemperaturaRecebimento.NAO_APLICAVEL) {
    return TipoTemperaturaRecebimento.NAO_APLICAVEL;
  }

  return TipoTemperaturaRecebimento.NUMERICA;
}

export function validateAndBuildItemPayload(
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

