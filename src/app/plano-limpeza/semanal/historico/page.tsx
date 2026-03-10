import { Prisma, StatusPlanoLimpeza } from "@prisma/client";
import Link from "next/link";

import { prisma } from "@/lib/prisma";

import { MONTH_OPTIONS, WEEKLY_AREAS, WEEKLY_STATUS_OPTIONS } from "../../constants";
import { StatusBadge } from "../../status-badge";
import { ThemeToggleButton } from "../../theme-toggle-button";
import {
  formatDateDisplay,
  getMonthDateRange,
  getYearDateRange,
  parseDateInput,
  parsePositiveInt,
  parseWeeklyStatus
} from "../../utils";

const PAGE_PATH = "/plano-limpeza/semanal/historico";
const CARD_CLASS =
  "rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900";
const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = { searchParams: Promise<SearchParams> };

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
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

  const execucoes = await prisma.planoLimpezaSemanalExecucao.findMany({
    where,
    include: { item: true },
    orderBy: [{ dataExecucao: "desc" }, { createdAt: "desc" }]
  });

  return (
    <div className="space-y-6 dark:text-slate-100">
      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Histórico do Plano Semanal
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Consulta completa das execuções semanais por item.
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
              {WEEKLY_AREAS.map((area) => (
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
          Registros ({execucoes.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <tr>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Área</th>
                <th className="px-3 py-2">O que limpar</th>
                <th className="px-3 py-2">Quando</th>
                <th className="px-3 py-2">Quem</th>
                <th className="px-3 py-2">Responsável</th>
                <th className="px-3 py-2">Supervisor</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {execucoes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-3 text-slate-500 dark:text-slate-400">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : (
                execucoes.map((execucao) => (
                  <tr key={execucao.id}>
                    <td className="px-3 py-2">{formatDateDisplay(execucao.dataExecucao)}</td>
                    <td className="px-3 py-2">{execucao.area}</td>
                    <td className="px-3 py-2">{execucao.item.oQueLimpar}</td>
                    <td className="px-3 py-2">{execucao.item.quando}</td>
                    <td className="px-3 py-2">{execucao.item.quem}</td>
                    <td className="px-3 py-2">{execucao.assinaturaResponsavel}</td>
                    <td className="px-3 py-2">{execucao.assinaturaSupervisor}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={execucao.status} />
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
