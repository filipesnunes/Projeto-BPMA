-- CreateEnum
CREATE TYPE "StatusNotaRecebimento" AS ENUM ('PENDENTE', 'FINALIZADA');

-- AlterTable
ALTER TABLE "rastreabilidade_recebimento_registro" ADD COLUMN     "notaId" INTEGER;

-- CreateTable
CREATE TABLE "rastreabilidade_recebimento_nota" (
    "id" SERIAL NOT NULL,
    "data" DATE NOT NULL,
    "fornecedor" TEXT NOT NULL,
    "notaFiscal" TEXT NOT NULL,
    "statusNota" "StatusNotaRecebimento" NOT NULL DEFAULT 'PENDENTE',
    "responsavelGeral" TEXT,
    "origemXml" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rastreabilidade_recebimento_nota_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rastreabilidade_recebimento_nota_data_idx" ON "rastreabilidade_recebimento_nota"("data");

-- CreateIndex
CREATE INDEX "rastreabilidade_recebimento_nota_fornecedor_idx" ON "rastreabilidade_recebimento_nota"("fornecedor");

-- CreateIndex
CREATE INDEX "rastreabilidade_recebimento_nota_notaFiscal_idx" ON "rastreabilidade_recebimento_nota"("notaFiscal");

-- CreateIndex
CREATE INDEX "rastreabilidade_recebimento_nota_statusNota_idx" ON "rastreabilidade_recebimento_nota"("statusNota");

-- CreateIndex
CREATE INDEX "rastreabilidade_recebimento_registro_notaId_idx" ON "rastreabilidade_recebimento_registro"("notaId");

-- AddForeignKey
ALTER TABLE "rastreabilidade_recebimento_registro" ADD CONSTRAINT "rastreabilidade_recebimento_registro_notaId_fkey" FOREIGN KEY ("notaId") REFERENCES "rastreabilidade_recebimento_nota"("id") ON DELETE CASCADE ON UPDATE CASCADE;
