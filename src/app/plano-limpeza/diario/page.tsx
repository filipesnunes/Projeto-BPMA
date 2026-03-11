import { Prisma, StatusFechamentoPlanoLimpeza, TipoPlanoLimpeza } from "@prisma/client";
import Link from "next/link";

import { prisma } from "@/lib/prisma";

import { closeDailyMonthAction, reopenDailyMonthAction } from "../actions";
import { DAILY_STATUS_OPTIONS, MONTH_OPTIONS, TURNO_OPTIONS } from "../constants";
import { ReopenMonthModal } from "../reopen-month-modal";
import {
  consolidateDailyRecordsByDay,
  getDailyConsolidatedStatusClass,
  getDailySignStage
} from "../service";
import { StatusBadge } from "../status-badge";
import { ThemeToggleButton } from "../theme-toggle-button";
import {
  formatDateDisplay,
  formatDateInput,
  formatDateTimeDisplay,
  getCurrentSystemDateTime,
  getMonthDateRange,
  getMonthYear,
  getTodaySystemDate,
  getTurnoLabel,
  getYearDateRange,
  parseDailyStatus,
  parseDateInput,
  parsePositiveInt,
  parseTurno,
  periodKey
} from "../utils";
import { DailyChecklistSync } from "./daily-checklist-sync";
import { DailySignChecklistModal } from "./sign-checklist-modal";

const PAGE_PATH = "/plano-limpeza/diario";
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

export default async function PlanoLimpezaDiarioPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const feedback = firstParam(params.feedback).trim();
  const feedbackType = firstParam(params.feedbackType) === "error" ? "error" : "success";

  const now = getCurrentSystemDateTime();
  const todayDbDate = getTodaySystemDate();

  const todayInput = formatDateInput(todayDbDate);
  const filtroDataRaw = firstParam(params.filtroData).trim();
  const filtroMesRaw = firstParam(params.filtroMes).trim();
  const filtroAnoRaw = firstParam(params.filtroAno).trim();
  const filtroArea = firstParam(params.filtroArea).trim();
  const filtroTurnoRaw = firstParam(params.filtroTurno).trim();
  const filtroStatusRaw = firstParam(params.filtroStatus).trim();
  const filtroResponsavel = firstParam(params.filtroResponsavel).trim();

  const hasManualFilters = Boolean(
    filtroDataRaw ||
      filtroMesRaw ||
      filtroAnoRaw ||
      filtroArea ||
      filtroTurnoRaw ||
      filtroStatusRaw ||
      filtroResponsavel
  );

  const filtroData = hasManualFilters ? filtroDataRaw : todayInput;
  const filtroMes = parsePositiveInt(filtroMesRaw);
  const filtroAno = parsePositiveInt(filtroAnoRaw);
  const filtroTurno = parseTurno(filtroTurnoRaw);
  const filtroStatus = parseDailyStatus(filtroStatusRaw);

  const where: Prisma.PlanoLimpezaDiarioRegistroWhereInput = {};
  const dataFiltro = parseDateInput(filtroData);
  const syncDate = dataFiltro ? formatDateInput(dataFiltro) : null;
  if (dataFiltro) {
    where.data = dataFiltro;
  } else if (filtroMes && filtroAno && filtroMes <= 12) {
    const range = getMonthDateRange(filtroMes, filtroAno);
    where.data = { gte: range.start, lte: range.end };
  } else if (filtroAno) {
    const range = getYearDateRange(filtroAno);
    where.data = { gte: range.start, lte: range.end };
  }

  if (filtroArea) {
    where.area = filtroArea;
  }
  if (filtroTurno) {
    where.turno = filtroTurno;
  }
  if (filtroStatus) {
    where.status = filtroStatus;
  }
  if (filtroResponsavel) {
    where.assinaturaResponsavel = { contains: filtroResponsavel, mode: "insensitive" };
  }

  const [registros, areaConfigs, areasHistoricas] = await Promise.all([
    prisma.planoLimpezaDiarioRegistro.findMany({
      where,
      orderBy: [{ data: "desc" }, { turno: "asc" }, { area: "asc" }]
    }),
    prisma.planoLimpezaDiarioArea.findMany({
      orderBy: [{ ordem: "asc" }, { nome: "asc" }]
    }),
    prisma.planoLimpezaDiarioRegistro.findMany({
      select: { area: true },
      distinct: ["area"],
      orderBy: { area: "asc" }
    })
  ]);

  const areaOptions = Array.from(
    new Set([...areaConfigs.map((item) => item.nome), ...areasHistoricas.map((item) => item.area)])
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));

  const signId = parsePositiveInt(firstParam(params.signId));
  const registroParaAssinatura = signId
    ? await prisma.planoLimpezaDiarioRegistro.findUnique({ where: { id: signId } })
    : null;
  const etapaAssinatura = registroParaAssinatura ? getDailySignStage(registroParaAssinatura) : null;

  const fechamentoMesRaw = parsePositiveInt(firstParam(params.fechamentoMes));
  const fechamentoAnoRaw = parsePositiveInt(firstParam(params.fechamentoAno));
  const fechamentoMes =
    fechamentoMesRaw && fechamentoMesRaw >= 1 && fechamentoMesRaw <= 12
      ? fechamentoMesRaw
      : now.getMonth() + 1;
  const fechamentoAno = fechamentoAnoRaw ?? now.getFullYear();

  const periodos = new Map<string, { mes: number; ano: number }>();
  for (const registro of registros) {
    const periodo = getMonthYear(registro.data);
    periodos.set(periodKey(periodo.mes, periodo.ano), periodo);
  }
  if (registroParaAssinatura) {
    const periodo = getMonthYear(registroParaAssinatura.data);
    periodos.set(periodKey(periodo.mes, periodo.ano), periodo);
  }
  periodos.set(periodKey(fechamentoMes, fechamentoAno), {
    mes: fechamentoMes,
    ano: fechamentoAno
  });

  const periodosFechados = periodos.size
    ? await prisma.planoLimpezaFechamento.findMany({
        where: {
          tipo: TipoPlanoLimpeza.DIARIO,
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
          getMonthYear(registroParaAssinatura.data).mes,
          getMonthYear(registroParaAssinatura.data).ano
        )
      )
    : false;

  const paramsRetorno = new URLSearchParams();
  if (filtroData) paramsRetorno.set("filtroData", filtroData);
  if (filtroMes) paramsRetorno.set("filtroMes", String(filtroMes));
  if (filtroAno) paramsRetorno.set("filtroAno", String(filtroAno));
  if (filtroArea) paramsRetorno.set("filtroArea", filtroArea);
  if (filtroTurno) paramsRetorno.set("filtroTurno", filtroTurno);
  if (filtroStatus) paramsRetorno.set("filtroStatus", filtroStatus);
  if (filtroResponsavel) paramsRetorno.set("filtroResponsavel", filtroResponsavel);
  paramsRetorno.set("fechamentoMes", String(fechamentoMes));
  paramsRetorno.set("fechamentoAno", String(fechamentoAno));

  const returnTo = buildPathWithParams(paramsRetorno);

  const rangeFechamento = getMonthDateRange(fechamentoMes, fechamentoAno);
  const [registrosFechamento, fechamentoAtual] = await Promise.all([
    prisma.planoLimpezaDiarioRegistro.findMany({
      where: { data: { gte: rangeFechamento.start, lte: rangeFechamento.end } },
      orderBy: [{ data: "desc" }, { area: "asc" }, { turno: "asc" }]
    }),
    prisma.planoLimpezaFechamento.findUnique({
      where: {
        tipo_mes_ano: { tipo: TipoPlanoLimpeza.DIARIO, mes: fechamentoMes, ano: fechamentoAno }
      }
    })
  ]);

  const resumoFechamentoCompleto = consolidateDailyRecordsByDay(
    registrosFechamento,
    formatDateInput
  );
  const resumoFechamento = resumoFechamentoCompleto.slice(0, 10);
  const fechamentoAssinado = fechamentoAtual?.status === StatusFechamentoPlanoLimpeza.ASSINADO;
  const reaberturaFormId = `reabertura-form-diario-${fechamentoMes}-${fechamentoAno}`;

  return (
    <div className="space-y-6 dark:text-slate-100">
      <DailyChecklistSync date={syncDate} enabled={areaConfigs.length > 0} />

      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Plano de Limpeza Diário
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Checklist diário automático por área e turno configurados.
            </p>
          </div>
          <div className="btn-group">
            <Link href="/plano-limpeza" className="btn-secondary">
              Voltar para Módulo
            </Link>
            <Link href="/plano-limpeza/diario/historico" className="btn-secondary">
              Histórico Completo
            </Link>
            <Link href="/plano-limpeza/diario/opcoes" className="btn-secondary">
              Gerenciar Plano Diário
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

      {areaConfigs.length === 0 ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          Nenhuma área do plano diário foi configurada ainda. Use
          {" "}
          <strong>Gerenciar Plano Diário</strong>
          {" "}
          para cadastrar áreas e turnos antes de operar o checklist.
        </section>
      ) : null}

      <section className={CARD_CLASS}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Registros Automáticos do Dia
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
            <input
              type="number"
              name="filtroAno"
              min={2020}
              max={2100}
              defaultValue={filtroAno ?? ""}
              className={INPUT_CLASS}
            />
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
            Turno
            <select name="filtroTurno" defaultValue={filtroTurno ?? ""} className={INPUT_CLASS}>
              <option value="">Todos</option>
              {TURNO_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Status
            <select name="filtroStatus" defaultValue={filtroStatus ?? ""} className={INPUT_CLASS}>
              <option value="">Todos</option>
              {DAILY_STATUS_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-700 dark:text-slate-200 md:col-span-3">
            Responsável pela Limpeza
            <input
              type="text"
              name="filtroResponsavel"
              defaultValue={filtroResponsavel}
              className={INPUT_CLASS}
            />
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

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <tr>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Turno</th>
                <th className="px-3 py-2">Área</th>
                <th className="px-3 py-2">Responsável pela Limpeza</th>
                <th className="px-3 py-2">Supervisor</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {registros.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-3 text-slate-500 dark:text-slate-400">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : (
                registros.map((registro) => {
                  const periodo = getMonthYear(registro.data);
                  const bloqueado = fechadosSet.has(periodKey(periodo.mes, periodo.ano));
                  const etapa = getDailySignStage(registro);
                  const hrefAssinar = (() => {
                    const q = new URLSearchParams(paramsRetorno);
                    q.set("signId", String(registro.id));
                    return buildPathWithParams(q);
                  })();

                  return (
                    <tr key={registro.id}>
                      <td className="px-3 py-2">{formatDateDisplay(registro.data)}</td>
                      <td className="px-3 py-2">{getTurnoLabel(registro.turno)}</td>
                      <td className="px-3 py-2">{registro.area}</td>
                      <td className="px-3 py-2">{registro.assinaturaResponsavel || "-"}</td>
                      <td className="px-3 py-2">{registro.assinaturaSupervisor || "-"}</td>
                      <td className="px-3 py-2">
                        <StatusBadge status={registro.status} />
                      </td>
                      <td className="px-3 py-2">
                        {bloqueado ? (
                          <span className="text-xs text-slate-500 dark:text-slate-400">Bloqueado</span>
                        ) : etapa ? (
                          <Link href={hrefAssinar} className="btn-action">
                            Assinar
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            Sem Ação
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
      </section>

      <section className={CARD_CLASS}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Fechamento Mensal</h2>

        <form method="get" className="grid gap-3 rounded-lg bg-slate-50 p-4 md:grid-cols-4 dark:bg-slate-800">
          <input type="hidden" name="filtroData" value={filtroData} />
          <input type="hidden" name="filtroMes" value={filtroMes ? String(filtroMes) : ""} />
          <input type="hidden" name="filtroAno" value={filtroAno ? String(filtroAno) : ""} />
          <input type="hidden" name="filtroArea" value={filtroArea} />
          <input type="hidden" name="filtroTurno" value={filtroTurno ?? ""} />
          <input type="hidden" name="filtroStatus" value={filtroStatus ?? ""} />
          <input type="hidden" name="filtroResponsavel" value={filtroResponsavel} />

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
            <input
              type="number"
              name="fechamentoAno"
              min={2020}
              max={2100}
              defaultValue={fechamentoAno}
              className={INPUT_CLASS}
            />
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
          {resumoFechamentoCompleto.length > 10 ? (
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              Exibindo os últimos 10 dias com registros neste período.
            </p>
          ) : null}

          <div className="mb-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Total de Áreas</th>
                  <th className="px-3 py-2">Concluídas</th>
                  <th className="px-3 py-2">Aguardando Supervisor</th>
                  <th className="px-3 py-2">Pendentes</th>
                  <th className="px-3 py-2">Situação Geral</th>
                  <th className="px-3 py-2">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {resumoFechamento.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-2 text-slate-500 dark:text-slate-400">
                      Nenhum registro no período selecionado.
                    </td>
                  </tr>
                ) : (
                  resumoFechamento.map((dia) => (
                    <tr key={formatDateInput(dia.data)}>
                      <td className="px-3 py-2">{formatDateDisplay(dia.data)}</td>
                      <td className="px-3 py-2">{dia.totalAreas}</td>
                      <td className="px-3 py-2">{dia.concluido}</td>
                      <td className="px-3 py-2">{dia.aguardandoSupervisor}</td>
                      <td className="px-3 py-2">{dia.pendente}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getDailyConsolidatedStatusClass(
                            dia.situacaoGeral
                          )}`}
                        >
                          {dia.situacaoGeral}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <details>
                          <summary className="cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-200">
                            Ver Áreas
                          </summary>
                          <div className="mt-2 overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
                            <table className="min-w-full divide-y divide-slate-200 text-xs dark:divide-slate-700">
                              <thead className="bg-slate-50 dark:bg-slate-800">
                                <tr>
                                  <th className="px-2 py-1 text-left">Turno</th>
                                  <th className="px-2 py-1 text-left">Área</th>
                                  <th className="px-2 py-1 text-left">Responsável</th>
                                  <th className="px-2 py-1 text-left">Supervisor</th>
                                  <th className="px-2 py-1 text-left">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {dia.detalhes.map((detalhe) => (
                                  <tr key={detalhe.id}>
                                    <td className="px-2 py-1">{getTurnoLabel(detalhe.turno)}</td>
                                    <td className="px-2 py-1">{detalhe.area}</td>
                                    <td className="px-2 py-1">{detalhe.assinaturaResponsavel || "-"}</td>
                                    <td className="px-2 py-1">{detalhe.assinaturaSupervisor || "-"}</td>
                                    <td className="px-2 py-1">
                                      <StatusBadge status={detalhe.status} />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      </td>
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
              <form id={reaberturaFormId} action={reopenDailyMonthAction} className="mt-4">
                <input type="hidden" name="mes" value={String(fechamentoMes)} />
                <input type="hidden" name="ano" value={String(fechamentoAno)} />
                <input type="hidden" name="returnTo" value={returnTo} />
              </form>
              <ReopenMonthModal mes={fechamentoMes} ano={fechamentoAno} formId={reaberturaFormId} />
            </div>
          ) : (
            <form action={closeDailyMonthAction} className="grid gap-3 md:grid-cols-2">
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
        <DailySignChecklistModal
          closeHref={returnTo}
          returnTo={returnTo}
          record={registroParaAssinatura}
          etapa={etapaAssinatura}
        />
      ) : null}
    </div>
  );
}
