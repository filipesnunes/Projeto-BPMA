import {
  Prisma,
  StatusFechamentoRastreabilidadeRecebimento,
  StatusNotaRecebimento
} from "@prisma/client";
import Link from "next/link";

import { SignatureContextCard } from "@/components/auth/signature-context-card";
import { getCurrentUser } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { getRoleLabel } from "@/lib/rbac";

import {
  closeMonthAction,
  deleteNoteAction,
  importXmlAction,
  reopenMonthAction
} from "./actions";
import { DeleteNoteModal } from "./delete-note-modal";
import { RECEBIMENTO_ORIENTACOES } from "./options";
import { ReopenMonthModal } from "./reopen-month-modal";
import { ThemeToggleButton } from "./theme-toggle-button";
import {
  formatDateDisplay,
  formatDateTimeDisplay,
  getCurrentSystemDateTime,
  getMonthDateRange,
  getTodaySystemDate,
  parsePositiveInt
} from "./utils";

const MODULE_PATH = "/rastreabilidade-recebimento";
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
  return query ? `${MODULE_PATH}?${query}` : MODULE_PATH;
}

function getNotaStatusLabel(status: StatusNotaRecebimento): string {
  if (status === StatusNotaRecebimento.FINALIZADA) {
    return "Finalizada";
  }

  if (status === StatusNotaRecebimento.IMPORTADA) {
    return "Importada";
  }

  if (status === StatusNotaRecebimento.EM_CONFERENCIA) {
    return "Em Conferência";
  }

  return "Pendente";
}

function getNotaStatusClass(status: StatusNotaRecebimento): string {
  if (status === StatusNotaRecebimento.FINALIZADA) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
  }

  if (status === StatusNotaRecebimento.IMPORTADA) {
    return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200";
  }

  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200";
}

function canImportXml(role: string | null): boolean {
  return role === "DEV" || role === "GESTOR";
}

