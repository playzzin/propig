import { z } from 'zod';

const videoReferenceImageSchema = z.string().trim().min(1).max(280_000).refine(
    (value) => /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(value) || /^https:\/\//i.test(value),
    'Visual references must be HTTPS URLs or image data URLs.',
);

const mergeClipEditSchema = z.preprocess((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const edit = value as Record<string, unknown>;
    return edit.transitionStyle === 'fade'
        ? { ...edit, transitionStyle: 'crossfade' }
        : value;
}, z.object({
    clipId: z.string().min(1),
    trimStartSeconds: z.number().min(0).max(60).optional(),
    trimEndSeconds: z.number().min(0).max(60).optional(),
    playbackRate: z.number().min(0.5).max(2).optional(),
    audioVolume: z.number().min(0).max(2).optional(),
    transitionStyle: z.enum(['cut', 'crossfade', 'match-cut', 'bridge']).optional(),
    transitionSeconds: z.number().min(0).max(2).optional(),
}));

export const videoStudioJobRequestSchema = z.object({
    operation: z.enum(['generate', 'extend', 'continue', 'edit', 'merge', 'extract-frame']),
    projectId: z.string().min(1),
    clipTitle: z.string().optional(),
    prompt: z.string().optional(),
    duration: z.number().int().min(1).max(15).optional(),
    repeatCount: z.number().int().min(1).max(12).optional(),
    autoMergeAfterLoop: z.boolean().optional(),
    referenceImage: z.string().optional(),
    endReferenceImage: z.string().optional(),
    visualReferenceImages: z.array(videoReferenceImageSchema).max(2).optional(),
    continuityNotes: z.string().optional(),
    cameraNotes: z.string().optional(),
    subjectLock: z.string().optional(),
    sourceClipId: z.string().optional(),
    mergeClipIds: z.array(z.string()).optional(),
    mergeClipEdits: z.array(mergeClipEditSchema).max(12).optional(),
    backgroundMusicUrl: z.string().url().refine((value) => {
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
    audioMode: z.enum(['silent', 'ambient', 'dialogue']).optional(),
    dialogue: z.string().trim().max(240).optional(),
}).superRefine((value, context) => {
    if (value.audioMode === 'dialogue' && !value.dialogue?.trim()) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['dialogue'],
            message: '대사·립싱크 모드에는 말할 대사가 필요합니다.',
        });
    }
});

export type VideoStudioJobRequest = z.infer<typeof videoStudioJobRequestSchema>;
