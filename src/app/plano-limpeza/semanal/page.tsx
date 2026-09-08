import { getMonthRangesForBounds, parseFilterMonth, parseFilterYear } from "@/lib/month-filter";
import {
  ModuloDocumento,
  Prisma,
  StatusFechamentoPlanoLimpeza,
  StatusPlanoLimpeza,
  TipoPlanoLimpeza
} from "@prisma/client";
import Link from "next/link";

import { DocumentosModuleHeader } from "@/components/documentos/documentos-module-header";
import { getCurrentUser } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import {
  canManageModuleOptions,
  canSignAsResponsible,
  canViewManagementSections
} from "@/lib/rbac";

import { MONTH_OPTIONS, WEEKLY_STATUS_OPTIONS } from "../constants";
import {
  consolidateWeeklyExecutionsByAreaWeek,
  getWeeklySignStage
} from "../service";
import { StatusBadge } from "../status-badge";
import {
  formatDateDisplay,
  formatDateInput,
  formatDateTimeDisplay,
  formatWeeklyExecutionQuando,
  getCurrentSystemDateTime,
  getCurrentWeekDateRange,
  getMonthDateRange,
  getMonthYear,
  getWeekDateRangeForDate,
  getYearDateRange,
  parseDateInput,
  parsePositiveInt,
  parseWeeklyStatus,
  periodKey
} from "../utils";
import { WeeklySignChecklistModal } from "./sign-checklist-modal";
import { WeeklyChecklistSync } from "./weekly-checklist-sync";
import {
  canSignAllWeeklyItems,
  canSignHistoricalWeeklyItems,
  canSignWeeklyAreaSupervisor,
  canSignWeeklyItems,
  isHistoricalWeeklySignature
} from "../weekly-permissions";

const PAGE_PATH = "/plano-limpeza/semanal";
const CARD_CLASS = "bpma-card";
const INPUT_CLASS = "bpma-input";

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

type WeeklyExecutionPageRecord = {
  id: number;
  dataExecucao: Date;
  area: string;
  assinaturaResponsavel: string;
  assinaturaResponsavelDataHora: Date | null;
  assinaturaSupervisor: string;
  status: StatusPlanoLimpeza;
  itemDescricao: string | null;
  quando: string | null;
  item: {
    id: number;
    ordem: number;
    oQueLimpar: string;
    quando: string | null;
  };
};

function getExecutionItemDescription(record: WeeklyExecutionPageRecord): string {
  return record.itemDescricao?.trim() || record.item.oQueLimpar;
}

function getWeeklyRecordStatus(record: {
  status: StatusPlanoLimpeza;
  assinaturaResponsavel: string;
  assinaturaSupervisor: string;
}): StatusPlanoLimpeza {
  const hasResponsavel = record.assinaturaResponsavel.trim().length > 0;
  const hasSupervisor = record.assinaturaSupervisor.trim().length > 0;

  if (hasResponsavel && hasSupervisor) {
    return StatusPlanoLimpeza.CONCLUIDO;
  }

  if (hasResponsavel) {
    return StatusPlanoLimpeza.AGUARDANDO_SUPERVISOR;
  }

  return record.status;
}

function getWeeklyExecutionQuandoLabel(record: {
  assinaturaResponsavel: string;
  assinaturaResponsavelDataHora: Date | null;
  quando: string | null;
}): string {
  return formatWeeklyExecutionQuando(record);
}

function summaryMatchesStatus(
  summary: ReturnType<typeof consolidateWeeklyExecutionsByAreaWeek>[number],
  recordsById: Map<number, WeeklyExecutionPageRecord>,
  filtroStatus: StatusPlanoLimpeza | null
): boolean {
  if (!filtroStatus) {
    return true;
  }

  if (filtroStatus === StatusPlanoLimpeza.CONCLUIDO) {
    return summary.statusGeral === "Concluído";
  }

  if (filtroStatus === StatusPlanoLimpeza.PENDENTE) {
    return summary.statusGeral === "Pendente";
  }

  return summary.recordIds.some((id) => {
    const record = recordsById.get(id);
    return record ? getWeeklyRecordStatus(record) === filtroStatus : false;
  });
}

