// Real Next server + headless Edge against the isolated compatibility fixtures.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.data/validation/buffet-structural');
const fixtures=JSON.parse(fs.readFileSync(path.join(dir,'fixtures.json'),'utf8'));const database=fixtures.database;assert(/^buffetstructure_[0-9]+$/.test(database));
const url=`postgresql://postgres:isolated_test_only@127.0.0.1:55479/${database}`;
process.env.DATABASE_URL=url;process.env.DIRECT_URL=url;
const {PrismaClient}=require('@prisma/client'),prisma=new PrismaClient({datasources:{db:{url}}});
const log=fs.openSync(path.join(dir,'next-browser.log'),'w');
const server=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','-p','3132'],{cwd:root,env:{...process.env,DATABASE_URL:url,DIRECT_URL:url},stdio:['ignore',log,log],windowsHide:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let browser,socket;
(async()=>{
 for(let i=0;i<120;i++){try{if((await fetch('http://localhost:3132/login',{signal:AbortSignal.timeout(2500)})).ok)break;}catch{}await pause(250);if(i===119)throw Error('Server start timeout');}
 console.log('Local Next ready');
 const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
 browser=spawn(edge,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9256',`--user-data-dir=${path.join(dir,'browser-'+Date.now())}`,'about:blank'],{stdio:'ignore',windowsHide:true});
 let targets;for(let i=0;i<80;i++){try{targets=await(await fetch('http://localhost:9256/json',{signal:AbortSignal.timeout(2000)})).json();if(targets.some(t=>t.type==='page'))break;}catch{}await pause(250);}
 socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
 let id=0;const pending=new Map();socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});
 const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async(expression)=>{for(let i=0;i<120;i++){if(await evaluate(expression))return;await pause(150);}throw Error('Browser assertion timeout: '+expression+' '+await evaluate('document.body.innerText.slice(0,2400)'));};
 const navigate=async(route)=>{await send('Page.navigate',{url:'http://localhost:3132'+route});await wait(`document.readyState==='complete' && location.pathname===${JSON.stringify(route.split('?')[0])}`);};
 const clickText=async(text)=>{assert(await evaluate(`(()=>{const b=[...document.querySelectorAll('button,a')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled);if(!b)return false;b.click();return true})()`),'Clickable '+text);};
 const fill=async(name,value)=>evaluate(`(()=>{const e=document.querySelector('[name=${JSON.stringify(name)}]');Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const base='/controle-buffet-amostras',service=base+'/servico/'+fixtures.serviceId+'?data='+fixtures.day,history=base+'/historico?filtroData='+fixtures.day+'&dia='+fixtures.day+'&filtroServicoId='+fixtures.serviceId;
 const inspect=()=>prisma.fluxoOperacional.findUniqueOrThrow({where:{id:fixtures.flowId},include:{amostras:{orderBy:{id:'asc'}},versoes:{orderBy:{versao:'asc'}},assinaturaVigente:true}});
 const before=await inspect(),row=(i,field)=>'item-'+fixtures.itemIds[i]+'-'+field,extra=field=>'extra-'+fixtures.extraId+'-'+field;
 const summary=()=>evaluate("document.querySelector('[aria-label=\"Resumo de pendências\"]')?.innerText||''");
 const count=()=>evaluate("document.querySelectorAll('[aria-label=\"Resumo de pendências\"] li').length");
 const login=async username=>{await send('Network.clearBrowserCookies');await navigate('/login?next='+base);await fill('nomeUsuario',username);await fill('senha',fixtures.password);await clickText('Entrar');await wait(`location.pathname===${JSON.stringify(base)}`);};
 await send('Page.enable');await login(fixtures.operatorUsername);await navigate(history);await wait("document.body.innerText.includes('Conferir pendências')");await clickText('Conferir pendências');await wait("!!document.querySelector('[name=rowIntentVersion]')");await wait("document.querySelectorAll('[aria-label=\"Resumo de pendências\"] li').length===5");
 assert.equal(await count(),5);assert((await summary()).includes('ação corretiva'));assert((await summary()).includes('justificativa'));assert((await summary()).includes('Extra'));
 assert.equal(await evaluate("document.querySelectorAll('section[id].border-red-300').length"),5);
 await fill(row(0,'observacao'),'Texto digitado preservado');await clickText('Salvar Itens do Serviço');assert.equal(await count(),5);assert.equal(JSON.stringify(await inspect()),JSON.stringify(before));assert.equal(await evaluate(`document.querySelector('[name=${row(0,'observacao')}]').value`),'Texto digitado preservado');
 await evaluate(`(()=>{const e=document.querySelector('input[type=search]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'Item 32');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await pause(200);
 assert.equal(await evaluate("document.querySelectorAll('section[id].border-red-300:not(.hidden)').length"),5);
 await evaluate("document.querySelector('[aria-label=\"Resumo de pendências\"] button').click()");await pause(200);assert.equal(await evaluate("document.querySelector('input[type=search]').value"),'');
 for(const width of [1440,390]){await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'));fs.writeFileSync(path.join(dir,'collective-'+width+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));}
 await fill(row(0,'primeiraTc'),'5');await pause(100);assert.equal(await evaluate(`document.querySelector('[name=${row(0,'acaoCorretiva')}]').value`),'Não se aplica');
 await fill(row(0,'primeiraTc'),'10,9');await pause(100);assert.equal(await evaluate(`document.querySelector('[name=${row(0,'acaoCorretiva')}]').value`),'');
 await fill(row(0,'acaoCorretiva'),fixtures.corrective);await fill(row(0,'primeiraTc'),'5');await pause(100);assert.equal(await evaluate(`document.querySelector('[name=${row(0,'acaoCorretiva')}]').value`),fixtures.corrective);
 await fill(row(0,'acaoCorretiva'),'');await fill(row(0,'primeiraTc'),'6');await pause(100);assert.equal(await evaluate(`document.querySelector('[name=${row(0,'acaoCorretiva')}]').value`),'Não se aplica');
 await fill(row(0,'horarioExecucao'),'08:15');await wait("document.querySelectorAll('[aria-label=\"Resumo de pendências\"] li').length===4");
 await fill(row(1,'horarioExecucao'),'08:15');await fill(row(2,'justificativaHorario'),'Execução confirmada sem anotação do horário.');await fill(row(3,'horarioExecucao'),'08:15');await fill(extra('horarioExecucao'),'08:15');await wait("!document.querySelector('[aria-label=\"Resumo de pendências\"]')");
 await clickText('Salvar Itens do Serviço');await wait("location.search.includes('feedbackType=success')&&!document.querySelector('form[aria-busy=true]')");
 const saved=await inspect();assert.equal(saved.estado,'COMPLETO');assert.equal(saved.versao,before.versao+1);assert.equal(saved.amostras.length,33);assert.equal(saved.amostras.find(r=>r.itemId===fixtures.itemIds[0]).acaoCorretiva,'Não se aplica');assert.equal(saved.amostras.find(r=>r.itemId===fixtures.itemIds[2]).horarioNaoInformado,true);assert.equal(saved.amostras.find(r=>r.itemId===fixtures.itemIds[2]).horarioExecucao,null);
 for(const r of before.amostras.filter(r=>r.status==='PREENCHIDO'))assert.deepEqual(saved.amostras.find(n=>n.id===r.id),r);
 await navigate(service);await wait("document.body.innerText.includes('Validação do Serviço')");assert.equal(await evaluate("document.querySelectorAll('input[type=password]').length"),0);await navigate(history);await wait("document.body.innerText.includes('Assinatura indisponível')");assert(!(await evaluate('document.body.innerText')).includes('Revisar e assinar'));
 await login(fixtures.username);await navigate(history);await wait("document.body.innerText.includes('Revisar e assinar')");await clickText('Revisar e assinar');await wait("!!document.querySelector('#validacao-servico input[type=password]')");
 for(const width of [1440,390]){await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'));await evaluate("document.querySelector('#validacao-servico').scrollIntoView()");fs.writeFileSync(path.join(dir,'review-'+width+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));}
 await fill('senha','incorrect');await clickText('Assinar serviço');await wait("document.body.innerText.includes('Senha inválida')");assert.equal((await inspect()).assinaturaVigenteId,null);await fill('senha',fixtures.password);await clickText('Assinar serviço');await wait("document.body.innerText.includes('Registro assinado')");
 const signed=await inspect();assert(signed.assinaturaVigenteId);assert.equal(JSON.stringify(signed.amostras),JSON.stringify(saved.amostras));assert.equal(JSON.stringify(signed.versoes),JSON.stringify(saved.versoes));
 await navigate(history);await wait(`document.body.innerText.includes(${JSON.stringify(signed.assinaturaVigente.usuarioNome)})`);assert(!(await evaluate('document.body.innerText')).includes('Revisar e assinar'));
 await navigate('/relatorios/controle-buffet-amostras/mensal?mes='+fixtures.day.slice(5,7)+'&ano='+fixtures.day.slice(0,4));await wait(`document.body.innerText.includes(${JSON.stringify(signed.assinaturaVigente.usuarioNome)})`);await evaluate("window.__prints=0;window.print=()=>window.__prints++;[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Imprimir')).click()");await wait('window.__prints===1');
 fs.writeFileSync(path.join(dir,'browser-results.json'),JSON.stringify({passed:true,items:33,simultaneousIssues:5,saves:1,desktop:true,mobile:true,realLogin:true,realSignature:true,report:true,productionAccess:false},null,2));
 await send('Browser.close');console.log('PASS real browser: History > 33 items/5 errors > retained input/search > reactive actions > single atomic save > refresh > independent nutritionist > password/signature > History/report/print; desktop and mobile.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{socket?.close();browser?.kill();server.kill();await prisma.$disconnect();});
