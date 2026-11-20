import { z } from 'zod';

// ============================================
// Image Generation Types
// ============================================

export interface ImageGenerationOptions {
    numberOfImages?: number; // 1-4
    width?: number;
    height?: number;
    promptSuffix?: string; // Additional instruction for style/quality
    referenceImageBase64?: string; // For image-to-image generation
    referenceImageMimeType?: string;
}

export interface ImageGenerationResponse {
    images: Array<{
        base64: string;
        mimeType: string;
    }>;
    revisedPrompt: string;
    usage?: {
        promptTokens: number;
        totalTokens: number;
    };
}

/**
 * LLM Adapter Interface
 *
 * Provides a unified interface for multiple LLM providers (OpenAI, Claude, etc.)
 * Enables provider switching without code changes.
 *
 * @example
 * ```typescript
 * const adapter = LLMAdapterFactory.create('openai', { apiKey: process.env.OPENAI_API_KEY });
 * const response = await adapter.chat([
 *   { role: 'user', content: 'Explain recursion' }
 * ]);
 * ```
 */

// ============================================
// Zod Schemas
// ============================================

export const llmMessageSchema = z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string(),
});

export const llmChatRequestSchema = z.object({
    messages: z.array(llmMessageSchema),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().positive().optional(),
    stream: z.boolean().optional(),
    responseFormat: z.enum(['json_object']).optional(),
});

export const llmChatResponseSchema = z.object({
    content: z.string(),
    usage: z
        .object({
            promptTokens: z.number(),
            completionTokens: z.number(),
            totalTokens: z.number(),
            costUsd: z.number().nonnegative().optional(),
        })
        .optional(),
    model: z.string().optional(),
    finishReason: z.enum(['stop', 'length', 'content_filter', 'error']).optional(),
});

export type LLMMessage = z.infer<typeof llmMessageSchema>;
export type LLMChatRequest = z.infer<typeof llmChatRequestSchema>;
export type LLMChatResponse = z.infer<typeof llmChatResponseSchema>;

// ============================================
// Base LLM Adapter Interface
// ============================================

export interface LLMAdapter {
    /**
     * Send chat messages and receive a response
     *
     * @param messages - Conversation messages
     * @param options - Optional parameters (temperature, maxTokens, etc.)
     * @returns LLM response with content and metadata
     */
    chat(messages: LLMMessage[], options?: Partial<LLMChatRequest>): Promise<LLMChatResponse>;

    /**
     * Get the provider name
     *
     * @returns Provider identifier (e.g., 'openai', 'claude', 'mock')
     */
    getProvider(): string;

    /**
     * Generate images from text prompt when the configured provider supports it.
     */
    generateImage?(prompt: string, options?: ImageGenerationOptions): Promise<ImageGenerationResponse>;
}

// ============================================
// OpenAI Adapter
// ============================================

export interface OpenAIConfig {
    apiKey: string;
    model?: string;
    baseURL?: string;
}

export interface OpenRouterConfig {
    apiKey: string;
    model?: string;
    fallbackModels?: string[];
    siteUrl?: string;
    siteName?: string;
}

export class OpenAIAdapter implements LLMAdapter {
    private apiKey: string;
    private model: string;
    private baseURL: string;

    constructor(config: OpenAIConfig) {
        this.apiKey = config.apiKey;
        this.model = config.model || 'gpt-4o-mini';
        this.baseURL = config.baseURL || 'https://api.openai.com/v1';
    }

