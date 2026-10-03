// Real theme component and initial script with isolated browser/session state.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),original=Module._load;
let values=[],cursor=0,effects=[],dark=false;
const storage=new Map(),listeners=new Map(),mediaListeners=new Set();
const media={matches:false,addEventListener(_name,fn){mediaListeners.add(fn)},removeEventListener(_name,fn){mediaListeners.delete(fn)}};
global.document={documentElement:{dataset:{},classList:{toggle(_name,on){dark=on}}}};
global.window={sessionStorage:{getItem(key){return storage.get(key)??null},setItem(key,v){storage.set(key,v)},removeItem(key){storage.delete(key)}},
  localStorage:{getItem(){return 'dark'}}, // Old persistent choice must not affect a new login.
  matchMedia:()=>media,addEventListener(name,fn){const set=listeners.get(name)||new Set();set.add(fn);listeners.set(name,set)},
  removeEventListener(name,fn){listeners.get(name)?.delete(fn)},dispatchEvent(event){for(const fn of listeners.get(event.type)||[])fn()}};
Module._load=function(name,parent,isMain){if(name==='react')return {...original.call(this,name,parent,isMain),
  useState(initial){const index=cursor++;if(!(index in values))values[index]=initial;return [values[index],v=>{values[index]=v}]},useEffect(fn){effects.push(fn)}};
  if(name.startsWith('@/'))name=path.join(root,'src',name.slice(2));return original.call(this,name,parent,isMain);};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);
const {ThemeToggleButton}=require(path.join(root,'src/components/layout/theme-toggle-button.tsx'));
const {themeInitScript}=require(path.join(root,'src/lib/theme-preference.ts'));
function draw(theme,sessionId=42,compact=false){cursor=0;effects=[];return ThemeToggleButton({institutionalTheme:theme,sessionId,compact})}
for(const institutional of ['CLARO','ESCURO','AUTOMATICO'])for(const individual of [null,'light','dark'])for(const osDark of [false,true]){
  values=[];storage.clear();storage.set('bpma-theme-session','42');if(individual)storage.set('bpma-theme',individual);
  media.matches=osDark;document.documentElement.dataset={institutionalTheme:institutional,themeSession:'42'};
  vm.runInThisContext(themeInitScript(institutional,42));
  const initialListeners=[...mediaListeners];
  const expected=individual?individual==='dark':institutional==='ESCURO'||(institutional==='AUTOMATICO'&&osDark);
  assert.equal(dark,expected,'Initial rendering follows current-session preference');
  draw(institutional);const clean=effects.map(fn=>fn());assert.equal(dark,expected);
  media.matches=!osDark;for(const fn of mediaListeners)fn();
  assert.equal(dark,individual?individual==='dark':institutional==='ESCURO'||(institutional==='AUTOMATICO'&&!osDark));
  clean.forEach(fn=>fn());initialListeners.forEach(fn=>mediaListeners.delete(fn));assert.equal(mediaListeners.size,0);
}
for(const institutional of ['CLARO','ESCURO','AUTOMATICO'])for(const compact of [false,true]){
  values=[];storage.clear();media.matches=true;document.documentElement.dataset={institutionalTheme:institutional,themeSession:'42'};
  draw(institutional,42,compact);let cleanup=effects.map(fn=>fn());
  let tree=draw(institutional,42,compact);
  assert.equal(tree.type,'button','Single control, also in mobile/compact mode');
  const originalDark=dark;
  tree.props.onClick();assert.equal(dark,!originalDark);
  const manual=dark;assert.equal(storage.get('bpma-theme'),manual?'dark':'light');
  cleanup.forEach(fn=>fn());
  // Remount after page navigation: no reset while the login session is the same.
  values=[];draw(institutional,42,compact);cleanup=effects.map(fn=>fn());assert.equal(dark,manual);
  document.documentElement.dataset.themeSession='43';
  cleanup.forEach(fn=>fn());values=[];draw(institutional,43,compact);cleanup=effects.map(fn=>fn());
  assert.equal(dark,institutional==='ESCURO'||institutional==='AUTOMATICO','New login applies institutional theme');
  assert.equal(storage.get('bpma-theme'),undefined,'Previous-session manual choice removed');
  assert.equal(storage.get('bpma-theme-session'),'43');cleanup.forEach(fn=>fn());
}
// A persistent root script reads the current session marker after client navigation.
storage.set('bpma-theme-session','43');storage.set('bpma-theme','light');media.matches=true;
document.documentElement.dataset={institutionalTheme:'AUTOMATICO',themeSession:'43'};
vm.runInThisContext(themeInitScript('CLARO',42));assert.equal(dark,false);
for(const fn of mediaListeners)fn();assert.equal(dark,false);assert.equal(storage.get('bpma-theme'),'light');
document.documentElement.dataset.themeSession='44';for(const fn of mediaListeners)fn();
assert.equal(dark,true);assert.equal(storage.get('bpma-theme'),undefined);mediaListeners.clear();
document.documentElement.dataset.themeSession='';storage.set('bpma-theme','light');
vm.runInThisContext(themeInitScript('AUTOMATICO',null));assert.equal(dark,true);assert.equal(storage.get('bpma-theme'),undefined);mediaListeners.clear();
console.log('PASS: 18 initial/component combinations; automatic OS changes; desktop/mobile single button; manual navigation preference; new login reset; live session marker and listener cleanup.');