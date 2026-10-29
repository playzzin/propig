'use client';

import { useId, useState, type ReactNode } from 'react';
import Image from 'next/image';
import { Bot, CreditCard, FileText, Globe2, Landmark, Megaphone, MessageCircle, Monitor, Repeat2, ShoppingBag, Smartphone, type LucideIcon } from 'lucide-react';
import styled, { css } from 'styled-components';
import ProductMotionArtwork from './ProductMotionArtwork';
import ProductShowcaseWorkspace from './ProductShowcaseWorkspace';
import ProductAutomationDirector from './ProductAutomationDirector';

type ServiceOption = { label: string; title: string; description: string; icon: LucideIcon };

const OPTIONS: Record<number, ServiceOption[]> = {
  0: [
    { label: '그뚠웹', title: '전 세계의 프로젝트를 한 화면에서', description: 'PC 콘셉트 · 지역 현황·프로젝트·팀 업무를 한 화면에.', icon: Monitor },
    { label: '그뚠앱', title: '오늘의 업무를 손안에서 가볍게', description: '모바일 콘셉트 · 현장 일정과 할 일을 확인하고 팀과 공유합니다.', icon: Smartphone },
    { label: '글로벌 연결', title: '서울에서 시작해 세계로 이어지는 웹앱', description: '서울·도쿄·런던·뉴욕을 잇는 데이터 흐름과 한국어·영어·일본어 전환 시연입니다.', icon: Globe2 },
  ],
  1: [
    { label: '자동 순환', title: '자료 접수 → 서류 작성 → 업무 실행', description: '18종 서류를 작성하고 검토한 뒤, 발행·이체·안내·결제·브라우저 작업으로 연결하는 시연입니다.', icon: Repeat2 },
    { label: '급여·거래', title: '사업과 거래에 필요한 기본 서류', description: '사업계획서·월급명세서·노임명세서·견적서·거래명세서·세금계산서', icon: FileText },
    { label: '계약·발주', title: '계약에서 구매와 정산까지', description: '근로계약서·발주서·구매요청서·지출결의서·입금확인서·재고명세서', icon: FileText },
    { label: '보고·증명', title: '일상의 보고와 신청도 자연스럽게', description: '업무보고서·출장신청서·휴가신청서·재직증명서·납품확인서·정산보고서', icon: FileText },
  ],
  3: [
    { label: '생성형 콘텐츠 판매', title: '그뚠이와 만드는 나만의 콘텐츠 상품', description: '그뚠이의 콘텐츠 제작·상품 소개·주문 확인·파일 전달 시연입니다.', icon: ShoppingBag },
    { label: '광고형 리셀러', title: '상품을 발견하고, 콘텐츠로 판매를 연결', description: '플랫폼을 선택해 상품 소개 → 광고 소재 → 상품·제휴 링크 → 고객 반응의 시연을 살펴보세요.', icon: Megaphone },
  ],
};

type AutomationCategory = 'documents' | 'integrations' | 'agents';

const AUTOMATION_CATEGORIES: { id: AutomationCategory; label: string; offset: number; options: ServiceOption[] }[] = [
  { id: 'documents', label: '업무자동화', offset: 0, options: OPTIONS[1] },
  {
    id: 'integrations', label: '프로그램 연동', offset: 4,
    options: [
      { label: '세금계산서 발행', title: '검토한 거래 자료를 발행 요청으로', description: '연동 시연 · 거래 자료 검토 → 발행 승인 → 프로그램 요청 → 처리 응답과 원본 대조', icon: FileText },
      { label: '급여이체', title: '승인된 급여에서 이체 결과 확인까지', description: '연동 시연 · 급여 명세 검토 → 이체 승인 → 이체 요청 → 처리 결과와 지급 내역 대조', icon: Landmark },
      { label: '카카오톡 발송', title: '확인한 안내를 필요한 고객에게', description: '연동 시연 · 수신 대상·메시지 검토 → 발송 승인 → 전송 요청 → 발송 결과 확인', icon: MessageCircle },
      { label: 'PG 결제 연결', title: '주문과 결제 응답을 같은 흐름으로', description: '연동 시연 · 주문 금액 검토 → 결제 요청 → 승인 응답 확인 → 주문·결제 내역 대조', icon: CreditCard },
    ],
  },
  {
    id: 'agents', label: '브라우저·에이전트', offset: 8,
    options: [
      { label: '브라우저 자동화', title: '화면을 이동하며 반복 업무를 수행', description: '작업 시연 · 실행 범위 확인 → 화면 이동·자료 입력 → 제출 전 검토 → 결과 화면 대조', icon: Monitor },
      { label: '에이전트 봇', title: '요청을 나누고, 확인하며 진행하는 작업', description: '작업 시연 · 업무 계획 검토 → 단계별 실행 요청 → 응답 대조 → 승인 후 다음 단계', icon: Bot },
    ],
  },
];

