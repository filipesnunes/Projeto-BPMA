// Real Next server + headless Edge + isolated PostgreSQL fixtures from test-oil-workflow.cjs.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.data/validation/oil-workflow');
const database=fs.readFileSync(path.join(dir,'database.txt'),'utf8').trim();assert(/^workflow_\d+$/.test(database));
const url=`postgresql://postgres:isolated_test_only@127.0.0.1:55479/${database}`;
const log=fs.openSync(path.join(dir,'next-browser.log'),'w');
const server=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','-p','3110'],{cwd:root,env:{...process.env,DATABASE_URL:url,DIRECT_URL:url},stdio:['ignore',log,log],windowsHide:true});
const oilKey=encodeURIComponent('2026-10-25:'+require('node:crypto').randomUUID());
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let browser,socket;
(async()=>{
 for(let i=0;i<120;i++){try{if((await fetch('http://localhost:3110/login')).ok)break;}catch{}await pause(250);if(i===119)throw Error('Server start timeout');}
 const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
 browser=spawn(edge,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9234',`--user-data-dir=${path.join(dir,'browser-'+Date.now())}`,'about:blank'],{stdio:'ignore',windowsHide:true});
 let targets;for(let i=0;i<80;i++){try{targets=await(await fetch('http://localhost:9234/json')).json();if(targets.some(t=>t.type==='page'))break;}catch{}await pause(250);}
 socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
 let id=0;const pending=new Map();socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});
 const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async(expression)=>{for(let i=0;i<120;i++){if(await evaluate(expression))return;await pause(150);}throw Error('Browser assertion timeout: '+expression+' '+await evaluate('document.body.innerText.slice(-1800)'));};
 const navigate=async(route)=>{await send('Page.navigate',{url:'http://localhost:3110'+route});await wait(`document.readyState==='complete' && location.pathname===${JSON.stringify(route.split('?')[0])}`);};
 const clickText=async(text)=>{assert(await evaluate(`(()=>{const b=[...document.querySelectorAll('button,a')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled);if(!b)return false;b.click();return true})()`),'Clickable '+text);};
 const fill=async(name,value)=>evaluate(`(()=>{const e=document.querySelector('[name=${JSON.stringify(name)}]');Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await send('Page.enable');await navigate('/login?next=/controle-qualidade-oleo');
 await fill('nomeUsuario','workflow-test');await fill('senha','test-password');await clickText('Entrar');await wait(`location.pathname==='/controle-qualidade-oleo' && document.body.innerText.includes('Verificações iniciadas')`);
 const base='/controle-qualidade-oleo';
 // A previously unused shift of the synthetic equipment created by the integration suite.
 await navigate(base+'/fluxo?chave='+oilKey);await wait(`document.querySelector('[name=temperatura]')!==null`);
 await fill('observacao','Rascunho salvo no navegador');await clickText('Salvar preenchimento');await wait(`location.search.includes('feedbackType=success')`);
 await navigate(base+'/fluxo?chave='+oilKey);assert.equal(await evaluate(`document.querySelector('[name=observacao]').value`),'Rascunho salvo no navegador');
 await fill('temperatura','170');await clickText('Concluir preenchimento');await wait(`location.pathname===${JSON.stringify(base+'/historico')} && document.body.innerText.includes('Verificação completa')`);
 await navigate(base+'/fluxo?chave='+oilKey);await wait(`document.body.innerText.includes('COMPLETO')`);await fill('senha','test-password');await clickText('Validar verificação');await wait(`location.pathname===${JSON.stringify(base+'/historico')} && document.body.innerText.includes('Validação registrada')`);
 await navigate(base+'/fluxo?chave='+oilKey);await wait(`document.body.innerText.includes('FECHADO')`);assert.equal(await evaluate(`document.querySelector('fieldset').disabled`),true);
 await clickText('Reabrir Registro');await wait(`document.querySelector('[role=dialog]')!==null`);await clickText('Cancelar');await wait(`document.querySelector('[role=dialog]')===null && document.body.innerText.includes('FECHADO')`);
 await clickText('Reabrir Registro');await wait(`document.querySelector('[role=dialog]')!==null`);assert.equal(await evaluate(`document.querySelector('[role=dialog]').checkValidity()`),false);await fill('justificativa','Correção aprovada no teste isolado');await clickText('Confirmar reabertura');await wait(`document.body.innerText.includes('REABERTO') && !location.search.includes('confirmar=')`);
 const editorPath=base+'/fluxo?chave='+oilKey;
 for(const width of [1440,390,320]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});
  for(const [name,route] of [['pending',base],['history',base+'/historico'],['editor',editorPath]]){
   await navigate(route);await wait(`document.body.innerText.includes(${JSON.stringify(name==='pending'?'Verificações iniciadas':name==='history'?'Verificações, responsáveis':'REABERTO')})`);
   assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Overflow '+name+' '+width);
   fs.writeFileSync(path.join(dir,`${name}-${width}.png`),Buffer.from((await send('Page.captureScreenshot',{captureBeyondViewport:true})).data,'base64'));
  }
 }
 await fill('temperatura','175');await clickText('Salvar preenchimento');await wait(`location.search.includes('feedbackType=success') && document.body.innerText.includes('REABERTO')`);
 await fill('senha','test-password');await clickText('Validar verificação');await wait(`location.pathname===${JSON.stringify(base+'/historico')} && document.body.innerText.includes('Validação registrada')`);
 await navigate(editorPath);await wait(`document.body.innerText.includes('FECHADO')`);
 await navigate('/relatorios/controle-qualidade-oleo/mensal?mes=10&ano=2026');assert(await evaluate(`document.body.innerText.includes('Supervisor Teste') && document.body.innerText.includes('Imprimir')`));
 await send('Browser.close');console.log('PASS browser: real login, progressive save/reload, completion/history, formal signing/locking, cancellation, justified reopen, edit still reopened, new signature, monthly report and 9 responsive screenshots at 1440/390/320.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{socket?.close();browser?.kill();server.kill();});
