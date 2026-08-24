export const EMOTICON_FRAME_COUNT_PRESETS = [4, 8, 12, 16, 20, 24] as const;

export type EmoticonFrameCountPreset = typeof EMOTICON_FRAME_COUNT_PRESETS[number];

export type EmoticonSpriteSheetLayout = {
  columns: number;
  rows: number;
  frameCount: number;
};

export function resolveClientEmoticonSpriteSheetLayout(frameCount: number): EmoticonSpriteSheetLayout {
  const normalized = Math.max(2, Math.min(24, Math.round(frameCount)));
  if (normalized <= 2) return { columns: 2, rows: 1, frameCount: normalized };
  if (normalized <= 3) return { columns: 3, rows: 1, frameCount: normalized };
  if (normalized <= 4) return { columns: 2, rows: 2, frameCount: normalized };
  if (normalized <= 6) return { columns: 3, rows: 2, frameCount: normalized };
  if (normalized <= 8) return { columns: 4, rows: 2, frameCount: normalized };
  if (normalized <= 9) return { columns: 3, rows: 3, frameCount: normalized };
  if (normalized <= 12) return { columns: 4, rows: 3, frameCount: normalized };
  if (normalized <= 16) return { columns: 4, rows: 4, frameCount: normalized };
  if (normalized <= 20) return { columns: 5, rows: 4, frameCount: normalized };
  return { columns: 6, rows: 4, frameCount: normalized };
}

export function emoticonSpriteSheetLayoutLabel(frameCount: number): string {
  const layout = resolveClientEmoticonSpriteSheetLayout(frameCount);
  return `${layout.columns}×${layout.rows}`;
}
