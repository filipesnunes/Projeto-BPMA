BEGIN;
-- CreateTable
CREATE TABLE "fluxo_operacional" (
    "id" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "dataReferencia" DATE NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDENTE',
    "versao" INTEGER NOT NULL DEFAULT 1,
    "assinaturaVigenteId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fluxo_operacional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fluxo_versao" (
    "fluxoId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "dados" JSONB NOT NULL,
    "rascunho" JSONB NOT NULL,
    "completo" BOOLEAN NOT NULL,
    "resolvidos" INTEGER NOT NULL,
    "obrigatorios" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "usuarioNome" TEXT NOT NULL,
    "usuarioPerfil" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fluxo_versao_pkey" PRIMARY KEY ("fluxoId","versao")
);

-- CreateTable
CREATE TABLE "fluxo_assinatura" (
    "id" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "mecanismo" TEXT NOT NULL,
    "referencia" TEXT NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "usuarioNome" TEXT NOT NULL,
    "usuarioPerfil" TEXT NOT NULL,
    "assinadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fluxo_assinatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fluxo_assinatura_vinculo" (
    "assinaturaId" TEXT NOT NULL,
    "fluxoId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,

    CONSTRAINT "fluxo_assinatura_vinculo_pkey" PRIMARY KEY ("assinaturaId","fluxoId")
);

-- CreateTable
CREATE TABLE "fluxo_evento" (
    "id" TEXT NOT NULL,
    "fluxoId" TEXT NOT NULL,
    "operacao" TEXT NOT NULL,
    "estadoAnterior" TEXT,
    "estadoNovo" TEXT NOT NULL,
    "versaoAnterior" INTEGER,
    "versaoNova" INTEGER NOT NULL,
    "assinaturaId" TEXT,
    "justificativa" TEXT,
    "usuarioId" INTEGER NOT NULL,
    "usuarioNome" TEXT NOT NULL,
    "usuarioPerfil" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fluxo_evento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fluxo_operacional_modulo_estado_dataReferencia_idx" ON "fluxo_operacional"("modulo", "estado", "dataReferencia");

-- CreateIndex
CREATE UNIQUE INDEX "fluxo_operacional_modulo_chave_key" ON "fluxo_operacional"("modulo", "chave");

-- CreateIndex
CREATE INDEX "fluxo_assinatura_modulo_referencia_idx" ON "fluxo_assinatura"("modulo", "referencia");

-- CreateIndex
CREATE INDEX "fluxo_assinatura_vinculo_fluxoId_versao_idx" ON "fluxo_assinatura_vinculo"("fluxoId", "versao");

-- CreateIndex
CREATE INDEX "fluxo_evento_fluxoId_criadoEm_idx" ON "fluxo_evento"("fluxoId", "criadoEm");

-- AddForeignKey
ALTER TABLE "fluxo_operacional" ADD CONSTRAINT "fluxo_operacional_assinaturaVigenteId_fkey" FOREIGN KEY ("assinaturaVigenteId") REFERENCES "fluxo_assinatura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fluxo_versao" ADD CONSTRAINT "fluxo_versao_fluxoId_fkey" FOREIGN KEY ("fluxoId") REFERENCES "fluxo_operacional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fluxo_assinatura_vinculo" ADD CONSTRAINT "fluxo_assinatura_vinculo_assinaturaId_fkey" FOREIGN KEY ("assinaturaId") REFERENCES "fluxo_assinatura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fluxo_assinatura_vinculo" ADD CONSTRAINT "fluxo_assinatura_vinculo_fluxoId_versao_fkey" FOREIGN KEY ("fluxoId", "versao") REFERENCES "fluxo_versao"("fluxoId", "versao") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fluxo_evento" ADD CONSTRAINT "fluxo_evento_fluxoId_fkey" FOREIGN KEY ("fluxoId") REFERENCES "fluxo_operacional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE fluxo_operacional ADD CONSTRAINT fluxo_estado_valido CHECK (estado IN ('PENDENTE','COMPLETO','FECHADO','REABERTO')),
 ADD CONSTRAINT fluxo_versao_positiva CHECK (versao > 0),
 ADD CONSTRAINT fluxo_assinatura_vigente CHECK ((estado = 'FECHADO') = ("assinaturaVigenteId" IS NOT NULL)),
 ADD CONSTRAINT fluxo_modulo_valido CHECK (modulo IN ('amostras','temperatura','hortifruti','oleo','limpeza_diaria','limpeza_semanal','rastreabilidade'));
ALTER TABLE fluxo_versao ADD CONSTRAINT fluxo_progresso_valido CHECK (versao > 0 AND obrigatorios > 0 AND resolvidos >= 0 AND resolvidos <= obrigatorios AND completo = (resolvidos = obrigatorios));
-- No PerfilPermissao rows are created: permissions must be assigned explicitly.
INSERT INTO permissao (codigo,nome,grupo,modulo,acao,sensivel,"atualizadoEm")
SELECT 'modulo.' || modulo || '.reabrir_registro', 'Reabrir registro', grupo, modulo, 'reabrir_registro', true, CURRENT_TIMESTAMP
FROM (VALUES ('amostras','Amostras / Controle de Buffet'),('temperatura','Temperatura de Equipamentos'),('hortifruti','Higienização de Hortifruti'),('oleo','Qualidade do Óleo'),('limpeza_diaria','Plano de Limpeza Diário'),('limpeza_semanal','Plano de Limpeza Semanal'),('rastreabilidade','Rastreabilidade')) AS p(modulo,grupo)
ON CONFLICT (codigo) DO NOTHING;

-- Evidence is append-only. Reopening changes only the current pointer and adds events.
CREATE FUNCTION fluxo_evidencia_imutavel() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Evidência operacional é imutável'; END;
$$;
CREATE TRIGGER fluxo_versao_imutavel BEFORE UPDATE OR DELETE ON fluxo_versao FOR EACH ROW EXECUTE FUNCTION fluxo_evidencia_imutavel();
CREATE TRIGGER fluxo_assinatura_imutavel BEFORE UPDATE OR DELETE ON fluxo_assinatura FOR EACH ROW EXECUTE FUNCTION fluxo_evidencia_imutavel();
CREATE TRIGGER fluxo_vinculo_imutavel BEFORE UPDATE OR DELETE ON fluxo_assinatura_vinculo FOR EACH ROW EXECUTE FUNCTION fluxo_evidencia_imutavel();
CREATE TRIGGER fluxo_evento_imutavel BEFORE UPDATE OR DELETE ON fluxo_evento FOR EACH ROW EXECUTE FUNCTION fluxo_evidencia_imutavel();
CREATE FUNCTION fluxo_validar_fechamento() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.estado = 'FECHADO' AND NOT EXISTS (
  SELECT 1 FROM fluxo_assinatura_vinculo v JOIN fluxo_assinatura s ON s.id=v."assinaturaId"
  JOIN fluxo_versao r ON r."fluxoId"=v."fluxoId" AND r.versao=v.versao
  WHERE v."fluxoId"=NEW.id AND v.versao=NEW.versao AND v."assinaturaId"=NEW."assinaturaVigenteId" AND s.modulo=NEW.modulo AND r.completo
 ) THEN RAISE EXCEPTION 'Fechamento exige assinatura da versão completa vigente'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER fluxo_fechamento_valido BEFORE INSERT OR UPDATE ON fluxo_operacional FOR EACH ROW EXECUTE FUNCTION fluxo_validar_fechamento();
COMMIT;

