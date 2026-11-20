import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const root=process.env.PROPIG_ROOT||process.cwd();
const require=createRequire(path.resolve(process.env.PROPIG_TEST_RUNTIME||root,'package.json'));
const ts=require('typescript'),React=require('react'),{act,create}=require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const source=fs.readFileSync(path.join(root,'src/components/propig/PropigDashboard.tsx'),'utf8');
const ast=ts.createSourceFile('dashboard.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
let passed=0;
for(const [name,key,createKey] of [['useBucketWidget','items','createItem'],['useTodoWidget','tasks','createTask']]){
 const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name.text===name);assert(node);
 const js=ts.transpileModule(node.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 async function setup(){
  let uid='A',out,renderer;const auth={currentUser:{uid}};const gate=deferred(),subs=[],writes=[];
  const subscribe=(owner,ok,error)=>{const s={owner,ok,error,closed:false};subs.push(s);return()=>{s.closed=true;};};
  const service={ensureDefaultCategories:()=>gate.promise,subscribe,subscribeTasks:subscribe,subscribeCategories:subscribe,create:async(...args)=>writes.push(args),update:async()=>{},remove:async()=>{},setOccurrenceCompleted:async()=>{}};
  const hook=new Function('React','auth','service',`const {useState,useEffect,useMemo,useCallback}=React;const ensureFirestorePersistence=async()=>{};const bucketListService=service,todoListService=service;const toast={error(){}};const getOccurrencesForDate=()=>[];const TODO_ANYTIME_COMPLETION_KEY='anytime';const createTodoDraft=(title,categoryId)=>({title,categoryId});const cycleBucketStatus=()=> 'done';${js};return ${name};`)(React,auth,service);
  function Harness(){out=hook(uid,'2026-09-15');return null;}
  await act(async()=>{renderer=create(React.createElement(Harness));});
  return {get out(){return out},auth,gate,subs,writes,async run(fn){await act(fn)},async switch(){uid='B';auth.currentUser={uid};await act(async()=>renderer.update(React.createElement(Harness)))},async close(){await act(async()=>renderer.unmount())}};
 }
 const record={id:'record',title:'existing',recurrence:{mode:'unscheduled'},completedDates:[],createdAt:'2026-09-15'};
 {
  const h=await setup();assert.equal(h.subs.length,2,'listeners must start before bootstrap settles');
  await h.run(async()=>h.subs[0].ok([record]));assert.equal(h.out[key][0].id,'record');assert.equal(h.out.state,'loading');
  await h.run(async()=>{await assert.rejects(h.out[createKey]('draft',''),/불러온/)});assert.equal(h.writes.length,0);
  await h.run(async()=>h.subs[1].ok([{id:'category'}]));assert.equal(h.out.state,'loading');
  await h.run(async()=>h.gate.resolve());assert.equal(h.out.state,'ready');
  await h.run(async()=>h.out[createKey]('draft',''));assert.equal(h.writes.length,1);
  await h.close();assert(h.subs.every(s=>s.closed));passed++;
 }
 {
  const h=await setup();await h.run(async()=>{h.subs[0].error(Error('list failed'));h.subs[1].ok([{id:'category'}]);h.gate.resolve()});
  assert.equal(h.out.state,'error');assert.equal(h.out.error,'list failed');
  await h.run(async()=>{await assert.rejects(h.out[createKey]('draft',''))});assert.equal(h.writes.length,0);await h.close();passed++;
 }
 {
  const h=await setup();await h.run(async()=>h.subs[0].ok([record]));await h.run(async()=>h.gate.reject(Error('defaults failed')));
  await h.run(async()=>h.subs[1].ok([{id:'category'}]));assert.equal(h.out.error,'defaults failed');assert.equal(h.out[key].length,1);await h.close();passed++;
 }
 {
  const h=await setup();await h.run(async()=>h.subs[0].ok([record]));const old=h.subs.slice();await h.switch();assert.equal(h.out[key].length,0);assert(old.every(s=>s.closed));
  await h.run(async()=>{old[0].ok([record]);old[1].error(Error('old error'));h.gate.resolve()});assert.equal(h.out[key].length,0);assert.equal(h.out.error,null);await h.close();passed++;
 }
 {
  const h=await setup();await h.close();await h.run(async()=>h.gate.reject(Error('late failure')));assert(h.subs.every(s=>s.closed));passed++;
 }
 {
  const h=await setup();await h.run(async()=>{h.subs[1].ok([{id:'category'}]);h.gate.resolve()});
  assert.equal(h.out.state,'loading','category snapshot alone must not unlock writes');
  await h.run(async()=>{await assert.rejects(h.out[createKey]('draft',''))});
  await h.run(async()=>h.subs[0].ok([]));assert.equal(h.out.state,'ready');
  await h.run(async()=>h.subs[1].ok([]));await h.run(async()=>{await assert.rejects(h.out[createKey]('draft',''),/분류/)});
  assert.equal(h.writes.length,0);await h.close();passed++;
 }
 console.log(`PASS ${name}: list before bootstrap, guarded create, independent errors, auth replacement, cleanup`);
}
console.log(`${passed} actual dashboard hook regressions PASS; extracted source, React renderer; mocked Firebase/service and date helpers; no production IO.`);
