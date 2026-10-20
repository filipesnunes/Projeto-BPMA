// Run after test-client-corrections.cjs, with an isolated headless browser on port 9227.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const directory = path.resolve(__dirname, '../.data/validation');

async function main() {
  const targets = await (await fetch('http://127.0.0.1:9227/json')).json();
  const socket = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  socket.onmessage = (event) => {
    const result = JSON.parse(event.data);
    if (!result.id) return;
    const handlers = pending.get(result.id);
    pending.delete(result.id);
    if (result.error) handlers.reject(new Error(JSON.stringify(result.error)));
    else handlers.resolve(result.result);
  };
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const nextId = ++id; pending.set(nextId, { resolve, reject });
      socket.send(JSON.stringify({ id: nextId, method, params }));
    });
  }
  async function evaluate(expression) {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  }
  async function navigate(file) {
    await send('Page.navigate', { url: pathToFileURL(path.join(directory, file)).href });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(`document.readyState === 'complete' && location.href.endsWith('${file}')`)) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Page load timeout');
  }

 await send('Page.enable');
 try{
  for(const name of ['operational-reference-fields','operational-unknown-fields','operational-weekly-fields','operational-delete-dialog']){
   for(const width of [1200,390,320]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
    await navigate(name+'.html');
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Sem overflow: '+name+' '+width);
    if(name==='operational-reference-fields'){
     assert.equal(await evaluate('document.querySelector("form").checkValidity()'),false);
     assert(await evaluate('(()=>{document.querySelector("input[type=time]").value="07:35";return document.querySelector("form").checkValidity()})()'));
    }
    if(name==='operational-unknown-fields'){
     assert(await evaluate('document.querySelector("input[type=checkbox]").checked && !document.querySelector("input[type=time]")'));
     assert.equal(await evaluate('document.querySelector("form").checkValidity()'),false);
     assert(await evaluate('(()=>{document.querySelector("textarea").value="Executado, hora não anotada";return document.querySelector("form").checkValidity()})()'));
    }
    if(name==='operational-delete-dialog'){
     assert(await evaluate('document.querySelector("[role=dialog]").textContent.includes("Câmara fria")'));
     assert(await evaluate('document.querySelector("[role=dialog]").textContent.includes("Responsável")'));
     assert.equal(await evaluate('document.querySelector("form").checkValidity()'),false);
     assert(await evaluate('(()=>{document.querySelector("textarea").value="Lançamento no equipamento errado";return document.querySelector("form").checkValidity()})()'));
    }
    fs.writeFileSync(path.join(directory,name+'-'+width+'.png'),Buffer.from((await send('Page.captureScreenshot',{captureBeyondViewport:true})).data,'base64'));
   }
  }
  console.log('PASS navegador: quatro componentes reais x desktop/390/320, datas/HH:mm, desconhecido e justificativa obrigatória, identificação da confirmação e ausência de overflow.');
 }finally{await send('Browser.close');socket.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
