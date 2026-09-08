import { getMonthRangesForBounds, parseFilterMonth, parseFilterYear } from "@/lib/month-filter";
import {
  ModuloDocumento,
  Prisma,
  StatusFechamentoPlanoLimpeza,
  TipoPlanoLimpeza
} from "@prisma/client";
import Link from "next/link";

import { SignatureContextCard } from "@/components/auth/signature-context-card";
import { DocumentosModuleHeader } from "@/components/documentos/documentos-module-header";
import { ActionModal, ModalActions } from "@/components/ui/action-modal";
import { getCurrentUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  canManageModuleOptions,
  canViewManagementSections,
  getRoleLabel
} from "@/lib/rbac";

import { signDailyAreaPendingItemsAction } from "../actions";
import { DAILY_STATUS_OPTIONS, MONTH_OPTIONS } from "../constants";
import { StatusBadge } from "../status-badge";
import {
  formatDateDisplay,
  formatDateInput,
  formatDateTimeDisplay,
  getCurrentSystemDateTime,
  getMonthDateRange,
  getMonthYear,
  getTodaySystemDate,
  getYearDateRange,
  parseDailyStatus,
  parseDateInput,
  parsePositiveInt,
  periodKey
} from "../utils";
import { DailyChecklistSync } from "./daily-checklist-sync";

const PAGE_PATH = "/plano-limpeza/diario";
const CARD_CLASS =
  "bpma-card";
const INPUT_CLASS =
  "bpma-input";

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

type DailyAreaStatus = "Pendente" | "Parcial" | "Concluída";

function getDailyItemDescription(record: {
  itemDescricao: string | null;
  area: string;
}): string {
  return record.itemDescricao?.trim() || record.area;
}

function getDailyAreaStatus(totalItems: number, signedItems: number): DailyAreaStatus {
  if (totalItems > 0 && signedItems === totalItems) {
    return "Concluída";
  }

  if (signedItems > 0) {
    return "Parcial";
  }

  return "Pendente";
}

