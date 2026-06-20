'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    orderBy,
    query,
    Timestamp,
    updateDoc,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '@/firebase/config';
import { useAuth } from '@/contexts/AuthContext';
import { buildJsonAuthHeaders } from '@/lib/client-auth';

// ============================================
// Types & Schemas
// ============================================

export const FirestoreMillisSchema = z.unknown().transform((value, ctx) => {
    if (value === null || value === undefined) return Date.now();
    if (typeof value === 'number') return value;
    if (
        typeof value === 'object' &&
        value !== null &&
        'toMillis' in value &&
        typeof (value as { toMillis?: unknown }).toMillis === 'function'
    ) {
        return (value as { toMillis: () => number }).toMillis();
    }
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid timestamp' });
    return z.NEVER;
});

export const GeneratedImageSchema = z.object({
    id: z.string().optional(),
    prompt: z.string(),
    category: z.string(),
    width: z.number(),
    height: z.number(),
    imageUrl: z.string(),
    storagePath: z.string(),
    isLogo: z.boolean().optional(),
    isFavicon: z.boolean().optional(),
    createdAt: FirestoreMillisSchema,
    updatedAt: FirestoreMillisSchema,
});

export type SavedImage = z.infer<typeof GeneratedImageSchema> & { id: string };

// ============================================
// Image Categories with Presets
// ============================================

export const IMAGE_CATEGORIES = {
    banner: {
        name: '배너',
        presets: [
            { width: 1200, height: 628, label: 'OG Image (1200x628)' },
            { width: 1600, height: 900, label: '웹 배너 (1600x900)' },
            { width: 728, height: 90, label: '레드버튼 (728x90)' },
            { width: 300, height: 250, label: '사각형 (300x250)' },
        ],
    },
    hero: {
        name: '히어로 섹션',
        presets: [
            { width: 1920, height: 1080, label: 'Full HD (1920x1080)' },
            { width: 1440, height: 810, label: '노트북 (1440x810)' },
            { width: 768, height: 432, label: '태블릿 (768x432)' },
        ],
    },
    thumbnail: {
        name: '썸네일',
        presets: [
            { width: 1280, height: 720, label: 'YouTube (1280x720)' },
            { width: 640, height: 360, label: '작게 (640x360)' },
            { width: 480, height: 360, label: '단형 (480x360)' },
        ],
    },
    youtube: {
        name: '유튜브',
        presets: [
            { width: 1280, height: 720, label: 'Standard (1280x720)' },
            { width: 1920, height: 1080, label: 'Full HD (1920x1080)' },
        ],
    },
    icon: {
        name: '아이콘',
        presets: [
            { width: 512, height: 512, label: '아이콘 (512x512)' },
            { width: 256, height: 256, label: '작은 아이콘 (256x256)' },
            { width: 128, height: 128, label: '엠블럼 (128x128)' },
        ],
    },
    monsterdeck: {
        name: '몬스터덱',
        presets: [
            { width: 400, height: 560, label: '카드 (400x560)' },
            { width: 800, height: 1120, label: '카드 대형 (800x1120)' },
        ],
    },
    logo: {
        name: '로고',
        presets: [
            { width: 1024, height: 1024, label: '정사각 (1024x1024)' },
            { width: 512, height: 256, label: '가로형 (512x256)' },
            { width: 256, height: 512, label: '세로형 (256x512)' },
        ],
    },
    favicon: {
        name: '파비콘',
        presets: [
            { width: 512, height: 512, label: '512x512' },
            { width: 192, height: 192, label: '192x192' },
            { width: 32, height: 32, label: '32x32' },
            { width: 16, height: 16, label: '16x16' },
        ],
    },
    custom: {
        name: '사용자 지정',
        presets: [],
    },
};

export type ImageCategory = keyof typeof IMAGE_CATEGORIES;

// ============================================
// Hook
// ============================================

