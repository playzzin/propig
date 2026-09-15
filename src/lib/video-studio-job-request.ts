import { z } from 'zod';

const VIDEO_STUDIO_AUDIO_MODES = ['silent', 'ambient', 'dialogue'] as const;
export const VIDEO_STUDIO_MAX_REPEAT_COUNT = 12;
export const VIDEO_STUDIO_MAX_MERGE_CLIPS = 48;

const VideoStudioIdSchema = z.string().trim().min(1).max(240);
const VideoStudioPromptSchema = z.string().trim().max(12_000);
const VideoStudioNotesSchema = z.string().trim().max(4_000);

export const VideoStudioJobOperationSchema = z.enum([
    'generate',
    'extend',
    'continue',
    'edit',
    'merge',
    'extract-frame',
]);

const VideoReferenceImageSchema = z.string().trim().min(1).max(280_000).refine(
    (value) => /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(value) || /^https:\/\//i.test(value),
    'Visual references must be HTTPS URLs or image data URLs.',
);

const MergeClipEditSchema = z.preprocess((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const edit = value as Record<string, unknown>;
    return edit.transitionStyle === 'fade'
        ? { ...edit, transitionStyle: 'crossfade' }
        : value;
}, z.object({
    clipId: VideoStudioIdSchema,
    trimStartSeconds: z.number().min(0).max(60).optional(),
    trimEndSeconds: z.number().min(0).max(60).optional(),
    playbackRate: z.number().min(0.5).max(2).optional(),
    audioVolume: z.number().min(0).max(2).optional(),
    transitionStyle: z.enum(['cut', 'crossfade', 'match-cut', 'bridge']).optional(),
    transitionSeconds: z.number().min(0).max(2).optional(),
}));

export const VideoStudioJobRequestSchema = z.object({
    operation: VideoStudioJobOperationSchema,
    projectId: VideoStudioIdSchema,
    clipTitle: z.string().trim().max(240).optional(),
    prompt: VideoStudioPromptSchema.optional(),
    duration: z.number().int().min(1).max(15).optional(),
    authorizedCostUsd: z.number().positive().max(100).optional(),
    repeatCount: z.number().int().min(1).max(VIDEO_STUDIO_MAX_REPEAT_COUNT).optional(),
    autoMergeAfterLoop: z.boolean().optional(),
    referenceImage: VideoReferenceImageSchema.optional(),
    endReferenceImage: VideoReferenceImageSchema.optional(),
    visualReferenceImages: z.array(VideoReferenceImageSchema).max(2).optional(),
    visualInputMode: z.enum(['standard', 'text-only']).optional(),
    continuityNotes: VideoStudioNotesSchema.optional(),
    cameraNotes: VideoStudioNotesSchema.optional(),
    subjectLock: VideoStudioNotesSchema.optional(),
    sourceClipId: VideoStudioIdSchema.optional(),
    mergeClipIds: z.array(VideoStudioIdSchema).max(VIDEO_STUDIO_MAX_MERGE_CLIPS).optional(),
    mergeClipEdits: z.array(MergeClipEditSchema).max(VIDEO_STUDIO_MAX_MERGE_CLIPS).optional(),
    backgroundMusicUrl: z.string().trim().max(2_048).url().refine((value) => {
        try {
            const hostname = new URL(value).hostname.toLowerCase();
            return value.startsWith('https://')
                && (hostname === 'firebasestorage.googleapis.com' || hostname === 'storage.googleapis.com');
        } catch {
            return false;
        }
    }, 'Background music must come from project storage.').optional(),
    audioMixPreset: z.enum(['dialogue-first', 'balanced', 'music-first', 'custom']).optional(),
    backgroundMusicVolume: z.number().min(0).max(1).optional(),
    sceneAudioVolume: z.number().min(0).max(2).optional(),
    audioCrossfadeSeconds: z.number().min(0).max(2).optional(),
    qualityMode: z.enum(['proof', 'final']).optional(),
    generateAudio: z.boolean().optional(),
    audioMode: z.enum(VIDEO_STUDIO_AUDIO_MODES).optional(),
    dialogue: z.string().trim().max(240).optional(),
}).superRefine((value, context) => {
    if (['generate', 'extend', 'continue', 'edit'].includes(value.operation) && !value.prompt?.trim()) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['prompt'],
            message: `A prompt is required for "${value.operation}".`,
        });
    }

    if (['extend', 'continue', 'edit', 'extract-frame'].includes(value.operation) && !value.sourceClipId) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['sourceClipId'],
            message: `sourceClipId is required for "${value.operation}".`,
        });
    }

    if (value.operation === 'merge' && !value.mergeClipIds?.length) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['mergeClipIds'],
            message: 'At least one merge clip is required for "merge".',
        });
    }

    if (value.mergeClipIds) {
        const seenClipIds = new Set<string>();
        value.mergeClipIds.forEach((clipId, index) => {
            if (seenClipIds.has(clipId)) {
                context.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['mergeClipIds', index],
                    message: 'Merge clip ids must be unique.',
                });
            }
            seenClipIds.add(clipId);
        });
    }

    if (value.mergeClipEdits?.length) {
        if (value.operation !== 'merge') {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['mergeClipEdits'],
                message: 'Merge clip edits are only valid for "merge".',
            });
        }
        const mergeClipIds = new Set(value.mergeClipIds || []);
        const editedClipIds = new Set<string>();
        value.mergeClipEdits.forEach((edit, index) => {
            if (!mergeClipIds.has(edit.clipId)) {
                context.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['mergeClipEdits', index, 'clipId'],
                    message: 'Every merge clip edit must reference a selected merge clip.',
                });
            }
            if (editedClipIds.has(edit.clipId)) {
                context.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['mergeClipEdits', index, 'clipId'],
                    message: 'Each merge clip can have only one edit.',
                });
            }
            editedClipIds.add(edit.clipId);
        });
    }

    if (value.audioMode === 'dialogue' && !value.dialogue?.trim()) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['dialogue'],
            message: '대사·립싱크 모드에는 말할 대사가 필요합니다.',
        });
    }
});

export type VideoStudioJobRequest = z.infer<typeof VideoStudioJobRequestSchema>;

export function defaultVideoStudioJobTitle(operation: VideoStudioJobRequest['operation']) {
    switch (operation) {
        case 'continue':
            return 'Continue clip';
        case 'extract-frame':
            return 'Extract last frame';
        case 'merge':
            return 'Merge clips';
        default:
            return `${operation[0].toUpperCase()}${operation.slice(1)} clip`;
    }
}
