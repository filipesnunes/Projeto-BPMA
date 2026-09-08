import { getMonthRangesForBounds, parseFilterMonth, parseFilterYear } from "@/lib/month-filter";
import { Prisma, StatusPlanoLimpeza } from "@prisma/client";
import Link from "next/link";

import { MonthlyClosureSection } from "@/components/historico/technical-signature";
import { ActionModal } from "@/components/ui/action-modal";
import { getCurrentUser } from "@/lib/auth-session";
import {
  formatAppDateInput,
  getAppDate,
  getAppMonthDateRange,
  getAppMonthYear
} from "@/lib/date-time";
import { canSignModuleMonthlyClosure } from "@/lib/module-signatures";
import { prisma } from "@/lib/prisma";
import { canSignAsResponsible, getRoleLabel, type UserRole } from "@/lib/rbac";

import {
  signWeeklyAreaPendingItemsAction,
  signWeeklyAreaSupervisorAction,
  updateWeeklyRecordAction
} from "../../actions";
import { MONTH_OPTIONS, WEEKLY_STATUS_OPTIONS } from "../../constants";
import { consolidateWeeklyExecutionsByAreaWeek } from "../../service";
import { StatusBadge } from "../../status-badge";
import {
  formatDateDisplay,
  formatDateInput,
  formatDateTimeDisplay,
  getCurrentSystemDateTime,
  formatWeeklyExecutionQuando,
  getWeekDateRangeForDate,
  getMonthDateRange,
  getYearDateRange,
  parseDateInput,
  parseWeeklyStatus
} from "../../utils";
import {
  canSignAllWeeklyItems,
  canSignHistoricalWeeklyItems,
  canSignWeeklyAreaSupervisor,
  canSignWeeklyItems,
  isHistoricalWeeklySignature
} from "../../weekly-permissions";
import { WeeklyChecklistSync } from "../weekly-checklist-sync";

const PAGE_PATH = "/plano-limpeza/semanal/historico";
const CARD_CLASS =
  "bpma-card";
const INPUT_CLASS =
  "bpma-input";
const MODULE_CODE = "limpeza_semanal";

