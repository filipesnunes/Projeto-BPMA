import {
  ConformidadeRecebimento,
  OrigemChamadoManutencao,
  PrioridadeChamadoManutencao,
  StatusChamadoManutencao,
  StatusItemBuffetAmostra,
  StatusNotaRecebimento,
  StatusOperacionalEquipamento,
  StatusPlanoLimpeza,
  StatusQualidadeOleo,
  StatusRecebimento,
  StatusTemperaturaBuffetAmostra,
  StatusTemperaturaEquipamento,
  TipoOpcaoTemperaturaEquipamento,
  TipoPlanoLimpeza,
  TurnoTemperaturaEquipamento
} from "@prisma/client";

import {
  formatDateDisplay,
  formatDateInput,
  formatDateTimeDisplay,
  formatWeeklyExecutionQuando,
  getCurrentSystemDateTime,
  getCurrentWeekDateRange,
  getMonthDateRange,
  getMonthYear,
  getTodaySystemDate,
  getWeekStartDateForDate
} from "@/app/plano-limpeza/utils";
import { isServicoDisponivelNaData } from "@/app/controle-buffet-amostras/utils";
import type { AuthenticatedUser } from "@/lib/auth-session";
import { getEndOfAppDay, getStartOfAppDay, parseAppDateInput } from "@/lib/date-time";
import { hasStoredImage as hasImageEvidence } from "@/lib/image-upload";
import { prisma } from "@/lib/prisma";

import {
  DASHBOARD_PERIODS,
  type DashboardAlertSeverity,
  type DashboardData,
  type DashboardDetailKind,
  type DashboardDetailItem,
  type DashboardDetailsResponse,
  type DashboardEvolutionMetric,
  type DashboardInsightDetailsResponse,
  type DashboardInsightId,
  type DashboardInsightItem,
  type DashboardInsightSummary,
  type DashboardModuleSummary,
  type DashboardNormalizedStatus,
  type DashboardPeriod,
  type DashboardProfileView,
  type DashboardSummaryCard
} from "./types";

const DETAIL_LIMIT = 18;

const MODULES = {
  hortifruti: {
    id: "hortifruti",
    name: "Higienização de Hortifruti",
    href: "/higienizacao-hortifruti"
  },
  temperatura: {
    id: "temperatura",
    name: "Controle de Temperatura",
    href: "/controle-temperatura-equipamentos"
  },
  oleo: {
    id: "oleo",
    name: "Controle de Qualidade do Óleo",
    href: "/controle-qualidade-oleo"
  },
  rastreabilidade: {
    id: "rastreabilidade",
    name: "Rastreabilidade",
    href: "/rastreabilidade-recebimento"
  },
  buffet: {
    id: "buffet",
    name: "Controle de Buffet / Amostras",
    href: "/controle-buffet-amostras"
  },
  limpezaDiaria: {
    id: "limpeza-diaria",
    name: "Plano de Limpeza Diário",
    href: "/plano-limpeza/diario"
  },
  limpezaSemanal: {
    id: "limpeza-semanal",
    name: "Plano de Limpeza Semanal",
    href: "/plano-limpeza/semanal"
  },
  chamados: {
    id: "chamados",
    name: "Chamados de Manutenção",
    href: "/chamados-manutencao"
  }
} as const;

type DateOnlyRange = {
  start: Date;
  end: Date;
};

type DashboardRanges = {
  periodLabel: string;
  customStartDate?: string;
  customEndDate?: string;
  filterError?: string;
  daily: DateOnlyRange;
  weekly: DateOnlyRange;
  monthly: DateOnlyRange;
  monthlyLabel: string;
  openPendencies: DateOnlyRange;
  dateTime: {
    start: Date;
    end: Date;
  };
  mes: number;
  ano: number;
};

type ModuleStats = {
  id: string;
  name: string;
  href: string;
  total: number;
  completed: number;
  pending: number;
  inProgress?: number;
  waitingResponsible?: number;
  waitingSupervisor?: number;
  note?: string;
  pendingDetails: DashboardDetailItem[];
  completedDetails: DashboardDetailItem[];
};

export type DashboardDateFilterInput = {
  startDate?: string;
  endDate?: string;
};

export function parseDashboardPeriod(value: string): DashboardPeriod {
  return DASHBOARD_PERIODS.includes(value as DashboardPeriod)
    ? (value as DashboardPeriod)
    : "hoje";
}

function calculatePercent(value: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return Math.round((value / total) * 100);
}

function buildSummaryCard(params: Omit<DashboardSummaryCard, "percentCompleted" | "percentPending">): DashboardSummaryCard {
  return {
    ...params,
    percentCompleted: calculatePercent(params.completed, params.total),
    percentPending: calculatePercent(params.pending, params.total)
  };
}

function buildModuleSummary(stats: ModuleStats): DashboardModuleSummary {
  const status: DashboardModuleSummary["status"] =
    stats.total === 0
      ? "Sem dados"
      : stats.pending === 0
        ? "Concluído"
        : stats.completed === 0
          ? "Pendente"
          : "Parcial";

  return {
    id: stats.id,
    name: stats.name,
    href: stats.href,
    total: stats.total,
    completed: stats.completed,
    pending: stats.pending,
    percentCompleted: calculatePercent(stats.completed, stats.total),
    percentPending: calculatePercent(stats.pending, stats.total),
    status,
    note: stats.note
  };
}

function addDetail(list: DashboardDetailItem[], item: DashboardDetailItem): void {
  if (list.length < DETAIL_LIMIT) {
    list.push(item);
  }
}

function createInsightSummary(params: {
  id: DashboardInsightId;
  title: string;
  description: string;
  status?: DashboardInsightSummary["status"];
  level?: DashboardAlertSeverity;
}): DashboardInsightSummary {
  return {
    id: params.id,
    title: params.title,
    description: params.description,
    total: 0,
    critical: 0,
    attention: 0,
    informative: 0,
    status: params.status,
    level: params.level,
    details: []
  };
}

function addInsightItem(
  summary: DashboardInsightSummary,
  item: DashboardInsightItem
): void {
  summary.total += 1;

  if (item.severity === "Crítico") {
    summary.critical += 1;
  } else if (item.severity === "Atenção") {
    summary.attention += 1;
  } else {
    summary.informative += 1;
  }

  if (item.status === "Concluído" || item.status === "Cancelado") {
    summary.resolved = (summary.resolved ?? 0) + 1;
  }

  if (item.correctiveAction) {
    summary.withCorrectiveAction = (summary.withCorrectiveAction ?? 0) + 1;
  } else if (item.status !== "Concluído" && item.status !== "Cancelado") {
    summary.withoutCorrectiveAction = (summary.withoutCorrectiveAction ?? 0) + 1;
  }

  if (summary.details.length < DETAIL_LIMIT) {
    summary.details.push(item);
  }
}

function stripInsightDetails(summary: DashboardInsightSummary): DashboardInsightSummary {
  return {
    ...summary,
    details: []
  };
}

function combineDetails(
  stats: ModuleStats[],
  field: "pendingDetails" | "completedDetails"
): DashboardDetailItem[] {
  const details: DashboardDetailItem[] = [];

  for (const stat of stats) {
    for (const item of stat[field]) {
      addDetail(details, item);
    }
  }

  return details;
}

function combineStatsToCard(params: {
  id: string;
  title: string;
  description: string;
  href?: string;
  stats: ModuleStats[];
}): DashboardSummaryCard {
  const total = params.stats.reduce((sum, item) => sum + item.total, 0);
  const completed = params.stats.reduce((sum, item) => sum + item.completed, 0);
  const pending = params.stats.reduce((sum, item) => sum + item.pending, 0);
  const inProgress = params.stats.reduce((sum, item) => sum + (item.inProgress ?? 0), 0);
  const waitingResponsible = params.stats.reduce(
    (sum, item) => sum + (item.waitingResponsible ?? 0),
    0
  );
  const waitingSupervisor = params.stats.reduce(
    (sum, item) => sum + (item.waitingSupervisor ?? 0),
    0
  );

  return buildSummaryCard({
    id: params.id,
    title: params.title,
    description: params.description,
    href: params.href,
    total,
    completed,
    pending,
    inProgress,
    waitingResponsible,
    waitingSupervisor,
    pendingDetails: combineDetails(params.stats, "pendingDetails"),
    completedDetails: combineDetails(params.stats, "completedDetails")
  });
}

function stripCardDetails(card: DashboardSummaryCard): DashboardSummaryCard {
  return {
    ...card,
    pendingDetails: [],
    completedDetails: []
  };
}

function formatRangeLabel(range: DateOnlyRange): string {
  if (formatDateInput(range.start) === formatDateInput(range.end)) {
    return formatDateDisplay(range.start);
  }

  return `${formatDateDisplay(range.start)} a ${formatDateDisplay(range.end)}`;
}

function dateOnlyKey(date: Date): string {
  return formatDateInput(date);
}

function temperatureMeasurementKey(record: {
  data: Date;
  equipamento: string;
  turno: TurnoTemperaturaEquipamento;
}): string {
  return `${dateOnlyKey(record.data)}|${record.equipamento}|${record.turno}`;
}

function dedupeTemperatureMeasurements<
  T extends {
    data: Date;
    equipamento: string;
    turno: TurnoTemperaturaEquipamento;
    createdAt: Date;
  }
>(records: T[]): T[] {
  const latestByMeasurement = new Map<string, T>();
  const orderedRecords = [...records].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );

  for (const record of orderedRecords) {
    const key = temperatureMeasurementKey(record);

    if (!latestByMeasurement.has(key)) {
      latestByMeasurement.set(key, record);
    }
  }

  return Array.from(latestByMeasurement.values());
}

