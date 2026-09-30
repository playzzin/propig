import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(path.resolve(process.env.PROPIG_TEST_RUNTIME||process.cwd(),'package.json'));
const ts=require('typescript'), React=require('react'), {act,create}=require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const source=ts.createSourceFile('dashboard.tsx',fs.readFileSync('src/components/propig/PropigDashboard.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const extract=name=>source.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(source);
const compile=(name,context)=>{vm.createContext(context);vm.runInContext(ts.transpileModule(extract(name),{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,context);return context[name];};
const empty={categories:[],habits:[],records:{}};
let out,root,checks=0;
const auth={currentUser:{uid:'A'}}, listeners={}, writes=[];
const ctx={...React,auth,EMPTY_HABIT_WORKSPACE:empty,ensureFirestorePersistence:async()=>{},createHabitWorkspaceRef:uid=>uid,onSnapshot:(uid,cb)=>{listeners[uid]=cb;return()=>{};},normalizeHabitWorkspace:x=>x,getHabitCategoryName:()=>'',removeUndefined:x=>x,saveHabitWorkspace:async(uid,data)=>writes.push({uid,data}),makeQuickId:()=>'',getNextHabitOrder:()=>0};
const useHabit=compile('useHabitWidget',ctx);
function Habit({uid}){out=useHabit(uid,'2026-09-08');return null;}
const record=uid=>({categories:[{id:uid+'-cat'}],habits:[{id:uid+'-habit',mode:'check',categoryId:uid+'-cat'}],records:{}});
await act(async()=>{root=create(React.createElement(Habit,{uid:'A'}));});
await act(async()=>listeners.A({data:()=>record('A')}));
auth.currentUser={uid:'B'};
await act(async()=>root.update(React.createElement(Habit,{uid:'B'})));
assert.equal(out.sortedHabits.length,0); checks++;
await act(async()=>out.toggleHabit(record('A').habits[0]));assert.equal(writes.length,0);checks++;
await act(async()=>listeners.A({data:()=>record('A')}));assert.equal(out.sortedHabits.length,0);checks++;
await act(async()=>listeners.B({data:()=>record('B')}));
await act(async()=>out.toggleHabit(record('B').habits[0]));assert.equal(writes.length,1);assert.equal(writes[0].data.habits[0].id,'B-habit');checks++;
await act(async()=>root.unmount());
for(const name of ['useBucketWidget','useTodoWidget']) {
 const pending=[],subs=[];auth.currentUser={uid:'A'};
 const service={ensureDefaultCategories:()=>new Promise(r=>pending.push(r)),subscribe:(uid,cb)=>{const s={uid,closed:false};subs.push(s);if(uid==='A')cb([{id:uid+'-item',recurrence:{mode:'once'},completedDates:[]}]);return()=>{s.closed=true;};},subscribeCategories:(uid,cb)=>{const s={uid,closed:false};subs.push(s);if(uid==='A')cb([{id:uid+'-cat'}]);return()=>{s.closed=true;};}};
 service.subscribeTasks=service.subscribe;
 const c={...React,auth,bucketListService:service,todoListService:service,ensureFirestorePersistence:async()=>{},toast:{error(){}},getOccurrencesForDate:()=>[],TODO_ANYTIME_COMPLETION_KEY:'__anytime__'};
 const useWidget=compile(name,c);
 function App({uid}){out=useWidget(uid,'2026-09-08');return null;}
 await act(async()=>{root=create(React.createElement(App,{uid:'A'}));});
 await act(async()=>pending.shift()());
 auth.currentUser={uid:'B'};await act(async()=>root.update(React.createElement(App,{uid:'B'})));
 assert.equal((out.items||out.tasks).length,0);assert.equal(out.categories.length,0);checks++;
 await act(async()=>root.unmount());await act(async()=>pending.shift()());
 assert.equal(subs.filter(s=>s.uid==='B').length,2);assert.ok(subs.every(s=>s.closed));checks++;
}
let resolve,saveCalls=0;
const saveContext={auth,removeUndefined:x=>x,ensureFirestorePersistence:()=>new Promise(r=>{resolve=r;}),setDoc:async()=>{saveCalls++;},createHabitWorkspaceRef:x=>x,serverTimestamp:()=>0};
const save=compile('saveHabitWorkspace',saveContext);auth.currentUser={uid:'A'};const pendingSave=save('A',empty);const rejected=assert.rejects(pendingSave,/계정/);auth.currentUser={uid:'B'};resolve();await rejected;assert.equal(saveCalls,0);checks++;
for (const [file,name,innerName] of [
 ['src/components/propig/PropigDashboard.tsx','PropigDashboard','PropigDashboardSession'],
 ['src/components/todo-list/TodoListApp.tsx','TodoListApp','TodoListSession'],
]) {
 const sf=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const node=sf.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
 let current={uid:'A'};
 function Inner(){const [draft]=React.useState(current.uid);return React.createElement('p',null,draft);}
 const context={React,exports:{},useAuth:()=>({currentUser:current}),[innerName]:Inner};
 vm.createContext(context);
 vm.runInContext(ts.transpileModule(node.getText(sf),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText,context);
 const Wrapper=context.exports.default||context.exports[name];
 await act(async()=>{root=create(React.createElement(Wrapper));});
 assert.equal(root.toJSON().children[0],'A');
 current={uid:'B'};await act(async()=>root.update(React.createElement(Wrapper)));
 assert.equal(root.toJSON().children[0],'B');checks++;
 await act(async()=>root.unmount());
 if(name==='TodoListApp') {
  let callback;function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(sf)==='useEffect'&&n.arguments[0]?.getText(sf).includes('ensureDefaultCategories'))callback=n.arguments[0].getText(sf);ts.forEachChild(n,visit);}visit(sf);assert.ok(callback);
  let release,subscribed=0;const wait=new Promise(r=>{release=r;});
  const no=()=>{};const service={ensureDefaultCategories:()=>wait,subscribeTasks:()=>{subscribed++;return no;},subscribeCategories:()=>{subscribed++;return no;}};
  const effect=vm.runInNewContext(ts.transpileModule(`(${callback})`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,{authLoading:false,currentUser:{uid:'A'},ensureFirestorePersistence:async()=>{},todoListService:service,setIsLoading:no,setError:no});
  const cleanup=effect();await Promise.resolve();cleanup();release();await new Promise(r=>setImmediate(r));assert.equal(subscribed,0);checks++;
 }
}
console.log(`PASS dashboard identity/lifecycle ${checks}: old-account masks, write guards, stale callbacks, deferred bootstrap cleanup, post-await identity`);
