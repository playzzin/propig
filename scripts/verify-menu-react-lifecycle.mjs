// Run with React 19.2.3 + react-test-renderer 19.2.3 installed in MENU_TEST_RUNTIME.
// This executes the real hooks/provider; only network, routing and identity are mocked.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const runtime = process.env.MENU_TEST_RUNTIME
  ? createRequire(path.resolve(process.env.MENU_TEST_RUNTIME, 'package.json')) : require;
const React = runtime('react');
const { act, create } = runtime('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const modules = new Map();
let pathname = '/corp/company/introduction';
let stored = null;
const history = {
  state: { __NA: true, tree: 'preserved-router-state' },
  replaceState(value) { this.state = value; },
};
const sites = Object.fromEntries(['corp', 'blog', 'shop', 'admin'].map((id) => [id, {
  name: id, menu: [{ id: `${id}-home`, text: id, path: `/${id}` }],
}]));
let access = { isLoading: false, access: { role: 'guest', position: 'staff', permissions: {}, siteAccess: {} } };
sites.blog.menu.push({ id: 'blog-bookmarks', text: '북마크', path: '/bookmarks' });
sites.shop.menu.push({ id: 'shop-habit', text: '습관', path: '/habit-tracker' });
sites.admin.menu.push({ id: 'admin-habit', text: '습관', path: '/habit-tracker' });
let resolveBootstrap;
let loadCount = 0;
const subscriptions = new Map();
const capturedCallbacks = [];
const service = {
  getDefaultSites: () => sites,
  getCachedSites: () => null,
  loadAllSites: () => { loadCount += 1; return new Promise((resolve) => { resolveBootstrap = resolve; }); },
  subscribeToMenuChanges: (id, callback) => {
    subscriptions.set(id, callback);
    capturedCallbacks.push(callback);
    return () => subscriptions.delete(id);
  },
};
const mocks = {
  react: React,
  'react/jsx-runtime': runtime('react/jsx-runtime'),
  'next/navigation': { usePathname: () => pathname },
  '@/hooks/useCurrentUserAccess': { useCurrentUserAccess: () => access },
  '@/services/menuService': { menuService: service },
};
function load(relative) {
  if (modules.has(relative)) return modules.get(relative);
  const filename = path.resolve(relative);
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} };
  modules.set(relative, module.exports);
  const localRequire = (id) => {
    if (mocks[id]) return mocks[id];
    if (id.startsWith('@/')) {
      const base = `src/${id.slice(2)}`;
      return load(fs.existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`);
    }
    return require(id);
  };
  vm.runInNewContext(output, { module, exports: module.exports, require: localRequire, queueMicrotask, console,
    window: { history, localStorage: { getItem: () => stored, setItem: (_, value) => { stored = value; } } },
  }, { filename });
  return module.exports;
}
const { MenuProvider, useMenuContext } = load('src/contexts/MenuContext.tsx');
let current;
function Probe() { current = useMenuContext(); return null; }
let renderer;
const tree = () => React.createElement(MenuProvider, null, React.createElement(Probe));
await act(async () => { renderer = create(tree()); });
assert.equal(current.currentSite, 'corp');
assert.equal(loadCount, 1);
await act(async () => { current.setCurrentSite('blog'); });
assert.equal(current.currentSite, 'blog', 'manual mode must survive the old corp pathname');
assert.equal(stored, 'blog');
assert.equal(loadCount, 1, 'mode switching must not reload all sites');
assert.deepEqual([...subscriptions.keys()], ['blog']);
const liveBlog = { ...sites.blog, name: 'live blog', menu: [{ id: 'live', text: 'live', path: '/blog/live' }] };
await act(async () => { subscriptions.get('blog')(liveBlog); });
await act(async () => { resolveBootstrap({ ...sites, blog: { ...sites.blog, name: 'stale bootstrap' } }); });
assert.equal(current.siteData.blog.name, 'live blog', 'late bootstrap must not overwrite a live snapshot');
assert.equal(current.filteredMenu[0].id, 'live');
await act(async () => { capturedCallbacks[0]({ ...sites.corp, name: 'disposed snapshot' }); });
assert.notEqual(current.siteData.corp.name, 'disposed snapshot');
await act(async () => { pathname = '/blog'; renderer.update(tree()); });
assert.equal(current.currentSite, 'blog');
await act(async () => { pathname = '/corp/company/introduction'; renderer.update(tree()); });
assert.equal(current.currentSite, 'corp', 'back navigation must synchronize to the committed route');
await act(async () => { current.setCurrentSite('blog'); current.setCurrentSite('shop'); });
assert.equal(current.currentSite, 'shop', 'latest rapid manual choice wins before URL commit');
await act(async () => {
  access = { ...access, access: { ...access.access, siteAccess: { shop: false } } };
  renderer.update(tree());
});
assert.notEqual(current.currentSite, 'shop', 'access revocation still selects an accessible mode');
await act(async () => { pathname = '/admin/menu'; renderer.update(tree()); });
assert.notEqual(current.currentSite, 'admin', 'guest route sync must not activate admin');
await act(async () => { renderer.unmount(); });
assert.equal(subscriptions.size, 0);

// Canonical entry persists even when the provider's initial state already matches.
stored = 'corp'; pathname = '/blog';
history.state = { __NA: true, tree: 'preserved-router-state' };
await act(async () => { renderer = create(tree()); });
assert.equal(stored, 'blog', 'direct entry persists the resolved mode');
await act(async () => { pathname = '/bookmarks'; renderer.update(tree()); });
assert.equal(current.currentSite, 'blog');
await act(async () => { renderer.unmount(); renderer = create(tree()); });
assert.equal(current.currentSite, 'blog', 'shared app reload keeps its originating site');
assert.equal(history.state.tree, 'preserved-router-state', 'Next history metadata is preserved');
await act(async () => { renderer.unmount(); });

stored = 'corp'; pathname = '/habit-tracker/stats'; history.state = {};
access = { isLoading: false, access: { role: 'guest', position: 'staff', permissions: {}, siteAccess: {} } };
await act(async () => { renderer = create(tree()); });
assert.equal(current.currentSite, 'shop', 'direct shared app uses its default owner, not stale corp mode');
const habitHistory = history.state;
await act(async () => { pathname = '/corp'; history.state = {}; renderer.update(tree()); });
assert.equal(current.currentSite, 'corp');
await act(async () => { pathname = '/habit-tracker/stats'; history.state = habitHistory; renderer.update(tree()); });
assert.equal(current.currentSite, 'shop', 'back to shared app restores its mode');
await act(async () => {
  access = { isLoading: false, access: { role: 'admin', position: 'staff', permissions: {}, siteAccess: {} } };
  pathname = '/admin'; history.state = {}; renderer.update(tree());
});
assert.equal(current.currentSite, 'admin');
await act(async () => { pathname = '/habit-tracker'; history.state = {}; renderer.update(tree()); });
assert.equal(current.currentSite, 'admin', 'shared admin tools preserve authorized admin context');
const adminHabitHistory = history.state;
await act(async () => { pathname = '/corp'; history.state = {}; renderer.update(tree()); });
await act(async () => { pathname = '/habit-tracker'; history.state = adminHabitHistory; renderer.update(tree()); });
assert.equal(current.currentSite, 'admin', 'back restores admin owner of shared app');
await act(async () => { renderer.unmount(); });

const { getSiteHomePath, getRouteSite } = load('src/constants/siteHome.ts');
assert.equal(getSiteHomePath('custom', { custom: { menu: [
  { path: '/hidden', hidden: true }, { path: '//external.invalid' }, { path: 'javascript:alert(1)' },
  { path: '/visible' },
] } }), '/visible', 'custom home skips hidden and unsafe destinations');
assert.equal(getRouteSite('/corpse'), null, 'site prefix matching respects path boundaries');
assert.equal(getRouteSite('/shop'), 'shop', 'legacy shop URL resolves to canonical mode ID');

const sidebar = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');
assert.ok(!sidebar.includes('ensureCorpMenuItems'), 'Sidebar must not reinsert hidden/deleted pages');
assert.ok(sidebar.includes("currentEnv === 'corp' ? consolidateStandaloneCompanyItems"));
assert.ok(!sidebar.includes("pathname?.startsWith('/corp')"), 'old pathname must not mix corp links into another mode');
assert.ok(sidebar.includes('hasSub && !usesCollapsedBehavior && isOpen'), 'closed submenu links remain unmounted');
console.log('PASS: actual React menu lifecycle (manual/rapid switch, route/back sync, access revocation, snapshot race, stale callback, single bootstrap, cleanup) and Sidebar contracts');