function minDateOnly(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

function maxDateOnly(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

function enumerateMonthRanges(range: DateOnlyRange): Array<{
  mes: number;
  ano: number;
  range: DateOnlyRange;
}> {
  const months: Array<{ mes: number; ano: number; range: DateOnlyRange }> = [];
  let mes = range.start.getUTCMonth() + 1;
  let ano = range.start.getUTCFullYear();
  const endMes = range.end.getUTCMonth() + 1;
  const endAno = range.end.getUTCFullYear();

  while (ano < endAno || (ano === endAno && mes <= endMes)) {
    const monthRange = getMonthDateRange(mes, ano);
    months.push({
      mes,
      ano,
      range: {
        start: maxDateOnly(range.start, monthRange.start),
        end: minDateOnly(range.end, monthRange.end)
      }
    });

    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }

  return months;
}

function enumerateDateRange(range: DateOnlyRange): Date[] {
  const dates: Date[] = [];
  const cursor = new Date(range.start);

  while (cursor.getTime() <= range.end.getTime()) {
    dates.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function dateOnlyToLocalDateTime(date: Date, endOfDay: boolean): Date {
  return endOfDay ? getEndOfAppDay(date) : getStartOfAppDay(date);
}

function hasOpenPendenciesBeforeRange(range: DateOnlyRange, openRange: DateOnlyRange): boolean {
  return openRange.start.getTime() < range.start.getTime();
}

function daysBetweenDates(start: Date, end: Date): number {
  const diff = dateOnlyToLocalDateTime(end, false).getTime() -
    dateOnlyToLocalDateTime(start, false).getTime();

  return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
}

function hasUsefulText(value: string | null | undefined): value is string {
  return Boolean(value && value.trim().length > 0);
}

function maintenanceContextKey(
  context: string | null | undefined,
  recordId: string | number | null | undefined
): string | null {
  if (!context || recordId === null || recordId === undefined) {
    return null;
  }

  return `${context}:${recordId}`;
}

function getCustomDateRange(
  filter: DashboardDateFilterInput | undefined,
  today: Date
): {
  range: DateOnlyRange;
  startDate: string;
  endDate: string;
  error?: string;
} {
  const defaultDate = formatDateInput(today);
  const startDate = filter?.startDate?.trim() || defaultDate;
  const endDate = filter?.endDate?.trim() || defaultDate;
  const start = parseAppDateInput(startDate);
  const end = parseAppDateInput(endDate);
  const fallbackRange = { start: today, end: today };

  if (!filter?.startDate?.trim() && !filter?.endDate?.trim()) {
    return {
      range: fallbackRange,
      startDate,
      endDate
    };
  }

  if (!filter?.startDate?.trim() || !filter?.endDate?.trim()) {
    return {
      range: fallbackRange,
      startDate,
      endDate,
      error: "Informe data inicial e data final para usar a data personalizada."
    };
  }

  if (!start || !end) {
    return {
      range: fallbackRange,
      startDate,
      endDate,
      error: "Informe datas válidas no filtro personalizado."
    };
  }

  if (start.getTime() > end.getTime()) {
    return {
      range: fallbackRange,
      startDate,
      endDate,
      error: "A data inicial não pode ser maior que a data final."
    };
  }

  return {
    range: { start, end },
    startDate,
    endDate
  };
}

function getRanges(
  period: DashboardPeriod,
  now: Date,
  customFilter?: DashboardDateFilterInput
): DashboardRanges {
  const today = getTodaySystemDate();
  const { mes, ano } = getMonthYear(today);
  const currentWeek = getCurrentWeekDateRange(now);
  const currentMonth = getMonthDateRange(mes, ano);

  if (period === "personalizado") {
    const customRange = getCustomDateRange(customFilter, today);
    const dateTimeStart = dateOnlyToLocalDateTime(customRange.range.start, false);
    const dateTimeEnd = dateOnlyToLocalDateTime(customRange.range.end, true);
    const customMonth = getMonthYear(customRange.range.start);

    return {
      periodLabel: `Data personalizada: ${formatRangeLabel(customRange.range)}`,
      customStartDate: customRange.startDate,
      customEndDate: customRange.endDate,
      filterError: customRange.error,
      daily: customRange.range,
      weekly: customRange.range,
      monthly: customRange.range,
      monthlyLabel: formatRangeLabel(customRange.range),
      openPendencies: customRange.range,
      dateTime: {
        start: dateTimeStart,
        end: dateTimeEnd.getTime() > now.getTime() ? now : dateTimeEnd
      },
      mes: customMonth.mes,
      ano: customMonth.ano
    };
  }

  const daily =
    period === "semana"
      ? { start: currentWeek.start, end: minDateOnly(currentWeek.end, today) }
      : period === "mes"
        ? { start: currentMonth.start, end: minDateOnly(currentMonth.end, today) }
        : { start: today, end: today };

  const weekly =
    period === "mes"
      ? { start: currentMonth.start, end: minDateOnly(currentMonth.end, today) }
      : { start: currentWeek.start, end: minDateOnly(currentWeek.end, today) };

  const dateTimeStart = dateOnlyToLocalDateTime(daily.start, false);
  const dateTimeEnd = dateOnlyToLocalDateTime(daily.end, true);

  return {
    periodLabel:
      period === "semana" ? "Semana Atual" : period === "mes" ? "Mês Atual" : "Hoje",
    daily,
    weekly,
    monthly: currentMonth,
    monthlyLabel: `${String(mes).padStart(2, "0")}/${ano}`,
    openPendencies: {
      start: currentMonth.start,
      end: minDateOnly(currentMonth.end, today)
    },
    dateTime: {
      start: dateTimeStart,
      end: dateTimeEnd.getTime() > now.getTime() ? now : dateTimeEnd
    },
    mes,
    ano
  };
}

function getProfileView(user: AuthenticatedUser): DashboardProfileView {
  if (user.perfil === "COLABORADOR") {
    return {
      role: user.perfil,
      title: "Resumo Operacional",
      subtitle: "",
      showManagement: false
    };
  }

  if (user.perfil === "NUTRICIONISTA") {
    return {
      role: user.perfil,
      title: "Resumo Operacional",
      subtitle: "",
      showManagement: true
    };
  }

  if (user.perfil === "GERENTE") {
    return {
      role: user.perfil,
      title: "Resumo Operacional",
      subtitle: "",
      showManagement: true
    };
  }

  return {
    role: user.perfil,
    title: "Resumo Operacional",
    subtitle: "",
    showManagement: true
  };
}

function temperatureShiftLabel(turno: TurnoTemperaturaEquipamento): string {
  return turno === TurnoTemperaturaEquipamento.MANHA ? "Manhã" : "Tarde";
}

function temperatureConfiguredShifts(equipment: {
  turnoManha: boolean;
  turnoTarde: boolean;
}): TurnoTemperaturaEquipamento[] {
  const shifts: TurnoTemperaturaEquipamento[] = [];

  if (equipment.turnoManha) {
    shifts.push(TurnoTemperaturaEquipamento.MANHA);
  }

  if (equipment.turnoTarde) {
    shifts.push(TurnoTemperaturaEquipamento.TARDE);
  }

  return shifts.length > 0
    ? shifts
    : [TurnoTemperaturaEquipamento.MANHA, TurnoTemperaturaEquipamento.TARDE];
}

function temperatureStatusLabel(status: StatusTemperaturaEquipamento): DashboardNormalizedStatus {
  return status === StatusTemperaturaEquipamento.CONFORME ? "Concluído" : "Não conformidade";
}

function temperatureOperationalStatusLabel(
  status: StatusOperacionalEquipamento
): string {
  if (status === StatusOperacionalEquipamento.MANUTENCAO) {
    return "Manutenção";
  }

  if (status === StatusOperacionalEquipamento.INATIVO) {
    return "Inativo";
  }

  return "Em Operação";
}

function isOperationalTemperatureRecord(record: {
  statusOperacionalEquipamento: StatusOperacionalEquipamento;
}): boolean {
  return record.statusOperacionalEquipamento === StatusOperacionalEquipamento.EM_OPERACAO;
}

function oilStatusLabel(status: StatusQualidadeOleo | null): DashboardNormalizedStatus {
  if (
    status === StatusQualidadeOleo.DESCARTAR ||
    status === StatusQualidadeOleo.ULTIMA_UTILIZACAO
  ) {
    return "Não conformidade";
  }

  return "Concluído";
}

function noteStatusLabel(status: StatusNotaRecebimento): DashboardNormalizedStatus {
  if (status === StatusNotaRecebimento.FINALIZADA) {
    return "Concluído";
  }

  if (status === StatusNotaRecebimento.EM_CONFERENCIA) {
    return "Em andamento";
  }

  return "Aguardando responsável";
}

function cleaningStatusLabel(status: StatusPlanoLimpeza): DashboardNormalizedStatus {
  if (status === StatusPlanoLimpeza.CONCLUIDO) {
    return "Concluído";
  }

  if (status === StatusPlanoLimpeza.AGUARDANDO_SUPERVISOR) {
    return "Aguardando supervisor";
  }

  return "Aguardando responsável";
}

function buffetStatusLabel(status: StatusItemBuffetAmostra): DashboardNormalizedStatus {
  if (status === StatusItemBuffetAmostra.ASSINADO) {
    return "Concluído";
  }

  if (status === StatusItemBuffetAmostra.NAO_SERVIDO) {
    return "Concluído";
  }

  if (status === StatusItemBuffetAmostra.PREENCHIDO) {
    return "Concluído";
  }

  return "Pendente";
}

function maintenanceStatusLabel(status: StatusChamadoManutencao): DashboardNormalizedStatus {
  if (status === StatusChamadoManutencao.CONCLUIDO) {
    return "Concluído";
  }

  if (status === StatusChamadoManutencao.EM_ANDAMENTO) {
    return "Em andamento";
  }

  if (status === StatusChamadoManutencao.CANCELADO) {
    return "Cancelado";
  }

  return "Pendente";
}

function moduleStatsBase(moduleInfo: (typeof MODULES)[keyof typeof MODULES]): ModuleStats {
  return {
    id: moduleInfo.id,
    name: moduleInfo.name,
    href: moduleInfo.href,
    total: 0,
    completed: 0,
    pending: 0,
    pendingDetails: [],
    completedDetails: []
  };
}

async function safeModuleStats(
  moduleInfo: (typeof MODULES)[keyof typeof MODULES],
  build: () => Promise<ModuleStats>
): Promise<ModuleStats> {
  try {
    return await build();
  } catch (error) {
    console.error(`[dashboard] Falha ao consultar ${moduleInfo.name}`, error);

    return {
      ...moduleStatsBase(moduleInfo),
      note: "Dados indisponíveis no momento."
    };
  }
}

async function safeSummaryCard(
  fallback: Omit<DashboardSummaryCard, "percentCompleted" | "percentPending">,
  build: () => Promise<DashboardSummaryCard>
): Promise<DashboardSummaryCard> {
  try {
    return await build();
  } catch (error) {
    console.error(`[dashboard] Falha ao consultar ${fallback.title}`, error);
    return buildSummaryCard(fallback);
  }
}

async function safeInsightSummary(
  title: string,
  build: () => Promise<DashboardInsightSummary>
): Promise<DashboardInsightSummary> {
  try {
    return await build();
  } catch (error) {
    console.error(`[dashboard] Falha ao consultar ${title}`, error);

    return createInsightSummary({
      id: title === "Ações Corretivas" ? "acoes-corretivas" : "nao-conformidades",
      title,
      description: "Dados indisponíveis no momento."
    });
  }
}

function addPending(stats: ModuleStats, detail: DashboardDetailItem, status?: DashboardNormalizedStatus): void {
  stats.total += 1;
  stats.pending += 1;

  if (status === "Aguardando supervisor") {
    stats.waitingSupervisor = (stats.waitingSupervisor ?? 0) + 1;
  } else if (status === "Aguardando responsável") {
    stats.waitingResponsible = (stats.waitingResponsible ?? 0) + 1;
  } else if (status === "Em andamento") {
    stats.inProgress = (stats.inProgress ?? 0) + 1;
  }

  addDetail(stats.pendingDetails, detail);
}

function addCompleted(stats: ModuleStats, detail: DashboardDetailItem): void {
  stats.total += 1;
  stats.completed += 1;
  addDetail(stats.completedDetails, detail);
}

async function buildDailyCleaningStats(
  range: DateOnlyRange,
  openRange: DateOnlyRange = range
): Promise<ModuleStats> {
  const moduleInfo = MODULES.limpezaDiaria;
  const stats = moduleStatsBase(moduleInfo);
  const dates = enumerateDateRange(range);
  const recordWhere = hasOpenPendenciesBeforeRange(range, openRange)
    ? {
        OR: [
          { data: { gte: range.start, lte: range.end } },
          {
            data: { gte: openRange.start, lt: range.start },
            status: { not: StatusPlanoLimpeza.CONCLUIDO }
          }
        ]
      }
    : { data: { gte: range.start, lte: range.end } };

  const [areaConfigs, registros] = await Promise.all([
    prisma.planoLimpezaDiarioArea.findMany({
      where: { ativo: true },
      select: {
        nome: true,
        itens: {
          where: {
            ativo: true,
            excluidoEm: null
          },
          select: {
            id: true,
            descricao: true
          },
          orderBy: [{ ordem: "asc" }, { descricao: "asc" }]
        }
      },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }]
    }),
    prisma.planoLimpezaDiarioRegistro.findMany({
      where: recordWhere,
      select: {
        id: true,
        data: true,
        area: true,
        itemId: true,
        itemDescricao: true,
        assinaturaResponsavel: true,
        assinaturaSupervisor: true,
        status: true,
        updatedAt: true
      },
      orderBy: [{ updatedAt: "desc" }]
    })
  ]);

  const keyFor = (date: Date, itemId: number) => `${dateOnlyKey(date)}|${itemId}`;
  const recordsByKey = new Map<string, (typeof registros)[number]>();

  for (const record of registros) {
    if (!record.itemId) {
      continue;
    }
    const key = keyFor(record.data, record.itemId);
    const current = recordsByKey.get(key);
    const currentSigned = Boolean(current?.assinaturaResponsavel.trim());
    const candidateSigned = Boolean(record.assinaturaResponsavel.trim());

    if (
      !current ||
      (candidateSigned && !currentSigned) ||
      (candidateSigned === currentSigned &&
        record.updatedAt.getTime() > current.updatedAt.getTime())
    ) {
      recordsByKey.set(key, record);
    }
  }

  for (const date of dates) {
    for (const area of areaConfigs) {
      for (const item of area.itens) {
        const key = keyFor(date, item.id);
        const record = recordsByKey.get(key);
        const href = `${moduleInfo.href}?filtroData=${formatDateInput(date)}&filtroArea=${encodeURIComponent(area.nome)}&openData=${formatDateInput(date)}&openArea=${encodeURIComponent(area.nome)}`;

        if (!record) {
          addPending(
            stats,
            {
              id: `${moduleInfo.id}:${key}:missing`,
              moduleId: moduleInfo.id,
              moduleName: moduleInfo.name,
              title: `${area.nome} | ${item.descricao}`,
              description: `Sem assinatura em ${formatDateDisplay(date)}.`,
              status: "Aguardando responsável",
              dateTime: formatDateDisplay(date),
              href
            },
            "Aguardando responsável"
          );
          continue;
        }

        const status = cleaningStatusLabel(record.status);
        const detail = {
          id: `${moduleInfo.id}:${record.id}`,
          moduleId: moduleInfo.id,
          moduleName: moduleInfo.name,
          title: `${record.area} | ${record.itemDescricao ?? item.descricao}`,
          description:
            record.status === StatusPlanoLimpeza.AGUARDANDO_SUPERVISOR
              ? "Aguardando assinatura do supervisor."
              : "Item/local registrado.",
          status,
          responsible: record.assinaturaSupervisor || record.assinaturaResponsavel || undefined,
          dateTime: formatDateDisplay(record.data),
          href
        };

        if (record.assinaturaResponsavel.trim().length > 0) {
          addCompleted(stats, detail);
        } else {
          addPending(stats, detail, status);
        }
      }
    }
  }

  return stats;
}

async function buildTemperatureStats(range: DateOnlyRange): Promise<ModuleStats> {
  const moduleInfo = MODULES.temperatura;
  const stats = moduleStatsBase(moduleInfo);
  const dates = enumerateDateRange(range);

  const [equipamentos, registros] = await Promise.all([
    prisma.controleTemperaturaEquipamentoOpcao.findMany({
      where: {
        tipo: TipoOpcaoTemperaturaEquipamento.EQUIPAMENTO,
        ativo: true
      },
      select: { nome: true, turnoManha: true, turnoTarde: true },
      orderBy: [{ nome: "asc" }]
    }),
    prisma.controleTemperaturaEquipamento.findMany({
      where: { data: { gte: range.start, lte: range.end } },
      select: {
        id: true,
        data: true,
        equipamento: true,
        turno: true,
        statusOperacionalEquipamento: true,
        status: true,
        responsavel: true,
        createdAt: true
      },
      orderBy: [{ createdAt: "desc" }]
    })
  ]);
  const registrosUnicos = dedupeTemperatureMeasurements(registros);

  const keyFor = (date: Date, equipamento: string, turno: TurnoTemperaturaEquipamento) =>
    `${dateOnlyKey(date)}|${equipamento}|${turno}`;
  const recordsByKey = new Map<string, (typeof registrosUnicos)[number]>();

  for (const record of registrosUnicos) {
    const key = keyFor(record.data, record.equipamento, record.turno);
    if (!recordsByKey.has(key)) {
      recordsByKey.set(key, record);
    }
  }

  const expectedKeys = new Set<string>();

  for (const date of dates) {
    for (const equipamento of equipamentos) {
      for (const turno of temperatureConfiguredShifts(equipamento)) {
        const key = keyFor(date, equipamento.nome, turno);
        expectedKeys.add(key);
        const href = `${moduleInfo.href}?filtroData=${formatDateInput(date)}&filtroEquipamento=${encodeURIComponent(equipamento.nome)}`;
        const record = recordsByKey.get(key);

        if (!record) {
          addPending(
            stats,
            {
              id: `${moduleInfo.id}:${key}:missing`,
              moduleId: moduleInfo.id,
              moduleName: moduleInfo.name,
              title: `${equipamento.nome} | ${temperatureShiftLabel(turno)}`,
              description: `Aguardando aferição em ${formatDateDisplay(date)}.`,
              status: "Aguardando responsável",
              dateTime: formatDateDisplay(date),
              href
            },
            "Aguardando responsável"
          );
          continue;
        }

        const recordOperational = isOperationalTemperatureRecord(record);
        addCompleted(stats, {
          id: `${moduleInfo.id}:${record.id}`,
          moduleId: moduleInfo.id,
          moduleName: moduleInfo.name,
          title: `${record.equipamento} | ${temperatureShiftLabel(record.turno)}`,
          description: recordOperational
            ? record.status === StatusTemperaturaEquipamento.CONFORME
              ? "Temperatura registrada dentro da faixa."
              : "Temperatura registrada com ação corretiva."
            : `Registro justificado: ${temperatureOperationalStatusLabel(record.statusOperacionalEquipamento)}.`,
          status: recordOperational ? temperatureStatusLabel(record.status) : "Concluído",
          responsible: record.responsavel,
          dateTime: formatDateTimeDisplay(record.createdAt),
          href
        });
      }
    }
  }

  for (const record of registrosUnicos) {
    const key = keyFor(record.data, record.equipamento, record.turno);
    if (expectedKeys.has(key)) {
      continue;
    }

    const recordOperational = isOperationalTemperatureRecord(record);
    addCompleted(stats, {
      id: `${moduleInfo.id}:${record.id}`,
      moduleId: moduleInfo.id,
      moduleName: moduleInfo.name,
      title: `${record.equipamento} | ${temperatureShiftLabel(record.turno)}`,
      description: recordOperational
        ? "Registro existente fora do catálogo ativo atual."
        : `Registro justificado fora do catálogo ativo atual: ${temperatureOperationalStatusLabel(record.statusOperacionalEquipamento)}.`,
      status: recordOperational ? temperatureStatusLabel(record.status) : "Concluído",
      responsible: record.responsavel,
      dateTime: formatDateTimeDisplay(record.createdAt),
      href: `${moduleInfo.href}?filtroData=${formatDateInput(record.data)}`
    });
  }

  return stats;
}

async function buildOilStats(range: DateOnlyRange): Promise<ModuleStats> {
  const moduleInfo = MODULES.oleo;
  const stats = moduleStatsBase(moduleInfo);
  const dates = enumerateDateRange(range);

  const [activeOptions, registros] = await Promise.all([
    prisma.controleQualidadeOleoOpcaoFita.count({ where: { ativo: true } }),
    prisma.controleQualidadeOleoRegistro.findMany({
      where: { data: { gte: range.start, lte: range.end } },
      select: {
        id: true,
        data: true,
        status: true,
        temperaturaCritica: true,
        semUtilizacao: true,
        responsavel: true,
        createdAt: true
      },
      orderBy: [{ createdAt: "desc" }]
    })
  ]);

  const recordsByDate = new Map<string, (typeof registros)[number][]>();
  for (const record of registros) {
    const key = dateOnlyKey(record.data);
    recordsByDate.set(key, [...(recordsByDate.get(key) ?? []), record]);
  }

  if (activeOptions > 0) {
    for (const date of dates) {
      const key = dateOnlyKey(date);
      const records = recordsByDate.get(key) ?? [];
      const href = `${moduleInfo.href}?filtroData=${formatDateInput(date)}`;

      if (records.length === 0) {
        addPending(
          stats,
          {
            id: `${moduleInfo.id}:${key}:missing`,
            moduleId: moduleInfo.id,
            moduleName: moduleInfo.name,
            title: "Registro diário do óleo",
            description: `Aguardando registro em ${formatDateDisplay(date)}.`,
            status: "Aguardando responsável",
            dateTime: formatDateDisplay(date),
            href
          },
          "Aguardando responsável"
        );
        continue;
      }

      const latest = records[0];
      addCompleted(stats, {
        id: `${moduleInfo.id}:${latest.id}`,
        moduleId: moduleInfo.id,
        moduleName: moduleInfo.name,
        title: records.length > 1 ? `Registro do óleo (${records.length} registros)` : "Registro do óleo",
        description: latest.semUtilizacao
          ? "Registrado como sem utilização no período."
          : latest.temperaturaCritica
            ? "Registro com temperatura acima do limite."
            : "Registro diário realizado.",
        status: oilStatusLabel(latest.status),
        responsible: latest.responsavel,
        dateTime: formatDateTimeDisplay(latest.createdAt),
        href
      });
    }
  } else {
    for (const record of registros) {
      addCompleted(stats, {
        id: `${moduleInfo.id}:${record.id}`,
        moduleId: moduleInfo.id,
        moduleName: moduleInfo.name,
        title: "Registro do óleo",
        description: "Registro existente no período.",
        status: oilStatusLabel(record.status),
        responsible: record.responsavel,
        dateTime: formatDateTimeDisplay(record.createdAt),
        href: `${moduleInfo.href}?filtroData=${formatDateInput(record.data)}`
      });
    }
  }

  if (activeOptions === 0) {
    stats.note = "Sem opções ativas de fita cadastradas.";
  }

  return stats;
}

async function buildHortifrutiStats(range: DateOnlyRange): Promise<ModuleStats> {
  const moduleInfo = MODULES.hortifruti;
  const stats = moduleStatsBase(moduleInfo);

  const registros = await prisma.higienizacaoHortifruti.findMany({
    where: { data: { gte: range.start, lte: range.end } },
    select: {
      id: true,
      data: true,
      hortifruti: true,
      produtoUtilizado: true,
      responsavel: true,
      terminoProcesso: true,
      createdAt: true
    },
    orderBy: [{ data: "desc" }, { createdAt: "desc" }]
  });

  for (const record of registros) {
    addCompleted(stats, {
      id: `${moduleInfo.id}:${record.id}`,
      moduleId: moduleInfo.id,
      moduleName: moduleInfo.name,
      title: record.hortifruti,
      description: `Produto: ${record.produtoUtilizado}.`,
      status: "Concluído",
      responsible: record.responsavel,
      dateTime: `${formatDateDisplay(record.data)} ${record.terminoProcesso}`,
      href: `${moduleInfo.href}?filtroData=${formatDateInput(record.data)}&filtroHortifruti=${encodeURIComponent(record.hortifruti)}`
    });
  }

  stats.note = "Sem agenda obrigatória configurada; considera somente registros lançados.";

  return stats;
}

async function buildReceivingStats(
  range: DateOnlyRange,
  openRange: DateOnlyRange = range
): Promise<ModuleStats> {
  const moduleInfo = MODULES.rastreabilidade;
  const stats = moduleStatsBase(moduleInfo);
  const noteWhere = hasOpenPendenciesBeforeRange(range, openRange)
    ? {
        OR: [
          { data: { gte: range.start, lte: range.end } },
          {
            data: { gte: openRange.start, lt: range.start },
            statusNota: { not: StatusNotaRecebimento.FINALIZADA }
          }
        ]
      }
    : { data: { gte: range.start, lte: range.end } };

  const notas = await prisma.rastreabilidadeRecebimentoNota.findMany({
    where: noteWhere,
    select: {
      id: true,
      data: true,
      fornecedor: true,
      notaFiscal: true,
      statusNota: true,
      responsavelGeral: true,
      updatedAt: true,
      _count: {
        select: { itens: true }
      }
    },
    orderBy: [{ data: "desc" }, { updatedAt: "desc" }]
  });

  for (const nota of notas) {
    const status = noteStatusLabel(nota.statusNota);
    const detail = {
      id: `${moduleInfo.id}:${nota.id}`,
      moduleId: moduleInfo.id,
      moduleName: moduleInfo.name,
      title: `NF ${nota.notaFiscal} | ${nota.fornecedor}`,
      description: `${nota._count.itens} item(ns) vinculados.`,
      status,
      responsible: nota.responsavelGeral ?? undefined,
      dateTime: formatDateDisplay(nota.data),
      href: `${moduleInfo.href}/nota/${nota.id}`
    };

    if (nota.statusNota === StatusNotaRecebimento.FINALIZADA) {
      addCompleted(stats, detail);
    } else {
      addPending(stats, detail, status);
    }
  }

  return stats;
}

async function buildBuffetStats(
  range: DateOnlyRange,
  openRange: DateOnlyRange = range
): Promise<ModuleStats> {
  const moduleInfo = MODULES.buffet;
  const stats = moduleStatsBase(moduleInfo);
  const dates = enumerateDateRange(range);
  const recordWhere = hasOpenPendenciesBeforeRange(range, openRange)
    ? {
        OR: [
          { data: { gte: range.start, lte: range.end } },
          {
            data: { gte: openRange.start, lt: range.start },
            status: {
              notIn: [
                StatusItemBuffetAmostra.ASSINADO,
                StatusItemBuffetAmostra.NAO_SERVIDO
              ]
            }
          }
        ]
      }
    : { data: { gte: range.start, lte: range.end } };

  const [servicos, registros] = await Promise.all([
    prisma.controleBuffetAmostraServico.findMany({
      where: { ativo: true },
      select: {
        id: true,
        nome: true,
        tipoServico: true,
        dataInicio: true,
        dataFim: true,
        itens: {
          where: { item: { ativo: true } },
          select: {
            item: {
              select: { id: true, nome: true }
            }
          },
          orderBy: [{ item: { ordem: "asc" } }, { item: { nome: "asc" } }]
        }
      },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }]
    }),
    prisma.controleBuffetAmostraRegistro.findMany({
      where: recordWhere,
      select: {
        id: true,
        data: true,
        servicoId: true,
        itemId: true,
        itemExtra: true,
        itemNome: true,
        status: true,
        statusTemperatura: true,
        responsavelNome: true,
        assinaturaNome: true,
        assinaturaDataHora: true,
        dataHoraRegistro: true,
        servico: {
          select: {
            nome: true,
            tipoServico: true,
            dataInicio: true,
            dataFim: true
          }
        }
      },
      orderBy: [{ data: "desc" }, { dataHoraRegistro: "desc" }]
    })
  ]);

  const keyFor = (date: Date, servicoId: number, itemId: number | null) =>
    `${dateOnlyKey(date)}|${servicoId}|${itemId ?? "extra"}`;
  const recordsByKey = new Map<string, (typeof registros)[number]>();

  for (const record of registros) {
    if (record.itemExtra || record.itemId === null) {
      continue;
    }

    const key = keyFor(record.data, record.servicoId, record.itemId);
    if (!recordsByKey.has(key)) {
      recordsByKey.set(key, record);
    }
  }

  const expectedKeys = new Set<string>();

  for (const date of dates) {
    for (const servico of servicos) {
      if (!isServicoDisponivelNaData(servico, date)) {
        continue;
      }

      for (const vinculo of servico.itens) {
        const item = vinculo.item;
        const key = keyFor(date, servico.id, item.id);
        expectedKeys.add(key);
        const record = recordsByKey.get(key);
        const href = `${moduleInfo.href}/servico/${servico.id}?data=${formatDateInput(date)}`;

        if (!record) {
          addPending(stats, {
            id: `${moduleInfo.id}:${key}:missing`,
            moduleId: moduleInfo.id,
            moduleName: moduleInfo.name,
            title: `${servico.nome} | ${item.nome}`,
            description: `Aguardando preenchimento em ${formatDateDisplay(date)}.`,
            status: "Pendente",
            dateTime: formatDateDisplay(date),
            href
          });
          continue;
        }

        if (record.status === StatusItemBuffetAmostra.NAO_SERVIDO) {
          continue;
        }

        const status = buffetStatusLabel(record.status);
        const detail = {
          id: `${moduleInfo.id}:${record.id}`,
          moduleId: moduleInfo.id,
          moduleName: moduleInfo.name,
          title: `${servico.nome} | ${item.nome}`,
          description:
            record.statusTemperatura === "ALERTA" || record.statusTemperatura === "CRITICO"
              ? "Temperatura registrada com ação corretiva."
              : "Item do serviço registrado.",
          status:
            record.status === StatusItemBuffetAmostra.ASSINADO &&
            (record.statusTemperatura === "ALERTA" || record.statusTemperatura === "CRITICO")
              ? "Não conformidade"
              : status,
          responsible: record.assinaturaNome ?? record.responsavelNome,
          dateTime: formatDateTimeDisplay(record.assinaturaDataHora ?? record.dataHoraRegistro),
          href
        };

        if (record.status !== StatusItemBuffetAmostra.PENDENTE) {
          addCompleted(stats, detail);
        } else {
          addPending(stats, detail, status);
        }
      }
    }
  }

  for (const record of registros) {
    const key = keyFor(record.data, record.servicoId, record.itemId);
    if (!record.itemExtra && expectedKeys.has(key)) {
      continue;
    }
    if (
      record.servico.tipoServico === "ESPORADICO" &&
      (record.data.getTime() < range.start.getTime() || record.data.getTime() > range.end.getTime())
    ) {
      continue;
    }

    if (record.status === StatusItemBuffetAmostra.NAO_SERVIDO) {
      continue;
    }

    const status = buffetStatusLabel(record.status);
    const detail = {
      id: `${moduleInfo.id}:${record.id}`,
      moduleId: moduleInfo.id,
      moduleName: moduleInfo.name,
      title: `${record.servico.nome} | ${record.itemNome}`,
      description:
        record.itemExtra
          ? "Item extra lançado no serviço."
          : "Registro fora da configuração ativa atual.",
      status,
      responsible: record.assinaturaNome ?? record.responsavelNome,
      dateTime: formatDateTimeDisplay(record.assinaturaDataHora ?? record.dataHoraRegistro),
      href: `${moduleInfo.href}/servico/${record.servicoId}?data=${formatDateInput(record.data)}`
    };

    if (record.status !== StatusItemBuffetAmostra.PENDENTE) {
      addCompleted(stats, detail);
    } else {
      addPending(stats, detail, status);
    }
  }

  return stats;
}

