import {
  StatusFechamentoPlanoLimpeza,
  StatusPlanoLimpeza,
  TipoPlanoLimpeza,
  TurnoPlanoLimpeza
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { DAILY_AREAS } from "./constants";
import { getMonthYear } from "./utils";

function dailyKey(area: string, turno: TurnoPlanoLimpeza): string {
  return `${area}|${turno}`;
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

export async function ensureDailyAreaConfigurations(): Promise<void> {
  const total = await prisma.planoLimpezaDiarioArea.count();
  if (total > 0) {
    return;
  }

  await prisma.planoLimpezaDiarioArea.createMany({
    data: DAILY_AREAS.map((nome, index) => ({
      nome,
      turnoManha: true,
      turnoTarde: true,
      turnoNoite: true,
      ativo: true,
      ordem: index + 1
    }))
  });
}

export async function isDailyMonthSigned(date: Date): Promise<boolean> {
  const { mes, ano } = getMonthYear(date);
  const fechamento = await prisma.planoLimpezaFechamento.findUnique({
    where: { tipo_mes_ano: { tipo: TipoPlanoLimpeza.DIARIO, mes, ano } }
  });

  return fechamento?.status === StatusFechamentoPlanoLimpeza.ASSINADO;
}

export async function ensureDailyChecklistForDate(date: Date): Promise<void> {
  await ensureDailyAreaConfigurations();

  if (await isDailyMonthSigned(date)) {
    return;
  }

  const areaConfigs = await prisma.planoLimpezaDiarioArea.findMany({
    where: { ativo: true },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }]
  });

  if (areaConfigs.length === 0) {
    return;
  }

  const existing = await prisma.planoLimpezaDiarioRegistro.findMany({
    where: { data: date },
    select: { area: true, turno: true }
  });

  const existingSet = new Set(existing.map((item) => dailyKey(item.area, item.turno)));
  const dataToCreate = [];

  for (const areaConfig of areaConfigs) {
    const turnos = getTurnosFromConfig(areaConfig);

    for (const turno of turnos) {
      const key = dailyKey(areaConfig.nome, turno);
      if (existingSet.has(key)) {
        continue;
      }

      dataToCreate.push({
        data: date,
        turno,
        area: areaConfig.nome,
        assinaturaResponsavel: "",
        assinaturaSupervisor: "",
        status: StatusPlanoLimpeza.PENDENTE
      });
    }
  }

  if (dataToCreate.length > 0) {
    await prisma.planoLimpezaDiarioRegistro.createMany({
      data: dataToCreate
    });
  }
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
