import { StatusNotaRecebimento } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";

import {
  deleteNoteAction,
  deleteItemAction,
  finalizeNotaAction,
  saveNotaItemsAction
} from "../../actions";
import { DeleteNoteModal } from "../../delete-note-modal";
import { ConformidadeBadge } from "../../status-badges";
import { ThemeToggleButton } from "../../theme-toggle-button";
import {
  formatDateDisplay,
  formatDateInput,
  getMonthYear,
  parsePositiveInt
} from "../../utils";

const CARD_CLASS =
  "rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-5 lg:p-6 dark:border-slate-700 dark:bg-slate-900";
const INPUT_CLASS =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:disabled:bg-slate-900";
const TABLE_HEAD_CLASS =
  "px-2 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200";
const TABLE_CELL_CLASS = "px-2 py-1.5 align-top";
const MODULE_PATH = "/rastreabilidade-recebimento";

type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
};

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
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

function formatCnpj(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 14) {
    return value;
  }

  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function formatChaveNfe(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 44) {
    return value;
  }

  return digits.match(/.{1,4}/g)?.join(" ") ?? value;
}

export default async function NotaRecebimentoPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const noteId = parsePositiveInt(id);

  if (!noteId) {
    notFound();
  }

  const note = await prisma.rastreabilidadeRecebimentoNota.findUnique({
    where: { id: noteId },
    include: {
      itens: {
        orderBy: [{ id: "asc" }]
      }
    }
  });

  if (!note) {
    notFound();
  }

  const period = getMonthYear(note.data);
  const fechamento = await prisma.rastreabilidadeRecebimentoFechamento.findUnique({
    where: { mes_ano: { mes: period.mes, ano: period.ano } }
  });
  const monthSigned = fechamento?.status === "ASSINADO";
  const noteFinalizada = note.statusNota === StatusNotaRecebimento.FINALIZADA;
  const readOnlyMode = monthSigned || noteFinalizada;
  const canDeleteNote = !monthSigned && note.statusNota === StatusNotaRecebimento.PENDENTE;
  const returnTo = `/rastreabilidade-recebimento/nota/${note.id}`;

  const query = await searchParams;
  const feedback = firstParam(query.feedback).trim();
  const feedbackType = firstParam(query.feedbackType) === "error" ? "error" : "success";
  const identificadoresFiscais = [
    { label: "Número da Nota", value: note.notaFiscal },
    note.serieNota ? { label: "Série da Nota", value: note.serieNota } : null,
    note.cnpjFornecedor
      ? { label: "CNPJ do Fornecedor", value: formatCnpj(note.cnpjFornecedor) }
      : null,
    note.chaveNfe ? { label: "Chave NF-e", value: formatChaveNfe(note.chaveNfe) } : null
  ].filter((item): item is { label: string; value: string } => item !== null);

  return (
    <div className="space-y-5 dark:text-slate-100">
      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Nota {note.notaFiscal}
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Fornecedor: {note.fornecedor}
            </p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Data: {formatDateDisplay(note.data)}
            </p>
          </div>
          <div className="btn-group">
            <Link href="/rastreabilidade-recebimento" className="btn-secondary">
              Voltar para Módulo
            </Link>
            {canDeleteNote ? <DeleteNoteModal formId={`delete-note-from-note-${note.id}`} /> : null}
            <ThemeToggleButton />
          </div>
        </div>
      </section>

      {canDeleteNote ? (
        <form
          id={`delete-note-from-note-${note.id}`}
          action={deleteNoteAction}
          className="hidden"
        >
          <input type="hidden" name="notaId" value={String(note.id)} />
          <input type="hidden" name="returnTo" value={MODULE_PATH} />
        </form>
      ) : null}

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
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getNotaStatusClass(
              note.statusNota
            )}`}
          >
            {getNotaStatusLabel(note.statusNota)}
          </span>
          {monthSigned ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              Mês Fechado
            </span>
          ) : null}
        </div>

        {identificadoresFiscais.length ? (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Identificadores Fiscais
            </p>
            <dl className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {identificadoresFiscais.map((item) => (
                <div key={item.label}>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">{item.label}</dt>
                  <dd className="mt-1 text-sm font-medium text-slate-900 break-all dark:text-slate-100">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        {note.itens.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Esta nota não possui itens cadastrados.
          </p>
        ) : (
          <>
            <form action={saveNotaItemsAction}>
              <input type="hidden" name="notaId" value={note.id} />
              <input type="hidden" name="returnTo" value={returnTo} />

              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="w-full min-w-[1240px] table-auto divide-y divide-slate-200 text-sm dark:divide-slate-700">
                  <thead className="bg-slate-50 text-left dark:bg-slate-800">
                    <tr>
                      <th className={TABLE_HEAD_CLASS}>Produto</th>
                      <th className={TABLE_HEAD_CLASS}>Lote *</th>
                      <th className={TABLE_HEAD_CLASS}>Data de Fabricação *</th>
                      <th className={TABLE_HEAD_CLASS}>Validade *</th>
                      <th className={TABLE_HEAD_CLASS}>SIF</th>
                      <th className={TABLE_HEAD_CLASS}>Temperatura *</th>
                      <th className={TABLE_HEAD_CLASS}>Transporte *</th>
                      <th className={TABLE_HEAD_CLASS}>Aspecto *</th>
                      <th className={TABLE_HEAD_CLASS}>Embalagem *</th>
                      <th className={TABLE_HEAD_CLASS}>Ação Corretiva</th>
                      <th className={TABLE_HEAD_CLASS}>Responsável *</th>
                      <th className={TABLE_HEAD_CLASS}>Observações</th>
                      <th className={TABLE_HEAD_CLASS}>Status</th>
                      <th className={TABLE_HEAD_CLASS}>Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {note.itens.map((item) => (
                      <tr key={item.id}>
                        <td className={TABLE_CELL_CLASS}>
                          <input
                            type="text"
                            name={`item-${item.id}-produto`}
                            defaultValue={item.produto}
                            required
                            disabled={readOnlyMode}
                            className={`${INPUT_CLASS} min-w-[9rem] md:min-w-[11rem]`}
                          />
                        </td>
                        <td className={TABLE_CELL_CLASS}>
                          <input
                            type="text"
                            name={`item-${item.id}-lote`}
                            defaultValue={item.lote ?? ""}
                            required
                            disabled={readOnlyMode}
                            className={`${INPUT_CLASS} min-w-[5.5rem] md:min-w-[6.5rem]`}
                          />
                        </td>
                        <td className={TABLE_CELL_CLASS}>
                          <input
                            type="date"
                            name={`item-${item.id}-dataFabricacao`}
                            defaultValue={
                              item.dataFabricacao ? formatDateInput(item.dataFabricacao) : ""
                            }
                            required
                            disabled={readOnlyMode}
                            className={`${INPUT_CLASS} min-w-[7.5rem]`}
                          />
                        </td>
                        <td className={TABLE_CELL_CLASS}>
                          <input
                            type="date"
                            name={`item-${item.id}-dataValidade`}
                            defaultValue={
                              item.dataValidade ? formatDateInput(item.dataValidade) : ""
                            }
                            required
                            disabled={readOnlyMode}
                            className={`${INPUT_CLASS} min-w-[7.5rem]`}
                          />
                        </td>
                        <td className={TABLE_CELL_CLASS}>
                          <input
                            type="text"
                            name={`item-${item.id}-sif`}
                            defaultValue={item.sif ?? ""}
                            disabled={readOnlyMode}
                            className={`${INPUT_CLASS} min-w-[4.5rem] md:min-w-[5rem]`}
                          />
                        </td>
                        <td className={TABLE_CELL_CLASS}>
                          <input
                            type="text"
                            name={`item-${item.id}-temperatura`}
                            defaultValue={
                              item.temperatura !== null
                                ? String(item.temperatura).replace(".", ",")
                                : ""
                            }
                            required
                            disabled={readOnlyMode}
                            className={`${INPUT_CLASS} min-w-[5rem] md:min-w-[5.5rem]`}
                          />
                        </td>
                        <td className={TABLE_CELL_CLASS}>
                          <select
                            name={`item-${item.id}-transporteEntregador`}
                            defaultValue={item.transporteEntregador ?? ""}
                            required
                            disabled={readOnlyMode}
                            className={`${INPUT_CLASS} min-w-[6.5rem]`}
                          >
                            <option value="">Selecione</option>
                            <option value="CONFORME">Conforme</option>
                            <option value="NAO_CONFORME">Não Conforme</option>
                          </select>
                        </td>
                        <td className={TABLE_CELL_CLASS}>
                          <select
                            name={`item-${item.id}-aspectoSensorial`}
                            defaultValue={item.aspectoSensorial ?? ""}
                            required
                            disabled={readOnlyMode}
                            className={`${INPUT_CLASS} min-w-[6.5rem]`}
                          >
                            <option value="">Selecione</option>
                            <option value="CONFORME">Conforme</option>
                            <option value="NAO_CONFORME">Não Conforme</option>
                          </select>
                        </td>
                        <td className={TABLE_CELL_CLASS}>
                          <select
                            name={`item-${item.id}-embalagem`}
                            defaultValue={item.embalagem ?? ""}
                            required
                            disabled={readOnlyMode}
                            className={`${INPUT_CLASS} min-w-[6.5rem]`}
                          >
                            <option value="">Selecione</option>
                            <option value="CONFORME">Conforme</option>
                            <option value="NAO_CONFORME">Não Conforme</option>
                          </select>
                        </td>
                        <td className={TABLE_CELL_CLASS}>
                          <input
                            type="text"
                            name={`item-${item.id}-acaoCorretiva`}
                            defaultValue={item.acaoCorretiva ?? ""}
                            disabled={readOnlyMode}
                            className={`${INPUT_CLASS} min-w-[8rem] md:min-w-[9rem]`}
                          />
                        </td>
                        <td className={TABLE_CELL_CLASS}>
                          <input
                            type="text"
                            name={`item-${item.id}-responsavelRecebimento`}
                            defaultValue={item.responsavelRecebimento ?? ""}
                            required
                            disabled={readOnlyMode}
                            className={`${INPUT_CLASS} min-w-[7.5rem] md:min-w-[8rem]`}
                          />
                        </td>
                        <td className={TABLE_CELL_CLASS}>
                          <input
                            type="text"
                            name={`item-${item.id}-observacoes`}
                            defaultValue={item.observacoes ?? ""}
                            disabled={readOnlyMode}
                            className={`${INPUT_CLASS} min-w-[8rem] md:min-w-[9rem]`}
                          />
                        </td>
                        <td className={`${TABLE_CELL_CLASS} whitespace-nowrap`}>
                          <ConformidadeBadge
                            value={
                              item.statusGeral === "NAO_CONFORME"
                                ? "NAO_CONFORME"
                                : item.statusGeral === "CONFORME"
                                  ? "CONFORME"
                                  : null
                            }
                          />
                        </td>
                        <td className={TABLE_CELL_CLASS}>
                          {readOnlyMode ? (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              Bloqueado
                            </span>
                          ) : (
                            <button
                              type="submit"
                              form={`delete-item-form-${item.id}`}
                              className="btn-danger"
                            >
                              Excluir
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!readOnlyMode ? (
                <div className="mt-4 btn-group">
                  <button type="submit" className="btn-primary">
                    Salvar Itens da Nota
                  </button>
                </div>
              ) : null}
            </form>

            {!readOnlyMode
              ? note.itens.map((item) => (
                  <form
                    key={item.id}
                    id={`delete-item-form-${item.id}`}
                    action={deleteItemAction}
                    className="hidden"
                  >
                    <input type="hidden" name="itemId" value={item.id} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                  </form>
                ))
              : null}

            {!readOnlyMode ? (
              <form action={finalizeNotaAction} className="mt-4">
                <input type="hidden" name="notaId" value={note.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <button type="submit" className="btn-primary">
                  Finalizar Nota
                </button>
              </form>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
