import { TipoOpcaoHigienizacao } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import {
  normalizeCatalogName,
  normalizeOption
} from "./options";

export function parseOptionType(value: string): TipoOpcaoHigienizacao | null {
  if (value === TipoOpcaoHigienizacao.HORTIFRUTI) {
    return TipoOpcaoHigienizacao.HORTIFRUTI;
  }

  if (value === TipoOpcaoHigienizacao.PRODUTO_UTILIZADO) {
    return TipoOpcaoHigienizacao.PRODUTO_UTILIZADO;
  }

  return null;
}

export async function getCatalogOptionNames(
  tipo: TipoOpcaoHigienizacao
): Promise<string[]> {
  const options = await prisma.higienizacaoHortifrutiOpcao.findMany({
    where: { tipo },
    orderBy: { nome: "asc" },
    select: { nome: true }
  });

  return options.map((option) => option.nome);
}

export async function findCatalogOptionByName(
  tipo: TipoOpcaoHigienizacao,
  inputName: string
) {
  const normalizedInputName = normalizeOption(inputName);

  if (!normalizedInputName) {
    return null;
  }

  const options = await getCatalogOptionNames(tipo);

  return (
    options.find((option) => normalizeOption(option) === normalizedInputName) ??
    null
  );
}

export async function hasCatalogOptionWithSameName(
  tipo: TipoOpcaoHigienizacao,
  inputName: string
): Promise<boolean> {
  const normalizedInputName = normalizeOption(inputName);
  const options = await getCatalogOptionNames(tipo);

  return options.some((option) => normalizeOption(option) === normalizedInputName);
}

export function sanitizeCatalogName(value: string): string {
  return normalizeCatalogName(value);
}
