import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const root = process.env.PROPIG_ROOT || process.cwd();
const runtime = path.resolve(process.env.PROPIG_TEST_RUNTIME || root, 'node_modules');
const tools = runtime;
const tempDir=fs.mkdtempSync(path.join(os.tmpdir(),'propig-sticky-test-'));
const outputFile=path.join(tempDir,'hook.cjs');
const require = createRequire(`${tools}/react/package.json`);
const React = require('react');
const {act, create} = require('react-test-renderer');
const {build} = require('esbuild');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const storage = new Map();
let timers = new Map(), nextTimer = 0;
globalThis.window = { localStorage: {getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)}, setTimeout:fn=>{timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>timers.delete(id)};
let user = {uid:'A'}, calls=[], records=new Map(), hold=null, persistenceHold=null, deleteFailure=false, writeFailure=false;
globalThis.__stickyMock = {
 auth:{get currentUser(){return user;}}, useAuth:()=>({currentUser:user}), db:{},
 ensureFirestorePersistence:()=>persistenceHold?.promise ?? Promise.resolve(),
 collection:(_, ...p)=>p.join('/'),doc:(_, ...p)=>p.join('/'),query:x=>x,
 serverTimestamp:()=>123, onSnapshot:()=>()=>{}, getDocs:async()=>({docs:[]}),writeBatch:()=>({delete(){},commit:async()=>{}}),
 setDoc:async(path,data)=>{calls.push(['set',path,data]);if(writeFailure)throw new Error('permission-denied');if(hold){const h=hold;hold=null;await h.promise;}records.set(path,{...records.get(path),...data});},
 deleteDoc:async(path)=>{calls.push(['delete',path]);if(deleteFailure)throw new Error('permission-denied');records.delete(path);}
};
await build({entryPoints:[`${root}/src/hooks/useStickyNotes.ts`],outfile:outputFile,bundle:true,platform:'node',format:'cjs',nodePaths:[tools,runtime],plugins:[{name:'mocks',setup(b){
 b.onResolve({filter:/^react$/},()=>({path:`${tools}/react/index.js`,external:true}));
 b.onResolve({filter:/^(firebase\/firestore|@\/contexts\/AuthContext|@\/firebase\/config)$/},a=>({path:a.path,namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'const m=globalThis.__stickyMock; export const {auth,useAuth,db,ensureFirestorePersistence,collection,doc,query,serverTimestamp,onSnapshot,getDocs,writeBatch,setDoc,deleteDoc}=m;',loader:'js'}));
 b.onResolve({filter:/^@\//},a=>({path:`${root}/src/${a.path.slice(2)}.ts`}));
}}]});
const {useStickyNotes}=require(outputFile);
let api, renderer;
function Harness(){api=useStickyNotes();return null;}
const drain=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function mount(uid='A'){user=uid?{uid}:null;await act(async()=>{renderer=create(React.createElement(React.StrictMode,null,React.createElement(Harness)));await drain();});}
async function unmount(){await act(async()=>{renderer.unmount();await drain();});}
async function tick(){await act(async()=>{const active=[...timers.values()];timers.clear();for(const fn of active)fn();await drain();});}
async function reset(){storage.clear();records.clear();calls=[];timers.clear();hold=null;persistenceHold=null;await mount();}
async function add(){let id;await act(async()=>{id=api.createNote();});return id;}
function saved(uid='A'){const entry=[...storage.entries()].find(([k])=>k.includes(uid)&&!k.toLowerCase().includes('tag'));assert.ok(entry,'UID local payload exists');return JSON.parse(entry[1]).notes;}
await reset();
let id=await add();
await act(async()=>{api.updateNote(id,{content:'edited'});api.deleteNote(id);});
await tick();assert.equal(records.has(`users/A/stickyNotes/${id}`),false);assert.equal(calls.filter(c=>c[0]==='set').length,0);assert.equal(saved().length,0);await unmount();
console.log('PASS delete-after-edit (StrictMode, pending create/edit cancelled)');
await reset();id=await add();const flight=deferred();hold=flight;await tick();assert.equal(calls[0][0],'set');
await act(async()=>{api.updateNote(id,{content:'late'});api.deleteNote(id);});await tick();assert.equal(calls.length,1);
await act(async()=>{flight.resolve();await drain();});assert.deepEqual(calls.map(c=>c[0]),['set','delete']);assert.equal(records.size,0);await unmount();
console.log('PASS inflight delete (delete waits for existing setDoc)');
await reset();id=await add();await act(async()=>{api.updateNote(id,{content:'last input'});renderer.unmount();await drain();});
assert.equal(saved()[0].content,'last input');assert.equal(records.get(`users/A/stickyNotes/${id}`).content,'last input');
await mount();assert.equal(api.notes[0].content,'last input');await unmount();
console.log('PASS same-batch edit/unmount (durable local + captured UID flush + remount)');
await reset();id=await add();await act(async()=>api.updateNote(id,{content:'A private'}));
await act(async()=>{user={uid:'B'};renderer.update(React.createElement(React.StrictMode,null,React.createElement(Harness)));await drain();});await tick();
assert.equal(calls.length,0);assert.equal(api.notes.length,0);assert.equal(saved('A')[0].content,'A private');assert.equal(saved('B').length,0);await unmount();
console.log('PASS auth UID replacement (no old patch or local notes written as B)');
await reset();id=await add();const gate=deferred();persistenceHold=gate;await tick();
await act(async()=>{user={uid:'B'};renderer.update(React.createElement(React.StrictMode,null,React.createElement(Harness)));gate.resolve();await drain();});assert.equal(calls.length,0);await unmount();
console.log('PASS auth replacement during persistence await (write-time UID fence)');
await reset(); id=await add(); await act(async()=>api.updateNote(id,{content:'restore me'}));
deleteFailure=true; await act(async()=>{api.deleteNote(id);await drain();});
assert.equal(api.notes[0].content,'restore me'); assert.ok(api.storageError.includes('복원'));
deleteFailure=false; await act(async()=>{api.deleteNote(id);await drain();}); assert.equal(api.notes.length,0); await unmount();
console.log('PASS failed deletion restores editable note and supports explicit retry');
await reset(); id=await add();
await act(async()=>api.updateNote(id,{content:'체크\n[x] 완료',memoType:'checklist',checklistItems:[{id:'i',text:'완료',isChecked:true,comments:[]}],priority:'high',reminderAt:100}));
const undoNote=structuredClone(api.notes[0]);
const undoGate=deferred(); hold=undoGate; await tick();
await act(async()=>{api.deleteNote(id);api.restoreNote(undoNote);});
await tick(); await act(async()=>{undoGate.resolve();await drain();});
assert.equal(api.notes.length,1); assert.equal(api.notes[0].id,id);
assert.equal(saved()[0].checklistItems[0].isChecked,true);
assert.equal(records.get(`users/A/stickyNotes/${id}`).priority,'high');
assert.deepEqual(calls.map(call=>call[0]),['set','delete','set']);
await unmount(); console.log('PASS undo keeps ID/metadata and serializes restore after inflight write/delete');
await reset(); id=await add(); const healthy=structuredClone(api.notes[0]); await unmount();
const malformed=JSON.stringify({version:1,notes:[healthy,{...healthy,id:'invalid',checklistItems:[{id:'bad',text:'x',isChecked:'invalid'}]}]});
storage.set('sticky_notes:v1:A',malformed);
await mount(); assert.equal(api.notes.length,1); assert.equal(storage.get('sticky_notes:v1:A'),malformed);
assert.equal(storage.get('sticky_notes:v1:A:recovery'),malformed);
await act(async()=>api.updateNote(healthy.id,{content:'복구 후 편집'}));
assert.equal(saved()[0].content,'복구 후 편집'); assert.equal(storage.get('sticky_notes:v1:A:recovery'),malformed);
await unmount(); console.log('PASS invalid single memo recovers healthy data and preserves raw recovery copy');
await reset(); id=await add();
await act(async()=>{api.updateNote(id,{content:'알림 직전 편집'});});
writeFailure=true;
await act(async()=>{await assert.rejects(api.flushNote(id), /permission-denied/);});
writeFailure=false;
await act(async()=>{await api.flushNote(id);});
assert.equal(records.get(`users/A/stickyNotes/${id}`).content,'알림 직전 편집');
await unmount(); console.log('PASS reminder flush propagates write failure and retries latest memo before scheduling');
console.log('9 lifecycle regressions PASS; real React hook + esbuild, mocked Firebase/browser storage, no remote access.');

fs.rmSync(tempDir,{recursive:true,force:true});
