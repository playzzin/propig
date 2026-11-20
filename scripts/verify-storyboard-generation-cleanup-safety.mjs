import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [historySource, hookSource, nextDeleteRoute, functionsDeleteRoute, deletionCore, rules, storyboardSchema] = await Promise.all([
    read('src/services/imageGenerationService.ts'),
    read('src/hooks/useStoryboardImageGeneration.ts'),
    read('src/app/api/storyboards/[storyboardId]/route.ts'),
    read('functions/src/api/hostingStoryboardRoutes.ts'),
    read('functions/src/api/storyboardDeletion.ts'),
    read('firestore.rules'),
    read('src/schemas/imageStoryboard.ts'),
]);

function load(source, imports, globals = {}) {
    const compiled = ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
        reportDiagnostics: true,
    });
    assert.equal(compiled.diagnostics.length, 0);
    const exports = {};
    vm.runInNewContext(compiled.outputText, {
        exports,
        require: (name) => {
            assert(Object.hasOwn(imports, name), `Unexpected mocked import: ${name}`);
            return imports[name];
        },
        console: { log() {}, error() {}, warn() {} },
        process: { env: { NODE_ENV: 'production' } },
        URLSearchParams,
        ...globals,
    });
    return exports;
}

async function verifyProvenanceCapture() {
    const window = { location: { pathname: '/admin/storyboard', search: '?storyboard=original-project&scene=original-scene' } };
    let saved;
    let beforeGeneration = () => undefined;
    const hook = load(hookSource, {
        '@tanstack/react-query': { useMutation: (options) => ({ mutateAsync: options.mutationFn }) },
        sonner: { toast: { loading() {}, success() {}, error() {} } },
        '@/contexts/AuthContext': { useAuth: () => ({ currentUser: { uid: 'fixture-user', getIdToken: async () => { beforeGeneration(); return 'fixture-token'; } } }) },
        '@/services/imageGenerationService': {
            generateImage: async () => {
                window.location.search = '?storyboard=another-project&scene=another-scene';
                return { success: true, imageUrl: 'fixture://provider-image', imageId: 'fixture-image' };
            },
            saveGenerationHistory: async (params) => {
                saved = params;
                return { downloadUrl: 'fixture://saved-image', historyId: 'fixture-history', storagePath: 'ai_generations/fixture-user/image.png' };
            },
        },
        '@/types/imageReference': { MAX_IMAGE_REFERENCE_REQUESTS: 8 },
    }, { window });
    const generate = hook.useStoryboardImageGeneration().generateStoryboardScene;
    beforeGeneration = () => { window.location.search = '?storyboard=changed-during-auth'; };
    await generate({ prompt: 'fixture prompt' });
    assert.equal(saved.artifactProvenance.storyboardId, 'original-project', 'Project identity must be captured before auth/provider awaits');
    assert.equal(saved.artifactProvenance.sceneId, 'original-scene');
    assert.equal(saved.artifactProvenance.kind, 'storyboard-scene');
    await generate({ prompt: 'fixture prompt', artifactProvenance: { kind: 'storyboard-scene', storyboardId: 'batch-project', sceneId: 'batch-scene-2' } });
    assert.equal(saved.artifactProvenance.storyboardId, 'batch-project');
    assert.equal(saved.artifactProvenance.sceneId, 'batch-scene-2', 'Batch generation must record the requested scene rather than the selected URL scene');
    await generate({ prompt: 'fixture prompt', artifactProvenance: null });
    assert.equal(saved.artifactProvenance, null, 'Explicit unrelated generation must not inherit URL provenance');
    beforeGeneration = () => undefined;
    for (const invalid of ['', '.', '..', 'nested/document', 'x'.repeat(241)]) {
        window.location.search = `?storyboard=${encodeURIComponent(invalid)}`;
        await generate({ prompt: 'fixture prompt' });
        assert.equal(saved.artifactProvenance, null, `Unsafe project provenance accepted: ${invalid.slice(0, 24)}`);
    }
    window.location = { pathname: '/admin/photos', search: '?storyboard=original-project' };
    await generate({ prompt: 'fixture prompt' });
    assert.equal(saved.artifactProvenance, null);
    console.log('PASS generation keeps its original project through navigation and rejects invalid provenance');
}

