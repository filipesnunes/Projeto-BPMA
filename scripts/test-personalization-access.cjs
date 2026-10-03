// Real permissions, page and actions against isolated adapters. No database connection.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const originalLoad = Module._load;
const mocks = new Map();
Module._load = function(name, parent, isMain) {
  if (mocks.has(name)) return mocks.get(name);
  if (name === 'server-only') return {};
  if (name.startsWith('@/')) name = path.join(root, 'src', name.slice(2));
  return originalLoad.call(this, name, parent, isMain);
};
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, file) => module._compile(
  ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true
  } }).outputText, file);
const load = file => require(path.join(root, file));
let actor = null, writes = 0, catalog = null, config = null;
let grants = [];
const profiles = [
  { id: 1, codigo: 'GERENTE', perfilLegado: 'GERENTE' },
  { id: 2, codigo: 'DEV', perfilLegado: 'DEV' },
  { id: 3, codigo: 'NUTRICIONISTA', perfilLegado: 'NUTRICIONISTA' },
  { id: 4, codigo: 'COLABORADOR', perfilLegado: 'COLABORADOR' }
];
class Redirect extends Error { constructor(url) { super(url); this.url = url; } }
const revalidated = [];
mocks.set('next/navigation', { redirect(url) { throw new Redirect(url); }, useRouter: () => ({refresh(){}}) });
mocks.set('next/cache', { revalidatePath(...args) { revalidated.push(args); } });
mocks.set('@/lib/auth-session', {
  getCurrentUser: async () => actor,
  getCurrentUserForAction: async () => { if (!actor) throw Error('Sessão inválida'); return actor; }
});
const prisma = {
  permissao: {
    findUnique: async () => catalog,
    create: async ({data}) => { catalog = {id: 20, ...data}; return catalog; }
  },
  perfilAcesso: { findMany: async ({where}) => profiles.filter(p => where.OR.some(condition =>
    condition.codigo?.in.includes(p.codigo) || condition.perfilLegado?.in.includes(p.perfilLegado))) },
  perfilPermissao: { createMany: async ({data}) => { grants.push(...data); } },
  personalizacaoVisual: {
    findUnique: async () => config,
    upsert: async ({create,update}) => { writes++; config = config ? {...config,...update} : {...create}; return config; }
  }
};
prisma.$transaction = async fn => fn(prisma);
mocks.set('@/lib/prisma', {prisma});
const code = 'modulo.personalizacao.acessar';
const user = (perfil, granted = true) => ({ id: 7, perfil, perfilAcessoId: 1, permissoes: granted ? [code] : [] });
const values = () => { const f = new FormData(); f.set('nomeUnidade','Unidade sintética'); return f; };
async function main() {
  const permissions = load('src/lib/permissions.ts');
  const modules = load('src/lib/modules.ts');
  const {registerPersonalizationPermission} = load('src/lib/personalization-permission.ts');
  const priorProfiles = JSON.stringify(profiles);
  assert.equal(await registerPersonalizationPermission(), true);
  assert.deepEqual(grants.map(g => g.perfilId), [1,2]);
  assert.equal(JSON.stringify(profiles), priorProfiles, 'No profile created or changed');
  grants = grants.filter(g => g.perfilId !== 1); // Management revoked the grant.
  assert.equal(await registerPersonalizationPermission(), false);
  assert.deepEqual(grants.map(g => g.perfilId), [2], 'Login never restores revoked permission');
  for (const role of ['DEV','GERENTE','NUTRICIONISTA','COLABORADOR']) {
    const allowed = ['DEV','GERENTE'].includes(role);
    assert.equal(permissions.hasPermission({perfil:role},code),allowed);
    assert.equal(permissions.hasPermission(user(role),code),allowed, 'Role boundary also blocks manually assigned codes');
    assert.equal(permissions.canAccessPathWithPermissions(user(role),'/personalizacao'),allowed);
    assert.equal(modules.getModulesForUser(user(role)).some(m => m.href === '/personalizacao'),allowed);
    assert.equal(modules.getModulesForRole(role).some(m => m.href === '/personalizacao'),allowed);
  }
  assert.equal(permissions.hasPermission(user('GERENTE',false),code),false);
  const actions = load('src/app/personalizacao/actions.ts');
  const page = load('src/app/personalizacao/page.tsx').default;
  const initial = {status:'idle',message:''};
  for (const denied of [null,user('NUTRICIONISTA'),user('COLABORADOR'),user('GERENTE',false)]) {
    actor = denied;
    const before = writes;
    await assert.rejects(() => page(), e => e instanceof Redirect && e.url === (denied ? '/acesso-negado' : '/login'));
    await assert.rejects(() => actions.savePersonalizationAction(initial,values()));
    await assert.rejects(() => actions.removeLogoAction(new FormData()));
    await assert.rejects(() => actions.restoreDefaultsAction(new FormData()));
    assert.equal(writes,before,'Direct unauthorized action does not mutate settings');
  }
  for (const role of ['GERENTE','DEV']) {
    actor = user(role,role === 'GERENTE');
    assert.equal((await actions.savePersonalizationAction(initial,values())).status,'success');
    assert.equal(config.nomeUnidade,'Unidade sintética');
    assert.equal(config.atualizadoPorUsuarioId,7);
    const rendered = await page();
    assert(rendered.props.children[1].props.saveAction === actions.savePersonalizationAction);
    const bad = values(); bad.set('nomeUnidade','x'.repeat(121));
    const before = JSON.stringify(config);
    assert.equal((await actions.savePersonalizationAction(initial,bad)).status,'error');
    assert.equal(JSON.stringify(config),before);
    config.logoDados = Uint8Array.from([1]); config.logoMimeType = 'image/png';
    await assert.rejects(() => actions.removeLogoAction(new FormData()),e => e instanceof Redirect && e.url === '/personalizacao');
    assert.equal(config.logoDados,null); assert.equal(config.nomeUnidade,'Unidade sintética');
    await assert.rejects(() => actions.restoreDefaultsAction(new FormData()),e => e instanceof Redirect && e.url === '/personalizacao');
    assert.equal(config.nomeUnidade,null);
  }
  assert(revalidated.every(([pathname,type]) => pathname === '/' && type === 'layout'));
  // Exercise real session loading: the first authenticated request reloads grants,
  // subsequent sessions respect a revocation, and legacy/no-session reads stay safe.
  let cookie = 'synthetic-token', sessionUserId = 8, sessionReads = 0, legacy = false;
  mocks.set('next/headers', {cookies: async () => ({get: () => cookie ? {value:cookie} : undefined})});
  const {Prisma} = require('@prisma/client');
  prisma.usuarioSessao = {
    findUnique: async args => {
      sessionReads++;
      if (legacy && args.include.usuario.select.perfilAcesso) {
        throw new Prisma.PrismaClientKnownRequestError('Missing perfilAcessoId',{code:'P2022',clientVersion:'6.5.0'});
      }
      const usuario = {id:sessionUserId,nomeCompleto:'Gerente sintético',nomeUsuario:'sintetico',
        perfil:'GERENTE',status:'ATIVO',obrigarTrocaSenha:false};
      if (!legacy) usuario.perfilAcesso = {id:1,codigo:'GERENTE',nome:'Gerente',ativo:true,
        permissoes:grants.filter(g => g.perfilId === 1).map(() => ({permissao:{codigo:code}}))};
      return {id: 42, expiraEm:new Date(Date.now()+60_000),usuario};
    }
  };
  const sessions = load('src/lib/auth-session.ts');
  catalog = null; grants = [];
  cookie = null;
  assert.equal(await sessions.getCurrentUser(),null);
  assert.equal(catalog,null,'No catalog writes for anonymous requests');
  cookie = 'synthetic-token';
  const readsBefore = sessionReads;
  for (sessionUserId of [8,9,10,11]) {
    const current = await sessions.getCurrentUser();
    assert.equal(current.sessaoId,42,'Session ID reaches the display layer without exposing the token');
    assert(permissions.hasPermission(current,code),'All existing linked managers receive access');
  }
  assert.equal(sessionReads-readsBefore,5,'Initial session reloads the new grant');
  grants = grants.filter(g => g.perfilId !== 1);
  assert.equal(permissions.hasPermission(await sessions.getCurrentUser(),code),false);
  catalog = null; legacy = true;
  assert(permissions.hasPermission(await sessions.getCurrentUser(),code),'Legacy role gets the new default');
  assert.equal(catalog,null,'Legacy column fallback does not require catalog tables');
  // Use the existing User Management action to revoke and restore just this code.
  mocks.set('@/lib/redirect-error', {rethrowIfRedirectError(e) { if (e instanceof Redirect) throw e; }});
  actor = {...user('DEV'),perfilAcessoId:2,nomeCompleto:'DEV sintético'};
  catalog = {id:20,codigo:code};
  const other = {id:30,codigo:'dashboard.acessar'};
  grants = [{perfilId:1,permissaoId:20,permitido:true},{perfilId:1,permissaoId:30,permitido:true}];
  const audits = [];
  prisma.perfilAcesso.findUnique = async () => ({...profiles[0],ativo:true,
    permissoes:grants.filter(g => g.perfilId === 1).map(g => ({permissao:g.permissaoId === 20 ? catalog : other}))});
  prisma.perfilAcesso.count = async () => 1;
  prisma.permissao.findMany = async ({where}) => [catalog,other].filter(p => where.codigo.in.includes(p.codigo));
  prisma.perfilPermissao.deleteMany = async ({where}) => { grants = grants.filter(g => g.perfilId !== where.perfilId); };
  prisma.perfilPermissaoAuditoria = {create: async ({data}) => {audits.push(data);}};
  const management = load('src/app/usuarios/actions.ts');
  const edit = new FormData(); edit.set('profileId','1'); edit.append('permissionCodes',other.codigo);
  await assert.rejects(() => management.updateProfilePermissionsAction(edit),e => e instanceof Redirect && e.url.includes('feedbackType=success'));
  assert.deepEqual(grants.map(g => g.permissaoId),[30]);
  await registerPersonalizationPermission();
  assert.deepEqual(grants.map(g => g.permissaoId),[30],'Registration does not undo management edit');
  edit.append('permissionCodes',code);
  await assert.rejects(() => management.updateProfilePermissionsAction(edit),e => e instanceof Redirect && e.url.includes('feedbackType=success'));
  assert.deepEqual(grants.map(g => g.permissaoId).sort(),[20,30]);
  assert.equal(audits.length,2);
  assert.deepEqual(audits[0].permissoesDepois,[other.codigo]);
  console.log('PASS default/existing roles, one-time grant, revocation, menu, paths, page and all direct actions; save, validation, remove, restore and revalidation');
  console.log('PASS actual session: four linked managers, initial reload, revocation, anonymous request and legacy fallback');
  console.log('PASS actual User Management action: revoke/restore permission, preserve other grants and audit changes');
}
main().catch(e => { console.error(e); process.exitCode=1; });
