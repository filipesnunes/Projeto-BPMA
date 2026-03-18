"use server";

import { redirect } from "next/navigation";

import { createSessionForUser, getCurrentUserForAction } from "@/lib/auth-session";
import { hashPassword, validatePasswordRules, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

function getInputValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function redirectWithFeedback(pathname: string, type: "success" | "error", feedback: string): never {
  const url = new URL(pathname, "http://localhost");
  url.searchParams.set("feedbackType", type);
  url.searchParams.set("feedback", feedback);

  redirect(`${url.pathname}?${url.searchParams.toString()}`);
}

export async function loginAction(formData: FormData) {
  const nomeUsuario = getInputValue(formData, "nomeUsuario");
  const senha = getInputValue(formData, "senha");
  const nextPath = getInputValue(formData, "next");

  if (!nomeUsuario || !senha) {
    redirectWithFeedback("/login", "error", "Informe nome de usuário e senha.");
  }

  const usuario = await prisma.usuario.findUnique({
    where: { nomeUsuario },
    select: {
      id: true,
      nomeCompleto: true,
      senhaHash: true,
      status: true,
      obrigarTrocaSenha: true
    }
  });

  if (!usuario || !verifyPassword(senha, usuario.senhaHash)) {
    redirectWithFeedback("/login", "error", "Login inválido. Verifique usuário e senha.");
  }

  if (usuario.status !== "ATIVO") {
    redirectWithFeedback(
      "/login",
      "error",
      "Seu usuário está inativo. Procure seu gestor para reativação."
    );
  }

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { ultimoAcesso: new Date() }
  });

  await createSessionForUser(usuario.id);

  if (usuario.obrigarTrocaSenha) {
    redirect("/trocar-senha");
  }

  const safeNext =
    nextPath && nextPath.startsWith("/") && !nextPath.startsWith("/login")
      ? nextPath
      : "/";
  redirect(safeNext);
}

export async function requestPasswordResetAction(formData: FormData) {
  try {
    const nomeUsuario = getInputValue(formData, "nomeUsuario");
    const nomeCompleto = getInputValue(formData, "nomeCompleto");

    if (!nomeUsuario || !nomeCompleto) {
      throw new Error("Informe nome de usuário e nome completo.");
    }

    const usuario = await prisma.usuario.findUnique({
      where: { nomeUsuario },
      select: { id: true }
    });

    await prisma.solicitacaoRedefinicaoSenha.create({
      data: {
        usuarioId: usuario?.id ?? null,
        nomeUsuarioInformado: nomeUsuario,
        nomeCompletoInformado: nomeCompleto,
        status: "PENDENTE"
      }
    });

    redirectWithFeedback(
      "/login/esqueci-senha",
      "success",
      "Solicitação registrada com sucesso. Aguarde contato do gestor/supervisor."
    );
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Não foi possível registrar a solicitação.";
    redirectWithFeedback("/login/esqueci-senha", "error", message);
  }
}

export async function changeOwnPasswordAction(formData: FormData) {
  try {
    const usuarioAtual = await getCurrentUserForAction();
    const senhaAtual = getInputValue(formData, "senhaAtual");
    const novaSenha = getInputValue(formData, "novaSenha");
    const confirmarNovaSenha = getInputValue(formData, "confirmarNovaSenha");

    if (!senhaAtual || !novaSenha || !confirmarNovaSenha) {
      throw new Error("Preencha todos os campos para trocar a senha.");
    }

    if (novaSenha !== confirmarNovaSenha) {
      throw new Error("A confirmação da nova senha não confere.");
    }

    const passwordValidationError = validatePasswordRules(novaSenha);
    if (passwordValidationError) {
      throw new Error(passwordValidationError);
    }

    const usuarioDb = await prisma.usuario.findUnique({
      where: { id: usuarioAtual.id },
      select: { id: true, senhaHash: true }
    });
    if (!usuarioDb || !verifyPassword(senhaAtual, usuarioDb.senhaHash)) {
      throw new Error("A senha atual informada está incorreta.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id: usuarioAtual.id },
        data: {
          senhaHash: hashPassword(novaSenha),
          obrigarTrocaSenha: false,
          ultimaAlteracaoSenha: new Date()
        }
      });
      await tx.usuarioSessao.deleteMany({
        where: { usuarioId: usuarioAtual.id }
      });
    });

    await createSessionForUser(usuarioAtual.id);
    redirect("/");
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Não foi possível trocar a senha.";
    redirectWithFeedback("/trocar-senha", "error", message);
  }
}
