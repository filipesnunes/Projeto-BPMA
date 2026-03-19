import { ClassificacaoItemBuffetAmostra } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { normalizeCatalogName, normalizeOption } from "./options";

export function parseItemClassification(
  value: string
): ClassificacaoItemBuffetAmostra | null {
  if (value === ClassificacaoItemBuffetAmostra.QUENTE) {
    return ClassificacaoItemBuffetAmostra.QUENTE;
  }

  if (value === ClassificacaoItemBuffetAmostra.FRIO) {
    return ClassificacaoItemBuffetAmostra.FRIO;
  }

  if (value === ClassificacaoItemBuffetAmostra.FRIO_CRU) {
    return ClassificacaoItemBuffetAmostra.FRIO_CRU;
  }

  return null;
}

export async function getServicos(activeOnly = false) {
  return prisma.controleBuffetAmostraServico.findMany({
    where: activeOnly ? { ativo: true } : undefined,
    orderBy: [{ ativo: "desc" }, { ordem: "asc" }, { nome: "asc" }]
  });
}

export async function getItens(activeOnly = false) {
  return prisma.controleBuffetAmostraItem.findMany({
    where: activeOnly ? { ativo: true } : undefined,
    include: {
      servicos: {
        include: {
          servico: true
        },
        orderBy: {
          servico: { ordem: "asc" }
        }
      }
    },
    orderBy: [{ ativo: "desc" }, { ordem: "asc" }, { nome: "asc" }]
  });
}

export async function getItensPorServico(servicoId: number, activeOnly = true) {
  return prisma.controleBuffetAmostraItemServico.findMany({
    where: {
      servicoId,
      ...(activeOnly ? { item: { ativo: true }, servico: { ativo: true } } : {})
    },
    include: {
      item: true
    },
    orderBy: [{ item: { ordem: "asc" } }, { item: { nome: "asc" } }]
  });
}

export async function getAcoesCorretivas(activeOnly = false) {
  return prisma.controleBuffetAmostraAcaoCorretiva.findMany({
    where: activeOnly ? { ativo: true } : undefined,
    orderBy: [{ ativo: "desc" }, { ordem: "asc" }, { nome: "asc" }]
  });
}

export async function findAcaoCorretivaByName(
  inputName: string,
  activeOnly = true
) {
  const normalizedInputName = normalizeOption(inputName);
  if (!normalizedInputName) {
    return null;
  }

  const options = await getAcoesCorretivas(activeOnly);

  return (
    options.find((option) => normalizeOption(option.nome) === normalizedInputName) ??
    null
  );
}

export async function hasServicoWithSameName(
  inputName: string,
  exceptId?: number
): Promise<boolean> {
  const normalizedInputName = normalizeOption(inputName);
  const servicos = await getServicos(false);

  return servicos.some((servico) => {
    if (exceptId && servico.id === exceptId) {
      return false;
    }

    return normalizeOption(servico.nome) === normalizedInputName;
  });
}

export async function hasItemWithSameName(
  inputName: string,
  exceptId?: number
): Promise<boolean> {
  const normalizedInputName = normalizeOption(inputName);
  const itens = await prisma.controleBuffetAmostraItem.findMany();

  return itens.some((item) => {
    if (exceptId && item.id === exceptId) {
      return false;
    }

    return normalizeOption(item.nome) === normalizedInputName;
  });
}

export async function hasAcaoCorretivaWithSameName(
  inputName: string,
  exceptId?: number
): Promise<boolean> {
  const normalizedInputName = normalizeOption(inputName);
  const options = await getAcoesCorretivas(false);

  return options.some((option) => {
    if (exceptId && option.id === exceptId) {
      return false;
    }

    return normalizeOption(option.nome) === normalizedInputName;
  });
}

export function sanitizeCatalogValue(value: string): string {
  return normalizeCatalogName(value);
}
