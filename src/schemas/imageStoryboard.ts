import { z } from 'zod';
import { IMAGE_REFERENCE_ROLES, MAX_IMAGE_REFERENCE_REQUESTS } from '@/types/imageReference';
import {
    normalizeStoryboardSpokenDialogue,
    STORYBOARD_VIDEO_AUDIO_MODES,
} from '@/lib/storyboard-video-audio';

export const STORYBOARD_ASPECT_RATIOS = ['1:1', '9:16', '16:9', '4:3', '3:4'] as const;
export const STORYBOARD_FORMATS = ['brand-film', 'product-launch', 'social-short', 'editorial'] as const;
export const STORYBOARD_AUDIO_MIX_PRESETS = ['dialogue-first', 'balanced', 'music-first', 'custom'] as const;
// A storyboard can retry a failed provider job once. Keeping this limit in the
// persisted schema prevents an older document from making the UI claim that it
// will keep spending credits on repeated retries.
export const STORYBOARD_AUTOMATION_RETRY_LIMIT = 1;
export const STORYBOARD_WORKFLOW_STAGES = [
    'image-design',
    'image-production',
    'video-design',
    'video-production',
    'final-assembly',
    'completed',
] as const;

export const StoryboardSceneStatusSchema = z.enum(['draft', 'ready', 'generated']);
export const StoryboardVideoQualityModeSchema = z.enum(['proof', 'final']);
export const StoryboardVideoMotionIntensitySchema = z.enum(['subtle', 'balanced', 'dynamic']);
export const StoryboardVideoAudioModeSchema = z.enum(STORYBOARD_VIDEO_AUDIO_MODES);
export const StoryboardAudioMixPresetSchema = z.enum(STORYBOARD_AUDIO_MIX_PRESETS);
export const StoryboardVideoTransitionSchema = z.enum(['cut', 'crossfade', 'match-cut', 'bridge']);
export const StoryboardAssetFreshnessSchema = z.enum(['current', 'review']);
export const StoryboardFinalFreshnessSchema = z.enum(['current', 'stale']);
export const StoryboardWorkflowStageSchema = z.enum(STORYBOARD_WORKFLOW_STAGES);
export const StoryboardVideoAutomationStatusSchema = z.enum([
    'idle',
    'preparing',
    'running',
    'pausing',
    'paused',
    'merging',
    'completed',
    'failed',
]);
export const StoryboardVideoSceneStatusSchema = z.enum([
    'brief',
    'queued',
    'rendering',
    'review',
    'approved',
    'failed',
]);
export const StoryboardVideoFinalStatusSchema = z.enum([
    'idle',
    'queued',
    'rendering',
    'completed',
    'failed',
]);

export const StoryboardVoiceProfileSchema = z.object({
    id: z.string().trim().min(1).max(80),
    characterName: z.string().trim().min(1).max(80),
    voiceDescription: z.string().trim().min(1).max(240),
    speakingStyle: z.string().trim().max(180).default('자연스러운 한국어 발음과 호흡, 감정이 달라져도 같은 음색 유지'),
});

const StoryboardDialogueOrCaptionSchema = z.preprocess(
    (value) => typeof value === 'string'
        ? normalizeStoryboardSpokenDialogue(value)
        : value,
    z.string().trim().max(240),
);

export const StoryboardTransitionQualitySchema = z.object({
    identity: z.number().int().min(0).max(100),
    composition: z.number().int().min(0).max(100),
    motion: z.number().int().min(0).max(100),
    color: z.number().int().min(0).max(100),
    audio: z.number().int().min(0).max(100),
    score: z.number().int().min(0).max(100),
    checkedAt: z.number().int().positive(),
}).nullable();

