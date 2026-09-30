/*
 * Execute production callbacks/effects with deferred service boundaries.
 * No Firebase, browser, paid provider, or local artifact writes are performed.
 * PROPIG_TEST_RUNTIME may point at an isolated TypeScript runtime directory.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { webcrypto } = require('node:crypto');

const runtimeRequire = process.env.PROPIG_TEST_RUNTIME
  ? createRequire(path.resolve(process.env.PROPIG_TEST_RUNTIME, 'package.json'))
  : require;
const ts = runtimeRequire('typescript');
const panelPath = 'src/components/image-generator/StoryboardVideoProductionPanel.tsx';
const panelText = fs.readFileSync(panelPath, 'utf8');
const source = ts.createSourceFile(panelPath, panelText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = source.statements.find((node) => ts.isFunctionDeclaration(node)
  && node.name?.text === 'StoryboardVideoProductionPanel');
assert(component?.body, 'The production panel must be available for lifecycle verification.');

const declarations = new Map();
const stateDeclarations = [];
const effects = [];
for (const statement of component.body.statements) {
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) declarations.set(declaration.name.text, declaration);
      if (ts.isArrayBindingPattern(declaration.name) && ts.isCallExpression(declaration.initializer)
        && declaration.initializer.expression.getText(source) === 'useState') stateDeclarations.push(declaration);
    }
  }
  if (ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression)
    && statement.expression.expression.getText(source) === 'useEffect') {
    effects.push(statement.expression.arguments[0]);
  }
}

function containsIdentifier(node, name) {
  if (ts.isIdentifier(node) && node.text === name) return true;
  return Boolean(ts.forEachChild(node, (child) => containsIdentifier(child, name) || undefined));
}

function findEffect(...identifiers) {
  const matches = effects.filter((node) => identifiers.every((name) => containsIdentifier(node, name)));
  assert.equal(matches.length, 1, `Find one actual effect containing ${identifiers.join(', ')}.`);
  return matches[0];
}

function compile(text, context, filename = panelPath) {
  const result = ts.transpileModule(text, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    fileName: filename,
    reportDiagnostics: true,
  });
  assert.equal(result.diagnostics.length, 0, `Transpile ${filename} without syntax errors.`);
  return vm.runInContext(result.outputText, context, { filename });
}

const moduleCache = new Map();
function loadPureModule(relativePath) {
  const filename = path.resolve(relativePath);
  if (moduleCache.has(filename)) return moduleCache.get(filename);
  const module = { exports: {} };
  moduleCache.set(filename, module.exports);
  const context = vm.createContext({
    module, exports: module.exports, console, TextEncoder, crypto: webcrypto,
    require(id) {
      if (id.startsWith('@/lib/') || id.startsWith('@/types/')) return loadPureModule(`src/${id.slice(2)}.ts`);
      throw new Error(`Unexpected dependency in isolated pure-module test: ${id}`);
    },
  });
  compile(fs.readFileSync(filename, 'utf8'), context, filename);
  return module.exports;
}

const pureDependencies = {};
for (const statement of source.statements) {
  if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
  const name = statement.moduleSpecifier.text;
  if (!name.startsWith('@/lib/storyboard-') && name !== '@/lib/video-studio-client-idempotency') continue;
  const bindings = statement.importClause?.namedBindings;
  if (!bindings || !ts.isNamedImports(bindings)) continue;
  const exports = loadPureModule(`src/${name.slice(2)}.ts`);
  for (const binding of bindings.elements) {
    if (!binding.isTypeOnly) pureDependencies[binding.name.text] = exports[binding.propertyName?.text || binding.name.text];
  }
}

function makeScene(id, order) {
  return {
    id, order, title: `Scene ${order}`, dialogueOrCaption: '안녕하세요.', duration: '5초',
    narrativeBeat: 'A person greets the viewer.', cameraDirection: 'Fixed camera',
    continuityAnchor: 'Same person', transition: 'Match pose', shotSize: 'medium',
    generatedImage: { id: `image-${id}`, url: `https://example.com/${id}.png` },
    imageDesignRevision: 1, videoDesignRevision: 1, approvedVideoArtifactId: `clip-${id}`,
    video: {
      status: 'approved', clipId: `clip-${id}`, artifactId: `clip-${id}`, jobId: null,
      videoUrl: `https://example.com/${id}.mp4`, lastFrameUrl: `https://example.com/${id}-last.png`,
      motionPrompt: 'Slow continuous movement.', durationSeconds: 5, motionIntensity: 'balanced',
      useNextSceneAsEndFrame: false, referenceAssetIds: [], audioMode: 'dialogue', generateAudio: true,
      voiceProfileId: null, trimStartSeconds: 0, trimEndSeconds: 0, playbackRate: 1, audioVolume: 1,
      transitionStyle: 'cut', transitionSeconds: 0, approvedAt: 1, costUsd: 0.1,
      replacedClipId: null, modelUsed: 'fixture-model', visualReferencesApplied: 0,
      firstFrameApplied: true, endFrameApplied: false, audioApplied: true, errorMessage: null,
    },
  };
}

function makeStoryboard() {
  const storyboard = {
    title: 'Lifecycle fixture', logline: 'Offline lifecycle regression', aspectRatio: '16:9',
    characterContinuity: 'Same person', settingContinuity: 'Same room', colorAndLighting: 'Warm light',
    referenceAssets: [], reclaimableStorageAssets: [], scenes: [makeScene('one', 1), makeScene('two', 2)],
    videoProduction: {
      projectId: 'fixture-project', qualityMode: 'proof', voiceDirection: 'Calm voice', voiceProfiles: [],
      automationRunId: 'fixture-run', automationStatus: 'merging', automationCurrentSceneIndex: 2,
      automationCompletedSceneIds: ['one', 'two'], automationRetryCount: 0,
      automationStartedAt: 1, automationUpdatedAt: Date.now(), automationErrorMessage: null,
      finalJobId: 'final-job', finalClipId: 'previous-final', finalArtifactId: 'previous-final',
      finalVideoUrl: 'https://example.com/previous.mp4', finalStatus: 'rendering',
      finalFreshness: 'stale', finalErrorMessage: null, finalAssemblyManifest: null,
      lastSuccessfulFinalVideoUrl: 'https://example.com/previous.mp4', replacedFinalClipId: null,
      backgroundMusicUrl: null, backgroundMusicName: null, backgroundMusicStoragePath: null,
      backgroundMusicVolume: 0.15, sceneAudioVolume: 1, audioCrossfadeSeconds: 0,
      audioMixPreset: 'balanced', maxBudgetUsd: 5, allowUnknownPricing: false,
    },
  };
  storyboard.videoProduction.pendingAssemblyManifest = pureDependencies.createStoryboardFinalAssemblyManifest(
    storyboard, storyboard.scenes.map((scene) => scene.video.clipId), '480p',
  );
  return storyboard;
}

function makeContext(storyboard = makeStoryboard()) {
  const notices = [];
  const pendingEvents = [];
  const context = vm.createContext({
    ...pureDependencies, console: { ...console, error() {} }, TextEncoder, crypto: webcrypto,
    AbortController, structuredClone, Date, Set, Map, Promise,
    currentUser: { uid: 'fixture-user' }, storyboardId: 'fixture-storyboard', storyboard,
    referenceAssets: [], projectBusy: false, workerStatusPending: false, workerBlockingMessage: null,
    workerGenerationBlocked: false, jobSubscriptionReady: true, jobSubscriptionError: null,
    relevantJobIds: [], jobsById: new Map(), jobStatusClock: Date.now(), resolution: '480p',
    queueingSceneId: null, isPreparingProject: false, isFinalizing: false, isRecoveringAutomation: false,
    isUploadingBgm: false, livePanelRef: { current: true },
    automationActionKeysRef: { current: new Set() }, automationRetryCountsByJobRef: { current: new Map() },
    VIDEO_JOB_QUEUE_STALL_MS: 120000, VIDEO_PROVIDER_RESUME_QUEUE_STALL_MS: 600000,
    VIDEO_JOB_PROCESSING_STALL_MS: 720000, VIDEO_JOB_VISIBILITY_STALL_MS: 45000,
    MAX_VIDEO_REFERENCE_IMAGES: 2, AUTOMATION_RETRY_LIMIT: 1, IMAGE_REFERENCE_ROLE_LABELS: {},
    AUTOMATION_ACTIVE_STATUSES: new Set(['preparing', 'running', 'pausing', 'merging']),
    notices, pendingEvents,
    toast: { success: (...args) => notices.push(args), error: (...args) => notices.push(args), info: (...args) => notices.push(args) },
    onRequestPendingChange: (pending) => pendingEvents.push(pending),
    withFirebaseAuthRetry: (_user, action) => action('fixture-token'),
    videoStudioService: {}, imageStoryboardService: {},
    window: { requestAnimationFrame: (callback) => callback(), confirm: () => true },
  });
  context.onStoryboardChange = (updater) => {
    context.storyboard = updater(context.storyboard);
  };
  context.failAutomation = (_runId, message) => { throw new Error(message); };
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement !== component) {
      compile(statement.getText(source), context);
    }
  }
  for (const declaration of stateDeclarations) {
    const [state, setter] = declaration.name.elements.map((item) => item.name?.getText(source));
    if (context[state] === undefined) {
      const initial = declaration.initializer.arguments[0];
      const value = initial ? compile(`(${initial.getText(source)})`, context) : undefined;
      context[state] = typeof value === 'function' ? value() : value;
    }
    context[setter] = (value) => { context[state] = typeof value === 'function' ? value(context[state]) : value; };
  }
  bindCallback(context, 'onChange');
  return context;
}

function bindCallback(context, name) {
  const declaration = declarations.get(name);
  assert(declaration?.initializer, `Find production callback ${name}.`);
  let expression = declaration.initializer;
  if (ts.isCallExpression(expression) && expression.expression.getText(source) === 'useCallback') {
    expression = expression.arguments[0];
  }
  assert(ts.isArrowFunction(expression) || ts.isFunctionExpression(expression), `${name} must expose executable behavior.`);
  const dependencyNames = new Set();
  const visit = (node) => {
    if (ts.isIdentifier(node)) dependencyNames.add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(expression);
  for (const dependency of dependencyNames) {
    if (dependency === name || context[dependency] !== undefined) continue;
    const candidate = declarations.get(dependency)?.initializer;
    if (!candidate) continue;
    if (ts.isCallExpression(candidate) && candidate.expression.getText(source) === 'useRef') {
      context[dependency] = { current: candidate.arguments[0] ? compile(`(${candidate.arguments[0].getText(source)})`, context) : undefined };
    } else if ((ts.isCallExpression(candidate) && candidate.expression.getText(source) === 'useCallback')
      || ts.isArrowFunction(candidate) || ts.isFunctionExpression(candidate)) {
      bindCallback(context, dependency);
    }
  }
  context[name] = compile(`(${expression.getText(source)})`, context);
  return context[name];
}

function runEffect(context, ...identifiers) {
  return compile(`(${findEffect(...identifiers).getText(source)})`, context)();
}

function syncJobs(context, jobs) {
  context.jobsById = new Map(jobs.map((job) => [job.id, job]));
  context.relevantJobIds = jobs.map((job) => job.id);
  runEffect(context, 'jobsById', 'nextProduction');
}

function completedJob(id, clipId) {
  return { id, status: 'completed', clipId, resultVideoUrl: `https://example.com/${clipId}.mp4`,
    resultFrameUrl: `https://example.com/${clipId}-last.png`, metadata: {}, updatedAt: Date.now() };
}

function verifyCompletionOrder() {
  for (const staleInputs of [false, true]) {
    const context = makeContext();
    if (staleInputs) context.storyboard.videoProduction.backgroundMusicVolume = 0.3;
    syncJobs(context, [completedJob('final-job', 'new-final')]);
    assert.equal(context.storyboard.videoProduction.pendingAssemblyManifest, null);
    assert(context.storyboard.videoProduction.finalAssemblyManifest);
    runEffect(context, 'runAction', 'sceneJob');
    assert.equal(context.storyboard.videoProduction.automationStatus, 'completed');
    assert.equal(context.storyboard.videoProduction.finalFreshness, staleInputs ? 'stale' : 'current',
      'The automatic completion updater must retain freshness computed from the consumed assembly manifest.');
    assert.equal(context.storyboard.videoProduction.finalClipId, 'new-final');
    assert.equal(context.storyboard.videoProduction.replacedFinalClipId, 'previous-final');
  }
}

function verifySceneEdit() {
  const fields = [
    ['patchSceneVideo', { motionPrompt: 'Changed movement', status: 'brief', approvedAt: null }],
    ['patchSceneDuration', 6],
    ['patchSceneDialogue', '반갑습니다.'],
    ['patchSceneVideo', { voiceProfileId: 'different-voice', status: 'brief', approvedAt: null }],
  ];
  for (const [name, patch] of fields) {
    const context = makeContext();
    context.storyboard.videoProduction.automationStatus = 'completed';
    context.storyboard.scenes[0].video.jobId = 'old-scene-job';
    bindCallback(context, 'updateSceneForVideo');
    bindCallback(context, name)('one', patch);
    const edited = context.storyboard.scenes[0];
    assert.equal(edited.video.jobId, null, `${name}: detach a completed request after generation input edits.`);
    assert.equal(edited.video.status, 'brief', `${name}: require generation for changed input.`);
    assert.equal(edited.video.videoUrl, 'https://example.com/one.mp4', `${name}: retain the previous playable result.`);
    assert.equal(edited.videoDesignRevision, 2, `${name}: advance the generation input revision.`);
    assert.equal(edited.approvedVideoArtifactId, null, `${name}: invalidate old approval.`);
    syncJobs(context, [completedJob('old-scene-job', 'clip-one')]);
    assert.equal(context.storyboard.scenes[0].video.status, 'brief', `${name}: a late old completion must not override the edit.`);
  }

  const context = makeContext();
  context.storyboard.videoProduction.automationStatus = 'completed';
  bindCallback(context, 'updateSceneForVideo');
  bindCallback(context, 'patchSceneVideo')('one', { trimStartSeconds: 0.5, playbackRate: 1.25 });
  assert.equal(context.storyboard.scenes[0].video.status, 'approved', 'Assembly-only edits reuse an approved video.');
  assert.equal(context.storyboard.scenes[0].video.clipId, 'clip-one');
  assert.equal(context.storyboard.videoProduction.finalFreshness, 'stale');
}

function verifyLegacyBriefAndApproval() {
  for (const status of ['brief', 'approved']) {
    const context = makeContext();
    const scene = context.storyboard.scenes[0];
    scene.video.status = status;
    scene.video.jobId = 'persisted-completed-job';
    syncJobs(context, [completedJob('persisted-completed-job', scene.video.clipId)]);
    assert.equal(context.storyboard.scenes[0].video.status, status,
      `Repeated completed snapshots must preserve persisted ${status} state.`);
  }
  const context = makeContext();
  context.storyboard.scenes[0].video.status = 'queued';
  context.storyboard.scenes[0].video.jobId = 'fresh-job';
  syncJobs(context, [completedJob('fresh-job', 'new-clip')]);
  assert.equal(context.storyboard.scenes[0].video.status, 'review', 'A genuinely completed queued request still enters review.');
  assert.equal(context.storyboard.scenes[0].video.clipId, 'new-clip');
}

function verifyVoiceDependencies() {
  const context = makeContext();
  context.storyboard.videoProduction.automationStatus = 'completed';
  context.storyboard.videoProduction.finalStatus = 'completed';
  context.storyboard.videoProduction.finalFreshness = 'current';
  context.storyboard.videoProduction.voiceProfiles = [{ id: 'speaker', characterName: 'Speaker', voiceDescription: 'Calm', speakingStyle: 'Natural' }];
  context.storyboard.scenes[1].video.voiceProfileId = 'speaker';
  bindCallback(context, 'handleVoiceProfilePatch')('speaker', { voiceDescription: 'Energetic' });
  for (const scene of context.storyboard.scenes) {
    assert.equal(scene.video.status, 'brief', 'Both implicit single-profile and explicit-profile scenes must be invalidated.');
    assert.equal(scene.videoDesignRevision, 2);
    assert.equal(scene.approvedVideoArtifactId, null);
  }
  assert.equal(context.storyboard.videoProduction.finalFreshness, 'stale');

  const defaultVoice = makeContext();
  defaultVoice.storyboard.videoProduction.automationStatus = 'completed';
  bindCallback(defaultVoice, 'patchVoiceDirection')('Different default voice');
  assert.equal(defaultVoice.storyboard.scenes[0].video.status, 'brief', 'Changing the used fallback voice invalidates dialogue video.');
  assert.equal(defaultVoice.storyboard.scenes[0].videoDesignRevision, 2);

  const unusedVoice = makeContext();
  unusedVoice.storyboard.videoProduction.automationStatus = 'completed';
  unusedVoice.storyboard.videoProduction.voiceProfiles = [
    { id: 'used', characterName: 'Used', voiceDescription: 'Same voice', speakingStyle: 'Natural' },
    { id: 'unused', characterName: 'Unused', voiceDescription: 'Unused voice', speakingStyle: 'Natural' },
  ];
  for (const scene of unusedVoice.storyboard.scenes) scene.video.voiceProfileId = 'used';
  bindCallback(unusedVoice, 'handleVoiceProfilePatch')('unused', { voiceDescription: 'Changed unused voice' });
  for (const scene of unusedVoice.storyboard.scenes) {
    assert.equal(scene.video.status, 'approved', 'Editing an unused voice must not require paid regeneration.');
    assert.equal(scene.videoDesignRevision, 1);
  }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function flushPromises() {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

function reportPending(context) {
  // Execute the production reporting effect after state changes, just as a
  // committed render does. The callback starts the guard synchronously, before
  // a render/effect can occur; the effect is responsible for releasing it.
  runEffect(context, 'onRequestPendingChange', 'pendingRequestCount');
  return context.pendingEvents.at(-1);
}

async function verifyDeferredSubmission() {
  for (const operation of ['scene', 'merge']) {
    for (const [fails, automated] of [[false, false], [true, false], [false, true], [true, true]]) {
      const context = makeContext();
      const project = deferred();
      const queue = deferred();
      let submissions = 0;
      context.ensureProject = () => project.promise;
      context.buildStoryboardSceneVideoIdempotencyKey = async () => 'fixture-scene-key';
      context.buildStoryboardFinalVideoIdempotencyKey = async () => 'fixture-final-key';
      context.videoStudioService.submitStudioJob = () => { submissions += 1; return queue.promise; };
      const callback = bindCallback(context, operation === 'scene' ? 'submitSceneJob' : 'submitFinalMerge');
      const automationRunId = automated ? 'fixture-run' : undefined;
      const promise = callback(operation === 'scene'
        ? { scene: context.storyboard.scenes[0], automationRunId }
        : { clipIds: ['clip-one', 'clip-two'], automationRunId, preservePreviousFinal: true });
      // Attach the rejection handler before advancing either deferred boundary.
      const result = promise.then((value) => ({ value }), (error) => ({ error }));
      assert.equal(context.pendingEvents.at(-1), true, `${operation}: guard navigation before awaiting project preparation.`);
      assert.equal(submissions, 0);
      project.resolve('fixture-project');
      await flushPromises();
      assert.equal(submissions, 1, `${operation}: reach the mocked durable queue.`);
      assert.equal(reportPending(context), true, `${operation}: keep the guard while queue acknowledgement is pending.`);
      if (fails) queue.reject(new Error('fixture queue unavailable'));
      else queue.resolve({ jobId: `accepted-${operation}` });
      const settled = await result;
      assert.equal(Boolean(settled.error), fails);
      assert.equal(reportPending(context), false, `${operation}: release navigation after success or failure.`);
      if (!fails) {
        const jobId = operation === 'scene'
          ? context.storyboard.scenes[0].video.jobId
          : context.storyboard.videoProduction.finalJobId;
        assert.equal(jobId, `accepted-${operation}`, `${operation}: attach the acknowledged job before releasing the request.`);
      }
    }
  }
}

async function verifyDeferredBackgroundMusic() {
  for (const fails of [false, true]) {
    const context = makeContext();
    const upload = deferred();
    context.imageStoryboardService.uploadBackgroundMusic = () => upload.promise;
    const promise = bindCallback(context, 'handleBackgroundMusicFile')({ name: 'fixture.mp3', type: 'audio/mpeg' });
    assert.equal(context.pendingEvents.at(-1), true, 'An upload must synchronously guard project/tab navigation.');
    assert.equal(reportPending(context), true, 'An unresolved background-music upload remains pending.');
    if (fails) upload.reject(new Error('fixture upload failed'));
    else upload.resolve({ name: 'fixture.mp3', url: 'https://example.com/fixture.mp3', storagePath: 'fixture/music.mp3' });
    await promise;
    assert.equal(reportPending(context), false, 'Music upload must release the guard after success or failure.');
    assert.equal(context.storyboard.videoProduction.backgroundMusicUrl, fails ? null : 'https://example.com/fixture.mp3');
  }
}

async function verifyOverlappingRequests() {
  const context = makeContext();
  const first = deferred();
  const second = deferred();
  const withPendingRequest = bindCallback(context, 'withPendingVideoRequest');
  const firstPromise = withPendingRequest(() => first.promise);
  const secondPromise = withPendingRequest(() => second.promise);
  assert.equal(reportPending(context), true);
  first.resolve('first');
  await firstPromise;
  assert.equal(reportPending(context), true, 'One request finishing must not unlock another pending request.');
  second.resolve('second');
  await secondPromise;
  assert.equal(reportPending(context), false, 'Release navigation only after the final overlapping request settles.');
}

function verifyDelayedJobsRemainActive() {
  for (const status of ['queued', 'running', 'uploading']) {
    const context = makeContext();
    const job = {
      id: 'slow-job', status, updatedAt: Date.now() - 60 * 60 * 1000, metadata: {},
    };
    context.storyboard.scenes[0].video.jobId = job.id;
    context.storyboard.scenes[0].video.status = 'queued';
    context.storyboard.videoProduction.finalJobId = job.id;
    assert(context.stalledJobMessage(job, context.jobStatusClock), `${status}: show a delay notice for an old active job.`);
    assert.equal(context.sceneStatusFromJob(job, 'queued', context.jobStatusClock), status === 'queued' ? 'queued' : 'rendering',
      `${status}: elapsed time must not claim that the durable job failed.`);
    syncJobs(context, [job]);
    assert.equal(context.storyboard.scenes[0].video.status, status === 'queued' ? 'queued' : 'rendering');
    assert.equal(context.storyboard.videoProduction.finalStatus, status === 'queued' ? 'queued' : 'rendering');
    assert.equal(context.storyboard.scenes[0].video.clipId, 'clip-one', 'A delayed replacement preserves the previous scene result.');
    assert.equal(context.storyboard.videoProduction.finalClipId, 'previous-final');
  }

  const context = makeContext();
  const queuedResume = {
    id: 'provider-resume', status: 'queued', updatedAt: context.jobStatusClock - 3 * 60 * 1000,
    metadata: { providerVideo: { jobId: 'provider-checkpoint', status: 'completed' } },
  };
  assert.equal(context.hasProviderVideoResumeCheckpoint(queuedResume), true, 'A queued resume still owns the provider checkpoint.');
  assert.equal(context.stalledJobMessage(queuedResume, context.jobStatusClock), null,
    'Provider checkpoint recovery uses its longer grace period instead of the ordinary queue deadline.');
  assert(context.stalledJobMessage(queuedResume, context.jobStatusClock + 8 * 60 * 1000));
}

async function verifyCancellationLifecycle() {
  for (const target of ['scene', 'merge']) {
    for (const fails of [false, true]) {
      const context = makeContext();
      const response = deferred();
      const job = { id: target === 'scene' ? 'cancel-scene-job' : 'final-job', status: 'running', updatedAt: Date.now(), metadata: {} };
      context.storyboard.videoProduction.automationStatus = target === 'scene' ? 'running' : 'merging';
      context.storyboard.videoProduction.automationCurrentSceneIndex = target === 'scene' ? 0 : context.storyboard.scenes.length;
      if (target === 'scene') {
        context.storyboard.videoProduction.automationCompletedSceneIds = [];
        context.storyboard.scenes[0].video.status = 'rendering';
        context.storyboard.scenes[0].video.jobId = job.id;
        context.storyboard.scenes[1].video.status = 'brief';
      }
      const beforeScene = context.storyboard.scenes[0].video.videoUrl;
      const beforeFinal = context.storyboard.videoProduction.finalVideoUrl;
      let cancelCalls = 0;
      let paidCalls = 0;
      context.videoStudioService.updateStudioJob = (input) => {
        assert.equal(input.action, 'cancel');
        assert.equal(input.jobId, job.id);
        cancelCalls += 1;
        return response.promise;
      };
      context.submitSceneJob = async () => { paidCalls += 1; };
      context.submitFinalMerge = async () => { paidCalls += 1; };
      const cancel = bindCallback(context, 'handleCancelVideoJob');
      const promise = cancel(job);
      assert.equal(context.storyboard.videoProduction.automationStatus, 'paused',
        `${target}: pause the coordinator before the server cancellation response.`);
      assert.equal(context.pendingEvents.at(-1), true, `${target}: the cancel acknowledgement is a pending request.`);
      assert.equal(cancelCalls, 1);
      await cancel(job);
      assert.equal(cancelCalls, 1, 'Do not issue another cancellation while its request is pending.');
      runEffect(context, 'runAction', 'sceneJob');
      assert.equal(paidCalls, 0, 'Paused cancellation must prevent further generation or merge submissions.');

      if (fails) {
        response.reject(new Error('fixture cancellation unavailable'));
      } else {
        // A worker may finish before its cancellation reaches the server. The
        // finished result may be recorded, but cannot advance the paid loop.
        syncJobs(context, [completedJob(job.id, `finished-before-${target}-cancel`)]);
        runEffect(context, 'runAction', 'sceneJob');
        response.resolve({ cancellationRequested: true });
      }
      await promise;
      assert.equal(reportPending(context), false, 'Release the short acknowledgement guard when the request settles.');
      assert.equal(paidCalls, 0, 'A completion arriving during cancellation must never start the next paid task.');
      if (fails) {
        assert.equal(context.storyboard.scenes[0].video.videoUrl, beforeScene, 'Cancellation failure keeps the previous scene clip.');
        assert.equal(context.storyboard.videoProduction.finalVideoUrl, beforeFinal, 'Cancellation failure keeps the previous final delivery.');
        assert.equal(context.storyboard.videoProduction.automationStatus, 'paused', 'A failed cancel must not silently restart paid automation.');
      }
      const callsBeforeCheckpoint = cancelCalls;
      await cancel({ ...job, cancelRequestedAt: Date.now() });
      assert.equal(cancelCalls, callsBeforeCheckpoint, 'A persisted cancelRequestedAt checkpoint prevents duplicate cancel requests.');
    }
  }
}

function makeAutomationStartContext(reuseAllScenes = false) {
  const context = makeContext();
  Object.assign(context, {
    automationActive: false, automationStatus: 'idle',
    pendingSceneCount: reuseAllScenes ? 0 : context.storyboard.scenes.length,
    pricingCheckPending: false, budgetExceeded: false, creditBlocked: false,
    unknownPricingBlocked: false, qualityReadiness: { score: 100 },
    reusableSceneIds: new Set(reuseAllScenes ? context.storyboard.scenes.map((scene) => scene.id) : []),
    createAutomationRunId: () => 'preparing-run',
  });
  context.storyboard.videoProduction.automationRunId = null;
  context.storyboard.videoProduction.automationStatus = 'idle';
  context.storyboard.videoProduction.finalStatus = 'idle';
  context.storyboard.videoProduction.finalJobId = null;
  if (!reuseAllScenes) {
    context.storyboard.scenes.forEach((scene) => { scene.video.status = 'brief'; });
  }
  return context;
}

async function verifyPreparationPauseLifecycle() {
  for (const reuseAllScenes of [false, true]) {
    for (const settlePauseBeforeResponse of [false, true]) {
      const context = makeAutomationStartContext(reuseAllScenes);
      const response = deferred();
      let paidCalls = 0;
      context.ensureProject = () => response.promise;
      context.submitSceneJob = async () => { paidCalls += 1; };
      context.submitFinalMerge = async () => { paidCalls += 1; };
      const start = bindCallback(context, 'handleStartAutomation');
      const pause = bindCallback(context, 'handlePauseAutomation');
      const promise = start();
      assert.equal(context.storyboard.videoProduction.automationStatus, 'preparing');

      // Reflect the render caused by starting the run before invoking the
      // actual pause callback exposed while ensureProject is still pending.
      context.automationActive = true;
      context.automationStatus = 'preparing';
      pause();
      assert.equal(context.storyboard.videoProduction.automationStatus, 'pausing');
      if (settlePauseBeforeResponse) {
        runEffect(context, 'runAction', 'sceneJob');
        assert.equal(context.storyboard.videoProduction.automationStatus, 'paused');
      }

      response.resolve('fixture-project');
      await promise;
      assert.equal(context.storyboard.videoProduction.automationStatus, 'paused',
        `Preparation completion must honor ${settlePauseBeforeResponse ? 'settled' : 'pending'} pause before ${reuseAllScenes ? 'merge' : 'generation'}.`);
      runEffect(context, 'runAction', 'sceneJob');
      assert.equal(paidCalls, 0, 'A pause during preparation must prevent subsequent generation and assembly submissions.');
    }
  }
}

async function verifyObsoletePreparationResponse() {
  for (const responseFails of [false, true]) {
    const context = makeAutomationStartContext();
    const response = deferred();
    context.ensureProject = () => response.promise;
    const start = bindCallback(context, 'handleStartAutomation');
    const promise = start();
    assert.equal(context.storyboard.videoProduction.automationRunId, 'preparing-run');
    context.storyboard = {
      ...context.storyboard,
      videoProduction: {
        ...context.storyboard.videoProduction,
        automationRunId: 'replacement-run', automationStatus: 'paused',
        automationErrorMessage: 'Keep the replacement run state.',
      },
    };
    const replacement = context.storyboard;
    if (responseFails) response.reject(new Error('Obsolete preparation failed.'));
    else response.resolve('fixture-project');
    await promise;
    assert.equal(context.storyboard, replacement,
      `An obsolete ${responseFails ? 'failed' : 'successful'} preparation response must not mutate a replacement run.`);
  }
}

function refreshMissingJobCandidates(context) {
  const declaration = declarations.get('missingActiveJobIds');
  assert(declaration?.initializer, 'Find the actual missing active job selector.');
  const expression = declaration.initializer;
  context.missingActiveJobIds = ts.isCallExpression(expression) && expression.expression.getText(source) === 'useMemo'
    ? compile(`(${expression.arguments[0].getText(source)})`, context)()
    : compile(`(${expression.getText(source)})`, context);
}

function makeMissingJobContext(target = 'scene', automated = true, status = 'queued') {
  const context = makeContext();
  const production = context.storyboard.videoProduction;
  production.automationRunId = automated ? 'missing-job-run' : null;
  production.automationStatus = automated ? (target === 'scene' ? 'running' : 'merging') : 'idle';
  production.automationCompletedSceneIds = target === 'scene' ? [] : ['one', 'two'];
  production.automationCurrentSceneIndex = target === 'scene' ? 0 : 2;
  production.finalJobId = target === 'merge' ? 'missing-job' : null;
  production.finalStatus = target === 'merge' ? status : 'idle';
  if (target === 'scene') {
    context.storyboard.scenes[0].video.jobId = 'missing-job';
    context.storyboard.scenes[0].video.status = status;
  }
  context.relevantJobIds = ['missing-job'];
  context.reconnectCalls = 0;
  context.retryJobSubscription = () => { context.reconnectCalls += 1; };
  refreshMissingJobCandidates(context);
  return context;
}

async function verifyMissingJobRecovery() {
  for (const target of ['scene', 'merge']) {
    for (const automated of [false, true]) {
      for (const status of ['queued', 'rendering']) {
        const context = makeMissingJobContext(target, automated, status);
        const response = deferred();
        const before = context.storyboard;
        let serverChecks = 0;
        let paidCalls = 0;
        context.videoStudioService.hasStudioJobOnServer = (jobId, uid) => {
          assert.equal(jobId, 'missing-job');
          assert.equal(uid, 'fixture-user');
          serverChecks += 1;
          return response.promise;
        };
        context.submitSceneJob = async () => { paidCalls += 1; };
        context.submitFinalMerge = async () => { paidCalls += 1; };
        const recover = bindCallback(context, 'handleRecoverMissingVideoJob');
        const promise = recover('missing-job');
        assert.equal(context.storyboard, before, 'An empty subscription must not detach the job before server confirmation.');
        assert.equal(reportPending(context), true, 'Server confirmation participates in the request navigation guard.');
        await recover('missing-job');
        assert.equal(serverChecks, 1, 'Overlapping recovery clicks must share the active request guard.');
        response.resolve(false);
        await promise;

        const after = context.storyboard;
        assert.equal(reportPending(context), false, 'A resolved missing-job lookup releases its pending request.');
        assert.equal(context.reconnectCalls, 0);
        if (target === 'scene') {
          assert.equal(after.scenes[0].video.jobId, null);
          assert.equal(after.scenes[0].video.status, 'failed');
          assert.equal(after.scenes[0].approvedVideoArtifactId, null);
          assert.equal(after.scenes[0].video.approvedAt, null);
          assert.equal(after.scenes[0].video.clipId, before.scenes[0].video.clipId);
          assert.equal(after.scenes[0].video.videoUrl, before.scenes[0].video.videoUrl);
          assert.equal(after.scenes[0].video.lastFrameUrl, before.scenes[0].video.lastFrameUrl);
          assert.equal(after.scenes[1], before.scenes[1], 'An unrelated approved scene remains untouched.');
        } else {
          assert.equal(after.videoProduction.finalJobId, null);
          assert.equal(after.videoProduction.finalStatus, 'failed');
          assert.equal(after.videoProduction.pendingAssemblyManifest, null);
          assert.equal(after.scenes[0], before.scenes[0]);
          assert.equal(after.scenes[1], before.scenes[1]);
        }
        assert.equal(after.videoProduction.finalClipId, before.videoProduction.finalClipId);
        assert.equal(after.videoProduction.finalVideoUrl, before.videoProduction.finalVideoUrl);
        assert.equal(after.videoProduction.finalAssemblyManifest, before.videoProduction.finalAssemblyManifest);
        assert.equal(after.videoProduction.lastSuccessfulFinalVideoUrl, before.videoProduction.lastSuccessfulFinalVideoUrl);
        assert.equal(after.videoProduction.automationStatus, automated ? 'paused' : 'idle');
        runEffect(context, 'runAction', 'sceneJob');
        assert.equal(paidCalls, 0, 'Missing-job recovery must never automatically start a paid replacement or merge.');
      }
    }
  }
}

async function verifyMissingJobRecoveryPreservesWork() {
  for (const target of ['scene', 'merge']) {
    for (const outcome of ['exists', 'offline', 'permission', 'unmounted', 'completed', 'replaced']) {
      const context = makeMissingJobContext(target);
      const response = deferred();
      context.videoStudioService.hasStudioJobOnServer = () => response.promise;
      const recover = bindCallback(context, 'handleRecoverMissingVideoJob');
      const promise = recover('missing-job');
      if (outcome === 'unmounted') context.livePanelRef.current = false;
      if (outcome === 'completed' || outcome === 'replaced') {
        if (target === 'scene') {
          context.storyboard = {
            ...context.storyboard,
            scenes: context.storyboard.scenes.map((scene, index) => index === 0 ? {
              ...scene, video: { ...scene.video,
                status: outcome === 'completed' ? 'review' : 'queued',
                jobId: outcome === 'replaced' ? 'replacement-job' : scene.video.jobId,
              },
            } : scene),
          };
        } else {
          context.storyboard = { ...context.storyboard, videoProduction: {
            ...context.storyboard.videoProduction,
            finalStatus: outcome === 'completed' ? 'completed' : 'queued',
            finalJobId: outcome === 'replaced' ? 'replacement-job' : 'missing-job',
          } };
        }
      }
      const beforeResponse = context.storyboard;
      if (outcome === 'offline' || outcome === 'permission') response.reject(new Error(`Fixture ${outcome} lookup failure.`));
      else response.resolve(outcome === 'exists');
      await promise;
      assert.equal(context.storyboard, beforeResponse,
        `${target}/${outcome}: delayed or inconclusive lookup must preserve the latest job and result state.`);
      assert.equal(context.reconnectCalls, outcome === 'exists' ? 1 : 0,
        'Only a confirmed existing server job triggers a subscription reconnect.');
      assert.equal(context.pendingRequestCountRef.current, 0, 'Every lookup outcome releases request ownership, including unmount.');
    }
  }
}

async function verifyMissingJobRecoveryGuards() {
  for (const reason of ['loading', 'subscription-error', 'known-job', 'signed-out', 'other-job']) {
    const context = makeMissingJobContext();
    let serverChecks = 0;
    context.videoStudioService.hasStudioJobOnServer = async () => { serverChecks += 1; return false; };
    if (reason === 'loading') context.jobSubscriptionReady = false;
    if (reason === 'subscription-error') context.jobSubscriptionError = 'Fixture subscription error.';
    if (reason === 'known-job') context.jobsById.set('missing-job', { id: 'missing-job', status: 'queued' });
    if (reason === 'signed-out') context.currentUser = null;
    refreshMissingJobCandidates(context);
    const before = context.storyboard;
    await bindCallback(context, 'handleRecoverMissingVideoJob')(reason === 'other-job' ? 'unrelated-job' : 'missing-job');
    assert.equal(serverChecks, 0, `${reason}: only a missing active job from a ready, healthy subscription may be verified.`);
    assert.equal(context.storyboard, before);
  }
}

async function verifyMissingJobServerReadBoundary() {
  const servicePath = 'src/services/videoStudioService.ts';
  const serviceText = fs.readFileSync(servicePath, 'utf8');
  const serviceSource = ts.createSourceFile(servicePath, serviceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const serviceClass = serviceSource.statements.find((node) => ts.isClassDeclaration(node) && node.name?.text === 'VideoStudioService');
  assert(serviceClass, 'Find the actual video studio service class.');
  const method = serviceClass.members.find((node) => ts.isMethodDeclaration(node)
    && node.name.getText(serviceSource) === 'hasStudioJobOnServer');
  assert(method, 'Find the actual server-confirmed job lookup method.');

  for (const outcome of ['exists', 'absent', 'other-owner', 'missing-owner', 'offline', 'permission']) {
    const dbFixture = { kind: 'isolated-firestore-mock' };
    const calls = { server: 0, cache: 0, defaultRead: 0 };
    const context = vm.createContext({
      db: dbFixture, VIDEO_STUDIO_JOBS_COLLECTION: 'fixture-video-jobs',
      doc(database, collection, jobId) {
        assert.equal(database, dbFixture);
        assert.equal(collection, 'fixture-video-jobs');
        assert.equal(jobId, 'fixture-job');
        return { database, collection, jobId };
      },
      async getDocFromServer(reference) {
        calls.server += 1;
        assert.equal(reference.jobId, 'fixture-job');
        if (outcome === 'offline' || outcome === 'permission') throw new Error(`fixture-${outcome}`);
        return {
          exists: () => outcome !== 'absent',
          data: () => ({ userId: outcome === 'other-owner' ? 'other-user' : outcome === 'missing-owner' ? undefined : 'fixture-user' }),
        };
      },
      async getDoc() { calls.defaultRead += 1; return { exists: () => false }; },
      async getDocFromCache() { calls.cache += 1; return { exists: () => false }; },
    });
    const read = compile(`({ ${method.getText(serviceSource)} }).hasStudioJobOnServer`, context, servicePath);
    if (outcome === 'other-owner' || outcome === 'missing-owner') {
      await assert.rejects(read('fixture-job', 'fixture-user'), /권한/,
        'An existing job without matching ownership must not be interpreted as missing.');
    } else if (outcome === 'offline' || outcome === 'permission') {
      await assert.rejects(read('fixture-job', 'fixture-user'), new RegExp(`fixture-${outcome}`),
        'A server lookup failure must propagate instead of returning a false absence result.');
    } else {
      assert.equal(await read('fixture-job', 'fixture-user'), outcome === 'exists',
        'Only a successful authoritative server read may confirm whether the job exists.');
    }
    assert.deepEqual(calls, { server: 1, cache: 0, defaultRead: 0 },
      'Job recovery must use getDocFromServer exclusively, never a potentially empty cache read.');
  }
}

function verifyCoordinatorSurvivesFramePropagation() {
  for (const downstreamStatus of ['brief', 'approved']) {
    const context = makeContext();
    const production = context.storyboard.videoProduction;
    production.automationStatus = 'running';
    production.automationCurrentSceneIndex = 0;
    production.automationCompletedSceneIds = downstreamStatus === 'approved' ? ['two'] : [];
    production.finalJobId = null;
    context.storyboard.scenes[0].video.status = 'rendering';
    context.storyboard.scenes[0].video.jobId = 'replacement-job';
    context.storyboard.scenes[1].video.status = downstreamStatus;
    context.storyboard.scenes[1].video.jobId = 'old-dependent-job';
    const submissions = [];
    context.submitSceneJob = async ({ scene }) => { submissions.push(scene.id); return 'fixture-submission'; };
    const beforeCompletion = context.storyboard;
    syncJobs(context, [completedJob('replacement-job', 'replacement-clip')]);
    assert.equal(context.storyboard.scenes[1].video.status, 'brief', 'A changed previous final frame invalidates the next dependent clip.');
    assert.equal(context.storyboard.scenes[1].video.jobId, null);
    assert.equal(context.storyboard.videoProduction.automationRunId, 'fixture-run');
    if (downstreamStatus === 'approved') {
      assert.equal(context.storyboard.videoProduction.automationStatus, 'paused',
        'A previously reusable clip joining the generation scope must pause for fresh cost approval.');
      assert.ok(context.storyboard.videoProduction.automationErrorMessage,
        'The paused run must explain why its generation scope has changed.');
      assert.equal(context.storyboard.scenes[0].video.videoUrl, 'https://example.com/replacement-clip.mp4',
        'Pausing the paid loop must retain the just-completed result.');
      assert.equal(context.storyboard.scenes[1].video.videoUrl, 'https://example.com/two.mp4',
        'The previous dependent take remains available for comparison.');
      context.storyboard = pureDependencies.invalidateChangedStoryboardDependencies(beforeCompletion, context.storyboard);
      assert.equal(context.storyboard.videoProduction.automationStatus, 'paused',
        'The Workspace applying the same dependency guard again must preserve the paused run.');
      assert.equal(context.storyboard.videoProduction.automationRunId, 'fixture-run');
      runEffect(context, 'runAction', 'sceneJob');
      runEffect(context, 'runAction', 'sceneJob');
      assert.deepEqual(submissions, [], 'No newly required generation may bypass the next cost confirmation.');
    } else {
      assert.equal(context.storyboard.videoProduction.automationStatus, 'running',
        'Dependency propagation within the already unfinished scene scope may retain the active coordinator.');
      runEffect(context, 'runAction', 'sceneJob');
      assert.equal(context.storyboard.scenes[0].video.status, 'approved', 'The actual completion updater can still approve the finished current scene.');
      assert.equal(context.storyboard.videoProduction.automationCurrentSceneIndex, 1);
      assert.equal(context.storyboard.videoProduction.automationStatus, 'running');
      assert.equal(context.storyboard.videoProduction.automationRunId, 'fixture-run');
      runEffect(context, 'runAction', 'sceneJob');
      assert.deepEqual(submissions, ['two'], 'The originally unfinished next scene can continue within the approved generation scope.');
    }
  }
}

function verifyCapturedCompletionPreservesScopePause() {
  const context = makeContext();
  const production = context.storyboard.videoProduction;
  production.automationStatus = 'running';
  production.automationCurrentSceneIndex = 0;
  production.automationCompletedSceneIds = ['two'];
  production.finalJobId = null;
  context.storyboard.scenes[0].video.status = 'rendering';
  context.storyboard.scenes[0].video.jobId = 'replacement-job';
  const submissions = [];
  context.submitSceneJob = async ({ scene }) => { submissions.push(scene.id); return 'fixture-submission'; };
  // Both effects belong to one React render: the coordinator retains that
  // render's running storyboard even after the earlier sync effect updates it.
  const capturedCoordinator = compile(
    `((storyboard) => (${findEffect('runAction', 'sceneJob').getText(source)}))`,
    context,
  )(context.storyboard);
  syncJobs(context, [completedJob('replacement-job', 'replacement-clip')]);
  assert.equal(context.storyboard.videoProduction.automationStatus, 'paused');
  const pauseReason = context.storyboard.videoProduction.automationErrorMessage;
  assert.ok(pauseReason);
  capturedCoordinator();
  assert.equal(context.storyboard.scenes[0].video.status, 'approved',
    'The captured completion may record the finished scene result.');
  assert.equal(context.storyboard.videoProduction.automationStatus, 'paused',
    'An earlier running render must not overwrite a pause applied by another effect in the same commit.');
  assert.equal(context.storyboard.videoProduction.automationErrorMessage, pauseReason,
    'Recording completion must retain the reason fresh generation approval is required.');
  runEffect(context, 'runAction', 'sceneJob');
  assert.deepEqual(submissions, [], 'The next render must not launch the newly required scene without cost approval.');
}

async function verifyPausedEditsResumeActualPendingWork() {
  for (const editKind of ['assembly-only', 'later-generation']) {
    const context = makeContext();
    const production = context.storyboard.videoProduction;
    production.automationStatus = 'paused';
    production.automationCurrentSceneIndex = editKind === 'assembly-only' ? 1 : 0;
    production.automationCompletedSceneIds = editKind === 'assembly-only' ? ['one'] : ['two'];
    production.finalJobId = null;
    production.finalStatus = 'idle';
    const pendingIndex = editKind === 'assembly-only' ? 1 : 0;
    context.storyboard.scenes[pendingIndex].video.status = 'brief';
    context.storyboard.scenes[pendingIndex].video.jobId = null;
    context.storyboard.scenes[pendingIndex].approvedVideoArtifactId = null;
    context.automationStatus = 'paused';
    const submissions = [];
    context.submitSceneJob = async ({ scene }) => { submissions.push(scene.id); return 'fixture-submission'; };
    bindCallback(context, 'patchSceneVideo')(
      editKind === 'assembly-only' ? 'one' : 'two',
      editKind === 'assembly-only' ? { trimStartSeconds: 0.5 } : { motionPrompt: 'Changed second-scene movement' },
    );
    assert.equal(context.storyboard.videoProduction.automationCurrentSceneIndex, pendingIndex,
      `${editKind}: editing a scene must resume from the earliest actually unfinished scene.`);
    assert.deepEqual(Array.from(context.storyboard.videoProduction.automationCompletedSceneIds),
      editKind === 'assembly-only' ? ['one'] : [],
      `${editKind}: persisted completion must match reusable approved outputs after editing.`);
    await bindCallback(context, 'handleResumeAutomation')();
    runEffect(context, 'runAction', 'sceneJob');
    assert.deepEqual(submissions, [pendingIndex === 0 ? 'one' : 'two'],
      `${editKind}: resuming must not regenerate an approved clip or skip an earlier unfinished scene.`);
    if (editKind === 'assembly-only') {
      assert.equal(context.storyboard.scenes[0].video.status, 'approved');
      assert.equal(context.storyboard.scenes[0].video.clipId, 'clip-one');
      assert.equal(context.storyboard.scenes[0].video.trimStartSeconds, 0.5);
    }
  }
}

async function main() {
  const failures = [];
  const checks = [
    ['completion updater ordering', verifyCompletionOrder],
    ['generation edits and assembly reuse', verifySceneEdit],
    ['legacy edited scenes and repeated completed snapshots', verifyLegacyBriefAndApproval],
    ['resolved voice dependency propagation', verifyVoiceDependencies],
    ['delayed manual and automatic queue acknowledgement', verifyDeferredSubmission],
    ['delayed background-music upload', verifyDeferredBackgroundMusic],
    ['overlapping pending request ownership', verifyOverlappingRequests],
    ['delayed durable jobs stay active', verifyDelayedJobsRemainActive],
    ['cancellation acknowledgement and paid-loop safety', verifyCancellationLifecycle],
    ['pause during preparation prevents generation and merge', verifyPreparationPauseLifecycle],
    ['obsolete preparation responses preserve replacement runs', verifyObsoletePreparationResponse],
    ['server-confirmed missing scene and merge recovery', verifyMissingJobRecovery],
    ['missing-job lookup races and failures preserve work', verifyMissingJobRecoveryPreservesWork],
    ['missing-job recovery eligibility guards', verifyMissingJobRecoveryGuards],
    ['missing-job authoritative server read and owner boundary', verifyMissingJobServerReadBoundary],
    ['frame dependency propagation respects the approved generation scope', verifyCoordinatorSurvivesFramePropagation],
    ['captured completion preserves a scope pause from the same React commit', verifyCapturedCompletionPreservesScopePause],
    ['paused scene edits resume actual pending work and reuse approved clips', verifyPausedEditsResumeActualPendingWork],
  ];
  for (const [name, run] of checks) {
    try {
      await run();
      console.log(`PASS storyboard video lifecycle: ${name}`);
    } catch (error) {
      failures.push(name);
      console.error(`FAIL storyboard video lifecycle: ${name}\n${error.stack || error}`);
    }
  }
  assert.equal(failures.length, 0, `${failures.length} lifecycle checks failed: ${failures.join(', ')}`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
