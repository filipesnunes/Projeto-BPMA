import {
  StatusItemBuffetAmostra,
  type ClassificacaoItemBuffetAmostra,
  type StatusTemperaturaBuffetAmostra,
  type TipoServicoBuffetAmostra
} from "@prisma/client";

import {
  calcularStatusServico,
  formatDateDisplay,
  formatDateInput,
  formatDateTimeDisplay,
  formatTemperatureDisplay,
  getClassificacaoLabel,
  getTipoServicoLabel,
  normalizeSearchText,
  THERMAL_BOTTLE_EQUIPMENT_LABEL,
  type StatusServicoBuffet
} from "./utils";

export type BuffetServiceRecord = {
  id: number;
  data: Date;
  servicoId: number;
  itemNome: string;
  itemExtra: boolean;
  classificacao: ClassificacaoItemBuffetAmostra;
  tcEquipamento: number | null;
  primeiraTc: number | null;
  segundaTc: number | null;
  usaGarrafaTermica: boolean;
  temperaturaAmbiente: boolean;
  statusTemperatura: StatusTemperaturaBuffetAmostra | null;
  acaoCorretiva: string | null;
  observacao: string | null;
  responsavelNome: string;
  dataHoraRegistro: Date;
  assinaturaNome: string | null;
  assinaturaDataHora: Date | null;
  assinaturaNutricionistaNome: string | null;
  assinaturaNutricionistaDataHora: Date | null;
  status: StatusItemBuffetAmostra;
  servico: {
    nome: string;
    tipoServico: TipoServicoBuffetAmostra;
    dataInicio: Date | null;
    dataFim: Date | null;
  };
};

export type BuffetServiceHistoryItem = {
  id: number;
  nome: string;
  itemExtra: boolean;
  classificacaoLabel: string;
  tcEquipamentoLabel: string;
  temperaturaInicialLabel: string;
  temperaturaFinalLabel: string | null;
  statusTemperatura: StatusTemperaturaBuffetAmostra | null;
  acaoCorretiva: string;
  observacao: string;
  status: StatusItemBuffetAmostra;
  statusOperacionalLabel: "Preenchido" | "Não servido" | "Incompleto";
  responsavelExecucao: string;
  dataHoraRegistroLabel: string;
  responsavelVerificacao: string;
  assinaturaResumo: string;
  assinaturaNutricionistaResumo: string;
};

export type BuffetServiceHistoryGroup = {
  key: string;
  servicoId: number;
  dataInput: string;
  servicoNome: string;
  dataLabel: string;
  tipoServicoLabel: string;
  responsavelExecucao: string;
  assinaturaResumo: string;
  assinaturaNutricionistaResumo: string;
  assinadoNutricionista: boolean;
  status: StatusServicoBuffet;
  totalItens: number;
  itensPreenchidos: number;
  itensNaoServidos: number;
  itensComAcaoCorretiva: number;
  items: BuffetServiceHistoryItem[];
  workflowId?: string;
  workflowState?: string;
  itensPendentes?: number;
};

export type BuffetServiceHistoryTotals = {
  totalServicos: number;
  totalItensRegistrados: number;
  totalItensPreenchidos: number;
  totalItensNaoServidos: number;
  totalAcoesCorretivas: number;
  totalServicosPendentes: number;
};

function displayValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "-";
}

function hasMeaningfulCorrectiveAction(value: string | null): boolean {
  const normalized = normalizeSearchText(value);
  return Boolean(normalized) && normalized !== "-" && normalized !== "nao se aplica";
}

function formatSignature(nome: string | null, dataHora: Date | null): string {
  const nomeAssinatura = displayValue(nome);
  if (nomeAssinatura === "-") {
    return "-";
  }

  return dataHora ? `${nomeAssinatura} em ${formatDateTimeDisplay(dataHora)}` : nomeAssinatura;
}

function summarizeValues(values: string[], multipleLabel: string): string {
  const uniqueValues = Array.from(new Set(values.filter((value) => value && value !== "-")));

  if (uniqueValues.length === 0) {
    return "-";
  }

  if (uniqueValues.length === 1) {
    return uniqueValues[0];
  }

  return `${multipleLabel} (${uniqueValues.length})`;
}

function getOperationalItemStatus(
  status: StatusItemBuffetAmostra
): BuffetServiceHistoryItem["statusOperacionalLabel"] {
  if (status === StatusItemBuffetAmostra.NAO_SERVIDO) {
    return "Não servido";
  }

  if (status === StatusItemBuffetAmostra.PENDENTE) {
    return "Incompleto";
  }

  return "Preenchido";
}

