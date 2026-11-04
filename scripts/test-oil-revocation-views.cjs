// Explicit local-copy integration test. Never loads .env connection settings.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { randomUUID, createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const arg = name => args[args.indexOf(name) + 1];
for (const flag of ['--copy-metadata', '--snapshot', '--plan', '--output']) {
  assert(args.includes(flag) && arg(flag), `Required: ${flag}`);
}
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const copy = read(arg('--copy-metadata'));
assert(/^historiccopy_\d+$/.test(copy.database));
const snapshot = read(arg('--snapshot'));
const plan = read(arg('--plan'));
assert.equal(plan.tipo, 'REVOGACAO_OLEO_VERSIONADO');
assert.equal(copy.fonteFingerprint, plan.destinoFingerprint);
assert.deepEqual(plan.operacoes.map(o => o.registroId).sort((a, b) => a - b), [121, 122, 123, 124, 125, 126, 128, 129]);
const output = path.resolve(arg('--output'));
fs.mkdirSync(output, { recursive: true });
const envHash = () => createHash('sha256').update(fs.readFileSync(path.join(root, '.env'))).digest('hex');
const originalEnv = envHash();
const url = `postgresql://postgres:isolated_test_only@127.0.0.1:55479/${copy.database}`;
process.env.DATABASE_URL = url;
process.env.DIRECT_URL = url;
const { PrismaClient } = require('@prisma/client');
const plain = new PrismaClient({ datasources: { db: { url } } });
const app = new PrismaClient({ datasources: { db: { url } } });
const mocks = new Map(), load = Module._load;
Module._load = function (name, parent, isMain) {
  if (mocks.has(name)) return mocks.get(name);
  if (name === 'server-only') return {};
  if (name.startsWith('@/')) name = path.join(root, 'src', name.slice(2));
  return load.call(this, name, parent, isMain);
};
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (m, file) => m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
}).outputText, file);
mocks.set('@/lib/prisma', { prisma: app });
mocks.set('next/cache', { revalidatePath() {} });
class Redirect extends Error { constructor(url) { super('redirect'); this.url = url; } }
mocks.set('next/navigation', { redirect(url) { throw new Redirect(url); }, notFound() { throw Error('Not found'); } });
mocks.set('@/lib/redirect-error', { rethrowIfRedirectError(e) { if (e instanceof Redirect) throw e; } });
let user;
mocks.set('@/lib/auth-session', { getCurrentUser: async () => user, getCurrentUserForAction: async () => user });
app.$use(require('../src/lib/active-operational-records.ts').activeOperationalRecords);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { NextRequest } = require('next/server');
const api = require('./lib/historical-regularization.cjs');
const { getDefaultPermissionCodes } = require('../src/lib/permissions.ts');
const { hashPassword } = require('../src/lib/password.ts');
const { formatAppDate } = require('../src/lib/date-time.ts');
const core = require('../src/lib/operational-workflow/service.ts');
const { oilAdapter, oilSignatureBridge, refreshWorkflowActor } = require('../src/app/controle-qualidade-oleo/workflow-adapter.ts');
const { canSignOilSupervisor } = require('../src/lib/oil-signature-permissions.ts');
const { OilSavedRecordPage } = require('../src/app/controle-qualidade-oleo/saved-record-page.tsx');
const History = require('../src/app/controle-qualidade-oleo/historico/legacy-history.tsx').default;
const report = require('../src/app/relatorios/controle-qualidade-oleo/mensal/route.ts');
const actions = require('../src/app/controle-qualidade-oleo/workflow-actions.ts');

