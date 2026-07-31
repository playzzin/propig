"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateImage = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const node_crypto_1 = require("node:crypto");
const openrouter_1 = require("../openrouter");
const openrouterUsage_1 = require("../openrouterUsage");
const secrets_1 = require("../secrets");
const firestore_1 = require("../firestore");
// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}
const buildFirebaseStorageDownloadUrl = (params) => {
    const encodedPath = encodeURIComponent(params.path);
    const encodedToken = encodeURIComponent(params.downloadToken);
    return `https://firebasestorage.googleapis.com/v0/b/${params.bucketName}/o/${encodedPath}?alt=media&token=${encodedToken}`;
};
exports.generateImage = (0, https_1.onCall)({ timeoutSeconds: 300, memory: '2GiB', secrets: [secrets_1.openRouterApiKey] }, async (request) => {
    var _a, _b, _c;
    // 1. Authentication Check
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', '로그인이 필요합니다.');
    }
    const uid = request.auth.uid;
    const { prompt, negativePrompt, aspectRatio, numberOfImages = 1, style, image: referenceImageBase64, referenceImages: requestedReferenceImages, width, height } = request.data;
    // 2. Input Validation
    if (!prompt) {
        throw new https_1.HttpsError('invalid-argument', '프롬프트는 필수입니다.');
    }
    if (numberOfImages < 1 || numberOfImages > 4) {
        throw new https_1.HttpsError('invalid-argument', '이미지 생성 개수는 1~4개여야 합니다.');
    }
    const referenceImages = (Array.isArray(requestedReferenceImages) ? requestedReferenceImages : [])
        .filter((reference) => (Boolean(reference) && typeof reference.image === 'string' && reference.image.trim().length > 0));
    if (referenceImages.length > 5) {
        throw new https_1.HttpsError('invalid-argument', '참조 이미지는 최대 5장까지 사용할 수 있습니다.');
    }
    if (!referenceImages.length && referenceImageBase64) {
        referenceImages.push({ image: referenceImageBase64, role: 'style' });
    }
    const runtimeConfig = (0, openrouter_1.getOpenRouterRuntimeConfig)();
    if (!runtimeConfig.apiKey) {
        throw new https_1.HttpsError('failed-precondition', 'API Key가 설정되지 않았습니다.');
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
        const body = Object.assign({ model, prompt: fullPrompt, n: numberOfImages, output_format: 'png' }, (width && height ? { size: `${width}x${height}` } : { aspect_ratio: aspectRatio || '1:1' }));
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
        const data = JSON.parse(rawBody);
        if (!response.ok) {
            throw new Error(((_a = data.error) === null || _a === void 0 ? void 0 : _a.message) || rawBody.slice(0, 1000) || `OpenRouter HTTP ${response.status}`);
        }
        const generatedImages = ((_b = data.data) === null || _b === void 0 ? void 0 : _b.filter((image) => Boolean(image.b64_json))) || [];
        if (generatedImages.length === 0)
            throw new Error('OpenRouter returned no image data.');
        await (0, openrouterUsage_1.recordOpenRouterUsage)({
            operation: 'image',
            model,
            costUsd: (_c = data.usage) === null || _c === void 0 ? void 0 : _c.cost,
        });
        for (const [i, image] of generatedImages.entries()) {
            const base64Image = image.b64_json;
            const buffer = Buffer.from(base64Image, 'base64');
            const filename = `${uid}_${Date.now()}_${i}.png`;
            // Structure storage by user ID
            const storagePath = `users/${uid}/generated-images/${filename}`;
            const file = bucket.file(storagePath);
            const downloadToken = (0, node_crypto_1.randomUUID)();
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
            const docRef = await firestore_1.db.collection('users').doc(uid).collection('generatedImages').add({
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
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error generating image:', error);
        throw new https_1.HttpsError('internal', `이미지 생성 실패: ${message}`);
    }
});
//# sourceMappingURL=generateImage.js.map