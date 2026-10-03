// Actual theme component with isolated browser state; no database or real sessions.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),original=Module._load;
let values=[],cursor=0,effects=[],dark=false,saved=null;
const listeners=new Map(),mediaListeners=new Set();
const media={matches:false,addEventListener(_name,fn){mediaListeners.add(fn)},removeEventListener(_name,fn){mediaListeners.delete(fn)}};
global.document={documentElement:{classList:{toggle(_name,on){dark=on}}}};
global.window={localStorage:{getItem(){return saved},setItem(_key,v){saved=v},removeItem(){saved=null}},matchMedia:()=>media,
  addEventListener(name,fn){const set=listeners.get(name)||new Set();set.add(fn);listeners.set(name,set)},removeEventListener(name,fn){listeners.get(name)?.delete(fn)},dispatchEvent(event){for(const fn of listeners.get(event.type)||[])fn()}};
Module._load=function(name,parent,isMain){if(name==='react')return {...original.call(this,name,parent,isMain),
  useState(initial){const index=cursor++;if(!(index in values))values[index]=initial;return [values[index],v=>{values[index]=v}]},useEffect(fn){effects.push(fn)}};
  if(name.startsWith('@/'))name=path.join(root,'src',name.slice(2));return original.call(this,name,parent,isMain);};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);
const {ThemeToggleButton}=require(path.join(root,'src/components/layout/theme-toggle-button.tsx'));
function draw(theme){cursor=0;effects=[];return ThemeToggleButton({institutionalTheme:theme})}
for(const institutional of ['CLARO','ESCURO','AUTOMATICO'])for(const individual of [null,'light','dark'])for(const osDark of [false,true]){
  values=[];saved=individual;media.matches=osDark;draw(institutional);const clean=effects.map(fn=>fn());
  const expected=individual?individual==='dark':institutional==='ESCURO'||(institutional==='AUTOMATICO'&&osDark);
  assert.equal(dark,expected);media.matches=!osDark;for(const fn of mediaListeners)fn();
  assert.equal(dark,individual?individual==='dark':institutional==='ESCURO'||(institutional==='AUTOMATICO'&&!osDark));
  clean.forEach(fn=>fn());assert.equal(mediaListeners.size,0);
}
values=[];saved='light';media.matches=true;draw('ESCURO');const cleanup=effects.map(fn=>fn());
let tree=draw('ESCURO');tree.props.children[1].props.onClick();assert.equal(saved,null);assert.equal(dark,true);
tree=draw('ESCURO');tree.props.children[0].props.onClick();assert.equal(saved,'light');assert.equal(dark,false);cleanup.forEach(fn=>fn());
console.log('PASS actual theme: 18 precedence combinations, live OS changes, restore institutional theme, individual choice and cleanup');
