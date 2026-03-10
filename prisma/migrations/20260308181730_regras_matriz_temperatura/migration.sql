-- CreateTable
CREATE TABLE "controle_temperatura_categoria_regra" (
    "id" SERIAL NOT NULL,
    "categoriaId" INTEGER NOT NULL,
    "temperaturaMin" DOUBLE PRECISION,
    "temperaturaMax" DOUBLE PRECISION,
    "status" "StatusTemperaturaEquipamento" NOT NULL,
    "acaoCorretiva" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "controle_temperatura_categoria_regra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "controle_temperatura_categoria_regra_categoriaId_isActive_o_idx" ON "controle_temperatura_categoria_regra"("categoriaId", "isActive", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "controle_temperatura_categoria_regra_categoriaId_ordem_key" ON "controle_temperatura_categoria_regra"("categoriaId", "ordem");

-- AddForeignKey
ALTER TABLE "controle_temperatura_categoria_regra" ADD CONSTRAINT "controle_temperatura_categoria_regra_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "controle_temperatura_categoria_parametro"("id") ON DELETE CASCADE ON UPDATE CASCADE;