export const StoryboardTransitionLinkSchema = z.object({
    id: z.string().min(1).max(240),
    fromSceneId: z.string().min(1).max(240),
    toSceneId: z.string().min(1).max(240),
    strategy: StoryboardVideoTransitionSchema.default('crossfade'),
    durationSeconds: z.number().finite().min(0).max(2).default(0.35),
    outgoingFrameUrl: z.string().url().nullable().default(null),
    incomingFrameUrl: z.string().url().nullable().default(null),
    quality: StoryboardTransitionQualitySchema.default(null),
    needsReview: z.boolean().default(false),
});

export const StoryboardArtifactSchema = z.object({
    id: z.string().min(1).max(240),
    type: z.enum(['reference-image', 'scene-image', 'scene-video', 'frame', 'audio', 'final-video']),
    lifecycle: z.enum(['temporary', 'review', 'active', 'retired', 'deleting', 'deleted', 'failed']),
    sceneId: z.string().min(1).max(240).nullable().default(null),
    url: z.string().url(),
    storagePath: z.string().trim().max(1024).nullable().default(null),
    sourceArtifactIds: z.array(z.string().min(1).max(240)).max(48).default([]),
    designRevision: z.number().int().positive().nullable().default(null),
    createdAt: z.number().int().positive(),
    approvedAt: z.number().int().positive().nullable().default(null),
    sizeBytes: z.number().int().nonnegative().nullable().default(null),
});

export const StoryboardFinalAssemblyManifestSchema = z.object({
    version: z.literal(1).default(1),
    fingerprint: z.string().min(8).max(120),
    createdAt: z.number().int().positive(),
    orderedSceneIds: z.array(z.string().min(1).max(240)).min(1).max(48),
    orderedClipIds: z.array(z.string().min(1).max(240)).min(1).max(48),
    videoArtifactIds: z.array(z.string().min(1).max(240)).min(1).max(48),
    transitionLinks: z.array(StoryboardTransitionLinkSchema).max(47).default([]),
    aspectRatio: z.enum(STORYBOARD_ASPECT_RATIOS),
    resolution: z.enum(['480p', '720p', '1080p']),
    audioMixPreset: StoryboardAudioMixPresetSchema,
    backgroundMusicUrl: z.string().url().nullable(),
    backgroundMusicVolume: z.number().finite().min(0).max(1),
    sceneAudioVolume: z.number().finite().min(0).max(2),
    audioCrossfadeSeconds: z.number().finite().min(0).max(2),
});

const StoryboardVideoSceneObjectSchema = z.object({
    status: StoryboardVideoSceneStatusSchema.default('brief'),
    motionPrompt: z.string().trim().max(1800).default(''),
    durationSeconds: z.number().int().min(1).max(15).default(6),
    motionIntensity: StoryboardVideoMotionIntensitySchema.default('balanced'),
    useNextSceneAsEndFrame: z.boolean().default(true),
    audioMode: StoryboardVideoAudioModeSchema.default('silent'),
    generateAudio: z.boolean().default(false),
    voiceProfileId: z.string().trim().min(1).max(80).nullable().default(null),
    trimStartSeconds: z.number().finite().min(0).max(14).default(0),
    trimEndSeconds: z.number().finite().min(0).max(14).default(0),
    playbackRate: z.number().finite().min(0.5).max(2).default(1),
    audioVolume: z.number().finite().min(0).max(2).default(1),
    transitionStyle: StoryboardVideoTransitionSchema.default('crossfade'),
    transitionSeconds: z.number().finite().min(0).max(2).default(0.35),
    referenceAssetIds: z.array(z.string().min(1).max(240)).max(2).default([]),
    visualReferencesApplied: z.number().int().min(0).max(2).default(0),
    firstFrameApplied: z.boolean().default(false),
    endFrameApplied: z.boolean().default(false),
    audioApplied: z.boolean().default(false),
    jobId: z.string().min(1).nullable().default(null),
    clipId: z.string().min(1).nullable().default(null),
    videoUrl: z.string().url().nullable().default(null),
    lastFrameUrl: z.string().url().nullable().default(null),
    modelUsed: z.string().max(240).nullable().default(null),
    costUsd: z.number().finite().nonnegative().nullable().default(null),
    errorMessage: z.string().max(1200).nullable().default(null),
    approvedAt: z.number().int().positive().nullable().default(null),
    artifactId: z.string().min(1).max(240).nullable().default(null),
    replacedClipId: z.string().min(1).max(240).nullable().default(null),
});

