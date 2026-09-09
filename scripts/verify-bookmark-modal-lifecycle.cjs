/* Actual TSX/complete JSX fixture. Only styled DOM widgets, auth, transport and schema
 * are mocked; this is NOT browser, Firebase Rules, or parent integration coverage. */
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const assert = require('node:assert/strict');
const runtime = createRequire(path.join(process.env.PROPIG_TEST_RUNTIME || process.cwd(), 'package.json'));
const React = runtime('react');
const { act, create } = runtime('react-test-renderer');
const ts = runtime('typescript');
assert.equal(React.version, '19.2.3');
global.IS_REACT_ACT_ENVIRONMENT = true;
global.window = { requestAnimationFrame: () => 1, cancelAnimationFrame() {}, addEventListener() {}, removeEventListener() {} };
let user, auth, listeners, toasts, headers, requests;
const styled = new Proxy({}, { get: (_, tag) => () => tag });
const mocks = {
  react: React, 'react/jsx-runtime': runtime('react/jsx-runtime'),
  'styled-components': { __esModule: true, default: styled },
  sonner: { toast: { error: (...v) => toasts.push(['error', ...v]), success: (...v) => toasts.push(['success', ...v]) } },
  '@/contexts/AuthContext': { useAuth: () => ({ currentUser: user }) },
  'firebase/auth': { getAuth: () => auth, onAuthStateChanged: (_, cb) => { listeners.add(cb); cb(auth.currentUser); return () => listeners.delete(cb); } },
  '@/lib/client-auth': { buildJsonAuthHeaders: () => headers() },
  '@/types/bookmark-new': { MetadataSchema: { safeParse: data => ({ success: true, data }) } },
};
function load(name) {
  const file = path.join(process.cwd(), 'src/components/bookmarks', `${name}.tsx`);
  const source = fs.readFileSync(file, 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(id => { if (id in mocks) return mocks[id]; throw Error(`Unmocked import ${id}`); }, module, module.exports);
  return module.exports[name];
}
const Add = load('AddBookmarkModal');
const Category = load('CategoryManagerModal');
const categories = [{ id: 'c1', name: 'one', icon: 'fa-folder', color: '#123456' }, { id: 'c2', name: 'two' }];
const initialData = { url: 'https://example.com', title: 'title', description: 'desc', categoryId: 'c1', tags: ['tag'] };
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
async function setup(Component, extra = {}) {
  user = { uid: 'A' }; auth = { currentUser: user }; listeners = new Set(); toasts = []; requests = [];
  headers = async () => ({});
  global.fetch = async (...args) => { requests.push(args); return { ok: true, json: async () => ({ title: 'metadata', description: 'metadata desc', tags: ['auto'] }) }; };
  let closes = 0, calls = [];
  let props = { isOpen: true, categories, initialData, mode: 'edit', bookmarksCount: {}, onClose: () => closes++, onSubmit: async v => calls.push(v), onCreate: async v => calls.push(v), onUpdate: async (...v) => calls.push(v), onDelete: async v => calls.push(v), ...extra };
  let tree;
  const render = () => React.createElement(React.StrictMode, null, React.createElement(Component, props));
  await act(async () => { tree = create(render()); });
  return { get tree() { return tree; }, get closes() { return closes; }, calls,
    update: async patch => { props = { ...props, ...patch }; await act(async () => tree.update(render())); },
    unmount: async () => act(async () => tree.unmount()),
    input: id => tree.root.find(n => typeof n.type === 'string' && n.props.id === id),
    submit: () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }),
    analyze: () => tree.root.findAllByType('button').find(n => n.props.children === 'AI 재분석' || n.props.children === '자동 채우기').props.onClick(),
  };
}
async function sdk(uid) { await act(async () => { auth.currentUser = uid ? { uid } : null; for (const cb of listeners) cb(auth.currentUser); }); }
async function edit(f, id, value) { await act(async () => f.input(id).props.onChange({ target: { value } })); }
const tests = [];
function test(name, fn) { tests.push([name, fn]); }
test('categories snapshot preserves bookmark draft', async () => { const f = await setup(Add); await edit(f, 'title', 'draft'); await f.update({ categories: [...categories] }); assert.equal(f.input('title').props.value, 'draft'); await f.unmount(); });
test('late analysis failure after unmount is silent', async () => { const d = deferred(); const f = await setup(Add); headers = () => d.promise; let p; await act(async () => { p = f.analyze(); }); await f.unmount(); await act(async () => { d.reject(Error('late')); await p; }); assert.equal(toasts.length, 0); });
test('analysis preserves newer edits', async () => { const d = deferred(); const f = await setup(Add); headers = () => d.promise; let p; await act(async () => { p = f.analyze(); }); await edit(f, 'title', 'new draft'); await act(async () => { d.resolve({}); await p; }); assert.equal(f.input('title').props.value, 'new draft'); assert.equal(toasts.length, 0); await f.unmount(); });
for (const stage of ['headers', 'fetch', 'json']) {
  for (const transition of ['sdk-lag', 'A-B-A', 'reopen', 'unmount']) {
    for (const reject of [false, true]) {
      test(`analysis ${stage} ${transition} ${reject ? 'reject' : 'resolve'}`, async () => {
        const f = await setup(Add), d = deferred(); let p, jsonCalls = 0;
        if (stage === 'headers') headers = () => d.promise;
        else global.fetch = async (...args) => { requests.push(args); return stage === 'fetch' ? d.promise : { ok: true, json: () => { jsonCalls++; return d.promise; } }; };
        await act(async () => { p = f.analyze(); });
        if (transition === 'sdk-lag') auth.currentUser = { uid: 'B' }; // deliberately no Context render/listener delivery
        if (transition === 'A-B-A') { await sdk('B'); await sdk('A'); }
        if (transition === 'reopen') { await f.update({ isOpen: false }); await f.update({ isOpen: true }); }
        if (transition === 'unmount') await f.unmount();
        await act(async () => { if (reject) d.reject(Error('late')); else d.resolve(stage === 'fetch' ? { ok: true, json: () => { jsonCalls++; return Promise.resolve({ title: 'late' }); } } : { title: 'late' }); await p; });
        assert.equal(toasts.length, 0);
        if (stage === 'headers') assert.equal(requests.length, 0);
        if (stage === 'fetch') assert.equal(jsonCalls, 0);
        if (transition !== 'unmount') { assert.equal(f.input('title').props.value, 'title'); await f.unmount(); }
        assert.equal(listeners.size, 0);
      });
    }
  }
}
for (const kind of ['bookmark', 'create', 'update', 'delete']) {
  for (const transition of ['normal', 'sdk-lag', 'A-B-A', 'reopen', 'unmount']) {
    for (const reject of [false, true]) {
      test(`${kind} callback ${transition} ${reject ? 'reject' : 'resolve'}`, async () => {
        const d = deferred(); let count = 0;
        const callback = () => { count++; return d.promise; };
        const extra = kind === 'bookmark' ? { onSubmit: callback } : kind === 'create' ? { onCreate: callback } : kind === 'update' ? { onUpdate: callback, initialCategory: categories[0] } : { onDelete: callback };
        const f = await setup(kind === 'bookmark' ? Add : Category, extra);
        let p; const run = () => kind === 'delete' ? f.tree.root.findAllByType('button').find(n => n.props['aria-label'] === 'one 삭제').props.onClick() : f.submit();
        await act(async () => { p = run(); run(); });
        assert.equal(count, 1, 'same batch duplicate must be locked');
        if (transition === 'sdk-lag') auth.currentUser = { uid: 'B' };
        if (transition === 'A-B-A') { await sdk('B'); await sdk('A'); }
        if (transition === 'reopen') { await f.update({ isOpen: false }); await f.update({ isOpen: true }); }
        if (transition === 'unmount') await f.unmount();
        await act(async () => { if (reject) d.reject(Error('late')); else d.resolve(); await p; });
        assert.equal(toasts.length, transition === 'normal' && reject ? 1 : 0);
        assert.equal(f.closes, transition === 'normal' && !reject && kind === 'bookmark' ? 1 : 0);
        if (transition !== 'unmount') await f.unmount();
        assert.equal(listeners.size, 0);
      });
    }
  }
}
test('normal analysis, shared synchronous lock and next request', async () => {
  const f = await setup(Add); const d = deferred(); headers = () => d.promise; let p;
  await act(async () => { p = f.analyze(); f.submit(); });
  await act(async () => { d.resolve({}); await p; });
  assert.equal(requests.length, 1); assert.equal(f.calls.length, 0); assert.equal(f.input('title').props.value, 'metadata'); assert.equal(toasts.length, 1);
  await act(async () => f.submit()); assert.equal(f.calls.length, 1); assert.equal(f.closes, 1); await f.unmount();
});
test('automatic submit analysis edited mid-flight does not write', async () => {
  const f = await setup(Add, { initialData: { ...initialData, title: '' } }); const d = deferred(); headers = () => d.promise; let p;
  await act(async () => { p = f.submit(); }); await edit(f, 'title', 'new');
  await act(async () => { d.resolve({}); await p; });
  assert.equal(f.calls.length, 0); assert.equal(toasts.length, 0); assert.equal(f.input('title').props.value, 'new');
  await act(async () => f.submit()); assert.equal(f.calls.length, 1); await f.unmount();
});
test('stale finally cannot unlock new open session', async () => {
  const f = await setup(Add); const old = deferred(), next = deferred(); let p, q;
  headers = () => old.promise; await act(async () => { p = f.analyze(); });
  await f.update({ isOpen: false }); await f.update({ isOpen: true });
  headers = () => next.promise; await act(async () => { q = f.analyze(); });
  await act(async () => { old.reject(Error('old')); await p; });
  assert.equal(f.tree.root.findAllByType('button').find(n => n.props.type === 'submit').props.disabled, true);
  await act(async () => { next.resolve({}); await q; }); assert.equal(toasts.length, 1); await f.unmount();
});
test('category snapshot preserves draft and delayed delete preserves new editor', async () => {
  const d = deferred(); const f = await setup(Category, { initialCategory: categories[0], onDelete: () => d.promise });
  await edit(f, 'bookmark-category-name', 'draft'); await f.update({ initialCategory: { ...categories[0] }, categories: [...categories] });
  assert.equal(f.input('bookmark-category-name').props.value, 'draft');
  let p; await act(async () => { p = f.tree.root.findAllByType('button').find(n => n.props['aria-label'] === 'one 삭제').props.onClick(); });
  await act(async () => f.tree.root.findAllByType('button').find(n => n.props['aria-label'] === 'two 수정').props.onClick());
  await act(async () => { d.resolve(); await p; }); assert.equal(f.input('bookmark-category-name').props.value, 'two'); await f.unmount();
});
for (const field of ['url', 'description', 'category', 'tags']) {
  test(`analysis ignores result after ${field} edit`, async () => {
    const f = await setup(Add); const d = deferred(); headers = () => d.promise; let p;
    await act(async () => { p = f.analyze(); }); await edit(f, field, field === 'category' ? 'c2' : 'new value');
    await act(async () => { d.resolve({}); await p; });
    assert.equal(f.input(field).props.value, field === 'category' ? 'c2' : 'new value'); assert.equal(toasts.length, 0); await f.unmount();
  });
}
for (const Component of [Add, Category]) {
  test(`${Component.name} Context UID transition resets draft and fences old callback`, async () => {
    const d = deferred(); const f = await setup(Component, { onSubmit: () => d.promise, onCreate: () => d.promise });
    const id = Component === Add ? 'title' : 'bookmark-category-name'; await edit(f, id, 'A draft');
    let p; await act(async () => { p = f.submit(); });
    await sdk('B'); user = auth.currentUser; await f.update({});
    assert.notEqual(f.input(id).props.value, 'A draft');
    await act(async () => { d.reject(Error('old')); await p; }); assert.equal(toasts.length, 0); await f.unmount();
  });
}
test('same account analysis failure retains fallback submit behavior', async () => {
  const f = await setup(Add, { initialData: { ...initialData, title: '' } });
  headers = async () => { throw Error('offline'); };
  await act(async () => f.submit());
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].title, 'example.com'); assert.equal(toasts.length, 1); assert.equal(f.closes, 1); await f.unmount();
});
(async () => { let failures = 0; for (const [name, run] of tests) { try { await run(); console.log(`PASS ${name}`); } catch (e) { failures++; console.error(`FAIL ${name}: ${e.message}`); } } console.log(`React ${React.version}: ${tests.length - failures}/${tests.length} PASS (full JSX, mocked DOM/auth/transport)`); if (failures) process.exitCode = 1; })();
