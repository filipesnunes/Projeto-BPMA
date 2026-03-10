export const INITIAL_EQUIPAMENTO_OPTIONS = [
  {
    nome: "Câmara Fria de Resfriados",
    categoria: "REFRIGERACAO"
  },
  {
    nome: "Freezer de Congelados",
    categoria: "CONGELAMENTO"
  },
  {
    nome: "Balcão Térmico Quente",
    categoria: "QUENTE"
  }
] as const;

export const INITIAL_ACAO_CORRETIVA_OPTIONS = [
  "Aguardar estabilização da temperatura",
  "Ajustar termostato",
  "Transferir insumos para outro equipamento",
  "Acionar manutenção",
  "Verificar vedação da porta",
  "Reavaliar temperatura após 30 minutos",
  "Descartar alimento, se aplicável"
] as const;

export const INITIAL_CATEGORIA_PARAMETROS = [
  {
    categoria: "REFRIGERACAO",
    nome: "Refrigeração",
    temperaturaIdealMin: null,
    temperaturaIdealMax: 4,
    temperaturaAlertaMin: 5,
    temperaturaAlertaMax: 8,
    temperaturaCriticaMin: 8.1,
    temperaturaCriticaMax: null,
    acaoIdeal: "Manter monitoramento e registro da temperatura.",
    acaoAlerta:
      "Aguardar estabilização da temperatura, ajustar termostato e reavaliar após 30 minutos.",
    acaoCritica:
      "Transferir insumos para outro equipamento, acionar manutenção e avaliar descarte se aplicável.",
    orientacaoCorretivaPadrao:
      "Verificar vedação da porta, ajustar termostato e reavaliar a temperatura em 30 minutos."
  },
  {
    categoria: "CONGELAMENTO",
    nome: "Congelamento",
    temperaturaIdealMin: null,
    temperaturaIdealMax: -18,
    temperaturaAlertaMin: -17,
    temperaturaAlertaMax: -14,
    temperaturaCriticaMin: -12.9,
    temperaturaCriticaMax: null,
    acaoIdeal: "Manter monitoramento e registro da temperatura.",
    acaoAlerta:
      "Ajustar termostato, manter equipamento fechado e reavaliar a temperatura após 30 minutos.",
    acaoCritica:
      "Transferir insumos para outro equipamento, acionar manutenção e avaliar descarte se aplicável.",
    orientacaoCorretivaPadrao:
      "Ajustar termostato, transferir insumos para outro equipamento e acionar manutenção se necessário."
  },
  {
    categoria: "QUENTE",
    nome: "Quente",
    temperaturaIdealMin: 80.1,
    temperaturaIdealMax: null,
    temperaturaAlertaMin: null,
    temperaturaAlertaMax: 80,
    temperaturaCriticaMin: null,
    temperaturaCriticaMax: null,
    acaoIdeal: "Manter aquecimento e monitoramento contínuo.",
    acaoAlerta:
      "Reaquecer o alimento, ajustar o equipamento e reavaliar a temperatura após 30 minutos.",
    acaoCritica:
      "Descartar alimento, se aplicável, e acionar manutenção imediatamente.",
    orientacaoCorretivaPadrao:
      "Reaquecer o alimento, verificar o equipamento e manter monitoramento contínuo."
  }
] as const;

export const INITIAL_CATEGORIA_REGRAS = [
  {
    categoria: "REFRIGERACAO",
    regras: [
      {
        temperaturaMin: null,
        temperaturaMax: 4,
        status: "CONFORME",
        acaoCorretiva: "Nenhuma ação necessária.",
        ordem: 1
      },
      {
        temperaturaMin: 5,
        temperaturaMax: 8,
        status: "ALERTA",
        acaoCorretiva: "Ajustar termostato e reavaliar temperatura.",
        ordem: 2
      },
      {
        temperaturaMin: 8.1,
        temperaturaMax: null,
        status: "CRITICO",
        acaoCorretiva:
          "Transferir insumos para outro equipamento e acionar manutenção.",
        ordem: 3
      }
    ]
  },
  {
    categoria: "CONGELAMENTO",
    regras: [
      {
        temperaturaMin: null,
        temperaturaMax: -18,
        status: "CONFORME",
        acaoCorretiva: "Nenhuma ação necessária.",
        ordem: 1
      },
      {
        temperaturaMin: -17,
        temperaturaMax: -14,
        status: "ALERTA",
        acaoCorretiva: "Ajustar termostato e reavaliar temperatura.",
        ordem: 2
      },
      {
        temperaturaMin: -12.9,
        temperaturaMax: null,
        status: "CRITICO",
        acaoCorretiva:
          "Transferir insumos para outro equipamento e acionar manutenção.",
        ordem: 3
      }
    ]
  },
  {
    categoria: "QUENTE",
    regras: [
      {
        temperaturaMin: 80.1,
        temperaturaMax: null,
        status: "CONFORME",
        acaoCorretiva: "Nenhuma ação necessária.",
        ordem: 1
      },
      {
        temperaturaMin: 70,
        temperaturaMax: 79,
        status: "ALERTA",
        acaoCorretiva: "Ajustar equipamento e reavaliar temperatura.",
        ordem: 2
      },
      {
        temperaturaMin: null,
        temperaturaMax: 69.9,
        status: "CRITICO",
        acaoCorretiva: "Aquecer imediatamente ou descartar alimento.",
        ordem: 3
      }
    ]
  }
] as const;

export function normalizeOption(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function normalizeCatalogName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function resolveAllowedOption(
  inputValue: string,
  options: readonly string[]
): string | null {
  const normalizedInput = normalizeOption(inputValue);

  if (!normalizedInput) {
    return null;
  }

  return (
    options.find((option) => normalizeOption(option) === normalizedInput) ?? null
  );
}