export const StoryboardVideoSceneSchema = z.preprocess((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const scene = value as Record<string, unknown>;
    return {
        ...scene,
        ...(scene.audioMode === undefined
            ? { audioMode: scene.generateAudio === true ? 'ambient' : 'silent' }
            : {}),
        ...(scene.transitionStyle === 'fade'
            ? { transitionStyle: 'crossfade' }
            : {}),
    };
}, StoryboardVideoSceneObjectSchema);

export const StoryboardVideoProductionSchema = z.object({
    projectId: z.string().min(1).nullable().default(null),
    qualityMode: StoryboardVideoQualityModeSchema.default('proof'),
    maxBudgetUsd: z.number().finite().positive().max(1000).nullable().default(5),
    allowUnknownPricing: z.boolean().default(false),
    voiceDirection: z.string().trim().max(240).default('따뜻하고 자신감 있는 자연스러운 한국어 목소리'),
    voiceProfiles: z.array(StoryboardVoiceProfileSchema).max(12).default([]),
    backgroundMusicUrl: z.string().url().nullable().default(null),
    backgroundMusicName: z.string().trim().max(180).nullable().default(null),
    backgroundMusicStoragePath: z.string().trim().max(600).nullable().default(null),
    audioMixPreset: StoryboardAudioMixPresetSchema.default('dialogue-first'),
    backgroundMusicVolume: z.number().finite().min(0).max(1).default(0.16),
    sceneAudioVolume: z.number().finite().min(0).max(2).default(1),
    audioCrossfadeSeconds: z.number().finite().min(0).max(2).default(0.35),
    automationRunId: z.string().min(1).nullable().default(null),
    automationStatus: StoryboardVideoAutomationStatusSchema.default('idle'),
    automationCurrentSceneIndex: z.number().int().min(0).max(48).nullable().default(null),
    automationCompletedSceneIds: z.array(z.string().min(1).max(240)).max(48).default([]),
    // Older projects may contain a retry count from the former unbounded
    // recovery flow. Clamp it while reading so those projects remain usable
    // and the displayed recovery state matches the actual one-retry policy.
    automationRetryCount: z.preprocess(
        (value) => typeof value === 'number' && Number.isFinite(value)
            ? Math.min(Math.max(Math.trunc(value), 0), STORYBOARD_AUTOMATION_RETRY_LIMIT)
            : value,
        z.number().int().min(0).max(STORYBOARD_AUTOMATION_RETRY_LIMIT).default(0),
    ),
    automationStartedAt: z.number().int().positive().nullable().default(null),
    automationUpdatedAt: z.number().int().positive().nullable().default(null),
    automationErrorMessage: z.string().max(1200).nullable().default(null),
    finalJobId: z.string().min(1).nullable().default(null),
    finalClipId: z.string().min(1).nullable().default(null),
    finalVideoUrl: z.string().url().nullable().default(null),
    finalStatus: StoryboardVideoFinalStatusSchema.default('idle'),
    finalErrorMessage: z.string().max(1200).nullable().default(null),
    finalArtifactId: z.string().min(1).max(240).nullable().default(null),
    finalFreshness: StoryboardFinalFreshnessSchema.default('current'),
    finalAssemblyManifest: StoryboardFinalAssemblyManifestSchema.nullable().default(null),
    pendingAssemblyManifest: StoryboardFinalAssemblyManifestSchema.nullable().default(null),
    lastSuccessfulFinalVideoUrl: z.string().url().nullable().default(null),
    replacedFinalClipId: z.string().min(1).max(240).nullable().default(null),
});

