// Optional isolated PostgreSQL engine: npm install --prefix .data/validation/pg-test --no-save --no-package-lock @electric-sql/pglite
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('../.data/validation/pg-test/node_modules/@electric-sql/pglite');
(async () => {
 const db = new PGlite();
 try {
  const root=path.join(__dirname,'../prisma/migrations');
  const migrations=fs.readdirSync(root).filter(n=>fs.existsSync(path.join(root,n,'migration.sql'))).sort();
  const last=migrations.pop(); assert.equal(last,'20261020000100_registros_retroativos_exclusao_controlada');
  for(const name of migrations) await db.exec(fs.readFileSync(path.join(root,name,'migration.sql'),'utf8'));
  await db.exec(`INSERT INTO higienizacao_hortifruti (data,hortifruti,"produtoUtilizado","inicioProcesso","terminoProcesso","duracaoMinutos",responsavel,"updatedAt") VALUES ('2026-09-18','Alface','Sanitizante','08:10','08:12',2,'Responsável antigo','2026-09-18');
   INSERT INTO fechamento_mensal_modulo ("moduloCodigo",ano,mes,"usuarioNomeSnapshot") VALUES ('hortifruti',2026,9,'Supervisor anterior');
   INSERT INTO plano_limpeza_diario_area (nome,"updatedAt") VALUES ('Área de teste',now());
   INSERT INTO plano_limpeza_diario_item ("areaId",descricao,"updatedAt") VALUES (1,'Atividade',now());
   INSERT INTO plano_limpeza_diario_registro (data,turno,area,"itemId","updatedAt") VALUES ('2026-10-19','MANHA','Área de teste',1,now());
   INSERT INTO controle_buffet_amostra_servico (nome,"updatedAt") VALUES ('Serviço',now());
   INSERT INTO controle_buffet_amostra_item (nome,classificacao,"updatedAt") VALUES ('Item','QUENTE',now());
   INSERT INTO controle_buffet_amostra_registro (data,"servicoId","itemId","itemNome",classificacao,"responsavelUsuarioId","responsavelNome","responsavelPerfil","dataHoraRegistro","updatedAt") VALUES ('2026-10-19',1,1,'Item','QUENTE',1,'Teste','GERENTE',now(),now());
   INSERT INTO rastreabilidade_recebimento_nota (data,fornecedor,"notaFiscal","chaveNfe","identificadorFiscal","updatedAt") VALUES ('2026-10-19','Teste','123','chave-teste','fiscal-teste',now());`);
  const before=(await db.query('SELECT * FROM higienizacao_hortifruti')).rows;
  const closure=(await db.query('SELECT * FROM fechamento_mensal_modulo')).rows;
  await db.exec(fs.readFileSync(path.join(root,last,'migration.sql'),'utf8'));
  const after=(await db.query('SELECT * FROM higienizacao_hortifruti')).rows;
  assert.equal(after[0].excluidoEm,null);delete after[0].excluidoEm;assert.deepEqual(after,before);
  assert.deepEqual((await db.query('SELECT * FROM fechamento_mensal_modulo')).rows,closure);
  const daily=(await db.query('SELECT * FROM plano_limpeza_diario_registro')).rows[0];
  assert.equal(daily.horarioExecucao,null);assert.equal(daily.horarioNaoInformado,false);assert.equal(daily.justificativaHorario,null);
  await assert.rejects(()=>db.exec(`UPDATE plano_limpeza_diario_registro SET "horarioNaoInformado"=true`));
  await assert.rejects(()=>db.exec(`UPDATE plano_limpeza_diario_registro SET "horarioExecucao"='25:00'`));
  await db.exec(`UPDATE plano_limpeza_diario_registro SET "excluidoEm"=now(); INSERT INTO plano_limpeza_diario_registro (data,turno,area,"itemId","updatedAt") VALUES ('2026-10-19','MANHA','Área de teste',1,now());`);
  await assert.rejects(()=>db.exec(`INSERT INTO plano_limpeza_diario_registro (data,turno,area,"itemId","updatedAt") VALUES ('2026-10-19','MANHA','Área de teste',1,now())`));
  await db.exec(`UPDATE controle_buffet_amostra_registro SET "excluidoEm"=now(); INSERT INTO controle_buffet_amostra_registro (data,"servicoId","itemId","itemNome",classificacao,"responsavelUsuarioId","responsavelNome","responsavelPerfil","dataHoraRegistro","updatedAt") VALUES ('2026-10-19',1,1,'Item','QUENTE',1,'Teste','GERENTE',now(),now());`);
  await assert.rejects(()=>db.exec(`INSERT INTO controle_buffet_amostra_registro (data,"servicoId","itemId","itemNome",classificacao,"responsavelUsuarioId","responsavelNome","responsavelPerfil","dataHoraRegistro","updatedAt") VALUES ('2026-10-19',1,1,'Item','QUENTE',1,'Teste','GERENTE',now(),now())`));
  await db.exec(`UPDATE rastreabilidade_recebimento_nota SET "excluidoEm"=now(); INSERT INTO rastreabilidade_recebimento_nota (data,fornecedor,"notaFiscal","chaveNfe","identificadorFiscal","updatedAt") VALUES ('2026-10-19','Teste','123','chave-teste','fiscal-teste',now());`);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM plano_limpeza_diario_registro')).rows[0].n,2);
  console.log('PASS PostgreSQL isolado: '+(migrations.length+1)+' migrations; histórico/fechamento preservados; defaults/HH:mm/justificativa; unicidade ativa e recadastro diário/buffet/nota.');
 } finally { await db.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
