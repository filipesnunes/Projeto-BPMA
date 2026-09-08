import { Prisma, StatusPlanoLimpeza } from "@prisma/client";
import Link from "next/link";
import { Fragment } from "react";

import { SignatureContextCard } from "@/components/auth/signature-context-card";
import { MonthlyClosureSection, SignDayForm, SupervisorSignatureStatus } from "@/components/historico/technical-signature";
import { ActionModal, ModalActions } from "@/components/ui/action-modal";
import { getCurrentUser } from "@/lib/auth-session";
import { formatAppDate, formatAppDateInput, getAppDate, getAppMonthDateRange, getAppMonthYear } from "@/lib/date-time";
import { canSignModuleDay, canSignModuleMonthlyClosure } from "@/lib/module-signatures";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getMonthRangesForBounds, parseFilterMonth, parseFilterYear } from "@/lib/month-filter";
import { getRoleLabel } from "@/lib/rbac";

import { signDailyAreaPendingItemsAction } from "../../actions";
import { DAILY_STATUS_OPTIONS, MONTH_OPTIONS, TURNO_OPTIONS } from "../../constants";
import {
  getExpectedDailyCleaningTasksForDateRange,
  getDailyConsolidatedStatusClass
} from "../../service";
import {
  formatDateDisplay,
  formatDateInput,
  formatDateTimeDisplay,
  getCurrentSystemDateTime,
  getMonthDateRange,
  getYearDateRange,
  parseDailyStatus,
  parseDateInput,
  parseTurno
} from "../../utils";

const PAGE_PATH = "/plano-limpeza/diario/historico";
const CARD_CLASS = "bpma-card";
const INPUT_CLASS = "bpma-input";
const MODULE_CODE = "limpeza_diaria";

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

function statusLabel(status: StatusPlanoLimpeza): string {
  if (status === StatusPlanoLimpeza.CONCLUIDO) return "Concluído";
  if (status === StatusPlanoLimpeza.AGUARDANDO_SUPERVISOR) return "Aguardando supervisor";
  return "Pendente";
}

