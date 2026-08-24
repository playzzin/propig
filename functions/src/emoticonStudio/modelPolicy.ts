import type { EmoticonResourceMode } from './schema';

export const EMOTICON_LIGHT_TEXT_MODEL = 'openai/gpt-5.6-sol';
export const EMOTICON_LIGHT_IMAGE_MODEL = 'openai/gpt-image-1-mini';
export const EMOTICON_LIGHT_REASONING_EFFORT = 'low' as const;
export const EMOTICON_GPT_LIGHT_PROFILE = 'gpt-light-v1' as const;

export type EmoticonGenerationModelPolicy = {
    textModel: string;
    imageModel: string;
    fallbackModels: string[];
    reasoningEffort?: typeof EMOTICON_LIGHT_REASONING_EFFORT;
};

/**
 * Keeps the persisted resource-mode contract stable while giving new efficient
 * jobs a real low-cost AI path. Existing runtime settings remain the premium
 * policy. Light requests stay exact-model and fail closed instead of silently
 * switching to a different text model that may not support low reasoning.
 */
export function resolveEmoticonGenerationModelPolicy(params: {
    resourceMode: EmoticonResourceMode;
    configuredTextModel: string;
    configuredImageModel: string;
    configuredFallbackModels: string[];
}): EmoticonGenerationModelPolicy {
    if (params.resourceMode !== 'efficient') {
        return {
            textModel: params.configuredTextModel,
            imageModel: params.configuredImageModel,
            fallbackModels: params.configuredFallbackModels,
        };
    }

    return {
        textModel: EMOTICON_LIGHT_TEXT_MODEL,
        imageModel: EMOTICON_LIGHT_IMAGE_MODEL,
        fallbackModels: [],
        reasoningEffort: EMOTICON_LIGHT_REASONING_EFFORT,
    };
}
