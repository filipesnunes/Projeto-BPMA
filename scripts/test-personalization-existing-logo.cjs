// Real multipart decoding, permissions, actions and service; synthetic persistence only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const mocks = new Map();
const originalLoad = Module._load;
Module._load = function(name, parent, isMain) {
  if (mocks.has(name)) return mocks.get(name);
  if (name === 'server-only') return {};
  if (name.startsWith('@/')) name = path.join(root, 'src', name.slice(2));
  return originalLoad.call(this, name, parent, isMain);
};
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, file) => module._compile(
  ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true
  }}).outputText, file);
const load = file => require(path.join(root, file));
let config = null, actor, writes = 0, uploadValidations = 0;
class Redirect extends Error {}
mocks.set('next/navigation', {redirect(url) { throw new Redirect(url); }});
mocks.set('next/cache', {revalidatePath() {}});
mocks.set('@/lib/auth-session', {getCurrentUserForAction: async () => {
  if (!actor) throw new Error('Sessão inválida');
  return actor;
}});
mocks.set('@/lib/prisma', {prisma: {personalizacaoVisual: {
  findUnique: async () => structuredClone(config),
  upsert: async ({create, update}) => {
    writes++;
    config = structuredClone(config ? {...config, ...update} : create);
    return structuredClone(config);
  }
}}});
const upload = load('src/lib/image-upload.ts');
mocks.set('@/lib/image-upload', {parseImageUploadFromFormData: (...args) => {
  uploadValidations++;
  return upload.parseImageUploadFromFormData(...args);
}});
const actions = load('src/app/personalizacao/actions.ts');
const service = load('src/lib/visual-personalization.ts');
const initial = {status: 'idle', message: ''};
const fields = ['nomeUnidade', 'logoLargura', 'logoAlturaMaxima', 'corPrimaria',
  'corSecundaria', 'corDestaque', 'fonteAplicativo', 'tamanhoTexto', 'temaPadrao'];
