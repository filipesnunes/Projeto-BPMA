BEGIN;
ALTER TABLE "controle_qualidade_oleo_registro" ADD COLUMN "fluxoId" TEXT;
CREATE UNIQUE INDEX "controle_qualidade_oleo_registro_fluxoId_key" ON "controle_qualidade_oleo_registro"("fluxoId");
ALTER TABLE "controle_qualidade_oleo_registro" ADD CONSTRAINT "controle_qualidade_oleo_registro_fluxoId_fkey" FOREIGN KEY ("fluxoId") REFERENCES "fluxo_operacional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
