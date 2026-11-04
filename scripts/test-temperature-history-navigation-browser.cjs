// Real Next server + headless Edge against the isolated compatibility fixtures.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.data/validation/temperature-history-navigation');
const fixtures=JSON.parse(fs.readFileSync(path.join(dir,'fixtures.json'),'utf8'));const database=fixtures.database;assert(/^temperature_nav_[0-9]+$/.test(database));
const url=`postgresql://postgres:isolated_test_only@127.0.0.1:55479/${database}`;
process.env.DATABASE_URL=url;process.env.DIRECT_URL=url;
const {PrismaClient}=require('@prisma/client'),prisma=new PrismaClient({datasources:{db:{url}}});
const log=fs.openSync(path.join(dir,'next-browser.log'),'w');
const server=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','-p','3124'],{cwd:root,env:{...process.env,DATABASE_URL:url,DIRECT_URL:url},stdio:['ignore',log,log],windowsHide:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let browser,socket;
(async()=>{
 for(let i=0;i<120;i++){try{if((await fetch('http://localhost:3124/login')).ok)break;}catch{}await pause(250);if(i===119)throw Error('Server start timeout');}
 const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
 browser=spawn(edge,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9247',`--user-data-dir=${path.join(dir,'browser-'+Date.now())}`,'about:blank'],{stdio:'ignore',windowsHide:true});
 let targets;for(let i=0;i<80;i++){try{targets=await(await fetch('http://localhost:9247/json')).json();if(targets.some(t=>t.type==='page'))break;}catch{}await pause(250);}
 socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
 let id=0;const pending=new Map();socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});
 const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async(expression)=>{for(let i=0;i<120;i++){if(await evaluate(expression))return;await pause(150);}throw Error('Browser assertion timeout: '+expression+' '+await evaluate('document.body.innerText.slice(-1800)'));};
 const navigate=async(route)=>{await send('Page.navigate',{url:'http://localhost:3124'+route});await wait(`document.readyState==='complete' && location.pathname===${JSON.stringify(route.split('?')[0])}`);};
 const clickText=async(text)=>{assert(await evaluate(`(()=>{const b=[...document.querySelectorAll('button,a')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled);if(!b)return false;b.click();return true})()`),'Clickable '+text);};
 const fill=async(name,value)=>evaluate(`(()=>{const e=document.querySelector('[name=${JSON.stringify(name)}]');Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const base='/controle-temperatura-equipamentos',history=base+'/historico',query=new URLSearchParams(fixtures.filters),context=history+'?'+query;
 await send('Page.enable');await navigate('/login?next='+history);await fill('nomeUsuario',fixtures.username);await fill('senha','navigation-password');await clickText('Entrar');await wait(`location.pathname===${JSON.stringify(history)}&&document.body.innerText.includes('Dias no Histórico')`);
 await navigate(context);await wait("document.body.innerText.includes('Página 2 de 2')");
 const clickDay=async(day)=>{const href=await evaluate(`[...document.querySelectorAll('a')].find(a=>{const u=new URL(a.href);return u.pathname===${JSON.stringify(history)}&&u.searchParams.get('dia')===${JSON.stringify(day)}})?.getAttribute('href')`);assert(href);await navigate(href);await wait("!!document.querySelector('[role=dialog]')");};
 await clickDay(fixtures.firstDay);
 const openRecord=async(id)=>{const href=await evaluate(`[...document.querySelectorAll('[role=dialog] a')].find(a=>new URL(a.href).pathname===${JSON.stringify(base+'/registro/')}+${id})?.getAttribute('href')`);assert(href,'record link');const back=new URL(new URL(href,'http://localhost').searchParams.get('returnTo'),'http://localhost');assert.equal(back.searchParams.get('pagina'),'2');await navigate(href);await wait("!!document.querySelector('[name=temperaturaAferida]')");};
 const count=await prisma.controleTemperaturaEquipamento.count(),signatures=JSON.stringify(await prisma.fluxoAssinatura.findMany({orderBy:{id:'asc'}}));
 await openRecord(fixtures.firstId);
 const recordLocation=await evaluate('location.pathname+location.search');
 await fill('temperaturaAferida','inválida');await fill('observacaoStatusOperacional','Observação que deve permanecer após erro');await clickText('Salvar Alterações');await wait("!!document.querySelector('[role=alert]')");assert.equal(await evaluate('location.pathname+location.search'),recordLocation);assert.equal(await evaluate("document.querySelector('[name=temperaturaAferida]').value"),'inválida');assert.equal(await evaluate("document.querySelector('[name=observacaoStatusOperacional]').value"),'Observação que deve permanecer após erro');assert.equal(Number((await prisma.controleTemperaturaEquipamento.findUniqueOrThrow({where:{id:fixtures.firstId}})).temperaturaAferida),2);
 await fill('temperaturaAferida','1');await clickText('Salvar Alterações');await wait(`location.pathname===${JSON.stringify(history)}&&location.search.includes('feedbackType=success')&&!!document.querySelector('[role=dialog]')`);
 const afterUrl=new URL(await evaluate('location.href'));for(const[k,v]of query)assert.equal(afterUrl.searchParams.get(k),v,k);assert.equal(afterUrl.searchParams.get('dia'),fixtures.firstDay);assert((await evaluate('document.body.innerText')).includes('Alterações salvas com sucesso.'));assert((await evaluate("document.querySelector('[role=dialog]').innerText")).includes('1 °C'));
 await navigate(await evaluate('location.pathname+location.search'));await wait("!!document.querySelector('[role=dialog]')");
 await clickText('Fechar');await wait("!document.querySelector('[role=dialog]')");const closed=new URL(await evaluate('location.href'));for(const[k,v]of query)assert.equal(closed.searchParams.get(k),v,k);assert(!closed.searchParams.has('dia'));
 // A second correction on the same day starts from the returned modal.
 await clickDay(fixtures.firstDay);await openRecord(fixtures.firstId+1);await fill('temperaturaAferida','2');await clickText('Salvar Alterações');await wait(`location.pathname===${JSON.stringify(history)}&&!!document.querySelector('[role=dialog]')`);assert.equal(new URL(await evaluate('location.href')).searchParams.get('pagina'),'2');
 for(const [id,day]of [[fixtures.currentId,fixtures.day],[fixtures.yesterdayId,new Date(Date.parse(fixtures.day+'T00:00:00Z')-86400000).toISOString().slice(0,10)]]){
   const q=new URLSearchParams({...fixtures.filters,pagina:'1',dia:day});await navigate(history+'?'+q);await wait("!!document.querySelector('[role=dialog]')");
   const href=await evaluate(`[...document.querySelectorAll('[role=dialog] a')].find(a=>new URL(a.href).pathname===${JSON.stringify(base+'/registro/')}+${id})?.getAttribute('href')`);assert(href);await navigate(href);await fill('temperaturaAferida','2');await clickText('Salvar Alterações');await wait(`location.pathname===${JSON.stringify(history)}&&location.search.includes('feedbackType=success')&&!!document.querySelector('[role=dialog]')`);assert.equal(new URL(await evaluate('location.href')).searchParams.get('dia'),day);
 }
 // Preserve page 2 of the daily measurements, as well as page 2 of the days.
 const more=[];for(let n=0;n<102;n++)more.push({data:new Date(fixtures.firstDay+'T00:00:00Z'),equipamento:fixtures.equipment+' Extra '+String(n).padStart(3,'0'),categoriaEquipamento:'REFRIGERACAO',turno:'MANHA',temperaturaAferida:3,status:'CONFORME',responsavel:'Operador navegação',horarioAfericao:'07:12'});
 await prisma.controleTemperaturaEquipamentoOpcao.createMany({data:more.map(r=>({tipo:'EQUIPAMENTO',nome:r.equipamento,categoriaEquipamento:'REFRIGERACAO'}))});await prisma.controleTemperaturaEquipamento.createMany({data:more});
 await navigate(context+'&dia='+fixtures.firstDay+'&detalhePagina=2');await wait("!!document.querySelector('[role=dialog]')");const detailHref=await evaluate("[...document.querySelectorAll('[role=dialog] a')].find(a=>a.textContent.trim()==='Consultar / Editar').getAttribute('href')");await navigate(detailHref);await fill('temperaturaAferida','2');await clickText('Salvar Alterações');await wait(`location.pathname===${JSON.stringify(history)}&&location.search.includes('feedbackType=success')&&!!document.querySelector('[role=dialog]')`);assert.equal(new URL(await evaluate('location.href')).searchParams.get('detalhePagina'),'2');
 for(const width of [1440,390]){await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});await navigate(context+'&dia='+fixtures.firstDay);await wait("!!document.querySelector('[role=dialog]')");assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'));fs.writeFileSync(path.join(dir,'navigation-'+width+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));}
 assert.equal(await prisma.controleTemperaturaEquipamento.count(),count+102);assert.equal(JSON.stringify(await prisma.fluxoAssinatura.findMany({orderBy:{id:'asc'}})),signatures);
 await send('Browser.close');console.log('PASS browser History edit navigation: actual login/save, page2+filters+day restored, close/reload, updated values and confirmed success, inline validation retains fields, multiple edits, today/yesterday/reopened/versioned/legacy, detail page2, unchanged signatures and no duplicate records, desktop/mobile.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{socket?.close();browser?.kill();server.kill();await prisma.$disconnect();});
