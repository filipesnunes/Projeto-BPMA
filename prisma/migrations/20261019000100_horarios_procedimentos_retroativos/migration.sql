-- Preserve all existing values, signatures and audit timestamps. No data backfill.
BEGIN;
ALTER TABLE "controle_temperatura_equipamentos"
  ADD COLUMN "horarioAfericao" VARCHAR(5),
  ADD COLUMN "horarioNaoInformado" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "justificativaHorario" TEXT;

ALTER TABLE "higienizacao_hortifruti"
  ALTER COLUMN "inicioProcesso" DROP NOT NULL,
  ALTER COLUMN "terminoProcesso" DROP NOT NULL,
  ALTER COLUMN "duracaoMinutos" DROP NOT NULL,
  ADD COLUMN "horarioNaoInformado" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "justificativaHorario" TEXT;

ALTER TABLE "controle_temperatura_equipamentos"
  ADD CONSTRAINT "temperatura_horario_formato" CHECK ("horarioAfericao" IS NULL OR "horarioAfericao" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD CONSTRAINT "temperatura_horario_justificado" CHECK (NOT "horarioNaoInformado" OR ("horarioAfericao" IS NULL AND NULLIF(BTRIM("justificativaHorario"), '') IS NOT NULL));
ALTER TABLE "higienizacao_hortifruti"
  ADD CONSTRAINT "hortifruti_horario_justificado" CHECK (NOT "horarioNaoInformado" OR ("inicioProcesso" IS NULL AND "terminoProcesso" IS NULL AND "duracaoMinutos" IS NULL AND NULLIF(BTRIM("justificativaHorario"), '') IS NOT NULL));
COMMIT;
