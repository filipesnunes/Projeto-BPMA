-- CreateEnum
CREATE TYPE "TurnoTemperaturaEquipamento" AS ENUM ('MANHA', 'TARDE');

-- CreateEnum
CREATE TYPE "StatusTemperaturaEquipamento" AS ENUM ('CONFORME', 'ALERTA', 'CRITICO');

-- CreateEnum
CREATE TYPE "StatusFechamentoTemperaturaEquipamento" AS ENUM ('ABERTO', 'ASSINADO');

-- CreateEnum
CREATE TYPE "TipoOpcaoTemperaturaEquipamento" AS ENUM ('EQUIPAMENTO', 'ACAO_CORRETIVA');

-- CreateEnum
CREATE TYPE "CategoriaEquipamentoTemperatura" AS ENUM ('REFRIGERACAO', 'CONGELAMENTO', 'QUENTE');

-- CreateTable
CREATE TABLE "controle_temperatura_equipamentos" (
    "id" SERIAL NOT NULL,
    "data" DATE NOT NULL,
    "equipamento" TEXT NOT NULL,
    "categoriaEquipamento" "CategoriaEquipamentoTemperatura" NOT NULL,
    "turno" "TurnoTemperaturaEquipamento" NOT NULL,
    "temperaturaAferida" DOUBLE PRECISION NOT NULL,
    "status" "StatusTemperaturaEquipamento" NOT NULL,
    "acaoCorretiva" TEXT,
    "responsavel" TEXT NOT NULL,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "controle_temperatura_equipamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "controle_temperatura_equipamentos_fechamento" (
    "id" SERIAL NOT NULL,
    "mes" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "responsavelTecnico" TEXT NOT NULL,
    "dataAssinatura" TIMESTAMP(3) NOT NULL,
    "status" "StatusFechamentoTemperaturaEquipamento" NOT NULL DEFAULT 'ABERTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "controle_temperatura_equipamentos_fechamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "controle_temperatura_equipamentos_opcao" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoOpcaoTemperaturaEquipamento" NOT NULL,
    "nome" TEXT NOT NULL,
    "categoriaEquipamento" "CategoriaEquipamentoTemperatura",
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "controle_temperatura_equipamentos_opcao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "controle_temperatura_equipamentos_data_idx" ON "controle_temperatura_equipamentos"("data");

-- CreateIndex
CREATE INDEX "controle_temperatura_equipamentos_equipamento_idx" ON "controle_temperatura_equipamentos"("equipamento");

-- CreateIndex
CREATE INDEX "controle_temperatura_equipamentos_status_idx" ON "controle_temperatura_equipamentos"("status");

-- CreateIndex
CREATE INDEX "controle_temperatura_equipamentos_responsavel_idx" ON "controle_temperatura_equipamentos"("responsavel");

-- CreateIndex
CREATE UNIQUE INDEX "controle_temperatura_equipamentos_fechamento_mes_ano_key" ON "controle_temperatura_equipamentos_fechamento"("mes", "ano");

-- CreateIndex
CREATE INDEX "controle_temperatura_equipamentos_opcao_tipo_ativo_idx" ON "controle_temperatura_equipamentos_opcao"("tipo", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "controle_temperatura_equipamentos_opcao_tipo_nome_key" ON "controle_temperatura_equipamentos_opcao"("tipo", "nome");