export function createStoryboardVideoScene(): z.infer<typeof StoryboardVideoSceneSchema> {
    return {
        status: 'brief',
        motionPrompt: '',
        durationSeconds: 6,
        motionIntensity: 'balanced',
        useNextSceneAsEndFrame: true,
        audioMode: 'silent',
        generateAudio: false,
        voiceProfileId: null,
        trimStartSeconds: 0,
        trimEndSeconds: 0,
        playbackRate: 1,
        audioVolume: 1,
        transitionStyle: 'crossfade',
        transitionSeconds: 0.35,
        referenceAssetIds: [],
        visualReferencesApplied: 0,
        firstFrameApplied: false,
        endFrameApplied: false,
        audioApplied: false,
        jobId: null,
        clipId: null,
        videoUrl: null,
        lastFrameUrl: null,
        modelUsed: null,
        costUsd: null,
        errorMessage: null,
        approvedAt: null,
        artifactId: null,
        replacedClipId: null,
    };
}

export function createStoryboardVideoProduction(): z.infer<typeof StoryboardVideoProductionSchema> {
    return {
        projectId: null,
        qualityMode: 'proof',
        maxBudgetUsd: 5,
        allowUnknownPricing: false,
        voiceDirection: '따뜻하고 자신감 있는 자연스러운 한국어 목소리',
        voiceProfiles: [],
        backgroundMusicUrl: null,
        backgroundMusicName: null,
        backgroundMusicStoragePath: null,
        audioMixPreset: 'dialogue-first',
        backgroundMusicVolume: 0.16,
        sceneAudioVolume: 1,
        audioCrossfadeSeconds: 0.35,
        automationRunId: null,
        automationStatus: 'idle',
        automationCurrentSceneIndex: null,
        automationCompletedSceneIds: [],
        automationRetryCount: 0,
        automationStartedAt: null,
        automationUpdatedAt: null,
        automationErrorMessage: null,
        finalJobId: null,
        finalClipId: null,
        finalVideoUrl: null,
        finalStatus: 'idle',
        finalErrorMessage: null,
        finalArtifactId: null,
        finalFreshness: 'current',
        finalAssemblyManifest: null,
        pendingAssemblyManifest: null,
        lastSuccessfulFinalVideoUrl: null,
        replacedFinalClipId: null,
    };
}

export const ImageStoryboardReferenceSchema = z.object({
    image: z.string().trim().min(1),
    role: z.enum(IMAGE_REFERENCE_ROLES),
});

export const ImageStoryboardReferenceAssetSchema = z.object({
    id: z.string().min(1).max(240),
    image: z.string().trim().url(),
    role: z.enum(IMAGE_REFERENCE_ROLES),
    name: z.string().trim().min(1).max(180),
    storagePath: z.string().trim().max(600).nullable().optional().default(null),
    createdAt: z.number().int().positive().optional().default(() => Date.now()),
});

export const StoryboardStorageCleanupAssetSchema = z.object({
    id: z.string().min(1).max(240),
    storagePath: z.string().trim().min(1).max(600),
    label: z.string().trim().min(1).max(180),
    kind: z.enum(['reference', 'background-music', 'scene-image']),
    queuedAt: z.number().int().positive(),
});

export const StoryboardGeneratedImageProvenanceSchema = z.object({
    kind: z.literal('storyboard-scene'),
    storyboardId: z.string().trim().min(1).max(240),
    sceneId: z.string().trim().min(1).max(240).nullable().default(null),
}).nullable().default(null);

// Planning uses deliberately compact copies of local files. This preserves the
// visual reference for OpenRouter without allowing a storyboard brief to exceed
// the Hosting request limit when several photos are attached.
export const ImageStoryboardPlanReferenceSchema = z.object({
    image: z.string().trim().min(1).max(1_600_000).refine(
        (value) => /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(value) || /^https:\/\//i.test(value),
        'Reference image must be an HTTPS URL or an image data URL.',
    ),
    role: z.enum(IMAGE_REFERENCE_ROLES),
});

