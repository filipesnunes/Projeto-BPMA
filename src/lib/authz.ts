import type { TipoAssinaturaSistema } from "@prisma/client";

import type { AuthenticatedUser } from "@/lib/auth-session";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import {
  canCloseMonth,
  canManageModuleOptions,
  canManageUsers,
  canOpenMaintenanceTicket,
  canReopenMonth,
  canResetPassword,
  canSignAsResponsible,
  canSignAsSupervisor,
  canSignTechnical,
  canUpdateMaintenanceTicket,
  canViewResetRequests,
  type UserRole
} from "@/lib/rbac";

export function ensureCanManageUsers(role: UserRole) {
  if (!canManageUsers(role)) {
    throw new Error("Você não tem permissão para gerenciar usuários.");
  }
}

export function ensureCanViewResetRequests(role: UserRole) {
  if (!canViewResetRequests(role)) {
    throw new Error("Você não tem permissão para visualizar solicitações.");
  }
}

export function ensureCanManageOptions(role: UserRole) {
  if (!canManageModuleOptions(role)) {
    throw new Error("Você não tem permissão para gerenciar opções.");
  }
}

export function ensureCanCloseMonth(role: UserRole) {
  if (!canCloseMonth(role)) {
    throw new Error("Seu perfil não pode assinar fechamento mensal.");
  }
}

export function ensureCanReopenMonth(role: UserRole) {
  if (!canReopenMonth(role)) {
    throw new Error("Seu perfil não pode reabrir períodos.");
  }
}

export function ensureCanSignResponsible(role: UserRole) {
  if (!canSignAsResponsible(role)) {
    throw new Error("Seu perfil não pode assinar como responsável.");
  }
}

export function ensureCanSignSupervisor(role: UserRole) {
  if (!canSignAsSupervisor(role)) {
    throw new Error("Seu perfil não pode assinar como supervisor.");
  }
}

export function ensureCanSignTechnical(role: UserRole) {
  if (!canSignTechnical(role)) {
    throw new Error("Seu perfil não pode assinar como responsável técnico.");
  }
}

export function ensureCanResetPassword(actorRole: UserRole, targetRole: UserRole) {
  if (!canResetPassword(actorRole, targetRole)) {
    throw new Error("Você não tem permissão para redefinir a senha deste usuário.");
  }
}

export function ensureCanOpenMaintenance(role: UserRole) {
  if (!canOpenMaintenanceTicket(role)) {
    throw new Error("Seu perfil não pode abrir chamados de manutenção.");
  }
}

export function ensureCanUpdateMaintenance(role: UserRole) {
  if (!canUpdateMaintenanceTicket(role)) {
    throw new Error("Seu perfil não pode atualizar chamados de manutenção.");
  }
}

export async function validateSignaturePassword(params: {
  user: AuthenticatedUser;
  password: string;
}) {
  const password = params.password.trim();
  if (!password) {
    throw new Error("Informe sua senha para confirmar a assinatura.");
  }

  const userDb = await prisma.usuario.findUnique({
    where: { id: params.user.id },
    select: { senhaHash: true }
  });
  if (!userDb || !verifyPassword(password, userDb.senhaHash)) {
    throw new Error("Senha inválida para confirmar a assinatura.");
  }
}

export async function createSignatureLog(params: {
  user: AuthenticatedUser;
  tipo: TipoAssinaturaSistema;
  modulo: string;
  referenciaId?: string | null;
  observacao?: string | null;
}) {
  await prisma.logAssinatura.create({
    data: {
      usuarioId: params.user.id,
      nomeUsuario: params.user.nomeUsuario,
      nomeCompleto: params.user.nomeCompleto,
      perfil: params.user.perfil,
      tipo: params.tipo,
      modulo: params.modulo,
      referenciaId: params.referenciaId ?? null,
      observacao: params.observacao ?? null,
      assinadoEm: new Date()
    }
  });
}
