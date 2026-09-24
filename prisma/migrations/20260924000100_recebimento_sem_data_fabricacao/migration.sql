-- Explicit decision made during receiving/checking; do not infer from old null dates.
ALTER TABLE "rastreabilidade_recebimento_registro"
ADD COLUMN "semDataFabricacao" BOOLEAN NOT NULL DEFAULT false;
