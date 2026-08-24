"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMOTICON_STUDIO_IMAGE_PROVIDERS = void 0;
exports.resolveEmoticonStudioImageProviderName = resolveEmoticonStudioImageProviderName;
exports.EMOTICON_STUDIO_IMAGE_PROVIDERS = ['openrouter', 'mock'];
function resolveEmoticonStudioImageProviderName(configuredValue = process.env.EMOTICON_STUDIO_PROVIDER) {
    const normalized = configuredValue === null || configuredValue === void 0 ? void 0 : configuredValue.trim().toLowerCase();
    if (!normalized || normalized === 'openrouter')
        return 'openrouter';
    if (normalized === 'mock')
        return 'mock';
    throw new Error(`Unsupported EMOTICON_STUDIO_PROVIDER value: ${JSON.stringify(configuredValue)}.`);
}
//# sourceMappingURL=imageGenerationProvider.js.map