-- CreateTable
CREATE TABLE "plano_limpeza_diario_area" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "turnoManha" BOOLEAN NOT NULL DEFAULT true,
    "turnoTarde" BOOLEAN NOT NULL DEFAULT true,
    "turnoNoite" BOOLEAN NOT NULL DEFAULT true,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plano_limpeza_diario_area_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plano_limpeza_diario_area_nome_key" ON "plano_limpeza_diario_area"("nome");

-- CreateIndex
CREATE INDEX "plano_limpeza_diario_area_ativo_ordem_nome_idx" ON "plano_limpeza_diario_area"("ativo", "ordem", "nome");
