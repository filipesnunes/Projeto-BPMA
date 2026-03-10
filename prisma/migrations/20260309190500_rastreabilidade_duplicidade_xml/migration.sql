-- AlterTable
ALTER TABLE "rastreabilidade_recebimento_nota"
ADD COLUMN "chaveNfe" TEXT,
ADD COLUMN "cnpjFornecedor" TEXT,
ADD COLUMN "serieNota" TEXT,
ADD COLUMN "identificadorFiscal" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "rastreabilidade_recebimento_nota_chaveNfe_key" ON "rastreabilidade_recebimento_nota"("chaveNfe");

-- CreateIndex
CREATE UNIQUE INDEX "rastreabilidade_recebimento_nota_identificadorFiscal_key" ON "rastreabilidade_recebimento_nota"("identificadorFiscal");

-- CreateIndex
CREATE INDEX "rastreabilidade_recebimento_nota_cnpjFornecedor_idx" ON "rastreabilidade_recebimento_nota"("cnpjFornecedor");

-- CreateIndex
CREATE INDEX "rastreabilidade_recebimento_nota_serieNota_idx" ON "rastreabilidade_recebimento_nota"("serieNota");

-- CreateIndex
CREATE INDEX "rastreabilidade_recebimento_nota_notaFiscal_cnpjFornecedor_serieNota_idx" ON "rastreabilidade_recebimento_nota"("notaFiscal", "cnpjFornecedor", "serieNota");