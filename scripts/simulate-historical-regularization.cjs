// Imports a consistent domain snapshot into a NEW localhost database only.
// No configured URL is read. No source credentials, passwords or sessions are copied.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),assert=require('node:assert/strict');
const {digest}=require('./lib/historical-regularization.cjs');
const root=path.resolve(__dirname,'..'),args=process.argv.slice(2),at=args.indexOf('--snapshot'),file=args[at+1];if(at<0||!file)throw Error('Informe --snapshot.');
const snapshot=JSON.parse(fs.readFileSync(file,'utf8'));if(!snapshot.somenteLeitura||snapshot.tipo!=='copia-consistente-dos-dominios-oleo-amostras-sem-credenciais')throw Error('Snapshot inválido.');
const database='historiccopy_'+Date.now(),url=`postgresql://postgres:isolated_test_only@127.0.0.1:55479/${database}`,bin=path.join(root,'.data/validation/buffet-pending-postgres-20261102/runtime/pgsql/bin/createdb.exe');
execFileSync(bin,['-h','127.0.0.1','-p','55479','-U','postgres','-T','template0',database],{windowsHide:true,stdio:'pipe',env:{...process.env,PGPASSWORD:'isolated_test_only'}});
process.env.DATABASE_URL=url;process.env.DIRECT_URL=url;
execFileSync(process.execPath,[path.join(root,'node_modules/prisma/build/index.js'),'migrate','deploy'],{cwd:root,stdio:'pipe',windowsHide:true,env:{...process.env,DATABASE_URL:url,DIRECT_URL:url}});
const {PrismaClient,Prisma}=require('@prisma/client'),db=new PrismaClient({datasources:{db:{url}},log:[]}),data=snapshot.data;
const normalize=(model,row)=>Object.fromEntries(Object.entries(row).filter(([key,v])=>!(key==='indicadoresSnapshot'&&v===null)));
const insert=async(tx,model,rows)=>{for(let i=0;i<rows.length;i+=200)await tx[model].createMany({data:rows.slice(i,i+200).map(r=>normalize(model,r))});};
(async()=>{
 assert.equal((await db.$queryRaw`SELECT current_database() name`)[0].name,database);
 await db.$transaction(async tx=>{
  await insert(tx,'usuario',data.usuario.map(u=>({...u,senhaHash:'copia-local-sem-credencial-utilizavel',perfilAcessoId:null,obrigarTrocaSenha:false})));
  for(const model of ['controleBuffetAmostraServico','controleBuffetAmostraItem','controleBuffetAmostraItemServico','controleBuffetAmostraAcaoCorretiva'])await insert(tx,model,data[model]);
  for(const model of ['controleQualidadeOleoRegistro','controleBuffetAmostraRegistro'])await insert(tx,model,data[model].filter(r=>!r.fluxoId));
  await insert(tx,'fluxoAssinatura',data.fluxoAssinatura);
  await insert(tx,'fluxoOperacional',data.fluxoOperacional.map(f=>({...f,...(f.estado==='FECHADO'?{estado:'COMPLETO',assinaturaVigenteId:null}:{})})));
  for(const flow of data.fluxoOperacional){await tx.$executeRaw`SELECT set_config('bpma.workflow_flow',${flow.id},true)`;for(const model of ['controleQualidadeOleoRegistro','controleBuffetAmostraRegistro'])await insert(tx,model,data[model].filter(r=>r.fluxoId===flow.id));}
  for(const model of ['fluxoVersao','fluxoAssinaturaVinculo','fluxoEvento','logAssinatura','assinaturaDiariaModulo','fechamentoMensalModulo','controleQualidadeOleoFechamento','controleBuffetAmostraFechamento'])await insert(tx,model,data[model]);
  for(const flow of data.fluxoOperacional.filter(f=>f.estado==='FECHADO'))await tx.fluxoOperacional.update({where:{id:flow.id},data:flow});
 },{timeout:120000});
 const verification={};
 for(const model of Object.keys(data).filter(m=>m!=='usuario')){const copied=await db[model].findMany();const sorted=rows=>rows.map(digest).sort();assert.deepEqual(sorted(copied),sorted(data[model]),'Cópia divergente: '+model);verification[model]={rows:copied.length,preservado:true};}
 for(const model of Prisma.dmmf.datamodel.models.filter(m=>m.fields.some(f=>f.name==='id'&&f.type==='Int'&&f.isId))){if(!data[model.name[0].toLowerCase()+model.name.slice(1)])continue;const table=model.dbName??model.name;const sequence=await db.$queryRaw`SELECT pg_get_serial_sequence(${table},'id') seq`;if(sequence[0]?.seq)await db.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('${table}','id'), GREATEST(COALESCE((SELECT MAX(id) FROM "${table}"),0),1),true)`);}
 const dir=path.join(root,'.data/validation/regularizacao-20261103'),outputAt=args.indexOf('--output-metadata');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(outputAt>=0?args[outputAt+1]:path.join(dir,'copia-local.json'),JSON.stringify({database,fonteFingerprint:snapshot.destinoFingerprint,capturadoEm:snapshot.capturadoEm,backupCompleto:false,contagens:verification},null,2));
 console.log(JSON.stringify({somenteLocal:true,database,integridadeVerificada:true,tabelas:Object.keys(verification).length}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.$disconnect());
