"use server";
import { registerRetroactiveReviewPermissions } from "@/lib/register-retroactive-review-permissions";

import { Prisma, type PerfilUsuario } from "@prisma/client";
import { redirect } from "next/navigation";
import { rethrowIfRedirectError } from "@/lib/redirect-error";

import { getCurrentUserForAction } from "@/lib/auth-session";
import { getAppNow, parseAppDateInput } from "@/lib/date-time";
import {
  ensureCanResetPassword,
  ensureCanViewResetRequests,
  ensurePermission
} from "@/lib/authz";
import { generateTemporaryPassword, hashPassword, validatePasswordRules } from "@/lib/password";
import {
  ALL_PERMISSION_CODES,
  canGrantSensitivePermissions,
  getDefaultPermissionCodes,
  isSensitivePermission
} from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/lib/rbac";

const USERS_PATH = "/usuarios";
const PROFILES_PATH = "/usuarios?tab=perfis";
const REQUESTS_PATH = "/usuarios/solicitacoes";

function getInputValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseDateOnly(value: string): Date | null {
  return parseAppDateInput(value);
}

function parseStatus(value: string): "ATIVO" | "INATIVO" | null {
  if (value === "ATIVO" || value === "INATIVO") {
    return value;
  }

  return null;
}

function redirectWithFeedback(path: string, type: "success" | "error", feedback: string): never {
  const url = new URL(path, "http://localhost");
  url.searchParams.set("feedbackType", type);
  url.searchParams.set("feedback", feedback);

  redirect(`${url.pathname}?${url.searchParams.toString()}`);
}

function normalizeProfileCode(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

function getUsersReturnToPath(formData: FormData, fallback: string): string {
  const value = getInputValue(formData, "returnTo");

  if (
    value === USERS_PATH ||
    value.startsWith(`${USERS_PATH}?`) ||
    value === REQUESTS_PATH ||
    value.startsWith(`${REQUESTS_PATH}?`)
  ) {
    return value;
  }

  return fallback;
}

type UpdateDraft = {
  userId: number;
  nomeCompleto: string;
  nomeUsuario: string;
  perfil: string;
  perfilAcessoId: string;
  status: string;
  dataAdmissao: string;
  observacoesInternas: string;
  obrigarTrocaSenha: boolean;
};

function redirectWithUpdateDraftError(feedback: string, draft: UpdateDraft): never {
  const url = new URL(USERS_PATH, "http://localhost");
  url.searchParams.set("editId", String(draft.userId));
  url.searchParams.set("editError", feedback);
  url.searchParams.set("editNomeCompleto", draft.nomeCompleto);
  url.searchParams.set("editNomeUsuario", draft.nomeUsuario);
  url.searchParams.set("editPerfil", draft.perfil);
  url.searchParams.set("editPerfilAcessoId", draft.perfilAcessoId);
  url.searchParams.set("editStatus", draft.status);
  url.searchParams.set("editDataAdmissao", draft.dataAdmissao);
  url.searchParams.set("editObservacoesInternas", draft.observacoesInternas);
  url.searchParams.set("editObrigarTrocaSenha", draft.obrigarTrocaSenha ? "1" : "0");

  redirect(`${url.pathname}?${url.searchParams.toString()}`);
}

async function getTargetUserForManagement(userId: number) {
  return prisma.usuario.findUnique({
    where: { id: userId },
    select: {
      id: true,
      nomeCompleto: true,
      nomeUsuario: true,
      perfil: true,
      perfilAcessoId: true,
      status: true,
      isDevDefinitivo: true
    }
  });
}

function assertNotDevUser(target: {
  perfil: string;
  isDevDefinitivo?: boolean;
}) {
  if (target.isDevDefinitivo || target.perfil === "DEV") {
    throw new Error("O usuário DEV é técnico e não pode ser gerenciado pela tela de usuários.");
  }
}

async function resolveProfileForUser(profileId: number) {
  if (!Number.isInteger(profileId) || profileId <= 0) {
    throw new Error("Selecione um perfil válido.");
  }

  const profile = await prisma.perfilAcesso.findUnique({
    where: { id: profileId },
    select: {
      id: true,
      codigo: true,
      ativo: true,
      perfilLegado: true
    }
  });

  if (!profile || !profile.ativo) {
    throw new Error("Perfil selecionado não está ativo.");
  }

  if (profile.codigo === "DEV" || profile.perfilLegado === "DEV") {
    throw new Error("O usuário DEV deve ser criado apenas pelo bootstrap técnico.");
  }

  return {
    perfilAcessoId: profile.id,
    perfil: (profile.perfilLegado ?? "COLABORADOR") as PerfilUsuario
  };
}

export async function createUserAction(formData: FormData) {
  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "usuarios.criar", "Você não tem permissão para criar usuários.");

    const nomeCompleto = getInputValue(formData, "nomeCompleto");
    const nomeUsuario = getInputValue(formData, "nomeUsuario");
    const perfilAcessoId = Number(getInputValue(formData, "perfilAcessoId"));
    const status = parseStatus(getInputValue(formData, "status")) ?? "ATIVO";
    const dataAdmissao = parseDateOnly(getInputValue(formData, "dataAdmissao"));
    const observacoesInternas = getInputValue(formData, "observacoesInternas") || null;
    const senhaInicial = getInputValue(formData, "senhaInicial");
    const obrigarTrocaSenha = formData.get("obrigarTrocaSenha") === "on";

    if (!nomeCompleto || !nomeUsuario || !senhaInicial) {
      throw new Error("Preencha todos os campos obrigatórios de criação.");
    }

    const profileSelection = await resolveProfileForUser(perfilAcessoId);

    const passwordRuleError = validatePasswordRules(senhaInicial);
    if (passwordRuleError) {
      throw new Error(passwordRuleError);
    }

    const existente = await prisma.usuario.findUnique({
      where: { nomeUsuario },
      select: { id: true }
    });
    if (existente) {
      throw new Error("Nome de usuário já cadastrado.");
    }

    await prisma.usuario.create({
      data: {
        nomeCompleto,
        nomeUsuario,
        senhaHash: hashPassword(senhaInicial),
        perfil: profileSelection.perfil,
        perfilAcessoId: profileSelection.perfilAcessoId,
        status,
        dataAdmissao,
        observacoesInternas,
        obrigarTrocaSenha,
        ultimaAlteracaoSenha: getAppNow()
      }
    });

    redirectWithFeedback(USERS_PATH, "success", "Usuário criado com sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    const message =
      error instanceof Error && error.message ? error.message : "Não foi possível criar o usuário.";
    redirectWithFeedback(USERS_PATH, "error", message);
  }
}