export default async function PlanoLimpezaDiarioHistoricoPage({ searchParams }: PageProps) {
  const authUser = await getCurrentUser();
  const canSignDay = authUser ? canSignModuleDay(authUser, MODULE_CODE) : false;
  const canSignMonthly = authUser ? canSignModuleMonthlyClosure(authUser, MODULE_CODE) : false;
  const canRegularizeHistory = authUser
    ? hasPermission(authUser, "modulo.limpeza_diaria.assinar_historico") ||
      hasPermission(authUser, "modulo.limpeza_diaria.assinar_todos")
    : false;
  const responsavelLogado = authUser?.nomeCompleto ?? "Usuário logado";
  const perfilLogado = authUser ? getRoleLabel(authUser.perfil) : "";
  const now = getCurrentSystemDateTime();

  const params = await searchParams;
  const filtroData = firstParam(params.filtroData).trim();
  const filtroMes = parseFilterMonth(firstParam(params.filtroMes).trim());
  const filtroAno = parseFilterYear(firstParam(params.filtroAno).trim());
  const filtroArea = firstParam(params.filtroArea).trim();
  const filtroTurno = parseTurno(firstParam(params.filtroTurno).trim());
  const filtroStatus = parseDailyStatus(firstParam(params.filtroStatus).trim());
  const filtroResponsavel = firstParam(params.filtroResponsavel).trim();
  const feedback = firstParam(params.feedback).trim();
  const feedbackType = firstParam(params.feedbackType) === "error" ? "error" : "success";
  const diaAberto = firstParam(params.dia).trim();
  const regularizarArea = firstParam(params.regularizarArea).trim();

  const today = getAppDate();
  const todayMonth = getAppMonthYear(today);
  const selectedMonth = filtroMes && filtroMes <= 12 ? filtroMes : todayMonth.mes;
  const selectedYear = filtroAno ?? todayMonth.ano;
  const selectedMonthRange = getAppMonthDateRange(selectedMonth, selectedYear);
  const dataFiltro = parseDateInput(filtroData);

  const rawHistoryRanges = await (async () => {
    if (dataFiltro) {
      return [{ start: dataFiltro, end: dataFiltro }];
    }

    if (filtroMes && filtroAno && filtroMes <= 12) {
      return [getMonthDateRange(filtroMes, filtroAno)];
    }

    if (filtroAno) {
      return [getYearDateRange(filtroAno)];
    }

    if (filtroMes) {
      const [records, areas] = await Promise.all([
        prisma.planoLimpezaDiarioRegistro.aggregate({ _min: { data: true } }),
        prisma.planoLimpezaDiarioArea.aggregate({ _min: { createdAt: true } })
      ]);
      // This history also includes expected tasks since areas were configured.
      const starts = [records._min.data, areas._min.createdAt]
        .filter((date): date is Date => date !== null);
      const first = starts.length ? new Date(Math.min(...starts.map((date) => date.getTime()))) : null;
      return getMonthRangesForBounds(filtroMes, first, today);
    }

    return [selectedMonthRange];
  })();
  const historyRanges = rawHistoryRanges
    .map(({ start, end }) => ({ start, end: end > today ? today : end }))
    .filter(({ start, end }) => start <= end);
  const selectedMonthEnd =
    selectedMonthRange.end.getTime() > today.getTime() ? today : selectedMonthRange.end;
  const selectedMonthHistoryRange =
    selectedMonthRange.start.getTime() <= selectedMonthEnd.getTime()
      ? { start: selectedMonthRange.start, end: selectedMonthEnd }
      : null;

  const registrosWhere: Prisma.PlanoLimpezaDiarioRegistroWhereInput = {
    OR: historyRanges.map(({ start, end }) => ({ data: { gte: start, lte: end } }))
  };
  const registrosMensaisWhere: Prisma.PlanoLimpezaDiarioRegistroWhereInput =
    selectedMonthHistoryRange
      ? {
          data: {
            gte: selectedMonthHistoryRange.start,
            lte: selectedMonthHistoryRange.end
          }
        }
      : { id: -1 };

  const [registros, registrosMensais, areaConfigs, areasHistoricas, fechamentoMensal] = await Promise.all([
    prisma.planoLimpezaDiarioRegistro.findMany({
      where: registrosWhere,
      orderBy: [{ data: "desc" }, { turno: "asc" }, { area: "asc" }]
    }),
    prisma.planoLimpezaDiarioRegistro.findMany({
      where: registrosMensaisWhere,
      orderBy: [{ data: "desc" }, { turno: "asc" }, { area: "asc" }]
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

  const areaOptions = Array.from(
    new Set([...areaConfigs.map((item) => item.nome), ...areasHistoricas.map((item) => item.area)])
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));

  type DailyRecord = (typeof registros)[number];
  type DailyHistoryItem = {
    key: string;
    data: Date;
    turno: DailyRecord["turno"];
    area: string;
    itemId: number | null;
    itemDescricao: string;
    produtoUtilizado: string | null;
    setorResponsavel: string | null;
    funcionarioResponsavel: string | null;
    record: DailyRecord | null;
    status: StatusPlanoLimpeza;
    signedByResponsible: boolean;
    signedBySupervisor: boolean;
  };
  type DailyAreaSummary = {
    key: string;
    data: Date;
    area: string;
    totalItems: number;
    signedItems: number;
    pendingItems: number;
    statusLabel: "Pendente" | "Parcial" | "Concluído";
    items: DailyHistoryItem[];
  };
  type DailyDaySummary = {
    data: Date;
    totalAreas: number;
    concluido: number;
    parcial: number;
    pendente: number;
    situacaoGeral: "Pendente" | "Parcial" | "Concluído";
    areas: DailyAreaSummary[];
  };

  const isRealDailyRecord = (registro: DailyRecord): boolean =>
    registro.status !== StatusPlanoLimpeza.PENDENTE ||
    registro.assinaturaResponsavel.trim().length > 0 ||
    Boolean(registro.assinaturaResponsavelUsuarioId) ||
    Boolean(registro.assinaturaResponsavelDataHora) ||
    registro.assinaturaSupervisor.trim().length > 0 ||
    Boolean(registro.assinaturaSupervisorUsuarioId) ||
    Boolean(registro.assinaturaSupervisorDataHora) ||
    Boolean(registro.observacao?.trim()) ||
    Boolean(registro.observacaoResponsavel?.trim()) ||
    Boolean(registro.observacaoSupervisor?.trim());
  const recordKey = (date: Date, turno: DailyRecord["turno"], itemId: number): string =>
    `${formatDateInput(date)}|${turno}|${itemId}`;
  const isSignedByResponsible = (registro: DailyRecord | null): boolean =>
    Boolean(registro?.assinaturaResponsavel.trim() || registro?.assinaturaResponsavelDataHora);
  const isSignedBySupervisor = (registro: DailyRecord | null): boolean =>
    Boolean(registro?.assinaturaSupervisor.trim() || registro?.assinaturaSupervisorDataHora);
  const pickRecord = (current: DailyRecord | undefined, candidate: DailyRecord): DailyRecord => {
    if (!current) return candidate;

    const currentSigned = isSignedByResponsible(current);
    const candidateSigned = isSignedByResponsible(candidate);
    if (candidateSigned && !currentSigned) return candidate;
    if (
      candidateSigned === currentSigned &&
      candidate.updatedAt.getTime() > current.updatedAt.getTime()
    ) {
      return candidate;
    }

    return current;
  };

  function buildDailyHistorySummaries(
    records: DailyRecord[],
    tasks: ReturnType<typeof getExpectedDailyCleaningTasksForDateRange>,
    applyFilters: boolean
  ): DailyDaySummary[] {
    const recordsByTask = new Map<string, DailyRecord>();
    for (const registro of records) {
      if (!registro.itemId) {
        continue;
      }
      const key = recordKey(registro.data, registro.turno, registro.itemId);
      recordsByTask.set(key, pickRecord(recordsByTask.get(key), registro));
    }

    const itemsByKey = new Map<string, DailyHistoryItem>();
    for (const task of tasks) {
      const key = recordKey(task.data, task.turno, task.itemId);
      const record = recordsByTask.get(key) ?? null;
      const signedByResponsible = isSignedByResponsible(record);
      const signedBySupervisor = isSignedBySupervisor(record);
      const status = signedByResponsible
        ? signedBySupervisor
          ? StatusPlanoLimpeza.CONCLUIDO
          : StatusPlanoLimpeza.AGUARDANDO_SUPERVISOR
        : StatusPlanoLimpeza.PENDENTE;

      itemsByKey.set(key, {
        key,
        data: task.data,
        turno: task.turno,
        area: task.area,
        itemId: task.itemId,
        itemDescricao: task.itemDescricao,
        produtoUtilizado: task.produtoUtilizado,
        setorResponsavel: task.setorResponsavel,
        funcionarioResponsavel: task.funcionarioResponsavel,
        record,
        status,
        signedByResponsible,
        signedBySupervisor
      });
    }

    for (const registro of records) {
      if (registro.itemId) {
        const key = recordKey(registro.data, registro.turno, registro.itemId);
        if (itemsByKey.has(key) || !isRealDailyRecord(registro)) {
          continue;
        }
      } else if (!isRealDailyRecord(registro)) {
        continue;
      }

      const key = registro.itemId
        ? recordKey(registro.data, registro.turno, registro.itemId)
        : `${formatDateInput(registro.data)}|legacy|${registro.id}`;
      const signedByResponsible = isSignedByResponsible(registro);
      const signedBySupervisor = isSignedBySupervisor(registro);
      itemsByKey.set(key, {
        key,
        data: registro.data,
        turno: registro.turno,
        area: registro.area,
        itemId: registro.itemId,
        itemDescricao: registro.itemDescricao?.trim() || registro.area,
        produtoUtilizado: registro.produtoUtilizado,
        setorResponsavel: registro.setorResponsavel,
        funcionarioResponsavel: registro.funcionarioResponsavel,
        record: registro,
        status: registro.status,
        signedByResponsible,
        signedBySupervisor
      });
    }

    const filteredItems = Array.from(itemsByKey.values()).filter((item) => {
      if (applyFilters && filtroArea && item.area !== filtroArea) return false;
      if (applyFilters && filtroTurno && item.turno !== filtroTurno) return false;
      if (applyFilters && filtroStatus && item.status !== filtroStatus) return false;
      if (
        applyFilters &&
        filtroResponsavel &&
        !item.record?.assinaturaResponsavel
          .toLocaleLowerCase("pt-BR")
          .includes(filtroResponsavel.toLocaleLowerCase("pt-BR"))
      ) {
        return false;
      }

      return true;
    });

    const areaMap = new Map<string, DailyAreaSummary>();
    for (const item of filteredItems) {
      const areaKey = `${formatDateInput(item.data)}|${item.area}`;
      const current =
        areaMap.get(areaKey) ??
        ({
          key: areaKey,
          data: item.data,
          area: item.area,
          totalItems: 0,
          signedItems: 0,
          pendingItems: 0,
          statusLabel: "Pendente",
          items: []
        } satisfies DailyAreaSummary);

      current.items.push(item);
      areaMap.set(areaKey, current);
    }

    for (const area of areaMap.values()) {
      area.items.sort((first, second) => {
        const itemDiff = (first.itemId ?? 0) - (second.itemId ?? 0);
        if (itemDiff !== 0) return itemDiff;
        return first.itemDescricao.localeCompare(second.itemDescricao, "pt-BR");
      });
      area.totalItems = area.items.length;
      area.signedItems = area.items.filter((item) => item.signedByResponsible).length;
      area.pendingItems = area.totalItems - area.signedItems;
      area.statusLabel =
        area.signedItems === 0
          ? "Pendente"
          : area.signedItems === area.totalItems
            ? "Concluído"
            : "Parcial";
    }

    const dayMap = new Map<string, DailyDaySummary>();
    for (const area of areaMap.values()) {
      const dateKey = formatDateInput(area.data);
      const current =
        dayMap.get(dateKey) ??
        ({
          data: area.data,
          totalAreas: 0,
          concluido: 0,
          parcial: 0,
          pendente: 0,
          situacaoGeral: "Pendente",
          areas: []
        } satisfies DailyDaySummary);

      current.areas.push(area);
      dayMap.set(dateKey, current);
    }

    return Array.from(dayMap.values())
      .map((day) => {
        day.areas.sort((first, second) => first.area.localeCompare(second.area, "pt-BR"));
        day.totalAreas = day.areas.length;
        day.concluido = day.areas.filter((area) => area.statusLabel === "Concluído").length;
        day.parcial = day.areas.filter((area) => area.statusLabel === "Parcial").length;
        day.pendente = day.areas.filter((area) => area.statusLabel === "Pendente").length;
        day.situacaoGeral =
          day.totalAreas > 0 && day.concluido === day.totalAreas
            ? "Concluído"
            : day.concluido === 0 && day.parcial === 0
              ? "Pendente"
              : "Parcial";
        return day;
      })
      .sort((first, second) => second.data.getTime() - first.data.getTime());
  }

  const expectedTasks = historyRanges.flatMap(({ start, end }) =>
    getExpectedDailyCleaningTasksForDateRange({
        start,
        end,
        today,
        areaConfigs
      })
  );
  const expectedMonthlyTasks = selectedMonthHistoryRange
    ? getExpectedDailyCleaningTasksForDateRange({
        start: selectedMonthHistoryRange.start,
        end: selectedMonthHistoryRange.end,
        today,
        areaConfigs
      })
    : [];
  const resumo = buildDailyHistorySummaries(registros, expectedTasks, true);
  const resumoMensal = buildDailyHistorySummaries(
    registrosMensais,
    expectedMonthlyTasks,
    false
  );
  const datasHistorico = resumo.map((dia) => dia.data);
  const datasMensais = resumoMensal.map((dia) => dia.data);
  const [assinaturasHistorico, assinaturasMensais] = await Promise.all([
    datasHistorico.length
      ? prisma.assinaturaDiariaModulo.findMany({
          where: { moduloCodigo: MODULE_CODE, dataReferencia: { in: datasHistorico } }
        })
      : Promise.resolve([]),
    datasMensais.length
      ? prisma.assinaturaDiariaModulo.findMany({
          where: { moduloCodigo: MODULE_CODE, dataReferencia: { in: datasMensais } }
        })
      : Promise.resolve([])
  ]);
  const assinaturasPorData = new Map(
    assinaturasHistorico.map((assinatura) => [formatAppDateInput(assinatura.dataReferencia), assinatura])
  );
  const assinaturasMensaisPorData = new Set(
    assinaturasMensais.map((assinatura) => formatAppDateInput(assinatura.dataReferencia))
  );

  const parametrosRetorno = new URLSearchParams();
  if (filtroData) parametrosRetorno.set("filtroData", filtroData);
  if (filtroMes) parametrosRetorno.set("filtroMes", String(filtroMes));
  if (filtroAno) parametrosRetorno.set("filtroAno", String(filtroAno));
  if (filtroArea) parametrosRetorno.set("filtroArea", filtroArea);
  if (filtroTurno) parametrosRetorno.set("filtroTurno", filtroTurno);
  if (filtroStatus) parametrosRetorno.set("filtroStatus", filtroStatus);
  if (filtroResponsavel) parametrosRetorno.set("filtroResponsavel", filtroResponsavel);
  const returnTo = buildPathWithParams(parametrosRetorno);
  const buildOpenDayHref = (dateInput: string): string => {
    const query = new URLSearchParams(parametrosRetorno);
    query.set("dia", dateInput);
    return buildPathWithParams(query);
  };
  const buildRegularizeAreaHref = (dateInput: string, area: string): string => {
    const query = new URLSearchParams(parametrosRetorno);
    query.set("dia", dateInput);
    query.set("regularizarArea", area);
    return buildPathWithParams(query);
  };
  const diaSelecionado = diaAberto
    ? resumo.find((dia) => formatDateInput(dia.data) === diaAberto)
    : null;
  const areaRegularizacao =
    diaSelecionado && regularizarArea
      ? diaSelecionado.areas.find((area) => area.area === regularizarArea) ?? null
      : null;

  const totalAreasCompletas = resumoMensal.reduce((total, dia) => total + dia.concluido, 0);
  const totalAreasParciais = resumoMensal.reduce((total, dia) => total + dia.parcial, 0);
  const totalPendencias = resumoMensal.reduce((total, dia) => total + dia.pendente, 0);
  const totalItensExecutados = resumoMensal.reduce(
    (total, dia) =>
      total +
      dia.areas.reduce((areaTotal, area) => areaTotal + area.signedItems, 0),
    0
  );
  const indicadoresMensais = {
    "Mês/Ano": `${String(selectedMonth).padStart(2, "0")}/${selectedYear}`,
    "Dias previstos": resumoMensal.length,
    "Dias executados": resumoMensal.length,
    "Áreas completas": totalAreasCompletas,
    "Áreas parciais": totalAreasParciais,
    "Itens/locais executados": totalItensExecutados,
    "Pendências": totalPendencias,
    "Dias assinados": assinaturasMensaisPorData.size,
    "Dias pendentes de assinatura": Math.max(resumoMensal.length - assinaturasMensaisPorData.size, 0)
  };

  return (
    <div className="space-y-6 dark:text-slate-100">
      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Histórico Completo - Plano Diário
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Visão por dia com revisão do supervisor e fechamento mensal.
            </p>
          </div>
          <div className="btn-group">
            <Link href="/plano-limpeza/diario" className="btn-secondary">
              Voltar ao Módulo
            </Link>
            <Link href="/plano-limpeza/diario/opcoes" className="btn-secondary">
              Gerenciar Plano Diário
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
                <option key={area} value={area}>{area}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Turno
            <select name="filtroTurno" defaultValue={filtroTurno ?? ""} className={INPUT_CLASS}>
              <option value="">Todos</option>
              {TURNO_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Status
            <select name="filtroStatus" defaultValue={filtroStatus ?? ""} className={INPUT_CLASS}>
              <option value="">Todos</option>
              {DAILY_STATUS_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200 md:col-span-3">
            Responsável pela Limpeza
            <input type="text" name="filtroResponsavel" defaultValue={filtroResponsavel} className={INPUT_CLASS} />
          </label>
          <div className="btn-group md:col-span-6">
            <button type="submit" className="btn-primary">Aplicar Filtros</button>
            <Link href={PAGE_PATH} className="btn-secondary">Limpar</Link>
          </div>
        </form>
      </section>

      <section className={CARD_CLASS}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Dias no Histórico ({resumo.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <tr>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Total de Áreas</th>
                <th className="px-3 py-2">Concluídas</th>
                <th className="px-3 py-2">Parciais</th>
                <th className="px-3 py-2">Pendentes</th>
                <th className="px-3 py-2">Situação Geral</th>
                <th className="px-3 py-2">Assinatura</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {resumo.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-3 text-slate-500 dark:text-slate-400">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : (
                resumo.map((dia) => {
                  const dateInput = formatDateInput(dia.data);
                  return (
                    <tr key={dateInput}>
                      <td className="px-3 py-2">{formatDateDisplay(dia.data)}</td>
                      <td className="px-3 py-2">{dia.totalAreas}</td>
                      <td className="px-3 py-2">{dia.concluido}</td>
                      <td className="px-3 py-2">{dia.parcial}</td>
                      <td className="px-3 py-2">{dia.pendente}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getDailyConsolidatedStatusClass(dia.situacaoGeral)}`}>
                          {dia.situacaoGeral}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <SupervisorSignatureStatus signature={assinaturasPorData.get(dateInput) ?? null} />
                      </td>
                      <td className="px-3 py-2">
                        <Link href={buildOpenDayHref(dateInput)} scroll={false} className="btn-action">
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

      <MonthlyClosureSection
        moduleCode={MODULE_CODE}
        month={selectedMonth}
        year={selectedYear}
        returnTo={returnTo}
        indicators={indicadoresMensais}
        signedClosure={fechamentoMensal}
        canSign={canSignMonthly}
        pendingDailySignatures={indicadoresMensais["Dias pendentes de assinatura"]}
      />

      {diaSelecionado && !areaRegularizacao ? (
        <ActionModal
          title={`Plano Diário de ${formatAppDate(diaSelecionado.data)}`}
          cancelHref={returnTo}
          maxWidthClassName="max-w-6xl"
          description={<p>Esta assinatura valida a revisão de todos os registros deste dia.</p>}
        >
          <div className="mb-4">
            <SupervisorSignatureStatus
              signature={assinaturasPorData.get(formatAppDateInput(diaSelecionado.data)) ?? null}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <tr>
                  <th className="px-3 py-2">Área</th>
                  <th className="px-3 py-2">Item/local</th>
                  <th className="px-3 py-2">Turno</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Responsável</th>
                  <th className="px-3 py-2">Supervisor</th>
                  <th className="px-3 py-2">Observações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {diaSelecionado.areas.map((area) => {
                  const dateInput = formatDateInput(area.data);
                  return (
                    <Fragment key={area.key}>
                      <tr className="bg-slate-50/70 dark:bg-slate-800/60">
                        <td className="px-3 py-3 font-medium text-slate-900 dark:text-slate-100">
                          {area.area}
                        </td>
                        <td className="px-3 py-3" colSpan={3}>
                          {area.signedItems}/{area.totalItems} item(ns) assinados
                        </td>
                        <td className="px-3 py-3" colSpan={2}>
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getDailyConsolidatedStatusClass(area.statusLabel)}`}>
                            {area.statusLabel}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          {canRegularizeHistory && area.pendingItems > 0 ? (
                            <Link
                              href={buildRegularizeAreaHref(dateInput, area.area)}
                              scroll={false}
                              className="btn-action"
                            >
                              Regularizar pendências
                            </Link>
                          ) : null}
                        </td>
                      </tr>
                      {area.items.map((item) => (
                        <tr key={item.key}>
                          <td className="px-3 py-2">{item.area}</td>
                          <td className="px-3 py-2">{item.itemDescricao || "-"}</td>
                          <td className="px-3 py-2">{item.turno}</td>
                          <td className="px-3 py-2">{statusLabel(item.status)}</td>
                          <td className="px-3 py-2">{item.record?.assinaturaResponsavel || "-"}</td>
                          <td className="px-3 py-2">{item.record?.assinaturaSupervisor || "-"}</td>
                          <td className="px-3 py-2 max-w-80 whitespace-normal break-words">
                            {item.record?.observacaoSupervisor ??
                              item.record?.observacaoResponsavel ??
                              item.record?.observacao ??
                              "-"}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <SignDayForm
            moduleCode={MODULE_CODE}
            dateInput={formatAppDateInput(diaSelecionado.data)}
            returnTo={buildOpenDayHref(formatAppDateInput(diaSelecionado.data))}
            canSign={canSignDay}
            alreadySigned={Boolean(assinaturasPorData.get(formatAppDateInput(diaSelecionado.data)))}
            hasOperationalWarnings={diaSelecionado.pendente > 0 || diaSelecionado.parcial > 0}
          />
        </ActionModal>
      ) : null}

      {diaSelecionado && areaRegularizacao ? (
        <ActionModal
          title={`Regularizar ${areaRegularizacao.area}`}
          cancelHref={buildOpenDayHref(formatDateInput(diaSelecionado.data))}
          maxWidthClassName="max-w-2xl"
          description={
            <p>
              A regularização cria os registros operacionais faltantes para{" "}
              {formatAppDate(diaSelecionado.data)} usando a data e hora reais da assinatura.
            </p>
          }
        >
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
              {areaRegularizacao.pendingItems} item(ns) sem assinatura de responsável nesta área.
            </div>

            {!canRegularizeHistory ? (
              <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
                Seu perfil não possui permissão para regularizar pendências históricas.
              </p>
            ) : (
              <form action={signDailyAreaPendingItemsAction} className="space-y-4">
                <input type="hidden" name="data" value={formatDateInput(diaSelecionado.data)} />
                <input type="hidden" name="area" value={areaRegularizacao.area} />
                <input
                  type="hidden"
                  name="returnTo"
                  value={buildOpenDayHref(formatDateInput(diaSelecionado.data))}
                />
                <input type="hidden" name="historicalRegularization" value="true" />

                <SignatureContextCard
                  nomeUsuario={responsavelLogado}
                  perfil={perfilLogado}
                  dataHora={formatDateTimeDisplay(now)}
                />

                <label className="block text-sm text-slate-700 dark:text-slate-200">
                  Confirme sua senha *
                  <input type="password" name="senhaConfirmacao" required className={INPUT_CLASS} />
                </label>

                <label className="block text-sm text-slate-700 dark:text-slate-200">
                  Observação
                  <textarea name="observacao" rows={3} className={INPUT_CLASS} />
                </label>

                <ModalActions>
                  <Link
                    href={buildOpenDayHref(formatDateInput(diaSelecionado.data))}
                    scroll={false}
                    className="btn-secondary"
                  >
                    Cancelar
                  </Link>
                  <button type="submit" className="btn-primary">
                    Regularizar pendências
                  </button>
                </ModalActions>
              </form>
            )}
          </div>
        </ActionModal>
      ) : null}
    </div>
  );
}
