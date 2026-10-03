ALTER TABLE "personalizacao_visual"
ADD COLUMN "corPrimaria" VARCHAR(7),
ADD COLUMN "corSecundaria" VARCHAR(7),
ADD COLUMN "corDestaque" VARCHAR(7),
ADD COLUMN "fonteAplicativo" TEXT NOT NULL DEFAULT 'SISTEMA',
ADD COLUMN "tamanhoTexto" TEXT NOT NULL DEFAULT 'PADRAO',
ADD COLUMN "temaPadrao" TEXT NOT NULL DEFAULT 'CLARO';

ALTER TABLE "personalizacao_visual"
ADD CONSTRAINT "personalizacao_cores_validas" CHECK (
  ("corPrimaria" IS NULL OR "corPrimaria" ~ '^#[0-9a-fA-F]{6}$') AND
  ("corSecundaria" IS NULL OR "corSecundaria" ~ '^#[0-9a-fA-F]{6}$') AND
  ("corDestaque" IS NULL OR "corDestaque" ~ '^#[0-9a-fA-F]{6}$')),
ADD CONSTRAINT "personalizacao_fonte_valida" CHECK ("fonteAplicativo" IN ('SISTEMA','INTER','ROBOTO','OPEN_SANS','ARIAL')),
ADD CONSTRAINT "personalizacao_texto_valido" CHECK ("tamanhoTexto" IN ('COMPACTO','PADRAO','AMPLIADO')),
ADD CONSTRAINT "personalizacao_tema_valido" CHECK ("temaPadrao" IN ('CLARO','ESCURO','AUTOMATICO'));
