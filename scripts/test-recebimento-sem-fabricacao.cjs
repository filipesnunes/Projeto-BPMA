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
const actor = { id: 1, nomeCompleto: 'Responsável Teste', perfil: 'GERENTE' };
class Redirect extends Error { constructor(url) { super('redirect'); this.url = url; } }
mocks.set('next/cache', { revalidatePath() {} });
mocks.set('next/navigation', { redirect(url) { throw new Redirect(url); } });
mocks.set('@/lib/redirect-error', { rethrowIfRedirectError(e) { if (e instanceof Redirect) throw e; } });
mocks.set('@/lib/auth-session', { getCurrentUser: async () => actor, getCurrentUserForAction: async () => actor });
mocks.set('@/lib/authz', new Proxy({}, { get: () => async () => {} }));
mocks.set('@/lib/permissions', { hasPermission: () => true, hasAnyPermission: () => true, canEditRecordDate: () => true });
mocks.set('@/lib/rbac', { getRoleLabel: () => 'Gerente', canAccessReports: () => true, canViewManagementSections: () => true, canManageModuleOptions: () => true, canDeleteOperationalRecords: () => true });
mocks.set('@/lib/image-upload', { parseImageUploadFromFormData: async () => null, hasStoredImage: () => false });
mocks.set('@/lib/local-image-storage', { saveTemperatureEquipmentEvidenceImage: async () => { throw Error('Unexpected upload'); } });
const dates = load('src/lib/date-time.ts');
const today = dates.getAppDate();
const date = (s) => new Date(`${s}T00:00:00Z`);
const tables = {};
const queries = [];
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some((clause) => matches(row, clause));
    if (key === 'AND') return (Array.isArray(value) ? value : [value]).every((clause) => matches(row, clause));
    if (key === 'NOT') return !matches(row, value);
    if (key === 'mes_ano') return row.mes === value.mes && row.ano === value.ano;
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
const recordDefaults = {semDataFabricacao:false, validadeNaoAplicavel:false, dataFabricacao:null, dataValidade:null, quantidadeComprada:null, quantidadeTributavel:null, temperatura:null, sif:null, acaoCorretiva:null, observacoes:null};
const prisma = new Proxy({}, { get(_target, model) {
  if (model === '$transaction') return async (callback) => callback(prisma);
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
    return found.map((row) => {
      const related = {...row};
      if (model === 'rastreabilidadeRecebimentoNota') {
        related.itens = (tables.rastreabilidadeRecebimentoRegistro ?? []).filter((item) => item.notaId === row.id);
        related._count = {itens:related.itens.length};
      }
      if (model === 'rastreabilidadeRecebimentoRegistro') related.nota = (tables.rastreabilidadeRecebimentoNota ?? []).find((note) => note.id === row.notaId);
      return selected(related, args.select);
    });
  };
  return {
    findMany: async (args) => find(args), findFirst: async (args) => find(args)[0] ?? null,
    findUnique: async (args) => find(args)[0] ?? null,
    count: async (args) => find(args).length,
    aggregate: async () => ({ _min: { data: today }, _max: { data: today } }),
    createMany: async ({data}) => { for (const entry of data) { assert(!Object.hasOwn(entry,'semDataFabricacao'), 'XML must use the safe default'); rows.push({id:rows.length+1,...recordDefaults,...entry}); } return {count:data.length}; },
    create: async ({data}) => { const row = { ...recordDefaults, id: rows.length + 1, createdAt: new Date(), updatedAt: new Date(), ...data }; rows.push(row); return row; },
    update: async ({where,data}) => { const row = rows.find((r) => matches(r,where)); assert(row); Object.assign(row,data); return row; },
    delete: async ({where}) => { const index = rows.findIndex((r) => matches(r,where)); assert(index >= 0); return rows.splice(index,1)[0]; },
    upsert: async ({where,create,update}) => { let row = rows.find((r) => matches(r,where)); if (row) Object.assign(row,update); else { row = {id:rows.length+1,...create}; rows.push(row); } return row; }
  };
} });
mocks.set('@/lib/prisma', { prisma });
const { NextRequest } = require('next/server');
async function action(fn, values, expected = 'success') {
  const form = new FormData(); for (const [key,value] of Object.entries(values)) form.set(key,value instanceof File ? value : String(value));
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
const initial = {status:'idle',message:''};
const base = {
  fornecedor:'Fornecedor Teste', notaFiscal:'123', produto:'Bebida Teste', lote:'L-123',
  dataFabricacao:'2026-09-01', dataValidade:'2027-09-01', sif:'NA', temperaturaTipo:'AMBIENTE',
  transporteEntregador:'CONFORME', aspectoSensorial:'CONFORME', embalagem:'CONFORME'
};
const formData = (values) => {
  const form = new FormData();
  for (const [key,value] of Object.entries(values)) if (value !== undefined) form.set(key,String(value));
  return form;
};
const editForm = (item, overrides = {}, intent = 'save') => formData({notaId:item.notaId,intent,
  ...Object.fromEntries(Object.entries({...base,...overrides}).map(([key,value])=>[`item-${item.id}-${key}`,value]))
});
function visibleText(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node !== 'object') return String(node);
  if (Array.isArray(node)) return node.map(visibleText).join(' ');
  return visibleText(node.props?.children);
}
async function main() {
  tables.rastreabilidadeRecebimentoCategoria = [{id:1,nome:'Geral',ativo:true,temperaturaMaxima:25}];
  const actions = load('src/app/rastreabilidade-recebimento/actions.ts');
  const utils = load('src/app/rastreabilidade-recebimento/utils.ts');
  for (const semDataFabricacao of [false,true]) for (const validadeNaoAplicavel of [false,true]) {
    await action(actions.createManualNoteAction,{...base,semDataFabricacao,validadeNaoAplicavel});
    const item = tables.rastreabilidadeRecebimentoRegistro.at(-1);
    assert.equal(item.semDataFabricacao,semDataFabricacao);
    assert.equal(item.validadeNaoAplicavel,validadeNaoAplicavel);
    assert.equal(item.dataFabricacao === null,semDataFabricacao);
    assert.equal(item.dataValidade === null,validadeNaoAplicavel);
    if (!semDataFabricacao) assert.equal(utils.formatDateInput(item.dataFabricacao),base.dataFabricacao);
    if (!validadeNaoAplicavel) assert.equal(utils.formatDateInput(item.dataValidade),base.dataValidade);
  }
  const scenarios = structuredClone(tables.rastreabilidadeRecebimentoRegistro);
  for (const value of ['', 'invalid']) {
    const result = await actions.createManualNoteStateAction(initial,formData({...base,dataFabricacao:value}));
    assert.equal(result.status,'error'); assert.equal(result.invalidField,'dataFabricacao');
  }
  assert.equal(tables.rastreabilidadeRecebimentoRegistro.length,4);
  console.log('PASS: four date combinations, explicit flags, real dates/null, missing and invalid date rejected.');

  const item = tables.rastreabilidadeRecebimentoRegistro[0];
  let result = await actions.saveNotaItemsStateAction(initial,editForm(item,{semDataFabricacao:true,dataFabricacao:'invalid'}));
  assert.equal(result.status,'success',result.message);
  assert.equal(item.dataFabricacao,null); assert.equal(item.semDataFabricacao,true);
  assert.equal(item.validadeNaoAplicavel,false);
  const before = JSON.stringify(item);
  result = await actions.saveNotaItemsStateAction(initial,editForm(item,{dataFabricacao:''}));
  assert.equal(result.status,'error'); assert.equal(result.invalidField,'dataFabricacao');
  assert.equal(result.invalidRowKey,`item-${item.id}`); assert.equal(JSON.stringify(item),before);
  result = await actions.saveNotaItemsStateAction(initial,editForm(item));
  assert.equal(result.status,'success'); assert.equal(item.semDataFabricacao,false);
  assert.equal(utils.formatDateInput(item.dataFabricacao),base.dataFabricacao);
  await action(actions.saveNotaItemsAction,Object.fromEntries(editForm(item,{semDataFabricacao:true,validadeNaoAplicavel:true})));
  await action(actions.finalizeNotaAction,{notaId:item.notaId});
  assert.equal(item.semDataFabricacao,true); assert.equal(item.dataFabricacao,null);
  assert.equal(item.validadeNaoAplicavel,true); assert.equal(item.dataValidade,null);
  result = await actions.saveNotaItemsStateAction(initial,editForm(item));
  assert.equal(result.status,'error'); assert.match(result.message,/finalizadas/);
  const second = tables.rastreabilidadeRecebimentoRegistro[1];
  await action((form) => actions.saveNotaItemsStateAction(initial,form),Object.fromEntries(editForm(second,{semDataFabricacao:true},'finalize')));
  assert.equal(tables.rastreabilidadeRecebimentoNota[1].statusNota,'FINALIZADA');
  console.log('PASS: edit on/off, date re-required without partial save, both finalization paths, finalized note protection.');

  const xml = `<NFe><infNFe><ide><nNF>999</nNF></ide><emit><xNome>Fornecedor XML</xNome></emit>
    <det nItem="1"><prod><xProd>Com fabricação XML</xProd><rastro><nLote>XML1</nLote><dFab>2026-09-01</dFab><dVal>2027-09-01</dVal></rastro></prod></det>
    <det nItem="2"><prod><xProd>Sem informação XML</xProd></prod></det></infNFe></NFe>`;
  await action(actions.importXmlAction,{xmlFile:new File([xml],'recebimento.xml',{type:'application/xml'})});
  const imported = tables.rastreabilidadeRecebimentoRegistro.slice(-2);
  assert.equal(utils.formatDateInput(imported[0].dataFabricacao),base.dataFabricacao);
  assert.equal(imported[1].dataFabricacao,null);
  assert(imported.every((row)=>row.semDataFabricacao === false));
  result = await actions.saveNotaItemsStateAction(initial,formData({notaId:imported[0].notaId,
    ...Object.fromEntries(imported.flatMap((row)=>Object.entries({...base,dataFabricacao:row.dataFabricacao ? base.dataFabricacao : ''}).map(([key,value])=>[`item-${row.id}-${key}`,value])))
  }));
  assert.equal(result.status,'error'); assert.equal(result.invalidRowKey,`item-${imported[1].id}`);
  assert.equal(result.invalidField,'dataFabricacao');
  console.log('PASS: XML preserves supplied dates; absent date does not imply explicit exemption.');

  tables.rastreabilidadeRecebimentoRegistro = scenarios;
  const legacy = {...scenarios[0],id:100,produto:'Registro antigo',dataFabricacao:null};
  delete legacy.semDataFabricacao;
  tables.rastreabilidadeRecebimentoRegistro.push(legacy);
  assert.equal(utils.formatManufacturingDateDisplay(null,undefined),'-');
  const month = dates.getAppMonthYear(today);
  const html = await report('rastreabilidade-recebimento',month.mes,month.ano);
  assert.equal((html.match(/Sem data de fabricação/g) ?? []).length,2);
  assert(html.includes('01/09/2026')); assert(html.includes('Não se aplica'));
  assert(!html.includes('undefined')); assert(!html.includes('>null<')); assert(html.includes('window.print()'));
  fs.writeFileSync(path.join(outputDir,'recebimento-sem-fabricacao.html'),html);
  const generic = await load('src/app/relatorios/report-service.ts').generateReport({
    moduleId:'rastreabilidade-recebimento',reportId:'itens-recebidos',
    searchParams:{mes:String(month.mes),ano:String(month.ano)},user:actor
  });
  assert.equal(generic.rows.filter((row)=>row.fabricacao === 'Sem data de fabricação').length,2);
  assert.equal(generic.rows.find((row)=>row.produto === 'Registro antigo').fabricacao,'-');
  const history = await load('src/app/rastreabilidade-recebimento/historico/page.tsx').default({searchParams:Promise.resolve({dia:dates.formatAppDateInput(today)})});
  assert.equal((visibleText(history).match(/Sem data de fabricação/g) ?? []).length,2);
  assert(visibleText(history).includes('Registro antigo'));
  const listing = await load('src/app/rastreabilidade-recebimento/page.tsx').default({searchParams:Promise.resolve({filtroItemProduto:'Bebida'})});
  assert(visibleText(listing).includes('Sem data de fabricação'));
  const detail = await load('src/app/rastreabilidade-recebimento/nota/[id]/page.tsx').default({params:Promise.resolve({id:'3'}),searchParams:Promise.resolve({})});
  const detailForm = elements(detail,(node)=>node.type?.name === 'NoteItemsForm')[0];
  assert(detailForm); assert.equal(detailForm.props.rows[0].semDataFabricacao,true);
  console.log('PASS: listing, history, detail mapping, monthly/print report, generic export, and legacy empty date.');

  // Exercise actual client handlers with isolated hook state, without a browser or database.
  let state = [], cursor = 0;
  const react = require('react');
  mocks.set('react',{...react,useState(value) {
    const index = cursor++;
    if (!(index in state)) state[index] = typeof value === 'function' ? value() : value;
    return [state[index],(next)=>{state[index] = typeof next === 'function' ? next(state[index]) : next;}];
  },useActionState:()=>[initial,()=>{}],useEffect:()=>{}});
  mocks.set('react-dom',{useFormStatus:()=>({pending:false})});
  mocks.set('next/navigation',{useRouter:()=>({refresh(){}})});
  const formFiles = ['src/app/rastreabilidade-recebimento/nota/nova/manual-note-form.tsx','src/app/rastreabilidade-recebimento/nota/[id]/note-items-form.tsx'];
  for (const file of formFiles) delete require.cache[require.resolve(path.join(root,file))];
  const {ManualNoteForm} = load(formFiles[0]);
  const {NoteItemsForm} = load(formFiles[1]);
  const input = (tree,name) => {
    const found = elements(tree,(node)=>node.type === 'input' && node.props.name === name)[0];
    assert(found,`Input ${name} exists`); return found.props;
  };
  const exercise = (render,prefix='') => {
    state = [];
    const draw = () => {cursor=0;return render();};
    let tree = draw();
    input(tree,`${prefix}dataFabricacao`).onChange({currentTarget:{value:base.dataFabricacao}});
    tree = draw(); assert.equal(input(tree,`${prefix}dataFabricacao`).value,base.dataFabricacao);
    input(tree,`${prefix}semDataFabricacao`).onChange({currentTarget:{checked:true}});
    tree = draw();
    assert.equal(input(tree,`${prefix}dataFabricacao`).value,'');
    assert.equal(input(tree,`${prefix}dataFabricacao`).disabled,true);
    assert.equal(input(tree,`${prefix}dataFabricacao`).required,false);
    assert.equal(input(tree,`${prefix}validadeNaoAplicavel`).checked,false);
    input(tree,`${prefix}semDataFabricacao`).onChange({currentTarget:{checked:false}});
    tree = draw();
    assert.equal(input(tree,`${prefix}dataFabricacao`).value,'');
    assert.equal(input(tree,`${prefix}dataFabricacao`).disabled,false);
    assert.equal(input(tree,`${prefix}dataFabricacao`).required,true);
    return tree;
  };
  exercise(()=>ManualNoteForm({responsavelLogado:actor.nomeCompleto,inputClassName:'bpma-input'}));
  const props = {...detailForm.props,readOnlyMode:false,rows:[
    {...detailForm.props.rows[0],semDataFabricacao:false,validadeNaoAplicavel:false},
    {...detailForm.props.rows[0],id:101,semDataFabricacao:false,validadeNaoAplicavel:false,dataFabricacao:base.dataFabricacao}
  ]};
  const tree = exercise(()=>NoteItemsForm(props),'item-3-');
  assert.equal(input(tree,'item-101-dataFabricacao').value,base.dataFabricacao);
  assert.equal(input(tree,'item-101-semDataFabricacao').checked,false);
  state=[];cursor=0;
  const readonly = NoteItemsForm({...detailForm.props,readOnlyMode:true});
  assert(visibleText(readonly).includes('Sem data de fabricação'));
  assert.equal(input(readonly,'item-3-semDataFabricacao').disabled,true);
  console.log('PASS: manual/edit UI clears, disables, re-enables and requires date; flags and rows independent; readonly display.');

  const migration = fs.readFileSync(path.join(root,'prisma/migrations/20260924000100_recebimento_sem_data_fabricacao/migration.sql'),'utf8');
  assert.match(migration,/"semDataFabricacao" BOOLEAN NOT NULL DEFAULT false/);
  assert(!/\b(UPDATE|DELETE|DROP)\b/i.test(migration));
  console.log('All receiving manufacturing-date checks passed. No database accessed.');
}
main().catch((error)=>{console.error(error);process.exitCode=1;});
