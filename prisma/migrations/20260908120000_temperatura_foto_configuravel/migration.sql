-- Preserve the current requirement for existing module configurations.
ALTER TABLE "modulo_configuracao"
ADD COLUMN "exigirFotoEmAlertaCritico" BOOLEAN NOT NULL DEFAULT true;