export const StoryboardSceneSchema = z.object({
    id: z.string().min(1),
    order: z.number().int().min(1),
    title: z.string().trim().min(1).max(80),
    status: StoryboardSceneStatusSchema,
    duration: z.string().trim().max(40),
    narrativeBeat: z.string().trim().max(280),
    shotSize: z.string().trim().max(80),
    cameraDirection: z.string().trim().max(180),
    dialogueOrCaption: StoryboardDialogueOrCaptionSchema,
    visualPrompt: z.string().trim().max(900),
    imagePrompt: z.string().trim().max(1200).default(''),
    continuityAnchor: z.string().trim().max(280).default(''),
    transition: z.string().trim().max(180).default(''),
    negativePrompt: z.string().trim().max(360),
    assetFreshness: StoryboardAssetFreshnessSchema.default('current'),
    staleReason: z.string().trim().max(240).nullable().default(null),
    imageDesignRevision: z.number().int().positive().default(1),
    videoDesignRevision: z.number().int().positive().default(1),
    approvedImageArtifactId: z.string().min(1).max(240).nullable().default(null),
    approvedVideoArtifactId: z.string().min(1).max(240).nullable().default(null),
    generatedImage: z.object({
        id: z.string().min(1),
        url: z.string().url(),
        generatedAt: z.number().int().positive(),
        storagePath: z.string().trim().max(1024).nullable().optional(),
        provenance: StoryboardGeneratedImageProvenanceSchema.optional(),
    }).nullable(),
    video: StoryboardVideoSceneSchema.default(createStoryboardVideoScene),
});

export const ImageStoryboardSchema = z.object({
    schemaVersion: z.union([z.literal(1), z.literal(2)]).default(2),
    revision: z.number().int().positive().default(1),
    archivedAt: z.number().int().positive().nullable().default(null),
    workflowStage: StoryboardWorkflowStageSchema.default('image-design'),
    cleanupStatus: z.enum(['idle', 'pending', 'retry']).default('idle'),
    cleanupErrorMessage: z.string().trim().max(1200).nullable().default(null),
    productionRecordSignature: z.string().trim().max(120).default(''),
    topic: z.string().trim().max(240).default(''),
    title: z.string().trim().min(1).max(100),
    logline: z.string().trim().max(280),
    audience: z.string().trim().max(120),
    format: z.enum(STORYBOARD_FORMATS).default('brand-film'),
    plannedSceneCount: z.number().int().min(1).max(12).default(5),
    aspectRatio: z.enum(STORYBOARD_ASPECT_RATIOS),
    stylePreset: z.string().trim().max(80),
    artDirection: z.string().trim().max(320),
    characterContinuity: z.string().trim().max(320),
    settingContinuity: z.string().trim().max(320),
    colorAndLighting: z.string().trim().max(220),
    usePreviousSceneAsReference: z.boolean().default(true),
    referenceAssets: z.array(ImageStoryboardReferenceAssetSchema).max(4).default([]),
    reclaimableStorageAssets: z.array(StoryboardStorageCleanupAssetSchema).max(80).default([]),
    transitionLinks: z.array(StoryboardTransitionLinkSchema).max(47).default([]),
    videoProduction: StoryboardVideoProductionSchema.default(createStoryboardVideoProduction),
    scenes: z.array(StoryboardSceneSchema).min(1).max(48),
});

export const ImageStoryboardGenerationPayloadSchema = z.object({
    prompt: z.string().trim().min(1).max(1000),
    negativePrompt: z.string().trim().max(360),
    aspectRatio: z.enum(STORYBOARD_ASPECT_RATIOS),
    width: z.number().int().min(64).max(4096),
    height: z.number().int().min(64).max(4096),
    stylePreset: z.string().trim().max(80),
    resourceMode: z.literal('efficient').default('efficient'),
    referenceImage: z.string().trim().url().max(4096).optional(),
    referenceImages: z.array(ImageStoryboardReferenceSchema).max(MAX_IMAGE_REFERENCE_REQUESTS).optional(),
});

