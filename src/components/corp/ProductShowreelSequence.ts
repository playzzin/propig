import type { ProductCategoryId, ProductId } from './productCatalogData';
import { RESELLER_EPISODES, RESELLER_EPISODE_MS } from './productResellerEpisodes';
import { SHOWREEL_MEDIA } from './productShowreelMedia';

const WEB_IMAGES = [
  ...Object.values(SHOWREEL_MEDIA.screens),
  SHOWREEL_MEDIA.mascots.work,
  SHOWREEL_MEDIA.mascots.success,
];
const AUTOMATION_IMAGES = Object.values(SHOWREEL_MEDIA.automation);
const CONTENT_SALE_IMAGES = [
  ...Object.values(SHOWREEL_MEDIA.mascots),
  SHOWREEL_MEDIA.webtoon,
  SHOWREEL_MEDIA.productFilmPoster,
];

type ShowreelChapter = {
  id: ProductCategoryId;
  label: string;
  title: readonly [string, string];
  description: string;
  cta: string | null;
};

export const SHOWREEL_CHAPTERS = [
  { id: 'web-app', label: '웹·앱 개발', title: ['그뚠웹에서 넓게,', '그뚠앱으로 가볍게.'], description: '큰 화면에서 정리하고, 손안에서 이어가세요.\n그뚠이와 함께하는 한글 웹·앱 업무 공간입니다.', cta: '웹·앱 제품 보기' },
  { id: 'automation', label: '업무자동화', title: ['서류부터 프로그램까지,', '업무가 이어지도록.'], description: '18종 서류 작성부터 발행·이체·메시지·결제 연동까지.\n브라우저와 에이전트의 반복 작업도 자동화합니다.', cta: '자동화 제품 보기' },
  { id: 'media', label: '생성형 콘텐츠', title: ['브랜드의 이야기를,', '채널에 맞는 콘텐츠로.'], description: 'YouTube 영상, TikTok 숏폼, 블로그 글, Instagram 웹툰.\n채널을 선택해 완성된 콘텐츠를 직접 살펴보세요.', cta: null },
  { id: 'partner', label: '크리에디터', title: ['콘텐츠를 상품으로,', '추천을 판매로.'], description: '생성형 콘텐츠 판매와 광고형 리셀러를 한곳에서.\n네이버스토어·쿠팡파트너스·알리·테무로 연결합니다.', cta: '크리에디터 제품 보기' },
] as const satisfies readonly ShowreelChapter[];

export type ContentChannelId = 'youtube' | 'tiktok' | 'blog' | 'instagram';

export type ShowreelSelection = {
  chapterId: ProductCategoryId;
  variant?: number;
  platform?: number;
  channel?: ContentChannelId;
};

export type ShowreelStep = {
  [Chapter in ProductCategoryId]: Omit<ShowreelSelection, 'chapterId'> & {
    chapterId: Chapter;
    productId: ProductId<Chapter>;
    id: string;
    label: string;
    durationMs: number;
    images?: readonly string[];
  };
}[ProductCategoryId];

