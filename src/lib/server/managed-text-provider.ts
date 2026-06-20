import {
    LLMAdapterFactory,
    type LLMChatRequest,
    type LLMChatResponse,
    type LLMMessage,
} from '@/agents/llm/LLMAdapter';
import { getGeminiRuntimeConfig } from '@/lib/server/gemini';
import { resolveXaiTextModel } from '@/lib/server/xai';

export type ManagedTextProvider = 'gemini' | 'grok';

type CandidateProvider = {
    provider: ManagedTextProvider;
    model: string;
    create: () => ReturnType<typeof LLMAdapterFactory.create>;
};

type ManagedTextChatOptions = Pick<Partial<LLMChatRequest>, 'temperature' | 'maxTokens' | 'stream'> & {
    preferredProvider?: ManagedTextProvider | 'auto';
};

export type ManagedTextChatResult = {
    provider: ManagedTextProvider;
    model: string;
    response: LLMChatResponse;
};

const buildProviderOrder = (preferredProvider: ManagedTextProvider | 'auto'): ManagedTextProvider[] => {
    if (preferredProvider === 'grok') {
        return ['grok', 'gemini'];
    }

    if (preferredProvider === 'gemini') {
        return ['gemini', 'grok'];
    }

    return ['gemini', 'grok'];
};

const toErrorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

async function buildCandidates(
    preferredProvider: ManagedTextProvider | 'auto',
): Promise<CandidateProvider[]> {
    const runtimeConfig = await getGeminiRuntimeConfig();
    const order = buildProviderOrder(preferredProvider);
    const candidates: CandidateProvider[] = [];

    for (const provider of order) {
        if (provider === 'gemini' && runtimeConfig.apiKey) {
            candidates.push({
                provider: 'gemini',
                model: runtimeConfig.model,
                create: () =>
                    LLMAdapterFactory.create('gemini', {
                        gemini: {
                            apiKey: runtimeConfig.apiKey,
                            model: runtimeConfig.model,
                        },
                    }),
            });
        }

        if (provider === 'grok' && runtimeConfig.grokApiKey) {
            const model = await resolveXaiTextModel(runtimeConfig.grokApiKey);
            candidates.push({
                provider: 'grok',
                model,
                create: () =>
                    LLMAdapterFactory.create('openai', {
                        openai: {
                            apiKey: runtimeConfig.grokApiKey,
                            model,
                            baseURL: 'https://api.x.ai/v1',
                        },
                    }),
            });
        }
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
            'No text LLM provider is configured. Set GEMINI_API_KEY or GROK_API_KEY in the runtime config.',
        );
    }

    const errors: string[] = [];

    for (const candidate of candidates) {
        try {
            const adapter = candidate.create();
            const response = await adapter.chat(messages, options);

            return {
                provider: candidate.provider,
                model: candidate.model,
                response,
            };
        } catch (error) {
            errors.push(`${candidate.provider}: ${toErrorMessage(error)}`);
        }
    }

    throw new Error(errors.join(' | '));
}
