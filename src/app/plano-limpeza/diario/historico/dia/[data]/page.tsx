import { StatusFechamentoPlanoLimpeza, StatusPlanoLimpeza, TipoPlanoLimpeza } from "@prisma/client";
import Link from "next/link";

import { prisma } from "@/lib/prisma";

import { bulkSignDailyByDateAction } from "@/app/plano-limpeza/actions";
import { StatusBadge } from "@/app/plano-limpeza/status-badge";
import { ThemeToggleButton } from "@/app/plano-limpeza/theme-toggle-button";
import {
  consolidateDailyRecordsByDay,
  getDailyConsolidatedStatusClass
} from "@/app/plano-limpeza/service";
import {
  formatDateDisplay,
  formatDateInput,
  getMonthYear,
  getTurnoLabel,
  parseDateInput
} from "@/app/plano-limpeza/utils";

const CARD_CLASS =
  "rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900";
const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

type Params = { data: string };
type PageProps = { params: Promise<Params>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function PlanoLimpezaDiarioHistoricoDiaPage({
  params,
  searchParams
}: PageProps) {
  const { data } = await params;
  const query = await searchParams;
  const feedback = firstParam(query.feedback).trim();
  const feedbackType = firstParam(query.feedbackType) === "error" ? "error" : "success";

  const decoded = decodeURIComponent(data);
  const dateDb = parseDateInput(decoded);

  if (!dateDb) {
    return (
      <div className="space-y-6 dark:text-slate-100">
        <section className={CARD_CLASS}>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Detalhes do Dia</h1>
          <p className="mt-2 text-sm text-red-700 dark:text-red-300">Data inválida para consulta.</p>
          <div className="mt-4">
            <Link href="/plano-limpeza/diario/historico" className="btn-secondary">
              Voltar para Histórico
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const [registros, fechamento] = await Promise.all([
    prisma.planoLimpezaDiarioRegistro.findMany({
      where: { data: dateDb },
      orderBy: [{ turno: "asc" }, { area: "asc" }]
    }),
    prisma.planoLimpezaFechamento.findUnique({
      where: {
        tipo_mes_ano: {
          tipo: TipoPlanoLimpeza.DIARIO,
          mes: getMonthYear(dateDb).mes,
          ano: getMonthYear(dateDb).ano
        }
      }
    })
  ]);

  const periodClosed = fechamento?.status === StatusFechamentoPlanoLimpeza.ASSINADO;
  const summary = consolidateDailyRecordsByDay(registros, formatDateInput)[0];
  const normalizedDate = formatDateInput(dateDb);
  const returnTo = `/plano-limpeza/diario/historico/dia/${encodeURIComponent(normalizedDate)}`;

  const aguardandoSupervisor = registros.filter(
    (item) =>
      item.status === StatusPlanoLimpeza.AGUARDANDO_SUPERVISOR &&
      item.assinaturaResponsavel.trim() &&
      !item.assinaturaSupervisor.trim()
  ).length;
  const pendentesSemResponsavel = registros.filter(
    (item) =>
      item.status === StatusPlanoLimpeza.PENDENTE &&
      !item.assinaturaResponsavel.trim() &&
      !item.assinaturaSupervisor.trim()
  ).length;
  const possuiPendencias = aguardandoSupervisor > 0 || pendentesSemResponsavel > 0;

  return (
    <div className="space-y-6 dark:text-slate-100">
      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Detalhes do Dia</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Regularização retroativa em lote para o dia {formatDateDisplay(dateDb)}.
            </p>
          </div>
          <div className="btn-group">
            <Link href="/plano-limpeza/diario/historico" className="btn-secondary">
              Voltar para Histórico
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

      {summary ? (
        <section className={CARD_CLASS}>
          <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Resumo do Dia</h2>
          <div className="grid gap-3 md:grid-cols-5">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">Total de Áreas</p>
              <p className="text-lg font-semibold">{summary.totalAreas}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">Concluídas</p>
              <p className="text-lg font-semibold">{summary.concluido}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">Aguardando Supervisor</p>
              <p className="text-lg font-semibold">{summary.aguardandoSupervisor}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">Pendentes</p>
              <p className="text-lg font-semibold">{summary.pendente}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">Situação Geral</p>
              <p>
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getDailyConsolidatedStatusClass(
                    summary.situacaoGeral
                  )}`}
                >
                  {summary.situacaoGeral}
                </span>
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className={CARD_CLASS}>
        <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Assinatura Retroativa em Lote
        </h2>

        {periodClosed ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            Este dia pertence a um mês fechado e não pode ser regularizado.
          </p>
        ) : !possuiPendencias ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
            Não há pendências elegíveis para assinatura retroativa neste dia.
          </p>
        ) : (
          <form action={bulkSignDailyByDateAction} className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="data" value={normalizedDate} />
            <input type="hidden" name="returnTo" value={returnTo} />

            <label className="text-sm text-slate-700 dark:text-slate-200 md:col-span-2">
              Confirme sua Senha *
              <input type="password" name="senhaConfirmacao" required className={INPUT_CLASS} />
            </label>

            <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200 md:col-span-2">
              <input type="checkbox" name="assinarComoResponsavel" className="mt-1" />
              Assinar também como responsável pela limpeza para registros pendentes sem assinatura.
            </label>

            <label className="text-sm text-slate-700 dark:text-slate-200 md:col-span-2">
              Observação (opcional)
              <textarea
                name="observacao"
                rows={3}
                className={INPUT_CLASS}
                placeholder="Justificativa para assinatura excepcional do supervisor como responsável."
              />
            </label>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800 md:col-span-2">
              <p>
                Pendências aguardando supervisor: <strong>{aguardandoSupervisor}</strong>
              </p>
              <p>
                Pendências sem responsável: <strong>{pendentesSemResponsavel}</strong>
              </p>
            </div>

            <div className="md:col-span-2">
              <button type="submit" className="btn-primary">
                Assinar Pendências do Dia
              </button>
            </div>
          </form>
        )}
      </section>

      <section className={CARD_CLASS}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Detalhamento das Áreas</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <tr>
                <th className="px-3 py-2">Turno</th>
                <th className="px-3 py-2">Área</th>
                <th className="px-3 py-2">Responsável</th>
                <th className="px-3 py-2">Supervisor</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Observação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {registros.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-3 text-slate-500 dark:text-slate-400">
                    Nenhum registro para este dia.
                  </td>
                </tr>
              ) : (
                registros.map((registro) => (
                  <tr key={registro.id}>
                    <td className="px-3 py-2">{getTurnoLabel(registro.turno)}</td>
                    <td className="px-3 py-2">{registro.area}</td>
                    <td className="px-3 py-2">{registro.assinaturaResponsavel || "-"}</td>
                    <td className="px-3 py-2">{registro.assinaturaSupervisor || "-"}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={registro.status} />
                    </td>
                    <td className="px-3 py-2">{registro.observacao || "-"}</td>
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