export default async function RastreabilidadeRecebimentoPage({ searchParams }: PageProps) {
  const authUser = await getCurrentUser();
  const responsavelLogado = authUser?.nomeCompleto ?? "Usuário logado";
  const perfilLogado = authUser ? getRoleLabel(authUser.perfil) : "";
  const permitirImportacao = canImportXml(authUser?.perfil ?? null);

  const params = await searchParams;
  const feedback = firstParam(params.feedback).trim();
  const feedbackType = firstParam(params.feedbackType) === "error" ? "error" : "success";

  const now = getCurrentSystemDateTime();
  const todaySystemDate = getTodaySystemDate();

  const filtroFornecedor = firstParam(params.filtroFornecedor).trim();
  const filtroNotaFiscal = firstParam(params.filtroNotaFiscal).trim();
  const filtroResponsavel = firstParam(params.filtroResponsavel).trim();

  const fechamentoMesRaw = parsePositiveInt(firstParam(params.fechamentoMes));
  const fechamentoAnoRaw = parsePositiveInt(firstParam(params.fechamentoAno));
  const fechamentoMes =
    fechamentoMesRaw && fechamentoMesRaw >= 1 && fechamentoMesRaw <= 12
      ? fechamentoMesRaw
      : now.getMonth() + 1;
  const fechamentoAno = fechamentoAnoRaw ?? now.getFullYear();

  const wherePendentesHoje: Prisma.RastreabilidadeRecebimentoNotaWhereInput = {
    data: todaySystemDate,
    statusNota: {
      in: [
        StatusNotaRecebimento.PENDENTE,
        StatusNotaRecebimento.IMPORTADA,
        StatusNotaRecebimento.EM_CONFERENCIA
      ]
    }
  };

  if (filtroFornecedor) {
    wherePendentesHoje.fornecedor = { contains: filtroFornecedor, mode: "insensitive" };
  }

  if (filtroNotaFiscal) {
    wherePendentesHoje.notaFiscal = { contains: filtroNotaFiscal, mode: "insensitive" };
  }

  if (filtroResponsavel) {
    wherePendentesHoje.responsavelGeral = {
      contains: filtroResponsavel,
      mode: "insensitive"
    };
  }

  const rangeFechamento = getMonthDateRange(fechamentoMes, fechamentoAno);
  const [notasPendentesHoje, notasFechamento, fechamentoAtual] = await Promise.all([
    prisma.rastreabilidadeRecebimentoNota.findMany({
      where: wherePendentesHoje,
      include: {
        _count: {
          select: {
            itens: true
          }
        }
      },
      orderBy: [{ createdAt: "desc" }]
    }),
    prisma.rastreabilidadeRecebimentoNota.findMany({
      where: {
        data: {
          gte: rangeFechamento.start,
          lte: rangeFechamento.end
        }
      },
      include: {
        _count: {
          select: {
            itens: true
          }
        }
      },
      orderBy: [{ data: "asc" }, { createdAt: "asc" }]
    }),
    prisma.rastreabilidadeRecebimentoFechamento.findUnique({
      where: {
        mes_ano: {
          mes: fechamentoMes,
          ano: fechamentoAno
        }
      }
    })
  ]);

  const fechamentoAssinado =
    fechamentoAtual?.status === StatusFechamentoRastreabilidadeRecebimento.ASSINADO;

  const paramsRetorno = new URLSearchParams();
  if (filtroFornecedor) paramsRetorno.set("filtroFornecedor", filtroFornecedor);
  if (filtroNotaFiscal) paramsRetorno.set("filtroNotaFiscal", filtroNotaFiscal);
  if (filtroResponsavel) paramsRetorno.set("filtroResponsavel", filtroResponsavel);
  paramsRetorno.set("fechamentoMes", String(fechamentoMes));
  paramsRetorno.set("fechamentoAno", String(fechamentoAno));

  const returnTo = buildPathWithParams(paramsRetorno);
  const limparFiltrosHref = buildPathWithParams(
    new URLSearchParams({
      fechamentoMes: String(fechamentoMes),
      fechamentoAno: String(fechamentoAno)
    })
  );
  const reaberturaFormId = `reabertura-form-${fechamentoMes}-${fechamentoAno}`;

  return (
    <div className="space-y-6 dark:text-slate-100">
      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Rastreabilidade de Recebimento de Alimentos Perecíveis e Não Perecíveis
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Registro diário do recebimento de mercadorias
            </p>
          </div>
          <div className="btn-group">
            <Link href="/rastreabilidade-recebimento/historico" className="btn-secondary">
              Histórico Completo
            </Link>
            <Link href="/rastreabilidade-recebimento/opcoes" className="btn-secondary">
              Gerenciar Categorias
            </Link>
            <Link href="/chamados-manutencao?origem=RECEBIMENTO" className="btn-secondary">
              Abrir Chamado de Manutenção
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
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Ações Principais
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Importe o XML da nota fiscal (ADM) e faça a conferência operacional na nota.
            </p>
          </div>
          <Link href="/rastreabilidade-recebimento/nota/nova" className="btn-primary">
            Novo Recebimento Manual
          </Link>
        </div>

        {permitirImportacao ? (
          <form
            action={importXmlAction}
            className="grid gap-3 rounded-lg bg-slate-50 p-4 md:grid-cols-[1fr_auto] dark:bg-slate-800"
          >
            <input type="hidden" name="returnTo" value={returnTo} />
            <label className="text-sm text-slate-700 dark:text-slate-200">
              Importar XML da Nota Fiscal (ADM)
              <input
                type="file"
                name="xmlFile"
                accept=".xml,text/xml,application/xml"
                required
                className={INPUT_CLASS}
              />
            </label>
            <div className="md:flex md:items-end">
              <button type="submit" className="btn-secondary">
                Importar XML
              </button>
            </div>
          </form>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            A importação de XML está disponível para perfis administrativos.
          </div>
        )}
      </section>

      <section className={CARD_CLASS}>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Recebimentos do Dia
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Exibe apenas notas pendentes de {formatDateDisplay(todaySystemDate)}.
        </p>

        <form
          method="get"
          className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-4 md:grid-cols-4 dark:bg-slate-800"
        >
          <input type="hidden" name="fechamentoMes" value={String(fechamentoMes)} />
          <input type="hidden" name="fechamentoAno" value={String(fechamentoAno)} />

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

          <div className="flex flex-wrap items-end gap-2">
            <button type="submit" className="btn-primary">
              Aplicar Filtros
            </button>
            <Link href={limparFiltrosHref} className="btn-secondary">
              Limpar
            </Link>
          </div>
        </form>

        <div className="mt-4 overflow-x-auto">
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
              {notasPendentesHoje.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-3 text-slate-500 dark:text-slate-400">
                    Nenhuma nota pendente encontrada para hoje.
                  </td>
                </tr>
              ) : (
                notasPendentesHoje.map((nota) => (
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
                          Conferir Nota
                        </Link>
                        <Link
                          href={`/chamados-manutencao?origem=RECEBIMENTO&registroId=${nota.id}&area=${encodeURIComponent(
                            nota.fornecedor
                          )}&descricao=${encodeURIComponent(
                            `Ocorrência no recebimento da nota ${nota.notaFiscal} (${nota.fornecedor}).`
                          )}`}
                          className="btn-secondary"
                        >
                          Abrir Chamado
                        </Link>
                        <DeleteNoteModal formId={`delete-note-day-${nota.id}`} />
                      </div>
                      <form
                        id={`delete-note-day-${nota.id}`}
                        action={deleteNoteAction}
                        className="hidden"
                      >
                        <input type="hidden" name="notaId" value={String(nota.id)} />
                        <input type="hidden" name="returnTo" value={returnTo} />
                      </form>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={CARD_CLASS}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Fechamento Mensal
        </h2>

        <form method="get" className="grid gap-3 rounded-lg bg-slate-50 p-4 md:grid-cols-4 dark:bg-slate-800">
          <input type="hidden" name="filtroFornecedor" value={filtroFornecedor} />
          <input type="hidden" name="filtroNotaFiscal" value={filtroNotaFiscal} />
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

          <div className="mb-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Fornecedor</th>
                  <th className="px-3 py-2">Número da Nota</th>
                  <th className="px-3 py-2">Quantidade de Itens</th>
                  <th className="px-3 py-2">Status da Nota</th>
                  <th className="px-3 py-2">Responsável</th>
                  <th className="px-3 py-2">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {notasFechamento.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-2 text-slate-500 dark:text-slate-400">
                      Nenhuma nota no período selecionado.
                    </td>
                  </tr>
                ) : (
                  notasFechamento.map((nota) => (
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
                          <Link
                            href={`/chamados-manutencao?origem=RECEBIMENTO&registroId=${nota.id}&area=${encodeURIComponent(
                              nota.fornecedor
                            )}&descricao=${encodeURIComponent(
                              `Ocorrência no recebimento da nota ${nota.notaFiscal} (${nota.fornecedor}).`
                            )}`}
                            className="btn-secondary"
                          >
                            Abrir Chamado
                          </Link>
                          {nota.statusNota !== StatusNotaRecebimento.FINALIZADA ? (
                            <DeleteNoteModal formId={`delete-note-month-${nota.id}`} />
                          ) : null}
                        </div>
                        {nota.statusNota !== StatusNotaRecebimento.FINALIZADA ? (
                          <form
                            id={`delete-note-month-${nota.id}`}
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

          {fechamentoAssinado ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
              <p>
                Mês assinado por <strong>{fechamentoAtual?.responsavelTecnico}</strong>.
              </p>
              <p>
                Data da assinatura:{" "}
                <strong>
                  {fechamentoAtual ? formatDateTimeDisplay(fechamentoAtual.dataAssinatura) : "-"}
                </strong>
              </p>
              <form id={reaberturaFormId} action={reopenMonthAction} className="mt-4">
                <input type="hidden" name="mes" value={String(fechamentoMes)} />
                <input type="hidden" name="ano" value={String(fechamentoAno)} />
                <input type="hidden" name="returnTo" value={returnTo} />
              </form>
              <ReopenMonthModal mes={fechamentoMes} ano={fechamentoAno} formId={reaberturaFormId} />
            </div>
          ) : (
            <form action={closeMonthAction} className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="mes" value={String(fechamentoMes)} />
              <input type="hidden" name="ano" value={String(fechamentoAno)} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <label className="text-sm text-slate-700 dark:text-slate-200">
                Confirme sua Senha *
                <input type="password" name="senhaConfirmacao" required className={INPUT_CLASS} />
              </label>
              <SignatureContextCard
                nomeUsuario={responsavelLogado}
                perfil={perfilLogado}
                dataHora={formatDateTimeDisplay(now)}
              />
              <div className="md:col-span-2">
                <button type="submit" className="btn-primary">
                  Fechar Mês
                </button>
              </div>
            </form>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">Critérios de Conferência</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {RECEBIMENTO_ORIENTACOES.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
