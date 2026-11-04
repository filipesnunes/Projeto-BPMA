// Writes exclusively to a NEW localhost synthetic database cloned from the
// previously prepared test template. Never reads .env connection settings.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const {execFileSync}=require('node:child_process'),{randomUUID,createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.data/validation/buffet-structural');fs.mkdirSync(dir,{recursive:true});
const template=fs.readFileSync(path.join(root,'.data/validation/group-workflows/database.txt'),'utf8').trim();assert(/^workflow_\d+$/.test(template));
const database='buffetstructure_'+Date.now(),bin=path.join(root,'.data/validation/buffet-pending-postgres-20261102/runtime/pgsql/bin/createdb.exe');
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
const {refreshWorkflowActor}=require('../src/app/controle-temperatura-equipamentos/workflow-adapter.ts');
const {groupSignatureBridge}=require('../src/lib/operational-workflow/group-signatures.ts');
const {hashPassword}=require('../src/lib/password.ts'),permissions=require('../src/lib/permissions.ts');
const {validateBuffetRow,suggestedBuffetAction}=require('../src/app/controle-buffet-amostras/row-validation.ts');
const {buffetRecordValues}=require('../src/app/controle-buffet-amostras/row-save.ts');
const {buffetServiceReview}=require('../src/app/controle-buffet-amostras/service-review.ts');
const actions=require('../src/app/controle-buffet-amostras/workflow-actions.ts');
const outcomes=[];async function check(name,fn){await fn();outcomes.push(name);console.log('PASS '+name);}
const form=values=>{const f=new FormData();for(const[k,v]of Object.entries(values))for(const x of Array.isArray(v)?v:[v])f.append(k,String(x));return f;};
const actor=who=>tx=>refreshWorkflowActor(tx,who);
const latest=id=>inspect.fluxoOperacional.findUniqueOrThrow({where:{id},include:{amostras:{where:{excluidoEm:null},orderBy:{id:'asc'}},versoes:{orderBy:{versao:'desc'}},eventos:true,assinaturaVigente:true}});
(async()=>{
assert.equal((await prisma.$queryRaw`SELECT current_database() name`)[0].name,database);
const tag='STRUCTURAL-'+Date.now(),password='structural-test-password';
 async function account(suffix,role,codes){let profile;if(codes){profile=await prisma.perfilAcesso.create({data:{codigo:tag+'-'+suffix,nome:tag+' '+suffix}});for(const code of codes){const def=permissions.PERMISSION_DEFINITIONS.find(p=>p.codigo===code);assert(def,code);const entry=await prisma.permissao.upsert({where:{codigo:code},create:def,update:{}});await prisma.perfilPermissao.create({data:{perfilId:profile.id,permissaoId:entry.id}});}}
 const a=await prisma.usuario.create({data:{nomeCompleto:tag+' '+suffix,nomeUsuario:(tag+'-'+suffix).toLowerCase(),senhaHash:hashPassword(password),perfil:role,perfilAcessoId:profile?.id}}),session=await prisma.usuarioSessao.create({data:{usuarioId:a.id,tokenHash:randomUUID(),expiraEm:new Date('2035-01-01')}});return{...a,sessaoId:session.id,permissoes:codes??permissions.getDefaultPermissionCodes(role)};}
const all=permissions.PERMISSION_DEFINITIONS.filter(p=>p.codigo.startsWith('modulo.amostras.')||['usuarios.responsavel_tecnico','modulo.relatorios.acessar'].includes(p.codigo)).map(p=>p.codigo);
const operator=await account('operator','COLABORADOR',all),nutri=await account('nutri','NUTRICIONISTA',all),peer=await account('peer','NUTRICIONISTA',all),noSign=await account('no-sign','NUTRICIONISTA',['modulo.amostras.acessar','usuarios.responsavel_tecnico']);
const corrective=await prisma.controleBuffetAmostraAcaoCorretiva.create({data:{nome:tag+' Resfriar'}}),inactive=await prisma.controleBuffetAmostraAcaoCorretiva.create({data:{nome:tag+' Histórica',ativo:false}});
await prisma.controleBuffetAmostraAcaoCorretiva.upsert({where:{nome:'Não se aplica'},create:{nome:'Não se aplica'},update:{ativo:true}});
const catalog=[{nome:'Não se aplica'},corrective];
const retro=dates.formatAppDateInput(new Date(+today-86400000));
const item={nome:'Queijo branco',classificacao:'FRIO',usaGarrafaTermica:false},valid={temperaturaTipo:'NUMERICA',tcEquipamento:'5',primeiraTc:'5',acaoCorretiva:'Não se aplica',horarioExecucao:'08:15',horarioNaoInformado:'false'};
await check('Temperaturas, ações, ambiente, garrafa e não servido',async()=>{
 for(const [classification,temperature,requires] of [['QUENTE','65',false],['QUENTE','40',true],['FRIO','5',false],['FRIO','10.9',true],['FRIO','25',true]]){
  const i={...item,classificacao:classification},r={...valid,primeiraTc:temperature};assert.equal(validateBuffetRow(i,r,{date:retro,actions:catalog}).length>0,requires);
  assert.equal(suggestedBuffetAction(i,{...r,acaoCorretiva:''},catalog),requires?'':'Não se aplica');
  assert.equal(suggestedBuffetAction(i,{...r,acaoCorretiva:corrective.nome},catalog),corrective.nome);
  assert.equal(validateBuffetRow(i,{...r,acaoCorretiva:corrective.nome},{date:retro,actions:catalog}).length,0);
 }
 assert.equal(suggestedBuffetAction(item,{...valid,primeiraTc:'10,9'},catalog),'');
 assert.equal(suggestedBuffetAction(item,{...valid,acaoCorretiva:''},catalog),'Não se aplica');
 assert.equal(validateBuffetRow(item,{temperaturaTipo:'AMBIENTE',horarioExecucao:'08:15'},{date:retro}).length,0);
 assert.equal(validateBuffetRow({...item,usaGarrafaTermica:true},{...valid,tcEquipamento:''},{date:retro}).length,0);
 assert.equal(validateBuffetRow(item,{naoServido:'true'},{date:retro}).length,0);
 assert.equal(validateBuffetRow(item,{...valid,acaoCorretiva:inactive.nome},{date:retro,actions:catalog,historicalAction:inactive.nome}).length,0);
 assert(validateBuffetRow(item,{...valid,acaoCorretiva:inactive.nome},{date:retro,actions:catalog}).length);
});
await check('Horários: dia automático, retroativo explícito, desconhecido justificado e inválidos',async()=>{
 assert.equal(validateBuffetRow(item,{...valid,horarioExecucao:''},{date:day}).length,0);
 assert(validateBuffetRow(item,{...valid,horarioExecucao:''},{date:retro}).some(x=>x.includes('horário')));
 assert(validateBuffetRow(item,{...valid,horarioExecucao:'29:61'},{date:retro}).length);
 assert.equal(validateBuffetRow(item,{...valid,horarioExecucao:'',horarioNaoInformado:'true',justificativaHorario:'Procedimento realizado; horário não anotado.'},{date:retro}).length,0);
 assert(validateBuffetRow(item,{...valid,horarioNaoInformado:'true',justificativaHorario:''},{date:retro}).length);
});
const items=[];for(let i=0;i<32;i++)items.push(await prisma.controleBuffetAmostraItem.create({data:{nome:tag+' Item '+String(i+1).padStart(2,'0'),classificacao:'FRIO'}}));
async function fixture(name){
 const service=await prisma.controleBuffetAmostraServico.create({data:{nome:tag+' '+name}});
 await prisma.controleBuffetAmostraItemServico.createMany({data:items.map(i=>({servicoId:service.id,itemId:i.id}))});
 const input=form({rowKey:items.map(i=>'item-'+i.id)});
 for(const i of items)for(const[k,v]of Object.entries(valid))input.set('item-'+i.id+'-'+k,v);
 let unit=await core.saveWorkflow({actor:actor(operator),adapter:buffetAdapter,key:service.id+':'+retro,expectedVersion:0,input});
 unit=await core.saveWorkflow({actor:actor(operator),adapter:buffetAdapter,key:service.id+':'+retro,expectedVersion:unit.versao,input:form({operation:'extra',itemNome:tag+' Extra',classificacao:'FRIO'})});
 unit=await latest(unit.id);
 // Reproduce the persisted historical inconsistency on synthetic data ONLY.
 await inspect.$transaction(async tx=>{
  await tx.$executeRaw`SELECT set_config('bpma.workflow_flow',${unit.id},true)`;
  for(const[index,r]of unit.amostras.entries())if(index<4||r.itemExtra)await tx.controleBuffetAmostraRegistro.update({where:{id:r.id},data:{status:'PENDENTE',horarioExecucao:null,...(index===0?{primeiraTc:10.9,acaoCorretiva:'Não se aplica'}:{}),...(r.itemExtra?{tcEquipamento:5,primeiraTc:5,acaoCorretiva:'Não se aplica'}:{})}});
  const records=await tx.controleBuffetAmostraRegistro.findMany({where:{fluxoId:unit.id},orderBy:{id:'asc'}});
  const draft={manifest:items.map(({id,nome,classificacao,usaGarrafaTermica})=>({id,nome,classificacao,usaGarrafaTermica})),rows:Object.fromEntries(records.map(r=>[r.itemExtra?'extra-'+r.id:'item-'+r.itemId,buffetRecordValues(r)]))};
  draft.rows["item-"+items[2].id].horarioNaoInformado="true";
  await tx.fluxoOperacional.update({where:{id:unit.id},data:{versao:{increment:1}}});
  await tx.fluxoVersao.create({data:{fluxoId:unit.id,versao:unit.versao+1,rascunho:draft,dados:require('../src/app/controle-buffet-amostras/workflow-adapter.ts').buffetSnapshot(records,draft.manifest),completo:false,resolvidos:28,obrigatorios:33,usuarioId:operator.id,usuarioNome:operator.nomeCompleto,usuarioPerfil:operator.perfil}});
  await tx.fluxoEvento.create({data:{fluxoId:unit.id,operacao:'SALVAMENTO',estadoAnterior:'PENDENTE',estadoNovo:'PENDENTE',versaoAnterior:unit.versao,versaoNova:unit.versao+1,usuarioId:operator.id,usuarioNome:operator.nomeCompleto,usuarioPerfil:operator.perfil}});
 });return {service,unit:await latest(unit.id)};
}
const {service,unit:initial}=await fixture('Integração 33');let unit=initial;
function submit(current){const f=form({servicoId:service.id,data:retro,versao:current.versao,rowIntentVersion:1});for(const r of current.amostras){const key=r.itemExtra?'extra-'+r.id:'item-'+r.itemId;f.append('rowKey',key);for(const[k,v]of Object.entries(buffetRecordValues(r)))f.set(key+'-'+k,v);}return f;}
user=operator;let input=submit(unit);
await check('33 itens: cinco erros coletivos, extra incluído, nenhum write parcial',async()=>{
 const before=JSON.stringify(await latest(unit.id));assert.equal((await actions.saveBuffetWorkflowState(input,'bypass')).status,'error');input.set('intent','draft');const result=await actions.saveBuffetWorkflowState(input);assert.equal(result.status,'error');assert.equal(result.issues.length,5);assert(result.issues[0].missingFields.length>=2);assert(result.issues.some(i=>i.rowKey.startsWith('extra-')));assert.equal(JSON.stringify(await latest(unit.id)),before);
 const eligibility=await buffetServiceReview(prisma,nutri,unit.id,false);assert(!eligibility.allowed);assert.equal(eligibility.issues.length,5);
});
await check('Correção única, campos programáticos, autoria e horários intactos, estado completo',async()=>{
 for(const r of unit.amostras){if(r.status!=='PENDENTE')continue;const key=r.itemExtra?'extra-'+r.id:'item-'+r.itemId;for(const[k,v]of Object.entries({horarioExecucao:'08:15',horarioNaoInformado:'false',justificativaHorario:'',acaoCorretiva:r.primeiraTc===10.9?corrective.nome:'Não se aplica'})){input.set(key+'-'+k,v);input.append('changedField',key+'-'+k);}}
 const result=await actions.saveBuffetWorkflowState(input);assert.equal(result.status,'success',result.message);unit=await latest(unit.id);assert.equal(unit.estado,'COMPLETO');assert.equal(unit.amostras.length,33);assert.equal(unit.versao,initial.versao+1);
 for(const r of initial.amostras.filter(r=>r.status==='PREENCHIDO'))assert.deepEqual(unit.amostras.find(n=>n.id===r.id),r);
 assert(unit.amostras.every(r=>r.responsavelUsuarioId===operator.id));assert((await buffetServiceReview(prisma,nutri,unit.id,false)).allowed);
});
await check('Histórico e destino: mesma elegibilidade, permissão, segregação, fechamento e divergência',async()=>{
 assert(!(await buffetServiceReview(prisma,operator,unit.id,false)).allowed);assert(!(await buffetServiceReview(prisma,noSign,unit.id,false)).allowed);assert((await buffetServiceReview(prisma,nutri,unit.id,true)).reason.includes('Competência'));
 const text=n=>Array.isArray(n)?n.map(text).join(' '):n&&typeof n==='object'?text(n.props?.children):typeof n==='string'?n:'';user=nutri;
 const History=require('../src/app/controle-buffet-amostras/historico/legacy-page.tsx').default;const page=await History({searchParams:Promise.resolve({filtroData:retro,dia:retro,filtroServicoId:String(service.id)})});assert(text(page).includes('Revisar e assinar'));
 const Service=require('../src/app/controle-buffet-amostras/workflow-page.tsx').BuffetWorkflowPage;const pageNode=await Service({params:Promise.resolve({id:String(service.id)}),searchParams:Promise.resolve({data:retro})});
 function find(n){if(!n||typeof n!=='object')return null;if(n.props?.review)return n.props.review;return (Array.isArray(n)?n:[n.props?.children]).flat(Infinity).map(find).find(Boolean);}assert(find(pageNode).allowed);
 const record=unit.amostras[0];
 async function observation(value){await inspect.$transaction(async tx=>{await tx.$executeRaw`SELECT set_config('bpma.workflow_flow',${unit.id},true)`;await tx.controleBuffetAmostraRegistro.update({where:{id:record.id},data:{observacao:value}});});}
 await observation('Divergência sintética');assert((await buffetServiceReview(prisma,nutri,unit.id,false)).reason.includes('divergente'));await observation(record.observacao);
 unit=await latest(unit.id);
});
const sign=who=>core.signWorkflow({actor:actor(who),scope:[{id:unit.id,version:unit.versao}],bridge:groupSignatureBridge('amostras','SERVICO',password)});
await check('Assinatura independente, senha, duplicação, versão, histórico e relatório preservados',async()=>{
 const measurements=JSON.stringify(unit.amostras);await assert.rejects(()=>sign(operator),/nutricionista|permissão/);
 await assert.rejects(()=>core.signWorkflow({actor:actor(nutri),scope:[{id:unit.id,version:unit.versao-1}],bridge:groupSignatureBridge('amostras','SERVICO',password)}),/atualizado/);
 await assert.rejects(()=>core.signWorkflow({actor:actor(nutri),scope:[{id:unit.id,version:unit.versao}],bridge:groupSignatureBridge('amostras','SERVICO','wrong')}),/Senha/);
 await sign(nutri);unit=await latest(unit.id);assert.equal(unit.estado,'FECHADO');assert.equal(JSON.stringify(unit.amostras),measurements);await assert.rejects(()=>sign(nutri),/disponível/);
 const signature=unit.assinaturaVigenteId;assert(!(await buffetServiceReview(prisma,nutri,unit.id,false)).allowed);
 const {NextRequest}=require('next/server');user=nutri;const response=await require('../src/app/relatorios/controle-buffet-amostras/mensal/route.ts').GET(new NextRequest('http://localhost/relatorios/controle-buffet-amostras/mensal?mes='+retro.slice(5,7)+'&ano='+retro.slice(0,4)));assert.equal(response.status,200);const html=await response.text();assert(html.includes(nutri.nomeCompleto));fs.writeFileSync(path.join(dir,'report.html'),html);
 await core.reopenWorkflow({actor:actor(operator),module:'amostras',id:unit.id,expectedVersion:unit.versao,reason:'Revisão sintética autorizada',fromEdit:false});unit=await latest(unit.id);assert((await buffetServiceReview(prisma,peer,unit.id,false)).allowed);assert(await inspect.fluxoAssinatura.findUnique({where:{id:signature}}));
});
await check('Autoria inconclusiva e divergência de estado bloqueadas sem alterar evidências',async()=>{
 const service=await prisma.controleBuffetAmostraServico.create({data:{nome:tag+' Autoria inconclusiva'}});
 await prisma.controleBuffetAmostraItemServico.create({data:{servicoId:service.id,itemId:items[0].id}});
 const f=form({rowKey:'item-'+items[0].id});for(const[k,v]of Object.entries(valid))f.set('item-'+items[0].id+'-'+k,v);
 const flow=await core.saveWorkflow({actor:actor(operator),adapter:buffetAdapter,key:service.id+':'+retro,expectedVersion:0,input:f});
 const evidence=JSON.stringify((await latest(flow.id)).versoes);
 await inspect.fluxoOperacional.update({where:{id:flow.id},data:{estado:'PENDENTE',preenchimentoCompleto:false}});
 assert((await buffetServiceReview(prisma,nutri,flow.id,false)).reason.includes('divergem'));
 await inspect.fluxoOperacional.update({where:{id:flow.id},data:{estado:'COMPLETO',preenchimentoCompleto:true}});
 await inspect.fluxoEvento.create({data:{fluxoId:flow.id,operacao:'VINCULO_LEGADO',estadoAnterior:'COMPLETO',estadoNovo:'COMPLETO',versaoAnterior:flow.versao,versaoNova:flow.versao,usuarioId:operator.id,usuarioNome:operator.nomeCompleto,usuarioPerfil:operator.perfil}});
 assert((await buffetServiceReview(prisma,nutri,flow.id,false)).reason.includes('autoria original'));
 await assert.rejects(()=>core.signWorkflow({actor:actor(nutri),scope:[{id:flow.id,version:flow.versao}],bridge:groupSignatureBridge('amostras','SERVICO',password)}),/autoria original/);
 assert.equal(JSON.stringify((await latest(flow.id)).versoes),evidence);
});
const browser=await fixture('Navegador 33');
fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify({database,day:retro,serviceId:browser.service.id,flowId:browser.unit.id,itemIds:items.map(i=>i.id),extraId:browser.unit.amostras.find(r=>r.itemExtra).id,username:nutri.nomeUsuario,operatorUsername:operator.nomeUsuario,password,corrective:corrective.nome}));
fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify({database,outcomes,externalWrites:false},null,2));assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,'.env'))).digest('hex'),envHash);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await prisma.$disconnect();await inspect.$disconnect();});
