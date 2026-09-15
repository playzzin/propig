import assert from 'node:assert/strict';
import http from 'node:http';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
const stubs={
 'next/link':`export default function Link({children,...props}){return <a {...props}>{children}</a>}`,
 '@/contexts/AuthContext':`export const useAuth=()=>({currentUser:{uid:'fixture-A'},loading:false,isConfigured:true,loginWithGoogle:async()=>{}});`,
 '@/firebase/config':`export const db={};export const ensureFirestorePersistence=async()=>{};`,
 'firebase/firestore':`export const doc=(_, ...parts)=>parts.join('/');export const serverTimestamp=()=>0;export const runTransaction=async(_,callback)=>callback({get:async()=>({data:()=>({installedAppIds:window.__remote||[]})}),set:()=>{window.__writes++}});export const onSnapshot=(ref,options,ok,error)=>{const sub={ok,error,closed:false};window.__subs.push(sub);if(window.__subs.length===1)queueMicrotask(()=>error(Error('offline')));return()=>{sub.closed=true}};`,
 'sonner':`export const toast={success:()=>{},error:()=>{}};`,
};
const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Store from './src/components/propig/PropigStore';createRoot(document.getElementById('root')).render(<Store/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'fixture-io',setup(b){b.onResolve({filter:/.*/},a=>a.path in stubs?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:stubs[a.path],loader:'tsx',resolveDir:process.cwd()}));}}]});
const server=http.createServer((req,res)=>{if(req.url==='/app.js'){res.setHeader('Content-Type','application/javascript');res.end(bundle.outputFiles[0].contents);return;}res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Registry recovery fixture</title><style>body{margin:0}*{box-sizing:border-box}</style></head><body><div id="root"></div><script>window.__subs=[];window.__writes=0;</script><script src="/app.js"></script></body></html>')});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox']});
 for(const width of [390,1366]){
  const context=await browser.newContext({viewport:{width,height:900}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  await page.goto(base);await page.getByRole('alert').waitFor();assert(await page.getByRole('button',{name:'등록',exact:true}).first().isDisabled());const retry=page.getByRole('button',{name:'앱 목록 다시 불러오기',exact:true});await retry.focus();await page.keyboard.press('Enter');
  await page.getByRole('status').filter({hasText:'앱 등록 정보를 확인'}).waitFor();assert.equal(await retry.count(),0);
  assert.equal(await page.evaluate(()=>window.__writes),0);
  await page.evaluate(()=>window.__subs.at(-1).ok({metadata:{fromCache:true,hasPendingWrites:false},exists:()=>true,data:()=>({installedAppIds:[]})}));
  await page.getByRole('status').filter({hasText:'기기에 저장된 목록'}).waitFor();assert(await page.getByRole('button',{name:'등록',exact:true}).first().isDisabled());assert.equal(await page.evaluate(()=>window.__writes),0);
  await page.evaluate(()=>window.__subs.at(-1).ok({metadata:{fromCache:false,hasPendingWrites:false},exists:()=>true,data:()=>({installedAppIds:[]})}));
  await page.getByRole('status').filter({hasText:'기기에 저장된 목록'}).waitFor({state:'hidden'});assert(!(await page.getByRole('button',{name:'등록',exact:true}).first().isDisabled()));
  await page.getByRole('status').filter({hasText:'앱 등록 정보를 확인'}).waitFor({state:'hidden'});assert.equal(await page.getByRole('alert').count(),0);
  await page.evaluate(()=>window.__subs[0].error(Error('stale')));assert.equal(await retry.count(),0);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>window.__subs.length),2);
  await page.evaluate(()=>window.__remote=['habit']);await page.getByRole('button',{name:'등록',exact:true}).first().click();
  await page.getByRole('alert').filter({hasText:'다른 기기'}).waitFor();assert.equal(await page.evaluate(()=>window.__writes),0);
  await retry.click();await page.evaluate(()=>window.__subs.at(-1).ok({metadata:{fromCache:false,hasPendingWrites:false},exists:()=>true,data:()=>({installedAppIds:['habit']})}));
  await page.getByRole('alert').waitFor({state:'hidden'});await page.getByRole('button',{name:'등록',exact:true}).first().click();await page.waitForFunction(()=>window.__writes===1);
  console.log(`PASS ${width}px actual store + registry hook: keyboard retry, cache/server state, stale error fenced, conflict blocks writes then explicit reload restores saving, no overflow/pageerror`);await context.close();
 }
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