const COMMERCE_PLATFORMS = [
  { id: 'naver', label: '네이버스토어', detail: '스토어 상품 소개', description: '상품 정보를 콘텐츠로 구성하고 네이버스토어 상품 페이지로 연결합니다.' },
  { id: 'coupang', label: '쿠팡파트너스', detail: '추천 콘텐츠 · 제휴 링크', description: '상품 추천 영상과 제휴 링크를 연결하고, 콘텐츠에서 상품으로 이어지는 반응을 살펴봅니다.' },
  { id: 'aliexpress', label: '알리익스프레스', detail: '글로벌 상품 콘텐츠', description: '글로벌 상품의 특징을 광고 콘텐츠로 만들고 상품·제휴 링크로 연결합니다.' },
  { id: 'temu', label: '테무', detail: '상품 발견 · 광고 콘텐츠', description: '발견한 상품을 짧은 광고 콘텐츠로 소개하고 상품·제휴 링크로 연결합니다.' },
] as const;

const Explorer = styled.div<{ $docked: boolean }>`
  min-width: 0;
  width: 100%;
  padding: ${({ $docked }) => $docked ? '0' : '8px 4px 8px'};
  color: #f3f7ff;

  @media (max-width: 600px) { padding: ${({ $docked }) => $docked ? '0' : '4px 2px 6px'}; }
`;

const Options = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 0 12px;

  @media (max-width: 600px) {
    padding: 0 8px;
    gap: 4px;
    &[data-option-count='4'] {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      button { padding-inline: 3px; }
      svg { display: none; }
    }
    &[data-automation-submenu='integrations'] {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      button { font-size: 12px; }
      svg { display: block; }
    }
  }
`;

const Categories = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  margin: 0 12px 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid #314c6b;

  button {
    min-width: 0;
    min-height: 46px;
    border: 0;
    border-radius: 4px;
    padding: 8px 6px;
    background: transparent;
    color: #adbed4;
    font: inherit;
    font-size: 12px;
    font-weight: 650;
    line-height: 1.45;
    word-break: keep-all;
    cursor: pointer;
    transition: color 160ms ease, background 160ms ease;
  }
  button:hover { color: #f3f7ff; background: #183653; }
  button[aria-pressed='true'] { color: #f3f7ff; background: #1b3e63; box-shadow: inset 0 -2px #93c5fd; }
  button:focus-visible { outline: 3px solid #f3f7ff; outline-offset: 2px; }
  @media (max-width: 600px) {
    margin: 0 8px 8px;
    padding-bottom: 8px;
    button { min-height: 48px; padding-inline: 3px; }
  }
  @media (prefers-reduced-motion: reduce) { button { transition: none; } }
`;

