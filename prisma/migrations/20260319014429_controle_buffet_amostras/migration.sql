-- CreateEnum
CREATE TYPE "ClassificacaoItemBuffetAmostra" AS ENUM ('QUENTE', 'FRIO', 'FRIO_CRU');

-- CreateEnum
CREATE TYPE "StatusItemBuffetAmostra" AS ENUM ('PENDENTE', 'PREENCHIDO', 'ASSINADO');

-- CreateEnum
CREATE TYPE "StatusTemperaturaBuffetAmostra" AS ENUM ('CONFORME', 'ALERTA', 'CRITICO');

-- CreateEnum
CREATE TYPE "StatusFechamentoBuffetAmostra" AS ENUM ('ABERTO', 'ASSINADO');

-- AlterEnum
ALTER TYPE "OrigemChamadoManutencao" ADD VALUE 'BUFFET_AMOSTRAS';

-- CreateTable
CREATE TABLE "controle_buffet_amostra_servico" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "controle_buffet_amostra_servico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "controle_buffet_amostra_item" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "classificacao" "ClassificacaoItemBuffetAmostra" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "controle_buffet_amostra_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "controle_buffet_amostra_item_servico" (
    "id" SERIAL NOT NULL,
    "servicoId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "controle_buffet_amostra_item_servico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "controle_buffet_amostra_acao_corretiva" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "controle_buffet_amostra_acao_corretiva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "controle_buffet_amostra_registro" (
    "id" SERIAL NOT NULL,
    "data" DATE NOT NULL,
    "servicoId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "itemNome" TEXT NOT NULL,
    "classificacao" "ClassificacaoItemBuffetAmostra" NOT NULL,
    "tcEquipamento" DOUBLE PRECISION,
    "primeiraTc" DOUBLE PRECISION,
    "segundaTc" DOUBLE PRECISION,
    "statusTemperatura" "StatusTemperaturaBuffetAmostra",
    "acaoCorretiva" TEXT,
    "observacao" TEXT,
    "responsavelUsuarioId" INTEGER NOT NULL,
    "responsavelNome" TEXT NOT NULL,
    "responsavelPerfil" "PerfilUsuario" NOT NULL,
    "dataHoraRegistro" TIMESTAMP(3) NOT NULL,
    "assinaturaUsuarioId" INTEGER,
    "assinaturaNome" TEXT,
    "assinaturaPerfil" "PerfilUsuario",
    "assinaturaDataHora" TIMESTAMP(3),
    "status" "StatusItemBuffetAmostra" NOT NULL DEFAULT 'PENDENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "controle_buffet_amostra_registro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "controle_buffet_amostra_fechamento" (
    "id" SERIAL NOT NULL,
    "mes" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "responsavelTecnico" TEXT NOT NULL,
    "dataAssinatura" TIMESTAMP(3) NOT NULL,
    "status" "StatusFechamentoBuffetAmostra" NOT NULL DEFAULT 'ABERTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "controle_buffet_amostra_fechamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "controle_buffet_amostra_servico_nome_key" ON "controle_buffet_amostra_servico"("nome");

-- CreateIndex
CREATE INDEX "controle_buffet_amostra_servico_ativo_ordem_nome_idx" ON "controle_buffet_amostra_servico"("ativo", "ordem", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "controle_buffet_amostra_item_nome_key" ON "controle_buffet_amostra_item"("nome");

-- CreateIndex
CREATE INDEX "controle_buffet_amostra_item_ativo_ordem_nome_idx" ON "controle_buffet_amostra_item"("ativo", "ordem", "nome");

-- CreateIndex
CREATE INDEX "controle_buffet_amostra_item_classificacao_ativo_idx" ON "controle_buffet_amostra_item"("classificacao", "ativo");

-- CreateIndex
CREATE INDEX "controle_buffet_amostra_item_servico_itemId_idx" ON "controle_buffet_amostra_item_servico"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "controle_buffet_amostra_item_servico_servicoId_itemId_key" ON "controle_buffet_amostra_item_servico"("servicoId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "controle_buffet_amostra_acao_corretiva_nome_key" ON "controle_buffet_amostra_acao_corretiva"("nome");

-- CreateIndex
CREATE INDEX "controle_buffet_amostra_acao_corretiva_ativo_ordem_nome_idx" ON "controle_buffet_amostra_acao_corretiva"("ativo", "ordem", "nome");

-- CreateIndex
CREATE INDEX "controle_buffet_amostra_registro_data_servicoId_idx" ON "controle_buffet_amostra_registro"("data", "servicoId");

-- CreateIndex
CREATE INDEX "controle_buffet_amostra_registro_status_idx" ON "controle_buffet_amostra_registro"("status");

-- CreateIndex
CREATE INDEX "controle_buffet_amostra_registro_responsavelUsuarioId_idx" ON "controle_buffet_amostra_registro"("responsavelUsuarioId");

-- CreateIndex
CREATE INDEX "controle_buffet_amostra_registro_classificacao_idx" ON "controle_buffet_amostra_registro"("classificacao");

-- CreateIndex
CREATE UNIQUE INDEX "controle_buffet_amostra_registro_data_servicoId_itemId_key" ON "controle_buffet_amostra_registro"("data", "servicoId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "controle_buffet_amostra_fechamento_mes_ano_key" ON "controle_buffet_amostra_fechamento"("mes", "ano");

-- AddForeignKey
ALTER TABLE "controle_buffet_amostra_item_servico" ADD CONSTRAINT "controle_buffet_amostra_item_servico_servicoId_fkey" FOREIGN KEY ("servicoId") REFERENCES "controle_buffet_amostra_servico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controle_buffet_amostra_item_servico" ADD CONSTRAINT "controle_buffet_amostra_item_servico_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "controle_buffet_amostra_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controle_buffet_amostra_registro" ADD CONSTRAINT "controle_buffet_amostra_registro_servicoId_fkey" FOREIGN KEY ("servicoId") REFERENCES "controle_buffet_amostra_servico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controle_buffet_amostra_registro" ADD CONSTRAINT "controle_buffet_amostra_registro_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "controle_buffet_amostra_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
