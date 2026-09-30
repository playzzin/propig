/* Runs the real Workspace JSX/hooks with mocked IO, styling, and child widgets.
 * No browser, Firebase, provider request, or project-data write is performed.
 * PROPIG_QA_TOOLS=/home/hermes/.local/share/propig-tools node scripts/verify-storyboard-workspace-lifecycle.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { webcrypto } = require('node:crypto');

const repo = path.resolve(__dirname, '..');
const runtime = createRequire(path.join(process.env.PROPIG_TEST_RUNTIME || repo, 'package.json'));
const qa = process.env.PROPIG_QA_TOOLS
  ? createRequire(path.join(process.env.PROPIG_QA_TOOLS, 'package.json')) : runtime;
const ts = runtime('typescript');
const React = qa('react');
const { act, create } = qa('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function fixture() {
  let uid = 'A', root, latestDashboard, latestVideo, nextTimer = 0, nextFrame = 0;
  let location = new URL('http://localhost:3002/admin/storyboard');
  const listeners = [], reads = [], writes = [], creations = [], deletions = [], confirmations = [], notices = [], errors = [], dashboardRenders = [], videoRenders = [];
  const timers = new Map(), frames = new Map(), events = new Map(), modules = new Map();
  const documents = new Map();
  const stages = {
    get: async (_userId, id) => documents.get(id),
    save: async (_userId, _id, draft) => draft.revision + 1,
    create: () => { throw new Error('Unexpected project creation'); },
    remove: async () => {},
    confirm: () => { throw new Error('Unexpected destructive confirmation'); },
  };
  class FakeElement {
    constructor() { this.isConnected = true; this.tabIndex = -1; }
    contains() { return true; }
    scrollIntoView() {}
    focus() {}
    hasAttribute() { return false; }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    getClientRects() { return [{}]; }
  }
  class FakeInput extends FakeElement {}
  class FakeTextarea extends FakeElement {}
  class FakeDetails extends FakeElement {}
  const target = new FakeElement();
  const document = {
    activeElement: null, body: target,
    getElementById: () => target,
    querySelector: () => target,
  };
  const window = {
    get location() { return location; },
    history: { state: null, replaceState: (_state, _unused, next) => { location = new URL(next, location); } },
    addEventListener: (name, fn) => { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(fn); },
    removeEventListener: (name, fn) => events.get(name)?.delete(fn),
    setTimeout: (fn, delay) => { timers.set(++nextTimer, { fn, delay }); return nextTimer; },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame: fn => {
      const id = ++nextFrame; frames.set(id, fn);
      queueMicrotask(() => { if (frames.delete(id)) fn(); });
      return id;
    },
    cancelAnimationFrame: id => frames.delete(id),
    matchMedia: () => ({ matches: true }),
    confirm: message => { confirmations.push(message); return stages.confirm(message); },
  };
  const Dashboard = props => {
    latestDashboard = props;
    dashboardRenders.push({ uid, props, session: { ...props.sessionRef.current } });
    return React.createElement('qa-dashboard', props);
  };
  const VideoPanel = props => {
    const mount = React.useRef({});
    latestVideo = { ...props, mount: mount.current };
    videoRenders.push({ uid, ...latestVideo });
    return React.createElement('qa-video-panel', props);
  };
  const Buffered = props => React.createElement('qa-buffered-field', props);
  const styleMocks = new Proxy({}, { get: (_target, name) => name === '__esModule' ? false : `qa-style-${String(name)}` });
  const service = {
    subscribe(userId, ok, error) {
      const listener = { userId, ok, error, closed: false }; listeners.push(listener);
      return () => { listener.closed = true; };
    },
    get(userId, id) { reads.push({ userId, id }); return stages.get(userId, id); },
    save(userId, id, draft) { writes.push({ userId, id, draft }); return stages.save(userId, id, draft); },
    removeWithMedia(token, id) { deletions.push({ token, id }); return stages.remove(token, id); },
    async create(userId, draft) {
      creations.push({ userId, draft });
      const id = await stages.create(userId, draft);
      documents.set(id, { ...draft, id, userId, createdAt: 1, updatedAt: 2 });
      return id;
    },
  };
  const mocks = {
    react: React,
    'react/jsx-runtime': qa('react/jsx-runtime'),
    sonner: { toast: Object.fromEntries(['error', 'success', 'warning', 'info'].map(type => [type, (...args) => notices.push({ type, args })])) },
    'next/dynamic': { __esModule: true, default: loader => String(loader).includes('StoryboardVideoProductionPanel') ? VideoPanel : () => null },
    '@/contexts/AuthContext': { useAuth: () => ({ currentUser: uid ? { uid, getIdToken: async () => `fixture-${uid}` } : null, loading: false, isConfigured: true, loginWithGoogle: async () => {} }) },
    '@/components/image-generator/StoryboardProjectDashboard': { __esModule: true, default: Dashboard },
    './StoryboardPlanningPresets': { __esModule: true, default: () => null },
    '@/components/image-generator/BufferedTextField': { BufferedTextInput: Buffered, BufferedTextarea: Buffered },
    '@/services/imageStoryboardService': { imageStoryboardService: service, StoryboardConflictError: class StoryboardConflictError extends Error {} },
    '@/services/imageStoryboardPlanningService': new Proxy({}, { get: () => () => { throw new Error('Unexpected paid planning call'); } }),
    '@/lib/client/media-download': {},
  };
  const context = vm.createContext({
    console: { ...console, error: (...args) => errors.push(args) },
    window, document, URL, URLSearchParams, AbortController, queueMicrotask, Error, crypto: webcrypto,
    HTMLElement: FakeElement, HTMLInputElement: FakeInput, HTMLTextAreaElement: FakeTextarea, HTMLDetailsElement: FakeDetails,
    MutationObserver: class { observe() {} disconnect() {} },
  });
  function load(filename) {
    const full = path.resolve(repo, filename);
    if (modules.has(full)) return modules.get(full).exports;
    const module = { exports: {} }; modules.set(full, module);
    const result = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    }, reportDiagnostics: true });
    assert.equal(result.diagnostics.length, 0, `Transpile diagnostics: ${filename}`);
    const localRequire = id => {
      if (id in mocks) return mocks[id];
      if (id.endsWith('StoryboardWorkspace.styles')) return styleMocks;
      if (id.startsWith('@/') || id.startsWith('.')) {
        const base = id.startsWith('@/') ? path.join(repo, 'src', id.slice(2)) : path.resolve(path.dirname(full), id);
        const resolved = [base, `${base}.ts`, `${base}.tsx`].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
        assert(resolved, `Unresolved local import: ${id}`);
        return load(resolved);
      }
      return runtime(id);
    };
    const execute = vm.runInContext(`(function(require, module, exports) {\n${result.outputText}\n})`, context, { filename: full });
    execute(localRequire, module, module.exports);
    return module.exports;
  }
  const { default: Workspace } = load('src/components/image-generator/StoryboardWorkspace.tsx');
  const { createStoryboardVideoScene, createStoryboardVideoProduction } = load('src/schemas/imageStoryboard.ts');
  function project(id) {
    return {
      id, userId: id.split('-')[0], createdAt: 1, updatedAt: 2, schemaVersion: 2, revision: 1,
      archivedAt: null, workflowStage: 'video-design', cleanupStatus: 'idle', cleanupErrorMessage: null, productionRecordSignature: '',
      topic: `주제 ${id}`, title: `프로젝트 ${id}`, logline: '', audience: '', format: 'brand-film', plannedSceneCount: 1,
      aspectRatio: '16:9', stylePreset: 'cinematic', artDirection: '', characterContinuity: '', settingContinuity: '', colorAndLighting: '',
      usePreviousSceneAsReference: true, referenceAssets: [], reclaimableStorageAssets: [], transitionLinks: [],
      videoProduction: createStoryboardVideoProduction(),
      scenes: [{
        id: `${id}-scene`, order: 1, title: `장면 ${id}`, status: 'generated', duration: '3초', narrativeBeat: '', shotSize: '미디엄 샷',
        cameraDirection: '', dialogueOrCaption: '', visualPrompt: '테스트 이미지', imagePrompt: '테스트 이미지', continuityAnchor: '', transition: '', negativePrompt: '',
        assetFreshness: 'current', staleReason: null, imageDesignRevision: 1, videoDesignRevision: 1, approvedImageArtifactId: null, approvedVideoArtifactId: null,
        generatedImage: { id: `${id}-image`, url: 'https://example.invalid/fixture.png', generatedAt: 1 }, video: createStoryboardVideoScene(),
      }],
    };
  }
  const element = () => React.createElement(React.StrictMode, null, React.createElement(Workspace, {
    presentation: 'page', isGenerating: false, onClose() {}, onGenerateScene() { throw new Error('Unexpected paid image call'); },
  }));
  await act(async () => { root = create(element(), { createNodeMock: () => new FakeElement() }); });
  const publish = async (userId, ids = [`${userId}-one`, `${userId}-two`]) => {
    const listener = listeners.findLast(item => item.userId === userId && !item.closed);
    assert(listener, `Live subscription for ${userId}`);
    const items = ids.map(id => { const item = project(id); documents.set(id, item); return item; });
    await act(async () => listener.ok(items));
    return items;
  };
  const open = async item => { await act(async () => latestDashboard.onOpen(item, 'edit')); };
  const switchTo = async next => { uid = next; await act(async () => root.update(element())); };
  const button = label => root.root.findAll(node => typeof node.type === 'string' && node.props['aria-label'] === label)[0];
  const clickProject = async item => {
    const row = root.root.findAll(node => node.type === 'qa-style-ProjectItem' && JSON.stringify(node.children.map(child => typeof child === 'string' ? child : child.props.children)).includes(item.title))[0];
    assert(row, `Project row ${item.id}`);
    await act(async () => row.props.onClick());
  };
  return {
    stages, listeners, reads, writes, creations, deletions, confirmations, errors, notices, dashboardRenders, videoRenders, documents, timers, document,
    get dashboard() { return latestDashboard; }, get video() { return latestVideo; }, get tree() { return root.toJSON(); },
    publish, open, switchTo, clickProject, button,
    bufferTitle: title => {
      const input = new FakeInput();
      input.blur = () => { latestVideo.onChange(current => ({ ...current, title })); document.activeElement = null; };
      document.activeElement = input;
    },
    get isDashboard() { return root.root.findAllByType('qa-dashboard').length === 1; },
    edit: async title => { await act(async () => latestVideo.onChange(current => ({ ...current, title }))); },
    createProject: async () => { await act(async () => { latestDashboard.onCreate(); }); },
    importProject: async (storyboard, text = async () => JSON.stringify(storyboard)) => {
      const input = root.root.findAll(node => node.type === 'input' && node.props.type === 'file' && node.props.accept === 'application/json,.json')[0];
      assert(input, 'Project JSON import control');
      await act(async () => { input.props.onChange({ target: { files: [{ text }], value: 'fixture.json' } }); });
    },
    flushSave: async () => { await act(async () => { for (const [id, timer] of [...timers]) if (timer.delay === 700) { timers.delete(id); timer.fn(); } }); },
    close: async () => { await act(async () => root.unmount()); assert(listeners.every(item => item.closed)); assert.equal(timers.size, 0, 'All timers cleared on unmount'); },
  };
}

async function run() {
  {
    const f = await fixture(); const [one] = await f.publish('A');
    f.stages.confirm = () => false;
    await act(async () => f.dashboard.onDelete(one));
    assert.equal(f.deletions.length, 0, 'Cancel must not delete anything');
    assert.match(f.confirmations[0], /모든 버전/);
    f.stages.confirm = () => true;
    const pending = deferred(); f.stages.remove = () => pending.promise;
    await act(async () => f.dashboard.onDelete(one));
    assert.equal(f.dashboard.deletingProjectId, one.id);
    await act(async () => f.dashboard.onDelete(one));
    assert.equal(f.deletions.length, 1, 'Duplicate clicks must issue a single DELETE');
    await act(async () => pending.resolve());
    assert.equal(f.dashboard.deletingProjectId, null);
    assert(!f.dashboard.storyboards.some(item => item.id === one.id));
    await f.publish('A');
    assert(!f.dashboard.storyboards.some(item => item.id === one.id), 'Stale subscription must not resurrect deleted project');
    await f.close();
    console.log('PASS deletion confirmation, duplicate protection, completion and stale-list rejection');
  }
  {
    const f = await fixture(); const [one] = await f.publish('A'); await f.open(one);
    const saving = deferred(); f.stages.save = () => saving.promise;
    await f.edit('unsaved project'); await f.flushSave();
    f.stages.confirm = () => true;
    await act(async () => f.dashboard.onDelete(one));
    assert.equal(f.deletions.length, 0, 'Deletion must wait for in-flight save and artifact sync');
    await act(async () => saving.resolve(2));
    assert.equal(f.deletions.length, 1); assert(f.isDashboard);
    assert(!f.dashboard.storyboards.some(item => item.id === one.id));
    await f.flushSave(); assert.equal(f.writes.length, 1, 'No delayed autosave after deletion');
    await f.close();
    console.log('PASS delete/save ordering, editor return and autosave cancellation');
  }
  {
    const f = await fixture(); const [one] = await f.publish('A');
    f.stages.confirm = () => true; f.stages.remove = async () => { throw new Error('정리 실패: 다시 삭제해 주세요.'); };
    await act(async () => f.dashboard.onDelete(one));
    assert(f.dashboard.storyboards.some(item => item.id === one.id));
    assert.equal(f.dashboard.deletingProjectId, null);
    assert(f.notices.some(item => item.type === 'error' && item.args[0].includes('정리 실패')));
    f.stages.remove = async () => {};
    await act(async () => f.dashboard.onDelete(one));
    assert.equal(f.deletions.length, 2); assert(!f.dashboard.storyboards.some(item => item.id === one.id));
    await f.close();
    console.log('PASS failed deletion retains project and supports retry');
  }
  {
    const f = await fixture(); const [one] = await f.publish('A');
    const pending = deferred(); f.stages.confirm = () => true; f.stages.remove = () => pending.promise;
    await act(async () => f.dashboard.onDelete(one));
    await f.switchTo('B'); await f.publish('B'); const before = f.notices.length;
    await act(async () => pending.resolve());
    assert.equal(f.notices.length, before, 'Old-account deletion must not show a success toast in the next account');
    assert.equal(f.dashboard.storyboards.length, 2);
    await f.close();
    console.log('PASS deletion completion stays isolated across account switches');
  }
  {
    const f = await fixture();
    assert(f.listeners.some(item => item.closed), 'StrictMode exercises subscription cleanup');
    await f.publish('A');
    f.dashboard.sessionRef.current = { search: 'A private search', page: 3, scrollTop: 420, focusedProjectId: 'A-one' };
    const oldListeners = [...f.listeners], start = f.dashboardRenders.length;
    await f.switchTo('B');
    for (const render of f.dashboardRenders.slice(start)) {
      assert.equal(render.props.storyboards.length, 0, 'B first render must contain no A projects');
      assert.equal(render.session.search, ''); assert.equal(render.session.page, 1); assert.equal(render.session.scrollTop, 0);
    }
    await act(async () => oldListeners.forEach(item => { item.ok([f.documents.get('A-one')]); item.error(new Error('stale A error')); }));
    assert.equal(f.dashboard.storyboards.length, 0); assert.equal(f.dashboard.loadError, null);
    await f.publish('B'); await f.switchTo(null); await f.switchTo('A');
    assert.equal(f.dashboard.storyboards.length, 0); assert.equal(f.dashboard.sessionRef.current.search, '');
    await f.close();
    console.log('PASS account isolation: direct A→B, first render, stale subscription, logout and return, list context reset');
  }
  for (const reject of [false, true]) {
    const f = await fixture(); const items = await f.publish('A'); const pending = deferred();
    f.stages.get = () => pending.promise;
    await f.open(items[1]); assert.equal(f.reads.length, 1);
    await f.switchTo('B'); const [b] = await f.publish('B'); await f.open(b);
    const before = f.video.storyboard;
    await act(async () => { if (reject) pending.reject(new Error('late A read failure')); else pending.resolve(items[1]); });
    assert.equal(f.video.storyboardId, b.id); assert.equal(f.video.storyboard, before);
    assert(!JSON.stringify(f.tree).includes('선택한 프로젝트의 최신 내용을 불러오지 못했습니다'));
    await f.close();
  }
  console.log('PASS deferred project read success/failure cannot cross account boundary');
  for (const reject of [false, true]) {
    const f = await fixture(); const [a] = await f.publish('A'); await f.open(a);
    const pending = deferred(); f.stages.save = () => pending.promise;
    await f.edit('A unsaved change'); await f.flushSave();
    assert.equal(f.writes.length, 1); assert.equal(f.writes[0].userId, 'A');
    await f.switchTo('B'); const [b] = await f.publish('B'); await f.open(b);
    const before = f.video.storyboard;
    await act(async () => { if (reject) pending.reject(new Error('late A save failure')); else pending.resolve(9); });
    assert.equal(f.video.storyboard, before); assert.equal(f.video.storyboard.revision, 1); assert.equal(f.writes.length, 1);
    assert(!JSON.stringify(f.tree).includes('변경 내용을 저장하지 못했습니다'));
    await f.close();
  }
  console.log('PASS deferred save success/failure cannot change the next account draft or save status');
  {
    const f = await fixture(); const [one, two] = await f.publish('A'); await f.open(one);
    const oldPanel = f.video, originalMount = oldPanel.mount;
    await act(async () => oldPanel.onRequestPendingChange(true));
    await f.clickProject(two); assert.equal(f.reads.length, 0, 'Pending video request blocks project switch');
    await act(async () => f.button('프로젝트 대시보드 열기').props.onClick());
    assert.equal(f.video.storyboardId, one.id, 'Pending request retains editor');
    await act(async () => oldPanel.onRequestPendingChange(false));
    await f.clickProject(two); assert.equal(f.video.storyboardId, two.id); assert.notEqual(f.video.mount, originalMount);
    const before = f.video.storyboard;
    await act(async () => oldPanel.onChange(current => ({ ...current, title: 'late mutation from old panel' })));
    assert.equal(f.video.storyboard, before, 'Old project callbacks must not edit the next project');
    await f.edit('current project edit'); assert.equal(f.video.storyboard.title, 'current project edit');
    await f.flushSave(); assert.equal(f.writes.at(-1).id, two.id, 'Current panel edits still save normally');
    await f.close();
    console.log('PASS project isolation: pending-request navigation guard, panel remount, stale callback rejection and current edit/save');
  }
  {
    const f = await fixture(); const [one, two] = await f.publish('A'); await f.open(one);
    f.dashboard.sessionRef.current = { search: 'remembered search', page: 2, scrollTop: 240, focusedProjectId: one.id };
    f.bufferTitle('last buffered edit');
    await act(async () => f.button('프로젝트 대시보드 열기').props.onClick());
    assert(f.isDashboard, 'Successful save returns to dashboard');
    assert.equal(f.writes.length, 1); assert.equal(f.writes[0].draft.title, 'last buffered edit', 'Blur commit must be flushed before dashboard save');
    assert.equal(f.dashboard.initialSession.search, 'remembered search'); assert.equal(f.dashboard.initialSession.page, 2);
    await f.open(one); await f.edit('draft preserved after save failure');
    f.stages.save = async () => { throw new Error('simulated save failure'); };
    await f.clickProject(two);
    assert.equal(f.reads.length, 0, 'Failed save must prevent loading the next project');
    assert.equal(f.video.storyboardId, one.id); assert.equal(f.video.storyboard.title, 'draft preserved after save failure');
    assert(JSON.stringify(f.tree).includes('저장되지 않음'));
    await f.close();
    console.log('PASS buffered-field flush, dashboard session restoration and unsaved-draft protection on failed switch');
  }
  {
    const f = await fixture(); const [one, two] = await f.publish('A'); await f.open(one);
    await f.edit('prior undo state');
    f.bufferTitle('final buffered title before import');
    f.stages.create = async () => 'A-imported';
    await f.importProject(two);
    assert.equal(f.writes.length, 1, 'Import must save the source project before activating its replacement');
    assert.equal(f.writes[0].id, one.id);
    assert.equal(f.writes[0].draft.title, 'final buffered title before import', 'Import must flush the focused buffered field');
    assert.equal(f.creations.length, 1);
    assert.equal(f.video.storyboardId, 'A-imported');
    assert.equal(f.button('되돌리기').props.disabled, true, 'A new imported project cannot undo into the original project');
    assert.equal(f.button('다시 실행').props.disabled, true);
    const imported = f.video.storyboard;
    await act(async () => f.button('되돌리기').props.onClick());
    assert.equal(f.video.storyboard, imported, 'Even a stale undo callback must not restore the previous project');
    await f.flushSave();
    assert.equal(f.writes.length, 1, 'The original autosave timer must not write to the imported project');
    await f.close();
    console.log('PASS import flushes and saves the current draft, then resets project undo/redo');
  }
  {
    const f = await fixture(); const [one, two] = await f.publish('A'); await f.open(one);
    await f.edit('keep this unsaved change');
    f.stages.save = async () => { throw new Error('Fixture save unavailable'); };
    f.stages.create = async () => 'must-not-create';
    await f.importProject(two);
    assert.equal(f.writes.length, 1);
    assert.equal(f.creations.length, 0, 'A failed current-draft save must abort import before creating a project');
    assert.equal(f.video.storyboardId, one.id);
    assert.equal(f.video.storyboard.title, 'keep this unsaved change');
    assert.equal(f.button('되돌리기').props.disabled, false, 'A failed import must preserve source editing history');
    await f.close();
    console.log('PASS failed pre-import save preserves the source draft and editing history');
  }
  for (const operation of ['create', 'import']) {
    const f = await fixture(); const [one, two] = await f.publish('A'); await f.open(one);
    const pending = deferred(); f.stages.create = () => pending.promise;
    if (operation === 'create') await f.createProject();
    else await f.importProject(two);
    assert.equal(f.creations.length, 1, `${operation} must reach the deferred creation`);
    await f.clickProject(two);
    assert.equal(f.video.storyboardId, two.id);
    await act(async () => pending.resolve(`A-late-${operation}`));
    assert.equal(f.video.storyboardId, two.id, `Late ${operation} completion must not replace a newer project selection`);
    assert.equal(f.video.storyboard.title, two.title);
    await f.close();
  }
  console.log('PASS deferred create/import completion cannot hijack a newer project selection');
  for (const operation of ['create', 'import']) {
    const f = await fixture(); const [one, two] = await f.publish('A'); await f.open(one);
    const pending = deferred(); f.stages.create = () => pending.promise;
    if (operation === 'create') await f.createProject();
    else await f.importProject(two);
    await f.switchTo('B'); const [b] = await f.publish('B'); await f.open(b);
    const noticeCount = f.notices.length;
    await act(async () => pending.resolve(`A-old-account-${operation}`));
    assert.equal(f.video.storyboardId, b.id);
    assert.equal(f.notices.length, noticeCount, `An old-account ${operation} must not show a success toast in the next account`);
    await f.close();
  }
  console.log('PASS deferred create/import completion stays isolated across account switches');
  for (const operation of ['create', 'import', 'select']) {
    const f = await fixture(); const [one, two] = await f.publish('A'); await f.open(one);
    await f.edit('first change before project transition');
    const pendingSave = deferred();
    f.stages.save = () => pendingSave.promise;
    f.stages.create = async () => `A-${operation}-after-save`;
    if (operation === 'create') await f.createProject();
    else if (operation === 'import') await f.importProject(two);
    else await f.clickProject(two);
    assert.equal(f.writes.length, 1, `${operation} must wait on its pre-transition save`);
    await f.edit('new change while previous save is pending');
    f.stages.save = async (_userId, _id, draft) => draft.revision + 1;
    await act(async () => pendingSave.resolve(2));
    if (f.video.storyboardId === one.id) {
      assert.equal(f.video.storyboard.title, 'new change while previous save is pending', `${operation} cancellation must retain the latest local edit`);
    } else {
      assert(f.writes.some(write => write.id === one.id && write.draft.title === 'new change while previous save is pending'), `${operation} must persist edits made during its awaited save before switching away`);
    }
    await f.close();
  }
  console.log('PASS create/import/select cannot lose edits made during the pre-transition save');
  console.log('PASS storyboard Workspace lifecycle — real React StrictMode; mocked IO and child widgets; zero network/paid calls');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
