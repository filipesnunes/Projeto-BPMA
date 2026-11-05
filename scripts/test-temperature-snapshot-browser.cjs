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
 const base='/controle-temperatura-equipamentos',history=date=>base+'/historico?filtroMes=11&filtroAno=2026&dia='+date;
 const login=async username=>{await send('Network.clearBrowserCookies');await navigate('/login?next='+base);await fill('nomeUsuario',username);await fill('senha',fixtures.password);await clickText('Entrar');await wait(`location.pathname===${JSON.stringify(base)}`);};
 const all=[...fixtures.consistent,...fixtures.affected,...fixtures.manual,fixtures.individual,fixtures.retro];
 const before=await prisma.controleTemperaturaEquipamento.findMany({where:{id:{in:all.map(u=>u.recordId)}},orderBy:{id:'asc'}});
 const versions=await prisma.fluxoVersao.findMany({where:{fluxoId:{in:all.map(u=>u.id)}},orderBy:{fluxoId:'asc'}});
 const select=async units=>evaluate(`document.querySelectorAll('[role=dialog] input[name=unidade]').forEach(c=>{c.checked=${JSON.stringify(units.map(u=>u.id+':'+u.version))}.includes(c.value)})`);
 await send('Page.enable');await login(fixtures.nutri);
 for(const date of ['2026-11-01','2026-11-02','2026-11-03']){
  const units=[...fixtures.consistent,...fixtures.affected,...fixtures.manual].filter(u=>u.date===date);
  await send('Emulation.setDeviceMetricsOverride',{width:date==='2026-11-02'?390:1440,height:1100,deviceScaleFactor:1,mobile:date==='2026-11-02'});
  await navigate(history(date));await wait("!!document.querySelector('[role=dialog] input[name=senha]')");await select(units);
  if(date==='2026-11-01'){await fill('senha','wrong');await clickText('Assinar dia');await wait("document.body.innerText.includes('Senha inválida')");for(const u of units)assert.equal((await prisma.fluxoOperacional.findUniqueOrThrow({where:{id:u.id}})).assinaturaVigenteId,null);await navigate(history(date));await wait("!!document.querySelector('[role=dialog] input[name=senha]')");await select(units);}
  if(date==='2026-11-02'){
   assert.equal(await evaluate("document.querySelectorAll('[name=confirmarIdentidadeEquipamento]').length"),1);await fill('senha',fixtures.password);await clickText('Assinar dia');await wait("document.body.innerText.includes('confirmar a identificação do equipamento')");for(const u of units)assert.equal((await prisma.fluxoOperacional.findUniqueOrThrow({where:{id:u.id}})).assinaturaVigenteId,null);
   await navigate(history(date));await wait("!!document.querySelector('[name=confirmarIdentidadeEquipamento]')");await select(units);await evaluate("document.querySelector('[name=confirmarIdentidadeEquipamento]').scrollIntoView({block:'center'})");fs.writeFileSync(path.join(dir,'confirmacao-nomes-mobile.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));await evaluate("document.querySelector('[name=confirmarIdentidadeEquipamento]').click()");
  }
  await fill('senha',fixtures.password);await clickText('Assinar dia');await wait("document.body.innerText.includes('Validação registrada')");for(const u of units)assert((await prisma.fluxoOperacional.findUniqueOrThrow({where:{id:u.id}})).assinaturaVigenteId);
  await navigate(history(date));await wait("!!document.querySelector('[role=dialog]')");assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'));fs.writeFileSync(path.join(dir,'signed-'+date+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 }
 await navigate(base+'/fluxo?chave='+encodeURIComponent(fixtures.individual.key));await wait("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Assinar verificação')");await fill('senha',fixtures.password);await clickText('Assinar verificação');await wait("document.body.innerText.includes('Validação registrada')");
 const retro='/historico-operacional/revisao-retroativa?modulo=temperatura&data=2026-11-03&fluxo='+fixtures.retro.id;await navigate(retro);await wait("!!document.querySelector('[name=confirmarIdentidadeEquipamento]')");await fill('justificativa','Conferência da identidade física do equipamento sintético');await fill('senha',fixtures.password);await evaluate("document.querySelector('[name=confirmacao]').click();document.querySelector('[name=confirmarIdentidadeEquipamento]').click()");await clickText('Assinar retroativamente');await wait("document.body.innerText.includes('Revisão retroativa registrada') || !document.querySelector('[name=senha]') && document.body.innerText.includes('Revisão registrada por')");
 assert.deepEqual(await prisma.controleTemperaturaEquipamento.findMany({where:{id:{in:all.map(u=>u.recordId)}},orderBy:{id:'asc'}}),before);
 for(const saved of versions)assert.deepEqual(await prisma.fluxoVersao.findUniqueOrThrow({where:{fluxoId_versao:{fluxoId:saved.fluxoId,versao:saved.versao}}}),saved);
 for(const u of [...fixtures.affected,...fixtures.manual,fixtures.individual,fixtures.retro]){const unit=await prisma.fluxoOperacional.findUniqueOrThrow({where:{id:u.id},include:{eventos:true}});assert(unit.assinaturaVigenteId);assert.equal(unit.versao,u.version+1);assert(unit.eventos.some(e=>e.operacao==='RECONCILIACAO_NOMENCLATURA'));}
 await navigate('/relatorios/controle-temperatura-equipamentos/mensal?mes=11&ano=2026');
 const signer=await prisma.fluxoOperacional.findUniqueOrThrow({where:{id:fixtures.affected[0].id},include:{assinaturaVigente:true}}),label=signer.assinaturaVigente.usuarioNome+' — '+new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo'}).format(signer.assinaturaVigente.assinadoEm);
 assert(await evaluate(`[...document.querySelectorAll('td')].some(e=>e.textContent.trim()===${JSON.stringify(label)})`));
 fs.writeFileSync(path.join(dir,'temperatura-novembro-assinado.pdf'),Buffer.from((await send('Page.printToPDF',{printBackground:true,preferCSSPageSize:true})).data,'base64'));
 await login(fixtures.denied);await navigate(retro);assert(!await evaluate("!!document.querySelector('[name=senha]')"));
 fs.writeFileSync(path.join(dir,'browser-results.json'),JSON.stringify({passed:true,dates:['2026-11-01','2026-11-02','2026-11-03'],individual:true,daily:true,retroactive:true,automaticNomenclature:true,manualIdentityConfirmation:true,singleConfirmationForBothShifts:true,wrongPasswordRejected:true,operationalDataAndOldVersionsPreserved:true,browser:'Chrome real; viewport mobile emulado'},null,2));
 await send('Browser.close');console.log('PASS Chrome: 01/02/03 assinados, nomenclatura automática e confirmada, lote, individual e retroativa; dados e versões preservados.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{socket?.close();browser?.kill();server.kill();await prisma.$disconnect();});
