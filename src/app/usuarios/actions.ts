"use server";

import { redirect } from "next/navigation";

import { getCurrentUserForAction } from "@/lib/auth-session";
import {
  ensureCanManageUsers,
  ensureCanResetPassword,
  ensureCanViewResetRequests
} from "@/lib/authz";
import { generateTemporaryPassword, hashPassword, validatePasswordRules } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/lib/rbac";

const USERS_PATH = "/usuarios";
const REQUESTS_PATH = "/usuarios/solicitacoes";

function getInputValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseDateOnly(value: string): Date | null {
  const [year, month, day] = value.split("-").map((item) => Number(item));
  if (!year || !month || !day) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function parseRole(value: string): UserRole | null {
  if (
    value === "DEV" ||
    value === "GESTOR" ||
    value === "SUPERVISOR" ||
    value === "RESPONSAVEL_TECNICO" ||
    value === "FUNCIONARIO"
  ) {
    return value;
  }

  return null;
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

export async function createUserAction(formData: FormData) {
  try {
    const actor = await getCurrentUserForAction();
    ensureCanManageUsers(actor.perfil);

    const nomeCompleto = getInputValue(formData, "nomeCompleto");
    const nomeUsuario = getInputValue(formData, "nomeUsuario");
    const perfil = parseRole(getInputValue(formData, "perfil"));
    const status = parseStatus(getInputValue(formData, "status")) ?? "ATIVO";
    const dataAdmissao = parseDateOnly(getInputValue(formData, "dataAdmissao"));
    const observacoesInternas = getInputValue(formData, "observacoesInternas") || null;
    const senhaInicial = getInputValue(formData, "senhaInicial");
    const obrigarTrocaSenha = formData.get("obrigarTrocaSenha") === "on";

    if (!nomeCompleto || !nomeUsuario || !perfil || !senhaInicial) {
      throw new Error("Preencha todos os campos obrigatórios de criação.");
    }

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
        perfil,
        status,
        dataAdmissao,
        observacoesInternas,
        obrigarTrocaSenha,
        ultimaAlteracaoSenha: new Date()
      }
    });

    redirectWithFeedback(USERS_PATH, "success", "Usuário criado com sucesso.");
  } catch (error) {
    const message =
      error instanceof Error && error.message ? error.message : "Não foi possível criar o usuário.";
    redirectWithFeedback(USERS_PATH, "error", message);
  }
}

export async function updateUserAction(formData: FormData) {
  try {
    const actor = await getCurrentUserForAction();
    ensureCanManageUsers(actor.perfil);

    const userId = Number(getInputValue(formData, "userId"));
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new Error("Usuário inválido para edição.");
    }

    const nomeCompleto = getInputValue(formData, "nomeCompleto");
    const nomeUsuario = getInputValue(formData, "nomeUsuario");
    const perfil = parseRole(getInputValue(formData, "perfil"));
    const status = parseStatus(getInputValue(formData, "status"));
    const dataAdmissao = parseDateOnly(getInputValue(formData, "dataAdmissao"));
    const observacoesInternas = getInputValue(formData, "observacoesInternas") || null;
    const obrigarTrocaSenha = formData.get("obrigarTrocaSenha") === "on";

    if (!nomeCompleto || !nomeUsuario || !perfil || !status) {
      throw new Error("Preencha todos os campos obrigatórios.");
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
        perfil,
        status,
        dataAdmissao,
        observacoesInternas,
        obrigarTrocaSenha
      }
    });

    redirectWithFeedback(USERS_PATH, "success", "Usuário atualizado com sucesso.");
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Não foi possível atualizar o usuário.";
    redirectWithFeedback(USERS_PATH, "error", message);
  }
}

export async function toggleUserStatusAction(formData: FormData) {
  try {
    const actor = await getCurrentUserForAction();
    ensureCanManageUsers(actor.perfil);

    const userId = Number(getInputValue(formData, "userId"));
    const status = parseStatus(getInputValue(formData, "status"));
    if (!Number.isInteger(userId) || userId <= 0 || !status) {
      throw new Error("Dados inválidos para atualização de status.");
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
    const message =
      error instanceof Error && error.message ? error.message : "Não foi possível alterar o status.";
    redirectWithFeedback(USERS_PATH, "error", message);
  }
}

export async function resetUserPasswordAction(formData: FormData) {
  try {
    const actor = await getCurrentUserForAction();

    const userId = Number(getInputValue(formData, "userId"));
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new Error("Usuário inválido para redefinição de senha.");
    }

    const target = await prisma.usuario.findUnique({
      where: { id: userId },
      select: { id: true, perfil: true, nomeCompleto: true }
    });
    if (!target) {
      throw new Error("Usuário não encontrado.");
    }

    ensureCanResetPassword(actor.perfil, target.perfil as UserRole);

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
        ultimaAlteracaoSenha: new Date()
      }
    });

    redirectWithFeedback(
      USERS_PATH,
      "success",
      `Senha temporária de ${target.nomeCompleto}: ${senhaTemporaria}`
    );
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Não foi possível redefinir a senha.";
    redirectWithFeedback(USERS_PATH, "error", message);
  }
}

export async function handleResetRequestAction(formData: FormData) {
  try {
    const actor = await getCurrentUserForAction();
    ensureCanViewResetRequests(actor.perfil);

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
          select: { id: true, perfil: true, nomeCompleto: true }
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
          tratadoEm: new Date()
        }
      });
      redirectWithFeedback(
        REQUESTS_PATH,
        "success",
        "Solicitação cancelada porque o usuário não foi localizado."
      );
    }

    ensureCanResetPassword(actor.perfil, solicitacao.usuario.perfil as UserRole);

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
          ultimaAlteracaoSenha: new Date()
        }
      });
      await tx.solicitacaoRedefinicaoSenha.update({
        where: { id: requestId },
        data: {
          status: "ATENDIDA",
          observacaoInterna: observacaoInterna,
          tratadoPorId: actor.id,
          tratadoEm: new Date()
        }
      });
    });

    redirectWithFeedback(
      REQUESTS_PATH,
      "success",
      `Solicitação atendida. Senha temporária: ${senhaTemporaria}`
    );
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Não foi possível tratar a solicitação.";
    redirectWithFeedback(REQUESTS_PATH, "error", message);
  }
}
