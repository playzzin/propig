import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { z } from 'zod';
import { db, storage } from '@/firebase/config';

export type CeoIntroHeroMediaType = 'image' | 'video';
export type CeoIntroMediaSlot = 'hero' | 'leadershipLab';

export interface CeoIntroHeroMediaItem {
  id: string;
  type: CeoIntroHeroMediaType;
  url: string;
  title: string;
  description?: string;
  alt?: string;
  posterUrl?: string;
  storagePath?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  order: number;
  enabled: boolean;
  createdAt?: string;
}

export interface CeoIntroHeroMediaData {
  items: CeoIntroHeroMediaItem[];
}

const CeoIntroHeroMediaItemSchema = z.object({
  id: z.string(),
  type: z.enum(['image', 'video']),
  url: z.string().min(1),
  title: z.string().default('대표 미디어'),
  description: z.string().optional(),
  alt: z.string().optional(),
  posterUrl: z.string().optional(),
  storagePath: z.string().optional(),
  fileName: z.string().optional(),
  mimeType: z.string().optional(),
  sizeBytes: z.number().optional(),
  order: z.number().default(0),
  enabled: z.boolean().default(true),
  createdAt: z.string().optional(),
});

const CeoIntroHeroMediaDataSchema = z.object({
  items: z.array(CeoIntroHeroMediaItemSchema).default([]),
});

const MEDIA_COLLECTION = 'corpPageMedia';
const MEDIA_TARGETS: Record<
  CeoIntroMediaSlot,
  {
    docId: string;
    storageFolder: string;
    fallbackTitle: string;
  }
> = {
  hero: {
    docId: 'ceoIntroHero',
    storageFolder: 'hero',
    fallbackTitle: '대표 미디어',
  },
  leadershipLab: {
    docId: 'ceoIntroLeadershipLab',
    storageFolder: 'leadership-lab',
    fallbackTitle: '리더십 랩 미디어',
  },
};

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `ceo_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getMediaType(file: File): CeoIntroHeroMediaType {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  throw new Error('이미지 또는 동영상 파일만 등록할 수 있습니다.');
}

function sanitizeStorageFileName(value: string, fallback: string) {
  const cleaned = value
    .split('?')[0]
    .replace(/[\\/:*?"<>|#%{}^~[\]`]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);

  return cleaned || fallback;
}

function titleFromFileName(fileName: string, fallback = '대표 미디어') {
  return fileName
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim() || fallback;
}

function normalizeMediaData(value: unknown): CeoIntroHeroMediaData {
  const parsed = CeoIntroHeroMediaDataSchema.safeParse(value);
  if (!parsed.success) return { items: [] };

  return {
    items: parsed.data.items
      .map((item, index) => ({
        ...item,
        title: item.title.trim() || '대표 미디어',
        description: item.description?.trim() || undefined,
        alt: item.alt?.trim() || undefined,
        posterUrl: item.posterUrl?.trim() || undefined,
        order: Number.isFinite(item.order) ? item.order : index,
        enabled: item.enabled !== false,
      }))
      .sort((a, b) => a.order - b.order),
  };
}

class CeoIntroMediaService {
  subscribeMedia(
    slot: CeoIntroMediaSlot,
    onData: (data: CeoIntroHeroMediaData, source: 'firestore' | 'fallback') => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    const target = MEDIA_TARGETS[slot];

    return onSnapshot(
      doc(db, MEDIA_COLLECTION, target.docId),
      (snapshot) => {
        if (!snapshot.exists()) {
          onData({ items: [] }, 'fallback');
          return;
        }

        onData(normalizeMediaData(snapshot.data()), 'firestore');
      },
      (error) => {
        onError(error instanceof Error ? error : new Error(String(error)));
      },
    );
  }

  subscribeHeroMedia(
    onData: (data: CeoIntroHeroMediaData, source: 'firestore' | 'fallback') => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    return this.subscribeMedia('hero', onData, onError);
  }

  async saveMedia(
    slot: CeoIntroMediaSlot,
    data: CeoIntroHeroMediaData,
    actor: { uid: string; email?: string | null },
  ): Promise<void> {
    const target = MEDIA_TARGETS[slot];
    const normalized = normalizeMediaData(data);

    await setDoc(
      doc(db, MEDIA_COLLECTION, target.docId),
      {
        items: normalized.items.map((item, index) => ({
          ...item,
          order: index,
          title: item.title.trim() || target.fallbackTitle,
          description: item.description?.trim() || '',
          alt: item.alt?.trim() || '',
          posterUrl: item.posterUrl?.trim() || '',
        })),
        updatedAt: serverTimestamp(),
        updatedBy: actor.uid,
        updatedByEmail: actor.email ?? null,
      },
      { merge: true },
    );
  }

  async saveHeroMedia(
    data: CeoIntroHeroMediaData,
    actor: { uid: string; email?: string | null },
  ): Promise<void> {
    await this.saveMedia('hero', data, actor);
  }

  async uploadMediaFile(file: File, slot: CeoIntroMediaSlot = 'hero'): Promise<CeoIntroHeroMediaItem> {
    const target = MEDIA_TARGETS[slot];
    const type = getMediaType(file);
    const id = createId();
    const safeName = sanitizeStorageFileName(file.name, type === 'image' ? 'ceo-photo' : 'ceo-video');
    const storagePath = `corp/ceo-intro/${target.storageFolder}/${id}_${safeName}`;
    const fileRef = ref(storage, storagePath);
    const title = titleFromFileName(file.name, target.fallbackTitle);

    await uploadBytes(fileRef, file, { contentType: file.type || undefined });
    const url = await getDownloadURL(fileRef);

    return {
      id,
      type,
      url,
      title,
      alt: type === 'image' ? title : undefined,
      storagePath,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      order: 0,
      enabled: true,
      createdAt: new Date().toISOString(),
    };
  }

  async uploadHeroMediaFile(file: File): Promise<CeoIntroHeroMediaItem> {
    return this.uploadMediaFile(file, 'hero');
  }

  async deleteHeroMediaStorage(item: Pick<CeoIntroHeroMediaItem, 'storagePath'>): Promise<void> {
    if (!item.storagePath) return;
    await deleteObject(ref(storage, item.storagePath)).catch(() => undefined);
  }

  createExternalMediaItem(input: {
    type: CeoIntroHeroMediaType;
    url: string;
    title: string;
    description?: string;
    alt?: string;
    posterUrl?: string;
  }, slot: CeoIntroMediaSlot = 'hero'): CeoIntroHeroMediaItem {
    const target = MEDIA_TARGETS[slot];

    return {
      id: createId(),
      type: input.type,
      url: input.url.trim(),
      title: input.title.trim() || target.fallbackTitle,
      description: input.description?.trim() || undefined,
      alt: input.alt?.trim() || undefined,
      posterUrl: input.posterUrl?.trim() || undefined,
      order: 0,
      enabled: true,
      createdAt: new Date().toISOString(),
    };
  }
}

export function isCeoIntroVideoMedia(item: Pick<CeoIntroHeroMediaItem, 'type' | 'mimeType' | 'url'>) {
  return item.type === 'video' || item.mimeType?.startsWith('video/') || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(item.url);
}

export const ceoIntroMediaService = new CeoIntroMediaService();
