import { auth, db } from '@/firebase/config';
import { storage } from '@/firebase/storage';
import {
    collection,
    doc,
    getDocs,
    getDoc,
    setDoc,
    deleteDoc,
    updateDoc,
    writeBatch,
    serverTimestamp,
    deleteField,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import imageCompression from 'browser-image-compression';
import { z } from 'zod';
import {
    extractStoragePathFromDownloadUrl,
    normalizePhotoStoragePath,
    PhotoImageSourceSchema,
    resolveFirstPhotoImageSource,
    resolvePhotoImageSource,
    sanitizePhotoImageUrl,
} from '@/utils/photoImageUrls';

/* ─── Types ─────────────────────────────────────────────────── */

export const PhotoItemSchema = z.object({
    id: z.string(),
    url: z.string(),
    order: z.number().default(0),
    source: z.enum(['upload', 'ai']).default('upload'),
    type: z.enum(['image', 'video']).optional(),
    prompt: z.string().optional(),
    fileName: z.string().optional(),
    extension: z.string().optional(),
    mimeType: z.string().optional(),
    sizeBytes: z.number().optional(),
    sizeLabel: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    storagePath: z.string().optional(),
    thumbnailUrl: z.string().optional(),
    thumbnailPath: z.string().optional(),
    uploadedAt: z.any().optional(),
});

export type PhotoItem = z.infer<typeof PhotoItemSchema>;

const PhotoItemWriteSchema = PhotoItemSchema.extend({
    url: PhotoImageSourceSchema,
    thumbnailUrl: PhotoImageSourceSchema.optional(),
});

export const PhotoSchema = z.object({
    id: z.string().optional(),
    title: z.string().min(1, '제목을 입력해주세요.'),
    description: z.string().optional(),
    order: z.number().default(0),
    photoItems: z.array(PhotoItemSchema).default([]),
    images: z.array(z.string()).default([]),   // legacy compat
    coverUrl: z.string().optional(),
    createdAt: z.any().optional(),
    updatedAt: z.any().optional(),
});

export type PhotoAlbum = z.infer<typeof PhotoSchema>;

export const PHOTO_ALBUMS_UPDATED_EVENT = 'propig:photo-albums-updated';

/* ─── Helpers ────────────────────────────────────────────────── */

function notifyPhotoAlbumsChanged() {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(PHOTO_ALBUMS_UPDATED_EVENT));
}

function asString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: unknown, fallback = 0): number {
    const numberValue = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numberValue) ? numberValue : fallback;
}

function hashString(value: string): string {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    }
    return Math.abs(hash).toString(36);
}

function coercePhotoSource(value: unknown): 'upload' | 'ai' {
    return value === 'ai' ? 'ai' : 'upload';
}

function coercePhotoType(value: unknown): 'image' | 'video' | undefined {
    return value === 'image' || value === 'video' ? value : undefined;
}

async function resolvePhotoImageSourceSafely(...values: unknown[]): Promise<string> {
    return resolveFirstPhotoImageSource(values).catch(() => '');
}

function compactPhotoItem(item: PhotoItem): PhotoItem {
    return removeUndefinedDeep(item);
}

function getAlbumCoverUrl(items: PhotoItem[]): string | undefined {
    return items.find((item) => !isVideoItem(item) && sanitizePhotoImageUrl(item.url))?.url;
}

