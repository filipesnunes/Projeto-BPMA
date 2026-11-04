// Explicit incident audit only. No application imports, permission registration or writes.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const values=require('dotenv').parse(fs.readFileSync(path.join(root,'.env')));
if(!values.DATABASE_URL)throw Error('Configured database unavailable. No URL displayed.');
const {PrismaClient}=require('@prisma/client');
const prisma=new PrismaClient({datasources:{db:{url:values.DATABASE_URL}},log:[]});
(async()=>{
 const evidence=await prisma.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '5000ms'");
  const setting=await tx.$queryRawUnsafe('SHOW transaction_read_only');
  if(setting[0]?.transaction_read_only!=='on')throw Error('Read-only transaction was not established.');
  const codes=['modulo.temperatura.editar_registros_mes_vigente','modulo.temperatura.reabrir_registro'];
  const permissions=await tx.permissao.findMany({where:{codigo:{in:codes}},select:{codigo:true,nome:true,descricao:true,sensivel:true,criadoEm:true,atualizadoEm:true,_count:{select:{perfis:true}}},orderBy:{codigo:'asc'}});
  return {auditedAt:new Date().toISOString(),transactionReadOnly:true,permissions,limitation:'No pre-incident snapshot or database audit log is available. Presence/timestamps alone cannot prove which execution created/updated metadata. The audited routine does not write profile grants or operational records.'};
 },{maxWait:10000,timeout:20000});
 const dir=path.join(root,'.data/validation/permission-incident');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'readonly-audit.json'),JSON.stringify(evidence,null,2));
 console.log(JSON.stringify(evidence,null,2));
})().catch(error=>{console.error('Read-only audit unavailable; code: '+(error.code??'unspecified')+'. Credentials and connection details suppressed.');process.exitCode=1;}).finally(()=>prisma.$disconnect());
