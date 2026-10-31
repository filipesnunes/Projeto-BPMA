// Real Next server + headless Edge against the isolated compatibility fixtures.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.data/validation/oil-signature-security');
const fixtures=JSON.parse(fs.readFileSync(path.join(dir,'fixtures.json'),'utf8'));const database=fixtures.database;assert(/^oilsecurity_[0-9]+$/.test(database));
const url=`postgresql://postgres:isolated_test_only@127.0.0.1:55479/${database}`;
process.env.DATABASE_URL=url;process.env.DIRECT_URL=url;
const {PrismaClient}=require('@prisma/client'),prisma=new PrismaClient({datasources:{db:{url}}});
const log=fs.openSync(path.join(dir,'next-browser.log'),'w');
const server=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','-p','3125'],{cwd:root,env:{...process.env,DATABASE_URL:url,DIRECT_URL:url},stdio:['ignore',log,log],windowsHide:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let browser,socket;
(async()=>{
 for(let i=0;i<120;i++){try{if((await fetch('http://localhost:3125/login')).ok)break;}catch{}await pause(250);if(i===119)throw Error('Server start timeout');}
 const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
 browser=spawn(edge,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9248',`--user-data-dir=${path.join(dir,'browser-'+Date.now())}`,'about:blank'],{stdio:'ignore',windowsHide:true});
 let targets;for(let i=0;i<80;i++){try{targets=await(await fetch('http://localhost:9248/json')).json();if(targets.some(t=>t.type==='page'))break;}catch{}await pause(250);}
 socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
 let id=0;const pending=new Map();socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});
 const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async(expression)=>{for(let i=0;i<120;i++){if(await evaluate(expression))return;await pause(150);}throw Error('Browser assertion timeout: '+expression+' '+await evaluate('document.body.innerText.slice(-1800)'));};
 const navigate=async(route)=>{await send('Page.navigate',{url:'http://localhost:3125'+route});await wait(`document.readyState==='complete' && location.pathname===${JSON.stringify(route.split('?')[0])}`);};
 const clickText=async(text)=>{assert(await evaluate(`(()=>{const b=[...document.querySelectorAll('button,a')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled);if(!b)return false;b.click();return true})()`),'Clickable '+text);};
 const fill=async(name,value)=>evaluate(`(()=>{const e=document.querySelector('[name=${JSON.stringify(name)}]');Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const base='/controle-qualidade-oleo',record=base+'/registro/'+fixtures.recordId;
 const login=async name=>{await send('Network.clearBrowserCookies');await navigate('/login?next='+base);await fill('nomeUsuario',name);await fill('senha','security-password');await clickText('Entrar');await wait(`location.pathname===${JSON.stringify(base)}`);};
 const hasSign=()=>evaluate("[...document.querySelectorAll('button')].some(b=>/Assinar registro|Assinar dia|Assinar verificações/.test(b.textContent))");
 await send('Page.enable');await login(fixtures.operatorName);await navigate(record);assert.equal(await hasSign(),false);assert.equal(await evaluate("!!document.querySelector('[name=senha]')"),false);assert.equal(await evaluate("document.querySelector('[name=temperatura]').matches(':disabled')"),false);
 await fill('observacao','Colaborador continua autorizado a corrigir');await clickText('Salvar Alterações');await wait("location.search.includes('feedbackType=success')");
 const row=await prisma.controleQualidadeOleoRegistro.findUniqueOrThrow({where:{id:fixtures.recordId}});assert.equal(row.observacao,'Colaborador continua autorizado a corrigir');
 await navigate(base+'/historico?dia='+fixtures.day);assert.equal(await hasSign(),false);
 await login(fixtures.adminName);await navigate(record);assert.equal(await hasSign(),false);
 await login(fixtures.nutriName);await navigate(base+'/registro/'+fixtures.ownRecordId);assert.equal(await hasSign(),false);assert((await evaluate('document.body.innerText')).includes('Quem preencheu ou corrigiu'));
 await navigate(base+'/registro/'+fixtures.legacyId);assert.equal(await hasSign(),false);assert((await evaluate('document.body.innerText')).includes('Não é possível comprovar'));
 await navigate(record);assert.equal(await hasSign(),true);
 const fields=await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Assinar registro');return [...new FormData(b.form).entries()].map(([k,v])=>[k,String(v)])})()");assert(fields.some(([key])=>key.startsWith('$ACTION_')),'SSR action identity available for direct-call security test');
 await fill('senha','wrong');await clickText('Assinar registro');await wait("location.search.includes('feedbackType=error')");assert((await evaluate('document.body.innerText')).includes('Senha inválida'));
 await login(fixtures.operatorName);await navigate(record);const count=await prisma.fluxoAssinatura.count();
 const attempted=await evaluate(`(async()=>{const f=new FormData();for(const[k,v]of ${JSON.stringify(fields)})f.append(k,v);f.set('senha','security-password');const r=await fetch(${JSON.stringify(record)},{method:'POST',body:f});return {url:r.url,text:await r.text()};})()`);assert(new URL(attempted.url).searchParams.get('feedbackType')==='error'||attempted.text.includes('Sem habilitação'));assert.equal(await prisma.fluxoAssinatura.count(),count);
 await login(fixtures.nutriName);await navigate(record);await fill('senha','security-password');await clickText('Assinar registro');await wait("location.search.includes('feedbackType=success')");await navigate(record);assert((await evaluate('document.body.innerText')).includes('Registro assinado'));assert(await evaluate("document.querySelector('[name=temperatura]').matches(':disabled')"));
 const signed=await prisma.fluxoOperacional.findUniqueOrThrow({where:{id:fixtures.unitId},include:{assinaturaVigente:true}});assert.equal(signed.estado,'FECHADO');assert(signed.assinaturaVigente.usuarioNome.includes('nutri'));
 for(const width of [1440,390]){await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});await navigate(record);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'));fs.writeFileSync(path.join(dir,'signature-'+width+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));}
 await send('Browser.close');console.log('PASS oil security browser: collaborator edit preserved with no signature UI, DEV no inherited qualification, own/legacy records unavailable for supervision, wrong password rejected, direct forged collaborator POST denied, independent nutritionist signs and locks, actual signature identity, desktop/mobile.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{socket?.close();browser?.kill();server.kill();await prisma.$disconnect();});