function enumerateWeekStarts(range: DateOnlyRange): Date[] {
  const starts = new Map<string, Date>();

  for (const date of enumerateDateRange(range)) {
    const weekStart = getWeekStartDateForDate(date);
    starts.set(dateOnlyKey(weekStart), weekStart);
  }

  return Array.from(starts.values()).sort((a, b) => a.getTime() - b.getTime());
}

async function buildWeeklyCleaningStats(
  range: DateOnlyRange,
  openRange: DateOnlyRange = range
): Promise<ModuleStats> {
  const moduleInfo = MODULES.limpezaSemanal;
  const stats = moduleStatsBase(moduleInfo);
  const weekStarts = enumerateWeekStarts(range);
  const firstWeekStart = weekStarts[0] ?? range.start;
  const lastWeekStart = weekStarts[weekStarts.length - 1] ?? range.end;
  const executionWhere = hasOpenPendenciesBeforeRange(range, openRange)
    ? {
        OR: [
          { dataExecucao: { gte: firstWeekStart, lte: lastWeekStart } },
          {
            dataExecucao: { gte: openRange.start, lt: range.start },
            status: { not: StatusPlanoLimpeza.CONCLUIDO }
          }
        ]
      }
    : { dataExecucao: { gte: firstWeekStart, lte: lastWeekStart } };

  const [weeklyAreas, rawItems, execucoes] = await Promise.all([
    prisma.planoLimpezaSemanalArea.findMany({
      where: { ativo: true, excluidoEm: null },
      select: { nome: true }
    }),
    prisma.planoLimpezaSemanalItem.findMany({
      where: { ativo: true, excluidoEm: null },
      select: {
        id: true,
        area: true,
        oQueLimpar: true
      },
      orderBy: [{ area: "asc" }, { ordem: "asc" }, { oQueLimpar: "asc" }]
    }),
    prisma.planoLimpezaSemanalExecucao.findMany({
      where: executionWhere,
      select: {
        id: true,
        dataExecucao: true,
        area: true,
        itemDescricao: true,
        quando: true,
        itemId: true,
        assinaturaResponsavel: true,
        assinaturaResponsavelDataHora: true,
        assinaturaSupervisor: true,
        status: true,
        item: {
          select: {
            oQueLimpar: true,
            ativo: true,
            excluidoEm: true
          }
        },
        updatedAt: true
      },
      orderBy: [{ updatedAt: "desc" }]
    })
  ]);
  const activeAreaNames = new Set(weeklyAreas.map((area) => area.nome));
  const items = rawItems.filter((item) => activeAreaNames.has(item.area));

  const keyFor = (weekStart: Date, itemId: number) => `${dateOnlyKey(weekStart)}|${itemId}`;
  const recordsByKey = new Map<string, (typeof execucoes)[number]>();

  for (const execution of execucoes) {
    if (!execution.item.ativo || execution.item.excluidoEm) {
      continue;
    }

    const key = keyFor(getWeekStartDateForDate(execution.dataExecucao), execution.itemId);
    if (!recordsByKey.has(key)) {
      recordsByKey.set(key, execution);
    }
  }

  const expectedKeys = new Set<string>();

  for (const weekStart of weekStarts) {
    for (const item of items) {
      const key = keyFor(weekStart, item.id);
      expectedKeys.add(key);
      const execution = recordsByKey.get(key);
      const href = `${moduleInfo.href}?filtroData=${formatDateInput(weekStart)}&filtroArea=${encodeURIComponent(item.area)}`;

      if (!execution) {
        addPending(
          stats,
          {
            id: `${moduleInfo.id}:${key}:missing`,
            moduleId: moduleInfo.id,
            moduleName: moduleInfo.name,
            title: `${item.area} | ${item.oQueLimpar}`,
            description: `Semana de ${formatDateDisplay(weekStart)}.`,
            status: "Aguardando responsável",
            dateTime: formatDateDisplay(weekStart),
            href
          },
          "Aguardando responsável"
        );
        continue;
      }

      const hasResponsible = execution.assinaturaResponsavel.trim().length > 0;
      const status = hasResponsible
        ? cleaningStatusLabel(execution.status)
        : "Aguardando responsável";
      const detail = {
        id: `${moduleInfo.id}:${execution.id}`,
        moduleId: moduleInfo.id,
        moduleName: moduleInfo.name,
        title: `${execution.area} | ${execution.itemDescricao ?? execution.item.oQueLimpar}`,
        description: `Semana de ${formatDateDisplay(getWeekStartDateForDate(execution.dataExecucao))}. Quando: ${formatWeeklyExecutionQuando(execution)}.`,
        status,
        responsible: execution.assinaturaSupervisor || execution.assinaturaResponsavel || undefined,
        dateTime: execution.assinaturaResponsavelDataHora
          ? formatDateTimeDisplay(execution.assinaturaResponsavelDataHora)
          : formatDateDisplay(execution.dataExecucao),
        href
      };

      if (hasResponsible) {
        if (execution.status === StatusPlanoLimpeza.AGUARDANDO_SUPERVISOR) {
          stats.waitingSupervisor = (stats.waitingSupervisor ?? 0) + 1;
        }
        addCompleted(stats, detail);
      } else {
        addPending(stats, detail, status);
      }
    }
  }

  for (const execution of execucoes) {
    if (!execution.item.ativo || execution.item.excluidoEm) {
      continue;
    }

    const key = keyFor(getWeekStartDateForDate(execution.dataExecucao), execution.itemId);
    if (expectedKeys.has(key)) {
      continue;
    }

    const hasResponsible = execution.assinaturaResponsavel.trim().length > 0;
    const status = hasResponsible
      ? cleaningStatusLabel(execution.status)
      : "Aguardando responsável";
    const detail = {
      id: `${moduleInfo.id}:${execution.id}`,
      moduleId: moduleInfo.id,
      moduleName: moduleInfo.name,
      title: `${execution.area} | ${execution.itemDescricao ?? execution.item.oQueLimpar}`,
      description: `Execução existente fora da configuração ativa atual. Quando: ${formatWeeklyExecutionQuando(execution)}.`,
      status,
      responsible: execution.assinaturaSupervisor || execution.assinaturaResponsavel || undefined,
      dateTime: execution.assinaturaResponsavelDataHora
        ? formatDateTimeDisplay(execution.assinaturaResponsavelDataHora)
        : formatDateDisplay(execution.dataExecucao),
      href: `${moduleInfo.href}?filtroData=${formatDateInput(execution.dataExecucao)}`
    };

    if (hasResponsible) {
      if (execution.status === StatusPlanoLimpeza.AGUARDANDO_SUPERVISOR) {
        stats.waitingSupervisor = (stats.waitingSupervisor ?? 0) + 1;
      }
      addCompleted(stats, detail);
    } else {
      addPending(stats, detail, status);
    }
  }

  return stats;
}

