import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
const root = process.cwd();
const fixture = { admin: { name: '격리 관리자', icon: 'shield', menu: [{ id: 'fixture-edit', text: '격리 메뉴', type: 'link', icon: 'globe', path: '/admin/menu-fixture' }], trash: [] }, corp: { name: '격리 기업', icon: 'building', menu: [], trash: [] } };
const stubs = {
 '@/contexts/AuthContext': `export const useAuth=()=>({loginWithGoogle:()=>{},isConfigured:true});`,
 '@/hooks/useCurrentUserAccess': `import {useSyncExternalStore} from 'react'; const subscribe=cb=>{window.addEventListener('fixture-role',cb);return()=>window.removeEventListener('fixture-role',cb)}; export function useCurrentUserAccess(){const role=useSyncExternalStore(subscribe,()=>window.__role);return {currentUser:window.__auth.currentUser, access:{role,permissions:{menuManagement:role==='admin'}},isLoading:false}}`,
 '@/contexts/MenuContext': `export const useMenuContext=()=>({currentSite:'admin'});`,
 '@/hooks/useMenuSitesQuery': `export const MENU_SITES_QUERY_KEY=['menu-sites'];`,
 '@/services/activityLogService': `export const recordActivityLog=async()=>{};`,
 '@/firebase/config': `export const auth=window.__auth; export const db={};`,
 'firebase/firestore': `export const doc=()=>({}); export const getDoc=async()=>({exists:()=>true,data:()=>({version:46,sites:window.__sites})}); export const onSnapshot=()=>()=>{};`,
};
const bundled = await build({
 stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import Page from './src/app/admin/menu/page';createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><Page/></QueryClientProvider>);`,resolveDir:root,loader:'tsx'},
 bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},
 plugins:[{name:'isolated-identity-and-io',setup(b){b.onResolve({filter:/.*/},a=>a.path in stubs?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:stubs[a.path],loader:'js',resolveDir:root}));}}],
});
let stored = structuredClone(fixture); let calls=0; let fail=false; let hold=false; let release;
let markHeld; const heldRequest = new Promise(resolve => { markHeld = resolve; });
const server = http.createServer(async(req,res)=>{
 if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');return res.end(bundled.outputFiles[0].contents)}
 if(req.url==='/api/admin/menu-sites'){
  assert.equal(req.method,'PUT'); calls++; let body='';for await(const part of req) body+=part;
  if(hold)await new Promise(resolve=>{release=resolve;markHeld()});
  res.setHeader('Content-Type','application/json');
  if(fail){res.statusCode=403;return res.end(JSON.stringify({error:'격리 저장 거절'}))}
  stored=JSON.parse(body).sites;return res.end('{"ok":true}');
 }
 res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html lang="ko"><head><meta charset="utf-8"></head><body><div id="root"></div><script>window.__sites=${JSON.stringify(fixture)};window.__role='admin';window.__auth={currentUser:{uid:'isolated-browser-user',getIdToken:async()=>'isolated-fixture-token'}};</script><script src="/bundle.js"></script></body></html>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1366,height:900}});const errors=[];const external=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){external.push(route.request().url());return route.abort()}return route.continue()});
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 await page.getByLabel('자동 저장',{exact:true}).uncheck();
 await page.locator('.admin-menu-row-title').filter({hasText:'격리 메뉴'}).click();
 const input=page.locator('.admin-menu-inspector').getByRole('textbox',{name:'메뉴명',exact:true});
 await input.fill('첫 저장'); await page.getByRole('button',{name:'저장',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.admin-menu-save-status')?.textContent?.includes('저장됨'));
 assert.equal(stored.admin.menu.find(x=>x.id==='fixture-edit').text,'첫 저장');
 fail=true;await input.fill('실패해도 보존');await page.getByRole('button',{name:'저장',exact:true}).click();
 await page.getByRole('button',{name:'다시 저장',exact:true}).waitFor();
 assert.equal(await input.inputValue(),'실패해도 보존');assert.equal(stored.admin.menu.find(x=>x.id==='fixture-edit').text,'첫 저장');
 const failedCalls=calls;await page.waitForTimeout(1400);assert.equal(calls,failedCalls,'no retry storm');
 fail=false;await page.getByRole('button',{name:'다시 저장',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.admin-menu-save-status')?.textContent?.includes('저장됨'));
 assert.equal(stored.admin.menu.find(x=>x.id==='fixture-edit').text,'실패해도 보존');
 hold=true;await input.fill('진행 중 A');await page.getByRole('button',{name:'저장',exact:true}).click();
 await page.getByRole('button',{name:'저장 중…',exact:true}).waitFor();
 await input.fill('더 최신 B');
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('held save request did not start')),5000);heldRequest.then(()=>{clearTimeout(timer);resolve()})});
 hold=false;release();
 await page.getByRole('button',{name:'저장',exact:true}).waitFor();
 assert.equal(await input.inputValue(),'더 최신 B','old save response preserves new draft');
 assert.equal(stored.admin.menu.find(x=>x.id==='fixture-edit').text,'진행 중 A');
 await page.getByRole('button',{name:'저장',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.admin-menu-save-status')?.textContent?.includes('저장됨'));
 assert.equal(stored.admin.menu.find(x=>x.id==='fixture-edit').text,'더 최신 B');
 const beforeRevoke=calls;await page.evaluate(()=>{window.__role='user';window.dispatchEvent(new Event('fixture-role'))});
 await page.getByText('통합 메뉴 관리 권한이 없습니다.',{exact:true}).waitFor();assert.equal(calls,beforeRevoke);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log('PASS actual admin page + service in isolated browser: save/failure/retry, edit-during-save, permission revocation, no external requests or pageerrors');
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
