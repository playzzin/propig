import type { ImageStoryboard, ImageStoryboardScene } from '@/schemas/imageStoryboard';
import { resolveStoryboardVoiceProfile } from '@/lib/storyboard-voice-consistency';
import { findNextStoryboardSceneIndex, getReusableStoryboardSceneIds, invalidateStoryboardFinalAssembly } from '@/lib/storyboard-video-production';

/** Keep the previous playable take while making its unrendered edits explicit. */
export function markStoryboardSceneVideoForReview(scene: ImageStoryboardScene): ImageStoryboardScene {
    return {
        ...scene,
        videoDesignRevision: scene.videoDesignRevision + 1,
        approvedVideoArtifactId: null,
        video: { ...scene.video, status: 'brief', jobId: null, approvedAt: null, errorMessage: null },
    };
}

function frameIdentity(scene: ImageStoryboardScene | undefined, kind: 'image' | 'video'): string {
    if (!scene) return '';
    return `${scene.id}:${kind === 'image' ? scene.generatedImage?.url || '' : scene.video.lastFrameUrl || ''}`;
}

/** Apply dependencies shared by scene editing, image replacement and voice editing. */
export function invalidateChangedStoryboardDependencies(previous: ImageStoryboard, next: ImageStoryboard): ImageStoryboard {
    if (previous === next) return next;
    let invalidated = false;
    let expandsPaidScope = false;
    const previouslyReusable = new Set(getReusableStoryboardSceneIds(previous.scenes));
    const previousIndices = new Map(previous.scenes.map((scene, index) => [scene.id, index]));
    const scenes = next.scenes.map((scene, index) => {
        const oldIndex = previousIndices.get(scene.id);
        if (oldIndex === undefined) return scene;
        const old = previous.scenes[oldIndex];
        const voiceChanged = scene.video.audioMode === 'dialogue' && JSON.stringify(
            resolveStoryboardVoiceProfile(previous.videoProduction, old.video),
        ) !== JSON.stringify(resolveStoryboardVoiceProfile(next.videoProduction, scene.video));
        const endFrameChanged = old.video.endFrameApplied && old.video.useNextSceneAsEndFrame &&
            frameIdentity(previous.scenes[oldIndex + 1], 'image') !== frameIdentity(next.scenes[index + 1], 'image');
        const startFrameChanged = old.video.firstFrameApplied && Boolean(previous.scenes[oldIndex - 1]?.video.lastFrameUrl) &&
            frameIdentity(previous.scenes[oldIndex - 1], 'video') !== frameIdentity(next.scenes[index - 1], 'video');
        if (!voiceChanged && !endFrameChanged && !startFrameChanged) return scene;
        invalidated = true;
        if (previouslyReusable.has(scene.id)) expandsPaidScope = true;
        if (scene.videoDesignRevision > old.videoDesignRevision && scene.video.status === 'brief' && !scene.video.jobId) return scene;
        return markStoryboardSceneVideoForReview(scene);
    });
    const keepRunningCoordinator = next.videoProduction.automationRunId &&
        next.videoProduction.automationRunId === previous.videoProduction.automationRunId &&
        ['preparing', 'running', 'pausing', 'merging', 'paused'].includes(next.videoProduction.automationStatus);
    const pauseForConfirmation = keepRunningCoordinator && expandsPaidScope;
    return invalidated ? {
        ...next,
        scenes,
        videoProduction: keepRunningCoordinator ? {
            ...next.videoProduction,
            automationCompletedSceneIds: getReusableStoryboardSceneIds(scenes),
            ...(pauseForConfirmation ? {
                automationStatus: 'paused' as const,
                automationCurrentSceneIndex: findNextStoryboardSceneIndex(scenes),
                automationErrorMessage: '연결 프레임이 바뀌어 승인했던 장면도 다시 제작해야 합니다. 결과를 검토하고 추가 제작 범위와 비용을 확인한 뒤 이어가세요.',
            } : {}),
            finalFreshness: next.videoProduction.finalVideoUrl ? 'stale' : next.videoProduction.finalFreshness,
        } : invalidateStoryboardFinalAssembly(next.videoProduction, scenes),
    } : next;
}