async function normalizePhotoItemForRead(raw: unknown, fallbackId: string, fallbackOrder: number): Promise<PhotoItem | null> {
    if (!raw || typeof raw !== 'object') return null;

    const data = raw as Record<string, unknown>;
    const storagePath = normalizePhotoStoragePath(data.storagePath);
    const thumbnailPath = normalizePhotoStoragePath(data.thumbnailPath);
    const resolvedUrl = await resolvePhotoImageSourceSafely(data.url, storagePath);
    const resolvedThumbnailUrl = await resolvePhotoImageSourceSafely(data.thumbnailUrl, thumbnailPath);
    const inferredStoragePath = storagePath || extractStoragePathFromDownloadUrl(resolvedUrl);
    const inferredThumbnailPath = thumbnailPath || extractStoragePathFromDownloadUrl(resolvedThumbnailUrl);

    const candidate: PhotoItem = compactPhotoItem({
        id: asString(data.id) || fallbackId,
        url: resolvedUrl,
        order: asNumber(data.order, fallbackOrder),
        source: coercePhotoSource(data.source),
        type: coercePhotoType(data.type),
        prompt: asString(data.prompt) || undefined,
        fileName: asString(data.fileName) || undefined,
        extension: asString(data.extension) || undefined,
        mimeType: asString(data.mimeType) || undefined,
        sizeBytes: typeof data.sizeBytes === 'number' ? data.sizeBytes : undefined,
        sizeLabel: asString(data.sizeLabel) || undefined,
        width: typeof data.width === 'number' ? data.width : undefined,
        height: typeof data.height === 'number' ? data.height : undefined,
        storagePath: inferredStoragePath || undefined,
        thumbnailUrl: resolvedThumbnailUrl || undefined,
        thumbnailPath: inferredThumbnailPath || undefined,
        uploadedAt: data.uploadedAt,
    });

    const parsed = PhotoItemSchema.safeParse(candidate);
    if (parsed.success) return parsed.data;

    console.warn('Skipping invalid photo item.', parsed.error.flatten());
    return null;
}

async function normalizePhotoItemForWrite(raw: Omit<PhotoItem, 'order'> | PhotoItem, order: number): Promise<PhotoItem> {
    const storagePath = normalizePhotoStoragePath(raw.storagePath);
    const thumbnailPath = normalizePhotoStoragePath(raw.thumbnailPath);
    const resolvedUrl = await resolvePhotoImageSource(raw.url || storagePath);
    const resolvedThumbnailUrl = raw.thumbnailUrl || thumbnailPath
        ? await resolvePhotoImageSourceSafely(raw.thumbnailUrl, thumbnailPath)
        : '';

    const candidate = compactPhotoItem({
        ...raw,
        id: raw.id.trim(),
        url: resolvedUrl,
        order,
        source: coercePhotoSource(raw.source),
        type: coercePhotoType(raw.type),
        prompt: raw.prompt?.trim() || undefined,
        fileName: raw.fileName?.trim() || undefined,
        extension: raw.extension?.trim() || undefined,
        mimeType: raw.mimeType?.trim() || undefined,
        sizeLabel: raw.sizeLabel?.trim() || undefined,
        storagePath: storagePath || extractStoragePathFromDownloadUrl(resolvedUrl) || undefined,
        thumbnailUrl: resolvedThumbnailUrl || undefined,
        thumbnailPath: thumbnailPath || extractStoragePathFromDownloadUrl(resolvedThumbnailUrl) || undefined,
    });

    return PhotoItemWriteSchema.parse(candidate);
}

async function normalizePhotoItemsForWrite(items: Array<Omit<PhotoItem, 'order'> | PhotoItem>, startOrder = 0): Promise<PhotoItem[]> {
    const settled = await Promise.allSettled(
        items.map((item, index) => normalizePhotoItemForWrite(item, startOrder + index)),
    );
    const normalized = settled
        .filter((result): result is PromiseFulfilledResult<PhotoItem> => result.status === 'fulfilled')
        .map((result, index) => ({ ...result.value, order: startOrder + index }));

    const failed = settled.length - normalized.length;
    if (failed > 0) {
        console.warn(`Skipped ${failed} invalid photo item(s) before saving.`);
    }

    return normalized;
}

function buildAlbumWritePayload(items: PhotoItem[]): Record<string, unknown> {
    const coverUrl = getAlbumCoverUrl(items);
    return {
        photoItems: removeUndefinedDeep(items),
        coverUrl: coverUrl || deleteField(),
        images: items.map((item) => item.url).filter(Boolean),
        updatedAt: serverTimestamp(),
    };
}

