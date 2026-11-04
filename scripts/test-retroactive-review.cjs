// Writes exclusively to a NEW localhost synthetic database cloned from the
// previously prepared test template. Never reads .env connection settings.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const {execFileSync}=require('node:child_process'),{randomUUID,createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.data/validation/retroactive-review');fs.mkdirSync(dir,{recursive:true});
const template=fs.readFileSync(path.join(root,'.data/validation/group-workflows/database.txt'),'utf8').trim();assert(/^workflow_\d+$/.test(template));
const database='retroreview_'+Date.now(),bin=path.join(root,'.data/validation/buffet-pending-postgres-20261102/runtime/pgsql/bin/createdb.exe');
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
 const password='synthetic-retro-password',tag='RETRO-'+Date.now();
 async function account(suffix,role,codes){
  const profile=await prisma.perfilAcesso.create({data:{codigo:tag+'-'+suffix,nome:tag+' '+suffix}});
  for(const code of codes){const definition=permissions.PERMISSION_DEFINITIONS.find(p=>p.codigo===code);assert(definition,code);const p=await prisma.permissao.upsert({where:{codigo:code},create:definition,update:{}});await prisma.perfilPermissao.create({data:{perfilId:profile.id,permissaoId:p.id}});}
  const u=await prisma.usuario.create({data:{nomeCompleto:tag+' '+suffix,nomeUsuario:(tag+'-'+suffix).toLowerCase(),senhaHash:hashPassword(password),perfil:role,perfilAcessoId:profile.id}});
  const session=await prisma.usuarioSessao.create({data:{usuarioId:u.id,tokenHash:randomUUID(),expiraEm:new Date('2035-01-01')}});
  return {...u,sessaoId:session.id,permissoes:codes};
 }
 const all=permissions.PERMISSION_DEFINITIONS.filter(p=>/^modulo\.(amostras|oleo|temperatura|rastreabilidade|hortifruti|limpeza_diaria|limpeza_semanal)\./.test(p.codigo)||['usuarios.responsavel_tecnico','modulo.relatorios.acessar','usuarios.acessar','usuarios.editar_permissoes'].includes(p.codigo)).map(p=>p.codigo);
 const nutri=await account('nutri','NUTRICIONISTA',all),manager=await account('manager','GERENTE',all),operator=await account('operator','COLABORADOR',all.filter(c=>!c.endsWith('assinar_retroativo'))),denied=await account('denied','NUTRICIONISTA',all.filter(c=>!c.endsWith('assinar_retroativo')));
 const reference=new Date('2026-10-26'),dateText='2026-10-26';
 const review=(who,scope)=>retro.retroactiveReviewScope(prisma,who,scope);
 const signRetro=async(who,scope,extra={})=>retro.signRetroactiveReview({authenticated:who,scope,token:(await review(who,scope)).token,password,justification:'Revisão documental sintética com preservação da autoria',confirmed:true,...extra});
 await check('Sete permissões sensíveis, sem concessão padrão a gerente/nutricionista; catálogo sem vínculos',async()=>{
  const definitions=permissions.PERMISSION_DEFINITIONS.filter(p=>p.acao==='assinar_retroativo');assert.equal(definitions.length,7);assert(definitions.every(p=>p.sensivel));
  for(const role of ['NUTRICIONISTA','GERENTE','COLABORADOR'])assert(!permissions.getDefaultPermissionCodes(role).some(c=>c.endsWith('.assinar_retroativo')));
  const before=await prisma.perfilPermissao.count();await prisma.$transaction(require('../src/lib/register-retroactive-review-permissions.ts').registerRetroactiveReviewPermissions);assert.equal(await prisma.perfilPermissao.count(),before);
 });
 const cleaning=async(date=reference,who=operator)=>prisma.planoLimpezaDiarioRegistro.create({data:{data:date,turno:'MANHA',area:tag+' Área '+randomUUID(),assinaturaResponsavel:who.nomeCompleto,assinaturaResponsavelUsuarioId:who.id,assinaturaResponsavelPerfil:who.perfil,assinaturaResponsavelDataHora:dates.getAppNow(),status:'AGUARDANDO_SUPERVISOR'}});
 const record=await cleaning(),scope={module:'limpeza_diaria',date:reference,recordIds:[record.id]};
 await check('Autorização no backend, senha, justificativa, confirmação e versão; nenhuma escrita em rejeições',async()=>{
  const before=await fingerprint();
  for(const who of [denied,operator])await assert.rejects(()=>signRetro(who,scope),/permissão/);
  for(const patch of [{password:'wrong'},{justification:''},{confirmed:false},{token:'stale'}])await assert.rejects(()=>signRetro(nutri,scope,patch));
  user=denied;const result=await retroAction.signRetroactiveAction({},form({modulo:scope.module,data:dateText,registros:record.id,escopo:(await review(nutri,scope)).token,senha:password,justificativa:'Revisão',confirmacao:'sim'}));assert.equal(result.status,'error');assert.match(result.message,/permissão/);
  assert.equal(await fingerprint(),before);
 });
 await check('Permissão revogada e independência por módulo',async()=>{
  const p=await prisma.permissao.findUniqueOrThrow({where:{codigo:'modulo.limpeza_diaria.assinar_retroativo'}});
  await prisma.perfilPermissao.update({where:{perfilId_permissaoId:{perfilId:nutri.perfilAcessoId,permissaoId:p.id}},data:{permitido:false}});
  await assert.rejects(()=>signRetro(nutri,scope),/permissão/);
  await prisma.perfilPermissao.update({where:{perfilId_permissaoId:{perfilId:nutri.perfilAcessoId,permissaoId:p.id}},data:{permitido:true}});
  const only=await account('only-oil','GERENTE',['modulo.oleo.acessar','modulo.oleo.assinar_retroativo','modulo.limpeza_diaria.acessar']);await assert.rejects(()=>signRetro(only,scope),/permissão/);
 });
 await check('Limpeza retroativa individual gerencial preserva executor, data e natureza não técnica',async()=>{
  await signRetro(manager,scope);const after=await inspect.planoLimpezaDiarioRegistro.findUniqueOrThrow({where:{id:record.id}});
  assert.equal(after.assinaturaResponsavelUsuarioId,record.assinaturaResponsavelUsuarioId);assert.equal(+after.data,+record.data);assert.equal(after.status,'CONCLUIDO');assert.equal(after.assinaturaSupervisorUsuarioId,manager.id);
  const evidence=JSON.parse(after.observacaoSupervisor);assert.equal(evidence.natureza,'Revisão gerencial retroativa');assert.equal(evidence.operacao,'REVISAO_RETROATIVA');await assert.rejects(()=>signRetro(manager,scope),/supervisionada/);
 });
 let unknown=await cleaning(new Date('2026-10-30')),own=await cleaning(new Date('2026-10-30'),nutri);
 await prisma.planoLimpezaDiarioRegistro.update({where:{id:unknown.id},data:{assinaturaResponsavelUsuarioId:null}});
 const batch={module:'limpeza_diaria',date:new Date('2026-10-30'),recordIds:[unknown.id,own.id]};
 await check('Limpeza em lote: autoria inconclusiva e participação própria viram ressalvas; sem assumir executor',async()=>{
  const preview=await review(nutri,batch);assert(preview.allowed);assert(preview.warnings.some(w=>w.includes('sem identificação')));assert(preview.warnings.some(w=>w.includes('participou')));
  const originals=await inspect.planoLimpezaDiarioRegistro.findMany({where:{id:{in:batch.recordIds}},orderBy:{id:'asc'}});
  await signRetro(nutri,batch);const after=await inspect.planoLimpezaDiarioRegistro.findMany({where:{id:{in:batch.recordIds}},orderBy:{id:'asc'}});
  after.forEach((r,i)=>{assert.equal(r.assinaturaResponsavelUsuarioId,originals[i].assinaturaResponsavelUsuarioId);assert.equal(r.assinaturaResponsavel,originals[i].assinaturaResponsavel);assert.equal(r.assinaturaSupervisorUsuarioId,nutri.id);});
 });
 await check('Atividade sem assinatura de execução não é inventada; falha intermediária faz rollback',async()=>{
  const missing=await cleaning();await prisma.planoLimpezaDiarioRegistro.update({where:{id:missing.id},data:{assinaturaResponsavel:''}});await assert.rejects(()=>signRetro(nutri,{...scope,recordIds:[missing.id]}),/execução/);
  const a=await cleaning(),b=await cleaning();const before=JSON.stringify(await inspect.planoLimpezaDiarioRegistro.findMany({where:{id:{in:[a.id,b.id]}},orderBy:{id:'asc'}}));
  await inspect.$executeRawUnsafe(`CREATE FUNCTION test_retro_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Falha sintetica de auditoria'; END $$`);
  await inspect.$executeRawUnsafe(`CREATE TRIGGER test_retro_audit_failure BEFORE INSERT ON log_assinatura FOR EACH ROW EXECUTE FUNCTION test_retro_audit_failure()`);
  try { await assert.rejects(()=>signRetro(nutri,{...scope,recordIds:[a.id,b.id]}),/Falha sintetica/); }
  finally { await inspect.$executeRawUnsafe('DROP TRIGGER test_retro_audit_failure ON log_assinatura'); await inspect.$executeRawUnsafe('DROP FUNCTION test_retro_audit_failure()'); }
  assert.equal(JSON.stringify(await inspect.planoLimpezaDiarioRegistro.findMany({where:{id:{in:[a.id,b.id]}},orderBy:{id:'asc'}})),before);
 });
 await check('Reabertura por permissão: senha, justificativa, fechamento preservado e sem assinatura automática',async()=>{
  for(const [module,who]of [['oleo',nutri],['amostras',manager]]){
   const closure=await prisma.fechamentoMensalModulo.create({data:{moduloCodigo:module,mes:10,ano:2026,usuarioId:nutri.id,usuarioNomeSnapshot:nutri.nomeCompleto,usuarioPerfilSnapshot:nutri.perfil,assinadoEm:dates.getAppNow()}});
   const p={user:who,moduleCode:module,mes:10,ano:2026,password,reason:'Reabrir para revisão sintética'};
   await assert.rejects(()=>reopening.reopenOperationalMonth({...p,password:'wrong'}),/Senha/);await assert.rejects(()=>reopening.reopenOperationalMonth({...p,reason:''}),/justificativa/);
   const count=await prisma.fluxoAssinatura.count();await reopening.reopenOperationalMonth(p);assert.equal(await prisma.fluxoAssinatura.count(),count);
   const after=await prisma.fechamentoMensalModulo.findUniqueOrThrow({where:{id:closure.id}});assert.equal(after.status,'REABERTO');assert.equal(+after.assinadoEm,+closure.assinadoEm);assert.equal(after.usuarioId,closure.usuarioId);
   await assert.rejects(()=>reopening.reopenOperationalMonth(p),/já está reaberto/);
  }
 });
 await prisma.controleBuffetAmostraAcaoCorretiva.upsert({where:{nome:'Não se aplica'},create:{nome:'Não se aplica'},update:{ativo:true}});
 const items=[];for(let i=0;i<33;i++)items.push(await prisma.controleBuffetAmostraItem.create({data:{nome:i===25?'Banana cozida':tag+' Item '+i,classificacao:'QUENTE'}}));
 async function buffet(date){const service=await prisma.controleBuffetAmostraServico.create({data:{nome:tag+' Café '+date+' '+randomUUID()}});await prisma.controleBuffetAmostraItemServico.createMany({data:items.map(i=>({servicoId:service.id,itemId:i.id}))});
  const values={rowKey:items.map(i=>'item-'+i.id)};items.forEach((item,index)=>{for(const[k,v]of Object.entries({temperaturaTipo:'NUMERICA',primeiraTc:'65',tcEquipamento:'65',horarioExecucao:'08:00',naoServido:index>=25?'true':'false'}))values['item-'+item.id+'-'+k]=v;});
  const unit=await save(operator,buffetAdapter,service.id+':'+date,form(values));
  await prisma.fluxoEvento.create({data:{fluxoId:unit.id,operacao:'VINCULO_LEGADO',versaoNova:unit.versao,estadoNovo:unit.estado,usuarioId:operator.id,usuarioNome:operator.nomeCompleto,usuarioPerfil:operator.perfil,justificativa:'Cenário histórico sintético'}});
  return latest(unit.id);
 }
 await check('Buffet 26/27/28/29/31: 33 itens, 8 Não servido, legado, assinatura com ressalvas e aferições intactas',async()=>{
  for(const day of ['26','27','28','29','31']){const unit=await buffet('2026-10-'+day),sc={module:'amostras',date:unit.dataReferencia,flowId:unit.id};assert.equal(unit.amostras.length,33);assert.equal(unit.amostras.filter(r=>r.status==='NAO_SERVIDO').length,8);
   const before=JSON.stringify(unit.amostras),versions=JSON.stringify(unit.versoes),who=day==='27'?manager:nutri;
   assert((await review(who,sc)).allowed);await signRetro(who,sc);const after=await latest(unit.id);assert(after.assinaturaVigenteId);assert.equal(JSON.stringify(after.amostras),before);assert.equal(JSON.stringify(after.versoes),versions);await assert.rejects(()=>signRetro(who,sc));
  }
 });
 const weeklyItem=await prisma.planoLimpezaSemanalItem.create({data:{area:tag,oQueLimpar:'Bancada',quem:'Executor sintético',qualProduto:'Produto sintético'}});
 const weekly=await prisma.planoLimpezaSemanalExecucao.create({data:{dataExecucao:reference,area:tag,itemId:weeklyItem.id,assinaturaResponsavel:'Executor histórico',assinaturaSupervisor:'',status:'AGUARDANDO_SUPERVISOR'}});
 await check('Limpeza semanal com autoria limitada; Hortifruti com revisão gerencial sem rótulo técnico',async()=>{
  await signRetro(manager,{module:'limpeza_semanal',date:reference,recordIds:[weekly.id]});
  await prisma.higienizacaoHortifruti.create({data:{data:reference,hortifruti:'Alface sintética',produtoUtilizado:'Produto sintético',inicioProcesso:'08:00',terminoProcesso:'08:02',duracaoMinutos:2,responsavel:operator.nomeCompleto}});
  await signRetro(manager,{module:'hortifruti',date:reference});const signature=await prisma.assinaturaDiariaModulo.findUniqueOrThrow({where:{moduloCodigo_dataReferencia:{moduloCodigo:'hortifruti',dataReferencia:reference}}});assert.equal(signature.responsavelTecnico,false);
 });
 await check('Limpeza normal AGUARDANDO_SUPERVISOR assina sem depender de supervisão prévia; erro visível',async()=>{
  const d=new Date('2026-10-31');await cleaning(d);user=nutri;const sc=await legacyReviewScope(prisma,'limpeza_diaria',d),f={moduloCodigo:'limpeza_diaria',dataReferencia:'2026-10-31',escopo:sc.token,senhaConfirmacao:password};
  assert.equal((await shared.signModuleDayState({},form({...f,senhaConfirmacao:'wrong'}))).status,'error');assert.equal((await shared.signModuleDayState({},form(f))).status,'success');
  assert((await prisma.planoLimpezaDiarioRegistro.findMany({where:{data:d}})).every(r=>r.status==='CONCLUIDO'));
 });
 await check('Óleo: autoria inconclusiva, revogação anterior preservada, registro de controle intacto',async()=>{
  const make=()=>save(operator,oilAdapter,dateText+':'+randomUUID(),form({temperatura:'150',fitaOleo:'__SEM_AFERICAO__',horarioExecucao:'08:00'}));
  const a=await make(),control=await make();await sign(nutri,[control],oilSignatureBridge(password,false));
  const recordBefore=await inspect.controleQualidadeOleoRegistro.findUniqueOrThrow({where:{fluxoId:a.id}}),controlBefore=await latest(control.id);
  const old=await prisma.fluxoAssinatura.create({data:{modulo:'oleo',mecanismo:'SUPERVISAO_HISTORICA_INVALIDADA',referencia:'evidência sintética',usuarioId:operator.id,usuarioNome:operator.nomeCompleto,usuarioPerfil:operator.perfil,assinadoEm:new Date('2026-10-27')}});
  await prisma.fluxoAssinaturaVinculo.create({data:{assinaturaId:old.id,fluxoId:a.id,versao:a.versao}});
  await prisma.fluxoEvento.create({data:{fluxoId:a.id,operacao:'VINCULO_LEGADO',versaoNova:a.versao,estadoNovo:a.estado,usuarioId:operator.id,usuarioNome:operator.nomeCompleto,usuarioPerfil:operator.perfil}});
  await prisma.fluxoEvento.create({data:{fluxoId:a.id,operacao:'REVOGACAO_ASSINATURA',versaoNova:a.versao,estadoNovo:a.estado,assinaturaId:old.id,usuarioId:manager.id,usuarioNome:manager.nomeCompleto,usuarioPerfil:manager.perfil,justificativa:'Revogação sintética anterior'}});
  const sc={module:'oleo',date:reference,flowId:a.id};const preview=await review(manager,sc);assert(preview.warnings.some(w=>w.includes('inconclusiva')));await signRetro(manager,sc);
  assert.deepEqual(await inspect.controleQualidadeOleoRegistro.findUniqueOrThrow({where:{id:recordBefore.id}}),recordBefore);assert.deepEqual(await latest(control.id),controlBefore);assert(await prisma.fluxoAssinatura.findUnique({where:{id:old.id}}));assert.notEqual((await latest(a.id)).assinaturaVigenteId,old.id);
 });
 await check('Legados Óleo/Temperatura: adoção explícita preserva cópia integral e não inventa autoria antiga',async()=>{
  const oil=await prisma.controleQualidadeOleoRegistro.create({data:{data:reference,temperatura:150,fitaOleo:'10',orientacao:'Orientação sintética',responsavel:'Executor histórico',observacao:'Sem autoria completa',horarioExecucao:'08:30'}});
  const temp=await prisma.controleTemperaturaEquipamento.create({data:{data:reference,equipamento:tag+' legado',categoriaEquipamento:'REFRIGERACAO',turno:'MANHA',temperaturaAferida:2,status:'CONFORME',responsavel:'Executor histórico',horarioAfericao:'08:30'}});
  for(const [module,record]of [['oleo',oil],['temperatura',temp]]){
   const sc={module,date:reference,legacyRecordId:record.id};assert((await review(manager,sc)).allowed);
   await signRetro(manager,sc);const after=module==='oleo'?await inspect.controleQualidadeOleoRegistro.findUniqueOrThrow({where:{id:record.id}}):await inspect.controleTemperaturaEquipamento.findUniqueOrThrow({where:{id:record.id}});
   const {fluxoId,updatedAt,...content}=after;const {fluxoId:oldFlow,updatedAt:oldStamp,...oldContent}=record;assert.deepEqual(content,oldContent);
   const v=await prisma.fluxoVersao.findUniqueOrThrow({where:{fluxoId_versao:{fluxoId,versao:1}}});assert.deepEqual(JSON.parse(v.rascunho.registroLegadoOriginal),JSON.parse(JSON.stringify(record)));
   assert((await latest(fluxoId)).assinaturaVigenteId);await assert.rejects(()=>signRetro(manager,sc),/mudou/);
  }
 });
 await check('Fechamento do Óleo com pendências exige confirmação e justificativa; reabertura não concede fechamento',async()=>{
  const date=new Date('2026-09-20');await prisma.controleQualidadeOleoRegistro.create({data:{data:date,temperatura:150,orientacao:'Sintético',responsavel:'Executor sintético'}});
  const monthly=require('../src/lib/monthly-periods.ts'),p={user:nutri,moduleCode:'oleo',mes:9,ano:2026,password};
  await assert.rejects(()=>monthly.closeOperationalMonth(p),/pendente/);await assert.rejects(()=>monthly.closeOperationalMonth({...p,confirmPending:true}),/justificativa/);
  await monthly.closeOperationalMonth({...p,confirmPending:true,observacao:'Exceção sintética confirmada'});
  const logs=await prisma.logAssinatura.findMany({where:{modulo:'oleo',referenciaId:'09/2026'}});assert(logs.some(l=>JSON.parse(l.observacao).excecaoAssinaturasPendentes?.datas.includes('2026-09-20')));
  const only=await account('reopen-only','GERENTE',['modulo.limpeza_semanal.acessar','modulo.limpeza_semanal.reabrir_mes']);
  assert.equal(require('../src/lib/monthly-period-permissions.ts').canCloseMonthlyPeriod(only,'limpeza_semanal'),false);
  await assert.rejects(()=>reopening.reopenOperationalMonth({user:denied,moduleCode:'oleo',mes:9,ano:2026,password,reason:'Teste'}),/já está reaberto/);
 });
 await check('Rastreabilidade: revisão gerencial exata da nota, sem alteração de itens',async()=>{
  await prisma.rastreabilidadeRecebimentoCategoria.upsert({where:{nome:'Demais produtos'},create:{nome:'Demais produtos',temperaturaMaxima:10},update:{ativo:true}});
  const n=String(Date.now()),xml=`<NFe><infNFe Id="NFe${n.padStart(44,'1')}"><ide><nNF>${n}</nNF><serie>1</serie></ide><emit><xNome>Fornecedor sintético</xNome><CNPJ>12345678000199</CNPJ></emit><det><prod><cProd>ABC</cProd><xProd>Produto sintético</xProd><NCM>12345678</NCM><CFOP>5102</CFOP><qCom>12</qCom><uCom>KG</uCom></prod></det></infNFe></NFe>`;
  let u=await save(manager,receivingAdapter,dateText+':'+randomUUID(),{operation:'xml',form:form({xmlFile:new File([xml],'nota.xml',{type:'text/xml'})})});u=await latest(u.id);const i=u.recebimento.itens[0],values={intent:'finalize',horarioExecucao:'08:30'};
  for(const[k,v]of Object.entries({lote:'LOTE SINTÉTICO',semDataFabricacao:'true',validadeNaoAplicavel:'true',sif:'NA',temperaturaTipo:'AMBIENTE',transporteEntregador:'CONFORME',aspectoSensorial:'CONFORME',embalagem:'CONFORME'}))values['item-'+i.id+'-'+k]=v;
  u=await latest((await save(operator,receivingAdapter,u.chave,form(values),u.versao)).id);const before=JSON.stringify(u.recebimento);await signRetro(manager,{module:'rastreabilidade',date:reference,flowId:u.id});assert.equal(JSON.stringify((await latest(u.id)).recebimento),before);
 });
 await check('Gestão de Usuários concede e revoga com auditoria; reabertura concorrente não assina registros',async()=>{
  user=manager;const target=await account('grant-target','GERENTE',['modulo.oleo.acessar']);const actions=require('../src/app/usuarios/actions.ts');
  const granted=['modulo.oleo.acessar','modulo.oleo.assinar_retroativo'];const url=await redirect(()=>actions.updateProfilePermissionsAction(form({profileId:target.perfilAcessoId,permissionCodes:granted})));assert.equal(url.searchParams.get('feedbackType'),'success');
  const entries=await prisma.perfilPermissaoAuditoria.findMany({where:{perfilId:target.perfilAcessoId}});assert.equal(entries.length,1);assert(entries[0].permissoesDepois.includes('modulo.oleo.assinar_retroativo'));
  await redirect(()=>actions.updateProfilePermissionsAction(form({profileId:target.perfilAcessoId,permissionCodes:['modulo.oleo.acessar']})));assert.equal(await prisma.perfilPermissaoAuditoria.count({where:{perfilId:target.perfilAcessoId}}),2);
  await prisma.fechamentoMensalModulo.create({data:{moduloCodigo:'limpeza_semanal',mes:10,ano:2026,usuarioNomeSnapshot:'Fechamento sintético',assinadoEm:dates.getAppNow()}});
  const p={user:nutri,moduleCode:'limpeza_semanal',mes:10,ano:2026,password,reason:'Reabertura sintética concorrente'};
  const result=await Promise.allSettled([reopening.reopenOperationalMonth(p),reopening.reopenOperationalMonth(p)]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
 });

 await check('Conferência final: DEV exige concessão explícita de reabertura; permissões no editor',async()=>{
  const security=require('../src/lib/monthly-period-permissions.ts');
  assert.equal(security.canReopenMonthlyPeriod({perfil:'DEV',perfilAcessoId:999,permissoes:[]},'oleo'),false);assert.equal(security.canReopenMonthlyPeriod({perfil:'DEV',permissoes:['modulo.oleo.reabrir_mes']},'oleo'),false);
  assert.equal(security.canReopenMonthlyPeriod({perfil:'DEV',perfilAcessoId:999,permissoes:['modulo.oleo.reabrir_mes']},'oleo'),true);
  for(const role of ['GERENTE','NUTRICIONISTA']) assert(security.canReopenMonthlyPeriod({perfil:role,perfilAcessoId:999,permissoes:['modulo.oleo.acessar','modulo.oleo.reabrir_mes']},'oleo'));
  user=manager;const devProfile=await prisma.perfilAcesso.upsert({where:{codigo:'DEV'},create:{codigo:'DEV',nome:'DEV sintético',perfilLegado:'DEV'},update:{}});
  const edit=require('../src/app/usuarios/actions.ts').updateProfilePermissionsAction;
  let response=await redirect(()=>edit(form({profileId:devProfile.id,permissionCodes:['modulo.oleo.reabrir_mes']})));assert.equal(response.searchParams.get('feedbackType'),'success');
  let explicit=await prisma.perfilPermissao.findMany({where:{perfilId:devProfile.id,permitido:true},include:{permissao:true}});assert.deepEqual(explicit.filter(p=>p.permissao.codigo.endsWith('.reabrir_mes')).map(p=>p.permissao.codigo),['modulo.oleo.reabrir_mes']);
  response=await redirect(()=>edit(form({profileId:devProfile.id})));assert.equal(response.searchParams.get('feedbackType'),'success');explicit=await prisma.perfilPermissao.findMany({where:{perfilId:devProfile.id,permitido:true},include:{permissao:true}});assert.equal(explicit.filter(p=>p.permissao.codigo.endsWith('.reabrir_mes')).length,0);
  const grantCount=await prisma.perfilPermissao.count();await prisma.$transaction(require('../src/lib/register-retroactive-review-permissions.ts').registerRetroactiveReviewPermissions);assert.equal(await prisma.perfilPermissao.count(),grantCount);
  const groups=permissions.getPermissionGroups();assert(groups.some(g=>g.permissoes?.some(p=>p.codigo==='modulo.oleo.assinar_retroativo')||g.permissions?.some(p=>p.codigo==='modulo.oleo.assinar_retroativo')) || JSON.stringify(groups).includes('modulo.oleo.assinar_retroativo'));
 });
 await check('Indicadores Limpeza: antes/depois, parcial permanece pendente, gerencial distinto e complemento técnico auditado',async()=>{
  const helper=require('../src/lib/cleaning-day-signatures.ts');const d=new Date('2026-10-25'),a=await cleaning(d),b=await cleaning(d);
  assert.equal((await helper.currentCleaningDaySignatures([],'limpeza_diaria',[d])).length,0);
  await signRetro(manager,{module:'limpeza_diaria',date:d,recordIds:[a.id]});assert.equal((await helper.currentCleaningDaySignatures([],'limpeza_diaria',[d])).length,0);
  await signRetro(manager,{module:'limpeza_diaria',date:d,recordIds:[b.id]});let days=await helper.currentCleaningDaySignatures([],'limpeza_diaria',[d]);assert.equal(days.length,1);assert(JSON.parse(days[0].observacao).revisaoTecnicaPendente);
  const oldLogs=await prisma.logAssinatura.count({where:{modulo:'limpeza_diaria',referenciaId:'2026-10-25'}});
  await signRetro(nutri,{module:'limpeza_diaria',date:d,recordIds:[a.id,b.id]});days=await helper.currentCleaningDaySignatures([],'limpeza_diaria',[d]);assert.equal(days.length,1);assert.equal(JSON.parse(days[0].observacao).revisaoTecnicaPendente,false);assert.equal(await prisma.logAssinatura.count({where:{modulo:'limpeza_diaria',referenciaId:'2026-10-25'}}),oldLogs+1);
  assert.equal((await helper.currentCleaningDaySignatures([],'limpeza_semanal',[reference])).length,1);
 });
 await check('Óleo 117/118/121/122 equivalentes: pendência técnica antes/depois, legados, revogação e mês reaberto',async()=>{
  const monthly=require('../src/lib/monthly-periods.ts');const evidence=[];
  for(const [label,day,legacy]of [[117,'11',true],[118,'12',true],[121,'23',false],[122,'24',false]]){
   const date=new Date('2026-10-'+day);let sc,record;
   if(legacy){record=await prisma.controleQualidadeOleoRegistro.create({data:{data:date,temperatura:150,fitaOleo:'10',orientacao:'Sintético',responsavel:'Executor histórico inconclusivo',horarioExecucao:'08:30'}});sc={module:'oleo',date,legacyRecordId:record.id};}
   else {const unit=await save(operator,oilAdapter,'2026-10-'+day+':'+randomUUID(),form({temperatura:'150',fitaOleo:'__SEM_AFERICAO__',horarioExecucao:'08:30'}));record=await prisma.controleQualidadeOleoRegistro.findUniqueOrThrow({where:{fluxoId:unit.id}});sc={module:'oleo',date,flowId:unit.id};for(const op of ['VINCULO_LEGADO','REVOGACAO_ASSINATURA'])await prisma.fluxoEvento.create({data:{fluxoId:unit.id,operacao:op,versaoNova:unit.versao,estadoNovo:unit.estado,usuarioId:operator.id,usuarioNome:operator.nomeCompleto,usuarioPerfil:operator.perfil}});}
   const dateKey='2026-10-'+day;assert((await monthly.pendingOilReviewDates(10,2026)).includes(dateKey));
   await signRetro(manager,sc);const linked=await prisma.controleQualidadeOleoRegistro.findUniqueOrThrow({where:{id:record.id}});sc={module:'oleo',date,flowId:linked.fluxoId};assert((await monthly.pendingOilReviewDates(10,2026)).includes(dateKey),'Gerente não supre requisito técnico');
   const managerial=await latest(linked.fluxoId);assert.match(managerial.assinaturaVigente.mecanismo,/gerencial/);await signRetro(nutri,sc);assert(!(await monthly.pendingOilReviewDates(10,2026)).includes(dateKey));const technical=await latest(linked.fluxoId);assert.match(technical.assinaturaVigente.mecanismo,/técnica/);assert(await prisma.fluxoAssinatura.findUnique({where:{id:managerial.assinaturaVigenteId}}));
   const after=await prisma.controleQualidadeOleoRegistro.findUniqueOrThrow({where:{id:record.id}});for(const key of ['temperatura','fitaOleo','responsavel','data'])assert.deepEqual(after[key],record[key]);evidence.push({equivalente:label,antes:'revisão técnica pendente',aposGerente:'revisão gerencial registrada; revisão técnica pendente',aposNutricionista:'revisão técnica concluída'});
  }
  fs.writeFileSync(path.join(dir,'priority-before-after.json'),JSON.stringify(evidence,null,2));
 });
 await check('Histórico e contadores Buffet: serviços revisados, datas e natureza da evidência vigente',async()=>{
  const helper=require('../src/lib/operational-workflow/compatible-records.ts'),reviewedDates=['26','27','28','29','31'].map(d=>new Date('2026-10-'+d));
  const summaries=await helper.scopedLegacyDaySignatures([],'amostras',reviewedDates);assert.equal(summaries.length,5);assert(summaries.every(s=>s.observacao.includes('retroativa')));assert(summaries.find(s=>s.dataReferencia.getUTCDate()===27).observacao.includes('gerencial'));
 });
 await check('Complemento técnico Hortifruti e Temperatura preserva a revisão gerencial anterior',async()=>{
  const previous=await prisma.logAssinatura.count({where:{modulo:'hortifruti',referenciaId:dateText}});await signRetro(nutri,{module:'hortifruti',date:reference});const current=await prisma.assinaturaDiariaModulo.findUniqueOrThrow({where:{moduloCodigo_dataReferencia:{moduloCodigo:'hortifruti',dataReferencia:reference}}});assert(current.responsavelTecnico);assert.equal(await prisma.logAssinatura.count({where:{modulo:'hortifruti',referenciaId:dateText}}),previous+1);
  const temp=await prisma.controleTemperaturaEquipamento.findFirstOrThrow({where:{equipamento:tag+' legado'}});const old=await latest(temp.fluxoId);assert.match(old.assinaturaVigente.mecanismo,/gerencial/);await signRetro(nutri,{module:'temperatura',date:reference,flowId:temp.fluxoId});const after=await latest(temp.fluxoId);assert.match(after.assinaturaVigente.mecanismo,/técnica/);assert(await prisma.fluxoAssinatura.findUnique({where:{id:old.assinaturaVigenteId}}));
 });
 const browser=await buffet('2026-10-26'),browserClean=await cleaning(new Date('2026-10-29')),normalClean=await cleaning(new Date('2026-10-28'));
 const managerBrowser=await buffet('2026-10-27');
 for(const record of [browserClean,normalClean]){
  const area=await prisma.planoLimpezaDiarioArea.create({data:{nome:record.area,turnoTarde:false,turnoNoite:false,createdAt:new Date('2026-10-01')}});
  const item=await prisma.planoLimpezaDiarioItem.create({data:{areaId:area.id,descricao:'Item sintético do navegador',createdAt:new Date('2026-10-01')}});
  await prisma.planoLimpezaDiarioRegistro.update({where:{id:record.id},data:{itemId:item.id,itemDescricao:item.descricao}});
 }

 const oilRecords=[];
 for(const [label,day,legacy]of [[117,'11',true],[118,'12',true],[121,'23',false],[122,'24',false]]){
  const date=new Date('2026-10-'+day);let r;
  if(legacy)r=await prisma.controleQualidadeOleoRegistro.create({data:{data:date,temperatura:150,fitaOleo:'10',orientacao:'Orientação histórica sintética',observacao:'Observação histórica preservada',responsavel:'Executor histórico inconclusivo',horarioExecucao:'08:30'}});
  else {const u=await save(operator,oilAdapter,'2026-10-'+day+':'+randomUUID(),form({temperatura:'150',fitaOleo:'__SEM_AFERICAO__',horarioExecucao:'08:30'}));r=await prisma.controleQualidadeOleoRegistro.findUniqueOrThrow({where:{fluxoId:u.id}});for(const op of ['VINCULO_LEGADO','REVOGACAO_ASSINATURA'])await prisma.fluxoEvento.create({data:{fluxoId:u.id,operacao:op,versaoNova:u.versao,estadoNovo:u.estado,usuarioId:operator.id,usuarioNome:operator.nomeCompleto,usuarioPerfil:operator.perfil,justificativa:'Evidência histórica sintética'}});}
  assert.equal((await require('../src/app/controle-qualidade-oleo/signature-policy.ts').oilRecordSignatureEligibility(prisma,nutri,r,'individual')).allowed,false);assert((await review(nutri,{module:'oleo',date,flowId:r.fluxoId||undefined,legacyRecordId:legacy?r.id:undefined})).allowed);
  oilRecords.push({equivalente:label,id:r.id,day:'2026-10-'+day,legacy});
 }
 await check('Óleo final: rota retroativa correta, senha/justificativa/token, permissão, competência e preservação',async()=>{
  const access=require('../src/app/controle-qualidade-oleo/retroactive-access.tsx').oilRetroactiveAccess;
  const before=await fingerprint();for(const r of oilRecords){const row=await prisma.controleQualidadeOleoRegistro.findUniqueOrThrow({where:{id:r.id}}),sc={module:'oleo',date:row.data,flowId:row.fluxoId||undefined,legacyRecordId:r.legacy?r.id:undefined};
   const entry=await access(nutri,r.id);assert(entry.href.includes(r.legacy?'legado=':'fluxo='));assert.equal((await access(denied,r.id)).href,undefined);assert((await access(denied,r.id)).reason.includes('assinar_retroativo'));
   for(const patch of [{password:'wrong'},{justification:''},{token:'stale'},{confirmed:false}])await assert.rejects(()=>signRetro(nutri,sc,patch));
  }assert.equal(await fingerprint(),before);
  const closed=await prisma.controleQualidadeOleoRegistro.findFirstOrThrow({where:{data:new Date('2026-09-20')}});assert((await access(nutri,closed.id)).reason.includes('Competência fechada'));
  const labels=require('../src/lib/review-presentation.ts');assert.equal(labels.signatureBadgeLabel(null),'Assinado pelo Supervisor');assert.equal(labels.signatureBadgeLabel(JSON.stringify({operacao:'REVISAO_RETROATIVA',natureza:'Revisão técnica retroativa com ressalvas'})),'Assinado pelo Supervisor');assert.equal(labels.signatureBadgeLabel(JSON.stringify({operacao:'REVISAO_RETROATIVA',natureza:'Revisão gerencial retroativa'})),'Revisão gerencial');assert.equal(labels.reviewSignatureLabel(null),'Pendente de revisão');
 });
 await check('Óleo legado: falha de auditoria desfaz adoção, vínculo e assinatura atomicamente',async()=>{
  const r=oilRecords.find(r=>r.legacy),row=await inspect.controleQualidadeOleoRegistro.findUniqueOrThrow({where:{id:r.id}}),before=await fingerprint();
  await inspect.$executeRawUnsafe("CREATE FUNCTION test_oil_audit_failure() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION ''Falha sintetica oleo''; END'");await inspect.$executeRawUnsafe('CREATE TRIGGER test_oil_audit_failure BEFORE INSERT ON log_assinatura FOR EACH ROW EXECUTE FUNCTION test_oil_audit_failure()');
  try{await assert.rejects(()=>signRetro(nutri,{module:'oleo',date:row.data,legacyRecordId:row.id}),/Falha sintetica oleo/);}finally{await inspect.$executeRawUnsafe('DROP TRIGGER test_oil_audit_failure ON log_assinatura');await inspect.$executeRawUnsafe('DROP FUNCTION test_oil_audit_failure()');}
  assert.deepEqual(await inspect.controleQualidadeOleoRegistro.findUniqueOrThrow({where:{id:row.id}}),row);assert.equal(await prisma.fluxoOperacional.findUnique({where:{id:'oil-legacy-'+row.id}}),null);assert.equal(await fingerprint(),before);
 });
 const protectedOil=await save(operator,oilAdapter,'2026-10-25:'+randomUUID(),form({temperatura:'150',fitaOleo:'__SEM_AFERICAO__',horarioExecucao:'08:30'}));await sign(nutri,[protectedOil],oilSignatureBridge(password,false));
 const oilControl=await latest(protectedOil.id);
 fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify({database,password,oilRecords,oilControlId:protectedOil.id,oilControlSnapshot:JSON.stringify(oilControl),nutri:nutri.nomeUsuario,manager:manager.nomeUsuario,operator:operator.nomeUsuario,managerFlowId:managerBrowser.id,flowId:browser.id,day:'2026-10-26',cleanId:browserClean.id,cleanDay:'2026-10-29',normalCleanId:normalClean.id,normalCleanDay:'2026-10-28'}));
 assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,'.env'))).digest('hex'),envHash);
 fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify({database,outcomes},null,2));console.log('PASS '+outcomes.length+' grupos locais de assinatura retroativa.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await prisma.$disconnect();await inspect.$disconnect();});
