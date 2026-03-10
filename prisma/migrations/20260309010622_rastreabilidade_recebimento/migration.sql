-- CreateEnum
CREATE TYPE "ConformidadeRecebimento" AS ENUM ('CONFORME', 'NAO_CONFORME');

-- CreateEnum
CREATE TYPE "StatusRecebimento" AS ENUM ('PENDENTE', 'CONFORME', 'NAO_CONFORME');

-- CreateEnum
CREATE TYPE "StatusFechamentoRastreabilidadeRecebimento" AS ENUM ('ABERTO', 'ASSINADO');

-- CreateTable
CREATE TABLE "rastreabilidade_recebimento_categoria" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "temperaturaMaxima" DOUBLE PRECISION NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rastreabilidade_recebimento_categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rastreabilidade_recebimento_registro" (
    "id" SERIAL NOT NULL,
    "data" DATE NOT NULL,
    "produto" TEXT NOT NULL,
    "fornecedor" TEXT NOT NULL,
    "notaFiscal" TEXT NOT NULL,
    "lote" TEXT,
    "dataFabricacao" DATE,
    "dataValidade" DATE,
    "sif" TEXT,
    "temperatura" DOUBLE PRECISION,
    "temperaturaStatus" "ConformidadeRecebimento",
    "transporteEntregador" "ConformidadeRecebimento",
    "aspectoSensorial" "ConformidadeRecebimento",
    "embalagem" "ConformidadeRecebimento",
    "acaoCorretiva" TEXT,
    "responsavelRecebimento" TEXT,
    "observacoes" TEXT,
    "statusGeral" "StatusRecebimento" NOT NULL DEFAULT 'PENDENTE',
    "origemXml" BOOLEAN NOT NULL DEFAULT false,
    "categoriaId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rastreabilidade_recebimento_registro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rastreabilidade_recebimento_fechamento" (
    "id" SERIAL NOT NULL,
    "mes" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "responsavelTecnico" TEXT NOT NULL,
    "dataAssinatura" TIMESTAMP(3) NOT NULL,
    "status" "StatusFechamentoRastreabilidadeRecebimento" NOT NULL DEFAULT 'ABERTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rastreabilidade_recebimento_fechamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rastreabilidade_recebimento_categoria_ativo_nome_idx" ON "rastreabilidade_recebimento_categoria"("ativo", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "rastreabilidade_recebimento_categoria_nome_key" ON "rastreabilidade_recebimento_categoria"("nome");

-- CreateIndex
CREATE INDEX "rastreabilidade_recebimento_registro_data_idx" ON "rastreabilidade_recebimento_registro"("data");

-- CreateIndex
CREATE INDEX "rastreabilidade_recebimento_registro_produto_idx" ON "rastreabilidade_recebimento_registro"("produto");

-- CreateIndex
CREATE INDEX "rastreabilidade_recebimento_registro_fornecedor_idx" ON "rastreabilidade_recebimento_registro"("fornecedor");

-- CreateIndex
CREATE INDEX "rastreabilidade_recebimento_registro_notaFiscal_idx" ON "rastreabilidade_recebimento_registro"("notaFiscal");

-- CreateIndex
CREATE INDEX "rastreabilidade_recebimento_registro_statusGeral_idx" ON "rastreabilidade_recebimento_registro"("statusGeral");

-- CreateIndex
CREATE INDEX "rastreabilidade_recebimento_registro_responsavelRecebimento_idx" ON "rastreabilidade_recebimento_registro"("responsavelRecebimento");

-- CreateIndex
CREATE INDEX "rastreabilidade_recebimento_registro_categoriaId_idx" ON "rastreabilidade_recebimento_registro"("categoriaId");

-- CreateIndex
CREATE UNIQUE INDEX "rastreabilidade_recebimento_fechamento_mes_ano_key" ON "rastreabilidade_recebimento_fechamento"("mes", "ano");

-- AddForeignKey
ALTER TABLE "rastreabilidade_recebimento_registro" ADD CONSTRAINT "rastreabilidade_recebimento_registro_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "rastreabilidade_recebimento_categoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;
