// Chromium PDF pagination against actual report HTML produced by route handlers.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
const dir=path.resolve(__dirname,'../.data/validation/regularizacao-20261103'),fixtures=JSON.parse(fs.readFileSync(path.join(dir,'print-fixtures.json'),'utf8')),port=9257,pause=ms=>new Promise(r=>setTimeout(r,ms));
let browser,socket;
(async()=>{
 browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${port}`,`--user-data-dir=${path.join(dir,'pdf-browser-'+Date.now())}`,'about:blank'],{stdio:'ignore',windowsHide:true});
 let targets;for(let n=0;n<80;n++){try{targets=await(await fetch(`http://127.0.0.1:${port}/json`,{signal:AbortSignal.timeout(1500)})).json();if(targets.some(t=>t.type==='page'))break;}catch{}await pause(150);}
 socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});let sequence=0;const pending=new Map();socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1123,height:794,deviceScaleFactor:1,mobile:false});await send('Emulation.setEmulatedMedia',{media:'print'});
 const results=[];
 for(const spec of [{file:'equipamentos-31-antes.html',baseline:true,equipments:4},...fixtures.fixtures,{...fixtures.exceptional,exceptional:true,equipments:4}]){
  await send('Page.navigate',{url:pathToFileURL(path.join(dir,spec.file)).href});for(let n=0;n<100;n++){if(await evaluate(`document.readyState==='complete'&&location.href.endsWith(${JSON.stringify(spec.file)})`))break;await pause(100);}
  await evaluate('document.fonts.ready.then(()=>Promise.all([...document.images].map(i=>i.decode?.().catch(()=>{}))))');
  await evaluate("window.dispatchEvent(new Event('beforeprint'))");
  const layout=await evaluate("[...document.querySelectorAll('.equipment-page')].map(p=>({name:p.querySelector('.equipment-info')?.innerText,heightMm:p.getBoundingClientRect().height*25.4/96,warning:p.dataset.printOverflow==='true',tableRows:p.querySelectorAll('.day-row').length,footerPresent:!!p.querySelector('.signature-table')}))");
  const pdf=Buffer.from((await send('Page.printToPDF',{preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false})).data,'base64'),pages=(pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length;
  const output=spec.file.replace('.html','.pdf');fs.writeFileSync(path.join(dir,output),pdf);
  results.push({file:output,equipamentos:spec.equipments,paginas:pages,baseline:Boolean(spec.baseline),excepcional:Boolean(spec.exceptional),layout});
  fs.writeFileSync(path.join(dir,'paginacao-resultados.json'),JSON.stringify(results,null,2));
  if(!spec.baseline&&!spec.exceptional){assert.equal(pages,spec.equipments,spec.file+': um equipamento por página física');assert(layout.every(p=>!p.warning&&p.heightMm<=196.3&&p.tableRows===spec.days&&p.footerPresent));}
  if(spec.exceptional){assert(pages>spec.equipments);assert(layout.some(p=>p.warning));assert(await evaluate(`document.body.innerText.includes(${JSON.stringify(fixtures.exceptional.lastEvidence)})`));}
  console.log(JSON.stringify({arquivo:output,equipamentos:spec.equipments,paginas:pages,excepcional:Boolean(spec.exceptional),alturasMm:layout.map(p=>Math.round(p.heightMm))}));
 }
 fs.writeFileSync(path.join(dir,'paginacao-resultados.json'),JSON.stringify(results,null,2));
 await send('Browser.close');console.log('PASS PDFs reais: casos normais 28/30/31 dias sem páginas extras; excesso excepcional sinalizado com dados íntegros.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{socket?.close();browser?.kill();});
