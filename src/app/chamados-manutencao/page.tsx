import {
  OrigemChamadoManutencao,
  PrioridadeChamadoManutencao,
  Prisma,
  StatusChamadoManutencao
} from "@prisma/client";
import Link from "next/link";

import { SignatureContextCard } from "@/components/auth/signature-context-card";
import { ImageUploadField } from "@/components/forms/image-upload-field";
import { getCurrentUser } from "@/lib/auth-session";
import { getImageDataUrl } from "@/lib/image-upload";
import { prisma } from "@/lib/prisma";
import { canUpdateMaintenanceTicket, getRoleLabel } from "@/lib/rbac";

import { createChamadoAction } from "./actions";
import { ThemeToggleButton } from "../higienizacao-hortifruti/theme-toggle-button";

const PAGE_PATH = "/chamados-manutencao";
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

function formatDateTimeDisplay(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${day}/${month}/${year} ${hour}:${minute}`;
}

function parseStatus(value: string): StatusChamadoManutencao | null {
  if (value === StatusChamadoManutencao.ABERTO) return StatusChamadoManutencao.ABERTO;
  if (value === StatusChamadoManutencao.EM_ANDAMENTO) return StatusChamadoManutencao.EM_ANDAMENTO;
  if (value === StatusChamadoManutencao.CONCLUIDO) return StatusChamadoManutencao.CONCLUIDO;
  if (value === StatusChamadoManutencao.CANCELADO) return StatusChamadoManutencao.CANCELADO;
  return null;
}

function parsePrioridade(value: string): PrioridadeChamadoManutencao | null {
  if (value === PrioridadeChamadoManutencao.BAIXA) return PrioridadeChamadoManutencao.BAIXA;
  if (value === PrioridadeChamadoManutencao.MEDIA) return PrioridadeChamadoManutencao.MEDIA;
  if (value === PrioridadeChamadoManutencao.ALTA) return PrioridadeChamadoManutencao.ALTA;
  return null;
}

function parseOrigem(value: string): OrigemChamadoManutencao {
  if (value === OrigemChamadoManutencao.TEMPERATURA) return OrigemChamadoManutencao.TEMPERATURA;
  if (value === OrigemChamadoManutencao.LIMPEZA) return OrigemChamadoManutencao.LIMPEZA;
  if (value === OrigemChamadoManutencao.OLEO) return OrigemChamadoManutencao.OLEO;
  if (value === OrigemChamadoManutencao.RECEBIMENTO) return OrigemChamadoManutencao.RECEBIMENTO;
  return OrigemChamadoManutencao.MANUAL;
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

function getPrioridadeLabel(prioridade: PrioridadeChamadoManutencao): string {
  if (prioridade === PrioridadeChamadoManutencao.BAIXA) return "Baixa";
  if (prioridade === PrioridadeChamadoManutencao.ALTA) return "Alta";
  return "Média";
}

export default async function ChamadosManutencaoPage({ searchParams }: PageProps) {
  const authUser = await getCurrentUser();
  const usuarioLogado = authUser?.nomeCompleto ?? "Usuário logado";
  const perfilLogado = authUser ? getRoleLabel(authUser.perfil) : "";
  const podeAtualizar = authUser ? canUpdateMaintenanceTicket(authUser.perfil) : false;
  const now = new Date();

  const params = await searchParams;
  const feedback = firstParam(params.feedback).trim();
  const feedbackType = firstParam(params.feedbackType) === "error" ? "error" : "success";

  const origemPrefill = parseOrigem(firstParam(params.origem));
  const areaPrefill = firstParam(params.area).trim();
  const descricaoPrefill = firstParam(params.descricao).trim();
  const registroIdPrefill = firstParam(params.registroId).trim();

  const filtroStatus = parseStatus(firstParam(params.filtroStatus));
  const filtroPrioridade = parsePrioridade(firstParam(params.filtroPrioridade));
  const filtroArea = firstParam(params.filtroArea).trim();
  const filtroData = firstParam(params.filtroData).trim();

  const where: Prisma.ChamadoManutencaoWhereInput = {};
  if (filtroStatus) {
    where.status = filtroStatus;
  }
  if (filtroPrioridade) {
    where.prioridade = filtroPrioridade;
  }
  if (filtroArea) {
    where.areaLocal = { contains: filtroArea, mode: "insensitive" };
  }
  if (filtroData) {
    const date = new Date(`${filtroData}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      const dayStart = date;
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      where.dataHoraCriacao = { gte: dayStart, lte: dayEnd };
    }
  }

  const chamados = await prisma.chamadoManutencao.findMany({
    where,
    orderBy: [{ dataHoraCriacao: "desc" }]
  });

  return (
    <div className="space-y-6 dark:text-slate-100">
      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Chamados de Manutenção
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Registro e acompanhamento de ocorrências de manutenção.
            </p>
          </div>
          <div className="btn-group">
            <Link href="/" className="btn-secondary">
              Voltar para Início
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
          Abrir Chamado de Manutenção
        </h2>
        <form action={createChamadoAction} className="grid gap-4 md:grid-cols-2">
          <input type="hidden" name="returnTo" value={PAGE_PATH} />
          <input type="hidden" name="contextoModulo" value={origemPrefill} />
          <input type="hidden" name="contextoRegistroId" value={registroIdPrefill} />

          <label className="text-sm text-slate-700 dark:text-slate-200">
            Título
            <input
              type="text"
              name="titulo"
              defaultValue={descricaoPrefill ? "Ocorrência Operacional" : ""}
              className={INPUT_CLASS}
            />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Área / Local *
            <input
              type="text"
              name="areaLocal"
              required
              defaultValue={areaPrefill}
              className={INPUT_CLASS}
            />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Origem
            <select name="origem" defaultValue={origemPrefill} className={INPUT_CLASS}>
              <option value={OrigemChamadoManutencao.MANUAL}>Manual</option>
              <option value={OrigemChamadoManutencao.TEMPERATURA}>Temperatura</option>
              <option value={OrigemChamadoManutencao.LIMPEZA}>Limpeza</option>
              <option value={OrigemChamadoManutencao.OLEO}>Óleo</option>
              <option value={OrigemChamadoManutencao.RECEBIMENTO}>Recebimento</option>
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Prioridade
            <select
              name="prioridade"
              defaultValue={PrioridadeChamadoManutencao.MEDIA}
              className={INPUT_CLASS}
            >
              <option value={PrioridadeChamadoManutencao.BAIXA}>Baixa</option>
              <option value={PrioridadeChamadoManutencao.MEDIA}>Média</option>
              <option value={PrioridadeChamadoManutencao.ALTA}>Alta</option>
            </select>
          </label>
          <label className="text-sm text-slate-700 md:col-span-2 dark:text-slate-200">
            Descrição *
            <textarea
              name="descricao"
              rows={3}
              required
              defaultValue={descricaoPrefill}
              className={INPUT_CLASS}
            />
          </label>

          <ImageUploadField
            name="fotoChamado"
            label="Foto (Opcional)"
            helperText="Use imagem para evidenciar a ocorrência."
            inputClassName={INPUT_CLASS}
          />

          <label className="text-sm text-slate-700 dark:text-slate-200">
            Confirme sua Senha *
            <input type="password" name="senhaConfirmacao" required className={INPUT_CLASS} />
          </label>

          <div className="md:col-span-2">
            <SignatureContextCard
              nomeUsuario={usuarioLogado}
              perfil={perfilLogado}
              dataHora={formatDateTimeDisplay(now)}
            />
          </div>

          <div className="md:col-span-2">
            <button type="submit" className="btn-primary">
              Abrir Chamado de Manutenção
            </button>
          </div>
        </form>
      </section>

      <section className={CARD_CLASS}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Lista de Chamados
        </h2>

        <form method="get" className="grid gap-3 rounded-lg bg-slate-50 p-4 md:grid-cols-4 dark:bg-slate-800">
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Status
            <select name="filtroStatus" defaultValue={filtroStatus ?? ""} className={INPUT_CLASS}>
              <option value="">Todos</option>
              <option value={StatusChamadoManutencao.ABERTO}>Aberto</option>
              <option value={StatusChamadoManutencao.EM_ANDAMENTO}>Em Andamento</option>
              <option value={StatusChamadoManutencao.CONCLUIDO}>Concluído</option>
              <option value={StatusChamadoManutencao.CANCELADO}>Cancelado</option>
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Prioridade
            <select
              name="filtroPrioridade"
              defaultValue={filtroPrioridade ?? ""}
              className={INPUT_CLASS}
            >
              <option value="">Todas</option>
              <option value={PrioridadeChamadoManutencao.BAIXA}>Baixa</option>
              <option value={PrioridadeChamadoManutencao.MEDIA}>Média</option>
              <option value={PrioridadeChamadoManutencao.ALTA}>Alta</option>
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Área / Local
            <input type="text" name="filtroArea" defaultValue={filtroArea} className={INPUT_CLASS} />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Data
            <input type="date" name="filtroData" defaultValue={filtroData} className={INPUT_CLASS} />
          </label>

          <div className="btn-group md:col-span-4">
            <button type="submit" className="btn-primary">
              Aplicar Filtros
            </button>
            <Link href={PAGE_PATH} className="btn-secondary">
              Limpar
            </Link>
          </div>
        </form>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <tr>
                <th className="px-3 py-2">Data/Hora</th>
                <th className="px-3 py-2">Título</th>
                <th className="px-3 py-2">Origem</th>
                <th className="px-3 py-2">Área</th>
                <th className="px-3 py-2">Prioridade</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Criado Por</th>
                <th className="px-3 py-2">Foto</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {chamados.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-3 text-slate-500 dark:text-slate-400">
                    Nenhum chamado encontrado.
                  </td>
                </tr>
              ) : (
                chamados.map((chamado) => (
                  <tr key={chamado.id}>
                    <td className="px-3 py-2">{formatDateTimeDisplay(chamado.dataHoraCriacao)}</td>
                    <td className="px-3 py-2">{chamado.titulo}</td>
                    <td className="px-3 py-2">{chamado.origem}</td>
                    <td className="px-3 py-2">{chamado.areaLocal}</td>
                    <td className="px-3 py-2">{getPrioridadeLabel(chamado.prioridade)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusClass(
                          chamado.status
                        )}`}
                      >
                        {getStatusLabel(chamado.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2">{chamado.criadoPorNome}</td>
                    <td className="px-3 py-2">
                      {getImageDataUrl(chamado.fotoMimeType, chamado.fotoBase64) ? (
                        <span className="text-xs text-slate-600 dark:text-slate-300">
                          Foto Anexada
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="btn-group">
                        <Link href={`${PAGE_PATH}/${chamado.id}`} className="btn-action">
                          Detalhar
                        </Link>
                        {podeAtualizar ? (
                          <Link href={`${PAGE_PATH}/${chamado.id}`} className="btn-secondary">
                            Atualizar Status
                          </Link>
                        ) : null}
                      </div>
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
