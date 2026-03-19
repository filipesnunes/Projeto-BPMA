import type { ClassificacaoItemBuffetAmostra } from "@prisma/client";

type InitialItemConfig = {
  nome: string;
  classificacao: ClassificacaoItemBuffetAmostra;
  servicos: string[];
  ordem: number;
};

export const INITIAL_BUFFET_SERVICOS = [
  { nome: "Café da manhã", ordem: 1 },
  { nome: "Almoço", ordem: 2 },
  { nome: "Café da tarde", ordem: 3 },
  { nome: "Jantar", ordem: 4 }
] as const;

export const INITIAL_BUFFET_ACOES_CORRETIVAS = [
  { nome: "Alimento exposto por menos de 1 hora no buffet", ordem: 1 },
  { nome: "Alimento exposto por menos de 2 horas no buffet", ordem: 2 },
  { nome: "Alimento descartado", ordem: 3 },
  { nome: "Não se aplica", ordem: 4 }
] as const;

export const INITIAL_BUFFET_ITENS: readonly InitialItemConfig[] = [
  {
    nome: "Ovos Mexidos",
    classificacao: "QUENTE",
    servicos: ["Café da manhã"],
    ordem: 1
  },
  {
    nome: "Arroz Branco",
    classificacao: "QUENTE",
    servicos: ["Almoço", "Jantar"],
    ordem: 2
  },
  {
    nome: "Feijão",
    classificacao: "QUENTE",
    servicos: ["Almoço", "Jantar"],
    ordem: 3
  },
  {
    nome: "Frango Grelhado",
    classificacao: "QUENTE",
    servicos: ["Almoço", "Jantar"],
    ordem: 4
  },
  {
    nome: "Salada Verde",
    classificacao: "FRIO",
    servicos: ["Almoço", "Jantar"],
    ordem: 5
  },
  {
    nome: "Tomate em Fatias",
    classificacao: "FRIO",
    servicos: ["Café da manhã", "Almoço", "Jantar"],
    ordem: 6
  },
  {
    nome: "Queijo Fatiado",
    classificacao: "FRIO",
    servicos: ["Café da manhã", "Café da tarde"],
    ordem: 7
  },
  {
    nome: "Salmão Cru Temperado",
    classificacao: "FRIO_CRU",
    servicos: ["Jantar"],
    ordem: 8
  }
] as const;

export function normalizeCatalogName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeOption(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}
