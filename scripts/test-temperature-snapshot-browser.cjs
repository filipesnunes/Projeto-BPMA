// Real Next server + headless Chrome against the isolated compatibility fixtures.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.data/validation/temperature-signatures-20261105');
const fixtures=JSON.parse(fs.readFileSync(path.join(dir,'fixtures.json'),'utf8'));const database=fixtures.database;assert(/^tempsnapshot_[0-9]+$/.test(database));
const url=`postgresql://postgres:isolated_test_only@127.0.0.1:55479/${database}`;
process.env.DATABASE_URL=url;process.env.DIRECT_URL=url;
const {PrismaClient}=require('@prisma/client'),prisma=new PrismaClient({datasources:{db:{url}}});
const log=fs.openSync(path.join(dir,'next-browser.log'),'w');
const server=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','-p','3144'],{cwd:root,env:{...process.env,DATABASE_URL:url,DIRECT_URL:url},stdio:['ignore',log,log],windowsHide:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let browser,socket;
(async()=>{
 for(let i=0;i<120;i++){try{if((await fetch('http://localhost:3144/login',{signal:AbortSignal.timeout(2500)})).ok)break;}catch{}await pause(250);if(i===119)throw Error('Server start timeout');}
 console.log('Local Next ready');
 const edge='C:/Program Files/Google/Chrome/Application/chrome.exe';
 browser=spawn(edge,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9268',`--user-data-dir=${path.join(dir,'browser-'+Date.now())}`,'about:blank'],{stdio:'ignore',windowsHide:true});
 let targets;for(let i=0;i<80;i++){try{targets=await(await fetch('http://localhost:9268/json',{signal:AbortSignal.timeout(2000)})).json();if(targets.some(t=>t.type==='page'))break;}catch{}await pause(250);}
 socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
 let id=0;const pending=new Map();socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});
 const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async(expression)=>{for(let i=0;i<120;i++){if(await evaluate(expression))return;await pause(150);}throw Error('Browser assertion timeout: '+expression+' '+await evaluate(`JSON.stringify({alerts:[...document.querySelectorAll('[role=alert],[role=status]')].map(e=>e.textContent),fields:[...document.querySelectorAll('form input,form textarea')].map(e=>({name:e.name,valid:e.validity.valid,checked:e.type==='checkbox'?e.checked:undefined,hasValue:!!e.value})),tail:document.body.innerText.slice(-1800)})`));};
 const navigate=async(route)=>{await evaluate('window.__previousDocument=true');await send('Page.navigate',{url:'http://localhost:3144'+route});await wait(`!window.__previousDocument && document.readyState==='complete' && location.pathname===${JSON.stringify(route.split('?')[0])}`);};
 const clickText=async(text)=>{assert(await evaluate(`(()=>{const b=[...document.querySelectorAll('button,a')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled);if(!b)return false;b.click();return true})()`),'Clickable '+text);};
 const fill=async(name,value)=>evaluate(`(()=>{const e=document.querySelector('[role=dialog] [name=${JSON.stringify(name)}]')||document.querySelector('[name=${JSON.stringify(name)}]');Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const base='/controle-temperatura-equipamentos';
 const history=date=>base+'/historico?filtroMes=11&filtroAno=2026&dia='+date;
 const login=async username=>{await send('Network.clearBrowserCookies');await navigate('/login?next='+base);await fill('nomeUsuario',username);await fill('senha',fixtures.password);await clickText('Entrar');await wait(`location.pathname===${JSON.stringify(base)}`);};
 await send('Page.enable');await login(fixtures.nutri);
 const original=await prisma.controleTemperaturaEquipamento.findMany({where:{id:{in:fixtures.consistent.map(u=>u.recordId)}},orderBy:{id:'asc'}});
 const versions=await prisma.fluxoVersao.findMany({where:{fluxoId:{in:fixtures.consistent.map(u=>u.id)}},orderBy:{fluxoId:'asc'}});
 await navigate(history('2026-11-01'));await wait("!!document.querySelector('[role=dialog] input[name=senha]')");await fill('senha',fixtures.password);await clickText('Assinar dia');
 await wait(`document.body.innerText.includes(${JSON.stringify('#'+fixtures.affected[0].recordId)}) && document.body.innerText.includes('equipamento') && document.body.innerText.includes('reconciliação')`);
 for(const u of fixtures.consistent.filter(u=>u.date==='2026-11-01'))assert.equal((await prisma.fluxoOperacional.findUniqueOrThrow({where:{id:u.id}})).assinaturaVigenteId,null);
 fs.writeFileSync(path.join(dir,'collective-error.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 for(const date of ['2026-11-01','2026-11-02','2026-11-03']){
  const units=fixtures.consistent.filter(u=>u.date===date);
  await send('Emulation.setDeviceMetricsOverride',{width:date==='2026-11-02'?390:1440,height:1100,deviceScaleFactor:1,mobile:date==='2026-11-02'});
  if(date==='2026-11-01')for(const u of units){await navigate(base+'/fluxo?chave='+encodeURIComponent(u.key));await wait("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Assinar verificação')");await fill('senha',fixtures.password);await clickText('Assinar verificação');await wait("document.body.innerText.includes('Validação registrada')");}
  else {
   await navigate(history(date));await wait("!!document.querySelector('[role=dialog] input[name=senha]')");
   const allowed=units.map(u=>u.id+':'+u.version);await evaluate(`document.querySelectorAll('[role=dialog] input[name=unidade]').forEach(c=>{c.checked=${JSON.stringify(allowed)}.includes(c.value)})`);
   if(date==='2026-11-02'){await fill('senha','wrong');await clickText('Assinar dia');await wait("document.body.innerText.includes('Senha inválida')");await navigate(history(date));await wait("!!document.querySelector('[role=dialog] input[name=senha]')");await evaluate(`document.querySelectorAll('[role=dialog] input[name=unidade]').forEach(c=>{c.checked=${JSON.stringify(allowed)}.includes(c.value)})`);}
   await fill('senha',fixtures.password);await clickText('Assinar dia');await wait("document.body.innerText.includes('Validação registrada')");
  }
  for(const u of units)assert((await prisma.fluxoOperacional.findUniqueOrThrow({where:{id:u.id}})).assinaturaVigenteId);
  await navigate(history(date));await wait("!!document.querySelector('[role=dialog]')");assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'));fs.writeFileSync(path.join(dir,'signed-'+date+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 }
 assert.deepEqual(await prisma.controleTemperaturaEquipamento.findMany({where:{id:{in:fixtures.consistent.map(u=>u.recordId)}},orderBy:{id:'asc'}}),original);
 assert.deepEqual(await prisma.fluxoVersao.findMany({where:{fluxoId:{in:fixtures.consistent.map(u=>u.id)}},orderBy:{fluxoId:'asc'}}),versions);
 const retro='/historico-operacional/revisao-retroativa?modulo=temperatura&data=2026-11-03&fluxo='+fixtures.retro.id;await navigate(retro);await wait("!!document.querySelector('[name=senha]')");await fill('justificativa','Conferência técnica sintética de novembro');await fill('senha',fixtures.password);await evaluate("document.querySelector('[name=confirmacao]').click()");await clickText('Assinar retroativamente');await wait("document.body.innerText.includes('Revisão retroativa registrada') || !document.querySelector('[name=senha]') && document.body.innerText.includes('Revisão registrada por')");
 assert((await prisma.fluxoOperacional.findUniqueOrThrow({where:{id:fixtures.retro.id}})).assinaturaVigenteId);
 for(const u of fixtures.affected)assert.equal((await prisma.fluxoOperacional.findUniqueOrThrow({where:{id:u.id}})).assinaturaVigenteId,null);
 await login(fixtures.denied);await navigate('/historico-operacional/revisao-retroativa?modulo=temperatura&data='+fixtures.affected[0].date+'&fluxo='+fixtures.affected[0].id);await wait("document.body.innerText.includes('assinar_retroativo')");assert(!await evaluate("!!document.querySelector('[name=senha]')"));
 fs.writeFileSync(path.join(dir,'browser-results.json'),JSON.stringify({passed:true,dates:['2026-11-01','2026-11-02','2026-11-03'],individual:true,daily:true,retroactive:true,collectiveIdentifiesOffendingRecord:true,wrongPasswordRejected:true,permissionRequired:true,operationalDataAndVersionsPreserved:true,realDivergencesRemainBlocked:true,browser:'Chrome real; viewport mobile emulado'},null,2));
 await send('Browser.close');console.log('PASS Chrome Temperatura: datas 01/02/03, manhã/tarde, individual/diária/retroativa, erro coletivo identificado e integridade preservada.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{socket?.close();browser?.kill();server.kill();await prisma.$disconnect();});
