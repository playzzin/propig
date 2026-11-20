/* Real React StrictMode integration: Panel + Journey + Scene editor.
 * IO and nonessential sibling widgets are isolated; no network or paid work runs.
 * PROPIG_QA_TOOLS=/home/hermes/.local/share/propig-tools node scripts/verify-storyboard-panel-integration.cjs
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

function textOf(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return (node.children || []).map(textOf).join('');
}

async function fixture(options = {}) {
  let root, board, setBoard, activeSceneId = 'scene-1', nextTimer = 0, nextFrame = 0;
  const modules = new Map(), timers = new Map(), frames = new Map();
  const submissions = [], projectWrites = [], notices = [], pendingChanges = [], errors = [], focused = [], selected = [];
  const user = { uid: 'qa-user', getIdToken: async () => 'fixture-auth-token' };
  const references = [];
  const jobState = { jobs: [], isReady: true, error: null, retry() {} };
  const stages = {
    create: async () => 'qa-video-project',
    update: async () => {},
    submit: async () => ({ success: true, jobId: 'qa-merge-job', status: 'queued' }),
  };
  class Element {
    constructor(id) { this.id = id; this.isConnected = true; }
    scrollIntoView() {}
    focus() { focused.push(this.id); }
    contains() { return true; }
    getClientRects() { return [{}]; }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    hasAttribute() { return false; }
  }
  const window = {
    setTimeout: (fn, delay) => { timers.set(++nextTimer, { fn, delay }); return nextTimer; },
    clearTimeout: id => timers.delete(id),
    setInterval: (fn, delay) => { timers.set(++nextTimer, { fn, delay, interval: true }); return nextTimer; },
    clearInterval: id => timers.delete(id),
    requestAnimationFrame: fn => {
      const id = ++nextFrame; frames.set(id, fn);
      queueMicrotask(() => { if (frames.delete(id)) fn(); });
      return id;
    },
    cancelAnimationFrame: id => frames.delete(id),
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: true }),
    confirm() { throw new Error('Unexpected destructive action'); },
  };
  const document = {
    visibilityState: 'visible', activeElement: null,
    getElementById: id => new Element(id),
    addEventListener() {}, removeEventListener() {},
  };
  const styleMocks = new Proxy({}, { get: (_target, name) => name === '__esModule' ? false : `qa-style-${String(name)}` });
  const estimate = {
    selection: 'automatic', canSubmit: true, modelId: 'qa-video-model', modelName: 'Fixture Video',
    requestedResolution: '720p', resolvedResolution: '720p', resolvedSize: null,
    requestedDuration: 5, resolvedDuration: 5, aspectRatio: '16:9', rateUsdPerSecond: 0.1,
    estimatedCostUsd: 0.5, catalogModelCount: 1, compatibleModelCount: 1,
    catalog: { source: 'cache', fetchedAt: '2026-09-30T00:00:00Z', refreshAfter: '2026-09-30T01:00:00Z', selectedModelCreatedAt: null },
    credit: { state: 'available', source: 'cache', remainingUsd: 100, requiredUsd: 0.5, isSufficient: true, message: null },
    policy: { visualInputState: 'provider_review_required', automaticRetryAllowed: true, message: 'fixture', recommendedActions: [] },
    selectionReasons: ['fixture'], capabilities: { firstFrame: true, lastFrame: true, visualReferences: true, audio: true, dialogueLipSync: true },
    requestedInputs: { firstFrame: true, lastFrame: false, visualReferences: false, audioMode: 'silent' }, warnings: [],
  };
  const noopWidget = () => null;
  const mocks = {
    react: React,
    'react/jsx-runtime': qa('react/jsx-runtime'),
    sonner: { toast: Object.fromEntries(['error', 'success', 'info', 'warning'].map(type => [type, (...args) => notices.push({ type, args })])) },
    '@/contexts/AuthContext': { useAuth: () => ({ currentUser: user }) },
    '@/hooks/useStoryboardVideoJobs': { useStoryboardVideoJobs: () => jobState },
    '@/services/videoStudioService': { videoStudioService: {
      getStudioRuntimeStatus: async () => ({ worker: { compatible: true, message: 'ready' } }),
      getVideoEstimate: async () => estimate,
      createProject: input => { projectWrites.push({ kind: 'create', input }); return stages.create(input); },
      updateProject: (id, input) => { projectWrites.push({ kind: 'update', id, input }); return stages.update(id, input); },
      submitStudioJob: input => { submissions.push(input); return stages.submit(input); },
      updateStudioJob() { throw new Error('Unexpected job action'); },
      hasStudioJobOnServer() { throw new Error('Unexpected server recovery'); },
    } },
    '@/services/imageStoryboardService': { imageStoryboardService: new Proxy({}, { get: () => () => { throw new Error('Unexpected storage write'); } }) },
    '@/lib/client/media-download': { createDownloadFileName: (...parts) => parts.join('.'), downloadRemoteMedia() { throw new Error('Unexpected download'); }, openRemoteMedia() { throw new Error('Unexpected window'); } },
    '@/components/image-generator/BufferedTextField': { BufferedTextarea: props => React.createElement('qa-buffered-textarea', props) },
  };
  for (const name of ['StoryboardAutomationConsole', 'StoryboardAssemblyEditor', 'StoryboardFinalDelivery', 'StoryboardProjectFileManager', 'StoryboardBatchSettings', 'StoryboardSceneComparison']) {
    mocks[`@/components/image-generator/${name}`] = { __esModule: true, default: noopWidget };
    mocks[`./${name}`] = { __esModule: true, default: noopWidget };
  }
  const context = vm.createContext({
    console: { ...console, error: (...args) => errors.push(args) },
    window, document, URL, URLSearchParams, AbortController, TextEncoder, queueMicrotask, Error, crypto: webcrypto,
    HTMLElement: Element, HTMLInputElement: Element, HTMLTextAreaElement: Element,
    fetch() { throw new Error('Network is forbidden in integration fixtures'); },
  });
  function load(filename) {
    const full = path.resolve(repo, filename);
    if (modules.has(full)) return modules.get(full).exports;
    const module = { exports: {} }; modules.set(full, module);
    const output = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    }, reportDiagnostics: true });
    assert.equal(output.diagnostics.length, 0, `Transpile diagnostics: ${filename}`);
    const localRequire = id => {
      if (id in mocks) return mocks[id];
      if (id.endsWith('.styles')) return styleMocks;
      if (id.startsWith('@/') || id.startsWith('.')) {
        const base = id.startsWith('@/') ? path.join(repo, 'src', id.slice(2)) : path.resolve(path.dirname(full), id);
        const resolved = [base, `${base}.ts`, `${base}.tsx`].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
        assert(resolved, `Unresolved import: ${id}`);
        return load(resolved);
      }
      return runtime(id);
    };
    vm.runInContext(`(function(require,module,exports){\n${output.outputText}\n})`, context, { filename: full })(localRequire, module, module.exports);
    return module.exports;
  }
  const { default: Panel } = load('src/components/image-generator/StoryboardVideoProductionPanel.tsx');
  const { createStoryboardVideoScene, createStoryboardVideoProduction } = load('src/schemas/imageStoryboard.ts');
  const initial = {
    id: 'qa-storyboard', userId: user.uid, createdAt: 1, updatedAt: 2, schemaVersion: 2, revision: 1,
    archivedAt: null, workflowStage: 'video-design', cleanupStatus: 'idle', cleanupErrorMessage: null, productionRecordSignature: '',
    topic: 'Fixture topic', title: 'Fixture project', logline: '', audience: '', format: 'brand-film', plannedSceneCount: 1,
    aspectRatio: '16:9', stylePreset: 'cinematic', artDirection: 'Soft light', characterContinuity: 'Same subject', settingContinuity: 'Studio', colorAndLighting: 'Warm',
    usePreviousSceneAsReference: true, referenceAssets: [], reclaimableStorageAssets: [], transitionLinks: [],
    videoProduction: { ...createStoryboardVideoProduction(), qualityMode: 'draft' },
    scenes: [{
      id: 'scene-1', order: 1, title: 'Fixture scene', status: 'generated', duration: '5초', narrativeBeat: 'Subject looks toward camera', shotSize: '미디엄 샷',
      cameraDirection: 'Slow dolly', dialogueOrCaption: '', visualPrompt: 'A studio subject', imagePrompt: 'A studio subject', continuityAnchor: 'Same subject', transition: '', negativePrompt: '',
      assetFreshness: 'current', staleReason: null, imageDesignRevision: 1, videoDesignRevision: 1, approvedImageArtifactId: 'qa-image', approvedVideoArtifactId: null,
      generatedImage: { id: 'qa-image', url: 'https://example.invalid/frame.png', generatedAt: 1 },
      video: { ...createStoryboardVideoScene(), durationSeconds: 5, motionPrompt: 'Slow natural motion', motionIntensity: 'balanced', audioMode: 'silent', generateAudio: false,
        status: 'review', clipId: 'qa-clip', artifactId: 'qa-clip', videoUrl: 'https://example.invalid/clip.mp4', lastFrameUrl: 'https://example.invalid/last.png' },
    }],
  };
  options.configure?.(initial);
  function Host() {
    const [current, update] = React.useState(initial);
    const [active, setActive] = React.useState(activeSceneId);
    board = current; setBoard = update; activeSceneId = active;
    const onChange = React.useCallback(updater => update(updater), []);
    const onActiveSceneChange = React.useCallback(id => { selected.push(id); setActive(id); }, []);
    const onPending = React.useCallback(pending => pendingChanges.push(pending), []);
    return React.createElement(Panel, { storyboardId: current.id, storyboard: current, referenceAssets: references,
      activeSceneId: active, onActiveSceneChange, onDuplicateScene() { throw new Error('Unexpected duplication'); },
      onOpenImageWorkspace() { throw new Error('Unexpected image navigation'); }, onChange, onRequestPendingChange: onPending });
  }
  await act(async () => { root = create(React.createElement(React.StrictMode, null, React.createElement(Host)), { createNodeMock: element => new Element(element.props.id) }); });
  const byId = id => root.root.findAll(node => typeof node.type === 'string' && node.props.id === id)[0];
  const byText = label => root.root.findAll(node => typeof node.type === 'string' && typeof node.props.onClick === 'function' && textOf(node) === label)[0];
  const click = async node => {
    assert(node, 'Expected a rendered action'); assert(!node.props.disabled, `Action disabled: ${textOf(node)}`);
    await act(async () => { node.props.onClick(); });
  };
  const flushEstimates = async () => {
    await act(async () => { for (const [id, timer] of [...timers]) if (timer.delay === 300) { timers.delete(id); timer.fn(); } });
  };
  await flushEstimates();
  assert(root.root.findAll(node => node.type === 'qa-style-ProductionJourney').length === 1, 'Real Journey rendered');
  assert(root.root.findAll(node => node.type === 'qa-style-SceneProductionRow').length === initial.scenes.length, 'Real Scene editor rendered');
  return {
    root, stages, submissions, projectWrites, notices, pendingChanges, errors, selected, focused, jobState,
    get board() { return board; }, byId, byText, click, flushEstimates,
    get primary() { return byId('storyboard-production-primary-action'); },
    update: async updater => { await act(async () => setBoard(updater)); },
    async close() { await act(async () => root.unmount()); assert.equal(timers.size, 0, 'Timers released'); assert.equal(errors.length, 0, `Unexpected component errors: ${errors}`); },
  };
}

async function run() {
  {
    const f = await fixture();
    assert.match(textOf(f.primary), /검수/);
    await f.click(f.primary);
    assert.deepEqual(f.selected, ['scene-1']);
    assert(f.focused.includes('storyboard-video-scene-scene-1'));
    assert.equal(f.submissions.length, 0, 'Review navigation must not regenerate');
    const reviewButton = f.root.root.findAllByType('qa-style-ReviewButton')[0];
    await f.click(reviewButton);
    assert.equal(f.board.scenes[0].video.status, 'approved');
    assert.match(textOf(f.primary), /완성본/);
    const accepted = deferred(); f.stages.submit = () => accepted.promise;
    await f.click(f.primary);
    // Hashing the assembly idempotency key crosses the native crypto boundary.
    for (let index = 0; index < 20 && !f.submissions.length; index++) await act(async () => { await new Promise(resolve => setImmediate(resolve)); });
    assert.equal(f.submissions.length, 1, 'Exactly one final assembly submission');
    assert.equal(f.submissions[0].operation, 'merge');
    assert.equal(f.submissions.filter(item => item.operation !== 'merge').length, 0, 'No generation requests for an existing reviewed clip');
    assert.deepEqual(Array.from(f.submissions[0].mergeClipIds), ['qa-clip']);
    assert.equal(f.primary.props.disabled, true, 'Pending merge disables the actual primary control');
    await act(async () => f.primary.props.onClick());
    assert.equal(f.submissions.length, 1, 'Even a programmatic repeat is guarded');
    assert.equal(f.pendingChanges.at(-1), true);
    await act(async () => accepted.resolve({ success: true, jobId: 'qa-merge-job', status: 'queued' }));
    assert.equal(f.board.videoProduction.finalStatus, 'queued');
    assert.equal(f.board.videoProduction.finalJobId, 'qa-merge-job');
    await f.close();
    console.log('PASS real review navigation → scene approval → first final merge, no generation, pending request lock');
  }
  {
    const f = await fixture({ configure(board) { board.scenes[0].video.status = 'approved'; board.scenes[0].video.approvedAt = 1; board.scenes[0].approvedVideoArtifactId = 'qa-clip'; } });
    const before = f.board;
    await f.click(f.byText('균형 잡힌 움직임'));
    await f.click(f.byText('무음영상만 생성'));
    assert.equal(f.board, before, 'Reselecting current motion/audio leaves the same project snapshot');
    assert.equal(f.board.scenes[0].video.status, 'approved');
    assert.equal(f.board.scenes[0].approvedVideoArtifactId, 'qa-clip');
    assert.equal(f.board.scenes[0].videoDesignRevision, 1);
    assert.equal(f.submissions.length, 0);
    await f.close();
    console.log('PASS real motion/audio controls preserve existing approval on no-op selections');
  }
  {
    const f = await fixture({ configure(board) {
      board.scenes[0].video = { ...board.scenes[0].video, status: 'brief', videoUrl: null, clipId: null, artifactId: null, lastFrameUrl: null };
    } });
    const preparing = deferred(); f.stages.create = () => preparing.promise;
    await f.click(f.primary);
    const confirmation = f.byId('storyboard-video-approval');
    assert(confirmation, 'Paid generation must open explicit confirmation first');
    assert.equal(f.submissions.length, 0);
    const checkbox = confirmation.findByType('input');
    await act(async () => checkbox.props.onChange({ target: { checked: true } }));
    const confirm = f.byId('storyboard-video-approval').findByType('qa-style-PrimaryAutomationButton');
    await f.click(confirm);
    assert.equal(f.board.videoProduction.automationStatus, 'preparing');
    await f.click(f.byText('현재 장면 후 멈추기'));
    assert(['pausing', 'paused'].includes(f.board.videoProduction.automationStatus));
    await act(async () => preparing.resolve('qa-video-project'));
    assert.equal(f.board.videoProduction.automationStatus, 'paused', 'Pause survives late project preparation completion');
    assert.equal(f.submissions.length, 0, 'Pause before preparation completes never submits generation');
    assert.equal(f.board.videoProduction.projectId, 'qa-video-project', 'Prepared project is retained for explicit resume');
    assert.match(textOf(f.primary), /이어/);
    await f.close();
    console.log('PASS real generation confirmation and pause during delayed preparation, explicit resume remains available');
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
