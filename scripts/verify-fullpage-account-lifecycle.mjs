import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(path.resolve(process.env.PROPIG_TEST_RUNTIME||process.cwd(),'package.json'));
const ts=require('typescript'), React=require('react'), {act,create}=require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const base=path.join(process.cwd(),'src/components/');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
async function check(kind){
 const habit=kind==='HabitTracker',name=habit?'HabitTracker':'BucketList';
 const source=fs.readFileSync(base+(habit?'habits/HabitTrackerApp.tsx':'bucket-list/BucketListApp.tsx'),'utf8');
 const sf=ts.createSourceFile('fixture.tsx',source,99,true,4);
 const fn=n=>sf.statements.find(x=>ts.isFunctionDeclaration(x)&&x.name?.text===n).getText(sf);
 let inner=fn(name+'Account');
 inner=inner.slice(0,inner.indexOf(habit?'  const habitCountByCategory':'  const getCategoryMeta'))+`\n capture(${habit?'{workspace,hasLoaded,persistWorkspace,setHabitDraft,habitDraft}':'{items,draft,setDraft,handleCreate,resetWorkspace}'}); return null; }`;
 const auth={currentUser:{uid:'A'}}, listeners=[],writes=[];let out,persistence=Promise.resolve(),defaults=Promise.resolve();
 const ctx={...React,React,auth,exports:{},console:{error(){}},useAuth:()=>({currentUser:auth.currentUser,loading:false}),capture:x=>out=x,
 ensureFirestorePersistence:()=>persistence,createWorkspaceDocRef:x=>x,onSnapshot:(uid,ok,error)=>{const l={uid,ok,error,closed:false};listeners.push(l);return()=>l.closed=true},
 createInitialWorkspace:()=>({habits:[],categories:[],records:{}}),normalizeWorkspace:x=>x,sanitizeWorkspaceForFirestore:x=>x,setDoc:async(uid,data)=>writes.push({uid,data}),serverTimestamp:()=>0,toDateKey:()=>'',useDailyRecordLayout:()=>({}),createHabitDraft:()=>({}),CATEGORY_COLORS:['red'],sortCategoriesByOrder:x=>x,sortHabitsByOrder:x=>x,
 toast:{success(){},error(){},info(){}},emptyDraft:{title:'',category:''},createEmptyDraft:()=>({title:'',category:''}),sortItems:x=>x,getProgress:()=>0,STATUS_META:{},confirmResetAction:async()=>true,
 bucketListService:{ensureDefaultCategories:()=>defaults,subscribe:(uid,ok,error)=>{const l={uid,ok,error,closed:false};listeners.push(l);return()=>l.closed=true},subscribeCategories:(uid,ok,error)=>{const l={uid,ok,error,closed:false};listeners.push(l);return()=>l.closed=true},create:async(uid,data)=>writes.push({uid,data})}};
 vm.createContext(ctx);vm.runInContext(ts.transpile(fn(name+'App')+'\n'+inner,{target:99,module:1,jsx:2}),ctx);
 let root;await act(async()=>root=create(React.createElement(React.StrictMode,null,React.createElement(ctx.exports[name+'App']))));
 const live=listeners.filter(x=>!x.closed);await act(async()=>{if(habit)live[0].ok({exists:()=>true,data:()=>({habits:[{id:'A-private'}],categories:[],records:{}})});else {live[0].ok([{id:'A-private'}]);live[1].ok([{id:'A-category'}]);out.setDraft({title:'A-private',category:'A-category'})}});
 const old=out;
 if(habit){const d=deferred();persistence=d.promise;let save;await act(async()=>{save=out.persistWorkspace(out.workspace)});auth.currentUser={uid:'B'};await act(async()=>root.update(React.createElement(React.StrictMode,null,React.createElement(ctx.exports[name+'App']))));await act(async()=>{d.resolve();await save});assert.equal(writes.length,0)}else {auth.currentUser={uid:'B'};await act(async()=>root.update(React.createElement(React.StrictMode,null,React.createElement(ctx.exports[name+'App']))));await act(async()=>old.handleCreate({preventDefault(){}}));assert.equal(writes.length,0)}
 assert.equal(habit?out.workspace.habits.length:out.items.length,0);if(!habit)assert.equal(out.draft.title,'');
 if(habit){const b=listeners.filter(x=>x.uid==='B'&&!x.closed).at(-1);await act(async()=>b.error(new Error('denied')));await act(async()=>out.persistWorkspace(out.workspace));assert.equal(writes.length,0);assert.equal(out.hasLoaded,false);await act(async()=>b.ok({exists:()=>true,data:()=>({habits:[{id:'B-own'}],categories:[],records:{}})}));await act(async()=>out.persistWorkspace(out.workspace));assert.equal(writes[0].uid,'B');assert.equal(writes[0].data.habits[0].id,'B-own')}
 await act(async()=>root.unmount());
 if(!habit){auth.currentUser={uid:'C'};const d=deferred();defaults=d.promise;await act(async()=>root=create(React.createElement(ctx.exports[name+'App'])));const count=listeners.length;await act(async()=>root.unmount());await act(async()=>d.resolve());assert.equal(listeners.length,count)}
 console.log('PASS',kind,'actual source lifecycle / StrictMode / account isolation',habit?'read-failure write fence + B save':'draft remount + late subscription fence');
}
await check('HabitTracker');await check('BucketList');
