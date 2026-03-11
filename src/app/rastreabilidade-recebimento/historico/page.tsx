import { Prisma, StatusNotaRecebimento } from "@prisma/client";
import Link from "next/link";

import { prisma } from "@/lib/prisma";

import { deleteNoteAction } from "../actions";
import { DeleteNoteModal } from "../delete-note-modal";
import { ThemeToggleButton } from "../theme-toggle-button";
import {
  formatDateDisplay,
  getMonthDateRange,
  getYearDateRange,
  parseDateInput,
  parsePositiveInt
} from "../utils";

const PAGE_PATH = "/rastreabilidade-recebimento/historico";
const CARD_CLASS =
  "rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900";
const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

const MONTH_OPTIONS = [
  { value: 1, label: "Janeiro" },
  { value: 2, label: "Fevereiro" },
  { value: 3, label: "Março" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Maio" },
  { value: 6, label: "Junho" },
  { value: 7, label: "Julho" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Setembro" },
  { value: 10, label: "Outubro" },
  { value: 11, label: "Novembro" },
  { value: 12, label: "Dezembro" }
];

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

function parseStatusNotaFilter(value: string): StatusNotaRecebimento | null {
  if (value === StatusNotaRecebimento.PENDENTE) return StatusNotaRecebimento.PENDENTE;
  if (value === StatusNotaRecebimento.FINALIZADA) return StatusNotaRecebimento.FINALIZADA;
  return null;
}

function getNotaStatusLabel(status: StatusNotaRecebimento): string {
  return status === StatusNotaRecebimento.FINALIZADA ? "Finalizada" : "Pendente";
}

function getNotaStatusClass(status: StatusNotaRecebimento): string {
  if (status === StatusNotaRecebimento.FINALIZADA) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
  }

  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200";
}

export default async function RastreabilidadeRecebimentoHistoricoPage({
  searchParams
}: PageProps) {
  const params = await searchParams;
  const feedback = firstParam(params.feedback).trim();
  const feedbackType = firstParam(params.feedbackType) === "error" ? "error" : "success";
  const filtroData = firstParam(params.filtroData).trim();
  const filtroMes = parsePositiveInt(firstParam(params.filtroMes).trim());
  const filtroAno = parsePositiveInt(firstParam(params.filtroAno).trim());
  const filtroFornecedor = firstParam(params.filtroFornecedor).trim();
  const filtroNotaFiscal = firstParam(params.filtroNotaFiscal).trim();
  const filtroResponsavel = firstParam(params.filtroResponsavel).trim();
  const filtroStatus = parseStatusNotaFilter(firstParam(params.filtroStatus).trim());

  const where: Prisma.RastreabilidadeRecebimentoNotaWhereInput = {};
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

  if (filtroFornecedor) {
    where.fornecedor = { contains: filtroFornecedor, mode: "insensitive" };
  }
  if (filtroNotaFiscal) {
    where.notaFiscal = { contains: filtroNotaFiscal, mode: "insensitive" };
  }
  if (filtroResponsavel) {
    where.responsavelGeral = { contains: filtroResponsavel, mode: "insensitive" };
  }
  if (filtroStatus) {
    where.statusNota = filtroStatus;
  }

  const notas = await prisma.rastreabilidadeRecebimentoNota.findMany({
    where,
    include: {
      _count: {
        select: {
          itens: true
        }
      }
    },
    orderBy: [{ data: "desc" }, { createdAt: "desc" }]
  });

  const paramsRetorno = new URLSearchParams();
  if (filtroData) paramsRetorno.set("filtroData", filtroData);
  if (filtroMes) paramsRetorno.set("filtroMes", String(filtroMes));
  if (filtroAno) paramsRetorno.set("filtroAno", String(filtroAno));
  if (filtroFornecedor) paramsRetorno.set("filtroFornecedor", filtroFornecedor);
  if (filtroNotaFiscal) paramsRetorno.set("filtroNotaFiscal", filtroNotaFiscal);
  if (filtroResponsavel) paramsRetorno.set("filtroResponsavel", filtroResponsavel);
  if (filtroStatus) paramsRetorno.set("filtroStatus", filtroStatus);
  const returnTo = buildPathWithParams(paramsRetorno);

  return (
    <div className="space-y-6 dark:text-slate-100">
      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Histórico Completo
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Consulta de notas recebidas e seus itens de conferência.
            </p>
          </div>
          <div className="btn-group">
            <Link href="/rastreabilidade-recebimento" className="btn-secondary">
              Voltar para Módulo
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

      <section className={CARD_CLASS}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Filtros
        </h2>
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
              min={2020}
              max={2100}
              name="filtroAno"
              defaultValue={filtroAno ?? ""}
              className={INPUT_CLASS}
            />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Fornecedor
            <input
              type="text"
              name="filtroFornecedor"
              defaultValue={filtroFornecedor}
              className={INPUT_CLASS}
            />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Número da Nota Fiscal
            <input
              type="text"
              name="filtroNotaFiscal"
              defaultValue={filtroNotaFiscal}
              className={INPUT_CLASS}
            />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Responsável
            <input
              type="text"
              name="filtroResponsavel"
              defaultValue={filtroResponsavel}
              className={INPUT_CLASS}
            />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Status da Nota
            <select name="filtroStatus" defaultValue={filtroStatus ?? ""} className={INPUT_CLASS}>
              <option value="">Todos</option>
              <option value={StatusNotaRecebimento.PENDENTE}>Pendente</option>
              <option value={StatusNotaRecebimento.FINALIZADA}>Finalizada</option>
            </select>
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
          Notas ({notas.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <tr>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Fornecedor</th>
                <th className="px-3 py-2">Número da Nota</th>
                <th className="px-3 py-2">Quantidade de Itens</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Responsável</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {notas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-3 text-slate-500 dark:text-slate-400">
                    Nenhuma nota encontrada.
                  </td>
                </tr>
              ) : (
                notas.map((nota) => (
                  <tr key={nota.id}>
                    <td className="px-3 py-2">{formatDateDisplay(nota.data)}</td>
                    <td className="px-3 py-2">{nota.fornecedor}</td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/rastreabilidade-recebimento/nota/${nota.id}`}
                        className="font-medium text-slate-900 underline-offset-2 hover:underline dark:text-slate-100"
                      >
                        {nota.notaFiscal}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{nota._count.itens}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getNotaStatusClass(
                          nota.statusNota
                        )}`}
                      >
                        {getNotaStatusLabel(nota.statusNota)}
                      </span>
                    </td>
                    <td className="px-3 py-2">{nota.responsavelGeral ?? "-"}</td>
                    <td className="px-3 py-2">
                      <div className="btn-group">
                        <Link
                          href={`/rastreabilidade-recebimento/nota/${nota.id}`}
                          className="btn-action"
                        >
                          Abrir Nota
                        </Link>
                        {nota.statusNota === StatusNotaRecebimento.PENDENTE ? (
                          <DeleteNoteModal formId={`delete-note-history-${nota.id}`} />
                        ) : null}
                      </div>
                      {nota.statusNota === StatusNotaRecebimento.PENDENTE ? (
                        <form
                          id={`delete-note-history-${nota.id}`}
                          action={deleteNoteAction}
                          className="hidden"
                        >
                          <input type="hidden" name="notaId" value={String(nota.id)} />
                          <input type="hidden" name="returnTo" value={returnTo} />
                        </form>
                      ) : null}
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
