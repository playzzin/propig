import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';

// 북마크 스키마
export const BookmarkSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  title: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()),
  folder: z.string(),
  favicon: z.string().optional(),
  createdAt: z.instanceof(Timestamp),
  updatedAt: z.instanceof(Timestamp),
});

export type Bookmark = z.infer<typeof BookmarkSchema>;

// 폴더 스키마
export const FolderSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().optional(),
  parentId: z.string().optional(),
  createdAt: z.instanceof(Timestamp),
  updatedAt: z.instanceof(Timestamp),
});

export type Folder = z.infer<typeof FolderSchema>;

// 메타데이터 스키마
export const MetadataSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  favicon: z.string().optional(),
  siteName: z.string().optional(),
  author: z.string().optional(),
  publishedDate: z.string().optional(),
  image: z.string().optional(),
});

export type Metadata = z.infer<typeof MetadataSchema>;
