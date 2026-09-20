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
  for (const name of ['buffet-client','temperature-client','hortifruti-client','oil-client']) {
    await send('Emulation.setEmulatedMedia', { media: 'screen' });
    await navigate(name + '.html');
    assert.equal(await evaluate('document.querySelector("button").innerText'), 'Imprimir / Salvar PDF');
    await send('Emulation.setEmulatedMedia', { media: 'print' });
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".screen-actions")).display'), 'none');
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, name + ': horizontal overflow');
    const pdf = Buffer.from((await send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true })).data, 'base64');
    fs.writeFileSync(path.join(directory, name + '.pdf'), pdf);
    fs.writeFileSync(path.join(directory, name + '.png'), Buffer.from((await send('Page.captureScreenshot')).data, 'base64'));
    const pages = (pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length;
    assert(pages > 0);
    if (name === 'temperature-client') {
      assert.equal(await evaluate('document.querySelector(".temperature-table").querySelectorAll("thead tr:last-child th").length'), 10);
      assert.equal(pages, 2, 'One A4 landscape page per equipment');
    }
    if (name === 'buffet-client') assert.equal(pages, 2, 'Preserved service/day pagination');
    console.log('PASS: ' + name + ', print controls hidden, no horizontal overflow, PDF pages=' + pages);
  }
  await send('Browser.close');
  socket.close();
}
main().catch((error) => { console.error(error); process.exit(1); });
