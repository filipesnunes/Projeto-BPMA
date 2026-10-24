// Contract tests execute the real workflow service against a transactional adapter.
// No environment, production connection or operational database writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const mocks = new Map();
const originalLoad = Module._load;
Module._load = function(name, parent, main) {
  if (mocks.has(name)) return mocks.get(name);
  if (name === 'server-only') return {};
  if (name.startsWith('@/')) name = path.join(root, 'src', name.slice(2));
  return originalLoad.call(this, name, parent, main);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, filename);
const today = new Date('2026-10-24T00:00:00Z');
let db, closed, failAudit, user, sequence, actual;
let tail = Promise.resolve();
function reset() {
  db = { fluxoOperacional: [], fluxoVersao: [], fluxoEvento: [], fluxoAssinatura: [], fluxoAssinaturaVinculo: [], domain: [] };
  closed = false; failAudit = false; sequence = 0;
  user = { id: 1, nomeCompleto: 'Teste', perfil: 'DEV', nomeUsuario: 'teste' };
  actual = new Map();
}
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (['modulo_chave', 'fluxoId_versao'].includes(key)) return matches(row, value);
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('gte' in value) return row[key] >= value.gte && row[key] < value.lt;
    }
    return row[key] === value;
  });
}
const tx = new Proxy({}, { get(_, name) {
  if (name === '$executeRaw') return async(strings, module, lock) => {
    assert(strings.join('').includes('17326')); assert.equal(typeof module, 'string');
  };
  return {
    async findUnique({where}) { return structuredClone(db[name].find(row => matches(row, where)) ?? null); },
    async findUniqueOrThrow(args) { const value = await this.findUnique(args); if (!value) throw Error('missing'); return value; },
    async findMany({where}) { return structuredClone(db[name].filter(row => matches(row, where))); },
    async create({data}) {
      if (failAudit && name === 'fluxoEvento') throw Error('audit failed');
      const row = { id: String(++sequence), versao: 1, estado: "PENDENTE", excluidoEm: null, assinaturaVigenteId: null, ...structuredClone(data) };
      db[name].push(row); return structuredClone(row);
    },
    async update({where, data}) {
      const row = db[name].find(row => matches(row, where)); if (!row) throw Error('stale update');
      for (const [key, value] of Object.entries(data)) row[key] = value?.increment ? row[key] + value.increment : value;
      return structuredClone(row);
    }
  };
} });
const prisma = { async $transaction(callback, options) {
  assert.equal(options.isolationLevel, 'Serializable');
  const prior = tail; let release; tail = new Promise(resolve => { release = resolve; }); await prior;
  const backup = structuredClone(db); const contents = structuredClone(actual);
  try { return await callback(tx); } catch (error) { db = backup; actual = contents; throw error; } finally { release(); }
} };
mocks.set('@/lib/prisma', { prisma });
mocks.set('@/lib/monthly-reopening', { isOperationalMonthClosed: async () => closed });
const dates = require('../src/lib/date-time.ts');
dates.getAppDate = () => today;
const policy = require('../src/lib/operational-workflow/policy.ts');
const service = require('../src/lib/operational-workflow/service.ts');
const permissions = require('../src/lib/permissions.ts');
const content = (complete, value = 'partial') => ({ snapshot: { value }, draft: complete ? {} : { value }, complete, resolved: complete ? 2 : 1, required: 2 });
const actor = async () => user;
const adapter = {
  module: 'temperatura',
  async load(_, key) { return { date: key.startsWith('past') ? new Date('2026-10-23T00:00:00Z') : today, content: actual.get(key), legacy: key === 'legacy' }; },
  async save(_, key, input) { actual.set(key, input); db.domain.push({key, input}); return input; }
};
const save = (key, expectedVersion, input = content(true)) => service.saveWorkflow({ actor, adapter, key, expectedVersion, input });
let rejectSignature = false;
const bridge = {
  module: 'temperatura', mechanism: 'REVISAO_INDIVIDUAL',
  async validate(_, unit) { return actual.get(unit.chave); },
  async sign(_, signer, units) { if (rejectSignature) throw Error('signature denied'); assert.equal(signer.id, 1); return 'original-signature:' + units.map(unit => unit.id).join(','); }
};
const sign = (...units) => service.signWorkflow({ actor, bridge, scope: units.map(unit => ({ id: unit.id, version: unit.versao })) });
const reopen = (unit, extra = {}) => service.reopenWorkflow({ actor, module: 'temperatura', id: unit.id,
  expectedVersion: unit.versao, reason: 'Correção autorizada', fromEdit: false, ...extra });

