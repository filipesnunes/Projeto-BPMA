// Isolated PostgreSQL engine; never reads DATABASE_URL.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('../.data/validation/pg-test/node_modules/@electric-sql/pglite');
(async () => {
  const db = new PGlite();
  try {
    const root = path.join(__dirname, '../prisma/migrations');
    const target = '20261024000100_nucleo_fluxo_operacional';
    const names = fs.readdirSync(root).filter(name => fs.existsSync(path.join(root, name, 'migration.sql'))).sort();
    for (const name of names.filter(name => name < target)) await db.exec(fs.readFileSync(path.join(root, name, 'migration.sql'), 'utf8'));
    await db.exec(`INSERT INTO higienizacao_hortifruti (data,hortifruti,"produtoUtilizado","inicioProcesso","terminoProcesso","duracaoMinutos",responsavel,"updatedAt") VALUES ('2026-09-18','Alface','Sanitizante','08:10','08:12',2,'Responsável antigo','2026-09-18');
      INSERT INTO assinatura_diaria_modulo ("moduloCodigo","dataReferencia","usuarioNomeSnapshot","usuarioPerfilSnapshot") VALUES ('hortifruti','2026-09-18','Supervisor antigo','GERENTE');`);
    const original = (await db.query('SELECT * FROM higienizacao_hortifruti')).rows;
    const signatures = (await db.query('SELECT * FROM assinatura_diaria_modulo')).rows;
    const grants = (await db.query('SELECT * FROM perfil_permissao')).rows;
    await db.exec(fs.readFileSync(path.join(root, target, 'migration.sql'), 'utf8'));
    assert.deepEqual((await db.query('SELECT * FROM higienizacao_hortifruti')).rows, original);
    assert.deepEqual((await db.query('SELECT * FROM assinatura_diaria_modulo')).rows, signatures);
    assert.deepEqual((await db.query('SELECT * FROM perfil_permissao')).rows, grants);
    assert.equal((await db.query("SELECT count(*)::int n FROM permissao WHERE acao='reabrir_registro'")).rows[0].n, 7);
    assert.equal((await db.query('SELECT count(*)::int n FROM fluxo_operacional')).rows[0].n, 0);
    await db.exec(`INSERT INTO fluxo_operacional (id,modulo,chave,"dataReferencia","atualizadoEm") VALUES ('A','temperatura','registro:1','2026-10-24',now());`);
    await assert.rejects(() => db.exec("UPDATE fluxo_operacional SET estado='FECHADO'"));
    await assert.rejects(() => db.exec("UPDATE fluxo_operacional SET estado='PARCIAL'"));
    await assert.rejects(() => db.exec("UPDATE fluxo_operacional SET modulo='chamados'"));
    await assert.rejects(() => db.exec('UPDATE fluxo_operacional SET versao=0'));
    await assert.rejects(() => db.exec(`INSERT INTO fluxo_operacional (id,modulo,chave,"dataReferencia","atualizadoEm") VALUES ('B','temperatura','registro:1','2026-10-24',now())`));
    await db.exec(`INSERT INTO fluxo_versao ("fluxoId",versao,dados,rascunho,completo,resolvidos,obrigatorios,"usuarioId","usuarioNome","usuarioPerfil") VALUES ('A',1,'{}','{"temperatura":""}',false,0,1,1,'Teste','DEV')`);
    await assert.rejects(() => db.exec('UPDATE fluxo_versao SET completo=true'));
    await db.exec(`INSERT INTO fluxo_assinatura (id,modulo,mecanismo,referencia,"usuarioId","usuarioNome","usuarioPerfil") VALUES ('S','temperatura','REVISAO','1',1,'Teste','DEV')`);
    await assert.rejects(() => db.exec(`INSERT INTO fluxo_assinatura_vinculo ("assinaturaId","fluxoId",versao) VALUES ('S','A',99)`));
    await assert.rejects(() => db.exec(`UPDATE fluxo_operacional SET estado='FECHADO', "assinaturaVigenteId"='S'`));
    await db.exec(`INSERT INTO fluxo_versao ("fluxoId",versao,dados,rascunho,completo,resolvidos,obrigatorios,"usuarioId","usuarioNome","usuarioPerfil") VALUES ('A',2,'{"temperatura":4}','{}',true,1,1,1,'Teste','DEV');
      INSERT INTO fluxo_assinatura_vinculo ("assinaturaId","fluxoId",versao) VALUES ('S','A',2);
      UPDATE fluxo_operacional SET versao=2,estado='FECHADO',"assinaturaVigenteId"='S';`);
    await assert.rejects(() => db.exec('DELETE FROM fluxo_assinatura_vinculo'));
    await assert.rejects(() => db.exec("UPDATE fluxo_assinatura SET referencia='modified'"));
    await assert.rejects(() => db.exec('DELETE FROM fluxo_versao'));
    const before = (await db.query('SELECT * FROM fluxo_operacional')).rows;
    await db.exec('BEGIN');
    await db.exec('UPDATE fluxo_operacional SET estado=\'REABERTO\', "assinaturaVigenteId"=NULL');
    await db.exec('ROLLBACK');
    assert.deepEqual((await db.query('SELECT * FROM fluxo_operacional')).rows, before);
    console.log('PASS isolated PostgreSQL: additive migration, historical records/signatures intact, zero profile grants, unique identity, state/progress/version constraints, signature-to-version FK and rollback.');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
