"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenRouterImageProvider = void 0;
/**
 * Thin adapter around the existing cost-reserved OpenRouter image runtime.
 * Keeping the delegate injected lets the provider boundary remain independent
 * from route discovery and prevents a circular module dependency.
 */
class OpenRouterImageProvider {
    constructor(generateWithOpenRouter) {
        this.generateWithOpenRouter = generateWithOpenRouter;
        this.id = 'openrouter';
    }
    async generate(request) {
        if (!request.apiKey.trim()) {
            throw new Error('OPENROUTER_API_KEY is not configured.');
        }
        return this.generateWithOpenRouter(request);
    }
}
exports.OpenRouterImageProvider = OpenRouterImageProvider;
//# sourceMappingURL=openRouterImageProvider.js.map