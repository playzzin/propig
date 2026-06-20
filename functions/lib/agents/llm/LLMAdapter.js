"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMAdapterFactory = exports.MockAdapter = exports.GeminiAdapter = exports.ClaudeAdapter = exports.OpenAIAdapter = exports.llmChatResponseSchema = exports.llmChatRequestSchema = exports.llmMessageSchema = void 0;
const zod_1 = require("zod");
const generative_ai_1 = require("@google/generative-ai");
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
exports.llmMessageSchema = zod_1.z.object({
    role: zod_1.z.enum(['system', 'user', 'assistant']),
    content: zod_1.z.string(),
});
exports.llmChatRequestSchema = zod_1.z.object({
    messages: zod_1.z.array(exports.llmMessageSchema),
    temperature: zod_1.z.number().min(0).max(2).optional(),
    maxTokens: zod_1.z.number().positive().optional(),
    stream: zod_1.z.boolean().optional(),
});
exports.llmChatResponseSchema = zod_1.z.object({
    content: zod_1.z.string(),
    usage: zod_1.z
        .object({
        promptTokens: zod_1.z.number(),
        completionTokens: zod_1.z.number(),
        totalTokens: zod_1.z.number(),
    })
        .optional(),
    finishReason: zod_1.z.enum(['stop', 'length', 'content_filter', 'error']).optional(),
});
class OpenAIAdapter {
    constructor(config) {
        this.apiKey = config.apiKey;
        this.model = config.model || 'gpt-4o-mini';
        this.baseURL = config.baseURL || 'https://api.openai.com/v1';
    }
    async chat(messages, options) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        const validatedRequest = exports.llmChatRequestSchema.parse({
            messages,
            temperature: (_a = options === null || options === void 0 ? void 0 : options.temperature) !== null && _a !== void 0 ? _a : 0.7,
            maxTokens: (_b = options === null || options === void 0 ? void 0 : options.maxTokens) !== null && _b !== void 0 ? _b : 2000,
            stream: (_c = options === null || options === void 0 ? void 0 : options.stream) !== null && _c !== void 0 ? _c : false,
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
                    stream: validatedRequest.stream,
                }),
            });
            if (!response.ok) {
                const error = await response.text();
                throw new Error(`OpenAI API Error: ${response.status} - ${error}`);
            }
            const data = await response.json();
            const llmResponse = {
                content: ((_e = (_d = data.choices[0]) === null || _d === void 0 ? void 0 : _d.message) === null || _e === void 0 ? void 0 : _e.content) || '',
                usage: {
                    promptTokens: ((_f = data.usage) === null || _f === void 0 ? void 0 : _f.prompt_tokens) || 0,
                    completionTokens: ((_g = data.usage) === null || _g === void 0 ? void 0 : _g.completion_tokens) || 0,
                    totalTokens: ((_h = data.usage) === null || _h === void 0 ? void 0 : _h.total_tokens) || 0,
                },
                finishReason: this.mapFinishReason((_j = data.choices[0]) === null || _j === void 0 ? void 0 : _j.finish_reason),
            };
            return exports.llmChatResponseSchema.parse(llmResponse);
        }
        catch (error) {
            throw new Error(`OpenAI chat failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    getProvider() {
        return 'openai';
    }
    mapFinishReason(reason) {
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
exports.OpenAIAdapter = OpenAIAdapter;
class ClaudeAdapter {
    constructor(config) {
        this.apiKey = config.apiKey;
        this.model = config.model || 'claude-3-5-sonnet-20241022';
        this.baseURL = config.baseURL || 'https://api.anthropic.com/v1';
    }
    async chat(messages, options) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const validatedRequest = exports.llmChatRequestSchema.parse({
            messages,
            temperature: (_a = options === null || options === void 0 ? void 0 : options.temperature) !== null && _a !== void 0 ? _a : 0.7,
            maxTokens: (_b = options === null || options === void 0 ? void 0 : options.maxTokens) !== null && _b !== void 0 ? _b : 2000,
            stream: (_c = options === null || options === void 0 ? void 0 : options.stream) !== null && _c !== void 0 ? _c : false,
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
                    system: systemMessage === null || systemMessage === void 0 ? void 0 : systemMessage.content,
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
            const llmResponse = {
                content: ((_d = data.content[0]) === null || _d === void 0 ? void 0 : _d.text) || '',
                usage: {
                    promptTokens: ((_e = data.usage) === null || _e === void 0 ? void 0 : _e.input_tokens) || 0,
                    completionTokens: ((_f = data.usage) === null || _f === void 0 ? void 0 : _f.output_tokens) || 0,
                    totalTokens: (((_g = data.usage) === null || _g === void 0 ? void 0 : _g.input_tokens) || 0) + (((_h = data.usage) === null || _h === void 0 ? void 0 : _h.output_tokens) || 0),
                },
                finishReason: this.mapStopReason(data.stop_reason),
            };
            return exports.llmChatResponseSchema.parse(llmResponse);
        }
        catch (error) {
            throw new Error(`Claude chat failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    getProvider() {
        return 'claude';
    }
    mapStopReason(reason) {
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
exports.ClaudeAdapter = ClaudeAdapter;
// Import SDK (add at top of file, but since I'm editing the class, I'll assume import exists or add it)
// Wait, I need to add the import first.
// I'll do this in two steps or use MultiReplace.
// Actually, let's use MultiReplace to add import AND replace class.
class GeminiAdapter {
    constructor(config) {
        this.apiKey = config.apiKey;
        this.model = config.model || 'gemini-2.5-flash';
    }
    async chat(messages, options) {
        var _a, _b;
        const validatedRequest = exports.llmChatRequestSchema.parse({
            messages,
            temperature: (_a = options === null || options === void 0 ? void 0 : options.temperature) !== null && _a !== void 0 ? _a : 0.7,
            maxTokens: (_b = options === null || options === void 0 ? void 0 : options.maxTokens) !== null && _b !== void 0 ? _b : 2000,
        });
        try {
            const genAI = new generative_ai_1.GoogleGenerativeAI(this.apiKey);
            // Extract system instruction
            const systemMessage = validatedRequest.messages.find(m => m.role === 'system');
            const systemInstruction = systemMessage === null || systemMessage === void 0 ? void 0 : systemMessage.content;
            // Filter out system message to get conversation history
            const conversationMessages = validatedRequest.messages.filter(m => m.role !== 'system');
            // Convert to Gemini Content format
            const history = conversationMessages.slice(0, -1).map(msg => ({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }],
            }));
            const lastMessage = conversationMessages[conversationMessages.length - 1];
            const modelParams = {
                model: this.model,
            };
            // Gemini 1.5 and 2.0 support systemInstruction
            if (systemInstruction) {
                modelParams.systemInstruction = systemInstruction;
            }
            const model = genAI.getGenerativeModel(modelParams);
            const chat = model.startChat({
                history: history,
                generationConfig: {
                    temperature: validatedRequest.temperature,
                    maxOutputTokens: validatedRequest.maxTokens,
                },
            });
            const result = await chat.sendMessage(lastMessage.content);
            const response = await result.response;
            const text = response.text();
            // Calculate mock usage if not provided by SDK
            const usageMetadata = response.usageMetadata;
            const llmResponse = {
                content: text,
                usage: {
                    promptTokens: (usageMetadata === null || usageMetadata === void 0 ? void 0 : usageMetadata.promptTokenCount) || 0,
                    completionTokens: (usageMetadata === null || usageMetadata === void 0 ? void 0 : usageMetadata.candidatesTokenCount) || 0,
                    totalTokens: (usageMetadata === null || usageMetadata === void 0 ? void 0 : usageMetadata.totalTokenCount) || 0,
                },
                finishReason: 'stop',
            };
            return exports.llmChatResponseSchema.parse(llmResponse);
        }
        catch (error) {
            console.error('Gemini Adapter Error Details:', error);
            throw new Error(`Gemini chat failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    getProvider() {
        return 'gemini';
    }
}
exports.GeminiAdapter = GeminiAdapter;
// ============================================
// Mock Adapter (for development/testing)
// ============================================
class MockAdapter {
    async chat(messages, options) {
        var _a, _b;
        const validatedRequest = exports.llmChatRequestSchema.parse({
            messages,
            temperature: (_a = options === null || options === void 0 ? void 0 : options.temperature) !== null && _a !== void 0 ? _a : 0.7,
            maxTokens: (_b = options === null || options === void 0 ? void 0 : options.maxTokens) !== null && _b !== void 0 ? _b : 2000,
        });
        // Simulate LLM delay
        await new Promise((resolve) => setTimeout(resolve, 100));
        const systemMessage = validatedRequest.messages.find((m) => m.role === 'system');
        const userMessage = validatedRequest.messages.find((m) => m.role === 'user');
        // Generate appropriate mock response based on system prompt
        let mockContent = '';
        if (systemMessage === null || systemMessage === void 0 ? void 0 : systemMessage.content.includes('code requirements analyzer')) {
            // AnalyzerAgent mock
            mockContent = JSON.stringify({
                intent: 'generate_code',
                requirements: ['typescript', 'modular', 'error-handling'],
                complexity: 'medium',
            });
        }
        else if (systemMessage === null || systemMessage === void 0 ? void 0 : systemMessage.content.includes('technical planning expert')) {
            // PlannerAgent mock
            mockContent = JSON.stringify([
                'Define TypeScript interfaces and types',
                'Implement core functionality with proper error handling',
                'Add comprehensive JSDoc documentation',
                'Export with proper typing',
            ]);
        }
        else if (systemMessage === null || systemMessage === void 0 ? void 0 : systemMessage.content.includes('expert TypeScript developer')) {
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
        }
        else if (systemMessage === null || systemMessage === void 0 ? void 0 : systemMessage.content.includes('code review expert')) {
            // ReviewAgent mock
            mockContent = JSON.stringify({
                isValid: true,
                score: 85,
            });
        }
        else if (systemMessage === null || systemMessage === void 0 ? void 0 : systemMessage.content.includes('code fixing expert')) {
            // FixAgent mock - return the same code with minor improvements
            const codeMatch = userMessage === null || userMessage === void 0 ? void 0 : userMessage.content.match(/```typescript\s*([\s\S]*?)\s*```/);
            const originalCode = codeMatch ? codeMatch[1] : 'export class Fixed {}';
            mockContent = originalCode.includes('/**')
                ? originalCode
                : `/**\n * Fixed by Mock LLM\n */\n${originalCode}`;
        }
        else {
            // Fallback
            mockContent = `Mock response to: "${userMessage === null || userMessage === void 0 ? void 0 : userMessage.content.slice(0, 50)}..."`;
        }
        const llmResponse = {
            content: mockContent,
            usage: {
                promptTokens: 100,
                completionTokens: 50,
                totalTokens: 150,
            },
            finishReason: 'stop',
        };
        return exports.llmChatResponseSchema.parse(llmResponse);
    }
    getProvider() {
        return 'mock';
    }
}
exports.MockAdapter = MockAdapter;
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
class LLMAdapterFactory {
    static create(provider, config) {
        var _a, _b, _c;
        switch (provider) {
            case 'openai':
                if (!((_a = config === null || config === void 0 ? void 0 : config.openai) === null || _a === void 0 ? void 0 : _a.apiKey)) {
                    throw new Error('OpenAI API key is required');
                }
                return new OpenAIAdapter(config.openai);
            case 'claude':
                if (!((_b = config === null || config === void 0 ? void 0 : config.claude) === null || _b === void 0 ? void 0 : _b.apiKey)) {
                    throw new Error('Claude API key is required');
                }
                return new ClaudeAdapter(config.claude);
            case 'gemini':
                if (!((_c = config === null || config === void 0 ? void 0 : config.gemini) === null || _c === void 0 ? void 0 : _c.apiKey)) {
                    throw new Error('Gemini API key is required');
                }
                return new GeminiAdapter(config.gemini);
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
    static fromEnv() {
        const provider = process.env.LLM_PROVIDER || 'mock';
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
            case 'gemini':
                return new GeminiAdapter({
                    apiKey: process.env.GEMINI_API_KEY || '',
                    model: process.env.GEMINI_MODEL,
                });
            default:
                console.warn(`Using MockAdapter (LLM_PROVIDER=${provider})`);
                return new MockAdapter();
        }
    }
}
exports.LLMAdapterFactory = LLMAdapterFactory;
//# sourceMappingURL=LLMAdapter.js.map