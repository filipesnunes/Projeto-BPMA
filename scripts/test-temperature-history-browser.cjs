// Real Next server + headless Edge against the isolated compatibility fixtures.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.data/validation/temperature-history');
const fixtures=JSON.parse(fs.readFileSync(path.join(dir,'fixtures.json'),'utf8'));const database=fixtures.database;assert(/^temperaturehistory_[0-9]+$/.test(database));
const url=`postgresql://postgres:isolated_test_only@127.0.0.1:55479/${database}`;
process.env.DATABASE_URL=url;process.env.DIRECT_URL=url;
const {PrismaClient}=require('@prisma/client'),prisma=new PrismaClient({datasources:{db:{url}}});
const log=fs.openSync(path.join(dir,'next-browser.log'),'w');
const server=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','-p','3122'],{cwd:root,env:{...process.env,DATABASE_URL:url,DIRECT_URL:url},stdio:['ignore',log,log],windowsHide:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let browser,socket;
(async()=>{
 for(let i=0;i<120;i++){try{if((await fetch('http://localhost:3122/login')).ok)break;}catch{}await pause(250);if(i===119)throw Error('Server start timeout');}
 const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
 browser=spawn(edge,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9245',`--user-data-dir=${path.join(dir,'browser-'+Date.now())}`,'about:blank'],{stdio:'ignore',windowsHide:true});
 let targets;for(let i=0;i<80;i++){try{targets=await(await fetch('http://localhost:9245/json')).json();if(targets.some(t=>t.type==='page'))break;}catch{}await pause(250);}
 socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
 let id=0;const pending=new Map();socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});
 const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async(expression)=>{for(let i=0;i<120;i++){if(await evaluate(expression))return;await pause(150);}throw Error('Browser assertion timeout: '+expression+' '+await evaluate('document.body.innerText.slice(-1800)'));};
 const navigate=async(route)=>{await send('Page.navigate',{url:'http://localhost:3122'+route});await wait(`document.readyState==='complete' && location.pathname===${JSON.stringify(route.split('?')[0])}`);};
 const clickText=async(text)=>{assert(await evaluate(`(()=>{const b=[...document.querySelectorAll('button,a')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled);if(!b)return false;b.click();return true})()`),'Clickable '+text);};
 const fill=async(name,value)=>evaluate(`(()=>{const e=document.querySelector('[name=${JSON.stringify(name)}]');Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const base='/controle-temperatura-equipamentos/historico',month=Number(fixtures.day.slice(5,7)),year=fixtures.year;
 await send('Page.enable');await navigate('/login?next='+base);await fill('nomeUsuario',fixtures.username);await fill('senha','history-password');await clickText('Entrar');await wait(`location.pathname===${JSON.stringify(base)}&&document.body.innerText.includes('Dias no Histórico')`);
 const dates=()=>evaluate(`[...document.querySelectorAll('table:first-of-type tbody tr')].map(r=>r.querySelector('td')?.textContent.trim()).filter(Boolean)`);
 const initial=await dates();assert(initial.length<=15);assert(initial.every(d=>d.endsWith('/'+String(month).padStart(2,'0')+'/'+year)));assert.equal(Number(await evaluate(`document.querySelector('[name=filtroMes]').value`)),month);assert.equal(await evaluate(`!!document.querySelector('img[alt^="Foto do registro"]')`),false);
 await clickText('Próxima página');await wait(`location.search.includes('pagina=2')`);const second=await dates();assert(!second.some(d=>initial.includes(d)));
 await clickText('Limpar');await wait(`location.search===''`);assert.deepEqual(await dates(),initial);
 await fill('filtroMes','9');await fill('filtroAno',String(year));await clickText('Aplicar Filtros');await wait(`location.search.includes('filtroMes=9')`);assert((await dates()).every(d=>d.endsWith('/09/'+year)));
 await fill('filtroData',fixtures.day);await clickText('Aplicar Filtros');await wait(`location.search.includes(${JSON.stringify('filtroData='+fixtures.day)})`);const exact=await dates();assert.equal(exact.length,1);assert(exact[0].startsWith(fixtures.day.slice(8,10)+'/'));
 await clickText('Limpar');await wait(`location.search===''`);await fill('filtroEquipamento',fixtures.equipment);await clickText('Aplicar Filtros');await wait(`location.search.includes('filtroEquipamento=')`);assert((await evaluate('document.body.innerText')).includes('registros encontrados'));
 await clickText('Limpar');await wait(`location.search===''`);await clickText('Abrir');await wait(`location.search.includes('dia=')`);assert((await evaluate('document.body.innerText')).includes('Consultar / Editar'));assert.equal(await evaluate(`!!document.querySelector('img[alt^="Foto do registro"]')`),false);
 const photoLink=await evaluate(`document.querySelector('a[href*="fotoId="]')?.getAttribute('href')`);assert(photoLink);await evaluate(`document.querySelector('a[href*="fotoId="]').click()`);await wait(`!!document.querySelector('img[alt^="Foto do registro"]')`);await wait(`document.querySelector('img[alt^="Foto do registro"]').naturalWidth>0`);
 await navigate(base+'?filtroData='+fixtures.burstDate+'&dia='+fixtures.burstDate);await wait(`document.body.innerText.includes('Mais aferições')`);await clickText('Mais aferições');await wait(`location.search.includes('detalhePagina=2')`);assert((await evaluate('document.body.innerText')).includes('Página 2 de 2'));
 for(const width of [1440,390,320]){await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});await navigate(base);await wait(`document.body.innerText.includes('Dias no Histórico')`);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'));const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(dir,'history-'+width+'.png'),Buffer.from(shot.data,'base64'));}
 const httpTimes=[];for(const suffix of ['', '?filtroMes=9&filtroAno='+year,'?dia='+fixtures.day,'?filtroEquipamento='+encodeURIComponent(fixtures.equipment)]){const start=performance.now();await navigate(base+suffix);await wait(`document.body.innerText.includes('Dias no Histórico')`);httpTimes.push({query:suffix,totalBrowserNavigationMs:performance.now()-start,timing:await evaluate(`(()=>{const e=performance.getEntriesByType('navigation')[0];return{ttfb:e.responseStart,domContentLoaded:e.domContentLoadedEventEnd}})()`)});}fs.writeFileSync(path.join(dir,'browser-times.json'),JSON.stringify(httpTimes,null,2));
 await send('Browser.close');console.log('PASS browser Temperature History: current month by default, September/date/equipment filters, clear, distinct server-paged days, day details without eager images, real photo decoded, detail pagination, desktop/mobile.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{socket?.close();browser?.kill();server.kill();await prisma.$disconnect();});

