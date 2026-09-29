import type {
    ImageStoryboard,
    ImageStoryboardScene,
    StoryboardVideoProduction,
} from '@/schemas/imageStoryboard';

type ReusableScene = Pick<ImageStoryboardScene, 'id' | 'video'> & Partial<Pick<ImageStoryboardScene, 'assetFreshness'>>;

export function hasActiveStoryboardVideoWork(storyboard: ImageStoryboard): boolean {
    return ['preparing', 'running', 'pausing', 'merging'].includes(storyboard.videoProduction.automationStatus)
        || ['queued', 'rendering'].includes(storyboard.videoProduction.finalStatus)
        || storyboard.scenes.some((scene) => ['queued', 'rendering'].includes(scene.video.status));
}

function isReusableStoryboardScene(scene: ReusableScene): boolean {
    return Boolean(
        scene.assetFreshness !== 'review'
        && scene.video.status === 'approved'
        && scene.video.clipId
        && scene.video.videoUrl,
    );
}

export function getReusableStoryboardSceneIds(scenes: ReusableScene[]): string[] {
    return scenes.flatMap((scene) => isReusableStoryboardScene(scene) ? [scene.id] : []);
}

/**
 * Derive the next scene from current approved media. Saved run progress can
 * lag behind edits, approvals or restored projects and must not trigger a new render.
 */
export function findNextStoryboardSceneIndex(
    scenes: ReusableScene[],
): number {
    const index = scenes.findIndex((scene) => !isReusableStoryboardScene(scene));
    return index < 0 ? scenes.length : index;
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
