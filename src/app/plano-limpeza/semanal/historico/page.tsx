import { Prisma } from "@prisma/client";
import Link from "next/link";

import { prisma } from "@/lib/prisma";

import { MONTH_OPTIONS, WEEKLY_AREAS, WEEKLY_STATUS_OPTIONS } from "../../constants";
import { consolidateWeeklyExecutionsByAreaWeek } from "../../service";
import { StatusBadge } from "../../status-badge";
import { ThemeToggleButton } from "../../theme-toggle-button";
import {
  formatDateDisplay,
  formatDateInput,
  getWeekDateRangeForDate,
  getMonthDateRange,
  getYearDateRange,
  parseDateInput,
  parsePositiveInt,
  parseWeeklyStatus
} from "../../utils";
import { WeeklyChecklistSync } from "../weekly-checklist-sync";

const PAGE_PATH = "/plano-limpeza/semanal/historico";
const CARD_CLASS =
  "rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900";
const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = { searchParams: Promise<SearchParams> };

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function includesIgnoreCase(text: string, search: string): boolean {
  return text.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"));
}

export default async function PlanoLimpezaSemanalHistoricoPage({
  searchParams
}: PageProps) {
  const params = await searchParams;
  const filtroData = firstParam(params.filtroData).trim();
  const filtroMes = parsePositiveInt(firstParam(params.filtroMes).trim());
  const filtroAno = parsePositiveInt(firstParam(params.filtroAno).trim());
  const filtroArea = firstParam(params.filtroArea).trim();
  const filtroStatus = parseWeeklyStatus(firstParam(params.filtroStatus).trim());
  const filtroResponsavel = firstParam(params.filtroResponsavel).trim();
  const filtroItem = firstParam(params.filtroItem).trim();

  const where: Prisma.PlanoLimpezaSemanalExecucaoWhereInput = {};
  const dataFiltro = parseDateInput(filtroData);
  if (dataFiltro) {
    const weekRange = getWeekDateRangeForDate(dataFiltro);
    where.dataExecucao = { gte: weekRange.start, lte: weekRange.end };
  } else if (filtroMes && filtroAno && filtroMes <= 12) {
    const range = getMonthDateRange(filtroMes, filtroAno);
    where.dataExecucao = { gte: range.start, lte: range.end };
  } else if (filtroAno) {
    const range = getYearDateRange(filtroAno);
    where.dataExecucao = { gte: range.start, lte: range.end };
  }

  let syncRange: { start: Date; end: Date } | null = null;
  if (dataFiltro) {
    syncRange = getWeekDateRangeForDate(dataFiltro);
  } else if (filtroMes && filtroAno && filtroMes <= 12) {
    syncRange = getMonthDateRange(filtroMes, filtroAno);
  }
  const syncStart = syncRange ? formatDateInput(syncRange.start) : null;
  const syncEnd = syncRange ? formatDateInput(syncRange.end) : null;

  const [rawRecords, allItems, areasHistoricas] = await Promise.all([
    prisma.planoLimpezaSemanalExecucao.findMany({
      where,
      select: {
        id: true,
        dataExecucao: true,
        area: true,
        assinaturaResponsavel: true,
        assinaturaSupervisor: true,
        status: true
      },
      orderBy: [{ dataExecucao: "desc" }, { createdAt: "desc" }]
    }),
    prisma.planoLimpezaSemanalItem.findMany({
      orderBy: [{ area: "asc" }, { ordem: "asc" }, { oQueLimpar: "asc" }]
    }),
    prisma.planoLimpezaSemanalExecucao.findMany({
      select: { area: true },
      distinct: ["area"],
      orderBy: { area: "asc" }
    })
  ]);

  const activeItems = allItems.filter((item) => item.ativo);
  const itemCountByArea = new Map<string, number>();
  for (const item of activeItems) {
    itemCountByArea.set(item.area, (itemCountByArea.get(item.area) ?? 0) + 1);
  }

  const summariesAll = consolidateWeeklyExecutionsByAreaWeek(rawRecords);
  const filteredByItemAreas =
    filtroItem.trim().length > 0
      ? new Set(
          allItems
            .filter((item) => includesIgnoreCase(item.oQueLimpar, filtroItem))
            .map((item) => item.area)
        )
      : null;

  const summaries = summariesAll.filter((summary) => {
    if (filtroArea && summary.area !== filtroArea) {
      return false;
    }
    if (filtroStatus && summary.status !== filtroStatus) {
      return false;
    }
    if (filtroResponsavel && !includesIgnoreCase(summary.assinaturaResponsavel, filtroResponsavel)) {
      return false;
    }
    if (filteredByItemAreas && !filteredByItemAreas.has(summary.area)) {
      return false;
    }

    return true;
  });

  const areaOptions = Array.from(
    new Set([
      ...WEEKLY_AREAS,
      ...allItems.map((item) => item.area),
      ...areasHistoricas.map((item) => item.area)
    ])
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));

  return (
    <div className="space-y-6 dark:text-slate-100">
      <WeeklyChecklistSync
        startDate={syncStart}
        endDate={syncEnd}
        enabled={activeItems.length > 0 && Boolean(syncStart && syncEnd)}
      />

      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Histórico do Plano Semanal
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Visualização histórica por área, com detalhamento interno dos itens configurados.
            </p>
          </div>
          <div className="btn-group">
            <Link href="/plano-limpeza/semanal" className="btn-secondary">
              Voltar para Semanal
            </Link>
            <ThemeToggleButton />
          </div>
        </div>
      </section>

      <section className={CARD_CLASS}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Filtros</h2>
        <form method="get" className="grid gap-3 rounded-lg bg-slate-50 p-4 md:grid-cols-6 dark:bg-slate-800">
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Data
            <input type="date" name="filtroData" defaultValue={filtroData} className={INPUT_CLASS} />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Mês
            <select name="filtroMes" defaultValue={filtroMes ? String(filtroMes) : ""} className={INPUT_CLASS}>
              <option value="">Todos</option>
              {MONTH_OPTIONS.map((month) => (
                <option key={month.value} value={String(month.value)}>
                  {month.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Ano
            <input type="number" name="filtroAno" min={2020} max={2100} defaultValue={filtroAno ?? ""} className={INPUT_CLASS} />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Área
            <select name="filtroArea" defaultValue={filtroArea} className={INPUT_CLASS}>
              <option value="">Todas</option>
              {areaOptions.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Status
            <select name="filtroStatus" defaultValue={filtroStatus ?? ""} className={INPUT_CLASS}>
              <option value="">Todos</option>
              {WEEKLY_STATUS_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Responsável
            <input type="text" name="filtroResponsavel" defaultValue={filtroResponsavel} className={INPUT_CLASS} />
          </label>

          <label className="text-sm text-slate-700 dark:text-slate-200 md:col-span-3">
            Item
            <input type="text" name="filtroItem" defaultValue={filtroItem} className={INPUT_CLASS} />
          </label>

          <div className="btn-group md:col-span-6">
            <button type="submit" className="btn-primary">
              Aplicar Filtros
            </button>
            <Link href={PAGE_PATH} className="btn-secondary">
              Limpar
            </Link>
          </div>
        </form>
      </section>

      <section className={CARD_CLASS}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Execuções por Área ({summaries.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <tr>
                <th className="px-3 py-2">Semana</th>
                <th className="px-3 py-2">Área</th>
                <th className="px-3 py-2">Itens Configurados</th>
                <th className="px-3 py-2">Responsável</th>
                <th className="px-3 py-2">Supervisor</th>
                <th className="px-3 py-2">Status Geral</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {summaries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-3 text-slate-500 dark:text-slate-400">
                    Nenhuma execução encontrada.
                  </td>
                </tr>
              ) : (
                summaries.map((summary) => (
                  <tr key={`${summary.area}-${formatDateInput(summary.weekStart)}`}>
                    <td className="px-3 py-2">
                      {formatDateDisplay(summary.weekStart)} até {formatDateDisplay(summary.weekEnd)}
                    </td>
                    <td className="px-3 py-2">{summary.area}</td>
                    <td className="px-3 py-2">{itemCountByArea.get(summary.area) ?? 0}</td>
                    <td className="px-3 py-2">{summary.assinaturaResponsavel || "-"}</td>
                    <td className="px-3 py-2">{summary.assinaturaSupervisor || "-"}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={summary.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
