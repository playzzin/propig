import { z } from 'zod';

export const videoStudioJobRequestSchema = z.object({
    operation: z.enum(['generate', 'extend', 'continue', 'edit', 'merge', 'extract-frame']),
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

export type VideoStudioJobRequest = z.infer<typeof videoStudioJobRequestSchema>;
