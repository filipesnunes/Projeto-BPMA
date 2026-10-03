import { createHash, randomBytes } from "node:crypto";

import { Prisma, StatusUsuario, type PerfilUsuario } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getDefaultPermissionCodes } from "@/lib/permissions";
import { registerPersonalizationPermission } from "@/lib/personalization-permission";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/lib/rbac";

export const SESSION_COOKIE_NAME = "bpma_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 12; // 12 horas

export type AuthenticatedUser = {
  id: number;
  sessaoId: number;
  nomeCompleto: string;
  nomeUsuario: string;
  perfil: UserRole;
  perfilAcessoId: number | null;
  perfilCodigo: string | null;
  perfilNome: string | null;
  permissoes: string[];
  status: StatusUsuario;
  obrigarTrocaSenha: boolean;
};

function profileToUserRole(profile: PerfilUsuario): UserRole {
  return profile as UserRole;
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

function isMissingProfileAccessColumnError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2022" &&
    String(error.message).includes("perfilAcessoId")
  );
}

function buildAuthenticatedUser(params: {
  sessaoId: number;
  usuario: {
    id: number;
    nomeCompleto: string;
    nomeUsuario: string;
    perfil: PerfilUsuario;
    status: StatusUsuario;
    obrigarTrocaSenha: boolean;
    perfilAcesso?: {
      id: number;
      nome: string;
      codigo: string;
      ativo: boolean;
      permissoes: Array<{ permissao: { codigo: string } }>;
    } | null;
  };
}): AuthenticatedUser {
  const legacyRole = profileToUserRole(params.usuario.perfil);
  const perfilAcesso = params.usuario.perfilAcesso ?? null;
  const hasLinkedProfile = Boolean(perfilAcesso);
  const permissoes = hasLinkedProfile
    ? perfilAcesso!.ativo
      ? perfilAcesso!.permissoes.map((perfilPermissao) => perfilPermissao.permissao.codigo)
      : []
    : getDefaultPermissionCodes(legacyRole);

  return {
    id: params.usuario.id,
    sessaoId: params.sessaoId,
    nomeCompleto: params.usuario.nomeCompleto,
    nomeUsuario: params.usuario.nomeUsuario,
    perfil: legacyRole,
    perfilAcessoId: hasLinkedProfile ? perfilAcesso!.id : null,
    perfilCodigo: hasLinkedProfile ? perfilAcesso!.codigo : null,
    perfilNome: hasLinkedProfile ? perfilAcesso!.nome : null,
    permissoes,
    status: params.usuario.status,
    obrigarTrocaSenha: params.usuario.obrigarTrocaSenha
  };
}

async function findSessionWithProfileAccess(tokenHash: string) {
  return prisma.usuarioSessao.findUnique({
    where: { tokenHash },
    include: {
      usuario: {
        select: {
          id: true,
          nomeCompleto: true,
          nomeUsuario: true,
          perfil: true,
          perfilAcessoId: true,
          perfilAcesso: {
            select: {
              id: true,
              nome: true,
              codigo: true,
              ativo: true,
              permissoes: {
                where: { permitido: true },
                select: {
                  permissao: {
                    select: {
                      codigo: true
                    }
                  }
                }
              }
            }
          },
          status: true,
          obrigarTrocaSenha: true
        }
      }
    }
  });
}

async function findLegacySession(tokenHash: string) {
  return prisma.usuarioSessao.findUnique({
    where: { tokenHash },
    include: {
      usuario: {
        select: {
          id: true,
          nomeCompleto: true,
          nomeUsuario: true,
          perfil: true,
          status: true,
          obrigarTrocaSenha: true
        }
      }
    }
  });
}

export async function createSessionForUser(userId: number): Promise<void> {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiraEm = new Date(Date.now() + SESSION_DURATION_MS);

  await prisma.usuarioSessao.create({
    data: {
      tokenHash,
      usuarioId: userId,
      expiraEm
    }
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiraEm
  });
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    const tokenHash = hashSessionToken(token);
    await prisma.usuarioSessao.deleteMany({
      where: { tokenHash }
    });
  }

  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0)
  });
}

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const tokenHash = hashSessionToken(token);
  let session:
    | Awaited<ReturnType<typeof findSessionWithProfileAccess>>
    | Awaited<ReturnType<typeof findLegacySession>>;

  try {
    session = await findSessionWithProfileAccess(tokenHash);
  } catch (error) {
    if (!isMissingProfileAccessColumnError(error)) {
      throw error;
    }

    session = await findLegacySession(tokenHash);
  }

  if (!session) {
    return null;
  }

  if (session.expiraEm.getTime() < Date.now()) {
    await prisma.usuarioSessao.deleteMany({
      where: { tokenHash }
    });
    return null;
  }

  if (session.usuario.status !== StatusUsuario.ATIVO) {
    await prisma.usuarioSessao.deleteMany({
      where: { tokenHash }
    });
    return null;
  }

  // Only a valid, active session can initialize the new permission catalog entry.
  // Reload the profile grants when this request performed the initial registration.
  if ("perfilAcesso" in session.usuario && await registerPersonalizationPermission()) {
    const refreshed = await findSessionWithProfileAccess(tokenHash);
    if (!refreshed) return null;
    return buildAuthenticatedUser({ usuario: refreshed.usuario, sessaoId: refreshed.id });
  }
  return buildAuthenticatedUser({ usuario: session.usuario, sessaoId: session.id });
}

export async function requireAuthenticatedUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function getCurrentUserForAction(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Sessão inválida. Faça login novamente.");
  }

  return user;
}
