import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';

// 카테고리 스키마
export const CategorySchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string().min(1).max(50),
  icon: z.string().default('fa-folder'),
  color: z.string().default('#3B82F6'),
  order: z.number().default(0),
  createdAt: z.instanceof(Timestamp),
  updatedAt: z.instanceof(Timestamp),
});

export type Category = z.infer<typeof CategorySchema>;

// 북마크 스키마
export const BookmarkSchema = z.object({
  id: z.string(),
  userId: z.string(),
  url: z.string().url(),
  title: z.string().min(1).max(200),
  favicon: z.string().optional(),
  description: z.string().max(500).optional(),
  categoryId: z.string(),
  tags: z.array(z.string().max(20)).max(10).default([]),
  isFavorite: z.boolean().default(false),
  order: z.number().default(0),
  createdAt: z.instanceof(Timestamp),
  updatedAt: z.instanceof(Timestamp),
});

export type Bookmark = z.infer<typeof BookmarkSchema>;

// 메타데이터 스키마 (AI 응답)
export const MetadataSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  favicon: z.string().optional(),
  suggestedCategory: z.string().optional(),
  tags: z.array(z.string()).optional(),
  aiUsage: z.object({
    promptTokens: z.number(),
    completionTokens: z.number(),
    totalTokens: z.number(),
  }).optional(),
  aiCost: z.object({
    model: z.string(),
    currency: z.literal('USD').default('USD'),
    inputCostUsd: z.number(),
    outputCostUsd: z.number(),
    totalCostUsd: z.number(),
    estimatedKrw: z.number().optional(),
    exchangeRate: z.number().optional(),
    note: z.string().optional(),
  }).optional(),
});

export type Metadata = z.infer<typeof MetadataSchema>;

// 클립보드 상태
export interface ClipboardState {
  isMonitoring: boolean;
  lastDetected: string | null;
}
