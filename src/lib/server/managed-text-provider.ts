import {
    LLMAdapterFactory,
    type LLMChatRequest,
    type LLMChatResponse,
    type LLMMessage,
} from '@/agents/llm/LLMAdapter';
import { getAIRuntimeConfig } from '@/lib/server/ai-runtime';
import { recordOpenRouterUsage } from '@/lib/server/openrouter-usage';

export type ManagedTextProvider = 'openrouter';

type CandidateProvider = {
    provider: ManagedTextProvider;
    model: string;
    create: () => ReturnType<typeof LLMAdapterFactory.create>;
};

type ManagedTextChatOptions = Pick<Partial<LLMChatRequest>, 'temperature' | 'maxTokens' | 'stream' | 'responseFormat'> & {
    preferredProvider?: ManagedTextProvider | 'auto';
};

export type ManagedTextChatResult = {
    provider: ManagedTextProvider;
    model: string;
    response: LLMChatResponse;
};

export type ManagedVisionContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } };

export type ManagedVisionMessage = {
    role: 'system' | 'user' | 'assistant';
    content: string | ManagedVisionContentPart[];
};

type ManagedVisionChatResult = {
    provider: ManagedTextProvider;
    model: string;
    response: LLMChatResponse;
};

const toErrorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

async function buildCandidates(
    preferredProvider: ManagedTextProvider | 'auto',
): Promise<CandidateProvider[]> {
    const runtimeConfig = await getAIRuntimeConfig();
    const candidates: CandidateProvider[] = [];

    if (preferredProvider !== 'auto' && preferredProvider !== 'openrouter') {
        return candidates;
    }

    if (runtimeConfig.openRouterApiKey) {
        candidates.push({
            provider: 'openrouter',
            model: runtimeConfig.model,
            create: () =>
                LLMAdapterFactory.create('openrouter', {
                    openrouter: {
                        apiKey: runtimeConfig.openRouterApiKey,
                        model: runtimeConfig.model,
                        fallbackModels: runtimeConfig.fallbackModels,
                        siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
                        siteName: 'ProPig',
                    },
                }),
        });
    }

    return candidates;
}

export async function runManagedTextChat(
    messages: LLMMessage[],
    options?: ManagedTextChatOptions,
): Promise<ManagedTextChatResult> {
    const candidates = await buildCandidates(options?.preferredProvider ?? 'auto');

    if (candidates.length === 0) {
        throw new Error(
            'OpenRouter is not configured. Set OPENROUTER_API_KEY in the runtime config.',
        );
    }

    const errors: string[] = [];

    for (const candidate of candidates) {
        try {
            const adapter = candidate.create();
            const response = await adapter.chat(messages, options);
            const model = response.model || candidate.model;

            await recordOpenRouterUsage({
                operation: 'text',
                source: 'next_server',
                model,
                promptTokens: response.usage?.promptTokens,
                completionTokens: response.usage?.completionTokens,
                totalTokens: response.usage?.totalTokens,
                costUsd: response.usage?.costUsd,
            });

            return {
                provider: candidate.provider,
                model,
                response,
            };
        } catch (error) {
            errors.push(`${candidate.provider}: ${toErrorMessage(error)}`);
        }
    }

    throw new Error(errors.join(' | '));
}

/**
 * Sends a small set of visual references to OpenRouter for planning tasks.
 * This is intentionally separate from the generic text adapter because only
 * selected workflows need multimodal message content.
 */
export async function runManagedVisionChat(
    messages: ManagedVisionMessage[],
    options?: ManagedTextChatOptions,
): Promise<ManagedVisionChatResult> {
    const runtimeConfig = await getAIRuntimeConfig();
    if (!runtimeConfig.openRouterApiKey) {
        throw new Error('OpenRouter is not configured. Set OPENROUTER_API_KEY in the runtime config.');
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${runtimeConfig.openRouterApiKey}`,
            ...(process.env.NEXT_PUBLIC_SITE_URL ? { 'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL } : {}),
            'X-OpenRouter-Title': 'ProPig Storyboard Planner',
        },
        body: JSON.stringify({
            model: runtimeConfig.model,
            ...(runtimeConfig.fallbackModels.length
                ? { models: runtimeConfig.fallbackModels.filter((model) => model !== runtimeConfig.model) }
                : {}),
            messages,
            temperature: options?.temperature ?? 0.7,
            max_tokens: options?.maxTokens ?? 2000,
            ...(options?.responseFormat
                ? { response_format: { type: options.responseFormat } }
                : {}),
            stream: false,
        }),
    });

    const rawBody = await response.text();
    let data: {
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number };
        model?: string;
        error?: { message?: string };
    } = {};
    try {
        data = JSON.parse(rawBody) as typeof data;
    } catch {
        // The controlled error below handles an unexpected upstream response.
    }
    if (!response.ok) {
        throw new Error(data.error?.message || rawBody.slice(0, 1000) || `OpenRouter HTTP ${response.status}`);
    }

    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('OpenRouter returned an empty response.');

    const model = data.model || runtimeConfig.model;
    const mappedResponse = {
        content,
        usage: {
            promptTokens: data.usage?.prompt_tokens || 0,
            completionTokens: data.usage?.completion_tokens || 0,
            totalTokens: data.usage?.total_tokens || 0,
            costUsd: data.usage?.cost,
        },
        model,
        finishReason: data.choices?.[0]?.finish_reason === 'length' ? 'length' as const : 'stop' as const,
    } satisfies LLMChatResponse;

    await recordOpenRouterUsage({
        operation: 'text',
        source: 'next_server',
        model,
        promptTokens: mappedResponse.usage?.promptTokens,
        completionTokens: mappedResponse.usage?.completionTokens,
        totalTokens: mappedResponse.usage?.totalTokens,
        costUsd: mappedResponse.usage?.costUsd,
    });

    return { provider: 'openrouter', model, response: mappedResponse };
}