async function buildMonthlyClosingCard(params: {
  range: DateOnlyRange;
}): Promise<DashboardSummaryCard> {
  const completedDetails: DashboardDetailItem[] = [];
  const pendingDetails: DashboardDetailItem[] = [];
  let totalClosures = 0;
  let completedClosures = 0;
  let pendingClosures = 0;

  for (const month of enumerateMonthRanges(params.range)) {
    const [
      fechamentoHortifruti,
      fechamentoTemperatura,
      fechamentoOleo,
      fechamentoRastreabilidade,
      fechamentoLimpezaDiaria,
      fechamentoLimpezaSemanal,
      fechamentoBuffet,
      countHortifruti,
      countTemperatura,
      countOleo,
      countRastreabilidade,
      countLimpezaDiaria,
      countLimpezaSemanal,
      countBuffet
    ] = await Promise.all([
      prisma.higienizacaoHortifrutiFechamento.findUnique({
        where: { mes_ano: { mes: month.mes, ano: month.ano } }
      }),
      prisma.controleTemperaturaEquipamentoFechamento.findUnique({
        where: { mes_ano: { mes: month.mes, ano: month.ano } }
      }),
      prisma.controleQualidadeOleoFechamento.findUnique({
        where: { mes_ano: { mes: month.mes, ano: month.ano } }
      }),
      prisma.rastreabilidadeRecebimentoFechamento.findUnique({
        where: { mes_ano: { mes: month.mes, ano: month.ano } }
      }),
      prisma.planoLimpezaFechamento.findUnique({
        where: {
          tipo_mes_ano: {
            tipo: TipoPlanoLimpeza.DIARIO,
            mes: month.mes,
            ano: month.ano
          }
        }
      }),
      prisma.planoLimpezaFechamento.findUnique({
        where: {
          tipo_mes_ano: {
            tipo: TipoPlanoLimpeza.SEMANAL,
            mes: month.mes,
            ano: month.ano
          }
        }
      }),
      prisma.controleBuffetAmostraFechamento.findUnique({
        where: { mes_ano: { mes: month.mes, ano: month.ano } }
      }),
      prisma.higienizacaoHortifruti.count({
        where: { data: { gte: month.range.start, lte: month.range.end } }
      }),
      prisma.controleTemperaturaEquipamento.count({
        where: { data: { gte: month.range.start, lte: month.range.end } }
      }),
      prisma.controleQualidadeOleoRegistro.count({
        where: { data: { gte: month.range.start, lte: month.range.end } }
      }),
      prisma.rastreabilidadeRecebimentoNota.count({
        where: { data: { gte: month.range.start, lte: month.range.end } }
      }),
      prisma.planoLimpezaDiarioRegistro.count({
        where: { data: { gte: month.range.start, lte: month.range.end } }
      }),
      prisma.planoLimpezaSemanalExecucao.count({
        where: { dataExecucao: { gte: month.range.start, lte: month.range.end } }
      }),
      prisma.controleBuffetAmostraRegistro.count({
        where: { data: { gte: month.range.start, lte: month.range.end } }
      })
    ]);

    const monthLabel = `${String(month.mes).padStart(2, "0")}/${month.ano}`;
    const closureModules = [
      {
        id: "fechamento-hortifruti",
        name: MODULES.hortifruti.name,
        href: MODULES.hortifruti.href,
        status: fechamentoHortifruti?.status,
        count: countHortifruti
      },
      {
        id: "fechamento-temperatura",
        name: MODULES.temperatura.name,
        href: MODULES.temperatura.href,
        status: fechamentoTemperatura?.status,
        count: countTemperatura
      },
      {
        id: "fechamento-oleo",
        name: MODULES.oleo.name,
        href: MODULES.oleo.href,
        status: fechamentoOleo?.status,
        count: countOleo
      },
      {
        id: "fechamento-rastreabilidade",
        name: MODULES.rastreabilidade.name,
        href: MODULES.rastreabilidade.href,
        status: fechamentoRastreabilidade?.status,
        count: countRastreabilidade
      },
      {
        id: "fechamento-limpeza-diaria",
        name: MODULES.limpezaDiaria.name,
        href: MODULES.limpezaDiaria.href,
        status: fechamentoLimpezaDiaria?.status,
        count: countLimpezaDiaria
      },
      {
        id: "fechamento-limpeza-semanal",
        name: MODULES.limpezaSemanal.name,
        href: MODULES.limpezaSemanal.href,
        status: fechamentoLimpezaSemanal?.status,
        count: countLimpezaSemanal
      },
      {
        id: "fechamento-buffet",
        name: MODULES.buffet.name,
        href: MODULES.buffet.href,
        status: fechamentoBuffet?.status,
        count: countBuffet
      }
    ];

    for (const item of closureModules) {
      totalClosures += 1;
      const detail: DashboardDetailItem = {
        id: `${item.id}:${monthLabel}`,
        moduleId: item.id,
        moduleName: "Fechamentos Mensais",
        title: `${item.name} | ${monthLabel}`,
        description:
          item.count > 0
            ? `${item.count} registro(s) no período.`
            : "Sem registros no período.",
        status: item.status === "ASSINADO" ? "Concluído" : "Pendente",
        dateTime: monthLabel,
        href: item.href
      };

      if (item.status === "ASSINADO") {
        completedClosures += 1;
        addDetail(completedDetails, detail);
      } else {
        pendingClosures += 1;
        addDetail(pendingDetails, detail);
      }
    }
  }

  return buildSummaryCard({
    id: "mensal",
    title: "Fechamentos Mensais",
    description: "Assinaturas mensais dos módulos com fechamento implementado.",
    total: totalClosures,
    completed: completedClosures,
    pending: pendingClosures,
    pendingDetails,
    completedDetails
  });
}

