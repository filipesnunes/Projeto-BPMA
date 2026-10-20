import { OperationalDeletionPanel } from "@/components/operational-deletion-panel";
import {
  ModuloDocumento,
  OrigemChamadoManutencao,
  Prisma,
  StatusChamadoManutencao
} from "@prisma/client";
import Link from "next/link";

import { SignatureContextCard } from "@/components/auth/signature-context-card";
import { DocumentosModuleHeader } from "@/components/documentos/documentos-module-header";
import { ImageUploadField } from "@/components/forms/image-upload-field";
import { getCurrentUser } from "@/lib/auth-session";
import {
  formatAppDateTime,
  getAppNow,
  getEndOfAppDay,
  getStartOfAppDay,
  parseAppDateInput
} from "@/lib/date-time";
import { getImageDataUrl } from "@/lib/image-upload";
import { prisma } from "@/lib/prisma";
import {
  canManageModuleOptions,
  canUpdateMaintenanceTicket,
  getRoleLabel
} from "@/lib/rbac";

import { createChamadoAction } from "./actions";

const PAGE_PATH = "/chamados-manutencao";
const CARD_CLASS =
  "bpma-card";
const INPUT_CLASS =
  "bpma-input";

type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = { searchParams: Promise<SearchParams> };

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatDateTimeDisplay(date: Date): string {
  return formatAppDateTime(date);
}

function parseStatus(value: string): StatusChamadoManutencao | null {
  if (value === StatusChamadoManutencao.ABERTO) return StatusChamadoManutencao.ABERTO;
  if (value === StatusChamadoManutencao.EM_ANDAMENTO) return StatusChamadoManutencao.EM_ANDAMENTO;
  if (value === StatusChamadoManutencao.CONCLUIDO) return StatusChamadoManutencao.CONCLUIDO;
  if (value === StatusChamadoManutencao.CANCELADO) return StatusChamadoManutencao.CANCELADO;
  return null;
}