export const SHOWREEL_STEPS: readonly ShowreelStep[] = [
  { id: 'pc-web', label: '그뚠웹', chapterId: 'web-app', productId: 'web-product-starter', variant: 0, images: WEB_IMAGES, durationMs: 12_000 },
  { id: 'mobile-web', label: '그뚠앱', chapterId: 'web-app', productId: 'web-product-starter', variant: 1, images: WEB_IMAGES, durationMs: 12_000 },
  { id: 'global-web', label: '글로벌 연결', chapterId: 'web-app', productId: 'web-customer-portal', variant: 2, images: WEB_IMAGES, durationMs: 12_000 },
  { id: 'payroll-documents', label: '급여·거래', chapterId: 'automation', productId: 'automation-document', variant: 1, images: AUTOMATION_IMAGES, durationMs: 12_000 },
  { id: 'contract-documents', label: '계약·발주', chapterId: 'automation', productId: 'automation-document', variant: 2, images: AUTOMATION_IMAGES, durationMs: 12_000 },
  { id: 'report-documents', label: '보고·증명', chapterId: 'automation', productId: 'automation-document', variant: 3, images: AUTOMATION_IMAGES, durationMs: 12_000 },
  { id: 'tax-invoice', label: '세금계산서 발행', chapterId: 'automation', productId: 'cy-tax-invoice', variant: 4, images: AUTOMATION_IMAGES, durationMs: 12_000 },
  { id: 'payroll-transfer', label: '급여이체', chapterId: 'automation', productId: 'cy-payroll-settlement', variant: 5, images: AUTOMATION_IMAGES, durationMs: 12_000 },
  { id: 'kakao', label: '카카오톡 발송', chapterId: 'automation', productId: 'automation-approval', variant: 6, images: AUTOMATION_IMAGES, durationMs: 12_000 },
  { id: 'pg-payment', label: 'PG 결제 연결', chapterId: 'automation', productId: 'automation-data-sync', variant: 7, images: AUTOMATION_IMAGES, durationMs: 12_000 },
  { id: 'browser-agent', label: '브라우저 자동화', chapterId: 'automation', productId: 'automation-ai-workflow', variant: 8, images: AUTOMATION_IMAGES, durationMs: 12_000 },
  { id: 'task-agent', label: '에이전트 봇', chapterId: 'automation', productId: 'automation-ai-workflow', variant: 9, images: AUTOMATION_IMAGES, durationMs: 12_000 },
  { id: 'youtube', label: 'YouTube 영상', chapterId: 'media', productId: 'media-product-film', channel: 'youtube', durationMs: 20_000 },
  { id: 'tiktok', label: 'TikTok 영상', chapterId: 'media', productId: 'media-short-form', channel: 'tiktok', durationMs: 15_000 },
  { id: 'blog', label: '블로그 콘텐츠', chapterId: 'media', productId: 'media-brand-campaign', channel: 'blog', images: [SHOWREEL_MEDIA.mascots.work, SHOWREEL_MEDIA.automation.pc], durationMs: 24_000 },
  { id: 'instagram', label: 'Instagram 웹툰', chapterId: 'media', productId: 'media-brand-campaign', channel: 'instagram', images: [SHOWREEL_MEDIA.webtoon], durationMs: 48_000 },
  { id: 'content-sales', label: '생성형 콘텐츠 판매', chapterId: 'partner', productId: 'partner-onboarding', variant: 0, images: CONTENT_SALE_IMAGES, durationMs: 12_000 },
  ...RESELLER_EPISODES.map<ShowreelStep>(({ id, label, image }, platform) => ({
    id, label, chapterId: 'partner', productId: 'partner-portal',
    variant: 1, platform, images: [image], durationMs: RESELLER_EPISODE_MS,
  })),
];

export const SHOWREEL_TOTAL_MS = SHOWREEL_STEPS.reduce((sum, step) => sum + step.durationMs, 0);
export const SHOWREEL_STARTS = SHOWREEL_STEPS.map((_, index) => SHOWREEL_STEPS.slice(0, index).reduce((sum, step) => sum + step.durationMs, 0));

export function resolveShowreelSelection(selection: ShowreelSelection): { index: number; step: ShowreelStep } {
  // The optional overview keeps all 18 forms available without repeating it in the guided tour.
  if (selection.chapterId === 'automation' && selection.variant === 0) {
    return {
      index: SHOWREEL_STEPS.findIndex(step => step.chapterId === 'automation'),
      step: {
        id: 'all-documents', label: '서류 18종 자동 순환',
        chapterId: 'automation', productId: 'automation-document', variant: 0, images: AUTOMATION_IMAGES, durationMs: 12_000,
      },
    };
  }
  const index = SHOWREEL_STEPS.findIndex(step => step.chapterId === selection.chapterId
    && (selection.variant === undefined || step.variant === selection.variant)
    && (selection.channel === undefined || step.channel === selection.channel)
    && (selection.platform === undefined || selection.chapterId !== 'partner' || selection.variant === 0 || step.platform === selection.platform));
  const safeIndex = Math.max(0, index);
  return { index: safeIndex, step: SHOWREEL_STEPS[safeIndex] };
}
