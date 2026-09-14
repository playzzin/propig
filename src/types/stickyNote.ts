
import { z } from 'zod';

export const StickyNoteColorSchema = z.enum(['sun', 'lime', 'sky', 'rose', 'violet', 'slate']);

export const TAG_COLOR_ORDER = ['sun', 'lime', 'sky', 'rose', 'violet', 'slate'] as const;

export type StickyNoteColor = z.infer<typeof StickyNoteColorSchema>;

export const MemoChecklistItemSchema = z.object({
    id: z.string().min(1),
    text: z.string().max(4000),
    isChecked: z.boolean(),
    comments: z.array(z.object({ id: z.string().min(1), text: z.string().max(1000), createdAt: z.number().finite() })).default([]),
});
export type MemoChecklistItem = z.infer<typeof MemoChecklistItemSchema>;
export const SmartMemoFields = {
    memoType: z.enum(['text', 'checklist']).optional(),
    checklistItems: z.array(MemoChecklistItemSchema).optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    reminderAt: z.number().finite().nullable().optional(),
    reminderAcknowledgedAt: z.number().finite().optional(),
};

export type StickyNote = {
    id: string;
    content: string;
    x: number;
    y: number;
    w: number;
    h: number;
    zIndex: number;
    color: StickyNoteColor;
    tags: string[];
    isPinned: boolean;
    isArchived: boolean;
    createdAt: number;
    updatedAt: number;
    memoType?: 'text' | 'checklist';
    checklistItems?: MemoChecklistItem[];
    priority?: 'low' | 'medium' | 'high';
    reminderAt?: number | null;
    reminderAcknowledgedAt?: number;
};

export const StickyNoteSchema: z.ZodType<StickyNote> = z
    .object({
        id: z.string().min(1),
        content: z.string(),
        x: z.number(),
        y: z.number(),
        w: z.number(),
        h: z.number(),
        zIndex: z.number(),
        color: StickyNoteColorSchema,
        tags: z.array(z.string()),
        isPinned: z.boolean(),
        isArchived: z.boolean(),
        createdAt: z.number(),
        updatedAt: z.number(),
        ...SmartMemoFields,
    })
    .strict();
