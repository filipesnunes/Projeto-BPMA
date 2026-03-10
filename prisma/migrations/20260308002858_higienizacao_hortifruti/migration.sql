-- CreateEnum
CREATE TYPE "StatusFechamentoHortifruti" AS ENUM ('ABERTO', 'ASSINADO');

-- CreateTable
CREATE TABLE "RegistroInicial" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistroInicial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "higienizacao_hortifruti" (
    "id" SERIAL NOT NULL,
    "data" DATE NOT NULL,
    "hortifruti" TEXT NOT NULL,
    "produtoUtilizado" TEXT NOT NULL,
    "inicioProcesso" TEXT NOT NULL,
    "terminoProcesso" TEXT NOT NULL,
    "duracaoMinutos" INTEGER NOT NULL,
    "responsavel" TEXT NOT NULL,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "higienizacao_hortifruti_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "higienizacao_hortifruti_fechamento" (
    "id" SERIAL NOT NULL,
    "mes" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "responsavelTecnico" TEXT NOT NULL,
    "dataAssinatura" DATE NOT NULL,
    "status" "StatusFechamentoHortifruti" NOT NULL DEFAULT 'ABERTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "higienizacao_hortifruti_fechamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "higienizacao_hortifruti_data_idx" ON "higienizacao_hortifruti"("data");

-- CreateIndex
CREATE INDEX "higienizacao_hortifruti_hortifruti_idx" ON "higienizacao_hortifruti"("hortifruti");

-- CreateIndex
CREATE INDEX "higienizacao_hortifruti_responsavel_idx" ON "higienizacao_hortifruti"("responsavel");

-- CreateIndex
CREATE UNIQUE INDEX "higienizacao_hortifruti_fechamento_mes_ano_key" ON "higienizacao_hortifruti_fechamento"("mes", "ano");
