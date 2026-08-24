export const EMOTICON_SUBJECT_INSTRUCTION_LIMIT = 800;

type EmoticonSubjectVariationInput = {
  subject: string;
  variationNumber: number;
  maxLength?: number;
};

type EmoticonSequenceFrameInput = {
  subject: string;
  frameNumber: number;
  frameCount: number;
  maxLength?: number;
};

/**
 * Keeps the user's requested subject authoritative when one idea is expanded
 * into multiple static candidates. Variations may change presentation details,
 * never the named action, props, situation, direction, expression, or text.
 */
export function buildEmoticonSubjectVariationPrompt({
  subject,
  variationNumber,
  maxLength = EMOTICON_SUBJECT_INSTRUCTION_LIMIT,
}: EmoticonSubjectVariationInput): string {
  const normalizedSubject = subject.trim().replace(/\r\n/g, '\n').normalize('NFC');
  const normalizedVariationNumber = Math.max(1, Math.round(variationNumber));
  const normalizedMaxLength = Math.max(1, Math.round(maxLength));
  if (!normalizedSubject) return '';

  const fullVariationGuide = [
    '[필수 주제 · 변경 금지]',
    normalizedSubject,
    '',
    `[허용 변형 범위 · ${normalizedVariationNumber}번째 결과]`,
    '원문에 명시된 캐릭터·행동·표정·소품·상황·방향·문구를 모두 유지한다. 원문이 지정하지 않은 카메라 구도·시선·여백의 미세한 차이만 허용한다. 다른 행동·소재·상황으로 바꾸거나 주제를 요약·대체하지 않는다.',
  ].join('\n');
  if (fullVariationGuide.length <= normalizedMaxLength) return fullVariationGuide;

  const compactVariationGuide = `${normalizedSubject}\n[변형 ${normalizedVariationNumber}] 필수 주제를 모두 유지하고 원문이 지정하지 않은 구도·시선·여백만 바꾼다.`;
  if (compactVariationGuide.length <= normalizedMaxLength) return compactVariationGuide;

  // The original subject is more important than a variation hint. Callers
  // already enforce the same 800-character boundary for valid job input.
  return normalizedSubject.slice(0, normalizedMaxLength);
}

/**
 * Expands one overall idea into independently editable still frames. Each job
 * must render a single instant, otherwise a user ends up with a sprite sheet
 * nested inside every cell and cannot build a clean animation timeline.
 */
export function buildEmoticonSequenceFramePrompt({
  subject,
  frameNumber,
  frameCount,
  maxLength = EMOTICON_SUBJECT_INSTRUCTION_LIMIT,
}: EmoticonSequenceFrameInput): string {
  const normalizedSubject = subject.trim().replace(/\r\n/g, '\n').normalize('NFC');
  if (!normalizedSubject) return '';
  const normalizedFrameCount = Math.max(2, Math.min(40, Math.round(frameCount)));
  const normalizedFrameNumber = Math.max(1, Math.min(normalizedFrameCount, Math.round(frameNumber)));
  const progress = (normalizedFrameNumber - 1) / Math.max(1, normalizedFrameCount - 1);
  const phase = progress <= 0.12 ? '도입·준비 자세'
    : progress <= 0.38 ? '감정이나 동작이 커지는 과정'
      : progress <= 0.62 ? '가장 알아보기 쉬운 핵심 순간'
        : progress <= 0.87 ? '반응·후속 동작'
          : '마무리·다음 반복으로 이어지는 자세';
  const singleFrameGuide = [
    `[${normalizedFrameCount}컷 중 ${normalizedFrameNumber}번째 단일 이미지 · ${phase}]`,
    '이 파일에는 동일 캐릭터 1명과 한 순간의 포즈 1개만 크게 그린다.',
    '금지: 여러 캐릭터 복제, 여러 포즈, 격자, 칸 분할, 콜라주, 콘택트 시트, 스프라이트 시트, 프레임 번호나 설명문.',
    '전체 요청을 순서가 있는 장면으로 해석하되 이 번호에 해당하는 순간만 표현한다.',
  ].join('\n');
  const subjectBudget = Math.max(1, Math.round(maxLength) - singleFrameGuide.length - 16);
  return `${singleFrameGuide}\n\n[전체 주제]\n${normalizedSubject.slice(0, subjectBudget)}`.slice(0, Math.max(1, Math.round(maxLength)));
}
