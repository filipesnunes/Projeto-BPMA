// Uses an existing local synthetic PostgreSQL schema. Never runs migrations or reads DATABASE_URL.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const {randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'..');const database=fs.readFileSync(path.join(root,'.data/validation/group-workflows/database.txt'),'utf8').trim();assert(/^workflow_[0-9]+$/.test(database));
const url='postgresql://postgres:isolated_test_only@127.0.0.1:55479/'+database;
const mocks = new Map(); const originalLoad = Module._load;
Module._load = function(name,parent,main){if(mocks.has(name))return mocks.get(name);if(name==='server-only')return {};if(name.startsWith('@/'))name=path.join(root,'src',name.slice(2));return originalLoad.call(this,name,parent,main);};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient({datasources:{db:{url}}});
prisma.$use(require('../src/lib/active-operational-records.ts').activeOperationalRecords);
mocks.set('@/lib/prisma',{prisma}); mocks.set('next/cache',{revalidatePath(){}});
class Redirect extends Error {constructor(url){super('redirect');this.url=url;}}
mocks.set('next/navigation',{redirect(url){throw new Redirect(url);}});
mocks.set('@/lib/redirect-error',{rethrowIfRedirectError(e){if(e instanceof Redirect)throw e;}});
let user; mocks.set('@/lib/auth-session',{getCurrentUser:async()=>user,getCurrentUserForAction:async()=>user});
const {performance}=require('node:perf_hooks'),{execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const dates=require('../src/lib/date-time.ts');
const realDate=dates.getAppDate, realFormat=dates.formatAppDateInput;
let today=realDate(),clock=new Date(realFormat(today)+'T20:00:00Z');
dates.getAppNow=()=>clock;dates.getAppDate=(date=clock)=>realDate(date);
const directory=path.join(root,'.data/validation/temperature-daily');fs.mkdirSync(directory,{recursive:true});
const fixturePath=path.join(directory,'fixtures.json');
const service=require('../src/lib/operational-workflow/service.ts');
const {temperatureAdapter,temperatureSignatureBridge,refreshWorkflowActor}=require('../src/app/controle-temperatura-equipamentos/workflow-adapter.ts');
const {hashPassword}=require('../src/lib/password.ts');
const form=values=>{const f=new FormData();for(const[k,v]of Object.entries(values))f.set(k,v);return f;};
const actor=tx=>refreshWorkflowActor(tx,user);
const saved=(key,version=0,extra={})=>service.saveWorkflow({actor,adapter:temperatureAdapter,key,expectedVersion:version,input:form({statusOperacionalEquipamento:'EM_OPERACAO',temperaturaAferida:'3',horarioAfericao:'07:35',intent:'complete',...extra})});
const sign=unit=>service.signWorkflow({actor,bridge:temperatureSignatureBridge('daily-test-password',false),scope:[{id:unit.id,version:unit.versao}]});
const shiftDate=(date,days)=>new Date(+date+days*86400000);
const historyPath=path.join(root,'src/app/controle-temperatura-equipamentos/historico/legacy-history.tsx');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const queries=[];prisma.$use(async(params,next)=>{const started=performance.now();const result=await next(params);queries.push({model:params.model,action:params.action,where:structuredClone(params.args?.where),rows:Array.isArray(result)?result.length:null,ids:Array.isArray(result)?result.map(item=>item.id).filter(Boolean):[],ms:performance.now()-started});return result;});
const props={searchParams:Promise.resolve({})};
const walk=(node,visit)=>{if(!node||typeof node!=='object')return;if(Array.isArray(node))return node.forEach(child=>walk(child,visit));visit(node);walk(node.props?.children,visit);};
const text=node=>{const result=[];const visit=n=>{if(typeof n==='string'||typeof n==='number')result.push(String(n));else if(Array.isArray(n))n.forEach(visit);else if(n&&typeof n==='object')visit(n.props?.children);};visit(node);return result.join(' ');};
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
function compileBaseline(relative){const filename=path.join(root,relative);const compiled=new Module(filename+'.baseline',module);compiled.filename=filename;compiled.paths=Module._nodeModulePaths(path.dirname(filename));compiled._compile(ts.transpileModule(execFileSync('git',['show','HEAD:'+relative],{cwd:root,encoding:'utf8'}),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);return compiled.exports;}
async function measurePage(Page){queries.length=0;const start=performance.now();const tree=await Page(props);const pending=[];walk(tree,node=>{if(node.type?.name==='CompatibleWorkflowRecords')pending.push(node.type(node.props));});await Promise.all(pending);return{ms:performance.now()-start,queries:queries.length,records:queries.find(q=>q.model==='ControleTemperaturaEquipamento'&&q.action==='findMany')?.rows,flows:queries.filter(q=>q.model==='FluxoOperacional'&&q.action==='findMany').reduce((sum,q)=>sum+(q.rows??0),0)};}
async function operationalSnapshot(){const tables=['controle_temperatura_equipamentos','fluxo_operacional','fluxo_versao','fluxo_assinatura','fluxo_assinatura_vinculo','fluxo_evento','assinatura_diaria_modulo','fechamento_mensal_modulo'];const result={};for(const table of tables)result[table]=await prisma.$queryRawUnsafe(`SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY to_jsonb(t)::text`);return result;}
(async()=>{
 assert.equal((await prisma.$queryRaw`SELECT current_database() AS name`)[0].name,database);
 if(process.argv.includes('--setup')){
  const tag='DAILY-'+Date.now(),date=realFormat(today),yesterday=shiftDate(today,-1),future=shiftDate(today,1),pastMonth=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth()-1,15));
  const account=await prisma.usuario.create({data:{nomeCompleto:tag,nomeUsuario:tag.toLowerCase(),senhaHash:hashPassword('daily-test-password'),perfil:'DEV'}});
  const session=await prisma.usuarioSessao.create({data:{usuarioId:account.id,tokenHash:randomUUID(),expiraEm:new Date('2030-01-01')}});user={...account,sessaoId:session.id,permissoes:[]};
  let category=await prisma.controleTemperaturaCategoriaParametro.findUnique({where:{categoria:'REFRIGERACAO'}});
  if(!category)category=await prisma.controleTemperaturaCategoriaParametro.create({data:{categoria:'REFRIGERACAO',nome:tag,orientacaoCorretivaPadrao:'Verificar'}});
  const rules=await prisma.controleTemperaturaCategoriaRegra.count({where:{categoriaId:category.id,isActive:true}});
  if(!rules)await prisma.controleTemperaturaCategoriaRegra.create({data:{categoriaId:category.id,temperaturaMin:-50,temperaturaMax:5,status:'CONFORME',acaoCorretiva:'Conforme',ordem:1}});
  const equipment=[];for(const suffix of ['LEGACY','CURRENT','DRAFT','REOPEN','NEW'])equipment.push(await prisma.controleTemperaturaEquipamentoOpcao.create({data:{tipo:'EQUIPAMENTO',nome:tag+' '+suffix,categoriaEquipamento:'REFRIGERACAO'}}));
  const base={categoriaEquipamento:'REFRIGERACAO',temperaturaAferida:3,status:'CONFORME',responsavel:account.nomeCompleto};
  const morning=await prisma.controleTemperaturaEquipamento.create({data:{...base,data:today,equipamento:equipment[0].nome,turno:'MANHA',createdAt:new Date(date+'T23:59:00Z')}});
  const afternoon=await prisma.controleTemperaturaEquipamento.create({data:{...base,data:today,equipamento:equipment[0].nome,turno:'TARDE',createdAt:new Date(realFormat(future)+'T01:30:00Z')}});
  await prisma.controleTemperaturaEquipamento.createMany({data:Array.from({length:3000},(_,i)=>({...base,data:i%2?pastMonth:yesterday,equipamento:tag+' PAST',turno:i%2?'MANHA':'TARDE'}))});
  await prisma.controleTemperaturaEquipamento.create({data:{...base,data:future,equipamento:tag+' FUTURE',turno:'MANHA',createdAt:new Date(realFormat(yesterday)+'T12:00:00Z')}});
  const current=await saved(`${equipment[1].id}:${date}:MANHA`),closed=await saved(`${equipment[1].id}:${date}:TARDE`);await sign(closed);
  const draft=await saved(`${equipment[2].id}:${date}:MANHA`,0,{temperaturaAferida:'',intent:'draft',observacaoStatusOperacional:'DAILY DRAFT'});
  let reopened=await saved(`${equipment[3].id}:${realFormat(yesterday)}:MANHA`);await sign(reopened);reopened=await prisma.fluxoOperacional.findUniqueOrThrow({where:{id:reopened.id}});reopened=await service.reopenWorkflow({actor,module:'temperatura',id:reopened.id,expectedVersion:reopened.versao,reason:'Synthetic daily filtering check',fromEdit:true});
  const data={database,tag,date,previousDate:realFormat(yesterday),previousMonth:realFormat(pastMonth),futureDate:realFormat(future),userId:account.id,userName:account.nomeUsuario,sessionId:session.id,equipment,morningId:morning.id,afternoonId:afternoon.id,current,closed,draft,reopened,historyHash:hash(historyPath),baseline:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()};
  fs.writeFileSync(fixturePath,JSON.stringify(data));console.log('PASS fixtures: existing isolated schema, 3000 historical records, current legacy/versioned both shifts, late entry, future entry, draft and old reopened unit. No migrations executed.');return;
 }
 const f=JSON.parse(fs.readFileSync(fixturePath,'utf8'));assert.equal(f.database,database);today=new Date(f.date+'T00:00:00Z');clock=new Date(f.date+'T20:00:00Z');
 const account=await prisma.usuario.findUniqueOrThrow({where:{id:f.userId}});user={...account,sessaoId:f.sessionId,permissoes:[]};
 const Page=require('../src/app/controle-temperatura-equipamentos/legacy-records.tsx').default;
 const helper=require('../src/components/compatible-workflow-records.tsx').CompatibleWorkflowRecords;
 const baselinePage=compileBaseline('src/app/controle-temperatura-equipamentos/legacy-records.tsx').default;
 const baselineHelper=compileBaseline('src/components/compatible-workflow-records.tsx').CompatibleWorkflowRecords;
 const before=await operationalSnapshot();queries.length=0;const tree=await Page(props),main=queries.find(q=>q.model==='ControleTemperaturaEquipamento'&&q.action==='findMany');
 assert.equal(main.where.data.toISOString().slice(0,10),f.date);
 const rows=await prisma.controleTemperaturaEquipamento.findMany({where:main.where});assert(rows.every(row=>realFormat(row.data)===f.date));assert.equal(new Set(rows.map(row=>row.id)).size,rows.length);
 assert(rows.some(row=>row.id===f.morningId));assert(rows.some(row=>row.id===f.afternoonId));assert(rows.some(row=>row.fluxoId===f.current.id));assert(rows.some(row=>row.fluxoId===f.closed.id));
 assert(!text(tree).includes(f.tag+' PAST'));assert(!text(tree).includes(f.tag+' FUTURE'));
 let helperNode;walk(tree,node=>{if(node.type===helper)helperNode=node;});assert(helperNode);assert.equal(realFormat(helperNode.props.operationalDate),f.date);
 queries.length=0;const drafts=await helper(helperNode.props);const flowRead=queries.find(q=>q.model==='FluxoOperacional');assert.equal(realFormat(flowRead.where.dataReferencia),f.date);assert(text(drafts).includes(f.equipment[2].nome));assert(!text(drafts).includes(f.equipment[3].nome));
 const privileged=user;
 for(const role of ['GERENTE','NUTRICIONISTA','COLABORADOR']){user={...privileged,perfil:role,permissoes:require('../src/lib/permissions.ts').getDefaultPermissionCodes(role)};queries.length=0;const roleTree=await Page(props);assert(!text(roleTree).includes(f.tag+' PAST'));await helper({...helperNode.props});const query=queries.find(q=>q.model==='FluxoOperacional'&&q.where?.modulo==='temperatura'&&q.where?.dataReferencia instanceof Date);assert.equal(realFormat(query.where.dataReferencia),f.date);}
 user=privileged;
 for(const query of [{filtroData:f.previousDate},{filtroData:f.futureDate},{filtroMes:f.previousMonth.slice(5,7)},{filtroMes:f.previousMonth.slice(5,7),filtroAno:f.previousMonth.slice(0,4)}]){
  queries.length=0;await Page({searchParams:Promise.resolve(query)});const result=queries.find(q=>q.model==='ControleTemperaturaEquipamento'&&q.action==='findMany');assert.equal(realFormat(result.where.data),f.date);assert.equal(result.rows,0);assert(!queries.some(q=>q.action==='aggregate'));
 }
 // Default shared-component behavior is identical for History and other modules.
 for(const [code,history]of [['temperatura',true],['oleo',false],['amostras',false],['rastreabilidade',false]]){
  queries.length=0;await baselineHelper({module:code,history,query:{}});const old=queries.find(q=>q.model==='FluxoOperacional');queries.length=0;await helper({module:code,history,query:{}});const now=queries.find(q=>q.model==='FluxoOperacional');assert.deepEqual(now.where,old.where);assert.deepEqual(now.ids,old.ids);
 }
 assert.equal(hash(historyPath),f.historyHash,'History source must remain byte-identical');
 const History=require('../src/app/controle-temperatura-equipamentos/historico/legacy-history.tsx').default;
 queries.length=0;const oldTree=await History({searchParams:Promise.resolve({filtroData:f.previousDate,dia:f.previousDate})});assert(queries.some(q=>q.model==='ControleTemperaturaEquipamento'&&q.action==='findMany'&&q.rows>=1500));assert(text(oldTree).includes(f.tag+' PAST'));
 const utcDay=shiftDate(today,1);assert.equal(realFormat(realDate(new Date(realFormat(utcDay)+'T02:59:00Z'))),f.date);assert.equal(realFormat(realDate(new Date(realFormat(utcDay)+'T03:00:00Z'))),realFormat(utcDay));
 const referenceSql=`FROM controle_temperatura_equipamentos t LEFT JOIN fluxo_operacional f ON t."fluxoId"=f.id WHERE t."excluidoEm" IS NULL AND (t."fluxoId" IS NULL OR (f."preenchimentoCompleto"=true AND f."excluidoEm" IS NULL))`;
 const explain=async(daily)=>{const result=await prisma.$queryRawUnsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT t.* ${referenceSql}${daily?` AND t.data=DATE '${f.date}'`:''} ORDER BY t.data DESC,t."createdAt" DESC`);const plan=result[0]['QUERY PLAN'][0];return{rows:plan.Plan['Actual Rows'],executionMs:plan['Execution Time']};};
 const sqlBefore=[],sqlAfter=[],pageBefore=[],pageAfter=[];
 for(let i=0;i<9;i++){const a=await explain(false),b=await explain(true),c=await measurePage(baselinePage),d=await measurePage(Page);if(i>1){sqlBefore.push(a.executionMs);sqlAfter.push(b.executionMs);pageBefore.push(c);pageAfter.push(d);}}
 const performanceResult={database,date:f.date,synthetic:true,samples:7,sql:{before:{...await explain(false),medianMs:median(sqlBefore)},after:{...await explain(true),medianMs:median(sqlAfter)}},serverPreparation:{description:'Node server page function plus supplemental async records; excludes layout/auth transport/browser',before:{medianMs:median(pageBefore.map(x=>x.ms)),queries:pageBefore[0].queries,records:pageBefore[0].records,flows:pageBefore[0].flows},after:{medianMs:median(pageAfter.map(x=>x.ms)),queries:pageAfter[0].queries,records:pageAfter[0].records,flows:pageAfter[0].flows}}};
 fs.writeFileSync(path.join(directory,'performance.json'),JSON.stringify(performanceResult,null,2));console.log(JSON.stringify(performanceResult));
 assert.deepEqual(await operationalSnapshot(),before,'Queries must not mutate data/signatures/versions');
 // Existing save/edit/signature paths remain operative, with no new duplicates.
 let active=await prisma.fluxoOperacional.findUniqueOrThrow({where:{id:f.current.id}});const countBefore=await prisma.controleTemperaturaEquipamento.count({where:{fluxoId:active.id}});
 active=await saved(active.chave,active.versao,{temperaturaAferida:'2'});assert.equal(await prisma.controleTemperaturaEquipamento.count({where:{fluxoId:active.id}}),countBefore);
 const signed=await prisma.fluxoOperacional.findUniqueOrThrow({where:{id:f.closed.id}});await assert.rejects(()=>saved(signed.chave,signed.versao),/fechado/i);assert.equal((await prisma.fluxoOperacional.findUniqueOrThrow({where:{id:signed.id}})).assinaturaVigenteId,signed.assinaturaVigenteId);
 const actions=require('../src/app/controle-temperatura-equipamentos/actions.ts');try{await actions.updateRegistroAction(form({id:String(f.morningId),equipamento:f.equipment[0].nome,statusOperacionalEquipamento:'EM_OPERACAO',temperaturaAferida:'2',returnTo:'/controle-temperatura-equipamentos'}));assert.fail('redirect');}catch(error){assert(error instanceof Redirect);assert.match(error.url,/feedbackType=success/);}
 assert.equal((await prisma.controleTemperaturaEquipamento.findUniqueOrThrow({where:{id:f.morningId}})).temperaturaAferida,2);
 console.log('PASS daily temperature: SQL date restriction, both shifts, late-created rows, legacy/versioned IDs once, past/month/future/reopened exclusion, recoverable current drafts, unchanged History/shared defaults, timezone boundary, read-only integrity, current edits and signed lock.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>prisma.$disconnect());