export const ImageStoryboardPlanRequestSchema = z.object({
    topic: z.string().trim().min(2).max(240),
    sceneCount: z.number().int().min(1).max(12),
    aspectRatio: z.enum(STORYBOARD_ASPECT_RATIOS),
    stylePreset: z.string().trim().min(1).max(80),
    format: z.enum(STORYBOARD_FORMATS).default('brand-film'),
    referenceImages: z.array(ImageStoryboardPlanReferenceSchema).max(4).optional(),
});

export const ImageStoryboardPlanSceneSchema = z.object({
    title: z.string().trim().min(1).max(80),
    duration: z.string().trim().min(1).max(40),
    narrativeBeat: z.string().trim().min(1).max(280),
    shotSize: z.string().trim().min(1).max(80),
    cameraDirection: z.string().trim().max(180),
    dialogueOrCaption: StoryboardDialogueOrCaptionSchema,
    visualPrompt: z.string().trim().min(1).max(900),
    imagePrompt: z.string().trim().min(80).max(1200),
    continuityAnchor: z.string().trim().min(1).max(280),
    transition: z.string().trim().min(1).max(180),
    negativePrompt: z.string().trim().max(360),
});

export const ImageStoryboardPlanSchema = z.object({
    title: z.string().trim().min(1).max(100),
    logline: z.string().trim().max(280),
    audience: z.string().trim().max(120),
    artDirection: z.string().trim().max(320),
    characterContinuity: z.string().trim().max(320),
    settingContinuity: z.string().trim().max(320),
    colorAndLighting: z.string().trim().max(220),
    scenes: z.array(ImageStoryboardPlanSceneSchema).min(1).max(12),
});

export const ImageStoryboardSceneRedesignInputSchema = z.object({
    title: z.string().trim().min(1).max(80),
    duration: z.string().trim().max(40).default(''),
    narrativeBeat: z.string().trim().max(280).default(''),
    shotSize: z.string().trim().max(80).default(''),
    cameraDirection: z.string().trim().max(180).default(''),
    dialogueOrCaption: StoryboardDialogueOrCaptionSchema.default(''),
    visualPrompt: z.string().trim().max(900).default(''),
    imagePrompt: z.string().trim().max(1200).default(''),
    continuityAnchor: z.string().trim().max(280).default(''),
    transition: z.string().trim().max(180).default(''),
    negativePrompt: z.string().trim().max(360).default(''),
});

export const ImageStoryboardSceneRedesignRequestSchema = z.object({
    topic: z.string().trim().min(2).max(240),
    aspectRatio: z.enum(STORYBOARD_ASPECT_RATIOS),
    stylePreset: z.string().trim().min(1).max(80),
    format: z.enum(STORYBOARD_FORMATS).default('brand-film'),
    artDirection: z.string().trim().max(320).default(''),
    characterContinuity: z.string().trim().max(320).default(''),
    settingContinuity: z.string().trim().max(320).default(''),
    colorAndLighting: z.string().trim().max(220).default(''),
    scene: ImageStoryboardSceneRedesignInputSchema,
    previousScene: ImageStoryboardSceneRedesignInputSchema.optional(),
    nextScene: ImageStoryboardSceneRedesignInputSchema.optional(),
    instruction: z.string().trim().max(600).default(''),
    referenceImages: z.array(ImageStoryboardPlanReferenceSchema).max(4).optional(),
});

