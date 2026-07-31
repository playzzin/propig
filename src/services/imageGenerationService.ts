import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db } from '@/firebase/config';
import { functions } from '@/firebase/functions';
import { storage } from '@/firebase/storage';
import type { ImageReferenceInput } from '@/types/imageReference';

const shouldLogGenerationDebug = process.env.NODE_ENV !== 'production';

export interface GenerateImageParams {
    prompt: string;
    negativePrompt?: string;
    aspectRatio?: string;
    width?: number;
    height?: number;
    stylePreset?: string;
    image?: string; // Base64 encoded image for Image-to-Image
    referenceImages?: ImageReferenceInput[];
    provider?: 'openrouter';
    authToken?: string;
}

export interface GenerateImageResult {
    success: boolean;
    imageUrl?: string;
    imageId?: string;
    reasonCode?: string;
    details?: string;
    images?: Array<{
        id: string;
        url: string;
        mimeType?: string;
    }>;
    error?: string;
    metadata?: unknown;
}

async function callNextApi(params: GenerateImageParams): Promise<GenerateImageResult> {
    const { authToken, ...bodyParams } = params;
    const response = await fetch('/api/generate-image', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify(bodyParams),
    });

    const data = await response.json() as GenerateImageResult;
    if (!response.ok) {
        return {
            success: false,
            error: data.error || `HTTP ${response.status}`,
        };
    }

    return data;
}

function buildGuidedErrorMessage(params: {
    apiError: string;
    callableError: string;
    reasonCode?: string;
}): string {
    if (params.reasonCode === 'api_key_expired') {
        return `OpenRouter API 키를 확인하세요. 로컬에서는 \`.env.local\`, 운영에서는 서버 환경변수 또는 Firebase Secret의 OPENROUTER_API_KEY를 갱신합니다. (${params.apiError})`;
    }
    if (params.reasonCode === 'billing_disabled') {
        return `GCP 결제 계정 비활성 상태입니다. 결제 계정 활성화 후 프로젝트에 다시 연결하세요. (${params.apiError})`;
    }
    if (params.reasonCode === 'permission_denied') {
        return `OpenRouter API 인증 또는 권한 문제입니다. 키와 계정 크레딧 상태를 확인하세요. (${params.apiError})`;
    }

    return [
        params.apiError ? `API 실패: ${params.apiError}` : '',
        params.callableError ? `Callable 실패: ${params.callableError}` : '',
    ].filter(Boolean).join(' | ') || 'Unknown error occurred during image generation';
}

function isFinalInfraError(reasonCode?: string, message?: string): boolean {
    if (!reasonCode && !message) return false;

    if (reasonCode === 'api_key_expired' || reasonCode === 'billing_disabled' || reasonCode === 'permission_denied') {
        return true;
    }

    const text = (message || '').toLowerCase();
    return (
        text.includes('api key expired') ||
        text.includes('billing account') ||
        text.includes('accountdisabled') ||
        text.includes('permission denied') ||
        text.includes('forbidden')
    );
}

function shouldFallbackToCallable(params: {
    provider?: 'openrouter';
    reasonCode?: string;
    message?: string;
}): boolean {
    if (params.provider) {
        return false;
    }

    return !isFinalInfraError(params.reasonCode, params.message);
}

export const generateImage = async (params: GenerateImageParams): Promise<GenerateImageResult> => {
    let apiErrorMessage = '';
    let apiReasonCode: string | undefined;

    // 1) Prefer the Next.js API route so provider keys stay server-side.
    try {
        const apiResult = await callNextApi(params);
        if (apiResult.success) {
            return apiResult;
        }

        apiErrorMessage = apiResult.error || apiResult.details || '';
        apiReasonCode = apiResult.reasonCode;

        // Do not attempt callable fallback for definitive infra/config failures.
        if (!shouldFallbackToCallable({
            provider: params.provider,
            reasonCode: apiReasonCode,
            message: apiErrorMessage,
        })) {
            return {
                success: false,
                reasonCode: apiReasonCode,
                error: buildGuidedErrorMessage({
                    apiError: apiErrorMessage,
                    callableError: '',
                    reasonCode: apiReasonCode,
                }),
            };
        }

        console.warn('[imageGenerationService] /api/generate-image failed, trying callable fallback:', apiResult.error);
    } catch (error) {
        apiErrorMessage = error instanceof Error ? error.message : String(error);
        console.warn('[imageGenerationService] /api/generate-image request error, trying callable fallback:', error);
    }

    // 2) Fallback: Firebase callable function (for environments already using deployed functions).
    try {
        const callableParams = { ...params };
        delete callableParams.authToken;
        const generateImageFn = httpsCallable<GenerateImageParams, GenerateImageResult>(functions, 'generateImage');
        const { data } = await generateImageFn(callableParams);
        return data;
    } catch (error: unknown) {
        console.error('Error generating image:', error);

        const callableMessage =
            error instanceof Error
                ? error.message
                : String(error);

        return {
            success: false,
            reasonCode: apiReasonCode,
            error: buildGuidedErrorMessage({
                apiError: apiErrorMessage,
                callableError: callableMessage,
                reasonCode: apiReasonCode,
            }),
        };
    }
};

export interface GenerateVideoParams {
    prompt: string;
    image?: string; // Reference image (first frame or base image)
    provider?: 'openrouter';
    mode?: 'generate' | 'extend' | 'edit';
    videoUrl?: string;
    duration?: number;
    aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '3:2' | '2:3';
    resolution?: '480p' | '720p';
    authToken?: string;
}

export interface GenerateVideoResult {
    success: boolean;
    videoUrl?: string;
    videoId?: string;
    provider?: 'openrouter';
    metadata?: unknown;
    error?: string;
}

export const generateVideo = async (params: GenerateVideoParams): Promise<GenerateVideoResult> => {
    if (shouldLogGenerationDebug) {
        console.info('[generateVideo] Sending request to API:', params.provider);
    }

    try {
        const { authToken, ...bodyParams } = params;
        const response = await fetch('/api/generate-video', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
            },
            body: JSON.stringify(bodyParams),
        });

        const data = await response.json();

        if (!response.ok) {
            return {
                success: false,
                error: data.error || `HTTP ${response.status}`,
            };
        }

        return data as GenerateVideoResult;
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
};

export interface SaveHistoryParams {
    userId: string;
    url: string;
    type: 'image' | 'video';
    generatedId: string;
    prompt: string;
    negativePrompt?: string;
    provider: 'openrouter';
}

export const saveGenerationHistory = async (params: SaveHistoryParams) => {
    try {
        const response = await fetch(params.url);
        const blob = await response.blob();

        const ext = params.type === 'video' ? 'mp4' : 'png';
        const fileName = `ai_generations/${params.userId}/${Date.now()}_${params.generatedId}.${ext}`;
        const storageRef = ref(storage, fileName);
        await uploadBytes(storageRef, blob);
        const downloadUrl = await getDownloadURL(storageRef);

        const docRef = await addDoc(collection(db, 'ai_generations'), {
            userId: params.userId,
            id: params.generatedId,
            url: downloadUrl,
            prompt: params.prompt,
            negativePrompt: params.type === 'image' ? (params.negativePrompt ?? null) : null,
            type: params.type,
            provider: params.provider,
            createdAt: serverTimestamp(),
        });

        return { downloadUrl, historyId: docRef.id };
    } catch (error) {
        console.error('Failed to save generation history:', error);
        throw error;
    }
};
