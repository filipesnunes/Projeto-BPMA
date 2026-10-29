import { registerTemperatureCorrectionPermission } from "@/lib/register-temperature-correction-permission";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ActionModal, ModalActions } from "@/components/ui/action-modal";
import { getCurrentUser } from "@/lib/auth-session";
import { formatAppDateInput } from "@/lib/date-time";
import {
  getPermissionGroups,
  hasPermission,
  isSensitivePermission
} from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getRoleLabel, type UserRole } from "@/lib/rbac";

import {
  createProfileAction,
  createUserAction,
  deleteUserAction,
  resetUserPasswordAction,
  toggleProfileStatusAction,
  toggleUserStatusAction,
  updateProfileAction,
  updateProfilePermissionsAction,
  updateUserAction
} from "./actions";

const CARD_CLASS = "bpma-card";
const INPUT_CLASS = "bpma-input";

type SearchParams = Record<string, string | string[] | undefined>;
type UsuariosPageProps = {
  searchParams: Promise<SearchParams>;
};

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatDateInput(date: Date | null): string {
  return date ? formatAppDateInput(date) : "";
}

function normalizeStatusInput(value: string, fallback: "ATIVO" | "INATIVO"): "ATIVO" | "INATIVO" {
  return value === "INATIVO" || value === "ATIVO" ? value : fallback;
}

function formatProfileLabel(user: {
  perfil: string;
  perfilAcesso?: { nome: string; codigo: string; ativo: boolean } | null;
}): string {
  return user.perfilAcesso?.nome ?? getRoleLabel(user.perfil as UserRole);
}

export const dynamic = "force-dynamic";

