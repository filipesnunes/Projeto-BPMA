// Real actions, pages and report routes against an isolated in-memory adapter.
// No environment file, database connection, upload, seed or operational mutation.
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
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
  }).outputText, filename);
};
const load = (file) => require(path.join(root, file));
const actor = { id: 1, nomeCompleto: 'Responsável Teste', perfil: 'GERENTE' };
class Redirect extends Error { constructor(url) { super('redirect'); this.url = url; } }
mocks.set('next/cache', { revalidatePath() {} });
mocks.set('next/navigation', { redirect(url) { throw new Redirect(url); } });
mocks.set('@/lib/redirect-error', { rethrowIfRedirectError(e) { if (e instanceof Redirect) throw e; } });
mocks.set('@/lib/auth-session', { getCurrentUser: async () => actor, getCurrentUserForAction: async () => actor });
mocks.set('@/lib/authz', new Proxy({}, { get: () => async () => {} }));
mocks.set('@/lib/permissions', { hasPermission: () => true, hasAnyPermission: () => true, canEditRecordDate: () => true });
mocks.set('@/lib/rbac', { getRoleLabel: () => 'Teste', canAccessReports: () => true, canViewManagementSections: () => true, canManageModuleOptions: () => true, canDeleteOperationalRecords: () => true });
mocks.set('@/lib/image-upload', { parseImageUploadFromFormData: async () => null, hasStoredImage: () => false });
mocks.set('@/lib/local-image-storage', { saveTemperatureEquipmentEvidenceImage: async () => { throw Error('Unexpected upload'); } });
const dates = load('src/lib/date-time.ts');
const today = dates.getAppDate();
const date = (s) => new Date(`${s}T00:00:00Z`);
const tables = {};
const queries = [];
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some((clause) => matches(row, clause));
    if (key === 'AND') return (Array.isArray(value) ? value : [value]).every((clause) => matches(row, clause));
    if (key === 'NOT') return !matches(row, value);
    if (key === 'mes_ano') return row.mes === value.mes && row.ano === value.ano;
    if (value instanceof Date) return +row[key] === +value;
    if (value && typeof value === 'object') {
      if ('not' in value && row[key] === value.not) return false;
      if ('gte' in value && row[key] < value.gte) return false;
      if ('lte' in value && row[key] > value.lte) return false;
      if ('equals' in value && String(row[key]).toLowerCase() !== String(value.equals).toLowerCase()) return false;
      if ('in' in value && !value.in.includes(row[key])) return false;
      if ('contains' in value && !String(row[key]).toLowerCase().includes(value.contains.toLowerCase())) return false;
      return true;
    }
    return row[key] === value;
  });
}
function selected(row, select) {
  if (!row || !select) return row;
  return Object.fromEntries(Object.entries(select).filter(([,v]) => v).map(([key, value]) => [key,
    value === true ? row[key] : selected(row[key], value.select)]));
}
const prisma = new Proxy({}, { get(_target, model) {
  const rows = tables[model] ??= [];
  const find = (args = {}) => {
    queries.push({ model, ...args });
    let found = rows.filter((row) => matches(row, args.where));
    for (const order of [...(Array.isArray(args.orderBy) ? args.orderBy : args.orderBy ? [args.orderBy] : [])].reverse()) {
      const [key, direction] = Object.entries(order)[0];
      if (typeof direction !== 'string') continue;
      found.sort((a,b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * (direction === 'desc' ? -1 : 1));
    }
    if (args.take) found = found.slice(0, args.take);
    return found.map((row) => selected(row, args.select));
  };
  return {
    findMany: async (args) => find(args), findFirst: async (args) => find(args)[0] ?? null,
    findUnique: async (args) => find(args)[0] ?? null,
    count: async (args) => find(args).length,
    aggregate: async () => ({ _min: { data: today }, _max: { data: today } }),
    create: async ({data}) => { const row = { id: rows.length + 1, createdAt: new Date(), updatedAt: new Date(), ...data }; rows.push(row); return row; },
    update: async ({where,data}) => { const row = rows.find((r) => matches(r,where)); assert(row); Object.assign(row,data); return row; },
    delete: async ({where}) => { const index = rows.findIndex((r) => matches(r,where)); assert(index >= 0); return rows.splice(index,1)[0]; },
    upsert: async ({where,create,update}) => { let row = rows.find((r) => matches(r,where)); if (row) Object.assign(row,update); else { row = {id:rows.length+1,...create}; rows.push(row); } return row; }
  };
} });
mocks.set('@/lib/prisma', { prisma });
mocks.delete('@/lib/image-upload');
const { NextRequest } = require('next/server');
async function action(fn, values, expected = 'success') {
  const form = new FormData(); for (const [key,value] of Object.entries(values)) form.set(key,String(value));
  try { await fn(form); assert.fail('Expected redirect'); } catch(e) {
    if (!(e instanceof Redirect)) throw e;
    const params = new URL(e.url,'http://localhost').searchParams;
    assert.equal(params.get('feedbackType'),expected,params.get('feedback')); return params;
  }
}
function elements(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap((child) => elements(child,predicate));
  return [...(predicate(node) ? [node] : []), ...elements(node.props?.children,predicate)];
}
const outputDir = path.join(root,'.data/validation');
fs.mkdirSync(outputDir,{recursive:true});
async function report(module, month = 9, year = 2026) {
  const result = await load(`src/app/relatorios/${module}/mensal/route.ts`).GET(new NextRequest(`http://localhost/relatorios/${module}/mensal?mes=${month}&ano=${year}`));
  assert.equal(result.status,200); return result.text();
}
const reportModules = ['plano-limpeza-semanal','plano-limpeza-diario','controle-temperatura-equipamentos',
  'controle-buffet-amostras','higienizacao-hortifruti','controle-qualidade-oleo','rastreabilidade-recebimento'];
const form = (buffer,name='hotel.png',type='image/png',unit='K Platz Hotel') => {
  const f=new FormData();f.set('nomeUnidade',unit);if(buffer)f.set('logoHotel',new File([buffer],name,{type}));return f;
};
async function main() {
  const sharp = require('sharp');
  const service = load('src/lib/visual-personalization.ts');
  const {parseHotelLogo} = load('src/lib/hotel-logo-upload.ts');
  const {renderReportIdentity} = load('src/lib/report-identity.ts');
  const day=date('2026-09-01');
  tables.higienizacaoHortifruti=[{id:1,data:day,hortifruti:'Alface sintética',produtoUtilizado:'Produto sintético',inicioProcesso:'08:00',terminoProcesso:'08:02',duracaoMinutos:2,responsavel:'Responsável sintético'}];
  tables.controleTemperaturaEquipamentoOpcao=['Equipamento A','Equipamento B'].map((nome,i)=>({id:i+1,nome,tipo:'EQUIPAMENTO',ativo:true}));
  tables.controleTemperaturaEquipamento=['Equipamento A','Equipamento B'].map((equipamento,i)=>({id:i+1,data:day,createdAt:new Date('2026-09-01T11:17:00Z'),equipamento,turno:'MANHA',statusOperacionalEquipamento:'EM_OPERACAO',temperaturaAferida:4,status:'CONFORME',acaoCorretiva:'Orientação sintética preservada',responsavel:'Responsável sintético'}));
  tables.controleBuffetAmostraRegistro=[{id:1,data:day,dataHoraRegistro:day,itemNome:'Bolo sintético',itemExtra:false,status:'PREENCHIDO',servico:{nome:'Café',ordem:1},item:{ordem:1},primeiraTc:65,tcEquipamento:80,responsavelNome:'Responsável sintético'}];
  tables.controleQualidadeOleo=[{id:1,data:day,fitaOleo:null,temperatura:150,responsavel:'Responsável sintético',orientacao:'Orientação sintética preservada',observacao:'Sem fita'}];
  tables.rastreabilidadeRecebimentoRegistro=[{id:1,data:day,produto:'Produto sintético',fornecedor:'Fornecedor sintético',notaFiscal:'123',lote:'L1',dataFabricacao:date('2026-08-01'),dataValidade:date('2027-08-01'),semDataFabricacao:false,validadeNaoAplicavel:false,sif:'NA',quantidadeComprada:null,quantidadeTributavel:null,temperatura:4,temperaturaTipo:'NUMERICA',transporteEntregador:'CONFORME',aspectoSensorial:'CONFORME',embalagem:'CONFORME',responsavelRecebimento:'Responsável sintético'}];
  tables.planoLimpezaDiarioArea=[{id:1,nome:'Cozinha sintética',ordem:1,ativo:true,turnoManha:true,turnoTarde:true,itens:[{id:1,descricao:'Bancada',ordem:1,ativo:true,excluidoEm:null}]}];
  tables.planoLimpezaDiarioRegistro=[{id:1,data:day,turno:'MANHA',area:'Cozinha sintética',itemDescricao:'Bancada',assinaturaResponsavel:'Responsável sintético',assinaturaResponsavelNomeUsuario:'usuario-teste'}];
  tables.planoLimpezaSemanalArea=[{id:1,nome:'Cozinha sintética',ordem:1,ativo:true}];
  tables.planoLimpezaSemanalItem=[{id:1,area:'Cozinha sintética',oQueLimpar:'Bancada',ordem:1,ativo:true,excluidoEm:null}];
  tables.planoLimpezaSemanalExecucao=[{id:1,dataExecucao:day,area:'Cozinha sintética',itemId:1,itemDescricao:'Bancada',item:{oQueLimpar:'Bancada',ordem:1},status:'CONCLUIDO',assinaturaResponsavel:'Responsável sintético',assinaturaResponsavelNomeUsuario:'usuario-teste',assinaturaResponsavelDataHora:day,assinaturaSupervisor:'Supervisor sintético',assinaturaSupervisorNomeUsuario:'supervisor-teste',assinaturaSupervisorDataHora:day}];
  const moduleCodes=['limpeza_semanal','limpeza_diaria','temperatura','amostras','hortifruti','oleo','rastreabilidade'];
  tables.fechamentoMensalModulo=moduleCodes.map((moduloCodigo,i)=>({id:i+1,moduloCodigo,mes:9,ano:2026,status:'FECHADO',usuarioNomeSnapshot:'Supervisor sintético',assinadoEm:day}));
  tables.assinaturaDiariaModulo=moduleCodes.map((moduloCodigo,i)=>({id:i+1,moduloCodigo,dataReferencia:day,usuarioNomeSnapshot:'Supervisor sintético'}));
  const logos = {};
  for(const [kind,width,height] of [['horizontal',800,160],['square',240,240],['vertical',100,600],['transparent',300,160]]) {
    const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect x="${width*.1}" y="${height*.1}" width="${width*.8}" height="${height*.8}" rx="5" fill="#145c86"/><circle cx="${width*.5}" cy="${height*.5}" r="${Math.min(width,height)*.2}" fill="#6ad2c3"/></svg>`);
    logos[kind]=await sharp(svg).png().toBuffer();
    fs.writeFileSync(path.join(outputDir,`logo-${kind}.png`),logos[kind]);
  }
  const baseIdentity = await service.getReportIdentity();
  assert.equal(baseIdentity.logoDataUrl,null);assert.equal(baseIdentity.unitName,'Unidade não informada');
  process.env.STAYSAFE_UNIT_NAME='Nome existente';assert.equal((await service.getReportIdentity()).unitName,'Nome existente');delete process.env.STAYSAFE_UNIT_NAME;
  const baseline = {};
  const baselineQueries = {};
  for(const module of reportModules) {
    const queryStart=queries.length;
    baseline[module]=await report(module);
    baselineQueries[module]=JSON.stringify(queries.slice(queryStart).filter(q=>q.model!=='personalizacaoVisual'));
    assert(baseline[module].includes('<strong>StaySafe</strong>'));
    assert(baseline[module].includes('Unidade não informada'));
    assert(baseline[module].includes('Supervisor sintético'));
    fs.writeFileSync(path.join(outputDir,`identity-${module}-default.html`),baseline[module]);
  }
  const operationalSnapshot=JSON.stringify(Object.fromEntries(Object.entries(tables).filter(([name])=>name!=='personalizacaoVisual')));
  for(const [kind,buffer] of Object.entries(logos)) {
    const upload=await parseHotelLogo(form(buffer));assert.equal(upload.mimeType,'image/png');assert.deepEqual(upload.buffer,buffer);
    await service.saveVisualPersonalization(form(buffer,`${kind}.png`),7);
    const config=tables.personalizacaoVisual[0];
    assert.equal(tables.personalizacaoVisual.length,1);assert.equal(config.atualizadoPorUsuarioId,7);
    assert.deepEqual(Buffer.from(config.logoDados),buffer);
    assert.equal((await service.getReportIdentity()).unitName,'K Platz Hotel');
    // Fresh module load simulates another request/restart; persistence is in the adapter, not module state.
    delete require.cache[require.resolve(path.join(root,'src/lib/visual-personalization.ts'))];
    assert.equal((await load('src/lib/visual-personalization.ts').getReportIdentity()).logoDataUrl,`data:image/png;base64,${buffer.toString('base64')}`);
    for(const module of reportModules) {
      const queryStart=queries.length;
      const html=await report(module);
      assert.equal(JSON.stringify(queries.slice(queryStart).filter(q=>q.model!=='personalizacaoVisual')),baselineQueries[module]);
      assert(html.includes('class="report-hotel-logo"'));assert(html.includes('K Platz Hotel'));
      assert(html.includes(buffer.toString('base64')));assert(html.includes('object-fit: contain'));
      const baselineTitle=baseline[module].match(/<title>(.*?)<\/title>/)[1];
      assert.equal(html.match(/<title>(.*?)<\/title>/)[1],baselineTitle,'Title/month unchanged');
      fs.writeFileSync(path.join(outputDir,`identity-${module}-${kind}.html`),html);
    }
  }
  assert.equal(JSON.stringify(Object.fromEntries(Object.entries(tables).filter(([name])=>name!=='personalizacaoVisual'))),operationalSnapshot,'Operational records and signatures unchanged');
  for (const closure of tables.fechamentoMensalModulo) closure.status='REABERTO';
  for (const module of reportModules) {
    const html=await report(module);assert(html.includes('Reaberto'));
    fs.writeFileSync(path.join(outputDir,`identity-${module}-reopened.html`),html);
  }
  for (const closure of tables.fechamentoMensalModulo) closure.status='FECHADO';
  for (const [kind,width,height] of [['small',40,24],['large',240,120],['invalid',999,-1]]) {
    const sized=form(logos.transparent); sized.set('logoLargura',String(width)); sized.set('logoAlturaMaxima',String(height));
    await service.saveVisualPersonalization(sized,7);
    const expected=kind==='invalid'?{logoLargura:120,logoAlturaMaxima:56}:{logoLargura:width,logoAlturaMaxima:height};
    const identity=await service.getReportIdentity();
    assert.equal(identity.logoLargura,expected.logoLargura); assert.equal(identity.logoAlturaMaxima,expected.logoAlturaMaxima);
    for(const module of reportModules) {
      const html=await report(module);
      assert(html.includes(`style="width:${expected.logoLargura}px;height:${expected.logoAlturaMaxima}px"`));
      fs.writeFileSync(path.join(outputDir,`identity-${module}-${kind}.html`),html);
    }
  }
  for (const [module,reportId] of [['chamados-manutencao','chamados-periodo'],['geral','resumo-geral']]) {
    const tree=await load('src/app/relatorios/page.tsx').default({searchParams:Promise.resolve({module,report:reportId,generated:'1',mes:'9',ano:'2026'})});
    const result=elements(tree,node=>node.type?.name==='ReportResult')[0];assert(result);
    assert.equal(result.props.identity.unitName,'K Platz Hotel');assert(result.props.identity.logoDataUrl);
    const rendered=result.type(result.props);
    assert(elements(rendered,node=>node.type?.name==='ReportIdentityMark').length>0);
  }
  assert((await sharp(Buffer.from(tables.personalizacaoVisual[0].logoDados)).metadata()).hasAlpha);
  const jpeg=await sharp(logos.horizontal).flatten({background:'#fff'}).jpeg().toBuffer();
  const webp=await sharp(logos.square).webp().toBuffer();
  assert.equal((await parseHotelLogo(form(jpeg,'hotel.jpg','image/jpeg'))).mimeType,'image/jpeg');
  assert.equal((await parseHotelLogo(form(webp,'hotel.webp','image/webp'))).mimeType,'image/webp');
  for (const [kind,buffer,mime,extension] of [['jpeg',jpeg,'image/jpeg','jpg'],['webp',webp,'image/webp','webp']]) {
    const sized=form(buffer,`hotel.${extension}`,mime);sized.set('logoLargura','180');sized.set('logoAlturaMaxima','80');
    await service.saveVisualPersonalization(sized,7);
    for(const module of reportModules) fs.writeFileSync(path.join(outputDir,`identity-${module}-${kind}.html`),await report(module));
  }
  await service.saveVisualPersonalization(form(logos.transparent),7);
  const original=JSON.stringify(tables.personalizacaoVisual);
  for(const invalid of [form(Buffer.from('<script>evil</script>'),'fake.png'),
    form(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'),'hotel.svg','image/svg+xml'),
    form(logos.square,'mismatch.jpg','image/jpeg'),form(Buffer.alloc(2*1024*1024+1),'huge.png'),
    form(logos.square.subarray(0,45),'broken.png'),form(logos.square,'hotel.png','image/png','x'.repeat(121))]) {
    await assert.rejects(()=>service.saveVisualPersonalization(invalid,7));
    assert.equal(JSON.stringify(tables.personalizacaoVisual),original,'Invalid upload preserves prior configuration');
  }
  const empty=form(null);empty.set('logoHotel',new File([],'empty.png',{type:'image/png'}));
  await assert.rejects(()=>service.saveVisualPersonalization(empty,7));
  await service.saveVisualPersonalization(form(null,undefined,undefined,'Unidade atualizada'),8);
  assert.equal(tables.personalizacaoVisual[0].nomeUnidade,'Unidade atualizada');
  assert.deepEqual(Buffer.from(tables.personalizacaoVisual[0].logoDados),logos.transparent);
  await service.removeHotelLogo(8);assert.equal((await service.getReportIdentity()).logoDataUrl,null);
  assert.equal((await service.getReportIdentity()).unitName,'Unidade atualizada');
  const sizeBeforeRemoval={logoLargura:tables.personalizacaoVisual[0].logoLargura,logoAlturaMaxima:tables.personalizacaoVisual[0].logoAlturaMaxima};
  assert.equal((await service.getReportIdentity()).logoLargura,sizeBeforeRemoval.logoLargura,'Removing logo preserves size');
  await service.restoreVisualDefaults(8);assert.deepEqual(await service.getReportIdentity(),baseIdentity);
  const {normalizeLogoDimensions}=load('src/lib/logo-dimensions.ts');
  for(const invalid of [null,undefined,'200',NaN,Infinity,0,-2,999,120.5]) {
    assert.deepEqual(normalizeLogoDimensions({logoLargura:invalid,logoAlturaMaxima:invalid}),{logoLargura:120,logoAlturaMaxima:56});
  }
  // A rollout before the new migration reads the previous fields; unrelated errors propagate.
  const {Prisma}=require('@prisma/client');
  const oldRow={nomeUnidade:'Unidade legada',logoDados:logos.transparent,logoMimeType:'image/png',logoNomeArquivo:'legacy.png'};
  mocks.set('@/lib/prisma',{prisma:{personalizacaoVisual:{findUnique:async args=>{
    if(!args.select)throw new Prisma.PrismaClientKnownRequestError('Missing logoLargura',{code:'P2022',clientVersion:'6.5.0',meta:{column:'personalizacao_visual.logoLargura'}});
    assert(!('logoLargura' in args.select));assert(!('logoAlturaMaxima' in args.select));return oldRow;
  }}}});
  delete require.cache[require.resolve(path.join(root,'src/lib/visual-personalization.ts'))];
  const legacyService=load('src/lib/visual-personalization.ts');
  const legacyIdentity=await legacyService.getReportIdentity();
  assert.equal(legacyIdentity.unitName,'Unidade legada');assert(legacyIdentity.logoDataUrl);assert.equal(legacyIdentity.logoLargura,120);
  mocks.set('@/lib/prisma',{prisma:{personalizacaoVisual:{findUnique:async()=>{
    throw new Prisma.PrismaClientKnownRequestError('Missing nomeUnidade',{code:'P2022',clientVersion:'6.5.0',meta:{column:'personalizacao_visual.nomeUnidade'}});
  }}}});
  delete require.cache[require.resolve(path.join(root,'src/lib/visual-personalization.ts'))];
  await assert.rejects(()=>load('src/lib/visual-personalization.ts').getReportIdentity(),e=>e.code==='P2022');
  mocks.set('@/lib/prisma',{prisma});
  const appearance=load('src/lib/appearance-settings.ts');
  const branded=form(logos.transparent);
  const settings={corPrimaria:'#702c40',corSecundaria:'#efe1e6',corDestaque:'#a65d73',fonteAplicativo:'INTER',tamanhoTexto:'AMPLIADO',temaPadrao:'AUTOMATICO'};
  for(const [key,value] of Object.entries(settings))branded.set(key,value);
  await service.saveVisualPersonalization(branded,7);
  assert.deepEqual(await service.getAppAppearance(),settings);
  assert.equal((await service.getReportIdentity()).unitName,'K Platz Hotel');
  const originalSettings=JSON.stringify(tables.personalizacaoVisual);
  for(const [key,value] of [['corPrimaria','#fff'],['corSecundaria','red; background:url(evil)'],['corDestaque','javascript:evil'],['fonteAplicativo','UPLOAD'],['tamanhoTexto','999'],['temaPadrao','INVALIDO']]) {
    const bad=form(null);for(const [k,v] of Object.entries(settings))bad.set(k,v);bad.set(key,value);
    await assert.rejects(()=>service.saveVisualPersonalization(bad,7));
    assert.equal(JSON.stringify(tables.personalizacaoVisual),originalSettings,'Invalid appearance is rejected atomically');
  }
  const css=appearance.appearanceCss(settings);
  assert(css.includes('--btn-primary-bg:#702c40'));assert(!css.includes('--btn-danger'));assert(!css.includes('--btn-action'));assert(!css.includes('success'));
  for(const palette of appearance.APPEARANCE_PALETTES) {
    const colors=appearance.normalizeAppearance(palette);
    for(const color of [colors.corPrimaria,colors.corSecundaria])assert(['#ffffff','#000000'].includes(appearance.contrastingText(color)));
  }
  await service.removeHotelLogo(7);assert.deepEqual(await service.getAppAppearance(),settings);
  await service.restoreVisualDefaults(7);assert.deepEqual(await service.getAppAppearance(),appearance.DEFAULT_APPEARANCE);
  const escaped=renderReportIdentity({unitName:'<script>"&</script>',logoDataUrl:'javascript:evil'});
  assert(!escaped.includes('<script>'));assert(!escaped.includes('javascript:'));assert(escaped.includes('&lt;script&gt;'));
  let hookValues=[],hookCursor=0;
  mocks.set('react',{...require('react'),useState(initial) {
    const index=hookCursor++;if(!(index in hookValues))hookValues[index]=initial;
    return [hookValues[index],value=>{hookValues[index]=value;}];
  },useActionState:(_action,initial)=>[initial,()=>{}],useEffect:()=>{}});
  mocks.set('next/navigation',{useRouter:()=>({refresh(){}})});
  const {PersonalizationForm}=load('src/app/personalizacao/personalization-form.tsx');
  const draw=()=>{hookCursor=0;return PersonalizationForm({logoDataUrl:null,fileName:null,unitName:'',fallbackUnitName:'Unidade não informada',previewMonth:'OUTUBRO 2026',saveAction:async()=>({status:'success',message:'Teste'}),removeAction:async()=>{},resetAction:async()=>{}});};
  let ui=draw();
  const uploadField=elements(ui,node=>node.type?.name==='ImageUploadField')[0];
  assert.equal(uploadField.props.maxBytes,2*1024*1024);assert.equal(uploadField.props.previewImageClassName,'max-h-44 max-w-full object-contain');
  uploadField.props.onPreviewChange('blob:synthetic-logo');
  elements(ui,node=>node.props?.name==='nomeUnidade')[0].props.onChange({currentTarget:{value:'K Platz Hotel'}});
  ui=draw();const preview=elements(ui,node=>node.type?.name==='ReportIdentityMark')[0];
  assert.deepEqual(preview.props.identity,{unitName:'K Platz Hotel',logoDataUrl:'blob:synthetic-logo',logoLargura:120,logoAlturaMaxima:56});
  elements(ui,node=>node.props?.name==='logoLargura')[0].props.onChange({currentTarget:{value:'200'}});
  elements(ui,node=>node.props?.name==='logoAlturaMaxima')[0].props.onChange({currentTarget:{value:'100'}});
  ui=draw();
  assert.equal(elements(ui,node=>node.type?.name==='ReportIdentityMark')[0].props.identity.logoLargura,200);
  assert.equal(elements(ui,node=>node.type?.name==='ReportIdentityMark')[0].props.identity.logoAlturaMaxima,100);
  elements(ui,node=>node.props?.name==='corPrimaria')[0].props.onChange({currentTarget:{value:'#702c40'}});
  ui=draw();
  assert(elements(ui,node=>node.type==='span'&&node.props?.style?.backgroundColor==='#702c40').length>0,'Color changes are reflected in app preview');
  elements(ui,node=>node.props?.name==='fonteAplicativo')[0].props.onChange({currentTarget:{value:'INTER'}});
  ui=draw();
  assert(elements(ui,node=>node.props?.style?.fontFamily==='"Inter", Arial, sans-serif').length>0,'Selected local font appears in preview');
  assert(elements(ui,node=>node.props?.role==='status'&&String(node.props.children).includes('não salvas')).length>0);
  const {renderToStaticMarkup}=require('react-dom/server');
  const {ReportIdentityMark}=load('src/components/report-identity-mark.tsx');
  const previewHtml=renderToStaticMarkup(ReportIdentityMark({identity:{unitName:'K Platz Hotel',logoDataUrl:`data:image/png;base64,${logos.transparent.toString('base64')}`,logoLargura:200,logoAlturaMaxima:100}}));
  fs.writeFileSync(path.join(outputDir,'logo-size-preview.html'),`<!doctype html><style>body{font-family:Arial} .logo-cell{width:220px;display:flex;align-items:center;justify-content:center;border:1px solid #555;padding:8px} .flex{display:flex}.flex-col{flex-direction:column}.items-center{align-items:center}.justify-center{justify-content:center}.max-w-full{max-width:100%}.h-full{height:100%}.w-full{width:100%}.object-contain{object-fit:contain}.object-center{object-position:center}.block{display:block}.text-center{text-align:center}</style><div class="logo-cell">${previewHtml}</div>`);
  assert.equal(elements(ui,node=>node.type==='details').length,1,'Restore confirmation present; no saved logo to remove');
  console.log('PASS: database persistence/reload, PNG/JPEG/WebP, four logo proportions/transparency, replacement, removal, restore, validation, atomic failure and HTML escaping.');
  console.log('PASS: prepared form updates logo/name header preview through reusable upload; no logo styling effects.');
  console.log('PASS: all seven real monthly routes render fallback/personalized identity; titles, month/year and records query unchanged.');
  console.log('PASS: size min/max/default/invalid, live preview, restore/removal, legacy schema reads and unrelated errors propagate.');
  console.log('PASS: application appearance persistence, color/option injection rejected atomically, semantic tokens untouched, logo removal and restore.');
  fs.writeFileSync(path.join(outputDir,'identity-report-fixtures.json'),JSON.stringify({modules:reportModules,kinds:['default',...Object.keys(logos),'small','large','invalid','jpeg','webp']}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
