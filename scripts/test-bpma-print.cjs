// Run after test-bpma-adjustments.cjs, with an isolated headless browser on port 9227.
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
  await navigate('hortifruti.html');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.screen-actions')).display`), 'flex');
  assert.equal(await evaluate(`document.querySelector('button').innerText`), 'Imprimir / Salvar PDF');
  assert.equal(await evaluate(`window.printCalls = 0; window.print = () => window.printCalls++; document.querySelector('button').click(); window.printCalls`), 1);
  fs.writeFileSync(path.join(directory, 'hortifruti-screen.png'), Buffer.from((await send('Page.captureScreenshot')).data, 'base64'));
  await send('Emulation.setEmulatedMedia', { media: 'print' });
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.screen-actions')).display`), 'none');
  const geometry = `JSON.stringify([...document.querySelectorAll('header, table, footer')].map(element => {
    const rect = element.getBoundingClientRect();
    return { tag: element.tagName, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }))`;
  const afterGeometry = await evaluate(geometry);
  const pdf = await send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true });
  fs.writeFileSync(path.join(directory, 'hortifruti.pdf'), Buffer.from(pdf.data, 'base64'));
  fs.writeFileSync(path.join(directory, 'hortifruti-print.png'), Buffer.from((await send('Page.captureScreenshot')).data, 'base64'));
  await navigate('hortifruti-before.html');
  assert.equal(await evaluate(geometry), afterGeometry, 'Header, tables and footer must retain the original print geometry');
  console.log('PASS: visible button, click invokes window.print, hidden in print, PDF generated, header/table/footer print geometry identical to original.');
  await send('Browser.close');
  socket.close();
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
