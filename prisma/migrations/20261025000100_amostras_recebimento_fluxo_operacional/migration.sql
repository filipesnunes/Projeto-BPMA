BEGIN;
ALTER TABLE controle_buffet_amostra_registro ADD COLUMN "fluxoId" TEXT;
ALTER TABLE rastreabilidade_recebimento_nota ADD COLUMN "fluxoId" TEXT, ADD COLUMN "xmlOriginal" TEXT;
ALTER TABLE controle_buffet_amostra_registro ADD CONSTRAINT controle_buffet_amostra_registro_fluxoId_fkey FOREIGN KEY ("fluxoId") REFERENCES fluxo_operacional(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE rastreabilidade_recebimento_nota ADD CONSTRAINT rastreabilidade_recebimento_nota_fluxoId_fkey FOREIGN KEY ("fluxoId") REFERENCES fluxo_operacional(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX rastreabilidade_recebimento_nota_fluxoId_key ON rastreabilidade_recebimento_nota("fluxoId");
CREATE INDEX controle_buffet_amostra_registro_fluxoId_idx ON controle_buffet_amostra_registro("fluxoId");
-- Guard every legacy/alternate write path at the database boundary. Only reviewed
-- domain adapters set this transaction-local capability after workflow authorization.
CREATE FUNCTION bpma_guard_group_workflow() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE flow_id TEXT; module_code TEXT; row_data JSONB; state_value TEXT;
BEGIN
 row_data := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 IF TG_TABLE_NAME='controle_buffet_amostra_registro' THEN
   module_code := 'amostras';
   PERFORM pg_advisory_xact_lock(hashtext(module_code),17326);
   SELECT id INTO flow_id FROM fluxo_operacional WHERE modulo=module_code AND chave=(row_data->>'servicoId')||':'||(row_data->>'data')::date::text;
   IF flow_id IS NOT NULL AND row_data->>'fluxoId' IS DISTINCT FROM flow_id THEN RAISE EXCEPTION 'Use o fluxo versionado do serviço'; END IF;
 ELSIF TG_TABLE_NAME='rastreabilidade_recebimento_nota' THEN
   module_code := 'rastreabilidade'; flow_id := row_data->>'fluxoId';
 ELSE
   module_code := 'rastreabilidade';
   SELECT "fluxoId" INTO flow_id FROM rastreabilidade_recebimento_nota WHERE id=(row_data->>'notaId')::integer;
 END IF;
 IF TG_OP='UPDATE' THEN
   IF TG_TABLE_NAME='rastreabilidade_recebimento_registro' THEN
   IF OLD."notaId" IS DISTINCT FROM NEW."notaId" AND EXISTS (SELECT 1 FROM rastreabilidade_recebimento_nota WHERE id IN (OLD."notaId",NEW."notaId") AND "fluxoId" IS NOT NULL) THEN RAISE EXCEPTION 'O recebimento do item é imutável'; END IF; END IF;
   IF TG_TABLE_NAME='controle_buffet_amostra_registro' THEN
   IF (OLD."servicoId" IS DISTINCT FROM NEW."servicoId" OR OLD.data IS DISTINCT FROM NEW.data OR OLD."fluxoId" IS DISTINCT FROM NEW."fluxoId") AND OLD."fluxoId" IS NOT NULL THEN RAISE EXCEPTION 'A identidade do serviço é imutável'; END IF; END IF;
 END IF;
 IF TG_TABLE_NAME='controle_buffet_amostra_registro' AND row_data->>'fluxoId' IS NOT NULL AND flow_id IS NULL THEN RAISE EXCEPTION 'Vínculo incompatível com o serviço'; END IF;
 IF flow_id IS NOT NULL THEN
   PERFORM pg_advisory_xact_lock(hashtext(module_code),17326);
   SELECT estado INTO state_value FROM fluxo_operacional WHERE id=flow_id AND modulo=module_code;
   IF state_value IS NULL OR state_value='FECHADO' OR current_setting('bpma.workflow_flow',true) IS DISTINCT FROM flow_id THEN
     RAISE EXCEPTION 'Registro protegido: use a versão atual e reabertura autorizada';
   END IF;
   IF TG_OP='UPDATE' AND TG_TABLE_NAME<>'rastreabilidade_recebimento_registro' AND to_jsonb(OLD)->>'fluxoId' IS DISTINCT FROM row_data->>'fluxoId' THEN
     RAISE EXCEPTION 'O vínculo operacional é imutável';
   END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER bpma_buffet_workflow_guard BEFORE INSERT OR UPDATE OR DELETE ON controle_buffet_amostra_registro FOR EACH ROW EXECUTE FUNCTION bpma_guard_group_workflow();
CREATE TRIGGER bpma_receiving_workflow_guard BEFORE INSERT OR UPDATE OR DELETE ON rastreabilidade_recebimento_nota FOR EACH ROW EXECUTE FUNCTION bpma_guard_group_workflow();
CREATE TRIGGER bpma_receiving_item_workflow_guard BEFORE INSERT OR UPDATE OR DELETE ON rastreabilidade_recebimento_registro FOR EACH ROW EXECUTE FUNCTION bpma_guard_group_workflow();
COMMIT;
