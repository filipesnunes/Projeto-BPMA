import {
  Prisma,
  StatusFechamentoPlanoLimpeza,
  StatusPlanoLimpeza,
  TipoPlanoLimpeza
} from "@prisma/client";
import Link from "next/link";

import { prisma } from "@/lib/prisma";

import { closeWeeklyMonthAction, reopenWeeklyMonthAction } from "../actions";
import { MONTH_OPTIONS, WEEKLY_AREAS, WEEKLY_STATUS_OPTIONS } from "../constants";
import { ReopenMonthModal } from "../reopen-month-modal";
import { getWeeklySignStage } from "../service";
import { StatusBadge } from "../status-badge";
import { ThemeToggleButton } from "../theme-toggle-button";
import {
  formatDateDisplay,
  formatDateInput,
  formatDateTimeDisplay,
  getCurrentSystemDateTime,
  getCurrentWeekDateRange,
  getMonthDateRange,
  getMonthYear,
  getWeeklyDayLabel,
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
    where.dataExecucao = dataFiltro;
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

  if (filtroArea) {
    where.area = filtroArea;
  }
  if (filtroStatus) {
    where.status = filtroStatus as StatusPlanoLimpeza;
  }
  if (filtroResponsavel) {
    where.assinaturaResponsavel = { contains: filtroResponsavel, mode: "insensitive" };
  }
  if (filtroItem) {
    where.item = {
      oQueLimpar: { contains: filtroItem, mode: "insensitive" }
    };
  }

  let syncRange: { start: Date; end: Date } | null = null;
  if (!hasManualFilters) {
    syncRange = getCurrentWeekDateRange(now);
  } else if (dataFiltro) {
    syncRange = { start: dataFiltro, end: dataFiltro };
  } else if (filtroMes && filtroAno && filtroMes <= 12) {
    syncRange = getMonthDateRange(filtroMes, filtroAno);
  }

  const [execucoes, itensAtivos, areasHistoricas] = await Promise.all([
    prisma.planoLimpezaSemanalExecucao.findMany({
      where,
      include: { item: true },
      orderBy: [{ dataExecucao: "desc" }, { createdAt: "desc" }]
    }),
    prisma.planoLimpezaSemanalItem.findMany({
      where: { ativo: true },
      orderBy: [{ area: "asc" }, { ordem: "asc" }, { oQueLimpar: "asc" }]
    }),
    prisma.planoLimpezaSemanalExecucao.findMany({
      select: { area: true },
      distinct: ["area"],
      orderBy: { area: "asc" }
    })
  ]);
  const execucoesOrdenadas = [...execucoes].sort((a, b) => {
    const dateDiff = b.dataExecucao.getTime() - a.dataExecucao.getTime();
    if (dateDiff !== 0) {
      return dateDiff;
    }

    if (a.area !== b.area) {
      return a.area.localeCompare(b.area, "pt-BR");
    }

    if (a.item.ordem !== b.item.ordem) {
      return a.item.ordem - b.item.ordem;
    }

    return a.item.oQueLimpar.localeCompare(b.item.oQueLimpar, "pt-BR");
  });

  const areaOptions = Array.from(
    new Set([...WEEKLY_AREAS, ...itensAtivos.map((item) => item.area), ...areasHistoricas.map((item) => item.area)])
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));

  const signId = parsePositiveInt(firstParam(params.signId));
  const registroParaAssinatura = signId
    ? await prisma.planoLimpezaSemanalExecucao.findUnique({
        where: { id: signId },
        include: { item: true }
      })
    : null;
  const etapaAssinatura = registroParaAssinatura
    ? getWeeklySignStage(registroParaAssinatura)
    : null;

  const fechamentoMesRaw = parsePositiveInt(firstParam(params.fechamentoMes));
  const fechamentoAnoRaw = parsePositiveInt(firstParam(params.fechamentoAno));
  const fechamentoMes =
    fechamentoMesRaw && fechamentoMesRaw >= 1 && fechamentoMesRaw <= 12
      ? fechamentoMesRaw
      : now.getMonth() + 1;
  const fechamentoAno = fechamentoAnoRaw ?? now.getFullYear();

  const periodos = new Map<string, { mes: number; ano: number }>();
  for (const execucao of execucoes) {
    const periodo = getMonthYear(execucao.dataExecucao);
    periodos.set(periodKey(periodo.mes, periodo.ano), periodo);
  }
  if (registroParaAssinatura) {
    const periodo = getMonthYear(registroParaAssinatura.dataExecucao);
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

  const assinaturaBloqueadaPorFechamento = registroParaAssinatura
    ? fechadosSet.has(
        periodKey(
          getMonthYear(registroParaAssinatura.dataExecucao).mes,
          getMonthYear(registroParaAssinatura.dataExecucao).ano
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
  const syncStart = syncRange ? formatDateInput(syncRange.start) : null;
  const syncEnd = syncRange ? formatDateInput(syncRange.end) : null;

  const rangeFechamento = getMonthDateRange(fechamentoMes, fechamentoAno);
  const [execucoesFechamento, fechamentoAtual] = await Promise.all([
    prisma.planoLimpezaSemanalExecucao.findMany({
      where: { dataExecucao: { gte: rangeFechamento.start, lte: rangeFechamento.end } },
      include: { item: true },
      orderBy: [{ dataExecucao: "asc" }, { createdAt: "asc" }]
    }),
    prisma.planoLimpezaFechamento.findUnique({
      where: {
        tipo_mes_ano: { tipo: TipoPlanoLimpeza.SEMANAL, mes: fechamentoMes, ano: fechamentoAno }
      }
    })
  ]);
  const execucoesFechamentoOrdenadas = [...execucoesFechamento].sort((a, b) => {
    const dateDiff = a.dataExecucao.getTime() - b.dataExecucao.getTime();
    if (dateDiff !== 0) {
      return dateDiff;
    }

    if (a.area !== b.area) {
      return a.area.localeCompare(b.area, "pt-BR");
    }

    if (a.item.ordem !== b.item.ordem) {
      return a.item.ordem - b.item.ordem;
    }

    return a.item.oQueLimpar.localeCompare(b.item.oQueLimpar, "pt-BR");
  });

  const fechamentoAssinado = fechamentoAtual?.status === StatusFechamentoPlanoLimpeza.ASSINADO;
  const reaberturaFormId = `reabertura-form-semanal-${fechamentoMes}-${fechamentoAno}`;

  return (
    <div className="space-y-6 dark:text-slate-100">
      <WeeklyChecklistSync
        startDate={syncStart}
        endDate={syncEnd}
        enabled={itensAtivos.length > 0 && Boolean(syncStart && syncEnd)}
      />

      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Plano de Limpeza Semanal
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Checklist semanal automático por área com assinatura em duas etapas.
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

      {registroParaAssinatura && assinaturaBloqueadaPorFechamento ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          Este checklist pertence a um mês fechado e não pode receber assinatura.
        </section>
      ) : null}

      {itensAtivos.length === 0 ? (
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
          Registros Automáticos da Semana
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
            Exibindo automaticamente os registros da semana atual.
          </p>
        ) : null}

        <div className="mt-4 space-y-3 md:hidden">
          {execucoesOrdenadas.length === 0 ? (
            <div className="rounded-lg border border-slate-200 p-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Nenhum registro encontrado.
            </div>
          ) : (
            execucoesOrdenadas.map((execucao) => {
              const periodo = getMonthYear(execucao.dataExecucao);
              const bloqueado = fechadosSet.has(periodKey(periodo.mes, periodo.ano));
              const etapa = getWeeklySignStage(execucao);
              const hrefAssinar = (() => {
                const q = new URLSearchParams(paramsRetorno);
                q.set("signId", String(execucao.id));
                return buildPathWithParams(q);
              })();

              return (
                <article key={execucao.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {formatDateDisplay(execucao.dataExecucao)}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {execucao.area}
                  </p>
                  <p className="text-sm text-slate-700 dark:text-slate-200">
                    {execucao.item.oQueLimpar}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {getWeeklyDayLabel(execucao.item.quando)} • {execucao.item.quem}
                  </p>
                  <div className="mt-2">
                    <StatusBadge status={execucao.status} />
                  </div>
                  <div className="mt-3">
                    {bloqueado ? (
                      <span className="text-xs text-slate-500 dark:text-slate-400">Bloqueado</span>
                    ) : etapa ? (
                      <Link href={hrefAssinar} className="btn-action">
                        Abrir
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
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Área</th>
                <th className="px-3 py-2">O que limpar</th>
                <th className="px-3 py-2">Quando limpar</th>
                <th className="px-3 py-2">Quem</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {execucoesOrdenadas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-3 text-slate-500 dark:text-slate-400">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : (
                execucoesOrdenadas.map((execucao) => {
                  const periodo = getMonthYear(execucao.dataExecucao);
                  const bloqueado = fechadosSet.has(periodKey(periodo.mes, periodo.ano));
                  const etapa = getWeeklySignStage(execucao);
                  const hrefAssinar = (() => {
                    const q = new URLSearchParams(paramsRetorno);
                    q.set("signId", String(execucao.id));
                    return buildPathWithParams(q);
                  })();

                  return (
                    <tr key={execucao.id}>
                      <td className="px-3 py-2">{formatDateDisplay(execucao.dataExecucao)}</td>
                      <td className="px-3 py-2">{execucao.area}</td>
                      <td className="px-3 py-2">{execucao.item.oQueLimpar}</td>
                      <td className="px-3 py-2">{getWeeklyDayLabel(execucao.item.quando)}</td>
                      <td className="px-3 py-2">{execucao.item.quem}</td>
                      <td className="px-3 py-2">
                        <StatusBadge status={execucao.status} />
                      </td>
                      <td className="px-3 py-2">
                        {bloqueado ? (
                          <span className="text-xs text-slate-500 dark:text-slate-400">Bloqueado</span>
                        ) : etapa ? (
                          <Link href={hrefAssinar} className="btn-action">
                            Abrir
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
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Área</th>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Quando limpar</th>
                  <th className="px-3 py-2">Quem</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Responsável</th>
                  <th className="px-3 py-2">Supervisor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {execucoesFechamentoOrdenadas.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-2 text-slate-500 dark:text-slate-400">
                      Nenhum registro no período selecionado.
                    </td>
                  </tr>
                ) : (
                  execucoesFechamentoOrdenadas.map((execucao) => (
                    <tr key={execucao.id}>
                      <td className="px-3 py-2">{formatDateDisplay(execucao.dataExecucao)}</td>
                      <td className="px-3 py-2">{execucao.area}</td>
                      <td className="px-3 py-2">{execucao.item.oQueLimpar}</td>
                      <td className="px-3 py-2">{getWeeklyDayLabel(execucao.item.quando)}</td>
                      <td className="px-3 py-2">{execucao.item.quem}</td>
                      <td className="px-3 py-2">
                        <StatusBadge status={execucao.status} />
                      </td>
                      <td className="px-3 py-2">{execucao.assinaturaResponsavel || "-"}</td>
                      <td className="px-3 py-2">{execucao.assinaturaSupervisor || "-"}</td>
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

      {registroParaAssinatura && etapaAssinatura && !assinaturaBloqueadaPorFechamento ? (
        <WeeklySignChecklistModal
          closeHref={returnTo}
          returnTo={returnTo}
          record={registroParaAssinatura}
          etapa={etapaAssinatura}
        />
      ) : null}
    </div>
  );
}
