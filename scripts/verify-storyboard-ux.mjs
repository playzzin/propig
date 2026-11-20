import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const runtime = process.env.STORYBOARD_TEST_RUNTIME
  ? createRequire(path.resolve(process.env.STORYBOARD_TEST_RUNTIME, 'package.json')) : require;
const React = runtime('react');
const { act, create } = runtime('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const modules = new Map();
let href = 'http://localhost/admin/storyboard';
const windowMock = {
  location: { get search() { return new URL(href).search; }, get href() { return href; } },
  history: { state: {}, replaceState: (_, __, url) => { href = String(url); } },
  addEventListener() {}, removeEventListener() {},
};
const mocks = {
  react: React,
  'react/jsx-runtime': runtime('react/jsx-runtime'),
  './StoryboardWorkspace.styles': new Proxy({}, { get: (_, name) => name === '__esModule' ? true : String(name) }),
};
function load(relative) {
  const filename = path.resolve(relative);
  if (modules.has(filename)) return modules.get(filename);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} };
  const localRequire = (id) => {
    if (mocks[id]) return mocks[id];
    if (id.startsWith('@/') || id.startsWith('.')) {
      const base = id.startsWith('@/') ? path.resolve('src', id.slice(2)) : path.resolve(path.dirname(filename), id);
      return load(fs.existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`);
    }
    return require(id);
  };
  vm.runInNewContext(output, { module, exports: module.exports, require: localRequire, console, URL, URLSearchParams, window: windowMock, setTimeout, clearTimeout }, { filename });
  modules.set(filename, module.exports);
  return module.exports;
}

const { getStoryboardNextAction, resolveStoryboardPosition } = load('src/lib/storyboard-workspace-navigation.ts');
const { buildStoryboardProductionJourney } = load('src/lib/storyboard-production-journey.ts');
const { applyStoryboardSceneBatch } = load('src/lib/storyboard-scene-batch.ts');
const { getStoryboardVideoConfirmationIssue } = load('src/lib/storyboard-video-confirmation.ts');
const scene = (id) => ({ id, order: Number(id) + 1, narrativeBeat: '', cameraDirection: '', assetFreshness: 'current', generatedImage: { url: 'https://example.com/image.png' }, video: { motionPrompt: 'slow pan', status: 'brief', clipId: null, videoUrl: null } });
const project = (id = 'p') => ({ id, title: `프로젝트 ${id}`, topic: '검증 주제', aspectRatio: '16:9', scenes: [scene('0'), scene('1')], archivedAt: null, videoProduction: { automationStatus: 'idle', finalStatus: 'idle', finalFreshness: 'stale' } });
let board = project();
assert.equal(getStoryboardNextAction(board).mode, 'video');
assert.equal(getStoryboardNextAction(board).label, '영상 제작 계속하기');
board.scenes[1].video.motionPrompt = '';
assert.equal(getStoryboardNextAction(board).sceneId, '1');
assert.equal(getStoryboardNextAction(board).label, '움직임 설정 계속하기');
assert.equal(resolveStoryboardPosition(board, 'edit', { mode: 'video', sceneId: 'deleted' }).sceneId, '1');
assert.equal(resolveStoryboardPosition(board, 'edit', { mode: 'video', sceneId: '0' }).sceneId, '0');
board.scenes[1].video.status = 'failed';
assert.equal(resolveStoryboardPosition(board, 'recovery', { mode: 'video', sceneId: '0' }).sceneId, '1');
board = project();
board.scenes.forEach((item) => Object.assign(item.video, { status: 'approved', clipId: 'clip', videoUrl: 'https://example.com/video.mp4', motionPrompt: '' }));
board.videoProduction.lastSuccessfulFinalVideoUrl = 'https://example.com/final.mp4';
assert.equal(getStoryboardNextAction(board).label, '완성본 갱신하기', '승인 영상을 기획 재입력으로 돌리지 않는다');
board = project(); board.scenes = [];
assert.equal(getStoryboardNextAction(board).mode, 'storyboard');

const defaults = {
  sceneCount: 3, imageDesignReadyCount: 3, startFrameCount: 3, videoDesignReadyCount: 3,
  approvedSceneCount: 0, generatedVideoCount: 0, automationActive: false,
  automationCompletedCount: 0, automationCurrentSceneIndex: null, automationErrorMessage: null,
  automationProgress: 0, automationStatus: 'idle', budgetExceeded: false,
  canPauseAutomation: false, canOpenImageWorkspace: true, canResumeAutomation: false,
  canStartAutomation: true, finalMergeInFlight: false, firstMissingVideoDesignSceneId: null,
  hasCurrentFinalDelivery: false, hasFinalDelivery: false, isDownloading: false,
  isRecoveringAutomation: false, jobSubscriptionError: null, jobSubscriptionReady: true,
  nextQualityAction: null, pendingSceneCount: 3, pricingCheckPending: false,
  qualityMode: 'proof', transitionCount: 2, transitionReadyCount: 2, unknownPricingBlocked: false,
};
for (const status of ['idle', 'failed', 'paused']) {
  for (const patch of [{ workerIssue: '서버 장애' }, { workerStatusPending: true }, { jobSubscriptionError: '연결 끊김', jobSubscriptionReady: false }]) {
    let model = buildStoryboardProductionJourney({ ...defaults, ...patch, automationStatus: status, canResumeAutomation: status === 'paused', startFrameCount: 1 });
    assert.equal(model.primaryIntent, 'open-image-workspace');
    assert.equal(model.primaryDisabled, false, '영상 상태 확인 실패가 이미지 편집을 막으면 안 된다');
    assert.equal(model.primaryLabel, '비어 있는 이미지 만들기');
    model = buildStoryboardProductionJourney({ ...defaults, ...patch, automationStatus: status, videoDesignReadyCount: 1, firstMissingVideoDesignSceneId: '1' });
    assert.equal(model.primaryIntent, 'focus-video-design');
    assert.equal(model.primaryDisabled, false, '영상 서버 장애 중 움직임 편집은 가능해야 한다');
    assert.equal(model.primaryLabel, '움직임 설계 보완하기');
  }
}
assert.equal(buildStoryboardProductionJourney(defaults).preparationDescription, '준비 3/3단계');
assert.match(buildStoryboardProductionJourney({ ...defaults, automationStatus: 'failed' }).primaryLabel, /제작 내용 확인/);
assert.equal(buildStoryboardProductionJourney({ ...defaults, canStartAutomation: false, workerIssue: '서버 장애' }).primaryDisabled, true);

const confirmation = { scope: 'project', pendingSceneCount: 6, busy: false, workerBlocked: false,
  subscriptionReady: true, pricingPending: false, budgetExceeded: true, creditBlocked: true,
  unknownPricingBlocked: false, sceneEstimate: { estimatedCostUsd: 2, canSubmit: true }, maxBudgetUsd: 5, allowUnknownPricing: false };
assert.match(getStoryboardVideoConfirmationIssue(confirmation), /전체.*예산/);
assert.equal(getStoryboardVideoConfirmationIssue({ ...confirmation, scope: 'scene' }), null, '개별 $2 생성에 전체 $12 계획의 예산/잔액 차단을 적용하지 않는다');
assert.match(getStoryboardVideoConfirmationIssue({ ...confirmation, scope: 'scene', sceneEstimate: { estimatedCostUsd: 6 } }), /선택한 장면.*예산/);
assert.match(getStoryboardVideoConfirmationIssue({ ...confirmation, scope: 'scene', sceneEstimate: { estimatedCostUsd: 2, canSubmit: false } }), /제작 조건/);
assert.match(getStoryboardVideoConfirmationIssue({ ...confirmation, scope: 'scene', sceneEstimate: null }), /가격이 확정되지/);
assert.equal(getStoryboardVideoConfirmationIssue({ ...confirmation, scope: 'scene', sceneEstimate: null, allowUnknownPricing: true }), null);
assert.match(getStoryboardVideoConfirmationIssue({ ...confirmation, scope: 'scene', subscriptionReady: false }), /연결/);
assert.match(getStoryboardVideoConfirmationIssue({ ...confirmation, scope: 'scene', workerBlocked: true }), /서버/);
assert.equal(getStoryboardVideoConfirmationIssue({ ...confirmation, pendingSceneCount: 0, workerBlocked: true }), null, '승인 영상 조립을 생성 모델의 상태로 차단하지 않는다');

board = project();
board.scenes.forEach((item) => { item.videoDesignRevision = 1; Object.assign(item.video, { durationSeconds: 6, motionIntensity: 'balanced', jobId: null }); });
board.scenes.push({ ...scene('2'), videoDesignRevision: 4, video: { ...scene('2').video, status: 'approved', videoUrl: 'https://example.com/approved.mp4', clipId: 'keep' } });
let batch = applyStoryboardSceneBatch(board, ['0', '2', 'deleted'], { durationSeconds: 10, motionIntensity: 'subtle' });
assert.equal(batch.scenes[0].video.durationSeconds, 10);
assert.equal(batch.scenes[0].videoDesignRevision, 2);
assert.equal(batch.scenes[1], board.scenes[1], '선택하지 않은 장면 유지');
assert.equal(batch.scenes[2], board.scenes[2], '승인 결과와 클립 보존');
assert.equal(applyStoryboardSceneBatch(board, ['0'], { durationSeconds: NaN }), board);
assert.equal(applyStoryboardSceneBatch(board, ['0'], { durationSeconds: 99 }), board);
assert.equal(applyStoryboardSceneBatch(board, ['0'], { durationSeconds: 6 }), board, '같은 값은 새 revision을 만들지 않는다');
board.scenes[0].video.jobId = 'pending-request';
assert.equal(applyStoryboardSceneBatch(board, ['0'], { durationSeconds: 10 }), board, '기존 요청 기록 보존');
board.videoProduction.automationStatus = 'running';
assert.equal(applyStoryboardSceneBatch(board, ['1'], { durationSeconds: 10 }), board, '진행 중인 제작 보호');

// Mount the real dashboard; style wrappers and browser location are the only UI mocks.
const Dashboard = load('src/components/image-generator/StoryboardProjectDashboard.tsx').default;
const session = { current: { search: '', page: 1, scrollTop: 0, focusedProjectId: null } };
const props = { sessionRef: session, get initialSession() { return { ...session.current }; }, storyboards: Array.from({ length: 25 }, (_, i) => project(String(i))), isLoading: false, loadError: null, onCreate() {}, onOpen() {}, onRetry() {} };
let renderer;
await act(async () => { renderer = create(React.createElement(Dashboard, props)); });
await act(async () => renderer.root.findByProps({ 'aria-label': '프로젝트 검색' }).props.onChange({ target: { value: '프로젝트' } }));
await act(async () => renderer.root.findByProps({ 'aria-label': '다음 프로젝트 페이지' }).props.onClick());
assert.equal(session.current.page, 2);
assert.equal(session.current.search, '프로젝트');
await act(async () => renderer.unmount());
await act(async () => { renderer = create(React.createElement(Dashboard, props)); });
assert.equal(renderer.root.findByProps({ 'aria-label': '프로젝트 검색' }).props.value, '프로젝트');
assert.equal(renderer.root.findByProps({ 'aria-label': '이전 프로젝트 페이지' }).props.disabled, false);
await act(async () => renderer.update(React.createElement(Dashboard, { ...props, storyboards: [project()] })));
assert.equal(renderer.root.findAllByType('ProjectOpenButton').length, 1, '목록이 줄어들면 유효 페이지로 보정한다');
await act(async () => renderer.root.findAllByType('button').find((node) => node.children.includes('확인 필요')).props.onClick());
assert.equal(session.current.filter, 'attention');
await act(async () => renderer.unmount());
href = 'http://localhost/admin/storyboard';
await act(async () => { renderer = create(React.createElement(Dashboard, props)); });
assert.equal(renderer.root.findAllByType('button').find((node) => node.children.includes('확인 필요')).props['aria-pressed'], true, '편집기 URL 정규화가 저장된 목록 필터를 덮지 않는다');
await act(async () => renderer.unmount());
const newAccountSession = { current: { search: '', page: 1, scrollTop: 0, focusedProjectId: null } };
await act(async () => { renderer = create(React.createElement(Dashboard, { ...props, sessionRef: newAccountSession, initialSession: newAccountSession.current })); });
assert.equal(renderer.root.findByProps({ 'aria-label': '프로젝트 검색' }).props.value, '');
await act(async () => renderer.unmount());
console.log('PASS: project navigation, 18 recovery/edit combinations, dashboard context, scoped confirmation cost gates, safe batch editing and output preservation. Synthetic data only.');
