-- CreateEnum
CREATE TYPE "PerfilUsuario" AS ENUM ('DEV', 'GESTOR', 'SUPERVISOR', 'RESPONSAVEL_TECNICO', 'FUNCIONARIO');

-- CreateEnum
CREATE TYPE "StatusUsuario" AS ENUM ('ATIVO', 'INATIVO');

-- CreateEnum
CREATE TYPE "StatusSolicitacaoRedefinicaoSenha" AS ENUM ('PENDENTE', 'ATENDIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoAssinaturaSistema" AS ENUM ('RESPONSAVEL', 'SUPERVISOR', 'RESPONSAVEL_TECNICO', 'FECHAMENTO_MENSAL');

-- CreateTable
CREATE TABLE "usuario" (
    "id" SERIAL NOT NULL,
    "nomeCompleto" TEXT NOT NULL,
    "nomeUsuario" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "perfil" "PerfilUsuario" NOT NULL,
    "status" "StatusUsuario" NOT NULL DEFAULT 'ATIVO',
    "dataAdmissao" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ultimaAlteracaoSenha" TIMESTAMP(3),
    "obrigarTrocaSenha" BOOLEAN NOT NULL DEFAULT false,
    "ultimoAcesso" TIMESTAMP(3),
    "observacoesInternas" TEXT,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_sessao" (
    "id" SERIAL NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "ultimoAcesso" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuario_sessao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitacao_redefinicao_senha" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER,
    "nomeUsuarioInformado" TEXT NOT NULL,
    "nomeCompletoInformado" TEXT NOT NULL,
    "status" "StatusSolicitacaoRedefinicaoSenha" NOT NULL DEFAULT 'PENDENTE',
    "observacaoInterna" TEXT,
    "tratadoPorId" INTEGER,
    "tratadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solicitacao_redefinicao_senha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_assinatura" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "nomeUsuario" TEXT NOT NULL,
    "nomeCompleto" TEXT NOT NULL,
    "perfil" "PerfilUsuario" NOT NULL,
    "tipo" "TipoAssinaturaSistema" NOT NULL,
    "modulo" TEXT NOT NULL,
    "referenciaId" TEXT,
    "observacao" TEXT,
    "assinadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "log_assinatura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_nomeUsuario_key" ON "usuario"("nomeUsuario");

-- CreateIndex
CREATE INDEX "usuario_perfil_status_idx" ON "usuario"("perfil", "status");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_sessao_tokenHash_key" ON "usuario_sessao"("tokenHash");

-- CreateIndex
CREATE INDEX "usuario_sessao_usuarioId_idx" ON "usuario_sessao"("usuarioId");

-- CreateIndex
CREATE INDEX "usuario_sessao_expiraEm_idx" ON "usuario_sessao"("expiraEm");

-- CreateIndex
CREATE INDEX "solicitacao_redefinicao_senha_status_idx" ON "solicitacao_redefinicao_senha"("status");

-- CreateIndex
CREATE INDEX "solicitacao_redefinicao_senha_usuarioId_idx" ON "solicitacao_redefinicao_senha"("usuarioId");

-- CreateIndex
CREATE INDEX "log_assinatura_usuarioId_idx" ON "log_assinatura"("usuarioId");

-- CreateIndex
CREATE INDEX "log_assinatura_tipo_assinadoEm_idx" ON "log_assinatura"("tipo", "assinadoEm");

-- CreateIndex
CREATE INDEX "log_assinatura_modulo_assinadoEm_idx" ON "log_assinatura"("modulo", "assinadoEm");

-- AddForeignKey
ALTER TABLE "usuario_sessao" ADD CONSTRAINT "usuario_sessao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacao_redefinicao_senha" ADD CONSTRAINT "solicitacao_redefinicao_senha_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacao_redefinicao_senha" ADD CONSTRAINT "solicitacao_redefinicao_senha_tratadoPorId_fkey" FOREIGN KEY ("tratadoPorId") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_assinatura" ADD CONSTRAINT "log_assinatura_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
