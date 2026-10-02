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
let signedIn = true;
class Redirect extends Error { constructor(url) { super('redirect'); this.url = url; } }
const revalidated = [];
mocks.set('next/cache', { revalidatePath(value) {revalidated.push(value);} });
mocks.set('next/navigation', { redirect(url) { throw new Redirect(url); } });
mocks.set('@/lib/redirect-error', { rethrowIfRedirectError(e) { if (e instanceof Redirect) throw e; } });
mocks.set('@/lib/auth-session', { getCurrentUser: async () => signedIn ? actor : null, getCurrentUserForAction: async () => { if (!signedIn) throw new Redirect('/login'); return actor; } });
mocks.set('@/lib/authz', new Proxy({}, { get: () => async () => {} }));

mocks.set('@/lib/rbac', { getRoleLabel: () => 'Teste', canAccessReports: () => true, canViewManagementSections: () => true, canManageModuleOptions: () => true, canDeleteOperationalRecords: () => true });
mocks.set('@/lib/image-upload', { parseImageUploadFromFormData: async () => null, hasStoredImage: () => false });
mocks.set('@/lib/local-image-storage', { saveTemperatureEquipmentEvidenceImage: async () => { throw Error('Unexpected upload'); } });
const dates = load('src/lib/date-time.ts');
const today = dates.getAppDate();
const date = (s) => new Date(`${s}T00:00:00Z`);
let failAudit = false;
let failUpdate = false;
let transactionQueue = Promise.resolve();
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
      if ('lt' in value && row[key] >= value.lt) return false;
      if ('notIn' in value && value.notIn.includes(row[key])) return false;
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
  if (model === '$executeRaw') return async (strings,...values) => { assert(strings.join('').includes('pg_advisory_xact_lock')); assert.equal(typeof values[0], 'string'); return []; };
  if (model === '$transaction') return async (callback,options) => {
    const previous = transactionQueue; let release; transactionQueue = new Promise(resolve => {release=resolve;}); await previous;
    if (options) assert.equal(options.isolationLevel,'Serializable');
    const backup = structuredClone(tables);
    try {return await callback(prisma);} catch(e) {for(const key of Object.keys(tables)) delete tables[key];Object.assign(tables,backup);throw e;} finally { release(); }
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
    update: async ({where,data}) => { if (model === "fechamentoMensalModulo" && failUpdate) throw Error("Update unavailable"); const row = rows.find((r) => matches(r,where)); assert(row); Object.assign(row,data); return row; },
    delete: async ({where}) => {  const index = rows.findIndex((r) => matches(r,where)); assert(index >= 0); return rows.splice(index,1)[0]; },
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
const closure = (moduloCodigo,mes=9) => ({id:mes,moduloCodigo,mes,ano:2026,status:'FECHADO',
  usuarioId:7,usuarioNomeSnapshot:'Supervisor anterior',usuarioPerfilSnapshot:'GERENTE',
  assinadoEm:date('2026-09-30'),criadoEm:date('2026-09-30'),
  observacao:'Assinatura original',indicadoresSnapshot:{registros:15}});
const legacy = (tipo,mes=9) => ({id:mes,mes,ano:2026,tipo,status:'ASSINADO',
  responsavelTecnico:'Supervisor legado',dataAssinatura:date('2026-09-30')});
const makeForm = (values) => {const form=new FormData();for(const [key,value] of Object.entries(values))form.set(key,String(value));return form;};
async function main() {
  const reopen = load('src/lib/monthly-reopening.ts');
  const periods = load('src/lib/monthly-periods.ts');
  const security = load('src/lib/monthly-period-permissions.ts');
  const actions = load('src/app/gerenciamento-periodos/actions.ts');
  const shared = load('src/app/historico-operacional/actions.ts');
  const Page = load('src/app/gerenciamento-periodos/[modulo]/page.tsx').default;
  const { MonthlyClosureSection } = load('src/components/historico/technical-signature.tsx');
  const daily = [{ id: 88, moduloCodigo: 'rastreabilidade', dataReferencia: date('2026-09-01'), usuarioNomeSnapshot:'Supervisor' }];
  const records = ['higienizacaoHortifruti','controleTemperaturaEquipamento','controleQualidadeOleoRegistro','controleBuffetAmostraRegistro','rastreabilidadeRecebimentoNota','planoLimpezaDiarioRegistro','planoLimpezaSemanalExecucao'];
  function reset(code,model,tipo,mode='both') {
    for(const key of Object.keys(tables)) delete tables[key];
    tables.fechamentoMensalModulo = [{...closure('outro_modulo'),id:90}, closure(code,8), ...(mode !== 'legacy' ? [closure(code)] : [])];
    tables[model] = [legacy(tipo,8), ...(mode !== 'generic' ? [legacy(tipo)] : [])];
    tables.assinaturaDiariaModulo = structuredClone(daily);
    tables.logAssinatura = [{ id: 1, observacao:'Original preservado' }];
    for(const record of records) tables[record] = [];
  }
  function seedRecords() {
    for(const model of records) tables[model] = [{id:1,data:date('2026-09-01'),dataExecucao:date('2026-09-01'),status:'ASSINADO',statusNota:'FINALIZADA'}];
  }
  for (const [code,module,model,tipo] of cases) {
    const reportModule = code === 'limpeza_diaria' ? 'plano-limpeza-diario' : code === 'limpeza_semanal' ? 'plano-limpeza-semanal' : module;
    for(const mode of ['generic','legacy','both']) {
      reset(code,model,tipo,mode);
      const prior = structuredClone(tables.fechamentoMensalModulo.find(p=>p.moduloCodigo===code&&p.mes===9));
      const untouched = JSON.stringify(tables.fechamentoMensalModulo.filter(p=>p.moduloCodigo!==code||p.mes!==9));
      assert(await reopen.isOperationalMonthClosed(code,9,2026));
      for(const role of ['GERENTE','NUTRICIONISTA','COLABORADOR']) {
        actor.perfil=role;
        await assert.rejects(()=>reopen.reopenOperationalMonth({user:actor,moduleCode:code,mes:9,ano:2026}),/DEV/);
      }
      actor.perfil='DEV';
      await action(actions.reopenPeriodAction,{moduloCodigo:code,mes:9,ano:2026,confirmacao:'sim'});
      const open = tables.fechamentoMensalModulo.find(p=>p.moduloCodigo===code&&p.mes===9);
      assert.equal(open.status,'REABERTO');
      assert(open.reabertoEm instanceof Date);assert.equal(open.reabertoPorNome,actor.nomeCompleto);
      if(prior) assert.equal(+open.assinadoEm,+prior.assinadoEm,'Previous signature retained');
      else assert.equal(open.usuarioPerfilSnapshot,null,'Legacy signer profile is unknown');
      assert.equal(JSON.stringify(tables.fechamentoMensalModulo.filter(p=>p.moduloCodigo!==code||p.mes!==9)),untouched);
      assert.deepEqual(tables.assinaturaDiariaModulo,daily);
      assert.equal(tables.logAssinatura[0].observacao,'Original preservado');
      assert.equal(JSON.parse(tables.logAssinatura.at(-1).observacao).operacao,'REABERTURA_MENSAL');
      assert.equal(await reopen.isOperationalMonthClosed(code,9,2026),false);
      assert.equal(await reopen.isOperationalMonthClosed(code,10,2026),false,'Current month stays open');
      await assert.rejects(()=>reopen.reopenOperationalMonth({user:actor,moduleCode:code,mes:8,ano:2026}),/09\/2026 já está reaberto/);
      const html = await report(reportModule);
      assert.match(html,/Reaberto/);assert(!html.includes('Fechamento mensal:</strong> Assinado digitalmente'));
      const beforeReload = JSON.stringify(open);
      delete require.cache[require.resolve(path.join(root,'src/lib/monthly-reopening.ts'))];
      assert.equal(await load('src/lib/monthly-reopening.ts').isOperationalMonthClosed(code,9,2026),false);
      assert.equal(JSON.stringify(open),beforeReload,'A new module load does not close the period');
      const page = await Page({params:Promise.resolve({modulo:code}),searchParams:Promise.resolve({})});
      assert.equal(elements(page,n=>n.type==='tr').length,3,'Both periods listed once with header');
      const props = {moduleCode:code,month:9,year:2026,returnTo:`/${module}/historico`,signedClosure:null,canSign:true,pendingDailySignatures:1,indicators:{}};
      assert.equal(elements(await MonthlyClosureSection(props),n=>n.type==='form').length,0,'Reopened month cannot close from history');
      await action(shared.signModuleMonthlyClosureAction,{moduloCodigo:code,mes:9,ano:2026,senhaConfirmacao:'valid'},'error');
      assert.equal(open.status,'REABERTO');
      seedRecords();
      if(code==='rastreabilidade') {
        tables.rastreabilidadeRecebimentoNota[0].statusNota='IMPORTADA';
        await action(actions.closePeriodAction,{moduloCodigo:code,mes:9,ano:2026,confirmacao:'sim',senhaConfirmacao:'valid'},'error');
        assert.equal(tables.fechamentoMensalModulo.find(p=>p.moduloCodigo===code&&p.mes===9).status,'REABERTO');
        tables.rastreabilidadeRecebimentoNota[0].statusNota='FINALIZADA';
      }
      if(code==='amostras') {
        tables.controleBuffetAmostraRegistro[0].status='PENDENTE';
        await action(actions.closePeriodAction,{moduloCodigo:code,mes:9,ano:2026,confirmacao:'sim',senhaConfirmacao:'valid'},'error');
        tables.controleBuffetAmostraRegistro[0].status='ASSINADO';
      }
      // Existing legacy actions must also refuse to close this reopened period.
      const oldActions = load(`src/app/${code.startsWith('limpeza_')?'plano-limpeza':module}/actions.ts`);
      const oldClose = code==='limpeza_diaria'?oldActions.closeDailyMonthAction:code==='limpeza_semanal'?oldActions.closeWeeklyMonthAction:oldActions.closeMonthAction;
      await action(oldClose,{mes:9,ano:2026,senhaConfirmacao:'valid'},'error');
      const actorBefore = {...actor}; actor.perfil='NUTRICIONISTA';
      assert(security.canCloseMonthlyPeriod(actor,code));
      await action(actions.closePeriodAction,{moduloCodigo:code,mes:9,ano:2026,confirmacao:'sim',senhaConfirmacao:'valid'});
      const closed = tables.fechamentoMensalModulo.find(p=>p.moduloCodigo===code&&p.mes===9);
      assert.equal(closed.status,'FECHADO'); assert.equal(closed.usuarioNomeSnapshot,actor.nomeCompleto);
      assert(+closed.assinadoEm > +date('2026-09-30'));
      assert(await reopen.isOperationalMonthClosed(code,9,2026));
      if(mode!=='generic') assert.equal(tables[model].find(p=>p.mes===9).status,'ASSINADO');
      assert.deepEqual(tables.assinaturaDiariaModulo,daily);
      assert.equal(JSON.parse(tables.logAssinatura.at(-1).observacao).operacao,'NOVO_FECHAMENTO_MENSAL');
      const opSnapshot=structuredClone(Object.fromEntries(records.map(key=>[key,tables[key]])));
      for(const key of records) tables[key]=[];
      assert.match(await report(reportModule),/Assinado digitalmente/);
      for(const key of records) tables[key]=opSnapshot[key];
      Object.assign(actor,actorBefore);
      await reopen.reopenOperationalMonth({user:actor,moduleCode:code,mes:8,ano:2026});
      assert.equal(tables.fechamentoMensalModulo.find(p=>p.moduloCodigo===code&&p.mes===8).status,'REABERTO');
    }
    process.stdout.write(`PASS ${code}: generic/legacy/both, state, permissions, audit, blockers, reclose, reports\n`);
  }
  reset('hortifruti','higienizacaoHortifrutiFechamento');
  actor.perfil='DEV';
  const simultaneous=await Promise.allSettled([8,9].map(mes=>reopen.reopenOperationalMonth({user:actor,moduleCode:'hortifruti',mes,ano:2026})));
  assert.equal(simultaneous.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(tables.fechamentoMensalModulo.filter(p=>p.moduloCodigo==='hortifruti'&&p.status==='REABERTO').length,1);
  tables.fechamentoMensalModulo.push({...closure('temperatura'),id:91});
  await reopen.reopenOperationalMonth({user:actor,moduleCode:'temperatura',mes:9,ano:2026});
  assert.equal(tables.fechamentoMensalModulo.filter(p=>p.status==='REABERTO').length,2,'Other module can reopen');
  for(const failure of ['audit','update']) {
    reset('hortifruti','higienizacaoHortifrutiFechamento');
    const snapshot=JSON.stringify(tables);failAudit=failure==='audit';failUpdate=failure==='update';
    await assert.rejects(()=>reopen.reopenOperationalMonth({user:actor,moduleCode:'hortifruti',mes:9,ano:2026}));
    failAudit=false;failUpdate=false;assert.equal(JSON.stringify(tables),snapshot,'Rollback restores all writes');
  }
  for(const role of ['COLABORADOR','GERENTE','NUTRICIONISTA']) {
    actor.perfil=role;
    assert.equal(security.canReopenMonthlyPeriod(actor,'rastreabilidade'),false);
    assert.equal(security.canViewMonthlyPeriods(actor,'rastreabilidade'),role!=='COLABORADOR');
  }
  const viewer={perfil:'GERENTE',perfilAcessoId:42,permissoes:['modulo.rastreabilidade.acessar','modulo.rastreabilidade.acessar_historico']};
  assert(security.canViewMonthlyPeriods(viewer,'rastreabilidade'));
  assert.equal(security.canCloseMonthlyPeriod(viewer,'rastreabilidade'),false);
  assert.equal(security.canReopenMonthlyPeriod(viewer,'rastreabilidade'),false);
  const closeOnly={...viewer,permissoes:['modulo.rastreabilidade.acessar','modulo.rastreabilidade.fechar_mes']};
  assert(security.canViewMonthlyPeriods(closeOnly,'rastreabilidade'));
  assert(security.canCloseMonthlyPeriod(closeOnly,'rastreabilidade'),'Closing does not imply supervisor signing permission');
  actor.perfil='COLABORADOR';
  await assert.rejects(()=>Page({params:Promise.resolve({modulo:'rastreabilidade'}),searchParams:Promise.resolve({})}),e=>e instanceof Redirect && e.url==='/acesso-negado');
  await action(actions.reopenPeriodAction,{moduloCodigo:'rastreabilidade',mes:9,ano:2026,confirmacao:'sim'},'error');
  await action(actions.closePeriodAction,{moduloCodigo:'rastreabilidade',mes:9,ano:2026,confirmacao:'sim',senhaConfirmacao:'valid'},'error');
  signedIn=false;
  await assert.rejects(()=>Page({params:Promise.resolve({modulo:'rastreabilidade'}),searchParams:Promise.resolve({})}),e=>e instanceof Redirect && e.url==='/login');
  await assert.rejects(()=>actions.reopenPeriodAction(makeForm({moduloCodigo:'rastreabilidade',mes:9,ano:2026,confirmacao:'sim'})),e=>e instanceof Redirect && e.url==='/login');
  signedIn=true;
  const noteAccess=load('src/app/rastreabilidade-recebimento/note-permissions.ts');
  const collaborator={perfil:'COLABORADOR'};
  const args={user:collaborator,noteDate:date('2026-09-01'),today,monthSigned:true,statusNota:'IMPORTADA'};
  assert.equal(noteAccess.getReceivingNoteEditAccessReason(args),'MONTH_SIGNED');
  assert.equal(noteAccess.getReceivingNoteEditAccessReason({...args,monthSigned:false}),'EDITABLE');
  assert.equal(noteAccess.getReceivingNoteEditAccessReason({...args,monthSigned:false,user:{perfil:'COLABORADOR',perfilAcessoId:42,permissoes:[]}}),'NO_PERMISSION');
  actor.perfil='DEV';
  await action(actions.reopenPeriodAction,{moduloCodigo:'hortifruti',mes:9,ano:2026},'error');
  await action(actions.reopenPeriodAction,{moduloCodigo:'invalido',mes:9,ano:2026,confirmacao:'sim'},'error');
  await action(actions.reopenPeriodAction,{moduloCodigo:'__proto__',mes:9,ano:2026,confirmacao:'sim'},'error');
  await action(actions.reopenPeriodAction,{moduloCodigo:'hortifruti',mes:1.5,ano:2026,confirmacao:'sim'},'error');
  const migration=fs.readFileSync(path.join(root,'prisma/migrations/20261002000200_gerenciamento_periodos/migration.sql'),'utf8');
  assert.match(migration,/UNIQUE INDEX[\s\S]*WHERE "status" = 'REABERTO'/);
  assert(!/DELETE|TRUNCATE|DROP TABLE/i.test(migration));
  reset('rastreabilidade','rastreabilidadeRecebimentoFechamento');
  const note={id:1,data:date('2026-09-01'),createdAt:date('2026-09-01'),statusNota:'IMPORTADA',origemXml:true,fornecedor:'Fornecedor sintético',notaFiscal:'123',responsavelGeral:null,_count:{itens:1}};
  const item={id:1,notaId:1,data:note.data,produto:'Bebida sintética',categoriaId:1,statusGeral:'PENDENTE',quantidadeComprada:null};
  note.itens=[item];tables.rastreabilidadeRecebimentoNota=[note];tables.rastreabilidadeRecebimentoRegistro=[item];
  tables.rastreabilidadeRecebimentoCategoria=[{id:1,nome:'Geral',ativo:true,temperaturaMaxima:25}];
  const receiving=load('src/app/rastreabilidade-recebimento/actions.ts');
  const edit=makeForm({notaId:1,'item-1-produto':item.produto,'item-1-lote':'L-123','item-1-dataFabricacao':'2026-09-01','item-1-dataValidade':'2027-09-01','item-1-sif':'NA','item-1-temperaturaTipo':'AMBIENTE','item-1-transporteEntregador':'CONFORME','item-1-aspectoSensorial':'CONFORME','item-1-embalagem':'CONFORME'});
  actor.perfil='COLABORADOR';
  let result=await receiving.saveNotaItemsStateAction({status:'idle',message:''},edit);
  assert.equal(result.status,'error');assert.match(result.message,/mês.*fechado/);
  actor.perfil='DEV';await reopen.reopenOperationalMonth({user:actor,moduleCode:'rastreabilidade',mes:9,ano:2026});
  actor.perfil='COLABORADOR';
  result=await receiving.saveNotaItemsStateAction({status:'idle',message:''},edit);
  assert.equal(result.status,'success',result.message);assert.equal(note.statusNota,'EM_CONFERENCIA');assert.equal(item.responsavelRecebimento,actor.nomeCompleto);
  assert.equal(+note.data,+date('2026-09-01'));assert.equal(+item.data,+note.data);assert.deepEqual(tables.assinaturaDiariaModulo,daily);
  const detail=await load('src/app/rastreabilidade-recebimento/nota/[id]/page.tsx').default({params:Promise.resolve({id:'1'}),searchParams:Promise.resolve({})});
  assert.equal(elements(detail,n=>n.type?.name==='NoteItemsForm')[0].props.readOnlyMode,false);
  const listing=await load('src/app/rastreabilidade-recebimento/page.tsx').default({searchParams:Promise.resolve({})});
  assert(elements(listing,n=>n.props?.href==='/rastreabilidade-recebimento/nota/1' && n.props.children==='Conferir Nota').length);
  const dashboard=load('src/app/dashboard/service.ts');
  let card=await dashboard.buildMonthlyClosingCard({range:{start:date('2026-09-01'),end:date('2026-09-30')}});
  assert.equal(card.completed,0);assert.equal(card.pending,7);
  actor.perfil='NUTRICIONISTA';
  await assert.rejects(()=>periods.closeReopenedOperationalMonth({user:actor,moduleCode:'rastreabilidade',mes:9,ano:2026}),/notas pendentes/);
  tables.rastreabilidadeRecebimentoNota[0].statusNota='FINALIZADA';
  await periods.closeReopenedOperationalMonth({user:actor,moduleCode:'rastreabilidade',mes:9,ano:2026});
  card=await dashboard.buildMonthlyClosingCard({range:{start:date('2026-09-01'),end:date('2026-09-30')}});
  assert.equal(card.completed,1);assert.equal(card.pending,6);
  actor.perfil='COLABORADOR';
  result=await receiving.saveNotaItemsStateAction({status:'idle',message:''},edit);
  assert.equal(result.status,'error');assert.match(result.message,/fechado/);
  console.log('PASS actual receiving action: closed blocks collaborator, reopening permits conference and saves original dates; detail and pending list accessible; daily signatures unchanged; dashboard follows reopened/reclosed state; no-session/direct access denied');
  console.log('PASS simultaneous requests in serialized adapter, module isolation, rollback, actual permission rules, note access, input validation, migration constraints');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