async function normalizeAlbum(data: Record<string, unknown>, id: string): Promise<PhotoAlbum> {
    const rawItems = Array.isArray(data.photoItems) ? data.photoItems : [];
    let photoItems = (await Promise.all(
        rawItems.map((item, index) => normalizePhotoItemForRead(item, `photo_${index}_${id}`, index)),
    )).filter((item): item is PhotoItem => Boolean(item));
    const legacyImages = Array.isArray(data.images)
        ? (await Promise.all((data.images as unknown[]).map((url) => resolvePhotoImageSourceSafely(url))))
            .filter(Boolean)
        : [];

    if (photoItems.length === 0 && legacyImages.length > 0) {
        // Migrate legacy images array → photoItems
        photoItems = (await Promise.all(
            legacyImages.map((url, index) =>
                normalizePhotoItemForRead(
                    {
                        id: `legacy_${index}_${hashString(url)}`,
                        url,
                        order: index,
                        source: 'upload',
                    },
                    `legacy_${index}_${hashString(url)}`,
                    index,
                ),
            ),
        )).filter((item): item is PhotoItem => Boolean(item));
    }
    const coverUrl =
        await resolvePhotoImageSourceSafely(data.coverUrl) ||
        getAlbumCoverUrl(photoItems) ||
        legacyImages[0] ||
        undefined;

    return {
        id,
        title: asString(data.title),
        description: asString(data.description) || undefined,
        order: asNumber(data.order),
        photoItems,
        images: legacyImages.length > 0 ? legacyImages : photoItems.map((item) => item.url).filter(Boolean),
        coverUrl,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
    };
}

function removeUndefinedDeep<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map((item) => removeUndefinedDeep(item)) as T;
    }

    if (value && typeof value === 'object') {
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
            return value;
        }

        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .filter(([, entryValue]) => entryValue !== undefined && entryValue !== null)
                .map(([key, entryValue]) => [key, removeUndefinedDeep(entryValue)]),
        ) as T;
    }

    return value;
}

export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
        size /= 1024;
        unit += 1;
    }
    return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

async function readImageDimensions(file: File): Promise<{ width?: number; height?: number }> {
    if (!file.type.startsWith('image/')) return {};
    return new Promise((resolve) => {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const width = img.naturalWidth;
            const height = img.naturalHeight;
            URL.revokeObjectURL(objectUrl);
            resolve({ width, height });
        };
        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            resolve({});
        };
        img.src = objectUrl;
    });
}

const IMAGE_COMPRESSION_OPTIONS = {
    maxSizeMB: 1.5,
    maxWidthOrHeight: 2560,
    useWebWorker: true,
    initialQuality: 0.85,
};

const THUMBNAIL_COMPRESSION_OPTIONS = {
    maxSizeMB: 0.18,
    maxWidthOrHeight: 520,
    useWebWorker: true,
    initialQuality: 0.76,
    fileType: 'image/webp',
};

function getNameExtension(name?: string) {
    return name?.toLowerCase().split('?')[0].match(/\.([a-z0-9]+)$/)?.[1] ?? '';
}

function getMimeFromExtension(extension: string) {
    switch (extension.toLowerCase()) {
        case 'avif': return 'image/avif';
        case 'gif': return 'image/gif';
        case 'ico': return 'image/x-icon';
        case 'jpg':
        case 'jpeg': return 'image/jpeg';
        case 'png': return 'image/png';
        case 'svg': return 'image/svg+xml';
        case 'webp': return 'image/webp';
        default: return '';
    }
}

