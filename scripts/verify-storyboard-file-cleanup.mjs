import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();

async function read(relativePath) {
    return readFile(resolve(root, relativePath), 'utf8');
}

function assertContains(source, expected, label) {
    if (!source.includes(expected)) {
        throw new Error(`${label} is missing: ${expected}`);
    }
}

const [schema, storyboardService, serverStorage, route, manager] = await Promise.all([
    read('src/schemas/imageStoryboard.ts'),
    read('src/services/imageStoryboardService.ts'),
    read('src/lib/server/video-studio-admin.ts'),
    read('src/app/api/video-studio/projects/[projectId]/storage/route.ts'),
    read('src/components/image-generator/StoryboardProjectFileManager.tsx'),
]);

assertContains(schema, 'StoryboardStorageCleanupAssetSchema', 'Storyboard cleanup schema');
assertContains(schema, 'reclaimableStorageAssets:', 'Storyboard cleanup queue');

assertContains(storyboardService, 'isOwnedStoryboardStoragePath', 'Client cleanup ownership guard');
assertContains(storyboardService, 'deleteReclaimableStorageAssets', 'Client cleanup deletion');
assertContains(storyboardService, 'deleteObject(storageRef(storage, asset.storagePath))', 'Client exact-object deletion');

assertContains(serverStorage, 'getOwnedVideoStudioStorageSnapshot', 'Server storage inspection');
assertContains(serverStorage, 'ACTIVE_VIDEO_STUDIO_JOB_STATUSES', 'Server active job lock');
assertContains(serverStorage, 'snapshot.candidatePaths.has(path)', 'Server cleanup candidate revalidation');
assertContains(serverStorage, 'cleanupLocked', 'Server cleanup lock result');
assertContains(serverStorage, 'Older video projects used Google Cloud Storage signed URLs', 'Legacy video URL protection');

assertContains(route, 'requireUserAuth', 'Storage route user authentication');
assertContains(route, 'CleanupRequestSchema', 'Storage route request validation');
assertContains(route, 'deleteOwnedVideoStudioStorageResiduals', 'Storage route deletion boundary');

assertContains(manager, 'window.confirm', 'Destructive cleanup confirmation');
assertContains(manager, '현재 장면, 최종 완성본, 진행 중 작업이 사용하는 파일은 보호됩니다.', 'Protected file notice');
assertContains(manager, 'projectBusy', 'UI active-render lock');

console.log('Storyboard file cleanup verification passed');
