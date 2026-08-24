import type { EmoticonSpriteSheetLayout } from './animationContainer';
import type { EmoticonFrameDirection, EmoticonResourceMode } from './schema';

export const EMOTICON_STUDIO_IMAGE_PROVIDERS = ['openrouter', 'mock'] as const;

export type EmoticonStudioImageProviderName = (
    typeof EMOTICON_STUDIO_IMAGE_PROVIDERS[number]
);

export type ImageGenerationAspectRatio = '1:1' | '4:3' | '3:2';

type ImageGenerationRequestBase = {
    apiKey: string;
    preferredModel?: string;
    referenceImageUrls: string[];
    prompt: string;
    seed?: number;
    maxRequestAttempts?: 1 | 2;
    resourceMode?: EmoticonResourceMode;
    aspectRatio?: ImageGenerationAspectRatio;
};

export type ImageGenerationProviderRequest = ImageGenerationRequestBase & (
    | { kind: 'pose' }
    | {
        kind: 'sprite-sheet';
        layout: EmoticonSpriteSheetLayout;
        directions: EmoticonFrameDirection[];
    }
);

export type ImageGenerationProviderResult = {
    buffer: Buffer;
    contentType: string;
    model: string;
    provider?: string;
    requestId: string;
    costUsd?: number;
};

/**
 * Server-only image generation boundary for Emoticon Studio. Implementations
 * must return decoded image bytes and must account for any provider cost before
 * resolving. The mock implementation is intentionally network-free and free.
 */
export interface ImageGenerationProvider {
    readonly id: EmoticonStudioImageProviderName;
    generate(request: ImageGenerationProviderRequest): Promise<ImageGenerationProviderResult>;
}

export function resolveEmoticonStudioImageProviderName(
    configuredValue = process.env.EMOTICON_STUDIO_PROVIDER,
): EmoticonStudioImageProviderName {
    const normalized = configuredValue?.trim().toLowerCase();
    if (!normalized || normalized === 'openrouter') return 'openrouter';
    if (normalized === 'mock') return 'mock';
    throw new Error(
        `Unsupported EMOTICON_STUDIO_PROVIDER value: ${JSON.stringify(configuredValue)}.`,
    );
}
