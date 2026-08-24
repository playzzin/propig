const UNSAFE_FILE_NAME_CHARACTERS = /[^\p{L}\p{N}_-]+/gu;
const EDGE_SEPARATORS = /^_+|_+$/g;

export function buildEmoticonFrameFileName(itemTitle: string, frameIndex: number): string {
  if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex > 23) {
    throw new Error('프레임 번호는 0~23 범위여야 합니다.');
  }
  const safeTitle = itemTitle
    .normalize('NFKC')
    .replace(UNSAFE_FILE_NAME_CHARACTERS, '_')
    .replace(EDGE_SEPARATORS, '')
    .slice(0, 80) || 'emoticon';
  return `${String(frameIndex + 1).padStart(3, '0')}_${safeTitle}.png`;
}