export async function updateUserAction(formData: FormData) {
  const userId = Number(getInputValue(formData, "userId"));
  const nomeCompleto = getInputValue(formData, "nomeCompleto");
  const nomeUsuario = getInputValue(formData, "nomeUsuario");
  const perfilInput = getInputValue(formData, "perfil");
  const perfilAcessoIdInput = getInputValue(formData, "perfilAcessoId");
  const statusInput = getInputValue(formData, "status");
  const dataAdmissaoInput = getInputValue(formData, "dataAdmissao");
  const observacoesInternas = getInputValue(formData, "observacoesInternas") || "";
  const obrigarTrocaSenha = formData.get("obrigarTrocaSenha") === "on";

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "usuarios.editar", "Você não tem permissão para editar usuários.");

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new Error("Usuário inválido para edição.");
    }

    const perfilAcessoId = Number(perfilAcessoIdInput);
    const status = parseStatus(statusInput);
    const dataAdmissao = parseDateOnly(dataAdmissaoInput);

    if (!nomeCompleto || !nomeUsuario || !status) {
      throw new Error("Preencha todos os campos obrigatórios.");
    }

    const profileSelection = await resolveProfileForUser(perfilAcessoId);

    const target = await getTargetUserForManagement(userId);
    if (!target) {
      throw new Error("Usuário não encontrado.");
    }

    assertNotDevUser(target);

    if (target.isDevDefinitivo) {
      if (nomeUsuario !== target.nomeUsuario) {
        throw new Error("Não é permitido alterar o nome de usuário do DEV definitivo.");
      }
      if (profileSelection.perfil !== "DEV") {
        throw new Error("O DEV definitivo deve manter o perfil DEV.");
      }
      if (status !== "ATIVO") {
        throw new Error("O DEV definitivo deve permanecer ativo.");
      }
    }

    const nomeUsuarioEmUso = await prisma.usuario.findFirst({
      where: {
        nomeUsuario,
        id: { not: userId }
      },
      select: { id: true }
    });
    if (nomeUsuarioEmUso) {
      throw new Error("Nome de usuário já está em uso por outro cadastro.");
    }

    await prisma.usuario.update({
      where: { id: userId },
      data: {
        nomeCompleto,
        nomeUsuario,
        perfil: profileSelection.perfil,
        perfilAcessoId: profileSelection.perfilAcessoId,
        status,
        dataAdmissao,
        observacoesInternas: observacoesInternas || null,
        obrigarTrocaSenha
      }
    });

    redirectWithFeedback(USERS_PATH, "success", "Usuário atualizado com sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Não foi possível atualizar o usuário.";

    if (Number.isInteger(userId) && userId > 0) {
      redirectWithUpdateDraftError(message, {
        userId,
        nomeCompleto,
        nomeUsuario,
        perfil: perfilInput,
        perfilAcessoId: perfilAcessoIdInput,
        status: statusInput,
        dataAdmissao: dataAdmissaoInput,
        observacoesInternas,
        obrigarTrocaSenha
      });
    }

    redirectWithFeedback(USERS_PATH, "error", message);
  }
}

