import { db, storage } from '@/firebase/config';
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
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import imageCompression from 'browser-image-compression';
import { z } from 'zod';

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

/* ─── Helpers ────────────────────────────────────────────────── */

function normalizeAlbum(data: Record<string, unknown>, id: string): PhotoAlbum {
    let photoItems: PhotoItem[] = (data.photoItems as PhotoItem[] | undefined) ?? [];
    if (photoItems.length === 0 && Array.isArray(data.images) && (data.images as string[]).length > 0) {
        // Migrate legacy images array → photoItems
        photoItems = (data.images as string[]).map((url, i) => ({
            id: `legacy_${i}_${Date.now()}`,
            url,
            order: i,
            source: 'upload' as const,
        }));
    }
    return {
        id,
        title: (data.title as string) || '',
        description: data.description as string | undefined,
        order: (data.order as number) ?? 0,
        photoItems,
        images: (data.images as string[]) || [],
        coverUrl: (data.coverUrl as string | undefined) || photoItems[0]?.url,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
    };
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

function extractStoragePathFromDownloadUrl(url: string) {
    try {
        const parsed = new URL(url);
        const marker = '/o/';
        const start = parsed.pathname.indexOf(marker);
        if (start < 0) return '';

        return decodeURIComponent(parsed.pathname.slice(start + marker.length));
    } catch {
        return '';
    }
}

function resolveStoragePathFromPhotoItem(item: Pick<PhotoItem, 'fileName' | 'storagePath' | 'url'>) {
    if (item.storagePath) return item.storagePath;

    const fileName = item.fileName || '';
    if (fileName.includes('%2F')) {
        try {
            return decodeURIComponent(fileName);
        } catch {
            return fileName;
        }
    }

    return extractStoragePathFromDownloadUrl(item.url);
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
    const response = await fetch('/api/fetch-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        return !item.thumbnailUrl || (item.source === 'ai' && !item.storagePath);
    }

    async getAlbums(): Promise<PhotoAlbum[]> {
        const snapshot = await getDocs(collection(db, this.col));
        const albums = snapshot.docs.map((d) => normalizeAlbum(d.data() as Record<string, unknown>, d.id));
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
            coverUrl: null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        return newRef.id;
    }

    async updateAlbum(id: string, data: Partial<PhotoAlbum>): Promise<void> {
        await updateDoc(doc(db, this.col, id), { ...data, updatedAt: serverTimestamp() });
    }

    /** Batch-update category sort order */
    async reorderAlbums(orderedIds: string[]): Promise<void> {
        const batch = writeBatch(db);
        orderedIds.forEach((id, index) => {
            batch.update(doc(db, this.col, id), { order: index, updatedAt: serverTimestamp() });
        });
        await batch.commit();
    }

    /** Persist new photo order for an album */
    async updatePhotoOrder(albumId: string, items: PhotoItem[]): Promise<void> {
        const ordered = items.map((it, i) => ({ ...it, order: i }));
        await updateDoc(doc(db, this.col, albumId), {
            photoItems: ordered,
            coverUrl: ordered[0]?.url ?? null,
            images: ordered.map((i) => i.url),
            updatedAt: serverTimestamp(),
        });
    }

    /** Add a single photo item to an album */
    async addPhotoItem(albumId: string, item: Omit<PhotoItem, 'order'>): Promise<void> {
        const album = await this.getAlbum(albumId);
        if (!album) throw new Error('Album not found');
        const newItem: PhotoItem = { ...item, order: album.photoItems.length };
        const updated = [...album.photoItems, newItem];
        await updateDoc(doc(db, this.col, albumId), {
            photoItems: updated,
            coverUrl: updated[0]?.url ?? null,
            images: updated.map((i) => i.url),
            updatedAt: serverTimestamp(),
        });
    }

    /** Add multiple photo items at once for bulk registration */
    async addPhotoItems(albumId: string, items: Omit<PhotoItem, 'order'>[]): Promise<void> {
        const album = await this.getAlbum(albumId);
        if (!album) throw new Error('Album not found');

        const merged = [
            ...album.photoItems,
            ...items.map((item, index) => ({
                ...item,
                order: album.photoItems.length + index,
            })),
        ];

        await updateDoc(doc(db, this.col, albumId), {
            photoItems: merged,
            coverUrl: merged[0]?.url ?? null,
            images: merged.map((i) => i.url),
            updatedAt: serverTimestamp(),
        });
    }

    private async patchPhotoItem(albumId: string, itemId: string, nextItem: PhotoItem): Promise<void> {
        const album = await this.getAlbum(albumId);
        if (!album) throw new Error('Album not found');

        const updated = album.photoItems.map((item) => {
            if (item.id !== itemId) return item;
            return { ...item, ...nextItem, order: item.order };
        });

        await updateDoc(doc(db, this.col, albumId), {
            photoItems: updated,
            coverUrl: updated[0]?.url ?? null,
            images: updated.map((item) => item.url),
            updatedAt: serverTimestamp(),
        });
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
            sourceFile = await fetchImageUrlAsFile(refreshedUrl, sourceFileName);
            nextItem.url = refreshedUrl;
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
        await updateDoc(doc(db, this.col, albumId), {
            photoItems: updated,
            coverUrl: updated[0]?.url ?? null,
            images: updated.map((i) => i.url),
            updatedAt: serverTimestamp(),
        });
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

        const nextTargetItems = [...targetAlbum.photoItems, ...movedItems];
        const batch = writeBatch(db);

        batch.update(doc(db, this.col, sourceAlbumId), {
            photoItems: remainingItems,
            coverUrl: remainingItems[0]?.url ?? null,
            images: remainingItems.map((item) => item.url),
            updatedAt: serverTimestamp(),
        });

        batch.update(doc(db, this.col, targetAlbumId), {
            photoItems: nextTargetItems,
            coverUrl: nextTargetItems[0]?.url ?? null,
            images: nextTargetItems.map((item) => item.url),
            updatedAt: serverTimestamp(),
        });

        await batch.commit();
    }

    /** Import an AI-generated image into Storage first so preview URLs do not expire. */
    async importFromAI(albumId: string, image: { url: string; prompt?: string; type?: 'image' | 'video' }): Promise<void> {
        const id = `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        
        // 확장자 및 타입 판별
        const isVideo = image.type === 'video' || image.url.includes('.mp4');
        const extension = isVideo ? 'mp4' : (image.url.includes('.webp') ? 'webp' : (image.url.includes('.png') ? 'png' : 'jpg'));
        const fileName = sanitizeStorageFileName(image.url.split('/').pop()?.split('?')[0] || 'ai-media', 'ai-media');

        const newItem: PhotoItem = {
            id,
            url: image.url,
            order: 0,
            source: 'ai',
            prompt: image.prompt || '',
            fileName,
            extension,
            type: isVideo ? 'video' : 'image',
            uploadedAt: new Date().toISOString(),
        };

        if (!isVideo) {
            const sourceFile = await fetchImageUrlAsFile(image.url, fileName);
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
    }

    async deleteFileFromUrl(fileUrl: string): Promise<void> {
        const decodedUrl = decodeURIComponent(fileUrl);
        const start = decodedUrl.indexOf('/o/') + 3;
        const end = decodedUrl.indexOf('?alt=media');
        if (start > 2 && end > -1) {
            const filePath = decodedUrl.substring(start, end);
            await deleteObject(ref(storage, filePath));
        }
    }
}

export const photoService = new PhotoService();