export default async function UsuariosPage({ searchParams }: UsuariosPageProps) {
  const authUser = await getCurrentUser();
  if (!authUser || !hasPermission(authUser, "usuarios.acessar")) {
    redirect("/acesso-negado");
  }
  await registerTemperatureCorrectionPermission();

  const params = await searchParams;
  const activeTab = firstParam(params.tab) === "perfis" ? "perfis" : "usuarios";
  const feedback = firstParam(params.feedback).trim();
  const feedbackType = firstParam(params.feedbackType) === "error" ? "error" : "success";
  const editError = firstParam(params.editError).trim();
  const editId = Number(firstParam(params.editId));
  const resetId = Number(firstParam(params.resetId));
  const statusId = Number(firstParam(params.statusId));
  const deleteId = Number(firstParam(params.deleteId));
  const profileEditId = Number(firstParam(params.profileEditId));
  const permissionProfileId = Number(firstParam(params.permissionProfileId));

  const canCreateUsers = hasPermission(authUser, "usuarios.criar");
  const canEditUsers = hasPermission(authUser, "usuarios.editar");
  const canDeactivateUsers = hasPermission(authUser, "usuarios.desativar");
  const canResetPasswords = hasPermission(authUser, "usuarios.redefinir_senha");
  const canDeleteUsers = hasPermission(authUser, "sistema.acesso_dev");
  const canCreateProfiles = hasPermission(authUser, "usuarios.criar_perfil");
  const canEditProfiles = hasPermission(authUser, "usuarios.editar_perfil");
  const canEditPermissions = hasPermission(authUser, "usuarios.editar_permissoes");
  const canDeactivateProfiles = hasPermission(authUser, "usuarios.desativar_perfil");

  const [usuarios, perfis] = await Promise.all([
    prisma.usuario.findMany({
      where: {
        isDevDefinitivo: false,
        perfil: { not: "DEV" }
      },
      include: {
        perfilAcesso: {
          select: {
            id: true,
            nome: true,
            codigo: true,
            ativo: true
          }
        }
      },
      orderBy: [{ createdAt: "desc" }]
    }),
    prisma.perfilAcesso.findMany({
      include: {
        _count: { select: { usuarios: true } },
        usuarios: {
          select: {
            id: true,
            nomeCompleto: true,
            nomeUsuario: true,
            status: true
          },
          orderBy: { nomeCompleto: "asc" }
        },
        permissoes: {
          where: { permitido: true },
          include: { permissao: true }
        }
      },
      orderBy: [{ sistemaPadrao: "desc" }, { nome: "asc" }]
    })
  ]);

  const profileOptions = perfis.filter((perfil) => perfil.ativo && perfil.codigo !== "DEV");
  const fallbackProfileId =
    profileOptions.find((perfil) => perfil.codigo === "COLABORADOR")?.id ?? profileOptions[0]?.id ?? 0;

  const usuarioEdicao =
    Number.isInteger(editId) && editId > 0 ? usuarios.find((item) => item.id === editId) : null;
  const usuarioResetSenha =
    Number.isInteger(resetId) && resetId > 0 ? usuarios.find((item) => item.id === resetId) : null;
  const usuarioStatus =
    Number.isInteger(statusId) && statusId > 0 ? usuarios.find((item) => item.id === statusId) : null;
  const usuarioRemocao =
    Number.isInteger(deleteId) && deleteId > 0 ? usuarios.find((item) => item.id === deleteId) : null;
  const profileEditing =
    Number.isInteger(profileEditId) && profileEditId > 0
      ? perfis.find((perfil) => perfil.id === profileEditId)
      : null;
  const profilePermissions =
    Number.isInteger(permissionProfileId) && permissionProfileId > 0
      ? perfis.find((perfil) => perfil.id === permissionProfileId)
      : null;

  const hasEditDraft = Boolean(usuarioEdicao && editError);
  const modalError = feedback && feedbackType === "error" ? feedback : "";
  const editNomeCompleto = hasEditDraft
    ? firstParam(params.editNomeCompleto)
    : usuarioEdicao?.nomeCompleto ?? "";
  const editNomeUsuario = hasEditDraft
    ? firstParam(params.editNomeUsuario)
    : usuarioEdicao?.nomeUsuario ?? "";
  const editPerfilAcessoId = usuarioEdicao
    ? hasEditDraft
      ? Number(firstParam(params.editPerfilAcessoId)) || fallbackProfileId
      : usuarioEdicao.perfilAcessoId ??
        profileOptions.find((perfil) => perfil.codigo === usuarioEdicao.perfil)?.id ??
        fallbackProfileId
    : fallbackProfileId;
  const editStatus = usuarioEdicao
    ? hasEditDraft
      ? normalizeStatusInput(
          firstParam(params.editStatus),
          usuarioEdicao.status === "INATIVO" ? "INATIVO" : "ATIVO"
        )
      : usuarioEdicao.status === "INATIVO"
        ? "INATIVO"
        : "ATIVO"
    : "ATIVO";
  const editDataAdmissao = hasEditDraft
    ? firstParam(params.editDataAdmissao)
    : formatDateInput(usuarioEdicao?.dataAdmissao ?? null);
  const editObservacoesInternas = hasEditDraft
    ? firstParam(params.editObservacoesInternas)
    : usuarioEdicao?.observacoesInternas ?? "";
  const editObrigarTrocaSenha = hasEditDraft
    ? firstParam(params.editObrigarTrocaSenha) !== "0"
    : usuarioEdicao?.obrigarTrocaSenha ?? false;

  const selectedPermissionCodes = new Set(
    profilePermissions?.permissoes.map((item) => item.permissao.codigo) ?? []
  );
  const permissionGroups = getPermissionGroups();

  return (
    <div className="space-y-6 dark:text-slate-100">
      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Gestão de Usuários
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Usuários, perfis configuráveis e permissões de acesso.
            </p>
          </div>
          <div className="btn-group">
            {canResetPasswords ? (
              <Link href="/usuarios/solicitacoes" className="btn-secondary">
                Solicitações de Redefinição
              </Link>
            ) : null}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/usuarios"
            className={activeTab === "usuarios" ? "btn-primary" : "btn-secondary"}
          >
            Usuários
          </Link>
          <Link
            href="/usuarios?tab=perfis"
            className={activeTab === "perfis" ? "btn-primary" : "btn-secondary"}
          >
            Perfis e Permissões
          </Link>
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

      {activeTab === "usuarios" ? (
        <>
          {canCreateUsers ? (
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
                  <select name="perfilAcessoId" required className={INPUT_CLASS} defaultValue={fallbackProfileId}>
                    {profileOptions.map((perfil) => (
                      <option key={perfil.id} value={perfil.id}>
                        {perfil.nome}
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
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span>{formatProfileLabel(usuario)}</span>
                            {usuario.perfilAcesso && !usuario.perfilAcesso.ativo ? (
                              <span className="rounded-full border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:border-slate-700 dark:text-slate-400">
                                Perfil inativo
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-2">{usuario.status === "ATIVO" ? "Ativo" : "Inativo"}</td>
                        <td className="px-3 py-2">
                          <div className="btn-group">
                            {canEditUsers ? (
                              <Link href={`/usuarios?editId=${usuario.id}`} className="btn-action">
                                Editar
                              </Link>
                            ) : null}
                            {canDeactivateUsers && usuario.id !== authUser.id ? (
                              <Link
                                href={`/usuarios?statusId=${usuario.id}`}
                                className={usuario.status === "ATIVO" ? "btn-danger" : "btn-secondary"}
                              >
                                {usuario.status === "ATIVO" ? "Inativar" : "Ativar"}
                              </Link>
                            ) : null}
                            {canResetPasswords ? (
                              <Link href={`/usuarios?resetId=${usuario.id}`} className="btn-secondary">
                                Redefinir Senha
                              </Link>
                            ) : null}
                            {canDeleteUsers && usuario.id !== authUser.id ? (
                              <Link href={`/usuarios?deleteId=${usuario.id}`} className="btn-danger">
                                Remover
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
        </>
      ) : (
        <>
          {canCreateProfiles ? (
            <section className={CARD_CLASS}>
              <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
                Novo Perfil
              </h2>
              <form action={createProfileAction} className="grid gap-3 md:grid-cols-2">
                <label className="text-sm text-slate-700 dark:text-slate-200">
                  Nome *
                  <input name="nome" required className={INPUT_CLASS} />
                </label>
                <label className="text-sm text-slate-700 dark:text-slate-200">
                  Código *
                  <input name="codigo" required className={INPUT_CLASS} placeholder="OPERACAO" />
                </label>
                <label className="text-sm text-slate-700 dark:text-slate-200">
                  Copiar permissões de
                  <select name="baseRole" defaultValue="COLABORADOR" className={INPUT_CLASS}>
                    <option value="COLABORADOR">Colaborador</option>
                    <option value="NUTRICIONISTA">Nutricionista</option>
                    <option value="GERENTE">Gerente</option>
                  </select>
                </label>
                <label className="text-sm text-slate-700 dark:text-slate-200 md:col-span-2">
                  Descrição
                  <textarea name="descricao" rows={2} className={INPUT_CLASS} />
                </label>
                <div className="md:col-span-2">
                  <button type="submit" className="btn-primary">
                    Criar Perfil
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          <section className={CARD_CLASS}>
            <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
              Perfis Cadastrados ({perfis.length})
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {perfis.map((perfil) => (
                <article
                  key={perfil.id}
                  className="rounded-lg border border-slate-200 p-4 dark:border-slate-700"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                          {perfil.nome}
                        </h3>
                        <span className="rounded-full border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300">
                          {perfil.codigo}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                            perfil.ativo
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                              : "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                          }`}
                        >
                          {perfil.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                        {perfil.descricao || "Sem descrição cadastrada."}
                      </p>
                      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                        {perfil._count.usuarios} usuário(s) vinculado(s)
                      </p>
                      {perfil.usuarios.length > 0 ? (
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {perfil.usuarios
                            .slice(0, 3)
                            .map((usuario) => usuario.nomeCompleto)
                            .join(", ")}
                          {perfil.usuarios.length > 3 ? "..." : ""}
                        </p>
                      ) : null}
                    </div>
                    <div className="btn-group">
                      {canEditPermissions ? (
                        <Link
                          href={`/usuarios?tab=perfis&permissionProfileId=${perfil.id}`}
                          className="btn-action"
                        >
                          Editar Permissões
                        </Link>
                      ) : null}
                      {canEditProfiles && perfil.codigo !== "DEV" ? (
                        <Link
                          href={`/usuarios?tab=perfis&profileEditId=${perfil.id}`}
                          className="btn-secondary"
                        >
                          Editar Perfil
                        </Link>
                      ) : null}
                      {canDeactivateProfiles && !perfil.sistemaPadrao ? (
                        <form action={toggleProfileStatusAction}>
                          <input type="hidden" name="profileId" value={perfil.id} />
                          <input type="hidden" name="ativo" value={perfil.ativo ? "0" : "1"} />
                          <button
                            type="submit"
                            className={perfil.ativo ? "btn-danger" : "btn-secondary"}
                          >
                            {perfil.ativo ? "Desativar" : "Ativar"}
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}

      {usuarioEdicao ? (
        <div className="bpma-modal-backdrop">
          <section className="bpma-modal-panel max-w-3xl">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Editar Usuário
            </h2>
            {editError ? (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
                {editError}
              </p>
            ) : null}
            <form action={updateUserAction} className="mt-4 grid gap-3 md:grid-cols-2">
              <input type="hidden" name="userId" value={String(usuarioEdicao.id)} />
              <input type="hidden" name="perfil" value={usuarioEdicao.perfil} />
              <label className="text-sm text-slate-700 dark:text-slate-200">
                Nome Completo *
                <input name="nomeCompleto" defaultValue={editNomeCompleto} required className={INPUT_CLASS} />
              </label>
              <label className="text-sm text-slate-700 dark:text-slate-200">
                Nome de Usuário *
                <input name="nomeUsuario" defaultValue={editNomeUsuario} required className={INPUT_CLASS} />
              </label>
              <label className="text-sm text-slate-700 dark:text-slate-200">
                Perfil *
                <select name="perfilAcessoId" defaultValue={editPerfilAcessoId} required className={INPUT_CLASS}>
                  {profileOptions.map((perfil) => (
                    <option key={perfil.id} value={perfil.id}>
                      {perfil.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-slate-700 dark:text-slate-200">
                Status
                <select name="status" defaultValue={editStatus} className={INPUT_CLASS}>
                  <option value="ATIVO">Ativo</option>
                  <option value="INATIVO">Inativo</option>
                </select>
              </label>
              <label className="text-sm text-slate-700 dark:text-slate-200">
                Data de Admissão
                <input type="date" name="dataAdmissao" defaultValue={editDataAdmissao} className={INPUT_CLASS} />
              </label>
              <label className="text-sm text-slate-700 dark:text-slate-200 md:col-span-2">
                Observações Internas
                <textarea name="observacoesInternas" rows={2} defaultValue={editObservacoesInternas} className={INPUT_CLASS} />
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 md:col-span-2">
                <input type="checkbox" name="obrigarTrocaSenha" defaultChecked={editObrigarTrocaSenha} />
                Obrigar troca no próximo acesso
              </label>
              <div className="mt-1 flex flex-col-reverse gap-2 md:col-span-2 sm:flex-row sm:justify-end">
                <Link href="/usuarios" className="btn-secondary text-center">
                  Cancelar
                </Link>
                <button type="submit" className="btn-primary">
                  Salvar Alterações
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {usuarioResetSenha ? (
        <ActionModal
          title="Redefinir Senha"
          cancelHref="/usuarios"
          description={
            <p>
              Usuário selecionado: <strong>{usuarioResetSenha.nomeCompleto}</strong> (
              {usuarioResetSenha.nomeUsuario}).
            </p>
          }
        >
          {modalError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
              {modalError}
            </p>
          ) : null}
          <form action={resetUserPasswordAction} className="mt-4 grid gap-3">
            <input type="hidden" name="userId" value={String(usuarioResetSenha.id)} />
            <input type="hidden" name="returnTo" value={`/usuarios?resetId=${usuarioResetSenha.id}`} />
            <label className="text-sm text-slate-700 dark:text-slate-200">
              Senha Temporária (Opcional)
              <input
                type="text"
                name="senhaTemporaria"
                placeholder="Deixe em branco para gerar automaticamente"
                className={INPUT_CLASS}
              />
            </label>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              O usuário será obrigado a trocar a senha no próximo acesso.
            </p>
            <ModalActions>
              <Link href="/usuarios" className="btn-secondary text-center">
                Cancelar
              </Link>
              <button type="submit" className="btn-primary">
                Redefinir Senha
              </button>
            </ModalActions>
          </form>
        </ActionModal>
      ) : null}

      {usuarioStatus ? (
        <ActionModal
          title={usuarioStatus.status === "ATIVO" ? "Inativar Usuário" : "Reativar Usuário"}
          cancelHref="/usuarios"
          description={
            <p>
              Usuário selecionado: <strong>{usuarioStatus.nomeCompleto}</strong> (
              {usuarioStatus.nomeUsuario}).
            </p>
          }
        >
          {modalError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
              {modalError}
            </p>
          ) : null}
          <form action={toggleUserStatusAction} className="mt-4">
            <input type="hidden" name="userId" value={String(usuarioStatus.id)} />
            <input type="hidden" name="status" value={usuarioStatus.status === "ATIVO" ? "INATIVO" : "ATIVO"} />
            <input type="hidden" name="returnTo" value={`/usuarios?statusId=${usuarioStatus.id}`} />
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {usuarioStatus.status === "ATIVO"
                ? "Confirme para bloquear novos acessos deste usuário."
                : "Confirme para liberar o acesso deste usuário novamente."}
            </p>
            <ModalActions>
              <Link href="/usuarios" className="btn-secondary text-center">
                Cancelar
              </Link>
              <button
                type="submit"
                className={usuarioStatus.status === "ATIVO" ? "btn-danger" : "btn-primary"}
              >
                {usuarioStatus.status === "ATIVO" ? "Inativar" : "Reativar"}
              </button>
            </ModalActions>
          </form>
        </ActionModal>
      ) : null}

      {usuarioRemocao ? (
        <ActionModal
          title="Remover Usuário"
          cancelHref="/usuarios"
          description={
            <p>
              Usuário selecionado: <strong>{usuarioRemocao.nomeCompleto}</strong> (
              {usuarioRemocao.nomeUsuario}).
            </p>
          }
        >
          {modalError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
              {modalError}
            </p>
          ) : null}
          <form action={deleteUserAction} className="mt-4">
            <input type="hidden" name="userId" value={String(usuarioRemocao.id)} />
            <input type="hidden" name="returnTo" value={`/usuarios?deleteId=${usuarioRemocao.id}`} />
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Esta ação remove o cadastro quando não há histórico vinculado. Se houver vínculos,
              o sistema bloqueará a remoção e manterá este modal aberto.
            </p>
            <ModalActions>
              <Link href="/usuarios" className="btn-secondary text-center">
                Cancelar
              </Link>
              <button type="submit" className="btn-danger">
                Remover Usuário
              </button>
            </ModalActions>
          </form>
        </ActionModal>
      ) : null}

      {profileEditing ? (
        <ActionModal
          title="Editar Perfil"
          cancelHref="/usuarios?tab=perfis"
          description={<p>Perfil selecionado: <strong>{profileEditing.nome}</strong>.</p>}
        >
          {modalError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
              {modalError}
            </p>
          ) : null}
          <form action={updateProfileAction} className="mt-4 grid gap-3">
            <input type="hidden" name="profileId" value={profileEditing.id} />
            <label className="text-sm text-slate-700 dark:text-slate-200">
              Nome *
              <input name="nome" defaultValue={profileEditing.nome} required className={INPUT_CLASS} />
            </label>
            <label className="text-sm text-slate-700 dark:text-slate-200">
              Descrição
              <textarea name="descricao" rows={3} defaultValue={profileEditing.descricao ?? ""} className={INPUT_CLASS} />
            </label>
            <ModalActions>
              <Link href="/usuarios?tab=perfis" className="btn-secondary text-center">
                Cancelar
              </Link>
              <button type="submit" className="btn-primary">
                Salvar Perfil
              </button>
            </ModalActions>
          </form>
        </ActionModal>
      ) : null}

      {profilePermissions ? (
        <div className="bpma-modal-backdrop">
          <section className="bpma-modal-panel max-w-5xl">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Editar Permissões
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Perfil: <strong>{profilePermissions.nome}</strong>
                </p>
              </div>
              <Link href="/usuarios?tab=perfis" className="btn-secondary text-center">
                Fechar
              </Link>
            </div>
            {modalError ? (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
                {modalError}
              </p>
            ) : null}
            {profilePermissions.codigo === "DEV" ? (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                O perfil DEV mantém acesso total e suas permissões críticas não podem ser removidas.
              </p>
            ) : null}
            <form action={updateProfilePermissionsAction} className="mt-4 space-y-4">
              <input type="hidden" name="profileId" value={profilePermissions.id} />
              <div className="grid gap-4 lg:grid-cols-2">
                {permissionGroups.map((group) => (
                  <fieldset
                    key={group.grupo}
                    className="rounded-lg border border-slate-200 p-4 dark:border-slate-700"
                  >
                    <legend className="px-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {group.grupo}
                    </legend>
                    <div className="mt-3 space-y-2">
                      {group.permissions.map((permission) => {
                        const checked =
                          profilePermissions.codigo === "DEV" ||
                          selectedPermissionCodes.has(permission.codigo);
                        const disabled = profilePermissions.codigo === "DEV";

                        return (
                          <label
                            key={permission.codigo}
                            className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200"
                          >
                            <input
                              type="checkbox"
                              name="permissionCodes"
                              value={permission.codigo}
                              defaultChecked={checked}
                              disabled={disabled}
                              className="mt-1"
                            />
                            <span className="flex-1">
                              {permission.nome}
                              {isSensitivePermission(permission.codigo) ? (
                                <span className="ml-2 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                                  Sensível
                                </span>
                              ) : null}
                              {permission.descricao ? (
                                <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                                  {permission.descricao}
                                </span>
                              ) : null}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
              </div>
              {profilePermissions.codigo !== "DEV" ? (
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Link href="/usuarios?tab=perfis" className="btn-secondary text-center">
                    Cancelar
                  </Link>
                  <button type="submit" className="btn-primary">
                    Salvar Permissões
                  </button>
                </div>
              ) : null}
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