function getExtensionFromMime(mimeType?: string) {
    switch (mimeType?.toLowerCase()) {
        case 'image/avif': return 'avif';
        case 'image/gif': return 'gif';
        case 'image/x-icon':
        case 'image/vnd.microsoft.icon': return 'ico';
        case 'image/jpeg': return 'jpg';
        case 'image/png': return 'png';
        case 'image/svg+xml': return 'svg';
        case 'image/webp': return 'webp';
        default: return '';
    }
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

function ensureFileExtension(fileName: string, mimeType: string, fallbackExtension = 'jpg') {
    if (getNameExtension(fileName)) return fileName;
    const extension = getExtensionFromMime(mimeType) || fallbackExtension;
    return `${fileName}.${extension}`;
}

function resolveStoragePathFromPhotoItem(item: Pick<PhotoItem, 'fileName' | 'storagePath' | 'url'>) {
    const explicitStoragePath = normalizePhotoStoragePath(item.storagePath);
    if (explicitStoragePath) return explicitStoragePath;

    const fileName = item.fileName || '';
    if (fileName.includes('%2F')) {
        try {
            return normalizePhotoStoragePath(decodeURIComponent(fileName));
        } catch {
            return normalizePhotoStoragePath(fileName);
        }
    }

    return normalizePhotoStoragePath(item.url) || extractStoragePathFromDownloadUrl(item.url);
}

function isVideoItem(item: Pick<PhotoItem, 'type' | 'extension' | 'mimeType' | 'url'>) {
    return (
        item.type === 'video' ||
        item.extension?.toLowerCase() === 'mp4' ||
        item.mimeType?.startsWith('video/') ||
        item.url.includes('.mp4')
    );
}

function shouldUseOriginalPreview(item: Pick<PhotoItem, 'extension' | 'fileName' | 'mimeType'>) {
    const extension = item.extension?.toLowerCase() || getNameExtension(item.fileName);
    return (
        extension === 'svg' ||
        extension === 'ico' ||
        extension === 'gif' ||
        item.mimeType === 'image/svg+xml' ||
        item.mimeType === 'image/x-icon' ||
        item.mimeType === 'image/vnd.microsoft.icon' ||
        item.mimeType === 'image/gif'
    );
}

function canGenerateThumbnail(file: File) {
    if (!file.type.startsWith('image/')) return false;
    if (file.type === 'image/gif' || file.type === 'image/svg+xml' || file.type === 'image/x-icon') {
        return false;
    }
    return file.size > 0;
}

async function createThumbnailFile(file: File, fallbackName: string): Promise<File | null> {
    if (!canGenerateThumbnail(file)) return null;

    try {
        const compressed = await imageCompression(file, THUMBNAIL_COMPRESSION_OPTIONS);
        const mimeType = compressed.type || 'image/webp';
        const stem = sanitizeStorageFileName(fallbackName.replace(/\.[a-z0-9]+$/i, ''), 'thumbnail');
        const extension = getExtensionFromMime(mimeType) || 'webp';

        return new File([compressed], `${stem}.thumb.${extension}`, {
            type: mimeType,
            lastModified: Date.now(),
        });
    } catch (error) {
        console.warn('Thumbnail generation failed.', error);
        return null;
    }
}

async function fetchImageUrlAsFile(url: string, fileName?: string) {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('이미지를 불러오려면 로그인이 필요합니다.');
    const response = await fetch('/api/fetch-image', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url, fileName }),
    });

    if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || '이미지 원본을 불러오지 못했습니다.');
    }

    const blob = await response.blob();
    const mimeType = blob.type || getMimeFromExtension(getNameExtension(fileName)) || 'image/jpeg';
    const safeName = sanitizeStorageFileName(fileName || url.split('/').pop() || 'album-photo', 'album-photo');
    const resolvedName = ensureFileExtension(safeName, mimeType);

    return new File([blob], resolvedName, { type: mimeType, lastModified: Date.now() });
}

async function compressImageForUpload(file: File): Promise<File> {
    if (!file.type.startsWith('image/')) return file;
    // Keep original data for formats that are often sensitive to re-encoding.
    if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file;

    try {
        const compressed = await imageCompression(file, IMAGE_COMPRESSION_OPTIONS);
        if (compressed.size >= file.size) return file;

        // Preserve original file name while uploading the compressed payload.
        return new File([compressed], file.name, {
            type: compressed.type || file.type,
            lastModified: Date.now(),
        });
    } catch (error) {
        console.warn('Image compression failed. Fallback to original file.', error);
        return file;
    }
}

async function uploadAlbumStorageFile(params: {
    albumId: string;
    folder: 'imports' | 'originals' | 'thumbs';
    itemId: string;
    file: File;
    fallbackName: string;
}): Promise<{ url: string; storagePath: string }> {
    const safeName = sanitizeStorageFileName(params.file.name || params.fallbackName, params.fallbackName);
    const storagePath = `images/albums/${params.albumId}/${params.folder}/${params.itemId}_${safeName}`;
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, params.file);
    const url = await getDownloadURL(storageRef);
    return { url, storagePath };
}

async function uploadThumbnail(params: {
    albumId: string;
    itemId: string;
    file: File;
    fallbackName: string;
}): Promise<{ thumbnailUrl: string; thumbnailPath: string } | null> {
    const thumbnail = await createThumbnailFile(params.file, params.fallbackName);
    if (!thumbnail) return null;

    const uploaded = await uploadAlbumStorageFile({
        albumId: params.albumId,
        folder: 'thumbs',
        itemId: params.itemId,
        file: thumbnail,
        fallbackName: 'preview.webp',
    });

    return {
        thumbnailUrl: uploaded.url,
        thumbnailPath: uploaded.storagePath,
    };
}

/* ─── Service ────────────────────────────────────────────────── */

class PhotoService {
    private col = 'albums';

