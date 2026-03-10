-- CreateEnum
CREATE TYPE "TurnoPlanoLimpeza" AS ENUM ('MANHA', 'TARDE', 'NOITE');

-- CreateEnum
CREATE TYPE "StatusPlanoLimpeza" AS ENUM ('PENDENTE', 'CONCLUIDO');

-- CreateEnum
CREATE TYPE "TipoPlanoLimpeza" AS ENUM ('DIARIO', 'SEMANAL');

-- CreateEnum
CREATE TYPE "StatusFechamentoPlanoLimpeza" AS ENUM ('ABERTO', 'ASSINADO');

-- CreateTable
CREATE TABLE "plano_limpeza_diario_registro" (
    "id" SERIAL NOT NULL,
    "data" DATE NOT NULL,
    "turno" "TurnoPlanoLimpeza" NOT NULL,
    "area" TEXT NOT NULL,
    "assinaturaResponsavel" TEXT NOT NULL,
    "assinaturaSupervisor" TEXT NOT NULL,
    "status" "StatusPlanoLimpeza" NOT NULL DEFAULT 'PENDENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plano_limpeza_diario_registro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plano_limpeza_semanal_item" (
    "id" SERIAL NOT NULL,
    "area" TEXT NOT NULL,
    "oQueLimpar" TEXT NOT NULL,
    "qualProduto" TEXT NOT NULL,
    "quando" TEXT NOT NULL,
    "quem" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plano_limpeza_semanal_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plano_limpeza_semanal_execucao" (
    "id" SERIAL NOT NULL,
    "dataExecucao" DATE NOT NULL,
    "area" TEXT NOT NULL,
    "itemId" INTEGER NOT NULL,
    "assinaturaResponsavel" TEXT NOT NULL,
    "assinaturaSupervisor" TEXT NOT NULL,
    "status" "StatusPlanoLimpeza" NOT NULL DEFAULT 'PENDENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plano_limpeza_semanal_execucao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plano_limpeza_fechamento" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoPlanoLimpeza" NOT NULL,
    "mes" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "responsavelTecnico" TEXT NOT NULL,
    "dataAssinatura" TIMESTAMP(3) NOT NULL,
    "status" "StatusFechamentoPlanoLimpeza" NOT NULL DEFAULT 'ABERTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plano_limpeza_fechamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plano_limpeza_diario_registro_data_idx" ON "plano_limpeza_diario_registro"("data");

-- CreateIndex
CREATE INDEX "plano_limpeza_diario_registro_turno_idx" ON "plano_limpeza_diario_registro"("turno");

-- CreateIndex
CREATE INDEX "plano_limpeza_diario_registro_area_idx" ON "plano_limpeza_diario_registro"("area");

-- CreateIndex
CREATE INDEX "plano_limpeza_diario_registro_status_idx" ON "plano_limpeza_diario_registro"("status");

-- CreateIndex
CREATE INDEX "plano_limpeza_diario_registro_assinaturaResponsavel_idx" ON "plano_limpeza_diario_registro"("assinaturaResponsavel");

-- CreateIndex
CREATE INDEX "plano_limpeza_semanal_item_area_idx" ON "plano_limpeza_semanal_item"("area");

-- CreateIndex
CREATE INDEX "plano_limpeza_semanal_item_ativo_area_ordem_idx" ON "plano_limpeza_semanal_item"("ativo", "area", "ordem");

-- CreateIndex
CREATE INDEX "plano_limpeza_semanal_execucao_dataExecucao_idx" ON "plano_limpeza_semanal_execucao"("dataExecucao");

-- CreateIndex
CREATE INDEX "plano_limpeza_semanal_execucao_area_idx" ON "plano_limpeza_semanal_execucao"("area");

-- CreateIndex
CREATE INDEX "plano_limpeza_semanal_execucao_status_idx" ON "plano_limpeza_semanal_execucao"("status");

-- CreateIndex
CREATE INDEX "plano_limpeza_semanal_execucao_itemId_idx" ON "plano_limpeza_semanal_execucao"("itemId");

-- CreateIndex
CREATE INDEX "plano_limpeza_semanal_execucao_assinaturaResponsavel_idx" ON "plano_limpeza_semanal_execucao"("assinaturaResponsavel");

-- CreateIndex
CREATE INDEX "plano_limpeza_fechamento_tipo_status_idx" ON "plano_limpeza_fechamento"("tipo", "status");

-- CreateIndex
CREATE UNIQUE INDEX "plano_limpeza_fechamento_tipo_mes_ano_key" ON "plano_limpeza_fechamento"("tipo", "mes", "ano");

-- AddForeignKey
ALTER TABLE "plano_limpeza_semanal_execucao" ADD CONSTRAINT "plano_limpeza_semanal_execucao_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "plano_limpeza_semanal_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "rastreabilidade_recebimento_nota_notaFiscal_cnpjFornecedor_seri" RENAME TO "rastreabilidade_recebimento_nota_notaFiscal_cnpjFornecedor__idx";
