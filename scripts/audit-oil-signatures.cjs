// Explicit opt-in. Connection configuration is never printed. No app imports.
const fs=require('node:fs'),path=require('node:path');
const args=process.argv.slice(2),localIndex=args.indexOf('--local-database'),outIndex=args.indexOf('--output');
if(!args.includes('--read-only')||outIndex<0||!args[outIndex+1])throw Error('Use --read-only --output <arquivo.json> e --local-database <base_sintetica> OU --allow-configured-database-read-only.');
let url;
if(localIndex>=0){const database=args[localIndex+1];if(!/^(oilsecurity|oilcorrection)_\d+$/.test(database))throw Error('Base sintética local inválida.');url=`postgresql://postgres:isolated_test_only@127.0.0.1:55479/${database}`;}
else{if(!args.includes('--allow-configured-database-read-only'))throw Error('Leitura do destino configurado exige autorização explícita.');require('dotenv').config({quiet:true});url=process.env.DIRECT_URL||process.env.DATABASE_URL;}
if(!url)throw Error('Conexão não configurada.');
const {PrismaClient}=require('@prisma/client'),prisma=new PrismaClient({datasources:{db:{url}},log:[]});
require('./lib/oil-signature-audit.cjs').auditOilSignatures(prisma).then(report=>{const file=path.resolve(args[outIndex+1]);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(report,null,2));console.log(JSON.stringify({somenteLeitura:true,quantidades:report.quantidades,registrosUnicos:report.registrosUnicos}));}).catch(()=>{console.error('Auditoria não concluída. Verifique acesso de leitura e compatibilidade do schema; detalhes de conexão foram omitidos.');process.exitCode=1;}).finally(()=>prisma.$disconnect());
