import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { z } from 'zod';
import { db } from '@/firebase/config';

export type ProjectBoardMode = 'project' | 'portfolio';

export interface ProjectBoardCategory {
  id: string;
  name: string;
  description: string;
  color: string;
}

export interface ProjectBoardTask {
  id: string;
  title: string;
  description?: string;
  done: boolean;
  imageUrl?: string;
}

export interface ProjectBoardPlanStage {
  id: string;
  title: string;
  body: string;
  imageUrl?: string;
}

export interface ProjectBoardItem {
  id: string;
  title: string;
  categoryId: string;
  owner: string;
  dueDate: string;
  imageUrl: string;
  summary: string;
  currentBody: string;
  currentHtml?: string;
  planBody: string;
  planHtml?: string;
  planStages?: ProjectBoardPlanStage[];
  tasks: ProjectBoardTask[];
  goalBody: string;
  goalHtml?: string;
  stageLabel: string;
  statusLabel: string;
}

export interface ProjectBoardData {
  categories: ProjectBoardCategory[];
  items: ProjectBoardItem[];
}

const ProjectBoardTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  done: z.boolean(),
  imageUrl: z.string().optional(),
});

const ProjectBoardPlanStageSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  imageUrl: z.string().optional(),
});

const ProjectBoardCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  color: z.string(),
});

const ProjectBoardItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  categoryId: z.string(),
  owner: z.string(),
  dueDate: z.string(),
  imageUrl: z.string(),
  summary: z.string(),
  currentBody: z.string().optional(),
  currentHtml: z.string().optional(),
  planBody: z.string(),
  planHtml: z.string().optional(),
  planStages: z.array(ProjectBoardPlanStageSchema).optional(),
  tasks: z.array(ProjectBoardTaskSchema),
  goalBody: z.string(),
  goalHtml: z.string().optional(),
  stageLabel: z.string(),
  statusLabel: z.string(),
});

const ProjectBoardDataSchema = z.object({
  categories: z.array(ProjectBoardCategorySchema),
  items: z.array(ProjectBoardItemSchema),
});

const BOARD_COLLECTION = 'corpProjectBoards';

function normalizeOptionalText(value?: string): string | undefined {
  const cleaned = value?.trim();
  return cleaned ? cleaned : undefined;
}

function normalizeProjectBoardData(data: ProjectBoardData): ProjectBoardData {
  return {
    categories: data.categories.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      color: category.color,
    })),
    items: data.items.map((item) => ({
      id: item.id,
      title: item.title,
      categoryId: item.categoryId,
      owner: item.owner,
      dueDate: item.dueDate,
      imageUrl: item.imageUrl,
      summary: item.summary,
      currentBody:
        item.currentBody ||
        `${item.statusLabel} 단계입니다. 과제 진행 현황과 다음 실행 내용을 확인하세요.`,
      currentHtml: normalizeOptionalText(item.currentHtml),
      planBody: item.planBody,
      planHtml: normalizeOptionalText(item.planHtml),
      tasks: item.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        description: normalizeOptionalText(task.description),
        done: task.done,
        imageUrl: task.imageUrl || item.imageUrl,
      })),
      goalBody: item.goalBody,
      goalHtml: normalizeOptionalText(item.goalHtml),
      stageLabel: item.stageLabel,
      statusLabel: item.statusLabel,
    })),
  };
}

function parseBoardSnapshot(value: unknown): ProjectBoardData {
  const parsed = ProjectBoardDataSchema.safeParse(value);

  if (!parsed.success) {
    throw new Error('프로젝트 보드 데이터 형식이 올바르지 않습니다.');
  }

  return normalizeProjectBoardData(parsed.data as ProjectBoardData);
}

function stripUndefinedFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedFields(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, itemValue]) => itemValue !== undefined)
        .map(([key, itemValue]) => [key, stripUndefinedFields(itemValue)])
    ) as T;
  }

  return value;
}

class ProjectBoardService {
  subscribe(
    mode: ProjectBoardMode,
    onData: (data: ProjectBoardData, source: 'firestore' | 'empty') => void,
    onError: (error: Error) => void
  ): Unsubscribe {
    return onSnapshot(
      doc(db, BOARD_COLLECTION, mode),
      (snapshot) => {
        if (!snapshot.exists()) {
          onData({ categories: [], items: [] }, 'empty');
          return;
        }

        try {
          onData(parseBoardSnapshot(snapshot.data()), 'firestore');
        } catch (error) {
          onError(error instanceof Error ? error : new Error(String(error)));
        }
      },
      (error) => {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    );
  }

  async saveBoard(mode: ProjectBoardMode, data: ProjectBoardData, actor: { uid: string; email?: string | null }): Promise<void> {
    const normalized = normalizeProjectBoardData(data);

    await setDoc(
      doc(db, BOARD_COLLECTION, mode),
      {
        ...stripUndefinedFields(normalized),
        updatedAt: serverTimestamp(),
        updatedBy: actor.uid,
        updatedByEmail: actor.email ?? null,
      },
      { merge: true }
    );
  }
}

export const projectBoardService = new ProjectBoardService();
