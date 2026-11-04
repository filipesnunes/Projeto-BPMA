// Writes exclusively to a NEW localhost synthetic database cloned from the
// previously prepared test template. Never reads .env connection settings.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const {execFileSync}=require('node:child_process'),{randomUUID,createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.data/validation/buffet-collective-time');fs.mkdirSync(dir,{recursive:true});
const template=fs.readFileSync(path.join(root,'.data/validation/group-workflows/database.txt'),'utf8').trim();assert(/^workflow_\d+$/.test(template));
const database='buffetcollective_'+Date.now(),bin=path.join(root,'.data/validation/buffet-pending-postgres-20261102/runtime/pgsql/bin/createdb.exe');
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
const {buffetCollectiveTimeTargets}=require('../src/app/controle-buffet-amostras/collective-time.ts');
const {buffetRecordValues}=require('../src/app/controle-buffet-amostras/row-save.ts');
const {buffetSnapshot}=require('../src/app/controle-buffet-amostras/workflow-adapter.ts');
const {buffetServiceReview}=require('../src/app/controle-buffet-amostras/service-review.ts');
const {readBuffetCorrection}=require('../src/app/controle-buffet-amostras/correction-evidence.ts');
const outcomes=[];async function check(name,fn){await fn();outcomes.push(name);console.log('PASS '+name);}
(async()=>{
assert.equal((await prisma.$queryRaw`SELECT current_database() name`)[0].name,database);
const tag='COLLECTIVE-'+Date.now(),password='collective-test-password';
 async function account(suffix,role,codes){let profile;if(codes){profile=await prisma.perfilAcesso.create({data:{codigo:tag+'-'+suffix,nome:tag+' '+suffix}});for(const code of codes){const def=permissions.PERMISSION_DEFINITIONS.find(p=>p.codigo===code);assert(def,code);const entry=await prisma.permissao.upsert({where:{codigo:code},create:def,update:{}});await prisma.perfilPermissao.create({data:{perfilId:profile.id,permissaoId:entry.id}});}}
 const a=await prisma.usuario.create({data:{nomeCompleto:tag+' '+suffix,nomeUsuario:(tag+'-'+suffix).toLowerCase(),senhaHash:hashPassword(password),perfil:role,perfilAcessoId:profile?.id}}),session=await prisma.usuarioSessao.create({data:{usuarioId:a.id,tokenHash:randomUUID(),expiraEm:new Date('2035-01-01')}});return{...a,sessaoId:session.id,permissoes:codes??permissions.getDefaultPermissionCodes(role)};}
 const all=permissions.PERMISSION_DEFINITIONS.filter(p=>p.codigo.startsWith('modulo.amostras.')||['usuarios.responsavel_tecnico','modulo.relatorios.acessar'].includes(p.codigo)).map(p=>p.codigo);
 const operator=await account('operator','COLABORADOR',all),other=await account('other','COLABORADOR',all),nutri=await account('nutri','NUTRICIONISTA',all);
 await prisma.controleBuffetAmostraAcaoCorretiva.upsert({where:{nome:'Não se aplica'},create:{nome:'Não se aplica'},update:{ativo:true}});
 const items=[];for(let i=0;i<32;i++)items.push(await prisma.controleBuffetAmostraItem.create({data:{nome:tag+' Item '+String(i+1).padStart(2,'0'),classificacao:'FRIO'}}));
 const retro=dates.formatAppDateInput(new Date(+today-86400000));
 async function fixture(){
  const service=await prisma.controleBuffetAmostraServico.create({data:{nome:tag+' Serviço '+randomUUID()}});await prisma.controleBuffetAmostraItemServico.createMany({data:items.map(i=>({servicoId:service.id,itemId:i.id}))});
  const full=selected=>{const f=form({rowKey:selected.map(i=>'item-'+i.id)});for(const i of selected)for(const[k,v]of Object.entries({temperaturaTipo:'NUMERICA',tcEquipamento:'5',primeiraTc:'5',acaoCorretiva:'Não se aplica',horarioExecucao:'07:15',horarioNaoInformado:'false',justificativaHorario:'',naoServido:'false',observacao:''}))f.set('item-'+i.id+'-'+k,v);return f;};
  let unit=await save(operator,buffetAdapter,service.id+':'+retro,full(items.slice(0,16)));
  unit=await save(other,buffetAdapter,unit.chave,full(items.slice(16)),unit.versao);
  unit=await save(operator,buffetAdapter,unit.chave,form({operation:'extra',itemNome:tag+' Extra',classificacao:'FRIO'}),unit.versao);unit=await latest(unit.id);
  const extra=unit.amostras.find(r=>r.itemExtra),extraInput=form({rowKey:'extra-'+extra.id});for(const[k,v]of Object.entries({temperaturaTipo:'NUMERICA',tcEquipamento:'5',primeiraTc:'5',acaoCorretiva:'Não se aplica',horarioExecucao:'07:15'}))extraInput.set('extra-'+extra.id+'-'+k,v);
  unit=await save(operator,buffetAdapter,unit.chave,extraInput,unit.versao);unit=await latest(unit.id);
  // Historical missing-time fixtures ONLY in this new, explicitly local database.
  await inspect.$transaction(async tx=>{
   await tx.$executeRaw`SELECT set_config('bpma.workflow_flow',${unit.id},true)`;
   for(const r of unit.amostras){const index=items.findIndex(i=>i.id===r.itemId);let patch;
    if(index>=0&&index<19||r.itemExtra)patch={horarioExecucao:null,status:'PENDENTE'};
    else if(index===29)patch={horarioExecucao:null,horarioNaoInformado:true,justificativaHorario:'Procedimento realizado, sem anotação do horário.'};
    else if(index===30)patch={status:'NAO_SERVIDO',tcEquipamento:null,primeiraTc:null,statusTemperatura:null,acaoCorretiva:null,horarioExecucao:null};
    else if(index===31)patch={status:'PENDENTE',primeiraTc:null,statusTemperatura:null};
    if(patch)await tx.controleBuffetAmostraRegistro.update({where:{id:r.id},data:patch});
   }
   const records=(await tx.fluxoOperacional.findUniqueOrThrow({where:{id:unit.id},include:{amostras:{where:{excluidoEm:null},orderBy:{id:'asc'}}}})).amostras;
   const draft={manifest:items.map(({id,nome,classificacao,usaGarrafaTermica})=>({id,nome,classificacao,usaGarrafaTermica})),rows:Object.fromEntries(records.map(r=>[r.itemExtra?'extra-'+r.id:'item-'+r.itemId,buffetRecordValues(r)]))};
   await tx.fluxoOperacional.update({where:{id:unit.id},data:{versao:{increment:1},estado:'PENDENTE',preenchimentoCompleto:false}});
   await tx.fluxoVersao.create({data:{fluxoId:unit.id,versao:unit.versao+1,dados:buffetSnapshot(records,draft.manifest),rascunho:draft,completo:false,resolvidos:12,obrigatorios:33,usuarioId:operator.id,usuarioNome:operator.nomeCompleto,usuarioPerfil:operator.perfil}});
   await tx.fluxoEvento.create({data:{fluxoId:unit.id,operacao:'SALVAMENTO',estadoAnterior:unit.estado,estadoNovo:'PENDENTE',versaoAnterior:unit.versao,versaoNova:unit.versao+1,usuarioId:operator.id,usuarioNome:operator.nomeCompleto,usuarioPerfil:operator.perfil}});
  });return latest(unit.id);
 }
 const initial=await fixture(),key=r=>r.itemExtra?'extra-'+r.id:'item-'+r.itemId;
 const rows=initial.amostras.map(r=>({rowKey:key(r),nome:r.itemNome,bloqueado:false,status:r.status})),values=Object.fromEntries(initial.amostras.map(r=>[key(r),buffetRecordValues(r)]));
 const read=row=>values[row.rowKey];
 await check('1–3,6–11. 33 itens, 20 sem horário incluindo extra; proteção de existentes, desconhecidos, NS, bloqueados, assinados e vazios',async()=>{
  const targets=buffetCollectiveTimeTargets(rows,read,'06:30','empty');assert.equal(targets.length,20);assert(targets.some(t=>t.rowKey.startsWith('extra-')));
  assert(!targets.some(t=>t.rowKey==='item-'+items[29].id));assert(!targets.some(t=>t.rowKey==='item-'+items[30].id));assert(!targets.some(t=>t.rowKey==='item-'+items[31].id));
  assert.equal(buffetCollectiveTimeTargets(rows.map((r,i)=>({...r,bloqueado:i===0})),read,'06:30','empty').length,19);
  assert.equal(buffetCollectiveTimeTargets(rows.map((r,i)=>({...r,status:i===0?'ASSINADO':r.status})),read,'06:30','empty').length,19);
  for(const time of ['', '6:30','24:00','06:60','invalid'])assert.throws(()=>buffetCollectiveTimeTargets(rows,read,time,'empty'),/HH:mm/);
  assert.equal(buffetCollectiveTimeTargets([{rowKey:'blank',nome:'Extra vazio',bloqueado:false,status:'PENDENTE'}],()=>({temperaturaTipo:'NUMERICA',primeiraTc:'',tcEquipamento:''}),'06:30','replace').length,0);
 });
 const targets=buffetCollectiveTimeTargets(rows,read,'06:30','empty');
 const input=form({rowKey:rows.map(r=>r.rowKey),rowIntentVersion:1,intent:'complete'});
 for(const row of rows)for(const[k,v]of Object.entries(read(row)))input.set(row.rowKey+'-'+k,v);
 for(const t of targets){input.set(t.rowKey+'-horarioExecucao','06:30');input.append('changedField',t.rowKey+'-horarioExecucao');}
 input.set('item-'+items[0].id+'-horarioExecucao','07:00');
 await check('12–18. Validação sem gravação parcial; um salvamento, override individual, campos não alterados e versionamento',async()=>{
  const before=JSON.stringify(await latest(initial.id));await assert.rejects(()=>save(operator,buffetAdapter,initial.chave,input,initial.versao),/TC do Alimento/);assert.equal(JSON.stringify(await latest(initial.id)),before);
  input.set('item-'+items[31].id+'-primeiraTc','5');input.append('changedField','item-'+items[31].id+'-primeiraTc');
  const unit=await latest((await save(operator,buffetAdapter,initial.chave,input,initial.versao)).id);assert.equal(unit.versao,initial.versao+1);assert.equal(unit.estado,'COMPLETO');
  for(const old of initial.amostras){const r=unit.amostras.find(r=>r.id===old.id);for(const field of ['responsavelUsuarioId','responsavelNome','responsavelPerfil','dataHoraRegistro','data','tcEquipamento','acaoCorretiva','observacao'])assert.deepEqual(r[field],old[field]);if(!targets.some(t=>t.rowKey===key(old)))assert.equal(r.horarioExecucao,old.horarioExecucao);}
  assert.equal(unit.amostras.find(r=>r.itemId===items[0].id).horarioExecucao,'07:00');assert.equal(unit.amostras.find(r=>r.itemId===items[29].id).horarioNaoInformado,true);assert.equal(unit.amostras.find(r=>r.itemId===items[29].id).justificativaHorario,initial.amostras.find(r=>r.itemId===items[29].id).justificativaHorario);
  assert.equal(JSON.stringify(unit.versoes.filter(v=>v.versao<=initial.versao)),JSON.stringify(initial.versoes));
 });
 let unit=await latest(initial.id);
 await check('4,9,15,19. Substituição editável auditada, múltiplos executores, reabertura e assinatura',async()=>{
  assert((await buffetServiceReview(prisma,nutri,unit.id,false)).allowed);await sign(nutri,[unit],groupSignatureBridge('amostras','SERVICO',password));unit=await latest(unit.id);const previous=unit.assinaturaVigenteId;
  await assert.rejects(()=>save(operator,buffetAdapter,unit.chave,input,unit.versao),/fechado/);
  unit=await latest((await core.reopenWorkflow({actor:actor(nutri),module:'amostras',id:unit.id,expectedVersion:unit.versao,reason:'Conferência autorizada dos horários reais',fromEdit:false})).id);
  const nowRows=unit.amostras.map(r=>({rowKey:key(r),nome:r.itemNome,bloqueado:false,status:r.status})),nowValues=Object.fromEntries(unit.amostras.map(r=>[key(r),buffetRecordValues(r)]));
  const replacements=buffetCollectiveTimeTargets(nowRows,r=>nowValues[r.rowKey],'06:45','replace');assert.equal(replacements.length,32);
  const f=form({rowKey:replacements.map(r=>r.rowKey),rowIntentVersion:1,intent:'complete',justificativaCorrecao:'Horário real confirmado explicitamente'});for(const t of replacements)for(const[k,v]of Object.entries({horarioExecucao:'06:45',horarioNaoInformado:'false',justificativaHorario:''})){f.set(t.rowKey+'-'+k,v);if(String(nowValues[t.rowKey][k]??'')!==v)f.append('changedField',t.rowKey+'-'+k);}
  const before=unit;unit=await latest((await save(nutri,buffetAdapter,unit.chave,f,unit.versao)).id);assert.equal(unit.estado,'REABERTO');assert.equal(unit.assinaturaVigenteId,null);
  assert(unit.eventos.some(e=>e.operacao==='CORRECAO_REGISTRO'&&readBuffetCorrection(e.justificativa)?.itens.some(i=>i.campos.some(c=>c.campo==='horarioExecucao'&&c.antes==='07:00'&&c.depois==='06:45'))));
  for(const r of unit.amostras){const old=before.amostras.find(o=>o.id===r.id);for(const field of ['responsavelUsuarioId','responsavelNome','dataHoraRegistro','tcEquipamento','primeiraTc','acaoCorretiva','observacao','data'])assert.deepEqual(r[field],old[field]);}
  await sign(nutri,[unit],groupSignatureBridge('amostras','SERVICO',password));assert(await prisma.fluxoAssinatura.findUnique({where:{id:previous}}));assert.equal(await prisma.fluxoAssinaturaVinculo.count({where:{fluxoId:unit.id}}),2);
 });
 await check('20. Dia atual mantém captura automática sem horário manual',async()=>{
  const procedure=require('../src/lib/procedure-time.ts');const result=procedure.readExecutionTime(new FormData(),today);assert.equal(result.horarioExecucao,procedure.operationalTime(dates.getAppNow()));
 });
 const browser=await fixture(),todayService=await prisma.controleBuffetAmostraServico.create({data:{nome:tag+' Hoje'}});await prisma.controleBuffetAmostraItemServico.create({data:{servicoId:todayService.id,itemId:items[0].id}});
 fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify({database,day:retro,today:day,flowId:browser.id,serviceId:browser.chave.split(':')[0],todayServiceId:todayService.id,itemIds:items.map(i=>i.id),extraId:browser.amostras.find(r=>r.itemExtra).id,username:operator.nomeUsuario,nutriUsername:nutri.nomeUsuario,password,operatorName:operator.nomeCompleto,otherName:other.nomeCompleto,nutriName:nutri.nomeCompleto}));
 assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,'.env'))).digest('hex'),envHash);fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify({outcomes,productionAccess:false,envUnchanged:true},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await prisma.$disconnect();await inspect.$disconnect();});
