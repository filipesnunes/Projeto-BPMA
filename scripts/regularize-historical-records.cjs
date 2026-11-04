// Manual maintenance only. Default plan mode has no database connection.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const api=require('./lib/historical-regularization.cjs'),args=process.argv.slice(2),value=k=>args.includes(k)?args[args.indexOf(k)+1]:undefined;
const read=file=>JSON.parse(fs.readFileSync(file,'utf8')),write=(file,data)=>{fs.mkdirSync(path.dirname(path.resolve(file)),{recursive:true});fs.writeFileSync(file,JSON.stringify(data,null,2));};
function buffetValidators(db){
 const Module=require('node:module'),ts=require('typescript'),load=Module._load,root=path.resolve(__dirname,'..');
 Module._load=function(n,p,m){if(n==='server-only')return{};if(n==='@/lib/prisma')return{prisma:db};if(n.startsWith('@/'))n=path.join(root,'src',n.slice(2));return load.call(this,n,p,m);};
 for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
 const {prepareBuffetRow,buffetRecordValues}=require('../src/app/controle-buffet-amostras/row-save.ts'),{buffetSnapshot}=require('../src/app/controle-buffet-amostras/workflow-adapter.ts'),{buffetProgress}=require('../src/app/controle-buffet-amostras/progress.ts');
 return{async validate(tx,row,draft){const item=row.itemExtra?{nome:row.itemNome,classificacao:row.classificacao,usaGarrafaTermica:row.usaGarrafaTermica}:draft.manifest.find(i=>i.id===row.itemId);if(!item)throw Error('Item ausente do manifesto histórico.');const key=row.itemExtra?'extra-'+row.id:'item-'+row.itemId,form=new FormData();for(const[k,v]of Object.entries(buffetRecordValues(row)))form.set(key+'-'+k,v);const result=await prepareBuffetRow(tx,{form,rowKey:key,item,date:row.data,actor:{id:row.responsavelUsuarioId,nomeCompleto:row.responsavelNome,perfil:row.responsavelPerfil},old:row,complete:true});if(result.payload?.status!=='PREENCHIDO')throw Error('Dados persistidos não satisfazem as regras atuais.');},content(rows,draft){const p=buffetProgress(rows,draft.manifest);return{snapshot:buffetSnapshot(rows,draft.manifest),complete:p.complete,resolved:p.resolved,required:Math.max(p.required,1)};}};
}
async function main(){
 const mode=value('--mode')??'plan',out=value('--output');if(!out)throw Error('Informe --output.');
 if(mode==='plan'){const snapshot=read(value('--snapshot')),audit=read(value('--buffet-audit'));write(path.join(out,'plano-oleo.json'),api.buildOilRevocationPlan(snapshot));write(path.join(out,'plano-amostras.json'),api.buildBuffetStatePlan(snapshot,audit));console.log('Propostas gravadas. Nenhuma conexão ou alteração de banco executada.');return;}
 if(!['simulate','apply'].includes(mode))throw Error('Modo inválido.');
 const plan=read(value('--plan'));api.verifyPlan(plan);let connection;
 if(mode==='simulate'){const database=value('--local-database');if(!/^historiccopy_\d+$/.test(database??''))throw Error('Simulação restrita a cópia local isolada identificada.');connection=`postgresql://postgres:isolated_test_only@127.0.0.1:55479/${database}`;}
 else{
  if(!args.includes('--allow-configured-database-write')||!value('--approval')||!value('--approved-by')||!value('--confirm-target')||!value('--simulation'))throw Error('Aplicação exige autorização específica, aprovador, destino confirmado, backup e relatório de simulação.');
  const simulation=read(value('--simulation'));if(!simulation.somenteSimulacao||!simulation.sucesso||simulation.planoHash!==plan.planoHash)throw Error('Simulação válida deste plano não foi apresentada.');
  require('dotenv').config({quiet:true});connection=process.env.DIRECT_URL||process.env.DATABASE_URL;
  const parsed=new URL(connection),target=createHash('sha256').update(JSON.stringify([parsed.hostname,parsed.port,parsed.pathname])).digest('hex');if(target!==value('--confirm-target')||target!==plan.destinoFingerprint)throw Error('Destino não corresponde ao diagnóstico.');
 }
 const backup=read(value('--backup-manifest'));
 if(mode==='apply'){
  const captured=Date.parse(backup.capturadoEm),verified=Date.parse(backup.verificadoEm),now=Date.now();
  if(backup.tipo!=='backup-completo'||backup.destinoFingerprint!==plan.destinoFingerprint||backup.restauracaoTestada!==true||!backup.arquivo||!Number.isFinite(captured)||!Number.isFinite(verified)||captured>now||verified<captured||verified>now||!fs.existsSync(backup.arquivo))throw Error('Backup completo recente do destino confirmado e restauração testada são obrigatórios.');
  const hash=createHash('sha256').update(fs.readFileSync(backup.arquivo)).digest('hex');if(hash!==backup.sha256)throw Error('Arquivo de backup diverge do manifesto.');
  if(now-captured>86400000)throw Error('Backup anterior a 24 horas; obtenha e verifique backup atual.');
 }
 process.env.DATABASE_URL=connection;process.env.DIRECT_URL=connection;
 const {PrismaClient}=require('@prisma/client'),db=new PrismaClient({datasources:{db:{url:connection}},log:[]});
 try{
  if(mode==='simulate'){const current=await db.$queryRaw`SELECT current_database() AS name`;if(current[0].name!==value('--local-database'))throw Error('Banco local não confirmado.');}
  const options={actorId:Number(value('--operator-id')),authorization:mode==='simulate'?'SIMULACAO_LOCAL_SEM_AUTORIZACAO_PRODUCAO':value('--approval'),authorizedBy:mode==='simulate'?'Simulação na cópia isolada':value('--approved-by'),reason:value('--reason')??'Regularização estritamente limitada ao plano conferido.',backup,targetFingerprint:mode==='simulate'?plan.destinoFingerprint:value('--confirm-target')};
  const result=plan.tipo==='REVOGACAO_OLEO_VERSIONADO'?await api.applyOilRevocationPlan(db,plan,options):await api.applyBuffetStatePlan(db,plan,options,buffetValidators(db));
  write(out,{somenteSimulacao:mode==='simulate',sucesso:true,...result});console.log(JSON.stringify({somenteSimulacao:mode==='simulate',sucesso:true,operacoes:result.resultados.length}));
 }finally{await db.$disconnect();}
}
module.exports={buffetValidators};
if(require.main===module)main().catch(error=>{console.error(error?.code?JSON.stringify({codigo:error.code,tipo:error.name}):error instanceof Error&&!/postgres|password|prisma|DATABASE_URL/i.test(error.message)?error.message:'Operação não concluída; detalhes de conexão omitidos.');process.exitCode=1;});
