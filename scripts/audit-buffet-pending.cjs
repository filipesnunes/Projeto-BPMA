// Explicit opt-in, fixed read-only transaction, never register app permissions.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const args=process.argv.slice(2),out=args.indexOf('--output'),local=args.indexOf('--local-database');
if(!args.includes('--read-only')||out<0||!args[out+1])throw Error('Use --read-only --output <arquivo.json> e --local-database <base_sintetica> OU --allow-configured-database-read-only.');
let url;if(local>=0){const name=args[local+1];if(!/^buffetpending_\d+$/.test(name))throw Error('Base local sintética inválida.');url=`postgresql://postgres:isolated_test_only@127.0.0.1:55479/${name}`;}else{if(!args.includes('--allow-configured-database-read-only'))throw Error('Leitura do destino configurado exige autorização explícita.');require('dotenv').config({quiet:true});url=process.env.DIRECT_URL||process.env.DATABASE_URL;}
if(!url)throw Error('Conexão não configurada.');process.env.DATABASE_URL=url;process.env.DIRECT_URL=url;
const root=path.resolve(__dirname,'..'),ts=require('typescript'),load=Module._load;
Module._load=function(n,p,m){if(n==='server-only')return{};if(n.startsWith('@/'))n=path.join(root,'src',n.slice(2));return load.call(this,n,p,m);};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
const {PrismaClient}=require('@prisma/client'),prisma=new PrismaClient({datasources:{db:{url}},log:[]});
require('../src/app/controle-buffet-amostras/pending-audit.ts').auditBuffetPending(prisma).then(report=>{const file=path.resolve(args[out+1]);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(report,null,2));console.log(JSON.stringify({somenteLeitura:true,quantidades:report.quantidades}));}).catch(()=>{console.error('Auditoria não concluída. Confira acesso de leitura e compatibilidade do schema; detalhes de conexão foram omitidos.');process.exitCode=1;}).finally(()=>prisma.$disconnect());