export default async function PlanoLimpezaSemanalPage({ searchParams }: PageProps) {
  const authUser = await getCurrentUser();
  const responsavelLogado = authUser?.nomeCompleto ?? "Usuário logado";
  const isColaborador = authUser?.perfil === "COLABORADOR";
  const podeVerGestao = authUser ? canViewManagementSections(authUser) : false;
  const podeGerenciarOpcoes = authUser ? canManageModuleOptions(authUser) : false;

  const params = await searchParams;
  const feedback = firstParam(params.feedback).trim();
  const feedbackType = firstParam(params.feedbackType) === "error" ? "error" : "success";

  const now = getCurrentSystemDateTime();
  const filtroDataRaw = firstParam(params.filtroData).trim();
  const filtroMesRaw = firstParam(params.filtroMes).trim();
  const filtroAnoRaw = firstParam(params.filtroAno).trim();
  const filtroArea = firstParam(params.filtroArea).trim();
  const filtroStatusRaw = firstParam(params.filtroStatus).trim();
  const filtroItem = firstParam(params.filtroItem).trim();

  const hasManualFilters =
    !isColaborador &&
    Boolean(
      filtroDataRaw ||
        filtroMesRaw ||
        filtroAnoRaw ||
        filtroArea ||
        filtroStatusRaw ||
        filtroItem
    );

  const filtroData = hasManualFilters ? filtroDataRaw : "";
  const filtroMes = parseFilterMonth(filtroMesRaw);
  const filtroAno = parseFilterYear(filtroAnoRaw);
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
  } else if (filtroMes) {
    const bounds = await prisma.planoLimpezaSemanalExecucao.aggregate({
      _min: { dataExecucao: true },
      _max: { dataExecucao: true }
    });
    where.OR = getMonthRangesForBounds(filtroMes, bounds._min.dataExecucao, bounds._max.dataExecucao)
      .map(({ start, end }) => ({ dataExecucao: { gte: start, lte: end } }));
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

  const [rawExecutions, allItems, weeklyAreas, areasHistoricas] = await Promise.all([
    prisma.planoLimpezaSemanalExecucao.findMany({
      where,
      select: {
        id: true,
        dataExecucao: true,
        area: true,
        itemDescricao: true,
        quando: true,
        assinaturaResponsavel: true,
        assinaturaResponsavelDataHora: true,
        assinaturaSupervisor: true,
        status: true,
        item: {
          select: {
            id: true,
            ordem: true,
            oQueLimpar: true,
            quando: true
          }
        }
      },
      orderBy: [{ dataExecucao: "desc" }, { area: "asc" }, { createdAt: "desc" }]
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
    })
  ]);

  const recordsById = new Map(rawExecutions.map((record) => [record.id, record]));
  const activeAreaNames = new Set(
    weeklyAreas.filter((area) => area.ativo && !area.excluidoEm).map((area) => area.nome)
  );
  const activeItems = allItems.filter(
    (item) => item.ativo && !item.excluidoEm && activeAreaNames.has(item.area)
  );
  const summariesAll = consolidateWeeklyExecutionsByAreaWeek(rawExecutions);
  const filteredByItemNames =
    filtroItem.trim().length > 0
      ? new Set(
          rawExecutions
            .filter((record) => includesIgnoreCase(getExecutionItemDescription(record), filtroItem))
            .map((record) => record.id)
        )
      : null;

  const summaries = summariesAll.filter((summary) => {
    if (filtroArea && summary.area !== filtroArea) {
      return false;
    }
    if (!summaryMatchesStatus(summary, recordsById, filtroStatus)) {
      return false;
    }
    if (filteredByItemNames && !summary.recordIds.some((id) => filteredByItemNames.has(id))) {
      return false;
    }

    return true;
  });

  const areaOptions = Array.from(
    new Set([
      ...weeklyAreas.filter((area) => !area.excluidoEm).map((area) => area.nome),
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
          id: { in: executionParaAssinatura.recordIds }
        },
        select: {
          id: true,
          itemDescricao: true,
          quando: true,
          status: true,
          assinaturaResponsavel: true,
          assinaturaResponsavelDataHora: true,
          assinaturaSupervisor: true,
          observacaoResponsavel: true,
          item: {
            select: {
              id: true,
              ordem: true,
              oQueLimpar: true,
              quando: true
            }
          }
        },
        orderBy: [{ item: { ordem: "asc" } }, { id: "asc" }]
      })
    : [];

  const periodos = new Map<string, { mes: number; ano: number }>();
  for (const summary of summaries) {
    const periodo = getMonthYear(summary.weekStart);
    periodos.set(periodKey(periodo.mes, periodo.ano), periodo);
  }
  if (executionParaAssinatura) {
    const periodo = getMonthYear(executionParaAssinatura.weekStart);
    periodos.set(periodKey(periodo.mes, periodo.ano), periodo);
  }
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
  const assinaturaHistoricaSelecionada = executionParaAssinatura
    ? isHistoricalWeeklySignature(executionParaAssinatura.weekStart, now)
    : false;
  const podeAssinarSupervisorSelecionado =
    Boolean(authUser && executionParaAssinatura) &&
    canSignWeeklyAreaSupervisor({
      user: authUser!,
      weekStart: executionParaAssinatura!.weekStart,
      referenceDate: now
    });
  const podeAssinarItensSelecionados =
    Boolean(authUser && executionParaAssinatura) &&
    canSignAsResponsible(authUser!) &&
    (assinaturaHistoricaSelecionada
      ? canSignHistoricalWeeklyItems(authUser!)
      : canSignWeeklyItems(authUser!));
  const podeAssinarTodosItensSelecionados =
    Boolean(authUser && executionParaAssinatura) &&
    canSignAsResponsible(authUser!) &&
    (assinaturaHistoricaSelecionada
      ? canSignHistoricalWeeklyItems(authUser!)
      : canSignAllWeeklyItems(authUser!)) &&
    !assinaturaBloqueadaPorFechamento;

  const paramsRetorno = new URLSearchParams();
  if (filtroData) paramsRetorno.set("filtroData", filtroData);
  if (filtroMes) paramsRetorno.set("filtroMes", String(filtroMes));
  if (filtroAno) paramsRetorno.set("filtroAno", String(filtroAno));
  if (filtroArea) paramsRetorno.set("filtroArea", filtroArea);
  if (filtroStatus) paramsRetorno.set("filtroStatus", filtroStatus);
  if (filtroItem) paramsRetorno.set("filtroItem", filtroItem);
  const returnTo = buildPathWithParams(paramsRetorno);

  return (
    <div className="space-y-6 dark:text-slate-100">
      <WeeklyChecklistSync
        startDate={syncStart}
        endDate={syncEnd}
        enabled={activeItems.length > 0 && Boolean(syncStart && syncEnd)}
      />

      <DocumentosModuleHeader
        title="Plano de Limpeza Semanal"
        description="Ciclo semanal por área, com assinatura individual dos itens/locais cadastrados."
        modulo={ModuloDocumento.PLANO_LIMPEZA_SEMANAL}
        modulePath={PAGE_PATH}
        searchParams={params}
        managementHref={podeGerenciarOpcoes ? "/plano-limpeza/semanal/opcoes" : undefined}
        maintenanceHref="/chamados-manutencao?origem=LIMPEZA"
        backHref="/plano-limpeza"
        actions={
          <>
            {podeVerGestao ? (
              <Link href="/plano-limpeza/semanal/historico" className="btn-secondary">
                Histórico
              </Link>
            ) : null}
          </>
        }
      />

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
          {podeGerenciarOpcoes ? (
            <>
              Nenhum item ativo do plano semanal foi configurado. Use{" "}
              <strong>Gerenciar Plano Semanal</strong>{" "}
              para cadastrar itens por área.
            </>
          ) : (
            "Nenhum item ativo do plano semanal foi configurado. Solicite à gestão a configuração do plano."
          )}
        </section>
      ) : null}

      <section className={CARD_CLASS}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          {isColaborador ? "Rotinas Semanais Operacionais" : "Áreas do Ciclo Semanal"}
        </h2>

        {isColaborador ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            Exibindo automaticamente as áreas da semana atual que exigem execução operacional.
          </p>
        ) : (
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
              <Link
                href={PAGE_PATH}
                className="btn-secondary"
              >
                Limpar
              </Link>
            </div>
          </form>
        )}

        {!hasManualFilters && !isColaborador ? (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Exibindo automaticamente o ciclo semanal atual, de segunda a domingo.
          </p>
        ) : null}

        <div className="mt-4 space-y-3 md:hidden">
          {summaries.length === 0 ? (
            <div className="rounded-lg border border-slate-200 p-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Nenhuma área semanal encontrada.
            </div>
          ) : (
            summaries.map((summary) => {
              const period = getMonthYear(summary.weekStart);
              const bloqueado = fechadosSet.has(periodKey(period.mes, period.ano));
              const hrefAbrir = (() => {
                const q = new URLSearchParams(paramsRetorno);
                q.set("signId", String(summary.executionId));
                return buildPathWithParams(q);
              })();

              return (
                <article key={`${summary.area}-${formatDateInput(summary.weekStart)}`} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {formatDateDisplay(summary.weekStart)} até {formatDateDisplay(summary.weekEnd)}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {summary.area}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Itens: {summary.completedItems} de {summary.totalRegistrosOriginais} concluídos
                  </p>
                  <div className="mt-2">
                    <StatusBadge status={summary.statusGeral} />
                  </div>
                  <div className="mt-3">
                    {bloqueado ? (
                      <span className="text-xs text-slate-500 dark:text-slate-400">Bloqueado</span>
                    ) : (
                      <Link href={hrefAbrir} className="btn-action">
                        Abrir
                      </Link>
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
                <th className="px-3 py-2">Itens</th>
                <th className="px-3 py-2">Status da Área</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {summaries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-3 text-slate-500 dark:text-slate-400">
                    Nenhuma área semanal encontrada.
                  </td>
                </tr>
              ) : (
                summaries.map((summary) => {
                  const period = getMonthYear(summary.weekStart);
                  const bloqueado = fechadosSet.has(periodKey(period.mes, period.ano));
                  const hrefAbrir = (() => {
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
                      <td className="px-3 py-2">
                        {summary.completedItems} de {summary.totalRegistrosOriginais} concluídos
                        <span className="block text-xs text-slate-500 dark:text-slate-400">
                          {summary.pendingItems} pendente(s)
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={summary.statusGeral} />
                      </td>
                      <td className="px-3 py-2">
                        {bloqueado ? (
                          <span className="text-xs text-slate-500 dark:text-slate-400">Bloqueado</span>
                        ) : (
                          <Link href={hrefAbrir} className="btn-action">
                            Abrir
                          </Link>
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

      {executionParaAssinatura &&
      executionItemsParaAssinatura.length > 0 &&
      !assinaturaBloqueadaPorFechamento ? (
        <WeeklySignChecklistModal
          closeHref={returnTo}
          returnTo={returnTo}
          usuarioAssinando={responsavelLogado}
          podeAssinarSupervisor={podeAssinarSupervisorSelecionado}
          podeAssinarItens={podeAssinarItensSelecionados}
          podeAssinarTodosItens={podeAssinarTodosItensSelecionados}
          isHistorico={assinaturaHistoricaSelecionada}
          dataHoraAtual={formatDateTimeDisplay(now)}
          execution={executionParaAssinatura}
          items={executionItemsParaAssinatura.map((executionItem) => ({
            id: executionItem.id,
            status: getWeeklyRecordStatus(executionItem),
            assinaturaResponsavel: executionItem.assinaturaResponsavel,
            observacaoResponsavel: executionItem.observacaoResponsavel,
            etapa: getWeeklySignStage(executionItem),
            quandoAssinado: getWeeklyExecutionQuandoLabel(executionItem),
            item: {
              id: executionItem.item.id,
              ordem: executionItem.item.ordem,
              oQueLimpar: executionItem.itemDescricao ?? executionItem.item.oQueLimpar
            }
          }))}
        />
      ) : null}
    </div>
  );
}
