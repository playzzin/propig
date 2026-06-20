import { z } from 'zod';

export const VideoStudioJobOperationSchema = z.enum([
    'generate',
    'extend',
    'continue',
    'edit',
    'merge',
    'extract-frame',
]);

export const VideoStudioJobRequestSchema = z.object({
    operation: VideoStudioJobOperationSchema,
    projectId: z.string().min(1),
    clipTitle: z.string().optional(),
    prompt: z.string().optional(),
    duration: z.number().int().min(1).max(15).optional(),
    repeatCount: z.number().int().min(1).max(12).optional(),
    autoMergeAfterLoop: z.boolean().optional(),
    referenceImage: z.string().optional(),
    continuityNotes: z.string().optional(),
    cameraNotes: z.string().optional(),
    subjectLock: z.string().optional(),
    sourceClipId: z.string().optional(),
    mergeClipIds: z.array(z.string()).optional(),
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
