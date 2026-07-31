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

function getErrorMessage(payload: unknown, fallback: string): string {
    if (!payload || typeof payload !== 'object') return fallback;
    const error = (payload as PlanningResponse).error;
    return typeof error === 'string' && error.trim() ? error : fallback;
}

export async function generateImageStoryboardPlan(
    currentUser: User,
    input: ImageStoryboardPlanRequest,
): Promise<ImageStoryboardPlanResult> {
    const payload = ImageStoryboardPlanRequestSchema.parse(input);
    const response = await fetch('/api/generate-image-storyboard', {
        method: 'POST',
        headers: await buildJsonAuthHeaders(currentUser),
        body: JSON.stringify(payload),
    });

    const body = await response.json().catch(() => null) as PlanningResponse | null;
    if (!response.ok) {
        throw new Error(getErrorMessage(body, 'AI 장면 설계 요청에 실패했습니다.'));
    }

    const parsed = ImageStoryboardPlanSchema.safeParse(body?.plan);
    if (!parsed.success) {
        throw new Error('AI 장면 설계 결과의 형식이 올바르지 않습니다. 다시 시도해 주세요.');
    }

    return {
        plan: parsed.data,
        referenceAnalysis: body?.referenceAnalysis === 'visual' ? 'visual' : 'brief-only',
    };
}

export async function redesignImageStoryboardScene(
    currentUser: User,
    input: ImageStoryboardSceneRedesignRequest,
): Promise<{ scene: ImageStoryboardSceneRedesign; referenceAnalysis: 'visual' | 'brief-only' }> {
    const payload = ImageStoryboardSceneRedesignRequestSchema.parse(input);
    const response = await fetch('/api/generate-image-storyboard/scene', {
        method: 'POST',
        headers: await buildJsonAuthHeaders(currentUser),
        body: JSON.stringify(payload),
    });

    const body = await response.json().catch(() => null) as PlanningResponse | null;
    if (!response.ok) {
        throw new Error(getErrorMessage(body, '장면 재설계 요청에 실패했습니다.'));
    }

    const parsed = ImageStoryboardPlanSceneSchema.safeParse(body && 'scene' in body ? body.scene : undefined);
    if (!parsed.success) {
        throw new Error('AI 장면 재설계 결과 형식이 올바르지 않습니다. 다시 시도해 주세요.');
    }

    return {
        scene: parsed.data,
        referenceAnalysis: body?.referenceAnalysis === 'visual' ? 'visual' : 'brief-only',
    };
}

export async function redesignImageStoryboardFlow(
    currentUser: User,
    input: ImageStoryboardFlowRedesignRequest,
): Promise<{ flow: ImageStoryboardFlowRedesign; referenceAnalysis: 'visual' | 'brief-only' }> {
    const payload = ImageStoryboardFlowRedesignRequestSchema.parse(input);
    const response = await fetch('/api/generate-image-storyboard/flow', {
        method: 'POST',
        headers: await buildJsonAuthHeaders(currentUser),
        body: JSON.stringify(payload),
    });

    const body = await response.json().catch(() => null) as PlanningResponse | null;
    if (!response.ok) {
        throw new Error(getErrorMessage(body, 'AI 흐름 재기획 요청에 실패했습니다.'));
    }

    const parsed = ImageStoryboardFlowRedesignSchema.safeParse(body && 'flow' in body ? body.flow : undefined);
    if (!parsed.success) {
        throw new Error('AI 흐름 재기획 결과 형식이 올바르지 않습니다. 다시 시도해 주세요.');
    }

    return {
        flow: parsed.data,
        referenceAnalysis: body?.referenceAnalysis === 'visual' ? 'visual' : 'brief-only',
    };
}
