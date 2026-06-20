"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.videoStudioJobRequestSchema = void 0;
const zod_1 = require("zod");
exports.videoStudioJobRequestSchema = zod_1.z.object({
    operation: zod_1.z.enum(['generate', 'extend', 'continue', 'edit', 'merge', 'extract-frame']),
    projectId: zod_1.z.string().min(1),
    clipTitle: zod_1.z.string().optional(),
    prompt: zod_1.z.string().optional(),
    duration: zod_1.z.number().int().min(1).max(15).optional(),
    repeatCount: zod_1.z.number().int().min(1).max(12).optional(),
    autoMergeAfterLoop: zod_1.z.boolean().optional(),
    referenceImage: zod_1.z.string().optional(),
    continuityNotes: zod_1.z.string().optional(),
    cameraNotes: zod_1.z.string().optional(),
    subjectLock: zod_1.z.string().optional(),
    sourceClipId: zod_1.z.string().optional(),
    mergeClipIds: zod_1.z.array(zod_1.z.string()).optional(),
});
//# sourceMappingURL=request.js.map