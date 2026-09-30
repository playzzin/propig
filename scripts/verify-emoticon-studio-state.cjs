'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const ts = require('typescript');

const sourcePath = path.join(__dirname, '../src/app/admin/emoticon-studio/SemiAutoEmoticonStudio.tsx');
const source = readFileSync(sourcePath, 'utf8');
const ast = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map();
for (const statement of ast.statements) {
  if (ts.isFunctionDeclaration(statement) && statement.name) declarations.set(statement.name.text, statement);
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) declarations.set(declaration.name.text, statement);
    }
  }
}

// Run the source's pure domain functions, not copied approximations or a browser store.
const required = ['createInitialDraft', 'parseAndNormalizeDraft', 'buildFrameSlots', 'frameSlotKey', 'frameMetaFromFrames'];
const optional = ['getFrameSlotPatch'];
const selected = new Set();
function includeDeclaration(name) {
  const declaration = declarations.get(name);
  assert.ok(declaration, `Missing source declaration: ${name}`);
  if (selected.has(declaration)) return;
  selected.add(declaration);
  function visit(node) {
    if (ts.isIdentifier(node) && declarations.has(node.text)) includeDeclaration(node.text);
    ts.forEachChild(node, visit);
  }
  visit(declaration);
}
const availableNames = [...required, ...optional.filter(name => declarations.has(name))];
availableNames.forEach(includeDeclaration);
const extracted = ast.statements.filter(statement => selected.has(statement)).map(statement => statement.getText(ast)).join('\n');
const compiled = ts.transpileModule(`${extracted}\nglobalThis.audit = { ${availableNames.join(', ')} };`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const sandbox = { crypto: webcrypto, structuredClone };
vm.createContext(sandbox);
vm.runInContext(compiled, sandbox, { timeout: 5000, filename: 'emoticon-state-source.js' });
const { createInitialDraft, parseAndNormalizeDraft, buildFrameSlots, frameSlotKey, getFrameSlotPatch } = sandbox.audit;
let savePresetDeclaration;
function findSavePreset(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'savePreset') savePresetDeclaration = node;
  ts.forEachChild(node, findSavePreset);
}
findSavePreset(ast);
assert.ok(savePresetDeclaration?.initializer, 'Missing actual savePreset event handler');
vm.runInContext(ts.transpileModule(`globalThis.savePreset = ${savePresetDeclaration.initializer.getText(ast)};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, sandbox, { timeout: 5000 });
const plain = value => JSON.parse(JSON.stringify(value));
const initial = createInitialDraft('state-regression-only');
const failures = [];
let passed = 0;
function check(name, callback) {
  try {
    callback();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push({ name, message: error instanceof Error ? error.message : String(error) });
    console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const scenes = Array.from({ length: 24 }, (_, index) => ({
  id: `scene-${index + 1}`, title: `장면 ${index + 1}`, summary: '저장 복원 회귀 장면', dialogue: '', loopGuide: '',
  frames: [
    { id: `scene-${index + 1}-a`, pose: '첫 자세', caption: '', durationMs: 80 },
    { id: `scene-${index + 1}-b`, pose: '다음 자세', caption: '안녕', durationMs: 90 },
  ],
}));
const frameMeta = scenes.flatMap(scene => scene.frames.map((keyframe, index) => ({
  id: `asset-${keyframe.id}`, sceneId: scene.id, keyframeIndex: index, keyframeId: keyframe.id,
  fileName: `${keyframe.id}.png`, durationMs: keyframe.durationMs, caption: keyframe.caption,
  imageTransform: { x: 50, y: 50, width: 86, rotation: 0, opacity: 100 },
  captionTransform: { x: 50, y: 84, width: 64, rotation: 0, opacity: 100 }, layers: [],
})));
const fullProject = { ...initial, presets: scenes, selectedSceneIds: scenes.map(scene => scene.id), frameMeta };

check('24개 장면과 48개 프레임 저장 복원 보존', () => {
  const restored = parseAndNormalizeDraft(JSON.stringify(fullProject));
  assert.deepEqual(plain(restored.selectedSceneIds), fullProject.selectedSceneIds);
  assert.equal(restored.frameMeta.length, 48);
  assert.equal(buildFrameSlots(restored).length, 48);
  assert.deepEqual(plain(restored.frameMeta.map(item => [item.id, item.sceneId, item.keyframeIndex, item.keyframeId])),
    frameMeta.map(item => [item.id, item.sceneId, item.keyframeIndex, item.keyframeId]));
});

check('기본 프리셋의 80/90ms 노출 시간 왕복 보존', () => {
  const restored = parseAndNormalizeDraft(JSON.stringify(initial));
  assert.deepEqual(plain(restored.presets.map(preset => preset.frames.map(item => item.durationMs))),
    plain(initial.presets.map(preset => preset.frames.map(item => item.durationMs))));
});

check('편집 프레임의 80/90ms 노출 시간 왕복 보존', () => {
  const restored = parseAndNormalizeDraft(JSON.stringify(fullProject));
  assert.deepEqual(plain(restored.frameMeta.map(item => item.durationMs)), frameMeta.map(item => item.durationMs));
});

check('49번째 기획 프레임을 숨기지 않고 상한 초과 탐지', () => {
  const overflow = structuredClone(fullProject);
  overflow.presets[23].frames.push({ id: 'overflow-49', pose: '49번째 자세', caption: '', durationMs: 100 });
  const slots = buildFrameSlots(overflow);
  assert.equal(slots.length, 49, '검증 전에 슬롯을 48개로 자르면 저장 상한 검사가 무력화됩니다.');
  assert.equal(slots[48].keyframe.id, 'overflow-49');
});

check('실제 프리셋 저장은 47/48개를 허용하고 49개를 거부', () => {
  for (const total of [47, 48, 49]) {
    const boundaryScenes = structuredClone(scenes.slice(0, 23));
    const last = boundaryScenes[22];
    last.frames = Array.from({ length: total - 44 }, (_, index) => ({
      id: `boundary-${index}`, pose: `경계 자세 ${index}`, caption: '', durationMs: 90,
    }));
    const changes = [];
    const errors = [];
    Object.assign(sandbox, {
      draft: { ...initial, presets: boundaryScenes, selectedSceneIds: boundaryScenes.map(scene => scene.id), frameMeta: [] },
      editingPreset: structuredClone(last), frames: [],
      setFrames: value => changes.push({ field: 'frames', value }),
      setDraft: value => changes.push({ field: 'draft', value }),
      setEditingPreset: value => changes.push({ field: 'editingPreset', value }),
      toast: { error: message => errors.push(message), success: () => undefined },
    });
    sandbox.savePreset();
    if (total <= 48) {
      assert.equal(errors.length, 0, `${total}개는 저장 가능해야 합니다.`);
      assert.equal(changes.filter(change => change.field === 'draft').length, 1);
      assert.equal(buildFrameSlots(changes.find(change => change.field === 'draft').value).length, total);
    } else {
      assert.equal(errors.length, 1, '49개 저장은 초과 안내가 필요합니다.');
      assert.deepEqual(changes, [], '상한 초과 시 현재 프로젝트를 변경하면 안 됩니다.');
    }
  }
});

check('수동 재연결·진행률 키·저장 복원의 연결 대상 일치', () => {
  assert.equal(typeof getFrameSlotPatch, 'function', '프레임 연결 세 필드를 함께 갱신하는 순수 helper가 필요합니다.');
  const slots = buildFrameSlots(initial);
  const previous = { ...frameMeta[0], sceneId: slots[0].sceneId, keyframeIndex: 0, keyframeId: slots[0].keyframe.id };
  const selected = slots[1];
  const linked = { ...previous, ...getFrameSlotPatch(selected) };
  assert.equal(linked.sceneId, selected.sceneId);
  assert.equal(linked.keyframeIndex, selected.keyframeIndex);
  assert.equal(linked.keyframeId, selected.keyframe.id);
  assert.equal(frameSlotKey(linked.sceneId, linked.keyframeIndex, linked.keyframeId),
    frameSlotKey(selected.sceneId, selected.keyframeIndex, selected.keyframe.id));
  const restored = parseAndNormalizeDraft(JSON.stringify({ ...initial, frameMeta: [linked] }));
  assert.equal(restored.frameMeta[0].keyframeIndex, selected.keyframeIndex);
  assert.equal(restored.frameMeta[0].keyframeId, selected.keyframe.id);
});

check('프레임 미지정은 이전 연결 식별자를 모두 제거', () => {
  assert.equal(typeof getFrameSlotPatch, 'function');
  const unassigned = { ...frameMeta[0], ...getFrameSlotPatch(undefined) };
  assert.deepEqual([unassigned.sceneId, unassigned.keyframeIndex, unassigned.keyframeId], [null, null, null]);
  const restored = parseAndNormalizeDraft(JSON.stringify({ ...fullProject, frameMeta: [unassigned] }));
  const frame = restored.frameMeta[0];
  assert.deepEqual([frame.sceneId, frame.keyframeIndex, frame.keyframeId], [null, null, null]);
});

console.log(JSON.stringify({ suite: 'emoticon-studio-state', passed, failed: failures.length }));
if (failures.length) process.exitCode = 1;
