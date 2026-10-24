BEGIN;
-- AlterTable
ALTER TABLE "controle_temperatura_equipamentos" ADD COLUMN     "fluxoId" TEXT;

-- AlterTable
ALTER TABLE "fluxo_operacional" ADD COLUMN     "excluidoEm" TIMESTAMP(3),
ADD COLUMN     "preenchimentoCompleto" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "controle_temperatura_equipamentos_fluxoId_key" ON "controle_temperatura_equipamentos"("fluxoId");

-- AddForeignKey
ALTER TABLE "controle_temperatura_equipamentos" ADD CONSTRAINT "controle_temperatura_equipamentos_fluxoId_fkey" FOREIGN KEY ("fluxoId") REFERENCES "fluxo_operacional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE fluxo_operacional f SET "preenchimentoCompleto" = v.completo FROM fluxo_versao v WHERE v."fluxoId"=f.id AND v.versao=f.versao;
COMMIT;
