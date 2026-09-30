/* Execute actual recovery functions with in-memory stores. No provider calls. */
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { z } = require('zod');
const { createHash } = require('node:crypto');
const { gzipSync, gunzipSync } = require('node:zlib');
const uid = 'fixture-user';
const operationId = '11111111-1111-4111-8111-111111111111';
let checks = 0;

function extract(file, names, vars = []) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const nodes = source.statements.filter((n) =>
    (ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) && names.includes(n.name?.text)
    || ts.isVariableStatement(n) && n.declarationList.declarations.some((d) => vars.includes(d.name.getText(source))));
  return ts.transpileModule(nodes.map((n) => n.getText(source)).join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
}

async function main() {
  for (const file of ['src/app/api/generate-image/route.ts', 'functions/src/api/hostingGenerationRoutes.ts']) {
    const docs = new Map(), blobs = new Map();
    let writes = 0, downloads = 0, catalog = [], fail = false;
    const ref = (path) => ({ get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }), collection: (name) => ({ doc: (id) => ref(`${path}/${name}/${id}`) }), set: () => { writes++; throw Error('unexpected write'); } });
    const db = { collection: (name) => ({ doc: (id) => ref(`${name}/${id}`) }) };
    class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
    const firebaseAdmin = { storage: () => ({ bucket: () => ({ file: (path) => ({ download: async () => { downloads++; return [blobs.get(path)]; } }) }) }) };
    const context = vm.createContext({ z, createHash, Buffer, gunzipSync, adminDb: db, db, ApiError, exports: {}, firebaseAdmin, admin: firebaseAdmin, console: { warn() {} }, discoverOpenRouterImageModels: async () => { if (fail) throw Error('offline'); return catalog; }, scoreImageModel: () => 0 });
    vm.runInContext(extract(file, ['imageOperationKey', 'readImageOperation', 'selectOpenRouterImageModel', 'supportsRequestedImageInput', 'hasParameter', 'hasImageParameter', 'ImageOperationConflictError', 'ImageModelUnavailableError'], ['IMAGE_DURABLE_CHUNKED_MAX_BYTES', 'IMAGE_DURABLE_CHUNK_BYTES', 'IMAGE_DURABLE_STORAGE_MAX_BYTES', 'EFFICIENT_STORYBOARD_IMAGE_MODEL', 'AUTO_IMAGE_MODEL_FALLBACK']) + '\nglobalThis.api={readImageOperation,imageOperationKey,selectOpenRouterImageModel};', context);
    const api = context.api, key = api.imageOperationKey(uid, operationId), path = `aiOperationReservations/${key}`;
    assert.equal((await api.readImageOperation(uid, operationId)).status, 'not-found'); checks++;
    const seed = (status, extra = {}) => docs.set(path, { uid, operation: 'image-generation', operationId, status, ...extra });
    for (const status of ['pending', 'uncertain', 'failed']) { seed(status); assert.equal((await api.readImageOperation(uid, operationId)).status, status); checks++; }
    seed('completed', { uid: 'other', result: { success: true, images: [{ url: 'data:image/png;base64,YQ==' }] } });
    await assert.rejects(api.readImageOperation(uid, operationId)); checks++;
    const result = { success: true, images: [{ url: 'data:image/png;base64,YQ==' }], metadata: { costUsd: 0.05 } };
    seed('completed', { result }); assert.equal((await api.readImageOperation(uid, operationId)).result.metadata.costUsd, 0.05); checks++;
    const bytes = Buffer.from(JSON.stringify(result)), encoded = bytes.toString('base64');
    seed('completed', { resultChunkCount: 1, resultSha256: createHash('sha256').update(bytes).digest('hex') }); docs.set(`${path}/resultChunks/000`, { index: 0, data: encoded });
    assert.equal((await api.readImageOperation(uid, operationId)).status, 'completed'); checks++;
    docs.set(`${path}/resultChunks/000`, { index: 1, data: encoded }); await assert.rejects(api.readImageOperation(uid, operationId)); checks++;
    docs.set(`${path}/resultChunks/000`, { index: 0, data: encoded }); seed('completed', { resultChunkCount: 1, resultSha256: 'a'.repeat(64) }); await assert.rejects(api.readImageOperation(uid, operationId)); checks++;
    const storagePath = `ai-operation-results/${createHash('sha256').update(key).digest('hex')}.json.gz`;
    blobs.set(storagePath, gzipSync(bytes)); seed('completed', { resultStoragePath: storagePath, resultSha256: createHash('sha256').update(bytes).digest('hex') });
    assert.equal((await api.readImageOperation(uid, operationId)).status, 'completed'); checks++;
    const beforeDownloads = downloads; seed('completed', { resultStoragePath: 'other-private-data', resultSha256: 'a'.repeat(64) }); await assert.rejects(api.readImageOperation(uid, operationId)); assert.equal(downloads, beforeDownloads); checks++;
    const model = { id: 'openai/gpt-image-2', architecture: { output_modalities: ['image'], input_modalities: ['image'] }, supported_parameters: { input_references: {} } };
    catalog = [model]; const input = { apiKey: 'fixture', payload: { strictModel: true, model: model.id, resourceMode: 'efficient' }, referenceImages: [{}], references: [{}], configuredModel: 'other' };
    assert.equal((await api.selectOpenRouterImageModel(input)).id, model.id); checks++;
    catalog = []; await assert.rejects(api.selectOpenRouterImageModel(input)); checks++;
    fail = true; await assert.rejects(api.selectOpenRouterImageModel(input)); checks++;
    assert.equal((await api.selectOpenRouterImageModel({ ...input, payload: { model: model.id } })).selectionSource, 'fallback'); checks++;
    assert.equal(writes, 0);
    console.log('PASS image recovery and model:', file);
  }
  const schema = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/schemas/emoticonAnimationPreset.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, { module: schema, exports: schema.exports, require });
  const preset = { name: 'test', category: 'test', summary: 'this summary is long enough', dialogue: '', fps: 8, loop: true, loopGuide: 'loop', frames: [1, 2].map((order) => ({ order, phase: 'phase', pose: 'this pose is long enough', durationMs: 125, continuityNotes: 'same', imagePrompt: 'this image prompt is definitely longer than forty characters' })) };
  for (const file of ['src/app/api/emoticon-studio/plan/route.ts', 'functions/src/api/hostingEmoticonStudioRoutes.ts']) {
    const docs = new Map(); let writes = 0;
    const db = { collection: (name) => ({ doc: (id) => ({ get: async () => ({ exists: docs.has(`${name}/${id}`), data: () => docs.get(`${name}/${id}`) }), set: () => { writes++; throw Error('unexpected write'); } }) }) };
    const context = vm.createContext({ createHash, z, adminDb: db, db, EmoticonAnimationPresetSchema: schema.exports.EmoticonAnimationPresetSchema, PresetSchema: schema.exports.EmoticonAnimationPresetSchema });
    vm.runInContext(extract(file, ['operationRef', 'readPlanOperation', 'planSuccess']) + '\nglobalThis.api={readPlanOperation,planSuccess};', context);
    const key = createHash('sha256').update(`${uid}:emoticon-animation-plan:${operationId}`).digest('hex');
    assert.equal((await context.api.readPlanOperation(uid, operationId)).status, 'not-found'); checks++;
    const seed = (status, extra = {}) => docs.set(`aiOperationReservations/${key}`, { uid, operation: 'emoticon-animation-plan', operationId, status, ...extra });
    seed('completed', { result: preset, costUsd: 0.3, modelUsed: 'fixture-model' }); const recovered = await context.api.readPlanOperation(uid, operationId);
    assert.equal(recovered.result.costUsd, 0.3); assert.equal(recovered.result.modelUsed, 'fixture-model'); assert.equal(recovered.result.cached, true); checks++;
    seed('completed', { result: preset }); assert.equal((await context.api.readPlanOperation(uid, operationId)).result.costUsd, null); checks++;
    seed('completed', { result: preset, uid: 'other' }); await assert.rejects(context.api.readPlanOperation(uid, operationId)); checks++;
    seed('completed', { result: {} }); await assert.rejects(context.api.readPlanOperation(uid, operationId)); checks++;
    assert.equal(writes, 0); console.log('PASS plan recovery:', file);
  }
  const saved = new Map();
  const journal = { exports: {} };
  let lockAvailable = true, actions = 0;
  const localStorage = { getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/admin/emoticon-studio/studio-operation-journal.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, {
    module: journal, exports: journal.exports, require, localStorage,
    navigator: { locks: { request: async (_key, _options, callback) => callback(lockAvailable ? {} : null) } },
  });
  const j = journal.exports;
  const op = { id: operationId, projectId: 'project-a', ownerId: uid, kind: 'image', state: 'uncertain', applied: false, costUsd: null, createdAt: 1, frameId: operationId, replaceFrameId: 'old-frame', sourceRevision: 'original-character', slot: { sceneId: 'scene-a', keyframeId: 'frame-a', keyframeIndex: 0, caption: 'hello', durationMs: 80 } };
  j.writeStudioOperations(uid, 'project-a', [op]);
  assert.equal(j.readStudioOperations(uid, 'project-a')[0].costUsd, null); checks++;
  assert.equal(j.readStudioOperations('other', 'project-a').length, 0); checks++;
  assert.throws(() => j.writeStudioOperations('other', 'project-a', [op])); checks++;
  assert.equal(j.operationMatchesSlot(op, 'scene-a', 'frame-a'), true);
  assert.equal(j.operationMatchesSlot({ ...op, state: 'failed' }, 'scene-a', 'frame-a'), false);
  assert.equal(j.operationMatchesSlot({ ...op, state: 'completed', applied: false }, 'scene-a', 'frame-a'), true); checks++;
  await j.withStudioOperationLock(uid, 'project-a', async () => { actions++; });
  lockAvailable = false;
  await assert.rejects(j.withStudioOperationLock(uid, 'project-a', async () => { actions++; }));
  assert.equal(actions, 1); checks++;
  const remapped = j.remapStudioOperations([op], 'project-b', new Map([['old-frame', 'new-frame']]));
  assert.equal(remapped[0].id, operationId);
  assert.equal(remapped[0].projectId, 'project-b');
  assert.equal(remapped[0].ownerId, uid);
  assert.equal(remapped[0].replaceFrameId, 'new-frame');
  assert.equal(remapped[0].sourceRevision, 'original-character');
  j.writeStudioOperations(uid, 'project-b', remapped);
  assert.equal(j.readStudioOperations(uid, 'project-b')[0].state, 'uncertain'); checks++;
  assert.throws(() => j.remapStudioOperations([{ ...op, costUsd: -1 }], 'project-b', new Map())); checks++;
  console.log('PASS client journal: ownership, uncertain recovery, cross-tab lock, backup remap');
  console.log(JSON.stringify({ suite: 'emoticon-operation-recovery', checks, writes: 0, network: 0 }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
