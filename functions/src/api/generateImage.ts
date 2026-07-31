import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { randomUUID } from 'node:crypto';
import { getOpenRouterRuntimeConfig } from '../openrouter';
import { recordOpenRouterUsage } from '../openrouterUsage';
import { openRouterApiKey } from '../secrets';
import { db } from '../firestore';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}

const buildFirebaseStorageDownloadUrl = (params: {
    bucketName: string;
    path: string;
    downloadToken: string;
}): string => {
    const encodedPath = encodeURIComponent(params.path);
    const encodedToken = encodeURIComponent(params.downloadToken);
    return `https://firebasestorage.googleapis.com/v0/b/${params.bucketName}/o/${encodedPath}?alt=media&token=${encodedToken}`;
};

interface GenerateImageRequest {
    prompt: string;
    negativePrompt?: string;
    aspectRatio: string; // "1:1", "16:9", etc.
    numberOfImages: number;
    style?: string; // "photorealistic", "anime", etc.
    image?: string; // Base64 encoded reference image (optional)
    referenceImages?: Array<{
        image: string;
        role: 'building' | 'product' | 'character' | 'background' | 'style';
    }>;
    width?: number; // Custom width
    height?: number; // Custom height
}

export const generateImage = onCall({ timeoutSeconds: 300, memory: '2GiB', secrets: [openRouterApiKey] }, async (request) => {
    // 1. Authentication Check
    if (!request.auth) {
        throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
    }

    const uid = request.auth.uid;
    const {
        prompt,
        negativePrompt,
        aspectRatio,
        numberOfImages = 1,
        style,
        image: referenceImageBase64,
        referenceImages: requestedReferenceImages,
        width,
        height
    } = request.data as GenerateImageRequest;

    // 2. Input Validation
    if (!prompt) {
        throw new HttpsError('invalid-argument', '프롬프트는 필수입니다.');
    }
    if (numberOfImages < 1 || numberOfImages > 4) {
        throw new HttpsError('invalid-argument', '이미지 생성 개수는 1~4개여야 합니다.');
    }

    const referenceImages = (Array.isArray(requestedReferenceImages) ? requestedReferenceImages : [])
        .filter((reference): reference is NonNullable<GenerateImageRequest['referenceImages']>[number] => (
            Boolean(reference) && typeof reference.image === 'string' && reference.image.trim().length > 0
        ));
    if (referenceImages.length > 5) {
        throw new HttpsError('invalid-argument', '참조 이미지는 최대 5장까지 사용할 수 있습니다.');
    }
    if (!referenceImages.length && referenceImageBase64) {
        referenceImages.push({ image: referenceImageBase64, role: 'style' });
    }

    const runtimeConfig = getOpenRouterRuntimeConfig();
    if (!runtimeConfig.apiKey) {
        throw new HttpsError('failed-precondition', 'API Key가 설정되지 않았습니다.');
    }

    try {
        const bucket = admin.storage().bucket();
        const results = [];

        // Prepare prompt augmentation
        let fullPrompt = prompt;
        if (style && style !== 'none') {
            fullPrompt = `${style} style. ${fullPrompt}`;
        }
        if (negativePrompt) {
            fullPrompt = `${fullPrompt} (Exclude: ${negativePrompt})`;
        }

        if (referenceImages.length) {
            console.log(`[generateImage] Received ${referenceImages.length} reference image(s).`);
            fullPrompt = `${fullPrompt}\nReference images are the visual source of truth. Preserve the supplied building, product, character, background, and style details faithfully. Do not merge distinct subjects or invent unreferenced features.`;
        }

        const model = process.env.OPENROUTER_IMAGE_MODEL || 'openai/gpt-image-1';
        const body: Record<string, unknown> = {
            model,
            prompt: fullPrompt,
            n: numberOfImages,
            output_format: 'png',
            ...(width && height ? { size: `${width}x${height}` } : { aspect_ratio: aspectRatio || '1:1' }),
        };
        if (referenceImages.length) {
            body.input_references = referenceImages.map((referenceImage) => {
                const referenceUrl = referenceImage.image.startsWith('data:')
                    ? referenceImage.image
                    : `data:image/png;base64,${referenceImage.image}`;
                return { type: 'image_url', image_url: { url: referenceUrl } };
            });
        }

        const response = await fetch('https://openrouter.ai/api/v1/images', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${runtimeConfig.apiKey}`,
                'Content-Type': 'application/json',
                'X-OpenRouter-Title': 'ProPig Firebase Functions',
            },
            body: JSON.stringify(body),
        });
        const rawBody = await response.text();
        const data = JSON.parse(rawBody) as {
            data?: Array<{ b64_json?: string; media_type?: string }>;
            usage?: { cost?: number };
            error?: { message?: string };
        };
        if (!response.ok) {
            throw new Error(data.error?.message || rawBody.slice(0, 1000) || `OpenRouter HTTP ${response.status}`);
        }
        const generatedImages = data.data?.filter((image): image is { b64_json: string; media_type?: string } => Boolean(image.b64_json)) || [];
        if (generatedImages.length === 0) throw new Error('OpenRouter returned no image data.');
        await recordOpenRouterUsage({
            operation: 'image',
            model,
            costUsd: data.usage?.cost,
        });

        for (const [i, image] of generatedImages.entries()) {
            const base64Image = image.b64_json;

            const buffer = Buffer.from(base64Image, 'base64');
            const filename = `${uid}_${Date.now()}_${i}.png`;
            // Structure storage by user ID
            const storagePath = `users/${uid}/generated-images/${filename}`;
            const file = bucket.file(storagePath);
            const downloadToken = randomUUID();

            await file.save(buffer, {
                metadata: {
                    contentType: image.media_type || 'image/png',
                    metadata: {
                        firebaseStorageDownloadTokens: downloadToken,
                    },
                },
            });

            const url = buildFirebaseStorageDownloadUrl({
                bucketName: bucket.name,
                path: storagePath,
                downloadToken,
            });

            // Metadata saving
            const docRef = await db.collection('users').doc(uid).collection('generatedImages').add({
                prompt: fullPrompt,
                originalPrompt: prompt,
                negativePrompt: negativePrompt || '',
                imageUrl: url,
                storagePath,
                referenceImageUsed: referenceImages.length > 0,
                referenceImageCount: referenceImages.length,
                referenceRoles: referenceImages.map((reference) => reference.role),
                category: aspectRatio === '16:9' ? 'youtube' : 'custom', // Simple inference
                width,
                height,
                isLogo: false,
                isFavicon: false,
                options: {
                    aspectRatio,
                    style,
                    model,
                },
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            results.push({ id: docRef.id, url });
        }

        // Return first image details at top level for frontend compatibility
        const firstResult = results[0] || {};
        return {
            success: true,
            images: results,
            imageId: firstResult.id,
            imageUrl: firstResult.url
        };

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error generating image:', error);
        throw new HttpsError('internal', `이미지 생성 실패: ${message}`);
    }
});