async function buildMaintenanceStats(params: {
  user: AuthenticatedUser;
  range: { start: Date; end: Date };
}): Promise<ModuleStats> {
  const moduleInfo = MODULES.chamados;
  const stats = moduleStatsBase(moduleInfo);
  const colaboradorScope =
    params.user.perfil === "COLABORADOR" ? { criadoPorId: params.user.id } : {};

  const [abertos, emAndamento, concluidos] = await Promise.all([
    prisma.chamadoManutencao.findMany({
      where: {
        ...colaboradorScope,
        status: StatusChamadoManutencao.ABERTO
      },
      select: {
        id: true,
        titulo: true,
        areaLocal: true,
        status: true,
        criadoPorNome: true,
        dataHoraCriacao: true
      },
      orderBy: [{ dataHoraCriacao: "desc" }]
    }),
    prisma.chamadoManutencao.findMany({
      where: {
        ...colaboradorScope,
        status: StatusChamadoManutencao.EM_ANDAMENTO
      },
      select: {
        id: true,
        titulo: true,
        areaLocal: true,
        status: true,
        criadoPorNome: true,
        dataHoraCriacao: true
      },
      orderBy: [{ dataHoraCriacao: "desc" }]
    }),
    prisma.chamadoManutencao.findMany({
      where: {
        ...colaboradorScope,
        status: StatusChamadoManutencao.CONCLUIDO,
        dataHoraConclusao: {
          gte: params.range.start,
          lte: params.range.end
        }
      },
      select: {
        id: true,
        titulo: true,
        areaLocal: true,
        status: true,
        criadoPorNome: true,
        dataHoraConclusao: true
      },
      orderBy: [{ dataHoraConclusao: "desc" }]
    })
  ]);

  for (const chamado of abertos) {
    addPending(
      stats,
      {
        id: `${moduleInfo.id}:${chamado.id}`,
        moduleId: moduleInfo.id,
        moduleName: moduleInfo.name,
        title: chamado.titulo,
        description: chamado.areaLocal,
        status: maintenanceStatusLabel(chamado.status),
        responsible: chamado.criadoPorNome,
        dateTime: formatDateTimeDisplay(chamado.dataHoraCriacao),
        href: `${moduleInfo.href}/${chamado.id}`
      },
      "Pendente"
    );
  }

  for (const chamado of emAndamento) {
    addPending(
      stats,
      {
        id: `${moduleInfo.id}:${chamado.id}`,
        moduleId: moduleInfo.id,
        moduleName: moduleInfo.name,
        title: chamado.titulo,
        description: chamado.areaLocal,
        status: maintenanceStatusLabel(chamado.status),
        responsible: chamado.criadoPorNome,
        dateTime: formatDateTimeDisplay(chamado.dataHoraCriacao),
        href: `${moduleInfo.href}/${chamado.id}`
      },
      "Em andamento"
    );
  }

  for (const chamado of concluidos) {
    addCompleted(stats, {
      id: `${moduleInfo.id}:${chamado.id}`,
      moduleId: moduleInfo.id,
      moduleName: moduleInfo.name,
      title: chamado.titulo,
      description: chamado.areaLocal,
      status: "Concluído",
      responsible: chamado.criadoPorNome,
      dateTime: chamado.dataHoraConclusao
        ? formatDateTimeDisplay(chamado.dataHoraConclusao)
        : undefined,
      href: `${moduleInfo.href}/${chamado.id}`
    });
  }

  return stats;
}

export async function getOperationalDashboardData(params: {
  user: AuthenticatedUser;
  period: DashboardPeriod;
  startDate?: string;
  endDate?: string;
  includeDetails?: boolean;
  includeInsights?: boolean;
}): Promise<DashboardData> {
  const now = getCurrentSystemDateTime();
  const ranges = getRanges(params.period, now, {
    startDate: params.startDate,
    endDate: params.endDate
  });
  const profileView = getProfileView(params.user);
  const includeDetails = params.includeDetails ?? false;
  const includeInsights = params.includeInsights ?? false;

  const [
    hortifrutiStats,
    temperatureStats,
    oilStats,
    receivingStats,
    buffetStats,
    dailyCleaningStats,
    weeklyCleaningStats,
    maintenanceStats,
    monthlyCard
  ] = await Promise.all([
    safeModuleStats(MODULES.hortifruti, () => buildHortifrutiStats(ranges.daily)),
    safeModuleStats(MODULES.temperatura, () => buildTemperatureStats(ranges.daily)),
    safeModuleStats(MODULES.oleo, () => buildOilStats(ranges.daily)),
    safeModuleStats(MODULES.rastreabilidade, () =>
      buildReceivingStats(ranges.daily, ranges.openPendencies)
    ),
    safeModuleStats(MODULES.buffet, () => buildBuffetStats(ranges.daily, ranges.openPendencies)),
    safeModuleStats(MODULES.limpezaDiaria, () =>
      buildDailyCleaningStats(ranges.daily, ranges.openPendencies)
    ),
    safeModuleStats(MODULES.limpezaSemanal, () =>
      buildWeeklyCleaningStats(ranges.weekly)
    ),
    safeModuleStats(MODULES.chamados, () =>
      buildMaintenanceStats({ user: params.user, range: ranges.dateTime })
    ),
    profileView.showManagement
      ? safeSummaryCard(
          {
            id: "mensal",
            title: "Fechamentos Mensais",
            description: "Assinaturas mensais dos módulos com fechamento implementado.",
            total: 0,
            completed: 0,
            pending: 0,
            pendingDetails: [],
            completedDetails: []
          },
          () =>
            buildMonthlyClosingCard({
              range: ranges.monthly
            })
        )
      : Promise.resolve(null)
  ]);

  const dailyStats = [
    hortifrutiStats,
    temperatureStats,
    oilStats,
    receivingStats,
    buffetStats,
    dailyCleaningStats
  ];

  const dailyCard = combineStatsToCard({
    id: "diarias",
    title: "Tarefas Diárias",
    description: `Rotinas de ${formatRangeLabel(ranges.daily)} e pendências abertas relevantes.`,
    href: "/",
    stats: dailyStats
  });

  const weeklyCard = combineStatsToCard({
    id: "semanais",
    title: "Tarefas Semanais",
    description: `Plano semanal de ${formatRangeLabel(ranges.weekly)} e pendências abertas relevantes.`,
    href: MODULES.limpezaSemanal.href,
    stats: [weeklyCleaningStats]
  });

  const maintenanceCard = buildSummaryCard({
    id: "chamados",
    title: "Chamados de Manutenção",
    description:
      params.user.perfil === "COLABORADOR"
        ? "Seus chamados abertos, em andamento e concluídos no período."
        : "Chamados abertos, em andamento e concluídos no período.",
    href: MODULES.chamados.href,
    total: maintenanceStats.total,
    completed: maintenanceStats.completed,
    pending: maintenanceStats.pending,
    inProgress: maintenanceStats.inProgress,
    pendingDetails: maintenanceStats.pendingDetails,
    completedDetails: maintenanceStats.completedDetails
  });

  const cardsWithDetails = profileView.showManagement
    ? [dailyCard, weeklyCard, monthlyCard, maintenanceCard].filter(
        (card): card is DashboardSummaryCard => Boolean(card)
      )
    : [dailyCard, weeklyCard, maintenanceCard];
  const cards = includeDetails ? cardsWithDetails : cardsWithDetails.map(stripCardDetails);

  const moduleSummaries = [
    buildModuleSummary(hortifrutiStats),
    buildModuleSummary(temperatureStats),
    buildModuleSummary(oilStats),
    buildModuleSummary(receivingStats),
    buildModuleSummary(buffetStats),
    buildModuleSummary(dailyCleaningStats),
    buildModuleSummary(weeklyCleaningStats),
    buildModuleSummary(maintenanceStats)
  ];
  const insights = includeInsights
    ? await buildOperationalInsights({
        user: params.user,
        profileView,
        ranges,
        dailyCard,
        weeklyCard,
        monthlyCard,
        maintenanceCard,
        includeDetails
      })
    : {
        riskOverview: null,
        insightSummaries: [],
        evolution: []
      };

  return {
    period: params.period,
    periodLabel: ranges.periodLabel,
    customStartDate: ranges.customStartDate,
    customEndDate: ranges.customEndDate,
    filterError: ranges.filterError,
    generatedAt: formatDateTimeDisplay(now),
    profileView,
    cards,
    riskOverview: insights.riskOverview,
    insightSummaries: insights.insightSummaries,
    evolution: insights.evolution,
    myPendencies: [],
    moduleSummaries,
    scope: {
      daily: formatRangeLabel(ranges.daily),
      weekly: formatRangeLabel(ranges.weekly),
      monthly: ranges.monthlyLabel,
      maintenance:
        params.user.perfil === "COLABORADOR"
          ? "Chamados criados pelo usuário logado"
          : `Chamados abertos atuais e concluídos em ${formatRangeLabel(ranges.daily)}`
    }
  };
}

