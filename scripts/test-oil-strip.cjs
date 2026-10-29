// Local synthetic PostgreSQL only. Clone an existing test schema; never run migrations.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const {execFileSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.data/validation/oil-strip');fs.mkdirSync(dir,{recursive:true});
const template=fs.readFileSync(path.join(root,'.data/validation/group-workflows/database.txt'),'utf8').trim();assert(/^workflow_\d+$/.test(template));
const database='oilstrip_'+Date.now();execFileSync('docker',['exec','bpma-temperature-workflow-test','createdb','-U','postgres','-T',template,database],{stdio:'pipe'});
const url=`postgresql://postgres:isolated_test_only@127.0.0.1:55479/${database}`;process.env.DATABASE_URL=url;process.env.DIRECT_URL=url;
const mocks=new Map(),load=Module._load;Module._load=function(n,p,m){if(mocks.has(n))return mocks.get(n);if(n==='server-only')return{};if(n.startsWith('@/'))n=path.join(root,'src',n.slice(2));return load.call(this,n,p,m);};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
const {PrismaClient}=require('@prisma/client'),prisma=new PrismaClient({datasources:{db:{url}}});mocks.set('@/lib/prisma',{prisma});prisma.$use(require('../src/lib/active-operational-records.ts').activeOperationalRecords);
mocks.set('next/cache',{revalidatePath(){}});class Redirect extends Error{constructor(url){super('redirect');this.url=url;}}mocks.set('next/navigation',{redirect(url){throw new Redirect(url);}});mocks.set('@/lib/redirect-error',{rethrowIfRedirectError(e){if(e instanceof Redirect)throw e;}});
let user;mocks.set('@/lib/auth-session',{getCurrentUser:async()=>user,getCurrentUserForAction:async()=>user});
const dates=require('../src/lib/date-time.ts'),day=dates.formatAppDateInput(dates.getAppDate());
const {getRegistroPayload}=require('../src/app/controle-qualidade-oleo/record-payload.ts');
const {oilAdapter,refreshWorkflowActor}=require('../src/app/controle-qualidade-oleo/workflow-adapter.ts'),{saveWorkflow}=require('../src/lib/operational-workflow/service.ts');
const {INITIAL_OIL_STRIP_OPTIONS}=require('../src/app/controle-qualidade-oleo/options.ts');
const form=extra=>{const f=new FormData();for(const[k,v]of Object.entries({temperatura:'173,3',semUtilizacao:'false',intent:'complete',...extra}))f.set(k,v);return f;};
const save=(key,version,extra)=>saveWorkflow({actor:tx=>refreshWorkflowActor(tx,user),adapter:oilAdapter,key,expectedVersion:version,input:form(extra)});
const row=id=>prisma.controleQualidadeOleoRegistro.findFirstOrThrow({where:{fluxoId:id}});
(async()=>{
 assert.equal((await prisma.$queryRaw`select current_database() name`)[0].name,database);
 const account=await prisma.usuario.create({data:{nomeCompleto:'Oil Strip Test',nomeUsuario:'oil-strip-'+Date.now(),senhaHash:require('../src/lib/password.ts').hashPassword('oil-strip-password'),perfil:'DEV'}});
 const session=await prisma.usuarioSessao.create({data:{usuarioId:account.id,tokenHash:randomUUID(),expiraEm:new Date('2035-01-01')}});user={...account,sessaoId:session.id,permissoes:[]};
 for(const opt of INITIAL_OIL_STRIP_OPTIONS){await prisma.controleQualidadeOleoOpcaoFita.upsert({where:{rotulo:opt.rotulo},create:opt,update:{...opt,ativo:true}});}
 const key=day+':'+randomUUID();let unit=await save(key,0,{fitaOleo:'3,5%'});assert.equal((await row(unit.id)).fitaOleo,'3,5%');
 unit=await save(key,unit.versao,{observacao:'Alterei somente a observação'});
 if(process.argv.includes('--before')){
  assert.equal((await row(unit.id)).fitaOleo,null);assert.equal((await row(unit.id)).status,null);
  console.log('REPRODUCED: selected 3,5% persisted, subsequent omitted fitaOleo erased strip/status.');
 }else{
  assert.equal((await row(unit.id)).fitaOleo,'3,5%');assert.equal((await row(unit.id)).status,'ATENCAO');
  await assert.rejects(()=>save(day+':'+randomUUID(),0,{}),/confirme Sem aferição/);
  await assert.rejects(()=>save(key,unit.versao,{fitaOleo:''}),/confirme Sem aferição/);
  for(const opt of INITIAL_OIL_STRIP_OPTIONS){
   const u=await save(day+':'+randomUUID(),0,{fitaOleo:opt.rotulo});const r=await row(u.id);
   assert.equal(r.fitaOleo,opt.rotulo);assert.equal(r.status,opt.statusAssociado);assert.equal(r.temperatura,173.3);
   const legacy=await prisma.controleQualidadeOleoRegistro.create({data:{data:dates.getAppDate(),...await getRegistroPayload(form({fitaOleo:opt.rotulo}),'Legacy Test',prisma)}});
   const payload=await getRegistroPayload(form({observacao:'Only observation'}),'Legacy Test',prisma,legacy);
   await prisma.controleQualidadeOleoRegistro.update({where:{id:legacy.id},data:payload});
   assert.equal((await prisma.controleQualidadeOleoRegistro.findUniqueOrThrow({where:{id:legacy.id}})).fitaOleo,opt.rotulo);
  }
  const none=await save(day+':'+randomUUID(),0,{fitaOleo:'__SEM_AFERICAO__',temperatura:'110'});assert.equal((await row(none.id)).fitaOleo,null);assert.equal((await row(none.id)).status,null);
  const unused=await save(day+':'+randomUUID(),0,{semUtilizacao:'true',temperatura:''});assert.equal((await row(unused.id)).status,'SEM_UTILIZACAO');assert.equal((await row(unused.id)).temperatura,null);
  await assert.rejects(()=>save(day+':'+randomUUID(),0,{fitaOleo:'2%',temperatura:'119'}),/120/);
  await assert.rejects(()=>save(day+':'+randomUUID(),0,{fitaOleo:'wrong'}),/opção válida/);
  const draftKey=day+':'+randomUUID();let draft=await save(draftKey,0,{intent:'draft',temperatura:'',fitaOleo:'7%'});draft=await save(draftKey,draft.versao,{});assert.equal((await row(draft.id)).fitaOleo,'7%');
  const changed=await save(key,unit.versao,{fitaOleo:'5,5%'});assert.equal((await row(changed.id)).status,'ULTIMA_UTILIZACAO');
  const concurrent=await Promise.allSettled([save(key,changed.versao,{fitaOleo:'2%'}),save(key,changed.versao,{fitaOleo:'7%'})]);assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);assert.equal(await prisma.controleQualidadeOleoRegistro.count({where:{fluxoId:unit.id}}),1);
  const duplicateKey=day+':'+randomUUID();await save(duplicateKey,0,{fitaOleo:'2%'});await assert.rejects(()=>save(duplicateKey,0,{fitaOleo:'7%'}));assert.equal(await prisma.fluxoOperacional.count({where:{modulo:'oleo',chave:duplicateKey}}),1);
  const actions=require('../src/app/controle-qualidade-oleo/actions.ts');const legacy=await prisma.controleQualidadeOleoRegistro.create({data:{data:dates.getAppDate(),...await getRegistroPayload(form({fitaOleo:'3,5%'}),'Legacy Test',prisma)}});
  try{await actions.updateRegistroAction(form({id:String(legacy.id),observacao:'Legacy action partial edit',returnTo:'/controle-qualidade-oleo'}));assert.fail('redirect');}catch(e){assert(e instanceof Redirect);assert.match(e.url,/feedbackType=success/);}
  assert.equal((await prisma.controleQualidadeOleoRegistro.findUniqueOrThrow({where:{id:legacy.id}})).fitaOleo,'3,5%');
  await prisma.controleQualidadeOleoOpcaoFita.update({where:{rotulo:'3,5%'},data:{ativo:false}});
  assert.equal((await getRegistroPayload(form({}),'Legacy Test',prisma,legacy)).fitaOleo,'3,5%');
  await assert.rejects(()=>getRegistroPayload(form({fitaOleo:'3,5%'}),'Legacy Test',prisma),/opção válida/);
  await prisma.controleQualidadeOleoOpcaoFita.update({where:{rotulo:'3,5%'},data:{ativo:true}});
  const double=form({fitaOleo:'2%'});double.append('fitaOleo','7%');await assert.rejects(()=>getRegistroPayload(double,'Test',prisma),/confirme/);
  const {signWorkflow}=require('../src/lib/operational-workflow/service.ts'),{oilSignatureBridge}=require('../src/app/controle-qualidade-oleo/workflow-adapter.ts');
  await signWorkflow({actor:tx=>refreshWorkflowActor(tx,user),bridge:oilSignatureBridge('oil-strip-password',false),scope:[{id:none.id,version:none.versao}]});
  const signed=JSON.stringify(await row(none.id)),signatureCount=await prisma.fluxoAssinatura.count();await assert.rejects(()=>save(none.chave,none.versao,{fitaOleo:'7%'}),/fechado|versão/i);assert.equal(JSON.stringify(await row(none.id)),signed);assert.equal(await prisma.fluxoAssinatura.count(),signatureCount);
  const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');mocks.set('next/link',({href,children,...props})=>React.createElement('a',{...props,href},children));
  const history=require('../src/app/controle-qualidade-oleo/workflow-view.tsx');assert.match(renderToStaticMarkup(await history.OilWorkflowList({history:true,query:{}})),/3,5%/);
  const {NextRequest}=require('next/server');const response=await require('../src/app/relatorios/controle-qualidade-oleo/mensal/route.ts').GET(new NextRequest(`http://localhost/relatorios/controle-qualidade-oleo/mensal?mes=${Number(day.slice(5,7))}&ano=${day.slice(0,4)}`));assert.equal(response.status,200);const html=await response.text();for(const opt of INITIAL_OIL_STRIP_OPTIONS)assert(html.includes(opt.rotulo));assert(html.includes('Imprimir'));fs.writeFileSync(path.join(dir,'report.html'),html);
  console.log('PASS PostgreSQL: all five strips/statuses, omission rejected, explicit no strip, unused, legacy action, inactive historical option, signed save denied, signatures unchanged, partial edits, draft recovery, validation, optimistic concurrency, duplicate submission, history/report.');
 }
 fs.writeFileSync(path.join(dir,'database.txt'),database);fs.writeFileSync(path.join(dir,'account.json'),JSON.stringify({username:account.nomeUsuario,key,day}));
 console.log('Local database: '+database);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>prisma.$disconnect());
