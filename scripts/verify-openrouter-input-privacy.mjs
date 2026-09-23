import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const {
  OpenRouterVideoRequestError,
  deriveVideoInfraHint,
  isOpenRouterInputImagePrivacyError,
} = require('../functions/lib/videoStudio/openrouter.js');

const providerError = new OpenRouterVideoRequestError({
  status: 400,
  code: 'InputImageSensitiveContentDetected.PrivacyInformation',
  message: "The input image 'content[1]' may contain real person.",
  param: 'content[1]',
  providerType: 'BadRequest',
});

assert.equal(
  isOpenRouterInputImagePrivacyError(providerError),
  true,
  'The provider privacy error must be classified as a permanent input-image failure.',
);
assert.match(
  deriveVideoInfraHint(providerError.message),
  /참조 사진.*실제 인물/,
  'The worker must expose a clear Korean recovery message.',
);

const files = {
  imageRoute: await readFile(resolve('src/app/api/generate-image/route.ts'), 'utf8'),
  imageService: await readFile(resolve('src/services/imageGenerationService.ts'), 'utf8'),
  nextRequest: await readFile(resolve('src/lib/video-studio-job-request.ts'), 'utf8'),
  functionRequest: await readFile(resolve('functions/src/videoStudio/request.ts'), 'utf8'),
  nextExecutor: await readFile(resolve('src/lib/server/video-studio-job-executor.ts'), 'utf8'),
  functionProcessor: await readFile(resolve('functions/src/videoStudio/processor.ts'), 'utf8'),
  panel: await readFile(resolve('src/components/image-generator/StoryboardVideoProductionPanel.tsx'), 'utf8'),
  editor: await readFile(resolve('src/components/image-generator/StoryboardSceneProductionEditor.tsx'), 'utf8'),
};

assert.match(files.imageRoute, /reasonCode:\s*'input_image_privacy'/);
assert.match(files.imageRoute, /status:\s*hint\.reasonCode === 'input_image_privacy' \? 422 : 500/);
assert.match(files.imageService, /reasonCode:\s*data\.reasonCode/);
assert.match(files.imageService, /reasonCode === 'input_image_privacy'/);

for (const schemaSource of [files.nextRequest, files.functionRequest]) {
  assert.match(schemaSource, /visualInputMode:\s*z\.enum\(\['standard', 'text-only'\]\)/);
}
for (const processorSource of [files.nextExecutor, files.functionProcessor]) {
  assert.match(processorSource, /omitVisualInputs = request\.visualInputMode === 'text-only'/);
  assert.match(
    processorSource,
    /(?:failureReasonCode|'metadata\.failureReasonCode')(?:\s*:|\s*=)\s*'input_image_privacy'/,
  );
}

assert.match(
  files.functionProcessor,
  /if \(isOpenRouterInputImagePrivacyError\(error\)\) return false;/,
  'The worker must not auto-retry permanent privacy failures.',
);
assert.match(files.panel, /!isPermanentVisualPrivacyFailure/);
assert.match(files.panel, /visualInputMode:\s*"text-only"/);
assert.match(files.editor, /사진 없이 다시 만들기/);

console.log('OpenRouter input-image privacy recovery verification passed.');
