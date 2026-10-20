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
const actor = { id: 1, nomeCompleto: 'Responsável Teste', perfil: 'ADMIN' };
class Redirect extends Error { constructor(url) { super('redirect'); this.url = url; } }
mocks.set('next/cache', { revalidatePath() {} });
mocks.set('next/navigation', { redirect(url) { throw new Redirect(url); } });
mocks.set('@/lib/redirect-error', { rethrowIfRedirectError(e) { if (e instanceof Redirect) throw e; } });
mocks.set('@/lib/auth-session', { getCurrentUser: async () => actor, getCurrentUserForAction: async () => actor });
mocks.set('@/lib/authz', new Proxy({}, { get: () => async () => {} }));
mocks.set('@/lib/permissions', { hasPermission: () => true, hasAnyPermission: () => true, canEditRecordDate: () => true });
mocks.set('@/lib/rbac', { canAccessReports: () => true, canViewManagementSections: () => true, canManageModuleOptions: () => true, canDeleteOperationalRecords: () => true });
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
    if (['mes_ano','tipo_mes_ano','moduloCodigo_ano_mes'].includes(key)) return matches(row,value);
    if (value instanceof Date) return +row[key] === +value;
    if (value && typeof value === 'object') {
      if ('not' in value && row[key] === value.not) return false;
      if ('gte' in value && row[key] < value.gte) return false;
      if ('lte' in value && row[key] > value.lte) return false;
      if ('lt' in value && row[key] >= value.lt) return false;
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
  if(model === '$executeRaw') return async()=>[];
  if(model === '$transaction') return async(callback)=>callback(prisma);
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
    create: async ({data}) => { const row = { id: rows.length + 1, createdAt: new Date(), updatedAt: new Date(), ...data }; rows.push(row); return row; },
    update: async ({where,data}) => { const row = rows.find((r) => matches(r,where)); assert(row); Object.assign(row,data); return row; },
    delete: async ({where}) => { const index = rows.findIndex((r) => matches(r,where)); assert(index >= 0); return rows.splice(index,1)[0]; },
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
async function main() {
  const now=new Date('2026-10-19T18:00:00Z'); // 15:00 in the operational timezone.
  const realDate=dates.getAppDate;
  dates.getAppNow=()=>now;dates.getAppDate=value=>realDate(value??now);
  actor.perfil='GERENTE';
  const utils=load('src/lib/procedure-time.ts');
  tables.controleTemperaturaEquipamentoOpcao=['A','B','C','D'].map((nome,i)=>({id:i+1,nome,tipo:'EQUIPAMENTO',ativo:true,categoriaEquipamento:'REFRIGERACAO',turnoManha:true,turnoTarde:true}));
  tables.controleTemperaturaCategoriaParametro=[{id:1,categoria:'REFRIGERACAO',isActive:true}];
  tables.controleTemperaturaCategoriaRegra=[{id:1,categoriaId:1,categoria:{categoria:'REFRIGERACAO'},temperaturaMin:null,temperaturaMax:4,status:'CONFORME',acaoCorretiva:'Regra preservada',ordem:1,isActive:true}];
  tables.moduloConfiguracao=[{modulo:'CONTROLE_TEMPERATURA_EQUIPAMENTOS',exigirFotoEmAlertaCritico:false}];
  tables.higienizacaoHortifrutiOpcao=[{id:1,tipo:'HORTIFRUTI',nome:'Alface',ativo:true},{id:2,tipo:'PRODUTO_UTILIZADO',nome:'Sanitizante',ativo:true}];
  const temperature=load('src/app/controle-temperatura-equipamentos/actions.ts');
  const hort=load('src/app/higienizacao-hortifruti/actions.ts');
  const oil=load('src/app/controle-qualidade-oleo/actions.ts');
  const temp={equipamento:'A',turno:'MANHA',temperaturaAferida:4,data:'2026-10-19'};
  const freshBefore=new Date();
  await action(temperature.createRegistroAction,{...temp,horarioAfericao:'23:59',createdAt:'2000-01-01',responsavel:'Falso'});
  const current=tables.controleTemperaturaEquipamento[0];
  assert.equal(current.horarioAfericao,'15:00','Current-day time remains automatic');
  assert(current.createdAt>=freshBefore);assert.equal(current.responsavel,actor.nomeCompleto);
  await action(temperature.createRegistroAction,{...temp,data:'2026-10-18',horarioAfericao:'07:35'});
  await action(temperature.createRegistroAction,{...temp,data:'2026-10-18',turno:'TARDE',horarioAfericao:'14:47'});
  const morning=tables.controleTemperaturaEquipamento[1],afternoon=tables.controleTemperaturaEquipamento[2];
  assert.equal(morning.horarioAfericao,'07:35');assert.equal(afternoon.horarioAfericao,'14:47');
  assert.equal(dates.formatAppDateInput(morning.data),'2026-10-18');assert(morning.createdAt>=freshBefore);
  await action(temperature.createRegistroAction,{...temp,equipamento:'B',data:'2026-10-18',horarioNaoInformado:true,justificativaHorario:'Anotação original sem horário legível.'});
  const unknown=tables.controleTemperaturaEquipamento[3];assert.equal(unknown.horarioAfericao,null);assert.equal(unknown.horarioNaoInformado,true);
  assert(unknown.justificativaHorario.includes('Anotação'));
  const tempCount=tables.controleTemperaturaEquipamento.length;
  for(const extra of [{},{horarioAfericao:'7:35'},{horarioAfericao:'24:00'},{horarioAfericao:'12:60'},{horarioNaoInformado:true},{horarioNaoInformado:true,justificativaHorario:'   '}]){
    await action(temperature.createRegistroAction,{...temp,equipamento:'C',data:'2026-10-18',...extra},'error');
  }
  await action(temperature.createRegistroAction,{...temp,data:'2026-10-18',horarioAfericao:'08:35'},'error');
  await action(temperature.createRegistroAction,{...temp,equipamento:'C',horarioNaoInformado:true,justificativaHorario:'Não permitido hoje'},'error');
  assert.equal(tables.controleTemperaturaEquipamento.length,tempCount);
  await action(temperature.createRegistroAction,{...temp,equipamento:'D',data:'2026-10-18',statusOperacionalEquipamento:'MANUTENCAO',observacaoStatusOperacional:'Em manutenção'});
  assert.equal(tables.controleTemperaturaEquipamento.at(-1).horarioAfericao,null,'Maintenance never invents a measurement time');

  const horticulture={data:'2026-10-19',hortifruti:'Alface',produtoUtilizado:'Sanitizante',inicioProcesso:'08:10',terminoProcesso:'08:25'};
  await action(hort.createRegistroAction,horticulture);
  assert.equal(tables.higienizacaoHortifruti[0].terminoProcesso,'08:12');assert.equal(tables.higienizacaoHortifruti[0].duracaoMinutos,2);
  await action(hort.createRegistroAction,{...horticulture,data:'2026-10-18',createdAt:'2000-01-01',updatedAt:'2000-01-01'});
  const retro=tables.higienizacaoHortifruti[1];assert.equal(retro.inicioProcesso,'08:10');assert.equal(retro.terminoProcesso,'08:25');assert.equal(retro.duracaoMinutos,15);
  assert(retro.createdAt>=freshBefore);
  assert(retro.updatedAt>=freshBefore,'Updated timestamp is not supplied by the client');
  await action(hort.createRegistroAction,{...horticulture,data:'2026-10-18',horarioNaoInformado:true,justificativaHorario:'Procedimento realizado, horários não anotados.'});
  const unknownHort=tables.higienizacaoHortifruti[2];
  assert.deepEqual([unknownHort.inicioProcesso,unknownHort.terminoProcesso,unknownHort.duracaoMinutos],[null,null,null]);
  const hortCount=tables.higienizacaoHortifruti.length;
  for(const extra of [{terminoProcesso:'08:09'},{terminoProcesso:''},{inicioProcesso:'25:10'},{horarioNaoInformado:true,justificativaHorario:''}]){
    await action(hort.createRegistroAction,{...horticulture,data:'2026-10-18',...extra},'error');
  }
  await action(hort.createRegistroAction,{...horticulture,inicioProcesso:'15:01'},'error');
  assert.equal(tables.higienizacaoHortifruti.length,hortCount);
  await action(oil.createRegistroAction,{data:'2026-10-18',temperatura:170});
  assert.equal(dates.formatAppDateInput(tables.controleQualidadeOleoRegistro[0].data),'2026-10-18');
  assert(!('horarioAfericao' in tables.controleQualidadeOleoRegistro[0]),'Oil has no new time field');
  const legacyHort={id:99,data:date('2026-10-16'),hortifruti:'Alface',produtoUtilizado:'Sanitizante',inicioProcesso:'07:00',terminoProcesso:'07:15',duracaoMinutos:15,responsavel:'Responsável anterior',horarioNaoInformado:false,createdAt:new Date('2026-10-16T11:00:00Z'),updatedAt:new Date('2026-10-16T11:00:00Z')};
  tables.higienizacaoHortifruti.push(legacyHort);
  tables.controleTemperaturaEquipamento.push({...current,id:90,equipamento:'C',data:date('2026-10-16'),horarioAfericao:null,createdAt:new Date('2026-10-16T11:23:00Z')});
  for(const [fn,values] of [[temperature.createRegistroAction,{...temp,equipamento:'C'}],[hort.createRegistroAction,horticulture],[oil.createRegistroAction,{temperatura:170}]]){
    await action(fn,{...values,data:'2026-10-20'},'error');
  }
  assert.equal(utils.temperatureMeasurementTime({data:date('2026-10-18'),createdAt:now}),'-','Legacy retroactive rows do not acquire an invented time');
  assert.equal(utils.temperatureMeasurementTime({data:date('2026-10-19'),createdAt:now}),'15:00','Legacy on-time rows retain the existing fallback');
  const temperatureSnapshot=JSON.stringify(tables.controleTemperaturaEquipamento),hortSnapshot=JSON.stringify(tables.higienizacaoHortifruti);
  const tempHtml=await report('controle-temperatura-equipamentos',10,2026),hortHtml=await report('higienizacao-hortifruti',10,2026);
  for(const value of ['07:35','14:47','08:23','Horário não informado','Anotação original sem horário legível.'])assert(tempHtml.includes(value),value);
  for(const value of ['08:10','08:25','07:00','07:15','Horário não informado','horários não anotados.'])assert(hortHtml.includes(value),value);
  fs.writeFileSync(path.join(outputDir,'retroactive-temperature.html'),tempHtml);fs.writeFileSync(path.join(outputDir,'retroactive-hortifruti.html'),hortHtml);
  const {ProcedureTimeAudit}=load('src/components/procedure-time-audit.tsx');
  const {renderToStaticMarkup}=require('react-dom/server');
  const auditHtml=renderToStaticMarkup(ProcedureTimeAudit({record:morning,temperature:true}));
  assert(auditHtml.includes('Lançamento retroativo'));assert(auditHtml.includes('Lançado em:'));assert(auditHtml.includes('07:35'));
  assert.equal(JSON.stringify(tables.controleTemperaturaEquipamento),temperatureSnapshot);assert.equal(JSON.stringify(tables.higienizacaoHortifruti),hortSnapshot);
  for(const [code,fn,values] of [['temperatura',temperature.createRegistroAction,{...temp,equipamento:'C',horarioAfericao:'07:35'}],['hortifruti',hort.createRegistroAction,horticulture],['oleo',oil.createRegistroAction,{temperatura:170}]]){
    tables.fechamentoMensalModulo=[{moduloCodigo:code,mes:10,ano:2026,status:'FECHADO'}];
    const result=await action(fn,{...values,data:'2026-10-17'},'error');assert(result.get('feedback').includes('fechado'));
  }
  tables.fechamentoMensalModulo=[];
  console.log('PASS actual actions/reports: automatic today, morning 07:35, afternoon 14:47, explicit unknown with reason, manual horticulture interval, no oil time field, duplicates, future/invalid values, closed months and untampered audit metadata.');

  const React=require('react');let states=[],cursor=0;
  mocks.set('react',{...React,useState(initial){const index=cursor++;if(!(index in states))states[index]=initial;return[states[index],value=>{states[index]=value}]}});
  const timeFile=path.join(root,'src/app/higienizacao-hortifruti/process-time-fields.tsx');delete require.cache[timeFile];
  const {ProcessTimeFields}=load('src/app/higienizacao-hortifruti/process-time-fields.tsx');
  const props={defaultDate:'2026-10-19',todayDate:'2026-10-19',editableDate:true,inputClassName:'bpma-input'};
  const draw=()=>{cursor=0;return ProcessTimeFields(props)};
  let tree=draw();assert.equal(elements(tree,node=>node.props?.name==='terminoProcesso')[0].props.readOnly,true);
  elements(tree,node=>node.props?.name==='inicioProcesso')[0].props.onChange({target:{value:'08:10'}});
  tree=draw();assert.equal(elements(tree,node=>node.props?.name==='terminoProcesso')[0].props.value,'08:12');
  elements(tree,node=>node.props?.name==='data')[0].props.onChange({currentTarget:{value:'2026-10-18'}});
  tree=draw();assert.equal(elements(tree,node=>node.props?.name==='inicioProcesso')[0].props.value,'');assert.equal(elements(tree,node=>node.props?.name==='terminoProcesso')[0].props.readOnly,false);
  elements(tree,node=>node.props?.name==='inicioProcesso')[0].props.onChange({target:{value:'08:10'}});
  elements(tree,node=>node.props?.name==='terminoProcesso')[0].props.onChange({currentTarget:{value:'08:25'}});
  tree=draw();assert.equal(elements(tree,node=>node.props?.name==='terminoProcesso')[0].props.value,'08:25');
  elements(tree,node=>node.type?.name==='UnreportedTimeFields')[0].props.onChange(true);
  tree=draw();assert.equal(elements(tree,node=>node.props?.name==='inicioProcesso').length,0);
  const declaration=elements(tree,node=>node.type?.name==='UnreportedTimeFields')[0];
  assert.equal(elements(declaration.type(declaration.props),node=>node.props?.name==='justificativaHorario')[0].props.required,true);
  const cssDir=path.join(root,'.next/static/css');const css=fs.existsSync(cssDir)?fs.readdirSync(cssDir).filter(file=>file.endsWith('.css')).map(file=>fs.readFileSync(path.join(cssDir,file),'utf8')).join('\n'):'';
  function fixture(name,node){fs.writeFileSync(path.join(outputDir,name),`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><main style="max-width:720px;margin:24px auto;padding:16px;background:white;color:#0f172a"><form class="grid gap-4 md:grid-cols-2">${renderToStaticMarkup(node)}</form></main>`)}
  fixture('retroactive-time-unknown.html',tree);
  elements(tree,node=>node.props?.name==='data')[0].props.onChange({currentTarget:{value:'2026-10-19'}});
  tree=draw();assert.equal(elements(tree,node=>node.props?.name==='inicioProcesso')[0].props.value,'');assert.equal(elements(tree,node=>node.props?.name==='terminoProcesso')[0].props.readOnly,true);assert.equal(elements(tree,node=>node.type?.name==='UnreportedTimeFields').length,0);
  elements(tree,node=>node.props?.name==='data')[0].props.onChange({currentTarget:{value:'2026-10-18'}});tree=draw();fixture('retroactive-time-known.html',tree);
  states=[];cursor=0;
  const {RetroactiveTemperatureTimeFields}=load('src/app/controle-temperatura-equipamentos/retroactive-time-fields.tsx');
  fixture('retroactive-temperature-form.html',RetroactiveTemperatureTimeFields());
  console.log('PASS actual form: daily +2 minutes, retroactive manual end, required justification, date change clears prior time, return to today restores automatic mode.');
  mocks.delete('react');
}
main().catch(error=>{console.error(error);process.exitCode=1});
