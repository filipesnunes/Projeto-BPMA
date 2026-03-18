import {
  StatusChamadoManutencao
} from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ThemeToggleButton } from "@/app/higienizacao-hortifruti/theme-toggle-button";
import { getCurrentUser } from "@/lib/auth-session";
import { getImageDataUrl } from "@/lib/image-upload";
import { prisma } from "@/lib/prisma";
import { canUpdateMaintenanceTicket } from "@/lib/rbac";

import { updateChamadoStatusAction } from "../actions";

const PAGE_PATH = "/chamados-manutencao";
const CARD_CLASS =
  "rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900";
const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
};

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function parsePositiveInt(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function formatDateTimeDisplay(date: Date | null): string {
  if (!date) {
    return "-";
  }

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${day}/${month}/${year} ${hour}:${minute}`;
}

function getStatusLabel(status: StatusChamadoManutencao): string {
  if (status === StatusChamadoManutencao.EM_ANDAMENTO) return "Em Andamento";
  if (status === StatusChamadoManutencao.CONCLUIDO) return "Concluído";
  if (status === StatusChamadoManutencao.CANCELADO) return "Cancelado";
  return "Aberto";
}

function getStatusClass(status: StatusChamadoManutencao): string {
  if (status === StatusChamadoManutencao.CONCLUIDO) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
  }
  if (status === StatusChamadoManutencao.EM_ANDAMENTO) {
    return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200";
  }
  if (status === StatusChamadoManutencao.CANCELADO) {
    return "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200";
  }

  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200";
}

function getOrigemLabel(origem: string): string {
  if (origem === "TEMPERATURA") return "Temperatura";
  if (origem === "LIMPEZA") return "Limpeza";
  if (origem === "OLEO") return "Óleo";
  if (origem === "RECEBIMENTO") return "Recebimento";
  if (origem === "HORTIFRUTI") return "Hortifruti";
  return "Outros";
}

export default async function ChamadoManutencaoDetalhePage({
  params,
  searchParams
}: PageProps) {
  const authUser = await getCurrentUser();
  const canUpdate = authUser ? canUpdateMaintenanceTicket(authUser.perfil) : false;

  const { id } = await params;
  const chamadoId = parsePositiveInt(id);
  if (!chamadoId) {
    notFound();
  }

  const chamado = await prisma.chamadoManutencao.findUnique({
    where: { id: chamadoId }
  });
  if (!chamado) {
    notFound();
  }

  const query = await searchParams;
  const feedback = firstParam(query.feedback).trim();
  const feedbackType = firstParam(query.feedbackType) === "error" ? "error" : "success";
  const fotoDataUrl = getImageDataUrl(chamado.fotoMimeType, chamado.fotoBase64);

  return (
    <div className="space-y-6 dark:text-slate-100">
      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Chamado #{chamado.id}
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{chamado.titulo}</p>
          </div>
          <div className="btn-group">
            <Link href={PAGE_PATH} className="btn-secondary">
              Voltar para Chamados
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
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Origem</p>
            <p className="text-sm font-medium">{getOrigemLabel(chamado.origem)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Status</p>
            <span
              className={`mt-1 inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusClass(
                chamado.status
              )}`}
            >
              {getStatusLabel(chamado.status)}
            </span>
          </div>
          <div className="md:col-span-2">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Descrição</p>
            <p className="text-sm">{chamado.descricao}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Criado Por</p>
            <p className="text-sm font-medium">{chamado.criadoPorNome}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Data/Hora de Criação</p>
            <p className="text-sm font-medium">{formatDateTimeDisplay(chamado.dataHoraCriacao)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Assinatura de Abertura</p>
            <p className="text-sm font-medium">{chamado.assinaturaAberturaNomeUsuario}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {chamado.assinaturaAberturaPerfil} em{" "}
              {formatDateTimeDisplay(chamado.assinaturaAberturaDataHora)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Data/Hora de Conclusão</p>
            <p className="text-sm font-medium">{formatDateTimeDisplay(chamado.dataHoraConclusao)}</p>
          </div>
          <div className="md:col-span-2">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Observação de Conclusão</p>
            <p className="text-sm">{chamado.observacaoConclusao || "-"}</p>
          </div>
          {fotoDataUrl ? (
            <div className="md:col-span-2">
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Foto</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fotoDataUrl}
                alt={`Foto do chamado ${chamado.id}`}
                className="mt-2 max-h-80 rounded-lg border border-slate-200 object-contain dark:border-slate-700"
              />
            </div>
          ) : null}
        </div>
      </section>

      {canUpdate ? (
        <section className={CARD_CLASS}>
          <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
            Atualizar Status
          </h2>
          <form action={updateChamadoStatusAction} className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="chamadoId" value={String(chamado.id)} />
            <input type="hidden" name="returnTo" value={`${PAGE_PATH}/${chamado.id}`} />

            <label className="text-sm text-slate-700 dark:text-slate-200">
              Status *
              <select name="status" defaultValue={chamado.status} className={INPUT_CLASS}>
                <option value={StatusChamadoManutencao.ABERTO}>Aberto</option>
                <option value={StatusChamadoManutencao.EM_ANDAMENTO}>Em Andamento</option>
                <option value={StatusChamadoManutencao.CONCLUIDO}>Concluído</option>
                <option value={StatusChamadoManutencao.CANCELADO}>Cancelado</option>
              </select>
            </label>

            <label className="text-sm text-slate-700 md:col-span-2 dark:text-slate-200">
              Observação de Conclusão (Opcional)
              <textarea
                name="observacaoConclusao"
                rows={3}
                defaultValue={chamado.observacaoConclusao ?? ""}
                className={INPUT_CLASS}
              />
            </label>

            <div className="md:col-span-2">
              <button type="submit" className="btn-primary">
                Salvar Status
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
