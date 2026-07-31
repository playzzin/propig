"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.videoStudioJobRequestSchema = void 0;
const zod_1 = require("zod");
const videoReferenceImageSchema = zod_1.z.string().trim().min(1).max(280000).refine((value) => /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(value) || /^https:\/\//i.test(value), 'Visual references must be HTTPS URLs or image data URLs.');
const mergeClipEditSchema = zod_1.z.preprocess((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return value;
    const edit = value;
    return edit.transitionStyle === 'fade'
        ? Object.assign(Object.assign({}, edit), { transitionStyle: 'crossfade' }) : value;
}, zod_1.z.object({
    clipId: zod_1.z.string().min(1),
    trimStartSeconds: zod_1.z.number().min(0).max(60).optional(),
    trimEndSeconds: zod_1.z.number().min(0).max(60).optional(),
    playbackRate: zod_1.z.number().min(0.5).max(2).optional(),
    audioVolume: zod_1.z.number().min(0).max(2).optional(),
    transitionStyle: zod_1.z.enum(['cut', 'crossfade', 'match-cut', 'bridge']).optional(),
    transitionSeconds: zod_1.z.number().min(0).max(2).optional(),
}));
exports.videoStudioJobRequestSchema = zod_1.z.object({
    operation: zod_1.z.enum(['generate', 'extend', 'continue', 'edit', 'merge', 'extract-frame']),
    projectId: zod_1.z.string().min(1),
    clipTitle: zod_1.z.string().optional(),
    prompt: zod_1.z.string().optional(),
    duration: zod_1.z.number().int().min(1).max(15).optional(),
    repeatCount: zod_1.z.number().int().min(1).max(12).optional(),
    autoMergeAfterLoop: zod_1.z.boolean().optional(),
    referenceImage: zod_1.z.string().optional(),
    endReferenceImage: zod_1.z.string().optional(),
    visualReferenceImages: zod_1.z.array(videoReferenceImageSchema).max(2).optional(),
    continuityNotes: zod_1.z.string().optional(),
    cameraNotes: zod_1.z.string().optional(),
    subjectLock: zod_1.z.string().optional(),
    sourceClipId: zod_1.z.string().optional(),
    mergeClipIds: zod_1.z.array(zod_1.z.string()).optional(),
    mergeClipEdits: zod_1.z.array(mergeClipEditSchema).max(12).optional(),
    backgroundMusicUrl: zod_1.z.string().url().refine((value) => {
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
    var _a;
    if (value.audioMode === 'dialogue' && !((_a = value.dialogue) === null || _a === void 0 ? void 0 : _a.trim())) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['dialogue'],
            message: '대사·립싱크 모드에는 말할 대사가 필요합니다.',
        });
    }
});
//# sourceMappingURL=request.js.map