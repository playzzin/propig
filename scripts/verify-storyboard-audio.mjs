import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import {
  analyzeStoryboardDialogueTiming,
  appendStoryboardVideoAudioDirection,
  normalizeStoryboardSpokenDialogue,
  resolveStoryboardVideoAudioMode,
} from '../src/lib/storyboard-video-audio.ts';
import {
  canReuseStoryboardVideoProviderJob,
  describeStoryboardVideoRecovery,
} from '../src/lib/storyboard-video-recovery.ts';
import {
  buildStoryboardVoiceLock,
  hasAmbiguousStoryboardVoiceSelection,
  resolveStoryboardVoiceProfile,
} from '../src/lib/storyboard-voice-consistency.ts';

const require = createRequire(import.meta.url);
const { estimateOpenRouterVideo } = require('../functions/lib/videoStudio/openrouter.js');
const {
  resolveBackgroundMusicMixProfile,
} = require('../functions/lib/videoStudio/ffmpeg.js');
const {
  videoStudioJobRequestSchema,
} = require('../functions/lib/videoStudio/request.js');
const nextVideoGeneration = readFileSync(
  new URL('../src/lib/server/video-generation.ts', import.meta.url),
  'utf8',
);
const storyboardPlannerSources = [
  '../src/app/api/generate-image-storyboard/route.ts',
  '../src/app/api/generate-image-storyboard/scene/route.ts',
  '../src/app/api/generate-image-storyboard/flow/route.ts',
  '../functions/src/api/hostingGenerationRoutes.ts',
].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  nextVideoGeneration.includes('function dialogueModelGenerationScore'),
  'The Next.js video preflight must share the final dialogue quality preference.',
);

assert(
  resolveStoryboardVideoAudioMode({ generateAudio: true }) === 'ambient',
  'Legacy generateAudio=true must migrate to ambient audio.',
);
assert(
  resolveStoryboardVideoAudioMode({ audioMode: 'dialogue', generateAudio: false }) === 'dialogue',
  'Explicit audioMode must take precedence over the legacy boolean.',
);

const mixedDirectionAndDialogue = '딸이 휴대폰을 들고 화를 내며 말한다. " 이런 폰으로 일한다고 "';
assert(
  normalizeStoryboardSpokenDialogue(mixedDirectionAndDialogue) === '이런 폰으로 일한다고',
  'Action direction and quote marks must be removed before lip-sync generation.',
);
assert(
  storyboardPlannerSources.every((source) =>
    source.includes('dialogueOrCaption must contain only the exact'),
  ),
  'Every storyboard planning path must keep action direction out of spoken dialogue.',
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

const voiceProfiles = [
  {
    id: 'father-voice',
    characterName: '아빠',
    voiceDescription: '부드럽고 낮은 40대 한국어 남성 목소리',
    speakingStyle: '차분한 속도와 또렷한 문장 끝',
  },
  {
    id: 'daughter-voice',
    characterName: '딸',
    voiceDescription: '맑고 선명한 20대 한국어 여성 목소리',
    speakingStyle: '빠르지 않은 자연스러운 대화체',
  },
];
const voiceProduction = {
  voiceDirection: '따뜻하고 자연스러운 한국어 목소리',
  voiceProfiles,
};
const fatherVoiceLock = buildStoryboardVoiceLock(
  resolveStoryboardVoiceProfile(voiceProduction, {
    voiceProfileId: 'father-voice',
  }),
);
const repeatedFatherVoiceLock = buildStoryboardVoiceLock(
  resolveStoryboardVoiceProfile(voiceProduction, {
    voiceProfileId: 'father-voice',
  }),
);
const daughterVoiceLock = buildStoryboardVoiceLock(
  resolveStoryboardVoiceProfile(voiceProduction, {
    voiceProfileId: 'daughter-voice',
  }),
);
assert(
  fatherVoiceLock === repeatedFatherVoiceLock,
  'The same character must receive an identical immutable voice lock in every scene.',
);
assert(
  fatherVoiceLock !== daughterVoiceLock &&
    fatherVoiceLock.includes('character-father-voice') &&
    daughterVoiceLock.includes('character-daughter-voice'),
  'Different characters must keep separate stable voice identities.',
);
assert(
  hasAmbiguousStoryboardVoiceSelection(voiceProduction, {
    voiceProfileId: null,
  }),
  'A dialogue scene must require a character choice when multiple voice profiles exist.',
);
const characterLockedPrompt = appendStoryboardVideoAudioDirection(
  'A father speaks to his daughter.',
  'dialogue',
  '오늘은 같이 이야기해 보자.',
  6,
  fatherVoiceLock,
);
assert(
  characterLockedPrompt.includes('Character voice continuity lock:') &&
    characterLockedPrompt.includes('character-father-voice') &&
    characterLockedPrompt.includes('Do not substitute another voice'),
  'Dialogue prompts must carry the selected character voice fingerprint and anti-drift rules.',
);
const revisedDialoguePrompt = appendStoryboardVideoAudioDirection(
  dialoguePrompt,
  'dialogue',
  '수정된 대사',
  6,
);
assert(
  revisedDialoguePrompt.includes('수정된 대사') && revisedDialoguePrompt !== dialoguePrompt,
  'Changing dialogue must replace a prepared audio block instead of reusing stale words.',
);
const mixedDialoguePrompt = appendStoryboardVideoAudioDirection(
  'A daughter complains while holding an old phone.',
  'dialogue',
  mixedDirectionAndDialogue,
  10,
);
assert(
  mixedDialoguePrompt.includes('"이런 폰으로 일한다고"') &&
    !mixedDialoguePrompt.includes('딸이 휴대폰을 들고 화를 내며 말한다.'),
  'Provider prompts must contain only the normalized spoken line.',
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

const recoverableCanvasJob = {
  status: 'failed',
  metadata: {
    providerVideo: null,
    providerVideoDiscarded: {
      reason: 'resolution_mismatch',
      providerJobId: 'provider-video-canvas-1',
      modelId: 'example/video-model',
      discardedAt: '2026-08-01T02:17:07.776Z',
    },
    renderResult: {
      requestId: 'provider-video-canvas-1',
      modelUsed: 'example/video-model',
      resolvedResolution: '480p',
      durationApplied: 10,
    },
  },
};
assert(
  canReuseStoryboardVideoProviderJob(recoverableCanvasJob),
  'A completed provider result discarded only for a canvas mismatch must be reusable.',
);
const canvasRecovery = describeStoryboardVideoRecovery({
  errorMessage: 'OpenRouter scene video quality validation failed. Expected 854x480 but received 864x496.',
  job: recoverableCanvasJob,
});
assert(
  canvasRecovery.kind === 'reprocess-canvas' &&
    canvasRecovery.canReuseProviderJob &&
    canvasRecovery.description.includes('추가 영상 생성비는 들지 않습니다') &&
    canvasRecovery.actionLabel.includes('규격 보정'),
  'Canvas-only recovery must clearly offer no-charge server-side normalization.',
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
