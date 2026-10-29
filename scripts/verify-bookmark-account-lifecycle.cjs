/* Real production React/StrictMode lifecycle; only IO, styling and child widgets mocked.
 * No Firebase/emulator/browser/network certification. Dependencies stay outside the repo.
 * PROPIG_RUNTIME=/path/to/runtime PROPIG_QA_TOOLS=/path/to/tools node scripts/verify-bookmark-account-lifecycle.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const runtimeRoot = process.env.PROPIG_TEST_RUNTIME || process.env.PROPIG_RUNTIME || path.resolve(__dirname, '..');
const runtime = createRequire(path.join(runtimeRoot, 'package.json'));
const tools = process.env.PROPIG_QA_TOOLS
  ? createRequire(path.join(process.env.PROPIG_QA_TOOLS, 'package.json'))
  : runtime;
const ts = runtime('typescript');
const React = tools('react');
const { act, create } = tools('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const repo = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(repo, 'src/components/bookmarks/BookmarkApp.tsx'), 'utf8');
const marker = /  return \(\r?\n    <Container>/;
assert(marker.test(source), 'production render instrumentation anchor');
// Keep the real UID-keyed wrapper, all hooks, effects, callbacks, filters AND JSX.
const instrumented = source.replace(marker, `  capture({bookmarks,categories,searchTerm,setSearchTerm,selectedCategory,setSelectedCategory,
  editingBookmark,setEditingBookmark,editingCategory,setEditingCategory,isModalOpen,setIsModalOpen,
  isCategoryModalOpen,setIsCategoryModalOpen,filteredBookmarks,quickAddUrl,setQuickAddUrl,quickAddStatus,
  loadState,bookmarksCount,favoriteCount,setReloadGeneration,handleQuickAdd,handleReanalyze,handleAddBookmark,handleUpdateBookmark,
  handleCreateCategory,handleUpdateCategory,handleDeleteCategory,handleFavorite,handleDelete});
  return (
    <Container>`);
const code = ts.transpileModule(instrumented, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true }, reportDiagnostics: true });
assert.equal(code.diagnostics.length, 0);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
const category = uid => ({ id: `${uid}-cat`, name: 'work', order: 0, userId: uid });
const bookmark = uid => ({ id: `${uid}-secret`, userId: uid, title: 'Private title', url: `https://${uid.toLowerCase()}.invalid/private`, description: 'description', tags: ['Tag'], categoryId: `${uid}-cat`, isFavorite: true });
const snapshot = items => ({ empty: items.length === 0, docs: items.map(item => ({ id: item.id, data: () => item, ref: { name: 'bookmarks', id: item.id } })) });
const response = () => ({ ok: true, json: async () => ({ title: 'Analyzed', category: 'work', tags: ['tag'] }) });
async function fixture({ bootstrap } = {}) {
  const auth = { currentUser: { uid: 'A' } }, contextAuth = { currentUser: auth.currentUser };
  const listeners = [], writes = [], toasts = [], requests = [], timers = new Map(), captures = [];
  let output, root, timerId = 0;
  const stages = { headers: async () => ({}), fetch: async () => response(), write: async () => ({ id: 'saved' }), read: bootstrap || (async () => snapshot([category('A')])) };
  const recordWrite = async (operation, ref, data) => {
    writes.push({ operation, ref, data, authUid: auth.currentUser?.uid });
    if (data?.userId && data.userId !== auth.currentUser?.uid) throw new Error('permission-denied');
    return stages.write();
  };
  const firestore = {
    collection: (_, name) => ({ name }), where: (key, op, value) => ({ key, value }), query: (ref, ...filters) => ({ ...ref, filters }),
    doc: (_, name, id) => ({ name, id }), Timestamp: { now: () => 0 }, getDocs: q => stages.read(q),
    onSnapshot: (q, ok, error) => { const listener = { q, ok, error, closed: false }; listeners.push(listener); return () => { listener.closed = true; }; },
    addDoc: (ref, data) => recordWrite('add', ref, data), updateDoc: (ref, data) => recordWrite('update', ref, data), deleteDoc: ref => recordWrite('delete', ref),
    writeBatch: () => ({ update() {}, commit: () => recordWrite('batch', {}) }),
  };
  const modules = {
    react: React,
    'styled-components': { __esModule: true, default: new Proxy({}, { get: (_, tag) => () => tag }) },
    sonner: { toast: { success: message => toasts.push({ type: 'success', message }), error: message => toasts.push({ type: 'error', message }) } },
    'firebase/firestore': firestore, 'firebase/auth': { getAuth: () => auth }, '@/firebase/config': { db: {} },
    '@/contexts/AuthContext': { useAuth: () => contextAuth }, '@/lib/bookmark-favicon': { buildFallbackFaviconUrl: () => '' },
    '@/lib/client-auth': { buildJsonAuthHeaders: () => stages.headers() }, '@/types/bookmark-new': { MetadataSchema: { safeParse: data => ({ success: true, data }) } },
  };
  for (const name of ['BookmarkCard', 'CategorySidebar', 'AddBookmarkModal', 'CategoryManagerModal']) modules[`./${name}`] = { [name]: props => React.createElement(name, props) };
  const sandbox = {
    exports: {}, require: id => { assert(id in modules, `unexpected import ${id}`); return modules[id]; },
    process: { env: { NODE_ENV: 'production' } }, console: { error() {}, info() {} }, URL,
    capture: value => { output = value; captures.push(value); },
    fetch: (...args) => { requests.push(args); return stages.fetch(); }, confirm: () => true, window: { confirm: () => true },
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id),
  };
  vm.runInNewContext(code.outputText, sandbox);
  const element = () => React.createElement(React.StrictMode, null, React.createElement(sandbox.exports.BookmarkApp));
  await act(async () => { root = create(element()); });
  const currentListener = (uid, name) => listeners.filter(l => !l.closed && l.q.name === name && l.q.filters[0].value === uid).at(-1);
  const publish = async (uid, name, items) => { const listener = currentListener(uid, name); assert(listener); await act(async () => listener.ok(snapshot(items))); };
  return {
    auth, listeners, writes, toasts, requests, timers, stages, captures, currentListener,
    get out() { return output; }, get tree() { return root.toJSON(); }, publish,
    ready: async uid => { await publish(uid, 'bookmarks', [bookmark(uid)]); await publish(uid, 'categories', [category(uid)]); },
    switchTo: async uid => { auth.currentUser = uid ? { uid } : null; contextAuth.currentUser = auth.currentUser; await act(async () => root.update(element())); },
    close: async () => { await act(async () => root.unmount()); assert(listeners.every(l => l.closed)); assert.equal(timers.size, 0); },
  };
}
async function run() {
  const f = await fixture();
  assert.equal(f.listeners.filter(l => l.closed).length, 2, 'StrictMode effect cleanup really ran');
  assert(f.listeners.every(l => typeof l.error === 'function'));
  await f.publish('A', 'bookmarks', [bookmark('A')]);
  assert.equal(f.out.loadState, 'loading'); assert.equal(f.out.filteredBookmarks.length, 0);
  await assert.rejects(f.out.handleAddBookmark(bookmark('A')));
  await f.publish('A', 'categories', [category('A')]);
  assert.equal(f.out.loadState, 'ready');
  for (const term of ['  PRIVATE ', 'DESCRIPTION', 'tag', 'a.invalid']) {
    await act(async () => f.out.setSearchTerm(term)); assert.equal(f.out.filteredBookmarks.length, 1);
  }
  await act(async () => { f.out.setSelectedCategory('favorite'); f.out.setEditingBookmark(bookmark('A')); f.out.setEditingCategory(category('A')); f.out.setIsModalOpen(true); f.out.setIsCategoryModalOpen(true); f.out.setQuickAddUrl('https://a.invalid'); });
  const old = f.listeners.slice(), oldSubmit = f.out.handleAddBookmark;
  const captureStart = f.captures.length;
  await f.switchTo('B');
  for (const state of f.captures.slice(captureStart)) {
    assert.equal(state.bookmarks.length, 0); assert.equal(state.categories.length, 0); assert.equal(state.searchTerm, '');
    assert.equal(state.editingBookmark, null); assert.equal(state.editingCategory, null); assert.equal(state.isModalOpen, false); assert.equal(state.isCategoryModalOpen, false);
    assert.equal(state.quickAddUrl, ''); assert.equal(state.selectedCategory, 'all');
  }
  await assert.rejects(oldSubmit(bookmark('A'))); assert.equal(f.writes.length, 0);
  await act(async () => { for (const listener of old) { listener.ok(snapshot([bookmark('A')])); listener.error(new Error('late')); } });
  assert.equal(f.out.loadState, 'loading'); assert.equal(f.out.bookmarks.length, 0);
  await f.ready('B'); await f.switchTo(null); assert.equal(f.out.loadState, 'ready'); assert.equal(f.out.bookmarks.length, 0);
  await act(async () => f.out.setQuickAddUrl('https://guest.invalid'));
  await act(async () => f.out.handleQuickAdd()); assert.equal(f.out.quickAddStatus.type, 'error'); assert.equal(f.requests.length, 0);
  await f.switchTo('A'); assert.equal(f.out.quickAddUrl, ''); assert.equal(f.timers.size, 0);
  await act(async () => { for (const listener of old) listener.ok(snapshot([bookmark('A')])); });
  assert.equal(f.out.bookmarks.length, 0); await f.close();
  console.log('PASS isolation: first render, direct/logout/A→B→A, StrictMode stale snapshots/errors, drafts and filters');

  for (const name of ['bookmarks', 'categories']) {
    const g = await fixture(); await g.ready('A');
    const oldListeners = g.listeners.slice();
    await act(async () => g.currentListener('A', name).error(new Error('permission-denied')));
    assert.equal(g.out.loadState, 'error'); assert.equal(g.out.bookmarks.length, 0); assert.equal(g.out.categories.length, 0);
    assert(JSON.stringify(g.tree).includes('다시 불러오기'));
    await assert.rejects(g.out.handleAddBookmark(bookmark('A')));
    await act(async () => g.out.setReloadGeneration(value => value + 1));
    await act(async () => { for (const listener of oldListeners) { listener.ok(snapshot([bookmark('A')])); listener.error(new Error('late')); } });
    assert.equal(g.out.loadState, 'loading'); await g.ready('A'); assert.equal(g.out.loadState, 'ready'); await g.close();
  }
  console.log('PASS both subscription errors fail closed; explicit retry uses fresh generation');

  // Deferred success AND failure at every await, for both quick-add and reanalysis.
  for (const operation of ['quick', 'reanalyze']) for (const stage of ['headers', 'fetch', 'json', 'write']) for (const reject of [false, true]) {
    const g = await fixture(); await g.ready('A');
    await act(async () => g.out.setQuickAddUrl('https://a.invalid/private'));
    const d = deferred();
    if (stage === 'json') g.stages.fetch = async () => ({ ok: true, json: () => d.promise });
    else g.stages[stage] = () => d.promise;
    let pending;
    await act(async () => { pending = operation === 'quick' ? g.out.handleQuickAdd() : g.out.handleReanalyze(bookmark('A')); });
    await g.switchTo('B'); await g.ready('B'); await g.switchTo('A'); await g.ready('A');
    await act(async () => { if (reject) d.reject(new Error('late failure')); else d.resolve(stage === 'fetch' ? response() : stage === 'write' ? { id: 'saved' } : {}); await pending; });
    assert.equal(g.writes.length, stage === 'write' ? 1 : 0, `${operation}/${stage}/${reject}`);
    assert.equal(g.toasts.length, 0); assert.equal(g.out.quickAddStatus.type, null); assert.equal(g.timers.size, 0);
    if (stage === 'headers') assert.equal(g.requests.length, 0, 'no fetch after delayed auth headers');
    await g.close();
  }
  console.log('PASS 16 deferred analysis cases: headers/fetch/json/write × resolve/reject × quick/reanalyze; sent writes not cancelled');

  for (const transition of ['sdk-only', 'unmount', 'read-error']) {
    const g = await fixture(); await g.ready('A'); await act(async () => g.out.setQuickAddUrl('https://a.invalid'));
    const d = deferred(); g.stages.fetch = () => d.promise; let pending;
    await act(async () => { pending = g.out.handleQuickAdd(); });
    if (transition === 'sdk-only') g.auth.currentUser = { uid: 'B' }; // AuthContext deliberately stale.
    else if (transition === 'unmount') await g.close();
    else await act(async () => g.currentListener('A', 'categories').error(new Error('revoked')));
    await act(async () => { d.resolve(response()); await pending; });
    assert.equal(g.writes.length, 0); assert.equal(g.toasts.length, 0); assert.equal(g.timers.size, 0);
    if (transition !== 'unmount') await g.close();
  }
  const bootstrap = deferred(); const boot = await fixture({ bootstrap: () => bootstrap.promise });
  await boot.switchTo('B'); await boot.close(); bootstrap.resolve(snapshot([])); await act(async () => {}); assert.equal(boot.writes.length, 0);
  console.log('PASS SDK identity lag, unmount, readiness revocation and deferred default-category bootstrap');

  const good = await fixture(); await good.ready('A');
  await act(async () => good.out.setQuickAddUrl('https://a.invalid'));
  await act(async () => { await Promise.all([good.out.handleQuickAdd(), good.out.handleQuickAdd()]); });
  assert.equal(good.writes.length, 1, 'synchronous lock prevents double submit');
  assert.equal(good.writes[0].data.userId, 'A'); assert.equal(good.writes[0].data.categoryId, 'A-cat');
  assert.equal(good.out.quickAddStatus.type, 'success'); assert.equal(good.out.quickAddUrl, ''); assert.equal(good.timers.size, 1);
  const staleTimer = [...good.timers.values()][0];
  await act(async () => { await good.out.handleReanalyze(bookmark('A')); await good.out.handleAddBookmark(bookmark('A')); });
  assert.equal(good.writes.length, 3); assert.equal(good.toasts.length, 2);
  await good.switchTo('B'); assert.equal(good.timers.size, 0);
  await act(async () => staleTimer()); assert.equal(good.out.quickAddStatus.type, null);
  await good.ready('B'); await act(async () => good.out.setQuickAddUrl('https://b.invalid'));
  good.stages.fetch = async () => { throw new Error('current failure'); };
  await act(async () => good.out.handleQuickAdd()); assert.equal(good.out.quickAddStatus.type, 'error'); assert.equal(good.toasts.at(-1).type, 'error');
  await good.close();
  console.log('PASS positive quick save, manual save, reanalysis, same-session error, double submit and timer cleanup');

  const crud = await fixture(); await crud.ready('A');
  await act(async () => crud.out.setEditingBookmark(bookmark('A')));
  await act(async () => {
    await crud.out.handleUpdateBookmark(bookmark('A'));
    await crud.out.handleFavorite('A-secret');
    await crud.out.handleDelete('A-secret');
    await crud.out.handleCreateCategory({ name: 'new', icon: 'icon', color: 'blue' });
    await crud.out.handleUpdateCategory('A-cat', { name: 'renamed', icon: 'icon', color: 'blue' });
  });
  assert.equal(crud.writes.length, 5); assert.equal(crud.out.editingBookmark, null);
  await crud.publish('A', 'categories', [category('A'), { ...category('A'), id: 'fallback', name: 'fallback' }]);
  crud.stages.read = async () => snapshot([bookmark('A')]);
  await act(async () => crud.out.handleDeleteCategory(category('A')));
  assert.equal(crud.writes.at(-2).operation, 'batch'); assert.equal(crud.writes.at(-1).operation, 'delete');
  const d = deferred(); crud.stages.read = () => d.promise; let pending;
  await act(async () => { pending = crud.out.handleDeleteCategory(category('A')); });
  const before = crud.writes.length; await crud.switchTo('B');
  await act(async () => { d.resolve(snapshot([bookmark('A')])); await assert.rejects(pending); });
  assert.equal(crud.writes.length, before, 'no migration/delete after switched account'); await crud.close();
  const defaults = await fixture({ bootstrap: async () => snapshot([]) });
  assert.equal(defaults.writes.length, 4, 'normal default category bootstrap still works in StrictMode');
  assert(defaults.writes.every(write => write.data.userId === 'A')); await defaults.close();
  const failedBootstrap = await fixture({ bootstrap: async () => { throw new Error('read failed'); } });
  assert.equal(failedBootstrap.out.loadState, 'error'); assert.equal(failedBootstrap.writes.length, 0); await failedBootstrap.close();
  console.log('PASS edit/favorite/delete/category CRUD, category migration fence, default-category success/failure');
  const memo = await fixture(); await memo.ready('A');
  const counts = memo.out.bookmarksCount; const filtered = memo.out.filteredBookmarks;
  assert.equal(counts['A-cat'], 1);assert.equal(memo.out.favoriteCount, 1);
  await act(async () => memo.out.setQuickAddUrl('https://draft.invalid'));
  assert.equal(memo.out.bookmarksCount, counts);assert.equal(memo.out.filteredBookmarks, filtered);
  await act(async () => memo.out.setSearchTerm('no-match'));
  assert.equal(memo.out.bookmarksCount, counts);assert.equal(memo.out.filteredBookmarks.length, 0);
  await memo.publish('A','bookmarks',[]);assert.equal(memo.out.bookmarksCount['A-cat'],0);assert.equal(memo.out.favoriteCount,0);await memo.close();
  for (const action of ['handleDelete','handleFavorite']) for (const switched of [false,true]) {
    const g=await fixture();await g.ready('A');const d=deferred();g.stages.write=()=>d.promise;let pending;
    await act(async()=>{pending=g.out[action]('A-secret');});
    if(switched)await g.switchTo('B');
    await act(async()=>{d.reject(new Error('write denied'));await pending;});
    assert.equal(g.toasts.length,switched?0:1);if(!switched)assert.equal(g.toasts[0].type,'error');await g.close();
  }
  console.log('PASS memoized totals/filter identity and snapshot invalidation; delete/favorite failures caught with stale toast suppression');
  console.log('PASS bookmark account lifecycle — real React StrictMode; Firestore/HTTP and child widgets mocked; zero network');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
