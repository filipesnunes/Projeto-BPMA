CREATE TABLE "personalizacao_visual" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "nomeUnidade" VARCHAR(120),
    "logoDados" BYTEA,
    "logoMimeType" TEXT,
    "logoNomeArquivo" TEXT,
    "atualizadoPorUsuarioId" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "personalizacao_visual_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "personalizacao_visual_singleton" CHECK ("id" = 1),
    CONSTRAINT "personalizacao_visual_logo_tamanho" CHECK (octet_length("logoDados") <= 2097152)
);

ALTER TABLE "personalizacao_visual" ADD CONSTRAINT "personalizacao_visual_atualizadoPorUsuarioId_fkey"
FOREIGN KEY ("atualizadoPorUsuarioId") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
