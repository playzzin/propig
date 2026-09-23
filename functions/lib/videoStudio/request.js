"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.videoStudioJobRequestSchema = exports.VIDEO_STUDIO_MAX_MERGE_CLIPS = exports.VIDEO_STUDIO_MAX_REPEAT_COUNT = void 0;
const zod_1 = require("zod");
exports.VIDEO_STUDIO_MAX_REPEAT_COUNT = 12;
exports.VIDEO_STUDIO_MAX_MERGE_CLIPS = 48;
const videoStudioIdSchema = zod_1.z.string().trim().min(1).max(240);
const videoStudioPromptSchema = zod_1.z.string().trim().max(12000);
const videoStudioNotesSchema = zod_1.z.string().trim().max(4000);
const videoReferenceImageSchema = zod_1.z.string().trim().min(1).max(280000).refine((value) => /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(value) || /^https:\/\//i.test(value), 'Visual references must be HTTPS URLs or image data URLs.');
const mergeClipEditSchema = zod_1.z.preprocess((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return value;
    const edit = value;
    return edit.transitionStyle === 'fade'
        ? Object.assign(Object.assign({}, edit), { transitionStyle: 'crossfade' }) : value;
}, zod_1.z.object({
    clipId: videoStudioIdSchema,
    trimStartSeconds: zod_1.z.number().min(0).max(60).optional(),
    trimEndSeconds: zod_1.z.number().min(0).max(60).optional(),
    playbackRate: zod_1.z.number().min(0.5).max(2).optional(),
    audioVolume: zod_1.z.number().min(0).max(2).optional(),
    transitionStyle: zod_1.z.enum(['cut', 'crossfade', 'match-cut', 'bridge']).optional(),
    transitionSeconds: zod_1.z.number().min(0).max(2).optional(),
}));
exports.videoStudioJobRequestSchema = zod_1.z.object({
    operation: zod_1.z.enum(['generate', 'extend', 'continue', 'edit', 'merge', 'extract-frame']),
    projectId: videoStudioIdSchema,
    clipTitle: zod_1.z.string().trim().max(240).optional(),
    prompt: videoStudioPromptSchema.optional(),
    duration: zod_1.z.number().int().min(1).max(15).optional(),
    repeatCount: zod_1.z.number().int().min(1).max(exports.VIDEO_STUDIO_MAX_REPEAT_COUNT).optional(),
    autoMergeAfterLoop: zod_1.z.boolean().optional(),
    referenceImage: videoReferenceImageSchema.optional(),
    endReferenceImage: videoReferenceImageSchema.optional(),
    visualReferenceImages: zod_1.z.array(videoReferenceImageSchema).max(2).optional(),
    visualInputMode: zod_1.z.enum(['standard', 'text-only']).optional(),
    continuityNotes: videoStudioNotesSchema.optional(),
    cameraNotes: videoStudioNotesSchema.optional(),
    subjectLock: videoStudioNotesSchema.optional(),
    sourceClipId: videoStudioIdSchema.optional(),
    mergeClipIds: zod_1.z.array(videoStudioIdSchema).max(exports.VIDEO_STUDIO_MAX_MERGE_CLIPS).optional(),
    mergeClipEdits: zod_1.z.array(mergeClipEditSchema).max(exports.VIDEO_STUDIO_MAX_MERGE_CLIPS).optional(),
    backgroundMusicUrl: zod_1.z.string().trim().max(2048).url().refine((value) => {
        try {
            const hostname = new URL(value).hostname.toLowerCase();
            return value.startsWith('https://')
                && (hostname === 'firebasestorage.googleapis.com' || hostname === 'storage.googleapis.com');
        }
        catch (_a) {
            return false;
        }
    }, 'Background music must come from project storage.').optional(),
    audioMixPreset: zod_1.z.enum(['dialogue-first', 'balanced', 'music-first', 'custom']).optional(),
    backgroundMusicVolume: zod_1.z.number().min(0).max(1).optional(),
    sceneAudioVolume: zod_1.z.number().min(0).max(2).optional(),
    audioCrossfadeSeconds: zod_1.z.number().min(0).max(2).optional(),
    qualityMode: zod_1.z.enum(['proof', 'final']).optional(),
    generateAudio: zod_1.z.boolean().optional(),
    audioMode: zod_1.z.enum(['silent', 'ambient', 'dialogue']).optional(),
    dialogue: zod_1.z.string().trim().max(240).optional(),
}).superRefine((value, context) => {
    var _a, _b, _c, _d;
    if (['generate', 'extend', 'continue', 'edit'].includes(value.operation) && !((_a = value.prompt) === null || _a === void 0 ? void 0 : _a.trim())) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['prompt'],
            message: `A prompt is required for "${value.operation}".`,
        });
    }
    if (['extend', 'continue', 'edit', 'extract-frame'].includes(value.operation) && !value.sourceClipId) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['sourceClipId'],
            message: `sourceClipId is required for "${value.operation}".`,
        });
    }
    if (value.operation === 'merge' && !((_b = value.mergeClipIds) === null || _b === void 0 ? void 0 : _b.length)) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['mergeClipIds'],
            message: 'At least one merge clip is required for "merge".',
        });
    }
    if (value.mergeClipIds) {
        const seenClipIds = new Set();
        value.mergeClipIds.forEach((clipId, index) => {
            if (seenClipIds.has(clipId)) {
                context.addIssue({
                    code: zod_1.z.ZodIssueCode.custom,
                    path: ['mergeClipIds', index],
                    message: 'Merge clip ids must be unique.',
                });
            }
            seenClipIds.add(clipId);
        });
    }
    if ((_c = value.mergeClipEdits) === null || _c === void 0 ? void 0 : _c.length) {
        if (value.operation !== 'merge') {
            context.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                path: ['mergeClipEdits'],
                message: 'Merge clip edits are only valid for "merge".',
            });
        }
        const mergeClipIds = new Set(value.mergeClipIds || []);
        const editedClipIds = new Set();
        value.mergeClipEdits.forEach((edit, index) => {
            if (!mergeClipIds.has(edit.clipId)) {
                context.addIssue({
                    code: zod_1.z.ZodIssueCode.custom,
                    path: ['mergeClipEdits', index, 'clipId'],
                    message: 'Every merge clip edit must reference a selected merge clip.',
                });
            }
            if (editedClipIds.has(edit.clipId)) {
                context.addIssue({
                    code: zod_1.z.ZodIssueCode.custom,
                    path: ['mergeClipEdits', index, 'clipId'],
                    message: 'Each merge clip can have only one edit.',
                });
            }
            editedClipIds.add(edit.clipId);
        });
    }
    if (value.audioMode === 'dialogue' && !((_d = value.dialogue) === null || _d === void 0 ? void 0 : _d.trim())) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['dialogue'],
            message: '대사·립싱크 모드에는 말할 대사가 필요합니다.',
        });
    }
});
//# sourceMappingURL=request.js.map