async function buildNonConformitySummary(params: {
  ranges: DashboardRanges;
}): Promise<DashboardInsightSummary> {
  const summary = createInsightSummary({
    id: "nao-conformidades",
    title: "Não Conformidades",
    description: "Ocorrências sanitárias e operacionais calculadas a partir dos registros."
  });

  const [
    temperaturas,
    oleos,
    recebimentos,
    notasPendentes,
    buffetRegistros,
    limpezasDiarias,
    limpezasSemanais,
    weeklyAreasForDashboard,
    chamadosOperacionais
  ] = await Promise.all([
    prisma.controleTemperaturaEquipamento.findMany({
      where: {
        data: { gte: params.ranges.daily.start, lte: params.ranges.daily.end }
      },
      select: {
        id: true,
        data: true,
        equipamento: true,
        turno: true,
        statusOperacionalEquipamento: true,
        status: true,
        acaoCorretiva: true,
        fotoUrl: true,
        fotoBase64: true,
        fotoMimeType: true,
        responsavel: true,
        createdAt: true
      },
      orderBy: [{ createdAt: "desc" }]
    }),
    prisma.controleQualidadeOleoRegistro.findMany({
      where: {
        data: { gte: params.ranges.daily.start, lte: params.ranges.daily.end },
        OR: [
          { status: { in: [StatusQualidadeOleo.ATENCAO, StatusQualidadeOleo.ULTIMA_UTILIZACAO, StatusQualidadeOleo.DESCARTAR] } },
          { temperaturaCritica: true }
        ]
      },
      select: {
        id: true,
        data: true,
        fitaOleo: true,
        status: true,
        temperaturaCritica: true,
        orientacao: true,
        responsavel: true,
        createdAt: true
      },
      orderBy: [{ createdAt: "desc" }]
    }),
    prisma.rastreabilidadeRecebimentoRegistro.findMany({
      where: {
        data: { gte: params.ranges.daily.start, lte: params.ranges.daily.end },
        OR: [
          { statusGeral: StatusRecebimento.NAO_CONFORME },
          { temperaturaStatus: ConformidadeRecebimento.NAO_CONFORME },
          { transporteEntregador: ConformidadeRecebimento.NAO_CONFORME },
          { aspectoSensorial: ConformidadeRecebimento.NAO_CONFORME },
          { embalagem: ConformidadeRecebimento.NAO_CONFORME },
          { acaoCorretiva: { not: null } }
        ]
      },
      select: {
        id: true,
        data: true,
        produto: true,
        fornecedor: true,
        notaFiscal: true,
        statusGeral: true,
        temperaturaStatus: true,
        transporteEntregador: true,
        aspectoSensorial: true,
        embalagem: true,
        acaoCorretiva: true,
        responsavelRecebimento: true,
        notaId: true,
        updatedAt: true
      },
      orderBy: [{ updatedAt: "desc" }]
    }),
    prisma.rastreabilidadeRecebimentoNota.findMany({
      where: {
        data: { gte: params.ranges.openPendencies.start, lte: params.ranges.daily.end },
        statusNota: { not: StatusNotaRecebimento.FINALIZADA }
      },
      select: {
        id: true,
        data: true,
        fornecedor: true,
        notaFiscal: true,
        statusNota: true,
        responsavelGeral: true,
        updatedAt: true
      },
      orderBy: [{ data: "asc" }]
    }),
    prisma.controleBuffetAmostraRegistro.findMany({
      where: {
        data: { gte: params.ranges.daily.start, lte: params.ranges.daily.end },
        OR: [
          { statusTemperatura: { in: [StatusTemperaturaBuffetAmostra.ALERTA, StatusTemperaturaBuffetAmostra.CRITICO] } },
          { acaoCorretiva: { not: null } }
        ]
      },
      select: {
        id: true,
        data: true,
        servicoId: true,
        itemNome: true,
        status: true,
        statusTemperatura: true,
        acaoCorretiva: true,
        responsavelNome: true,
        dataHoraRegistro: true,
        servico: {
          select: {
            nome: true,
            tipoServico: true,
            dataInicio: true,
            dataFim: true
          }
        }
      },
      orderBy: [{ dataHoraRegistro: "desc" }]
    }),
    prisma.planoLimpezaDiarioRegistro.findMany({
      where: {
        data: { gte: params.ranges.openPendencies.start, lte: params.ranges.daily.end },
        itemId: { not: null },
        item: {
          is: {
            ativo: true,
            excluidoEm: null,
            area: { ativo: true }
          }
        }
      },
      select: {
        id: true,
        data: true,
        area: true,
        itemId: true,
        itemDescricao: true,
        status: true,
        assinaturaResponsavel: true,
        updatedAt: true
      },
      orderBy: [{ data: "asc" }, { updatedAt: "desc" }]
    }),
    prisma.planoLimpezaSemanalExecucao.findMany({
      where: {
        dataExecucao: {
          gte: params.ranges.weekly.start,
          lte: params.ranges.weekly.end
        },
        assinaturaResponsavel: "",
        item: { ativo: true, excluidoEm: null }
      },
      select: {
        id: true,
        dataExecucao: true,
        area: true,
        itemDescricao: true,
        status: true,
        assinaturaResponsavel: true,
        assinaturaResponsavelDataHora: true,
        quando: true,
        item: { select: { oQueLimpar: true } },
        updatedAt: true
      },
      orderBy: [{ dataExecucao: "asc" }, { updatedAt: "desc" }]
    }),
    prisma.planoLimpezaSemanalArea.findMany({
      where: { ativo: true, excluidoEm: null },
      select: { nome: true }
    }),
    prisma.chamadoManutencao.findMany({
      where: {
        status: { in: [StatusChamadoManutencao.ABERTO, StatusChamadoManutencao.EM_ANDAMENTO] },
        origem: { not: OrigemChamadoManutencao.MANUAL },
        contextoRegistroId: { not: null }
      },
      select: {
        id: true,
        titulo: true,
        areaLocal: true,
        origem: true,
        contextoModulo: true,
        contextoRegistroId: true,
        prioridade: true,
        status: true,
        criadoPorNome: true,
        dataHoraCriacao: true
      },
      orderBy: [{ dataHoraCriacao: "asc" }]
    })
  ]);
  const temperaturasNaoConformes = dedupeTemperatureMeasurements(temperaturas).filter(
    (record) =>
      isOperationalTemperatureRecord(record) &&
      record.status !== StatusTemperaturaEquipamento.CONFORME
  );
  const activeWeeklyAreaNames = new Set(
    weeklyAreasForDashboard.map((area) => area.nome)
  );
  const limpezasSemanaisAtivas = limpezasSemanais.filter((record) =>
    activeWeeklyAreaNames.has(record.area)
  );
  const limpezasDiariasPorItem = new Map<string, (typeof limpezasDiarias)[number]>();

  for (const record of limpezasDiarias) {
    if (!record.itemId) {
      continue;
    }

    const key = `${dateOnlyKey(record.data)}|${record.itemId}`;
    const current = limpezasDiariasPorItem.get(key);
    const currentSigned = Boolean(current?.assinaturaResponsavel.trim());
    const candidateSigned = Boolean(record.assinaturaResponsavel.trim());

    if (
      !current ||
      (candidateSigned && !currentSigned) ||
      (candidateSigned === currentSigned &&
        record.updatedAt.getTime() > current.updatedAt.getTime())
    ) {
      limpezasDiariasPorItem.set(key, record);
    }
  }

  const limpezasDiariasPendentes = Array.from(limpezasDiariasPorItem.values())
    .filter((record) => record.status !== StatusPlanoLimpeza.CONCLUIDO)
    .sort((a, b) => {
      const dateDiff = a.data.getTime() - b.data.getTime();
      return dateDiff !== 0 ? dateDiff : b.updatedAt.getTime() - a.updatedAt.getTime();
    });

  for (const record of temperaturasNaoConformes) {
    const hasEvidence = hasImageEvidence({
      url: record.fotoUrl,
      mimeType: record.fotoMimeType,
      base64: record.fotoBase64
    });
    addInsightItem(summary, {
      id: `nc-temperatura:${record.id}`,
      moduleId: MODULES.temperatura.id,
      moduleName: MODULES.temperatura.name,
      title: `${record.equipamento} | ${temperatureShiftLabel(record.turno)}`,
      description: hasEvidence
        ? "Temperatura fora da faixa registrada."
        : "Temperatura fora da faixa com foto obrigatória ausente.",
      status: "Não conformidade",
      responsible: record.responsavel,
      dateTime: formatDateTimeDisplay(record.createdAt),
      href: `${MODULES.temperatura.href}?filtroData=${formatDateInput(record.data)}&filtroEquipamento=${encodeURIComponent(record.equipamento)}`,
      severity: record.status === StatusTemperaturaEquipamento.CRITICO || !hasEvidence ? "Crítico" : "Atenção",
      occurrenceType: record.status === StatusTemperaturaEquipamento.CRITICO ? "Temperatura crítica" : "Temperatura em alerta",
      correctiveAction: record.acaoCorretiva ?? undefined,
      hasEvidence
    });
  }

  for (const record of oleos) {
    const critical =
      record.status === StatusQualidadeOleo.DESCARTAR || record.temperaturaCritica;
    addInsightItem(summary, {
      id: `nc-oleo:${record.id}`,
      moduleId: MODULES.oleo.id,
      moduleName: MODULES.oleo.name,
      title: record.fitaOleo ? `Fita ${record.fitaOleo}` : "Registro do óleo",
      description: record.temperaturaCritica
        ? "Temperatura do óleo acima do limite."
        : record.orientacao,
      status: "Não conformidade",
      responsible: record.responsavel,
      dateTime: formatDateTimeDisplay(record.createdAt),
      href: `${MODULES.oleo.href}?filtroData=${formatDateInput(record.data)}`,
      severity: critical ? "Crítico" : "Atenção",
      occurrenceType: critical ? "Óleo fora do padrão crítico" : "Óleo fora do padrão",
      correctiveAction: record.orientacao
    });
  }

  for (const record of recebimentos) {
    const failures = [
      record.temperaturaStatus === ConformidadeRecebimento.NAO_CONFORME ? "temperatura" : "",
      record.transporteEntregador === ConformidadeRecebimento.NAO_CONFORME ? "transporte" : "",
      record.aspectoSensorial === ConformidadeRecebimento.NAO_CONFORME ? "aspecto" : "",
      record.embalagem === ConformidadeRecebimento.NAO_CONFORME ? "embalagem" : ""
    ].filter(Boolean);
    addInsightItem(summary, {
      id: `nc-recebimento:${record.id}`,
      moduleId: MODULES.rastreabilidade.id,
      moduleName: MODULES.rastreabilidade.name,
      title: `${record.produto} | NF ${record.notaFiscal}`,
      description:
        failures.length > 0
          ? `Não conforme em: ${failures.join(", ")}.`
          : `Fornecedor: ${record.fornecedor}.`,
      status: "Não conformidade",
      responsible: record.responsavelRecebimento ?? undefined,
      dateTime: formatDateDisplay(record.data),
      href: record.notaId
        ? `${MODULES.rastreabilidade.href}/nota/${record.notaId}`
        : MODULES.rastreabilidade.href,
      severity: failures.includes("temperatura") || failures.includes("embalagem") ? "Crítico" : "Atenção",
      occurrenceType: "Recebimento não conforme",
      correctiveAction: record.acaoCorretiva ?? undefined
    });
  }

  for (const note of notasPendentes) {
    const ageInDays = daysBetweenDates(note.data, params.ranges.daily.end);
    if (ageInDays < 2) {
      continue;
    }

    addInsightItem(summary, {
      id: `nc-nota-pendente:${note.id}`,
      moduleId: MODULES.rastreabilidade.id,
      moduleName: MODULES.rastreabilidade.name,
      title: `NF ${note.notaFiscal} | ${note.fornecedor}`,
      description: `Nota aguardando conferência há ${ageInDays} dia(s).`,
      status: noteStatusLabel(note.statusNota),
      responsible: note.responsavelGeral ?? undefined,
      dateTime: formatDateDisplay(note.data),
      href: `${MODULES.rastreabilidade.href}/nota/${note.id}`,
      severity: ageInDays >= 5 ? "Crítico" : "Atenção",
      occurrenceType: "Nota sem conferência"
    });
  }

  for (const record of buffetRegistros) {
    const discarded = hasUsefulText(record.acaoCorretiva) &&
      record.acaoCorretiva.toLocaleLowerCase("pt-BR").includes("descart");
    addInsightItem(summary, {
      id: `nc-buffet:${record.id}`,
      moduleId: MODULES.buffet.id,
      moduleName: MODULES.buffet.name,
      title: `${record.servico.nome} | ${record.itemNome}`,
      description:
        record.statusTemperatura === StatusTemperaturaBuffetAmostra.CRITICO
          ? "Temperatura crítica no item do serviço."
          : "Ocorrência com temperatura ou ação corretiva.",
      status:
        record.status === StatusItemBuffetAmostra.ASSINADO
          ? "Concluído"
          : buffetStatusLabel(record.status),
      responsible: record.responsavelNome,
      dateTime: formatDateTimeDisplay(record.dataHoraRegistro),
      href: `${MODULES.buffet.href}/servico/${record.servicoId}?data=${formatDateInput(record.data)}`,
      severity:
        record.statusTemperatura === StatusTemperaturaBuffetAmostra.CRITICO || discarded
          ? "Crítico"
          : "Atenção",
      occurrenceType: discarded ? "Alimento descartado" : "Buffet/amostra fora da regra",
      correctiveAction: record.acaoCorretiva ?? undefined
    });
  }

  for (const record of limpezasDiariasPendentes) {
    addInsightItem(summary, {
      id: `nc-limpeza-diaria:${record.id}`,
      moduleId: MODULES.limpezaDiaria.id,
      moduleName: MODULES.limpezaDiaria.name,
      title: `${record.area} | ${record.itemDescricao ?? "Item/local diário"}`,
      description:
        record.status === StatusPlanoLimpeza.AGUARDANDO_SUPERVISOR
          ? "Limpeza aguardando supervisão."
          : "Limpeza não realizada ou sem assinatura do responsável.",
      status: cleaningStatusLabel(record.status),
      responsible: record.assinaturaResponsavel || undefined,
      dateTime: formatDateDisplay(record.data),
      href: `${MODULES.limpezaDiaria.href}?filtroData=${formatDateInput(record.data)}&filtroArea=${encodeURIComponent(record.area)}`,
      severity: record.status === StatusPlanoLimpeza.AGUARDANDO_SUPERVISOR ? "Atenção" : "Atenção",
      occurrenceType: "Limpeza pendente"
    });
  }

  for (const record of limpezasSemanaisAtivas) {
    addInsightItem(summary, {
      id: `nc-limpeza-semanal:${record.id}`,
      moduleId: MODULES.limpezaSemanal.id,
      moduleName: MODULES.limpezaSemanal.name,
      title: `${record.area} | ${record.itemDescricao ?? record.item.oQueLimpar}`,
      description: `Item semanal pendente. Quando: ${formatWeeklyExecutionQuando(record)}.`,
      status: "Aguardando responsável",
      responsible: record.assinaturaResponsavel || undefined,
      dateTime: formatDateDisplay(record.dataExecucao),
      href: `${MODULES.limpezaSemanal.href}?filtroData=${formatDateInput(record.dataExecucao)}&filtroArea=${encodeURIComponent(record.area)}`,
      severity: "Atenção",
      occurrenceType: "Limpeza semanal pendente"
    });
  }

  for (const chamado of chamadosOperacionais) {
    addInsightItem(summary, {
      id: `nc-chamado:${chamado.id}`,
      moduleId: MODULES.chamados.id,
      moduleName: MODULES.chamados.name,
      title: chamado.titulo,
      description: `${chamado.areaLocal} | Origem: ${chamado.origem} | Vínculo: ${
        chamado.contextoRegistroId ?? chamado.contextoModulo ?? "módulo"
      }.`,
      status: maintenanceStatusLabel(chamado.status),
      responsible: chamado.criadoPorNome,
      dateTime: formatDateTimeDisplay(chamado.dataHoraCriacao),
      href: `${MODULES.chamados.href}/${chamado.id}`,
      severity: chamado.prioridade === PrioridadeChamadoManutencao.ALTA ? "Crítico" : "Atenção",
      occurrenceType: "Chamado operacional aberto",
      relatedTicketStatus: maintenanceStatusLabel(chamado.status)
    });
  }

  return summary;
}

