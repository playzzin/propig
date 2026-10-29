// Real page + save hook; isolated identity/query transport/leaf widgets, no remote mutations.
// MENU_TEST_RUNTIME=/tmp/propig-menu-test node scripts/verify-admin-menu-save-lifecycle.mjs
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
let now = 0;
let timerId = 0;
const timers = new Map();
const listeners = new Map();
const windowMock = {
  setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, due: now + delay }); return id; },
  clearTimeout: (id) => timers.delete(id),
  addEventListener: (name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
  removeEventListener: (name, fn) => listeners.get(name)?.delete(fn),
  sessionStorage: { getItem: () => null, removeItem() {} },
  matchMedia: () => ({ matches: false }), confirm: () => true,
};
async function advance(ms) {
  const until = now + ms;
  for (let i = 0; i < 100; i++) {
    const next = [...timers].filter(([, t]) => t.due <= until).sort((a, b) => a[1].due - b[1].due)[0];
    if (!next) { now = until; return; }
    now = next[1].due; timers.delete(next[0]);
    await act(async () => { next[1].fn(); });
  }
  throw new Error('Timer/retry storm');
}
const initial = Object.fromEntries(['admin', 'corp'].map(id => [id, {
  name: id, positions: [], trash: [], menu: [{ id: `${id}-home`, text: `${id} original`, path: `/${id}` }],
}]));
let queryData = initial;
const queryListeners = new Set();
const queryClient = { setQueryData: (_, value) => { queryData = value; queryListeners.forEach(fn => fn()); } };
let allowed = true;
let loading = false;
let user = { uid: 'fixture-admin' };
const calls = [];
let canvas;
const logs = [];
const expectedErrors = [];
const mocks = {
  react: React, 'react/jsx-runtime': runtime('react/jsx-runtime'),
  '@tanstack/react-query': {
    useQueryClient: () => queryClient,
    useQuery: () => ({ data: React.useSyncExternalStore(
      React.useCallback(fn => { queryListeners.add(fn); return () => queryListeners.delete(fn); }, []),
      () => queryData), isLoading: false, error: null }),
  },
  '@/contexts/AuthContext': { useAuth: () => ({ loginWithGoogle() {}, isConfigured: true }) },
  '@/hooks/useCurrentUserAccess': { useCurrentUserAccess: () => ({ currentUser: user, isLoading: loading,
    access: { role: allowed ? 'admin' : 'staff', permissions: { menuManagement: false } } }) },
  '@/contexts/MenuContext': { useMenuContext: () => ({ currentSite: 'admin' }) },
  '@/hooks/useMenuSitesQuery': { MENU_SITES_QUERY_KEY: ['menu-sites'] },
  '@/services/activityLogService': { recordActivityLog: async (_, entry) => { logs.push(entry); } },
  '@/services/menuService': { menuService: {
    loadAllSites: async () => initial,
    saveAllSites: data => new Promise((resolve, reject) => calls.push({ data, resolve, reject })),
    findMenuItem: (menu, id) => menu.find(item => item.id === id),
  } },
  '@/components/admin/menu/MenuCanvas': { MenuCanvas: props => { canvas = props; return React.createElement('fixture-canvas'); } },
  '@/components/admin/menu/MenuToolbox': { MenuToolbox: () => null },
  '@/components/admin/menu/MenuInspector': { MenuInspector: () => null },
};
const modules = new Map();
function load(filename) {
  filename = path.resolve(filename);
  if (modules.has(filename)) return modules.get(filename);
  const module = { exports: {} }; modules.set(filename, module.exports);
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  function localRequire(id) {
    if (mocks[id]) return mocks[id];
    if (id.startsWith('@/') || id.startsWith('.')) {
      const base = id.startsWith('@/') ? path.resolve('src', id.slice(2)) : path.resolve(path.dirname(filename), id);
      return load(fs.existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`);
    }
    throw new Error(`Unmocked dependency: ${id}`);
  }
  vm.runInNewContext(output, { module, exports: module.exports, require: localRequire,
    queueMicrotask, window: windowMock, console: { ...console, error: (...args) => expectedErrors.push(args) },
  }, { filename });
  return module.exports;
}
const Page = load('src/app/admin/menu/page.tsx').default;
let renderer;
const tree = () => React.createElement(React.StrictMode, null, React.createElement(Page));
await act(async () => { renderer = create(tree()); });
const button = () => renderer.root.findByProps({ className: 'admin-menu-save-btn' });
const status = () => renderer.root.findAllByType('span').find(n => String(n.props.className).startsWith('admin-menu-save-status')).children.join('');
const unloadCount = () => listeners.get('beforeunload')?.size || 0;
const edit = async text => act(async () => canvas.onReorder([{ ...canvas.menu[0], text }]));
const switchTab = async name => act(async () => renderer.root.findAllByProps({ role: 'tab' }).find(n => n.findAllByType('span').some(s => s.children.includes(name))).props.onClick());
assert.equal(button().props.disabled, true);
await edit('draft A');
assert.equal(unloadCount(), 1);
let prevented = false;
const unloadEvent = { preventDefault: () => { prevented = true; } };
listeners.get('beforeunload').forEach(fn => fn(unloadEvent));
assert.equal(prevented, true); assert.equal(unloadEvent.returnValue, '');
await advance(1200);
assert.equal(calls.length, 1); assert.equal(calls[0].data.admin.menu[0].text, 'draft A');
await edit('draft B');
await switchTab('corp'); await edit('corp draft');
await advance(12000);
assert.equal(calls.length, 1, 'one in-flight request despite autosave and edits');
await act(async () => { calls[0].resolve(); });
assert.equal(canvas.menu[0].text, 'corp draft', 'old query ACK cannot replace another tab draft');
assert.equal(unloadCount(), 1); assert.equal(button().props.disabled, false);
assert.equal(status(), '자동 저장 대기 중');
await switchTab('admin'); assert.equal(canvas.menu[0].text, 'draft B');
await advance(1200); assert.equal(calls.length, 2);
assert.equal(calls[1].data.admin.menu[0].text, 'draft B');
assert.equal(calls[1].data.corp.menu[0].text, 'corp draft');
await act(async () => calls[1].resolve());
assert.equal(unloadCount(), 0); assert.equal(button().props.disabled, true);
await edit('will fail'); await advance(1200); assert.equal(calls.length, 3);
await act(async () => calls[2].reject(new Error('fixture offline')));
assert.match(status(), /저장 실패/);
assert.equal(button().findByType('span').children[0], '다시 저장');
await edit('latest after failure'); await switchTab('corp'); await switchTab('admin');
await advance(60000); assert.equal(calls.length, 3, 'failure pauses retries even after more editing');
assert.equal(unloadCount(), 1);
await act(async () => { void button().props.onClick(); void button().props.onClick(); });
assert.equal(calls.length, 4, 'double-click locks synchronously');
assert.equal(calls[3].data.admin.menu[0].text, 'latest after failure');
await act(async () => calls[3].resolve()); assert.equal(unloadCount(), 0);
await edit('permission draft');
await act(async () => { allowed = false; renderer.update(tree()); });
await advance(60000); assert.equal(calls.length, 4, 'revocation cancels scheduled save');
assert.equal(unloadCount(), 1);
await act(async () => { allowed = true; renderer.update(tree()); });
await advance(60000); assert.equal(calls.length, 4, 'restoring permission requires explicit retry');
await act(async () => { void button().props.onClick(); }); assert.equal(calls.length, 5);
await act(async () => { loading = true; renderer.update(tree()); });
await act(async () => calls[4].resolve());
assert.equal(unloadCount(), 1, 'permission change during ACK must not declare draft clean');
await act(async () => { loading = false; renderer.update(tree()); });
assert.equal(canvas.menu[0].text, 'permission draft');
await advance(60000); assert.equal(calls.length, 5);
await act(async () => { void button().props.onClick(); });
await act(async () => calls[5].resolve()); assert.equal(unloadCount(), 0);
// Manual-only mode stays dirty, and a dirty query refresh never overwrites local work.
await act(async () => renderer.root.findByProps({ name: 'autoSave' }).props.onChange({ target: { checked: false } }));
await edit('manual only');
await act(async () => queryClient.setQueryData(null, initial));
assert.equal(canvas.menu[0].text, 'manual only');
await advance(60000); assert.equal(calls.length, 6);
await act(async () => { void button().props.onClick(); });
await act(async () => { user = null; renderer.update(tree()); });
await act(async () => calls[6].reject(new Error('fixture revoked')));
assert.equal(unloadCount(), 1);
await act(async () => { renderer.unmount(); });
assert.equal(unloadCount(), 0); assert.equal(timers.size, 0);
assert.equal(expectedErrors.length, 2); assert.equal(logs.length, 5);
// An unmounted editor must not schedule a retry or update local state on a late rejection.
await act(async () => { user = { uid: 'fixture-admin' }; renderer = create(tree()); });
await edit('unmount pending'); await advance(1200);
assert.equal(calls.length, 8);
await act(async () => renderer.unmount());
await act(async () => calls[7].reject(new Error('fixture late failure')));
await advance(60000);
assert.equal(calls.length, 8); assert.equal(timers.size, 0); assert.equal(unloadCount(), 0);
assert.equal(expectedErrors.length, 2);
console.log('PASS: actual admin menu page + hook under React StrictMode: success/failure, latest revision + query ACK, cross-tab drafts, single flight/double click, bounded autosave, explicit retry, permission revoke/recovery/in-flight, manual mode, dirty refetch, logout, reload warning and cleanup');
