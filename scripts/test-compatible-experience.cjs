// Compatibility checks use ONLY the synthetic local database produced by test-group-workflows.cjs.
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
const dates=require('../src/lib/date-time.ts');
const today=new Date('2026-10-28T00:00:00Z');dates.getAppDate=()=>today;dates.getAppNow=()=>new Date('2026-10-28T20:00:00Z');
const {saveWorkflow,signWorkflow,reopenWorkflow}=require('../src/lib/operational-workflow/service.ts');
const {temperatureAdapter,temperatureSignatureBridge,refreshWorkflowActor}=require('../src/app/controle-temperatura-equipamentos/workflow-adapter.ts');
const {oilAdapter,oilSignatureBridge}=require('../src/app/controle-qualidade-oleo/workflow-adapter.ts');
const {currentRecordSignatures,scopedLegacyDaySignatures}=require('../src/lib/operational-workflow/compatible-records.ts');
const {createFromOriginalForm}=require('../src/app/historico-operacional/compatible-create.ts');
const form=fields=>{const f=new FormData();for(const[k,v]of Object.entries(fields))f.set(k,v);return f;};
const actor=tx=>refreshWorkflowActor(tx,user);
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
mocks.set('next/link',({href,children,...props})=>React.createElement('a',{...props,href},children));
const {CompatibleWorkflowRecords}=require('../src/components/compatible-workflow-records.tsx');
const snapshot=async()=>{
 const tables=['fluxo_operacional','fluxo_versao','fluxo_assinatura','fluxo_assinatura_vinculo','fluxo_evento','controle_temperatura_equipamentos','controle_qualidade_oleo_registro','controle_buffet_amostra_registro','rastreabilidade_recebimento_nota','rastreabilidade_recebimento_registro','assinatura_diaria_modulo','fechamento_mensal_modulo'];
 const result={};for(const table of tables)result[table]=await prisma.$queryRawUnsafe(`SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY to_jsonb(t)::text`);return result;
};
(async()=>{
 const account=await prisma.usuario.findUniqueOrThrow({where:{nomeUsuario:'workflow-test'}});
 assert.equal(account.perfil,'DEV');const session=await prisma.usuarioSessao.findFirstOrThrow({where:{usuarioId:account.id}});user={...account,sessaoId:session.id,permissoes:[]};
 const category=await prisma.controleTemperaturaCategoriaParametro.create({data:{categoria:'REFRIGERACAO',nome:'Categoria recuperação',orientacaoCorretivaPadrao:'Verificar'}});
 await prisma.controleTemperaturaCategoriaRegra.create({data:{categoriaId:category.id,temperaturaMin:-50,temperaturaMax:5,status:'CONFORME',acaoCorretiva:'Conforme',ordem:1}});
 const equipment=await prisma.controleTemperaturaEquipamentoOpcao.create({data:{nome:'Câmara recuperação',tipo:'EQUIPAMENTO',categoriaEquipamento:'REFRIGERACAO'}});
 const legacyTemp=await prisma.controleTemperaturaEquipamento.create({data:{data:today,equipamento:'Câmara anterior',categoriaEquipamento:'REFRIGERACAO',turno:'MANHA',temperaturaAferida:3,status:'CONFORME',responsavel:'Operador anterior',horarioAfericao:'07:35',assinaturaNutricionistaNome:'Supervisor anterior',assinaturaNutricionistaDataHora:new Date('2026-10-28T12:00:00Z')}});
 const legacyOil=await prisma.controleQualidadeOleoRegistro.create({data:{data:today,temperatura:130,orientacao:'Verificação anterior',responsavel:'Operador anterior',assinaturaSupervisorNome:'Supervisor anterior',assinaturaSupervisorEm:new Date('2026-10-28T12:00:00Z')}});
 for(const [code,data]of [['temperatura',{equipamento:equipment.nome,turno:'MANHA',statusOperacionalEquipamento:'EM_OPERACAO',temperaturaAferida:'3'}],['oleo',{temperatura:'130',workflowRequestId:randomUUID()}]]){
   try{await createFromOriginalForm(code,form({...data,data:'2026-10-28',returnTo:code==='oleo'?'/controle-qualidade-oleo?new=1':'/controle-temperatura-equipamentos?new=1'}));assert.fail('redirect');}catch(error){assert(error instanceof Redirect);assert.match(error.url,/feedbackType=success/);assert(!error.url.includes('/fluxo'));}
 }
 let signed=await prisma.fluxoOperacional.findUniqueOrThrow({where:{modulo_chave:{modulo:'temperatura',chave:`${equipment.id}:2026-10-28:MANHA`}}});
 await signWorkflow({actor,bridge:temperatureSignatureBridge('test-password',false),scope:[{id:signed.id,version:signed.versao}]});
 const tempRow=await prisma.controleTemperaturaEquipamento.findFirstOrThrow({where:{fluxoId:signed.id}});
 assert.equal((await currentRecordSignatures([tempRow],'temperatura'))[0].assinaturaNutricionistaNome,account.nomeCompleto);
 signed=await prisma.fluxoOperacional.findUniqueOrThrow({where:{id:signed.id}});
 const oldSignature=signed.assinaturaVigenteId;
 const reopened=await reopenWorkflow({actor,module:'temperatura',id:signed.id,expectedVersion:signed.versao,reason:'Ensaio da recuperação',fromEdit:true});
 assert.equal((await currentRecordSignatures([tempRow],'temperatura'))[0].assinaturaNutricionistaNome,null);
 assert(await prisma.fluxoAssinatura.findUnique({where:{id:oldSignature}}));
 const draft=await saveWorkflow({actor,adapter:temperatureAdapter,key:`${equipment.id}:2026-10-28:TARDE`,expectedVersion:0,input:form({statusOperacionalEquipamento:'EM_OPERACAO',temperaturaAferida:'',observacaoStatusOperacional:'Rascunho recuperável sem projeção'})});
 const oilDraft=await saveWorkflow({actor,adapter:oilAdapter,key:'2026-10-28:'+randomUUID(),expectedVersion:0,input:form({observacao:'Óleo rascunho recuperável'})});
 assert.equal(await prisma.controleTemperaturaEquipamento.count({where:{fluxoId:draft.id}}),0);
 assert.equal(await prisma.controleQualidadeOleoRegistro.count({where:{fluxoId:oilDraft.id}}),0);
 const oilComplete=await prisma.fluxoOperacional.findFirstOrThrow({where:{modulo:'oleo',dataReferencia:today,preenchimentoCompleto:true}});
 await signWorkflow({actor,bridge:oilSignatureBridge('test-password',false),scope:[{id:oilComplete.id,version:oilComplete.versao}]});
 assert.equal((await currentRecordSignatures([legacyTemp],'temperatura'))[0].assinaturaNutricionistaNome,'Supervisor anterior');
 assert.equal((await currentRecordSignatures([legacyOil],'oleo'))[0].assinaturaSupervisorNome,'Supervisor anterior');
 assert.equal((await scopedLegacyDaySignatures([{dataReferencia:today}],'temperatura')).length,0);
 const separateDate=new Date('2026-10-26T00:00:00Z');
 const separate=await saveWorkflow({actor,adapter:oilAdapter,key:'2026-10-26:'+randomUUID(),expectedVersion:0,input:form({semUtilizacao:'true'})});
 await signWorkflow({actor,bridge:oilSignatureBridge('test-password',true),scope:[{id:separate.id,version:separate.versao}]});
 const dailyCount=await prisma.assinaturaDiariaModulo.count();
 const currentDay=await scopedLegacyDaySignatures([],'oleo',[separateDate]);
 assert.equal(currentDay.length,1);assert.equal(currentDay[0].usuarioNomeSnapshot,account.nomeCompleto);
 assert.equal(await prisma.assinaturaDiariaModulo.count(),dailyCount,'Display summary cannot create a legacy daily signature');
 const buffetFixture=JSON.parse(fs.readFileSync(path.join(root,'.data/validation/group-workflows/browser-fixtures.json'),'utf8'));
 const {buffetAdapter}=require('../src/app/controle-buffet-amostras/workflow-adapter.ts');
 const buffetPartial=await saveWorkflow({actor,adapter:buffetAdapter,key:buffetFixture.serviceId+':2026-10-28',expectedVersion:0,input:form({['item-'+buffetFixture.itemIds[0]+'-temperaturaTipo']:'NUMERICA',['item-'+buffetFixture.itemIds[0]+'-tcEquipamento']:'70',['item-'+buffetFixture.itemIds[0]+'-primeiraTc']:'65'})});
 assert.equal(buffetPartial.preenchimentoCompleto,false);
 const before=await snapshot();
 const paths=[['controle-temperatura-equipamentos','legacy-records','legacy-history'],['controle-qualidade-oleo','legacy-records','legacy-history'],['controle-buffet-amostras','legacy-page','legacy-page'],['rastreabilidade-recebimento','legacy-page','legacy-page']];
 for(const [name,main,history]of paths){await require(`../src/app/${name}/${main}.tsx`).default({searchParams:Promise.resolve({})});await require(`../src/app/${name}/historico/${history}.tsx`).default({searchParams:Promise.resolve({filtroMes:'10',filtroAno:'2026'})});}
 const buffetTree=await require('../src/app/controle-buffet-amostras/legacy-page.tsx').default({searchParams:Promise.resolve({})});
 const statuses=[];const walk=node=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(walk);return;}if(node.type?.name==='ServiceStatusBadge')statuses.push(node.props.status);walk(node.props?.children);};walk(buffetTree);assert(statuses.includes('PARCIAL'),'An initiated versioned service cannot appear unstarted just because its measurement projection is incomplete');
 for(const code of ['temperatura','oleo','amostras','rastreabilidade']){
  const html=renderToStaticMarkup(await CompatibleWorkflowRecords({module:code,history:true,query:{filtroMes:'10',filtroAno:'2026'}}));assert(!html.includes('Estado operacional'));assert(!html.includes('PENDENTE'));assert(!html.includes('FECHADO'));
  if(code==='temperatura'){assert(html.includes('Câmara recuperação'));assert(html.includes('Revisão pendente'));}
  if(code==='oleo')assert(html.includes('Verificação do óleo'));
 }
 assert.deepEqual(await snapshot(),before,'Read-only rendering must preserve every stored version/signature/XML/photo/closure');
 // The old edit links delegate to protected editors rather than bypassing signatures.
 const signedOilRow=await prisma.controleQualidadeOleoRegistro.findFirstOrThrow({where:{fluxoId:oilComplete.id}});
 await assert.rejects(()=>require('../src/app/controle-qualidade-oleo/legacy-records.tsx').default({searchParams:Promise.resolve({editId:String(signedOilRow.id)})}),e=>e instanceof Redirect&&e.url.includes('/fluxo?chave='));
 const rawSnapshot=await snapshot();
 const persisted=await prisma.usuario.findUniqueOrThrow({where:{id:account.id}});
 // A linked profile with only view permission cannot use the new single-save path.
 const profile=await prisma.perfilAcesso.create({data:{codigo:'RECOVERY_READ_ONLY',nome:'Leitura ensaio'}});
 await prisma.usuario.update({where:{id:account.id},data:{perfil:'COLABORADOR',perfilAcessoId:profile.id}});
 try{await createFromOriginalForm('oleo',form({data:'2026-10-28',temperatura:'130',workflowRequestId:randomUUID()}));assert.fail('redirect');}catch(error){assert(error instanceof Redirect);assert.match(error.url,/feedbackType=error/);}
 await prisma.usuario.update({where:{id:account.id},data:{perfil:persisted.perfil,perfilAcessoId:persisted.perfilAcessoId}});
 assert.deepEqual(await snapshot(),rawSnapshot,'Rejected actions must not mutate operational content');
 const dir=path.join(root,'.data/validation/compatible-experience');fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify({database,equipmentId:equipment.id,tempKey:reopened.chave,oilKey:oilComplete.chave,draftTempKey:draft.chave,draftOilKey:oilDraft.chave,legacyTempId:legacyTemp.id,legacyOilId:legacyOil.id}));
 console.log('PASS recovery compatibility: original single-save forms, legacy + versioned reads, drafts without projections, signed/reopened evidence, 8 restored server pages, no read-time writes across 12 operational tables, denied profile and safe edit routing.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>prisma.$disconnect());
