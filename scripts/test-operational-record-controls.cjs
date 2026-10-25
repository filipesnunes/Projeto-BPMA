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
const actor = { id: 1, nomeCompleto: 'Responsável Teste', perfil: 'DEV', nomeUsuario: 'dev-teste' };
class Redirect extends Error { constructor(url) { super('redirect'); this.url = url; } }
mocks.set('next/cache', { revalidatePath() {} });
mocks.set('next/navigation', { redirect(url) { throw new Redirect(url); } });
mocks.set('@/lib/redirect-error', { rethrowIfRedirectError(e) { if (e instanceof Redirect) throw e; } });
mocks.set('@/lib/auth-session', { getCurrentUser: async () => actor, getCurrentUserForAction: async () => actor });
mocks.set('@/app/controle-temperatura-equipamentos/workflow-adapter', { refreshWorkflowActor: async (_tx, user) => user });
mocks.set('@/lib/authz', new Proxy({}, { get: () => async () => {} }));

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
    return (row[key] ?? null) === value;
  });
}
function selected(row, select) {
  if (!row || !select) return row;
  return Object.fromEntries(Object.entries(select).filter(([,v]) => v).map(([key, value]) => [key,
    value === true ? row[key] : selected(row[key], value.select)]));
}
const prisma = new Proxy({}, { get(_target, model) {
  if(model === '$executeRaw') return async()=>[];
  if(model === '$transaction') return async(callback)=>{const backup=structuredClone(tables);try{return await callback(prisma);}catch(e){for(const key of Object.keys(tables))delete tables[key];Object.assign(tables,backup);throw e;}};
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
    create: async ({data}) => { const row = { excluidoEm: null, horarioExecucao: null, horarioNaoInformado: false, justificativaHorario: null, id: rows.length + 1, createdAt: new Date(), updatedAt: new Date(), ...data }; rows.push(row); return row; },
    updateMany: async ({where,data}) => { let count=0;for(const row of rows.filter(r=>matches(r,where))){Object.assign(row,data);count++;}return {count}; },
    update: async ({where,data}) => { const row = rows.find((r) => matches(r,where)); assert(row); Object.assign(row,data); return row; },
    delete: async ({where}) => { const index = rows.findIndex((r) => matches(r,where)); assert(index >= 0); return rows.splice(index,1)[0]; },
    upsert: async ({where,create,update}) => { let row = rows.find((r) => matches(r,where)); if (row) Object.assign(row,update); else { row = {id:rows.length+1,...create}; rows.push(row); } return row; }
  };
} });
const { activeOperationalRecords } = load('src/lib/active-operational-records.ts');
const filteredPrisma = new Proxy(prisma,{get(target,model){
 if(String(model).startsWith('$')) return target[model];
 return new Proxy(target[model],{get(delegate,action){return async(args={})=>activeOperationalRecords({model:model[0].toUpperCase()+model.slice(1),action,args:structuredClone(args),dataPath:[],runInTransaction:false},p=>delegate[p.action](p.args));}});
}});
mocks.set('@/lib/prisma',{prisma:filteredPrisma});
// Transactions must expose the same middleware boundary as the real Prisma client.
const originalTransaction=prisma.$transaction;
const transactionalPrisma=new Proxy(filteredPrisma,{get(t,key){return key==='$transaction'?callback=>originalTransaction(()=>callback(filteredPrisma)):t[key];}});
mocks.set('@/lib/prisma',{prisma:transactionalPrisma});
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

