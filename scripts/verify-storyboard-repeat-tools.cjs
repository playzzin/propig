/* Actual preset/comparison JSX, hooks and domain functions, with in-memory storage.
 * No browser, Firebase, provider, generation or external request is made.
 * PROPIG_QA_TOOLS=/home/hermes/.local/share/propig-tools node scripts/verify-storyboard-repeat-tools.cjs
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

const plain = value => JSON.parse(JSON.stringify(value));
function textOf(node) {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  return textOf(node.children);
}
function disabled(node) {
  for (let current = node; current; current = current.parent) {
    if (current.props.disabled && (current === node || current.type === 'fieldset')) return true;
  }
  return false;
}
function harness() {
  const records = new Map(), writes = [], listeners = new Set(), modules = new Map();
  let readError = false, writeError = false, accessError = false, sequence = 0;
  const storage = {
    getItem(key) { if (readError) throw new Error('PRIVATE_STORAGE_READ'); return records.get(key) ?? null; },
    setItem(key, value) { if (writeError) throw new Error('PRIVATE_STORAGE_QUOTA'); writes.push({ key, value }); records.set(key, value); },
  };
  const window = {
    get localStorage() { if (accessError) throw new Error('PRIVATE_STORAGE_SECURITY'); return storage; },
    addEventListener(type, fn) { assert.equal(type, 'storage'); listeners.add(fn); },
    removeEventListener(type, fn) { assert.equal(type, 'storage'); listeners.delete(fn); },
  };
  const styled = new Proxy(tag => () => tag, { get: (_, tag) => () => tag });
  const mocks = { react: React, 'react/jsx-runtime': qa('react/jsx-runtime'), 'styled-components': { __esModule: true, default: styled } };
  const context = vm.createContext({ console, window, crypto: { randomUUID: () => `fixture-preset-${++sequence}` } });
  function load(filename) {
    const full = path.resolve(repo, filename);
    if (modules.has(full)) return modules.get(full).exports;
    const module = { exports: {} }; modules.set(full, module);
    const result = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    }, reportDiagnostics: true });
    assert.equal(result.diagnostics.length, 0, `Transpile: ${filename}`);
    const requireLocal = id => {
      if (id in mocks) return mocks[id];
      if (id.startsWith('@/') || id.startsWith('.')) {
        const base = id.startsWith('@/') ? path.join(repo, 'src', id.slice(2)) : path.resolve(path.dirname(full), id);
        const resolved = [base, `${base}.ts`, `${base}.tsx`].find(item => fs.existsSync(item) && fs.statSync(item).isFile());
        assert(resolved, `Unresolved import: ${id}`); return load(resolved);
      }
      return runtime(id);
    };
    vm.runInContext(`(function(require,module,exports) {\n${result.outputText}\n})`, context, { filename: full })(requireLocal, module, module.exports);
    return module.exports;
  }
  const domain = load('src/lib/storyboard-planning-presets.ts');
  const schema = load('src/schemas/imageStoryboard.ts');
  const makeScene = (id, order = 1) => ({
    id, order, title: `장면 ${id}`, status: 'generated', duration: '3초', narrativeBeat: '제품 소개', shotSize: '미디엄 샷',
    cameraDirection: '느린 전진', dialogueOrCaption: `대사 ${id}`, visualPrompt: '제품', imagePrompt: '제품 영화 조명',
    continuityAnchor: '같은 제품', transition: '', negativePrompt: '', imageDesignRevision: 2, videoDesignRevision: 3,
    assetFreshness: 'current', staleReason: null, approvedImageArtifactId: `image-${id}`, approvedVideoArtifactId: `video-${id}`,
    generatedImage: { id: `image-${id}`, url: `https://example.invalid/${id}.png`, generatedAt: 1, storagePath: `synthetic/${id}.png` },
    video: { ...schema.createStoryboardVideoScene(), status: 'approved', motionPrompt: `움직임 ${id}`, clipId: `clip-${id}`, artifactId: `video-${id}`,
      videoUrl: `https://example.invalid/${id}.mp4`, approvedAt: 1, costUsd: 1.25, jobId: `job-${id}` },
  });
  const makeBoard = () => ({
    schemaVersion: 2, revision: 1, title: '보호할 원본 제목', topic: '보호할 원본 주제', logline: '원본 이야기',
    format: 'brand-film', plannedSceneCount: 5, aspectRatio: '16:9', stylePreset: 'cinematic', audience: '일반 시청자',
    artDirection: '영화 조명', characterContinuity: '같은 인물', settingContinuity: '같은 공간', colorAndLighting: '따뜻한 조명',
    usePreviousSceneAsReference: true, referenceAssets: [{ id: 'reference', storagePath: 'synthetic/reference.png' }],
    reclaimableStorageAssets: [{ storagePath: 'synthetic/old.png' }], transitionLinks: [{ fromSceneId: 'A', toSceneId: 'B', needsReview: false }],
    cleanupStatus: 'idle', videoProduction: { ...schema.createStoryboardVideoProduction(), projectId: 'synthetic-project', maxBudgetUsd: 7,
      allowUnknownPricing: true, finalStatus: 'completed', finalVideoUrl: 'https://example.invalid/final.mp4', finalClipId: 'final-clip', finalArtifactId: 'final-artifact' },
    scenes: [makeScene('A'), makeScene('B', 2), makeScene('C', 3)],
  });
  const seed = (userId, name, settings, id = name) => {
    const presets = domain.upsertStoryboardPreset([], name, settings, 100, id);
    records.set(domain.getStoryboardPresetStorageKey(userId), JSON.stringify({ version: 1, presets })); return presets[0];
  };
  return { domain, schema, load, records, writes, listeners, storage, makeScene, makeBoard, seed,
    setReadError(value) { readError = value; }, setWriteError(value) { writeError = value; }, setAccessError(value) { accessError = value; },
    async emitStorage(key) { await act(async () => { for (const listener of [...listeners]) listener({ key, storageArea: storage }); }); },
  };
}

async function presetFixture(configure = () => {}) {
  const h = harness(), board = h.makeBoard(); configure(h, board);
  const { default: Component } = h.load('src/components/image-generator/StoryboardPlanningPresets.tsx');
  let root, props = { userId: 'account-A', storyboard: board, disabled: false, onApply: settings => { applied.push(settings); return applyResult; } };
  let applyResult = true;
  const applied = [];
  const tree = () => React.createElement(React.StrictMode, null, React.createElement(Component, props));
  await act(async () => { root = create(tree()); });
  const button = label => root.root.findAllByType('button').find(node => textOf(node) === label);
  return { ...h, applied, get root() { return root.root; }, get text() { return textOf(root.toJSON()); },
    get props() { return props; }, get input() { return root.root.findByType('input'); }, get select() { return root.root.findByType('select'); },
    get preview() { return root.root.findAllByProps({ 'aria-label': '프리셋 적용 미리보기' })[0]; }, button,
    async click(label, force = false) { const node = button(label); assert(node, `Button: ${label}`); if (!force) assert(!disabled(node), `Button enabled: ${label}`); await act(async () => node.props.onClick()); },
    async name(value) { await act(async () => root.root.findByType('input').props.onChange({ target: { value } })); },
    async selectPreset(value) { await act(async () => root.root.findByType('select').props.onChange({ target: { value } })); },
    async update(patch) { props = { ...props, ...patch }; await act(async () => root.update(tree())); },
    setApplyResult(value) { applyResult = value; },
    async close() { await act(async () => root.unmount()); assert.equal(h.listeners.size, 0, 'Account storage listener cleans up'); },
  };
}

function testDomain() {
  const h = harness(), d = h.domain, board = h.makeBoard(), original = plain(board);
  const settings = d.getStoryboardPresetSettings(board);
  const allowed = ['format', 'plannedSceneCount', 'aspectRatio', 'stylePreset', 'audience', 'artDirection', 'characterContinuity', 'settingContinuity', 'colorAndLighting', 'usePreviousSceneAsReference'];
  assert.deepEqual(Object.keys(settings).sort(), allowed.sort());
  const first = d.upsertStoryboardPreset([], '  기본  ', settings, 100, 'one');
  d.writeStoryboardPresets(h.storage, 'account/A', first);
  assert.deepEqual(plain(d.readStoryboardPresets(h.storage, 'account/A')), plain(first));
  assert.deepEqual(plain(d.readStoryboardPresets(h.storage, 'account-B')), []);
  assert.notEqual(d.getStoryboardPresetStorageKey('account/A'), d.getStoryboardPresetStorageKey('account%2FA'));
  const saved = h.writes[0].value;
  for (const value of [board.title, board.topic, 'reference.png', 'clip-A', 'final.mp4', 'maxBudgetUsd', 'allowUnknownPricing', 'approvedAt', 'videoProduction']) assert(!saved.includes(value), `Preset excludes ${value}`);
  const updated = d.upsertStoryboardPreset(first, '기본', { ...settings, aspectRatio: '9:16' }, 200, 'unused');
  assert.equal(updated.length, 1); assert.equal(updated[0].id, 'one'); assert.equal(updated[0].createdAt, 100); assert.equal(updated[0].updatedAt, 200);
  for (const bad of [{ ...settings, topic: 'injected' }, { ...settings, plannedSceneCount: 0 }, { ...settings, plannedSceneCount: 13 }, { ...settings, aspectRatio: '2:1' }]) {
    assert.throws(() => d.upsertStoryboardPreset([], 'bad', bad, 100, 'bad'));
    assert.equal(d.applyStoryboardPlanningPreset(board, bad), board, 'Invalid settings are a no-op');
  }
  const key = d.getStoryboardPresetStorageKey('corrupt');
  for (const raw of ['{', 'null', '[]', JSON.stringify({ version: 2, presets: [] }), JSON.stringify({ version: 1, presets: [...first, ...first] }), 'x'.repeat(100001)]) {
    h.records.set(key, raw); const writes = h.writes.length;
    assert.throws(() => d.readStoryboardPresets(h.storage, 'corrupt')); assert.equal(h.records.get(key), raw); assert.equal(h.writes.length, writes);
  }
  let twelve = [];
  for (let index = 0; index < 12; index++) twelve = d.upsertStoryboardPreset(twelve, `preset ${index}`, settings, 100, `id-${index}`);
  assert.throws(() => d.upsertStoryboardPreset(twelve, 'thirteenth', settings, 100, 'id-13'));
  assert.equal(d.upsertStoryboardPreset(twelve, 'PRESET 0', settings, 200, 'ignored').length, 12, 'Case-insensitive overwrite works at capacity');
  assert.equal(d.applyStoryboardPlanningPreset(board, settings), board, 'Identical settings preserve approvals and object identity');
  const countOnly = d.applyStoryboardPlanningPreset(board, { ...settings, plannedSceneCount: 1, format: 'social-short' });
  assert.equal(countOnly.scenes, board.scenes); assert.equal(countOnly.videoProduction, board.videoProduction); assert.equal(countOnly.scenes.length, 3);
  const changed = d.applyStoryboardPlanningPreset(board, { ...settings, aspectRatio: '9:16', artDirection: '새 연출' });
  for (const key of ['title', 'topic', 'logline', 'referenceAssets', 'reclaimableStorageAssets']) assert.equal(changed[key], board[key], `Preserve ${key}`);
  assert.equal(changed.scenes.length, board.scenes.length);
  changed.scenes.forEach((scene, index) => {
    const old = board.scenes[index];
    for (const key of ['id', 'order', 'title', 'dialogueOrCaption', 'generatedImage']) assert.equal(scene[key], old[key]);
    for (const key of ['videoUrl', 'clipId', 'jobId', 'costUsd', 'artifactId']) assert.equal(scene.video[key], old.video[key]);
    assert.equal(scene.approvedImageArtifactId, null); assert.equal(scene.approvedVideoArtifactId, null); assert.equal(scene.video.approvedAt, null);
    assert.equal(scene.assetFreshness, 'review'); assert.equal(scene.video.status, 'review'); assert.equal(scene.imageDesignRevision, old.imageDesignRevision + 1);
  });
  assert.equal(changed.videoProduction.finalVideoUrl, board.videoProduction.finalVideoUrl); assert.equal(changed.videoProduction.finalFreshness, 'stale');
  assert.equal(changed.videoProduction.maxBudgetUsd, 7); assert.equal(changed.videoProduction.allowUnknownPricing, true);
  assert(changed.transitionLinks.every(link => link.needsReview)); assert.deepEqual(plain(board), original, 'Applying never mutates the original');
  for (const status of ['preparing', 'running', 'pausing', 'merging']) {
    const busy = { ...board, videoProduction: { ...board.videoProduction, automationStatus: status } };
    assert.equal(d.applyStoryboardPlanningPreset(busy, { ...settings, aspectRatio: '9:16' }), busy);
  }
  for (const status of ['queued', 'rendering']) {
    for (const busy of [{ ...board, videoProduction: { ...board.videoProduction, finalStatus: status } }, { ...board, scenes: [{ ...board.scenes[0], video: { ...board.scenes[0].video, status } }] }]) {
      assert.equal(d.applyStoryboardPlanningPreset(busy, { ...settings, aspectRatio: '9:16' }), busy);
    }
  }
  console.log('PASS preset whitelist, account keys, validation, capacity, immutable safe apply, running guards and preserved outputs');
}

async function testPresetUI() {
  {
    const f = await presetFixture((h, board) => {
      h.seed('account-A', 'A 전용 설정', { ...h.domain.getStoryboardPresetSettings(board), aspectRatio: '9:16' }, 'A');
      h.seed('account-B', 'B 전용 설정', h.domain.getStoryboardPresetSettings(board), 'B');
    });
    await f.name('A 편집 중'); await f.selectPreset('A'); await f.click('적용 내용 미리보기'); assert(f.preview);
    await f.update({ userId: 'account-B' });
    assert(!f.text.includes('A 전용 설정')); assert(f.text.includes('B 전용 설정')); assert.equal(f.input.props.value, ''); assert.equal(f.select.props.value, ''); assert(!f.preview);
    assert.equal(f.applied.length, 0); assert.equal(f.listeners.size, 1);
    await f.name('B 신규 설정'); await f.click('현재 설정 저장');
    assert.equal(f.writes.length, 1); assert.equal(f.writes[0].key, f.domain.getStoryboardPresetStorageKey('account-B'));
    assert.equal(f.domain.readStoryboardPresets(f.storage, 'account-A').length, 1); await f.close();
  }
  for (const failure of ['corrupt', 'read', 'access']) {
    const f = await presetFixture(h => {
      if (failure === 'corrupt') h.records.set(h.domain.getStoryboardPresetStorageKey('account-A'), '{damaged');
      if (failure === 'read') h.setReadError(true);
      if (failure === 'access') h.setAccessError(true);
    });
    assert(f.text.includes('프리셋을 읽지 못했습니다')); assert(!f.text.includes('PRIVATE_')); assert(disabled(f.input)); assert.equal(f.writes.length, 0);
    if (failure === 'corrupt') assert.equal(f.records.get(f.domain.getStoryboardPresetStorageKey('account-A')), '{damaged');
    f.records.delete(f.domain.getStoryboardPresetStorageKey('account-A')); f.setReadError(false); f.setAccessError(false);
    await f.click('프리셋 다시 불러오기'); assert(!disabled(f.input)); assert(!f.text.includes('프리셋을 읽지 못했습니다')); await f.close();
  }
  {
    const f = await presetFixture(); await f.name('저장 재시도'); f.setWriteError(true); await f.click('현재 설정 저장');
    assert(f.text.includes('프리셋을 저장하지 못했습니다')); assert(!f.text.includes('프리셋을 저장했습니다')); assert(!f.text.includes('PRIVATE_'));
    assert.equal(f.writes.length, 0); assert.equal(f.select.findAllByType('option').length, 1);
    f.setWriteError(false); await f.click('현재 설정 저장'); assert.equal(f.writes.length, 1); assert(f.text.includes('프리셋을 저장했습니다'));
    const saved = f.records.get(f.domain.getStoryboardPresetStorageKey('account-A'));
    await f.click('프리셋 삭제'); assert.equal(f.writes.length, 1, 'Opening delete confirmation is read-only');
    f.setWriteError(true); await f.click('프리셋 삭제 확인'); assert(f.text.includes('프리셋을 삭제하지 못했습니다')); assert.equal(f.records.get(f.domain.getStoryboardPresetStorageKey('account-A')), saved);
    f.setWriteError(false); await f.click('프리셋 삭제 확인'); assert.equal(f.domain.readStoryboardPresets(f.storage, 'account-A').length, 0); await f.close();
  }
  console.log('PASS actual preset UI account remount, storage corruption/access/read/quota errors, retries and deletion confirmation');
  {
    const f = await presetFixture((h, board) => h.seed('account-A', '세로 설정', { ...h.domain.getStoryboardPresetSettings(board), aspectRatio: '9:16', plannedSceneCount: 1 }, 'vertical'));
    await f.selectPreset('vertical'); await f.click('적용 내용 미리보기');
    assert.equal(f.applied.length, 0); assert(f.text.includes('기존 생성 파일은 유지')); assert(f.text.includes('생성 비용이 발생하지 않습니다'));
    await f.update({ storyboard: { ...f.props.storyboard, title: '미리보기 후 변경' } });
    assert(disabled(f.button('기획 설정 적용'))); await f.click('기획 설정 적용', true); assert.equal(f.applied.length, 0);
    await f.click('적용 내용 미리보기'); await f.update({ disabled: true });
    assert(disabled(f.button('기획 설정 적용'))); await f.click('기획 설정 적용', true); assert.equal(f.applied.length, 0);
    await f.update({ disabled: false }); f.setApplyResult(false); await f.click('기획 설정 적용');
    assert(f.preview); assert(f.text.includes('작업 중에는 적용할 수 없습니다')); assert(!f.text.includes('기획 설정을 적용했습니다'));
    f.setApplyResult(true); await f.click('기획 설정 적용'); assert.equal(f.applied.length, 2); assert(!f.preview);
    assert.deepEqual(Object.keys(f.applied[1]).sort(), Object.keys(f.domain.getStoryboardPresetSettings(f.props.storyboard)).sort());
    await f.close();
  }
  {
    const f = await presetFixture((h, board) => h.seed('account-A', '공유 이름', h.domain.getStoryboardPresetSettings(board), 'shared'));
    await f.name('공유 이름'); await f.selectPreset('shared'); await f.click('프리셋 삭제');
    f.seed('account-A', '공유 이름', { ...f.domain.getStoryboardPresetSettings(f.props.storyboard), aspectRatio: '9:16' }, 'shared');
    const external = f.records.get(f.domain.getStoryboardPresetStorageKey('account-A'));
    await f.click('프리셋 삭제 확인'); assert.equal(f.writes.length, 0); assert.equal(f.records.get(f.domain.getStoryboardPresetStorageKey('account-A')), external);
    assert(f.text.includes('다른 창에서 변경되었습니다'));
    f.seed('account-A', '공유 이름', { ...f.domain.getStoryboardPresetSettings(f.props.storyboard), aspectRatio: '1:1' }, 'shared');
    await f.click('같은 이름의 설정 덮어쓰기'); assert.equal(f.writes.length, 0); assert(f.text.includes('다른 창에서 변경되었습니다'));
    await f.click('같은 이름의 설정 덮어쓰기'); assert.equal(f.writes.length, 1, 'An explicit second action can overwrite the now-reviewed version');
    await f.selectPreset('shared'); await f.click('적용 내용 미리보기'); assert(f.preview);
    await f.emitStorage(f.domain.getStoryboardPresetStorageKey('account-B')); assert(f.preview, 'Other account event does not disturb the current preview');
    await f.emitStorage(f.domain.getStoryboardPresetStorageKey('account-A')); assert(!f.preview, 'Current-account external update invalidates the preview');
    await f.close();
  }
  console.log('PASS actual preview consent, stale draft/running guards, parent refusal and cross-tab overwrite/delete protection');
}

async function testComparisonUI() {
  const h = harness(), board = h.makeBoard(), original = plain(board), selected = [];
  const { default: Component } = h.load('src/components/image-generator/StoryboardSceneComparison.tsx');
  let props = { scenes: board.scenes, activeSceneId: 'C', onSelectScene: id => selected.push(id) }, root;
  const tree = () => React.createElement(React.StrictMode, null, React.createElement(Component, props));
  const update = async patch => { props = { ...props, ...patch }; await act(async () => root.update(tree())); };
  const toggle = async open => { await act(async () => root.root.findAllByType('details')[0].props.onToggle({ currentTarget: { open } })); };
  const pick = async (index, value) => { await act(async () => root.root.findAllByType('select')[index].props.onChange({ target: { value } })); };
  const values = () => root.root.findAllByType('select').map(select => select.props.value);
  const checkDistinct = () => {
    const ids = values(); assert.equal(new Set(ids).size, ids.length);
    for (const select of root.root.findAllByType('select')) {
      assert(select.findAllByType('option').some(option => option.props.value === select.props.value), 'Displayed selection has a live option');
      assert.equal(select.parent.type, 'label', 'Native select has an associated visible label');
    }
  };
  await act(async () => { root = create(tree()); });
  assert.equal(root.root.findAllByType('video').length, 0, 'Closed comparison does not mount media');
  await toggle(true); assert.deepEqual(values(), ['C', 'A']); checkDistinct();
  await update({ activeSceneId: 'B' });
  assert.deepEqual(values(), ['C', 'A'], 'Changing the active editor scene preserves the displayed comparison pair');
  await update({ activeSceneId: 'C' });
  assert(textOf(root.toJSON()).includes('대사 C')); assert(textOf(root.toJSON()).includes('움직임 C')); assert(textOf(root.toJSON()).includes('승인됨'));
  for (const video of root.root.findAllByType('video')) {
    assert.equal(video.props.controls, true); assert.equal(video.props.preload, 'none'); assert(!video.props.autoPlay);
    assert(video.props['aria-label']); assert.equal(video.props.playsInline, true);
  }
  await pick(1, 'B'); await pick(0, 'B'); checkDistinct(); assert.deepEqual(values(), ['B', 'A']);
  await pick(0, 'A'); await pick(1, 'B');
  await update({ scenes: board.scenes.filter(scene => scene.id !== 'A') });
  assert.deepEqual(values(), ['C', 'B'], 'Deleted left selection falls back to the active live scene'); checkDistinct();
  await update({ scenes: [board.scenes[2], h.makeScene('D', 4)] });
  assert.deepEqual(values(), ['C', 'D'], 'Deleted right selection falls back to a different live scene'); checkDistinct();
  assert.equal(selected.length, 0, 'Compare, selection and removal never edit or approve a scene');
  await act(async () => root.root.findAllByType('button')[1].props.onClick());
  assert.deepEqual(selected, ['D'], 'Edit button selects the currently displayed live scene');
  await update({ scenes: [{ ...board.scenes[2], assetFreshness: 'review', video: { ...board.scenes[2].video, videoUrl: null } }] });
  assert.equal(root.root.findAllByType('video').length, 0); assert.equal(root.root.findAllByType('img').length, 1);
  assert(root.root.findByType('img').props.alt.includes('장면 C')); assert(textOf(root.toJSON()).includes('재검토 필요'));
  assert(textOf(root.toJSON()).includes('장면이 2개 이상 필요')); assert.deepEqual(values(), ['C']);
  await update({ scenes: [{ ...board.scenes[2], generatedImage: null, video: { ...board.scenes[2].video, videoUrl: null } }] });
  assert(textOf(root.toJSON()).includes('아직 생성한 이미지·영상이 없습니다'));
  await update({ scenes: [], activeSceneId: null }); assert.equal(values().length, 0); assert(textOf(root.toJSON()).includes('장면을 설계하면 비교'));
  await update({ scenes: board.scenes, activeSceneId: null }); checkDistinct(); assert.equal(values().length, 2);
  await toggle(false); assert.equal(root.root.findAllByType('video').length, 0);
  assert.deepEqual(plain(board), original, 'Read-only comparison preserves every original field');
  assert.deepEqual(selected, ['D']); await act(async () => root.unmount());
  console.log('PASS actual comparison media consent, labeled selection, deleted-selection fallbacks, empty/single scenes and edit targeting');
}

async function run() {
  testDomain();
  await testPresetUI();
  await testComparisonUI();
  console.log('PASS storyboard repeat tools — actual React StrictMode, isolated storage, zero external requests');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
