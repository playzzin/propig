import { createRequire } from 'node:module';
import {
  analyzeStoryboardDialogueTiming,
  appendStoryboardVideoAudioDirection,
  resolveStoryboardVideoAudioMode,
} from '../src/lib/storyboard-video-audio.ts';
import {
  canReuseStoryboardVideoProviderJob,
  describeStoryboardVideoRecovery,
} from '../src/lib/storyboard-video-recovery.ts';

const require = createRequire(import.meta.url);
const { estimateOpenRouterVideo } = require('../functions/lib/videoStudio/openrouter.js');
const {
  resolveBackgroundMusicMixProfile,
} = require('../functions/lib/videoStudio/ffmpeg.js');
const {
  videoStudioJobRequestSchema,
} = require('../functions/lib/videoStudio/request.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  resolveStoryboardVideoAudioMode({ generateAudio: true }) === 'ambient',
  'Legacy generateAudio=true must migrate to ambient audio.',
);
assert(
  resolveStoryboardVideoAudioMode({ audioMode: 'dialogue', generateAudio: false }) === 'dialogue',
  'Explicit audioMode must take precedence over the legacy boolean.',
);

const dialoguePrompt = appendStoryboardVideoAudioDirection(
  'A presenter looks directly into the camera.',
  'dialogue',
  '오늘, 새로운 이야기가 시작됩니다.',
  6,
);
assert(dialoguePrompt.includes('오늘, 새로운 이야기가 시작됩니다.'), 'Dialogue must be preserved exactly.');
assert(dialoguePrompt.includes('mouth movement'), 'Dialogue mode must include lip-sync direction.');
assert(dialoguePrompt.includes('medium close-up'), 'Dialogue mode must protect a visible lip-sync framing.');
assert(dialoguePrompt.includes('within 6 seconds'), 'Dialogue mode must carry the resolved scene duration.');
assert(
  appendStoryboardVideoAudioDirection(dialoguePrompt, 'dialogue', '다른 대사') === dialoguePrompt,
  'Audio direction must be idempotent when a prepared prompt is retried.',
);

const longDialogueTiming = analyzeStoryboardDialogueTiming(
  '오늘 우리가 함께 준비한 새로운 공간과 특별한 경험을 차근차근 모두 소개해 드리겠습니다.',
  4,
);
assert(longDialogueTiming.tone === 'over', 'Long dialogue must be detected before rendering.');
assert(
  longDialogueTiming.recommendedDurationSeconds > 4,
  'Long dialogue must recommend a longer supported scene duration.',
);
const oversizedDialogueTiming = analyzeStoryboardDialogueTiming('가'.repeat(240), 15);
assert(
  !oversizedDialogueTiming.fitsSupportedDuration,
  'Dialogue longer than the maximum supported duration must be rejected before rendering.',
);
const discardedAudioJob = {
  status: 'failed',
  metadata: {
    providerVideo: null,
    providerVideoDiscarded: { reason: 'inaudible_audio' },
  },
};
assert(
  !canReuseStoryboardVideoProviderJob(discardedAudioJob),
  'An inaudible provider result must not be reused on retry.',
);
assert(
  describeStoryboardVideoRecovery({
    errorMessage: '실제 음성이 감지되지 않았습니다.',
    job: discardedAudioJob,
  }).kind === 'regenerate',
  'An inaudible provider result must request a fresh generation.',
);

const dialogueFirstMix = resolveBackgroundMusicMixProfile('dialogue-first');
const musicFirstMix = resolveBackgroundMusicMixProfile('music-first');
assert(
  dialogueFirstMix.ratio > musicFirstMix.ratio,
  'Dialogue-first mixing must duck background music more strongly than music-first mixing.',
);
assert(
  resolveBackgroundMusicMixProfile('custom').ratio === resolveBackgroundMusicMixProfile('balanced').ratio,
  'Custom slider values must retain the balanced automatic voice-protection profile.',
);
assert(
  videoStudioJobRequestSchema.parse({
    operation: 'merge',
    projectId: 'audio-mix-verification-project',
    mergeClipIds: ['audio-mix-verification-clip'],
    audioMixPreset: 'dialogue-first',
  }).audioMixPreset === 'dialogue-first',
  'The selected audio mix preset must reach the server job contract.',
);

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  assert(String(url).endsWith('/api/v1/videos/models'), 'Estimate verification must only discover models.');
  return new Response(JSON.stringify({
    data: [
      {
        id: 'example/generic-audio-video',
        name: 'Generic audio video',
        description: 'Native audio generation.',
        supported_resolutions: ['720p'],
        supported_aspect_ratios: ['16:9'],
        supported_durations: [6],
        generate_audio: true,
        pricing_skus: { duration_seconds_with_audio_720p: '0.01' },
      },
      {
        id: 'bytedance/seedance-1.5-pro',
        name: 'Seedance 1.5 Pro',
        description: 'Multilingual dialogue with precise lip-sync.',
        supported_resolutions: ['720p'],
        supported_aspect_ratios: ['16:9'],
        supported_durations: [6],
        generate_audio: true,
        pricing_skus: { duration_seconds_with_audio_720p: '0.012' },
      },
      {
        id: 'bytedance/seedance-2.0',
        name: 'Seedance 2.0',
        description: 'Multilingual dialogue with precise lip-sync.',
        supported_resolutions: ['720p'],
        supported_aspect_ratios: ['16:9'],
        supported_durations: [6],
        supported_frame_images: ['first_frame', 'last_frame'],
        supported_input_references: true,
        generate_audio: true,
        pricing_skus: { duration_seconds_with_audio_720p: '0.02' },
      },
    ],
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

try {
  const proofEstimate = await estimateOpenRouterVideo({
    apiKey: 'verification-key',
    duration: 6,
    resolution: '720p',
    aspectRatio: '16:9',
    qualityMode: 'proof',
    audioMode: 'dialogue',
  });
  assert(
    proofEstimate.modelId === 'bytedance/seedance-1.5-pro',
    'Dialogue mode must reject a cheaper generic audio model and select a lip-sync model.',
  );
  const finalEstimate = await estimateOpenRouterVideo({
    apiKey: 'verification-key',
    duration: 6,
    resolution: '720p',
    aspectRatio: '16:9',
    qualityMode: 'final',
    audioMode: 'dialogue',
  });
  assert(
    finalEstimate.modelId === 'bytedance/seedance-2.0',
    'Final dialogue mode must prefer the highest-quality lip-sync model over the cheaper fallback.',
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Storyboard audio and lip-sync verification passed');
