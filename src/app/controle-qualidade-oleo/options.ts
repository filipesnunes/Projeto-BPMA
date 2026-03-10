import { StatusQualidadeOleo } from "@prisma/client";

type OilStripRuleDefinition = {
  rotulo: string;
  descricao: string;
  statusAssociado: StatusQualidadeOleo;
  ordem: number;
  imagePath: string;
};

export const CANONICAL_OIL_STRIP_RULES: readonly OilStripRuleDefinition[] = [
  {
    rotulo: "Óleo Adequado",
    descricao: "Óleo adequado para uso.",
    statusAssociado: StatusQualidadeOleo.ADEQUADO,
    ordem: 1,
    imagePath: "/images/oleo-fitas/oil-strip-adequado.svg"
  },
  {
    rotulo: "2%",
    descricao: "Gordura começou a quebrar, mas ainda pode ser reutilizada.",
    statusAssociado: StatusQualidadeOleo.ADEQUADO,
    ordem: 2,
    imagePath: "/images/oleo-fitas/oil-strip-2.svg"
  },
  {
    rotulo: "3,5%",
    descricao:
      "Pode utilizar se o alimento não apresentar alteração no sabor, cor ou textura.",
    statusAssociado: StatusQualidadeOleo.ATENCAO,
    ordem: 3,
    imagePath: "/images/oleo-fitas/oil-strip-3-5.svg"
  },
  {
    rotulo: "5,5%",
    descricao:
      "Pode utilizar se o alimento não apresentar alterações, porém é última utilização.",
    statusAssociado: StatusQualidadeOleo.ULTIMA_UTILIZACAO,
    ordem: 4,
    imagePath: "/images/oleo-fitas/oil-strip-5-5.svg"
  },
  {
    rotulo: "7%",
    descricao: "Descartar a gordura.",
    statusAssociado: StatusQualidadeOleo.DESCARTAR,
    ordem: 5,
    imagePath: "/images/oleo-fitas/oil-strip-7.svg"
  }
];

export const INITIAL_OIL_STRIP_OPTIONS = CANONICAL_OIL_STRIP_RULES.map(
  (rule) => ({
    rotulo: rule.rotulo,
    descricao: rule.descricao,
    statusAssociado: rule.statusAssociado,
    ordem: rule.ordem
  })
);

export const OIL_OPERATION_GUIDELINES = [
  "O óleo utilizado para fritura deve ser límpido, não viscoso e sem resíduos queimados.",
  "Não deve ser aquecido por mais de 180°C.",
  "Após a primeira utilização, antes de reutilizar o óleo, deve-se monitorar a qualidade com o uso da fita.",
  "Antes da troca do óleo, fazer a higienização da fritadeira.",
  "O controle da temperatura deve ser realizado todos os dias que a fritadeira for utilizada.",
  "O controle da fita deve ser realizado de 3 em 3 dias."
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

export function findCanonicalOilStripRuleByLabel(
  label: string
): OilStripRuleDefinition | null {
  const normalizedLabel = normalizeOption(label);

  return (
    CANONICAL_OIL_STRIP_RULES.find(
      (rule) => normalizeOption(rule.rotulo) === normalizedLabel
    ) ?? null
  );
}

export function getOilStripImageByLabel(label: string): string {
  return (
    findCanonicalOilStripRuleByLabel(label)?.imagePath ??
    "/images/oleo-fitas/oil-strip-generic.svg"
  );
}
