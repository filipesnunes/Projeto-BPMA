// Writes exclusively to a NEW localhost synthetic database cloned from the
// previously prepared test template. Never reads .env connection settings.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const {execFileSync}=require('node:child_process'),{randomUUID,createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.data/validation/buffet-corrections');fs.mkdirSync(dir,{recursive:true});
const template=fs.readFileSync(path.join(root,'.data/validation/group-workflows/database.txt'),'utf8').trim();assert(/^workflow_\d+$/.test(template));
const database='buffetcorrections_'+Date.now(),bin=path.join(root,'.data/validation/buffet-pending-postgres-20261102/runtime/pgsql/bin/createdb.exe');
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
const {buffetServiceReview}=require('../src/app/controle-buffet-amostras/service-review.ts');
const {readBuffetCorrection}=require('../src/app/controle-buffet-amostras/correction-evidence.ts');
const outcomes=[];async function check(name,fn){await fn();outcomes.push(name);console.log('PASS '+name);}
(async()=>{
assert.equal((await prisma.$queryRaw`SELECT current_database() name`)[0].name,database);
const tag='CORRECTIONS-'+Date.now(),password='corrections-test-password';
 async function account(suffix,role,codes){let profile;if(codes){profile=await prisma.perfilAcesso.create({data:{codigo:tag+'-'+suffix,nome:tag+' '+suffix}});for(const code of codes){const def=permissions.PERMISSION_DEFINITIONS.find(p=>p.codigo===code);assert(def,code);const entry=await prisma.permissao.upsert({where:{codigo:code},create:def,update:{}});await prisma.perfilPermissao.create({data:{perfilId:profile.id,permissaoId:entry.id}});}}
 const a=await prisma.usuario.create({data:{nomeCompleto:tag+' '+suffix,nomeUsuario:(tag+'-'+suffix).toLowerCase(),senhaHash:hashPassword(password),perfil:role,perfilAcessoId:profile?.id}}),session=await prisma.usuarioSessao.create({data:{usuarioId:a.id,tokenHash:randomUUID(),expiraEm:new Date('2035-01-01')}});return{...a,sessaoId:session.id,permissoes:codes??permissions.getDefaultPermissionCodes(role)};}
 const all=permissions.PERMISSION_DEFINITIONS.filter(p=>p.codigo.startsWith('modulo.amostras.')||['usuarios.responsavel_tecnico','modulo.relatorios.acessar'].includes(p.codigo)).map(p=>p.codigo);
 const operator=await account('operator','COLABORADOR',all),other=await account('other','COLABORADOR',all),nutri=await account('nutri','NUTRICIONISTA',all),manager=await account('manager','GERENTE',all),dev=await account('dev','DEV'),noSign=await account('no-sign','NUTRICIONISTA',['modulo.amostras.acessar','usuarios.responsavel_tecnico']),noRT=await account('no-rt','NUTRICIONISTA',['modulo.amostras.acessar','modulo.amostras.assinar_servico']);
 await prisma.controleBuffetAmostraAcaoCorretiva.upsert({where:{nome:'Não se aplica'},create:{nome:'Não se aplica'},update:{ativo:true}});
 const items=[];for(let i=0;i<3;i++)items.push(await prisma.controleBuffetAmostraItem.create({data:{nome:tag+' Item '+i,classificacao:'FRIO'}}));
 const retro=dates.formatAppDateInput(new Date(+today-86400000));
 async function fixture(who=operator,multiple=false,partial=false,date=retro){
  const service=await prisma.controleBuffetAmostraServico.create({data:{nome:tag+' Serviço '+randomUUID()}});await prisma.controleBuffetAmostraItemServico.createMany({data:items.map(i=>({servicoId:service.id,itemId:i.id}))});
  const input=selected=>{const f=form({rowKey:selected.map(i=>'item-'+i.id)});for(const i of selected)for(const[k,v]of Object.entries({tcEquipamento:'5',primeiraTc:'5',temperaturaTipo:'NUMERICA',acaoCorretiva:'Não se aplica',horarioExecucao:'08:15'}))f.set('item-'+i.id+'-'+k,v);return f;};
  let flow=await save(who,buffetAdapter,service.id+':'+date,input(items.slice(0,1)));
  if(!partial)flow=await save(multiple?other:who,buffetAdapter,flow.chave,input(items.slice(1)),flow.versao);
  return latest(flow.id);
 }
 const correction=(flow,selected=[0,1],justification='Conferência documental sintética, sem nova aferição')=>{
  const f=form({rowKey:selected.map(index=>'item-'+items[index].id),rowIntentVersion:1,intent:'complete',justificativaCorrecao:justification});
  for(const index of selected){const key='item-'+items[index].id;f.set(key+'-primeiraTc','6');f.append('changedField',key+'-primeiraTc');f.set(key+'-observacao','Corrigido em conferência técnica');f.append('changedField',key+'-observacao');}return f;
 };
 const review=flow=>buffetServiceReview(prisma,nutri,flow.id,false),signService=(who,flow,pwd=password,version=flow.versao)=>core.signWorkflow({actor:actor(who),scope:[{id:flow.id,version}],bridge:groupSignatureBridge('amostras','SERVICO',pwd)});
 const state=async flow=>JSON.stringify(await latest(flow.id));
 let independent=await fixture();
 await check('1. Colaborador executa e nutricionista independente assina',async()=>{const rows=JSON.stringify(independent.amostras);assert((await review(independent)).allowed);await signService(nutri,independent);independent=await latest(independent.id);assert.equal(JSON.stringify(independent.amostras),rows);});
 let corrected=await fixture();const original=await latest(corrected.id);
 await check('2–6. Nutricionista corrige vários itens, com antes/depois, autor, horário e versão auditados',async()=>{
  corrected=await latest((await save(nutri,buffetAdapter,corrected.chave,correction(corrected),corrected.versao)).id);
  assert.equal(corrected.estado,'COMPLETO');assert((await review(corrected)).allowed);
  for(const row of corrected.amostras){const before=original.amostras.find(r=>r.id===row.id);for(const key of ['responsavelUsuarioId','responsavelNome','responsavelPerfil','dataHoraRegistro','horarioExecucao','horarioNaoInformado','justificativaHorario'])assert.deepEqual(row[key],before[key]);}
  const event=corrected.eventos.find(e=>e.operacao==='CORRECAO_REGISTRO');assert(event);assert.equal(event.usuarioId,nutri.id);assert.equal(event.versaoNova,corrected.versao);assert(event.criadoEm instanceof Date);
  const evidence=readBuffetCorrection(event.justificativa);assert(evidence);assert.equal(evidence.itens.length,2);assert.equal(evidence.itens[0].executorOriginal.id,operator.id);assert(evidence.itens[0].campos.some(c=>c.campo==='primeiraTc'&&c.antes===5&&c.depois===6));assert(evidence.justificativa.includes('sem nova aferição'));
  const component=require('../src/app/controle-buffet-amostras/correction-history.tsx').BuffetCorrectionDetails;const html=renderToStaticMarkup(component({evidence:event.justificativa}));assert(html.includes(operator.nomeCompleto));assert(html.includes('5 → 6'));assert(html.includes('Conferência documental'));
  assert.equal(JSON.stringify(original.versoes),JSON.stringify(corrected.versoes.filter(v=>v.versao<=original.versao)));
 });
 await check('7–13. Parcial, perfil, RT, permissão, senha, competência e versão continuam protegidos',async()=>{
  const partial=await fixture(operator,false,true);await assert.rejects(()=>signService(nutri,partial),/disponível|incompleto/);
  for(const who of [operator,manager,dev,noSign,noRT])await assert.rejects(()=>signService(who,corrected),/nutricionista|permissão/);
  await assert.rejects(()=>signService(nutri,corrected,'incorrect'),/Senha/);await assert.rejects(()=>signService(nutri,corrected,password,corrected.versao-1),/atualizado/);
  assert(!(await buffetServiceReview(prisma,nutri,corrected.id,true)).allowed);
  const oldDate='2026-09-10',closed=await fixture(operator,false,false,oldDate);
  await prisma.fechamentoMensalModulo.create({data:{moduloCodigo:'amostras',ano:2026,mes:9,usuarioId:nutri.id,usuarioNomeSnapshot:nutri.nomeCompleto,usuarioPerfilSnapshot:nutri.perfil}});
  await assert.rejects(()=>signService(nutri,closed),/competência.*fechada/);
  await signService(nutri,corrected);corrected=await latest(corrected.id);await assert.rejects(()=>signService(nutri,corrected),/disponível/);
 });
 await check('4. Vários executores originais preservados após correções e assinatura da nutricionista',async()=>{
  let multiple=await fixture(operator,true);const ids=multiple.amostras.map(r=>r.responsavelUsuarioId);assert(ids.includes(operator.id)&&ids.includes(other.id));
  multiple=await latest((await save(nutri,buffetAdapter,multiple.chave,correction(multiple,[0,1,2]),multiple.versao)).id);assert.deepEqual(multiple.amostras.map(r=>r.responsavelUsuarioId),ids);assert((await review(multiple)).allowed);await signService(nutri,multiple);
 });
 await check('14–16. Reabertura, correção e nova assinatura conservam a assinatura e versões anteriores',async()=>{
  const previous=corrected.assinaturaVigenteId,oldVersions=JSON.stringify(corrected.versoes);await assert.rejects(()=>save(nutri,buffetAdapter,corrected.chave,correction(corrected),corrected.versao),/fechado/);
  corrected=await latest((await core.reopenWorkflow({actor:actor(nutri),module:'amostras',id:corrected.id,expectedVersion:corrected.versao,reason:'Nova conferência sintética autorizada',fromEdit:false})).id);
  const f=form({rowKey:'item-'+items[2].id,rowIntentVersion:1,intent:'complete',changedField:'item-'+items[2].id+'-observacao',['item-'+items[2].id+'-observacao']:'Correção após reabertura',justificativaCorrecao:'Revisão complementar'});
  corrected=await latest((await save(nutri,buffetAdapter,corrected.chave,f,corrected.versao)).id);assert.equal(corrected.estado,'REABERTO');assert((await review(corrected)).allowed);await signService(nutri,corrected);corrected=await latest(corrected.id);assert.notEqual(corrected.assinaturaVigenteId,previous);assert(await prisma.fluxoAssinatura.findUnique({where:{id:previous}}));assert.equal(JSON.stringify(corrected.versoes.filter(v=>v.versao<=original.versao+1)),oldVersions);assert.equal(await prisma.fluxoAssinaturaVinculo.count({where:{fluxoId:corrected.id}}),2);
 });
 await check('17–18. Execução própria e autoria inconclusiva não são mascaradas como correção',async()=>{
  let own=await fixture(nutri);own=await latest((await save(nutri,buffetAdapter,own.chave,correction(own),own.versao)).id);assert((await review(own)).reason.includes('lançamento original'));await assert.rejects(()=>signService(nutri,own),/lançamento original/);
  const legacy=await fixture();await prisma.fluxoEvento.create({data:{fluxoId:legacy.id,operacao:'VINCULO_LEGADO',estadoNovo:'COMPLETO',versaoNova:legacy.versao,usuarioId:operator.id,usuarioNome:operator.nomeCompleto,usuarioPerfil:operator.perfil}});assert((await review(legacy)).reason.includes('autoria original'));await assert.rejects(()=>signService(nutri,legacy),/autoria original/);
  const eligibility=require('../src/app/controle-buffet-amostras/authorship.ts').buffetAuthorshipEligibility;
  assert(eligibility({amostras:[{id:1,itemNome:'Registro histórico corrigido',responsavelUsuarioId:operator.id}],eventos:[{operacao:'CRIACAO',versaoNova:1,usuarioId:operator.id},{operacao:'SALVAMENTO',versaoNova:2,usuarioId:nutri.id}],versoes:[{versao:1,usuarioId:operator.id,rascunho:{},dados:{records:[{id:1,primeiraTc:5,responsavelUsuarioId:operator.id}]}},{versao:2,usuarioId:nutri.id,rascunho:{},dados:{records:[{id:1,primeiraTc:6,responsavelUsuarioId:operator.id}]}}]},nutri.id).allowed);
  assert(!eligibility({amostras:[{id:1,itemNome:'Origem não comprovada',responsavelUsuarioId:operator.id}],eventos:[{operacao:'SALVAMENTO',versaoNova:1,usuarioId:nutri.id}],versoes:[{versao:1,usuarioId:nutri.id,rascunho:{},dados:{records:[{id:1,primeiraTc:5,responsavelUsuarioId:operator.id}]}}]},nutri.id).allowed);
 });
 await check('Integridade: falha na auditoria reverte os itens; edição explícita de horário gera evidência',async()=>{
  const flow=await fixture(),before=await state(flow),audit=require('../src/app/controle-buffet-amostras/correction-audit.ts'),originalAudit=audit.auditBuffetCorrections;
  audit.auditBuffetCorrections=async()=>{throw Error('Falha sintética na gravação da auditoria');};try{await assert.rejects(()=>save(nutri,buffetAdapter,flow.chave,correction(flow),flow.versao),/Falha sintética/);}finally{audit.auditBuffetCorrections=originalAudit;}assert.equal(await state(flow),before);
  const key='item-'+items[0].id,f=form({rowKey:key,rowIntentVersion:1,intent:'complete',changedField:key+'-horarioExecucao',[key+'-horarioExecucao']:'09:30'});const edited=await latest((await save(nutri,buffetAdapter,flow.chave,f,flow.versao)).id);assert.equal(edited.amostras.find(r=>r.itemId===items[0].id).horarioExecucao,'09:30');assert.equal(JSON.stringify(edited.versoes.filter(v=>v.versao<=flow.versao)),JSON.stringify(flow.versoes));assert(edited.eventos.some(e=>e.operacao==='CORRECAO_REGISTRO'&&readBuffetCorrection(e.justificativa)?.itens.some(i=>i.campos.some(c=>c.campo==='horarioExecucao'&&c.antes==='08:15'&&c.depois==='09:30'))));
 });
 await check('19. Histórico, consulta e relatório separam execução, correção e assinatura',async()=>{
  user=nutri;const History=require('../src/app/controle-buffet-amostras/historico/legacy-page.tsx').default;
  const text=n=>Array.isArray(n)?n.map(text).join(' '):n&&typeof n==='object'?text(n.props?.children):typeof n==='string'?n:'';
  const tree=await History({searchParams:Promise.resolve({filtroData:retro,dia:retro,filtroServicoId:corrected.chave.split(':')[0]})});const html=text(tree);assert(html.includes('Corrigido por'));assert(html.includes(operator.nomeCompleto));assert(html.includes(nutri.nomeCompleto));
  const {NextRequest}=require('next/server');const report=await require('../src/app/relatorios/controle-buffet-amostras/mensal/route.ts').GET(new NextRequest('http://localhost/relatorios/controle-buffet-amostras/mensal?mes='+retro.slice(5,7)+'&ano='+retro.slice(0,4)));assert.equal(report.status,200);const result=await report.text();assert(result.includes(operator.nomeCompleto));assert(result.includes(nutri.nomeCompleto));fs.writeFileSync(path.join(dir,'report.html'),result);
 });
 const browser=await fixture(operator,true);fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify({database,day:retro,flowId:browser.id,serviceId:browser.chave.split(':')[0],itemIds:items.map(i=>i.id),username:nutri.nomeUsuario,operatorUsername:operator.nomeUsuario,password,operatorName:operator.nomeCompleto,otherName:other.nomeCompleto,nutriName:nutri.nomeCompleto}));
 assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,'.env'))).digest('hex'),envHash);fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify({outcomes,productionAccess:false,envUnchanged:true},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await prisma.$disconnect();await inspect.$disconnect();});
