/* Real FileManager JSX/hooks, with Storage/API calls and styling mocked.
 * No browser, Firebase, network, or file deletion is performed.
 * PROPIG_QA_TOOLS=/home/hermes/.local/share/propig-tools node scripts/verify-storyboard-file-manager-lifecycle.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const repo = path.resolve(__dirname, '..');
const runtime = createRequire(path.join(process.env.PROPIG_TEST_RUNTIME || repo, 'package.json'));
const qa = process.env.PROPIG_QA_TOOLS ? createRequire(path.join(process.env.PROPIG_QA_TOOLS, 'package.json')) : runtime;
const ts = runtime('typescript');
const React = qa('react');
const { act, create } = qa('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const user = uid => uid ? { uid, getIdToken: async () => `synthetic-${uid}` } : null;
const asset = (id, storagePath = `fixture/${id}`) => ({ id, storagePath, kind: 'reference', label: `테스트 파일 ${id}`, queuedAt: 1 });
const board = (id, assets = [asset(`${id}-old`)]) => ({
  title: id, revision: 1, referenceAssets: [], reclaimableStorageAssets: assets, scenes: [],
  videoProduction: { projectId: null, backgroundMusicStoragePath: null },
});
const info = (request, bytes = 2048) => request.assets.map(item => ({ id: item.id, storagePath: item.storagePath, sizeBytes: bytes, updatedAt: null, missing: false }));
const overview = (bytes = 4096) => ({
  protectedFileCount: 1, cleanupCandidateCount: 1, cleanupCandidateBytes: bytes,
  cleanupCandidates: [{ path: 'fixture/old-video', kind: 'video', sizeBytes: bytes }], cleanupLocked: false, activeJobCount: 0, truncated: false,
});
function textOf(node) {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  return textOf(node.children);
}

async function fixture(initial = board('A-project')) {
  const auth = { currentUser: user('A') }, locals = [], videos = [], deletes = [], notices = [], errors = [], changes = [], renders = [];
  let props = { storyboardId: 'A-project', storyboard: initial, projectBusy: false, disabled: false, onChange: update => changes.push(update) };
  let root;
  const inspect = (kind, details) => {
    const request = { ...details, ...deferred() }; kind.push(request); return request.promise;
  };
  const styled = new Proxy(tag => () => tag, { get: (_target, tag) => () => tag });
  const mocks = {
    react: React, 'react/jsx-runtime': qa('react/jsx-runtime'),
    'styled-components': { __esModule: true, default: styled },
    sonner: { toast: Object.fromEntries(['error', 'success', 'info'].map(type => [type, (...args) => notices.push({ type, args })])) },
    '@/contexts/AuthContext': { useAuth: () => auth },
    '@/lib/firebase-auth-retry': { withFirebaseAuthRetry: async (current, request) => request(await current.getIdToken()) },
    '@/services/imageStoryboardService': { imageStoryboardService: {
      inspectReclaimableStorageAssets: (uid, id, assets) => inspect(locals, { uid, id, assets }),
      deleteReclaimableStorageAssets: (...args) => { deletes.push(args); throw new Error('Unexpected mocked deletion'); },
    } },
    '@/services/videoStudioService': { videoStudioService: {
      getProjectStorageOverview: params => inspect(videos, params),
      deleteProjectStorageResiduals: (...args) => { deletes.push(args); throw new Error('Unexpected mocked deletion'); },
    } },
  };
  const filename = path.join(repo, 'src/components/image-generator/StoryboardProjectFileManager.tsx');
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  }, reportDiagnostics: true });
  assert.equal(result.diagnostics.length, 0);
  const module = { exports: {} };
  vm.runInNewContext(result.outputText, {
    module, exports: module.exports, require: id => { assert(id in mocks, `Unexpected import: ${id}`); return mocks[id]; },
    console: { ...console, error: (...args) => errors.push(args) }, URL,
    window: { confirm() { throw new Error('Unexpected destructive confirmation'); } },
  }, { filename });
  const Manager = module.exports.default;
  function Probe() { renders.push({ uid: auth.currentUser?.uid, id: props.storyboardId }); return React.createElement(Manager, props); }
  const tree = () => React.createElement(React.StrictMode, null, React.createElement(Probe));
  await act(async () => { root = create(tree()); });
  const button = name => root.root.findAllByType('button').find(item => textOf(item).includes(name));
  return {
    locals, videos, deletes, notices, errors, changes, renders,
    get text() { return textOf(root.toJSON()); },
    get props() { return props; },
    get local() { return locals.at(-1); }, get video() { return videos.at(-1); },
    button,
    update: async patch => { props = { ...props, ...patch }; await act(async () => root.update(tree())); },
    switchAccount: async (uid, id = `${uid}-project`) => {
      auth.currentUser = user(uid); props = { ...props, storyboardId: id, storyboard: board(id) };
      await act(async () => root.update(tree()));
    },
    resolveLocal: async (request = locals.at(-1), bytes) => { await act(async () => request.resolve(info(request, bytes))); },
    rejectLocal: async (request = locals.at(-1)) => { await act(async () => request.reject(Object.assign(new Error('PRIVATE_RAW_STORAGE_DETAIL'), { code: 'storage/unauthorized' }))); },
    close: async () => { await act(async () => root.unmount()); },
  };
}

async function run() {
  {
    const f = await fixture();
    assert.equal(f.locals.length, 2, 'StrictMode must exercise cleanup and restart');
    assert.equal(f.button('파일 영구 삭제').props.disabled, true);
    await f.rejectLocal();
    assert(f.text.includes('파일 접근 권한을 확인할 수 없습니다'));
    assert(f.text.includes('확인 실패')); assert(!f.text.includes('용량 확인 중'));
    assert(!f.text.includes('PRIVATE_RAW_STORAGE_DETAIL')); assert.equal(f.notices.length, 0); assert.equal(f.errors.length, 0);
    assert.equal(f.button('파일 영구 삭제').props.disabled, true);
    await act(async () => f.button('파일 영구 삭제').props.onClick());
    assert.equal(f.deletes.length, 0, 'Inspection failure must stop the delete handler before confirmation');
    const before = f.locals.length;
    await f.update({ storyboard: { ...JSON.parse(JSON.stringify(f.props.storyboard)), title: 'unrelated edit', revision: 2 } });
    assert.equal(f.locals.length, before, 'Unrelated draft replacements must not repeat Storage inspection');
    await act(async () => f.button('다시 확인').props.onClick());
    assert.equal(f.locals.length, before + 1); assert.equal(f.button('파일 영구 삭제').props.disabled, true);
    await f.resolveLocal();
    assert(!f.text.includes('파일 접근 권한을 확인할 수 없습니다')); assert(f.text.includes('2.0 KB'));
    assert.equal(f.button('파일 영구 삭제').props.disabled, false);
    await f.close();
    console.log('PASS local permission failure: sanitized inline state, delete guard, stable inputs, explicit retry and successful recovery');
  }
  {
    const protectedPaths = ['fixture/current-reference', 'fixture/current-bgm', 'fixture/current-image', 'fixture/current-url-image'];
    const initial = board('A-project', [...protectedPaths.map((item, i) => asset(`protected-${i}`, item)), asset('unused')]);
    initial.referenceAssets = [{ storagePath: protectedPaths[0] }];
    initial.videoProduction.backgroundMusicStoragePath = protectedPaths[1];
    initial.scenes = [
      { generatedImage: { storagePath: protectedPaths[2] } },
      { generatedImage: { url: `https://firebasestorage.googleapis.com/v0/b/fixture/o/${encodeURIComponent(protectedPaths[3])}?alt=media` } },
    ];
    const f = await fixture(initial);
    for (const request of f.locals) assert.deepEqual(Array.from(request.assets, item => item.id), ['unused']);
    assert(!f.text.includes('테스트 파일 protected-')); await f.resolveLocal();
    await f.update({ storyboard: { ...f.props.storyboard, referenceAssets: [...initial.referenceAssets, { storagePath: 'fixture/unused' }] } });
    assert(!f.button('파일 영구 삭제')); assert(f.text.includes('교체되거나 제거된 원본 파일이 없습니다'));
    await f.close();
    console.log('PASS currently used references, music, scene paths and Firebase URLs are excluded from inspection and deletion');
  }
  for (const transition of ['account', 'project']) for (const reject of [false, true]) {
    const f = await fixture(); const stale = [...f.locals];
    if (transition === 'account') await f.switchAccount('B');
    else await f.update({ storyboardId: 'A-other-project', storyboard: board('A-other-project') });
    await f.resolveLocal(f.local, 4096);
    const before = f.text;
    await act(async () => stale.forEach(request => reject ? request.reject(new Error('late A failure')) : request.resolve(info(request, 999999))));
    assert.equal(f.text, before, `Disposed ${transition} result must not change current rows or errors`);
    assert.equal(f.notices.length, 0); assert.equal(f.errors.length, 0);
    await f.close();
  }
  console.log('PASS stale account/project inspection success/failure remains isolated');
  {
    const f = await fixture(); const old = [...f.locals];
    await f.update({ storyboard: board('A-project', [asset('replacement')]) });
    await f.resolveLocal(f.local, 8192); const before = f.text;
    await act(async () => old.forEach(request => request.resolve(info(request, 1))));
    assert.equal(f.text, before, 'Latest asset-list request must win');
    await f.update({ storyboard: board('A-project', [asset('unmount-pending')]) });
    const pending = f.local; await f.close();
    await act(async () => pending.reject(new Error('failure after unmount')));
    assert.equal(f.notices.length, 0); assert.equal(f.errors.length, 0);
    console.log('PASS changed asset lists invalidate prior inspection responses and cleanup is quiet');
  }
  {
    const initial = board('A-project'); initial.videoProduction.projectId = 'A-video';
    const f = await fixture(initial); await f.resolveLocal();
    const old = [...f.videos];
    await act(async () => f.video.reject(new Error('PRIVATE_RAW_VIDEO_DETAIL')));
    assert(f.text.includes('영상 렌더 파일을 확인하지 못했습니다'));
    assert(!f.text.includes('PRIVATE_RAW_VIDEO_DETAIL')); assert.equal(f.errors.length, 0); assert.equal(f.notices.length, 0);
    await f.update({ storyboard: { ...initial, videoProduction: { ...initial.videoProduction, projectId: 'A-other-video' } } });
    await f.resolveLocal(); await act(async () => f.video.resolve(overview())); const before = f.text;
    await act(async () => old.forEach(request => request.resolve(overview(999999))));
    assert.equal(f.text, before, 'Video project switch must reject old overview responses');
    assert(!f.text.includes('영상 렌더 파일을 확인하지 못했습니다'));
    await f.close();
    console.log('PASS video inspection errors are sanitized and old project overviews cannot replace current data');
  }
  console.log('PASS storyboard FileManager lifecycle — real React StrictMode; mocked Storage/API; zero network/deletion');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
