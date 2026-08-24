"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMOTICON_GPT_LIGHT_PROFILE = exports.EMOTICON_LIGHT_REASONING_EFFORT = exports.EMOTICON_LIGHT_IMAGE_MODEL = exports.EMOTICON_LIGHT_TEXT_MODEL = void 0;
exports.resolveEmoticonGenerationModelPolicy = resolveEmoticonGenerationModelPolicy;
exports.EMOTICON_LIGHT_TEXT_MODEL = 'openai/gpt-5.6-sol';
exports.EMOTICON_LIGHT_IMAGE_MODEL = 'openai/gpt-image-1-mini';
exports.EMOTICON_LIGHT_REASONING_EFFORT = 'low';
exports.EMOTICON_GPT_LIGHT_PROFILE = 'gpt-light-v1';
/**
 * Keeps the persisted resource-mode contract stable while giving new efficient
 * jobs a real low-cost AI path. Existing runtime settings remain the premium
 * policy. Light requests stay exact-model and fail closed instead of silently
 * switching to a different text model that may not support low reasoning.
 */
function resolveEmoticonGenerationModelPolicy(params) {
    if (params.resourceMode !== 'efficient') {
        return {
            textModel: params.configuredTextModel,
            imageModel: params.configuredImageModel,
            fallbackModels: params.configuredFallbackModels,
        };
    }
    return {
        textModel: exports.EMOTICON_LIGHT_TEXT_MODEL,
        imageModel: exports.EMOTICON_LIGHT_IMAGE_MODEL,
        fallbackModels: [],
        reasoningEffort: exports.EMOTICON_LIGHT_REASONING_EFFORT,
    };
}
//# sourceMappingURL=modelPolicy.js.map