export function useImageGenerator() {
    const { currentUser } = useAuth();
    const [savedImages, setSavedImages] = useState<SavedImage[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);

    // Firestore sync
    useEffect(() => {
        if (!currentUser?.uid) {
            setSavedImages([]);
            return;
        }

        const q = query(
            collection(db, 'users', currentUser.uid, 'generatedImages'),
            orderBy('createdAt', 'desc'),
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const nextImages: SavedImage[] = [];
            for (const docSnap of snapshot.docs) {
                const raw = docSnap.data();
                const parsed = GeneratedImageSchema.safeParse({ ...raw, id: docSnap.id });
                if (parsed.success) {
                    nextImages.push({ id: docSnap.id, ...parsed.data });
                }
            }
            setSavedImages(nextImages);
        });

        return unsubscribe;
    }, [currentUser?.uid]);

    // Generate images using Gemini API
    const generateImages = useCallback(async (params: {
        prompt: string;
        category: ImageCategory;
        width: number;
        height: number;
        numberOfImages?: number;
        referenceImage?: { base64: string; mimeType: string };
    }): Promise<Array<{ base64: string; mimeType: string }>> => {
        setIsGenerating(true);
        try {
            const response = await fetch('/api/generate-image', {
                method: 'POST',
                headers: await buildJsonAuthHeaders(currentUser),
                body: JSON.stringify({
                    prompt: params.prompt,
                    width: params.width,
                    height: params.height,
                    numberOfImages: params.numberOfImages || 1,
                    referenceImageBase64: params.referenceImage?.base64,
                    referenceImageMimeType: params.referenceImage?.mimeType,
                }),
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Image generation failed');
            }

            const data = await response.json();
            return data.images;
        } finally {
            setIsGenerating(false);
        }
    }, [currentUser]);

    // Save generated image to Firestore + Storage
    const saveImage = useCallback(async (params: {
        base64: string;
        mimeType: string;
        prompt: string;
        category: ImageCategory;
        width: number;
        height: number;
        isLogo?: boolean;
        isFavicon?: boolean;
    }): Promise<string> => {
        if (!currentUser?.uid) throw new Error('Not logged in');

        // Upload to Firebase Storage
        const fileName = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${params.mimeType.split('/')[1] || 'png'}`;
        const storagePath = `users/${currentUser.uid}/generated-images/${fileName}`;
        const storageRef = ref(storage, storagePath);

        // Convert base64 to blob
        const byteCharacters = atob(params.base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: params.mimeType });

        await uploadBytes(storageRef, blob);
        const downloadUrl = await getDownloadURL(storageRef);

        // Save metadata to Firestore
        const docRef = await addDoc(collection(db, 'users', currentUser.uid, 'generatedImages'), {
            prompt: params.prompt,
            category: params.category,
            width: params.width,
            height: params.height,
            imageUrl: downloadUrl,
            storagePath,
            isLogo: params.isLogo || false,
            isFavicon: params.isFavicon || false,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        });

        toast.success('이미지가 저장되었습니다.');
        return docRef.id;
    }, [currentUser?.uid]);

    // Delete image (Firestore + Storage)
    const deleteImage = useCallback(async (image: SavedImage) => {
        if (!currentUser?.uid) return;

        try {
            // Delete from Storage
            const storageRef = ref(storage, image.storagePath);
            await deleteObject(storageRef);
        } catch (e) {
            // Ignore if file doesn't exist in storage
            const error = e as { code?: string };
            if (error.code !== 'storage/object-not-found') {
                console.warn('Storage delete warning:', e);
            }
        }

        // Delete from Firestore
        await deleteDoc(doc(db, 'users', currentUser.uid, 'generatedImages', image.id));
        toast.success('이미지가 삭제되었습니다.');
    }, [currentUser?.uid]);

    // Update image metadata
    const updateImage = useCallback(async (imageId: string, updates: Partial<SavedImage>) => {
        if (!currentUser?.uid) return;
        await updateDoc(doc(db, 'users', currentUser.uid, 'generatedImages', imageId), {
            ...updates,
            updatedAt: Timestamp.now(),
        });
    }, [currentUser?.uid]);

    // Mark as logo/favicon
    const markAsLogo = useCallback(async (imageId: string, isLogo: boolean) => {
        await updateImage(imageId, { isLogo });
    }, [updateImage]);

    const markAsFavicon = useCallback(async (imageId: string, isFavicon: boolean) => {
        await updateImage(imageId, { isFavicon });
    }, [updateImage]);

    return {
        savedImages,
        isGenerating,
        generateImages,
        saveImage,
        deleteImage,
        updateImage,
        markAsLogo,
        markAsFavicon,
        currentUser,
    };
}
