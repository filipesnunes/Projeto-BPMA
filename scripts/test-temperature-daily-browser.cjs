// Real Next server + headless Edge against the isolated compatibility fixtures.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.data/validation/temperature-daily');
const fixtures=JSON.parse(fs.readFileSync(path.join(dir,'fixtures.json'),'utf8'));const database=fixtures.database;assert(/^workflow_[0-9]+$/.test(database));
const url=`postgresql://postgres:isolated_test_only@127.0.0.1:55479/${database}`;
const log=fs.openSync(path.join(dir,'next-browser.log'),'w');
const server=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','-p','3116'],{cwd:root,env:{...process.env,DATABASE_URL:url,DIRECT_URL:url},stdio:['ignore',log,log],windowsHide:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let browser,socket;
(async()=>{
 for(let i=0;i<120;i++){try{if((await fetch('http://localhost:3116/login')).ok)break;}catch{}await pause(250);if(i===119)throw Error('Server start timeout');}
 const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
 browser=spawn(edge,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9239',`--user-data-dir=${path.join(dir,'browser-'+Date.now())}`,'about:blank'],{stdio:'ignore',windowsHide:true});
 let targets;for(let i=0;i<80;i++){try{targets=await(await fetch('http://localhost:9239/json')).json();if(targets.some(t=>t.type==='page'))break;}catch{}await pause(250);}
 socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
 let id=0;const pending=new Map();socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});
 const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async(expression)=>{for(let i=0;i<120;i++){if(await evaluate(expression))return;await pause(150);}throw Error('Browser assertion timeout: '+expression+' '+await evaluate('document.body.innerText.slice(-1800)'));};
 const navigate=async(route)=>{await send('Page.navigate',{url:'http://localhost:3116'+route});await wait(`document.readyState==='complete' && location.pathname===${JSON.stringify(route.split('?')[0])}`);};
 const clickText=async(text)=>{assert(await evaluate(`(()=>{const b=[...document.querySelectorAll('button,a')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled);if(!b)return false;b.click();return true})()`),'Clickable '+text);};
 const fill=async(name,value)=>evaluate(`(()=>{const e=document.querySelector('[name=${JSON.stringify(name)}]');Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const before=process.argv.includes('--before'),base='/controle-temperatura-equipamentos';
 await send('Page.enable');await navigate('/login?next='+base);await fill('nomeUsuario',fixtures.userName);await fill('senha','daily-test-password');await clickText('Entrar');await wait(`location.pathname==='${base}'&&document.body.innerText.includes(${JSON.stringify(fixtures.tag)})`);
 const body=await evaluate('document.body.innerText');
 if(before)assert(body.includes(fixtures.tag+' PAST'),'Baseline build must demonstrate the original history-loading problem');
 else{
  assert(body.includes(fixtures.equipment[0].nome));assert(body.includes(fixtures.equipment[1].nome));assert(body.includes(fixtures.equipment[2].nome));
  assert(!body.includes(fixtures.tag+' PAST'));assert(!body.includes(fixtures.tag+' FUTURE'));assert(!body.includes(fixtures.equipment[3].nome));
  for(const width of [1440,390,320]){await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});await navigate(base);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'));fs.writeFileSync(path.join(dir,`daily-${width}.png`),Buffer.from((await send('Page.captureScreenshot',{captureBeyondViewport:true})).data,'base64'));}
  await navigate(base+'/historico?filtroData='+fixtures.previousDate+'&dia='+fixtures.previousDate);await wait(`document.body.innerText.includes(${JSON.stringify(fixtures.tag+' PAST')})`);
  assert((await evaluate('document.body.innerText')).includes(fixtures.equipment[3].nome));
  assert(await evaluate(`!!document.querySelector('a[href="${base}"]')`));await navigate(base);assert(!(await evaluate('document.body.innerText')).includes(fixtures.tag+' PAST'));
 }
 const timings=await evaluate(`(async()=>{const samples=[];for(let i=0;i<9;i++){const start=performance.now();const response=await fetch('${base}',{cache:'no-store'});const headers=performance.now();const html=await response.text();const end=performance.now();if(response.status!==200)throw Error('HTTP '+response.status);if(i>1)samples.push({ttfbMs:headers-start,totalMs:end-start,bytes:new TextEncoder().encode(html).length});}return samples;})()`);
 const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
 const result={phase:before?'before':'after',database,date:fixtures.date,synthetic:true,samples:timings.length,medianTtfbMs:median(timings.map(x=>x.ttfbMs)),medianFullHttpMs:median(timings.map(x=>x.totalMs)),medianBytes:median(timings.map(x=>x.bytes)),description:'Authenticated local Next production build, full streamed HTML response; excludes browser paint'};
 fs.writeFileSync(path.join(dir,`http-${result.phase}.json`),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 await send('Browser.close');console.log(before?'PASS baseline browser: historical/future rows reproduced; local HTTP timings captured.':'PASS daily browser: only today, both formats, current draft, old/future/reopened excluded, History navigation preserved and 3 responsive screenshots.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{socket?.close();browser?.kill();server.kill();});
