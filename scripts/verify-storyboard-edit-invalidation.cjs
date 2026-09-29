/* Executes the real edit dependency helpers and Workspace callbacks in memory.
 * All provider, persistence, and UI effects are mocked. No files or user data
 * are written. PROPIG_TEST_RUNTIME may point at an isolated Linux runtime.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const repo = path.resolve(__dirname, '..');
const runtime = createRequire(path.join(process.env.PROPIG_TEST_RUNTIME || repo, 'package.json'));
const ts = runtime('typescript');
const modules = new Map();
const plain = value => JSON.parse(JSON.stringify(value));

function compile(source, filename = 'in-memory.ts') {
  const result = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    reportDiagnostics: true,
    fileName: filename,
  });
  assert.equal(result.diagnostics.length, 0, `Transpile diagnostics: ${filename}`);
  return result.outputText;
}

function load(filename) {
  const full = path.resolve(repo, filename);
  if (modules.has(full)) return modules.get(full).exports;
  const module = { exports: {} };
  modules.set(full, module);
  const localRequire = id => {
    if (id.startsWith('@/') || id.startsWith('.')) {
      const base = id.startsWith('@/') ? path.join(repo, 'src', id.slice(2)) : path.resolve(path.dirname(full), id);
      const resolved = [base, `${base}.ts`, `${base}.tsx`].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      assert(resolved, `Unresolved import ${id}`);
      return load(resolved);
    }
    return runtime(id);
  };
  vm.runInThisContext(`(function(require, module, exports) {\n${compile(fs.readFileSync(full, 'utf8'), full)}\n})`, { filename: full })(localRequire, module, module.exports);
  return module.exports;
}

const schema = load('src/schemas/imageStoryboard.ts');
const reference = load('src/types/imageReference.ts');
const domain = load('src/lib/storyboard-edit-invalidation.ts');
const workflow = load('src/lib/storyboard-workflow.ts');
const production = load('src/lib/storyboard-video-production.ts');

function makeScene(id, order) {
  return {
    id, order, title: `장면 ${id}`, status: 'generated', duration: '6초', narrativeBeat: '제품 소개', shotSize: '미디엄 샷',
    cameraDirection: '느린 전진', dialogueOrCaption: '', visualPrompt: '동일 제품', imagePrompt: '동일 제품과 조명',
    continuityAnchor: '', transition: '', negativePrompt: '', assetFreshness: 'current', staleReason: null,
    imageDesignRevision: 1, videoDesignRevision: 1, approvedImageArtifactId: `image-${id}`, approvedVideoArtifactId: `clip-${id}`,
    generatedImage: { id: `image-${id}`, url: `https://example.invalid/${id}.png`, generatedAt: 1, storagePath: null },
    video: { ...schema.createStoryboardVideoScene(), status: 'approved', motionPrompt: '느린 전진', clipId: `clip-${id}`,
      artifactId: `clip-${id}`, jobId: `job-${id}`, videoUrl: `https://example.invalid/${id}.mp4`,
      lastFrameUrl: `https://example.invalid/${id}-last.png`, approvedAt: 1, firstFrameApplied: true, endFrameApplied: order === 1 },
  };
}

function makeBoard() {
  const board = {
    schemaVersion: 2, revision: 1, archivedAt: null, workflowStage: 'completed', cleanupStatus: 'idle', cleanupErrorMessage: null,
    productionRecordSignature: '', topic: '테스트 주제', title: '테스트 프로젝트', logline: '', audience: '', format: 'brand-film', plannedSceneCount: 2,
    aspectRatio: '16:9', stylePreset: 'cinematic', artDirection: '', characterContinuity: '', settingContinuity: '', colorAndLighting: '',
    usePreviousSceneAsReference: false, referenceAssets: [], reclaimableStorageAssets: [], transitionLinks: [],
    videoProduction: { ...schema.createStoryboardVideoProduction(), finalStatus: 'completed', finalFreshness: 'current',
      finalVideoUrl: 'https://example.invalid/final.mp4', finalClipId: 'final-clip', finalArtifactId: 'final-clip' },
    scenes: [makeScene('A', 1), makeScene('B', 2)],
  };
  board.videoProduction.finalAssemblyManifest = workflow.createStoryboardFinalAssemblyManifest(board, ['clip-A', 'clip-B'], '720p');
  return board;
}

function assertInvalidated(scene, old, label) {
  assert.notEqual(scene.video.status, 'approved', `${label}: old output needs review`);
  assert.equal(scene.video.approvedAt, null, `${label}: clear approval time`);
  assert.equal(scene.approvedVideoArtifactId, null, `${label}: clear approved artifact`);
  assert.equal(scene.video.jobId, null, `${label}: detach completed job so it cannot overwrite edits`);
  assert(scene.videoDesignRevision > old.videoDesignRevision, `${label}: advance video design revision`);
  for (const key of ['clipId', 'videoUrl', 'artifactId']) assert.equal(scene.video[key], old.video[key], `${label}: preserve ${key}`);
}

function testDependencies() {
  const board = makeBoard(), original = plain(board);
  assert.equal(workflow.isStoryboardFinalCurrent(board), true);
  const marked = domain.markStoryboardSceneVideoForReview(board.scenes[0]);
  assertInvalidated(marked, board.scenes[0], 'Direct invalidation');
  assert.equal(marked.video.status, 'brief', 'Existing media must expose pending video edits');
  assert.equal(marked.generatedImage, board.scenes[0].generatedImage, 'Video edit preserves its image');

  const nextImage = { ...board, scenes: board.scenes.map((scene, i) => i === 1 ? {
    ...scene, generatedImage: { ...scene.generatedImage, id: 'new-B', url: 'https://example.invalid/new-B.png' },
  } : scene) };
  const changed = domain.invalidateChangedStoryboardDependencies(board, nextImage);
  assertInvalidated(changed.scenes[0], board.scenes[0], 'Used next-scene end frame changed');
  assert.equal(changed.videoProduction.finalVideoUrl, board.videoProduction.finalVideoUrl);
  assert.equal(workflow.isStoryboardFinalCurrent(changed), false);
  assert.equal(production.getOrderedStoryboardClipIds(changed.scenes), null);

  const noEndFrame = { ...board, scenes: board.scenes.map((scene, i) => i === 0 ? {
    ...scene, video: { ...scene.video, useNextSceneAsEndFrame: false, endFrameApplied: false },
  } : scene) };
  const independent = domain.invalidateChangedStoryboardDependencies(noEndFrame, {
    ...noEndFrame, scenes: [noEndFrame.scenes[0], nextImage.scenes[1]],
  });
  assert.equal(independent.scenes[0].video.status, 'approved', 'Unrelated video must stay reusable');
  assert.equal(independent.scenes[0].videoDesignRevision, board.scenes[0].videoDesignRevision);

  const reordered = domain.invalidateChangedStoryboardDependencies(board, {
    ...board, scenes: [board.scenes[1], board.scenes[0]].map((scene, i) => ({ ...scene, order: i + 1 })),
  });
  assertInvalidated(reordered.scenes.find(scene => scene.id === 'A'), board.scenes[0], 'Reorder changes the used destination');
  const removed = domain.invalidateChangedStoryboardDependencies(board, { ...board, scenes: [board.scenes[0]] });
  assertInvalidated(removed.scenes[0], board.scenes[0], 'Deleting the used destination');
  const changedPreviousFrame = domain.invalidateChangedStoryboardDependencies(board, {
    ...board, scenes: [{ ...board.scenes[0], video: { ...board.scenes[0].video, lastFrameUrl: 'https://example.invalid/new-last.png' } }, board.scenes[1]],
  });
  assertInvalidated(changedPreviousFrame.scenes[1], board.scenes[1], 'Previous video continuity frame changed');
  const voiceBoard = { ...board, videoProduction: { ...board.videoProduction, voiceProfiles: [{
    id: 'voice-A', characterName: '화자', voiceDescription: '기존 목소리', speakingStyle: '자연스러운 말투',
  }] }, scenes: board.scenes.map((scene, i) => i === 0 ? { ...scene, video: { ...scene.video, audioMode: 'dialogue', voiceProfileId: null } } : scene) };
  const voiceEdited = domain.invalidateChangedStoryboardDependencies(voiceBoard, {
    ...voiceBoard, videoProduction: { ...voiceBoard.videoProduction, voiceProfiles: [{ ...voiceBoard.videoProduction.voiceProfiles[0], voiceDescription: '수정한 목소리' }] },
  });
  assertInvalidated(voiceEdited.scenes[0], voiceBoard.scenes[0], 'Automatically selected sole voice profile changed');
  assert.equal(voiceEdited.scenes[1].video.status, 'approved', 'Silent scene must not be invalidated by voice edits');
  assert.equal(workflow.isStoryboardFinalCurrent(voiceEdited), false);
  for (const automationStatus of ['preparing', 'running', 'pausing', 'merging']) {
    const running = { ...board, videoProduction: { ...board.videoProduction,
      automationRunId: 'same-production-run', automationStatus, automationCompletedSceneIds: ['A', 'B'],
      automationCurrentSceneIndex: 0, automationStartedAt: 100, automationUpdatedAt: 200,
    }, scenes: [{ ...board.scenes[0], video: { ...board.scenes[0].video, status: 'rendering' } }, board.scenes[1]] };
    const completedFirstScene = { ...running, scenes: [{ ...running.scenes[0], video: {
      ...running.scenes[0].video, status: 'approved', lastFrameUrl: 'https://example.invalid/completed-run-last.png',
    } }, running.scenes[1]] };
    const continued = domain.invalidateChangedStoryboardDependencies(running, completedFirstScene);
    assertInvalidated(continued.scenes[1], running.scenes[1], `${automationStatus}: downstream continuity now needs regeneration`);
    for (const key of ['automationRunId', 'automationStartedAt', 'automationUpdatedAt']) {
      assert.equal(continued.videoProduction[key], running.videoProduction[key], `Completion during ${automationStatus} preserves ${key}`);
    }
    assert.equal(continued.videoProduction.automationStatus, 'paused', 'Previously approved dependent scene requires new cost confirmation');
    assert.equal(continued.videoProduction.automationCurrentSceneIndex, 1);
    assert.match(continued.videoProduction.automationErrorMessage, /추가 제작 범위와 비용/);
    const repeated = domain.invalidateChangedStoryboardDependencies(running, continued);
    assert.equal(repeated.videoProduction.automationStatus, 'paused', 'Nested Panel and Workspace handling preserves the paused run');
    assert.equal(repeated.videoProduction.automationRunId, running.videoProduction.automationRunId);
    assert.deepEqual(plain(continued.videoProduction.automationCompletedSceneIds), ['A'], 'Dependent stale video is removed from completed IDs');
    assert.equal(continued.videoProduction.finalFreshness, 'stale');
    assert.equal(continued.videoProduction.finalVideoUrl, board.videoProduction.finalVideoUrl);
  }
  const metadata = { ...board, title: '프로젝트 이름만 수정' };
  const renamed = domain.invalidateChangedStoryboardDependencies(board, metadata);
  assert.equal(renamed.scenes, board.scenes, 'Project renaming preserves clips');
  assert.equal(workflow.isStoryboardFinalCurrent(renamed), true, 'Metadata edit keeps the final current');
  assert.equal(domain.invalidateChangedStoryboardDependencies(board, board), board, 'Identical input is a no-op');
  const unapproved = { ...board, scenes: board.scenes.map((scene, i) => i === 0 ? {
    ...scene, video: { ...scene.video, status: 'brief' },
  } : scene) };
  assert.equal(workflow.isStoryboardFinalCurrent(unapproved), false, 'Pending edits cannot retain a current final');
  assert.deepEqual(plain(board), original, 'Dependency detection must not mutate its input');
  console.log('PASS dependency changes: continuity frames, reorder, remove, automatic voice, unrelated clips, metadata and final approval gate');
}

const workspacePath = 'src/components/image-generator/StoryboardWorkspace.tsx';
const workspaceSource = ts.createSourceFile(workspacePath, fs.readFileSync(path.join(repo, workspacePath), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function findNode(predicate) {
  let found;
  function visit(node) { if (found) return; if (predicate(node)) { found = node; return; } ts.forEachChild(node, visit); }
  visit(workspaceSource);
  assert(found, 'Expected actual Workspace node was not found');
  return found;
}

function expression(expressionSource, context) {
  vm.runInContext(compile(`module.exports = (${expressionSource});`), context);
  return context.module.exports;
}

function getCallback(name, context) {
  const node = findNode(node => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name);
  const initializer = node.initializer;
  const fn = ts.isCallExpression(initializer) && initializer.expression.getText(workspaceSource) === 'useCallback' ? initializer.arguments[0] : initializer;
  return expression(fn.getText(workspaceSource), context);
}

function editHarness(board) {
  const notices = [], generationCalls = [], cleanupCalls = [], generatingEffects = [], bulkEffects = [];
  let generate = async () => ({ id: 'new-image', url: 'https://example.invalid/new-image.png', storagePath: null });
  const ref = { current: board };
  const context = vm.createContext({
    ...schema, ...reference, ...domain, ...production, module: { exports: {} }, console,
    draftRef: ref, activeId: 'fixture-project', activeIdRef: { current: 'fixture-project' },
    deletingProjectIdRef: { current: null }, isMountedRef: { current: true },
    imageGenerationRequestRef: { current: 0 }, imageGenerationPendingRef: { current: false },
    videoRequestPendingRef: { current: false },
    historyPastRef: { current: [] }, historyFutureRef: { current: [] }, isDirtyRef: { current: false }, revisionRef: { current: 0 },
    setHistoryState() {}, setIsDirty() {}, setDraft(value) { ref.current = value; },
    toast: Object.fromEntries(['success', 'error', 'info', 'warning'].map(type => [type, (...args) => notices.push({ type, args })])),
    projectReferenceAssets: board.referenceAssets, draft: board,
    isGenerating: false, isBulkGenerating: false, isPlanning: false, redesigningSceneId: null,
    setGeneratingSceneId(id) { generatingEffects.push(id); }, setIsBulkGenerating(value) { bulkEffects.push(value); },
    setLoadError(message) { throw new Error(message); }, buildSceneReferences: () => [],
    onGenerateScene(payload) { generationCalls.push(payload); return generate(payload); },
    cleanupReplacedSceneImage: async (...args) => { cleanupCalls.push(args); },
  });
  // Keep real local helpers. Only effects and IO above are replaced.
  for (const name of ['ASPECT_RATIO_OPTIONS', 'MAX_GENERATION_PROMPT_LENGTH', 'DEFAULT_NEGATIVE_PROMPT']) {
    const node = findNode(node => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name);
    context[name] = expression(node.initializer.getText(workspaceSource), context);
  }
  const localHelpers = new Set(['queueReclaimableStorageAsset', 'reindexScenes', 'deriveSceneStatus', 'resetSceneVideo', 'copySceneVideoSettings', 'parseSceneDurationSeconds', 'sceneHasVideoResult', 'markSceneForReview', 'storyboardImageDesignSignature', 'applyGeneratedStoryboardImage', 'buildGenerationPayload', 'compactPrompt', 'buildNegativePrompt']);
  const declarations = workspaceSource.statements.filter(node => ts.isFunctionDeclaration(node) && localHelpers.has(node.name?.text));
  vm.runInContext(compile(declarations.map(node => node.getText(workspaceSource)).join('\n')), context);
  context.updateDraft = getCallback('updateDraft', context);
  context.updateScene = getCallback('updateScene', context);
  context.acceptExistingSceneResult = getCallback('acceptExistingSceneResult', context);
  return { context, notices, generationCalls, cleanupCalls, generatingEffects, bulkEffects,
    setGenerate(fn) { generate = fn; }, get board() { return ref.current; }, action: name => getCallback(name, context) };
}

async function testWorkspaceActions() {
  for (const reason of ['submitting', 'automation', 'scene-render', 'final-render']) {
    const board = makeBoard();
    if (reason === 'automation') Object.assign(board.videoProduction, { automationRunId: 'live-run', automationStatus: 'running' });
    if (reason === 'scene-render') board.scenes[0].video.status = 'rendering';
    if (reason === 'final-render') board.videoProduction.finalStatus = 'rendering';
    const f = editHarness(board);
    f.context.videoRequestPendingRef.current = reason === 'submitting';
    f.context.updateScene('A', { imagePrompt: '진행 중 변경되면 안 되는 설계' });
    assert.equal(f.board, board, `${reason}: user design edits must not change inputs of active video work`);
    assert.equal(f.context.historyPastRef.current.length, 0, 'Blocked edit does not create undo history');
    f.action('updateActiveStoryboard')(current => ({ ...current, videoProduction: { ...current.videoProduction, automationUpdatedAt: 12345 } }));
    assert.equal(f.board.videoProduction.automationUpdatedAt, 12345, `${reason}: live video coordinator updates remain allowed`);
  }
  {
    const board = makeBoard(), f = editHarness(board);
    await f.action('handleGenerateScene')(board.scenes[1]);
    assert.equal(f.board.scenes[1].generatedImage?.id, 'new-image');
    assert.notEqual(f.board.scenes[1].video.status, 'approved', 'Replacing an image invalidates its own existing video');
    assertInvalidated(f.board.scenes[0], board.scenes[0], 'Actual image callback invalidates the prior end-frame video');
    assert.equal(workflow.isStoryboardFinalCurrent(f.board), false);
  }
  {
    const board = makeBoard();
    board.referenceAssets = [{ id: 'photo', image: 'https://example.invalid/reference.png', role: 'style', name: '참조 사진', createdAt: 1, storagePath: null }];
    board.scenes[0].video.referenceAssetIds = ['photo'];
    const f = editHarness(board);
    f.action('handleRemoveProjectReference')('photo');
    assert.equal(f.board.referenceAssets.length, 0);
    assert.equal(f.board.scenes[0].video.referenceAssetIds.length, 0);
    assert.notEqual(f.board.scenes[0].video.status, 'approved', 'Removing reference must not overwrite review with original approval');
    assert.equal(f.board.scenes[0].video.approvedAt, null);
    assert.equal(production.getReusableStoryboardSceneIds(f.board.scenes).includes('A'), false);
  }
  {
    const board = makeBoard();
    board.scenes[0] = { ...board.scenes[0], assetFreshness: 'review', staleReason: '설계 변경', approvedVideoArtifactId: null, video: { ...board.scenes[0].video, status: 'brief', approvedAt: null, jobId: null } };
    const f = editHarness(board);
    f.context.activeScene = board.scenes[0];
    const button = findNode(node => ts.isJsxElement(node) && node.children.some(child => ts.isJsxText(child) && child.text.includes('현재 이미지 검토 완료')));
    const onClick = button.openingElement.attributes.properties.find(attr => ts.isJsxAttribute(attr) && attr.name.text === 'onClick');
    assert(onClick?.initializer && ts.isJsxExpression(onClick.initializer), 'Actual review button has an executable handler');
    expression(onClick.initializer.expression.getText(workspaceSource), f.context)();
    assert.equal(f.board.scenes[0].assetFreshness, 'current', 'Review button must actually complete image review');
    assert.equal(f.board.scenes[0].staleReason, null);
    assert.equal(f.board.scenes[0].imageDesignRevision, board.scenes[0].imageDesignRevision, 'Acceptance must not fabricate an image design edit');
    assert.equal(f.board.scenes[0].video, board.scenes[0].video, 'Image acceptance must preserve pending video edits and cannot approve an old clip');
    assert.equal(f.board.scenes[0].approvedVideoArtifactId, null);
    assert.equal(workflow.isStoryboardFinalCurrent(f.board), false);
  }
  {
    const board = makeBoard(), f = editHarness(board), approvals = [];
    f.context.activeScene = board.scenes[0];
    f.context.openPaidActionApproval = value => approvals.push(value);
    const button = findNode(node => ts.isJsxElement(node) && node.openingElement.tagName.getText(workspaceSource) === 'button' && node.children.some(child => ts.isJsxExpression(child) && child.expression?.getText(workspaceSource).includes('activeScene.generatedImage')));
    const onClick = button.openingElement.attributes.properties.find(attr => ts.isJsxAttribute(attr) && attr.name.text === 'onClick');
    expression(onClick.initializer.expression.getText(workspaceSource), f.context)();
    assert.equal(approvals.length, 1, 'Assistant image shortcut must open cost confirmation');
    assert.equal(approvals[0].sceneId, board.scenes[0].id);
    assert.equal(f.generationCalls.length, 0, 'No provider request before confirmation');
    f.action('updateStoryboardBrief')(current => ({ ...current, artDirection: current.artDirection }));
    assert.equal(f.board, board, 'Selecting an unchanged project setting preserves approvals and history');
  }
  for (const [action, usePreviousSceneAsReference] of [['handleGenerateScene', false], ['handleGenerateAllScenes', false], ['handleGenerateAllScenes', true]]) {
    const board = makeBoard();
    board.usePreviousSceneAsReference = usePreviousSceneAsReference;
    board.scenes = [board.scenes[0]];
    board.scenes[0] = { ...board.scenes[0], generatedImage: null, approvedImageArtifactId: null, approvedVideoArtifactId: null,
      video: { ...schema.createStoryboardVideoScene(), motionPrompt: '직접 정한 움직임', voiceProfileId: 'speaker-A', useNextSceneAsEndFrame: false,
        referenceAssetIds: ['photo-A'], durationSeconds: 10, motionIntensity: 'subtle', audioMode: 'dialogue', generateAudio: true } };
    const f = editHarness(board);
    await f.action(action)(board.scenes[0]);
    assert.equal(f.board.scenes[0].generatedImage?.id, 'new-image', 'Synthetic image completion applies to the real callback');
    for (const key of ['motionPrompt', 'voiceProfileId', 'useNextSceneAsEndFrame', 'referenceAssetIds', 'durationSeconds', 'motionIntensity', 'audioMode', 'generateAudio']) {
      assert.deepEqual(plain(f.board.scenes[0].video[key]), plain(board.scenes[0].video[key]), `Image completion preserves planned ${key}`);
    }
  }
  console.log('PASS actual Workspace active-video edit protection, coordinator updates, reference removal, review button and image settings preservation');
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function pendingBoard(count = 1) {
  const board = makeBoard();
  board.scenes = Array.from({ length: count }, (_, index) => ({
    ...makeScene(String.fromCharCode(65 + index), index + 1), status: 'ready', generatedImage: null,
    approvedImageArtifactId: null, approvedVideoArtifactId: null, video: schema.createStoryboardVideoScene(),
  }));
  board.videoProduction = schema.createStoryboardVideoProduction();
  return board;
}

async function testImageRequestRaces() {
  const output = { id: 'completed-image', url: 'https://example.invalid/completed-image.png', storagePath: null };
  for (const action of ['handleGenerateScene', 'handleGenerateAllScenes']) {
    const board = pendingBoard(), f = editHarness(board), gate = deferred();
    f.setGenerate(() => gate.promise);
    const generate = f.action(action);
    const pending = generate(board.scenes[0]);
    assert.equal(f.generationCalls.length, 1);
    assert(f.context.imageGenerationPendingRef.current);
    await generate(board.scenes[0]);
    assert.equal(f.generationCalls.length, 1, 'Repeated clicks while pending must not create another provider request');
    f.context.updateScene('A', { imagePrompt: '생성 중 변경한 새 설계' });
    gate.resolve(output); await pending;
    assert.equal(f.board.scenes[0].generatedImage?.id, output.id, 'Keep the completed image available for review');
    assert.equal(f.board.scenes[0].imagePrompt, '생성 중 변경한 새 설계');
    assert.equal(f.board.scenes[0].assetFreshness, 'review', `${action}: result for the old design must need review`);
    assert.equal(f.board.scenes[0].approvedImageArtifactId, null);
    assert(f.board.scenes[0].staleReason);
    assert.equal(f.context.imageGenerationPendingRef.current, false);
  }
  for (const invalidation of ['unmount', 'active-project', 'account-request']) {
    for (const action of ['single', 'sequential', 'parallel']) {
      const board = pendingBoard(action === 'single' ? 1 : 4);
      board.usePreviousSceneAsReference = action === 'sequential';
      const f = editHarness(board), gate = deferred();
      f.setGenerate(() => gate.promise);
      const pending = f.action(action === 'single' ? 'handleGenerateScene' : 'handleGenerateAllScenes')(board.scenes[0]);
      const initialCalls = action === 'parallel' ? 2 : 1;
      assert.equal(f.generationCalls.length, initialCalls);
      const replacement = pendingBoard(); replacement.title = '다음 계정 또는 프로젝트';
      f.context.draftRef.current = replacement;
      if (invalidation === 'unmount') f.context.isMountedRef.current = false;
      if (invalidation === 'active-project') f.context.activeIdRef.current = 'other-project';
      if (invalidation === 'account-request') f.context.imageGenerationRequestRef.current += 1;
      const noticeCount = f.notices.length, effectCount = f.generatingEffects.length, bulkEffectCount = f.bulkEffects.length;
      gate.resolve(output); await pending;
      assert.equal(f.board, replacement, `${invalidation}/${action}: stale completion must not alter the replacement draft`);
      assert.equal(f.generationCalls.length, initialCalls, `${invalidation}/${action}: stop remaining batch requests`);
      assert.equal(f.cleanupCalls.length, 0, 'Discarded completion cannot clean media from an earlier project');
      assert.equal(f.notices.length, noticeCount, 'Discarded completion cannot report success in the next workspace');
      assert.equal(f.generatingEffects.length, effectCount, 'Discarded completion cannot change the next loading state');
      assert.equal(f.bulkEffects.length, bulkEffectCount, 'Discarded batch cannot clear the next loading state');
    }
  }
  {
    const board = pendingBoard(3); board.usePreviousSceneAsReference = true;
    const f = editHarness(board), gate = deferred();
    let called = 0;
    f.setGenerate(() => ++called === 1 ? gate.promise : Promise.resolve({ ...output, id: 'third-image' }));
    const pending = f.action('handleGenerateAllScenes')();
    f.context.updateScene('B', { imagePrompt: '대기 중 바뀐 장면 설계' });
    gate.resolve(output); await pending;
    assert.equal(f.generationCalls.length, 2, 'Do not submit a queued scene using a superseded design');
    assert.equal(f.board.scenes[1].generatedImage, null);
    assert.equal(f.board.scenes[2].generatedImage?.id, 'third-image', 'Continue unrelated unchanged scenes');
  }
  console.log('PASS actual image request races: edited design review, duplicate clicks, unmount/project/account isolation and stopped/skipped batch requests');
}

async function run() {
  const failures = [];
  for (const test of [testDependencies, testWorkspaceActions, testImageRequestRaces]) {
    try { await test(); } catch (error) { failures.push(error); console.error(`${test.name}:`, error); }
  }
  assert.equal(failures.length, 0, 'All edit invalidation regression groups must pass');
  console.log('PASS storyboard edit invalidation — actual source, synthetic fixtures, no external requests or persistent writes');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
