// Real Next server + headless Edge against the isolated compatibility fixtures.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.data/validation/supervision-signatures');
const fixtures=JSON.parse(fs.readFileSync(path.join(dir,'fixtures.json'),'utf8'));const database=fixtures.database;assert(/^supervisionsignatures_[0-9]+$/.test(database));
const url=`postgresql://postgres:isolated_test_only@127.0.0.1:55479/${database}`;
process.env.DATABASE_URL=url;process.env.DIRECT_URL=url;
const {PrismaClient}=require('@prisma/client'),prisma=new PrismaClient({datasources:{db:{url}}});
const log=fs.openSync(path.join(dir,'next-browser.log'),'w');
const server=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','-p','3128'],{cwd:root,env:{...process.env,DATABASE_URL:url,DIRECT_URL:url},stdio:['ignore',log,log],windowsHide:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let browser,socket;
(async()=>{
 for(let i=0;i<120;i++){try{if((await fetch('http://localhost:3128/login',{signal:AbortSignal.timeout(2500)})).ok)break;}catch{}await pause(250);if(i===119)throw Error('Server start timeout');}
 console.log('Local Next ready');
 const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
 browser=spawn(edge,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9251',`--user-data-dir=${path.join(dir,'browser-'+Date.now())}`,'about:blank'],{stdio:'ignore',windowsHide:true});
 let targets;for(let i=0;i<80;i++){try{targets=await(await fetch('http://localhost:9251/json',{signal:AbortSignal.timeout(2000)})).json();if(targets.some(t=>t.type==='page'))break;}catch{}await pause(250);}
 socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
 let id=0;const pending=new Map();socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});
 const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async(expression)=>{for(let i=0;i<120;i++){if(await evaluate(expression))return;await pause(150);}throw Error('Browser assertion timeout: '+expression+' '+await evaluate('document.body.innerText.slice(0,2400)'));};
 const navigate=async(route)=>{await send('Page.navigate',{url:'http://localhost:3128'+route});await wait(`document.readyState==='complete' && location.pathname===${JSON.stringify(route.split('?')[0])}`);};
 const clickText=async(text)=>{assert(await evaluate(`(()=>{const b=[...document.querySelectorAll('button,a')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled);if(!b)return false;b.click();return true})()`),'Clickable '+text);};
 const fill=async(name,value)=>evaluate(`(()=>{const e=document.querySelector('[name=${JSON.stringify(name)}]');Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const base='/controle-buffet-amostras',route=target=>base+'/servico/'+target.serviceId+'?data='+fixtures.browserDay;
 console.log('Local Edge ready');
 await send('Page.enable');await navigate('/login?next='+base);await fill('nomeUsuario',fixtures.username);await fill('senha',fixtures.password);await clickText('Entrar');await wait(`location.pathname===${JSON.stringify(base)}`);
 await navigate(route(fixtures.browserComplete));await wait("document.body.innerText.includes('Validação do Serviço')");
 const passwordCount=()=>evaluate("document.querySelectorAll('input[type=password]').length");
 assert.equal(await passwordCount(),1);assert.equal(await evaluate("document.querySelector('[name=mecanismo]').value"),'SERVICO');
 assert(!(await evaluate('document.body.innerText')).includes('Validação diária — somente esta unidade'));
 for(const width of [1440,390]){await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});await navigate(route(fixtures.browserComplete));assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'));assert.equal(await passwordCount(),1);fs.writeFileSync(path.join(dir,'service-'+width+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));}
 await fill('senha','wrong');await clickText('Assinar serviço');await wait("document.querySelector('[role=status]')?.textContent.includes('Senha inválida')");assert.equal((await prisma.fluxoOperacional.findUniqueOrThrow({where:{id:fixtures.browserComplete.flowId}})).assinaturaVigenteId,null);
 await fill('senha',fixtures.password);await clickText('Assinar serviço');await wait("document.body.innerText.includes('Registro assinado')");assert.equal(await passwordCount(),0);
 let flow=await prisma.fluxoOperacional.findUniqueOrThrow({where:{id:fixtures.browserComplete.flowId},include:{amostras:true}});assert.equal(flow.estado,'FECHADO');assert(flow.amostras.every(r=>r.status==='PREENCHIDO'&&!r.assinaturaUsuarioId));const previous=flow.assinaturaVigenteId;
 await clickText('Reabrir Serviço / Editar');await wait("!!document.querySelector('[role=dialog]')");await fill('justificativa','Revisão autorizada sintética no navegador');await clickText('Confirmar reabertura');await wait("document.body.innerText.includes('Revisão pendente — nova assinatura necessária')");assert.equal(await passwordCount(),1);assert(await prisma.fluxoAssinatura.findUnique({where:{id:previous}}));
 await fill('senha',fixtures.password);await clickText('Assinar serviço');await wait("document.body.innerText.includes('Registro assinado')");flow=await prisma.fluxoOperacional.findUniqueOrThrow({where:{id:fixtures.browserComplete.flowId}});assert.notEqual(flow.assinaturaVigenteId,previous);assert.equal(await prisma.fluxoAssinaturaVinculo.count({where:{fluxoId:flow.id}}),2);
 await navigate(route(fixtures.browserPartial));await wait("document.body.innerText.includes('Preenchimento em andamento')");assert.equal(await passwordCount(),0);assert((await evaluate('document.body.innerText')).includes('pendente(s)'));
 await navigate(route(fixtures.browserOwn));await wait("document.body.innerText.includes('Validação do Serviço')");assert.equal(await passwordCount(),0);assert((await evaluate('document.body.innerText')).includes('Quem preencheu ou corrigiu'));
 await navigate(base+'/historico?filtroData='+fixtures.browserDay);await wait("document.body.innerText.includes('Histórico')");assert((await evaluate('document.body.innerText')).includes(fixtures.browserComplete.name));
 await navigate('/rastreabilidade-recebimento/nota/'+fixtures.browserNoteId);await wait("document.body.innerText.includes('Revisão deste recebimento')");assert.equal(await passwordCount(),1);assert((await evaluate('document.body.innerText')).includes('somente esta nota, seus itens e a versão indicada'));
 await navigate('/relatorios/controle-buffet-amostras/mensal?mes='+fixtures.browserDay.slice(5,7)+'&ano='+fixtures.browserDay.slice(0,4));await wait("document.body.innerText.includes('Imprimir')");await evaluate("window.__printCount=0;window.print=()=>{window.__printCount++};[...document.querySelectorAll('button')].find(e=>e.textContent.includes('Imprimir')).click()");await wait('window.__printCount===1');
 await send('Network.clearBrowserCookies');await navigate('/login?next='+base);await fill('nomeUsuario',fixtures.operatorUsername);await fill('senha',fixtures.password);await clickText('Entrar');await wait(`location.pathname===${JSON.stringify(base)}`);await navigate(route(fixtures.browserOperator));await wait("document.body.innerText.includes('Validação do Serviço')");assert.equal(await passwordCount(),0);assert((await evaluate('document.body.innerText')).includes('Aguardando validação do responsável autorizado'));
 await send('Browser.close');console.log('PASS supervision browser: actual login, canonical single service form desktop/mobile, wrong/correct password, exact scope, saved items unchanged, signed state, reopen and second version, partial and own-service denial, history navigation, receiving note scope, print button, collaborator without signature controls.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{socket?.close();browser?.kill();server.kill();await prisma.$disconnect();});