async function buildCorrectiveActionsSummary(params: {
  ranges: DashboardRanges;
}): Promise<DashboardInsightSummary> {
  const summary = createInsightSummary({
    id: "acoes-corretivas",
    title: "Ações Corretivas",
    description: "Registros do período que possuem ação corretiva preenchida."
  });

  const [temperaturas, recebimentos, buffetRegistros] = await Promise.all([
    prisma.controleTemperaturaEquipamento.findMany({
      where: {
        data: { gte: params.ranges.daily.start, lte: params.ranges.daily.end }
      },
      select: {
        id: true,
        data: true,
        equipamento: true,
        turno: true,
        statusOperacionalEquipamento: true,
        status: true,
        acaoCorretiva: true,
        fotoUrl: true,
        fotoBase64: true,
        fotoMimeType: true,
        responsavel: true,
        createdAt: true
      },
      orderBy: [{ createdAt: "desc" }]
    }),
    prisma.rastreabilidadeRecebimentoRegistro.findMany({
      where: {
        data: { gte: params.ranges.daily.start, lte: params.ranges.daily.end },
        acaoCorretiva: { not: null }
      },
      select: {
        id: true,
        data: true,
        produto: true,
        fornecedor: true,
        notaFiscal: true,
        acaoCorretiva: true,
        responsavelRecebimento: true,
        statusGeral: true,
        notaId: true,
        updatedAt: true
      },
      orderBy: [{ updatedAt: "desc" }]
    }),
    prisma.controleBuffetAmostraRegistro.findMany({
      where: {
        data: { gte: params.ranges.daily.start, lte: params.ranges.daily.end },
        acaoCorretiva: { not: null }
      },
      select: {
        id: true,
        data: true,
        servicoId: true,
        itemNome: true,
        status: true,
        statusTemperatura: true,
        acaoCorretiva: true,
        responsavelNome: true,
        dataHoraRegistro: true,
        servico: {
          select: {
            nome: true,
            tipoServico: true,
            dataInicio: true,
            dataFim: true
          }
        }
      },
      orderBy: [{ dataHoraRegistro: "desc" }]
    })
  ]);

  const temperaturasComAcao = dedupeTemperatureMeasurements(temperaturas).filter(
    (record) =>
      isOperationalTemperatureRecord(record) &&
      record.status !== StatusTemperaturaEquipamento.CONFORME &&
      hasUsefulText(record.acaoCorretiva)
  );
  const temperaturaIds = temperaturasComAcao.map((record) => String(record.id));
  const buffetIds = buffetRegistros.map((record) => String(record.id));
  const receivingIds = recebimentos.map((record) => String(record.id));
  const relatedTickets = await prisma.chamadoManutencao.findMany({
    where: {
      contextoRegistroId: {
        in: [...temperaturaIds, ...buffetIds, ...receivingIds]
      }
    },
    select: {
      origem: true,
      contextoModulo: true,
      contextoRegistroId: true,
      status: true
    }
  });
  const ticketStatusByRecordContext = new Map<string, string>();
  for (const ticket of relatedTickets) {
    const key = maintenanceContextKey(
      ticket.contextoModulo ?? ticket.origem,
      ticket.contextoRegistroId
    );
    if (key && !ticketStatusByRecordContext.has(key)) {
      ticketStatusByRecordContext.set(key, maintenanceStatusLabel(ticket.status));
    }
  }

  for (const record of temperaturasComAcao) {
    addInsightItem(summary, {
      id: `ac-temperatura:${record.id}`,
      moduleId: MODULES.temperatura.id,
      moduleName: MODULES.temperatura.name,
      title: `${record.equipamento} | ${temperatureShiftLabel(record.turno)}`,
      description: "Temperatura fora da faixa com ação corretiva.",
      status: temperatureStatusLabel(record.status),
      responsible: record.responsavel,
      dateTime: formatDateTimeDisplay(record.createdAt),
      href: `${MODULES.temperatura.href}?filtroData=${formatDateInput(record.data)}&filtroEquipamento=${encodeURIComponent(record.equipamento)}`,
      severity: record.status === StatusTemperaturaEquipamento.CRITICO ? "Crítico" : "Atenção",
      occurrenceType: "Ação corretiva de temperatura",
      correctiveAction: record.acaoCorretiva ?? undefined,
      hasEvidence: hasImageEvidence({
        url: record.fotoUrl,
        mimeType: record.fotoMimeType,
        base64: record.fotoBase64
      }),
      relatedTicketStatus:
        ticketStatusByRecordContext.get(
          maintenanceContextKey(OrigemChamadoManutencao.TEMPERATURA, record.id) ?? ""
        )
    });
  }

  for (const record of recebimentos) {
    if (!hasUsefulText(record.acaoCorretiva)) {
      continue;
    }

    addInsightItem(summary, {
      id: `ac-recebimento:${record.id}`,
      moduleId: MODULES.rastreabilidade.id,
      moduleName: MODULES.rastreabilidade.name,
      title: `${record.produto} | NF ${record.notaFiscal}`,
      description: `Fornecedor: ${record.fornecedor}.`,
      status:
        record.statusGeral === StatusRecebimento.CONFORME
          ? "Concluído"
          : "Não conformidade",
      responsible: record.responsavelRecebimento ?? undefined,
      dateTime: formatDateDisplay(record.data),
      href: record.notaId
        ? `${MODULES.rastreabilidade.href}/nota/${record.notaId}`
        : MODULES.rastreabilidade.href,
      severity: record.statusGeral === StatusRecebimento.NAO_CONFORME ? "Atenção" : "Informativo",
      occurrenceType: "Ação corretiva de recebimento",
      correctiveAction: record.acaoCorretiva,
      relatedTicketStatus:
        ticketStatusByRecordContext.get(
          maintenanceContextKey(OrigemChamadoManutencao.RECEBIMENTO, record.id) ?? ""
        )
    });
  }

  for (const record of buffetRegistros) {
    if (!hasUsefulText(record.acaoCorretiva)) {
      continue;
    }

    const discarded = record.acaoCorretiva.toLocaleLowerCase("pt-BR").includes("descart");
    addInsightItem(summary, {
      id: `ac-buffet:${record.id}`,
      moduleId: MODULES.buffet.id,
      moduleName: MODULES.buffet.name,
      title: `${record.servico.nome} | ${record.itemNome}`,
      description: "Item de buffet/amostra com ação corretiva registrada.",
      status:
        record.status === StatusItemBuffetAmostra.ASSINADO
          ? "Concluído"
          : buffetStatusLabel(record.status),
      responsible: record.responsavelNome,
      dateTime: formatDateTimeDisplay(record.dataHoraRegistro),
      href: `${MODULES.buffet.href}/servico/${record.servicoId}?data=${formatDateInput(record.data)}`,
      severity:
        discarded || record.statusTemperatura === StatusTemperaturaBuffetAmostra.CRITICO
          ? "Crítico"
          : "Atenção",
      occurrenceType: discarded ? "Descarte registrado" : "Ação corretiva de buffet/amostras",
      correctiveAction: record.acaoCorretiva,
      relatedTicketStatus:
        ticketStatusByRecordContext.get(
          maintenanceContextKey(OrigemChamadoManutencao.BUFFET_AMOSTRAS, record.id) ?? ""
        )
    });
  }

  return summary;
}

function buildColaboradorAlerts(params: {
  dailyCard: DashboardSummaryCard;
  weeklyCard: DashboardSummaryCard;
  maintenanceCard: DashboardSummaryCard;
}): DashboardInsightSummary {
  const summary = createInsightSummary({
    id: "alertas-operacionais",
    title: "Alertas Operacionais",
    description: "Alertas operacionais vinculados às suas tarefas e chamados."
  });

  const addFromDetails = (items: DashboardDetailItem[], occurrenceType: string) => {
    for (const item of items) {
      addInsightItem(summary, {
        ...item,
        id: `alerta-colaborador:${item.id}`,
        severity: item.status === "Não conformidade" ? "Crítico" : "Atenção",
        occurrenceType
      });
    }
  };

  addFromDetails(params.dailyCard.pendingDetails, "Tarefa diária pendente");
  addFromDetails(params.weeklyCard.pendingDetails, "Tarefa semanal pendente");
  addFromDetails(params.maintenanceCard.pendingDetails, "Meu chamado pendente");

  if (summary.total === 0) {
    addInsightItem(summary, {
      id: "alerta-colaborador:sem-pendencias",
      moduleId: "dashboard",
      moduleName: "Dashboard",
      title: "Nenhum alerta operacional prioritário",
      description: "Não há pendências críticas vinculadas ao seu perfil neste período.",
      status: "Concluído",
      href: "/",
      severity: "Informativo",
      occurrenceType: "Operação sem alerta"
    });
  }

  return summary;
}

