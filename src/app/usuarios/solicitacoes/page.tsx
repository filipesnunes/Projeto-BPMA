import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { canViewResetRequests, getRoleLabel, type UserRole } from "@/lib/rbac";

import { handleResetRequestAction } from "../actions";

const CARD_CLASS =
  "rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900";
const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

type SearchParams = Record<string, string | string[] | undefined>;
type SolicitacoesPageProps = {
  searchParams: Promise<SearchParams>;
};

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatDateTime(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hour}:${minute}`;
}

export const dynamic = "force-dynamic";

export default async function SolicitacoesRedefinicaoPage({
  searchParams
}: SolicitacoesPageProps) {
  const authUser = await getCurrentUser();
  if (!authUser || !canViewResetRequests(authUser.perfil)) {
    redirect("/acesso-negado");
  }

  const params = await searchParams;
  const feedback = firstParam(params.feedback).trim();
  const feedbackType = firstParam(params.feedbackType) === "error" ? "error" : "success";

  const solicitacoes = await prisma.solicitacaoRedefinicaoSenha.findMany({
    include: {
      usuario: {
        select: { nomeCompleto: true, nomeUsuario: true, perfil: true }
      },
      tratadoPor: {
        select: { nomeCompleto: true }
      }
    },
    orderBy: [{ createdAt: "desc" }]
  });

  return (
    <div className="space-y-6 dark:text-slate-100">
      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Solicitações de Redefinição
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Fluxo interno para tratamento de senha esquecida.
            </p>
          </div>
          <div className="btn-group">
            <Link href="/usuarios" className="btn-secondary">
              Voltar para Usuários
            </Link>
          </div>
        </div>
      </section>

      {feedback ? (
        <section
          className={`rounded-xl border px-4 py-3 text-sm ${
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
          Solicitações ({solicitacoes.length})
        </h2>

        <div className="space-y-4">
          {solicitacoes.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Nenhuma solicitação registrada.
            </p>
          ) : (
            solicitacoes.map((solicitacao) => (
              <article
                key={solicitacao.id}
                className="rounded-lg border border-slate-200 p-4 dark:border-slate-700"
              >
                <div className="grid gap-2 text-sm md:grid-cols-2">
                  <p>
                    <strong>Usuário informado:</strong> {solicitacao.nomeUsuarioInformado}
                  </p>
                  <p>
                    <strong>Nome informado:</strong> {solicitacao.nomeCompletoInformado}
                  </p>
                  <p>
                    <strong>Cadastro encontrado:</strong>{" "}
                    {solicitacao.usuario
                      ? `${solicitacao.usuario.nomeCompleto} (${solicitacao.usuario.nomeUsuario})`
                      : "Não localizado"}
                  </p>
                  <p>
                    <strong>Perfil alvo:</strong>{" "}
                    {solicitacao.usuario
                      ? getRoleLabel(solicitacao.usuario.perfil as UserRole)
                      : "-"}
                  </p>
                  <p>
                    <strong>Status:</strong> {solicitacao.status}
                  </p>
                  <p>
                    <strong>Criada em:</strong> {formatDateTime(solicitacao.createdAt)}
                  </p>
                  {solicitacao.tratadoPor ? (
                    <p>
                      <strong>Tratada por:</strong> {solicitacao.tratadoPor.nomeCompleto}
                    </p>
                  ) : null}
                </div>

                {solicitacao.status === "PENDENTE" ? (
                  <form action={handleResetRequestAction} className="mt-3 grid gap-3 md:grid-cols-3">
                    <input type="hidden" name="requestId" value={String(solicitacao.id)} />
                    <label className="text-sm text-slate-700 dark:text-slate-200">
                      Senha Temporária (Opcional)
                      <input name="senhaTemporaria" className={INPUT_CLASS} />
                    </label>
                    <label className="text-sm text-slate-700 dark:text-slate-200 md:col-span-2">
                      Observação Interna (Opcional)
                      <input name="observacaoInterna" className={INPUT_CLASS} />
                    </label>
                    <div className="md:col-span-3">
                      <button type="submit" className="btn-primary">
                        Tratar Solicitação
                      </button>
                    </div>
                  </form>
                ) : solicitacao.observacaoInterna ? (
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                    <strong>Observação:</strong> {solicitacao.observacaoInterna}
                  </p>
                ) : null}
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
