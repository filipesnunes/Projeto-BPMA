// Real actions, pages and report routes against an isolated in-memory adapter.
// No environment file, database connection, upload, seed or operational mutation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const originalLoad = Module._load;
const mocks = new Map();
Module._load = function (name, parent, isMain) {
  if (mocks.has(name)) return mocks.get(name);
  if (name === 'server-only') return {};
  if (name.startsWith('@/')) name = path.join(root, 'src', name.slice(2));
  return originalLoad.call(this, name, parent, isMain);
};
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
  }).outputText, filename);
};
const load = (file) => require(path.join(root, file));
const actor = { id: 1, nomeCompleto: 'Responsável Teste', perfil: 'DEV', nomeUsuario:'dev-teste' };
class Redirect extends Error { constructor(url) { super('redirect'); this.url = url; } }
const revalidated = [];
mocks.set('next/cache', { revalidatePath(value) {revalidated.push(value);} });
mocks.set('next/navigation', { redirect(url) { throw new Redirect(url); } });
mocks.set('@/lib/redirect-error', { rethrowIfRedirectError(e) { if (e instanceof Redirect) throw e; } });
mocks.set('@/lib/auth-session', { getCurrentUser: async () => actor, getCurrentUserForAction: async () => actor });
mocks.set('@/lib/authz', new Proxy({}, { get: () => async () => {} }));
mocks.set('@/lib/permissions', { hasPermission: () => true, hasAnyPermission: () => true, canEditRecordDate: () => true });
mocks.set('@/lib/rbac', { getRoleLabel: () => 'Teste', canAccessReports: () => true, canViewManagementSections: () => true, canManageModuleOptions: () => true, canDeleteOperationalRecords: () => true });
mocks.set('@/lib/image-upload', { parseImageUploadFromFormData: async () => null, hasStoredImage: () => false });
mocks.set('@/lib/local-image-storage', { saveTemperatureEquipmentEvidenceImage: async () => { throw Error('Unexpected upload'); } });
const dates = load('src/lib/date-time.ts');
const today = dates.getAppDate();
const date = (s) => new Date(`${s}T00:00:00Z`);
let failAudit = false;
let failRemove = false;
const tables = {};
const queries = [];
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some((clause) => matches(row, clause));
    if (key === 'AND') return (Array.isArray(value) ? value : [value]).every((clause) => matches(row, clause));
    if (key === 'NOT') return !matches(row, value);
    if (['mes_ano','tipo_mes_ano','moduloCodigo_ano_mes'].includes(key)) return matches(row,value);
    if (value instanceof Date) return +row[key] === +value;
    if (value && typeof value === 'object') {
      if ('not' in value && row[key] === value.not) return false;
      if ('gte' in value && row[key] < value.gte) return false;
      if ('lte' in value && row[key] > value.lte) return false;
      if ('equals' in value && String(row[key]).toLowerCase() !== String(value.equals).toLowerCase()) return false;
      if ('in' in value && !value.in.includes(row[key])) return false;
      if ('contains' in value && !String(row[key]).toLowerCase().includes(value.contains.toLowerCase())) return false;
      return true;
    }
    return row[key] === value;
  });
}
function selected(row, select) {
  if (!row || !select) return row;
  return Object.fromEntries(Object.entries(select).filter(([,v]) => v).map(([key, value]) => [key,
    value === true ? row[key] : selected(row[key], value.select)]));
}
const prisma = new Proxy({}, { get(_target, model) {
  if (model === '$transaction') return async (callback,options) => {
    assert.equal(options.isolationLevel,'Serializable');
    const backup = structuredClone(tables);
    try {return await callback(prisma);} catch(e) {for(const key of Object.keys(tables)) delete tables[key];Object.assign(tables,backup);throw e;}
  };
  const rows = tables[model] ??= [];
  const find = (args = {}) => {
    queries.push({ model, ...args });
    let found = rows.filter((row) => matches(row, args.where));
    for (const order of [...(Array.isArray(args.orderBy) ? args.orderBy : args.orderBy ? [args.orderBy] : [])].reverse()) {
      const [key, direction] = Object.entries(order)[0];
      if (typeof direction !== 'string') continue;
      found.sort((a,b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * (direction === 'desc' ? -1 : 1));
    }
    if (args.take) found = found.slice(0, args.take);
    return found.map((row) => selected(row, args.select));
  };
  return {
    findMany: async (args) => find(args), findFirst: async (args) => find(args)[0] ?? null,
    findUnique: async (args) => find(args)[0] ?? null,
    count: async (args) => find(args).length,
    aggregate: async () => ({ _min: { data: today }, _max: { data: today } }),
    create: async ({data}) => { if (model === 'logAssinatura' && failAudit) throw Error('Audit unavailable'); const row = { id: rows.length + 1, createdAt: new Date(), updatedAt: new Date(), ...data }; rows.push(row); return row; },
    update: async ({where,data}) => { const row = rows.find((r) => matches(r,where)); assert(row); Object.assign(row,data); return row; },
    delete: async ({where}) => { if (model === 'fechamentoMensalModulo' && failRemove) throw Error('Removal unavailable'); const index = rows.findIndex((r) => matches(r,where)); assert(index >= 0); return rows.splice(index,1)[0]; },
    upsert: async ({where,create,update}) => { let row = rows.find((r) => matches(r,where)); if (row) Object.assign(row,update); else { row = {id:rows.length+1,...create}; rows.push(row); } return row; }
  };
} });
mocks.set('@/lib/prisma', { prisma });
const { NextRequest } = require('next/server');
async function action(fn, values, expected = 'success') {
  const form = new FormData(); for (const [key,value] of Object.entries(values)) form.set(key,String(value));
  try { await fn(form); assert.fail('Expected redirect'); } catch(e) {
    if (!(e instanceof Redirect)) throw e;
    const params = new URL(e.url,'http://localhost').searchParams;
    assert.equal(params.get('feedbackType'),expected,params.get('feedback')); return params;
  }
}
function elements(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap((child) => elements(child,predicate));
  return [...(predicate(node) ? [node] : []), ...elements(node.props?.children,predicate)];
}
const outputDir = path.join(root,'.data/validation');
fs.mkdirSync(outputDir,{recursive:true});
async function report(module, month = 9, year = 2026) {
  const result = await load(`src/app/relatorios/${module}/mensal/route.ts`).GET(new NextRequest(`http://localhost/relatorios/${module}/mensal?mes=${month}&ano=${year}`));
  assert.equal(result.status,200); return result.text();
}
const cases = [
  ['hortifruti','higienizacao-hortifruti','higienizacaoHortifrutiFechamento'],
  ['temperatura','controle-temperatura-equipamentos','controleTemperaturaEquipamentoFechamento'],
  ['oleo','controle-qualidade-oleo','controleQualidadeOleoFechamento'],
  ['amostras','controle-buffet-amostras','controleBuffetAmostraFechamento'],
  ['rastreabilidade','rastreabilidade-recebimento','rastreabilidadeRecebimentoFechamento'],
  ['limpeza_diaria','plano-limpeza/diario','planoLimpezaFechamento','DIARIO'],
  ['limpeza_semanal','plano-limpeza/semanal','planoLimpezaFechamento','SEMANAL']
];
const closure = (moduloCodigo,mes=9) => ({id:mes,moduloCodigo,mes,ano:2026,
  usuarioId:7,usuarioNomeSnapshot:'Supervisor anterior',usuarioPerfilSnapshot:'GERENTE',
  assinadoEm:date('2026-09-30'),criadoEm:date('2026-09-30'),
  observacao:'Assinatura original',indicadoresSnapshot:{registros:15}});
const legacy = (tipo,mes=9) => ({id:mes,mes,ano:2026,tipo,status:'ASSINADO',
  responsavelTecnico:'Supervisor legado',dataAssinatura:date('2026-09-30')});
const makeForm = (values) => {const form=new FormData();for(const [key,value] of Object.entries(values))form.set(key,String(value));return form;};
async function main() {
  const {reopenOperationalMonth} = load('src/lib/monthly-reopening.ts');
  const shared = load('src/app/historico-operacional/actions.ts');
  const {MonthlyClosureSection} = load('src/components/historico/technical-signature.tsx');
  const daily = [{id:88,moduloCodigo:'temperatura',dataReferencia:date('2026-09-01'),usuarioNomeSnapshot:'Supervisor'}];
  const operational = [{id:9,temperaturaAferida:6,fotoArquivoNome:'evidencia.jpg',status:'ALERTA',data:today}];
  tables.assinaturaDiariaModulo = structuredClone(daily);
  tables.controleTemperaturaEquipamento = structuredClone(operational);
  const originalLog = {id:1,tipo:'FECHAMENTO_MENSAL',observacao:'Log original preservado'};
  tables.logAssinatura = [originalLog];
  for (const [code,module,model,tipo] of cases) {
    for (const mode of ['generic','legacy','both']) {
      tables.fechamentoMensalModulo = [{...closure('outro_modulo'),id:90},closure(code,8),...(mode !== 'legacy' ? [closure(code)] : [])];
      tables[model] = [legacy(tipo,8),...(mode !== 'generic' ? [legacy(tipo)] : [])];
      if (tipo) tables[model].push({...legacy(tipo === 'DIARIO' ? 'SEMANAL' : 'DIARIO'),id:99});
      const untouched = JSON.stringify(tables.fechamentoMensalModulo.slice(0,2));
      const originalGeneric = mode !== 'legacy' ? structuredClone(tables.fechamentoMensalModulo.at(-1)) : null;
      const originalLegacy = mode !== 'generic' ? structuredClone(tables[model].find(r=>r.id===9)) : null;
      const props = {moduleCode:code,month:9,year:2026,returnTo:`/${module}/historico?filtroMes=9&filtroAno=2026`,
        signedClosure:originalGeneric,canSign:true,pendingDailySignatures:1,indicators:{Registros:15}};
      const closedUI = await MonthlyClosureSection(props);
      assert.equal(elements(closedUI,n=>n.type?.name==='ReopenMonthForm').length,1,code+' DEV button');
      assert.equal(elements(closedUI,n=>n.type==='form').length,0,'Cannot sign already closed');
      for (const role of ['GERENTE','NUTRICIONISTA','COLABORADOR']) {
        actor.perfil=role;
        assert.equal(elements(await MonthlyClosureSection(props),n=>n.type?.name==='ReopenMonthForm').length,0);
        await assert.rejects(()=>reopenOperationalMonth({user:actor,moduleCode:code,mes:9,ano:2026}),/DEV/);
      }
      actor.perfil='DEV';
      await action(shared.reopenModuleMonthlyClosureAction,{moduloCodigo:code,mes:9,ano:2026,returnTo:props.returnTo});
      assert.equal(tables.fechamentoMensalModulo.length,2);
      assert.equal(JSON.stringify(tables.fechamentoMensalModulo),untouched,'Other period/module preserved');
      if (mode !== 'generic') assert.equal(tables[model].find(r=>r.id===9).status,'ABERTO');
      assert.equal(tables[model][0].status,'ASSINADO','Other month preserved');
      if (tipo) assert.equal(tables[model].find(r=>r.id===99).status,'ASSINADO','Other cleaning type preserved');
      const audit=tables.logAssinatura.at(-1);
      const snapshot=JSON.parse(audit.observacao);
      assert.equal(audit.usuarioId,actor.id);assert.equal(audit.perfil,'DEV');
      assert.equal(audit.modulo,code);assert.equal(audit.referenciaId,'09/2026');assert(audit.assinadoEm instanceof Date);
      assert.equal(snapshot.operacao,'REABERTURA_MENSAL');
      assert.deepEqual(snapshot.fechamentoGenericoAnterior,originalGeneric ? JSON.parse(JSON.stringify(originalGeneric)) : null);
      if(originalLegacy) assert.deepEqual(snapshot.fechamentoEspecificoAnterior,JSON.parse(JSON.stringify(originalLegacy)));
      assert.deepEqual(tables.assinaturaDiariaModulo,daily);assert.deepEqual(tables.controleTemperaturaEquipamento,operational);
      assert.deepEqual(tables.logAssinatura[0],originalLog);
      const openUI = await MonthlyClosureSection({...props,signedClosure:null});
      assert.equal(elements(openUI,n=>n.type?.name==='ReopenMonthForm').length,0);
      assert.equal(elements(openUI,n=>n.type==='form').length,1,'Can close again');
      await action(shared.signModuleMonthlyClosureAction,{moduloCodigo:code,mes:9,ano:2026,returnTo:props.returnTo,senhaConfirmacao:'isolated-password'});
      assert(tables.fechamentoMensalModulo.some(r=>r.moduloCodigo===code && r.mes===9));
      // Existing endpoints must use the same generic-aware operation.
      const actions=load(tipo?'src/app/plano-limpeza/actions.ts':`src/app/${module}/actions.ts`);
      const fn=tipo ? actions[tipo==='DIARIO'?'reopenDailyMonthAction':'reopenWeeklyMonthAction'] : actions.reopenMonthAction;
      await action(fn,{mes:9,ano:2026,returnTo:props.returnTo});
      assert(!tables.fechamentoMensalModulo.some(r=>r.moduloCodigo===code && r.mes===9));
      await action(shared.reopenModuleMonthlyClosureAction,{moduloCodigo:code,mes:9,ano:2026,returnTo:props.returnTo},'error');
    }
    console.log('PASS: '+code+' generic/legacy/both, DEV UI/server, audit archive, reopen/refresh/reclose, old action, isolation.');
  }
  tables.fechamentoMensalModulo = [closure('temperatura')];
  tables.controleTemperaturaEquipamentoFechamento = [legacy()];
  failAudit=true;
  const before=JSON.stringify(tables);
  await assert.rejects(()=>reopenOperationalMonth({user:actor,moduleCode:'temperatura',mes:9,ano:2026}),/Audit unavailable/);
  assert.equal(JSON.stringify(tables),before,'Audit failure rolls back entire operation');failAudit=false;
  failRemove=true;
  await assert.rejects(()=>reopenOperationalMonth({user:actor,moduleCode:'temperatura',mes:9,ano:2026}),/Removal unavailable/);
  assert.equal(JSON.stringify(tables),before,'Later failure rolls back legacy status and audit');failRemove=false;
  for(const mes of [0,13,1.2,NaN]) await assert.rejects(()=>reopenOperationalMonth({user:actor,moduleCode:'temperatura',mes,ano:2026}),/válidos/);
  const invalid=await action(shared.reopenModuleMonthlyClosureAction,{moduloCodigo:'invalid',mes:9,ano:2026},'error');
  assert(invalid.get('feedback'));
  assert(revalidated.includes('/'));assert(revalidated.includes('/relatorios'));assert(revalidated.includes('/api/dashboard/insights'));

  // The confirmation contains the actual server form, independent of external form IDs.
  let open=false;
  mocks.set('react',{...require('react'),useState:()=>[open,(next)=>{open=next;}]});
  delete require.cache[require.resolve(path.join(root,'src/components/historico/reopen-month-form.tsx'))];
  const {ReopenMonthForm}=load('src/components/historico/reopen-month-form.tsx');
  const props={moduleCode:'temperatura',month:9,year:2026,returnTo:'/controle-temperatura-equipamentos/historico?filtroMes=9&filtroAno=2026'};
  const button=elements(ReopenMonthForm(props),n=>n.type==='button')[0];button.props.onClick();
  const modal=ReopenMonthForm(props);
  assert.equal(elements(modal,n=>n.props?.role==='dialog').length,1);
  const form=elements(modal,n=>n.type==='form')[0];assert.equal(form.props.action,shared.reopenModuleMonthlyClosureAction);
  const hidden=Object.fromEntries(elements(form,n=>n.type==='input').map(n=>[n.props.name,String(n.props.value)]));
  assert.deepEqual(hidden,{moduloCodigo:'temperatura',mes:'9',ano:'2026',returnTo:props.returnTo});
  console.log('PASS: transaction rollback, invalid period/module feedback, dashboard/report invalidation, confirmation wired to action.');
  console.log('All monthly reopening tests passed. No database accessed or production closure reopened.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
