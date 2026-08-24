import {
  emoticonCreationIntentSchema,
  type EmoticonCreationIntent,
} from '@/schemas/emoticonStudioV2';
import type { EmoticonResourceMode } from '@/schemas/emoticonStudio';
import type { EmoticonProjectPlatform } from '@/schemas/emoticonProject';

type ParseCreationIntentOptions = {
  outputType: 'static' | 'animated';
  frameCount: number;
  durationMs: number;
  quantity: number;
  targetPlatform: EmoticonProjectPlatform;
  qualityMode: EmoticonResourceMode;
};

export function normalizeEmoticonAnimationMotion(frameCount: number, durationMs: number) {
  const normalizedFrameCount = Math.max(4, Math.min(24, Math.round(frameCount)));
  const requestedDuration = Math.max(700, Math.min(3000, Math.round(durationMs)));
  const minimumFps = Math.max(2, Math.ceil(normalizedFrameCount / 3));
  const maximumFps = Math.min(18, Math.floor(normalizedFrameCount / 0.7));
  const requestedFps = Math.round((normalizedFrameCount / requestedDuration) * 1000);
  const fps = Math.max(minimumFps, Math.min(maximumFps, requestedFps));
  return {
    fps,
    frameCount: normalizedFrameCount,
    durationMs: Math.round((normalizedFrameCount / fps) * 1000),
  };
}

function quotedPhrases(prompt: string): string[] {
  return Array.from(prompt.matchAll(/[“”"']([^“”"']{1,36})[“”"']/g))
    .map((match) => match[1]?.trim())
    .filter((value): value is string => Boolean(value));
}

function cleanSpeechPhrase(value: string): string {
  return value
    .replace(/[“”"']/g, '')
    .replace(/^(?:말풍선|대사|문구)(?:에|로)?\s*/u, '')
    .replace(/^.*(?:하면서|면서|하며|하고|하다가|다가)\s*/u, '')
    .replace(/\s*(?:라고|이라고)?\s*(?:외치|말하|말해|말하게|외치게).*$/u, '')
    .replace(/\s*(?:라고|이라고)\s*$/u, '')
    .trim()
    .slice(0, 36);
}

function inferredSpeechPhrases(prompt: string): string[] {
  if (!/(?:외치|말하|말해|말풍선|대사|문구)/u.test(prompt)) return [];
  const sequence = prompt.split(/\s*(?:그\s*)?다음(?:에)?\s*|\s*이어서\s*/u);
  if (sequence.length > 1) {
    return sequence
      .slice(0, 6)
      .map(cleanSpeechPhrase)
      .filter((value) => value.length > 0);
  }
  const single = cleanSpeechPhrase(prompt);
  return single ? [single] : [];
}

function inferDirection(prompt: string): EmoticonCreationIntent['direction'] {
  if (/오른쪽|우측|→/.test(prompt)) return 'right';
  if (/왼쪽|좌측|←/.test(prompt)) return 'left';
  if (/뒤돌|뒷모습|뒤쪽/.test(prompt)) return 'back';
  if (/정면|앞을\s*보/.test(prompt)) return 'front';
  return 'unspecified';
}

function inferEmotion(prompt: string): string {
  const candidates = ['기쁨', '신남', '화남', '슬픔', '당황', '놀람', '부끄러움', '응원', '다급함'];
  return candidates.find((candidate) => prompt.includes(candidate)) || '';
}

function inferCount(prompt: string, unitPattern: string, fallback: number): number {
  const match = prompt.match(new RegExp(`(\\d{1,2})\\s*(?:${unitPattern})`, 'u'));
  return match?.[1] ? Number(match[1]) : fallback;
}

function inferDurationMs(prompt: string, fallback: number): number {
  const milliseconds = prompt.match(/(\d{3,5})\s*(?:ms|밀리초)/iu)?.[1];
  if (milliseconds) return Number(milliseconds);
  const seconds = prompt.match(/(\d+(?:\.\d+)?)\s*초/u)?.[1];
  return seconds ? Math.round(Number(seconds) * 1000) : fallback;
}

export function parseEmoticonCreationIntent(
  rawPrompt: string,
  options: ParseCreationIntentOptions,
): EmoticonCreationIntent {
  const prompt = rawPrompt.trim();
  const frameCount = options.outputType === 'static'
    ? 1
    : Math.max(4, Math.min(24, Math.round(inferCount(prompt, '프레임|컷', options.frameCount))));
  const quantity = options.outputType === 'static'
    ? Math.max(1, Math.min(40, Math.round(inferCount(prompt, '장|개', options.quantity))))
    : 1;
  const durationMs = options.outputType === 'static'
    ? 0
    : Math.max(700, Math.min(3000, Math.round(inferDurationMs(prompt, options.durationMs))));
  const quoted = quotedPhrases(prompt);
  const phrases = quoted.length ? quoted : inferredSpeechPhrases(prompt);
  const cueSize = Math.max(1, Math.floor(frameCount / Math.max(1, phrases.length)));
  const textCues = phrases.slice(0, 6).map((text, index) => ({
    id: crypto.randomUUID(),
    text,
    startFrame: Math.min(frameCount - 1, index * cueSize),
    endFrame: index === phrases.length - 1
      ? frameCount - 1
      : Math.min(frameCount - 1, ((index + 1) * cueSize) - 1),
  }));

  return emoticonCreationIntentSchema.parse({
    action: prompt.replace(/[“”"']/g, '').slice(0, 240),
    direction: inferDirection(prompt),
    emotion: inferEmotion(prompt),
    expression: /외치|소리|말해/.test(prompt) ? '입을 벌리고 또렷하게 외치는 표정' : '',
    outputType: options.outputType,
    quantity,
    frameCount,
    durationMs,
    loopMode: options.outputType === 'static' ? 'none' : 'loop',
    targetPlatform: options.targetPlatform,
    qualityMode: options.qualityMode,
    additionalReferenceAssetIds: [],
    textCues,
  });
}

export function creationIntentNeedsConfirmation(intent: EmoticonCreationIntent): string[] {
  const questions: string[] = [];
  if (intent.direction === 'unspecified' && /달리|걷|이동/.test(intent.action)) {
    questions.push('움직이는 방향이 지정되지 않았습니다. 기본값은 오른쪽입니다.');
  }
  if (intent.outputType === 'animated' && intent.frameCount > 12 && intent.qualityMode === 'premium') {
    questions.push('고품질 13프레임 이상은 생성 비용과 시간이 크게 늘어날 수 있습니다.');
  }
  return questions;
}
