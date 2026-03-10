-- CreateEnum
CREATE TYPE "StatusQualidadeOleo" AS ENUM ('ADEQUADO', 'ATENCAO', 'ULTIMA_UTILIZACAO', 'DESCARTAR');

-- CreateEnum
CREATE TYPE "StatusFechamentoQualidadeOleo" AS ENUM ('ABERTO', 'ASSINADO');

-- CreateTable
CREATE TABLE "controle_qualidade_oleo_registro" (
    "id" SERIAL NOT NULL,
    "data" DATE NOT NULL,
    "fitaOleo" TEXT NOT NULL,
    "temperatura" DOUBLE PRECISION NOT NULL,
    "status" "StatusQualidadeOleo" NOT NULL,
    "orientacao" TEXT NOT NULL,
    "responsavel" TEXT NOT NULL,
    "observacao" TEXT,
    "temperaturaCritica" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "controle_qualidade_oleo_registro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "controle_qualidade_oleo_fechamento" (
    "id" SERIAL NOT NULL,
    "mes" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "responsavelTecnico" TEXT NOT NULL,
    "dataAssinatura" TIMESTAMP(3) NOT NULL,
    "status" "StatusFechamentoQualidadeOleo" NOT NULL DEFAULT 'ABERTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "controle_qualidade_oleo_fechamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "controle_qualidade_oleo_opcao_fita" (
    "id" SERIAL NOT NULL,
    "rotulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "statusAssociado" "StatusQualidadeOleo" NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 1,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "controle_qualidade_oleo_opcao_fita_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "controle_qualidade_oleo_registro_data_idx" ON "controle_qualidade_oleo_registro"("data");

-- CreateIndex
CREATE INDEX "controle_qualidade_oleo_registro_fitaOleo_idx" ON "controle_qualidade_oleo_registro"("fitaOleo");

-- CreateIndex
CREATE INDEX "controle_qualidade_oleo_registro_status_idx" ON "controle_qualidade_oleo_registro"("status");

-- CreateIndex
CREATE INDEX "controle_qualidade_oleo_registro_responsavel_idx" ON "controle_qualidade_oleo_registro"("responsavel");

-- CreateIndex
CREATE UNIQUE INDEX "controle_qualidade_oleo_fechamento_mes_ano_key" ON "controle_qualidade_oleo_fechamento"("mes", "ano");

-- CreateIndex
CREATE INDEX "controle_qualidade_oleo_opcao_fita_ativo_ordem_idx" ON "controle_qualidade_oleo_opcao_fita"("ativo", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "controle_qualidade_oleo_opcao_fita_rotulo_key" ON "controle_qualidade_oleo_opcao_fita"("rotulo");