const Option = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  flex: 1 1 auto;
  min-height: 44px;
  border: 1px solid #577390;
  border-radius: 5px;
  padding: 8px 10px;
  background: #10243d;
  color: #f3f7ff;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.25;
  cursor: pointer;
  transition: background 160ms ease, color 160ms ease, border-color 160ms ease;

  svg { width: 15px; height: 15px; flex: 0 0 auto; }
  &:hover { background: #1d3d60; border-color: #5eead4; }
  &[aria-pressed='true'] { background: #93c5fd; border-color: #93c5fd; color: #0a1830; }
  &:focus-visible { outline: 3px solid #f3f7ff; outline-offset: 3px; }
  @media (max-width: 600px) {
    padding: 8px 6px;
    gap: 4px;
    font-size: 11px;
    svg { width: 13px; height: 13px; }
  }
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;

const Caption = styled.div`
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: start;
  gap: 8px;
  margin: 0;
  border-top: 1px solid #314c6b;
  padding: 5px 0;

  > span { color: #93c5fd; font-size: 10px; font-weight: 700; line-height: 20px; }
  > div { display: flex; align-items: baseline; gap: 4px 12px; }
  strong { flex-shrink: 0; font-size: 13px; line-height: 1.5; font-weight: 650; }
  p { margin: 0; color: #adbed4; font-size: 12px; line-height: 1.5; word-break: keep-all; overflow-wrap: anywhere; }
  @media (max-width: 600px) {
    > div { display: block; }
    strong { display: block; font-size: 12px; }
    p { font-size: 11px; margin-top: 2px; }
  }
`;

const PlatformPicker = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px;
  margin: 12px 12px 0;

  button {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    min-height: 64px;
    padding: 10px 5px;
    border: 1px solid #314c6b;
    border-radius: 8px;
    background: #0a1830;
    color: #b9cbe2;
    font: inherit;
    font-size: 11px;
    font-weight: 650;
    cursor: pointer;
    transition: transform 180ms ease, background 180ms ease, border-color 180ms ease;
  }
  img { width: 30px; height: 30px; object-fit: contain; border-radius: 5px; }
  [data-commerce-option='coupang'] img { width: 92px; height: 30px; padding: 4px; border-radius: 4px; background: #fff; }
  button:hover { transform: translateY(-2px); background: #132d4a; border-color: #93c5fd; }
  button:active { transform: translateY(0) scale(.98); }
  button[aria-pressed='true'] { background: #183653; color: #f3f7ff; border-color: #93c5fd; box-shadow: inset 0 -2px #93c5fd; }
  button:focus-visible { outline: 3px solid #f3f7ff; outline-offset: 3px; }
  @media (max-width: 600px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin: 10px 8px 0;
    button { min-height: 72px; padding-block: 8px; gap: 5px; }
    img { width: 26px; height: 26px; }
    [data-commerce-option='coupang'] img { height: 26px; }
  }
  @media (prefers-reduced-motion: reduce) { button { transition: none; } button:hover, button:active { transform: none; } }
`;

const NavigationControls = styled.div<{ $docked: boolean }>`
  min-width: 0;
  ${({ $docked }) => $docked && css`
    ${Options} { display: grid; grid-template-columns: 1fr; gap: 6px; padding: 0; }
    ${Option} { min-width: 0; justify-content: flex-start; text-align: left; white-space: normal; word-break: keep-all; overflow-wrap: anywhere; }
    ${Categories} {
      margin: 0 0 8px; padding: 0 0 8px;
      button { min-height: 48px; padding: 6px 3px; font-size: 10px; }
    }
    &[data-service-controls='1'] ${Options} { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    &[data-service-controls='1'] ${Option} {
      justify-content: center; padding: 7px 5px; text-align: center; font-size: 11px; line-height: 1.4;
      svg { display: none; }
    }
    ${PlatformPicker} {
      grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; margin: 8px 0 0;
      button { min-height: 60px; padding: 6px 4px; gap: 5px; font-size: 10px; line-height: 1.4; word-break: keep-all; }
      img { width: 24px; height: 24px; }
      [data-commerce-option='coupang'] img { width: min(92px, 100%); height: 24px; }
    }
    @container (max-width: 760px) {
      &[data-service-controls='0'] ${Options} { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      &[data-service-controls='3'] ${Options} { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      ${Option} { justify-content: center; padding: 7px 5px; text-align: center; font-size: 11px; }
    }
  `}
`;

type ProductServiceExplorerProps = {
  chapter: number;
  playing: boolean;
  reducedMotion: boolean;
  cycle: number;
  sceneElapsedMs?: number;
  onInteract: () => void;
  selection?: { variant: number; platform?: number };
  onSelectionChange?: (selection: { variant: number; platform?: number }) => void;
  introduction?: ReactNode;
  renderNavigation?: (controls: ReactNode) => ReactNode;
};

export default function ProductServiceExplorer({ chapter, playing, reducedMotion, cycle, sceneElapsedMs = 0, onInteract, selection, onSelectionChange, introduction, renderNavigation }: ProductServiceExplorerProps) {
  const [selections, setSelections] = useState<Record<number, number>>({});
  const [selectedPlatform, setCommercePlatform] = useState(0);
  const [selectedAutomationCategory, setAutomationCategory] = useState<AutomationCategory>('documents');
  const [automationSelections, setAutomationSelections] = useState<Record<AutomationCategory, number>>({ documents: 0, integrations: 4, agents: 8 });
  const descriptionId = useId();
  const maximumVariant = chapter === 1 ? 9 : (OPTIONS[chapter] ?? OPTIONS[0]).length - 1;
  const selectedVariant = selection && Number.isFinite(selection.variant) ? Math.max(0, Math.min(maximumVariant, Math.floor(selection.variant))) : undefined;
  const automationCategory = selectedVariant === undefined ? selectedAutomationCategory : selectedVariant >= 8 ? 'agents' : selectedVariant >= 4 ? 'integrations' : 'documents';
  const automation = AUTOMATION_CATEGORIES.find(({ id }) => id === automationCategory) ?? AUTOMATION_CATEGORIES[0];
  const options = chapter === 1 ? automation.options : OPTIONS[chapter] ?? OPTIONS[0];
  const offset = chapter === 1 ? automation.offset : 0;
  const variant = selectedVariant ?? (chapter === 1 ? automationSelections[automationCategory] : Math.min(selections[chapter] ?? 0, options.length - 1));
  const commercePlatform = selection?.platform !== undefined && Number.isFinite(selection.platform) ? Math.max(0, Math.min(COMMERCE_PLATFORMS.length - 1, Math.floor(selection.platform))) : selectedPlatform;
  const active = options[variant - offset];
  const advertising = chapter === 3 && variant === 1;
  const platform = COMMERCE_PLATFORMS[commercePlatform];

  function selectVariant(nextVariant: number, nextPlatform = commercePlatform) {
    if (chapter === 1) {
      const category: AutomationCategory = nextVariant >= 8 ? 'agents' : nextVariant >= 4 ? 'integrations' : 'documents';
      setAutomationSelections((previous) => ({ ...previous, [automationCategory]: variant, [category]: nextVariant }));
      setAutomationCategory(category);
    } else {
      setSelections((previous) => ({ ...previous, [chapter]: nextVariant }));
      if (chapter === 3) setCommercePlatform(nextPlatform);
    }
    if (onSelectionChange) onSelectionChange({ variant: nextVariant, ...(chapter === 3 ? { platform: nextPlatform } : {}) });
    else onInteract();
  }

  const controls = (
    <NavigationControls $docked={Boolean(renderNavigation)} data-service-controls={chapter}>
      {chapter === 1 && <Categories role="group" aria-label="자동화 분야 선택">
        {AUTOMATION_CATEGORIES.map(({ id, label }) => <button
          key={id}
          type="button"
          data-automation-category-option={id}
          aria-pressed={automationCategory === id}
          onClick={() => selectVariant(id === automationCategory ? variant : automationSelections[id])}
        >
          {id === 'agents' ? <>브라우저·<wbr />에이전트</> : label}
        </button>)}
      </Categories>}
      <Options data-option-count={options.length} data-automation-submenu={chapter === 1 ? automationCategory : undefined} role="group" aria-label={chapter === 1 ? `${automation.label} 종류 선택` : chapter === 3 ? '크리에디터 판매 방식 선택' : '웹 서비스 화면 선택'}>
        {options.map(({ label, icon: Icon }, index) => (
          <Option
            key={label}
            type="button"
            aria-pressed={variant === index + offset}
            aria-describedby={variant === index + offset ? descriptionId : undefined}
            data-service-option={index + offset}
            onClick={() => selectVariant(index + offset)}
          >
            <Icon aria-hidden="true" />
            {label}
          </Option>
        ))}
      </Options>
      {advertising && <PlatformPicker role="group" aria-label="광고형 리셀러 플랫폼 선택">
        {COMMERCE_PLATFORMS.map(({ id, label }, index) => <button
          key={id}
          type="button"
          data-commerce-option={id}
          aria-pressed={commercePlatform === index}
          aria-describedby={commercePlatform === index ? descriptionId : undefined}
          onClick={() => selectVariant(1, index)}
        >
          <Image src={`/images/corp/commerce/${id}.png`} alt="" width={id === 'coupang' ? 112 : 32} height={32} unoptimized />
          <span>{label}</span>
        </button>)}
      </PlatformPicker>}
    </NavigationControls>
  );

  const content = (
    <div data-product-canvas data-product-interactive>
      {introduction}
      {chapter === 1 ? <AutomationStage data-automation-stage>
        <ProductAutomationDirector elapsedMs={sceneElapsedMs} variant={variant} cycle={cycle} playing={playing} reducedMotion={reducedMotion} />
        <ProductMotionArtwork key={`${chapter}-${variant}-${cycle}`} chapter={chapter} variant={variant} playing={playing} reducedMotion={reducedMotion} />
      </AutomationStage> : <ProductMotionArtwork key={`${chapter}-${variant}-${commercePlatform}-${cycle}`} chapter={chapter} variant={variant} platform={commercePlatform} playing={playing} reducedMotion={reducedMotion} />}
      <Caption data-product-caption id={descriptionId} aria-live={playing ? 'off' : 'polite'} aria-atomic="true">
        <span aria-hidden="true">{String(variant + 1).padStart(2, '0')}</span>
        <div><strong>{advertising ? `${platform.label} · ${platform.detail}` : active.title}</strong><p>{advertising ? `${platform.description} 브랜드 시연 콘텐츠입니다.` : active.description}</p></div>
      </Caption>
    </div>
  );

  return (
    <Explorer $docked={Boolean(renderNavigation)} data-service-explorer={chapter} data-service-variant={variant} data-automation-category={chapter === 1 ? automationCategory : undefined}>
      {renderNavigation ? (
        <ProductShowcaseWorkspace navigation={renderNavigation(controls)}>{content}</ProductShowcaseWorkspace>
      ) : <>{controls}{content}</>}
    </Explorer>
  );
}

const AutomationStage = styled.div`
  display: grid; grid-template-columns: minmax(220px, .95fr) minmax(0, 1.65fr); gap: 18px; align-items: center; flex: 1; min-width: 0;
  @container (max-width: 640px) { display: flex; flex-direction: column; align-items: stretch; gap: 4px; flex: none; }
`;