const deletion=load('src/lib/operational-deletion.ts');
const realPermissions=load('src/lib/permissions.ts');
const timing=load('src/lib/procedure-time.ts');
const targets=deletion.operationalDeletionModels;
const {renderExecutionReportNotes}=load('src/lib/execution-report-notes.ts');
function reset(target='temperatura') {
 for(const key of Object.keys(tables))delete tables[key];
 const model=targets[target];
 tables[model]=[{id:1,data:date('2026-09-18'),dataExecucao:date('2026-09-18'),createdAt:date('2026-09-20'),updatedAt:date('2026-09-20'),responsavel:'Original',assinaturaResponsavel:'Executor anterior',assinaturaSupervisor:'Supervisor anterior',excluidoEm:null}];
 if(target==='chamados'){tables[model][0].dataHoraCriacao=new Date('2026-09-18T15:00:00Z');delete tables[model][0].data;delete tables[model][0].dataExecucao;}
 if(target==='etiquetas'){tables[model][0].dataManipulacao=date('2026-09-18');delete tables[model][0].data;delete tables[model][0].dataExecucao;}
 actor.perfil='DEV';delete actor.permissoes;delete actor.perfilAcessoId;
 return tables[model][0];
}
async function testPreviousDayDeletionControls() {
 const referenceDates=[today,new Date(+today-86400000),new Date(+today-2*86400000),date(dates.formatAppDateInput(today).slice(0,8)+'01')];
 const previousMonth=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth()-1,15));
 referenceDates.push(previousMonth);
 const scenarios=[['oleo','controle-qualidade-oleo'],['temperatura','controle-temperatura-equipamentos'],['hortifruti','higienizacao-hortifruti']];
 function seed(target) {
  reset(target);
  tables[targets[target]]=[...referenceDates,referenceDates[1],referenceDates[1]].map((data,index)=>({
   id:index+1,data,createdAt:new Date(),updatedAt:new Date(),excluidoEm:null,
   responsavel:'Responsável do lançamento '+(index+1),observacao:null,observacoes:null,
   fitaOleo:null,temperatura:170,status:null,orientacao:'',temperaturaCritica:false,semUtilizacao:false,
   equipamento:'Equipamento '+(index+1),categoriaEquipamento:'REFRIGERACAO',turno:'MANHA',
   statusOperacionalEquipamento:'EM_OPERACAO',temperaturaAferida:4,
   hortifruti:'Alface '+(index+1),produtoUtilizado:'Sanitizante',inicioProcesso:'08:00',terminoProcesso:'08:02',duracaoMinutos:2
  }));
 }
 function deleteLink(node,id) {
  return elements(node,n=>typeof n.props?.href==='string' && new URL(n.props.href,'http://localhost').searchParams.get('deleteId')===String(id) && n.props.children==='Excluir');
 }
 for(const [target,route] of scenarios) {
  const pageFile='src/app/'+route+(['temperatura','oleo'].includes(target)?'/legacy-records.tsx':'/page.tsx'), page=load(pageFile).default;
  for(const role of ['DEV','GERENTE','NUTRICIONISTA']) {
   seed(target);actor.perfil=role;
   const tree=await page({searchParams:Promise.resolve({})});
   for(const record of tables[targets[target]]) {
    assert.equal(deleteLink(tree,record.id).length,1,route+' '+role+' '+dates.formatAppDateInput(record.data));
    if(target!=='hortifruti' && +record.data!==+today) {
     const row=elements(tree,n=>n.type==='tr' && n.key===String(record.id))[0];
     assert.equal(elements(row,n=>n.type==='button' && n.props.disabled && n.props.children==='Editar').length,1,'Edição de data anterior permanece bloqueada');
    }
   }
   const selected=await page({searchParams:Promise.resolve({deleteId:'2'})});
   const form=elements(selected,n=>n.type==='form' && n.props.action===load('src/app/'+route+'/actions.ts').deleteRegistroAction)[0];
   assert(form,'Confirmação de lançamento anterior disponível');
   assert.equal(elements(form,n=>n.props?.name==='id')[0].props.value,2);
   assert.equal(elements(form,n=>n.props?.name==='justificativaExclusao')[0].props.required,true);
  }
  for(const legacy of [false,true]) {
   seed(target);const old=tables[targets[target]][1].data;
   if(legacy){const model={oleo:'controleQualidadeOleoFechamento',temperatura:'controleTemperaturaEquipamentoFechamento',hortifruti:'higienizacaoHortifrutiFechamento'}[target];tables[model]=[{mes:old.getUTCMonth()+1,ano:old.getUTCFullYear(),status:'ASSINADO'}];}
   else tables.fechamentoMensalModulo=[{moduloCodigo:target,mes:old.getUTCMonth()+1,ano:old.getUTCFullYear(),status:'FECHADO'}];
   const closed=await page({searchParams:Promise.resolve({deleteId:'2'})});
   assert.equal(deleteLink(closed,2).length,0);
   assert.equal(elements(closed,n=>n.type==='form' && n.props.action===load('src/app/'+route+'/actions.ts').deleteRegistroAction).length,0);
  }
  seed(target);actor.perfil='COLABORADOR';actor.permissoes=realPermissions.ALL_PERMISSION_CODES;
  const forbidden=await page({searchParams:Promise.resolve({deleteId:'2'})});
  assert.equal(deleteLink(forbidden,2).length,0);
  assert.equal(elements(forbidden,n=>n.type==='form' && n.props.action===load('src/app/'+route+'/actions.ts').deleteRegistroAction).length,0);
 }
 // Three distinct previous-day oil measurements must remain independently addressable.
 seed('oleo');const oil=load('src/app/controle-qualidade-oleo/actions.ts');
 const originals=structuredClone(tables.controleQualidadeOleoRegistro);
 await action(oil.deleteRegistroAction,{id:2,justificativaExclusao:'Aferição no registro errado'});
 assert.equal(tables.controleQualidadeOleoRegistro.length,originals.length);
 for(const original of originals.filter(r=>r.id!==2))assert.deepEqual(tables.controleQualidadeOleoRegistro.find(r=>r.id===original.id),original);
 assert.equal(tables.exclusaoRegistroOperacional.length,1);assert.equal(tables.exclusaoRegistroOperacional[0].registroId,2);
 const refreshed=await load('src/app/controle-qualidade-oleo/legacy-records.tsx').default({searchParams:Promise.resolve({})});
 assert.equal(deleteLink(refreshed,2).length,0);assert.equal(deleteLink(refreshed,6).length,1);assert.equal(deleteLink(refreshed,7).length,1);
 const excludedHtml=await report('controle-qualidade-oleo',referenceDates[1].getUTCMonth()+1,referenceDates[1].getUTCFullYear());
 assert(!excludedHtml.includes(originals[1].responsavel));
 // Old callers cannot bypass the versioned creation endpoint. Actual new creation,
 // retroactive save and deletion are exercised by test-oil-workflow.cjs in PostgreSQL.
 const countBefore=tables.controleQualidadeOleoRegistro.length;
 await action(oil.createRegistroAction,{data:dates.formatAppDateInput(referenceDates[1]),horarioExecucao:'08:43',temperatura:170},'error');
 assert.equal(tables.controleQualidadeOleoRegistro.length,countBefore);
 // Receiving deletion is independent from its readonly/finalized editing state.
 const receivingDetail=load('src/app/rastreabilidade-recebimento/nota/[id]/page.tsx').default;
 for(const role of ['DEV','GERENTE','NUTRICIONISTA'])for(const status of ['IMPORTADA','FINALIZADA']) {
  reset('rastreabilidade');actor.perfil=role;
  const item=tables.rastreabilidadeRecebimentoRegistro[0];
  Object.assign(item,{notaId:10,produto:'Produto anterior',quantidadeComprada:null,statusGeral:'PENDENTE',temperatura:null,temperaturaTipo:'AMBIENTE',dataFabricacao:null,dataValidade:null,sif:'NA'});
  tables.rastreabilidadeRecebimentoNota=[{id:10,excluidoEm:null,data:item.data,notaFiscal:'123',fornecedor:'Fornecedor',statusNota:status,origemXml:false,itens:[item],_count:{itens:1},createdAt:new Date()}];
  tables.assinaturaDiariaModulo=[{moduloCodigo:'rastreabilidade',dataReferencia:item.data,usuarioNomeSnapshot:'Supervisor'}];
  let tree=await receivingDetail({params:Promise.resolve({id:'10'}),searchParams:Promise.resolve({})});
  let form=elements(tree,n=>n.type?.name==='NoteItemsForm')[0];
  assert.equal(form.props.canDeleteItems,true);if(status==='FINALIZADA')assert.equal(form.props.readOnlyMode,true);
  assert.equal(elements(tree,n=>n.type?.name==='DeleteNoteModal').length,1);
  tables.fechamentoMensalModulo=[{moduloCodigo:'rastreabilidade',mes:9,ano:2026,status:'FECHADO'}];
  tree=await receivingDetail({params:Promise.resolve({id:'10'}),searchParams:Promise.resolve({})});
  form=elements(tree,n=>n.type?.name==='NoteItemsForm')[0];assert.equal(form.props.canDeleteItems,false);
  assert.equal(elements(tree,n=>n.type?.name==='DeleteNoteModal').length,0);
 }
 console.log('PASS regressão por data: hoje, dias anteriores, início do mês e mês anterior aberto; três perfis; edição preservada; confirmação por ID; fechamento legado/genérico; exclusão individual entre três aferições do mesmo dia, retroativo, relatório e auditoria.');
}
async function main(){
 await testPreviousDayDeletionControls();
 for(const target of Object.keys(targets))for(const role of ['DEV','GERENTE','NUTRICIONISTA']){
  const before=structuredClone(reset(target));actor.perfil=role;
  if(target==='etiquetas' && role!=='DEV'){await assert.rejects(()=>deletion.deleteOperationalRecord({user:actor,target,id:1,reason:'Módulo restrito'}),/perfil/);continue;}
  if(target==='nota')tables.rastreabilidadeRecebimentoRegistro=[{id:11,notaId:1,data:date('2026-09-18'),excluidoEm:null,produto:'Produto original'}];
  await deletion.deleteOperationalRecord({user:actor,target,id:1,reason:'Informação lançada por engano'});
  assert.equal(tables[targets[target]].length,1);assert(tables[targets[target]][0].excluidoEm instanceof Date);
  assert.equal(tables.exclusaoRegistroOperacional[0].usuarioPerfil,role);
  const snapshot=JSON.parse(JSON.stringify(before));assert.deepEqual(tables.exclusaoRegistroOperacional.find(a=>a.modelo===targets[target]).dadosOriginais,snapshot);
  assert.equal(await filteredPrisma[targets[target]].count({}),0);
  assert.equal(await filteredPrisma[targets[target]].findUnique({where:{id:1}}),null);
  await assert.rejects(()=>deletion.deleteOperationalRecord({user:actor,target,id:1,reason:'Tentativa repetida'}),/não encontrado|já excluído/);
  if(target==='nota'){assert(tables.rastreabilidadeRecebimentoRegistro[0].excluidoEm);assert.equal(tables.exclusaoRegistroOperacional.length,2);}
 }
 console.log('PASS exclusão: dez destinos, perfis autorizados e restrição DEV do StayLabel, mês anterior aberto, histórico/assinaturas originais, auditoria, consultas ativas, repetição e nota/itens.');
 for(const role of ['COLABORADOR','ADMIN']){reset();actor.perfil=role;actor.permissoes=realPermissions.ALL_PERMISSION_CODES;await assert.rejects(()=>deletion.deleteOperationalRecord({user:actor,target:'temperatura',id:1,reason:'Tentativa forjada'}),/perfil/);assert.equal(tables.controleTemperaturaEquipamento[0].excluidoEm,null);}
 reset();actor.perfil='GERENTE';actor.perfilAcessoId=1;actor.permissoes=[];await assert.rejects(()=>deletion.deleteOperationalRecord({user:actor,target:'temperatura',id:1,reason:'Permissão revogada'}),/perfil/);
 for(const target of Object.keys(targets)){
  reset(target);const code=target==='nota'?'rastreabilidade':target;
  tables.fechamentoMensalModulo=[{moduloCodigo:code,mes:9,ano:2026,status:'FECHADO'}];
  await assert.rejects(()=>deletion.deleteOperationalRecord({user:actor,target,id:1,reason:'Mês fechado'}),/fechado/);
  assert.equal(tables[targets[target]][0].excluidoEm,null);assert.equal((tables.exclusaoRegistroOperacional??[]).length,0);
  tables.fechamentoMensalModulo[0].status='REABERTO';await deletion.deleteOperationalRecord({user:actor,target,id:1,reason:'Período oficialmente reaberto'});
 }
 reset();tables.controleTemperaturaEquipamentoFechamento=[{mes:9,ano:2026,status:'ASSINADO'}];
 await assert.rejects(()=>deletion.deleteOperationalRecord({user:actor,target:'temperatura',id:1,reason:'Legado fechado'}),/fechado/);
 reset();await assert.rejects(()=>deletion.deleteOperationalRecord({user:actor,target:'temperatura',id:1,reason:'   '}),/justificativa/);
 await assert.rejects(()=>deletion.deleteOperationalRecord({user:actor,target:'temperatura',id:999,reason:'ID inexistente'}),/não encontrado/);
 // Simulate an audit failure: no excluded row may be left behind.
 reset();const auditCreate=filteredPrisma.exclusaoRegistroOperacional.create;
 const broken=new Proxy(transactionalPrisma,{get(t,k){return k==='$transaction'?cb=>originalTransaction(()=>cb(new Proxy(filteredPrisma,{get(tx,key){return key==='exclusaoRegistroOperacional'?{create:async()=>{throw Error('Falha de auditoria')}}:tx[key];}}))):t[k];}});
 mocks.set('@/lib/prisma',{prisma:broken});delete require.cache[require.resolve(path.join(root,'src/lib/operational-deletion.ts'))];
 await assert.rejects(()=>load('src/lib/operational-deletion.ts').deleteOperationalRecord({user:actor,target:'temperatura',id:1,reason:'Auditoria falhou'}),/auditoria/);assert.equal(tables.controleTemperaturaEquipamento[0].excluidoEm,null);
 mocks.set('@/lib/prisma',{prisma:transactionalPrisma});delete require.cache[require.resolve(path.join(root,'src/lib/operational-deletion.ts'))];
 console.log('PASS segurança: perfil forjado/revogação, fechamento genérico/legado/DEV, reabertura, motivo, ID e rollback de auditoria.');
 // Exercise the middleware on counts, aggregates, duplicate lookups, mutations and nested note counts.
 for(const action of ['findMany','findUnique','findFirst','count','aggregate','groupBy','update','updateMany']){
  let seen;await activeOperationalRecords({model:'ControleTemperaturaEquipamento',action,args:{where:{id:1}},dataPath:[],runInTransaction:false},p=>{seen=p;return null});assert.equal(seen.args.where.excluidoEm,null);
 }
 let seen;await activeOperationalRecords({model:'RastreabilidadeRecebimentoNota',action:'findMany',args:{include:{itens:true,_count:{select:{itens:true}}}},dataPath:[],runInTransaction:false},p=>{seen=p;return null});assert.equal(seen.args.include.itens.where.excluidoEm,null);assert.equal(seen.args.include._count.select.itens.where.excluidoEm,null);
 await assert.rejects(()=>activeOperationalRecords({model:'HigienizacaoHortifruti',action:'delete',args:{where:{id:1}}},()=>null),/controlada/);
 console.log('PASS consultas: exclusão central em listas, relatório, dashboard, agregações, duplicidades e filhos/contagem de nota.');
 const monthlyModules={hortifruti:'higienizacao-hortifruti',temperatura:'controle-temperatura-equipamentos',oleo:'controle-qualidade-oleo',amostras:'controle-buffet-amostras',limpeza_diaria:'plano-limpeza-diario',limpeza_semanal:'plano-limpeza-semanal',rastreabilidade:'rastreabilidade-recebimento'};
 for(const [target,route] of Object.entries(monthlyModules)){
  reset(target);await deletion.deleteOperationalRecord({user:actor,target,id:1,reason:'Retirada com auditoria'});
  const html=await report(route,9,2026);assert(!html.includes('Executor anterior'));assert(!html.includes('Supervisor anterior'));
  assert.equal(await filteredPrisma[targets[target]].count({}),0);
 }
 console.log('PASS sete relatórios mensais reais: registro excluído não aparece como execução ativa.');
 // Direct Server Action attempts still authenticate through the server-owned actor.
 const direct=load('src/app/historico-operacional/delete-action.ts');reset();actor.perfil='COLABORADOR';actor.permissoes=realPermissions.ALL_PERMISSION_CODES;
 await action(direct.deleteOperationalRecordAction,{target:'temperatura',id:1,justificativaExclusao:'Tentativa direta'},'error');assert.equal(tables.controleTemperaturaEquipamento[0].excluidoEm,null);
 reset();await action(direct.deleteOperationalRecordAction,{target:'temperatura',id:1,justificativaExclusao:'Correção autorizada'});assert(tables.controleTemperaturaEquipamento[0].excluidoEm);


 // Actual responsible-signature actions, with launch and execution kept separate.
 const cleaning=load('src/app/plano-limpeza/actions.ts');
 const yesterday=dates.getAppDate();yesterday.setUTCDate(yesterday.getUTCDate()-1);
 const pastText=dates.formatAppDateInput(yesterday);
 for(const target of ['limpeza_diaria','limpeza_semanal'])for(const unknown of [false,true]){
  const record=reset(target);record.data=yesterday;record.dataExecucao=yesterday;
  record.status='PENDENTE';record.assinaturaResponsavel='';record.assinaturaSupervisor='';
  const created=+record.createdAt;
  const fn=target==='limpeza_diaria'?cleaning.updateDailyRecordAction:cleaning.updateWeeklyRecordAction;
  const savedContext=await action(fn,{id:1,etapa:'responsavel',senhaConfirmacao:'teste',dataExecucao:pastText,horarioExecucao:'08:43',...(unknown?{horarioNaoInformado:true,justificativaHorario:'Executado, horário não registrado'}:{})});
  if(target==='limpeza_semanal')assert.equal(savedContext.get('dataExecucaoRegistro'),pastText);
  const result=tables[targets[target]][0];assert.equal(result.horarioExecucao,unknown?null:'08:43');assert.equal(result.horarioNaoInformado,unknown);
  assert.equal(+result.createdAt,created);assert(result.assinaturaResponsavelDataHora instanceof Date);assert.equal(dates.formatAppDateInput(result.dataExecucao),pastText);
 }
 console.log('PASS actions de Limpeza Diária/Semanal: execução retroativa conhecida/desconhecida, data efetiva e horário real da assinatura separado.');
 const buffet=load('src/app/controle-buffet-amostras/actions.ts');
 for(const unknown of [false,true]){
  reset('amostras');tables.controleBuffetAmostraRegistro=[];
  tables.controleBuffetAmostraServico=[{id:1,nome:'Serviço sintético',tipoServico:'FIXO',ativo:true}];
  tables.controleBuffetAmostraItem=[{id:1,nome:'Item sintético',classificacao:'QUENTE',usaGarrafaTermica:false,ativo:true}];
  tables.controleBuffetAmostraItemServico=[{id:1,servicoId:1,itemId:1}];
  await action(buffet.saveRegistroItemAction,{servicoId:1,itemId:1,data:pastText,temperaturaTipo:'AMBIENTE',horarioExecucao:'09:25',...(unknown?{horarioNaoInformado:true,justificativaHorario:'Procedimento confirmado, anotação sem hora'}:{})});
  const result=tables.controleBuffetAmostraRegistro[0];assert.equal(result.horarioExecucao,unknown?null:'09:25');assert.equal(result.horarioNaoInformado,unknown);assert(result.dataHoraRegistro instanceof Date);assert.equal(dates.formatAppDateInput(result.data),pastText);
  result.servico={...tables.controleBuffetAmostraServico[0],ordem:1};result.item={...tables.controleBuffetAmostraItem[0],ordem:1};
  const html=await report('controle-buffet-amostras',yesterday.getUTCMonth()+1,yesterday.getUTCFullYear());assert(html.includes(unknown?'anotação sem hora':'09:25'));
 }
 console.log('PASS action/relatório Buffet: horários conhecidos/desconhecidos por item, sem inferir execução do timestamp do lançamento.');
 const receiving=load('src/app/rastreabilidade-recebimento/actions.ts');
 reset('rastreabilidade');tables.rastreabilidadeRecebimentoRegistro=[];tables.rastreabilidadeRecebimentoCategoria=[{id:1,nome:'Geral',ativo:true,temperaturaMaxima:25}];
 await action(receiving.createManualNoteAction,{data:pastText,fornecedor:'Fornecedor sintético',notaFiscal:'123',produto:'Bebida sintética',lote:'L1',semDataFabricacao:true,validadeNaoAplicavel:true,sif:'NA',temperaturaTipo:'AMBIENTE',transporteEntregador:'CONFORME',aspectoSensorial:'CONFORME',embalagem:'CONFORME',horarioExecucao:'10:12'});
 assert.equal(tables.rastreabilidadeRecebimentoRegistro[0].horarioExecucao,'10:12');assert.equal(dates.formatAppDateInput(tables.rastreabilidadeRecebimentoNota[0].data),pastText);
 assert.equal(tables.rastreabilidadeRecebimentoRegistro[0].semDataFabricacao,true);assert.equal(tables.rastreabilidadeRecebimentoRegistro[0].validadeNaoAplicavel,true);
 console.log('PASS recebimento manual retroativo: data/horário reais e isenções de fabricação/validade independentes.');
 const now=new Date('2026-10-20T15:00:00Z');const past=date('2026-10-19');const form=new FormData();
 form.set('horarioExecucao','07:35');assert.equal(timing.readExecutionTime(form,past,'',true,now).horarioExecucao,'07:35');
 form.set('horarioExecucao','25:00');assert.throws(()=>timing.readExecutionTime(form,past,'',true,now),/HH:mm/);
 form.set('horarioNaoInformado','true');assert.throws(()=>timing.readExecutionTime(form,past,'',true,now),/justificativa/);
 form.set('justificativaHorario','Executado, horário não anotado');const unknown=timing.readExecutionTime(form,past,'',true,now);assert.equal(unknown.horarioExecucao,null);assert.equal(unknown.horarioNaoInformado,true);
 assert.equal(timing.readExecutionTime(form,past,'',false,now).horarioNaoInformado,false);
 form.delete('horarioNaoInformado');assert.equal(timing.readExecutionTime(form,date('2026-10-20'),'',true,now).horarioExecucao,'12:00');
 assert.throws(()=>timing.readExecutionTime(form,date('2026-10-21'),'',true,now),/futuro/);
 const html=renderExecutionReportNotes([{id:1,data:past,createdAt:now,...unknown}]);assert(html.includes('Executado, horário não anotado'));assert(html.includes('2026-10-19'));assert(html.includes('Lançamento:'));
 console.log('PASS horários compartilhados: atual automático, retroativo manual, inválidos/futuros, desconhecido justificado, não execução e relatório.');
 const panel=load('src/components/operational-deletion-panel.tsx').OperationalDeletionPanel;
 for(const target of ['chamados','etiquetas','limpeza_diaria','amostras']){
  reset(target);const node=await panel({target,selectedDate:'2026-09-18'});
  assert.equal(elements(node,n=>n.type?.name==='OperationalDeleteButton').length,1);
  tables.fechamentoMensalModulo=[{moduloCodigo:target,mes:9,ano:2026,status:'FECHADO'}];
  const closed=await panel({target,selectedDate:'2026-09-18'});assert.equal(elements(closed,n=>n.type?.name==='OperationalDeleteButton').length,0);
  actor.perfil='COLABORADOR';assert.equal(await panel({target,selectedDate:'2026-09-18'}),null);
 }
 reset();const authMock=mocks.get('@/lib/auth-session');const authenticated=authMock.getCurrentUserForAction;
 authMock.getCurrentUserForAction=async()=>{throw Error('Sessão ausente');};
 await action(direct.deleteOperationalRecordAction,{target:'temperatura',id:1,justificativaExclusao:'Sem sessão'},'error');assert.equal(tables.controleTemperaturaEquipamento[0].excluidoEm,null);
 authMock.getCurrentUserForAction=authenticated;
 console.log('PASS painéis e action direta: elegibilidade por competência, negação de perfil e de sessão ausente.');

 const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
 const {ReferenceExecutionFields,ExecutionTimeFields}=load('src/components/forms/execution-time-fields.tsx');
 const {WeeklyExecutionFields}=load('src/components/forms/weekly-execution-fields.tsx');
 const cssDir=path.join(root,'.next/static/css');const css=fs.readdirSync(cssDir).filter(n=>n.endsWith('.css')).map(n=>fs.readFileSync(path.join(cssDir,n),'utf8')).join('\n');
 function fixture(name,node){fs.writeFileSync(path.join(outputDir,name+'.html'),'<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><main style="max-width:760px;margin:24px auto;padding:16px"><form class="space-y-4">'+renderToStaticMarkup(node)+'</form></main>');}
 fixture('operational-reference-fields',React.createElement(ReferenceExecutionFields,{defaultDate:pastText,today:dates.formatAppDateInput(dates.getAppDate())}));
 fixture('operational-unknown-fields',React.createElement(ExecutionTimeFields,{date:pastText,defaultUnknown:true}));
 const week=dates.getAppWeekDateRange(yesterday);
 fixture('operational-weekly-fields',React.createElement(WeeklyExecutionFields,{weekStart:dates.formatAppDateInput(week.start)}));
 const oldReact=mocks.get('react');mocks.set('react',{...React,useState:()=>[true,()=>{}]});
 const {OperationalDeleteButton}=load('src/components/operational-delete-button.tsx');
 fs.writeFileSync(path.join(outputDir,'operational-delete-dialog.html'),'<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style>'+renderToStaticMarkup(React.createElement(OperationalDeleteButton,{target:'temperatura',id:123,date:pastText,description:'Temperatura dos Equipamentos — '+pastText+' — Câmara fria — Responsável: Usuário de teste'})));
 if(oldReact)mocks.set('react',oldReact);else mocks.delete('react');
 console.log('PASS fixtures reais de data/horário, desconhecido, execução semanal e confirmação identificada com justificativa.');

}
main().catch(e=>{console.error(e);process.exitCode=1;});