export const ImageStoryboardFlowRedesignRequestSchema = z.object({
    topic: z.string().trim().min(2).max(240),
    aspectRatio: z.enum(STORYBOARD_ASPECT_RATIOS),
    stylePreset: z.string().trim().min(1).max(80),
    format: z.enum(STORYBOARD_FORMATS).default('brand-film'),
    artDirection: z.string().trim().max(320).default(''),
    characterContinuity: z.string().trim().max(320).default(''),
    settingContinuity: z.string().trim().max(320).default(''),
    colorAndLighting: z.string().trim().max(220).default(''),
    previousScene: ImageStoryboardSceneRedesignInputSchema.optional(),
    scenes: z.array(ImageStoryboardSceneRedesignInputSchema).min(1).max(12),
    nextScene: ImageStoryboardSceneRedesignInputSchema.optional(),
    instruction: z.string().trim().max(600).default(''),
    referenceImages: z.array(ImageStoryboardPlanReferenceSchema).max(4).optional(),
});

export const ImageStoryboardFlowRedesignSchema = z.object({
    scenes: z.array(ImageStoryboardPlanSceneSchema).min(1).max(12),
});

export type StoryboardSceneStatus = z.infer<typeof StoryboardSceneStatusSchema>;
export type StoryboardVideoQualityMode = z.infer<typeof StoryboardVideoQualityModeSchema>;
export type StoryboardVideoMotionIntensity = z.infer<typeof StoryboardVideoMotionIntensitySchema>;
export type StoryboardAudioMixPreset = z.infer<typeof StoryboardAudioMixPresetSchema>;
export type StoryboardVideoAudioMode = z.infer<typeof StoryboardVideoAudioModeSchema>;
export type StoryboardVideoTransition = z.infer<typeof StoryboardVideoTransitionSchema>;
export type StoryboardFinalFreshness = z.infer<typeof StoryboardFinalFreshnessSchema>;
export type StoryboardWorkflowStage = z.infer<typeof StoryboardWorkflowStageSchema>;
export type StoryboardTransitionLink = z.infer<typeof StoryboardTransitionLinkSchema>;
export type StoryboardArtifact = z.infer<typeof StoryboardArtifactSchema>;
export type StoryboardFinalAssemblyManifest = z.infer<typeof StoryboardFinalAssemblyManifestSchema>;
export type StoryboardVideoAutomationStatus = z.infer<typeof StoryboardVideoAutomationStatusSchema>;
export type StoryboardVideoSceneStatus = z.infer<typeof StoryboardVideoSceneStatusSchema>;
export type StoryboardVoiceProfile = z.infer<typeof StoryboardVoiceProfileSchema>;
export type StoryboardVideoScene = z.infer<typeof StoryboardVideoSceneSchema>;
export type StoryboardVideoProduction = z.infer<typeof StoryboardVideoProductionSchema>;
export type StoryboardStorageCleanupAsset = z.infer<typeof StoryboardStorageCleanupAssetSchema>;
export type ImageStoryboardScene = z.infer<typeof StoryboardSceneSchema>;
export type ImageStoryboard = z.infer<typeof ImageStoryboardSchema>;
export type ImageStoryboardGenerationPayload = z.infer<typeof ImageStoryboardGenerationPayloadSchema>;
export type ImageStoryboardPlanRequest = z.infer<typeof ImageStoryboardPlanRequestSchema>;
export type ImageStoryboardPlan = z.infer<typeof ImageStoryboardPlanSchema>;
export type ImageStoryboardSceneRedesignRequest = z.infer<typeof ImageStoryboardSceneRedesignRequestSchema>;
export type ImageStoryboardSceneRedesign = z.infer<typeof ImageStoryboardPlanSceneSchema>;
export type ImageStoryboardFlowRedesignRequest = z.infer<typeof ImageStoryboardFlowRedesignRequestSchema>;
export type ImageStoryboardFlowRedesign = z.infer<typeof ImageStoryboardFlowRedesignSchema>;

export type SavedImageStoryboard = ImageStoryboard & {
    id: string;
    createdAt: number;
    updatedAt: number;
};
