import assert from 'node:assert/strict';
import http from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

const fixture = {id:'0123456789abcdef0123456789abcdef',email:'member@example.invalid',intendedRole:'user',status:'pending',createdAt:'2026-09-12T00:00:00.000Z',expiresAt:'2099-09-19T00:00:00.000Z',createdBy:'admin-A',acceptedBy:null,acceptedAt:null};
const token = 'b'.repeat(64);
const stubs = {
 '@/contexts/AuthContext': `import {useSyncExternalStore} from 'react';export function useAuth(){const s=useSyncExternalStore(window.__subscribe,()=>window.__state);return {...s,isConfigured:true,loginWithGoogle:async()=>window.__identity('member-A','user'),logout:async()=>window.__identity(null)}}`,
 '@/hooks/useCurrentUserAccess': `import {useSyncExternalStore} from 'react';export function useCurrentUserAccess(){const s=useSyncExternalStore(window.__subscribe,()=>window.__state);return {currentUser:s.currentUser,access:{role:s.role,permissions:{userManagement:false}},isLoading:s.loading,error:null,refetch:async()=>{}}}`,
 '@/firebase/config': `export const auth=window.__auth;`,
 'firebase/auth': `export const onAuthStateChanged=(auth,cb)=>window.__watch(cb);export const onIdTokenChanged=onAuthStateChanged;export const reload=async()=>{};`,
 'next/link': `import React from 'react';export default function Link({href,children,onNavigate,...props}){return <a href={href} {...props}>{children}</a>}`,
 'next/navigation': `export const useRouter=()=>({push:()=>{},replace:()=>{},refresh:()=>{}});export const useSearchParams=()=>new URLSearchParams(location.search);export const usePathname=()=>location.pathname;`,
 'sonner': `export const toast={success:()=>{},error:()=>{},info:()=>{}};`,
};
const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import Manager from './src/components/admin/InvitationManager';import Acceptance from './src/app/invite/page';const root=createRoot(document.getElementById('root'));window.__unmount=()=>root.unmount();root.render(<React.StrictMode><QueryClientProvider client={new QueryClient()}>{location.pathname==='/invite'?<Acceptance/>:<Manager/>}</QueryClientProvider></React.StrictMode>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'isolated-identity-io',setup(b){b.onResolve({filter:/.*/},a=>a.path in stubs?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:stubs[a.path],loader:'tsx',resolveDir:process.cwd()}));}}]});
const bootstrap=`
window.__calls=[];window.__records=[${JSON.stringify(fixture)}];window.__mode='ok';window.__pending=[];window.confirm=()=>true;
const listeners=new Set(),watchers=new Set();window.__subscribe=cb=>{listeners.add(cb);return()=>listeners.delete(cb)};window.__watch=cb=>{watchers.add(cb);queueMicrotask(()=>watchers.has(cb)&&cb(window.__auth.currentUser));return()=>watchers.delete(cb)};
window.__user=uid=>uid?{uid,email:'member@example.invalid',emailVerified:true,getIdToken:async()=>uid,reload:async()=>{}}:null;
window.__auth={currentUser:window.__user(new URLSearchParams(location.search).get('guest')?null:location.pathname==='/invite'?'member-A':'admin-A')};
window.__state={currentUser:window.__auth.currentUser,role:location.pathname==='/invite'?'user':'admin',loading:false};
window.__identity=(uid,role='admin')=>{window.__auth.currentUser=window.__user(uid);watchers.forEach(cb=>cb(window.__auth.currentUser));window.__state={...window.__state,currentUser:window.__auth.currentUser,role};listeners.forEach(cb=>cb())};
window.__release=()=>window.__pending.splice(0).forEach(fn=>fn());
window.fetch=async(url,options={})=>{
 const method=options.method||'GET',body=options.body?JSON.parse(options.body):null;window.__calls.push({url,method,body});
 const mode=window.__mode;if(mode==='hold')await new Promise(resolve=>window.__pending.push(resolve));
 let status=200,payload;
 if(mode==='failure'){status=503;payload={error:'격리 저장 실패'};}
 else if(String(url).includes('/accept')){payload={ok:true,invitation:{...window.__records[0],status:'accepted',acceptedBy:'member-A',acceptedAt:new Date().toISOString()},accessReviewRequired:true};}
 else if(method==='GET')payload={invitations:structuredClone(window.__records),nextCursor:null};
 else if(method==='POST'){const invitation={...window.__records[0],id:'abcdef0123456789abcdef0123456789',email:body.email,intendedRole:body.intendedRole};window.__records.push(invitation);payload={invitation,token:'${token}'};}
 else {const invitation=window.__records.find(x=>x.id===body.id);if(body.action==='cancel')invitation.status='cancelled';else invitation.status='pending';payload={invitation:{...invitation},...(body.action==='reissue'?{token:'${token}'}:{})};}
 return {ok:status<400,status,json:async()=>payload};
};
`;
const server=http.createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('Content-Type','application/javascript');return res.end(bundle.outputFiles[0].contents);}res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>초대 격리 회귀</title><style>body{margin:0}*{box-sizing:border-box}</style></head><body><div id="root"></div><script>${bootstrap}</script><script src="/bundle.js"></script></body></html>`);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;let browser;
try {
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox']});
 const context=await browser.newContext();const page=await context.newPage();const errors=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{if(new URL(r.request().url()).origin!==origin){external.push(r.request().url());return r.abort();}return r.continue();});
 for(const width of [1366,390]){
  await page.setViewportSize({width,height:900});
  await page.goto(origin+'/admin/users/invitations?guest=1');await page.getByRole('button',{name:/Google.*로그인/}).waitFor();
  assert.equal(await page.evaluate(()=>window.__calls.length),0);
  await page.goto(origin+'/admin/users/invitations');await page.getByText('member@example.invalid',{exact:true}).first().waitFor();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 await page.goto(origin+'/admin/users/invitations');
 await page.getByLabel('초대받을 이메일',{exact:true}).fill('new@example.invalid');
 await page.getByRole('combobox',{name:/검토 요청 역할/}).selectOption('partner');
 await page.waitForFunction(()=>document.querySelector('button[type="submit"]')?.disabled===false);
 await page.getByRole('button',{name:'초대 링크 발급',exact:true}).evaluate(el=>{el.click();el.click()});
 await page.locator('#invitation-link').waitFor({timeout:5000}).catch(async error=>{console.log('CREATE DIAGNOSTIC',await page.locator('body').innerText(),await page.evaluate(()=>({calls:window.__calls.map(c=>({method:c.method,url:c.url})),email:document.querySelector('#invitation-email').value,role:document.querySelector('#invitation-role').value})));throw error;});
 const generated=await page.locator('#invitation-link').inputValue();
 assert.equal(new URL(generated).search,'');assert(new URL(generated).hash.includes('token='));
 assert.equal(await page.evaluate(()=>window.__calls.filter(c=>c.method==='POST').length),1);
 assert.equal(await page.evaluate(()=>Object.values(localStorage).join('')+Object.values(sessionStorage).join('')),'');
 const original=page.getByRole('article',{name:'member@example.invalid 초대',exact:true});
 await original.getByRole('button',{name:'링크 재발급',exact:true}).click();
 await page.waitForFunction(()=>window.__calls.some(c=>c.body?.action==='reissue'));
 await original.getByRole('button',{name:'초대 취소',exact:true}).click();
 await original.getByText(/취소된 초대는 다시 사용할 수 없습니다/).waitFor();
 await page.goto(origin+'/admin/users/invitations');await page.getByText('member@example.invalid',{exact:true}).first().waitFor();
 await page.getByLabel('초대받을 이메일',{exact:true}).fill('slow@example.invalid');
 await page.evaluate(()=>window.__mode='hold');await page.getByRole('button',{name:'초대 링크 발급',exact:true}).click();
 await page.waitForFunction(()=>window.__pending.length===1);
 await page.evaluate(()=>{window.__mode='ok';window.__identity('admin-B');window.__identity('admin-A');window.__release()});
 await page.getByRole('heading',{name:'초대 링크 발급',exact:true}).waitFor();
 assert.equal(await page.locator('#invitation-link').count(),0,'stale A-B-A token must not display');
 for(const width of [1366,390]){
  await page.setViewportSize({width,height:900});
  await page.goto(origin+'/invite?guest=1#id='+fixture.id+'&token='+token);
  await page.getByRole('button',{name:'Google로 로그인',exact:true}).waitFor();
  assert.equal(new URL(page.url()).hash,'');assert.equal(await page.evaluate(()=>window.__calls.length),0);
  await page.getByRole('button',{name:'Google로 로그인',exact:true}).click();
  await page.getByRole('button',{name:'초대 수락',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__calls.length),0,'no automatic acceptance');
  await page.getByRole('button',{name:'초대 수락',exact:true}).evaluate(el=>{el.click();el.click()});
  await page.getByRole('heading',{name:'온보딩 접수가 완료되었습니다',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__calls.length),1);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:`/tmp/propig-invitations-accept-${width}.png`,fullPage:true});
  await page.reload();await page.getByRole('alert').filter({hasText:'유효한 초대 링크가 없습니다'}).waitFor();
 }
 // The next original link opens in the same tab via a hash-only navigation.
 await page.goto(origin+'/invite#id='+fixture.id+'&token='+token);
 await page.getByRole('button',{name:'초대 수락',exact:true}).waitFor();
 await page.evaluate(()=>window.__mode='hold');await page.getByRole('button',{name:'초대 수락',exact:true}).click();
 await page.waitForFunction(()=>window.__pending.length===1);
 await page.evaluate(()=>{window.__mode='ok';window.__identity('other-member','user');window.__release()});
 await page.getByRole('button',{name:'초대 수락',exact:true}).waitFor();
 assert.equal(await page.getByRole('heading',{name:'온보딩 접수가 완료되었습니다',exact:true}).count(),0,'late acceptance cannot cross account');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log('PASS actual invitation React: guest gating, admin create/reissue/cancel, synchronous duplicate guard, A-B-A stale token fence, fragment scrub/no storage, explicit accept, account fence, reload invalidation, desktop/mobile; auth/IO mocked; no live writes');
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