// Resolve async Server Components; React renders synchronous/client components.
async function materialize(node) {
  if (Array.isArray(node)) return Promise.all(React.Children.toArray(node).map(materialize));
  if (!React.isValidElement(node)) return node;
  if (typeof node.type === 'function' && node.type.constructor.name === 'AsyncFunction') {
    const resolved = await materialize(await node.type(node.props));
    return node.key !== null && React.isValidElement(resolved) ? React.cloneElement(resolved, { key: node.key }) : resolved;
  }
  return React.cloneElement(node, node.props.children === undefined ? {} : { children: await materialize(node.props.children) });
}
function findComponent(node, name) {
  if (Array.isArray(node)) return node.flatMap(n => findComponent(n, name));
  if (!React.isValidElement(node)) return [];
  return [...(node.type?.name === name ? [node] : []), ...findComponent(node.props.children, name)];
}
const render = async node => renderToStaticMarkup(await materialize(node));
const actor = who => tx => refreshWorkflowActor(tx, who);
const form = values => { const f = new FormData(); for (const [k, v] of Object.entries(values)) f.set(k, String(v)); return f; };
const rows = html => [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(m => m[1]);
const cells = row => [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
const rowFor = (html, date) => { const row = rows(html).find(r => cells(r)[0]?.replace(/<[^>]*>/g, '').trim() === formatAppDate(new Date(date))); assert(row, `Missing ${date}`); return row; };
const supervisorCell = row => cells(row)[4];
async function views(stage) {
  const tree = await History({ searchParams: Promise.resolve({ filtroMes: '10', filtroAno: '2026' }) });
  const indicators = findComponent(tree, 'MonthlyClosureSection')[0]?.props.indicators;
  assert(indicators);
  const history = await render(tree);
  const response = await report.GET(new NextRequest('http://localhost/relatorios/controle-qualidade-oleo/mensal?mes=10&ano=2026'));
  assert.equal(response.status, 200);
  const monthly = await response.text();
  fs.writeFileSync(path.join(output, `historico-${stage}.html`), history);
  fs.writeFileSync(path.join(output, `relatorio-${stage}.html`), monthly);
  return { history, monthly, indicators };
}
async function integrity() {
  for (const model of ['controleQualidadeOleoRegistro', 'controleBuffetAmostraRegistro', 'fluxoAssinatura', 'fluxoVersao', 'logAssinatura', 'assinaturaDiariaModulo', 'fechamentoMensalModulo', 'controleQualidadeOleoFechamento']) {
    const current = await plain[model].findMany();
    const key = row => model === 'fluxoVersao' ? `${row.fluxoId}:${row.versao}` : String(row.id);
    const byKey = new Map(current.map(row => [key(row), row]));
    for (const original of snapshot.data[model]) assert.equal(api.digest(byKey.get(key(original))), api.digest(original), `${model} ${key(original)} changed`);
  }
  const valid = snapshot.data.fluxoOperacional.find(f => f.id === 'cmvtns9pd003slb0xahwnwu3y');
  assert.equal(api.digest(await plain.fluxoOperacional.findUniqueOrThrow({ where: { id: valid.id } })), api.digest(valid));
  const affected = new Set(plan.operacoes.map(o => o.fluxoId));
  for (const flow of snapshot.data.fluxoOperacional.filter(f => !affected.has(f.id))) {
    assert.equal(api.digest(await plain.fluxoOperacional.findUniqueOrThrow({ where: { id: flow.id } })), api.digest(flow));
  }
  assert.equal(envHash(), originalEnv);
}
async function main() {
  assert.equal((await plain.$queryRaw`SELECT current_database() name`)[0].name, copy.database);
  await integrity();
  const operator = await plain.usuario.findUniqueOrThrow({ where: { id: 1 } });
  user = { ...operator, permissoes: getDefaultPermissionCodes(operator.perfil) };
  const before = await views('antes');
  const signedTargetDaysBefore = new Set(plan.operacoes.filter(item => rowFor(before.history, item.data).includes('Assinado pelo Supervisor')).map(item => item.data)).size;
  for (const item of plan.operacoes) {
    assert.equal(item.escopoOriginal.flow.assinaturaVigenteId, item.assinaturaId);
    assert(supervisorCell(rowFor(before.monthly, item.data)).includes('Anderson Fiorenzano'));
  }
  const backup = { tipo: 'copia-dominios-somente-simulacao', producao: false, recuperavel: true, referencia: arg('--snapshot'), sha256: createHash('sha256').update(fs.readFileSync(arg('--snapshot'))).digest('hex'), verificadoEm: new Date().toISOString() };
  const options = { actorId: operator.id, authorization: 'TESTE_LOCAL_SEM_AUTORIZACAO_PRODUCAO', authorizedBy: 'Simulação isolada', reason: 'Revogação restrita às oito assinaturas técnicas com perfil histórico COLABORADOR.', backup, targetFingerprint: plan.destinoFingerprint };
  // Fail during the second write and prove the FIRST write also rolled back.
  const unchanged = api.digest(await plain.fluxoOperacional.findMany());
  let eventWrites = 0;
  const failing = { $transaction: (callback, settings) => plain.$transaction(tx => callback(new Proxy(tx, {
    get(target, property) {
      if (property === 'fluxoEvento') return new Proxy(target.fluxoEvento, { get(model, method) {
        if (method === 'create') return async data => { if (++eventWrites === 2) throw Error('Falha sintética de auditoria'); return model.create(data); };
        return typeof model[method] === 'function' ? model[method].bind(model) : model[method];
      } });
      return typeof target[property] === 'function' ? target[property].bind(target) : target[property];
    }
  })), settings) };
  await assert.rejects(() => api.applyOilRevocationPlan(failing, plan, options), /Falha sintética/);
  assert.equal(eventWrites, 2);
  assert.equal(api.digest(await plain.fluxoOperacional.findMany()), unchanged);
  assert.equal(await plain.fluxoEvento.count({ where: { operacao: 'REVOGACAO_ASSINATURA' } }), 0);
  await integrity();
  await assert.rejects(() => api.applyOilRevocationPlan(plain, plan, { ...options, authorization: '' }), /Autorização/);
  await assert.rejects(() => api.applyOilRevocationPlan(plain, plan, { ...options, backup: null }), /Backup/);
  const result = await api.applyOilRevocationPlan(plain, plan, options);
  assert.equal(result.resultados.length, 8);
  await integrity();
  const after = await views('revogado');
  assert.equal(after.indicators['Dias assinados'], before.indicators['Dias assinados'] - signedTargetDaysBefore);
  assert.equal(after.indicators['Dias pendentes de assinatura'], before.indicators['Dias pendentes de assinatura'] + signedTargetDaysBefore);
  for (const item of plan.operacoes) {
    const day = rowFor(after.history, item.data);
    assert(!day.includes('Assinado pelo Supervisor'));
    assert(day.includes('Pendente assinatura'));
    assert(supervisorCell(rowFor(after.monthly, item.data)).includes('Pendente de assinatura'));
    const detail = await render(await OilSavedRecordPage({ id: item.registroId, query: { auditoria: '1' } }));
    assert(detail.includes('Pendente de assinatura válida'));
    assert(detail.includes('Revogada — evidência histórica preservada'));
    assert(detail.includes('Anderson Fiorenzano'));
    assert(detail.includes('TESTE_LOCAL_SEM_AUTORIZACAO_PRODUCAO'));
    assert(!detail.includes('Salvar correção'));
    fs.writeFileSync(path.join(output, `registro-${item.registroId}-revogado.html`), detail);
  }
  assert(rowFor(after.history, '2026-10-29').includes('Camila Reinaldo'));
  const password = 'local-only-review-password';
  const nutri = await plain.usuario.create({ data: { nomeCompleto: 'Nutricionista sintética da revalidação', nomeUsuario: 'revalidacao-' + Date.now(), perfil: 'NUTRICIONISTA', senhaHash: hashPassword(password) } });
  const session = await plain.usuarioSessao.create({ data: { usuarioId: nutri.id, tokenHash: randomUUID(), expiraEm: new Date(Date.now() + 86400000) } });
  const reviewer = { ...nutri, sessaoId: session.id, permissoes: getDefaultPermissionCodes(nutri.perfil) };
  const collaborator = await plain.usuario.findUniqueOrThrow({ where: { id: 11 } });
  const collaboratorSession = await plain.usuarioSessao.create({ data: { usuarioId: collaborator.id, tokenHash: randomUUID(), expiraEm: new Date(Date.now() + 86400000) } });
  const executor = { ...collaborator, sessaoId: collaboratorSession.id, permissoes: getDefaultPermissionCodes(collaborator.perfil) };
  assert(!canSignOilSupervisor({ ...executor, permissoes: ['usuarios.responsavel_tecnico', 'modulo.oleo.assinar_historico', 'modulo.oleo.assinar_dia'] }, 'individual'));
  const eligible = plan.operacoes.filter(item => ![121, 122].includes(item.registroId));
  for (const item of plan.operacoes) {
    await assert.rejects(() => core.saveWorkflow({ actor: actor(executor), adapter: oilAdapter, key: item.escopoOriginal.flow.chave, expectedVersion: item.versao, input: form({ temperatura: '171', intent: 'complete' }) }), /competência|somente nova assinatura|mês vigente|permitida/i);
    await assert.rejects(() => core.signWorkflow({ actor: actor(executor), bridge: oilSignatureBridge(password, false), scope: [{ id: item.fluxoId, version: item.versao }] }), /nutricionista|permissão/i);
  }
  user = executor;
  try {
    await actions.signOilWorkflowAction(form({ unidade: `${eligible[0].fluxoId}:${eligible[0].versao}`, mecanismo: 'individual', senha: password }));
    assert.fail('Expected denied direct action');
  } catch (e) {
    assert(e instanceof Redirect);
    assert(new URL(e.url, 'http://localhost').searchParams.get('feedbackType') === 'error');
  }
  for (const item of plan.operacoes.filter(item => [121, 122].includes(item.registroId))) {
    await assert.rejects(() => core.signWorkflow({ actor: actor(reviewer), bridge: oilSignatureBridge(password, false), scope: [{ id: item.fluxoId, version: item.versao }] }), /original|comprovar/);
  }
  await assert.rejects(() => core.signWorkflow({ actor: actor(reviewer), bridge: oilSignatureBridge('wrong-password', false), scope: [{ id: eligible[0].fluxoId, version: eligible[0].versao }] }), /senha/i);
  const signedAfter = new Date();
  for (const item of eligible) {
    await core.signWorkflow({ actor: actor(reviewer), bridge: oilSignatureBridge(password, false), scope: [{ id: item.fluxoId, version: item.versao }] });
    const flow = await plain.fluxoOperacional.findUniqueOrThrow({ where: { id: item.fluxoId }, include: { assinaturaVigente: true } });
    assert.equal(flow.assinaturaVigente.usuarioId, nutri.id);
    assert(flow.assinaturaVigente.assinadoEm >= signedAfter);
    assert.equal(flow.versao, item.versao);
  }
  user = reviewer;
  const signed = await views('reassinado');
  for (const item of eligible) {
    assert(supervisorCell(rowFor(signed.monthly, item.data)).includes(nutri.nomeCompleto));
    const detail = await render(await OilSavedRecordPage({ id: item.registroId, query: { auditoria: '1' } }));
    assert(detail.includes('Revogada — evidência histórica preservada'));
    assert(detail.includes(nutri.nomeCompleto));
    fs.writeFileSync(path.join(output, `registro-${item.registroId}-reassinado.html`), detail);
  }
  for (const id of [121, 122]) {
    const item = plan.operacoes.find(o => o.registroId === id);
    assert.equal((await plain.fluxoOperacional.findUniqueOrThrow({ where: { id: item.fluxoId } })).assinaturaVigenteId, null);
  }
  await integrity();
  const evidence = { somenteLocal: true, somenteSimulacao: true, aplicadoEmProducao: false, backupCompletoValidado: false, database: copy.database, planoHash: plan.planoHash, sucesso: true, revogados: result.resultados, novosAssinantesSinteticos: eligible.map(o => o.registroId), autoriaNaoComprovada: [121, 122], camila127Intacta: true, dadosOperacionaisPreservados: true, rollbackAposFalhaNaSegundaEscrita: true, indicadores: { antes: before.indicators, revogado: after.indicators, reassinado: signed.indicators }, envPreservado: envHash() === originalEnv };
  fs.writeFileSync(path.join(output, 'resultado.json'), JSON.stringify(evidence, null, 2));
  console.log('PASS oito revogações locais; Histórico, indicadores, detalhes e relatórios coerentes; rollback integral; 127 intacto; seis novas assinaturas sintéticas com senha/data reais; 121/122 bloqueados; colaborador e edição indevida negados; .env preservado.');
}
main().catch(e => { console.error(e.code ?? e.name, String(e.message).split('\n').slice(-3).join(' ')); process.exitCode = 1; }).finally(async () => { await plain.$disconnect(); await app.$disconnect(); });
