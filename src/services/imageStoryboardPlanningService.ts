import type { User } from 'firebase/auth';
import {
    ImageStoryboardPlanSchema,
    ImageStoryboardPlanRequestSchema,
    ImageStoryboardPlanSceneSchema,
    ImageStoryboardFlowRedesignSchema,
    ImageStoryboardFlowRedesignRequestSchema,
    ImageStoryboardSceneRedesignRequestSchema,
    type ImageStoryboardFlowRedesign,
    type ImageStoryboardFlowRedesignRequest,
    type ImageStoryboardPlan,
    type ImageStoryboardPlanRequest,
    type ImageStoryboardSceneRedesign,
    type ImageStoryboardSceneRedesignRequest,
} from '@/schemas/imageStoryboard';
import { buildJsonAuthHeaders } from '@/lib/client-auth';
import { getStoryboardRequestRecovery } from '@/lib/storyboard-request-recovery';

type PlanningResponse = {
    success?: unknown;
    plan?: unknown;
    scene?: unknown;
    flow?: unknown;
    error?: unknown;
    referenceAnalysis?: unknown;
};

export type ImageStoryboardPlanResult = {
    plan: ImageStoryboardPlan;
    referenceAnalysis: 'visual' | 'brief-only';
};

type PlanningRequestOptions = {
    signal?: AbortSignal;
};

function getErrorMessage(payload: unknown, fallback: string): string {
    if (!payload || typeof payload !== 'object') return fallback;
    const error = (payload as PlanningResponse).error;
    return typeof error === 'string' && error.trim() ? error : fallback;
}

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException
        ? error.name === 'AbortError'
        : typeof error === 'object' && error !== null && 'name' in error &&
            (error as { name?: unknown }).name === 'AbortError';
}

export class StoryboardPlanningRequestError extends Error {
    readonly status: number | null;
    readonly retryable: boolean;

    constructor(params: {
        status: number | null;
        retryAfterSeconds?: number | null;
        fallback: string;
        payload?: unknown;
    }) {
        const recovery = getStoryboardRequestRecovery(
            params.status,
            params.retryAfterSeconds,
        );
        const message = params.status !== null && params.status < 500
            ? getErrorMessage(params.payload, recovery.message)
            : recovery.message;
        super(message || params.fallback);
        this.name = 'StoryboardPlanningRequestError';
        this.status = params.status;
        this.retryable = recovery.retryable;
    }
}

async function postPlanningRequest(
    currentUser: User,
    path: string,
    payload: unknown,
    options: PlanningRequestOptions,
    fallback: string,
): Promise<PlanningResponse> {
    let response: Response;
    try {
        response = await fetch(path, {
            method: 'POST',
            headers: await buildJsonAuthHeaders(currentUser),
            body: JSON.stringify(payload),
            signal: options.signal,
        });
    } catch (error) {
        if (isAbortError(error)) throw error;
        throw new StoryboardPlanningRequestError({ status: null, fallback });
    }

    const body = await response.json().catch(() => null) as PlanningResponse | null;
    if (!response.ok) {
        const retryAfter = Number(response.headers.get('Retry-After'));
        throw new StoryboardPlanningRequestError({
            status: response.status,
            retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : null,
            fallback,
            payload: body,
        });
    }
    return body ?? {};
}

export async function generateImageStoryboardPlan(
    currentUser: User,
    input: ImageStoryboardPlanRequest,
    options: PlanningRequestOptions = {},
): Promise<ImageStoryboardPlanResult> {
    const payload = ImageStoryboardPlanRequestSchema.parse(input);
    const body = await postPlanningRequest(
        currentUser,
        '/api/generate-image-storyboard',
        payload,
        options,
        'AI 장면 설계 요청을 완료하지 못했습니다.',
    );
    const parsed = ImageStoryboardPlanSchema.safeParse(body.plan);
    if (!parsed.success) {
        throw new Error('AI 장면 설계 결과 형식이 올바르지 않습니다. 다시 시도해 주세요.');
    }
    return {
        plan: parsed.data,
        referenceAnalysis: body.referenceAnalysis === 'visual' ? 'visual' : 'brief-only',
    };
}

export async function redesignImageStoryboardScene(
    currentUser: User,
    input: ImageStoryboardSceneRedesignRequest,
    options: PlanningRequestOptions = {},
): Promise<{ scene: ImageStoryboardSceneRedesign; referenceAnalysis: 'visual' | 'brief-only' }> {
    const payload = ImageStoryboardSceneRedesignRequestSchema.parse(input);
    const body = await postPlanningRequest(
        currentUser,
        '/api/generate-image-storyboard/scene',
        payload,
        options,
        'AI 장면 재설계 요청을 완료하지 못했습니다.',
    );
    const parsed = ImageStoryboardPlanSceneSchema.safeParse(body.scene);
    if (!parsed.success) {
        throw new Error('AI 장면 재설계 결과 형식이 올바르지 않습니다. 다시 시도해 주세요.');
    }
    return {
        scene: parsed.data,
        referenceAnalysis: body.referenceAnalysis === 'visual' ? 'visual' : 'brief-only',
    };
}

export async function redesignImageStoryboardFlow(
    currentUser: User,
    input: ImageStoryboardFlowRedesignRequest,
    options: PlanningRequestOptions = {},
): Promise<{ flow: ImageStoryboardFlowRedesign; referenceAnalysis: 'visual' | 'brief-only' }> {
    const payload = ImageStoryboardFlowRedesignRequestSchema.parse(input);
    const body = await postPlanningRequest(
        currentUser,
        '/api/generate-image-storyboard/flow',
        payload,
        options,
        'AI 흐름 재설계 요청을 완료하지 못했습니다.',
    );
    const parsed = ImageStoryboardFlowRedesignSchema.safeParse(body.flow);
    if (!parsed.success) {
        throw new Error('AI 흐름 재설계 결과 형식이 올바르지 않습니다. 다시 시도해 주세요.');
    }
    return {
        flow: parsed.data,
        referenceAnalysis: body.referenceAnalysis === 'visual' ? 'visual' : 'brief-only',
    };
}