type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = { searchParams: Promise<SearchParams> };

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function buildPathWithParams(params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${PAGE_PATH}?${query}` : PAGE_PATH;
}

function includesIgnoreCase(text: string, search: string): boolean {
  return text.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"));
}

function buildAreaWeekKey(area: string, weekStart: Date): string {
  return `${area}|${formatDateInput(weekStart)}`;
}

function getOperationalStatusFromSummary(statusGeral: "Pendente" | "Parcial" | "Concluído"): StatusPlanoLimpeza {
  return statusGeral === "Concluído" ? StatusPlanoLimpeza.CONCLUIDO : StatusPlanoLimpeza.PENDENTE;
}

export default async function PlanoLimpezaSemanalHistoricoPage({
  searchParams
}: PageProps) {
  const authUser = await getCurrentUser();
  const canSignMonthly = authUser ? canSignModuleMonthlyClosure(authUser, MODULE_CODE) : false;
  const now = getCurrentSystemDateTime();

  const params = await searchParams;
  const feedback = firstParam(params.feedback).trim();
  const feedbackType = firstParam(params.feedbackType) === "error" ? "error" : "success";
  const filtroData = firstParam(params.filtroData).trim();
  const filtroMes = parseFilterMonth(firstParam(params.filtroMes).trim());
  const filtroAno = parseFilterYear(firstParam(params.filtroAno).trim());
  const filtroArea = firstParam(params.filtroArea).trim();
  const filtroStatus = parseWeeklyStatus(firstParam(params.filtroStatus).trim());
  const filtroItem = firstParam(params.filtroItem).trim();
  const areaAberta = firstParam(params.areaAberta).trim();
  const semanaInicioAberta = firstParam(params.semanaInicio).trim();
  const todayMonth = getAppMonthYear(getAppDate());
  const selectedMonth = filtroMes && filtroMes <= 12 ? filtroMes : todayMonth.mes;
  const selectedYear = filtroAno ?? todayMonth.ano;
  const selectedMonthRange = getAppMonthDateRange(selectedMonth, selectedYear);
  const returnParams = new URLSearchParams();
  if (filtroData) returnParams.set("filtroData", filtroData);
  if (filtroMes) returnParams.set("filtroMes", String(filtroMes));
  if (filtroAno) returnParams.set("filtroAno", String(filtroAno));
  if (filtroArea) returnParams.set("filtroArea", filtroArea);
  if (filtroStatus) returnParams.set("filtroStatus", filtroStatus);
  if (filtroItem) returnParams.set("filtroItem", filtroItem);
  const filteredReturnTo = buildPathWithParams(returnParams);

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
  } else if (filtroMes) {
    const bounds = await prisma.planoLimpezaSemanalExecucao.aggregate({
      _min: { dataExecucao: true },
      _max: { dataExecucao: true }
    });
    where.OR = getMonthRangesForBounds(filtroMes, bounds._min.dataExecucao, bounds._max.dataExecucao)
      .map(({ start, end }) => ({ dataExecucao: { gte: start, lte: end } }));
  }

  let syncRange: { start: Date; end: Date } | null = null;
  if (dataFiltro) {
    syncRange = getWeekDateRangeForDate(dataFiltro);
  } else if (filtroMes && filtroAno && filtroMes <= 12) {
    syncRange = getMonthDateRange(filtroMes, filtroAno);
  }
  const syncStart = syncRange ? formatDateInput(syncRange.start) : null;
  const syncEnd = syncRange ? formatDateInput(syncRange.end) : null;

  const [rawRecords, rawMonthlyRecords, allItems, weeklyAreas, areasHistoricas, fechamentoMensal] = await Promise.all([
    prisma.planoLimpezaSemanalExecucao.findMany({
      where,
      select: {
        id: true,
        dataExecucao: true,
        area: true,
        assinaturaResponsavel: true,
        assinaturaResponsavelUsuarioId: true,
        assinaturaResponsavelDataHora: true,
        assinaturaSupervisor: true,
        assinaturaSupervisorUsuarioId: true,
        assinaturaSupervisorNomeUsuario: true,
        assinaturaSupervisorPerfil: true,
        assinaturaSupervisorDataHora: true,
        status: true,
        observacaoResponsavel: true,
        observacaoSupervisor: true,
        itemDescricao: true,
        quando: true,
        item: {
          select: {
            oQueLimpar: true,
            quando: true
          }
        }
      },
      orderBy: [{ dataExecucao: "desc" }, { createdAt: "desc" }]
    }),
    prisma.planoLimpezaSemanalExecucao.findMany({
      where: {
        dataExecucao: {
          gte: selectedMonthRange.start,
          lte: selectedMonthRange.end
        }
      },
      select: {
        id: true,
        dataExecucao: true,
        area: true,
        assinaturaResponsavel: true,
        assinaturaResponsavelUsuarioId: true,
        assinaturaResponsavelDataHora: true,
        assinaturaSupervisor: true,
        assinaturaSupervisorUsuarioId: true,
        assinaturaSupervisorNomeUsuario: true,
        assinaturaSupervisorPerfil: true,
        assinaturaSupervisorDataHora: true,
        status: true,
        observacaoResponsavel: true,
        observacaoSupervisor: true,
        itemDescricao: true,
        quando: true,
        item: {
          select: {
            oQueLimpar: true,
            quando: true
          }
        }
      },
      orderBy: [{ dataExecucao: "desc" }, { createdAt: "desc" }]
    }),
    prisma.planoLimpezaSemanalItem.findMany({
      orderBy: [{ area: "asc" }, { ordem: "asc" }, { oQueLimpar: "asc" }]
    }),
    prisma.planoLimpezaSemanalArea.findMany({
      orderBy: [{ ordem: "asc" }, { nome: "asc" }]
    }),
    prisma.planoLimpezaSemanalExecucao.findMany({
      select: { area: true },
      distinct: ["area"],
      orderBy: { area: "asc" }
    }),
    prisma.fechamentoMensalModulo.findUnique({
      where: {
        moduloCodigo_ano_mes: {
          moduloCodigo: MODULE_CODE,
          ano: selectedYear,
          mes: selectedMonth
        }
      }
    })
  ]);

  const activeAreaNames = new Set(
    weeklyAreas.filter((area) => area.ativo && !area.excluidoEm).map((area) => area.nome)
  );
  const activeItems = allItems.filter(
    (item) => item.ativo && !item.excluidoEm && activeAreaNames.has(item.area)
  );

  const summariesAll = consolidateWeeklyExecutionsByAreaWeek(rawRecords);
  const monthlySummaries = consolidateWeeklyExecutionsByAreaWeek(rawMonthlyRecords);
  const recordsByAreaWeek = new Map<string, typeof rawRecords>();
  for (const record of rawRecords) {
    const weekRange = getWeekDateRangeForDate(record.dataExecucao);
    const key = buildAreaWeekKey(record.area, weekRange.start);
    const records = recordsByAreaWeek.get(key);
    if (records) {
      records.push(record);
    } else {
      recordsByAreaWeek.set(key, [record]);
    }
  }

  const supervisorSignatureByAreaWeek = new Map<
    string,
    {
      signedCount: number;
      totalCount: number;
      isFullySigned: boolean;
      regularizedCount: number;
      statusLabel: string;
      supervisorLabel: string;
      firstSignedRecord: (typeof rawRecords)[number] | null;
    }
  >();
  for (const [key, records] of recordsByAreaWeek.entries()) {
    const signedRecords = records.filter(
      (record) => record.assinaturaSupervisor.trim().length > 0
    );
    const supervisorNames = Array.from(
      new Set(signedRecords.map((record) => record.assinaturaSupervisor.trim()))
    ).filter(Boolean);
    const regularizedCount = signedRecords.filter(
      (record) =>
        record.assinaturaResponsavelUsuarioId !== null &&
        record.assinaturaSupervisorUsuarioId !== null &&
        record.assinaturaResponsavelUsuarioId === record.assinaturaSupervisorUsuarioId &&
        Boolean(record.assinaturaResponsavelDataHora) &&
        Boolean(record.assinaturaSupervisorDataHora) &&
        record.assinaturaResponsavelDataHora!.getTime() ===
          record.assinaturaSupervisorDataHora!.getTime()
    ).length;
    supervisorSignatureByAreaWeek.set(key, {
      signedCount: signedRecords.length,
      totalCount: records.length,
      isFullySigned: records.length > 0 && signedRecords.length === records.length,
      regularizedCount,
      statusLabel:
        regularizedCount > 0 ? "Assinado com regularização" : "Assinado sem pendências",
      supervisorLabel:
        supervisorNames.length === 0
          ? "-"
          : supervisorNames.length === 1
            ? supervisorNames[0]
            : "Múltiplos",
      firstSignedRecord: signedRecords[0] ?? null
    });
  }

  const filteredByItemAreas =
    filtroItem.trim().length > 0
      ? new Set(
          allItems
            .filter((item) => includesIgnoreCase(item.oQueLimpar, filtroItem))
            .map((item) => item.area)
        )
      : null;

  const summaries = summariesAll.filter((summary) => {
    const signature = supervisorSignatureByAreaWeek.get(
      buildAreaWeekKey(summary.area, summary.weekStart)
    );
    if (filtroArea && summary.area !== filtroArea) {
      return false;
    }
    if (filtroStatus === StatusPlanoLimpeza.AGUARDANDO_SUPERVISOR) {
      if (summary.pendingItems > 0 || signature?.isFullySigned) {
        return false;
      }
    } else if (
      filtroStatus &&
      getOperationalStatusFromSummary(summary.statusGeral) !== filtroStatus
    ) {
      return false;
    }
    if (filteredByItemAreas && !filteredByItemAreas.has(summary.area)) {
      return false;
    }

    return true;
  });

  const buildOpenSummaryHref = (summary: (typeof summaries)[number]) => {
    const openParams = new URLSearchParams(returnParams);
    openParams.set("areaAberta", summary.area);
    openParams.set("semanaInicio", formatDateInput(summary.weekStart));
    return buildPathWithParams(openParams);
  };

  const selectedSummary =
    areaAberta && semanaInicioAberta
      ? summaries.find(
          (summary) =>
            summary.area === areaAberta &&
            formatDateInput(summary.weekStart) === semanaInicioAberta
        )
      : null;
  const selectedSummaryKey = selectedSummary
    ? buildAreaWeekKey(selectedSummary.area, selectedSummary.weekStart)
    : "";
  const selectedRecords = selectedSummary
    ? [...(recordsByAreaWeek.get(selectedSummaryKey) ?? [])].sort((a, b) => {
        const areaDiff = a.area.localeCompare(b.area, "pt-BR");
        if (areaDiff !== 0) {
          return areaDiff;
        }

        return (a.itemDescricao ?? a.item.oQueLimpar).localeCompare(
          b.itemDescricao ?? b.item.oQueLimpar,
          "pt-BR"
        );
      })
    : [];
  const selectedSignature = selectedSummary
    ? supervisorSignatureByAreaWeek.get(selectedSummaryKey) ?? null
    : null;
  const selectedIsHistoricalWeek = selectedSummary
    ? isHistoricalWeeklySignature(selectedSummary.weekStart, now)
    : false;
  const selectedCanSignWeeklySupervisor =
    Boolean(authUser && selectedSummary) &&
    canSignWeeklyAreaSupervisor({
      user: authUser!,
      weekStart: selectedSummary!.weekStart,
      referenceDate: now
    });
  const selectedCanSignItemRecords =
    Boolean(authUser && selectedSummary) &&
    canSignAsResponsible(authUser!) &&
    (selectedIsHistoricalWeek
      ? canSignHistoricalWeeklyItems(authUser!)
      : canSignWeeklyItems(authUser!));
  const selectedCanSignPendingItemsBatch =
    Boolean(authUser && selectedSummary) &&
    canSignAsResponsible(authUser!) &&
    (selectedIsHistoricalWeek
      ? canSignHistoricalWeeklyItems(authUser!)
      : canSignAllWeeklyItems(authUser!));
  const canShowWeeklyAreaSignatureForm =
    Boolean(selectedSummary) &&
    selectedCanSignWeeklySupervisor &&
    !selectedSignature?.isFullySigned;
  const canShowHistoricalItemsSignatureForm =
    Boolean(selectedSummary) &&
    selectedCanSignPendingItemsBatch &&
    selectedSummary!.pendingItems > 0;

  const observacoesPorAreaSemana = new Map<string, number>();
  for (const record of rawRecords) {
    const weekRange = getWeekDateRangeForDate(record.dataExecucao);
    const key = `${record.area}|${formatDateInput(weekRange.start)}`;
    const hasObservation = Boolean(
      (record.observacaoResponsavel && record.observacaoResponsavel.trim()) ||
        (record.observacaoSupervisor && record.observacaoSupervisor.trim())
    );
    if (!hasObservation) {
      continue;
    }

    observacoesPorAreaSemana.set(key, (observacoesPorAreaSemana.get(key) ?? 0) + 1);
  }

  const areaOptions = Array.from(
    new Set([
      ...weeklyAreas.filter((area) => !area.excluidoEm).map((area) => area.nome),
      ...allItems.map((item) => item.area),
      ...areasHistoricas.map((item) => item.area)
    ])
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const monthlyDates = Array.from(
    new Map(
      rawMonthlyRecords.map((record) => [
        formatAppDateInput(record.dataExecucao),
        record.dataExecucao
      ])
    ).values()
  );
  const assinaturasMensais = monthlyDates.length
    ? await prisma.assinaturaDiariaModulo.findMany({
        where: {
          moduloCodigo: MODULE_CODE,
          dataReferencia: { in: monthlyDates }
        }
      })
    : [];
  const diasExecutados = new Set(
    rawMonthlyRecords.map((record) => formatAppDateInput(record.dataExecucao))
  );
  const diasAssinados = new Set(
    assinaturasMensais.map((assinatura) => formatAppDateInput(assinatura.dataReferencia))
  );
  const indicadoresMensais = {
    "Mês/Ano": `${String(selectedMonth).padStart(2, "0")}/${selectedYear}`,
    "Semanas do mês": new Set(
      monthlySummaries.map((summary) => formatDateInput(summary.weekStart))
    ).size,
    "Áreas previstas": monthlySummaries.length,
    "Áreas concluídas": monthlySummaries.filter(
      (summary) => summary.statusGeral === "Concluído"
    ).length,
    "Pendências": monthlySummaries.reduce(
      (total, summary) => total + summary.pendingItems,
      0
    ),
    "Execuções realizadas": rawMonthlyRecords.length,
    "Dias assinados": diasAssinados.size,
    "Dias pendentes de assinatura": Math.max(diasExecutados.size - diasAssinados.size, 0)
  };
  const monthlyReturnParams = new URLSearchParams();
  if (filtroMes) monthlyReturnParams.set("filtroMes", String(filtroMes));
  if (filtroAno) monthlyReturnParams.set("filtroAno", String(filtroAno));
  const monthlyReturnTo = buildPathWithParams(monthlyReturnParams);

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
              ← Voltar ao Módulo
            </Link>
          </div>
        </div>
      </section>

      {feedback ? (
        <section
          className={`rounded-xl border p-4 text-sm ${
            feedbackType === "error"
              ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
              : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
          }`}
        >
          {feedback}
        </section>
      ) : null}

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
          <table className="min-w-[1120px] divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <tr>
                <th className="px-3 py-2">Semana</th>
                <th className="px-3 py-2">Área</th>
                <th className="px-3 py-2">Itens Configurados</th>
                <th className="px-3 py-2">Itens Executados</th>
                <th className="px-3 py-2">Pendentes</th>
                <th className="px-3 py-2">Status Operacional</th>
                <th className="px-3 py-2">Assinatura</th>
                <th className="px-3 py-2">Supervisor</th>
                <th className="px-3 py-2">Observações</th>
                <th className="px-3 py-2">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {summaries.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-3 text-slate-500 dark:text-slate-400">
                    Nenhuma execução encontrada.
                  </td>
                </tr>
              ) : (
                summaries.map((summary) => {
                  const key = buildAreaWeekKey(summary.area, summary.weekStart);
                  const signature = supervisorSignatureByAreaWeek.get(key);
                  const assinaturaCompleta = Boolean(signature?.isFullySigned);
                  return (
                    <tr key={key}>
                      <td className="px-3 py-2">
                        {formatDateDisplay(summary.weekStart)} até{" "}
                        {formatDateDisplay(summary.weekEnd)}
                      </td>
                      <td className="px-3 py-2">{summary.area}</td>
                      <td className="px-3 py-2">{summary.totalRegistrosOriginais}</td>
                      <td className="px-3 py-2">{summary.completedItems}</td>
                      <td className="px-3 py-2">{summary.pendingItems}</td>
                      <td className="px-3 py-2">
                        <StatusBadge status={summary.statusGeral} />
                      </td>
                      <td className="px-3 py-2">
                        {assinaturaCompleta ? (
                          <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                            {signature?.statusLabel ?? "Assinado sem pendências"}
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                            Pendente de assinatura do supervisor
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {assinaturaCompleta ? signature?.supervisorLabel : "-"}
                      </td>
                      <td className="px-3 py-2">
                        {(observacoesPorAreaSemana.get(key) ?? 0) || "-"}
                      </td>
                      <td className="px-3 py-2">
                        <Link href={buildOpenSummaryHref(summary)} className="btn-secondary">
                          Abrir
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedSummary ? (
        <ActionModal
          title="Detalhes da Área na Semana"
          cancelHref={filteredReturnTo}
          maxWidthClassName="max-w-6xl"
          description={
            <>
              {selectedSummary.area} · {formatDateDisplay(selectedSummary.weekStart)} até{" "}
              {formatDateDisplay(selectedSummary.weekEnd)}
            </>
          }
        >
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <p className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">
                  Status operacional
                </p>
                <div className="mt-2">
                  <StatusBadge status={selectedSummary.statusGeral} />
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <p className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">
                  Itens configurados
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {selectedSummary.totalRegistrosOriginais}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <p className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">
                  Itens executados
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {selectedSummary.completedItems}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <p className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">
                  Pendentes
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {selectedSummary.pendingItems}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Assinatura do Supervisor
                  </h3>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Esta assinatura valida a revisão de todos os itens desta área nesta semana.
                  </p>
                </div>
                {selectedSignature?.isFullySigned ? (
                  <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                    {selectedSignature.statusLabel}
                  </span>
                ) : (
                  <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    Pendente de assinatura do supervisor
                  </span>
                )}
              </div>

              {selectedSignature?.isFullySigned && selectedSignature.firstSignedRecord ? (
                <dl className="mt-4 grid gap-3 text-sm md:grid-cols-4">
                  <div>
                    <dt className="font-medium text-slate-500 dark:text-slate-400">Nome</dt>
                    <dd className="text-slate-900 dark:text-slate-100">
                      {selectedSignature.supervisorLabel}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-500 dark:text-slate-400">Perfil</dt>
                    <dd className="text-slate-900 dark:text-slate-100">
                      {selectedSignature.firstSignedRecord.assinaturaSupervisorPerfil
                        ? getRoleLabel(
                            selectedSignature.firstSignedRecord
                              .assinaturaSupervisorPerfil as UserRole
                          )
                        : "-"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-500 dark:text-slate-400">
                      Data e hora
                    </dt>
                    <dd className="text-slate-900 dark:text-slate-100">
                      {selectedSignature.firstSignedRecord.assinaturaSupervisorDataHora
                        ? formatDateTimeDisplay(
                            selectedSignature.firstSignedRecord.assinaturaSupervisorDataHora
                          )
                        : "-"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-500 dark:text-slate-400">
                      Regularização
                    </dt>
                    <dd className="text-slate-900 dark:text-slate-100">
                      {selectedSignature.regularizedCount > 0
                        ? `${selectedSignature.regularizedCount} item(ns) assumido(s)`
                        : "Sem itens assumidos"}
                    </dd>
                  </div>
                </dl>
              ) : null}

              {!selectedSignature?.isFullySigned && !selectedCanSignWeeklySupervisor ? (
                <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  Seu perfil não possui permissão para assinar esta área da semana.
                </p>
              ) : null}

              {!selectedSignature?.isFullySigned &&
              selectedCanSignWeeklySupervisor &&
              selectedSummary.pendingItems > 0 ? (
                <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                  Existem {selectedSummary.pendingItems} item(ns) sem responsável pela limpeza. Ao
                  assinar como supervisor, você também será registrado como responsável pela
                  limpeza desses itens pendentes. Deseja continuar?
                </p>
              ) : null}

              {canShowWeeklyAreaSignatureForm ? (
                <form action={signWeeklyAreaSupervisorAction} className="mt-4 grid gap-3 md:grid-cols-2">
                  <input type="hidden" name="area" value={selectedSummary.area} />
                  <input
                    type="hidden"
                    name="weekStart"
                    value={formatDateInput(selectedSummary.weekStart)}
                  />
                  <input
                    type="hidden"
                    name="returnTo"
                    value={buildOpenSummaryHref(selectedSummary)}
                  />
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    Senha para confirmar
                    <input
                      type="password"
                      name="senhaConfirmacao"
                      required
                      autoComplete="current-password"
                      className={INPUT_CLASS}
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    Observação
                    <input
                      type="text"
                      name="observacaoAssinatura"
                      className={INPUT_CLASS}
                      placeholder="Opcional"
                    />
                  </label>
                  <div className="md:col-span-2">
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
                      {selectedSummary.pendingItems > 0 ? (
                        <Link href={filteredReturnTo} className="btn-secondary text-center">
                          Cancelar
                        </Link>
                      ) : null}
                      <button type="submit" className="btn-primary">
                        {selectedSummary.pendingItems > 0
                          ? "Assinar como supervisor e assumir itens pendentes"
                          : "Assinar área da semana como supervisor"}
                      </button>
                    </div>
                  </div>
                </form>
              ) : null}
            </div>

            {canShowHistoricalItemsSignatureForm ? (
              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Assinatura dos itens pendentes
                </h3>
                <form action={signWeeklyAreaPendingItemsAction} className="mt-3 grid gap-3 md:grid-cols-2">
                  <input type="hidden" name="area" value={selectedSummary.area} />
                  <input
                    type="hidden"
                    name="weekStart"
                    value={formatDateInput(selectedSummary.weekStart)}
                  />
                  <input
                    type="hidden"
                    name="returnTo"
                    value={buildOpenSummaryHref(selectedSummary)}
                  />
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    Senha para confirmar
                    <input
                      type="password"
                      name="senhaConfirmacao"
                      required
                      autoComplete="current-password"
                      className={INPUT_CLASS}
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    Observação
                    <input
                      type="text"
                      name="observacaoAssinatura"
                      className={INPUT_CLASS}
                      placeholder="Opcional"
                    />
                  </label>
                  <div className="md:col-span-2">
                    <button type="submit" className="btn-primary">
                      Assinar itens pendentes
                    </button>
                  </div>
                </form>
              </div>
            ) : null}

            <div className="overflow-x-auto">
              <table className="min-w-[980px] divide-y divide-slate-200 text-sm dark:divide-slate-700">
                <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <tr>
                    <th className="px-3 py-2">O que limpar</th>
                    <th className="px-3 py-2">Quando</th>
                    <th className="px-3 py-2">Responsável pela limpeza</th>
                    <th className="px-3 py-2">Status do item</th>
                    <th className="px-3 py-2">Observações</th>
                    <th className="px-3 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {selectedRecords.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-3 text-slate-500 dark:text-slate-400">
                        Nenhum item/local encontrado para esta área e semana.
                      </td>
                    </tr>
                  ) : (
                    selectedRecords.map((record) => {
                      const statusItem = record.assinaturaResponsavel.trim()
                        ? "Concluído"
                        : "Pendente";
                      const observacoes = [
                        record.observacaoResponsavel,
                        record.observacaoSupervisor
                      ]
                        .filter(Boolean)
                        .join(" | ");
                      const responsavelLimpeza = record.assinaturaResponsavel.trim() || "-";

                      return (
                        <tr key={record.id}>
                          <td className="px-3 py-2">
                            {record.itemDescricao ?? record.item.oQueLimpar}
                          </td>
                          <td className="px-3 py-2">
                            {formatWeeklyExecutionQuando({
                              assinaturaResponsavel: record.assinaturaResponsavel,
                              assinaturaResponsavelDataHora:
                                record.assinaturaResponsavelDataHora,
                              quando: record.quando
                            })}
                          </td>
                          <td className="px-3 py-2">{responsavelLimpeza}</td>
                          <td className="px-3 py-2">
                            <StatusBadge status={statusItem} />
                          </td>
                          <td className="px-3 py-2">{observacoes || "-"}</td>
                          <td className="px-3 py-2">
                            {!record.assinaturaResponsavel.trim() &&
                            selectedCanSignItemRecords ? (
                              <form action={updateWeeklyRecordAction} className="grid min-w-[300px] gap-2">
                                <input type="hidden" name="id" value={String(record.id)} />
                                <input
                                  type="hidden"
                                  name="returnTo"
                                  value={buildOpenSummaryHref(selectedSummary)}
                                />
                                <input type="hidden" name="etapa" value="responsavel" />
                                <input
                                  type="password"
                                  name="senhaConfirmacao"
                                  required
                                  placeholder="Confirme sua senha"
                                  className="bpma-input text-xs"
                                />
                                <input
                                  type="text"
                                  name="observacaoAssinatura"
                                  placeholder="Observação (Opcional)"
                                  className="bpma-input text-xs"
                                />
                                <button type="submit" className="btn-primary whitespace-nowrap">
                                  Assinar item
                                </button>
                              </form>
                            ) : !record.assinaturaResponsavel.trim() ? (
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                {selectedIsHistoricalWeek
                                  ? "Sem permissão para assinar item histórico"
                                  : "Sem permissão para assinar item"}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                Item executado
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </ActionModal>
      ) : null}

      <MonthlyClosureSection
        moduleCode={MODULE_CODE}
        month={selectedMonth}
        year={selectedYear}
        returnTo={monthlyReturnTo}
        indicators={indicadoresMensais}
        signedClosure={fechamentoMensal}
        canSign={canSignMonthly}
        pendingDailySignatures={indicadoresMensais["Dias pendentes de assinatura"]}
      />
    </div>
  );
}
