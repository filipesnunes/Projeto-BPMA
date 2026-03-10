-- CreateTable
CREATE TABLE "controle_temperatura_categoria_parametro" (
    "id" SERIAL NOT NULL,
    "categoria" "CategoriaEquipamentoTemperatura" NOT NULL,
    "nome" TEXT NOT NULL,
    "temperaturaIdealMin" DOUBLE PRECISION,
    "temperaturaIdealMax" DOUBLE PRECISION,
    "temperaturaAlertaMin" DOUBLE PRECISION,
    "temperaturaAlertaMax" DOUBLE PRECISION,
    "temperaturaCriticaMin" DOUBLE PRECISION,
    "temperaturaCriticaMax" DOUBLE PRECISION,
    "orientacaoCorretivaPadrao" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "controle_temperatura_categoria_parametro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "controle_temperatura_categoria_parametro_categoria_key" ON "controle_temperatura_categoria_parametro"("categoria");

-- CreateIndex
CREATE INDEX "controle_temperatura_categoria_parametro_isActive_idx" ON "controle_temperatura_categoria_parametro"("isActive");
