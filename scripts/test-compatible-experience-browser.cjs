// Real Next server + headless Edge against the isolated compatibility fixtures.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.data/validation/compatible-experience');
const fixtures=JSON.parse(fs.readFileSync(path.join(dir,'fixtures.json'),'utf8'));const database=fixtures.database;assert(/^workflow_[0-9]+$/.test(database));
const url=`postgresql://postgres:isolated_test_only@127.0.0.1:55479/${database}`;
const log=fs.openSync(path.join(dir,'next-browser.log'),'w');
const server=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','-p','3115'],{cwd:root,env:{...process.env,DATABASE_URL:url,DIRECT_URL:url},stdio:['ignore',log,log],windowsHide:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let browser,socket;
(async()=>{
 for(let i=0;i<120;i++){try{if((await fetch('http://localhost:3115/login')).ok)break;}catch{}await pause(250);if(i===119)throw Error('Server start timeout');}
 const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
 browser=spawn(edge,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9238',`--user-data-dir=${path.join(dir,'browser-'+Date.now())}`,'about:blank'],{stdio:'ignore',windowsHide:true});
 let targets;for(let i=0;i<80;i++){try{targets=await(await fetch('http://localhost:9238/json')).json();if(targets.some(t=>t.type==='page'))break;}catch{}await pause(250);}
 socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
 let id=0;const pending=new Map();socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});
 const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async(expression)=>{for(let i=0;i<120;i++){if(await evaluate(expression))return;await pause(150);}throw Error('Browser assertion timeout: '+expression+' '+await evaluate('document.body.innerText.slice(-1800)'));};
 const navigate=async(route)=>{await send('Page.navigate',{url:'http://localhost:3115'+route});await wait(`document.readyState==='complete' && location.pathname===${JSON.stringify(route.split('?')[0])}`);};
 const clickText=async(text)=>{assert(await evaluate(`(()=>{const b=[...document.querySelectorAll('button,a')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled);if(!b)return false;b.click();return true})()`),'Clickable '+text);};
 const fill=async(name,value)=>evaluate(`(()=>{const e=document.querySelector('[name=${JSON.stringify(name)}]');Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const screenshot=async(name,route)=>{for(const width of [1440,390,320]){await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});await navigate(route);await wait("document.querySelector('main')!==null");assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Overflow '+name+' '+width);fs.writeFileSync(path.join(dir,`${name}-${width}.png`),Buffer.from((await send('Page.captureScreenshot',{captureBeyondViewport:true})).data,'base64'));}};
 await send('Page.enable');await navigate('/login?next=/controle-temperatura-equipamentos');
 await fill('nomeUsuario','workflow-test');await fill('senha','test-password');await clickText('Entrar');
 await wait("location.pathname==='/controle-temperatura-equipamentos'&&document.body.innerText.includes('Câmara anterior')");
 const modules=['controle-temperatura-equipamentos','controle-qualidade-oleo','controle-buffet-amostras','rastreabilidade-recebimento'];
 for(const name of modules){
   await navigate('/'+name);assert(!(await evaluate('document.body.innerText')).includes('Estado operacional'));
   await screenshot(name,'/'+name);
   await screenshot(name+'-historico','/'+name+'/historico?filtroMes=10&filtroAno=2026');
 }
 const temperature='/controle-temperatura-equipamentos',oil='/controle-qualidade-oleo';
 await navigate(temperature+'?new=1');await wait("document.querySelector('[name=equipamento]')!==null");
 assert((await evaluate('document.body.innerText')).includes('Novo Registro'));
 assert(await evaluate("document.querySelector('[name=turno]')!==null"));
 await navigate(oil+'?new=1');await wait("document.querySelector('[name=temperatura]')!==null");
 await fill('temperatura','130');await clickText('Salvar Registro');
 await wait("location.search.includes('feedbackType=success')");assert(!(await evaluate('location.pathname')).includes('/fluxo'));
 // Legacy and current signed content stay available in the recovered screens.
 await navigate(temperature);assert((await evaluate('document.body.innerText')).includes('Câmara anterior'));assert((await evaluate('document.body.innerText')).includes('Câmara recuperação'));
 await navigate(temperature+'/fluxo?chave='+encodeURIComponent(fixtures.draftTempKey));
 await wait("document.querySelector('[name=observacaoStatusOperacional]')!==null");assert.equal(await evaluate("document.querySelector('[name=observacaoStatusOperacional]').value"),'Rascunho recuperável sem projeção');
 await fill('temperaturaAferida','3');await clickText('Salvar Registro');await wait("location.search.includes('feedbackType=success')");
 await navigate(oil+'/fluxo?chave='+encodeURIComponent(fixtures.oilKey));await wait("document.body.innerText.includes('Registro assinado')");
 assert.equal(await evaluate("document.querySelector('[name=temperatura]').matches(':disabled')"),true);
 await clickText('Reabrir Registro');await wait("document.querySelector('[aria-label=\"Confirmar reabertura\"]')!==null");await clickText('Cancelar');
 await wait("document.body.innerText.includes('Registro assinado')&&!document.querySelector('[aria-label=\"Confirmar reabertura\"]')");
 assert(!(await evaluate('document.body.innerText')).includes('Estado operacional'));
 await navigate(temperature+'/historico?dia=2026-10-28&filtroMes=10&filtroAno=2026');
 await wait("document.querySelector('[name=mecanismo][value=diaria]')!==null");
 await evaluate("(()=>{const f=document.querySelector('[name=mecanismo][value=diaria]').form;f.querySelector('[name=senha]').value='test-password';f.requestSubmit();})()");
 await wait("location.search.includes('feedbackType=success')");
 // Existing document/fiscal data and legacy histories remain reachable without status queues.
 await navigate('/rastreabilidade-recebimento/historico?filtroMes=10&filtroAno=2026');assert((await evaluate('document.body.innerText')).includes('Fornecedor XML'));
 await navigate('/controle-buffet-amostras/historico?filtroMes=10&filtroAno=2026');assert((await evaluate('document.body.innerText')).includes('Almoço piloto'));
 // Exercise XML import through the recovered modal, then partial conference and finalization.
 const groupDir=path.join(root,'.data/validation/group-workflows');
 const xml=fs.readFileSync(path.join(groupDir,'xml-fixture.xml'),'utf8').replace('<nNF>123</nNF>','<nNF>88888</nNF>').replace(/Id="NFe[0-9]{44}"/,'Id="NFe'+'3'.repeat(44)+'"');
 const xmlPath=path.join(dir,'recovered-import.xml');fs.writeFileSync(xmlPath,xml);
 await navigate('/rastreabilidade-recebimento?importXml=1');
 const dom=await send('DOM.getDocument');const input=await send('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'input[type=file]'});
 await send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[xmlPath]});
 await wait("!([...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Confirmar importação')).disabled");await clickText('Confirmar importação');
 await wait("location.pathname.startsWith('/rastreabilidade-recebimento/nota/')&&document.body.innerText.includes('88888')");
 const noteUrl=await evaluate('location.pathname');const itemId=await evaluate("document.querySelector('[name$=\"-lote\"]').name.match(/item-([0-9]+)-/)[1]");const prefix='item-'+itemId+'-';
 const saveNote=async()=>{const revision=await evaluate("Number(document.querySelector('[name=versao]').value)");await clickText('Salvar Itens da Nota');await wait(`location.search.includes('feedbackType=success')&&Number(document.querySelector('[name=versao]')?.value)>${revision}`);};
 await fill(prefix+'lote','LOTE-RECUPERADO');await saveNote();
 await navigate(noteUrl);assert.equal(await evaluate(`document.querySelector('[name="${prefix}lote"]').value`),'LOTE-RECUPERADO');
 await evaluate(`document.querySelector('[name="${prefix}semDataFabricacao"]').click();document.querySelector('[name="${prefix}validadeNaoAplicavel"]').click()`);
 await fill(prefix+'sif','NA');await fill(prefix+'temperaturaTipo','AMBIENTE');for(const field of ['transporteEntregador','aspectoSensorial','embalagem'])await fill(prefix+field,'CONFORME');
 await saveNote();await clickText('Finalizar Conferência');await wait("document.querySelector('[aria-label=\"Finalizar Conferência\"]')!==null");await clickText('Confirmar Finalização');await wait("document.body.innerText.includes('FINALIZADA')");
 const original=await evaluate("fetch(location.pathname+'/xml').then(async r=>({status:r.status,text:await r.text()}))");assert.equal(original.status,200);assert.equal(original.text,xml);
 await screenshot('conferencia-recuperada',noteUrl);
 // A service opened from the familiar service list still supports drafts and explicit not-served.
 const groupFixture=JSON.parse(fs.readFileSync(path.join(groupDir,'browser-fixtures.json'),'utf8'));
 const serviceUrl='/controle-buffet-amostras/servico/'+groupFixture.serviceId+'?data=2026-10-28';const [firstItem,secondItem]=groupFixture.itemIds;
 await navigate(serviceUrl);await fill('item-'+firstItem+'-temperaturaTipo','NUMERICA');await fill('item-'+firstItem+'-tcEquipamento','70');await fill('item-'+firstItem+'-primeiraTc','65');
 await clickText('Salvar Itens do Serviço');await wait("location.search.includes('feedbackType=success')");
 await navigate(serviceUrl);assert.equal(await evaluate(`document.querySelector('[name="item-${firstItem}-primeiraTc"]').value`),'65');
 const section=`document.querySelector('[name="item-${secondItem}-naoServido"]').closest('section')`;
 assert.equal(await evaluate(`${section}.querySelector('input[type=checkbox]').checked`),false);
 await evaluate(`${section}.querySelector('input[type=checkbox]').click()`);await clickText('Salvar Itens do Serviço');await wait("document.body.innerText.includes('Preenchimento salvo — aguardando assinatura')");
 await evaluate("(()=>{const f=document.querySelector('[name=mecanismo][value=REVISAO]').form;f.querySelector('[name=senha]').value='test-password';f.requestSubmit();})()");await wait("document.body.innerText.includes('Registro assinado')");
 assert(await evaluate(`${section}.querySelector('input[type=checkbox]').matches(':disabled')`));
 await screenshot('servico-recuperado',serviceUrl);
 await send('Browser.close');console.log('PASS recovered experience browser: 4 modules + 4 histories, old/current data, original oil save, temperature draft/save, locks/cancel/daily signing, recovered XML modal/conference/finalize/original download, buffet partial/explicit not-served/signing and 30 responsive screenshots.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{socket?.close();browser?.kill();server.kill();});
