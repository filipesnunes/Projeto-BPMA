import {
  Prisma,
  StatusFechamentoPlanoLimpeza,
  StatusPlanoLimpeza,
  TipoPlanoLimpeza,
  TurnoPlanoLimpeza
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

import {
  formatDateInput,
  getWeekDateRangeForDate,
  getWeekStartDateForDate,
  getMonthYear,
  periodKey
} from "./utils";

function dailyKey(area: string, turno: TurnoPlanoLimpeza): string {
  return `${area}|${turno}`;
}

function weeklyAreaKey(area: string, weekStart: Date): string {
  return `${area}|${formatDateInput(weekStart)}`;
}

function weeklyItemKey(weekStart: Date, itemId: number): string {
  return `${formatDateInput(weekStart)}|${itemId}`;
}

function enumerateDateRange(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const cursor = new Date(start);

  while (cursor.getTime() <= end.getTime()) {
    dates.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function getTurnosFromConfig(config: {
  turnoManha: boolean;
  turnoTarde: boolean;
  turnoNoite: boolean;
}): TurnoPlanoLimpeza[] {
  const turnos: TurnoPlanoLimpeza[] = [];

  if (config.turnoManha) {
    turnos.push(TurnoPlanoLimpeza.MANHA);
  }
  if (config.turnoTarde) {
    turnos.push(TurnoPlanoLimpeza.TARDE);
  }
  if (config.turnoNoite) {
    turnos.push(TurnoPlanoLimpeza.NOITE);
  }

  return turnos;
}

export async function isDailyMonthSigned(date: Date): Promise<boolean> {
  const { mes, ano } = getMonthYear(date);
  const fechamento = await prisma.planoLimpezaFechamento.findUnique({
    where: { tipo_mes_ano: { tipo: TipoPlanoLimpeza.DIARIO, mes, ano } }
  });

  return fechamento?.status === StatusFechamentoPlanoLimpeza.ASSINADO;
}

export async function ensureDailyChecklistForDate(date: Date): Promise<{
  createdCount: number;
  removedCount: number;
}> {
  if (await isDailyMonthSigned(date)) {
    return { createdCount: 0, removedCount: 0 };
  }

  return prisma.$transaction(async (tx) => {
    const areaConfigs = await tx.planoLimpezaDiarioArea.findMany({
      where: { ativo: true },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }]
    });

    const existing = await tx.planoLimpezaDiarioRegistro.findMany({
      where: { data: date },
      select: { id: true, area: true, turno: true, status: true }
    });

    const validCombinationSet = new Set<string>();
    for (const areaConfig of areaConfigs) {
      const turnos = getTurnosFromConfig(areaConfig);

      for (const turno of turnos) {
        validCombinationSet.add(dailyKey(areaConfig.nome, turno));
      }
    }

    const pendingInvalidRecordIds = existing
      .filter(
        (item) =>
          item.status === StatusPlanoLimpeza.PENDENTE &&
          !validCombinationSet.has(dailyKey(item.area, item.turno))
      )
      .map((item) => item.id);

    if (pendingInvalidRecordIds.length > 0) {
      await tx.planoLimpezaDiarioRegistro.deleteMany({
        where: { id: { in: pendingInvalidRecordIds } }
      });
    }

    const preservedCombinationSet = new Set(
      existing
        .filter((item) => !pendingInvalidRecordIds.includes(item.id))
        .map((item) => dailyKey(item.area, item.turno))
    );

    const dataToCreate = Array.from(validCombinationSet)
      .filter((key) => !preservedCombinationSet.has(key))
      .map((key) => {
        const [area, turno] = key.split("|") as [string, TurnoPlanoLimpeza];

        return {
          data: date,
          turno,
          area,
          assinaturaResponsavel: "",
          assinaturaSupervisor: "",
          status: StatusPlanoLimpeza.PENDENTE
        };
      });

    if (dataToCreate.length > 0) {
      await tx.planoLimpezaDiarioRegistro.createMany({
        data: dataToCreate
      });
    }

    return {
      createdCount: dataToCreate.length,
      removedCount: pendingInvalidRecordIds.length
    };
  });
}

export async function ensureWeeklyChecklistForDateRange(params: {
  start: Date;
  end: Date;
}): Promise<{ createdCount: number; removedCount: number }> {
  if (params.start.getTime() > params.end.getTime()) {
    return { createdCount: 0, removedCount: 0 };
  }

  const dates = enumerateDateRange(params.start, params.end);
  if (dates.length === 0) {
    return { createdCount: 0, removedCount: 0 };
  }

  const weekStartMap = new Map<string, Date>();
  for (const date of dates) {
    const weekStart = getWeekStartDateForDate(date);
    weekStartMap.set(formatDateInput(weekStart), weekStart);
  }
  const weekStarts = Array.from(weekStartMap.values()).sort(
    (a, b) => a.getTime() - b.getTime()
  );
  if (weekStarts.length === 0) {
    return { createdCount: 0, removedCount: 0 };
  }

  const periods = new Map<string, { mes: number; ano: number }>();
  for (const weekStart of weekStarts) {
    const period = getMonthYear(weekStart);
    periods.set(periodKey(period.mes, period.ano), period);
  }

  const closedPeriods = periods.size
    ? await prisma.planoLimpezaFechamento.findMany({
        where: {
          tipo: TipoPlanoLimpeza.SEMANAL,
          status: StatusFechamentoPlanoLimpeza.ASSINADO,
          OR: Array.from(periods.values()).map((period) => ({
            mes: period.mes,
            ano: period.ano
          }))
        }
      })
    : [];
  const closedPeriodSet = new Set(
    closedPeriods.map((item) => periodKey(item.mes, item.ano))
  );

  const openWeekStarts = weekStarts.filter((weekStart) => {
    const period = getMonthYear(weekStart);
    return !closedPeriodSet.has(periodKey(period.mes, period.ano));
  });
  if (openWeekStarts.length === 0) {
    return { createdCount: 0, removedCount: 0 };
  }

  const openWeekKeySet = new Set(openWeekStarts.map((weekStart) => formatDateInput(weekStart)));
  const openWeekRangeMap = new Map(
    openWeekStarts.map((weekStart) => {
      const weekRange = getWeekDateRangeForDate(weekStart);
      return [formatDateInput(weekStart), weekRange] as const;
    })
  );
  const minStart = openWeekStarts[0];
  const maxEnd = openWeekStarts.reduce((acc, weekStart) => {
    const range = openWeekRangeMap.get(formatDateInput(weekStart));
    if (!range || range.end.getTime() <= acc.getTime()) {
      return acc;
    }

    return range.end;
  }, openWeekRangeMap.get(formatDateInput(openWeekStarts[0]))!.end);

  return prisma.$transaction(async (tx) => {
    const activeItems = await tx.planoLimpezaSemanalItem.findMany({
      where: { ativo: true },
      select: { id: true, area: true },
      orderBy: [{ area: "asc" }, { ordem: "asc" }, { oQueLimpar: "asc" }]
    });
    const activeItemById = new Map(activeItems.map((item) => [item.id, item]));
    const desiredCombinations = new Map<
      string,
      {
        weekStart: Date;
        itemId: number;
        area: string;
      }
    >();

    for (const weekStart of openWeekStarts) {
      for (const item of activeItems) {
        desiredCombinations.set(weeklyItemKey(weekStart, item.id), {
          weekStart,
          itemId: item.id,
          area: item.area
        });
      }
    }

    const existing = await tx.planoLimpezaSemanalExecucao.findMany({
      where: {
        dataExecucao: {
          gte: minStart,
          lte: maxEnd
        }
      },
      select: {
        id: true,
        itemId: true,
        dataExecucao: true,
        area: true,
        status: true,
        assinaturaResponsavel: true,
        assinaturaSupervisor: true
      }
    });

    type WeeklyRecord = (typeof existing)[number] & { weekStart: Date };
    const groupedByWeekItem = new Map<string, WeeklyRecord[]>();

    for (const record of existing) {
      const weekStart = getWeekStartDateForDate(record.dataExecucao);
      const weekKey = formatDateInput(weekStart);
      if (!openWeekKeySet.has(weekKey)) {
        continue;
      }

      const key = weeklyItemKey(weekStart, record.itemId);
      if (!groupedByWeekItem.has(key)) {
        groupedByWeekItem.set(key, []);
      }

      groupedByWeekItem.get(key)!.push({ ...record, weekStart });
    }

    const isPendingWithoutSignatures = (record: WeeklyRecord): boolean =>
      record.status === StatusPlanoLimpeza.PENDENTE &&
      record.assinaturaResponsavel.trim().length === 0 &&
      record.assinaturaSupervisor.trim().length === 0;

    let removedCount = 0;
    let createdCount = 0;

    for (const [key, records] of groupedByWeekItem.entries()) {
      if (desiredCombinations.has(key)) {
        continue;
      }

      const deletableIds = records
        .filter((record) => isPendingWithoutSignatures(record))
        .map((record) => record.id);
      if (deletableIds.length === 0) {
        continue;
      }

      await tx.planoLimpezaSemanalExecucao.deleteMany({
        where: { id: { in: deletableIds } }
      });
      removedCount += deletableIds.length;
      groupedByWeekItem.set(
        key,
        records.filter((record) => !deletableIds.includes(record.id))
      );
    }

    for (const desired of desiredCombinations.values()) {
      const key = weeklyItemKey(desired.weekStart, desired.itemId);
      const records = [...(groupedByWeekItem.get(key) ?? [])].sort((a, b) => a.id - b.id);

      if (records.length === 0) {
        await tx.planoLimpezaSemanalExecucao.create({
          data: {
            dataExecucao: desired.weekStart,
            area: desired.area,
            itemId: desired.itemId,
            assinaturaResponsavel: "",
            assinaturaSupervisor: "",
            status: StatusPlanoLimpeza.PENDENTE
          }
        });
        createdCount += 1;
        continue;
      }

      const keeper =
        records.find((record) => !isPendingWithoutSignatures(record)) ?? records[0];
      const duplicatesToDelete = records
        .filter((record) => record.id !== keeper.id && isPendingWithoutSignatures(record))
        .map((record) => record.id);
      if (duplicatesToDelete.length > 0) {
        await tx.planoLimpezaSemanalExecucao.deleteMany({
          where: { id: { in: duplicatesToDelete } }
        });
        removedCount += duplicatesToDelete.length;
      }

      if (isPendingWithoutSignatures(keeper)) {
        const updateData: Prisma.PlanoLimpezaSemanalExecucaoUncheckedUpdateInput = {};
        const expectedItem = activeItemById.get(desired.itemId);

        if (expectedItem && keeper.area !== expectedItem.area) {
          updateData.area = expectedItem.area;
        }
        if (keeper.weekStart.getTime() !== desired.weekStart.getTime()) {
          updateData.dataExecucao = desired.weekStart;
        }

        if (Object.keys(updateData).length > 0) {
          await tx.planoLimpezaSemanalExecucao.update({
            where: { id: keeper.id },
            data: updateData
          });
        }
      }
    }

    return {
      createdCount,
      removedCount
    };
  });
}

export function getDailySignStage(record: {
  status: StatusPlanoLimpeza;
  assinaturaResponsavel: string;
  assinaturaSupervisor: string;
}): "responsavel" | "supervisor" | null {
  const hasResponsavel = record.assinaturaResponsavel.trim().length > 0;
  const hasSupervisor = record.assinaturaSupervisor.trim().length > 0;

  if (
    record.status === StatusPlanoLimpeza.PENDENTE &&
    !hasResponsavel &&
    !hasSupervisor
  ) {
    return "responsavel";
  }

  if (
    record.status === StatusPlanoLimpeza.AGUARDANDO_SUPERVISOR &&
    hasResponsavel &&
    !hasSupervisor
  ) {
    return "supervisor";
  }

  return null;
}

export function getWeeklySignStage(record: {
  status: StatusPlanoLimpeza;
  assinaturaResponsavel: string;
  assinaturaSupervisor: string;
}): "responsavel" | "supervisor" | null {
  const hasResponsavel = record.assinaturaResponsavel.trim().length > 0;
  const hasSupervisor = record.assinaturaSupervisor.trim().length > 0;

  if (!hasResponsavel && !hasSupervisor) {
    return "responsavel";
  }

  if (hasResponsavel && !hasSupervisor) {
    return "supervisor";
  }

  return null;
}

export type WeeklyExecutionForSummary = {
  id: number;
  dataExecucao: Date;
  area: string;
  assinaturaResponsavel: string;
  assinaturaSupervisor: string;
  status: StatusPlanoLimpeza;
};

export type WeeklyExecutionSummary = {
  executionId: number;
  area: string;
  weekStart: Date;
  weekEnd: Date;
  assinaturaResponsavel: string;
  assinaturaSupervisor: string;
  status: StatusPlanoLimpeza;
  statusGeral: "Pendente" | "Parcial" | "Aguardando Supervisor" | "Concluído";
  totalRegistrosOriginais: number;
  recordIds: number[];
};

function consolidateWeeklyStatus(records: WeeklyExecutionForSummary[]): {
  assinaturaResponsavel: string;
  assinaturaSupervisor: string;
  status: StatusPlanoLimpeza;
  statusGeral: "Pendente" | "Parcial" | "Aguardando Supervisor" | "Concluído";
} {
  const responsaveis = Array.from(
    new Set(
      records
        .map((record) => record.assinaturaResponsavel.trim())
        .filter((value) => value.length > 0)
    )
  );
  const supervisores = Array.from(
    new Set(
      records
        .map((record) => record.assinaturaSupervisor.trim())
        .filter((value) => value.length > 0)
    )
  );

  const assinaturaResponsavel =
    responsaveis.length <= 1 ? (responsaveis[0] ?? "") : "Múltiplos";
  const assinaturaSupervisor =
    supervisores.length <= 1 ? (supervisores[0] ?? "") : "Múltiplos";

  const itemStatuses = records.map((record) => {
    const hasResponsavel = record.assinaturaResponsavel.trim().length > 0;
    const hasSupervisor = record.assinaturaSupervisor.trim().length > 0;

    if (hasResponsavel && hasSupervisor) {
      return StatusPlanoLimpeza.CONCLUIDO;
    }
    if (hasResponsavel) {
      return StatusPlanoLimpeza.AGUARDANDO_SUPERVISOR;
    }
    return record.status;
  });

  if (itemStatuses.every((status) => status === StatusPlanoLimpeza.CONCLUIDO)) {
    return {
      assinaturaResponsavel,
      assinaturaSupervisor,
      status: StatusPlanoLimpeza.CONCLUIDO,
      statusGeral: "Concluído"
    };
  }

  if (itemStatuses.every((status) => status === StatusPlanoLimpeza.PENDENTE)) {
    return {
      assinaturaResponsavel,
      assinaturaSupervisor,
      status: StatusPlanoLimpeza.PENDENTE,
      statusGeral: "Pendente"
    };
  }

  if (itemStatuses.every((status) => status !== StatusPlanoLimpeza.PENDENTE)) {
    return {
      assinaturaResponsavel,
      assinaturaSupervisor,
      status: StatusPlanoLimpeza.AGUARDANDO_SUPERVISOR,
      statusGeral: "Aguardando Supervisor"
    };
  }

  return {
    assinaturaResponsavel,
    assinaturaSupervisor,
    status: StatusPlanoLimpeza.PENDENTE,
    statusGeral: "Parcial"
  };
}

export function consolidateWeeklyExecutionsByAreaWeek(
  registros: WeeklyExecutionForSummary[]
): WeeklyExecutionSummary[] {
  const grouped = new Map<
    string,
    {
      area: string;
      weekStart: Date;
      weekEnd: Date;
      records: WeeklyExecutionForSummary[];
    }
  >();

  for (const registro of registros) {
    const weekRange = getWeekDateRangeForDate(registro.dataExecucao);
    const key = weeklyAreaKey(registro.area, weekRange.start);

    if (!grouped.has(key)) {
      grouped.set(key, {
        area: registro.area,
        weekStart: weekRange.start,
        weekEnd: weekRange.end,
        records: []
      });
    }

    grouped.get(key)!.records.push(registro);
  }

  const summaries: WeeklyExecutionSummary[] = [];
  for (const group of grouped.values()) {
    const records = [...group.records].sort((a, b) => a.id - b.id);
    const signableRecord =
      records.find((record) => getWeeklySignStage(record) !== null) ?? records[0];
    const consolidated = consolidateWeeklyStatus(records);

    summaries.push({
      executionId: signableRecord.id,
      area: group.area,
      weekStart: group.weekStart,
      weekEnd: group.weekEnd,
      assinaturaResponsavel: consolidated.assinaturaResponsavel,
      assinaturaSupervisor: consolidated.assinaturaSupervisor,
      status: consolidated.status,
      statusGeral: consolidated.statusGeral,
      totalRegistrosOriginais: records.length,
      recordIds: records.map((record) => record.id)
    });
  }

  return summaries.sort((a, b) => {
    const dateDiff = b.weekStart.getTime() - a.weekStart.getTime();
    if (dateDiff !== 0) {
      return dateDiff;
    }

    return a.area.localeCompare(b.area, "pt-BR");
  });
}

export function ensureDailyTurnoSelection(params: {
  turnoManha: boolean;
  turnoTarde: boolean;
  turnoNoite: boolean;
}) {
  if (!params.turnoManha && !params.turnoTarde && !params.turnoNoite) {
    throw new Error("Selecione pelo menos um turno para a área.");
  }
}

export function buildDailyTurnoFlags(formData: FormData): {
  turnoManha: boolean;
  turnoTarde: boolean;
  turnoNoite: boolean;
} {
  return {
    turnoManha: formData.get("turnoManha") === "on",
    turnoTarde: formData.get("turnoTarde") === "on",
    turnoNoite: formData.get("turnoNoite") === "on"
  };
}

export function getDailyStatusFromSignatures(
  assinaturaResponsavel: string,
  assinaturaSupervisor: string
): StatusPlanoLimpeza {
  const hasResponsavel = assinaturaResponsavel.trim().length > 0;
  const hasSupervisor = assinaturaSupervisor.trim().length > 0;

  if (!hasResponsavel && !hasSupervisor) {
    return StatusPlanoLimpeza.PENDENTE;
  }

  if (hasResponsavel && !hasSupervisor) {
    return StatusPlanoLimpeza.AGUARDANDO_SUPERVISOR;
  }

  if (hasResponsavel && hasSupervisor) {
    return StatusPlanoLimpeza.CONCLUIDO;
  }

  throw new Error(
    "A assinatura do supervisor só pode ser informada após a assinatura do responsável pela limpeza."
  );
}

export function getDailyConsolidatedStatus(summary: {
  concluido: number;
  aguardandoSupervisor: number;
  pendente: number;
}): string {
  if (summary.pendente === 0 && summary.aguardandoSupervisor === 0) {
    return "Concluído";
  }

  if (summary.concluido === 0 && summary.aguardandoSupervisor === 0) {
    return "Pendente";
  }

  if (summary.pendente === 0 && summary.aguardandoSupervisor > 0) {
    return "Aguardando Supervisor";
  }

  return "Parcial";
}

export function getDailyConsolidatedStatusClass(status: string): string {
  if (status === "Concluído") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
  }

  if (status === "Aguardando Supervisor" || status === "Parcial") {
    return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200";
  }

  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200";
}

