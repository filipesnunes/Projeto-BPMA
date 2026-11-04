// Real Next server + headless Edge against the isolated compatibility fixtures.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.data/validation/buffet-history');
const fixtures=JSON.parse(fs.readFileSync(path.join(dir,'fixtures.json'),'utf8'));const database=fixtures.database;assert(/^buffethistory_[0-9]+$/.test(database));
const url=`postgresql://postgres:isolated_test_only@127.0.0.1:55479/${database}`;
process.env.DATABASE_URL=url;process.env.DIRECT_URL=url;
const {PrismaClient}=require('@prisma/client'),prisma=new PrismaClient({datasources:{db:{url}}});
const log=fs.openSync(path.join(dir,'next-browser.log'),'w');
const server=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','-p','3121'],{cwd:root,env:{...process.env,DATABASE_URL:url,DIRECT_URL:url},stdio:['ignore',log,log],windowsHide:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let browser,socket;
(async()=>{
 for(let i=0;i<120;i++){try{if((await fetch('http://localhost:3121/login')).ok)break;}catch{}await pause(250);if(i===119)throw Error('Server start timeout');}
 const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
 browser=spawn(edge,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9244',`--user-data-dir=${path.join(dir,'browser-'+Date.now())}`,'about:blank'],{stdio:'ignore',windowsHide:true});
 let targets;for(let i=0;i<80;i++){try{targets=await(await fetch('http://localhost:9244/json')).json();if(targets.some(t=>t.type==='page'))break;}catch{}await pause(250);}
 socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
 let id=0;const pending=new Map();socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});
 const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async(expression)=>{for(let i=0;i<120;i++){if(await evaluate(expression))return;await pause(150);}throw Error('Browser assertion timeout: '+expression+' '+await evaluate('document.body.innerText.slice(-1800)'));};
 const navigate=async(route)=>{await send('Page.navigate',{url:'http://localhost:3121'+route});await wait(`document.readyState==='complete' && location.pathname===${JSON.stringify(route.split('?')[0])}`);};
 const clickText=async(text)=>{assert(await evaluate(`(()=>{const b=[...document.querySelectorAll('button,a')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled);if(!b)return false;b.click();return true})()`),'Clickable '+text);};
 const fill=async(name,value)=>evaluate(`(()=>{const e=document.querySelector('[name=${JSON.stringify(name)}]');Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const base='/controle-buffet-amostras',service=date=>base+'/servico/'+fixtures.serviceId+'?data='+date;
 const login=async(name)=>{await send('Network.clearBrowserCookies');await navigate('/login?next='+base);await fill('nomeUsuario',name);await fill('senha','buffet-history-password');await clickText('Entrar');await wait(`location.pathname==='${base}'&&document.body.innerText.includes('Serviços do Dia')`);};
 await send('Page.enable');await login(fixtures.username);
 assert(!(await evaluate('document.body.innerText')).includes('Continuar preenchimentos e revisões'));
 assert.equal(await evaluate(`[...document.querySelectorAll('tbody tr')].find(r=>r.textContent.includes(${JSON.stringify(fixtures.tag)}))?.querySelector('td')?.textContent.trim()`),fixtures.day.split('-').reverse().join('/'));
 assert((await evaluate(`[...document.querySelectorAll('tbody tr')].find(r=>r.textContent.includes(${JSON.stringify(fixtures.tag)}))?.textContent`)).includes('Completo'));
 await navigate(base+'/historico?filtroMes=10&filtroAno=2026&dia='+fixtures.draftDate);await wait(`document.body.innerText.includes(${JSON.stringify(fixtures.tag)})&&!!document.querySelector('a[href*="/servico/${fixtures.serviceId}?"]')`);
 let text=await evaluate('document.body.innerText');assert(text.includes('Parcial'));assert(text.includes('2 pendentes'));assert(text.includes('Pendente de assinatura'));assert(!text.includes('Validações e preenchimentos salvos'));
 await clickText('Abrir serviço');await wait(`location.pathname==='${base}/servico/${fixtures.serviceId}'&&!!document.querySelector('[name="item-${fixtures.itemIds[0]}-primeiraTc"]')`);
 assert.equal(await evaluate(`document.querySelector('[name="item-${fixtures.itemIds[0]}-primeiraTc"]').value`),'65');
 for(const id of fixtures.itemIds.slice(1)){await fill(`item-${id}-tcEquipamento`,'70');await fill(`item-${id}-primeiraTc`,'65');await fill(`item-${id}-horarioExecucao`,'07:30');}
 const original=await prisma.fluxoOperacional.findUniqueOrThrow({where:{modulo_chave:{modulo:'amostras',chave:fixtures.serviceId+':'+fixtures.draftDate}},include:{amostras:true}}),old=original.amostras.find(r=>r.itemId===fixtures.itemIds[0]);
 await clickText('Salvar Itens do Serviço');await wait(`document.body.innerText.includes('aguardando assinatura')`);
 const saved=await prisma.fluxoOperacional.findUniqueOrThrow({where:{id:original.id},include:{amostras:true}});assert.equal(saved.preenchimentoCompleto,true);assert.equal(saved.amostras.length,3);const {updatedAt:_oldUpdated,...originalValues}=old,{updatedAt:_newUpdated,...savedValues}=saved.amostras.find(r=>r.id===old.id);assert.deepEqual(savedValues,originalValues);
 await navigate(base+'/historico?filtroMes=10&filtroAno=2026&dia='+fixtures.draftDate);await wait(`document.body.innerText.includes('0 pendentes')`);assert((await evaluate('document.body.innerText')).includes('Completo'));
 await navigate(service(fixtures.completeDate));await wait(`document.body.innerText.includes('Registro assinado')`);assert(await evaluate(`document.querySelector('[name="item-${fixtures.itemIds[0]}-primeiraTc"]').disabled`));
 await login(fixtures.readonlyName);await navigate(service(fixtures.draftDate));await wait(`document.body.innerText.includes('Consulta disponível')`);assert(await evaluate(`document.querySelector('[name="item-${fixtures.itemIds[0]}-primeiraTc"]').disabled`));
 for(const width of [1440,390,320]){await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});await navigate(base);await wait(`document.body.innerText.includes('Serviços do Dia')`);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'));const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(dir,'home-'+width+'.png'),Buffer.from(shot.data,'base64'));}
 await send('Browser.close');console.log('PASS browser Buffet: real login, today-only home without redundant section, complete unsigned daily card, unified History, partial continuation/previous fields preserved in PostgreSQL, complete/signature independence, signed and read-only forms locked, desktop/mobile.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{socket?.close();browser?.kill();server.kill();await prisma.$disconnect();});

