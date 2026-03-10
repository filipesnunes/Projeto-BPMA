import { prisma } from "@/lib/prisma";

import {
  INITIAL_RECEBIMENTO_CATEGORIAS,
  normalizeCatalogName,
  normalizeOption
} from "./options";

export async function ensureInitialReceivingCategories() {
  await prisma.rastreabilidadeRecebimentoCategoria.createMany({
    data: INITIAL_RECEBIMENTO_CATEGORIAS.map((categoria) => ({
      nome: categoria.nome,
      temperaturaMaxima: categoria.temperaturaMaxima,
      ativo: true
    })),
    skipDuplicates: true
  });
}

export async function getReceivingCategories(activeOnly = false) {
  return prisma.rastreabilidadeRecebimentoCategoria.findMany({
    where: activeOnly ? { ativo: true } : undefined,
    orderBy: [{ ativo: "desc" }, { nome: "asc" }]
  });
}

export async function hasCategoryWithSameName(
  inputName: string,
  exceptId?: number
): Promise<boolean> {
  const normalizedInputName = normalizeOption(inputName);
  const categories = await getReceivingCategories(false);

  return categories.some((category) => {
    if (exceptId && category.id === exceptId) {
      return false;
    }

    return normalizeOption(category.nome) === normalizedInputName;
  });
}

export function sanitizeCategoryName(value: string): string {
  return normalizeCatalogName(value);
}
