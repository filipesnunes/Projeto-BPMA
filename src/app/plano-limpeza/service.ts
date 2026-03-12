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
  getMonthYear,
  getWeeklyDayValueFromDate,
  getWeeklyDayValuesFromInput,
  periodKey
} from "./utils";

function dailyKey(area: string, turno: TurnoPlanoLimpeza): string {
  return `${area}|${turno}`;
}

function weeklyKey(itemId: number, date: Date): string {
  return `${itemId}|${formatDateInput(date)}`;
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

  const periods = new Map<string, { mes: number; ano: number }>();
  for (const date of dates) {
    const period = getMonthYear(date);
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
  const openDates = dates.filter((date) => {
    const period = getMonthYear(date);
    return !closedPeriodSet.has(periodKey(period.mes, period.ano));
  });
  if (openDates.length === 0) {
    return { createdCount: 0, removedCount: 0 };
  }

  const openDateSet = new Set(openDates.map((date) => formatDateInput(date)));

  return prisma.$transaction(async (tx) => {
    const activeItems = await tx.planoLimpezaSemanalItem.findMany({
      where: { ativo: true },
      orderBy: [{ area: "asc" }, { ordem: "asc" }, { oQueLimpar: "asc" }]
    });

    const itemWeekDays = new Map<number, Set<string>>();
    const itemAreaMap = new Map<number, string>();
    for (const item of activeItems) {
      itemWeekDays.set(item.id, new Set(getWeeklyDayValuesFromInput(item.quando)));
      itemAreaMap.set(item.id, item.area);
    }

    const existing = await tx.planoLimpezaSemanalExecucao.findMany({
      where: {
        dataExecucao: {
          gte: params.start,
          lte: params.end
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

    const validCombinationSet = new Set<string>();
    for (const date of openDates) {
      const weekDay = getWeeklyDayValueFromDate(date);
      for (const item of activeItems) {
        const activeDays = itemWeekDays.get(item.id);
        if (!activeDays?.has(weekDay)) {
          continue;
        }

        validCombinationSet.add(weeklyKey(item.id, date));
      }
    }

    const pendingInvalidRecordIds = existing
      .filter((record) => {
        const dateKey = formatDateInput(record.dataExecucao);
        if (!openDateSet.has(dateKey)) {
          return false;
        }

        const hasResponsavel = record.assinaturaResponsavel.trim().length > 0;
        const hasSupervisor = record.assinaturaSupervisor.trim().length > 0;

        return (
          record.status === StatusPlanoLimpeza.PENDENTE &&
          !hasResponsavel &&
          !hasSupervisor &&
          !validCombinationSet.has(weeklyKey(record.itemId, record.dataExecucao))
        );
      })
      .map((record) => record.id);

    if (pendingInvalidRecordIds.length > 0) {
      await tx.planoLimpezaSemanalExecucao.deleteMany({
        where: { id: { in: pendingInvalidRecordIds } }
      });
    }

    const pendingAreaMismatchRecords = existing.filter((record) => {
      if (pendingInvalidRecordIds.includes(record.id)) {
        return false;
      }

      const expectedArea = itemAreaMap.get(record.itemId);
      if (!expectedArea || expectedArea === record.area) {
        return false;
      }

      const hasResponsavel = record.assinaturaResponsavel.trim().length > 0;
      const hasSupervisor = record.assinaturaSupervisor.trim().length > 0;

      return (
        record.status === StatusPlanoLimpeza.PENDENTE &&
        !hasResponsavel &&
        !hasSupervisor
      );
    });

    for (const record of pendingAreaMismatchRecords) {
      const expectedArea = itemAreaMap.get(record.itemId);
      if (!expectedArea) {
        continue;
      }

      await tx.planoLimpezaSemanalExecucao.update({
        where: { id: record.id },
        data: { area: expectedArea }
      });
    }

    const preservedCombinationSet = new Set(
      existing
        .filter((record) => !pendingInvalidRecordIds.includes(record.id))
        .map((record) => weeklyKey(record.itemId, record.dataExecucao))
    );

    const dataToCreate: Prisma.PlanoLimpezaSemanalExecucaoCreateManyInput[] = [];
    for (const date of openDates) {
      const weekDay = getWeeklyDayValueFromDate(date);
      for (const item of activeItems) {
        const activeDays = itemWeekDays.get(item.id);
        if (!activeDays?.has(weekDay)) {
          continue;
        }

        const key = weeklyKey(item.id, date);
        if (preservedCombinationSet.has(key)) {
          continue;
        }

        preservedCombinationSet.add(key);
        dataToCreate.push({
          dataExecucao: date,
          area: item.area,
          itemId: item.id,
          assinaturaResponsavel: "",
          assinaturaSupervisor: "",
          status: StatusPlanoLimpeza.PENDENTE
        });
      }
    }

    if (dataToCreate.length > 0) {
      await tx.planoLimpezaSemanalExecucao.createMany({
        data: dataToCreate
      });
    }

    return {
      createdCount: dataToCreate.length,
      removedCount: pendingInvalidRecordIds.length
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