(async () => {
  reset();
  for (const role of ['GERENTE', 'NUTRICIONISTA', 'COLABORADOR']) {
    assert.equal(permissions.hasPermission({perfil: role}, 'modulo.temperatura.reabrir_registro'), false);
  }
  assert.equal(policy.stateAfterSave('COMPLETO', false), 'PENDENTE');
  assert.equal(policy.stateAfterSave('REABERTO', true), 'REABERTO');
  assert.equal(policy.stateAfterSave('REABERTO', false), 'REABERTO');
  assert.throws(() => policy.stateAfterSave('FECHADO', true));
  assert(policy.isWorkflowQueueItem('PENDENTE', today, today));
  assert(!policy.isWorkflowQueueItem('COMPLETO', today, today));
  assert(!policy.isWorkflowQueueItem('FECHADO', today, today));
  assert(policy.isWorkflowQueueItem('REABERTO', new Date('2020-01-01'), today));
  assert(!policy.isWorkflowQueueItem('PENDENTE', new Date('2020-01-01'), today));
  let a = await save('A', 0, content(false)); assert.equal(a.estado, 'PENDENTE');
  assert.deepEqual(db.fluxoVersao[0].rascunho, {value:'partial'});
  await assert.rejects(() => sign(a));
  a = await save('A', 1); assert.equal(a.estado, 'COMPLETO');
  await assert.rejects(() => save('A', 1), /atualizado/);
  let b = await save('B', 0);
  const signature = await sign(a, b);
  assert.equal(db.fluxoAssinaturaVinculo.length, 2);
  assert(db.fluxoOperacional.every(unit => unit.estado === 'FECHADO'));
  await assert.rejects(() => save('A', a.versao), /fechado/);
  const history = JSON.stringify(db.fluxoAssinaturaVinculo);
  await assert.rejects(() => reopen(a, {reason:''}));
  closed = true; await assert.rejects(() => reopen(a), /competência/); closed = false;
  user = { ...user, perfil: 'GERENTE', perfilAcessoId: 1, permissoes: ['modulo.temperatura.acessar'] };
  await assert.rejects(() => reopen(a), /permissão/);
  user.permissoes.push('modulo.temperatura.reabrir_registro');
  await assert.rejects(() => reopen(a, {fromEdit:true}), /permissão/);
  a = await reopen(a); assert.equal(a.estado, 'REABERTO');
  assert.equal(a.assinaturaVigenteId, null);
  assert.equal(db.fluxoOperacional.find(unit => unit.id === b.id).assinaturaVigenteId, signature.id);
  assert.equal(JSON.stringify(db.fluxoAssinaturaVinculo), history);
  user = { id:1, nomeCompleto:'Teste', perfil:'DEV', nomeUsuario:'teste' };
  a = await save('A', a.versao, content(false)); assert.equal(a.estado, 'REABERTO');
  await assert.rejects(() => sign(a));
  a = await save('A', a.versao); await sign(a);
  a = await reopen(a); await sign(a);
  assert.equal(db.fluxoAssinatura.length, 3);
  assert.equal(db.fluxoAssinaturaVinculo.length, 4);
  await assert.rejects(() => save('legacy', 0), /legado/);
  const c = await save('C', 0); actual.set('C', content(true, 'changed outside workflow'));
  await assert.rejects(() => sign(c), /conteúdo mudou/);
  actual.set('C', content(true));
  const before = JSON.stringify(db); failAudit = true;
  await assert.rejects(() => sign(c), /audit failed/); assert.equal(JSON.stringify(db), before);
  failAudit = false; rejectSignature = true;
  await assert.rejects(() => sign(c), /signature denied/); assert.equal(JSON.stringify(db), before); rejectSignature = false;
  const concurrent = await Promise.allSettled([save('C', c.versao), save('C', c.versao)]);
  assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
  user = { ...user, perfil:'COLABORADOR', perfilAcessoId:9, permissoes:['modulo.temperatura.acessar','modulo.temperatura.criar_registro','modulo.temperatura.editar_registro_do_dia'] };
  await assert.rejects(() => save('past-A',0), /permissão/);
  user.permissoes.push('modulo.temperatura.editar_historico');
  const past = await save('past-A',0); assert.equal(past.estado,'COMPLETO');
  user = { id:1, nomeCompleto:'Teste', perfil:'DEV', nomeUsuario:'teste' };
  let d = await save('D',0);
  d = await save('D',d.versao,content(false)); assert.equal(d.estado,'PENDENTE');
  d = await save('D',d.versao);
  const competingSign = await Promise.allSettled([sign(d), save('D',d.versao)]);
  assert.equal(competingSign.filter(result => result.status === 'fulfilled').length,1);
  const beforeReopen = JSON.stringify(db); failAudit = true;
  await assert.rejects(() => reopen(d), /audit failed/); assert.equal(JSON.stringify(db),beforeReopen);
  failAudit = false;
  const competingReopen = await Promise.allSettled([reopen(d),reopen(d)]);
  assert.equal(competingReopen.filter(result => result.status === 'fulfilled').length,1);
  await assert.rejects(() => service.assertNoReopenedWorkflow(tx,'temperatura',new Date('2026-10-01'),new Date('2026-11-01')),/reabertos/);
  await service.assertNoReopenedWorkflow(tx,'oleo',new Date('2026-10-01'),new Date('2026-11-01'));
  const beforeSave = JSON.stringify(db); failAudit = true;
  await assert.rejects(() => save('E',0), /audit failed/); assert.equal(JSON.stringify(db),beforeSave);
  failAudit = false;
  console.log('PASS workflow contract: states, dates, drafts, permission without grants, explicit version, grouped scope, reopen cycles, immutable prior links, incomplete/stale signature denied, atomic audit rollback and competing saves in serialized adapter.');
})().catch(error => { console.error(error); process.exitCode = 1; });
