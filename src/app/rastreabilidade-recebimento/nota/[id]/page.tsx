import { StatusNotaRecebimento } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentUser } from "@/lib/auth-session";
import { canEditRecordDate, hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

import {
  deleteNoteAction,
  deleteItemAction
} from "../../actions";
import { DeleteNoteModal } from "../../delete-note-modal";
import {
  formatDateDisplay,
  formatDateInput,
  getTodaySystemDate,
  getMonthYear,
  parsePositiveInt
} from "../../utils";
import { formatSifDisplayValue } from "../../sif";
import {
  canDeleteImportedReceivingNote,
  getReceivingNoteEditAccessReason,
  type ReceivingNoteEditAccessReason
} from "../../note-permissions";
import { NoteItemsForm, type NoteItemFormRow } from "./note-items-form";

const CARD_CLASS =
  "bpma-card";
const INPUT_CLASS =
  "bpma-input";
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

function canEditImportedXmlFields(role: string | undefined): boolean {
  return role === "DEV" || role === "GERENTE";
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

function formatXmlNumber(value: number | null): string {
  if (value === null) {
    return "";
  }

  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4
  });
}

function getReadOnlyReasonMessage(reason: ReceivingNoteEditAccessReason): string | null {
  if (reason === "MONTH_SIGNED") {
    return "Esta nota pertence a um mês fechado e está somente para consulta.";
  }

  if (reason === "FINALIZED") {
    return "Esta nota já foi finalizada e está somente para consulta.";
  }

  if (reason === "NO_USER") {
    return "Entre com um usuário autorizado para editar esta nota.";
  }

  if (reason === "NO_PERMISSION") {
    return "Seu perfil não tem permissão para editar esta nota de recebimento.";
  }

  return null;
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
  const [fechamento, fechamentoMensal, assinaturaDiaria] = await Promise.all([
    prisma.rastreabilidadeRecebimentoFechamento.findUnique({
      where: { mes_ano: { mes: period.mes, ano: period.ano } }
    }),
    prisma.fechamentoMensalModulo.findUnique({
      where: {
        moduloCodigo_ano_mes: {
          moduloCodigo: "rastreabilidade",
          ano: period.ano,
          mes: period.mes
        }
      }
    }),
    prisma.assinaturaDiariaModulo.findUnique({
      where: {
        moduloCodigo_dataReferencia: {
          moduloCodigo: "rastreabilidade",
          dataReferencia: note.data
        }
      }
    })
  ]);
  const monthSigned = fechamento?.status === "ASSINADO" || Boolean(fechamentoMensal);
  const daySigned = Boolean(assinaturaDiaria);
  const noteFinalizada = note.statusNota === StatusNotaRecebimento.FINALIZADA;
  const authUser = await getCurrentUser();
  const responsavelLogado = authUser?.nomeCompleto ?? "Usuário logado";
  const today = getTodaySystemDate();
  const editAccessReason = getReceivingNoteEditAccessReason({
    user: authUser,
    noteDate: note.data,
    statusNota: note.statusNota,
    today,
    monthSigned
  });
  const canEditNote = editAccessReason === "EDITABLE";
  const readOnlyMode = !canEditNote;
  const readOnlyReasonMessage = getReadOnlyReasonMessage(editAccessReason);
  const canDeleteByDate = authUser
    ? canEditRecordDate(authUser, "modulo.rastreabilidade", note.data, today)
    : false;
  const xmlProductLocked = note.origemXml && !canEditImportedXmlFields(authUser?.perfil);
  const canDeleteNote =
    Boolean(authUser && hasPermission(authUser, "modulo.rastreabilidade.excluir_registro")) &&
    !monthSigned &&
    !daySigned &&
    !noteFinalizada &&
    canDeleteImportedReceivingNote(note);
  const canDeleteItems =
    Boolean(authUser && hasPermission(authUser, "modulo.rastreabilidade.excluir_registro")) &&
    !readOnlyMode &&
    canDeleteByDate;
  const returnTo = `/rastreabilidade-recebimento/nota/${note.id}`;

  const query = await searchParams;
  const feedback = firstParam(query.feedback).trim();
  const feedbackType = firstParam(query.feedbackType) === "error" ? "error" : "success";
  const finalizarSelecionado = firstParam(query.finalizar) === "1";
  const finalizarReturnTo = `${returnTo}?finalizar=1`;
  const noteItemsFormId = `note-items-form-${note.id}`;
  const identificadoresFiscais = [
    { label: "Número da Nota", value: note.notaFiscal },
    note.serieNota ? { label: "Série da Nota", value: note.serieNota } : null,
    note.cnpjFornecedor
      ? { label: "CNPJ do Fornecedor", value: formatCnpj(note.cnpjFornecedor) }
      : null,
    note.chaveNfe ? { label: "Chave NF-e", value: formatChaveNfe(note.chaveNfe) } : null
  ].filter((item): item is { label: string; value: string } => item !== null);
  const noteItemRows: NoteItemFormRow[] = note.itens.map((item) => ({
    id: item.id,
    produto: item.produto,
    codigoProdutoXml: item.codigoProdutoXml ?? "",
    ncm: item.ncm ?? "",
    cfop: item.cfop ?? "",
    quantidadeComprada: formatXmlNumber(item.quantidadeComprada),
    unidadeMedidaCompra: item.unidadeMedidaCompra ?? "",
    lote: item.lote ?? "",
    dataFabricacao: item.dataFabricacao ? formatDateInput(item.dataFabricacao) : "",
    semDataFabricacao: item.semDataFabricacao,
    dataValidade: item.dataValidade ? formatDateInput(item.dataValidade) : "",
    validadeNaoAplicavel: item.validadeNaoAplicavel,
    sif: formatSifDisplayValue(item.sif, ""),
    temperatura:
      item.temperatura !== null ? String(item.temperatura).replace(".", ",") : "",
    temperaturaTipo: item.temperaturaTipo,
    transporteEntregador: item.transporteEntregador ?? "",
    aspectoSensorial: item.aspectoSensorial ?? "",
    embalagem: item.embalagem ?? "",
    acaoCorretiva: item.acaoCorretiva ?? "",
    responsavelRecebimento: item.responsavelRecebimento ?? null,
    observacoes: item.observacoes ?? "",
    statusGeral: item.statusGeral
  }));

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
              ← Voltar ao Módulo
            </Link>
            {canDeleteNote ? <DeleteNoteModal formId={`delete-note-from-note-${note.id}`} /> : null}
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

        {readOnlyReasonMessage ? (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {readOnlyReasonMessage}
          </div>
        ) : null}

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

        {!readOnlyMode ? (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Responsável pelo Recebimento
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {responsavelLogado}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              As linhas serão salvas automaticamente com o usuário logado.
            </p>
          </div>
        ) : null}

        {!readOnlyMode && xmlProductLocked ? (
          <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200">
            Dados fiscais importados do XML estão protegidos. Preencha a conferência operacional
            da nota com o usuário logado.
          </div>
        ) : null}

        {note.itens.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Esta nota não possui itens cadastrados.
          </p>
        ) : (
          <>
            <NoteItemsForm
              notaId={note.id}
              returnTo={returnTo}
              rows={noteItemRows}
              readOnlyMode={readOnlyMode}
              xmlProductLocked={xmlProductLocked}
              canDeleteItems={canDeleteItems}
              responsavelLogado={responsavelLogado}
              inputClassName={INPUT_CLASS}
              formId={noteItemsFormId}
              finalizarSelecionado={finalizarSelecionado}
              noteNumber={note.notaFiscal}
              itemCount={note.itens.length}
            />

            {canDeleteItems
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
              <div className="mt-4">
                <Link href={finalizarReturnTo} className="btn-primary">
                  Finalizar Nota
                </Link>
              </div>
            ) : null}
          </>
        )}
      </section>

    </div>
  );
}