export async function toggleUserStatusAction(formData: FormData) {
  const returnTo = getUsersReturnToPath(formData, USERS_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "usuarios.desativar", "Você não tem permissão para ativar ou inativar usuários.");

    const userId = Number(getInputValue(formData, "userId"));
    const status = parseStatus(getInputValue(formData, "status"));
    if (!Number.isInteger(userId) || userId <= 0 || !status) {
      throw new Error("Dados inválidos para atualização de status.");
    }

    const target = await getTargetUserForManagement(userId);
    if (!target) {
      throw new Error("Usuário não encontrado.");
    }

    assertNotDevUser(target);

    if (target.id === actor.id && status === "INATIVO") {
      throw new Error("Você não pode inativar o próprio usuário.");
    }

    if (target.isDevDefinitivo && status === "INATIVO") {
      throw new Error("O usuário DEV definitivo não pode ser inativado.");
    }

    await prisma.usuario.update({
      where: { id: userId },
      data: { status }
    });

    redirectWithFeedback(
      USERS_PATH,
      "success",
      status === "ATIVO" ? "Usuário ativado com sucesso." : "Usuário inativado com sucesso."
    );
  } catch (error) {
    rethrowIfRedirectError(error);
    const message =
      error instanceof Error && error.message ? error.message : "Não foi possível alterar o status.";
    redirectWithFeedback(returnTo, "error", message);
  }
}

export async function resetUserPasswordAction(formData: FormData) {
  const returnTo = getUsersReturnToPath(formData, USERS_PATH);

  try {
    const actor = await getCurrentUserForAction();

    const userId = Number(getInputValue(formData, "userId"));
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new Error("Usuário inválido para redefinição de senha.");
    }

    const target = await prisma.usuario.findUnique({
      where: { id: userId },
      select: { id: true, perfil: true, nomeCompleto: true, isDevDefinitivo: true }
    });
    if (!target) {
      throw new Error("Usuário não encontrado.");
    }

    assertNotDevUser(target);
    ensureCanResetPassword(actor, target.perfil as UserRole);

    const senhaTemporariaInformada = getInputValue(formData, "senhaTemporaria");
    const senhaTemporaria = senhaTemporariaInformada || generateTemporaryPassword();
    const passwordRuleError = validatePasswordRules(senhaTemporaria);
    if (passwordRuleError) {
      throw new Error(passwordRuleError);
    }

    await prisma.usuario.update({
      where: { id: userId },
      data: {
        senhaHash: hashPassword(senhaTemporaria),
        obrigarTrocaSenha: true,
        ultimaAlteracaoSenha: getAppNow()
      }
    });

    redirectWithFeedback(
      USERS_PATH,
      "success",
      `Senha temporária de ${target.nomeCompleto}: ${senhaTemporaria}`
    );
  } catch (error) {
    rethrowIfRedirectError(error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Não foi possível redefinir a senha.";
    redirectWithFeedback(returnTo, "error", message);
  }
}

