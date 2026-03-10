import { StatusQualidadeOleo } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import {
  INITIAL_OIL_STRIP_OPTIONS,
  normalizeCatalogName,
  normalizeOption
} from "./options";

export function parseOilStatus(value: string): StatusQualidadeOleo | null {
  if (value === StatusQualidadeOleo.ADEQUADO) {
    return StatusQualidadeOleo.ADEQUADO;
  }

  if (value === StatusQualidadeOleo.ATENCAO) {
    return StatusQualidadeOleo.ATENCAO;
  }

  if (value === StatusQualidadeOleo.ULTIMA_UTILIZACAO) {
    return StatusQualidadeOleo.ULTIMA_UTILIZACAO;
  }

  if (value === StatusQualidadeOleo.DESCARTAR) {
    return StatusQualidadeOleo.DESCARTAR;
  }

  return null;
}

export async function ensureInitialOilOptions() {
  await prisma.controleQualidadeOleoOpcaoFita.createMany({
    data: INITIAL_OIL_STRIP_OPTIONS.map((option) => ({
      rotulo: option.rotulo,
      descricao: option.descricao,
      statusAssociado: option.statusAssociado,
      ordem: option.ordem,
      ativo: true
    })),
    skipDuplicates: true
  });
}

export async function getOilStripOptions(activeOnly = false) {
  return prisma.controleQualidadeOleoOpcaoFita.findMany({
    where: activeOnly ? { ativo: true } : undefined,
    orderBy: [{ ativo: "desc" }, { ordem: "asc" }, { rotulo: "asc" }]
  });
}

export async function findOilOptionByLabel(
  inputLabel: string,
  activeOnly = true
) {
  const normalizedInputLabel = normalizeOption(inputLabel);

  if (!normalizedInputLabel) {
    return null;
  }

  const options = await getOilStripOptions(activeOnly);

  return (
    options.find((option) => normalizeOption(option.rotulo) === normalizedInputLabel) ??
    null
  );
}

export async function hasOilOptionWithSameLabel(
  inputLabel: string,
  exceptId?: number
): Promise<boolean> {
  const normalizedInputLabel = normalizeOption(inputLabel);
  const options = await getOilStripOptions(false);

  return options.some((option) => {
    if (exceptId && option.id === exceptId) {
      return false;
    }

    return normalizeOption(option.rotulo) === normalizedInputLabel;
  });
}

export function sanitizeLabel(value: string): string {
  return normalizeCatalogName(value);
}

export function sanitizeDescription(value: string): string {
  return normalizeCatalogName(value);
}