function parseOrigem(value: string): OrigemChamadoManutencao {
  if (value === OrigemChamadoManutencao.TEMPERATURA) return OrigemChamadoManutencao.TEMPERATURA;
  if (value === OrigemChamadoManutencao.LIMPEZA) return OrigemChamadoManutencao.LIMPEZA;
  if (value === OrigemChamadoManutencao.OLEO) return OrigemChamadoManutencao.OLEO;
  if (value === OrigemChamadoManutencao.RECEBIMENTO) return OrigemChamadoManutencao.RECEBIMENTO;
  if (value === OrigemChamadoManutencao.HORTIFRUTI) return OrigemChamadoManutencao.HORTIFRUTI;
  if (value === OrigemChamadoManutencao.BUFFET_AMOSTRAS) return OrigemChamadoManutencao.BUFFET_AMOSTRAS;
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

function getOrigemLabel(origem: OrigemChamadoManutencao): string {
  if (origem === OrigemChamadoManutencao.TEMPERATURA) return "Temperatura";
  if (origem === OrigemChamadoManutencao.LIMPEZA) return "Limpeza";
  if (origem === OrigemChamadoManutencao.OLEO) return "Óleo";
  if (origem === OrigemChamadoManutencao.RECEBIMENTO) return "Recebimento";
  if (origem === OrigemChamadoManutencao.HORTIFRUTI) return "Hortifruti";
  if (origem === OrigemChamadoManutencao.BUFFET_AMOSTRAS) return "Buffet / Amostras";
  return "Outros";
}

export default async function ChamadosManutencaoPage({ searchParams }: PageProps) {
  const authUser = await getCurrentUser();
  const usuarioLogado = authUser?.nomeCompleto ?? "Usuário logado";
  const perfilLogado = authUser ? getRoleLabel(authUser.perfil) : "";
  const podeAtualizar = authUser ? canUpdateMaintenanceTicket(authUser) : false;
  const podeGerenciarOpcoes = authUser ? canManageModuleOptions(authUser) : false;
  const isColaborador = authUser?.perfil === "COLABORADOR";
  const now = getAppNow();

  const params = await searchParams;
  const feedback = firstParam(params.feedback).trim();
  const feedbackType = firstParam(params.feedbackType) === "error" ? "error" : "success";
  const modalError = feedback && feedbackType === "error" ? feedback : "";

  const origemRaw = firstParam(params.origem).trim();
  const origemPrefill = parseOrigem(origemRaw);
  const descricaoPrefill = firstParam(params.descricao).trim();
  const tituloPrefill = firstParam(params.titulo).trim();
  const registroIdPrefill = firstParam(params.registroId).trim();
  const abrirChamadoSelecionado =
    firstParam(params.abrir) === "1" ||
    Boolean(origemRaw || descricaoPrefill || tituloPrefill || registroIdPrefill);
  const createReturnTo = `${PAGE_PATH}?abrir=1`;

  const filtroStatus = parseStatus(firstParam(params.filtroStatus));
  const filtroOrigem = firstParam(params.filtroOrigem).trim();
  const filtroData = firstParam(params.filtroData).trim();

  const where: Prisma.ChamadoManutencaoWhereInput = {};
  if (filtroStatus) {
    where.status = filtroStatus;
  }
  if (filtroOrigem) {
    where.origem = parseOrigem(filtroOrigem);
  }
  if (filtroData) {
    const date = parseAppDateInput(filtroData);
    if (date) {
      where.dataHoraCriacao = { gte: getStartOfAppDay(date), lte: getEndOfAppDay(date) };
    }
  }
  if (isColaborador && authUser) {
    where.criadoPorId = authUser.id;
  }

  const chamados = await prisma.chamadoManutencao.findMany({
    where,
    orderBy: [{ dataHoraCriacao: "desc" }]
  });

  return (
    <div className="space-y-6 dark:text-slate-100">
      <DocumentosModuleHeader
        title="Chamados de Manutenção"
        description="Registro e acompanhamento de ocorrências de manutenção."
        modulo={ModuloDocumento.CHAMADOS_MANUTENCAO}
        modulePath={PAGE_PATH}
        searchParams={params}
        managementHref={podeGerenciarOpcoes ? "/chamados-manutencao/opcoes" : undefined}
        backHref="/"
        backLabel="Voltar ao Módulo"
      />

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

      <div className={abrirChamadoSelecionado ? "bpma-modal-backdrop" : ""}>
        <section className={abrirChamadoSelecionado ? "bpma-modal-panel max-w-3xl" : CARD_CLASS}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Abrir Chamado de Manutenção
            </h2>
            {abrirChamadoSelecionado ? (
              <Link href={PAGE_PATH} className="btn-secondary">
                Cancelar
              </Link>
            ) : null}
          </div>

          {!abrirChamadoSelecionado ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Abra um chamado pontual sem sair da lista atual.
              </p>
              <Link href={`${PAGE_PATH}?abrir=1`} className="btn-primary">
                Abrir Chamado de Manutenção
              </Link>
            </div>
          ) : (
            <>
              {modalError ? (
                <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
                  {modalError}
                </p>
              ) : null}
              <form action={createChamadoAction} className="grid gap-4 md:grid-cols-2">
                <input type="hidden" name="returnTo" value={createReturnTo} />
                <input type="hidden" name="contextoModulo" value={origemPrefill} />
                <input type="hidden" name="contextoRegistroId" value={registroIdPrefill} />

              <label className="text-sm text-slate-700 dark:text-slate-200">
                Título
                <input
                  type="text"
                  name="titulo"
                  defaultValue={tituloPrefill || (descricaoPrefill ? "Ocorrência Operacional" : "")}
                  className={INPUT_CLASS}
                />
              </label>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Usuário
                </p>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {usuarioLogado}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Preenchido automaticamente pelo usuário logado.
                </p>
              </div>
              <label className="text-sm text-slate-700 dark:text-slate-200">
                Origem *
                <select name="origem" defaultValue={origemPrefill} className={INPUT_CLASS}>
                  <option value={OrigemChamadoManutencao.TEMPERATURA}>Temperatura</option>
                  <option value={OrigemChamadoManutencao.LIMPEZA}>Limpeza</option>
                  <option value={OrigemChamadoManutencao.OLEO}>Óleo</option>
                  <option value={OrigemChamadoManutencao.RECEBIMENTO}>Recebimento</option>
                  <option value={OrigemChamadoManutencao.HORTIFRUTI}>Hortifruti</option>
                  <option value={OrigemChamadoManutencao.BUFFET_AMOSTRAS}>Buffet / Amostras</option>
                  <option value={OrigemChamadoManutencao.MANUAL}>Outros</option>
                </select>
              </label>
              <label className="text-sm text-slate-700 md:col-span-2 dark:text-slate-200">
                Observação *
                <textarea
                  name="observacao"
                  rows={3}
                  required
                  defaultValue={descricaoPrefill}
                  className={INPUT_CLASS}
                />
              </label>

              <ImageUploadField
                name="fotoChamado"
                label="Foto *"
                helperText="Anexe uma foto para abrir o chamado."
                required
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

                <div className="flex flex-col-reverse gap-2 md:col-span-2 sm:flex-row sm:justify-end">
                  <Link href={PAGE_PATH} className="btn-secondary text-center">
                    Cancelar
                  </Link>
                  <button type="submit" className="btn-primary">
                    Abrir Chamado de Manutenção
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>

      <section className={CARD_CLASS}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          {isColaborador ? "Meus Chamados" : "Lista de Chamados"}
        </h2>

        {isColaborador ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            Acompanhamento simples dos chamados que você abriu.
          </p>
        ) : (
          <form method="get" className="grid gap-3 rounded-lg bg-slate-50 p-4 md:grid-cols-3 dark:bg-slate-800">
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
              Origem
              <select name="filtroOrigem" defaultValue={filtroOrigem} className={INPUT_CLASS}>
                <option value="">Todas</option>
                <option value={OrigemChamadoManutencao.TEMPERATURA}>Temperatura</option>
                <option value={OrigemChamadoManutencao.LIMPEZA}>Limpeza</option>
                <option value={OrigemChamadoManutencao.OLEO}>Óleo</option>
                <option value={OrigemChamadoManutencao.RECEBIMENTO}>Recebimento</option>
                <option value={OrigemChamadoManutencao.HORTIFRUTI}>Hortifruti</option>
                <option value={OrigemChamadoManutencao.BUFFET_AMOSTRAS}>Buffet / Amostras</option>
                <option value={OrigemChamadoManutencao.MANUAL}>Outros</option>
              </select>
            </label>
            <label className="text-sm text-slate-700 dark:text-slate-200">
              Data
              <input type="date" name="filtroData" defaultValue={filtroData} className={INPUT_CLASS} />
            </label>

            <div className="btn-group md:col-span-3">
              <button type="submit" className="btn-primary">
                Aplicar Filtros
              </button>
              <Link href={PAGE_PATH} className="btn-secondary">
                Limpar
              </Link>
            </div>
          </form>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <tr>
                <th className="px-3 py-2">Data/Hora</th>
                <th className="px-3 py-2">Título</th>
                <th className="px-3 py-2">Origem</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Usuário</th>
                <th className="px-3 py-2">Foto</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {chamados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-3 text-slate-500 dark:text-slate-400">
                    Nenhum chamado encontrado.
                  </td>
                </tr>
              ) : (
                chamados.map((chamado) => (
                  <tr key={chamado.id}>
                    <td className="px-3 py-2">{formatDateTimeDisplay(chamado.dataHoraCriacao)}</td>
                    <td className="px-3 py-2">{chamado.titulo}</td>
                    <td className="px-3 py-2">{getOrigemLabel(chamado.origem)}</td>
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
                          <Link href={`${PAGE_PATH}/${chamado.id}?statusModal=1`} className="btn-secondary">
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
      <OperationalDeletionPanel target="chamados" selectedDate={params.exclusaoData} />
    </div>
  );
}
