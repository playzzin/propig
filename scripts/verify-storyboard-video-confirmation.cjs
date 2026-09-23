/* Real VideoProductionPanel JSX/hooks. Child views, IO and browser APIs are mocked.
 * No Firebase/provider/network call is made; submit counters refer only to mocks.
 * PROPIG_QA_TOOLS=/home/hermes/.local/share/propig-tools node scripts/verify-storyboard-video-confirmation.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const repo = path.resolve(__dirname, '..');
const runtime = createRequire(path.join(process.env.PROPIG_TEST_RUNTIME || repo, 'package.json'));
const qa = process.env.PROPIG_QA_TOOLS ? createRequire(path.join(process.env.PROPIG_QA_TOOLS, 'package.json')) : runtime;
const ts = runtime('typescript'), React = qa('react');
const { act, create } = qa('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function textOf(node) {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  return textOf(node.children);
}
const quote = (cost = 2, canSubmit = true) => ({ estimatedCostUsd: cost, canSubmit, credit: { state: 'available', remainingUsd: 20, requiredUsd: cost, message: null }, resolvedResolution: '480p', resolvedDuration: 3, catalog: { source: 'live' }, catalogModelCount: 1, compatibleModelCount: 1 });

async function fixture(prepareBoard = current => current) {
  let root, board, sceneProps, journeyProps, finalProps, timerId = 0;
  let jobState = { jobs: [], isReady: true, error: null, retry() {} };
  let workerCompatible = true;
  let submitFailure = false;
  const auth = { currentUser: { uid: 'fixture-user', getIdToken: async () => 'synthetic-token' } };
  let references = [];
  const estimates = [], submits = [], notices = [], errors = [], projectUpdates = [], clipDeletes = [], timers = new Map(), modules = new Map();
  const sceneView = props => { sceneProps = props; return React.createElement('qa-scene-editor', props); };
  const journeyView = props => { journeyProps = props; return React.createElement('qa-journey', props); };
  const finalView = props => { finalProps = props; return React.createElement('qa-final-delivery', props); };
  const styles = new Proxy({}, { get: (_, name) => name === '__esModule' ? false : `qa-style-${String(name)}` });
  const service = {
    getStudioRuntimeStatus: async () => ({ worker: { compatible: workerCompatible, message: workerCompatible ? null : 'fixture worker unavailable' } }),
    getVideoEstimate: params => { const request = { params, ...deferred() }; estimates.push(request); return request.promise; },
    updateProject: async (...args) => { projectUpdates.push(args); },
    submitStudioJob: async params => { submits.push(params); if (submitFailure) throw new Error('Synthetic submit failure'); return { jobId: `queued-${submits.length}` }; },
    deleteClip: async params => { clipDeletes.push(params); },
  };
  const child = () => null;
  const mocks = {
    react: React, 'react/jsx-runtime': qa('react/jsx-runtime'),
    sonner: { toast: Object.fromEntries(['error', 'success', 'warning', 'info'].map(type => [type, (...args) => notices.push({ type, args })])) },
    '@/contexts/AuthContext': { useAuth: () => auth },
    '@/hooks/useStoryboardVideoJobs': { useStoryboardVideoJobs: () => jobState },
    '@/services/videoStudioService': { videoStudioService: service },
    '@/services/imageStoryboardService': { imageStoryboardService: {} },
    '@/lib/client/media-download': {},
    '@/lib/video-studio-client-idempotency': {
      buildStoryboardSceneVideoIdempotencyKey: async () => 'synthetic-scene-request',
      buildStoryboardFinalVideoIdempotencyKey: async () => 'synthetic-final-request',
    },
    '@/components/image-generator/StoryboardSceneProductionEditor': { __esModule: true, default: sceneView },
    '@/components/image-generator/StoryboardProductionJourney': { __esModule: true, default: journeyView },
    '@/components/image-generator/StoryboardFinalDelivery': { __esModule: true, default: finalView },
  };
  for (const name of ['StoryboardAutomationConsole', 'StoryboardAssemblyEditor', 'StoryboardProjectFileManager']) {
    mocks[`@/components/image-generator/${name}`] = { __esModule: true, default: child };
  }
  mocks['./StoryboardBatchSettings'] = { __esModule: true, default: child };
  mocks['./StoryboardSceneComparison'] = { __esModule: true, default: child };
  const target = { scrollIntoView() {}, focus() {} };
  const window = {
    setTimeout: (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; }, clearTimeout: id => timers.delete(id),
    setInterval: (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; }, clearInterval: id => timers.delete(id),
    requestAnimationFrame: fn => { queueMicrotask(fn); return 1; },
    addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: true }),
  };
  const context = vm.createContext({
    console: { ...console, error: (...args) => errors.push(args) }, window,
    document: { getElementById: () => target, addEventListener() {}, removeEventListener() {} },
    URL, URLSearchParams, AbortController, queueMicrotask,
  });
  function load(filename) {
    const full = path.resolve(repo, filename);
    if (modules.has(full)) return modules.get(full).exports;
    const loadedModule = { exports: {} }; modules.set(full, loadedModule);
    const result = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    }, reportDiagnostics: true });
    assert.equal(result.diagnostics.length, 0, `Transpile: ${filename}`);
    const requireLocal = id => {
      if (id in mocks) return mocks[id];
      if (id.endsWith('StoryboardVideoProductionPanel.styles')) return styles;
      if (id.startsWith('@/') || id.startsWith('.')) {
        const base = id.startsWith('@/') ? path.join(repo, 'src', id.slice(2)) : path.resolve(path.dirname(full), id);
        const resolved = [base, `${base}.ts`, `${base}.tsx`].find(item => fs.existsSync(item) && fs.statSync(item).isFile());
        assert(resolved, `Unresolved import: ${id}`); return load(resolved);
      }
      return runtime(id);
    };
    vm.runInContext(`(function(require,module,exports) {\n${result.outputText}\n})`, context, { filename: full })(requireLocal, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  const { default: Panel } = load('src/components/image-generator/StoryboardVideoProductionPanel.tsx');
  const { createStoryboardVideoScene, createStoryboardVideoProduction } = load('src/schemas/imageStoryboard.ts');
  const { createStoryboardFinalAssemblyManifest } = load('src/lib/storyboard-workflow.ts');
  board = {
    schemaVersion: 2, revision: 1, title: '확인 테스트', topic: '확인 테스트', logline: '', audience: '', aspectRatio: '16:9', stylePreset: 'cinematic',
    artDirection: '영화 조명', characterContinuity: '같은 인물', settingContinuity: '같은 공간', colorAndLighting: '따뜻한 조명',
    referenceAssets: [], reclaimableStorageAssets: [], transitionLinks: [], cleanupStatus: 'idle',
    videoProduction: { ...createStoryboardVideoProduction(), projectId: 'fixture-video-project', maxBudgetUsd: 5 },
    scenes: [{
      id: 'approved-scene', order: 1, title: '승인 장면', status: 'generated', duration: '3초', narrativeBeat: '제품 소개', shotSize: '미디엄 샷',
      cameraDirection: '느린 전진', dialogueOrCaption: '', visualPrompt: '제품', imagePrompt: '제품 영화 조명', continuityAnchor: '일관된 제품', transition: '', negativePrompt: '',
      assetFreshness: 'current', staleReason: null, imageDesignRevision: 1, videoDesignRevision: 1, approvedImageArtifactId: 'image', approvedVideoArtifactId: 'approved-clip',
      generatedImage: { id: 'image', url: 'https://example.invalid/image.png', generatedAt: 1 },
      video: { ...createStoryboardVideoScene(), motionPrompt: '느린 전진', durationSeconds: 3, audioMode: 'silent', status: 'approved', clipId: 'approved-clip', artifactId: 'approved-clip', videoUrl: 'https://example.invalid/approved.mp4', approvedAt: 1 },
    }],
  };
  board = prepareBoard(board, createStoryboardFinalAssemblyManifest);
  const onChange = update => { const next = update(board); if (next !== board) { board = next; root.update(tree()); } };
  const tree = () => React.createElement(React.StrictMode, null, React.createElement(Panel, {
    storyboardId: 'fixture-board', storyboard: board, referenceAssets: references, activeSceneId: 'approved-scene',
    onActiveSceneChange() {}, onDuplicateScene() {}, onOpenImageWorkspace() {}, onChange,
  }));
  await act(async () => { root = create(tree()); });
  const approval = () => root.root.findAllByProps({ id: 'storyboard-video-approval' })[0];
  const confirmButton = () => approval()?.findByType('qa-style-PrimaryAutomationButton');
  return {
    estimates, submits, notices, errors, projectUpdates, clipDeletes,
    get scene() { return sceneProps; }, get journey() { return journeyProps; }, get text() { return textOf(root.toJSON()); },
    get final() { return finalProps; },
    get board() { return board; }, get approval() { return approval(); }, get confirmButton() { return confirmButton(); },
    get acceptance() { return approval()?.findByType('input'); },
    open: async kind => { await act(async () => sceneProps.actions[kind]()); },
    accept: async () => { assert.equal(approval().findByType('input').props.disabled, false, 'Consent must be available before user checks it'); await act(async () => approval().findByType('input').props.onChange({ target: { checked: true } })); },
    confirm: async (twice = false) => { await act(async () => { const click = confirmButton().props.onClick; click(); if (twice) click(); }); },
    resolve: async (request = estimates.at(-1), value = quote()) => { await act(async () => request.resolve(value)); },
    cancel: async () => { await act(async () => approval().findAllByType('qa-style-SecondaryAutomationButton').find(item => textOf(item) === '취소').props.onClick()); },
    changeDraft: async update => { await act(async () => onChange(update)); },
    merge: async () => { await act(async () => finalProps.onRemerge()); },
    failSubmit: () => { submitFailure = true; },
    publishJobs: async jobs => { jobState = { ...jobState, jobs }; await act(async () => root.update(tree())); },
    setConnection: async ready => { jobState = { ...jobState, isReady: ready, error: ready ? null : 'fixture subscription disconnected' }; await act(async () => root.update(tree())); },
    blockWorker: async () => { workerCompatible = false; await act(async () => root.root.findByType('qa-style-ModelCatalogRefreshButton').props.onClick()); },
    retryQuote: async () => { await act(async () => approval().findAllByType('qa-style-SecondaryAutomationButton').find(item => textOf(item) === '견적 다시 확인').props.onClick()); },
    refreshReferenceInputs: async () => { references = [...references]; await act(async () => root.update(tree())); },
    close: async () => { await act(async () => root.unmount()); assert.equal(timers.size, 0); },
  };
}

const previousFinalUrl = 'https://example.invalid/previous-final.mp4';
const nextFinalUrl = 'https://example.invalid/next-final.mp4';
function withPreviousFinal(current, manifestFor) {
  const first = current.scenes[0];
  const board = {
    ...current,
    scenes: [{
      ...first, id: 'second-source', order: 1, title: '첫 순서 승인 장면',
      video: { ...first.video, clipId: 'second-clip', artifactId: 'second-clip', videoUrl: 'https://example.invalid/second.mp4', trimStartSeconds: 0.25, playbackRate: 1.25, audioVolume: 0.7 },
    }, { ...first, order: 2 }],
    videoProduction: {
      ...current.videoProduction, finalStatus: 'completed', finalFreshness: 'current',
      finalClipId: 'previous-final', finalArtifactId: 'previous-final', finalVideoUrl: previousFinalUrl,
      lastSuccessfulFinalVideoUrl: previousFinalUrl,
    },
  };
  board.videoProduction.finalAssemblyManifest = manifestFor(board, ['second-clip', 'approved-clip'], '480p');
  return board;
}
function mergeJob(id, patch = {}) {
  return { id, userId: 'fixture-user', projectId: 'fixture-video-project', kind: 'merge', status: 'queued', title: '합성 병합 작업',
    clipId: null, resultVideoUrl: null, errorMessage: null, metadata: null, createdAt: Date.now(), updatedAt: Date.now(), ...patch };
}
function assertPreviousFinal(f) {
  assert.equal(f.board.videoProduction.finalClipId, 'previous-final', 'Keep the previous final clip until a complete replacement exists');
  assert.equal(f.board.videoProduction.finalArtifactId, 'previous-final');
  assert.equal(f.board.videoProduction.finalVideoUrl, previousFinalUrl, 'Keep the previous playable final URL');
  assert.equal(f.board.videoProduction.lastSuccessfulFinalVideoUrl, previousFinalUrl);
  assert.equal(f.final.delivery.finalVideoUrl, previousFinalUrl, 'Previous final remains exposed to the delivery UI');
  assert.equal(f.clipDeletes.length, 0, 'Never remove the previous final before successful replacement');
}

async function testFinalMerges() {
  for (const invalid of [{ status: 'review' }, { clipId: null }, { videoUrl: null }]) {
    const f = await fixture(withPreviousFinal);
    await f.changeDraft(current => ({ ...current, scenes: current.scenes.map((scene, index) => index === 0 ? { ...scene, video: { ...scene.video, ...invalid } } : scene) }));
    assert.equal(f.final.delivery.remergeDisabled, true);
    await f.merge(); assert.equal(f.submits.length, 0, 'A forced callback cannot merge an unapproved or unplayable scene');
    assert.equal(f.projectUpdates.length, 0); assertPreviousFinal(f); await f.close();
  }
  console.log('PASS final merge rejects unapproved, missing-clip and missing-video scenes at the actual callback');
  {
    const f = await fixture(withPreviousFinal); const oldManifest = f.board.videoProduction.finalAssemblyManifest;
    f.failSubmit(); await f.merge();
    assert.equal(f.submits.length, 1); assert.equal(f.submits[0].operation, 'merge'); assert.equal(f.board.videoProduction.finalStatus, 'failed');
    assert(f.board.videoProduction.finalErrorMessage); assert.equal(f.board.videoProduction.finalAssemblyManifest, oldManifest); assertPreviousFinal(f);
    assert.equal(f.final.delivery.remergeDisabled, false, 'Submission failure remains retryable'); await f.close();
  }
  for (const status of ['failed', 'canceled']) {
    const f = await fixture(withPreviousFinal); await f.merge();
    const id = f.board.videoProduction.finalJobId;
    assert.equal(f.board.videoProduction.finalStatus, 'queued'); assertPreviousFinal(f);
    assert.equal(f.final.delivery.remergeDisabled, true); await f.merge(); assert.equal(f.submits.length, 1, 'In-flight final merge cannot be submitted again');
    await f.publishJobs([mergeJob(id, { status: 'running' })]); assert.equal(f.board.videoProduction.finalStatus, 'rendering'); assertPreviousFinal(f);
    await f.publishJobs([mergeJob(id, { status, errorMessage: '합성 병합 실패' })]);
    assert.equal(f.board.videoProduction.finalStatus, 'failed'); assert(f.board.videoProduction.finalErrorMessage); assertPreviousFinal(f);
    assert.equal(f.final.delivery.remergeDisabled, false);
    await f.merge(); assert.equal(f.submits.length, 2); const retriedId = f.board.videoProduction.finalJobId;
    await f.publishJobs([mergeJob(id, { status: 'completed', clipId: 'obsolete-output', resultVideoUrl: 'https://example.invalid/obsolete.mp4' })]);
    assert.equal(f.board.videoProduction.finalJobId, retriedId); assert.equal(f.board.videoProduction.finalStatus, 'queued'); assertPreviousFinal(f);
    await f.close();
  }
  console.log('PASS final submission/worker/cancellation failures, retry isolation and previous delivery protection');
  for (const changeDuringMerge of [false, true]) {
    const f = await fixture(withPreviousFinal); assert.equal(f.final.delivery.isCurrent, true);
    await f.merge(); assert.equal(f.submits.length, 1); assert.equal(f.submits[0].operation, 'merge');
    assert.deepEqual(Array.from(f.submits[0].mergeClipIds), ['second-clip', 'approved-clip'], 'Merge uses the storyboard array order');
    assert.deepEqual(Array.from(f.submits[0].mergeClipEdits, item => item.clipId), ['second-clip', 'approved-clip']);
    assert.equal(f.submits[0].mergeClipEdits[0].trimStartSeconds, 0.25); assert.equal(f.submits[0].mergeClipEdits[0].playbackRate, 1.25); assert.equal(f.submits[0].mergeClipEdits[0].audioVolume, 0.7);
    assert.equal(f.estimates.length, 0, 'Approved-only final merge never requests a new scene-generation quote');
    const pending = f.board.videoProduction.pendingAssemblyManifest, id = f.board.videoProduction.finalJobId;
    assert(pending); assert.equal(f.final.delivery.isCurrent, false); assertPreviousFinal(f);
    if (changeDuringMerge) await f.changeDraft(current => ({ ...current, videoProduction: { ...current.videoProduction, sceneAudioVolume: 0.4 } }));
    const done = mergeJob(id, { status: 'completed', clipId: 'next-final', resultVideoUrl: nextFinalUrl });
    await f.publishJobs([done]);
    assert.equal(f.board.videoProduction.finalStatus, 'completed'); assert.equal(f.board.videoProduction.finalVideoUrl, nextFinalUrl);
    assert.equal(f.board.videoProduction.finalClipId, 'next-final'); assert.equal(f.board.videoProduction.finalArtifactId, 'next-final');
    assert.equal(f.board.videoProduction.finalAssemblyManifest, pending); assert.equal(f.board.videoProduction.pendingAssemblyManifest, null);
    assert.equal(f.board.videoProduction.lastSuccessfulFinalVideoUrl, nextFinalUrl); assert.equal(f.board.videoProduction.finalErrorMessage, null);
    assert.equal(f.board.videoProduction.finalFreshness, changeDuringMerge ? 'stale' : 'current'); assert.equal(f.final.delivery.isCurrent, !changeDuringMerge);
    assert.equal(f.final.delivery.finalVideoUrl, nextFinalUrl); assert.equal(f.clipDeletes.length, 1); assert.equal(f.clipDeletes[0].clipId, 'previous-final');
    await f.publishJobs([{ ...done }]); assert.equal(f.clipDeletes.length, 1, 'Repeated completion snapshot cannot repeat prior-file cleanup');
    await f.close();
  }
  console.log('PASS ordered approved-only merge payload, successful manifest replacement, freshness and idempotent cleanup');
  for (const partial of [{ clipId: null, resultVideoUrl: null }, { clipId: 'partial-final', resultVideoUrl: null }, { clipId: null, resultVideoUrl: nextFinalUrl }]) {
    const f = await fixture(withPreviousFinal); const oldManifest = f.board.videoProduction.finalAssemblyManifest;
    await f.merge(); const pending = f.board.videoProduction.pendingAssemblyManifest;
    await f.publishJobs([mergeJob(f.board.videoProduction.finalJobId, { status: 'completed', ...partial })]);
    assert.equal(f.board.videoProduction.finalStatus, 'failed'); assert.match(f.board.videoProduction.finalErrorMessage, /재생 가능한 영상 결과가 없습니다/);
    assert.equal(f.board.videoProduction.finalAssemblyManifest, oldManifest); assert.equal(f.board.videoProduction.pendingAssemblyManifest, pending);
    assertPreviousFinal(f); assert.equal(f.final.delivery.isCurrent, false); assert.equal(f.final.delivery.remergeDisabled, false); await f.close();
  }
  console.log('PASS completed jobs with missing outputs preserve the previous final and remain retryable');
  for (const status of ['running', 'uploading', 'failed', 'canceled']) {
    for (const partial of [{ clipId: 'partial-final', resultVideoUrl: null }, { clipId: null, resultVideoUrl: nextFinalUrl }]) {
      const f = await fixture(withPreviousFinal); const oldManifest = f.board.videoProduction.finalAssemblyManifest;
      await f.merge(); const pending = f.board.videoProduction.pendingAssemblyManifest;
      await f.publishJobs([mergeJob(f.board.videoProduction.finalJobId, { status, ...partial })]);
      assert.equal(f.board.videoProduction.finalStatus, status === 'running' || status === 'uploading' ? 'rendering' : 'failed');
      assertPreviousFinal(f); assert.equal(f.board.videoProduction.finalAssemblyManifest, oldManifest); assert.equal(f.board.videoProduction.pendingAssemblyManifest, pending);
      assert.equal(f.final.delivery.isCurrent, false); await f.close();
    }
  }
  console.log('PASS running/uploading/failed/canceled partial outputs cannot replace the last successful delivery');
}

async function testRegeneratedSceneOutputs() {
  const nextVideoUrl = 'https://example.invalid/regenerated-scene.mp4';
  const nextFrameUrl = 'https://example.invalid/regenerated-frame.png';
  const cases = [
    { name: 'clip-only', clipId: 'regenerated-clip', resultVideoUrl: null, complete: false },
    { name: 'URL-only', clipId: null, resultVideoUrl: nextVideoUrl, complete: false },
    { name: 'complete-pair', clipId: 'regenerated-clip', resultVideoUrl: nextVideoUrl, complete: true },
    { name: 'complete-pair-no-frame', clipId: 'regenerated-clip', resultVideoUrl: nextVideoUrl, complete: true, noFrame: true },
  ];
  const failures = [];
  for (const scenario of cases) {
    const f = await fixture(current => ({ ...current, scenes: current.scenes.map(scene => ({
      ...scene, video: { ...scene.video, lastFrameUrl: 'https://example.invalid/approved-frame.png' },
    })) }));
    try {
      const previous = f.board.scenes[0].video;
      await f.open('onRegenerate'); await f.resolve(); await f.accept(); await f.confirm();
      assert.equal(f.submits.length, 1); assert.equal(f.board.scenes[0].video.status, 'queued');
      await f.publishJobs([{ ...mergeJob(f.board.scenes[0].video.jobId), kind: 'generate', status: 'completed',
        clipId: scenario.clipId, resultVideoUrl: scenario.resultVideoUrl, resultFrameUrl: scenario.noFrame ? null : nextFrameUrl }]);
      const video = f.board.scenes[0].video;
      const output = ({ clipId, videoUrl, artifactId, lastFrameUrl }) => ({ clipId, videoUrl, artifactId, lastFrameUrl });
      assert.deepEqual(output(video), scenario.complete
        ? { clipId: 'regenerated-clip', videoUrl: nextVideoUrl, artifactId: 'regenerated-clip', lastFrameUrl: scenario.noFrame ? null : nextFrameUrl }
        : output(previous), `${scenario.name}: scene output fields must change together only after a complete result`);
      assert.equal(video.status, scenario.complete ? 'review' : 'failed', `${scenario.name}: partial completion is not reviewable success`);
      assert.equal(video.approvedAt, null, 'Regenerated output always needs fresh approval');
      assert.equal(f.scene.model.scene.video, video, 'The visible scene editor receives the reconciled result');
      assert.equal(f.clipDeletes.length, 0, 'Do not clean up prior output before an accepted replacement');
      if (scenario.complete) {
        assert.equal(video.errorMessage, null); assert.equal(video.replacedClipId, previous.clipId);
      } else {
        assert.equal(video.replacedClipId, previous.replacedClipId);
        assert.match(video.errorMessage || '', /재생 가능한.*영상|영상.*결과/, 'Missing result has a recoverable user-facing explanation');
      }
    } catch (error) {
      failures.push({ name: scenario.name, error });
    } finally {
      await f.close();
    }
  }
  for (const failure of failures) console.error(`FAIL scene regeneration ${failure.name}:`, failure.error.message);
  assert.equal(failures.length, 0, 'All four regenerated-scene output cases must pass');
  console.log('PASS regenerated scene partial outputs preserve prior media; complete pairs await review and never reuse a previous video frame');
}

async function run() {
  for (const kind of ['onRegenerate', 'onGenerateWithoutVisualInputs']) {
    const f = await fixture(); assert.equal(f.estimates.length, 0, 'Approved scenes do not need a bulk estimate');
    await f.open(kind); assert.equal(f.estimates.length, 1, 'A requested approved-scene action must fetch its own estimate');
    const request = f.estimates[0], textOnly = kind === 'onGenerateWithoutVisualInputs';
    assert.equal(request.params.hasReferenceImage, !textOnly);
    if (textOnly) { assert.equal(request.params.hasEndReferenceImage, false); assert.equal(request.params.hasVisualReferenceImages, false); }
    assert.equal(f.submits.length, 0); assert.equal(f.acceptance.props.disabled, true); assert.equal(f.acceptance.props.checked, false); assert.equal(f.confirmButton.props.disabled, true);
    await f.confirm(); assert.equal(f.submits.length, 0, 'A loading estimate must not submit even if the handler is invoked');
    await f.resolve(); assert.equal(f.acceptance.props.disabled, false); assert.equal(f.acceptance.props.checked, false); assert.equal(f.confirmButton.props.disabled, true);
    await f.accept(); assert.equal(f.confirmButton.props.disabled, false); assert.equal(f.submits.length, 0);
    await f.confirm(true); assert.equal(f.submits.length, 1, 'One explicit confirmation must submit exactly once');
    assert.equal(f.submits[0].visualInputMode, textOnly ? 'text-only' : 'standard');
    if (textOnly) assert.equal(f.submits[0].referenceImage, undefined);
    assert.equal(f.board.scenes[0].video.status, 'queued'); await f.close();
  }
  console.log('PASS approved-scene regeneration and text-only quotes, zero pre-confirm submits, loading guard and double-click protection');
  for (const change of ['draft', 'connection', 'worker', 'budget', 'credit']) {
    const f = await fixture(); await f.open('onRegenerate');
    await f.resolve(undefined, quote(change === 'budget' ? 6 : 2, change !== 'credit')); await f.accept();
    if (change === 'draft') await f.changeDraft(current => ({ ...current, title: 'changed after review' }));
    if (change === 'connection') await f.setConnection(false);
    if (change === 'worker') await f.blockWorker();
    await f.confirm(); assert.equal(f.submits.length, 0, `${change} must be rechecked when confirming`);
    assert(f.notices.some(item => item.type === 'info'), `${change} needs a visible explanation`);
    if (change === 'draft') assert.equal(f.approval, undefined);
    await f.close();
  }
  console.log('PASS confirmation-time draft, subscription, worker, per-scene budget and credit guards');
  {
    const f = await fixture(); await f.open('onRegenerate'); const old = f.estimates[0];
    await f.cancel(); assert.equal(old.params.signal.aborted, true); assert.equal(f.approval, undefined);
    await f.open('onGenerateWithoutVisualInputs'); const next = f.estimates.at(-1);
    await f.resolve(old, quote(0.01)); assert.equal(f.confirmButton.props.disabled, true, 'Cancelled quote cannot make the replacement action ready');
    await act(async () => next.reject(new Error('PRIVATE_PROVIDER_DETAIL')));
    assert(f.text.includes('이 장면의 예상 비용을 확인하지 못했습니다')); assert(!f.text.includes('PRIVATE_PROVIDER_DETAIL'));
    assert.equal(f.acceptance.props.disabled, true); assert.equal(f.confirmButton.props.disabled, true); await f.retryQuote();
    assert.equal(f.estimates.length, 3); assert.equal(f.acceptance.props.disabled, true); assert.equal(f.acceptance.props.checked, false);
    await f.resolve(); assert.equal(f.acceptance.props.disabled, false); assert.equal(f.acceptance.props.checked, false); assert.equal(f.confirmButton.props.disabled, true);
    await f.accept(); assert.equal(f.confirmButton.props.disabled, false);
    await f.cancel(); assert.equal(f.submits.length, 0); await f.close();
    console.log('PASS cancellation abort, late quote isolation, sanitized quote failure and explicit retry');
  }
  {
    const f = await fixture(); await f.open('onRegenerate'); await f.resolve(); await f.accept();
    assert.equal(f.acceptance.props.checked, true); assert.equal(f.confirmButton.props.disabled, false);
    await f.refreshReferenceInputs();
    assert.equal(f.estimates.length, 2, 'Changed reference inputs must fetch a fresh action quote');
    assert.equal(f.acceptance.props.disabled, true); assert.equal(f.acceptance.props.checked, false, 'Refreshing the quote must revoke prior consent');
    await f.resolve(undefined, quote(3));
    assert.equal(f.acceptance.props.disabled, false); assert.equal(f.acceptance.props.checked, false); assert.equal(f.confirmButton.props.disabled, true);
    await f.confirm(); assert.equal(f.submits.length, 0, 'A fresh quote needs fresh consent');
    await f.accept(); await f.confirm(); assert.equal(f.submits.length, 1); await f.close();
    console.log('PASS quote reload revokes prior consent and requires acceptance of the newly displayed amount');
  }
  await testFinalMerges();
  await testRegeneratedSceneOutputs();
  console.log('PASS storyboard video confirmation and final merge — real React StrictMode; mocked services and child views; zero external requests');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
