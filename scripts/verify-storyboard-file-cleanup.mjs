import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { storagePathFromVideoStudioUrl } from '../functions/src/videoStudio/storagePath.ts';

const root = process.cwd();

async function read(relativePath) {
    return readFile(resolve(root, relativePath), 'utf8');
}

function assertContains(source, expected, label) {
    if (!source.includes(expected)) {
        throw new Error(`${label} is missing: ${expected}`);
    }
}

const [schema, storyboardService, serverStorage, functionsStorage, route, manager, workspace, videoPanel] = await Promise.all([
    read('src/schemas/imageStoryboard.ts'),
    read('src/services/imageStoryboardService.ts'),
    read('src/lib/server/video-studio-admin.ts'),
    read('functions/src/api/hostingVideoStudioRoutes.ts'),
    read('src/app/api/video-studio/projects/[projectId]/storage/route.ts'),
    read('src/components/image-generator/StoryboardProjectFileManager.tsx'),
    read('src/components/image-generator/StoryboardWorkspace.tsx'),
    read('src/components/image-generator/StoryboardVideoProductionPanel.tsx'),
]);

assertContains(schema, 'StoryboardStorageCleanupAssetSchema', 'Storyboard cleanup schema');
assertContains(schema, 'reclaimableStorageAssets:', 'Storyboard cleanup queue');
assertContains(schema, "'scene-image'", 'Replaced scene image cleanup kind');

assertContains(storyboardService, 'isOwnedStoryboardStoragePath', 'Client cleanup ownership guard');
assertContains(storyboardService, 'deleteReclaimableStorageAssets', 'Client cleanup deletion');
assertContains(storyboardService, 'deleteObject(storageRef(storage, asset.storagePath))', 'Client exact-object deletion');
assertContains(storyboardService, 'image.storagePath', 'Generated image exact-path deletion');
assertContains(storyboardService, 'isOwnedStoryboardStoragePath(userId, storyboardId, image.storagePath)', 'Generated image project ownership guard');

assertContains(workspace, 'storagePathFromFirebaseDownloadUrl', 'Legacy generated image path recovery');
assertContains(workspace, 'kind: "scene-image"', 'Failed replacement cleanup queue');
assertContains(workspace, 'item.generatedImage?.storagePath === storagePath', 'Current scene image deletion guard');
assertContains(workspace, 'if (!storagePath?.startsWith(ownedStoryboardPrefix)) return', 'Shared generation history preservation');

assertContains(serverStorage, 'getOwnedVideoStudioStorageSnapshot', 'Server storage inspection');
assertContains(serverStorage, 'ACTIVE_VIDEO_STUDIO_JOB_STATUSES', 'Server active job lock');
assertContains(serverStorage, 'snapshot.candidatePaths.has(path)', 'Server cleanup candidate revalidation');
assertContains(serverStorage, 'cleanupLocked', 'Server cleanup lock result');
assertContains(serverStorage, 'Older video projects used Google Cloud Storage signed URLs', 'Legacy video URL protection');
assertContains(serverStorage, 'existingClipIds.has(job.clipId)', 'Deleted clip result becomes a residual candidate');

assertContains(functionsStorage, 'storagePathFromVideoStudioUrl', 'Functions storage URL parser');
assertContains(functionsStorage, 'existingClipIds.has(String(job.clipId))', 'Functions deleted clip residual parity');

const prefix = 'video_studio/user-1/project-1/';
const protectedPath = `${prefix}clips/scene 01.mp4`;
const encodedPath = encodeURIComponent(protectedPath);
const protectedUrlCases = [
    `https://firebasestorage.googleapis.com/v0/b/propig.appspot.com/o/${encodedPath}?alt=media&token=test-token`,
    `https://storage.googleapis.com/propig.appspot.com/${protectedPath}?X-Goog-Signature=test-signature`,
    `https://propig.appspot.com.storage.googleapis.com/${protectedPath}?GoogleAccessId=test`,
];

for (const value of protectedUrlCases) {
    if (storagePathFromVideoStudioUrl(value, prefix) !== protectedPath) {
        throw new Error(`Functions cleanup parser did not protect a live asset URL: ${value}`);
    }
}

const rejectedUrlCases = [
    `https://storage.googleapis.com/propig.appspot.com/video_studio/user-1/project-2/clips/other.mp4`,
    `https://example.com/${protectedPath}`,
    `https://example.com/o/${encodedPath}`,
    'not-a-url',
    '',
];

for (const value of rejectedUrlCases) {
    if (storagePathFromVideoStudioUrl(value, prefix) !== null) {
        throw new Error(`Functions cleanup parser accepted an unsafe asset URL: ${value}`);
    }
}

assertContains(route, 'requireUserAuth', 'Storage route user authentication');
assertContains(route, 'CleanupRequestSchema', 'Storage route request validation');
assertContains(route, 'deleteOwnedVideoStudioStorageResiduals', 'Storage route deletion boundary');

assertContains(manager, 'window.confirm', 'Destructive cleanup confirmation');
assertContains(manager, '현재 장면, 최종 완성본, 진행 중 작업이 사용하는 파일은 보호됩니다.', 'Protected file notice');
assertContains(manager, 'projectBusy', 'UI active-render lock');
assertContains(manager, 'protectedLocalPaths', 'Current local asset deletion guard');
assertContains(videoPanel, 'clipRecordAlreadyRemoved', 'Removed clip retry loop recovery');

console.log('Storyboard file cleanup verification passed');
