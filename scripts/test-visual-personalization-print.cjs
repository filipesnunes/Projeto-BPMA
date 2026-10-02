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
  const manifest=JSON.parse(fs.readFileSync(path.join(directory,'identity-report-fixtures.json'),'utf8'));
  const results=[];
  try {
    for(const module of manifest.modules) {
      let baselinePages;
      for(const kind of manifest.kinds) {
        const name=`identity-${module}-${kind}`;
        await send('Emulation.setEmulatedMedia',{media:'screen'});
        await navigate(name+'.html');
        await evaluate('Promise.all(Array.from(document.images).map(image=>image.decode()))');
        assert.equal(await evaluate('document.querySelector("button").innerText'),'Imprimir / Salvar PDF');
        if(kind !== 'default') {
          const logo=await evaluate(`(()=>{const image=document.querySelector('.report-hotel-logo');const rect=image.getBoundingClientRect();const box=image.parentElement.getBoundingClientRect();const cell=image.closest('td').getBoundingClientRect();return {width:rect.width,height:rect.height,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,centerX:Math.abs(rect.x+rect.width/2-box.x-box.width/2),centerY:Math.abs(rect.y+rect.height/2-box.y-box.height/2),contained:rect.x>=cell.x&&rect.right<=cell.right&&rect.y>=cell.y&&rect.bottom<=cell.bottom,fit:getComputedStyle(image).objectFit};})()`);
          assert(logo.width>0&&logo.height>0);assert(Math.abs(logo.width/logo.height-logo.naturalWidth/logo.naturalHeight)<.02);
          assert(logo.centerX<1&&logo.centerY<1);assert(logo.contained);assert.equal(logo.fit,'contain');
          assert.equal(await evaluate('document.querySelector(".report-identity span").innerText'),'K Platz Hotel');
        }
        await send('Emulation.setEmulatedMedia',{media:'print'});
        assert.equal(await evaluate('getComputedStyle(document.querySelector(".screen-actions")).display'),'none');
        assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
        const pdf=Buffer.from((await send('Page.printToPDF',{preferCSSPageSize:true,printBackground:true})).data,'base64');
        const pages=(pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length;
        if(kind==='default')baselinePages=pages;else {
          assert.equal(pages,baselinePages,'Logo must preserve pagination');
          assert(/\/Subtype \/Image\b/.test(pdf.toString('latin1')),'Logo image is embedded in PDF');
          assert(/\/SMask\b/.test(pdf.toString('latin1')),'PNG transparency mask is present in PDF');
        }
        fs.writeFileSync(path.join(directory,name+'.pdf'),pdf);
        if(module==='plano-limpeza-semanal'&&['horizontal','square','vertical','transparent'].includes(kind)) {
          fs.writeFileSync(path.join(directory,name+'.png'),Buffer.from((await send('Page.captureScreenshot')).data,'base64'));
        }
        results.push({module,kind,pages,logoEmbedded:kind!=='default'});
      }
      console.log('PASS: '+module+' fallback + four logos, proportional/centered, PDF images/alpha, no overflow, unchanged pages.');
    }
    await navigate('identity-plano-limpeza-semanal-horizontal.html');
    const calls=await evaluate(`(async()=>{let calls=0;window.print=()=>calls++;document.querySelector('button').click();await new Promise(resolve=>setTimeout(resolve,100));return calls;})()`);
    assert.equal(calls,1,'Print button actually waits for image decoding and calls print');
    fs.writeFileSync(path.join(directory,'identity-print-results.json'),JSON.stringify(results,null,2));
  } finally {await send('Browser.close');socket.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