function buildManagementAlerts(params: {
  nonConformities: DashboardInsightSummary;
  correctiveActions: DashboardInsightSummary;
  dailyCard: DashboardSummaryCard;
  weeklyCard: DashboardSummaryCard;
  monthlyCard: DashboardSummaryCard | null;
  maintenanceCard: DashboardSummaryCard;
}): DashboardInsightSummary {
  const summary = createInsightSummary({
    id: "alertas-operacionais",
    title: "Alertas Operacionais",
    description: "Situações que precisam de acompanhamento rápido."
  });

  for (const item of params.nonConformities.details) {
    addInsightItem(summary, {
      ...item,
      id: `alerta-nc:${item.id}`,
      occurrenceType: item.occurrenceType
    });
  }

  if ((params.dailyCard.waitingResponsible ?? 0) > 0) {
    addInsightItem(summary, {
      id: "alerta-diario-responsavel",
      moduleId: MODULES.limpezaDiaria.id,
      moduleName: MODULES.limpezaDiaria.name,
      title: `${params.dailyCard.waitingResponsible} registro(s) aguardando responsável`,
      description: "Há rotinas diárias sem assinatura ou preenchimento.",
      status: "Aguardando responsável",
      href: MODULES.limpezaDiaria.href,
      severity: "Atenção",
      occurrenceType: "Assinatura pendente"
    });
  }

  const waitingSupervisor =
    (params.dailyCard.waitingSupervisor ?? 0) + (params.weeklyCard.waitingSupervisor ?? 0);
  if (waitingSupervisor > 0) {
    addInsightItem(summary, {
      id: "alerta-supervisor",
      moduleId: "assinaturas",
      moduleName: "Assinaturas",
      title: `${waitingSupervisor} registro(s) aguardando supervisor`,
      description: "Existem tarefas operacionais aguardando validação de supervisor.",
      status: "Aguardando supervisor",
      href: MODULES.limpezaDiaria.href,
      severity: "Atenção",
      occurrenceType: "Supervisão pendente"
    });
  }

  if (params.monthlyCard && params.monthlyCard.pending > 0) {
    addInsightItem(summary, {
      id: "alerta-fechamento",
      moduleId: "fechamentos",
      moduleName: "Fechamentos Mensais",
      title: `${params.monthlyCard.pending} fechamento(s) pendente(s)`,
      description: "Há módulos aguardando assinatura mensal.",
      status: "Pendente",
      href: "/",
      severity: "Atenção",
      occurrenceType: "Fechamento pendente"
    });
  }

  if (params.maintenanceCard.pending > 0) {
    addInsightItem(summary, {
      id: "alerta-chamados",
      moduleId: MODULES.chamados.id,
      moduleName: MODULES.chamados.name,
      title: `${params.maintenanceCard.pending} chamado(s) aberto(s) ou em andamento`,
      description: "Chamados pendentes de tratativa permanecem ativos.",
      status: "Pendente",
      href: MODULES.chamados.href,
      severity: params.maintenanceCard.pending >= 5 ? "Crítico" : "Atenção",
      occurrenceType: "Chamado pendente"
    });
  }

  if (params.correctiveActions.total > 0) {
    addInsightItem(summary, {
      id: "alerta-acoes-corretivas",
      moduleId: "acoes-corretivas",
      moduleName: "Ações Corretivas",
      title: `${params.correctiveActions.total} ação(ões) corretiva(s) no período`,
      description: "Acompanhe se as ações foram suficientes para encerrar as ocorrências.",
      status: "Não conformidade",
      href: "/",
      severity: params.correctiveActions.critical > 0 ? "Crítico" : "Atenção",
      occurrenceType: "Ação corretiva registrada"
    });
  }

  if (summary.total === 0) {
    addInsightItem(summary, {
      id: "alerta-operacao-em-dia",
      moduleId: "dashboard",
      moduleName: "Dashboard",
      title: "Operação sem alertas críticos",
      description: "Nenhum alerta operacional relevante foi encontrado no período.",
      status: "Concluído",
      href: "/",
      severity: "Informativo",
      occurrenceType: "Operação em dia"
    });
  }

  return summary;
}

function buildRiskOverview(params: {
  alertSummary: DashboardInsightSummary;
  nonConformities: DashboardInsightSummary;
  dailyCard: DashboardSummaryCard;
  weeklyCard: DashboardSummaryCard;
  maintenanceCard: DashboardSummaryCard;
}): DashboardInsightSummary {
  const criticalFactors =
    params.alertSummary.critical +
    params.nonConformities.critical +
    (params.dailyCard.percentPending >= 40 ? 1 : 0) +
    (params.maintenanceCard.pending >= 5 ? 1 : 0);
  const attentionFactors =
    params.alertSummary.attention +
    params.nonConformities.attention +
    params.dailyCard.pending +
    params.weeklyCard.pending +
    params.maintenanceCard.pending;
  const status =
    criticalFactors > 0
      ? "Risco crítico"
      : attentionFactors > 0
        ? "Atenção necessária"
        : "Operação em dia";
  const level: DashboardAlertSeverity =
    status === "Risco crítico"
      ? "Crítico"
      : status === "Atenção necessária"
        ? "Atenção"
        : "Informativo";

  const summary = createInsightSummary({
    id: "risco-operacional",
    title: "Indicador Operacional",
    description: "Consolidação simples de risco operacional com base nos alertas do período.",
    status,
    level
  });

  if (params.nonConformities.critical > 0) {
    addInsightItem(summary, {
      id: "risco-nc-criticas",
      moduleId: "nao-conformidades",
      moduleName: "Não Conformidades",
      title: `${params.nonConformities.critical} não conformidade(s) crítica(s)`,
      description: "Há ocorrências críticas em temperatura, buffet, óleo, recebimento ou chamados.",
      status: "Não conformidade",
      href: "/",
      severity: "Crítico",
      occurrenceType: "Fator de risco"
    });
  }

  if (params.dailyCard.percentPending >= 40) {
    addInsightItem(summary, {
      id: "risco-pendencia-diaria",
      moduleId: "tarefas-diarias",
      moduleName: "Tarefas Diárias",
      title: `${params.dailyCard.percentPending}% das rotinas diárias pendentes`,
      description: "Volume de pendências diárias acima do limite preventivo.",
      status: "Pendente",
      href: "/",
      severity: "Crítico",
      occurrenceType: "Acúmulo de pendências"
    });
  }

  if (params.maintenanceCard.pending >= 5) {
    addInsightItem(summary, {
      id: "risco-chamados",
      moduleId: MODULES.chamados.id,
      moduleName: MODULES.chamados.name,
      title: `${params.maintenanceCard.pending} chamado(s) pendente(s)`,
      description: "Quantidade alta de chamados abertos ou em andamento.",
      status: "Pendente",
      href: MODULES.chamados.href,
      severity: "Crítico",
      occurrenceType: "Chamados acumulados"
    });
  }

  if (status === "Atenção necessária") {
    addInsightItem(summary, {
      id: "risco-atencao",
      moduleId: "dashboard",
      moduleName: "Dashboard",
      title: `${attentionFactors} fator(es) de atenção`,
      description: "Existem pendências, ações corretivas ou alertas a acompanhar.",
      status: "Pendente",
      href: "/",
      severity: "Atenção",
      occurrenceType: "Fator de atenção"
    });
  }

  if (status === "Operação em dia") {
    addInsightItem(summary, {
      id: "risco-operacao-em-dia",
      moduleId: "dashboard",
      moduleName: "Dashboard",
      title: "Operação em dia",
      description: "Sem fatores críticos ou pendências relevantes no período.",
      status: "Concluído",
      href: "/",
      severity: "Informativo",
      occurrenceType: "Risco baixo"
    });
  }

  return summary;
}

function buildEvolutionMetrics(params: {
  dailyCard: DashboardSummaryCard;
  weeklyCard: DashboardSummaryCard;
  monthlyCard: DashboardSummaryCard | null;
  maintenanceCard: DashboardSummaryCard;
  nonConformities: DashboardInsightSummary | null;
  correctiveActions: DashboardInsightSummary | null;
}): DashboardEvolutionMetric[] {
  const nonConformityTotal = params.nonConformities?.total ?? 0;
  const correctiveTotal = params.correctiveActions?.total ?? 0;
  const completionSeverity = (total: number, percentCompleted: number): DashboardAlertSeverity => {
    if (total === 0) {
      return "Informativo";
    }

    if (percentCompleted >= 90) {
      return "Informativo";
    }

    return percentCompleted >= 60 ? "Atenção" : "Crítico";
  };

  const metrics: DashboardEvolutionMetric[] = [
    {
      id: "tarefas-diarias",
      label: "Rotinas diárias",
      value: `${params.dailyCard.percentCompleted}%`,
      description: `${params.dailyCard.completed} de ${params.dailyCard.total} concluídas`,
      severity: completionSeverity(params.dailyCard.total, params.dailyCard.percentCompleted)
    },
    {
      id: "tarefas-semanais",
      label: "Rotinas semanais",
      value: `${params.weeklyCard.percentCompleted}%`,
      description: `${params.weeklyCard.completed} de ${params.weeklyCard.total} concluídas`,
      severity: completionSeverity(params.weeklyCard.total, params.weeklyCard.percentCompleted)
    },
    {
      id: "nao-conformidades-periodo",
      label: "Não conformidades",
      value: String(nonConformityTotal),
      description: `${params.nonConformities?.critical ?? 0} crítica(s) no período`,
      severity:
        (params.nonConformities?.critical ?? 0) > 0
          ? "Crítico"
          : nonConformityTotal > 0
            ? "Atenção"
            : "Informativo"
    },
    {
      id: "acoes-corretivas-periodo",
      label: "Ações corretivas",
      value: String(correctiveTotal),
      description: `${params.correctiveActions?.withCorrectiveAction ?? 0} registro(s) com ação preenchida`,
      severity: correctiveTotal > 0 ? "Atenção" : "Informativo"
    },
    {
      id: "chamados-periodo",
      label: "Chamados",
      value: String(params.maintenanceCard.pending),
      description: `${params.maintenanceCard.completed} concluído(s) no período`,
      severity:
        params.maintenanceCard.pending >= 5
          ? "Crítico"
          : params.maintenanceCard.pending > 0
            ? "Atenção"
            : "Informativo"
    }
  ];

  if (params.monthlyCard) {
    metrics.push({
      id: "fechamentos-periodo",
      label: "Fechamentos",
      value: `${params.monthlyCard.percentCompleted}%`,
      description: `${params.monthlyCard.pending} pendente(s) no mês`,
      severity: params.monthlyCard.pending === 0 ? "Informativo" : "Atenção"
    });
  }

  return metrics;
}

async function buildOperationalInsights(params: {
  user: AuthenticatedUser;
  profileView: DashboardProfileView;
  ranges: DashboardRanges;
  dailyCard: DashboardSummaryCard;
  weeklyCard: DashboardSummaryCard;
  monthlyCard: DashboardSummaryCard | null;
  maintenanceCard: DashboardSummaryCard;
  includeDetails: boolean;
}): Promise<{
  riskOverview: DashboardInsightSummary | null;
  insightSummaries: DashboardInsightSummary[];
  evolution: DashboardEvolutionMetric[];
}> {
  if (!params.profileView.showManagement) {
    const alerts = buildColaboradorAlerts({
      dailyCard: params.dailyCard,
      weeklyCard: params.weeklyCard,
      maintenanceCard: params.maintenanceCard
    });

    return {
      riskOverview: null,
      insightSummaries: [params.includeDetails ? alerts : stripInsightDetails(alerts)],
      evolution: buildEvolutionMetrics({
        dailyCard: params.dailyCard,
        weeklyCard: params.weeklyCard,
        monthlyCard: null,
        maintenanceCard: params.maintenanceCard,
        nonConformities: null,
        correctiveActions: null
      }).filter((metric) =>
        ["tarefas-diarias", "tarefas-semanais", "chamados-periodo"].includes(metric.id)
      )
    };
  }

  const [nonConformities, correctiveActions] = await Promise.all([
    safeInsightSummary("Não Conformidades", () =>
      buildNonConformitySummary({ ranges: params.ranges })
    ),
    safeInsightSummary("Ações Corretivas", () =>
      buildCorrectiveActionsSummary({ ranges: params.ranges })
    )
  ]);
  const alerts = buildManagementAlerts({
    nonConformities,
    correctiveActions,
    dailyCard: params.dailyCard,
    weeklyCard: params.weeklyCard,
    monthlyCard: params.monthlyCard,
    maintenanceCard: params.maintenanceCard
  });
  const riskOverview = buildRiskOverview({
    alertSummary: alerts,
    nonConformities,
    dailyCard: params.dailyCard,
    weeklyCard: params.weeklyCard,
    maintenanceCard: params.maintenanceCard
  });
  const summaries = [alerts, nonConformities, correctiveActions];

  return {
    riskOverview: params.includeDetails ? riskOverview : stripInsightDetails(riskOverview),
    insightSummaries: params.includeDetails ? summaries : summaries.map(stripInsightDetails),
    evolution: buildEvolutionMetrics({
      dailyCard: params.dailyCard,
      weeklyCard: params.weeklyCard,
      monthlyCard: params.monthlyCard,
      maintenanceCard: params.maintenanceCard,
      nonConformities,
      correctiveActions
    })
  };
}

export async function getDashboardCardDetails(params: {
  user: AuthenticatedUser;
  period: DashboardPeriod;
  startDate?: string;
  endDate?: string;
  cardId: string;
  kind: DashboardDetailKind;
}): Promise<DashboardDetailsResponse> {
  const dashboard = await getOperationalDashboardData({
    user: params.user,
    period: params.period,
    startDate: params.startDate,
    endDate: params.endDate,
    includeDetails: true
  });
  const card = dashboard.cards.find((item) => item.id === params.cardId);
  const details =
    params.kind === "completed"
      ? (card?.completedDetails ?? [])
      : (card?.pendingDetails ?? []);
  const total = params.kind === "completed" ? (card?.completed ?? 0) : (card?.pending ?? 0);

  return {
    cardId: params.cardId,
    kind: params.kind,
    total,
    details
  };
}

export async function getDashboardInsightDetails(params: {
  user: AuthenticatedUser;
  period: DashboardPeriod;
  startDate?: string;
  endDate?: string;
  sectionId: DashboardInsightId;
}): Promise<DashboardInsightDetailsResponse> {
  const dashboard = await getOperationalDashboardData({
    user: params.user,
    period: params.period,
    startDate: params.startDate,
    endDate: params.endDate,
    includeDetails: true,
    includeInsights: true
  });
  const section =
    dashboard.riskOverview?.id === params.sectionId
      ? dashboard.riskOverview
      : dashboard.insightSummaries.find((item) => item.id === params.sectionId);

  return {
    sectionId: params.sectionId,
    total: section?.total ?? 0,
    details: section?.details ?? []
  };
}
