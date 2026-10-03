// Compiled application CSS/fonts in an isolated browser; no production access.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.data/validation');
const file=path.join(root,'src/lib/appearance-settings.ts'),unit=new Module(file,module);
unit._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const a=unit.exports;
async function main(){
  const cssDir=path.join(root,'.next/static/css');
  let css=fs.readdirSync(cssDir).filter(f=>f.endsWith('.css')).map(f=>fs.readFileSync(path.join(cssDir,f),'utf8')).join('\n');
  css=css.replace(/url\(([^)]+)\)/g,(original,value)=>{
    const filename=path.basename(value.replace(/["']/g,''));
    const target=path.join(root,'.next/static/media',filename);
    return fs.existsSync(target)?`url(data:font/woff2;base64,${fs.readFileSync(target).toString('base64')})`:original;
  });
  assert(!css.includes('fonts.googleapis.com'));
  const targets=await(await fetch('http://127.0.0.1:9227/json')).json();
  const socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((res,rej)=>{socket.onopen=res;socket.onerror=rej});let id=0;const pending=new Map();
  socket.onmessage=event=>{const r=JSON.parse(event.data),h=pending.get(r.id);if(!h)return;pending.delete(r.id);r.error?h.reject(r.error):h.resolve(r.result)};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const next=++id;pending.set(next,{resolve,reject});socket.send(JSON.stringify({id:next,method,params}))});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
  let count=0,semantic=null;const results=[];
  try{
    await send('Page.enable');
    for(const theme of ['CLARO','ESCURO','AUTOMATICO'])for(const font of Object.keys(a.FONT_OPTIONS))for(const size of Object.keys(a.TEXT_SIZES)){
      const settings=a.normalizeAppearance({...a.APPEARANCE_PALETTES[count%a.APPEARANCE_PALETTES.length],temaPadrao:theme,fonteAplicativo:font,tamanhoTexto:size});
      const name=`appearance-${theme}-${font}-${size}`;
      const html=`<!doctype html><html class="${theme==='ESCURO'?'dark':''}"><meta charset="utf-8"><style>${css}\n${a.appearanceCss(settings)}</style><body><main class="mx-auto max-w-3xl space-y-4 p-4"><aside class="bpma-sidebar rounded-lg p-4"><div class="bpma-sidebar-user p-3"><p>Unidade sintética</p></div><a class="bpma-sidebar-link bpma-sidebar-link-active">Personalização Visual</a></aside><section class="bpma-card space-y-4"><h1 class="text-2xl font-bold">Identidade visual da unidade</h1><label>Nome da unidade<input class="bpma-input" value="K Platz Hotel"/></label><div class="flex flex-wrap gap-3"><button class="btn-primary">Salvar alterações</button><button class="btn-secondary">Pré-visualizar</button></div><p id="danger" class="bg-red-100 text-red-800 p-3">Exemplo: alerta sanitário</p><p id="success" class="bg-emerald-100 text-emerald-800 p-3">Exemplo: conforme</p></section><section class="bpma-report-document"><p id="report-text" class="text-sm">Documento: fonte e escala independentes</p></section></main></body></html>`;
      fs.writeFileSync(path.join(dir,name+'.html'),html);
      await send('Emulation.setDeviceMetricsOverride',{width:size==='AMPLIADO'?360:1200,height:900,deviceScaleFactor:1,mobile:false});
      await send('Page.navigate',{url:pathToFileURL(path.join(dir,name+'.html')).href});
      for(let i=0;i<100;i++){if(await evaluate(`document.readyState==='complete'&&location.href.endsWith('${name}.html')`))break;await new Promise(r=>setTimeout(r,30))}
      await evaluate('document.fonts.ready');
      const metrics=await evaluate(`(()=>{const style=e=>getComputedStyle(document.querySelector(e));return {font:style('body').fontFamily,size:getComputedStyle(document.documentElement).fontSize,report:style('#report-text').fontSize,overflow:document.documentElement.scrollWidth>innerWidth,semantic:[style('#danger').color,style('#danger').backgroundColor,style('#success').color,style('#success').backgroundColor]}})()`);
      assert.equal(metrics.size,a.TEXT_SIZES[size]+'px');assert.equal(metrics.report,'14px');assert.equal(metrics.overflow,false);
      if(semantic)assert.deepEqual(metrics.semantic,semantic);else semantic=metrics.semantic;
      if(['INTER','ROBOTO','OPEN_SANS'].includes(font))assert.equal(await evaluate(`document.fonts.check('16px ${JSON.stringify({INTER:'Inter',ROBOTO:'Roboto',OPEN_SANS:'Open Sans'}[font])}')`),true);
      if(font==='INTER'&&size==='AMPLIADO')fs.writeFileSync(path.join(dir,name+'.png'),Buffer.from((await send('Page.captureScreenshot')).data,'base64'));
      results.push({theme,font,size,...metrics});count++;
    }
    fs.writeFileSync(path.join(dir,'appearance-visual-results.json'),JSON.stringify(results,null,2));
    console.log(`PASS ${count} appearance combinations: desktop/mobile, local fonts, scales, semantic colors and independent report typography`);
  }finally{await send('Browser.close');socket.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
