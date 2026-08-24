const HANGUL_PATTERN = /[\u3131-\u318e\uac00-\ud7a3]/;

/**
 * Older OpenRouter reviews may contain English-only issue strings. New jobs
 * request Korean, while this deterministic fallback keeps legacy results
 * understandable without another paid API call.
 */
export function localizeEmoticonQualityIssue(issue: string): string {
  const value = issue.trim();
  if (!value || HANGUL_PATTERN.test(value)) return value;
  const normalized = value.toLocaleLowerCase('en-US');
  if (/duplicate|second (?:character|face|body)|single character|detached/.test(normalized)) {
    return '중복 캐릭터나 분리된 신체·소품 잔재가 없는지 확인해 주세요.';
  }
  if (/background|transparent|transparency|residue|shadow|scenery|texture|particle/.test(normalized)) {
    return '투명 배경, 그림자 또는 캐릭터 바깥 잔재를 다시 확인해 주세요.';
  }
  if (/limb|arm|leg|hand|finger|anatom|cropp|missing (?:body|part)/.test(normalized)) {
    return '팔다리 형태와 손·발 누락 또는 캔버스 잘림 여부를 다시 확인해 주세요.';
  }
  if (/motion|pose|action|expression|frame|loop|camera|still/.test(normalized)) {
    return '프레임별 자세·표정 변화와 반복 연결이 행동을 충분히 보여주는지 확인해 주세요.';
  }
  if (/identity|reference|face|hair|outfit|color|palette|proportion|style|marking|accessor/.test(normalized)) {
    return '원본 캐릭터의 얼굴·복장·색상·비율과 그림체 일관성을 다시 확인해 주세요.';
  }
  if (/text|letter|word|watermark|logo/.test(normalized)) {
    return '이미지 안에 불필요한 글자·로고·워터마크가 없는지 확인해 주세요.';
  }
  return '이전 AI 검토의 세부 문제를 이미지에서 직접 다시 확인해 주세요.';
}
