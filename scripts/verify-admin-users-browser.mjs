import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';

const root = process.cwd();
const baseline = process.env.ADMIN_USERS_BASELINE_PAGE;
const permissions = { userManagement: false, menuManagement: false, projectBoardManagement: false, photoManagement: false, storageManagement: false };
const user = (uid, displayName, overrides = {}) => ({ revision: 'a'.repeat(64), uid, displayName, email: `${uid}@example.invalid`, photoURL: null, disabled: false, emailVerified: true, providerIds: ['password'], createdAt: '2026-01-01T00:00:00.000Z', lastSignInAt: null, role: 'user', position: 'staff', siteAccess: { corp: true, blog: true, shop: true, admin: false }, menuAccess: {}, permissions, updatedAt: null, updatedBy: null, isAdminDocLinked: false, ...overrides });
const records = [user('actor-A', '관리 운영자', { role: 'admin', position: 'ceo', permissions: Object.fromEntries(Object.keys(permissions).map(k => [k, true])), isAdminDocLinked: true }), user('member-1', '일반 회원'), user('member-2', '파트너 회원', { role: 'partner' }), user('guest-1', '중지 회원', { role: 'guest', disabled: true, emailVerified: false })];
const sites = Object.fromEntries(['corp', 'blog', 'shop', 'admin'].map(id => [id, { name: id, icon: 'users', menu: [{ id: `${id}-home`, text: `${id} 홈`, type: 'link', path: id === 'shop' ? '/propig' : `/${id}` }], trash: [] }]));
const stubs = {
  '@/contexts/AuthContext': `import {useSyncExternalStore} from 'react';export function useAuth(){const s=useSyncExternalStore(window.__subscribe,()=>window.__state);return {currentUser:s.user,loading:s.loading,isConfigured:true,loginWithGoogle:async()=>{},logout:async()=>window.__identity(null)}}`,
  '@/hooks/useCurrentUserAccess': `import {useSyncExternalStore} from 'react';export function useCurrentUserAccess(){const s=useSyncExternalStore(window.__subscribe,()=>window.__state);return {currentUser:s.user,access:s.access,isLoading:s.loading,refetch:async()=>{},error:null}}`,
  '@/contexts/MenuContext': `import {useSyncExternalStore} from 'react';export function useMenuContext(){const sites=useSyncExternalStore(window.__subscribe,()=>window.__sites);return {siteData:sites,currentSite:'admin'}}`,
  '@/hooks/useMenuSitesQuery': `import {useSyncExternalStore} from 'react';export function useMenuSitesQuery(){const data=useSyncExternalStore(window.__subscribe,()=>window.__sites);return {data,isLoading:false,error:null,refetch:async()=>{}}}`,
  '@/firebase/config': `export const auth=window.__auth;export const db={};`,
  'firebase/auth': `export const onAuthStateChanged=(auth,cb)=>window.__watchAuth(cb);export const onIdTokenChanged=onAuthStateChanged;`,
  'sonner': `export const toast={success:message=>window.__toasts.push({type:'success',message}),error:message=>window.__toasts.push({type:'error',message}),info:message=>window.__toasts.push({type:'info',message}),warning:message=>window.__toasts.push({type:'warning',message})};`,
  'next/link': `import React from 'react';export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}`,
  'next/navigation': `export const useRouter=()=>({push:()=>{},replace:()=>{},back:()=>{}});export const usePathname=()=>'/admin/users';export const useSearchParams=()=>new URLSearchParams(window.location.search);`,
};
const bundled = await build({
  stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import Page from './src/app/admin/users/page';window.__query=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});const root=createRoot(document.getElementById('root'));window.__unmount=()=>root.unmount();root.render(<React.StrictMode><QueryClientProvider client={window.__query}><Page/></QueryClientProvider></React.StrictMode>);`, resolveDir: root, loader: 'tsx' },
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'isolated-auth-and-transport', setup(b) {
    b.onResolve({ filter: /.*/ }, a => {
      if (a.path in stubs) return { path: a.path, namespace: 'fixture' };
      if (baseline && a.path === './src/app/admin/users/page') return { path: baseline, namespace: 'baseline' };
    });
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: stubs[a.path], loader: 'tsx', resolveDir: root }));
    b.onLoad({ filter: /.*/, namespace: 'baseline' }, a => ({ contents: fs.readFileSync(a.path, 'utf8'), loader: 'tsx', resolveDir: root }));
  } }],
});
const bootstrap = `
window.__records=${JSON.stringify(records)};window.__sites=${JSON.stringify(sites)};
window.__calls=[];window.__toasts=[];window.__pending=[];window.__modes={};window.__confirm=true;window.__dialogs=[];
const nativeTimeout=window.setTimeout.bind(window);window.setTimeout=(fn,ms,...args)=>nativeTimeout(fn,window.__fastDeadline&&ms===20000?300:ms,...args);
window.confirm=message=>{window.__dialogs.push(message);return window.__confirm};
const listeners=new Set(), authListeners=new Set();window.__subscribe=cb=>{listeners.add(cb);return()=>listeners.delete(cb)};
window.__watchAuth=cb=>{authListeners.add(cb);queueMicrotask(()=>{if(authListeners.has(cb))cb(window.__auth.currentUser)});return()=>authListeners.delete(cb)};
window.__notify=()=>listeners.forEach(cb=>cb());
window.__stage=async(stage,fn)=>{const mode=window.__modes[stage];if(mode==='hold')await new Promise((resolve,reject)=>window.__pending.push({stage,resolve,reject}));if(mode==='fail')throw Error('격리 요청 실패');return fn()};
window.__release=(stage,fail=false)=>{const ps=window.__pending.filter(p=>p.stage===stage);window.__pending=window.__pending.filter(p=>p.stage!==stage);ps.forEach(p=>fail?p.reject(Error('격리 지연 실패')):p.resolve())};
window.__makeUser=uid=>uid?{uid,getIdToken:()=>window.__stage('token',()=> 'fixture-token:'+uid)}:null;
window.__auth={currentUser:window.__makeUser('actor-A')};
window.__makeAccess=role=>({role,position:'staff',siteAccess:{},menuAccess:{},permissions:${JSON.stringify(permissions)}});
window.__state={user:window.__auth.currentUser,access:window.__makeAccess('admin'),loading:false};
window.__sdk=uid=>{window.__auth.currentUser=window.__makeUser(uid);authListeners.forEach(cb=>cb(window.__auth.currentUser))};
window.__identity=(uid,role='admin',loading=false)=>{window.__sdk(uid);window.__state={user:window.__auth.currentUser,access:window.__makeAccess(role),loading};window.__notify()};
window.__role=role=>{window.__state={...window.__state,access:window.__makeAccess(role)};window.__notify()};
window.__refreshSites=()=>{window.__sites=JSON.parse(JSON.stringify(window.__sites));window.__notify()};
const storage={canPersist:true,credentialMode:'isolated-fixture',message:null};
window.fetch=async(input,options={})=>{
 const url=new URL(typeof input==='string'?input:input.url,location.origin);if(url.pathname!=='/api/admin/users')throw Error('Unexpected fixture fetch path');
 const method=options.method||'GET';const actor=new Headers(options.headers).get('Authorization');const body=options.body?JSON.parse(options.body):null;
 window.__calls.push({method,actor,body,url:url.href});
 const mode=window.__modes[method==='GET'?'list':'save'];
 return window.__stage(method==='GET'?'list':'save',()=>{
  let payload,status=200;
  if(mode==='denied'){status=403;payload={error:'격리 권한 거절'}}
  else if(mode==='invalid'){status=400;payload={error:'격리 입력 거절'}}
  else if(mode==='conflict'){status=409;payload={error:'다른 관리자가 변경했습니다. 새로고침 후 다시 편집하세요.',code:'USER_UPDATE_CONFLICT'}}
  else if(mode==='in-progress'){status=409;payload={error:'다른 저장 요청이 진행 중입니다. 새로고침으로 확인하세요.',code:'USER_UPDATE_IN_PROGRESS'}}
  else if(mode==='actor-unsafe'){status=403;payload={error:'현재 관리자 권한을 확인할 수 없습니다. 새로고침 후 다시 확인하세요.',code:'USER_UPDATE_ACTOR_UNSAFE'}}
  else if(mode==='uncertain'){status=503;payload={error:'변경이 일부 반영되었을 수 있습니다. 새로고침 후 상태를 확인해 주세요.',code:'USER_UPDATE_UNCERTAIN'}}
  else if(mode==='malformed')payload={};
  else if(method==='GET'){
   const list=actor?.endsWith('actor-B')?[${JSON.stringify(user('B-only', 'B 전용 회원'))}]:url.searchParams.has('pageToken')?[${JSON.stringify(user('next-page', '다음 페이지 회원'))}]:window.__records;
   payload={users:structuredClone(list),storage,nextPageToken:url.searchParams.has('pageToken')?null:'fixture-page-2'};
  }else{
   const i=window.__records.findIndex(u=>u.uid===body.uid);if(i<0)throw Error('Unexpected target');
   window.__records[i]={...window.__records[i],...body,revision:'b'.repeat(64),updatedAt:'2026-09-09T00:00:00.000Z'};
   payload={ok:true,user:structuredClone(window.__records[i]),storage};if(mode==='wrong-uid')payload.user.uid='wrong-target';
  }
  return {ok:status<400,status,json:()=>window.__stage('json',()=>payload)};
 });
};
`;
const server = http.createServer((req, res) => {
  if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(bundled.outputFiles[0].contents); }
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>격리 유저 관리 회귀</title><style>html,body{margin:0;font-family:Arial,sans-serif}*{box-sizing:border-box}</style></head><body><div id="root"></div><script>${bootstrap}</script><script src="/bundle.js"></script></body></html>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1366, height: 1000 } });
  const page = await context.newPage(); const errors = []; const external = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => { if (new URL(route.request().url()).origin !== origin) { external.push(route.request().url()); return route.abort(); } return route.continue(); });
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const ready = async () => { await page.goto(origin, { waitUntil: 'domcontentloaded' }); await page.getByRole('button', { name: /일반 회원/ }).waitFor(); };
  const choose = async () => { await page.getByRole('button', { name: /일반 회원/ }).click(); await page.locator('#position-select').waitFor(); await settle(); };
  await ready(); await choose();
  if (baseline) {
    await page.locator('#position-select').selectOption('manager');
    await page.evaluate(() => window.__refreshSites()); await settle();
    assert.equal(await page.locator('#position-select').inputValue(), 'staff', 'reproduce dirty draft erased by sites refresh');
    await page.evaluate(() => { window.__modes.list = 'hold'; window.__identity('actor-B'); }); await settle();
    assert(await page.getByRole('button', { name: /일반 회원/ }).count(), 'reproduce previous account cached list shown');
    console.log('REPRODUCED actual old page: draft reset on menu snapshot and previous-account cached user list; isolated identity/IO only');
  } else {
    // Behavioral scenarios below are maintained alongside the actual page controller.
    await page.locator('#position-select').selectOption('manager');
    await page.evaluate(() => window.__refreshSites()); await settle();
    assert.equal(await page.locator('#position-select').inputValue(), 'manager', 'menu snapshots preserve dirty draft');
    const position = page.locator('#position-select');
    const save = () => page.getByRole('button', { name: '변경 사항 저장', exact: true });
    const patches = () => page.evaluate(() => window.__calls.filter(c => c.method === 'PATCH').length);
    await page.evaluate(() => { window.__confirm = false; });
    await page.getByRole('button', { name: /파트너 회원/ }).click();
    assert.equal(await page.locator('[data-selected-uid]').getAttribute('data-selected-uid'), 'member-1');
    assert.equal(await position.inputValue(), 'manager');
    await page.evaluate(() => { window.__confirm = true; });
    await page.getByRole('button', { name: /파트너 회원/ }).click(); await settle();
    assert.equal(await position.inputValue(), 'staff');
    await choose(); await position.selectOption('manager');
    await page.evaluate(() => { window.__modes.save = 'hold'; });
    await save().evaluate(b => { b.click(); b.click(); });
    await page.waitForFunction(() => window.__pending.some(p => p.stage === 'save'));
    assert.equal(await patches(), 1, 'same-tick duplicate save is blocked');
    await position.selectOption('intern');
    await page.evaluate(() => { window.__modes.save = 'normal'; window.__release('save'); });
    await page.waitForFunction(() => window.__toasts.some(t => t.type === 'success'));
    assert.equal(await position.inputValue(), 'intern', 'late ACK preserves new edits');
    assert.equal(await page.evaluate(() => window.__records.find(u => u.uid === 'member-1').position), 'manager');
    await save().click(); await page.waitForFunction(() => window.__records.find(u => u.uid === 'member-1').position === 'intern');
    await page.getByText('저장된 상태', { exact: true }).waitFor();
    assert.equal(await save().isDisabled(), true);
    console.log('PASS draft ownership, discard confirmation, save ACK, edit-during-save, synchronous duplicate lock');

    for (const mode of ['invalid', 'uncertain', 'malformed', 'wrong-uid']) {
      await ready(); await choose(); await position.selectOption('manager');
      await page.evaluate(mode => { window.__modes.save = mode; }, mode); await save().click();
      await page.getByRole('alert').waitFor(); assert.equal(await position.inputValue(), 'manager');
      assert.equal(await page.evaluate(() => window.__toasts.filter(t => t.type === 'success').length), 0);
      const count = await patches();
      if (mode !== 'invalid') {
        assert.equal(await save().isDisabled(), true, 'uncertain result requires reconciliation');
        await save().evaluate(b => b.click()); assert.equal(await patches(), count);
        await page.evaluate(() => { window.__modes.save = 'normal'; });
        await page.getByRole('button', { name: '새로고침으로 저장 상태 확인', exact: true }).click();
        await page.getByText('저장된 상태', { exact: true }).waitFor();
      } else {
        await page.evaluate(() => { window.__modes.save = 'normal'; }); await save().click();
        await page.waitForFunction(() => window.__toasts.some(t => t.type === 'success'));
      }
    }
    console.log('PASS validation failure retry and uncertain/malformed/wrong-user ACK reconciliation');

    for (const stage of ['token', 'save', 'json']) {
      for (const fail of [false, true]) {
        await ready(); await choose(); await position.selectOption('manager');
        await page.evaluate(stage => { window.__modes[stage] = 'hold'; }, stage); await save().click();
        await page.waitForFunction(stage => window.__pending.some(p => p.stage === stage), stage);
        await page.evaluate(() => { window.__modes = {}; window.__sdk('actor-B'); window.__sdk('actor-A'); });
        await settle(); await page.getByRole('button', { name: /일반 회원/ }).waitFor();
        await page.evaluate(({ stage, fail }) => window.__release(stage, fail), { stage, fail }); await settle();
        assert.deepEqual(await page.evaluate(() => window.__toasts), [], `stale ${stage} ${fail} has no toast`);
        if (stage === 'token') assert.equal(await patches(), 0, 'late token must not send mutation');
      }
    }
    await ready(); await choose(); await position.selectOption('manager');
    await page.evaluate(() => { window.__modes.save = 'hold'; }); await save().click();
    await page.waitForFunction(() => window.__pending.some(p => p.stage === 'save'));
    await page.evaluate(() => window.__role('user'));
    await page.getByRole('heading', { name: '유저 관리 권한이 없습니다', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: /일반 회원/ }).count(), 0);
    await page.evaluate(() => window.__release('save', true)); await settle();
    assert.deepEqual(await page.evaluate(() => window.__toasts), []);
    console.log('PASS token/fetch/JSON A→B→A success and rejection; permission revocation removes sensitive UI');

    await ready(); await choose(); await position.selectOption('manager');
    await page.evaluate(() => { window.__modes.token = 'hold'; window.__fastDeadline = true; }); await save().click();
    await page.getByRole('alert').waitFor();
    assert.equal(await patches(), 0);
    await page.evaluate(() => { window.__fastDeadline = false; window.__release('token'); }); await settle();
    assert.equal(await patches(), 0, 'expired token acquisition cannot later send PATCH');
    assert.equal(await save().isDisabled(), true);
    await ready(); await choose(); await position.selectOption('manager');
    await page.evaluate(() => { window.__modes.save = 'hold'; }); await save().click();
    await page.waitForFunction(() => window.__pending.some(p => p.stage === 'save'));
    await page.getByRole('button', { name: '상세 닫기 · 목록으로', exact: true }).click();
    await choose(); await position.selectOption('intern');
    await page.evaluate(() => window.__release('save')); await settle();
    assert.equal(await position.inputValue(), 'intern', 'reopened same UID has a distinct editor identity');
    assert.deepEqual(await page.evaluate(() => window.__toasts), []);
    await ready(); await choose(); await position.selectOption('manager');
    await page.evaluate(() => { window.__modes.save = 'hold'; }); await save().click();
    await page.waitForFunction(() => window.__pending.some(p => p.stage === 'save'));
    await page.evaluate(() => window.__unmount());
    await page.evaluate(() => window.__release('save', true)); await settle();
    assert.deepEqual(await page.evaluate(() => window.__toasts), []);
    console.log('PASS whole-request deadline, late token rejection, same-UID reopen, unmount late failure');

    for (const mode of ['conflict', 'in-progress', 'actor-unsafe']) {
      await ready(); await choose(); await position.selectOption('manager');
      await page.evaluate(mode => {window.__modes.save=mode;}, mode); await save().click();
      await page.getByRole('alert').waitFor();
      assert.equal(await page.evaluate(() => window.__calls.find(c=>c.method==='PATCH').body.expectedRevision), 'a'.repeat(64));
      assert.equal(await position.inputValue(), 'manager', 'conflict preserves unsaved draft');
      assert.equal(await save().isDisabled(), true, 'conflict cannot blindly resubmit');
      await page.getByRole('button', {name:'상세 닫기 · 목록으로',exact:true}).click(); await choose();
      assert.equal(await save().isDisabled(), true, 'reopening does not clear server conflict');
      await page.evaluate(() => {delete window.__modes.save;window.__records.find(u=>u.uid==='member-1').revision='c'.repeat(64);});
      await page.getByRole('button', {name:'새로고침으로 저장 상태 확인',exact:true}).click();
      await page.waitForFunction(() => window.__calls.filter(c=>c.method==='GET').length>1); await settle();
      await position.selectOption('intern'); await save().click();
      await page.waitForFunction(() => window.__toasts.some(t=>t.type==='success'));
      assert.equal(await page.evaluate(() => window.__calls.filter(c=>c.method==='PATCH').at(-1).body.expectedRevision), 'c'.repeat(64));
    }
    console.log('PASS server revision echo, conflict/in-progress preservation and explicit refresh recovery');



    await ready();
    await page.evaluate(() => { window.__modes.list = 'hold'; window.__identity('actor-B'); }); await settle();
    assert.equal(await page.getByRole('button', { name: /일반 회원/ }).count(), 0, 'previous account data removed while new request is pending');
    await page.evaluate(() => { window.__modes.list = 'normal'; window.__release('list'); });
    await page.getByRole('button', { name: /B 전용 회원/ }).waitFor();
    assert.equal(await page.getByRole('button', { name: /일반 회원/ }).count(), 0);
    await ready();
    await page.getByLabel('상태 필터').selectOption('disabled');
    assert.equal(await page.getByRole('button', { name: /일반 회원/ }).count(), 0);
    await page.getByRole('button', { name: /중지 회원/ }).waitFor();
    await page.getByLabel('상태 필터').selectOption('all');
    await page.getByLabel('이름, 이메일, UID 검색').fill('없는 이름');
    await page.getByRole('button', { name: '검색 조건 초기화', exact: true }).click();
    await page.getByRole('button', { name: '더 불러오기', exact: true }).click();
    await page.getByRole('button', { name: /다음 페이지 회원/ }).waitFor();
    assert(await page.evaluate(() => window.__calls.some(c => c.method === 'GET' && new URL(c.url).searchParams.get('pageToken') === 'fixture-page-2')));
    await page.getByRole('button', { name: /관리 운영자/ }).click();
    assert.equal(await page.getByRole('button', { name: '계정 비활성화', exact: true }).isDisabled(), true);
    await choose(); await page.getByRole('button', { name: '계정 비활성화', exact: true }).click();
    await page.evaluate(() => { window.__confirm = false; }); const beforeRisk = await patches(); await save().click();
    assert.equal(await patches(), beforeRisk, 'risk confirmation cancellation prevents writes');
    await page.evaluate(() => { window.__confirm = true; }); await save().click(); await page.getByText('저장된 상태', { exact: true }).waitFor();
    console.log('PASS UID cache boundary, status/search reset, cursor paging, self lockout, dangerous-change confirmation');

    await ready(); await choose();
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    fs.writeFileSync('/tmp/propig-users-axe.json', JSON.stringify(axe.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), null, 2));
    assert.deepEqual(axe.violations.map(v => v.id), [], 'user management accessibility violations');
    await page.screenshot({ path: '/tmp/propig-users-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); await ready(); await choose();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await position.selectOption('manager'); await save().scrollIntoViewIfNeeded(); await save().click();
    await page.getByText('저장된 상태', { exact: true }).waitFor();
    await page.getByRole('button', { name: '상세 닫기 · 목록으로', exact: true }).click();
    await page.screenshot({ path: '/tmp/propig-users-mobile.png', fullPage: true });
    assert(await page.getByRole('link', { name: '관리자 홈', exact: true }).count());
    await page.evaluate(() => window.__identity(null));
    await page.getByRole('heading', { name: '로그인이 필요합니다', exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox').count(), 0);
    console.log('PASS actual users page desktop/mobile, scroll-to-save, close/focus, logged-out gate; no real user mutations');
  }
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  if (!baseline && process.env.BASE_URL) {
    for (const width of [1366, 390]) {
      const guest = await browser.newPage({ viewport: { width, height: 844 } });
      const guestErrors = []; let privateRequests = 0;
      guest.on('pageerror', error => guestErrors.push(error.message));
      await guest.route('**/api/admin/users**', route => { privateRequests++; return route.abort(); });
      await guest.goto(new URL('/admin/users?__adminUsersFixture=1', process.env.BASE_URL).href, { waitUntil: 'domcontentloaded' });
      await guest.getByRole('heading', { name: '로그인이 필요합니다', exact: true }).waitFor({ timeout: 25000 });
      assert.equal(await guest.locator('[data-user-uid]').count(), 0);
      assert.equal(await guest.locator('main input').count(), 0);
      assert.equal(privateRequests, 0, 'guest/obsolete fixture query never requests private users');
      assert.deepEqual(guestErrors, []);
      assert(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await guest.close();
    }
    console.log('PASS actual built/remote users route guest gate desktop/mobile; obsolete fixture query cannot bypass auth; private API requests 0');
  }
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