    async chat(messages: LLMMessage[], options?: Partial<LLMChatRequest>): Promise<LLMChatResponse> {
        const validatedRequest = llmChatRequestSchema.parse({
            messages,
            temperature: options?.temperature ?? 0.7,
            maxTokens: options?.maxTokens ?? 2000,
            stream: options?.stream ?? false,
        });

        try {
            const response = await fetch(`${this.baseURL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: validatedRequest.messages,
                    temperature: validatedRequest.temperature,
                    max_tokens: validatedRequest.maxTokens,
                    ...(validatedRequest.responseFormat
                        ? { response_format: { type: validatedRequest.responseFormat } }
                        : {}),
                    stream: validatedRequest.stream,
                }),
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`OpenAI API Error: ${response.status} - ${error}`);
            }

            const data = await response.json();

            const llmResponse: LLMChatResponse = {
                content: data.choices[0]?.message?.content || '',
                usage: {
                    promptTokens: data.usage?.prompt_tokens || 0,
                    completionTokens: data.usage?.completion_tokens || 0,
                    totalTokens: data.usage?.total_tokens || 0,
                },
                finishReason: this.mapFinishReason(data.choices[0]?.finish_reason),
            };

            return llmChatResponseSchema.parse(llmResponse);
        } catch (error) {
            throw new Error(`OpenAI chat failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    getProvider(): string {
        return 'openai';
    }

    private mapFinishReason(reason: string | undefined): LLMChatResponse['finishReason'] {
        switch (reason) {
            case 'stop':
                return 'stop';
            case 'length':
                return 'length';
            case 'content_filter':
                return 'content_filter';
            default:
                return 'stop';
        }
    }
}

type OpenRouterCompletion = {
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
};

export class OpenRouterAdapter implements LLMAdapter {
    private apiKey: string;
    private model: string;
    private fallbackModels: string[];
    private siteUrl?: string;
    private siteName?: string;

    constructor(config: OpenRouterConfig) {
        this.apiKey = config.apiKey;
        this.model = config.model || 'openai/gpt-4.1-mini';
        this.fallbackModels = Array.from(
            new Set((config.fallbackModels || []).map((model) => model.trim()).filter(Boolean)),
        ).filter((model) => model !== this.model);
        this.siteUrl = config.siteUrl;
        this.siteName = config.siteName;
    }

    async chat(messages: LLMMessage[], options?: Partial<LLMChatRequest>): Promise<LLMChatResponse> {
        const validatedRequest = llmChatRequestSchema.parse({
            messages,
            temperature: options?.temperature ?? 0.7,
            maxTokens: options?.maxTokens ?? 2000,
            stream: options?.stream ?? false,
        });

        if (validatedRequest.stream) {
            throw new Error('OpenRouter streaming is not supported by the buffered LLM adapter.');
        }

        try {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.apiKey}`,
                    ...(this.siteUrl ? { 'HTTP-Referer': this.siteUrl } : {}),
                    ...(this.siteName ? { 'X-OpenRouter-Title': this.siteName } : {}),
                },
                body: JSON.stringify({
                    model: this.model,
                    ...(this.fallbackModels.length > 0 ? { models: this.fallbackModels } : {}),
                    messages: validatedRequest.messages,
                    temperature: validatedRequest.temperature,
                    max_tokens: validatedRequest.maxTokens,
                    ...(validatedRequest.responseFormat
                        ? { response_format: { type: validatedRequest.responseFormat } }
                        : {}),
                    stream: false,
                }),
            });

            const rawBody = await response.text();
            let data: OpenRouterCompletion = {};
            try {
                data = JSON.parse(rawBody) as OpenRouterCompletion;
            } catch {
                // Keep the provider response only in the sanitized error below.
            }

            if (!response.ok) {
                const message = rawBody.slice(0, 1000) || `HTTP ${response.status}`;
                throw new Error(`OpenRouter API error: ${response.status} - ${message}`);
            }

            const llmResponse: LLMChatResponse = {
                content: data.choices?.[0]?.message?.content || '',
                usage: {
                    promptTokens: data.usage?.prompt_tokens || 0,
                    completionTokens: data.usage?.completion_tokens || 0,
                    totalTokens: data.usage?.total_tokens || 0,
                    costUsd: data.usage?.cost,
                },
                model: data.model || this.model,
                finishReason: this.mapFinishReason(data.choices?.[0]?.finish_reason),
            };

            return llmChatResponseSchema.parse(llmResponse);
        } catch (error) {
            throw new Error(`OpenRouter chat failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    getProvider(): string {
        return 'openrouter';
    }

    private mapFinishReason(reason: string | undefined): LLMChatResponse['finishReason'] {
        switch (reason) {
            case 'stop':
                return 'stop';
            case 'length':
                return 'length';
            case 'content_filter':
                return 'content_filter';
            default:
                return 'stop';
        }
    }
}

// ============================================
// Claude (Anthropic) Adapter
// ============================================

export interface ClaudeConfig {
    apiKey: string;
    model?: string;
    baseURL?: string;
}

export class ClaudeAdapter implements LLMAdapter {
    private apiKey: string;
    private model: string;
    private baseURL: string;

    constructor(config: ClaudeConfig) {
        this.apiKey = config.apiKey;
        this.model = config.model || 'claude-3-5-sonnet-20241022';
        this.baseURL = config.baseURL || 'https://api.anthropic.com/v1';
    }

    async chat(messages: LLMMessage[], options?: Partial<LLMChatRequest>): Promise<LLMChatResponse> {
        const validatedRequest = llmChatRequestSchema.parse({
            messages,
            temperature: options?.temperature ?? 0.7,
            maxTokens: options?.maxTokens ?? 2000,
            stream: options?.stream ?? false,
        });

        try {
            // Extract system message if present
            const systemMessage = validatedRequest.messages.find((msg) => msg.role === 'system');
            const conversationMessages = validatedRequest.messages.filter((msg) => msg.role !== 'system');

            const response = await fetch(`${this.baseURL}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: conversationMessages.map((msg) => ({
                        role: msg.role === 'assistant' ? 'assistant' : 'user',
                        content: msg.content,
                    })),
                    system: systemMessage?.content,
                    temperature: validatedRequest.temperature,
                    max_tokens: validatedRequest.maxTokens,
                    stream: validatedRequest.stream,
                }),
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Claude API Error: ${response.status} - ${error}`);
            }

            const data = await response.json();

            const llmResponse: LLMChatResponse = {
                content: data.content[0]?.text || '',
                usage: {
                    promptTokens: data.usage?.input_tokens || 0,
                    completionTokens: data.usage?.output_tokens || 0,
                    totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
                },
                finishReason: this.mapStopReason(data.stop_reason),
            };

            return llmChatResponseSchema.parse(llmResponse);
        } catch (error) {
            throw new Error(`Claude chat failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    getProvider(): string {
        return 'claude';
    }

    private mapStopReason(reason: string | undefined): LLMChatResponse['finishReason'] {
        switch (reason) {
            case 'end_turn':
                return 'stop';
            case 'max_tokens':
                return 'length';
            case 'stop_sequence':
                return 'stop';
            default:
                return 'stop';
        }
    }
}

// ============================================
// ============================================
// Mock Adapter (for development/testing)
// ============================================

export class MockAdapter implements LLMAdapter {
    async chat(messages: LLMMessage[], options?: Partial<LLMChatRequest>): Promise<LLMChatResponse> {
        const validatedRequest = llmChatRequestSchema.parse({
            messages,
            temperature: options?.temperature ?? 0.7,
            maxTokens: options?.maxTokens ?? 2000,
        });

        // Simulate LLM delay
        await new Promise((resolve) => setTimeout(resolve, 100));

        const systemMessage = validatedRequest.messages.find((m) => m.role === 'system');
        const userMessage = validatedRequest.messages.find((m) => m.role === 'user');

        // Generate appropriate mock response based on system prompt
        let mockContent = '';

        if (systemMessage?.content.includes('code requirements analyzer')) {
            // AnalyzerAgent mock
            mockContent = JSON.stringify({
                intent: 'generate_code',
                requirements: ['typescript', 'modular', 'error-handling'],
                complexity: 'medium',
            });
        } else if (systemMessage?.content.includes('technical planning expert')) {
            // PlannerAgent mock
            mockContent = JSON.stringify([
                'Define TypeScript interfaces and types',
                'Implement core functionality with proper error handling',
                'Add comprehensive JSDoc documentation',
                'Export with proper typing',
            ]);
        } else if (systemMessage?.content.includes('expert TypeScript developer')) {
            // CodeAgent mock
            mockContent = `/**
 * Auto-generated by Mock LLM
 */
export class GeneratedFeature {
    constructor() {
        console.log('Mock feature initialized');
    }

    execute(): void {
        try {
            // Implementation here
            console.log('Executing feature');
        } catch (error) {
            console.error('Error:', error);
        }
    }
}`;
        } else if (systemMessage?.content.includes('code review expert')) {
            // ReviewAgent mock
            mockContent = JSON.stringify({
                isValid: true,
                score: 85,
            });
        } else if (systemMessage?.content.includes('code fixing expert')) {
            // FixAgent mock - return the same code with minor improvements
            const codeMatch = userMessage?.content.match(/```typescript\s*([\s\S]*?)\s*```/);
            const originalCode = codeMatch ? codeMatch[1] : 'export class Fixed {}';
            mockContent = originalCode.includes('/**')
                ? originalCode
                : `/**\n * Fixed by Mock LLM\n */\n${originalCode}`;
        } else {
            // Fallback
            mockContent = `Mock response to: "${userMessage?.content.slice(0, 50)}..."`;
        }

        const llmResponse: LLMChatResponse = {
            content: mockContent,
            usage: {
                promptTokens: 100,
                completionTokens: 50,
                totalTokens: 150,
            },
            finishReason: 'stop',
        };

        return llmChatResponseSchema.parse(llmResponse);
    }

    getProvider(): string {
        return 'mock';
    }
}

// ============================================
// LLM Adapter Factory
// ============================================

export type LLMProviderType = 'openai' | 'claude' | 'openrouter' | 'mock';

export interface LLMFactoryConfig {
    openai?: OpenAIConfig;
    claude?: ClaudeConfig;
    openrouter?: OpenRouterConfig;
}

/**
 * LLM Adapter Factory
 *
 * Creates LLM adapters based on provider type.
 * Centralizes adapter creation logic.
 *
 * @example
 * ```typescript
 * const adapter = LLMAdapterFactory.create('openai', {
 *   apiKey: process.env.OPENAI_API_KEY,
 *   model: 'gpt-4o'
 * });
 * ```
 */
export class LLMAdapterFactory {
    static create(provider: LLMProviderType, config?: LLMFactoryConfig): LLMAdapter {
        switch (provider) {
            case 'openai':
                if (!config?.openai?.apiKey) {
                    throw new Error('OpenAI API key is required');
                }
                return new OpenAIAdapter(config.openai);

            case 'claude':
                if (!config?.claude?.apiKey) {
                    throw new Error('Claude API key is required');
                }
                return new ClaudeAdapter(config.claude);

            case 'openrouter':
                if (!config?.openrouter?.apiKey) {
                    throw new Error('OpenRouter API key is required');
                }
                return new OpenRouterAdapter(config.openrouter);

            case 'mock':
                return new MockAdapter();

            default:
                throw new Error(`Unknown LLM provider: ${provider}`);
        }
    }

    /**
     * Create adapter from environment variables
     *
     * Reads LLM_PROVIDER env var to determine which adapter to create
     * Fallbacks to 'mock' if not set or invalid API keys
     *
     * @returns Configured LLMAdapter instance
     */
    static fromEnv(): LLMAdapter {
        const provider = (process.env.LLM_PROVIDER as LLMProviderType) || 'mock';

        switch (provider) {
            case 'openai':
                return new OpenAIAdapter({
                    apiKey: process.env.OPENAI_API_KEY || '',
                    model: process.env.OPENAI_MODEL,
                });

            case 'claude':
                return new ClaudeAdapter({
                    apiKey: process.env.ANTHROPIC_API_KEY || '',
                    model: process.env.CLAUDE_MODEL,
                });

            case 'openrouter':
                return new OpenRouterAdapter({
                    apiKey: process.env.OPENROUTER_API_KEY || '',
                    model: process.env.OPENROUTER_MODEL,
                    fallbackModels: (process.env.OPENROUTER_FALLBACK_MODELS || '').split(','),
                });

            default:
                console.warn(`Using MockAdapter (LLM_PROVIDER=${provider})`);
                return new MockAdapter();
        }
    }
}
