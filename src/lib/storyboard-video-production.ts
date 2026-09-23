import type {
    ImageStoryboardScene,
    StoryboardVideoProduction,
} from '@/schemas/imageStoryboard';

type ReusableScene = Pick<ImageStoryboardScene, 'id' | 'video'>;

function isReusableStoryboardScene(scene: ReusableScene): boolean {
    return Boolean(
        scene.video.status === 'approved'
        && scene.video.clipId
        && scene.video.videoUrl,
    );
}

export function getReusableStoryboardSceneIds(scenes: ReusableScene[]): string[] {
    return scenes.flatMap((scene) => isReusableStoryboardScene(scene) ? [scene.id] : []);
}

/**
 * Returns the next scene that still needs rendering. A persisted completed id
 * is trusted only while its approved clip and playable URL still exist.
 */
export function findNextStoryboardSceneIndex(
    scenes: ReusableScene[],
    completedSceneIds: Iterable<string>,
    startIndex = 0,
): number {
    const completed = new Set(completedSceneIds);
    for (let index = Math.max(0, startIndex); index < scenes.length; index += 1) {
        const scene = scenes[index];
        if (!completed.has(scene.id) || !isReusableStoryboardScene(scene)) {
            return index;
        }
    }
    return scenes.length;
}

/**
 * Produces the exact storyboard-array order used by FFmpeg. Null means the
 * assembly gate is not satisfied and no merge job should be published.
 */
export function getOrderedStoryboardClipIds(scenes: ReusableScene[]): string[] | null {
    const clipIds: string[] = [];
    for (const scene of scenes) {
        if (!isReusableStoryboardScene(scene) || !scene.video.clipId) return null;
        clipIds.push(scene.video.clipId);
    }
    return clipIds;
}

export function resetStoryboardVideoProduction(
    production: StoryboardVideoProduction,
    patch: Partial<StoryboardVideoProduction> = {},
    completedSceneIds: Iterable<string> = [],
): StoryboardVideoProduction {
    const lastSuccessfulFinalVideoUrl =
        production.finalVideoUrl || production.lastSuccessfulFinalVideoUrl;
    return {
        ...production,
        ...patch,
        automationRunId: null,
        automationStatus: 'idle',
        automationCurrentSceneIndex: null,
        automationCompletedSceneIds: [...completedSceneIds],
        automationRetryCount: 0,
        automationStartedAt: null,
        automationUpdatedAt: null,
        automationErrorMessage: null,
        finalJobId: null,
        finalClipId: production.finalClipId,
        finalVideoUrl: lastSuccessfulFinalVideoUrl,
        finalStatus: 'idle',
        finalErrorMessage: null,
        finalArtifactId: production.finalArtifactId,
        finalFreshness: lastSuccessfulFinalVideoUrl ? 'stale' : 'current',
        finalAssemblyManifest: production.finalAssemblyManifest,
        pendingAssemblyManifest: null,
        lastSuccessfulFinalVideoUrl,
    };
}

export function invalidateStoryboardFinalAssembly(
    production: StoryboardVideoProduction,
    scenes: ReusableScene[],
    patch: Partial<StoryboardVideoProduction> = {},
): StoryboardVideoProduction {
    return resetStoryboardVideoProduction(
        production,
        patch,
        getReusableStoryboardSceneIds(scenes),
    );
}
