import { createHash, randomBytes } from "node:crypto";

import { StatusUsuario, type PerfilUsuario } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/lib/rbac";

export const SESSION_COOKIE_NAME = "bpma_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 12; // 12 horas

export type AuthenticatedUser = {
  id: number;
  nomeCompleto: string;
  nomeUsuario: string;
  perfil: UserRole;
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
  const session = await prisma.usuarioSessao.findUnique({
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

  if (!session) {
    return null;
  }

  if (session.expiraEm.getTime() < Date.now()) {
    return null;
  }

  if (session.usuario.status !== StatusUsuario.ATIVO) {
    return null;
  }

  return {
    id: session.usuario.id,
    nomeCompleto: session.usuario.nomeCompleto,
    nomeUsuario: session.usuario.nomeUsuario,
    perfil: profileToUserRole(session.usuario.perfil),
    status: session.usuario.status,
    obrigarTrocaSenha: session.usuario.obrigarTrocaSenha
  };
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
