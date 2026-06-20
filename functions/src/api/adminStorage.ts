import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

if (!admin.apps.length) {
    admin.initializeApp();
}

type AdminStorageFile = {
    path: string;
    name: string;
    bucket: string;
    contentType: string | null;
    sizeBytes: number;
    createdAt: string | null;
    updatedAt: string | null;
    md5Hash: string | null;
    generation: string | null;
};

const DEFAULT_LIST_LIMIT = 6000;
const MAX_LIST_LIMIT = 20000;
const SIGNED_URL_TTL_MS = 15 * 60 * 1000;
const MAX_FOLDER_NAME_LENGTH = 120;

type HeaderReadableRequest = {
    header(name: string): string | undefined;
};

function parseBearerToken(header: string | undefined): string | null {
    if (!header) return null;
    const [scheme, token] = header.split(' ');
    if (!scheme || !token || scheme.toLowerCase() !== 'bearer') return null;
    return token.trim();
}

function parseAdminUidAllowList(): string[] {
    const raw = process.env.GEMINI_ADMIN_UIDS || process.env.ADMIN_UIDS || '';
    return raw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

async function requireAdmin(req: HeaderReadableRequest) {
    const token = parseBearerToken(req.header('authorization') || req.header('Authorization'));
    if (!token) {
        return { ok: false as const, status: 401, message: 'Authorization Bearer 토큰이 필요합니다.' };
    }

    try {
        const decoded = await admin.auth().verifyIdToken(token);
        const allowList = parseAdminUidAllowList();
        const hasAdminClaim = decoded.admin === true || decoded.role === 'admin';
        const isAllowedByUid = allowList.length > 0 && allowList.includes(decoded.uid);

        if (hasAdminClaim || isAllowedByUid) {
            return { ok: true as const, uid: decoded.uid };
        }

        const db = admin.firestore();
        const [adminDoc, accessDoc] = await Promise.all([
            db.collection('admins').doc(decoded.uid).get().catch(() => null),
            db.collection('userAccess').doc(decoded.uid).get().catch(() => null),
        ]);

        if (adminDoc?.exists || (accessDoc?.exists && accessDoc.data()?.role === 'admin')) {
            return { ok: true as const, uid: decoded.uid };
        }

        return { ok: false as const, status: 403, message: '관리자 권한이 없습니다.' };
    } catch (error) {
        logger.error('[Admin Storage] verifyIdToken failed.', error);
        return { ok: false as const, status: 401, message: '유효하지 않은 인증 토큰입니다.' };
    }
}

function parseLimit(value: unknown): number {
    const raw = Array.isArray(value) ? value[0] : value;
    if (typeof raw !== 'string') return DEFAULT_LIST_LIMIT;

    const limit = Number(raw);
    if (!Number.isFinite(limit) || limit <= 0) return DEFAULT_LIST_LIMIT;

    return Math.min(Math.floor(limit), MAX_LIST_LIMIT);
}

function normalizePrefix(value: unknown): string | undefined {
    const raw = Array.isArray(value) ? value[0] : value;
    const trimmed = typeof raw === 'string' ? raw.trim().replace(/^\/+/, '') : '';
    if (!trimmed) return undefined;
    return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

function normalizeFilePath(value: unknown): string | null {
    const raw = Array.isArray(value) ? value[0] : value;
    const trimmed = typeof raw === 'string' ? raw.trim().replace(/^\/+/, '') : '';
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

export const adminStorage = onRequest({ cors: true, timeoutSeconds: 120, memory: '1GiB' }, async (req, res) => {
    const authResult = await requireAdmin(req);
    if (!authResult.ok) {
        res.status(authResult.status).json({ ok: false, error: authResult.message });
        return;
    }

    try {
        const bucket = admin.storage().bucket();

        if (req.method === 'POST') {
            const body = typeof req.body === 'object' && req.body !== null ? req.body as { parentPath?: unknown; folderName?: unknown } : {};
            const parentPath = normalizeParentPath(body.parentPath);
            const folderName = normalizeFolderName(body.folderName);

            if (!folderName) {
                res.status(400).json({ ok: false, error: `폴더 이름은 ${MAX_FOLDER_NAME_LENGTH}자 이하이며 / 문자를 포함할 수 없습니다.` });
                return;
            }

            const folderPath = `${parentPath ? `${parentPath}/` : ''}${folderName}/`;
            const markerFile = bucket.file(folderPath);
            const [markerExists] = await markerFile.exists();

            if (markerExists) {
                res.status(409).json({ ok: false, error: '같은 위치에 이미 존재하는 폴더입니다.' });
                return;
            }

            const [existingChildren] = await bucket.getFiles({
                prefix: folderPath,
                maxResults: 1,
            });

            if (existingChildren.length > 0) {
                res.status(409).json({ ok: false, error: '같은 위치에 이미 존재하는 폴더입니다.' });
                return;
            }

            await markerFile.save('', {
                resumable: false,
                contentType: 'application/x-directory',
            });

            res.status(200).json({
                ok: true,
                bucket: bucket.name,
                path: folderPath,
            });
            return;
        }

        if (req.method !== 'GET') {
            res.status(405).json({ ok: false, error: '지원하지 않는 요청 방식입니다.' });
            return;
        }

        const downloadPath = normalizeFilePath(req.query.downloadPath);
        const downloadMode = Array.isArray(req.query.download) ? req.query.download[0] : req.query.download;
        const forceDownload = downloadMode === '1';

        if (downloadPath) {
            const file = bucket.file(downloadPath);
            const [exists] = await file.exists();

            if (!exists) {
                res.status(404).json({ ok: false, error: '요청한 Storage 파일을 찾을 수 없습니다.' });
                return;
            }

            const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_MS);
            const [url] = await file.getSignedUrl({
                action: 'read',
                expires: expiresAt,
                responseDisposition: forceDownload ? encodeContentDispositionFileName(readFileName(downloadPath)) : undefined,
            });

            res.status(200).json({
                ok: true,
                bucket: bucket.name,
                path: downloadPath,
                url,
                expiresAt: expiresAt.toISOString(),
            });
            return;
        }

        const limit = parseLimit(req.query.limit);
        const prefix = normalizePrefix(req.query.prefix);
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

        res.status(200).json({
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
        logger.error('[Admin Storage] Failed to read bucket.', error);
        const message = error instanceof Error ? error.message : 'Storage 목록을 불러오지 못했습니다.';
        res.status(500).json({ ok: false, error: message });
    }
});
