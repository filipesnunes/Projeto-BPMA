import {
  Prisma,
  StatusFechamentoPlanoLimpeza,
  TipoPlanoLimpeza
} from "@prisma/client";
import Link from "next/link";

import { prisma } from "@/lib/prisma";

import { closeWeeklyMonthAction, reopenWeeklyMonthAction } from "../actions";
import { MONTH_OPTIONS, WEEKLY_AREAS, WEEKLY_STATUS_OPTIONS } from "../constants";
import { ReopenMonthModal } from "../reopen-month-modal";
import {
  consolidateWeeklyExecutionsByAreaWeek,
  getWeeklySignStage
} from "../service";
import { StatusBadge } from "../status-badge";
import { ThemeToggleButton } from "../theme-toggle-button";
import {
  formatDateDisplay,
  formatDateInput,
  formatDateTimeDisplay,
  getCurrentSystemDateTime,
  getCurrentWeekDateRange,
  getWeekDateRangeForDate,
  getMonthDateRange,
  getMonthYear,
  getYearDateRange,
  parseDateInput,
  parsePositiveInt,
  parseWeeklyStatus,
  periodKey
} from "../utils";
import { WeeklySignChecklistModal } from "./sign-checklist-modal";
import { WeeklyChecklistSync } from "./weekly-checklist-sync";

const PAGE_PATH = "/plano-limpeza/semanal";
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

