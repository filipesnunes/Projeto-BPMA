import {
  CategoriaEquipamentoTemperatura,
  TipoOpcaoTemperaturaEquipamento
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

import {
  INITIAL_ACAO_CORRETIVA_OPTIONS,
  INITIAL_CATEGORIA_PARAMETROS,
  INITIAL_CATEGORIA_REGRAS,
  INITIAL_EQUIPAMENTO_OPTIONS,
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

export async function ensureInitialCatalogOptions() {
  await ensureInitialCategoryParameters();
  await Promise.all([ensureInitialOptionCatalog(), ensureInitialCategoryRules()]);
}

async function ensureInitialOptionCatalog() {
  await prisma.controleTemperaturaEquipamentoOpcao.createMany({
    data: [
      ...INITIAL_EQUIPAMENTO_OPTIONS.map((option) => ({
        tipo: TipoOpcaoTemperaturaEquipamento.EQUIPAMENTO,
        nome: option.nome,
        categoriaEquipamento: option.categoria,
        ativo: true
      })),
      ...INITIAL_ACAO_CORRETIVA_OPTIONS.map((nome) => ({
        tipo: TipoOpcaoTemperaturaEquipamento.ACAO_CORRETIVA,
        nome,
        ativo: true
      }))
    ],
    skipDuplicates: true
  });
}

export async function ensureInitialCategoryParameters() {
  await prisma.controleTemperaturaCategoriaParametro.createMany({
    data: INITIAL_CATEGORIA_PARAMETROS.map((parametro) => ({
      categoria: parametro.categoria,
      nome: parametro.nome,
      temperaturaIdealMin: parametro.temperaturaIdealMin,
      temperaturaIdealMax: parametro.temperaturaIdealMax,
      temperaturaAlertaMin: parametro.temperaturaAlertaMin,
      temperaturaAlertaMax: parametro.temperaturaAlertaMax,
      temperaturaCriticaMin: parametro.temperaturaCriticaMin,
      temperaturaCriticaMax: parametro.temperaturaCriticaMax,
      acaoIdeal: parametro.acaoIdeal,
      acaoAlerta: parametro.acaoAlerta,
      acaoCritica: parametro.acaoCritica,
      orientacaoCorretivaPadrao: parametro.orientacaoCorretivaPadrao,
      isActive: true
    })),
    skipDuplicates: true
  });

  for (const parametro of INITIAL_CATEGORIA_PARAMETROS) {
    const existing = await prisma.controleTemperaturaCategoriaParametro.findUnique({
      where: { categoria: parametro.categoria }
    });

    if (!existing) {
      continue;
    }

    const nextData: Partial<{
      acaoIdeal: string;
      acaoAlerta: string;
      acaoCritica: string;
      orientacaoCorretivaPadrao: string;
    }> = {};

    if (!existing.acaoIdeal.trim()) {
      nextData.acaoIdeal = parametro.acaoIdeal;
    }

    if (!existing.acaoAlerta.trim()) {
      nextData.acaoAlerta = parametro.acaoAlerta;
    }

    if (!existing.acaoCritica.trim()) {
      nextData.acaoCritica = parametro.acaoCritica;
    }

    if (!existing.orientacaoCorretivaPadrao.trim()) {
      nextData.orientacaoCorretivaPadrao = parametro.orientacaoCorretivaPadrao;
    }

    if (Object.keys(nextData).length > 0) {
      await prisma.controleTemperaturaCategoriaParametro.update({
        where: { id: existing.id },
        data: nextData
      });
    }
  }
}

async function ensureInitialCategoryRules() {
  const categorias = await prisma.controleTemperaturaCategoriaParametro.findMany({
    select: { id: true, categoria: true }
  });

  const categoriaMap = new Map(
    categorias.map((categoria) => [categoria.categoria, categoria.id])
  );

  for (const regraConfig of INITIAL_CATEGORIA_REGRAS) {
    const categoriaId = categoriaMap.get(regraConfig.categoria);
    if (!categoriaId) {
      continue;
    }

    const hasAnyRule = await prisma.controleTemperaturaCategoriaRegra.count({
      where: { categoriaId }
    });

    if (hasAnyRule > 0) {
      continue;
    }

    await prisma.controleTemperaturaCategoriaRegra.createMany({
      data: regraConfig.regras.map((regra) => ({
        categoriaId,
        temperaturaMin: regra.temperaturaMin,
        temperaturaMax: regra.temperaturaMax,
        status: regra.status,
        acaoCorretiva: regra.acaoCorretiva,
        ordem: regra.ordem,
        isActive: true
      }))
    });
  }
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
