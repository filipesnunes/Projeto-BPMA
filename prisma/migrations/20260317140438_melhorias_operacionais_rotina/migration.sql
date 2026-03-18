-- CreateEnum
CREATE TYPE "OrigemChamadoManutencao" AS ENUM ('TEMPERATURA', 'LIMPEZA', 'OLEO', 'RECEBIMENTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "PrioridadeChamadoManutencao" AS ENUM ('BAIXA', 'MEDIA', 'ALTA');

-- CreateEnum
CREATE TYPE "StatusChamadoManutencao" AS ENUM ('ABERTO', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StatusNotaRecebimento" ADD VALUE 'IMPORTADA';
ALTER TYPE "StatusNotaRecebimento" ADD VALUE 'EM_CONFERENCIA';

-- AlterEnum
ALTER TYPE "StatusQualidadeOleo" ADD VALUE 'SEM_UTILIZACAO';

-- AlterTable
ALTER TABLE "controle_qualidade_oleo_registro" ADD COLUMN     "semUtilizacao" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "fitaOleo" DROP NOT NULL,
ALTER COLUMN "temperatura" DROP NOT NULL;

-- AlterTable
ALTER TABLE "controle_temperatura_equipamentos" ADD COLUMN     "fotoBase64" TEXT,
ADD COLUMN     "fotoMimeType" TEXT,
ADD COLUMN     "fotoNome" TEXT;

-- AlterTable
ALTER TABLE "plano_limpeza_diario_registro" ADD COLUMN     "observacaoResponsavel" TEXT,
ADD COLUMN     "observacaoSupervisor" TEXT;

-- AlterTable
ALTER TABLE "plano_limpeza_semanal_execucao" ADD COLUMN     "observacaoResponsavel" TEXT,
ADD COLUMN     "observacaoSupervisor" TEXT;

-- CreateTable
CREATE TABLE "chamado_manutencao" (
    "id" SERIAL NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "areaLocal" TEXT NOT NULL,
    "origem" "OrigemChamadoManutencao" NOT NULL,
    "prioridade" "PrioridadeChamadoManutencao" NOT NULL DEFAULT 'MEDIA',
    "status" "StatusChamadoManutencao" NOT NULL DEFAULT 'ABERTO',
    "contextoModulo" TEXT,
    "contextoRegistroId" TEXT,
    "fotoNome" TEXT,
    "fotoMimeType" TEXT,
    "fotoBase64" TEXT,
    "criadoPorId" INTEGER NOT NULL,
    "criadoPorNome" TEXT NOT NULL,
    "assinaturaAberturaUsuarioId" INTEGER NOT NULL,
    "assinaturaAberturaNomeUsuario" TEXT NOT NULL,
    "assinaturaAberturaPerfil" "PerfilUsuario" NOT NULL,
    "assinaturaAberturaDataHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataHoraCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataHoraConclusao" TIMESTAMP(3),
    "observacaoConclusao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chamado_manutencao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chamado_manutencao_status_dataHoraCriacao_idx" ON "chamado_manutencao"("status", "dataHoraCriacao");

-- CreateIndex
CREATE INDEX "chamado_manutencao_origem_status_idx" ON "chamado_manutencao"("origem", "status");

-- CreateIndex
CREATE INDEX "chamado_manutencao_areaLocal_idx" ON "chamado_manutencao"("areaLocal");

-- CreateIndex
CREATE INDEX "chamado_manutencao_criadoPorId_idx" ON "chamado_manutencao"("criadoPorId");

-- AddForeignKey
ALTER TABLE "chamado_manutencao" ADD CONSTRAINT "chamado_manutencao_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
