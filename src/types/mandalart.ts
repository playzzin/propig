import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';

// Individual task with completion tracking
export const MandalartTaskItemSchema = z.object({
  text: z.string().max(50).default(''),
  completed: z.boolean().default(false),
});

export type MandalartTaskItem = z.infer<typeof MandalartTaskItemSchema>;

// Legacy support: accept plain strings and convert to TaskItem
export const MandalartTaskSchema = z.union([
  MandalartTaskItemSchema,
  z.string().max(50).transform((text): MandalartTaskItem => ({ text, completed: false })),
]);

export const MandalartTemplateSchema = z.enum(['custom', 'okr', 'achievement']);
export type MandalartTemplate = z.infer<typeof MandalartTemplateSchema>;

export const MandalartSubGoalSchema = z.object({
  id: z.string(),
  title: z.string().max(50),
  tasks: z.array(MandalartTaskSchema).length(8),
});

export const MandalartBoardSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string().min(1).max(100),
  description: z.string().max(200).optional(),
  template: MandalartTemplateSchema.default('custom'),
  mainGoal: z.string().max(50),
  subGoals: z.array(MandalartSubGoalSchema).length(8),
  createdAt: z.instanceof(Timestamp),
  updatedAt: z.instanceof(Timestamp),
});

export const MandalartRecommendationSchema = z.object({
  mainGoal: z.string().max(50).optional(),
  subGoals: z.array(
    z.object({
      title: z.string().max(50),
      tasks: z.array(z.union([
        MandalartTaskItemSchema,
        z.string().max(50).transform((text): MandalartTaskItem => ({ text, completed: false })),
      ])).length(8),
    }),
  ).length(8),
});

export type MandalartSubGoal = z.infer<typeof MandalartSubGoalSchema>;
export type MandalartBoard = z.infer<typeof MandalartBoardSchema>;

export type MandalartBoardInput = Omit<MandalartBoard, 'id' | 'createdAt' | 'updatedAt'>;

// Helper to create an empty task item
export const createEmptyTask = (): MandalartTaskItem => ({ text: '', completed: false });