export function buildBuffetServiceHistoryGroups(
  records: BuffetServiceRecord[],
  expectedItemCountsByServiceId = new Map<number, number>()
): BuffetServiceHistoryGroup[] {
  const groupsByKey = new Map<string, BuffetServiceHistoryGroup>();

  for (const record of records) {
    const key = `${formatDateInput(record.data)}:${record.servicoId}`;
    let group = groupsByKey.get(key);

    if (!group) {
      group = {
        key,
        servicoId: record.servicoId,
        dataInput: formatDateInput(record.data),
        servicoNome: record.servico.nome,
        dataLabel: formatDateDisplay(record.data),
        tipoServicoLabel: getTipoServicoLabel(record.servico.tipoServico),
        responsavelExecucao: "-",
        assinaturaResumo: "-",
        assinaturaNutricionistaResumo: "-",
        assinadoNutricionista: false,
        status: "PENDENTE",
        totalItens: 0,
        itensPreenchidos: 0,
        itensNaoServidos: 0,
        itensComAcaoCorretiva: 0,
        items: []
      };
      groupsByKey.set(key, group);
    }

    group.items.push({
      id: record.id,
      nome: record.itemNome,
      itemExtra: record.itemExtra,
      classificacaoLabel: getClassificacaoLabel(record.classificacao),
      tcEquipamentoLabel: record.usaGarrafaTermica
        ? THERMAL_BOTTLE_EQUIPMENT_LABEL
        : record.temperaturaAmbiente
          ? "Ambiente"
          : formatTemperatureDisplay(record.tcEquipamento),
      temperaturaInicialLabel: record.temperaturaAmbiente
        ? "Ambiente"
        : formatTemperatureDisplay(record.primeiraTc),
      temperaturaFinalLabel:
        record.segundaTc !== null ? formatTemperatureDisplay(record.segundaTc) : null,
      statusTemperatura: record.statusTemperatura,
      acaoCorretiva: displayValue(record.acaoCorretiva),
      observacao: displayValue(record.observacao),
      status: record.status,
      statusOperacionalLabel: getOperationalItemStatus(record.status),
      responsavelExecucao: displayValue(record.responsavelNome),
      dataHoraRegistroLabel: formatDateTimeDisplay(record.dataHoraRegistro),
      responsavelVerificacao: displayValue(record.assinaturaNome),
      assinaturaResumo: formatSignature(record.assinaturaNome, record.assinaturaDataHora),
      assinaturaNutricionistaResumo: formatSignature(
        record.assinaturaNutricionistaNome,
        record.assinaturaNutricionistaDataHora
      )
    });
  }

  const groups = Array.from(groupsByKey.values());
  for (const group of groups) {
    const items = group.items;
    const fixedItemsCount = items.filter((item) => !item.itemExtra).length;
    const extraItemsCount = items.filter((item) => item.itemExtra).length;
    const expectedFixedItemsCount = Math.max(
      expectedItemCountsByServiceId.get(group.servicoId) ?? fixedItemsCount,
      fixedItemsCount
    );
    const itensAssinados = items.filter(
      (item) => item.status === StatusItemBuffetAmostra.ASSINADO
    ).length;
    const itensIniciados = items.filter(
      (item) => item.status !== StatusItemBuffetAmostra.PENDENTE
    ).length;

    group.totalItens = expectedFixedItemsCount + extraItemsCount;
    group.itensPreenchidos = items.filter(
      (item) =>
        item.status === StatusItemBuffetAmostra.PREENCHIDO ||
        item.status === StatusItemBuffetAmostra.ASSINADO
    ).length;
    group.itensNaoServidos = items.filter(
      (item) => item.status === StatusItemBuffetAmostra.NAO_SERVIDO
    ).length;
    group.itensComAcaoCorretiva = items.filter((item) =>
      hasMeaningfulCorrectiveAction(item.acaoCorretiva)
    ).length;
    group.responsavelExecucao = summarizeValues(
      items.map((item) => item.responsavelExecucao),
      "Vários responsáveis"
    );
    group.assinaturaResumo = summarizeValues(
      items.map((item) => item.assinaturaResumo),
      "Múltiplas assinaturas"
    );
    group.assinaturaNutricionistaResumo = summarizeValues(
      items.map((item) => item.assinaturaNutricionistaResumo),
      "Múltiplas assinaturas do supervisor"
    );
    group.assinadoNutricionista =
      items.length > 0 &&
      items.every((item) => item.assinaturaNutricionistaResumo !== "-");
    group.status = calcularStatusServico({
      totalItens: group.totalItens,
      itensAssinados,
      itensNaoServidos: group.itensNaoServidos,
      itensIniciados
    });
    group.itensPendentes = Math.max(group.totalItens-group.itensPreenchidos-group.itensNaoServidos,0);
  }

  return groups;
}

export function buildBuffetServiceHistoryTotals(
  groups: BuffetServiceHistoryGroup[]
): BuffetServiceHistoryTotals {
  return {
    totalServicos: groups.length,
    totalItensRegistrados: groups.reduce((total, group) => total + group.totalItens, 0),
    totalItensPreenchidos: groups.reduce(
      (total, group) => total + group.itensPreenchidos,
      0
    ),
    totalItensNaoServidos: groups.reduce(
      (total, group) => total + group.itensNaoServidos,
      0
    ),
    totalAcoesCorretivas: groups.reduce(
      (total, group) => total + group.itensComAcaoCorretiva,
      0
    ),
    totalServicosPendentes: groups.filter((group) => group.status !== "CONCLUIDO").length
  };
}