function historyFixture({ initial = {}, transaction = {}, downloadFailure = false } = {}) {
    const documents = new Map();
    const files = new Set();
    const deletedFiles = [];
    let fetchCount = 0;
    const snapshot = (value) => ({ exists: () => value !== null, data: () => value ?? undefined });
    const reference = (segments) => ({ path: segments.join('/'), id: segments.at(-1) });
    const firestore = {
        collection: (_db, ...segments) => reference(segments),
        doc: (base, ...segments) => segments.length ? reference(base.path ? [base.path, ...segments] : segments) : reference([base.path, 'fixture-history']),
        getDoc: async () => snapshot(initial),
        addDoc: async (collection, data) => {
            const ref = reference([collection.path, 'fixture-history']);
            documents.set(ref.path, data);
            return ref;
        },
        serverTimestamp: () => 'fixture-timestamp',
        runTransaction: async (_db, callback) => {
            const writes = [];
            await callback({
                get: async () => snapshot(transaction),
                set: (ref, data) => writes.push([ref.path, data]),
            });
            for (const [key, value] of writes) documents.set(key, value);
        },
    };
    const service = load(historySource, {
        'firebase/firestore': firestore,
        'firebase/storage': {
            ref: (_storage, name) => ({ name }),
            uploadBytes: async (ref) => files.add(ref.name),
            getDownloadURL: async (ref) => {
                if (downloadFailure) throw Error('Fixture download URL failure');
                return `fixture://${ref.name}`;
            },
            deleteObject: async (ref) => { deletedFiles.push(ref.name); files.delete(ref.name); },
        },
        '@/firebase/config': { db: {} },
        '@/firebase/storage': { storage: {} },
    }, {
        fetch: async () => { fetchCount += 1; return { ok: true, blob: async () => ({ fixture: true }) }; },
    });
    const save = (overrides = {}) => service.saveGenerationHistory({
        userId: 'fixture-user', url: 'fixture://provider-result', type: 'image', generatedId: 'fixture-image', prompt: 'fixture prompt', provider: 'openrouter',
        artifactProvenance: { kind: 'storyboard-scene', storyboardId: 'fixture-storyboard', sceneId: 'fixture-scene' },
        ...overrides,
    });
    return { save, documents, files, deletedFiles, fetchCount: () => fetchCount };
}

async function verifyGenerationSaveRace() {
    for (const state of [null, { cleanupStatus: 'pending' }, { cleanupStatus: 'retry', cleanupManifest: { generationIds: ['fixture-history'] } }]) {
        const beforeUpload = historyFixture({ initial: state });
        await assert.rejects(beforeUpload.save(), /삭제/);
        assert.equal(beforeUpload.fetchCount(), 0, 'A locked/deleted project must not fetch or upload generated output');
        assert.equal(beforeUpload.files.size, 0);
        assert.equal(beforeUpload.documents.size, 0);

        const afterUpload = historyFixture({ transaction: state });
        await assert.rejects(afterUpload.save(), /삭제/);
        assert.equal(afterUpload.files.size, 0, 'An output uploaded while deletion starts must be removed');
        assert.equal(afterUpload.deletedFiles.length, 1);
        assert.equal(afterUpload.documents.size, 0, 'A failed transaction cannot leave a generation history');
    }
    const failedDownload = historyFixture({ downloadFailure: true });
    await assert.rejects(failedDownload.save(), /Fixture/);
    assert.equal(failedDownload.files.size, 0);
    assert.equal(failedDownload.deletedFiles.length, 1);

    const success = historyFixture();
    const result = await success.save();
    const history = success.documents.get('ai_generations/fixture-history');
    assert.equal(result.historyId, 'fixture-history');
    assert.equal(history.storagePath, result.storagePath);
    assert.equal(history.artifactProvenance.storyboardId, 'fixture-storyboard');
    assert.equal(success.files.has(result.storagePath), true);

    const residualCleanup = historyFixture({ initial: { cleanupStatus: 'retry' }, transaction: { cleanupStatus: 'retry' } });
    await residualCleanup.save();
    assert.equal(residualCleanup.documents.size, 1, 'Ordinary residual-file cleanup failure must not lock project editing');

    const independent = historyFixture({ initial: null });
    await independent.save({ artifactProvenance: null });
    assert.equal(independent.documents.size, 1, 'Non-storyboard generation remains supported');
    console.log('PASS generation save lock, transaction deletion race, orphan rollback, and ordinary generation');
}

await verifyProvenanceCapture();
await verifyGenerationSaveRace();

for (const source of [nextDeleteRoute, functionsDeleteRoute, deletionCore]) {
    assert.doesNotMatch(source, /status:\s*["']reference_audit_required["']/);
    assert.doesNotMatch(source, /automaticDeletionAllowed:\s*false/);
    assert.doesNotMatch(source, /deleteFiles\(\{\s*prefix:\s*`ai_generations\//);
    assert.doesNotMatch(source, /force:\s*true/, 'Storage cleanup errors must remain retryable');
}
assert.match(rules, /match \/storyboardArtifactCleanupCandidates\/\{candidateId\}[\s\S]*allow read: if isOwner\(userId\) \|\| isAdmin\(\);[\s\S]*allow create, update, delete: if false;/);
assert.match(rules, /collectionId != 'storyboardArtifactCleanupCandidates'/);
assert.match(storyboardSchema, /generatedImage:\s*z\.object\([\s\S]*storagePath:[\s\S]*\.nullable\(\)\.optional\(\),[\s\S]*provenance:\s*StoryboardGeneratedImageProvenanceSchema\.optional\(\)/);
console.log('Storyboard generation cleanup safety verification passed.');
