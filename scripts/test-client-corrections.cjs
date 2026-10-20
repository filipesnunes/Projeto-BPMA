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
  // Buffet: report must select the saved observation, omit the entire unserved row,
  // and keep the source snapshot and historical/checklist status untouched.
  const buffet = tables.controleBuffetAmostraRegistro = [
    ['Bolo 1','Chocolate'], ['Bolo 2','Tapioca'], ['Bolo 3','Formigueiro'], ['Bolo 4',null],
    ['Oculto',null,'NAO_SERVIDO'], ['Extra servido',null,'PREENCHIDO',true],
    ['Bolo 1','Cenoura','PREENCHIDO',false,'2026-09-02'], ['Bolo 2','<script>teste</script>','PREENCHIDO',false,'2026-09-02']
  ].map(([itemNome,observacao,status='PREENCHIDO',itemExtra=false,day='2026-09-01'],i) => ({
    id:i+1,itemNome,observacao,status,itemExtra,data:date(day),servicoId:1,servico:{nome:'Café',ordem:1},item:{ordem:i+1},
    primeiraTc:65,tcEquipamento:80,responsavelNome:'Responsável',dataHoraRegistro:date(day),acaoCorretiva:null
  }));
  const originalBuffet = JSON.stringify(buffet);
  const buffetHtml = await report('controle-buffet-amostras');
  for (const text of ['Bolo 1 - Chocolate','Bolo 2 - Tapioca','Bolo 3 - Formigueiro','Bolo 1 - Cenoura','Extra servido (extra)']) assert(buffetHtml.includes(text));
  assert.match(buffetHtml,/>Bolo 4<\/td>/); assert(!buffetHtml.includes('Oculto')); assert(!buffetHtml.includes('Não servido'));
  assert(buffetHtml.includes('&lt;script&gt;teste&lt;/script&gt;')); assert.equal(JSON.stringify(buffet),originalBuffet);
  fs.writeFileSync(path.join(outputDir,'buffet-client.html'),buffetHtml);
  tables.controleBuffetAmostraRegistro = [buffet[4]];
  assert(!((await report('controle-buffet-amostras')).includes('Café -')));
  console.log('PASS: cake names, fallback, different days, extras, HTML escaping, whole unserved row omitted, originals preserved.');

  // Temperature: real server actions, exact preceding scheduled shift and equipment.
  const warning = 'Variação aceitável para o turno, se persistir no turno seguinte acionar a manutenção.';
  const persistence = load('src/app/controle-temperatura-equipamentos/persistence.ts');
  const rules = tables.controleTemperaturaCategoriaRegra = [
    {id:1,categoriaId:1,ordem:1,temperaturaMin:null,temperaturaMax:4,status:'CONFORME',acaoCorretiva:'Nenhuma ação necessária.',isActive:true},
    {id:2,categoriaId:1,ordem:2,temperaturaMin:5,temperaturaMax:8,status:'ALERTA',acaoCorretiva:warning,isActive:true},
    {id:3,categoriaId:1,ordem:3,temperaturaMin:8.1,temperaturaMax:null,status:'CRITICO',acaoCorretiva:"Transferir insumos para outro equipamento e acionar manutenção.",isActive:true}
  ];
  tables.controleTemperaturaCategoriaParametro = [{id:1,categoria:'REFRIGERACAO',isActive:true}];
  tables.controleTemperaturaEquipamentoOpcao = ['A','B'].map((nome,i) => ({id:i+1,nome,tipo:'EQUIPAMENTO',categoriaEquipamento:'REFRIGERACAO',ativo:true,turnoManha:true,turnoTarde:true}));
  tables.moduloConfiguracao = [{ modulo:'CONTROLE_TEMPERATURA_EQUIPAMENTOS', exigirFotoEmAlertaCritico:false }];
  // Keep photo policy isolated here; existing regression suite tests both settings.
  mocks.set('./settings', { getExigirFotoEmAlertaCritico:async()=>false });
  const tempActions = load('src/app/controle-temperatura-equipamentos/actions.ts');
  const tempValues = (equipamento,turno,temperaturaAferida) => ({equipamento,turno,temperaturaAferida});
  tables.controleTemperaturaEquipamento = [];
  await action(tempActions.createRegistroAction,tempValues('A','MANHA',6));
  await action(tempActions.createRegistroAction,tempValues('B','TARDE',6));
  assert.equal(tables.controleTemperaturaEquipamento[1].acaoCorretiva,warning);
  await action(tempActions.createRegistroAction,tempValues('A','TARDE',7));
  assert.equal(tables.controleTemperaturaEquipamento[0].acaoCorretiva,warning);
  assert.equal(tables.controleTemperaturaEquipamento[2].acaoCorretiva,persistence.PERSISTENT_TEMPERATURE_ACTION);
  assert.equal(tables.controleTemperaturaEquipamento[2].status,'ALERTA');
  assert(!/transferir insumos/i.test(tables.controleTemperaturaEquipamento[2].acaoCorretiva));
  await action(tempActions.updateRegistroAction,{...tempValues('A','TARDE',9),id:3});
  assert.equal(tables.controleTemperaturaEquipamento[2].status,'CRITICO');
  assert.equal(tables.controleTemperaturaEquipamento[2].acaoCorretiva,rules[2].acaoCorretiva);
  await action(tempActions.updateRegistroAction,{...tempValues('A','TARDE',4),id:3});
  assert.equal(tables.controleTemperaturaEquipamento[2].status,'CONFORME');
  assert.equal(tables.controleTemperaturaEquipamento[2].acaoCorretiva,'Nenhuma ação necessária.');
  await action(tempActions.updateRegistroAction,{...tempValues('A','TARDE',6),id:3});
  assert.equal(tables.controleTemperaturaEquipamento[2].acaoCorretiva,persistence.PERSISTENT_TEMPERATURE_ACTION);
  const base = {equipamento:'A',categoria:'REFRIGERACAO',data:'2026-10-01',turno:'MANHA',shifts:['MANHA','TARDE'],rule:rules[1],rules};
  const previous = {equipamento:'A',categoriaEquipamento:'REFRIGERACAO',data:'2026-09-30',turno:'TARDE',statusOperacionalEquipamento:'EM_OPERACAO',temperaturaAferida:6,status:'ALERTA'};
  const evaluate = (change={},previousChange={}) => persistence.correctiveActionWithPersistence({...base,...change,previous:{...previous,...previousChange}});
  assert.equal(evaluate(),persistence.PERSISTENT_TEMPERATURE_ACTION);
  for (const change of [{equipamento:'B'},{data:'2026-09-28'},{turno:'MANHA'},{statusOperacionalEquipamento:'MANUTENCAO'},{status:'CONFORME'},{temperaturaAferida:null}]) assert.equal(evaluate({},change),warning);
  assert.equal(evaluate({shifts:['MANHA']},{turno:'MANHA'}),persistence.PERSISTENT_TEMPERATURE_ACTION);
  assert.equal(evaluate({shifts:['TARDE'],turno:'TARDE'}),persistence.PERSISTENT_TEMPERATURE_ACTION);
  assert.equal(evaluate({rule:rules[0]}),'Nenhuma ação necessária.');
  assert.equal(evaluate({rule:rules[2]}),rules[2].acaoCorretiva);
  assert.equal(evaluate({rule:{...rules[1],acaoCorretiva:'Ajustar termostato.'}}),'Ajustar termostato.');
  // Date/shift context survives save and reopening the form; no real database.
  const originalNow=dates.getAppNow,originalDate=dates.getAppDate;
  const fixedNow=new Date('2026-10-13T18:00:00Z'); // Afternoon in Sao Paulo.
  dates.getAppNow=()=>fixedNow;
  dates.getAppDate=value=>originalDate(value??fixedNow);
  const tempPage=load('src/app/controle-temperatura-equipamentos/page.tsx').default;
  for(const rule of rules)rule.categoria={categoria:'REFRIGERACAO'};
  tables.controleTemperaturaEquipamentoOpcao.push({id:3,nome:'C',tipo:'EQUIPAMENTO',categoriaEquipamento:'REFRIGERACAO',ativo:true,turnoManha:true,turnoTarde:true});
  const getFields=tree=>elements(tree,node=>node.type?.name==='AutomaticCorrectiveActionFields')[0].props;
  const historical={new:'1',dataRegistro:'2026-09-13',turnoRegistro:'MANHA'};
  const beforeFiles=['temperature-actions-before.ts','temperature-page-before.ts'].map(file=>path.join(outputDir,file));
  if(beforeFiles.every(file=>fs.existsSync(file))){
    function oldModule(fixture,sourcePath){
      const file=path.join(root,sourcePath),unit=new Module(file,module);unit.filename=file;unit.paths=Module._nodeModulePaths(path.dirname(file));
      unit._compile(ts.transpileModule(fs.readFileSync(fixture,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);return unit.exports;
    }
    const oldPage=oldModule(beforeFiles[1],'src/app/controle-temperatura-equipamentos/page.tsx').default;
    const oldFields=getFields(await oldPage({searchParams:Promise.resolve(historical)}));
    assert.equal(oldFields.defaultTurno,'TARDE','Original page ignores the previously chosen morning shift');
    assert.equal(oldFields.dataReferencia,'2026-10-13','Original page ignores the requested historical date');
    const oldActions=oldModule(beforeFiles[0],'src/app/controle-temperatura-equipamentos/actions.ts');
    const oldResult=await action(oldActions.createRegistroAction,{...tempValues('C','MANHA',4),data:'2026-09-13',horarioAfericao:'07:35'});
    assert.equal(oldResult.get('turnoRegistro'),null,'Original redirect loses selected shift');
    assert.equal(dates.formatAppDateInput(tables.controleTemperaturaEquipamento.at(-1).data),'2026-10-13','Original action forces today');
    tables.controleTemperaturaEquipamento.pop(); // Synthetic diagnostic record only.
    console.log('PASS reproduction before fix: forced current date and afternoon default after morning save.');
  }
  const originalRows=JSON.stringify(tables.controleTemperaturaEquipamento);
  let formPage=await tempPage({searchParams:Promise.resolve({new:'1'})});
  assert.equal(elements(formPage,node=>node.type?.name==='TemperatureReferenceFields')[0].props.referenceDate,'2026-10-13');
  let fields=getFields(await tempPage({searchParams:Promise.resolve(historical)}));
  assert.equal(fields.dataReferencia,'2026-09-13');assert.equal(fields.defaultTurno,'MANHA');
  const saved=await action(tempActions.createRegistroAction,{...tempValues('C','MANHA',4),data:'2026-09-13',horarioAfericao:'07:35',returnTo:'/controle-temperatura-equipamentos?new=1'});
  const savedRow=tables.controleTemperaturaEquipamento.at(-1);
  assert.equal(dates.formatAppDateInput(savedRow.data),'2026-09-13');
  assert(savedRow.createdAt>new Date('2026-09-30T23:59:59Z'),'Creation timestamp remains actual insertion time');
  assert.equal(savedRow.responsavel,actor.nomeCompleto);
  assert.equal(saved.get('dataRegistro'),'2026-09-13');assert.equal(saved.get('turnoRegistro'),'MANHA');
  const list=await tempPage({searchParams:Promise.resolve(Object.fromEntries(saved))});
  const newLink=elements(list,node=>node.props?.children==='Novo Registro'&&node.props.href)[0];
  const newParams=Object.fromEntries(new URL(newLink.props.href,'http://localhost').searchParams);
  fields=getFields(await tempPage({searchParams:Promise.resolve(newParams)}));
  assert.equal(fields.defaultTurno,'MANHA');assert.equal(fields.dataReferencia,'2026-09-13');
  assert.deepEqual(fields.equipamentosTurnos.find(item=>item.nome==='C').turnos,['TARDE'],'Saved morning is excluded while afternoon stays available');
  await action(tempActions.createRegistroAction,{...tempValues('C','MANHA',4),data:'2026-09-13',horarioAfericao:'07:35'},'error');
  assert.equal(tables.controleTemperaturaEquipamento.length,JSON.parse(originalRows).length+1,'Duplicate attempt does not insert');
  await action(tempActions.createRegistroAction,{...tempValues('C','TARDE',4),data:'2026-09-13',horarioAfericao:'07:35'});
  fields=getFields(await tempPage({searchParams:Promise.resolve(historical)}));
  assert(!fields.equipamentoOptions.includes('C'),'Both completed shifts remove equipment for that date');
  fields=getFields(await tempPage({searchParams:Promise.resolve({...historical,dataRegistro:'2026-09-14'})}));
  assert.deepEqual(fields.equipamentosTurnos.find(item=>item.nome==='C').turnos,['MANHA','TARDE'],'Next date remains independent');
  const countBeforeInvalid=tables.controleTemperaturaEquipamento.length;
  for(const invalid of ['','2026-02-30','2026-13-01','13/09/2026'])await action(tempActions.createRegistroAction,{...tempValues('C','MANHA',4),data:invalid},'error');
  assert.equal(tables.controleTemperaturaEquipamento.length,countBeforeInvalid);
  tables.fechamentoMensalModulo=[{moduloCodigo:'temperatura',mes:9,ano:2026,status:'FECHADO'}];
  await action(tempActions.createRegistroAction,{...tempValues('C','MANHA',4),data:'2026-09-14',horarioAfericao:'14:47'},'error');
  assert.equal(tables.controleTemperaturaEquipamento.length,countBeforeInvalid,'Closed historical month is still protected');
  tables.fechamentoMensalModulo=[];
  for(const equipment of ['A','B'])for(const shift of ['MANHA','TARDE']){
    await action(tempActions.createRegistroAction,{...tempValues(equipment,shift,4),data:'2026-09-13',horarioAfericao:'07:35'});
  }
  const completePage=await tempPage({searchParams:Promise.resolve(historical)});
  assert.equal(getFields(completePage).equipamentoOptions.length,0);
  assert(elements(completePage,node=>node.type?.name==='TemperatureReferenceFields'&&node.props.editable).length,'Date remains selectable when every equipment has been filled');
  assert(elements(completePage,node=>node.props?.type==='submit'&&node.props.disabled).length,'Completed date cannot submit another record');
  const retroReport=await report('controle-temperatura-equipamentos',9,2026);
  assert(retroReport.includes('C')&&retroReport.includes('4 °C'));
  assert.match(retroReport,/<td[^>]*>13<\/td>/,'Monthly report uses reference day');
  fs.writeFileSync(path.join(outputDir,'temperature-reference-date.html'),retroReport);
  assert.equal(JSON.stringify(tables.controleTemperaturaEquipamento.slice(0,JSON.parse(originalRows).length)),originalRows,'Prior records remain intact');
  dates.getAppNow=originalNow;dates.getAppDate=originalDate;
  console.log('PASS reference date: current default, historical morning save, automatic return context, independent shifts/dates, duplicate guard, invalid dates, closed month, report and original metadata.');
  tables.controleTemperaturaEquipamento = [
    {id:1,data:date('2026-09-01'),createdAt:new Date('2026-09-01T11:17:00Z'),turno:'MANHA',temperaturaAferida:6,acaoCorretiva:warning},
    {id:2,data:date('2026-09-01'),createdAt:new Date('2026-09-01T18:42:00Z'),turno:'TARDE',temperaturaAferida:7,acaoCorretiva:persistence.PERSISTENT_TEMPERATURE_ACTION},
    {id:3,data:date('2026-09-02'),createdAt:null,turno:'MANHA',temperaturaAferida:4},
    {id:4,data:date('2026-09-03'),createdAt:new Date('2026-09-10T12:00:00Z'),turno:'MANHA',temperaturaAferida:4},
    {id:5,data:date('2026-09-04'),createdAt:new Date('2026-09-04T12:00:00Z'),turno:'MANHA',temperaturaAferida:null,statusOperacionalEquipamento:'MANUTENCAO'},
    {id:6,data:date('2026-09-05'),createdAt:new Date('2026-09-05T12:07:00Z'),turno:'MANHA',temperaturaAferida:9,status:'CRITICO',acaoCorretiva:rules[2].acaoCorretiva}
  ].map(row=>({equipamento:'A',responsavel:'Responsável',statusOperacionalEquipamento:'EM_OPERACAO',
    status:row.temperaturaAferida > 8 ? 'CRITICO' : row.temperaturaAferida > 4 ? 'ALERTA' : 'CONFORME',...row}));
  tables.assinaturaDiariaModulo = [{dataReferencia:date('2026-09-01'),moduloCodigo:'temperatura',usuarioNomeSnapshot:'Supervisor'}];
  const temperatureHtml = await report('controle-temperatura-equipamentos');
  assert(temperatureHtml.includes(warning));
  assert(temperatureHtml.includes(persistence.PERSISTENT_TEMPERATURE_ACTION));
  assert(temperatureHtml.includes(rules[2].acaoCorretiva));
  assert(temperatureHtml.includes('08:17')); assert(temperatureHtml.includes('15:42')); assert(temperatureHtml.includes('Horário'));
  assert(temperatureHtml.includes('Em manutenção')); assert(!temperatureHtml.includes('<td>09:00</td>'));
  assert.match(temperatureHtml,/<td>4 °C<\/td>\s*<td>-<\/td>/);
  fs.writeFileSync(path.join(outputDir,'temperature-client.html'),temperatureHtml);
  const baselinePath=path.join(outputDir,'temperature-route-baseline.ts');
  fs.writeFileSync(baselinePath,require('node:child_process').execFileSync('git',['show','HEAD:src/app/relatorios/controle-temperatura-equipamentos/mensal/route.ts'],{cwd:root}));
  const baselineResponse=await require(baselinePath).GET(new NextRequest('http://localhost/relatorios/controle-temperatura-equipamentos/mensal?mes=9&ano=2026'));
  fs.writeFileSync(path.join(outputDir,'temperature-client-baseline.html'),await baselineResponse.text());

  const temperatureHistory = await load('src/app/controle-temperatura-equipamentos/historico/page.tsx').default({
    searchParams:Promise.resolve({dia:'2026-09-01',filtroMes:'9',filtroAno:'2026'})
  });
  assert(elements(temperatureHistory,node=>node.props?.children === warning).length > 0);
  assert(elements(temperatureHistory,node=>node.props?.children === persistence.PERSISTENT_TEMPERATURE_ACTION).length > 0);
  const currentRecords = tables.controleTemperaturaEquipamento;
  tables.controleTemperaturaEquipamento = [{...currentRecords[0],status:'ALERTA',acaoCorretiva:rules[2].acaoCorretiva}];
  const savedSnapshot = JSON.stringify(tables.controleTemperaturaEquipamento);
  assert((await report('controle-temperatura-equipamentos')).includes(rules[2].acaoCorretiva));
  assert.equal(JSON.stringify(tables.controleTemperaturaEquipamento),savedSnapshot,'Reports do not rewrite inconsistent historical actions');
  tables.controleTemperaturaEquipamento = currentRecords;
  console.log('PASS: temperature actions create/edit, normal recovery, independent equipment, next day/month, single shift, missing/stale/maintenance, saved times and historical fallback.');

  // Hortifruti: reusable retirement, preserved snapshots and calculated times.
  const discontinued = 'Antimicrobial Fruit & Vegetable Treatment';
  tables.higienizacaoHortifrutiOpcao = [{id:1,tipo:'HORTIFRUTI',nome:'Alface',ativo:true},
    {id:2,tipo:'PRODUTO_UTILIZADO',nome:discontinued,ativo:true},{id:3,tipo:'PRODUTO_UTILIZADO',nome:'Sanitizante',ativo:true},
    {id:4,tipo:'PRODUTO_UTILIZADO',nome:'Sem histórico',ativo:true}];
  tables.higienizacaoHortifruti = [{id:1,data:today,hortifruti:'Alface',produtoUtilizado:discontinued,inicioProcesso:'07:00',terminoProcesso:'07:15',duracaoMinutos:15,responsavel:'Anterior'}];
  const hort = load('src/app/higienizacao-hortifruti/actions.ts');
  const snapshot = JSON.stringify(tables.higienizacaoHortifruti[0]);
  await action(hort.deleteCatalogOptionAction,{optionId:2});
  assert.equal(tables.higienizacaoHortifrutiOpcao.find(r=>r.id===2).ativo,false);
  assert.equal(JSON.stringify(tables.higienizacaoHortifruti[0]),snapshot);
  const catalog = load('src/app/higienizacao-hortifruti/catalog.ts');
  assert(!(await catalog.getCatalogOptionNames('PRODUTO_UTILIZADO')).includes(discontinued));
  assert.equal(await catalog.findCatalogOptionByName('PRODUTO_UTILIZADO',discontinued),null);
  const hortPage = await load('src/app/higienizacao-hortifruti/page.tsx').default({searchParams:Promise.resolve({new:'1'})});
  assert(!elements(hortPage,n=>n.props?.name==='produtoUtilizado')[0].props.options.includes(discontinued));
  await action(hort.deleteCatalogOptionAction,{optionId:4});
  assert(!tables.higienizacaoHortifrutiOpcao.some(r=>r.id===4));
  const hortValues = {data:dates.formatAppDateInput(today),hortifruti:'Alface',produtoUtilizado:'Sanitizante',inicioProcesso:'08:15',terminoProcesso:'23:00'};
  await action(hort.createRegistroAction,{...hortValues,produtoUtilizado:discontinued},'error');
  await action(hort.createRegistroAction,hortValues);
  assert.equal(tables.higienizacaoHortifruti[1].terminoProcesso,'08:17');
  await action(hort.updateRegistroAction,{...hortValues,id:2,inicioProcesso:'08:30'});
  assert.equal(tables.higienizacaoHortifruti[1].terminoProcesso,'08:32');
  await action(hort.updateRegistroAction,{...hortValues,id:1,produtoUtilizado:discontinued,inicioProcesso:'07:00'});
  assert.equal(tables.higienizacaoHortifruti[0].terminoProcesso,'07:15');
  assert.equal(tables.higienizacaoHortifruti[0].duracaoMinutos,15);
  const timeUtils = load('src/app/higienizacao-hortifruti/utils.ts');
  for (const [start,end] of [['08:15','08:17'],['08:30','08:32'],['14:48','14:50'],['23:59','00:01'],['bad','']]) assert.equal(timeUtils.calculateProcessEnd(start),end);
  const realClock=dates.getAppNow;
  dates.getAppNow=()=>new Date(`${dates.formatAppDateInput(today)}T23:59:30-03:00`);
  await action(hort.createRegistroAction,{...hortValues,inicioProcesso:'23:59'});
  dates.getAppNow=realClock;
  assert.equal(tables.higienizacaoHortifruti.at(-1).duracaoMinutos,2);
  const period = dates.getAppMonthYear(today);
  const hortHtml = await report('higienizacao-hortifruti',period.mes,period.ano);
  assert(hortHtml.includes(discontinued.replace('&','&amp;'))); assert(hortHtml.includes('08:32')); assert(hortHtml.includes('07:15'));
  fs.writeFileSync(path.join(outputDir,'hortifruti-client.html'),hortHtml);
  console.log('PASS: generic deactivation with history, deletion without history, active catalog/server validation, old times/product preserved, +2 minutes, midnight, saved report.');

  // Oil: save without a strip, real strip rules, temperature threshold only for strips,
  // signatures and monthly closure with a temperature-only record.
  const oilRules = load('src/app/controle-qualidade-oleo/options.ts').CANONICAL_OIL_STRIP_RULES;
  tables.controleQualidadeOleoOpcaoFita = oilRules.map((r,i)=>({id:i+1,...r,ativo:true}));
  tables.controleQualidadeOleoRegistro = [];
  const oil = load('src/app/controle-qualidade-oleo/actions.ts');
  await action(oil.createRegistroAction,{temperatura:100,semUtilizacao:false});
  const temperatureOnly = tables.controleQualidadeOleoRegistro[0];
  assert.equal(temperatureOnly.fitaOleo,null); assert.equal(temperatureOnly.status,null); assert.equal(temperatureOnly.orientacao,'');
  await action(oil.signRegistroSupervisorAction,{id:1,senhaConfirmacao:'test'});
  assert.equal(temperatureOnly.assinaturaSupervisorNome,actor.nomeCompleto);
  await action(oil.closeMonthAction,{mes:period.mes,ano:period.ano,senhaConfirmacao:'test'});
  await action(oil.createRegistroAction,{temperatura:170},'error');
  tables.controleQualidadeOleoFechamento = [];
  tables.fechamentoMensalModulo = []; // Reset the active generic closure only in this isolated fixture.
  for (const rule of oilRules) {
    await action(oil.createRegistroAction,{temperatura:170,fitaOleo:rule.rotulo});
    assert.equal(tables.controleQualidadeOleoRegistro.at(-1).status,rule.statusAssociado);
    assert.equal(tables.controleQualidadeOleoRegistro.at(-1).orientacao,rule.descricao);
  }
  await action(oil.createRegistroAction,{temperatura:100,fitaOleo:'2%'},'error');
  await action(oil.createRegistroAction,{temperatura:170,fitaOleo:'invalid'},'error');
  await action(oil.createRegistroAction,{temperatura:''},'error');
  await action(oil.createRegistroAction,{temperatura:190});
  assert.equal(tables.controleQualidadeOleoRegistro.at(-1).status,null);
  assert.equal(tables.controleQualidadeOleoRegistro.at(-1).temperaturaCritica,true);
  await action(oil.updateRegistroAction,{id:2,temperatura:175});
  assert.equal(tables.controleQualidadeOleoRegistro[1].fitaOleo,null);
  const oilHtml = await report('controle-qualidade-oleo',period.mes,period.ano);
  assert.match(oilHtml,/<td[^>]*>-<\/td>\s*<td[^>]*>100 °C<\/td>/);
  assert(!oilHtml.includes('>0%</td>')); assert(oilHtml.includes('3,5%'));
  fs.writeFileSync(path.join(outputDir,'oil-client.html'),oilHtml);
  const oilUtils = load('src/app/controle-qualidade-oleo/utils.ts');
  assert.equal(dates.formatAppDateInput(oilUtils.getNextOilStripDate(date('2026-09-29'))),'2026-10-02');
  const oilPage = await load('src/app/controle-qualidade-oleo/page.tsx').default({searchParams:Promise.resolve({new:'1'})});
  const oilFields = elements(oilPage,n=>n.type?.name==='OilRegisterFields')[0];
  assert(oilFields.props.previsaoFita.includes('Próxima prevista:'));
  const lastQuery = queries.findLast(q=>q.model==='controleQualidadeOleoRegistro' && q.where?.fitaOleo?.not===null);
  assert.equal(lastQuery.where.semUtilizacao,false); assert.deepEqual(lastQuery.where.NOT,{fitaOleo:''});
  const oilHistory = await load('src/app/controle-qualidade-oleo/historico/page.tsx').default({searchParams:Promise.resolve({dia:dates.formatAppDateInput(today)})});
  assert(elements(oilHistory,n=>n.type?.name==='OilStatusBadge' && n.props.status===null).length);
  const oilCalendar=elements(oilPage,node=>node.type?.name==='ReferenceExecutionFields')[0];
  const oilDateField={props:{type:'date',required:true,defaultValue:oilCalendar.props.defaultDate}};
  assert.equal(oilDateField.props.type,'date');assert.equal(oilDateField.props.required,true);
  assert.equal(oilDateField.props.defaultValue,dates.formatAppDateInput(dates.getAppDate()));
  await action(oil.createRegistroAction,{data:oilDateField.props.defaultValue,temperatura:170});
  assert.equal(dates.formatAppDateInput(tables.controleQualidadeOleoRegistro.at(-1).data),oilDateField.props.defaultValue,'Unchanged calendar saves the current reference date');
  const oldOilRows=JSON.stringify(tables.controleQualidadeOleoRegistro);
  const creationStart=new Date();
  await action(oil.createRegistroAction,{data:'2026-09-14',horarioExecucao:'14:47',temperatura:170,fitaOleo:'2%'});
  const retroOil=tables.controleQualidadeOleoRegistro.at(-1);
  assert.equal(dates.formatAppDateInput(retroOil.data),'2026-09-14');
  assert(retroOil.createdAt>=creationStart,'Oil insertion timestamp is real, not backdated');
  assert.equal(retroOil.responsavel,actor.nomeCompleto);
  assert.equal(retroOil.status,oilRules.find(rule=>rule.rotulo==='2%').statusAssociado);
  const historicalOilPage=await load('src/app/controle-qualidade-oleo/page.tsx').default({searchParams:Promise.resolve({filtroData:'2026-09-14'})});
  assert(elements(historicalOilPage,node=>node.type==='td'&&node.props.children==='14/09/2026').length,'Reference date appears after querying the records');
  const retroOilHtml=await report('controle-qualidade-oleo',9,2026);
  assert(retroOilHtml.includes('14/09/2026'));assert(retroOilHtml.includes('170 °C'));
  fs.writeFileSync(path.join(outputDir,'oil-reference-date.html'),retroOilHtml);
  const invalidOil=await action(oil.createRegistroAction,{data:'2026-09-14',horarioExecucao:'14:47',temperatura:100,fitaOleo:'2%',returnTo:'/controle-qualidade-oleo?new=1'},'error');
  assert.equal(invalidOil.get('formDataReferencia'),'2026-09-14');
  const errorOilPage=await load('src/app/controle-qualidade-oleo/page.tsx').default({searchParams:Promise.resolve(Object.fromEntries(invalidOil))});
  assert.equal(elements(errorOilPage,node=>node.type?.name==='ReferenceExecutionFields')[0].props.defaultDate,'2026-09-14','Temperature validation does not reset the chosen date');
  const beforeInvalidOil=tables.controleQualidadeOleoRegistro.length;
  for(const invalid of ['','2026-02-30','14/09/2026','2026-13-01'])await action(oil.createRegistroAction,{data:invalid,temperatura:170},'error');
  assert.equal(tables.controleQualidadeOleoRegistro.length,beforeInvalidOil);
  tables.fechamentoMensalModulo=[{moduloCodigo:'oleo',mes:9,ano:2026,status:'FECHADO'}];
  await action(oil.createRegistroAction,{data:'2026-09-15',temperatura:170},'error');
  assert.equal(tables.controleQualidadeOleoRegistro.length,beforeInvalidOil,'Closed reference month rejects oil insertion');
  tables.fechamentoMensalModulo=[];
  await action(oil.createRegistroAction,{data:'2026-09-14',horarioExecucao:'14:47',temperatura:175});
  assert.equal(tables.controleQualidadeOleoRegistro.length,beforeInvalidOil+1,'Existing multiple-measurement-per-day policy preserved');
  assert.equal(JSON.stringify(tables.controleQualidadeOleoRegistro.slice(0,JSON.parse(oldOilRows).length)),oldOilRows,'Existing records/signatures untouched');
  console.log('PASS oil calendar: today, historical save/query/report, actual creation metadata, invalid dates, error preservation, closed month and existing same-day multiple measurements.');
  console.log('PASS: oil without strip, all strip rules, critical temperature independent, signatures, monthly closure, historical rendering, report and last real test +3 days.');

  // Exercise state transitions of the actual client components without a DOM.
  const realReact = require('react'); let states=[],cursor=0;
  mocks.set('react',{...realReact,useState(initial){const index=cursor++; if(!(index in states)) states[index]=initial; return [states[index],value=>{states[index]=value;}];},useMemo:fn=>fn(),useEffect(){},useRef:()=>({current:null}),useTransition:()=>[false,callback=>callback()]});
  const timePath=path.join(root,'src/app/higienizacao-hortifruti/process-time-fields.tsx'); delete require.cache[timePath];
  const TimeFields=load('src/app/higienizacao-hortifruti/process-time-fields.tsx').ProcessTimeFields;
  const renderTime=()=>{cursor=0;return TimeFields({inputClassName:'test'});};
  let timeTree=renderTime();
  elements(timeTree,n=>n.props?.name==='inicioProcesso')[0].props.onChange({target:{value:'08:15'}});
  timeTree=renderTime(); assert.equal(elements(timeTree,n=>n.props?.name==='terminoProcesso')[0].props.value,'08:17');
  elements(timeTree,n=>n.props?.name==='inicioProcesso')[0].props.onChange({target:{value:'08:30'}});
  timeTree=renderTime(); const end=elements(timeTree,n=>n.props?.name==='terminoProcesso')[0]; assert.equal(end.props.value,'08:32'); assert.equal(end.props.readOnly,true);
  const fieldsPath=path.join(root,'src/app/controle-qualidade-oleo/oil-register-fields.tsx'); delete require.cache[fieldsPath];
  const OilFields=load('src/app/controle-qualidade-oleo/oil-register-fields.tsx').OilRegisterFields;
  states=[];cursor=0;const oilTree=OilFields({options:oilRules,inputClassName:'test'});
  assert(elements(oilTree,n=>n.props?.type==='radio').every(n=>!n.props.required && !n.props.checked));
  assert.equal(elements(oilTree,n=>n.props?.name==='temperatura')[0].props.required,true);
  const tempPath=path.join(root,'src/app/controle-temperatura-equipamentos/automatic-corrective-action-fields.tsx'); delete require.cache[tempPath];
  const TemperatureFields=load('src/app/controle-temperatura-equipamentos/automatic-corrective-action-fields.tsx').AutomaticCorrectiveActionFields;
  states=[];
  const tempProps={dataReferencia:'2026-10-01',equipamentoOptions:['A','B'],equipamentosCategoria:[{nome:'A',categoria:'REFRIGERACAO'},{nome:'B',categoria:'REFRIGERACAO'}],
    equipamentosTurnos:[{nome:'A',turnos:['MANHA','TARDE']}],turnosPrevistos:[{nome:'A',turnos:['MANHA','TARDE']}],
    registrosAnteriores:[previous],regrasCategoria:rules.map(r=>({...r,categoria:'REFRIGERACAO'})),
    defaultEquipamento:'A',defaultTemperatura:'6',defaultTurno:'MANHA',inputClassName:'test'};
  const renderTemp=()=>{cursor=0;return TemperatureFields(tempProps);};
  let tempTree=renderTemp(); assert.equal(elements(tempTree,n=>n.props?.name==='acaoCorretiva')[0].props.value,persistence.PERSISTENT_TEMPERATURE_ACTION);
  elements(tempTree,n=>n.props?.name==='temperaturaAferida')[0].props.onChange({target:{value:'4'}});
  tempTree=renderTemp(); assert.equal(elements(tempTree,n=>n.props?.name==='acaoCorretiva')[0].props.value,'Nenhuma ação necessária.');
  states=[];cursor=0;
  const pendingProps={...tempProps,defaultEquipamento:'',equipamentosTurnos:[{nome:'A',turnos:['TARDE']},{nome:'B',turnos:['MANHA','TARDE']}]};
  const renderPending=()=>{cursor=0;return TemperatureFields(pendingProps)};
  let pendingTree=renderPending();
  assert.deepEqual(elements(pendingTree,node=>node.type?.name==='SearchableOptionField')[0].props.options,['B']);
  elements(pendingTree,node=>node.props?.name==='turno')[0].props.onChange({target:{value:'TARDE'}});
  pendingTree=renderPending();assert.deepEqual(elements(pendingTree,node=>node.type?.name==='SearchableOptionField')[0].props.options,['A','B']);
  let replacedUrl;
  mocks.set('next/navigation',{useRouter:()=>({replace(url){replacedUrl=url}})});
  global.window={location:{href:'http://localhost/controle-temperatura-equipamentos?new=1&filtroMes=9'}};
  global.HTMLSelectElement=class{constructor(){this.value='MANHA'}};
  delete require.cache[require.resolve(path.join(root,'src/app/controle-temperatura-equipamentos/reference-date-fields.tsx'))];
  const {TemperatureReferenceFields}=load('src/app/controle-temperatura-equipamentos/reference-date-fields.tsx');
  states=[];cursor=0;const referenceTree=TemperatureReferenceFields({referenceDate:'2026-10-13',editable:true,children:null});
  const dateField=elements(referenceTree,node=>node.props?.name==='data')[0];
  assert.equal(dateField.props.type,'date');assert.equal(dateField.props.required,true);
  dateField.props.onChange({currentTarget:{value:'2026-09-13',form:{elements:{namedItem:()=>new HTMLSelectElement()}}}});
  const url=new URL(replacedUrl,'http://localhost');assert.equal(url.searchParams.get('dataRegistro'),'2026-09-13');
  assert.equal(url.searchParams.get('turnoRegistro'),'MANHA');assert.equal(url.searchParams.get('filtroMes'),'9');
  delete global.window;delete global.HTMLSelectElement;
  mocks.delete('react');
  console.log('PASS: client start changes recalculate immediately; end is readonly; strip radios optional/unselected; temperature preview escalates and recovers.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
