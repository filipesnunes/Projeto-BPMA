// Regression checks using the real pages/actions and an isolated in-memory data
// adapter. No environment file, database connection or operational upload is used.
// Run: node scripts/test-bpma-adjustments.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const originalLoad = Module._load;
const mocks = new Map();
Module._load = function (name, parent, isMain) {
  if (mocks.has(name)) return mocks.get(name);
  if (name === 'server-only') return {};
  if (name.startsWith('@/')) name = path.join(root, 'src', name.slice(2));
  return originalLoad.call(this, name, parent, isMain);
};
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
    }).outputText;
    module._compile(source, filename);
  };
}
const actor = { id: 1, nomeCompleto: 'Teste', nomeUsuario: 'teste', perfil: 'ADMIN' };
class Redirect extends Error { constructor(url) { super('redirect'); this.url = url; } }
mocks.set('next/cache', { revalidatePath() {} });
mocks.set('next/navigation', { redirect(url) { throw new Redirect(url); } });
mocks.set('@/lib/redirect-error', { rethrowIfRedirectError(error) { if (error instanceof Redirect) throw error; } });
mocks.set('@/lib/auth-session', { getCurrentUser: async () => actor, getCurrentUserForAction: async () => actor, requireAuthenticatedUser: async () => actor });
mocks.set('@/lib/authz', { ensurePermission() {} });
mocks.set('@/lib/permissions', { hasPermission: () => true, hasAnyPermission: () => true, canEditRecordDate: () => true });
mocks.set('@/lib/module-signatures', { canSignModuleDay: () => true, canSignModuleMonthlyClosure: () => true });
const data = (day) => new Date(`${day}T00:00:00Z`);
const fixtures = [
  { id: 1, data: data('2025-07-05'), responsavel: 'Ana', hortifruti: 'Alface' },
  { id: 2, data: data('2026-07-31'), responsavel: 'Ana', hortifruti: 'Couve' },
  { id: 3, data: data('2026-07-01'), responsavel: 'Bruno', hortifruti: 'Alface' },
  { id: 4, data: data('2026-08-01'), responsavel: 'Ana', hortifruti: 'Alface' },
  { id: 5, data: data('2024-02-29'), responsavel: 'Ana', hortifruti: 'Alface' }
].map((row) => ({ ...row, dataExecucao: row.data, produtoUtilizado: 'Sanitizante',
  inicioProcesso: '08:00', terminoProcesso: '08:15', duracaoMinutos: 15, observacoes: '' }));
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some((clause) => matches(row, clause));
    if (key === 'AND') return (Array.isArray(value) ? value : [value]).every((clause) => matches(row, clause));
    if (value instanceof Date) return +row[key] === +value;
    if (value && typeof value === 'object') {
      if (value.gte && row[key] < value.gte) return false;
      if (value.lte && row[key] > value.lte) return false;
      if (value.contains && !String(row[key]).toLowerCase().includes(value.contains.toLowerCase())) return false;
      if (value.in && !value.in.includes(row[key])) return false;
      return true;
    }
    return row[key] === value;
  });
}
let config = null;
let temperatureRecords = [];
let calls = [];
let interceptModel = null;
const captured = new Error('captured query');
let classification = 'ALERTA';
const adapter = new Proxy({}, { get(_target, model) {
  return {
    async aggregate() { return { _min: { data: data('2024-02-29'), dataExecucao: data('2024-02-29'), createdAt: data('2024-02-01') }, _max: { data: data('2026-08-01'), dataExecucao: data('2026-08-01') } }; },
    async findMany(args = {}) {
      calls.push({ model, args });
      if (model === interceptModel) throw captured;
      if (model === 'higienizacaoHortifruti') return fixtures.filter((row) => matches(row, args.where));
      if (model === 'controleTemperaturaCategoriaRegra') return [{ id: 1, categoria: { categoria: 'REFRIGERACAO' }, ordem: 1, temperaturaMin: -100, temperaturaMax: 100, status: classification, acaoCorretiva: 'Verificar equipamento', isActive: true }];
      if (model === 'controleTemperaturaEquipamentoOpcao') return [{ id: 1, nome: 'Geladeira', tipo: 'EQUIPAMENTO', categoriaEquipamento: 'REFRIGERACAO', ativo: true, turnoManha: true, turnoTarde: true }];
      if (model === 'higienizacaoHortifrutiOpcao') return [{ tipo: 'HORTIFRUTI', nome: 'Alface' }, { tipo: 'PRODUTO_UTILIZADO', nome: 'Sanitizante' }];
      if (model === 'controleQualidadeOleoOpcaoFita') return [{ id: 1, nome: 'Fita teste', ativo: true }];
      return [];
    },
    async findFirst() { return null; },
    async findUnique(args) {
      if (model === 'moduloConfiguracao') return config;
      if (model === 'controleTemperaturaEquipamento') return temperatureRecords.find((row) => row.id === args.where.id) ?? null;
      return null;
    },
    async upsert(args) {
      assert.equal(model, 'moduloConfiguracao');
      config = { ...(config ?? args.create), ...args.update };
      return config;
    },
    async create(args) {
      assert.equal(model, 'controleTemperaturaEquipamento');
      const row = { id: temperatureRecords.length + 1, ...args.data };
      temperatureRecords.push(row); return row;
    },
    async update(args) {
      assert.equal(model, 'controleTemperaturaEquipamento');
      const row = temperatureRecords.find((row) => row.id === args.where.id);
      Object.assign(row, args.data); return row;
    }
  };
} });
mocks.set('@/lib/prisma', { prisma: adapter });
let storedImages = 0;
mocks.set('@/lib/local-image-storage', { async saveTemperatureEquipmentEvidenceImage(image) {
  storedImages++; return { url: `/test/photo-${storedImages}.png`, mimeType: image.mimeType, size: image.size, createdAt: new Date() };
} });
const catalogPath = path.join(root, 'src/app/controle-temperatura-equipamentos/catalog.ts');
require.cache[catalogPath] = { exports: {
  findCatalogOptionByName: async () => ({ nome: 'Geladeira', categoriaEquipamento: 'REFRIGERACAO', turnoManha: true, turnoTarde: true }),
  getCategoryParameterByCategory: async () => ({ id: 1 })
} };
function load(file) { return require(path.join(root, file)); }
async function actionResult(action, form) {
  try { await action(form); assert.fail('Expected action redirect'); }
  catch (error) { if (!(error instanceof Redirect)) throw error; return new URL(error.url, 'http://localhost').searchParams; }
}
function formForPhoto(withPhoto, id) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ equipamento: 'Geladeira', temperaturaAferida: '12', turno: 'MANHA', statusOperacionalEquipamento: 'EM_OPERACAO', ...(id ? { id: String(id) } : {}) })) form.set(key, value);
  if (withPhoto) form.set('fotoDesvio', new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64')], 'evidencia.png', { type: 'image/png' }));
  return form;
}
async function main() {
  const filters = load('src/lib/month-filter.ts');
  for (const input of ['', ' ', '0', 'NaN', '13', '-1', '7x', '7.5']) assert.equal(filters.parseFilterMonth(input), null);
  for (const input of ['', '0', 'NaN', '2026x', '2026.5', '999999']) assert.equal(filters.parseFilterYear(input), null);
  assert.equal(filters.parseFilterMonth('7'), 7);
  assert.equal(filters.parseFilterYear('2026'), 2026);
  assert.deepEqual(filters.getMonthRangesForBounds(7, null, null), []);
  assert.equal(filters.getMonthRangesForBounds(2, data('2024-02-29'), data('2024-02-29'))[0].end.toISOString(), '2024-02-29T00:00:00.000Z');
  const history = load('src/app/higienizacao-hortifruti/historico/page.tsx').default;
  const cases = [
    [{}, [1, 2, 3, 4, 5]],
    [{ filtroMes: '7' }, [1, 2, 3]],
    [{ filtroAno: '2026' }, [2, 3, 4]],
    [{ filtroMes: '7', filtroAno: '2026' }, [2, 3]],
    [{ filtroMes: '7', filtroResponsavel: 'Ana' }, [1, 2]],
    [{ filtroAno: '2026', filtroResponsavel: 'Ana' }, [2, 4]],
    [{ filtroMes: '7', filtroAno: '2026', filtroResponsavel: 'Ana' }, [2]],
    [{ filtroMes: '', filtroAno: '', filtroResponsavel: '' }, [1, 2, 3, 4, 5]],
    [{ filtroMes: '12' }, []],
    [{ filtroMes: '8', filtroAno: '2026' }, [4]],
    [{ filtroMes: '7', filtroAno: '2025' }, [1]],
    [{ filtroMes: '2' }, [5]],
    [{ filtroMes: '7', filtroHortifruti: 'Alface' }, [1, 3]]
  ];
  for (const [params, expected] of cases) {
    calls = [];
    await history({ searchParams: Promise.resolve(params) });
    const query = calls.find((call) => call.model === 'higienizacaoHortifruti');
    assert.deepEqual(fixtures.filter((row) => matches(row, query.args.where)).map((row) => row.id), expected, JSON.stringify(params));
  }
  console.log('PASS: 13 history filter scenarios, including combinations, clear, leap day and multiple years.');
  const pages = [
    ['higienizacao-hortifruti', 'higienizacaoHortifruti'],
    ['controle-temperatura-equipamentos', 'controleTemperaturaEquipamento'],
    ['controle-temperatura-equipamentos/historico', 'controleTemperaturaEquipamento'],
    ['controle-qualidade-oleo', 'controleQualidadeOleoRegistro'],
    ['controle-qualidade-oleo/historico', 'controleQualidadeOleoRegistro'],
    ['controle-buffet-amostras/historico', 'controleBuffetAmostraRegistro'],
    ['rastreabilidade-recebimento/historico', 'rastreabilidadeRecebimentoNota'],
    ['plano-limpeza/diario', 'planoLimpezaDiarioRegistro'],
    ['plano-limpeza/diario/historico', 'planoLimpezaDiarioRegistro'],
    ['plano-limpeza/semanal', 'planoLimpezaSemanalExecucao'],
    ['plano-limpeza/semanal/historico', 'planoLimpezaSemanalExecucao']
  ];
  for (const [page, model] of pages) {
    interceptModel = model; calls = [];
    try { await load(`src/app/${page}/page.tsx`).default({ searchParams: Promise.resolve({ filtroMes: '7' }) }); }
    catch (error) { if (error !== captured) throw error; }
    const query = calls.find((call) => call.model === model);
    assert(query, page);
    assert.deepEqual(fixtures.filter((row) => matches(row, query.args.where)).map((row) => row.id), [1, 2, 3], page);
  }
  interceptModel = null;
  console.log('PASS: month-only query execution across all 12 affected pages.');
  const allFilterPages = [['higienizacao-hortifruti/historico', 'higienizacaoHortifruti'], ...pages];
  const changedPages = new Set(['higienizacao-hortifruti', 'controle-temperatura-equipamentos', 'controle-qualidade-oleo', 'plano-limpeza/diario']);
  for (const [pagePath, model] of allFilterPages) {
    const renderPage = load(`src/app/${pagePath}/page.tsx`).default;
    const render = (params) => renderPage({ searchParams: Promise.resolve(params) });
    const field = (tree, name) => findElement(tree, node => node.props?.name === name);
    const assertEmpty = (tree) => {
      for (const name of ['filtroData', 'filtroMes', 'filtroAno']) assert.equal(field(tree, name)?.props.defaultValue, '', `${pagePath}: ${name} must start empty`);
    };
    assertEmpty(await render({}));
    assertEmpty(await render({})); // Refresh without query parameters.
    for (const [params, expected] of [
      [{ filtroMes: '7' }, [1, 2, 3]],
      [{ filtroAno: '2026' }, [2, 3, 4]],
      [{ filtroMes: '7', filtroAno: '2026' }, [2, 3]],
      [{ filtroData: '2026-07-31' }, pagePath.includes('/semanal') ? [2, 4] : [2]]
    ]) {
      calls = [];
      const tree = await render(params);
      assert.equal(field(tree, 'filtroData').props.defaultValue, params.filtroData ?? '', `${pagePath}: month/year must not populate Data`);
      const query = calls.find(call => call.model === model);
      assert.deepEqual(fixtures.filter(row => matches(row, query.args.where)).map(row => row.id), expected, `${pagePath}: ${JSON.stringify(params)}`);
      const clear = findElement(tree, node => node.props?.href && node.props.children === 'Limpar');
      assert(clear, `${pagePath}: clear link`);
      const cleanUrl = new URL(clear.props.href, 'http://localhost');
      for (const name of ['filtroData', 'filtroMes', 'filtroAno']) assert.equal(cleanUrl.searchParams.has(name), false);
      assertEmpty(await render(Object.fromEntries(cleanUrl.searchParams)));
    }
    if (changedPages.has(pagePath)) {
      calls = [];
      await render({});
      const query = calls.find(call => call.model === model);
      assert.deepEqual(fixtures.filter(row => matches(row, query.args.where)).map(row => row.id), [1, 2, 3, 4, 5], `${pagePath}: no automatic date restriction`);
      calls = [];
      await render({ filtroData: '2026-07-31', filtroResponsavel: 'Ana' });
      const combined = calls.find(call => call.model === model).args.where;
      assert.equal(combined.data.toISOString(), '2026-07-31T00:00:00.000Z');
      assert.equal(combined[pagePath === 'plano-limpeza/diario' ? 'assinaturaResponsavel' : 'responsavel'].contains, 'Ana');
      actor.perfil = 'COLABORADOR';
      calls = [];
      await render({});
      assert.equal(calls.find(call => call.model === model).args.where.data, undefined, `${pagePath}: collaborator must not inject today's date`);
      actor.perfil = 'ADMIN';
    }
  }
  const dates = load('src/lib/date-time.ts');
  const todayInput = dates.formatAppDateInput(dates.getAppDate());
  const hortifrutiNew = await load('src/app/higienizacao-hortifruti/page.tsx').default({ searchParams: Promise.resolve({ new: '1', filtroMes: '7' }) });
  assert.equal(findElement(hortifrutiNew, node => node.props?.name === 'data').props.defaultValue, todayInput);
  const daily = await load('src/app/plano-limpeza/diario/page.tsx').default({ searchParams: Promise.resolve({}) });
  const sync = findElement(daily, node => node.type?.name === 'DailyChecklistSync');
  assert.equal(sync.props.date, todayInput, 'Today checklist creation remains separate from list filters');
  for (const module of ['controle-temperatura-equipamentos', 'controle-qualidade-oleo']) {
    const moduleActions = load(`src/app/${module}/actions.ts`);
    const tree = await load(`src/app/${module}/page.tsx`).default({ searchParams: Promise.resolve({ new: '1', filtroMes: '7' }) });
    const form = findElement(tree, node => node.type === 'form' && node.props.action === moduleActions.createRegistroAction);
    assert(form, `${module}: new record form must be available`);
    assert(findElement(form, node => node.type === 'p' && typeof node.props.children === 'string' && node.props.children.startsWith(dates.formatAppDate(dates.getAppDate()))), `${module}: new record displays today despite month filter`);
    const returnTo = findElement(form, node => node.props?.name === 'returnTo').props.value;
    assert.equal(new URL(returnTo, 'http://localhost').searchParams.has('filtroData'), false, `${module}: return URL must not reintroduce today`);
  }
  console.log('PASS: new Temperature/Oil forms keep today and their return URLs do not inject a date filter.');
  console.log('PASS: all 12 pages start/refresh/clear with empty Data, month and year; explicit dates and combinations work; new Hortifruti date and daily checklist remain today.');
  const actions = load('src/app/controle-temperatura-equipamentos/actions.ts');
  const settings = load('src/app/controle-temperatura-equipamentos/settings.ts');
  assert.equal(await settings.getExigirFotoEmAlertaCritico(), true);
  for (const enabled of [true, false]) {
    const form = new FormData(); form.set('exigirFotoEmAlertaCritico', String(enabled));
    assert.equal((await actionResult(actions.updatePhotoRequirementAction, form)).get('feedbackType'), 'success');
    assert.equal(await settings.getExigirFotoEmAlertaCritico(), enabled);
    for (const status of ['ALERTA', 'CRITICO', 'CONFORME']) {
      classification = status;
      for (const withPhoto of [false, true]) {
        const before = temperatureRecords.length;
        const result = await actionResult(actions.createRegistroAction, formForPhoto(withPhoto));
        const blocked = enabled && status !== 'CONFORME' && !withPhoto;
        assert.equal(result.get('feedbackType'), blocked ? 'error' : 'success', `${enabled}/${status}/${withPhoto}: ${result.get('feedback')}`);
        assert.equal(temperatureRecords.length, before + (blocked ? 0 : 1));
        if (!blocked) {
          const row = temperatureRecords.at(-1);
          assert.equal(Boolean(row.fotoUrl), withPhoto);
          assert.equal(row.status, status);
          assert.equal(row.acaoCorretiva, 'Verificar equipamento');
          assert.equal(row.turno, 'MANHA');
          assert.equal(row.responsavel, 'Teste');
          assert.equal(dates.formatAppDateInput(row.data), todayInput, 'New temperature record keeps today');
        }
      }
    }
  }
  classification = 'ALERTA';
  const withExistingPhoto = temperatureRecords.find((row) => row.fotoUrl);
  const existingUrl = withExistingPhoto.fotoUrl;
  assert.equal((await actionResult(actions.updateRegistroAction, formForPhoto(false, withExistingPhoto.id))).get('feedbackType'), 'success');
  assert.equal(withExistingPhoto.fotoUrl, existingUrl);
  const noPhoto = temperatureRecords.find((row) => !row.fotoUrl);
  config.exigirFotoEmAlertaCritico = true;
  assert.equal((await actionResult(actions.updateRegistroAction, formForPhoto(false, noPhoto.id))).get('feedbackType'), 'error');
  assert.equal((await actionResult(actions.updateRegistroAction, formForPhoto(true, noPhoto.id))).get('feedbackType'), 'success');
  const images = load('src/lib/image-upload.ts');
  assert.equal(images.hasStoredImage({ url: noPhoto.fotoUrl }), true);
  assert.equal(images.getStoredImageSrc({ url: withExistingPhoto.fotoUrl }), existingUrl);
  console.log('PASS: configuration persistence/default, 12 photo creation scenarios, edit blocking, optional upload and preservation of existing photos.');
  function findElement(node, predicate) {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) return node.map((child) => findElement(child, predicate)).find(Boolean) ?? null;
    if (predicate(node)) return node;
    return findElement(node.props?.children, predicate);
  }
  const temperaturePage = load('src/app/controle-temperatura-equipamentos/page.tsx').default;
  const optionsPage = load('src/app/controle-temperatura-equipamentos/opcoes/page.tsx').default;
  const { ImageUploadField } = load('src/components/forms/image-upload-field.tsx');
  for (const enabled of [true, false]) {
    config.exigirFotoEmAlertaCritico = enabled;
    const page = await temperaturePage({ searchParams: Promise.resolve({ new: '1' }) });
    const upload = findElement(page, (node) => node.type === ImageUploadField);
    assert(upload, 'Photo input remains available');
    assert.deepEqual(upload.props.requiredStatusValues, enabled ? ['ALERTA', 'CRITICO'] : []);
    assert.deepEqual(upload.props.disabledStatusValues, ['MANUTENCAO', 'INATIVO']);
    const options = await optionsPage({ searchParams: Promise.resolve({}) });
    const select = findElement(options, (node) => node.type === 'select' && node.props.name === 'exigirFotoEmAlertaCritico');
    assert.equal(select.props.defaultValue, String(enabled));
  }
  console.log('PASS: real temperature form and Gerenciar reflect both persisted configuration states.');
  const { NextRequest } = require('next/server');
  const route = load('src/app/relatorios/higienizacao-hortifruti/mensal/route.ts');
  const response = await route.GET(new NextRequest('http://localhost/relatorios/higienizacao-hortifruti/mensal?mes=7&ano=2026'));
  assert.equal(response.status, 200);
  const html = await response.text();
  assert(html.includes('Imprimir / Salvar PDF'));
  assert(html.includes('onclick="window.print()"'));
  assert.match(html, /@media print\s*\{\s*\.screen-actions\s*\{\s*display: none/);
  fs.mkdirSync(path.join(root, '.data/validation'), { recursive: true });
  fs.writeFileSync(path.join(root, '.data/validation/hortifruti.html'), html);
  // Render the same route using the original renderer for print-layout comparison.
  const { execFileSync } = require('node:child_process');
  const originalSource = execFileSync('git', ['show', 'HEAD:src/lib/monthly-sanitary-report.ts'], { cwd: root, encoding: 'utf8' });
  const originalModule = new Module(path.join(root, '.data/validation/original-report.cjs'));
  originalModule.filename = path.join(root, '.data/validation/original-report.cjs');
  originalModule._compile(ts.transpileModule(originalSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, originalModule.filename);
  load('src/lib/monthly-sanitary-report.ts').renderMonthlySanitaryReportDocument = originalModule.exports.renderMonthlySanitaryReportDocument;
  const beforeResponse = await route.GET(new NextRequest('http://localhost/relatorios/higienizacao-hortifruti/mensal?mes=7&ano=2026'));
  fs.writeFileSync(path.join(root, '.data/validation/hortifruti-before.html'), await beforeResponse.text());
  console.log('PASS: actual monthly report route returns printable HTML; fixture saved for browser validation.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
