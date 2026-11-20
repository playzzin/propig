/* eslint-disable @typescript-eslint/no-require-imports -- This CommonJS harness also resolves transpiled CommonJS imports. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const ts = require('typescript');

// Runs the actual deletion route with isolated, in-memory Firestore and Storage.
// No Firebase credentials, network request, or real user document is accessed.
const sourcePath = path.resolve(__dirname, '../functions/src/api/hostingStoryboardRoutes.ts');
const USER = 'deletion-fixture-user';
const STORYBOARD = 'deletion-fixture-storyboard';
const PROJECT = 'deletion-fixture-video';
const storyboardPath = `users/${USER}/imageStoryboards/${STORYBOARD}`;
const storyboardPrefix = `users/${USER}/storyboards/${STORYBOARD}/`;
const videoPrefix = `video_studio/${USER}/${PROJECT}/`;
const generationPath = (id) => `ai_generations/${USER}/${id}.png`;
const downloadUrl = (storagePath) => `https://firebasestorage.googleapis.com/v0/b/fixture.appspot.com/o/${encodeURIComponent(storagePath)}?alt=media&token=fixture`;

class ApiError extends Error {
    constructor(status, message, code) {
        super(message);
        this.status = status;
        this.statusCode = status;
        this.code = code;
    }
}

function createFixture(entries = {}) {
    const documents = new Map(Object.entries(entries).map(([key, value]) => [key, structuredClone(value)]));
    const files = new Set();
    const fileContents = new Map();
    const fileDeletions = [];
    const prefixDeletions = [];
    const batchSizes = [];
    const writes = [];
    const failures = new Set();
    let transactionQueue = Promise.resolve();
    let clock = 0;

    const readField = (object, key) => key.split('.').reduce((value, part) => value?.[part], object);
    const applySet = (reference, data, options) => {
        writes.push({ type: 'set', path: reference.path, data: structuredClone(data) });
        const next = options?.merge ? { ...documents.get(reference.path), ...data } : structuredClone(data);
        for (const [key, value] of Object.entries(next)) if (value?.__mockDelete) delete next[key];
        documents.set(reference.path, next);
    };
    const applyDelete = (reference) => {
        writes.push({ type: 'delete', path: reference.path });
        documents.delete(reference.path);
    };
    const snapshot = (reference) => ({
        ref: reference,
        id: reference.id,
        exists: documents.has(reference.path),
        data: () => documents.has(reference.path) ? structuredClone(documents.get(reference.path)) : undefined,
        get: (field) => readField(documents.get(reference.path), field),
    });

    function doc(documentPath) {
        const segments = documentPath.split('/');
        assert.equal(segments.length % 2, 0, `Invalid document path: ${documentPath}`);
        assert(segments.every(Boolean), `Empty document path segment: ${documentPath}`);
        const reference = {
            path: documentPath,
            id: segments.at(-1),
            parent: collection(segments.slice(0, -1).join('/')),
            get: async () => snapshot(reference),
            set: async (data, options) => applySet(reference, data, options),
            update: async (data) => applySet(reference, data, { merge: true }),
            delete: async () => applyDelete(reference),
            collection: (name) => collection(`${documentPath}/${name}`),
            listCollections: async () => {
                const names = new Set([...documents.keys()].filter((key) => key.startsWith(`${documentPath}/`)).map((key) => key.slice(documentPath.length + 1).split('/')[0]));
                return [...names].map((name) => collection(`${documentPath}/${name}`));
            },
        };
        return reference;
    }

    function query(base, filters = [], options = {}) {
        const reference = {
            path: base,
            where: (field, operator, value) => query(base, [...filters, [field, operator, value]], options),
            limit: (count) => query(base, filters, { ...options, limit: count }),
            orderBy: () => reference,
            select: () => reference,
            get: async () => {
                let matches = [...documents].filter(([key, data]) => {
                    const segments = key.split('/');
                    const matchesCollection = options.group
                        ? segments.at(-2) === base
                        : key.startsWith(`${base}/`) && segments.length === base.split('/').length + 1;
                    return matchesCollection && filters.every(([field, operator, value]) => {
                        const actual = field === '__name__' ? key : readField(data, field);
                        if (operator === '==') return actual === value;
                        if (operator === 'in') return value.includes(actual);
                        if (operator === 'array-contains') return actual?.includes(value);
                        if (operator === '!=') return actual !== value;
                        throw Error(`Unsupported mock query operator: ${operator}`);
                    });
                });
                if (options.limit !== undefined) matches = matches.slice(0, options.limit);
                const docs = matches.map(([key]) => snapshot(doc(key)));
                return { docs, size: docs.length, empty: docs.length === 0, forEach: (callback) => docs.forEach(callback) };
            },
        };
        return reference;
    }

    function collection(collectionPath) {
        return {
            ...query(collectionPath),
            id: collectionPath.split('/').at(-1),
            doc: (id) => doc(`${collectionPath}/${id}`),
            listDocuments: async () => [...new Set([...documents.keys()].filter((key) => key.startsWith(`${collectionPath}/`)).map((key) => `${collectionPath}/${key.slice(collectionPath.length + 1).split('/')[0]}`))].map(doc),
        };
    }

    const db = {
        doc,
        collection,
        collectionGroup: (name) => query(name, [], { group: true }),
        getAll: async (...references) => references.map(snapshot),
        batch: () => {
            const operations = [];
            const batch = {
                set: (reference, data, options) => { operations.push(() => applySet(reference, data, options)); return batch; },
                update: (reference, data) => { operations.push(() => applySet(reference, data, { merge: true })); return batch; },
                delete: (reference) => { operations.push(() => applyDelete(reference)); return batch; },
                commit: async () => {
                    assert(operations.length <= 500, `Firestore batch limit exceeded: ${operations.length}`);
                    batchSizes.push(operations.length);
                    operations.forEach((operation) => operation());
                },
            };
            return batch;
        },
        recursiveDelete: async (reference) => {
            for (const key of [...documents.keys()]) {
                if (key === reference.path || key.startsWith(`${reference.path}/`)) applyDelete(doc(key));
            }
        },
        runTransaction: (callback) => {
            const next = transactionQueue.then(async () => {
                const staged = [];
                const transaction = {
                    get: async (reference) => reference.get(),
                    getAll: async (...references) => references.map(snapshot),
                    set: (reference, data, options) => staged.push(() => applySet(reference, data, options)),
                    update: (reference, data) => staged.push(() => applySet(reference, data, { merge: true })),
                    delete: (reference) => staged.push(() => applyDelete(reference)),
                };
                const value = await callback(transaction);
                staged.forEach((operation) => operation());
                return value;
            });
            transactionQueue = next.catch(() => undefined);
            return next;
        },
    };
    const file = (name) => ({
        name,
        delete: async () => {
            fileDeletions.push(name);
            if (failures.has(name)) throw Error('Fixture storage failure');
            files.delete(name);
            fileContents.delete(name);
        },
        exists: async () => [files.has(name)],
        getMetadata: async () => [{ name, size: String(fileContents.get(name)?.length ?? 12) }],
        download: async () => {
            assert(fileContents.has(name), `Missing fixture contents: ${name}`);
            return [fileContents.get(name)];
        },
    });
    const bucket = {
        name: 'fixture.appspot.com',
        file,
        getFiles: async ({ prefix }) => [[...files].filter((name) => name.startsWith(prefix)).map(file)],
        deleteFiles: async ({ prefix, force }) => {
            prefixDeletions.push(prefix);
            assert.notEqual(force, true, 'Forced prefix deletion can hide failures and leave untracked leftovers');
            for (const name of [...files].filter((candidate) => candidate.startsWith(prefix))) await file(name).delete();
        },
    };
    const admin = {
        storage: () => ({ bucket: () => bucket }),
        firestore: {
            FieldValue: { serverTimestamp: () => ({ seconds: ++clock }), delete: () => ({ __mockDelete: true }) },
            FieldPath: { documentId: () => '__name__' },
            Timestamp: { now: () => new Date(), fromMillis: (value) => new Date(value) },
        },
    };
    function loadModule(filename) {
        const exports = {};
        const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
            compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
            reportDiagnostics: true,
        });
        assert.equal(compiled.diagnostics.length, 0, 'Deletion route must transpile');
        vm.runInNewContext(compiled.outputText, {
            exports,
            require: (name) => {
                if (name === 'firebase-admin') return admin;
                if (name === './storyboardDeletion') return loadModule(path.resolve(path.dirname(filename), 'storyboardDeletion.ts'));
                if (name === 'node:crypto' || name === 'node:zlib' || name === 'zod') return require(name);
                if (name === './hostingCommon') return {
                    ApiError,
                    db,
                    requireMethod: (request, method) => { if (request.method !== method) throw new ApiError(405, 'Method not allowed'); },
                    requireUser: async (request) => { if (!request.userId) throw new ApiError(401, 'Authentication required'); return { uid: request.userId }; },
                };
                throw Error(`Unexpected route dependency: ${name}`);
            },
            URL,
            Date,
            Buffer,
            console,
            process: { env: {} },
        }, { filename });
        return exports;
    }
    const exports = loadModule(sourcePath);
    async function remove({ userId = USER, id = STORYBOARD, method = 'DELETE' } = {}) {
        let status;
        let body;
        const response = {
            status: (value) => { status = value; return response; },
            json: (value) => { body = value; return response; },
        };
        await exports.handleStoryboardById({ method, userId }, response, id);
        return { status, body };
    }
    return { documents, files, fileContents, fileDeletions, prefixDeletions, batchSizes, writes, failures, remove };
}

function projectEntries(extra = {}) {
    return {
        [storyboardPath]: {
            userId: USER,
            scenes: [{ id: 'scene-1', generatedImage: { id: 'current', url: downloadUrl(generationPath('current')), storagePath: generationPath('current') } }],
            videoProduction: { projectId: PROJECT },
        },
        [`video_studio_projects/${PROJECT}`]: { userId: USER, sourceStoryboardId: STORYBOARD },
        [`video_studio_clips/clip-1`]: { userId: USER, projectId: PROJECT, status: 'completed', videoUrl: downloadUrl(`${videoPrefix}clip.mp4`) },
        [`video_studio_jobs/job-1`]: { userId: USER, projectId: PROJECT, status: 'completed' },
        'ai_generations/current': generation('current'),
        ...extra,
    };
}

function generation(id, overrides = {}) {
    return {
        id: `provider-${id}`,
        userId: USER,
        url: downloadUrl(generationPath(id)),
        storagePath: generationPath(id),
        artifactProvenance: { kind: 'storyboard-scene', storyboardId: STORYBOARD, sceneId: 'scene-1' },
        ...overrides,
    };
}

async function main() {
    {
        const fixture = createFixture(projectEntries({
            [`${storyboardPath}/versions/version-1`]: { storyboard: { scenes: [{ id: 'scene-1', generatedImage: { id: 'old' } }] } },
            [`${storyboardPath}/artifacts/artifact-1`]: { storagePath: `${storyboardPrefix}artifact.png` },
            [`${storyboardPath}/transitionLinks/transition-1`]: {},
            [`${storyboardPath}/finalCuts/cut-1`]: {},
            [`${storyboardPath}/unknownFutureCollection/parent/nested/child`]: {},
            'ai_generations/current': generation('current'),
            'ai_generations/old': generation('old'),
            'ai_generations/replaced-without-version': generation('replaced-without-version'),
            [`users/${USER}/storyboardArtifactCleanupCandidates/old-candidate`]: { userId: USER, storyboardId: STORYBOARD, generationHistoryId: 'old' },
            [`users/${USER}/storyboardArtifactCleanupCandidates/other-candidate`]: { storyboardId: 'another-project' },
            'ai_generations/unrelated': generation('unrelated', { artifactProvenance: null }),
        }));
        for (const name of ['reference.png', 'artifact.png', 'final.mp4']) fixture.files.add(`${storyboardPrefix}${name}`);
        fixture.files.add(`${videoPrefix}clip.mp4`);
        fixture.files.add(`${videoPrefix}old-render.mp4`);
        for (const id of ['current', 'old', 'replaced-without-version', 'unrelated']) fixture.files.add(generationPath(id));
        const result = await fixture.remove();
        assert.equal(result.status, 200);
        assert.equal(result.body.success, true);
        assert(![...fixture.documents.keys()].some((key) => key === storyboardPath || key.startsWith(`${storyboardPath}/`)), 'Every project subcollection, including unknown nested collections, must disappear');
        for (const key of [`video_studio_projects/${PROJECT}`, 'video_studio_clips/clip-1', 'video_studio_jobs/job-1', 'ai_generations/current', 'ai_generations/old', 'ai_generations/replaced-without-version', `users/${USER}/storyboardArtifactCleanupCandidates/old-candidate`]) {
            assert(!fixture.documents.has(key), `Owned record remained: ${key}`);
        }
        assert.deepEqual([...fixture.files], [generationPath('unrelated')]);
        assert(fixture.documents.has('ai_generations/unrelated'));
        assert(fixture.documents.has(`users/${USER}/storyboardArtifactCleanupCandidates/other-candidate`));
        assert(!fixture.prefixDeletions.some((prefix) => prefix.startsWith('ai_generations/')), 'Generated images require exact-object deletion');
        assert(![...fixture.documents.values()].some((value) => value.status === 'reference_audit_required'), 'Deletion must not leave deferred cleanup candidates');
        const again = await fixture.remove();
        assert.equal(again.status, 200);
        assert.equal(again.body.alreadyDeleted, true);
        console.log('PASS full project cleanup, replaced history, nested subcollections, exact generated paths, and idempotent retry');
    }

    {
        const fixture = createFixture(projectEntries({ 'video_studio_jobs/job-1': { userId: USER, projectId: PROJECT, status: 'running' } }));
        fixture.files.add(`${storyboardPrefix}reference.png`);
        await assert.rejects(fixture.remove(), (error) => error.status === 409);
        assert(fixture.documents.has(storyboardPath));
        assert.equal(fixture.documents.get('video_studio_jobs/job-1').status, 'running');
        assert.equal(fixture.fileDeletions.length, 0);
        console.log('PASS active generation blocks deletion before changing jobs or files');
    }

    {
        const references = [
            ['albums/shared-album', { images: [{ url: downloadUrl(generationPath('current')) }] }],
            ['system_settings/site-branding', { logo: downloadUrl(`${storyboardPrefix}reference.png`) }],
            [`users/${USER}/imageStoryboards/another-project`, { scenes: [{ generatedImage: { id: 'current' } }] }],
            [`users/${USER}/imageStoryboards/another-project/versions/version-1`, { storyboard: { scenes: [{ generatedImage: { storagePath: generationPath('current') } }] } }],
            ['video_studio_clips/shared-clip', { userId: USER, projectId: 'another-project', imageUrl: downloadUrl(generationPath('current')) }],
            ['ai_generations/shared-history', generation('current', { artifactProvenance: { kind: 'storyboard-scene', storyboardId: 'another-project' } })],
        ];
        for (const [key, reference] of references) {
            const fixture = createFixture(projectEntries({
                ...(key.includes('/versions/') ? { [`users/${USER}/imageStoryboards/another-project`]: { name: 'Another project' } } : {}),
                [key]: reference,
            }));
            fixture.files.add(generationPath('current'));
            await assert.rejects(fixture.remove(), (error) => error.status === 409, `Shared reference must block: ${key}`);
            assert(fixture.documents.has(key));
            assert(fixture.documents.has(storyboardPath));
            assert(fixture.documents.has('ai_generations/current'));
            assert.equal(fixture.fileDeletions.length, 0);
            assert.equal(fixture.documents.get(storyboardPath).cleanupStatus, 'idle', 'A non-destructive preflight rejection must release the lock');
        }
        console.log('PASS shared album, branding, other storyboard/version, clip, and image history prevent any destructive cleanup');
    }

    {
        const fixture = createFixture(projectEntries());
        const attempts = await Promise.allSettled(Array.from({ length: 6 }, () => fixture.remove()));
        assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);
        assert(attempts.filter((attempt) => attempt.status === 'rejected').every((attempt) => attempt.reason.status === 409));
        assert(!fixture.documents.has(storyboardPath));
        const fresh = createFixture(projectEntries());
        fresh.documents.get(storyboardPath).cleanupStatus = 'pending';
        fresh.documents.get(storyboardPath).cleanupLeaseExpiresAt = new Date(Date.now() + 60000);
        await assert.rejects(fresh.remove(), (error) => error.status === 409);
        assert.equal(fresh.fileDeletions.length, 0);
        fresh.documents.get(storyboardPath).cleanupLeaseExpiresAt = new Date(Date.now() - 60000);
        assert.equal((await fresh.remove()).status, 200);
        console.log('PASS simultaneous delete has one winner, live lease blocks, and expired lease is retryable');
    }

    {
        for (const status of ['queued', 'uploading', 'unknown']) {
            const fixture = createFixture(projectEntries({ 'video_studio_jobs/job-1': { userId: USER, projectId: PROJECT, status } }));
            await assert.rejects(fixture.remove(), (error) => error.status === 409);
            assert.equal(fixture.fileDeletions.length, 0);
        }
        for (const state of [
            { status: 'canceled', updatedAt: new Date() },
            { status: 'completed', leaseExpiresAt: new Date(Date.now() + 60000) },
        ]) {
            const fixture = createFixture(projectEntries({ 'video_studio_jobs/job-1': { userId: USER, projectId: PROJECT, ...state } }));
            await assert.rejects(fixture.remove(), (error) => error.status === 409);
            assert.equal(fixture.fileDeletions.length, 0);
        }
        const settled = createFixture(projectEntries({ 'video_studio_jobs/job-1': { userId: USER, projectId: PROJECT, status: 'canceled', updatedAt: new Date(Date.now() - 13 * 60000) } }));
        assert.equal((await settled.remove()).status, 200);
        for (const status of ['pending', 'uncertain']) {
            const fixture = createFixture(projectEntries({ 'aiOperationReservations/image-operation': { uid: USER, operation: 'image-generation', status } }));
            await assert.rejects(fixture.remove(), (error) => error.status === 409);
            assert.equal(fixture.fileDeletions.length, 0);
        }
        console.log('PASS unfinished, leased, recently canceled video and in-flight image operations are protected');
    }

    {
        const serialized = Buffer.from(JSON.stringify({ imageId: 'provider-current', imageUrl: 'fixture://sensitive-provider-result' }));
        const resultSha256 = createHash('sha256').update(serialized).digest('hex');
        const compressedPath = `ai-operation-results/${createHash('sha256').update('compressed-operation').digest('hex')}.json.gz`;
        const base = { uid: USER, operation: 'image-generation', status: 'completed', budgetSettled: true, chargedUsd: 0.04, requestFingerprint: 'fixture-fingerprint' };
        const fixture = createFixture(projectEntries({
            'aiOperationReservations/inline-operation': { ...base, result: JSON.parse(serialized.toString()) },
            'aiOperationReservations/chunked-operation': { ...base, resultChunkCount: 1, resultSha256 },
            'aiOperationReservations/chunked-operation/resultChunks/chunk-0': { index: 0, data: serialized.toString('base64') },
            'aiOperationReservations/compressed-operation': { ...base, resultStoragePath: compressedPath, resultSha256 },
        }));
        fixture.files.add(compressedPath);
        fixture.fileContents.set(compressedPath, gzipSync(serialized));
        await fixture.remove();
        for (const id of ['inline-operation', 'chunked-operation', 'compressed-operation']) {
            const fence = fixture.documents.get(`aiOperationReservations/${id}`);
            assert.equal(fence.resultDeleted, true);
            assert.equal(fence.budgetSettled, true);
            assert.equal(fence.chargedUsd, 0.04);
            assert.equal(fence.requestFingerprint, 'fixture-fingerprint');
            for (const field of ['result', 'resultChunkCount', 'resultSha256', 'resultStoragePath']) assert.equal(fence[field], undefined, `Result payload field must be deleted: ${field}`);
        }
        assert(!fixture.documents.has('aiOperationReservations/chunked-operation/resultChunks/chunk-0'));
        assert(!fixture.files.has(compressedPath));
        assert.equal(fixture.documents.size, 3, 'Only settled replay/payment fences may remain');
        console.log('PASS inline, chunked, and compressed provider results removed while settled payment/replay fences remain');
    }

    {
        const fixture = createFixture(projectEntries({ 'ai_generations/current': generation('current') }));
        fixture.files.add(generationPath('current'));
        fixture.failures.add(generationPath('current'));
        await assert.rejects(fixture.remove());
        assert.equal(fixture.documents.get(storyboardPath)?.cleanupStatus, 'retry');
        assert(fixture.documents.has('ai_generations/current'), 'Failed object deletion must retain its history for retry');
        fixture.failures.clear();
        const result = await fixture.remove();
        assert.equal(result.status, 200);
        assert(!fixture.documents.has(storyboardPath));
        assert(!fixture.documents.has('ai_generations/current'));
        assert.equal(fixture.files.size, 0);
        console.log('PASS Storage failure retains retry record and retry removes all leftovers');
    }

    {
        const fixture = createFixture(projectEntries({
            'ai_generations/foreign': generation('foreign', { userId: 'another-user', storagePath: 'ai_generations/another-user/foreign.png' }),
            'video_studio_clips/foreign': { userId: 'another-user', projectId: 'another-project' },
            'video_studio_jobs/foreign': { userId: 'another-user', projectId: 'another-project', status: 'completed' },
            [`users/another-user/imageStoryboards/${STORYBOARD}`]: { userId: 'another-user' },
        }));
        fixture.files.add('ai_generations/another-user/foreign.png');
        await fixture.remove();
        for (const key of ['ai_generations/foreign', 'video_studio_clips/foreign', 'video_studio_jobs/foreign', `users/another-user/imageStoryboards/${STORYBOARD}`]) assert(fixture.documents.has(key), `Foreign record must remain: ${key}`);
        assert.equal(fixture.files.size, 1);
        const unsafe = createFixture(projectEntries({ 'ai_generations/unsafe': generation('unsafe', { storagePath: `ai_generations/${USER}/../another-user/foreign.png` }) }));
        await assert.rejects(unsafe.remove(), (error) => error.status === 409);
        assert(unsafe.documents.has('ai_generations/unsafe'));
        assert.equal(unsafe.fileDeletions.length, 0);
        const foreignChild = createFixture(projectEntries({ 'video_studio_jobs/foreign': { userId: 'another-user', projectId: PROJECT, status: 'completed' } }));
        await assert.rejects(foreignChild.remove(), (error) => error.status === 403);
        assert(foreignChild.documents.has('video_studio_jobs/foreign'));
        assert.equal(foreignChild.fileDeletions.length, 0);
        console.log('PASS foreign-owned documents and invalid paths are preserved');
    }

    {
        const extras = {};
        for (let index = 0; index < 610; index += 1) {
            extras[`video_studio_clips/bulk-${index}`] = { userId: USER, projectId: PROJECT };
            extras[`video_studio_jobs/bulk-${index}`] = { userId: USER, projectId: PROJECT, status: 'completed' };
            extras[`ai_generations/bulk-${index}`] = generation(`bulk-${index}`);
        }
        const fixture = createFixture(projectEntries(extras));
        await fixture.remove();
        assert.equal(fixture.documents.size, 0);
        assert(fixture.batchSizes.every((count) => count <= 500));
        console.log('PASS 610 clips, jobs, and generated assets respect Firestore write limits');
    }

    {
        const fixture = createFixture(projectEntries());
        await assert.rejects(fixture.remove({ userId: null }), (error) => error.status === 401);
        await assert.rejects(fixture.remove({ method: 'POST' }), (error) => error.status === 405);
        for (const id of ['', '.', '..', 'nested/document', 'x'.repeat(241)]) await assert.rejects(fixture.remove({ id }), (error) => error.status === 400);
        assert.equal(fixture.writes.length, 0);
        assert.equal(fixture.fileDeletions.length, 0);
        const foreign = createFixture(projectEntries({ [`video_studio_projects/${PROJECT}`]: { userId: 'another-user' } }));
        await assert.rejects(foreign.remove(), (error) => error.status === 403);
        assert(foreign.documents.has(`video_studio_projects/${PROJECT}`));
        assert.equal(foreign.fileDeletions.length, 0);
        console.log('PASS authentication, method, unsafe id, and video ownership boundaries');
    }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
