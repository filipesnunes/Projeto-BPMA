// Explicit READ ONLY domain snapshot. Not a substitute for a recoverable backup.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const args=process.argv.slice(2),out=args[args.indexOf('--output')+1];
if(!args.includes('--read-only')||!args.includes('--allow-configured-database-read-only')||args.indexOf('--output')<0||!out)throw Error('Use --read-only --allow-configured-database-read-only --output <arquivo>.');
require('dotenv').config({quiet:true});const connection=process.env.DIRECT_URL||process.env.DATABASE_URL;if(!connection)throw Error('Conexão não configurada.');
const parsed=new URL(connection),identity=createHash('sha256').update(JSON.stringify([parsed.hostname,parsed.port,parsed.pathname])).digest('hex');
const {PrismaClient}=require('@prisma/client'),db=new PrismaClient({datasources:{db:{url:connection}},log:[]});
const models=['controleQualidadeOleoRegistro','fluxoOperacional','fluxoVersao','fluxoAssinatura','fluxoAssinaturaVinculo','fluxoEvento','logAssinatura','assinaturaDiariaModulo','fechamentoMensalModulo','controleQualidadeOleoFechamento','controleBuffetAmostraRegistro','controleBuffetAmostraServico','controleBuffetAmostraItem','controleBuffetAmostraItemServico','controleBuffetAmostraAcaoCorretiva','controleBuffetAmostraFechamento'];
db.$transaction(async tx=>{
 await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
 const data={};for(const model of models){const operational=['fluxoOperacional','fluxoAssinatura','logAssinatura'].includes(model)?{modulo:{in:['oleo','amostras']}}:['assinaturaDiariaModulo','fechamentoMensalModulo'].includes(model)?{moduloCodigo:{in:['oleo','amostras']}}:model==='fluxoVersao'||model==='fluxoEvento'?{fluxo:{modulo:{in:['oleo','amostras']}}}:model==='fluxoAssinaturaVinculo'?{assinatura:{modulo:{in:['oleo','amostras']}}}:{};data[model]=await tx[model].findMany({where:operational});}
 data.usuario=await tx.usuario.findMany({select:{id:true,nomeCompleto:true,nomeUsuario:true,perfil:true,status:true}});
 const migrations=await tx.$queryRaw`SELECT migration_name,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY started_at`;
 return{somenteLeitura:true,capturadoEm:new Date().toISOString(),destinoFingerprint:identity,vinculoComRailwayConfirmado:false,tipo:'copia-consistente-dos-dominios-oleo-amostras-sem-credenciais',migrations,data};
},{isolationLevel:'RepeatableRead',timeout:120000}).then(snapshot=>{fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});fs.writeFileSync(out,JSON.stringify(snapshot,null,2));console.log(JSON.stringify({somenteLeitura:true,contagens:Object.fromEntries(Object.entries(snapshot.data).map(([k,v])=>[k,v.length]))}));}).catch(error=>{console.error(JSON.stringify({tipo:error.name,codigo:error.code??error.errorCode??null}));process.exitCode=1;}).finally(()=>db.$disconnect());
