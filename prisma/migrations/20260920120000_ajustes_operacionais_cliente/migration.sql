-- Preserve snapshots and existing records. Apply only through the release flow.
ALTER TABLE "higienizacao_hortifruti_opcao" ADD COLUMN "ativo" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "controle_qualidade_oleo_registro" ALTER COLUMN "status" DROP NOT NULL;

-- One-time retirement requested by the client; future retirements use the catalog UI.
UPDATE "higienizacao_hortifruti_opcao"
SET "ativo" = false, "updatedAt" = CURRENT_TIMESTAMP
WHERE "tipo" = 'PRODUTO_UTILIZADO'
  AND lower(trim("nome")) = lower('Antimicrobial Fruit & Vegetable Treatment');