export async function deleteUserAction(formData: FormData) {
  const returnTo = getUsersReturnToPath(formData, USERS_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "sistema.acesso_dev", "Apenas DEV pode remover usuários.");

    const userId = Number(getInputValue(formData, "userId"));
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new Error("Usuário inválido para remoção.");
    }

    const target = await getTargetUserForManagement(userId);
    if (!target) {
      throw new Error("Usuário não encontrado.");
    }

    assertNotDevUser(target);

    if (target.id === actor.id) {
      throw new Error("Você não pode remover o próprio usuário.");
    }

    if (target.isDevDefinitivo) {
      throw new Error("O usuário DEV definitivo não pode ser removido.");
    }

    await prisma.usuario.delete({
      where: { id: userId }
    });

    redirectWithFeedback(USERS_PATH, "success", "Usuário removido com sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      redirectWithFeedback(
        returnTo,
        "error",
        "Não foi possível remover o usuário porque ele possui histórico vinculado. Inative-o."
      );
    }

    const message =
      error instanceof Error && error.message ? error.message : "Não foi possível remover o usuário.";
    redirectWithFeedback(returnTo, "error", message);
  }
}

function parseBaseRole(value: string): UserRole {
  if (value === "GERENTE" || value === "NUTRICIONISTA" || value === "COLABORADOR") {
    return value;
  }

  return "COLABORADOR";
}

function getSelectedPermissionCodes(formData: FormData): string[] {
  const allowedCodes = new Set(ALL_PERMISSION_CODES);
  const codes = formData
    .getAll("permissionCodes")
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => allowedCodes.has(value));

  return Array.from(new Set(codes));
}

async function ensureAdministrativeAccessIsPreserved(params: {
  profileId: number;
  profileIsActive: boolean;
  nextPermissionCodes: string[];
  actorProfileId: number | null;
}) {
  const nextPermissions = new Set(params.nextPermissionCodes);

  if (
    params.actorProfileId === params.profileId &&
    !nextPermissions.has("usuarios.editar_permissoes")
  ) {
    throw new Error("Você não pode remover sua própria permissão de editar permissões.");
  }

  const targetWillRemainAdmin =
    params.profileIsActive &&
    nextPermissions.has("usuarios.acessar") &&
    nextPermissions.has("usuarios.editar_permissoes");

  const otherAdminProfiles = await prisma.perfilAcesso.count({
    where: {
      id: { not: params.profileId },
      ativo: true,
      permissoes: {
        some: {
          permitido: true,
          permissao: { codigo: "usuarios.editar_permissoes" }
        }
      },
      AND: [
        {
          permissoes: {
            some: {
              permitido: true,
              permissao: { codigo: "usuarios.acessar" }
            }
          }
        }
      ]
    }
  });

  if (!targetWillRemainAdmin && otherAdminProfiles === 0) {
    throw new Error("A alteração deixaria o sistema sem perfil administrativo ativo.");
  }
}

export async function createProfileAction(formData: FormData) {
  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "usuarios.criar_perfil", "Você não tem permissão para criar perfis.");

    const nome = getInputValue(formData, "nome");
    const codigoInput = getInputValue(formData, "codigo") || nome;
    const codigo = normalizeProfileCode(codigoInput);
    const descricao = getInputValue(formData, "descricao") || null;
    const baseRole = parseBaseRole(getInputValue(formData, "baseRole"));

    if (!nome || !codigo) {
      throw new Error("Informe nome e código do perfil.");
    }

    if (["DEV", "GERENTE", "NUTRICIONISTA", "COLABORADOR"].includes(codigo)) {
      throw new Error("Use outro código para perfis personalizados.");
    }

    const existingProfile = await prisma.perfilAcesso.findUnique({
      where: { codigo },
      select: { id: true }
    });
    if (existingProfile) {
      throw new Error("Já existe um perfil com este código.");
    }

    const defaultCodes = getDefaultPermissionCodes(baseRole).filter(
      (codigoPermissao) =>
        canGrantSensitivePermissions(actor) || !isSensitivePermission(codigoPermissao)
    );

    await prisma.$transaction(async (tx) => {
      const profile = await tx.perfilAcesso.create({
        data: {
          nome,
          codigo,
          descricao,
          ativo: true,
          sistemaPadrao: false
        },
        select: { id: true }
      });

      const permissions = await tx.permissao.findMany({
        where: { codigo: { in: defaultCodes } },
        select: { id: true }
      });

      if (permissions.length > 0) {
        await tx.perfilPermissao.createMany({
          data: permissions.map((permission) => ({
            perfilId: profile.id,
            permissaoId: permission.id,
            permitido: true
          }))
        });
      }
    });

    redirectWithFeedback(PROFILES_PATH, "success", "Perfil criado com sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    const message =
      error instanceof Error && error.message ? error.message : "Não foi possível criar o perfil.";
    redirectWithFeedback(PROFILES_PATH, "error", message);
  }
}

