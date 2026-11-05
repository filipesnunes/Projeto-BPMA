// Writes exclusively to a NEW localhost synthetic database cloned from the
// previously prepared test template. Never reads .env connection settings.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const {execFileSync}=require('node:child_process'),{randomUUID,createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.data/validation/temperature-signatures-20261105');fs.mkdirSync(dir,{recursive:true});
const template=fs.readFileSync(path.join(root,'.data/validation/group-workflows/database.txt'),'utf8').trim();assert(/^workflow_\d+$/.test(template));
const database='tempsnapshot_'+Date.now(),bin=path.join(root,'.data/validation/buffet-pending-postgres-20261102/runtime/pgsql/bin/createdb.exe');
execFileSync(bin,['-h','127.0.0.1','-p','55479','-U','postgres','-T',template,database],{stdio:'pipe',windowsHide:true,env:{...process.env,PGPASSWORD:'isolated_test_only'}});
const url=`postgresql://postgres:isolated_test_only@127.0.0.1:55479/${database}`;process.env.DATABASE_URL=url;process.env.DIRECT_URL=url;
const envHash=createHash('sha256').update(fs.readFileSync(path.join(root,'.env'))).digest('hex');
const mocks=new Map(),load=Module._load;Module._load=function(n,p,m){if(mocks.has(n))return mocks.get(n);if(n==='server-only')return{};if(n.startsWith('@/'))n=path.join(root,'src',n.slice(2));return load.call(this,n,p,m);};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
const {PrismaClient}=require('@prisma/client'),prisma=new PrismaClient({datasources:{db:{url}}}),inspect=new PrismaClient({datasources:{db:{url}}});
mocks.set('@/lib/prisma',{prisma});prisma.$use(require('../src/lib/active-operational-records.ts').activeOperationalRecords);
mocks.set('next/cache',{revalidatePath(){}});class Redirect extends Error{constructor(url){super('redirect');this.url=new URL(url,'http://localhost');}}
mocks.set('next/navigation',{redirect(url){throw new Redirect(url);},notFound(){throw Error('Not found');}});mocks.set('@/lib/redirect-error',{rethrowIfRedirectError(e){if(e instanceof Redirect)throw e;}});
let user;mocks.set('@/lib/auth-session',{getCurrentUser:async()=>user,getCurrentUserForAction:async()=>{if(!user)throw Error('Sessão ausente');return user;}});
const dates=require('../src/lib/date-time.ts'),today=dates.getAppDate(),day=dates.formatAppDateInput(today);dates.getAppNow=()=>new Date(day+'T20:00:00Z');
const core=require('../src/lib/operational-workflow/service.ts'),{buffetAdapter}=require('../src/app/controle-buffet-amostras/workflow-adapter.ts');
const {temperatureAdapter,temperatureSignatureBridge,refreshWorkflowActor}=require('../src/app/controle-temperatura-equipamentos/workflow-adapter.ts');
const {oilAdapter,oilSignatureBridge}=require('../src/app/controle-qualidade-oleo/workflow-adapter.ts'),{receivingAdapter}=require('../src/app/rastreabilidade-recebimento/workflow-adapter.ts');
const {groupSignatureBridge}=require('../src/lib/operational-workflow/group-signatures.ts'),{workflowReviewEligibility}=require('../src/lib/operational-workflow/review-eligibility.ts');
const {cleaningReviewScope,signCleaningReview}=require('../src/app/plano-limpeza/signature-policy.ts'),{legacyReviewScope}=require('../src/lib/legacy-review-scope.ts');
const shared=require('../src/app/historico-operacional/actions.ts'),cleanActions=require('../src/app/plano-limpeza/actions.ts'),buffetActions=require('../src/app/controle-buffet-amostras/actions.ts');
const {hashPassword}=require('../src/lib/password.ts'),permissions=require('../src/lib/permissions.ts'),{renderToStaticMarkup}=require('react-dom/server'),{GroupWorkflowPanel}=require('../src/components/group-workflow-panel.tsx');
const form=values=>{const f=new FormData();for(const[k,v]of Object.entries(values))for(const x of Array.isArray(v)?v:[v])f.append(k,x instanceof Blob?x:String(x));return f;};
const actor=who=>tx=>refreshWorkflowActor(tx,who),latest=id=>inspect.fluxoOperacional.findUniqueOrThrow({where:{id},include:{amostras:{where:{excluidoEm:null},orderBy:{id:'asc'}},recebimento:{include:{itens:true}},temperatura:true,assinaturaVigente:true,versoes:true,eventos:true}});
const save=(who,adapter,key,input,version=0)=>core.saveWorkflow({actor:actor(who),adapter,key,input,expectedVersion:version});
const sign=(who,units,bridge)=>core.signWorkflow({actor:actor(who),scope:units.map(u=>({id:u.id,version:u.versao})),bridge});
const redirect=async fn=>{try{await fn();assert.fail('Expected redirect');}catch(e){assert(e instanceof Redirect,e.stack);return e.url;}};
const outcomes=[];async function check(name,fn){await fn();outcomes.push(name);console.log('PASS '+name);}
const fingerprint=async()=>JSON.stringify(await Promise.all([inspect.fluxoAssinatura.findMany({orderBy:{id:'asc'},include:{vinculos:true}}),inspect.logAssinatura.findMany({orderBy:{id:'asc'}}),inspect.fluxoVersao.findMany({orderBy:[{fluxoId:'asc'},{versao:'asc'}]})]));
const retro=require('../src/lib/retroactive-review.ts'),reopening=require('../src/lib/monthly-reopening.ts');
const retroAction=require('../src/app/historico-operacional/revisao-retroativa/actions.ts');
(async()=>{
 assert.equal((await prisma.$queryRaw`SELECT current_database() name`)[0].name,database);
 const password='synthetic-temperature-password',tag='TEMP-'+Date.now();
 async function account(suffix,role,codes){
  const profile=await prisma.perfilAcesso.create({data:{codigo:tag+'-'+suffix,nome:tag+' '+suffix}});
  for(const code of codes){const definition=permissions.PERMISSION_DEFINITIONS.find(p=>p.codigo===code);assert(definition);const p=await prisma.permissao.upsert({where:{codigo:code},create:definition,update:{}});await prisma.perfilPermissao.create({data:{perfilId:profile.id,permissaoId:p.id}});}
  const u=await prisma.usuario.create({data:{nomeCompleto:tag+' '+suffix,nomeUsuario:(tag+'-'+suffix).toLowerCase(),senhaHash:hashPassword(password),perfil:role,perfilAcessoId:profile.id}});
  const session=await prisma.usuarioSessao.create({data:{usuarioId:u.id,tokenHash:randomUUID(),expiraEm:new Date('2035-01-01')}});return {...u,sessaoId:session.id,permissoes:codes};
 }
 const all=permissions.PERMISSION_DEFINITIONS.filter(p=>p.codigo.startsWith('modulo.temperatura.')||p.codigo==='usuarios.responsavel_tecnico'||p.codigo==='modulo.relatorios.acessar').map(p=>p.codigo);
 const operator=await account('executor','COLABORADOR',all),nutri=await account('supervisora','NUTRICIONISTA',all),denied=await account('sem-autorizacao','NUTRICIONISTA',['modulo.temperatura.acessar']);
 const category=await prisma.controleTemperaturaCategoriaParametro.upsert({where:{categoria:'REFRIGERACAO'},create:{categoria:'REFRIGERACAO',nome:tag,orientacaoCorretivaPadrao:'Verificar'},update:{}});
 await prisma.controleTemperaturaCategoriaRegra.updateMany({where:{categoriaId:category.id},data:{isActive:false}});
 await prisma.controleTemperaturaCategoriaRegra.createMany({data:[{categoriaId:category.id,temperaturaMin:0,temperaturaMax:5,status:'CONFORME',acaoCorretiva:'Não se aplica',ordem:1},{categoriaId:category.id,temperaturaMin:5.01,temperaturaMax:10,status:'ALERTA',acaoCorretiva:'Verificar equipamento',ordem:2}]});
 await prisma.moduloConfiguracao.upsert({where:{modulo:'CONTROLE_TEMPERATURA'},create:{modulo:'CONTROLE_TEMPERATURA',exigirFotoEmAlertaCritico:false},update:{exigirFotoEmAlertaCritico:false}});
 const equipment=async name=>prisma.controleTemperaturaEquipamentoOpcao.create({data:{nome:tag+' '+name,tipo:'EQUIPAMENTO',categoriaEquipamento:'REFRIGERACAO',turnoManha:true,turnoTarde:true}});
 const normal=await equipment('Consistente'),renamed=await equipment('Freezer de bancada 02');
 const make=async(eq,date,shift='MANHA',extra={})=>latest((await save(operator,temperatureAdapter,`${eq.id}:${date}:${shift}`,form({statusOperacionalEquipamento:'EM_OPERACAO',temperaturaAferida:'3',horarioAfericao:'08:30',intent:'complete',...extra}))).id);
 const adapter=require('../src/app/controle-temperatura-equipamentos/workflow-adapter.ts');
 const integrity=require('../src/app/controle-temperatura-equipamentos/snapshot-integrity.ts');
 const consistent=[],affected=[];
 for(const date of ['2026-11-01','2026-11-02','2026-11-03'])for(const shift of ['MANHA','TARDE'])consistent.push(await make(normal,date,shift));
 for(const [date,shift]of [['2026-11-01','MANHA'],['2026-11-02','MANHA'],['2026-11-02','TARDE'],['2026-11-03','MANHA']])affected.push(await make(renamed,date,shift));
 const beforeAffected=await Promise.all(affected.map(u=>inspect.controleTemperaturaEquipamento.findUniqueOrThrow({where:{fluxoId:u.id}})));
 // Reproduce the prior catalog action's bulk propagation, exclusively in this
 // synthetic DB: change names without updating the stored versions.
 await inspect.controleTemperaturaEquipamentoOpcao.update({where:{id:renamed.id},data:{nome:tag+' Refrigerador de bancada 02'}});
 await inspect.controleTemperaturaEquipamento.updateMany({where:{equipamento:renamed.nome},data:{equipamento:tag+' Refrigerador de bancada 02'}});
 await check('Reprodução 01/02/03: quatro nomes alterados fora da versão, demais campos e rascunhos iguais',async()=>{
  for(const [i,u]of affected.entries()){
   const current=await latest(u.id),stored=current.versoes.find(v=>v.versao===current.versao),snapshot=adapter.temperatureSnapshot(current.temperatura);
   assert.deepEqual(integrity.temperatureSnapshotDifferences(stored.dados,snapshot),['equipamento']);
   for(const key of Object.keys(beforeAffected[i]).filter(k=>!['equipamento','updatedAt'].includes(k)))assert.deepEqual(current.temperatura[key],beforeAffected[i][key]);
   await assert.rejects(()=>temperatureSignatureBridge(password,false).validate(prisma,current),e=>e.message.includes('#'+current.temperatura.id)&&e.message.includes('equipamento')&&e.message.includes(u.dataReferencia.toISOString().slice(0,10)));
  }
 });
 await check('Assinatura coletiva identifica aferição/turno/campo e preserva atomicamente todos os registros',async()=>{
  const good=consistent[0],bad=affected[0],before=await fingerprint();await assert.rejects(()=>sign(nutri,[good,bad],temperatureSignatureBridge(password,true)),e=>e.message.includes('#'+bad.temperatura.id)&&e.message.includes('manhã')&&e.message.includes('equipamento'));
  assert.equal((await latest(good.id)).assinaturaVigenteId,null);assert.equal((await latest(bad.id)).assinaturaVigenteId,null);assert.equal(await fingerprint(),before);
 });
 await check('Consistentes de 01/02/03 assinam individualmente e por dia sem novo salvamento',async()=>{
  for(const date of ['2026-11-01','2026-11-02','2026-11-03']){
   const units=consistent.filter(u=>u.dataReferencia.toISOString().startsWith(date));const originals=await Promise.all(units.map(u=>latest(u.id)));
   if(date==='2026-11-01')for(const u of units)await sign(nutri,[u],temperatureSignatureBridge(password,false));else await sign(nutri,units,temperatureSignatureBridge(password,true));
   for(const [i,u]of units.entries()){const after=await latest(u.id);assert(after.assinaturaVigenteId);assert.deepEqual(after.temperatura,originals[i].temperatura);assert.deepEqual(after.versoes,originals[i].versoes);}
  }
 });
 await check('Correção do cadastro bloqueia renomear opções usadas sem alterar históricos; opção nova pode mudar',async()=>{
  user=nutri;const action=require('../src/app/controle-temperatura-equipamentos/actions.ts').updateCatalogOptionAction;
  const edit=(eq,name)=>form({optionId:eq.id,nome:name,categoriaEquipamento:'REFRIGERACAO',turnosConferencia:['MANHA','TARDE'],ativo:'true'});
  const originals=await inspect.controleTemperaturaEquipamento.findMany({where:{equipamento:normal.nome},orderBy:{id:'asc'}}),versions=await fingerprint();
  const result=await redirect(()=>action(edit(normal,normal.nome+' renomeado')));assert.equal(result.searchParams.get('feedbackType'),'error');assert.match(result.searchParams.get('feedback'),/nome histórico/);
  assert.deepEqual(await inspect.controleTemperaturaEquipamento.findMany({where:{equipamento:normal.nome},orderBy:{id:'asc'}}),originals);assert.equal(await fingerprint(),versions);assert.equal((await prisma.controleTemperaturaEquipamentoOpcao.findUniqueOrThrow({where:{id:normal.id}})).nome,normal.nome);
  const unused=await equipment('Sem aferições');assert.equal((await redirect(()=>action(edit(unused,unused.nome+' novo')))).searchParams.get('feedbackType'),'success');
  const corrective=await prisma.controleTemperaturaEquipamentoOpcao.create({data:{tipo:'ACAO_CORRETIVA',nome:tag+' Ação histórica'}});
  const excluded=await inspect.controleTemperaturaEquipamento.create({data:{data:new Date('2026-11-01'),equipamento:tag+' Arquivado',categoriaEquipamento:'REFRIGERACAO',turno:'MANHA',temperaturaAferida:3,status:'CONFORME',responsavel:'Executor sintético',acaoCorretiva:corrective.nome,excluidoEm:new Date()}});
  const blocked=await redirect(()=>action(form({optionId:corrective.id,nome:corrective.nome+' novo'})));assert.equal(blocked.searchParams.get('feedbackType'),'error');assert.deepEqual(await inspect.controleTemperaturaEquipamento.findUniqueOrThrow({where:{id:excluded.id}}),excluded);
 });
 await check('Alerta, INATIVO e MANUTENCAO preservam estado, valores e evidência na assinatura',async()=>{
  for(const state of ['EM_OPERACAO','INATIVO','MANUTENCAO']){
   const eq=await equipment(state),u=await make(eq,'2026-11-02','MANHA',{statusOperacionalEquipamento:state,temperaturaAferida:state==='EM_OPERACAO'?'8':''}),before=await latest(u.id);
   if(state==='EM_OPERACAO')assert.equal(before.temperatura.status,'ALERTA');else assert.equal(before.temperatura.temperaturaAferida,null);
   await prisma.controleTemperaturaEquipamentoOpcao.update({where:{id:eq.id},data:{ativo:false}});
   await sign(nutri,[u],temperatureSignatureBridge(password,false));assert.deepEqual((await latest(u.id)).temperatura,before.temperatura);
  }
  const eq=await equipment('Foto preservada'),u=await make(eq,'2026-11-02','TARDE',{temperaturaAferida:'8',fotoDesvio:new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')],'evidencia.png',{type:'image/png'})});
  const before=await latest(u.id);assert(before.temperatura.fotoBase64);await sign(nutri,[u],temperatureSignatureBridge(password,false));assert.deepEqual((await latest(u.id)).temperatura,before.temperatura);
 });
 const signable=await make(await equipment('Permissões'),'2026-11-03');
 await check('Senha, permissão, versão obsoleta e divergência operacional continuam protegidas',async()=>{
  const before=await fingerprint();await assert.rejects(()=>sign(nutri,[signable],temperatureSignatureBridge('wrong',false)),/Senha/);await assert.rejects(()=>sign(denied,[signable],temperatureSignatureBridge(password,false)),/permissão/);
  await assert.rejects(()=>core.signWorkflow({actor:actor(nutri),scope:[{id:signable.id,version:signable.versao+1}],bridge:temperatureSignatureBridge(password,false)}),/versão|Versão|atualiz/);
  assert.equal(await fingerprint(),before);
  const original=signable.temperatura;await inspect.controleTemperaturaEquipamento.update({where:{id:original.id},data:{temperaturaAferida:4}});await assert.rejects(()=>sign(nutri,[signable],temperatureSignatureBridge(password,false)),/temperaturaAferida/);assert.equal(await fingerprint(),before);
 });
 await check('Retroativa autorizada assina conteúdo consistente e mantém divergência real bloqueada',async()=>{
  const u=await make(await equipment('Retroativa'),'2026-11-03'),scope={module:'temperatura',date:u.dataReferencia,flowId:u.id};const preview=await retro.retroactiveReviewScope(prisma,nutri,scope);assert(preview.allowed);
  const before=await latest(u.id);await retro.signRetroactiveReview({authenticated:nutri,scope,token:preview.token,password,justification:'Revisão técnica sintética',confirmed:true});const after=await latest(u.id);assert(after.assinaturaVigenteId);assert.deepEqual(after.temperatura,before.temperatura);assert.deepEqual(after.versoes,before.versoes);
  const bad=affected[0],rejected=await retro.retroactiveReviewScope(prisma,nutri,{module:'temperatura',date:bad.dataReferencia,flowId:bad.id});assert.equal(rejected.allowed,false);assert(rejected.reason.includes('#'+bad.temperatura.id));
 });
 await check('Formatador específico: somente nome técnico nos dois relatórios, gerencial explícito e data compartilhada preservada',async()=>{
  const fmt=require('../src/lib/review-presentation.ts'),who='Camila sintética',date=new Date('2026-11-05T13:40:00Z');
  for(const mecanismo of ['SERVICO','Revisão técnica retroativa com ressalvas'])assert.equal(fmt.reportSupervisorName({usuarioNome:who,mecanismo}),who);
  assert.equal(fmt.reportSupervisorName(null),'-');assert.match(fmt.reportSupervisorName({usuarioNome:who,mecanismo:'Revisão gerencial retroativa com ressalvas'}),/Revisão gerencial/);assert(!fmt.reportSupervisorName({usuarioNome:who,mecanismo:'Revisão gerencial retroativa'}).includes('2026'));
  assert(fmt.reportSignatureLabel({usuarioNome:who,mecanismo:'Revisão técnica retroativa',assinadoEm:date}).includes('05/11/2026'));
 });
 const browserConsistent=[];for(const date of ['2026-11-01','2026-11-02','2026-11-03'])for(const shift of ['MANHA','TARDE'])browserConsistent.push(await make(await equipment('Navegador '+date+' '+shift),date,shift));
 const browserRetro=await make(await equipment('Navegador retroativa'),'2026-11-03');
 fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify({database,password,retro:{id:browserRetro.id,version:browserRetro.versao,date:"2026-11-03",recordId:browserRetro.temperatura.id},nutri:nutri.nomeUsuario,operator:operator.nomeUsuario,denied:denied.nomeUsuario,consistent:browserConsistent.map(u=>({id:u.id,version:u.versao,key:u.chave,recordId:u.temperatura.id,date:u.dataReferencia.toISOString().slice(0,10),shift:u.temperatura.turno})),affected:affected.map(u=>({id:u.id,version:u.versao,key:u.chave,recordId:u.temperatura.id,date:u.dataReferencia.toISOString().slice(0,10),shift:u.temperatura.turno}))}));
 assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,'.env'))).digest('hex'),envHash);fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify({database,outcomes},null,2));console.log('PASS '+outcomes.length+' grupos de integridade Temperatura.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await prisma.$disconnect();await inspect.$disconnect();});
