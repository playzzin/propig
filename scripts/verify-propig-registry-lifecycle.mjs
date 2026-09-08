import path from 'node:path';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
const require=createRequire(path.resolve(process.env.PROPIG_TEST_RUNTIME||process.cwd(),'package.json'));
const React=require('react'), {act,create}=require('react-test-renderer'), ts=require('typescript');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const source=fs.readFileSync(path.join(process.cwd(),'src/hooks/usePropigAppRegistry.ts'),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
async function setup(uid=null){
 let user=uid?{uid}:null, out, root; const subs=[],writes=[],storage=new Map(),listeners=new Map();let persistence=Promise.resolve(),save=Promise.resolve();
 const window={localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},addEventListener:(k,f)=>{if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(f)},removeEventListener:(k,f)=>listeners.get(k)?.delete(f),dispatchEvent:e=>{for(const f of listeners.get(e.type)||[])f(e)}};
 const mock={doc:(_,...parts)=>parts.join('/'),onSnapshot:(ref,ok,err)=>{const sub={ref,ok,err};subs.push(sub);return ()=>{}},setDoc:(ref,data)=>{writes.push({ref,data});return save},serverTimestamp:()=>0};
 const exports={};vm.runInNewContext(code,{exports,require:n=>n==='react'?React:n==='firebase/firestore'?mock:n.includes('AuthContext')?{useAuth:()=>({currentUser:user})}:n.includes('firebase/config')?{db:{},ensureFirestorePersistence:()=>persistence}:{DEFAULT_PROPIG_INSTALLED_APP_IDS:[],isAvailablePropigStoreAppId:x=>['a','b','c'].includes(x)},window,CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail}},console:{warn:()=>{}}});
 function Probe(){out=exports.usePropigAppRegistry();return null}
 await act(async()=>{root=create(React.createElement(Probe))});
 return {get out(){return out},subs,writes,storage,window,setSave:p=>save=p,setPersistence:p=>persistence=p,snap:async(i,ids)=>act(async()=>subs[i].ok({exists:()=>true,data:()=>({installedAppIds:ids})})),switch:async uid=>act(async()=>{user=uid?{uid}:null;root.update(React.createElement(Probe))}),close:async()=>act(async()=>root.unmount())};
}
let failures=0;async function test(name,fn){try{await fn();console.log('PASS',name)}catch(e){failures++;console.log('FAIL',name,e.message)}}
const check=(x,m)=>{if(!x)throw Error(m)};
await test('guest same-batch installs preserve both',async()=>{const h=await setup();await act(async()=>{await Promise.all([h.out.installApp('a'),h.out.installApp('b')])});check(h.out.installedAppIds.length===2,'lost update');await h.close()});
await test('cloud save does not overwrite legacy guest storage',async()=>{const h=await setup('A');h.storage.set('propig:installed-apps:v1','["b"]');await h.snap(0,[]);await act(async()=>h.out.installApp('a'));check(h.storage.get('propig:installed-apps:v1')==='["b"]','guest overwritten');await h.switch(null);check(h.out.installedAppIds.join()==='b','guest compatibility');await h.close()});
await test('save failure rejects and rolls back',async()=>{const h=await setup('A');await h.snap(0,[]);h.setSave(Promise.resolve().then(()=>{throw Error('denied')}));let failed=false;await act(async()=>{try{await h.out.installApp('a')}catch{failed=true}});check(failed,'swallowed rejection');check(h.out.installedAppIds.length===0,'missing rollback');await h.close()});
await test('auth switch and late snapshot/error fenced',async()=>{const h=await setup('A');await h.snap(0,['a']);await h.switch('B');check(!h.out.installedAppIds.includes('a'),'old state visible');await h.snap(1,['b']);await h.snap(0,['a']);await act(async()=>h.subs[0].err(Error('late')));check(h.out.installedAppIds.join()==='b'&&!h.out.error,'stale callback');await h.close()});
await test('initial cloud snapshot required',async()=>{const h=await setup('A');let failed=false;await act(async()=>{try{await h.out.installApp('a')}catch{failed=true}});check(failed&&h.writes.length===0,'pre-hydration write');await h.close()});
await test('identity change during persistence blocks write',async()=>{const h=await setup('A');await h.snap(0,[]);const d=deferred();h.setPersistence(d.promise);let p;await act(async()=>{p=h.out.installApp('a').catch(()=>{})});await h.switch('B');await h.snap(1,['b']);await act(async()=>{d.resolve();await p});check(h.writes.length===0&&h.out.installedAppIds.join()==='b','late await write');await h.close()});
await test('foreign events ignored',async()=>{const h=await setup('B');await h.snap(0,['b']);await act(async()=>h.window.dispatchEvent({type:'propig-app-registry-change',detail:{uid:'A',installedAppIds:['a']}}));check(h.out.installedAppIds.join()==='b','foreign event');await h.close()});
await test('cloud same-batch lock rejects second mutation',async()=>{const h=await setup('A');await h.snap(0,[]);const d=deferred();h.setSave(d.promise);let p,blocked=false;await act(async()=>{p=h.out.installApp('a');try{await h.out.installApp('b')}catch{blocked=true}});check(blocked&&h.writes.length===1,'concurrent cloud write');await act(async()=>{d.resolve();await p});check(h.out.installedAppIds.join()==='a','first write lost');await h.close()});
await test('late ACK rejects without publishing into new identity',async()=>{const h=await setup('A');await h.snap(0,[]);const d=deferred();h.setSave(d.promise);let p,failed=false;await act(async()=>{p=h.out.installApp('a').catch(()=>{failed=true})});await h.switch('B');await h.snap(1,['b']);await act(async()=>{d.resolve();await p});check(failed&&h.out.installedAppIds.join()==='b'&&!h.out.error,'late ACK contaminated session');check(!h.storage.has('propig:installed-apps:v1:user:A'),'stale publish');await h.close()});
await test('unmount during persistence fences deferred write',async()=>{const h=await setup('A');await h.snap(0,[]);const d=deferred();h.setPersistence(d.promise);let p;await act(async()=>{p=h.out.installApp('a').catch(()=>{})});await h.close();await act(async()=>{d.resolve();await p});check(h.writes.length===0,'write after unmount')});
console.log(`RESULT ${failures ? 'FAIL' : 'PASS'} (${failures} failures)`);process.exitCode=failures?1:0;
