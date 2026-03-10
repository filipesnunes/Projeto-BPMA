-- CreateEnum
CREATE TYPE "TipoOpcaoHigienizacao" AS ENUM ('HORTIFRUTI', 'PRODUTO_UTILIZADO');

-- CreateTable
CREATE TABLE "higienizacao_hortifruti_opcao" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoOpcaoHigienizacao" NOT NULL,
    "nome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "higienizacao_hortifruti_opcao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "higienizacao_hortifruti_opcao_tipo_idx" ON "higienizacao_hortifruti_opcao"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "higienizacao_hortifruti_opcao_tipo_nome_key" ON "higienizacao_hortifruti_opcao"("tipo", "nome");