function buildPathWithParams(params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${PAGE_PATH}?${query}` : PAGE_PATH;
}

function includesIgnoreCase(text: string, search: string): boolean {
  return text.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"));
}

export default async function PlanoLimpezaSemanalPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const feedback = firstParam(params.feedback).trim();
  const feedbackType = firstParam(params.feedbackType) === "error" ? "error" : "success";

  const now = getCurrentSystemDateTime();
  const filtroDataRaw = firstParam(params.filtroData).trim();
  const filtroMesRaw = firstParam(params.filtroMes).trim();
  const filtroAnoRaw = firstParam(params.filtroAno).trim();
  const filtroArea = firstParam(params.filtroArea).trim();
  const filtroStatusRaw = firstParam(params.filtroStatus).trim();
  const filtroResponsavel = firstParam(params.filtroResponsavel).trim();
  const filtroItem = firstParam(params.filtroItem).trim();

  const hasManualFilters = Boolean(
    filtroDataRaw ||
      filtroMesRaw ||
      filtroAnoRaw ||
      filtroArea ||
      filtroStatusRaw ||
      filtroResponsavel ||
      filtroItem
  );

  const filtroData = hasManualFilters ? filtroDataRaw : "";
  const filtroMes = parsePositiveInt(filtroMesRaw);
  const filtroAno = parsePositiveInt(filtroAnoRaw);
  const filtroStatus = parseWeeklyStatus(filtroStatusRaw);

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
  } else if (!hasManualFilters) {
    const weekRange = getCurrentWeekDateRange(now);
    where.dataExecucao = { gte: weekRange.start, lte: weekRange.end };
  }

  let syncRange: { start: Date; end: Date } | null = null;
  if (!hasManualFilters) {
    syncRange = getCurrentWeekDateRange(now);
  } else if (dataFiltro) {
    syncRange = getWeekDateRangeForDate(dataFiltro);
  } else if (filtroMes && filtroAno && filtroMes <= 12) {
    syncRange = getMonthDateRange(filtroMes, filtroAno);
  }
  const syncStart = syncRange ? formatDateInput(syncRange.start) : null;
  const syncEnd = syncRange ? formatDateInput(syncRange.end) : null;

  const [rawExecutions, allItems, areasHistoricas] = await Promise.all([
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
  const summariesAll = consolidateWeeklyExecutionsByAreaWeek(rawExecutions);
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

  const signId = parsePositiveInt(firstParam(params.signId));
  const executionParaAssinatura = signId
    ? summariesAll.find((summary) => summary.recordIds.includes(signId)) ?? null
    : null;
  const executionItemsParaAssinatura = executionParaAssinatura
    ? await prisma.planoLimpezaSemanalExecucao.findMany({
        where: {
          area: executionParaAssinatura.area,
          dataExecucao: {
            gte: executionParaAssinatura.weekStart,
            lte: executionParaAssinatura.weekEnd
          }
        },
        select: {
          id: true,
          status: true,
          assinaturaResponsavel: true,
          assinaturaSupervisor: true,
          item: {
            select: {
              id: true,
              ordem: true,
              oQueLimpar: true,
              quando: true,
              quem: true
            }
          }
        },
        orderBy: [{ item: { ordem: "asc" } }, { id: "asc" }]
      })
    : [];

  const fechamentoMesRaw = parsePositiveInt(firstParam(params.fechamentoMes));
  const fechamentoAnoRaw = parsePositiveInt(firstParam(params.fechamentoAno));
  const fechamentoMes =
    fechamentoMesRaw && fechamentoMesRaw >= 1 && fechamentoMesRaw <= 12
      ? fechamentoMesRaw
      : now.getMonth() + 1;
  const fechamentoAno = fechamentoAnoRaw ?? now.getFullYear();

  const periodos = new Map<string, { mes: number; ano: number }>();
  for (const summary of summaries) {
    const periodo = getMonthYear(summary.weekStart);
    periodos.set(periodKey(periodo.mes, periodo.ano), periodo);
  }
  if (executionParaAssinatura) {
    const periodo = getMonthYear(executionParaAssinatura.weekStart);
    periodos.set(periodKey(periodo.mes, periodo.ano), periodo);
  }
  periodos.set(periodKey(fechamentoMes, fechamentoAno), { mes: fechamentoMes, ano: fechamentoAno });

  const periodosFechados = periodos.size
    ? await prisma.planoLimpezaFechamento.findMany({
        where: {
          tipo: TipoPlanoLimpeza.SEMANAL,
          status: StatusFechamentoPlanoLimpeza.ASSINADO,
          OR: Array.from(periodos.values()).map((periodo) => ({
            mes: periodo.mes,
            ano: periodo.ano
          }))
        }
      })
    : [];
  const fechadosSet = new Set(periodosFechados.map((item) => periodKey(item.mes, item.ano)));

  const assinaturaBloqueadaPorFechamento = executionParaAssinatura
    ? fechadosSet.has(
        periodKey(
          getMonthYear(executionParaAssinatura.weekStart).mes,
          getMonthYear(executionParaAssinatura.weekStart).ano
        )
      )
    : false;

  const paramsRetorno = new URLSearchParams();
  if (filtroData) paramsRetorno.set("filtroData", filtroData);
  if (filtroMes) paramsRetorno.set("filtroMes", String(filtroMes));
  if (filtroAno) paramsRetorno.set("filtroAno", String(filtroAno));
  if (filtroArea) paramsRetorno.set("filtroArea", filtroArea);
  if (filtroStatus) paramsRetorno.set("filtroStatus", filtroStatus);
  if (filtroResponsavel) paramsRetorno.set("filtroResponsavel", filtroResponsavel);
  if (filtroItem) paramsRetorno.set("filtroItem", filtroItem);
  paramsRetorno.set("fechamentoMes", String(fechamentoMes));
  paramsRetorno.set("fechamentoAno", String(fechamentoAno));
  const returnTo = buildPathWithParams(paramsRetorno);

  const rangeFechamento = getMonthDateRange(fechamentoMes, fechamentoAno);
  const [rawFechamentoRecords, fechamentoAtual] = await Promise.all([
    prisma.planoLimpezaSemanalExecucao.findMany({
      where: { dataExecucao: { gte: rangeFechamento.start, lte: rangeFechamento.end } },
      select: {
        id: true,
        dataExecucao: true,
        area: true,
        assinaturaResponsavel: true,
        assinaturaSupervisor: true,
        status: true
      },
      orderBy: [{ dataExecucao: "asc" }, { createdAt: "asc" }]
    }),
    prisma.planoLimpezaFechamento.findUnique({
      where: {
        tipo_mes_ano: { tipo: TipoPlanoLimpeza.SEMANAL, mes: fechamentoMes, ano: fechamentoAno }
      }
    })
  ]);
  const fechamentoSummaries = consolidateWeeklyExecutionsByAreaWeek(rawFechamentoRecords);

  const fechamentoAssinado = fechamentoAtual?.status === StatusFechamentoPlanoLimpeza.ASSINADO;
  const reaberturaFormId = `reabertura-form-semanal-${fechamentoMes}-${fechamentoAno}`;

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
              Plano de Limpeza Semanal
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Execução semanal por área com detalhamento interno dos itens configurados.
            </p>
          </div>
          <div className="btn-group">
            <Link href="/plano-limpeza" className="btn-secondary">
              Voltar para Módulo
            </Link>
            <Link href="/plano-limpeza/semanal/historico" className="btn-secondary">
              Histórico Completo
            </Link>
            <Link href="/plano-limpeza/semanal/opcoes" className="btn-secondary">
              Gerenciar Plano Semanal
            </Link>
            <ThemeToggleButton />
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

      {executionParaAssinatura && assinaturaBloqueadaPorFechamento ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          Esta execução de área pertence a um mês fechado e não pode receber assinatura.
        </section>
      ) : null}

      {activeItems.length === 0 ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          Nenhum item ativo do plano semanal foi configurado. Use
          {" "}
          <strong>Gerenciar Plano Semanal</strong>
          {" "}
          para cadastrar itens por área.
        </section>
      ) : null}

      <section className={CARD_CLASS}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Execuções Semanais por Área
        </h2>

        <form method="get" className="grid gap-3 rounded-lg bg-slate-50 p-4 md:grid-cols-6 dark:bg-slate-800">
          <input type="hidden" name="fechamentoMes" value={String(fechamentoMes)} />
          <input type="hidden" name="fechamentoAno" value={String(fechamentoAno)} />

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
            <Link
              href={buildPathWithParams(
                new URLSearchParams({
                  fechamentoMes: String(fechamentoMes),
                  fechamentoAno: String(fechamentoAno)
                })
              )}
              className="btn-secondary"
            >
              Limpar
            </Link>
          </div>
        </form>

        {!hasManualFilters ? (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Exibindo automaticamente as execuções da semana atual por área.
          </p>
        ) : null}

        <div className="mt-4 space-y-3 md:hidden">
          {summaries.length === 0 ? (
            <div className="rounded-lg border border-slate-200 p-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Nenhuma execução de área encontrada.
            </div>
          ) : (
            summaries.map((summary) => {
              const period = getMonthYear(summary.weekStart);
              const bloqueado = fechadosSet.has(periodKey(period.mes, period.ano));
              const podeAssinar = summary.statusGeral !== "Concluído";
              const hrefAssinar = (() => {
                const q = new URLSearchParams(paramsRetorno);
                q.set("signId", String(summary.executionId));
                return buildPathWithParams(q);
              })();

              return (
                <article key={`${summary.area}-${formatDateInput(summary.weekStart)}`} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Semana de {formatDateDisplay(summary.weekStart)}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {summary.area}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {summary.totalRegistrosOriginais} item(ns) na semana
                  </p>
                  <div className="mt-2">
                    <StatusBadge status={summary.statusGeral} />
                  </div>
                  <div className="mt-3">
                    {bloqueado ? (
                      <span className="text-xs text-slate-500 dark:text-slate-400">Bloqueado</span>
                    ) : podeAssinar ? (
                      <Link href={hrefAssinar} className="btn-action">
                        Abrir Área
                      </Link>
                    ) : (
                      <span className="text-xs text-slate-500 dark:text-slate-400">Sem Ação</span>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>

        <div className="mt-4 hidden overflow-x-auto md:block">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <tr>
                <th className="px-3 py-2">Semana</th>
                <th className="px-3 py-2">Área</th>
                <th className="px-3 py-2">Itens Configurados</th>
                <th className="px-3 py-2">Status Geral</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {summaries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-3 text-slate-500 dark:text-slate-400">
                    Nenhuma execução de área encontrada.
                  </td>
                </tr>
              ) : (
                summaries.map((summary) => {
                  const period = getMonthYear(summary.weekStart);
                  const bloqueado = fechadosSet.has(periodKey(period.mes, period.ano));
                  const podeAssinar = summary.statusGeral !== "Concluído";
                  const hrefAssinar = (() => {
                    const q = new URLSearchParams(paramsRetorno);
                    q.set("signId", String(summary.executionId));
                    return buildPathWithParams(q);
                  })();

                  return (
                    <tr key={`${summary.area}-${formatDateInput(summary.weekStart)}`}>
                      <td className="px-3 py-2">
                        {formatDateDisplay(summary.weekStart)} até {formatDateDisplay(summary.weekEnd)}
                      </td>
                      <td className="px-3 py-2">{summary.area}</td>
                      <td className="px-3 py-2">{summary.totalRegistrosOriginais}</td>
                      <td className="px-3 py-2">
                        <StatusBadge status={summary.statusGeral} />
                      </td>
                      <td className="px-3 py-2">
                        {bloqueado ? (
                          <span className="text-xs text-slate-500 dark:text-slate-400">Bloqueado</span>
                        ) : podeAssinar ? (
                          <Link href={hrefAssinar} className="btn-action">
                            Abrir Área
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-slate-400">Sem Ação</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={CARD_CLASS}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Fechamento Mensal</h2>

        <form method="get" className="grid gap-3 rounded-lg bg-slate-50 p-4 md:grid-cols-4 dark:bg-slate-800">
          <input type="hidden" name="filtroData" value={filtroData} />
          <input type="hidden" name="filtroMes" value={filtroMes ? String(filtroMes) : ""} />
          <input type="hidden" name="filtroAno" value={filtroAno ? String(filtroAno) : ""} />
          <input type="hidden" name="filtroArea" value={filtroArea} />
          <input type="hidden" name="filtroStatus" value={filtroStatus ?? ""} />
          <input type="hidden" name="filtroResponsavel" value={filtroResponsavel} />
          <input type="hidden" name="filtroItem" value={filtroItem} />

          <label className="text-sm text-slate-700 dark:text-slate-200">
            Mês
            <select name="fechamentoMes" defaultValue={String(fechamentoMes)} className={INPUT_CLASS}>
              {MONTH_OPTIONS.map((month) => (
                <option key={month.value} value={String(month.value)}>
                  {month.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Ano
            <input type="number" name="fechamentoAno" min={2020} max={2100} defaultValue={fechamentoAno} className={INPUT_CLASS} />
          </label>
          <div className="md:col-span-2 md:flex md:items-end">
            <button type="submit" className="btn-secondary">
              Carregar Período
            </button>
          </div>
        </form>

        <div className="mt-4 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
          <p className="mb-3 text-sm font-medium text-slate-700 dark:text-slate-200">
            Período: {String(fechamentoMes).padStart(2, "0")}/{fechamentoAno} -{" "}
            {fechamentoAssinado ? "Assinado" : "Aberto"}
          </p>

          <div className="mb-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <tr>
                  <th className="px-3 py-2">Semana</th>
                  <th className="px-3 py-2">Área</th>
                  <th className="px-3 py-2">Itens</th>
                  <th className="px-3 py-2">Status Geral</th>
                  <th className="px-3 py-2">Responsável</th>
                  <th className="px-3 py-2">Supervisor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {fechamentoSummaries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-2 text-slate-500 dark:text-slate-400">
                      Nenhuma execução no período selecionado.
                    </td>
                  </tr>
                ) : (
                  fechamentoSummaries.map((summary) => (
                    <tr key={`${summary.area}-${formatDateInput(summary.weekStart)}`}>
                      <td className="px-3 py-2">
                        {formatDateDisplay(summary.weekStart)} até {formatDateDisplay(summary.weekEnd)}
                      </td>
                      <td className="px-3 py-2">{summary.area}</td>
                      <td className="px-3 py-2">{summary.totalRegistrosOriginais}</td>
                      <td className="px-3 py-2">
                        <StatusBadge status={summary.statusGeral} />
                      </td>
                      <td className="px-3 py-2">{summary.assinaturaResponsavel || "-"}</td>
                      <td className="px-3 py-2">{summary.assinaturaSupervisor || "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {fechamentoAssinado ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
              <p>
                Mês assinado por <strong>{fechamentoAtual?.responsavelTecnico}</strong>.
              </p>
              <p>
                Data da assinatura:{" "}
                <strong>
                  {fechamentoAtual ? formatDateDisplay(fechamentoAtual.dataAssinatura) : "-"}
                </strong>
              </p>
              <form id={reaberturaFormId} action={reopenWeeklyMonthAction} className="mt-4">
                <input type="hidden" name="mes" value={String(fechamentoMes)} />
                <input type="hidden" name="ano" value={String(fechamentoAno)} />
                <input type="hidden" name="returnTo" value={returnTo} />
              </form>
              <ReopenMonthModal mes={fechamentoMes} ano={fechamentoAno} formId={reaberturaFormId} />
            </div>
          ) : (
            <form action={closeWeeklyMonthAction} className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="mes" value={String(fechamentoMes)} />
              <input type="hidden" name="ano" value={String(fechamentoAno)} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <label className="text-sm text-slate-700 dark:text-slate-200">
                Responsável técnico ou supervisor *
                <input type="text" name="responsavelTecnico" required className={INPUT_CLASS} />
              </label>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Data da assinatura
                </p>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {formatDateTimeDisplay(now)}
                </p>
              </div>
              <div className="md:col-span-2">
                <button type="submit" className="btn-primary">
                  Fechar Mês
                </button>
              </div>
            </form>
          )}
        </div>
      </section>

      {executionParaAssinatura &&
      executionItemsParaAssinatura.length > 0 &&
      !assinaturaBloqueadaPorFechamento ? (
        <WeeklySignChecklistModal
          closeHref={returnTo}
          returnTo={returnTo}
          execution={executionParaAssinatura}
          items={executionItemsParaAssinatura.map((executionItem) => ({
            id: executionItem.id,
            status: executionItem.status,
            assinaturaResponsavel: executionItem.assinaturaResponsavel,
            assinaturaSupervisor: executionItem.assinaturaSupervisor,
            etapa: getWeeklySignStage(executionItem),
            item: {
              id: executionItem.item.id,
              ordem: executionItem.item.ordem,
              oQueLimpar: executionItem.item.oQueLimpar,
              quando: executionItem.item.quando,
              quem: executionItem.item.quem
            }
          }))}
        />
      ) : null}
    </div>
  );
}
