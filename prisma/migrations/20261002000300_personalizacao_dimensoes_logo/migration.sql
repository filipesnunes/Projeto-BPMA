ALTER TABLE "personalizacao_visual"
ADD COLUMN "logoLargura" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN "logoAlturaMaxima" INTEGER NOT NULL DEFAULT 56;

ALTER TABLE "personalizacao_visual"
ADD CONSTRAINT "personalizacao_visual_logo_largura" CHECK ("logoLargura" BETWEEN 40 AND 240),
ADD CONSTRAINT "personalizacao_visual_logo_altura" CHECK ("logoAlturaMaxima" BETWEEN 24 AND 120);
