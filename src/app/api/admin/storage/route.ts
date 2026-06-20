import { NextResponse, type NextRequest } from 'next/server';
import admin, { getFirebaseAdminStatus } from '@/lib/firebase-admin';
import { requireAdminAuth } from '@/lib/server/admin-auth';
import type {
  AdminStorageErrorResponse,
  AdminStorageCreateFolderResponse,
  AdminStorageFile,
  AdminStorageListResponse,
  AdminStorageUrlResponse,
} from '@/types/storageBrowser';

export const dynamic = 'force-dynamic';

const DEFAULT_LIST_LIMIT = 6000;
const MAX_LIST_LIMIT = 20000;
const SIGNED_URL_TTL_MS = 15 * 60 * 1000;
const MAX_FOLDER_NAME_LENGTH = 120;

function jsonError(message: string, status: number) {
  return NextResponse.json<AdminStorageErrorResponse>({ ok: false, error: message }, { status });
}

function parseLimit(request: NextRequest): number {
  const raw = request.nextUrl.searchParams.get('limit');
  if (!raw) return DEFAULT_LIST_LIMIT;

  const limit = Number(raw);
  if (!Number.isFinite(limit) || limit <= 0) return DEFAULT_LIST_LIMIT;

  return Math.min(Math.floor(limit), MAX_LIST_LIMIT);
}

function normalizePrefix(value: string | null): string | undefined {
  const trimmed = (value ?? '').trim().replace(/^\/+/, '');
  if (!trimmed) return undefined;
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

function normalizeFilePath(value: string | null): string | null {
  const trimmed = (value ?? '').trim().replace(/^\/+/, '');
  return trimmed || null;
}

function normalizeParentPath(value: unknown): string {
  if (typeof value !== 'string') return '';

  const trimmed = value.trim().replace(/^\/+|\/+$/g, '');
  if (!trimmed) return '';

  return trimmed
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/');
}

function normalizeFolderName(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const folderName = value.trim();
  if (!folderName || folderName.length > MAX_FOLDER_NAME_LENGTH) return null;
  if (folderName.includes('/') || folderName.includes('\\')) return null;
  if (folderName === '.' || folderName === '..') return null;
  if (/[\u0000-\u001f]/.test(folderName)) return null;

  return folderName;
}

function readFileName(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function encodeContentDispositionFileName(fileName: string): string {
  const fallbackName = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_') || 'download';
  return `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function parseSize(value: unknown): number {
  const size = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(size) && size > 0 ? size : 0;
}

function mapStorageFile(file: { name: string; metadata?: Record<string, unknown> }, bucketName: string): AdminStorageFile {
  const metadata = file.metadata ?? {};

  return {
    path: file.name,
    name: readFileName(file.name),
    bucket: bucketName,
    contentType: typeof metadata.contentType === 'string' ? metadata.contentType : null,
    sizeBytes: parseSize(metadata.size),
    createdAt: typeof metadata.timeCreated === 'string' ? metadata.timeCreated : null,
    updatedAt: typeof metadata.updated === 'string' ? metadata.updated : null,
    md5Hash: typeof metadata.md5Hash === 'string' ? metadata.md5Hash : null,
    generation: typeof metadata.generation === 'string' ? metadata.generation : null,
  };
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdminAuth(request);
  if (!authResult.ok) {
    return jsonError(authResult.message, authResult.status);
  }

  if (!admin.apps.length) {
    const status = getFirebaseAdminStatus();
    return jsonError(status.message ?? 'Firebase Admin 초기화가 필요합니다.', 500);
  }

  try {
    const bucket = admin.storage().bucket();
    const downloadPath = normalizeFilePath(request.nextUrl.searchParams.get('downloadPath'));
    const forceDownload = request.nextUrl.searchParams.get('download') === '1';

    if (downloadPath) {
      const file = bucket.file(downloadPath);
      const [exists] = await file.exists();

      if (!exists) {
        return jsonError('요청한 Storage 파일을 찾을 수 없습니다.', 404);
      }

      const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_MS);
      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: expiresAt,
        responseDisposition: forceDownload ? encodeContentDispositionFileName(readFileName(downloadPath)) : undefined,
      });

      return NextResponse.json<AdminStorageUrlResponse>({
        ok: true,
        bucket: bucket.name,
        path: downloadPath,
        url,
        expiresAt: expiresAt.toISOString(),
      });
    }

    const limit = parseLimit(request);
    const prefix = normalizePrefix(request.nextUrl.searchParams.get('prefix'));
    const [files] = await bucket.getFiles({
      prefix,
      maxResults: limit + 1,
    });

    const hasMore = files.length > limit;
    const visibleFiles = files
      .slice(0, limit)
      .filter((file) => Boolean(file.name))
      .map((file) => mapStorageFile(file, bucket.name))
      .sort((a, b) =>
        a.path.localeCompare(b.path, 'ko-KR', {
          numeric: true,
          sensitivity: 'base',
        }),
      );

    const totalBytes = visibleFiles.reduce((sum, file) => sum + file.sizeBytes, 0);
    const totalFiles = visibleFiles.filter((file) => !file.path.endsWith('/')).length;

    return NextResponse.json<AdminStorageListResponse>({
      ok: true,
      bucket: bucket.name,
      generatedAt: new Date().toISOString(),
      limit,
      hasMore,
      totalFiles,
      totalBytes,
      prefix: prefix ?? null,
      files: visibleFiles,
    });
  } catch (error) {
    console.error('[Admin Storage] Failed to read bucket.', error);
    const message = error instanceof Error ? error.message : 'Storage 목록을 불러오지 못했습니다.';
    return jsonError(message, 500);
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAdminAuth(request);
  if (!authResult.ok) {
    return jsonError(authResult.message, authResult.status);
  }

  if (!admin.apps.length) {
    const status = getFirebaseAdminStatus();
    return jsonError(status.message ?? 'Firebase Admin 초기화가 필요합니다.', 500);
  }

  try {
    const body = (await request.json().catch(() => null)) as { parentPath?: unknown; folderName?: unknown } | null;
    const parentPath = normalizeParentPath(body?.parentPath);
    const folderName = normalizeFolderName(body?.folderName);

    if (!folderName) {
      return jsonError(`폴더 이름은 ${MAX_FOLDER_NAME_LENGTH}자 이하이며 / 문자를 포함할 수 없습니다.`, 400);
    }

    const folderPath = `${parentPath ? `${parentPath}/` : ''}${folderName}/`;
    const bucket = admin.storage().bucket();
    const markerFile = bucket.file(folderPath);
    const [markerExists] = await markerFile.exists();

    if (markerExists) {
      return jsonError('같은 위치에 이미 존재하는 폴더입니다.', 409);
    }

    const [existingChildren] = await bucket.getFiles({
      prefix: folderPath,
      maxResults: 1,
    });

    if (existingChildren.length > 0) {
      return jsonError('같은 위치에 이미 존재하는 폴더입니다.', 409);
    }

    await markerFile.save('', {
      resumable: false,
      contentType: 'application/x-directory',
    });

    return NextResponse.json<AdminStorageCreateFolderResponse>({
      ok: true,
      bucket: bucket.name,
      path: folderPath,
    });
  } catch (error) {
    console.error('[Admin Storage] Failed to create folder.', error);
    const message = error instanceof Error ? error.message : 'Storage 폴더를 만들지 못했습니다.';
    return jsonError(message, 500);
  }
}
