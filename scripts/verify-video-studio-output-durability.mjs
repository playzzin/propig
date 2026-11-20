import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
    buildVideoStudioOutputIdentity as buildFunctionIdentity,
    estimateVideoStudioMergeDuration as estimateFunctionMergeDuration,
    readProviderOutputStagingCheckpoint as readFunctionStaging,
    upsertVideoStudioOutputCheckpoint as upsertFunctionCheckpoint,
} from '../functions/src/videoStudio/outputDurability.ts';
import {
    buildVideoStudioOutputIdentity as buildNextIdentity,
    estimateVideoStudioMergeDuration as estimateNextMergeDuration,
    readProviderOutputStagingCheckpoint as readNextStaging,
    upsertVideoStudioOutputCheckpoint as upsertNextCheckpoint,
} from '../src/lib/server/video-studio-output-durability.ts';

const identityInput = {
    jobId: 'job/retry-safe',
    userId: 'user-1',
    projectId: 'project-1',
    segmentIndex: 2,
};
const functionIdentity = buildFunctionIdentity(identityInput);
const nextIdentity = buildNextIdentity(identityInput);

assert.deepEqual(nextIdentity, functionIdentity, 'Next and Functions output identities must stay identical.');
assert.equal(functionIdentity.clipId, 'job_job%2Fretry-safe_segment_002');
assert.equal(
    functionIdentity.stagingStoragePath,
    'video_studio/user-1/project-1/staging/jobs/job%2Fretry-safe/segment_002/provider.mp4',
);

const mergeDurationInputs = [
    { durationSeconds: 10, trimStartSeconds: 1, playbackRate: 1, transitionStyle: 'crossfade', transitionSeconds: 0.5 },
    { durationSeconds: 8, trimEndSeconds: 2, playbackRate: 2, transitionStyle: 'cut' },
    { durationSeconds: 4 },
];
assert.equal(estimateFunctionMergeDuration(mergeDurationInputs), 15.5);
assert.equal(estimateNextMergeDuration(mergeDurationInputs), 15.5);
assert.equal(estimateFunctionMergeDuration([{ durationSeconds: null }]), null);
assert.equal(
    buildFunctionIdentity({ ...identityInput, segmentIndex: 'final' }).videoPathSuffix,
    'jobs/job%2Fretry-safe/final/video.mp4',
);

const renderResult = {
    mode: 'generate',
    requestId: 'provider-job-1',
    modelUsed: 'provider/model',
    keySource: 'environment',
    selectionSource: 'catalog',
    estimatedCostUsd: 0.72,
    resolvedResolution: '480p',
    durationApplied: 5,
    firstFrameApplied: true,
    endFrameApplied: false,
    visualReferencesApplied: 1,
    audioApplied: false,
    audioModeApplied: 'silent',
    lipSyncRequested: false,
};
const stagingCheckpoint = {
    version: 1,
    jobId: identityInput.jobId,
    segmentIndex: identityInput.segmentIndex,
    storagePath: functionIdentity.stagingStoragePath,
    contentType: 'video/mp4',
    byteLength: 1024,
    providerJobId: renderResult.requestId,
    status: 'staged',
    stagedAt: '2026-08-02T00:00:00.000Z',
    renderResult,
};

assert.deepEqual(readFunctionStaging(stagingCheckpoint), stagingCheckpoint);
assert.deepEqual(readNextStaging(stagingCheckpoint), stagingCheckpoint);
assert.ok(readFunctionStaging({ ...stagingCheckpoint, status: 'reserved', byteLength: 0 }));
assert.ok(readNextStaging({ ...stagingCheckpoint, status: 'reserved', byteLength: 0 }));
assert.equal(readFunctionStaging({ ...stagingCheckpoint, byteLength: '1024' }), null);

const firstOutput = {
    version: 1,
    jobId: identityInput.jobId,
    slot: functionIdentity.slot,
    segmentIndex: identityInput.segmentIndex,
    clipId: functionIdentity.clipId,
    videoStoragePath: functionIdentity.videoStoragePath,
    frameStoragePath: functionIdentity.frameStoragePath,
    savedAt: '2026-08-02T00:00:00.000Z',
};
const replacedOutput = { ...firstOutput, savedAt: '2026-08-02T00:01:00.000Z' };
assert.deepEqual(upsertFunctionCheckpoint([firstOutput], replacedOutput), [replacedOutput]);
assert.deepEqual(upsertNextCheckpoint([firstOutput], replacedOutput), [replacedOutput]);

function assertOrdered(source, labels) {
    let previousIndex = -1;
    for (const label of labels) {
        const index = source.indexOf(label);
        assert.ok(index >= 0, `Missing durability contract: ${label}`);
        assert.ok(index > previousIndex, `Durability contract is out of order: ${label}`);
        previousIndex = index;
    }
}