const settings = {
  nomeUnidade: 'Unidade de teste', logoLargura: 180, logoAlturaMaxima: 80,
  corPrimaria: '#702c40', corSecundaria: '#efe1e6', corDestaque: '#a65d73',
  fonteAplicativo: 'INTER', tamanhoTexto: 'AMPLIADO', temaPadrao: 'AUTOMATICO'
};
function form(values = config ?? settings, file = new File([], '', {type: 'application/octet-stream'})) {
  const data = new FormData();
  for (const key of fields) data.set(key, String(values[key]));
  if (file !== null) data.set('logoHotel', file);
  return data;
}
async function multipart(data) {
  return new Request('http://localhost/personalizacao', {method: 'POST', body: data}).formData();
}
async function save(data) {
  const result = await actions.savePersonalizationAction(initial, await multipart(data));
  assert.equal(result.status, 'success', result.message);
}
function imageFields(value) {
  return {bytes: value.logoDados, mime: value.logoMimeType, name: value.logoNomeArquivo};
}
async function main() {
  const png = await sharp({create: {width: 160, height: 80, channels: 4,
    background: {r: 40, g: 90, b: 60, alpha: 0.5}}}).png().toBuffer();
  const originalImage = new File([png], 'original.png', {type: 'image/png'});
  for (const role of ['GERENTE', 'DEV']) {
    actor = {id: 7, perfil: role, perfilAcessoId: 1,
      permissoes: role === 'GERENTE' ? ['modulo.personalizacao.acessar'] : []};
    config = null;
    await save(form(settings, originalImage));
    const storedImage = imageFields(structuredClone(config));
    assert.deepEqual(Buffer.from(storedImage.bytes), png);
    const changes = [
      {corPrimaria: '#153149'}, {fonteAplicativo: 'ROBOTO'}, {temaPadrao: 'ESCURO'},
      {logoLargura: 200, logoAlturaMaxima: 100}, {nomeUnidade: 'Nova unidade'},
      {corSecundaria: '#dce7f0'}, {tamanhoTexto: 'COMPACTO'},
      {corPrimaria: '#245c45', corDestaque: '#508060', fonteAplicativo: 'ARIAL', temaPadrao: 'CLARO'}
    ];
    for (const change of changes) {
      const before = structuredClone(config);
      const payload = await multipart(form({...config, ...change}));
      assert.equal(payload.get('logoHotel'), '', 'Empty native file input becomes a string after multipart decoding');
      const validationCount = uploadValidations;
      const result = await actions.savePersonalizationAction(initial, payload);
      assert.equal(result.status, 'success', result.message);
      assert.equal(uploadValidations, validationCount, 'No upload validation without a new file');
      assert.deepEqual(imageFields(config), storedImage, 'Bytes, MIME and original filename preserved');
      for (const key of fields) assert.equal(config[key], change[key] ?? before[key], 'Preserved or changed: ' + key);
      assert.deepEqual(imageFields(await service.getVisualPersonalization()), storedImage, 'Reload retains image');
      assert.equal((await service.getReportIdentity()).logoDataUrl, 'data:image/png;base64,' + png.toString('base64'));
    }
    // Other encodings of an absent upload must also preserve the existing image.
    for (const file of [null, new File([], '', {type: 'application/octet-stream'})]) {
      assert.equal((await actions.savePersonalizationAction(initial, form(config, file))).status, 'success');
      assert.deepEqual(imageFields(config), storedImage);
    }
    for (const format of ['jpeg', 'webp']) {
      const bytes = await sharp(png)[format]().toBuffer();
      const before = structuredClone(config);
      await save(form(config, new File([bytes], 'replacement.' + format, {type: 'image/' + format})));
      assert.deepEqual(Buffer.from(config.logoDados), bytes);
      assert.equal(config.logoMimeType, 'image/' + format);
      assert.equal(config.logoNomeArquivo, 'replacement.' + format);
      for (const key of fields) assert.equal(config[key], before[key]);
    }
    for (const file of [
      new File([], 'empty.png', {type: 'image/png'}),
      new File(['invalid'], 'fake.png', {type: 'image/png'}),
      new File([png.subarray(0, 32)], 'truncated.png', {type: 'image/png'}),
      new File([png], 'mismatch.jpg', {type: 'image/jpeg'}),
      new File([Buffer.alloc(2 * 1024 * 1024 + 1)], 'large.png', {type: 'image/png'}),
      new File(['<svg/>'], 'vector.svg', {type: 'image/svg+xml'})
    ]) {
      const before = structuredClone(config), beforeWrites = writes;
      const result = await actions.savePersonalizationAction(initial, await multipart(form({...config, nomeUnidade: 'Must not save'}, file)));
      assert.equal(result.status, 'error');
      assert.equal(writes, beforeWrites, 'Invalid replacement performs no write');
      assert.deepEqual(config, before, 'Invalid replacement preserves all settings and existing image');
    }
    const beforeRemoval = structuredClone(config);
    await assert.rejects(() => actions.removeLogoAction(new FormData()), Redirect);
    assert.deepEqual(imageFields(config), {bytes: null, mime: null, name: null});
    for (const key of fields) assert.equal(config[key], beforeRemoval[key]);
    await save(form(config, originalImage));
    assert.deepEqual(imageFields(config), storedImage, 'New upload after explicit removal');
    await assert.rejects(() => actions.restoreDefaultsAction(new FormData()), Redirect);
    assert.deepEqual(imageFields(config), {bytes: null, mime: null, name: null});
    assert.equal(config.nomeUnidade, null);
    assert.equal(config.corPrimaria, '#0f172a');
    console.log('PASS: ' + role + ': multipart empty input, independent settings, reload, replacement, atomic rejection, removal and restoration.');
  }
  for (const denied of [null, {id: 8, perfil: 'NUTRICIONISTA'}, {id: 8, perfil: 'COLABORADOR'},
    {id: 8, perfil: 'GERENTE', perfilAcessoId: 1, permissoes: []}]) {
    actor = denied;
    const before = writes;
    await assert.rejects(() => actions.savePersonalizationAction(initial, form(settings)));
    assert.equal(writes, before);
  }
  console.log('PASS: real server authorization still denies missing session, other roles and revoked permission; no database connection.');
}
main().catch(error => {console.error(error); process.exitCode = 1;});