    needsPreviewAsset(item: PhotoItem): boolean {
        if (isVideoItem(item)) return false;
        if (shouldUseOriginalPreview(item)) return false;
        if (!sanitizePhotoImageUrl(item.url) && !normalizePhotoStoragePath(item.storagePath)) return false;
        return !item.thumbnailUrl || (item.source === 'ai' && !item.storagePath);
    }

    async getAlbums(): Promise<PhotoAlbum[]> {
        const snapshot = await getDocs(collection(db, this.col));
        const albums = await Promise.all(
            snapshot.docs.map((d) => normalizeAlbum(d.data() as Record<string, unknown>, d.id)),
        );
        return albums.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }

    async getAlbum(id: string): Promise<PhotoAlbum | null> {
        const snap = await getDoc(doc(db, this.col, id));
        if (!snap.exists()) return null;
        return normalizeAlbum(snap.data() as Record<string, unknown>, snap.id);
    }

    async createAlbum(data: Pick<PhotoAlbum, 'title' | 'description'>): Promise<string> {
        const all = await this.getAlbums();
        const maxOrder = all.reduce((m, a) => Math.max(m, a.order ?? 0), -1);
        const newRef = doc(collection(db, this.col));
        await setDoc(newRef, {
            title: data.title,
            description: data.description || '',
            order: maxOrder + 1,
            photoItems: [],
            images: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        notifyPhotoAlbumsChanged();
        return newRef.id;
    }

    async updateAlbum(id: string, data: Partial<PhotoAlbum>): Promise<void> {
        await updateDoc(doc(db, this.col, id), { ...removeUndefinedDeep(data), updatedAt: serverTimestamp() });
        notifyPhotoAlbumsChanged();
    }

    /** Batch-update category sort order */
    async reorderAlbums(orderedIds: string[]): Promise<void> {
        const batch = writeBatch(db);
        orderedIds.forEach((id, index) => {
            batch.update(doc(db, this.col, id), { order: index, updatedAt: serverTimestamp() });
        });
        await batch.commit();
        notifyPhotoAlbumsChanged();
    }

    /** Persist new photo order for an album */
    async updatePhotoOrder(albumId: string, items: PhotoItem[]): Promise<void> {
        const ordered = await normalizePhotoItemsForWrite(items);
        await updateDoc(doc(db, this.col, albumId), buildAlbumWritePayload(ordered));
        notifyPhotoAlbumsChanged();
    }

    /** Add a single photo item to an album */
    async addPhotoItem(albumId: string, item: Omit<PhotoItem, 'order'>): Promise<void> {
        const album = await this.getAlbum(albumId);
        if (!album) throw new Error('Album not found');
        const newItem = await normalizePhotoItemForWrite(item, album.photoItems.length);
        const updated = [...album.photoItems, newItem];
        await updateDoc(doc(db, this.col, albumId), buildAlbumWritePayload(updated));
        notifyPhotoAlbumsChanged();
    }

    /** Add multiple photo items at once for bulk registration */
    async addPhotoItems(albumId: string, items: Omit<PhotoItem, 'order'>[]): Promise<void> {
        const album = await this.getAlbum(albumId);
        if (!album) throw new Error('Album not found');

        const nextItems = await normalizePhotoItemsForWrite(items, album.photoItems.length);
        const merged = [
            ...album.photoItems,
            ...nextItems,
        ].map((item, index) => ({ ...item, order: index }));

        await updateDoc(doc(db, this.col, albumId), buildAlbumWritePayload(merged));
        notifyPhotoAlbumsChanged();
    }

    private async patchPhotoItem(albumId: string, itemId: string, nextItem: PhotoItem): Promise<void> {
        const album = await this.getAlbum(albumId);
        if (!album) throw new Error('Album not found');

        const merged = album.photoItems.map((item) => {
            if (item.id !== itemId) return item;
            return { ...item, ...nextItem, order: item.order };
        });
        const updated = await normalizePhotoItemsForWrite(merged);

        await updateDoc(doc(db, this.col, albumId), buildAlbumWritePayload(updated));
        notifyPhotoAlbumsChanged();
    }

    async refreshPhotoDownloadUrl(albumId: string, item: PhotoItem): Promise<PhotoItem | null> {
        const storagePath = resolveStoragePathFromPhotoItem(item);
        const nextItem: PhotoItem = { ...item };

        if (storagePath) {
            const refreshedUrl = await getDownloadURL(ref(storage, storagePath));
            if (refreshedUrl && refreshedUrl !== item.url) {
                nextItem.url = refreshedUrl;
                nextItem.storagePath = item.storagePath || storagePath;
            }
        }

        const thumbnailPath = normalizePhotoStoragePath(item.thumbnailPath) || extractStoragePathFromDownloadUrl(item.thumbnailUrl);
        if (thumbnailPath) {
            const refreshedThumbnailUrl = await getDownloadURL(ref(storage, thumbnailPath));
            if (refreshedThumbnailUrl && refreshedThumbnailUrl !== item.thumbnailUrl) {
                nextItem.thumbnailUrl = refreshedThumbnailUrl;
                nextItem.thumbnailPath = item.thumbnailPath || thumbnailPath;
            }
        }

        const changed = JSON.stringify(nextItem) !== JSON.stringify(item);
        if (!changed) return null;

        await this.patchPhotoItem(albumId, item.id, nextItem);
        return nextItem;
    }

    async ensurePhotoPreviewAsset(albumId: string, item: PhotoItem): Promise<PhotoItem | null> {
        if (!this.needsPreviewAsset(item)) return null;

        const nextItem: PhotoItem = { ...item };
        const sourceFileName = item.fileName || `${item.id}.${item.extension || 'jpg'}`;
        let sourceFile: File;

        try {
            sourceFile = await fetchImageUrlAsFile(item.url, sourceFileName);
        } catch (error) {
            const storagePath = resolveStoragePathFromPhotoItem(item);
            if (!storagePath) {
                throw error;
            }

            const refreshedUrl = await getDownloadURL(ref(storage, storagePath));
            nextItem.url = refreshedUrl;
            nextItem.storagePath = item.storagePath || storagePath;

            try {
                sourceFile = await fetchImageUrlAsFile(refreshedUrl, sourceFileName);
            } catch (refreshError) {
                if (refreshedUrl !== item.url || !item.storagePath) {
                    await this.patchPhotoItem(albumId, item.id, nextItem);
                    return nextItem;
                }

                throw refreshError;
            }
        }

        let thumbnailSourceFile = sourceFile;

        if (item.source === 'ai' && !item.storagePath) {
            const uploadFile = await compressImageForUpload(sourceFile);
            const uploaded = await uploadAlbumStorageFile({
                albumId,
                folder: 'imports',
                itemId: item.id,
                file: uploadFile,
                fallbackName: sourceFile.name,
            });

            const dimensions = await readImageDimensions(uploadFile);
            nextItem.url = uploaded.url;
            nextItem.storagePath = uploaded.storagePath;
            nextItem.fileName = item.fileName || sourceFile.name;
            const mimeType = uploadFile.type || sourceFile.type || item.mimeType;
            if (mimeType) nextItem.mimeType = mimeType;
            if (uploadFile.size) {
                nextItem.sizeBytes = uploadFile.size;
                nextItem.sizeLabel = formatBytes(uploadFile.size);
            }
            if (!nextItem.width && dimensions.width) nextItem.width = dimensions.width;
            if (!nextItem.height && dimensions.height) nextItem.height = dimensions.height;
            thumbnailSourceFile = uploadFile;
        }

        if (!nextItem.thumbnailUrl) {
            const thumbnail = await uploadThumbnail({
                albumId,
                itemId: item.id,
                file: thumbnailSourceFile,
                fallbackName: nextItem.fileName || item.fileName || item.id,
            });

            if (thumbnail) {
                nextItem.thumbnailUrl = thumbnail.thumbnailUrl;
                nextItem.thumbnailPath = thumbnail.thumbnailPath;
            }
        }

        const changed = JSON.stringify(nextItem) !== JSON.stringify(item);
        if (!changed) return null;

        await this.patchPhotoItem(albumId, item.id, nextItem);
        return nextItem;
    }

    async ensureAlbumPreviewAssets(
        albumId: string,
        items: PhotoItem[],
        onItemUpdated?: (item: PhotoItem) => void,
        onItemFailed?: (item: PhotoItem, error: unknown) => void,
    ): Promise<void> {
        for (const item of items) {
            if (!this.needsPreviewAsset(item)) continue;

            try {
                const updated = await this.ensurePhotoPreviewAsset(albumId, item);
                if (updated) onItemUpdated?.(updated);
            } catch (error) {
                console.warn('Failed to prepare photo preview asset.', { albumId, itemId: item.id, error });
                onItemFailed?.(item, error);
            }
        }
    }

    private async deletePhotoItemFiles(item: PhotoItem): Promise<void> {
        const deletions: Promise<void>[] = [];

        if (item.storagePath) {
            deletions.push(deleteObject(ref(storage, item.storagePath)).catch(() => undefined));
        } else if (item.source === 'upload' && item.url) {
            deletions.push(this.deleteFileFromUrl(item.url).catch(() => undefined));
        }

        if (item.thumbnailPath) {
            deletions.push(deleteObject(ref(storage, item.thumbnailPath)).catch(() => undefined));
        }

        await Promise.allSettled(deletions);
    }

    /** Remove a photo item and optionally delete the file from Storage */
    async removePhotoItem(albumId: string, itemId: string): Promise<void> {
        const album = await this.getAlbum(albumId);
        if (!album) throw new Error('Album not found');
        const target = album.photoItems.find((i) => i.id === itemId);
        const updated = album.photoItems
            .filter((i) => i.id !== itemId)
            .map((it, idx) => ({ ...it, order: idx }));
        await updateDoc(doc(db, this.col, albumId), buildAlbumWritePayload(updated));
        notifyPhotoAlbumsChanged();
        if (target) {
            await this.deletePhotoItemFiles(target);
        }
    }

    /** Move existing photo items between albums while preserving their stored asset URLs. */
    async movePhotoItems(sourceAlbumId: string, targetAlbumId: string, itemIds: string[]): Promise<void> {
        if (sourceAlbumId === targetAlbumId || itemIds.length === 0) return;

        const [sourceAlbum, targetAlbum] = await Promise.all([
            this.getAlbum(sourceAlbumId),
            this.getAlbum(targetAlbumId),
        ]);

        if (!sourceAlbum || !targetAlbum) throw new Error('Album not found');

        const itemIdSet = new Set(itemIds);
        const movingItems = sourceAlbum.photoItems.filter((item) => itemIdSet.has(item.id));

        if (movingItems.length === 0) return;

        const remainingItems = sourceAlbum.photoItems
            .filter((item) => !itemIdSet.has(item.id))
            .map((item, index) => ({ ...item, order: index }));

        const movedItems = movingItems.map((item, index) => ({
            ...item,
            order: targetAlbum.photoItems.length + index,
        }));

        const nextTargetItems = [...targetAlbum.photoItems, ...movedItems]
            .map((item, index) => ({ ...item, order: index }));
        const batch = writeBatch(db);

        batch.update(doc(db, this.col, sourceAlbumId), buildAlbumWritePayload(remainingItems));

        batch.update(doc(db, this.col, targetAlbumId), buildAlbumWritePayload(nextTargetItems));

        await batch.commit();
        notifyPhotoAlbumsChanged();
    }

    /** Import an AI-generated image into Storage first so preview URLs do not expire. */
    async importFromAI(albumId: string, image: { url: string; prompt?: string; type?: 'image' | 'video' }): Promise<void> {
        const id = `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const sourceUrl = await resolvePhotoImageSource(image.url);
        if (!sourceUrl) {
            throw new Error('Invalid AI image URL.');
        }
        
        // 확장자 및 타입 판별
        const isVideo = image.type === 'video' || sourceUrl.includes('.mp4');
        const extension = isVideo ? 'mp4' : (sourceUrl.includes('.webp') ? 'webp' : (sourceUrl.includes('.png') ? 'png' : 'jpg'));
        const fileName = sanitizeStorageFileName(sourceUrl.split('/').pop()?.split('?')[0] || 'ai-media', 'ai-media');

        const newItem: PhotoItem = {
            id,
            url: sourceUrl,
            order: 0,
            source: 'ai',
            prompt: image.prompt || '',
            fileName,
            extension,
            type: isVideo ? 'video' : 'image',
            uploadedAt: new Date().toISOString(),
        };

        if (!isVideo) {
            let sourceFile: File;
            try {
                sourceFile = await fetchImageUrlAsFile(sourceUrl, fileName);
            } catch (error) {
                console.warn('AI image proxy import failed. Saving the validated source URL without a generated thumbnail.', error);
                await this.addPhotoItem(albumId, newItem);
                return;
            }
            const uploadFile = await compressImageForUpload(sourceFile);
            const uploaded = await uploadAlbumStorageFile({
                albumId,
                folder: 'imports',
                itemId: id,
                file: uploadFile,
                fallbackName: sourceFile.name,
            });
            const dimensions = await readImageDimensions(uploadFile);
            const thumbnail = await uploadThumbnail({
                albumId,
                itemId: id,
                file: uploadFile,
                fallbackName: sourceFile.name,
            });

            newItem.url = uploaded.url;
            newItem.storagePath = uploaded.storagePath;
            newItem.fileName = sourceFile.name;
            newItem.extension = getNameExtension(sourceFile.name) || extension;
            const mimeType = uploadFile.type || sourceFile.type || getMimeFromExtension(newItem.extension || extension);
            if (mimeType) newItem.mimeType = mimeType;
            if (uploadFile.size) {
                newItem.sizeBytes = uploadFile.size;
                newItem.sizeLabel = formatBytes(uploadFile.size);
            }
            if (dimensions.width) newItem.width = dimensions.width;
            if (dimensions.height) newItem.height = dimensions.height;

            if (thumbnail) {
                newItem.thumbnailUrl = thumbnail.thumbnailUrl;
                newItem.thumbnailPath = thumbnail.thumbnailPath;
            }
        }

        await this.addPhotoItem(albumId, newItem);
    }

    /** Upload local files to Storage and return PhotoItem[] */
    async uploadPhotos(
        albumId: string,
        files: File[],
        options?: { skipCompression?: boolean }
    ): Promise<PhotoItem[]> {
        const results = await Promise.all(
            files.map(async (file, i) => {
                const itemId = `upload_${Date.now()}_${i}`;
                const uploadFile = options?.skipCompression ? file : await compressImageForUpload(file);
                const uploaded = await uploadAlbumStorageFile({
                    albumId,
                    folder: 'originals',
                    itemId,
                    file: uploadFile,
                    fallbackName: file.name,
                });
                const dimensions = await readImageDimensions(uploadFile);
                const extension = file.name.includes('.')
                    ? file.name.split('.').pop()?.toLowerCase()
                    : undefined;
                
                const photoItem: PhotoItem = {
                    id: itemId,
                    url: uploaded.url,
                    order: 0,
                    source: 'upload' as const,
                    type: file.type.startsWith('video/') ? 'video' : 'image',
                    fileName: file.name,
                    storagePath: uploaded.storagePath,
                    uploadedAt: new Date().toISOString(),
                };

                if (extension) photoItem.extension = extension;
                if (uploadFile.type || file.type) photoItem.mimeType = uploadFile.type || file.type;
                if (uploadFile.size) {
                    photoItem.sizeBytes = uploadFile.size;
                    photoItem.sizeLabel = formatBytes(uploadFile.size);
                }
                if (dimensions.width) photoItem.width = dimensions.width;
                if (dimensions.height) photoItem.height = dimensions.height;

                const thumbnail = await uploadThumbnail({
                    albumId,
                    itemId,
                    file: uploadFile,
                    fallbackName: file.name,
                });

                if (thumbnail) {
                    photoItem.thumbnailUrl = thumbnail.thumbnailUrl;
                    photoItem.thumbnailPath = thumbnail.thumbnailPath;
                }

                return photoItem;
            })
        );
        return results;
    }

    /** Delete entire album (photos in Storage + Firestore doc) */
    async deleteAlbum(id: string): Promise<void> {
        const album = await this.getAlbum(id);
        if (album) {
            await Promise.allSettled(
                album.photoItems.map((item) => this.deletePhotoItemFiles(item))
            );
            // Also clean up legacy images
            await Promise.allSettled(
                (album.images || []).map((url) => this.deleteFileFromUrl(url))
            );
        }
        await deleteDoc(doc(db, this.col, id));
        notifyPhotoAlbumsChanged();
    }

    async deleteFileFromUrl(fileUrl: string): Promise<void> {
        const filePath = normalizePhotoStoragePath(fileUrl) || extractStoragePathFromDownloadUrl(fileUrl);
        if (filePath) {
            await deleteObject(ref(storage, filePath));
        }
    }
}

export const photoService = new PhotoService();