export async function updateProfileAction(formData: FormData) {
  const profileId = Number(getInputValue(formData, "profileId"));

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "usuarios.editar_perfil", "Você não tem permissão para editar perfis.");

    const nome = getInputValue(formData, "nome");
    const descricao = getInputValue(formData, "descricao") || null;

    if (!Number.isInteger(profileId) || profileId <= 0) {
      throw new Error("Perfil inválido.");
    }

    if (!nome) {
      throw new Error("Informe o nome do perfil.");
    }

    const profile = await prisma.perfilAcesso.findUnique({
      where: { id: profileId },
      select: { codigo: true }
    });
    if (!profile) {
      throw new Error("Perfil não encontrado.");
    }

    if (profile.codigo === "DEV") {
      throw new Error("O perfil DEV não pode ser editado por esta tela.");
    }

    await prisma.perfilAcesso.update({
      where: { id: profileId },
      data: { nome, descricao }
    });

    redirectWithFeedback(PROFILES_PATH, "success", "Perfil atualizado com sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    const message =
      error instanceof Error && error.message ? error.message : "Não foi possível atualizar o perfil.";
    redirectWithFeedback(
      Number.isInteger(profileId) && profileId > 0
        ? `${PROFILES_PATH}&profileEditId=${profileId}`
        : PROFILES_PATH,
      "error",
      message
    );
  }
}

export async function toggleProfileStatusAction(formData: FormData) {
  const profileId = Number(getInputValue(formData, "profileId"));

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "usuarios.desativar_perfil", "Você não tem permissão para desativar perfis.");

    const ativo = getInputValue(formData, "ativo") === "1";

    if (!Number.isInteger(profileId) || profileId <= 0) {
      throw new Error("Perfil inválido.");
    }

    const profile = await prisma.perfilAcesso.findUnique({
      where: { id: profileId },
      include: {
        _count: { select: { usuarios: true } }
      }
    });
    if (!profile) {
      throw new Error("Perfil não encontrado.");
    }

    if (profile.sistemaPadrao || profile.codigo === "DEV") {
      throw new Error("Perfis padrão do sistema não podem ser desativados.");
    }

    if (!ativo && actor.perfilAcessoId === profile.id) {
      throw new Error("Você não pode desativar o próprio perfil.");
    }

    if (!ativo && profile._count.usuarios > 0) {
      throw new Error("Este perfil possui usuários vinculados. Reatribua os usuários antes de desativar.");
    }

    await prisma.perfilAcesso.update({
      where: { id: profileId },
      data: { ativo }
    });

    redirectWithFeedback(
      PROFILES_PATH,
      "success",
      ativo ? "Perfil ativado com sucesso." : "Perfil desativado com sucesso."
    );
  } catch (error) {
    rethrowIfRedirectError(error);
    const message =
      error instanceof Error && error.message ? error.message : "Não foi possível alterar o perfil.";
    redirectWithFeedback(PROFILES_PATH, "error", message);
  }
}