export type DailyRecordForSummary = {
  id: number;
  data: Date;
  turno: TurnoPlanoLimpeza;
  area: string;
  assinaturaResponsavel: string;
  assinaturaSupervisor: string;
  status: StatusPlanoLimpeza;
};

export type DailyRecordSummary = {
  data: Date;
  totalRegistros: number;
  totalAreas: number;
  concluido: number;
  aguardandoSupervisor: number;
  pendente: number;
  situacaoGeral: string;
  detalhes: Array<{
    id: number;
    turno: TurnoPlanoLimpeza;
    area: string;
    assinaturaResponsavel: string;
    assinaturaSupervisor: string;
    status: StatusPlanoLimpeza;
  }>;
};

export function consolidateDailyRecordsByDay(
  registros: DailyRecordForSummary[],
  formatDateKey: (date: Date) => string
): DailyRecordSummary[] {
  const map = new Map<string, DailyRecordSummary>();

  for (const registro of registros) {
    const key = formatDateKey(registro.data);

    if (!map.has(key)) {
      map.set(key, {
        data: registro.data,
        totalRegistros: 0,
        totalAreas: 0,
        concluido: 0,
        aguardandoSupervisor: 0,
        pendente: 0,
        situacaoGeral: "Pendente",
        detalhes: []
      });
    }

    const entry = map.get(key)!;
    entry.totalRegistros += 1;
    entry.detalhes.push({
      id: registro.id,
      turno: registro.turno,
      area: registro.area,
      assinaturaResponsavel: registro.assinaturaResponsavel,
      assinaturaSupervisor: registro.assinaturaSupervisor,
      status: registro.status
    });

    if (registro.status === StatusPlanoLimpeza.CONCLUIDO) {
      entry.concluido += 1;
    } else if (registro.status === StatusPlanoLimpeza.AGUARDANDO_SUPERVISOR) {
      entry.aguardandoSupervisor += 1;
    } else {
      entry.pendente += 1;
    }
  }

  return Array.from(map.values())
    .map((entry) => {
      entry.totalAreas = new Set(entry.detalhes.map((item) => item.area)).size;
      entry.situacaoGeral = getDailyConsolidatedStatus(entry);
      entry.detalhes.sort((a, b) => {
        if (a.area !== b.area) {
          return a.area.localeCompare(b.area, "pt-BR");
        }

        return a.turno.localeCompare(b.turno);
      });
      return entry;
    })
    .sort((a, b) => b.data.getTime() - a.data.getTime());
}
