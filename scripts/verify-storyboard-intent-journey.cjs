/* Offline regression tests of the production journey, navigation and planning presets. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const cache = new Map();
function load(relativePath) {
  const filename = path.resolve(relativePath);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(output.diagnostics.length, 0, `${relativePath} must transpile.`);
  const localRequire = (id) => {
    if (id.startsWith('@/') || id.startsWith('.')) {
      const resolved = id.startsWith('@/')
        ? path.resolve('src', id.slice(2))
        : path.resolve(path.dirname(filename), id);
      return load(`${resolved}.ts`);
    }
    return require(id);
  };
  vm.runInNewContext(output.outputText, { module, exports: module.exports, require: localRequire, console }, { filename });
  return module.exports;
}

const { ImageStoryboardSchema } = load('src/schemas/imageStoryboard.ts');
const { buildStoryboardProductionJourney } = load('src/lib/storyboard-production-journey.ts');
const { getStoryboardNextAction, resolveStoryboardPosition } = load('src/lib/storyboard-workspace-navigation.ts');
const { getStoryboardPresetSettings, applyStoryboardPlanningPreset } = load('src/lib/storyboard-planning-presets.ts');
const { createStoryboardFinalAssemblyManifest, isStoryboardFinalCurrent } = load('src/lib/storyboard-workflow.ts');
const { resetStoryboardVideoProduction } = load('src/lib/storyboard-video-production.ts');
const { markStoryboardSceneVideoForReview, invalidateChangedStoryboardDependencies } = load('src/lib/storyboard-edit-invalidation.ts');
function evaluateComponentDeclaration(relativePath, componentName, declarationName, context) {
  const text = fs.readFileSync(relativePath, 'utf8');
  const source = ts.createSourceFile(relativePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === componentName);
  assert.ok(component?.body, `Find actual ${componentName} implementation.`);
  const declaration = component.body.statements.filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((node) => ts.isIdentifier(node.name) && node.name.text === declarationName);
  assert.ok(declaration?.initializer, `Find actual ${declarationName} implementation.`);
  const output = ts.transpileModule(`(${declaration.initializer.getText(source)})`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return vm.runInNewContext(output, context, { filename: relativePath });
}

function evaluateEditorPatchClick(field, context) {
  const filename = 'src/components/image-generator/StoryboardSceneProductionEditor.tsx';
  const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const matches = [];
  function patchesField(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'onPatchVideo'
      && node.arguments.some((argument) => ts.isObjectLiteralExpression(argument)
        && argument.properties.some((property) => property.name?.getText(source) === field))) return true;
    return Boolean(ts.forEachChild(node, (child) => patchesField(child) || undefined));
  }
  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.getText(source) === 'onClick'
      && node.initializer && ts.isJsxExpression(node.initializer)
      && node.initializer.expression && patchesField(node.initializer.expression)) {
      matches.push(node.initializer.expression);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(matches.length, 1, `Find the real ${field} editor click handler.`);
  const output = ts.transpileModule(`(${matches[0].getText(source)})`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return vm.runInNewContext(output, context, { filename });
}

function makeVideoEditingContext(storyboard) {
  const context = {
    storyboard, livePanelRef: { current: true }, useCallback: (callback) => callback,
    resetStoryboardVideoProduction, markStoryboardSceneVideoForReview,
    invalidateChangedStoryboardDependencies,
  };
  context.onStoryboardChange = (updater) => { context.storyboard = updater(context.storyboard); };
  for (const callback of ['onChange', 'updateSceneForVideo', 'patchSceneVideo']) {
    context[callback] = evaluateComponentDeclaration(
      'src/components/image-generator/StoryboardVideoProductionPanel.tsx',
      'StoryboardVideoProductionPanel', callback, context,
    );
  }
  return context;
}
let checks = 0;
const failures = [];
function test(name, action) {
  try { action(); checks += 1; }
  catch (error) { failures.push({ name, message: error.message }); }
}

function makeStoryboard() {
  return ImageStoryboardSchema.parse({
    title: 'Offline intent fixture', logline: 'Synthetic content', audience: 'General audience',
    topic: 'A short story', aspectRatio: '16:9', stylePreset: 'cinematic',
    artDirection: 'Soft light', characterContinuity: 'Same person',
    settingContinuity: 'Same room', colorAndLighting: 'Warm tones',
    scenes: [1, 2, 3].map((order) => ({
      id: `scene-${order}`, order, title: `Scene ${order}`, status: 'generated', duration: '5초',
      narrativeBeat: 'A small action', shotSize: 'medium', cameraDirection: 'Fixed camera',
      dialogueOrCaption: '', visualPrompt: 'A person in a room', imagePrompt: 'A person in a room',
      continuityAnchor: 'Same outfit', transition: 'Cut', negativePrompt: '',
      generatedImage: { id: `image-${order}`, url: `https://example.com/image-${order}.png`, generatedAt: 1 },
      approvedImageArtifactId: `image-${order}`, approvedVideoArtifactId: `clip-${order}`,
      video: {
        status: 'approved', motionPrompt: 'Slow camera movement', durationSeconds: 5,
        clipId: `clip-${order}`, artifactId: `clip-${order}`, approvedAt: 1,
        videoUrl: `https://example.com/clip-${order}.mp4`,
        jobId: `completed-job-${order}`, lastFrameUrl: `https://example.com/frame-${order}.png`,
      },
    })),
  });
}

const baseJourney = {
  sceneCount: 3, imageDesignReadyCount: 3, startFrameCount: 3, videoDesignReadyCount: 3,
  approvedSceneCount: 0, generatedVideoCount: 0, automationActive: false,
  automationCompletedCount: 0, automationCurrentSceneIndex: null, automationErrorMessage: null,
  automationProgress: 0, automationStatus: 'idle', budgetExceeded: false,
  canPauseAutomation: false, canOpenImageWorkspace: true, canResumeAutomation: false,
  canStartAutomation: true, finalMergeInFlight: false,
  firstMissingApprovalSceneId: 'scene-1', firstMissingImageSceneId: null,
  firstMissingVideoDesignSceneId: null, firstMissingVideoSceneId: 'scene-1',
  firstTransitionIssueSceneId: null, firstReviewableSceneId: null,
  hasCurrentFinalDelivery: false, hasFinalDelivery: false, isDownloading: false,
  isRecoveringAutomation: false, jobSubscriptionError: null, jobSubscriptionReady: true,
  nextQualityAction: null, pendingSceneCount: 3, pricingCheckPending: false,
  qualityMode: 'final', transitionCount: 2, transitionReadyCount: 2,
  unknownPricingBlocked: false, requestPending: false, reviewImageCount: 0,
};
const journey = (patch = {}) => buildStoryboardProductionJourney({ ...baseJourney, ...patch });

test('Existing current video takes go to review before a paid request', () => {
  const model = journey({ generatedVideoCount: 3, firstReviewableSceneId: 'scene-2' });
  assert.equal(model.primaryIntent, 'focus-video-review');
  assert.equal(model.primarySceneId, 'scene-2');
  assert.equal(model.primaryDisabled, false);
});

test('Review does not require regenerating earlier design material', () => {
  const model = journey({ generatedVideoCount: 2, firstReviewableSceneId: 'scene-2',
    imageDesignReadyCount: 1, startFrameCount: 1, videoDesignReadyCount: 1,
    firstMissingImageSceneId: 'scene-1', firstMissingVideoDesignSceneId: 'scene-1' });
  assert.equal(model.primaryIntent, 'focus-video-review');
  assert.equal(model.primarySceneId, 'scene-2');
});

test('Credit and model availability do not disable an existing video review', () => {
  const model = journey({ firstReviewableSceneId: 'scene-2', generatedVideoCount: 3,
    canStartAutomation: false, workerIssue: 'Offline fixture', workerStatusPending: true,
    creditIssue: 'No generation credit', budgetExceeded: true, unknownPricingBlocked: true });
  assert.equal(model.primaryIntent, 'focus-video-review');
  assert.equal(model.primaryDisabled, false);
});

test('First assembly uses existing approved clips even with incomplete design metadata', () => {
  const model = journey({ approvedSceneCount: 3, generatedVideoCount: 3, pendingSceneCount: 0,
    imageDesignReadyCount: 0, startFrameCount: 0, videoDesignReadyCount: 0,
    canStartAutomation: false, workerIssue: 'Generation unavailable' });
  assert.equal(model.primaryIntent, 'remerge-final');
  assert.equal(model.primaryDisabled, false);
});

test('An outdated final follows the same assembly path', () => {
  const model = journey({ approvedSceneCount: 3, generatedVideoCount: 3, pendingSceneCount: 0,
    hasFinalDelivery: true });
  assert.equal(model.primaryIntent, 'remerge-final');
  assert.equal(model.primaryDisabled, false);
});

test('A current final opens its download instead of another production run', () => {
  const model = journey({ approvedSceneCount: 3, generatedVideoCount: 3, pendingSceneCount: 0,
    hasFinalDelivery: true, hasCurrentFinalDelivery: true });
  assert.equal(model.primaryIntent, 'download-final');
  assert.equal(model.primaryDisabled, false);
});

test('Manual work awaiting completion disables concurrent primary mutations', () => {
  for (const patch of [{}, { firstReviewableSceneId: 'scene-2', generatedVideoCount: 2 },
    { approvedSceneCount: 3, generatedVideoCount: 3, pendingSceneCount: 0 }]) {
    assert.equal(journey({ ...patch, requestPending: true }).primaryDisabled, true);
  }
});

test('An image awaiting review returns to image review before new generation', () => {
  const model = journey({ reviewImageCount: 1, firstReviewableSceneId: null });
  assert.equal(model.primaryIntent, 'open-image-workspace');
});

test('A preserved old take with no reviewable candidate is not offered for approval', () => {
  const model = journey({ generatedVideoCount: 3, firstReviewableSceneId: null });
  assert.equal(model.primaryIntent, 'start-automation');
});

test('Manual job navigation follows the actual queued or rendering scene', () => {
  for (const status of ['queued', 'rendering']) {
    const board = makeStoryboard();
    board.videoProduction.automationCurrentSceneIndex = 0;
    board.scenes[2].video.status = status;
    const next = getStoryboardNextAction(board);
    assert.equal(next.label, '제작 상태 확인');
    assert.equal(next.sceneId, 'scene-3');
    assert.equal(resolveStoryboardPosition(board, 'edit', { mode: 'video', sceneId: 'scene-1' }).sceneId, 'scene-3', 'An old editor position must not hide the active manual job.');
  }
});

test('Automation navigation follows its active coordinator', () => {
  const board = makeStoryboard();
  Object.assign(board.videoProduction, { automationStatus: 'running', automationCurrentSceneIndex: 1 });
  board.scenes[1].video.status = 'rendering';
  assert.equal(getStoryboardNextAction(board).sceneId, 'scene-2');
});

test('Project-list navigation prioritizes a current review take over missing design metadata', () => {
  const board = makeStoryboard();
  board.scenes[0].generatedImage = null;
  board.scenes[0].video.lastFrameUrl = null;
  Object.assign(board.scenes[0], { narrativeBeat: '', cameraDirection: '' });
  board.scenes[0].video.motionPrompt = '';
  board.scenes[1].video.status = 'review';
  const next = getStoryboardNextAction(board);
  assert.equal(next.sceneId, 'scene-2');
  assert.equal(next.label, '영상 검수하기');
});

test('A review take whose image changed still leads to image verification', () => {
  const board = makeStoryboard();
  board.scenes[1].video.status = 'review';
  board.scenes[1].assetFreshness = 'review';
  const next = getStoryboardNextAction(board);
  assert.equal(next.sceneId, 'scene-2');
  assert.equal(next.mode, 'storyboard');
});

test('The approval control requires a usable clip ID as well as a video URL', () => {
  const scene = makeStoryboard().scenes[0];
  scene.video.status = 'review';
  const evaluate = () => evaluateComponentDeclaration(
    'src/components/image-generator/StoryboardSceneProductionEditor.tsx',
    'StoryboardSceneProductionEditor', 'showApprovalAsPrimary',
    { scene, hasPendingVideoChanges: false, sceneRecovery: null },
  );
  assert.equal(evaluate(), true);
  scene.video.clipId = null;
  assert.equal(evaluate(), false);
  scene.video.clipId = 'clip-1';
  scene.assetFreshness = 'review';
  assert.equal(evaluate(), false, 'Image changes require verification before video approval.');
});

test('The real approval callback also rejects an unusable clip', () => {
  const calls = [];
  const scene = makeStoryboard().scenes[0];
  scene.video.status = 'review';
  const approve = evaluateComponentDeclaration(
    'src/components/image-generator/StoryboardVideoProductionPanel.tsx',
    'StoryboardVideoProductionPanel', 'handleApproval', {
      useCallback: (callback) => callback,
      patchSceneVideo: (sceneId, patch) => calls.push({ sceneId, patch }),
      projectBusy: false, pendingRequestCountRef: { current: 0 },
      toast: { success() {}, info() {}, error() {} },
    },
  );
  scene.video.clipId = null;
  approve(scene);
  assert.equal(calls.length, 0);
  scene.video.clipId = 'clip-1';
  approve(scene);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].patch.status, 'approved');
  scene.assetFreshness = 'review';
  approve(scene);
  assert.equal(calls.length, 1, 'Image changes cannot be approved through a direct callback.');
});

for (const field of ['motionIntensity', 'audioMode']) {
  test(`Clicking the selected ${field} option preserves approval and the current final`, () => {
    const board = makeStoryboard();
    const scene = board.scenes[0];
    Object.assign(scene.video, { audioMode: 'ambient', generateAudio: true, audioApplied: true });
    Object.assign(board.videoProduction, {
      finalStatus: 'completed', finalFreshness: 'current', finalClipId: 'final-clip',
      finalArtifactId: 'final-artifact', finalVideoUrl: 'https://example.com/final.mp4',
      finalAssemblyManifest: createStoryboardFinalAssemblyManifest(board, board.scenes.map((item) => item.video.clipId), '720p'),
    });
    const context = makeVideoEditingContext(board);
    const handler = evaluateEditorPatchClick(field, {
      scene, preset: { value: scene.video.motionIntensity }, option: { value: scene.video.audioMode },
      onPatchVideo: (patch) => context.patchSceneVideo(scene.id, patch),
    });
    handler();
    assert.equal(context.storyboard, board, 'An unchanged editor click must preserve the complete storyboard identity.');
    assert.equal(context.storyboard.scenes[0].video.status, 'approved');
    assert.equal(context.storyboard.scenes[0].videoDesignRevision, scene.videoDesignRevision);
    assert.equal(context.storyboard.videoProduction.finalArtifactId, 'final-artifact');
    assert.equal(isStoryboardFinalCurrent(context.storyboard), true);
  });

  test(`Changing the ${field} option invalidates only its old generation approval`, () => {
    const board = makeStoryboard();
    const scene = board.scenes[0];
    Object.assign(scene.video, { audioMode: 'ambient', generateAudio: true, audioApplied: true });
    Object.assign(board.videoProduction, {
      finalStatus: 'completed', finalFreshness: 'current', finalClipId: 'final-clip',
      finalArtifactId: 'final-artifact', finalVideoUrl: 'https://example.com/final.mp4',
      finalAssemblyManifest: createStoryboardFinalAssemblyManifest(board, board.scenes.map((item) => item.video.clipId), '720p'),
    });
    const context = makeVideoEditingContext(board);
    const changedValue = field === 'motionIntensity' ? 'dynamic' : 'silent';
    const handler = evaluateEditorPatchClick(field, {
      scene,
      preset: { value: field === 'motionIntensity' ? changedValue : scene.video.motionIntensity },
      option: { value: field === 'audioMode' ? changedValue : scene.video.audioMode },
      onPatchVideo: (patch) => context.patchSceneVideo(scene.id, patch),
    });
    handler();
    const updated = context.storyboard.scenes[0];
    assert.equal(updated.video[field], changedValue);
    assert.equal(updated.video.status, 'brief');
    assert.equal(updated.video.jobId, null);
    assert.equal(updated.video.approvedAt, null);
    assert.equal(updated.approvedVideoArtifactId, null);
    assert.equal(updated.videoDesignRevision, scene.videoDesignRevision + 1);
    assert.equal(updated.video.videoUrl, scene.video.videoUrl);
    assert.equal(updated.video.clipId, scene.video.clipId);
    assert.equal(updated.generatedImage, scene.generatedImage);
    assert.equal(context.storyboard.scenes[1], board.scenes[1], 'An unrelated scene must retain its approval.');
    assert.equal(context.storyboard.videoProduction.finalVideoUrl, board.videoProduction.finalVideoUrl);
    assert.equal(context.storyboard.videoProduction.finalArtifactId, board.videoProduction.finalArtifactId);
    assert.equal(context.storyboard.videoProduction.finalFreshness, 'stale');
    assert.equal(isStoryboardFinalCurrent(context.storyboard), false);
    assert.equal(board.scenes[0].video.status, 'approved', 'Editing must not mutate the prior snapshot.');
  });
}

test('An unchanged planning preset returns the original storyboard', () => {
  const board = makeStoryboard();
  assert.equal(applyStoryboardPlanningPreset(board, getStoryboardPresetSettings(board)), board);
});

test('Audience-only metadata edits preserve approvals, jobs and current final', () => {
  const board = makeStoryboard();
  Object.assign(board.videoProduction, {
    finalStatus: 'completed', finalFreshness: 'current', finalVideoUrl: 'https://example.com/final.mp4',
    finalAssemblyManifest: createStoryboardFinalAssemblyManifest(board, board.scenes.map((scene) => scene.video.clipId), '720p'),
  });
  assert.equal(isStoryboardFinalCurrent(board), true);
  const updated = applyStoryboardPlanningPreset(board, { ...getStoryboardPresetSettings(board), audience: 'Returning customers' });
  assert.equal(updated.audience, 'Returning customers');
  assert.equal(updated.scenes, board.scenes);
  assert.equal(updated.videoProduction, board.videoProduction);
  assert.equal(isStoryboardFinalCurrent(updated), true);
});

test('Visual preset edits detach obsolete jobs and retain old media for comparison', () => {
  const board = makeStoryboard();
  board.videoProduction.finalVideoUrl = 'https://example.com/final.mp4';
  const updated = applyStoryboardPlanningPreset(board, { ...getStoryboardPresetSettings(board), stylePreset: 'watercolor' });
  assert.equal(updated.stylePreset, 'watercolor');
  for (let index = 0; index < board.scenes.length; index += 1) {
    const previous = board.scenes[index];
    const scene = updated.scenes[index];
    assert.equal(scene.video.status, 'brief');
    assert.equal(scene.video.jobId, null);
    assert.equal(scene.video.approvedAt, null);
    assert.equal(scene.approvedVideoArtifactId, null);
    assert.equal(scene.assetFreshness, 'review');
    assert.equal(scene.video.videoUrl, previous.video.videoUrl);
    assert.equal(scene.video.clipId, previous.video.clipId);
    assert.equal(scene.generatedImage, previous.generatedImage);
    assert.ok(scene.videoDesignRevision > previous.videoDesignRevision);
  }
  assert.equal(updated.videoProduction.finalVideoUrl, board.videoProduction.finalVideoUrl);
  assert.equal(updated.videoProduction.finalFreshness, 'stale');
  assert.equal(board.scenes[0].video.status, 'approved', 'Preset application must not mutate its source.');
});

test('A preset cannot rewrite design while manual generation is running', () => {
  const board = makeStoryboard();
  board.scenes[1].video.status = 'rendering';
  assert.equal(applyStoryboardPlanningPreset(board, { ...getStoryboardPresetSettings(board), stylePreset: 'watercolor' }), board);
});

test('The actual primary action reviews existing takes and assembles approved clips without starting generation', () => {
  for (const intent of ['focus-video-review', 'remerge-final', 'start-automation']) {
    const calls = [];
    const context = {
      useCallback: callback => callback,
      productionJourney: { primaryIntent: intent, primarySceneId: 'scene-2', primaryDisabled: false },
      pendingRequestCountRef: { current: 0 }, pendingSceneCount: 0,
      focusVideoScene: id => calls.push(`review:${id}`),
      handleFinalMerge: () => calls.push('merge'), handleFinalDownload() {}, handleResumeAutomation() {},
      onOpenImageWorkspace() {}, requestVideoAction: () => calls.push('provider-confirmation'),
      projectedCost: 0, estimatesByProfile: new Map(), reusableSceneIds: new Set(['scene-1', 'scene-2']),
    };
    const primary = evaluateComponentDeclaration(
      'src/components/image-generator/StoryboardVideoProductionPanel.tsx',
      'StoryboardVideoProductionPanel', 'handleJourneyPrimaryAction', context,
    );
    primary();
    assert.deepEqual(calls, [intent === 'focus-video-review' ? 'review:scene-2' : 'merge']);
    calls.length = 0;
    context.pendingRequestCountRef.current = 1;
    primary();
    assert.equal(calls.length, 0, 'A rapid second click cannot submit work while another request is pending.');
  }
});

if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure.name}\n${failure.message}`);
  console.error(`Storyboard intent journey: ${checks} passed, ${failures.length} failed.`);
  process.exitCode = 1;
} else {
  console.log(`Storyboard intent journey verified: ${checks} offline behavioral checks.`);
}
