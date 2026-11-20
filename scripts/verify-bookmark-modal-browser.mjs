import assert from 'node:assert/strict';
import http from 'node:http';import path from 'node:path';
import {build} from 'esbuild';import {chromium} from 'playwright-core';
const root=process.cwd();
const stubs={
 'firebase/auth':`export const getAuth=()=>window.__auth;export function onAuthStateChanged(a,cb){window.__authListeners.add(cb);cb(a.currentUser);return()=>window.__authListeners.delete(cb)}`,
 'firebase/firestore':`export class Timestamp { static now(){return new Timestamp()}toMillis(){return 0} }`,
 '@/contexts/AuthContext':`import {useSyncExternalStore} from 'react';export function useAuth(){const currentUser=useSyncExternalStore(cb=>{window.addEventListener('auth-change',cb);return()=>window.removeEventListener('auth-change',cb)},()=>window.__auth.currentUser);return {currentUser}}`,
 '@/lib/client-auth':`export const buildJsonAuthHeaders=()=>window.__defer('headers',{});`,
 'sonner':`export const toast={success:v=>window.__toasts.push({type:'success',message:v}),error:v=>window.__toasts.push({type:'error',message:v})};`,
};
const entry=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {AddBookmarkModal} from './src/components/bookmarks/AddBookmarkModal';import {CategoryManagerModal} from './src/components/bookmarks/CategoryManagerModal';
const initial=[{id:'work',userId:'A',name:'업무',icon:'fa-folder',color:'#3B82F6',order:0}];
function Fixture(){const [open,setOpen]=useState(true),[kind,setKind]=useState('bookmark'),[categories,setCategories]=useState(initial),[mounted,setMounted]=useState(true);window.__control={setOpen,setKind,setMounted,refresh:()=>setCategories(v=>v.map(c=>({...c}))) };if(!mounted)return null;return <><AddBookmarkModal isOpen={open&&kind==='bookmark'} categories={categories} onClose={()=>{window.__closed++;setOpen(false)}} onSubmit={data=>window.__defer('save',data)}/><CategoryManagerModal isOpen={open&&kind==='category'} categories={categories} bookmarksCount={{work:0}} onClose={()=>{window.__closed++;setOpen(false)}} onCreate={data=>window.__defer('create',data)} onUpdate={(id,data)=>window.__defer('update',data)} onDelete={data=>window.__defer('delete',data)}/></>}
createRoot(document.getElementById('root')).render(<React.StrictMode><Fixture/></React.StrictMode>);`;
const bundle=await build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'identity-io-only',setup(b){b.onResolve({filter:/.*/},a=>a.path in stubs?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:stubs[a.path],loader:'js',resolveDir:root}));}}]});
const bootstrap=`window.__auth={currentUser:{uid:'A'}};window.__authListeners=new Set();window.__toasts=[];window.__calls=[];window.__pending=[];window.__modes={};window.__closed=0;
window.__setUid=uid=>{window.__auth.currentUser=uid?{uid}:null;for(const cb of window.__authListeners)cb(window.__auth.currentUser);window.dispatchEvent(new Event('auth-change'))};
window.__defer=(stage,value)=>{window.__calls.push(stage);if(window.__modes[stage]==='hold')return new Promise((resolve,reject)=>window.__pending.push({stage,resolve:()=>resolve(value),reject:()=>reject(new Error('fixture failure'))}));if(window.__modes[stage]==='fail')return Promise.reject(new Error('fixture failure'));return Promise.resolve(value)};
window.__release=(fail=false)=>{const pending=window.__pending.splice(0);for(const p of pending)p[fail?'reject':'resolve']()};
window.fetch=()=>window.__defer('fetch',{ok:true,json:()=>window.__defer('json',{title:'분석된 제목',description:'격리 설명',category:'업무',tags:['test']})});`;
const server=http.createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');return res.end(bundle.outputFiles[0].contents)}res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>:root{--bg-card:#171b24;--text-bright:#fff;--text-muted:#aaa;--text-main:#eee;--border-medium:#666;--border-subtle:#555}*{box-sizing:border-box}body{background:#111;color:white;font-family:sans-serif}</style></head><body><div id="root"></div><script>${bootstrap}</script><script src="/bundle.js"></script></body></html>`)});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1366,height:900}});const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>{if(new URL(r.request().url()).origin!==origin){external.push(r.request().url());return r.abort()}return r.continue()});
 const reset=async()=>{await page.goto(origin,{waitUntil:'domcontentloaded'});await page.getByRole('dialog').waitFor();};
 const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 // Real form edits survive an unrelated live category snapshot.
 await reset();await page.locator('#url').fill('https://fixture.invalid');await page.locator('#title').fill('보존할 초안');await page.evaluate(()=>window.__control.refresh());await settle();assert.equal(await page.locator('#title').inputValue(),'보존할 초안');
 // Deferred manual analysis must neither emit stale toasts nor update the form.
 for(const stage of ['headers','fetch','json'])for(const fail of [false,true]){
  await reset();await page.locator('#url').fill('https://fixture.invalid');await page.evaluate(s=>window.__modes[s]='hold',stage);await page.getByRole('button',{name:'자동 채우기',exact:true}).click();await page.waitForFunction(()=>window.__pending.length===1);
  await page.evaluate(()=>{window.__setUid('B');window.__setUid('A')});await page.evaluate(f=>window.__release(f),fail);await settle();assert.deepEqual(await page.evaluate(()=>window.__toasts),[]);
  if(stage==='headers')assert.equal(await page.evaluate(()=>window.__calls.includes('fetch')),false);
 }
 // Modal save completion after parent hides/reopens may not close the new form.
 for(const fail of [false,true]){
  await reset();await page.locator('#url').fill('https://fixture.invalid');await page.locator('#title').fill('직접 입력');await page.evaluate(()=>window.__modes.save='hold');await page.getByRole('button',{name:'추가',exact:true}).click();await page.waitForFunction(()=>window.__pending.some(p=>p.stage==='save'));
  await page.evaluate(()=>window.__control.setOpen(false));await page.getByRole('dialog').waitFor({state:'hidden'});await page.evaluate(()=>window.__control.setOpen(true));await page.getByRole('dialog').waitFor();await page.evaluate(f=>window.__release(f),fail);await settle();assert.equal(await page.evaluate(()=>window.__closed),0);assert.deepEqual(await page.evaluate(()=>window.__toasts),[]);
 }
 // Category create late success/failure after account transition is also fenced.
 for(const fail of [false,true]){
  await reset();await page.evaluate(()=>window.__control.setKind('category'));await page.locator('#bookmark-category-name').fill('새 분류');await page.evaluate(()=>window.__modes.create='hold');await page.getByRole('button',{name:'카테고리 추가',exact:true}).click();await page.waitForFunction(()=>window.__pending.some(p=>p.stage==='create'));await page.evaluate(()=>window.__setUid('B'));await page.evaluate(f=>window.__release(f),fail);await settle();assert.deepEqual(await page.evaluate(()=>window.__toasts),[]);
 }
 // Guest dialogs still close; authentication fences must not trap logged-out users.
 for(const kind of ['bookmark','category']){
  await reset();await page.evaluate(k=>{window.__setUid(null);window.__control.setKind(k)},kind);await settle();
  if(kind==='bookmark'){await page.locator('#url').fill('https://fixture.invalid');await page.getByRole('button',{name:'자동 채우기',exact:true}).click();}
  else {await page.locator('#bookmark-category-name').fill('게스트');await page.getByRole('button',{name:'카테고리 추가',exact:true}).click();}
  assert.equal(await page.evaluate(()=>window.__calls.length),0);assert(await page.evaluate(()=>window.__toasts.some(t=>t.message==='로그인이 필요합니다.')));
  await page.getByRole('button',{name:kind==='bookmark'?'모달 닫기':'카테고리 관리 닫기',exact:true}).click();await page.waitForFunction(()=>window.__closed===1);
 }
 // Positive path and mobile DOM/layout smoke remain real browser interactions.
 await reset();await page.locator('#url').fill('https://fixture.invalid');await page.getByRole('button',{name:'자동 채우기',exact:true}).click();await page.waitForFunction(()=>window.__toasts.some(t=>t.type==='success'));assert.equal(await page.locator('#title').inputValue(),'분석된 제목');await page.getByRole('button',{name:'추가',exact:true}).click();await page.waitForFunction(()=>window.__closed===1);
 await reset();await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.__control.setKind('category'));await page.locator('#bookmark-category-name').fill('모바일 분류');await page.evaluate(()=>window.__control.refresh());await settle();assert.equal(await page.locator('#bookmark-category-name').inputValue(),'모바일 분류');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.getByRole('button',{name:'카테고리 추가',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/propig-followup-category-mobile.png'});await page.getByRole('button',{name:'카테고리 추가',exact:true}).click();await page.waitForFunction(()=>window.__calls.includes('create')&&document.querySelector('#bookmark-category-name')?.value==='');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('PASS actual bookmark/category modal DOM+React StrictMode: draft preservation, delayed headers/fetch/json/save/create success/failure, A→B→A, reopen, positive analysis/save, mobile; IO/auth mocked; no external traffic');
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
