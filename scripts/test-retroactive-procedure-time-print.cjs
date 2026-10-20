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
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
  try {
    for(const filename of ['retroactive-time-known.html','retroactive-time-unknown.html','retroactive-temperature-form.html']){
      await navigate(filename);
      for(const width of [1200,390,320]){
        await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
        assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'No horizontal overflow: '+filename);
        if(filename.includes('unknown')){
          assert.equal(await evaluate('document.querySelector("input[type=checkbox]").checked'),true);
          assert.equal(await evaluate('document.querySelector("textarea").required'),true);
          assert.equal(await evaluate('document.querySelector("input[type=time]")===null'),true);
        }else{
          assert.equal(await evaluate('Array.from(document.querySelectorAll("input[type=time]")).every(input=>input.required&&!input.readOnly)'),true);
        }
        fs.writeFileSync(path.join(directory,filename.replace('.html','-'+width+'.png')),Buffer.from((await send('Page.captureScreenshot')).data,'base64'));
      }
    }
    await send('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false});
    for(const [filename,values] of [
      ['retroactive-temperature.html',['07:35','14:47','Horário não informado','Anotação original sem horário legível.']],
      ['retroactive-hortifruti.html',['08:10','08:25','Horário não informado','horários não anotados.']]
    ]){
      await navigate(filename);await evaluate('Promise.all(Array.from(document.images).map(image=>image.decode()))');
      for(const value of values)assert.equal(await evaluate('document.body.innerText.includes('+JSON.stringify(value)+')'),true);
      await send('Emulation.setEmulatedMedia',{media:'print'});
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
      fs.writeFileSync(path.join(directory,filename.replace('.html','.png')),Buffer.from((await send('Page.captureScreenshot')).data,'base64'));
      if(filename.includes('temperature')){
        await evaluate('Array.from(document.querySelectorAll("tr")).find(row=>row.innerText.includes("Horário não informado")).scrollIntoView({block:"center"})');
        fs.writeFileSync(path.join(directory,'retroactive-temperature-unknown.png'),Buffer.from((await send('Page.captureScreenshot')).data,'base64'));
        await evaluate('document.querySelector(".time-notes").scrollIntoView({block:"center"})');
        fs.writeFileSync(path.join(directory,'retroactive-temperature-justification.png'),Buffer.from((await send('Page.captureScreenshot')).data,'base64'));
      }
      const pdf=Buffer.from((await send('Page.printToPDF',{preferCSSPageSize:true,printBackground:true})).data,'base64');
      assert(pdf.length>10000);assert((pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length>0);
      fs.writeFileSync(path.join(directory,filename.replace('.html','.pdf')),pdf);
      const count=await evaluate('(async()=>{let count=0;window.print=()=>count++;document.querySelector("button").click();await new Promise(resolve=>setTimeout(resolve,100));return count})()');
      assert.equal(count,1,'Actual print button waits for images and calls print');
      await send('Emulation.setEmulatedMedia',{media:'screen'});
    }
    console.log('PASS browser: three real form fixtures at desktop/390/320px, manual time inputs, required unknown justification, no horizontal overflow; two real monthly reports with exact times/reasons, PDF generation and print-button execution.');
  }finally{await send('Browser.close');socket.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
