export type ShowreelSelection = {
  chapter: number;
  variant?: number;
  platform?: number;
  channel?: number;
};

export type ShowreelStep = ShowreelSelection & {
  id: string;
  label: string;
  durationMs: number;
};

export const SHOWREEL_STEPS: readonly ShowreelStep[] = [
  { id: 'pc-web', label: 'PC 웹', chapter: 0, variant: 0, durationMs: 12_000 },
  { id: 'mobile-web', label: '모바일 웹', chapter: 0, variant: 1, durationMs: 12_000 },
  { id: 'global-web', label: '글로벌 연결', chapter: 0, variant: 2, durationMs: 12_000 },
  { id: 'payroll-documents', label: '급여·거래', chapter: 1, variant: 1, durationMs: 12_000 },
  { id: 'contract-documents', label: '계약·발주', chapter: 1, variant: 2, durationMs: 12_000 },
  { id: 'report-documents', label: '보고·증명', chapter: 1, variant: 3, durationMs: 12_000 },
  { id: 'tax-invoice', label: '세금계산서 발행', chapter: 1, variant: 4, durationMs: 12_000 },
  { id: 'payroll-transfer', label: '급여이체', chapter: 1, variant: 5, durationMs: 12_000 },
  { id: 'kakao', label: '카카오톡 발송', chapter: 1, variant: 6, durationMs: 12_000 },
  { id: 'pg-payment', label: 'PG 결제 연결', chapter: 1, variant: 7, durationMs: 12_000 },
  { id: 'browser-agent', label: '브라우저 자동화', chapter: 1, variant: 8, durationMs: 12_000 },
  { id: 'task-agent', label: '에이전트 봇', chapter: 1, variant: 9, durationMs: 12_000 },
  { id: 'youtube', label: 'YouTube 영상', chapter: 2, channel: 0, durationMs: 12_000 },
  { id: 'tiktok', label: 'TikTok 영상', chapter: 2, channel: 1, durationMs: 12_000 },
  { id: 'blog', label: '블로그 콘텐츠', chapter: 2, channel: 2, durationMs: 24_000 },
  { id: 'instagram', label: 'Instagram 웹툰', chapter: 2, channel: 3, durationMs: 48_000 },
  { id: 'content-sales', label: '생성형 콘텐츠 판매', chapter: 3, variant: 0, durationMs: 12_000 },
  { id: 'naver', label: '네이버스토어', chapter: 3, variant: 1, platform: 0, durationMs: 12_000 },
  { id: 'coupang', label: '쿠팡파트너스', chapter: 3, variant: 1, platform: 1, durationMs: 12_000 },
  { id: 'aliexpress', label: '알리익스프레스', chapter: 3, variant: 1, platform: 2, durationMs: 12_000 },
  { id: 'temu', label: '테무', chapter: 3, variant: 1, platform: 3, durationMs: 12_000 },
];

export const SHOWREEL_TOTAL_MS = SHOWREEL_STEPS.reduce((sum, step) => sum + step.durationMs, 0);
export const SHOWREEL_STARTS = SHOWREEL_STEPS.map((_, index) => SHOWREEL_STEPS.slice(0, index).reduce((sum, step) => sum + step.durationMs, 0));

export function resolveShowreelSelection(selection: ShowreelSelection): { index: number; step: ShowreelStep } {
  // The optional overview keeps all 18 forms available without repeating it in the guided tour.
  if (selection.chapter === 1 && selection.variant === 0) {
    return { index: 3, step: { id: 'all-documents', label: '서류 18종 자동 순환', chapter: 1, variant: 0, durationMs: 12_000 } };
  }
  const index = SHOWREEL_STEPS.findIndex(step => step.chapter === selection.chapter
    && (selection.variant === undefined || step.variant === selection.variant)
    && (selection.channel === undefined || step.channel === selection.channel)
    && (selection.platform === undefined || selection.chapter !== 3 || selection.variant === 0 || step.platform === selection.platform));
  const safeIndex = Math.max(0, index);
  return { index: safeIndex, step: SHOWREEL_STEPS[safeIndex] };
}
