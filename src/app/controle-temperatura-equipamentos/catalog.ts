import {
  CategoriaEquipamentoTemperatura,
  TipoOpcaoTemperaturaEquipamento
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

import {
  normalizeCatalogName,
  normalizeOption
} from "./options";

export function parseOptionType(
  value: string
): TipoOpcaoTemperaturaEquipamento | null {
  if (value === TipoOpcaoTemperaturaEquipamento.EQUIPAMENTO) {
    return TipoOpcaoTemperaturaEquipamento.EQUIPAMENTO;
  }

  if (value === TipoOpcaoTemperaturaEquipamento.ACAO_CORRETIVA) {
    return TipoOpcaoTemperaturaEquipamento.ACAO_CORRETIVA;
  }

  return null;
}

export function parseEquipmentCategory(
  value: string
): CategoriaEquipamentoTemperatura | null {
  if (value === CategoriaEquipamentoTemperatura.REFRIGERACAO) {
    return CategoriaEquipamentoTemperatura.REFRIGERACAO;
  }

  if (value === CategoriaEquipamentoTemperatura.CONGELAMENTO) {
    return CategoriaEquipamentoTemperatura.CONGELAMENTO;
  }

  if (value === CategoriaEquipamentoTemperatura.QUENTE) {
    return CategoriaEquipamentoTemperatura.QUENTE;
  }

  return null;
}

export async function getCatalogOptions(
  tipo: TipoOpcaoTemperaturaEquipamento,
  activeOnly = false
) {
  return prisma.controleTemperaturaEquipamentoOpcao.findMany({
    where: {
      tipo,
      ...(activeOnly ? { ativo: true } : {})
    },
    orderBy: [{ ativo: "desc" }, { nome: "asc" }]
  });
}

export async function getCategoryParameters(activeOnly = false) {
  return prisma.controleTemperaturaCategoriaParametro.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: { categoria: "asc" }
  });
}

export async function getCategoryParameterByCategory(
  categoria: CategoriaEquipamentoTemperatura,
  activeOnly = false
) {
  return prisma.controleTemperaturaCategoriaParametro.findFirst({
    where: {
      categoria,
      ...(activeOnly ? { isActive: true } : {})
    }
  });
}

export async function getCatalogOptionNames(
  tipo: TipoOpcaoTemperaturaEquipamento,
  activeOnly = false
): Promise<string[]> {
  const options = await getCatalogOptions(tipo, activeOnly);

  return options.map((option) => option.nome);
}

export async function findCatalogOptionByName(
  tipo: TipoOpcaoTemperaturaEquipamento,
  inputName: string,
  activeOnly = true
) {
  const normalizedInputName = normalizeOption(inputName);

  if (!normalizedInputName) {
    return null;
  }

  const options = await getCatalogOptions(tipo, activeOnly);

  return (
    options.find((option) => normalizeOption(option.nome) === normalizedInputName) ??
    null
  );
}

export async function hasCatalogOptionWithSameName(
  tipo: TipoOpcaoTemperaturaEquipamento,
  inputName: string,
  exceptId?: number
): Promise<boolean> {
  const normalizedInputName = normalizeOption(inputName);
  const options = await getCatalogOptions(tipo, false);

  return options.some((option) => {
    if (exceptId && option.id === exceptId) {
      return false;
    }

    return normalizeOption(option.nome) === normalizedInputName;
  });
}

export function sanitizeCatalogName(value: string): string {
  return normalizeCatalogName(value);
}
