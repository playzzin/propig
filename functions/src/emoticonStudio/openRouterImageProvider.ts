import type {
    ImageGenerationProvider,
    ImageGenerationProviderRequest,
    ImageGenerationProviderResult,
} from './imageGenerationProvider';

export type OpenRouterImageGenerationDelegate = (
    request: ImageGenerationProviderRequest,
) => Promise<ImageGenerationProviderResult>;

/**
 * Thin adapter around the existing cost-reserved OpenRouter image runtime.
 * Keeping the delegate injected lets the provider boundary remain independent
 * from route discovery and prevents a circular module dependency.
 */
export class OpenRouterImageProvider implements ImageGenerationProvider {
    readonly id = 'openrouter' as const;

    constructor(private readonly generateWithOpenRouter: OpenRouterImageGenerationDelegate) {}

    async generate(request: ImageGenerationProviderRequest): Promise<ImageGenerationProviderResult> {
        if (!request.apiKey.trim()) {
            throw new Error('OPENROUTER_API_KEY is not configured.');
        }
        return this.generateWithOpenRouter(request);
    }
}
