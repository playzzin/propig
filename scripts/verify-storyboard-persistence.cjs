/* Real service/schema/workflow with in-memory Firestore and Storage.
 * No credentials, network requests, project data, or paid providers are used.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { webcrypto } = require('node:crypto');

const repo = path.resolve(__dirname, '..');
const runtime = createRequire(path.join(process.env.PROPIG_TEST_RUNTIME || repo, 'package.json'));
const ts = runtime('typescript');
const copy = value => structuredClone(value);
const userId = 'fixture-user';
const projectPath = id => `users/${userId}/imageStoryboards/${id}`;

function fixture() {
  const documents = new Map(), files = new Set(), modules = new Map();
  const commits = [], deletedFiles = [];
  const versions = new Map();
  const stages = { failRecords: false, failDownload: false, beforeCommit: null };
  let nextId = 0;
  const ref = pathname => ({ path: pathname, id: pathname.split('/').at(-1) });
  const child = (base, segments) => ref([base?.path, ...segments].filter(Boolean).join('/'));
  const put = (pathname, value) => {
    documents.set(pathname, copy(value));
    versions.set(pathname, (versions.get(pathname) || 0) + 1);
  };
  const snapshot = reference => {
    const value = documents.get(reference.path);
    const captured = value === undefined ? undefined : copy(value);
    return { id: reference.id, ref: reference, exists: () => captured !== undefined, data: () => captured };
  };
  const list = reference => {
    const prefix = `${reference.path}/`;
    const docs = [...documents.keys()]
      .filter(key => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
      .map(key => snapshot(ref(key)));
    return { docs, empty: docs.length === 0, size: docs.length, forEach: fn => docs.forEach(fn) };
  };
  const commit = async (operations, reads = null) => {
    if (stages.beforeCommit) await stages.beforeCommit(operations);
    if (reads && [...reads].some(([key, version]) => (versions.get(key) || 0) !== version)) return false;
    if (stages.failRecords && operations.some(item => item.ref.path.includes('/artifacts/'))) {
      throw new Error('Fixture artifact write rejected');
    }
    for (const operation of operations) {
      const key = operation.ref.path;
      if (operation.kind === 'delete') {
        documents.delete(key);
        versions.set(key, (versions.get(key) || 0) + 1);
      } else {
        put(key, operation.merge ? { ...documents.get(key), ...operation.data } : operation.data);
      }
    }
    commits.push(operations.map(operation => ({ ...operation, data: copy(operation.data) })));
    return true;
  };
  const writer = operations => ({
    set: (reference, data, options) => operations.push({ kind: 'set', ref: reference, data: copy(data), merge: options?.merge === true }),
    update: (reference, data) => operations.push({ kind: 'update', ref: reference, data: copy(data), merge: true }),
    delete: reference => operations.push({ kind: 'delete', ref: reference }),
  });
  const firestore = {
    collection: (base, ...segments) => child(base, segments),
    doc: (base, ...segments) => child(base, segments.length ? segments : [`fixture-${++nextId}`]),
    getDoc: async reference => snapshot(reference),
    getDocs: async reference => list(reference),
    query: reference => reference,
    orderBy: () => ({}), limit: () => ({}),
    serverTimestamp: () => 1234,
    setDoc: async (reference, data, options) => commit([{ kind: 'set', ref: reference, data: copy(data), merge: options?.merge === true }]),
    deleteDoc: async reference => commit([{ kind: 'delete', ref: reference }]),
    writeBatch: () => {
      const operations = [];
      return { ...writer(operations), commit: () => commit(operations) };
    },
    runTransaction: async (_db, callback) => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const operations = [], reads = new Map();
        const result = await callback({
          ...writer(operations),
          get: async reference => {
            assert.equal(operations.length, 0, 'Firestore transaction reads must precede writes');
            reads.set(reference.path, versions.get(reference.path) || 0);
            return snapshot(reference);
          },
        });
        if (await commit(operations, reads)) return result;
      }
      throw new Error('Fixture transaction contention did not settle');
    },
  };
  const mocks = {
    'firebase/firestore': firestore,
    'firebase/storage': {
      ref: (_storage, pathname) => ({ fullPath: pathname }),
      uploadBytes: async reference => { files.add(reference.fullPath); },
      getDownloadURL: async reference => {
        if (stages.failDownload) throw new Error('Fixture download URL unavailable');
        return `https://storage.fixture.invalid/${encodeURIComponent(reference.fullPath)}`;
      },
      deleteObject: async reference => { deletedFiles.push(reference.fullPath); files.delete(reference.fullPath); },
      getMetadata: async () => ({ size: 1 }),
    },
    '@/firebase/config': { db: {} },
    '@/firebase/storage': { storage: {} },
  };
  const context = vm.createContext({
    console, crypto: webcrypto, URL, URLSearchParams, Date, Error, Blob, structuredClone,
    fetch: async url => {
      assert.equal(new URL(url).hostname, 'media.fixture.invalid', 'Only fixture media may be fetched');
      return { ok: true, blob: async () => new Blob(['fixture'], { type: url.endsWith('.mp4') ? 'video/mp4' : 'image/png' }) };
    },
  });
  function load(filename) {
    const full = path.resolve(repo, filename);
    if (modules.has(full)) return modules.get(full).exports;
    const module = { exports: {} }; modules.set(full, module);
    const compiled = ts.transpileModule(fs.readFileSync(full, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
      reportDiagnostics: true,
    });
    assert.equal(compiled.diagnostics.length, 0, `Transpile diagnostics: ${filename}`);
    const localRequire = id => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.startsWith('@/') || id.startsWith('.')) {
        const base = id.startsWith('@/') ? path.join(repo, 'src', id.slice(2)) : path.resolve(path.dirname(full), id);
        const resolved = [base, `${base}.ts`, `${base}.tsx`].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
        assert(resolved, `Unresolved import: ${id}`);
        return load(resolved);
      }
      return runtime(id);
    };
    vm.runInContext(`(function(require,module,exports){\n${compiled.outputText}\n})`, context, { filename: full })(localRequire, module, module.exports);
    return module.exports;
  }
  const { imageStoryboardService: service, StoryboardConflictError } = load('src/services/imageStoryboardService.ts');
  const schema = load('src/schemas/imageStoryboard.ts');
  const workflow = load('src/lib/storyboard-workflow.ts');
  const makeProject = () => schema.ImageStoryboardSchema.parse({
    title: 'Fixture storyboard', topic: '테스트 프로젝트', logline: '', audience: '', aspectRatio: '16:9',
    stylePreset: 'cinematic', artDirection: '', characterContinuity: '', settingContinuity: '', colorAndLighting: '',
    scenes: [1, 2].map(order => ({
      id: `scene-${order}`, order, title: `장면 ${order}`, status: 'generated', duration: '6초',
      narrativeBeat: 'fixture scene', shotSize: 'medium', cameraDirection: '', dialogueOrCaption: '',
      visualPrompt: 'fixture image', imagePrompt: 'fixture image', negativePrompt: '',
      generatedImage: { id: `image-${order}`, url: `https://media.fixture.invalid/image-${order}.png`, generatedAt: 1 },
      video: {
        ...schema.createStoryboardVideoScene(), status: 'approved', motionPrompt: 'fixture motion',
        clipId: `clip-${order}`, videoUrl: `https://media.fixture.invalid/clip-${order}.mp4`, approvedAt: 1,
      },
    })),
  });
  const assertRecords = (id, storyboard) => {
    for (const artifact of workflow.deriveStoryboardArtifacts(storyboard)) {
      const persisted = documents.get(`${projectPath(id)}/artifacts/${artifact.id}`);
      assert(persisted, `Persisted artifact: ${artifact.id}`);
      for (const [key, value] of Object.entries(artifact)) assert.equal(JSON.stringify(persisted[key]), JSON.stringify(value), `Artifact ${artifact.id}.${key}`);
    }
    for (const transition of workflow.buildStoryboardTransitionLinks(storyboard)) {
      assert(documents.has(`${projectPath(id)}/transitionLinks/${transition.id}`), `Persisted transition: ${transition.id}`);
    }
  };
  return { service, StoryboardConflictError, schema, workflow, documents, files, commits, deletedFiles, stages, put, makeProject, assertRecords };
}

async function run() {
  {
    const f = fixture(), source = f.makeProject();
    f.stages.failRecords = true;
    await assert.rejects(f.service.create(userId, source), /Fixture artifact/);
    assert.equal(f.documents.size, 0, 'Failed project creation must not leave a parent or partial records');
    f.stages.failRecords = false;
    const id = await f.service.create(userId, source);
    assert.equal([...f.documents.keys()].filter(key => /^users\/[^/]+\/imageStoryboards\/[^/]+$/.test(key)).length, 1);
    f.assertRecords(id, f.documents.get(projectPath(id)));
    assert.equal(f.commits.length, 1, 'Create parent and records must publish in one commit');
    console.log('PASS atomic create failure/retry and matching production records');
  }
  {
    const f = fixture(), source = f.makeProject();
    const id = await f.service.create(userId, source);
    const original = copy(f.documents.get(projectPath(id)));
    const changed = { ...original, title: 'Changed fixture', scenes: original.scenes.map((scene, index) => index ? scene : { ...scene, imageDesignRevision: 2 }) };
    const before = JSON.stringify([...f.documents]);
    f.stages.failRecords = true;
    await assert.rejects(f.service.save(userId, id, changed), /Fixture artifact/);
    assert.equal(JSON.stringify([...f.documents]), before, 'Failed artifact write must leave parent revision and records unchanged');
    f.stages.failRecords = false;
    const revision = await f.service.save(userId, id, changed);
    assert.equal(revision, original.revision + 1, 'Retry must succeed with the same client revision');
    f.assertRecords(id, f.documents.get(projectPath(id)));
    assert(f.commits.at(-1).some(item => item.ref.path === projectPath(id)));
    assert(f.commits.at(-1).some(item => item.ref.path.includes('/artifacts/')));
    console.log('PASS atomic save failure/retry avoids a false revision conflict');
  }
  {
    const f = fixture(), source = f.makeProject();
    const id = await f.service.create(userId, source);
    const prior = copy(f.documents.get(projectPath(id)));
    const artifactPath = `${projectPath(id)}/artifacts/${f.workflow.deriveStoryboardArtifacts(prior)[0].id}`;
    const newer = { ...prior, revision: prior.revision + 1, title: 'Newer concurrent editor' };
    f.stages.beforeCommit = operations => {
      if (!operations.some(item => item.ref.path === projectPath(id))) return;
      f.stages.beforeCommit = null;
      f.put(projectPath(id), newer);
      f.put(artifactPath, { ...f.documents.get(artifactPath), concurrentMarker: 'newer-version' });
    };
    await assert.rejects(f.service.save(userId, id, { ...prior, title: 'Stale editor' }), f.StoryboardConflictError);
    assert.equal(f.documents.get(projectPath(id)).title, newer.title);
    assert.equal(f.documents.get(artifactPath).concurrentMarker, 'newer-version');
    assert.equal(f.commits.length, 1, 'A stale editor must publish neither parent nor production records');
    console.log('PASS transaction contention preserves the newer revision and artifacts');
  }
  {
    const f = fixture(), source = f.makeProject();
    f.stages.failRecords = true;
    await assert.rejects(f.service.duplicateWithMedia(userId, source), /Fixture artifact/);
    assert.equal(f.documents.size, 0, 'Failed media copy must leave no project/clip/artifact documents');
    assert.equal(f.files.size, 0, 'Uncommitted copied files must be reclaimed');
    assert(f.deletedFiles.length > 0, 'Fixture must exercise uploaded-file cleanup');
    f.stages.failRecords = false;
    const id = await f.service.duplicateWithMedia(userId, source);
    const stored = f.documents.get(projectPath(id));
    f.assertRecords(id, stored);
    assert.equal(f.files.size, 4, 'Successful copied images/videos must remain available');
    assert.equal(f.commits.length, 1, 'Media copy parent, clips, and production records must publish together');
    for (const scene of stored.scenes) {
      assert(f.files.has(decodeURIComponent(new URL(scene.generatedImage.url).pathname.slice(1))));
      assert(f.files.has(decodeURIComponent(new URL(scene.video.videoUrl).pathname.slice(1))));
    }
    console.log('PASS atomic media-copy rollback and retry retain valid result files');
  }
  {
    const f = fixture(), source = f.makeProject();
    f.stages.failDownload = true;
    await assert.rejects(f.service.duplicateWithMedia(userId, source), /Fixture download URL/);
    assert.equal(f.files.size, 0, 'A failed download-URL lookup must reclaim the file uploaded immediately before it');
    assert.equal(f.documents.size, 0);
    assert.equal(f.deletedFiles.length, 1);
    console.log('PASS failed copied-file URL lookup leaves no orphan upload');
  }
  {
    const f = fixture(), source = f.makeProject();
    source.referenceAssets = [{ id: 'source-reference', image: 'https://media.fixture.invalid/reference.png', role: 'style', name: 'Fixture reference', storagePath: null, createdAt: 1 }];
    source.videoProduction.voiceProfiles = [{ id: 'fixture-voice', characterName: '테스트 인물', voiceDescription: '낮고 차분한 목소리', speakingStyle: '자연스럽게' }];
    source.scenes[0].video = { ...source.scenes[0].video, voiceProfileId: 'fixture-voice', referenceAssetIds: ['source-reference'], replacedClipId: 'source-retired-clip', jobId: 'source-job' };
    const id = await f.service.duplicateWithMedia(userId, source);
    const stored = f.documents.get(projectPath(id));
    const scene = stored.scenes[0];
    assert.notEqual(stored.referenceAssets[0].id, source.referenceAssets[0].id);
    assert.equal(scene.video.referenceAssetIds[0], stored.referenceAssets[0].id, 'The copied scene must select its copied reference asset');
    assert.equal(stored.videoProduction.voiceProfiles[0].id, scene.video.voiceProfileId, 'The copied scene voice must resolve to its copied project profile');
    assert.equal(stored.videoProduction.voiceProfiles[0].voiceDescription, source.videoProduction.voiceProfiles[0].voiceDescription);
    assert.equal(scene.video.jobId, null);
    assert.equal(scene.video.replacedClipId, null, 'Copied projects must not retain source clip cleanup targets');
    assert.equal(scene.generatedImage.provenance.storyboardId, id);
    assert.equal(scene.generatedImage.provenance.sceneId, scene.id);
    assert(scene.generatedImage.storagePath.startsWith(`users/${userId}/storyboards/${id}/`));
    assert(f.files.has(scene.generatedImage.storagePath), 'Copied image provenance must identify its own existing storage object');
    console.log('PASS full copy retains voice design and remaps references, image ownership, and job state');
  }
  console.log('PASS storyboard persistence — real service/domain logic; simulated IO only');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
