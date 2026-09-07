import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db } from '@/firebase/config';

import { storage } from '@/firebase/storage';
import type { ImageReferenceInput } from '@/types/imageReference';

const shouldLogGenerationDebug = process.env.NODE_ENV !== 'production';

export interface GenerateImageParams {
    operationId?: string;
    prompt: string;
    negativePrompt?: string;
    aspectRatio?: string;
    width?: number;
    height?: number;
    stylePreset?: string;
    resourceMode?: 'efficient' | 'premium';
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
    blockedInput?: string;
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
            ...(authToken ? { Authorization: 'Bearer ' + authToken } : {}),
        },
        body: JSON.stringify({
            ...bodyParams,
            operationId: bodyParams.operationId || crypto.randomUUID(),
        }),
    });

    const data = await response.json() as GenerateImageResult;
    if (!response.ok) {
        return {
            success: false,
            reasonCode: data.reasonCode,
            error: data.error || `HTTP ${response.status}`,
            details: data.details,
            blockedInput: data.blockedInput,
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
    if (params.reasonCode === 'input_image_privacy') {
        return params.apiError || '첨부한 참조 사진에 실제 인물이 포함되었거나 그렇게 감지되어 모델이 요청을 받지 않았습니다. 인물 사진을 빼거나 인물이 없는 제품·건물·배경 사진 또는 일러스트로 바꾼 뒤 다시 생성해 주세요.';
    }

    return [
        params.apiError ? `API 실패: ${params.apiError}` : '',
        params.callableError ? `Callable 실패: ${params.callableError}` : '',
    ].filter(Boolean).join(' | ') || 'Unknown error occurred during image generation';
}

export const generateImage = async (params: GenerateImageParams): Promise<GenerateImageResult> => {
    try {
        const apiResult = await callNextApi(params);
        if (apiResult.success) return apiResult;
        return {
            ...apiResult,
            error: buildGuidedErrorMessage({
                apiError: apiResult.error || apiResult.details || '',
                callableError: '',
                reasonCode: apiResult.reasonCode,
            }),
        };
    } catch (error) {
        console.error('Error generating image:', error);
        const apiError = error instanceof Error ? error.message : String(error);
        return {
            success: false,
            error: buildGuidedErrorMessage({
                apiError,
                callableError: '',
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
    artifactProvenance?: {
        kind: 'storyboard-scene';
        storyboardId: string;
        sceneId: string | null;
    } | null;
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
            storagePath: fileName,
            artifactProvenance: params.artifactProvenance ?? null,
            createdAt: serverTimestamp(),
        });

        return { downloadUrl, historyId: docRef.id, storagePath: fileName };
    } catch (error) {
        console.error('Failed to save generation history:', error);
        throw error;
    }
};