for (const [executorPath, storagePath] of [
    [
        new URL('../functions/src/videoStudio/processor.ts', import.meta.url),
        new URL('../functions/src/videoStudio/processor.ts', import.meta.url),
    ],
    [
        new URL('../src/lib/server/video-studio-job-executor.ts', import.meta.url),
        new URL('../src/lib/server/video-studio-admin.ts', import.meta.url),
    ],
]) {
    const [source, storageSource] = await Promise.all([
        readFile(executorPath, 'utf8'),
        readFile(storagePath, 'utf8'),
    ]);
    const segmentLoop = source.slice(
        source.indexOf('for (let segmentIndex = initialSegmentIndex'),
        source.indexOf('if (autoMergeAfterLoop && generatedClipIds.length > 1)'),
    );
    const finalMerge = source.slice(source.indexOf('if (autoMergeAfterLoop && generatedClipIds.length > 1)'));
    const explicitMerge = source.slice(
        source.indexOf("if (request.operation === 'merge')"),
        source.indexOf('const prompt = requirePrompt(request.prompt, request.operation);'),
    );
    const providerCompletion = segmentLoop.slice(segmentLoop.indexOf('const generated = await generateOpenRouterVideo('));
    const uploadHelper = storageSource.slice(
        storageSource.indexOf('uploadBufferToVideoStudioStorage(params:'),
        storageSource.indexOf('function assertOwnedVideoStudioStoragePath'),
    );

    assertOrdered(segmentLoop, [
        'buildVideoStudioOutputIdentity({',
        'downloadVideoStudioStorageBuffer({',
        'generateOpenRouterVideo(',
        'downloadOpenRouterVideo(generated.videoUrl)',
        'pathSuffix: outputIdentity.stagingPathSuffix',
        'inspectVideoBufferQuality(downloadedVideo.buffer',
        'pathSuffix: outputIdentity.videoPathSuffix',
        'clipId: outputIdentity.clipId',
        'deleteVideoStudioStorageObject({',
    ]);
    assert.match(segmentLoop, /providerOutputStaging\s*=\s*stagingCheckpoint/);
    assert.match(segmentLoop, /status:\s*'finalized'/);
    assert.match(segmentLoop, /upsertVideoStudioOutputCheckpoint\(/);
    assert.doesNotMatch(segmentLoop, /pathSuffix:\s*`clips\/\$\{token\}\.mp4`/);
    assertOrdered(providerCompletion, [
        'generatedMetadata = generated.metadata',
        "status: 'reserved'",
        'baseJobMetadata.providerOutputStaging = stagingCheckpoint',
        'downloadOpenRouterVideo(generated.videoUrl)',
        'pathSuffix: outputIdentity.stagingPathSuffix',
        "status: 'staged'",
    ]);
    assertOrdered(uploadHelper, [
        'file.getMetadata()',
        'file.save(params.buffer',
    ]);
    assert.match(uploadHelper, /firebaseStorageDownloadTokens:\s*downloadToken/);
    assert.match(segmentLoop, /stagingCleanupPending:\s*stagingCleanupPaths\.length > 0/);
    assert.match(segmentLoop, /durationToleranceSeconds:\s*1\.25/);
    assertOrdered(segmentLoop, [
        "status: 'finalized'",
        'pendingStagingCleanupPaths.add(outputIdentity.stagingStoragePath)',
        'stagingCleanupPending: true',
        'deleteVideoStudioStorageObject({',
    ]);

    assertOrdered(finalMerge, [
        "segmentIndex: 'final'",
        'pathSuffix: finalOutputIdentity.videoPathSuffix',
        'clipId: finalOutputIdentity.clipId',
        'upsertVideoStudioOutputCheckpoint(',
    ]);
    assert.match(finalMerge, /durationToleranceSeconds:\s*Math\.max\(1\.5,\s*generatedClips\.length \* 0\.35\)/);

    assertOrdered(explicitMerge, [
        "segmentIndex: 'final'",
        'estimateVideoStudioMergeDuration(',
        'expectedDurationSeconds: expectedMergedDuration',
        'pathSuffix: mergeOutputIdentity.videoPathSuffix',
        'token: mergeOutputIdentity.frameToken',
        'clipId: mergeOutputIdentity.clipId',
        'upsertVideoStudioOutputCheckpoint(',
    ]);
    assert.doesNotMatch(explicitMerge, /pathSuffix:\s*`clips\/\$\{token\}\.mp4`/);
    assert.match(
        explicitMerge,
        /duration:\s*finalQualityInspection\.durationSeconds/,
        'Merged clips must retain their inspected duration so later assemblies can validate timing.',
    );
    assert.match(
        finalMerge,
        /duration:\s*finalQualityInspection\.durationSeconds/,
        'Auto-merged clips must retain their inspected duration so later assemblies can validate timing.',
    );

    const failureHandler = source.slice(source.lastIndexOf('} catch (error)'));
    assertOrdered(failureHandler, [
        'readProviderOutputStagingCheckpoint(baseJobMetadata.providerOutputStaging)',
        'pendingStagingCleanupPaths.add(failedStagingCheckpoint.storagePath)',
        'baseJobMetadata.providerOutputStaging = null',
        'stagingCleanupPending: failedStagingCleanupPaths.length > 0',
        'stagingCleanupPaths: failedStagingCleanupPaths',
    ]);
}

const recoverySource = await readFile(
    new URL('../functions/src/triggers/recoverVideoStudioJobs.ts', import.meta.url),
    'utf8',
);
assert.match(recoverySource, /where\('stagingCleanupPending',\s*'==',\s*true\)/);
assert.match(recoverySource, /cleanupFinalizedStagingArtifacts\(now\)/);
assert.match(recoverySource, /path\.includes\('\/staging\/'\)/);

console.log('Video Studio output durability verification passed.');
