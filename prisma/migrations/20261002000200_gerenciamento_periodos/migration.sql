ALTER TABLE "fechamento_mensal_modulo"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'FECHADO',
ADD COLUMN "reabertoEm" TIMESTAMP(3),
ADD COLUMN "reabertoPorUsuarioId" INTEGER,
ADD COLUMN "reabertoPorNome" TEXT;

-- A legacy closure stores a name and timestamp, but does not identify the signer's profile.
ALTER TABLE "fechamento_mensal_modulo" ALTER COLUMN "usuarioPerfilSnapshot" DROP NOT NULL;

ALTER TABLE "fechamento_mensal_modulo" ADD CONSTRAINT "fechamento_mensal_status_valido"
CHECK ("status" IN ('FECHADO', 'REABERTO'));

CREATE UNIQUE INDEX "fechamento_mensal_um_reaberto_por_modulo"
ON "fechamento_mensal_modulo" ("moduloCodigo") WHERE "status" = 'REABERTO';
