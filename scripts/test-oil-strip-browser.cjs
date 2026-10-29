// Real Next server + headless Edge + isolated PostgreSQL fixtures from test-oil-strip.cjs.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.data/validation/oil-strip');
const database=fs.readFileSync(path.join(dir,'database.txt'),'utf8').trim();assert(/^oilstrip_\d+$/.test(database));
const url=`postgresql://postgres:isolated_test_only@127.0.0.1:55479/${database}`;
process.env.DATABASE_URL=url;process.env.DIRECT_URL=url;
const {PrismaClient}=require('@prisma/client'),prisma=new PrismaClient({datasources:{db:{url}}});
const log=fs.openSync(path.join(dir,'next-browser.log'),'w');
const server=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','-p','3118'],{cwd:root,env:{...process.env,DATABASE_URL:url,DIRECT_URL:url},stdio:['ignore',log,log],windowsHide:true});
const fixture=JSON.parse(fs.readFileSync(path.join(dir,'account.json'),'utf8')); const oilKey=encodeURIComponent(fixture.day+':'+require('node:crypto').randomUUID());
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let browser,socket;
(async()=>{
 for(let i=0;i<120;i++){try{if((await fetch('http://localhost:3118/login')).ok)break;}catch{}await pause(250);if(i===119)throw Error('Server start timeout');}
 const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
 browser=spawn(edge,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9241',`--user-data-dir=${path.join(dir,'browser-'+Date.now())}`,'about:blank'],{stdio:'ignore',windowsHide:true});
 let targets;for(let i=0;i<80;i++){try{targets=await(await fetch('http://localhost:9241/json')).json();if(targets.some(t=>t.type==='page'))break;}catch{}await pause(250);}
 socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
 let id=0;const pending=new Map();socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});
 const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async(expression)=>{for(let i=0;i<120;i++){if(await evaluate(expression))return;await pause(150);}throw Error('Browser assertion timeout: '+expression+' '+await evaluate('document.body.innerText.slice(-1800)'));};
 const navigate=async(route)=>{await send('Page.navigate',{url:'http://localhost:3118'+route});await wait(`document.readyState==='complete' && location.pathname===${JSON.stringify(route.split('?')[0])}`);};
 const clickText=async(text)=>{assert(await evaluate(`(()=>{const b=[...document.querySelectorAll('button,a')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled);if(!b)return false;b.click();return true})()`),'Clickable '+text);};
 const fill=async(name,value)=>evaluate(`(()=>{const e=document.querySelector('[name=${JSON.stringify(name)}]');Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await send('Page.enable');await navigate('/login?next=/controle-qualidade-oleo');
 await fill('nomeUsuario',fixture.username);await fill('senha','oil-strip-password');await clickText('Entrar');await wait(`location.pathname==='/controle-qualidade-oleo'`);
 const base='/controle-qualidade-oleo';await navigate(base+'/fluxo?chave='+oilKey);await wait(`!!document.querySelector('[name=temperatura]')`);
 const select=async(value)=>evaluate(`document.querySelector('input[name=fitaOleo][value='+CSS.escape(${JSON.stringify(value)})+']').click()`);
 const transmitted=()=>evaluate(`new FormData(document.querySelector('[name=temperatura]').form).get('fitaOleo')`);
 await select('3,5%');assert.equal(await transmitted(),'3,5%');
 await clickText('Sem Utilização no Período');await clickText('Com Utilização');
 if(process.argv.includes('--before')){assert.equal(await transmitted(),null);console.log('REPRODUCED browser: utilisation round trip erases selected strip; FormData has no fitaOleo.');}
 else {
  assert.equal(await transmitted(),'3,5%');
  const expected=[['Óleo Adequado','ADEQUADO'],['2%','ADEQUADO'],['3,5%','ATENCAO'],['5,5%','ULTIMA_UTILIZACAO'],['7%','DESCARTAR'],['__SEM_AFERICAO__',null]];
  for(const [strip,status] of expected){
   await navigate(base+'?new=1');await wait(`!!document.querySelector('[name=temperatura]')`);await fill('temperatura','173,3');await select('2%');await select(strip);
   assert.equal(await transmitted(),strip);await fill('observacao','Browser '+strip);assert.equal(await transmitted(),strip);
   // Clicking a radio and immediately submitting must serialize the actual DOM choice.
   const request=await evaluate(`document.querySelector('[name=workflowRequestId]').value`);
   await evaluate(`(()=>{const f=document.querySelector('[name=temperatura]').form;document.querySelector('input[name=fitaOleo][value='+CSS.escape(${JSON.stringify(strip)})+']').click();f.requestSubmit();})()`);
   await wait(`location.search.includes('feedbackType=success')`);
   const saved=await prisma.controleQualidadeOleoRegistro.findFirstOrThrow({where:{fluxo:{chave:fixture.day+':'+request}}});assert.equal(saved.fitaOleo,strip==='__SEM_AFERICAO__'?null:strip);assert.equal(saved.status,status);
   await wait(`document.body.innerText.includes(${JSON.stringify('Browser '+strip)})`);
   const listed=await evaluate(`[...document.querySelectorAll('tbody tr')].find(r=>r.textContent.includes(${JSON.stringify('Browser '+strip)}))?.querySelectorAll('td')[1]?.textContent`);assert.equal(listed,saved.fitaOleo??'-');
   await navigate(base+'/fluxo?chave='+encodeURIComponent(fixture.day+':'+request));await wait(`!!document.querySelector('[name=temperatura]')`);assert.equal(await transmitted(),strip);
   await fill('observacao','Only observation changed '+strip);await clickText('Salvar Registro');await wait(`location.search.includes('feedbackType=success')`);
   assert.equal((await prisma.controleQualidadeOleoRegistro.findUniqueOrThrow({where:{id:saved.id}})).fitaOleo,saved.fitaOleo);
   await navigate(base+'/historico?dia='+fixture.day);await wait(`document.body.innerText.includes(${JSON.stringify('Only observation changed '+strip)})`);
   const historical=await evaluate(`[...document.querySelectorAll('tbody tr')].find(r=>r.textContent.includes(${JSON.stringify('Only observation changed '+strip)}))?.querySelector('td')?.textContent`);assert.equal(historical,saved.fitaOleo??'-');
  }
  await navigate(base+'?new=1');await wait(`!!document.querySelector('[name=temperatura]')`);await fill('temperatura','173');
  assert.equal(await transmitted(),null);assert.equal(await evaluate(`document.querySelector('[name=temperatura]').form.checkValidity()`),false);
  await select('7%');await clickText('Sem Utilização no Período');await clickText('Com Utilização');assert.equal(await transmitted(),'7%');assert.equal(await evaluate(`document.querySelector('[name=temperatura]').value`),'173');
  await clickText('Sem Utilização no Período');const request=await evaluate(`document.querySelector('[name=workflowRequestId]').value`);await clickText('Salvar Registro');await wait(`location.search.includes('feedbackType=success')`);
  const unused=await prisma.controleQualidadeOleoRegistro.findFirstOrThrow({where:{fluxo:{chave:fixture.day+':'+request}}});assert.equal(unused.fitaOleo,null);assert.equal(unused.status,'SEM_UTILIZACAO');assert.equal(unused.temperatura,null);
  for(const width of [1440,390,320]){await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});await navigate(base+'?new=1');await wait(`!!document.querySelector('[name=temperatura]')`);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'));await evaluate(`document.querySelector('[name=temperatura]').form.scrollIntoView()`);const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(dir,'form-'+width+'.png'),Buffer.from(shot.data,'base64'));}
  console.log('PASS browser: real login/form/actions/PostgreSQL, five strips/statuses, explicit none, unused, rapid selection+submit, rerenders, reload, observation edit, history and responsive widths 1440/390/320.');
 }
 await send('Browser.close');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{socket?.close();browser?.kill();server.kill();await prisma.$disconnect();});
