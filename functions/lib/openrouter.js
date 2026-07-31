"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOpenRouterModel = exports.OpenRouterGenerativeModel = exports.getOpenRouterRuntimeConfig = void 0;
const openrouterUsage_1 = require("./openrouterUsage");
const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4.1-mini';
const normalizeModel = (model) => {
    const trimmed = model.trim();
    return trimmed;
};
const getOpenRouterRuntimeConfig = () => ({
    apiKey: (process.env.OPENROUTER_API_KEY || '').trim(),
    model: normalizeModel(process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL),
    fallbackModels: Array.from(new Set((process.env.OPENROUTER_FALLBACK_MODELS || '')
        .split(',')
        .map((model) => model.trim())
        .filter(Boolean)
        .map(normalizeModel))),
});
exports.getOpenRouterRuntimeConfig = getOpenRouterRuntimeConfig;
const toMessages = (input) => {
    if (typeof input === 'string')
        return [{ role: 'user', content: input }];
    return (input.contents || [])
        .map((content) => {
        const text = (content.parts || [])
            .map((part) => part.text || '')
            .join('\n')
            .trim();
        if (!text)
            return null;
        return {
            role: content.role === 'model' || content.role === 'assistant'
                ? 'assistant'
                : content.role === 'system'
                    ? 'system'
                    : 'user',
            content: text,
        };
    })
        .filter((message) => Boolean(message));
};
class OpenRouterGenerativeModel {
    constructor(config, model = config.model) {
        this.config = config;
        this.model = model;
    }
    async generateContent(input) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
        if (!this.config.apiKey)
            throw new Error('OPENROUTER_API_KEY is not configured');
        const messages = toMessages(input);
        if (messages.length === 0)
            throw new Error('OpenRouter request has no text messages');
        const generationConfig = typeof input === 'string' ? undefined : input.generationConfig;
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.config.apiKey}`,
                'Content-Type': 'application/json',
                'X-OpenRouter-Title': 'ProPig Firebase Functions',
            },
            body: JSON.stringify(Object.assign(Object.assign({ model: this.model }, (this.config.fallbackModels.length > 0
                ? { models: this.config.fallbackModels.filter((model) => model !== this.model) }
                : {})), { messages, temperature: (_a = generationConfig === null || generationConfig === void 0 ? void 0 : generationConfig.temperature) !== null && _a !== void 0 ? _a : 0.7, max_tokens: (_b = generationConfig === null || generationConfig === void 0 ? void 0 : generationConfig.maxOutputTokens) !== null && _b !== void 0 ? _b : 2000, stream: false })),
        });
        const rawBody = await response.text();
        let payload = {};
        try {
            payload = JSON.parse(rawBody);
        }
        catch (_q) {
            // The safe HTTP error below is enough when a provider returns a non-JSON body.
        }
        if (!response.ok) {
            throw new Error(((_c = payload.error) === null || _c === void 0 ? void 0 : _c.message) || rawBody.slice(0, 1000) || `OpenRouter HTTP ${response.status}`);
        }
        const content = ((_f = (_e = (_d = payload.choices) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.message) === null || _f === void 0 ? void 0 : _f.content) || '';
        await (0, openrouterUsage_1.recordOpenRouterUsage)({
            operation: 'text',
            model: payload.model || this.model,
            promptTokens: (_g = payload.usage) === null || _g === void 0 ? void 0 : _g.prompt_tokens,
            completionTokens: (_h = payload.usage) === null || _h === void 0 ? void 0 : _h.completion_tokens,
            totalTokens: (_j = payload.usage) === null || _j === void 0 ? void 0 : _j.total_tokens,
            costUsd: (_k = payload.usage) === null || _k === void 0 ? void 0 : _k.cost,
        });
        return {
            response: {
                text: () => content,
                usageMetadata: {
                    promptTokenCount: ((_l = payload.usage) === null || _l === void 0 ? void 0 : _l.prompt_tokens) || 0,
                    candidatesTokenCount: ((_m = payload.usage) === null || _m === void 0 ? void 0 : _m.completion_tokens) || 0,
                    totalTokenCount: ((_o = payload.usage) === null || _o === void 0 ? void 0 : _o.total_tokens) || 0,
                    cost: (_p = payload.usage) === null || _p === void 0 ? void 0 : _p.cost,
                },
                model: payload.model || this.model,
            },
        };
    }
}
exports.OpenRouterGenerativeModel = OpenRouterGenerativeModel;
const createOpenRouterModel = (model) => {
    const config = (0, exports.getOpenRouterRuntimeConfig)();
    return new OpenRouterGenerativeModel(config, model ? normalizeModel(model) : config.model);
};
exports.createOpenRouterModel = createOpenRouterModel;
//# sourceMappingURL=openrouter.js.map