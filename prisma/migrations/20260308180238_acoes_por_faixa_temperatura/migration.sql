-- AlterTable
ALTER TABLE "controle_temperatura_categoria_parametro" ADD COLUMN     "acaoAlerta" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "acaoCritica" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "acaoIdeal" TEXT NOT NULL DEFAULT '';
