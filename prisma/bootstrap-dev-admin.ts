import "dotenv/config";

import { PerfilUsuario, PrismaClient, StatusUsuario } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

const prisma = new PrismaClient();

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim() ?? "";
  if (!value) {
    throw new Error(`Defina a variável de ambiente obrigatória: ${name}`);
  }

  return value;
}

function hashPassword(password: string): string {
  const normalizedPassword = password.trim();
  if (normalizedPassword.length < 6) {
    throw new Error("A senha do usuário DEV deve possuir no mínimo 6 caracteres.");
  }

  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(normalizedPassword, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

async function main() {
  const nomeCompleto = getRequiredEnv("BPMA_DEV_ADMIN_NOME");
  const nomeUsuario = getRequiredEnv("BPMA_DEV_ADMIN_USUARIO");
  const senha = getRequiredEnv("BPMA_DEV_ADMIN_SENHA");

  const senhaHash = hashPassword(senha);
  const now = new Date();

  const existing = await prisma.usuario.findUnique({
    where: { nomeUsuario },
    select: { id: true }
  });

  if (existing) {
    await prisma.usuario.update({
      where: { id: existing.id },
      data: {
        nomeCompleto,
        senhaHash,
        perfil: PerfilUsuario.DEV,
        status: StatusUsuario.ATIVO,
        isDevDefinitivo: true,
        obrigarTrocaSenha: false,
        ultimaAlteracaoSenha: now
      }
    });

    console.log(`Usuário DEV definitivo atualizado: ${nomeUsuario}`);
    return;
  }

  await prisma.usuario.create({
    data: {
      nomeCompleto,
      nomeUsuario,
      senhaHash,
      perfil: PerfilUsuario.DEV,
      status: StatusUsuario.ATIVO,
      isDevDefinitivo: true,
      obrigarTrocaSenha: false,
      dataAdmissao: now,
      ultimaAlteracaoSenha: now,
      observacoesInternas: "Usuário DEV definitivo criado via bootstrap administrativo."
    }
  });

  console.log(`Usuário DEV definitivo criado: ${nomeUsuario}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

