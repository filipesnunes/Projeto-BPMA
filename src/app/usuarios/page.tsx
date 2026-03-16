import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { canManageUsers, getRoleLabel, USER_ROLE_VALUES, type UserRole } from "@/lib/rbac";

import {
  createUserAction,
  resetUserPasswordAction,
  toggleUserStatusAction,
  updateUserAction
} from "./actions";

const CARD_CLASS =
  "rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900";
const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

type SearchParams = Record<string, string | string[] | undefined>;
type UsuariosPageProps = {
  searchParams: Promise<SearchParams>;
};

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatDateInput(date: Date | null): string {
  if (!date) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const dynamic = "force-dynamic";

export default async function UsuariosPage({ searchParams }: UsuariosPageProps) {
  const authUser = await getCurrentUser();
  if (!authUser || !canManageUsers(authUser.perfil)) {
    redirect("/acesso-negado");
  }

  const params = await searchParams;
  const feedback = firstParam(params.feedback).trim();
  const feedbackType = firstParam(params.feedbackType) === "error" ? "error" : "success";
  const editId = Number(firstParam(params.editId));

  const usuarios = await prisma.usuario.findMany({
    orderBy: [{ createdAt: "desc" }]
  });
  const usuarioEdicao =
    Number.isInteger(editId) && editId > 0 ? usuarios.find((item) => item.id === editId) : null;

  return (
    <div className="space-y-6 dark:text-slate-100">
      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Gestão de Usuários
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Cadastro, edição, inativação e redefinição de senha.
            </p>
          </div>
          <div className="btn-group">
            <Link href="/usuarios/solicitacoes" className="btn-secondary">
              Solicitações de Redefinição
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
          Novo Usuário
        </h2>
        <form action={createUserAction} className="grid gap-3 md:grid-cols-2">
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Nome Completo *
            <input name="nomeCompleto" required className={INPUT_CLASS} />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Nome de Usuário *
            <input name="nomeUsuario" required className={INPUT_CLASS} />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Perfil *
            <select name="perfil" required className={INPUT_CLASS}>
              {USER_ROLE_VALUES.map((role) => (
                <option key={role} value={role}>
                  {getRoleLabel(role)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Status
            <select name="status" defaultValue="ATIVO" className={INPUT_CLASS}>
              <option value="ATIVO">Ativo</option>
              <option value="INATIVO">Inativo</option>
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Data de Admissão
            <input type="date" name="dataAdmissao" className={INPUT_CLASS} />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Senha Inicial *
            <input type="text" name="senhaInicial" required className={INPUT_CLASS} />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200 md:col-span-2">
            Observações Internas
            <textarea name="observacoesInternas" rows={2} className={INPUT_CLASS} />
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 md:col-span-2">
            <input type="checkbox" name="obrigarTrocaSenha" defaultChecked />
            Obrigar troca no próximo acesso
          </label>
          <div className="md:col-span-2">
            <button type="submit" className="btn-primary">
              Criar Usuário
            </button>
          </div>
        </form>
      </section>

      {usuarioEdicao ? (
        <section className={CARD_CLASS}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Editar Usuário
            </h2>
            <Link href="/usuarios" className="btn-secondary">
              Cancelar Edição
            </Link>
          </div>
          <form action={updateUserAction} className="grid gap-3 md:grid-cols-2">
            <input type="hidden" name="userId" value={String(usuarioEdicao.id)} />
            <label className="text-sm text-slate-700 dark:text-slate-200">
              Nome Completo *
              <input
                name="nomeCompleto"
                defaultValue={usuarioEdicao.nomeCompleto}
                required
                className={INPUT_CLASS}
              />
            </label>
            <label className="text-sm text-slate-700 dark:text-slate-200">
              Nome de Usuário *
              <input
                name="nomeUsuario"
                defaultValue={usuarioEdicao.nomeUsuario}
                required
                className={INPUT_CLASS}
              />
            </label>
            <label className="text-sm text-slate-700 dark:text-slate-200">
              Perfil *
              <select
                name="perfil"
                defaultValue={usuarioEdicao.perfil}
                required
                className={INPUT_CLASS}
              >
                {USER_ROLE_VALUES.map((role) => (
                  <option key={role} value={role}>
                    {getRoleLabel(role)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-700 dark:text-slate-200">
              Status
              <select name="status" defaultValue={usuarioEdicao.status} className={INPUT_CLASS}>
                <option value="ATIVO">Ativo</option>
                <option value="INATIVO">Inativo</option>
              </select>
            </label>
            <label className="text-sm text-slate-700 dark:text-slate-200">
              Data de Admissão
              <input
                type="date"
                name="dataAdmissao"
                defaultValue={formatDateInput(usuarioEdicao.dataAdmissao)}
                className={INPUT_CLASS}
              />
            </label>
            <label className="text-sm text-slate-700 dark:text-slate-200 md:col-span-2">
              Observações Internas
              <textarea
                name="observacoesInternas"
                rows={2}
                defaultValue={usuarioEdicao.observacoesInternas ?? ""}
                className={INPUT_CLASS}
              />
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 md:col-span-2">
              <input
                type="checkbox"
                name="obrigarTrocaSenha"
                defaultChecked={usuarioEdicao.obrigarTrocaSenha}
              />
              Obrigar troca no próximo acesso
            </label>
            <div className="md:col-span-2">
              <button type="submit" className="btn-primary">
                Salvar Alterações
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className={CARD_CLASS}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Usuários Cadastrados ({usuarios.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <tr>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Usuário</th>
                <th className="px-3 py-2">Perfil</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {usuarios.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-3 text-slate-500 dark:text-slate-400">
                    Nenhum usuário cadastrado.
                  </td>
                </tr>
              ) : (
                usuarios.map((usuario) => (
                  <tr key={usuario.id}>
                    <td className="px-3 py-2">{usuario.nomeCompleto}</td>
                    <td className="px-3 py-2">{usuario.nomeUsuario}</td>
                    <td className="px-3 py-2">{getRoleLabel(usuario.perfil as UserRole)}</td>
                    <td className="px-3 py-2">{usuario.status === "ATIVO" ? "Ativo" : "Inativo"}</td>
                    <td className="px-3 py-2">
                      <div className="btn-group">
                        <Link
                          href={`/usuarios?editId=${usuario.id}`}
                          className="btn-action"
                        >
                          Editar
                        </Link>
                        <form action={toggleUserStatusAction} className="inline-flex">
                          <input type="hidden" name="userId" value={String(usuario.id)} />
                          <input
                            type="hidden"
                            name="status"
                            value={usuario.status === "ATIVO" ? "INATIVO" : "ATIVO"}
                          />
                          <button
                            type="submit"
                            className={usuario.status === "ATIVO" ? "btn-danger" : "btn-secondary"}
                          >
                            {usuario.status === "ATIVO" ? "Inativar" : "Ativar"}
                          </button>
                        </form>
                        <form action={resetUserPasswordAction} className="inline-flex items-center gap-2">
                          <input type="hidden" name="userId" value={String(usuario.id)} />
                          <input
                            type="text"
                            name="senhaTemporaria"
                            placeholder="Senha temporária (opcional)"
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                          />
                          <button type="submit" className="btn-secondary">
                            Redefinir Senha
                          </button>
                        </form>
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