export async function updateProfilePermissionsAction(formData: FormData) {
  const profileId = Number(getInputValue(formData, "profileId"));

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(
      actor,
      "usuarios.editar_permissoes",
      "Você não tem permissão para editar permissões."
    );

    if (!Number.isInteger(profileId) || profileId <= 0) {
      throw new Error("Perfil inválido.");
    }

    const profile = await prisma.perfilAcesso.findUnique({
      where: { id: profileId },
      include: {
        permissoes: {
          where: { permitido: true },
          include: { permissao: true }
        }
      }
    });
    if (!profile) {
      throw new Error("Perfil não encontrado.");
    }

    const beforeCodes = profile.permissoes
      .map((profilePermission) => profilePermission.permissao.codigo)
      .sort();
    const selectedCodes = profile.codigo === "DEV" ? ALL_PERMISSION_CODES : getSelectedPermissionCodes(formData);

    if (!canGrantSensitivePermissions(actor)) {
      const changedSensitivePermission = ALL_PERMISSION_CODES.some((codigo) => {
        if (!isSensitivePermission(codigo)) {
          return false;
        }

        const hadPermission = beforeCodes.includes(codigo);
        const willHavePermission = selectedCodes.includes(codigo);
        return hadPermission !== willHavePermission;
      });

      if (changedSensitivePermission) {
        throw new Error("Você não pode conceder ou remover permissões sensíveis.");
      }
    }

    await ensureAdministrativeAccessIsPreserved({
      profileId,
      profileIsActive: profile.ativo,
      nextPermissionCodes: selectedCodes,
      actorProfileId: actor.perfilAcessoId
    });

    const afterCodes = Array.from(new Set(selectedCodes)).sort();
    const added = afterCodes.filter((codigo) => !beforeCodes.includes(codigo));
    const removed = beforeCodes.filter((codigo) => !afterCodes.includes(codigo));
    const resumo = `Adicionadas: ${added.length}; removidas: ${removed.length}.`;

    await prisma.$transaction(async (tx) => {
      await registerRetroactiveReviewPermissions(tx);
      await tx.perfilPermissao.deleteMany({
        where: { perfilId: profile.id }
      });

      const permissions = await tx.permissao.findMany({
        where: { codigo: { in: afterCodes } },
        select: { id: true }
      });

      if (permissions.length > 0) {
        await tx.perfilPermissao.createMany({
          data: permissions.map((permission) => ({
            perfilId: profile.id,
            permissaoId: permission.id,
            permitido: true
          }))
        });
      }

      await tx.perfilPermissaoAuditoria.create({
        data: {
          perfilId: profile.id,
          perfilCodigo: profile.codigo,
          alteradoPorId: actor.id,
          alteradoPorNome: actor.nomeCompleto,
          permissoesAntes: beforeCodes,
          permissoesDepois: afterCodes,
          resumo
        }
      });
    });

    redirectWithFeedback(PROFILES_PATH, "success", "Permissões atualizadas com sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Não foi possível atualizar permissões.";
    redirectWithFeedback(
      Number.isInteger(profileId) && profileId > 0
        ? `${PROFILES_PATH}&permissionProfileId=${profileId}`
        : PROFILES_PATH,
      "error",
      message
    );
  }
}

export async function handleResetRequestAction(formData: FormData) {
  const returnTo = getUsersReturnToPath(formData, REQUESTS_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanViewResetRequests(actor);

    const requestId = Number(getInputValue(formData, "requestId"));
    const senhaTemporariaInformada = getInputValue(formData, "senhaTemporaria");
    const observacaoInterna = getInputValue(formData, "observacaoInterna") || null;

    if (!Number.isInteger(requestId) || requestId <= 0) {
      throw new Error("Solicitação inválida.");
    }

    const solicitacao = await prisma.solicitacaoRedefinicaoSenha.findUnique({
      where: { id: requestId },
      include: {
        usuario: {
          select: { id: true, perfil: true, nomeCompleto: true, isDevDefinitivo: true }
        }
      }
    });
    if (!solicitacao) {
      throw new Error("Solicitação não encontrada.");
    }

    if (solicitacao.status !== "PENDENTE") {
      throw new Error("Esta solicitação já foi tratada.");
    }

    if (!solicitacao.usuario) {
      await prisma.solicitacaoRedefinicaoSenha.update({
        where: { id: requestId },
        data: {
          status: "CANCELADA",
          observacaoInterna:
            observacaoInterna ||
            "Solicitação cancelada: usuário não identificado no sistema.",
          tratadoPorId: actor.id,
          tratadoEm: getAppNow()
        }
      });
      redirectWithFeedback(
        REQUESTS_PATH,
        "success",
        "Solicitação cancelada porque o usuário não foi localizado."
      );
    }

    assertNotDevUser(solicitacao.usuario);
    ensureCanResetPassword(actor, solicitacao.usuario.perfil as UserRole);

    const senhaTemporaria = senhaTemporariaInformada || generateTemporaryPassword();
    const passwordRuleError = validatePasswordRules(senhaTemporaria);
    if (passwordRuleError) {
      throw new Error(passwordRuleError);
    }

    await prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id: solicitacao.usuario!.id },
        data: {
          senhaHash: hashPassword(senhaTemporaria),
          obrigarTrocaSenha: true,
          ultimaAlteracaoSenha: getAppNow()
        }
      });
      await tx.solicitacaoRedefinicaoSenha.update({
        where: { id: requestId },
        data: {
          status: "ATENDIDA",
          observacaoInterna: observacaoInterna,
          tratadoPorId: actor.id,
          tratadoEm: getAppNow()
        }
      });
    });

    redirectWithFeedback(
      REQUESTS_PATH,
      "success",
      `Solicitação atendida. Senha temporária: ${senhaTemporaria}`
    );
  } catch (error) {
    rethrowIfRedirectError(error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Não foi possível tratar a solicitação.";
    redirectWithFeedback(returnTo, "error", message);
  }
}


