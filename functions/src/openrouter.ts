import { recordOpenRouterUsage } from './openrouterUsage';

type LegacyCompatiblePart = {
    text?: string;
};

type LegacyCompatibleContent = {
    role?: 'user' | 'model' | 'assistant' | 'system';
    parts?: LegacyCompatiblePart[];
};

type GenerateContentInput =
    | string
    | {
        contents?: LegacyCompatibleContent[];
        generationConfig?: {
            temperature?: number;
            maxOutputTokens?: number;
        };
    };

type OpenRouterResponse = {
    choices?: Array<{
        message?: { content?: string };
        finish_reason?: string;
    }>;
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        cost?: number;
    };
    model?: string;
    provider?: string;
    error?: { message?: string };
};

export type OpenRouterRuntimeConfig = {
    apiKey: string;
    model: string;
    fallbackModels: string[];
};

const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4.1-mini';

const normalizeModel = (model: string): string => {
    const trimmed = model.trim();
    return trimmed;
};

export const getOpenRouterRuntimeConfig = (): OpenRouterRuntimeConfig => ({
    apiKey: (process.env.OPENROUTER_API_KEY || '').trim(),
    model: normalizeModel(process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL),
    fallbackModels: Array.from(
        new Set(
            (process.env.OPENROUTER_FALLBACK_MODELS || '')
                .split(',')
                .map((model) => model.trim())
                .filter(Boolean)
                .map(normalizeModel),
        ),
    ),
});

const toMessages = (input: GenerateContentInput) => {
    if (typeof input === 'string') return [{ role: 'user' as const, content: input }];

    return (input.contents || [])
        .map((content) => {
            const text = (content.parts || [])
                .map((part) => part.text || '')
                .join('\n')
                .trim();
            if (!text) return null;
            return {
                role: content.role === 'model' || content.role === 'assistant'
                    ? 'assistant' as const
                    : content.role === 'system'
                        ? 'system' as const
                        : 'user' as const,
                content: text,
            };
        })
        .filter((message): message is { role: 'system' | 'user' | 'assistant'; content: string } => Boolean(message));
};

export class OpenRouterGenerativeModel {
    constructor(
        private readonly config: OpenRouterRuntimeConfig,
        private readonly model: string = config.model,
    ) {}

    async generateContent(input: GenerateContentInput): Promise<{
        response: {
            text: () => string;
            usageMetadata: {
                promptTokenCount: number;
                candidatesTokenCount: number;
                totalTokenCount: number;
                cost?: number;
            };
            model: string;
        };
    }> {
        if (!this.config.apiKey) throw new Error('OPENROUTER_API_KEY is not configured');

        const messages = toMessages(input);
        if (messages.length === 0) throw new Error('OpenRouter request has no text messages');
        const generationConfig = typeof input === 'string' ? undefined : input.generationConfig;

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.config.apiKey}`,
                'Content-Type': 'application/json',
                'X-OpenRouter-Title': 'ProPig Firebase Functions',
            },
            body: JSON.stringify({
                model: this.model,
                ...(this.config.fallbackModels.length > 0
                    ? { models: this.config.fallbackModels.filter((model) => model !== this.model) }
                    : {}),
                messages,
                temperature: generationConfig?.temperature ?? 0.7,
                max_tokens: generationConfig?.maxOutputTokens ?? 2000,
                stream: false,
            }),
        });

        const rawBody = await response.text();
        let payload: OpenRouterResponse = {};
        try {
            payload = JSON.parse(rawBody) as OpenRouterResponse;
        } catch {
            // The safe HTTP error below is enough when a provider returns a non-JSON body.
        }
        if (!response.ok) {
            throw new Error(payload.error?.message || rawBody.slice(0, 1000) || `OpenRouter HTTP ${response.status}`);
        }

        const content = payload.choices?.[0]?.message?.content || '';
        await recordOpenRouterUsage({
            operation: 'text',
            model: payload.model || this.model,
            promptTokens: payload.usage?.prompt_tokens,
            completionTokens: payload.usage?.completion_tokens,
            totalTokens: payload.usage?.total_tokens,
            costUsd: payload.usage?.cost,
            providerSlug: payload.provider,
        });
        return {
            response: {
                text: () => content,
                usageMetadata: {
                    promptTokenCount: payload.usage?.prompt_tokens || 0,
                    candidatesTokenCount: payload.usage?.completion_tokens || 0,
                    totalTokenCount: payload.usage?.total_tokens || 0,
                    cost: payload.usage?.cost,
                },
                model: payload.model || this.model,
            },
        };
    }
}

export const createOpenRouterModel = (model?: string): OpenRouterGenerativeModel => {
    const config = getOpenRouterRuntimeConfig();
    return new OpenRouterGenerativeModel(config, model ? normalizeModel(model) : config.model);
};