export default async function PlanoLimpezaDiarioPage({ searchParams }: PageProps) {
  const authUser = await getCurrentUser();
  const responsavelLogado = authUser?.nomeCompleto ?? "Usuário logado";
  const perfilLogado = authUser ? getRoleLabel(authUser.perfil) : "";
  const isColaborador = authUser?.perfil === "COLABORADOR";
  const podeVerGestao = authUser ? canViewManagementSections(authUser) : false;
  const podeGerenciarOpcoes = authUser ? canManageModuleOptions(authUser) : false;

  const params = await searchParams;
  const feedback = firstParam(params.feedback).trim();
  const feedbackType = firstParam(params.feedbackType) === "error" ? "error" : "success";

  const now = getCurrentSystemDateTime();
  const todayDbDate = getTodaySystemDate();

  const todayInput = formatDateInput(todayDbDate);
  const filtroData = firstParam(params.filtroData).trim();
  const filtroMesRaw = firstParam(params.filtroMes).trim();
  const filtroAnoRaw = firstParam(params.filtroAno).trim();
  const filtroArea = firstParam(params.filtroArea).trim();
  const filtroStatusRaw = firstParam(params.filtroStatus).trim();
  const filtroResponsavel = firstParam(params.filtroResponsavel).trim();
  const openArea = firstParam(params.openArea).trim();
  const openData = parseDateInput(firstParam(params.openData).trim());

  const hasManualFilters = Boolean(
    filtroData ||
      filtroMesRaw ||
      filtroAnoRaw ||
      filtroArea ||
      filtroStatusRaw ||
      filtroResponsavel
  );

  const filtroMes = parseFilterMonth(filtroMesRaw);
  const filtroAno = parseFilterYear(filtroAnoRaw);
  const filtroStatus = parseDailyStatus(filtroStatusRaw);

  const where: Prisma.PlanoLimpezaDiarioRegistroWhereInput = {};
  const dataFiltro = parseDateInput(filtroData);
  // Keep today's checklist creation independent from the optional list filter.
  const syncDate = dataFiltro ? formatDateInput(dataFiltro) : !hasManualFilters ? todayInput : null;
  if (dataFiltro) {
    where.data = dataFiltro;
  } else if (filtroMes && filtroAno && filtroMes <= 12) {
    const range = getMonthDateRange(filtroMes, filtroAno);
    where.data = { gte: range.start, lte: range.end };
  } else if (filtroAno) {
    const range = getYearDateRange(filtroAno);
    where.data = { gte: range.start, lte: range.end };
  } else if (filtroMes) {
    const bounds = await prisma.planoLimpezaDiarioRegistro.aggregate({
      _min: { data: true },
      _max: { data: true }
    });
    where.OR = getMonthRangesForBounds(filtroMes, bounds._min.data, bounds._max.data)
      .map(({ start, end }) => ({ data: { gte: start, lte: end } }));
  }

  if (filtroArea) {
    where.area = filtroArea;
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
      orderBy: [{ data: "desc" }, { area: "asc" }, { updatedAt: "desc" }]
    }),
    prisma.planoLimpezaDiarioArea.findMany({
      include: {
        itens: {
          where: { excluidoEm: null },
          orderBy: [{ ordem: "asc" }, { descricao: "asc" }]
        }
      },
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
  const detalhamentoPorArea = new Map(
    areaConfigs.map((item) => [item.nome, item.detalhamentoLimpeza])
  );

  const fechamentoMesRaw = parsePositiveInt(firstParam(params.fechamentoMes));
  const fechamentoAnoRaw = parsePositiveInt(firstParam(params.fechamentoAno));
  const periodoAtual = getMonthYear(now);
  const fechamentoMes =
    fechamentoMesRaw && fechamentoMesRaw >= 1 && fechamentoMesRaw <= 12
      ? fechamentoMesRaw
      : periodoAtual.mes;
  const fechamentoAno = fechamentoAnoRaw ?? periodoAtual.ano;

  const periodos = new Map<string, { mes: number; ano: number }>();
  for (const registro of registros) {
    const periodo = getMonthYear(registro.data);
    periodos.set(periodKey(periodo.mes, periodo.ano), periodo);
  }
  if (dataFiltro) {
    const periodo = getMonthYear(dataFiltro);
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

  const paramsRetorno = new URLSearchParams();
  if (filtroData) paramsRetorno.set("filtroData", filtroData);
  if (filtroMes) paramsRetorno.set("filtroMes", String(filtroMes));
  if (filtroAno) paramsRetorno.set("filtroAno", String(filtroAno));
  if (filtroArea) paramsRetorno.set("filtroArea", filtroArea);
  if (filtroStatus) paramsRetorno.set("filtroStatus", filtroStatus);
  if (filtroResponsavel) paramsRetorno.set("filtroResponsavel", filtroResponsavel);
  paramsRetorno.set("fechamentoMes", String(fechamentoMes));
  paramsRetorno.set("fechamentoAno", String(fechamentoAno));

  type DailyRecord = (typeof registros)[number];
  type DailyAreaConfig = (typeof areaConfigs)[number];
  type DailyAreaItem = DailyAreaConfig["itens"][number];
  type DailyAreaSummary = {
    key: string;
    data: Date;
    area: string;
    signedItems: number;
    totalItems: number;
    status: DailyAreaStatus | "Sem itens cadastrados";
    records: DailyRecord[];
    items: DailyAreaItem[];
  };

  const isDailyRecordSigned = (record: DailyRecord): boolean =>
    record.assinaturaResponsavel.trim().length > 0 ||
    Boolean(record.assinaturaResponsavelDataHora);
  const summaryKey = (date: Date, area: string): string => `${formatDateInput(date)}|${area}`;
  const pickDailyRecord = (
    current: DailyRecord | undefined,
    candidate: DailyRecord
  ): DailyRecord => {
    if (!current) {
      return candidate;
    }

    const currentSigned = isDailyRecordSigned(current);
    const candidateSigned = isDailyRecordSigned(candidate);

    if (candidateSigned && !currentSigned) {
      return candidate;
    }

    if (
      candidateSigned === currentSigned &&
      candidate.updatedAt.getTime() > current.updatedAt.getTime()
    ) {
      return candidate;
    }

    return current;
  };

  const areaSummariesByKey = new Map<string, DailyAreaSummary>();
  const activeDailyAreas = areaConfigs.filter((area) => area.ativo);
  const areaConfigByName = new Map(areaConfigs.map((area) => [area.nome, area]));
  const recordsByDateAreaItem = new Map<string, DailyRecord>();

  for (const registro of registros) {
    if (!registro.itemId) {
      continue;
    }

    const key = `${formatDateInput(registro.data)}|${registro.area}|${registro.itemId}`;
    recordsByDateAreaItem.set(key, pickDailyRecord(recordsByDateAreaItem.get(key), registro));
  }

  if (dataFiltro) {
    for (const area of activeDailyAreas) {
      if (filtroArea && area.nome !== filtroArea) {
        continue;
      }

      const activeItems = area.itens.filter((item) => item.ativo && !item.excluidoEm);
      const recordsForArea: DailyRecord[] = [];
      let signedItems = 0;

      for (const item of activeItems) {
        const record = recordsByDateAreaItem.get(
          `${formatDateInput(dataFiltro)}|${area.nome}|${item.id}`
        );
        if (record) {
          recordsForArea.push(record);
        }
        if (record && isDailyRecordSigned(record)) {
          signedItems += 1;
        }
      }

      const status =
        activeItems.length === 0
          ? "Sem itens cadastrados"
          : getDailyAreaStatus(activeItems.length, signedItems);

      if (
        filtroStatus &&
        recordsForArea.length > 0 &&
        !recordsForArea.some((record) => record.status === filtroStatus)
      ) {
        continue;
      }

      const key = summaryKey(dataFiltro, area.nome);
      areaSummariesByKey.set(key, {
        key,
        data: dataFiltro,
        area: area.nome,
        signedItems,
        totalItems: activeItems.length,
        status,
        records: recordsForArea,
        items: activeItems
      });
    }

    for (const registro of registros) {
      if (areaConfigByName.get(registro.area)?.ativo) {
        continue;
      }

      const key = summaryKey(registro.data, registro.area);
      const current =
        areaSummariesByKey.get(key) ??
        ({
          key,
          data: registro.data,
          area: registro.area,
          signedItems: 0,
          totalItems: 0,
          status: "Pendente",
          records: [],
          items: []
        } satisfies DailyAreaSummary);

      current.records.push(registro);
      current.totalItems += 1;
      if (isDailyRecordSigned(registro)) {
        current.signedItems += 1;
      }
      current.status = getDailyAreaStatus(current.totalItems, current.signedItems);
      areaSummariesByKey.set(key, current);
    }
  } else {
    for (const registro of registros) {
      const key = summaryKey(registro.data, registro.area);
      const areaConfig = areaConfigByName.get(registro.area);
      const activeItems =
        areaConfig?.itens.filter((item) => item.ativo && !item.excluidoEm) ?? [];
      const current =
        areaSummariesByKey.get(key) ??
        ({
          key,
          data: registro.data,
          area: registro.area,
          signedItems: 0,
          totalItems: 0,
          status: "Pendente",
          records: [],
          items: activeItems
        } satisfies DailyAreaSummary);

      current.records.push(registro);
      current.totalItems =
        current.items.length > 0
          ? current.items.length
          : new Set(current.records.map((record) => record.itemId ?? `legacy-${record.id}`))
              .size;
      current.signedItems = current.records.filter(isDailyRecordSigned).length;
      current.status =
        current.totalItems === 0
          ? "Sem itens cadastrados"
          : getDailyAreaStatus(current.totalItems, Math.min(current.signedItems, current.totalItems));
      areaSummariesByKey.set(key, current);
    }
  }

  const areaSummaries = Array.from(areaSummariesByKey.values()).sort((a, b) => {
    const dateDiff = b.data.getTime() - a.data.getTime();
    if (dateDiff !== 0) return dateDiff;
    return a.area.localeCompare(b.area, "pt-BR");
  });
  const openedSummary =
    openData && openArea
      ? areaSummaries.find(
          (summary) =>
            formatDateInput(summary.data) === formatDateInput(openData) &&
            summary.area === openArea
        ) ?? null
      : null;

  const returnTo = buildPathWithParams(paramsRetorno);
  const openSummaryReturnTo = openedSummary
    ? (() => {
        const query = new URLSearchParams(paramsRetorno);
        query.set("openData", formatDateInput(openedSummary.data));
        query.set("openArea", openedSummary.area);
        return buildPathWithParams(query);
      })()
    : returnTo;
  const signAreaSelecionada = openedSummary && firstParam(params.signArea) === "1";
  const openedSummaryPeriod = openedSummary ? getMonthYear(openedSummary.data) : null;
  const openedSummaryBloqueado =
    openedSummaryPeriod !== null &&
    fechadosSet.has(periodKey(openedSummaryPeriod.mes, openedSummaryPeriod.ano));
  const podeAssinarTodos =
    Boolean(authUser && hasPermission(authUser, "modulo.limpeza_diaria.assinar_todos")) &&
    openedSummary !== null &&
    openedSummary.totalItems > 0 &&
    openedSummary.signedItems < openedSummary.totalItems &&
    !openedSummaryBloqueado;
  const hrefAssinarTodos = openedSummary
    ? (() => {
        const query = new URLSearchParams(paramsRetorno);
        query.set("openData", formatDateInput(openedSummary.data));
        query.set("openArea", openedSummary.area);
        query.set("signArea", "1");
        return buildPathWithParams(query);
      })()
    : returnTo;

  const modalDailyRows = openedSummary
    ? openedSummary.items.length > 0
      ? openedSummary.items.map((item) => ({
          key: `item-${item.id}`,
          title: item.descricao,
          produtoUtilizado: item.produtoUtilizado,
          setorResponsavel: item.setorResponsavel,
          funcionarioResponsavel: item.funcionarioResponsavel,
          registro:
            openedSummary.records.find((record) => record.itemId === item.id) ?? null
        }))
      : openedSummary.records.map((registro) => ({
          key: `registro-${registro.id}`,
          title: getDailyItemDescription(registro),
          produtoUtilizado: registro.produtoUtilizado,
          setorResponsavel: registro.setorResponsavel,
          funcionarioResponsavel: registro.funcionarioResponsavel,
          registro
        }))
    : [];

  return (
    <div className="space-y-6 dark:text-slate-100">
      <DailyChecklistSync date={syncDate} enabled={areaConfigs.length > 0} />

      <DocumentosModuleHeader
        title="Plano de Limpeza Diário"
        description="Checklist diário automático por área e itens/locais assináveis."
        modulo={ModuloDocumento.PLANO_LIMPEZA_DIARIO}
        modulePath={PAGE_PATH}
        searchParams={params}
        managementHref={podeGerenciarOpcoes ? "/plano-limpeza/diario/opcoes" : undefined}
        maintenanceHref="/chamados-manutencao?origem=LIMPEZA"
        backHref="/plano-limpeza"
        actions={
          <>
            {podeVerGestao ? (
              <Link href="/plano-limpeza/diario/historico" className="btn-secondary">
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

      {areaConfigs.length === 0 ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          {podeGerenciarOpcoes ? (
            <>
              Nenhuma área do plano diário foi configurada ainda. Use{" "}
              <strong>Gerenciar Plano Diário</strong>{" "}
              para cadastrar áreas e itens/locais antes de operar o checklist.
            </>
          ) : (
            "Nenhuma área do plano diário foi configurada ainda. Solicite à gestão a configuração do plano."
          )}
        </section>
      ) : null}

      <section className={CARD_CLASS}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Áreas do Dia
        </h2>

        {isColaborador ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            Exibindo tarefas e pendências registradas.
          </p>
        ) : (
          <form method="get" className="grid gap-3 rounded-lg bg-slate-50 p-4 md:grid-cols-5 dark:bg-slate-800">
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

            <div className="btn-group md:col-span-5">
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
        )}

        {areaSummaries.length === 0 ? (
          <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            Nenhuma área diária encontrada.
          </p>
        ) : (
          <>
            <div className="mt-4 grid gap-3 md:hidden">
              {areaSummaries.map((summary) => {
                const q = new URLSearchParams(paramsRetorno);
                q.set("openData", formatDateInput(summary.data));
                q.set("openArea", summary.area);

                return (
                  <article
                    key={summary.key}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800"
                  >
                    <div className="flex flex-col gap-3">
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {formatDateDisplay(summary.data)}
                        </p>
                        <p className="mt-1 break-words text-base font-semibold text-slate-900 dark:text-slate-100">
                          {summary.area}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                        <span>
                          {summary.totalItems > 0
                            ? `${summary.signedItems} de ${summary.totalItems} assinados`
                            : "Sem itens cadastrados"}
                        </span>
                        {summary.status === "Sem itens cadastrados" ? (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            Sem itens cadastrados
                          </span>
                        ) : (
                          <StatusBadge status={summary.status} />
                        )}
                      </div>
                      <Link href={buildPathWithParams(q)} scroll={false} className="btn-action">
                        Abrir
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="mt-4 hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <tr>
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2">Área</th>
                    <th className="px-3 py-2">Itens assinados</th>
                    <th className="px-3 py-2">Status da área</th>
                    <th className="px-3 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {areaSummaries.map((summary) => {
                    const q = new URLSearchParams(paramsRetorno);
                    q.set("openData", formatDateInput(summary.data));
                    q.set("openArea", summary.area);

                    return (
                      <tr key={summary.key}>
                        <td className="px-3 py-2">{formatDateDisplay(summary.data)}</td>
                        <td className="px-3 py-2">{summary.area}</td>
                        <td className="px-3 py-2">
                          {summary.totalItems > 0
                            ? `${summary.signedItems} de ${summary.totalItems}`
                            : "Sem itens cadastrados"}
                        </td>
                        <td className="px-3 py-2">
                          {summary.status === "Sem itens cadastrados" ? (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              Sem itens cadastrados
                            </span>
                          ) : (
                            <StatusBadge status={summary.status} />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Link href={buildPathWithParams(q)} scroll={false} className="btn-action">
                            Abrir
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
      {openedSummary ? (
        <ActionModal
          title={openedSummary.area}
          cancelHref={returnTo}
          maxWidthClassName="max-w-5xl"
          headerActions={
            openedSummary.totalItems > 0 ? (
              podeAssinarTodos ? (
                <Link href={hrefAssinarTodos} scroll={false} className="btn-primary">
                  Assinar Todos
                </Link>
              ) : (
                <button type="button" disabled className="btn-primary opacity-60">
                  Assinar Todos
                </button>
              )
            ) : null
          }
          description={
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <span>{formatDateDisplay(openedSummary.data)}</span>
              <span aria-hidden="true" className="hidden text-slate-400 sm:inline">
                •
              </span>
              <span>
                {openedSummary.totalItems > 0
                  ? `${openedSummary.signedItems} de ${openedSummary.totalItems} itens assinados`
                  : "Sem itens cadastrados"}
              </span>
              {openedSummary.status === "Sem itens cadastrados" ? (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Sem itens cadastrados
                </span>
              ) : (
                <StatusBadge status={openedSummary.status} />
              )}
            </div>
          }
        >
          {feedback ? (
            <p
              className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
                feedbackType === "error"
                  ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
              }`}
            >
              {feedback}
            </p>
          ) : null}

          {detalhamentoPorArea.get(openedSummary.area) ? (
            <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Orientação geral da área
              </p>
              <p className="mt-1 whitespace-pre-line break-words text-slate-700 dark:text-slate-200">
                {detalhamentoPorArea.get(openedSummary.area)}
              </p>
            </div>
          ) : null}

          {modalDailyRows.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              Esta área ainda não possui itens/locais cadastrados.
            </p>
          ) : (
            <div className="grid gap-3">
              {modalDailyRows.map((row) => {
                const registro = row.registro;

                return (
                  <article
                    key={row.key}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <p className="break-words font-medium text-slate-900 dark:text-slate-100">
                          {row.title}
                        </p>
                        <div className="mt-2 grid gap-1 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-3">
                          <p>Produto: <strong>{row.produtoUtilizado || "-"}</strong></p>
                          <p>Setor: <strong>{row.setorResponsavel || "-"}</strong></p>
                          <p>Funcionário: <strong>{row.funcionarioResponsavel || "-"}</strong></p>
                        </div>
                        <div className="mt-3 grid gap-1 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-2">
                          <p>
                            Responsável: <strong>{registro?.assinaturaResponsavel || "-"}</strong>
                          </p>
                          <p>
                            Quando:{" "}
                            <strong>
                              {registro?.assinaturaResponsavelDataHora
                                ? formatDateTimeDisplay(registro.assinaturaResponsavelDataHora)
                                : "Ainda não assinado"}
                            </strong>
                          </p>
                          <p>
                            Supervisor: <strong>{registro?.assinaturaSupervisor || "-"}</strong>
                          </p>
                          <p>
                            Visto em:{" "}
                            <strong>
                              {registro?.assinaturaSupervisorDataHora
                                ? formatDateTimeDisplay(registro.assinaturaSupervisorDataHora)
                                : "-"}
                            </strong>
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        <StatusBadge status={registro?.status ?? "Pendente"} />
                        {!registro ? (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            Será assinado no lote
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            Sem Ação
                          </span>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </ActionModal>
      ) : null}

      {openedSummary && signAreaSelecionada ? (
        <ActionModal
          title="Assinar todos os itens"
          cancelHref={openSummaryReturnTo}
          description={
            <p>
              {openedSummary.area} em {formatDateDisplay(openedSummary.data)}.
            </p>
          }
        >
          {!podeAssinarTodos ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
              Não há itens pendentes elegíveis para assinatura em lote nesta área.
            </p>
          ) : (
            <form action={signDailyAreaPendingItemsAction} className="space-y-4">
              <input type="hidden" name="data" value={formatDateInput(openedSummary.data)} />
              <input type="hidden" name="area" value={openedSummary.area} />
              <input type="hidden" name="returnTo" value={openSummaryReturnTo} />
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Deseja assinar todos os itens pendentes desta área?
              </p>
              <label className="block text-sm text-slate-700 dark:text-slate-200">
                Confirme sua senha *
                <input type="password" name="senhaConfirmacao" required className={INPUT_CLASS} />
              </label>
              <SignatureContextCard
                nomeUsuario={responsavelLogado}
                perfil={perfilLogado}
                dataHora={formatDateTimeDisplay(now)}
              />
              <ModalActions>
                <Link href={openSummaryReturnTo} className="btn-secondary text-center">
                  Cancelar
                </Link>
                <button type="submit" className="btn-primary">
                  Assinar Todos
                </button>
              </ModalActions>
            </form>
          )}
        </ActionModal>
      ) : null}
    </div>
  );
}
