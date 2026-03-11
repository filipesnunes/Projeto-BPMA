import { Prisma } from "@prisma/client";
import Link from "next/link";

import { prisma } from "@/lib/prisma";

import { DAILY_STATUS_OPTIONS, MONTH_OPTIONS, TURNO_OPTIONS } from "../../constants";
import {
  consolidateDailyRecordsByDay,
  getDailyConsolidatedStatusClass
} from "../../service";
import { ThemeToggleButton } from "../../theme-toggle-button";
import {
  formatDateDisplay,
  formatDateInput,
  getMonthDateRange,
  getYearDateRange,
  parseDailyStatus,
  parseDateInput,
  parsePositiveInt,
  parseTurno
} from "../../utils";

const PAGE_PATH = "/plano-limpeza/diario/historico";
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

export default async function PlanoLimpezaDiarioHistoricoPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filtroData = firstParam(params.filtroData).trim();
  const filtroMes = parsePositiveInt(firstParam(params.filtroMes).trim());
  const filtroAno = parsePositiveInt(firstParam(params.filtroAno).trim());
  const filtroArea = firstParam(params.filtroArea).trim();
  const filtroTurno = parseTurno(firstParam(params.filtroTurno).trim());
  const filtroStatus = parseDailyStatus(firstParam(params.filtroStatus).trim());
  const filtroResponsavel = firstParam(params.filtroResponsavel).trim();

  const where: Prisma.PlanoLimpezaDiarioRegistroWhereInput = {};
  const dataFiltro = parseDateInput(filtroData);
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

  const resumo = consolidateDailyRecordsByDay(registros, formatDateInput);

  return (
    <div className="space-y-6 dark:text-slate-100">
      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Histórico do Plano Diário
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Visão principal por dia com acesso limpo ao detalhamento.
            </p>
          </div>
          <div className="btn-group">
            <Link href="/plano-limpeza/diario" className="btn-secondary">
              Voltar para Diário
            </Link>
            <Link href="/plano-limpeza/diario/opcoes" className="btn-secondary">
              Gerenciar Plano Diário
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
            <Link href={PAGE_PATH} className="btn-secondary">
              Limpar
            </Link>
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
                <th className="px-3 py-2">Aguardando Supervisor</th>
                <th className="px-3 py-2">Pendentes</th>
                <th className="px-3 py-2">Situação Geral</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {resumo.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-3 text-slate-500 dark:text-slate-400">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : (
                resumo.map((dia) => {
                  const hrefDia = `/plano-limpeza/diario/historico/dia/${encodeURIComponent(
                    formatDateInput(dia.data)
                  )}`;

                  return (
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
                        <Link href={hrefDia} className="btn-action">
                          Abrir Dia
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
    </div>
  );
}
