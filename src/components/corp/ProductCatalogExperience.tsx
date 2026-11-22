'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState, type KeyboardEvent, type MouseEvent } from 'react';
import {
  ArrowRight,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  Code2,
  Film,
  ShieldCheck,
  ShoppingBag,
  Target,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import styled from 'styled-components';
import ProductMotionShowcase from '@/components/corp/ProductMotionShowcase';
import CompanyExecutionSystem from '@/components/corp/CompanyExecutionSystem';

import { PRODUCT_CATEGORIES, findProductCategory, productInquiryHref, type ProductCategory, type ProductCategoryId, type ProductId, type ProductItem } from './productCatalogData';

const CATEGORY_ICONS: Record<ProductCategoryId, LucideIcon> = {
  'web-app': Code2,
  automation: Workflow,
  media: Film,
  partner: ShoppingBag,
};

const TOTAL_PRODUCT_COUNT = PRODUCT_CATEGORIES.reduce((total, category) => total + category.products.length, 0);

function getCyQuoteMailto(product: ProductItem): string {
  const subject = `[PRO PIG 웹개발 견적] ${product.name}`;
  const body = [
    '안녕하세요. CY 실제 구동 화면을 보고 웹개발 견적을 문의합니다.',
    '',
    `관심 상품: ${product.name}`,
    `예상 구축 기간: ${product.delivery}`,
    '',
    '회사명 / 업종:',
    '예상 사용자 수:',
    '현재 업무 방식과 가장 큰 불편:',
    '필요한 데이터 또는 외부 서비스 연동:',
    '희망 시작 시점:',
    '담당자 이름 / 연락처:',
  ].join('\n');
  return `mailto:support@propig.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

const PARTNER_VALUE_PROPOSITIONS = [
  {
    icon: Target,
    label: '콘텐츠를 판매 상품으로',
    description: '영상·이미지·웹툰의 구성, 미리보기와 사용 범위를 정리해 상품의 가치를 전달합니다.',
  },
  {
    icon: ShieldCheck,
    label: '광고에서 상품으로 연결',
    description: '콘텐츠마다 적절한 스토어·제휴 링크와 상품 정보를 연결해 구매까지의 흐름을 설계합니다.',
  },
  {
    icon: ChartNoAxesCombined,
    label: '반응을 다음 제작에 반영',
    description: '조회·클릭과 확인 가능한 판매 데이터를 비교해 다음 콘텐츠와 상품 구성을 개선합니다.',
  },
] as const;

const PARTNER_JOURNEY = [
  ['01', '상품 기획', '판매할 콘텐츠나 소개할 상품과 고객을 정합니다.'],
  ['02', '콘텐츠 제작', '생성형 상품과 채널별 광고 소재를 제작합니다.'],
  ['03', '판매 연결', '콘텐츠 판매 페이지와 스토어·제휴 링크를 구성합니다.'],
  ['04', '반응 개선', '조회·클릭·판매 결과를 다음 제작에 반영합니다.'],
] as const;

export default function ProductCatalogExperience() {
  const [activeCategoryId, setActiveCategoryId] = useState(PRODUCT_CATEGORIES[0]!.id);
  const [openProductId, setOpenProductId] = useState<ProductId | null>(PRODUCT_CATEGORIES[0]!.products[0]!.id);
  const activeCategory = findProductCategory(activeCategoryId) ?? PRODUCT_CATEGORIES[0]!;
  const ActiveIcon = CATEGORY_ICONS[activeCategory.id];

  const selectCategory = (category: ProductCategory) => {
    setActiveCategoryId(category.id);
    setOpenProductId(category.products[0]!.id);

    if (window.location.hash !== `#${category.id}`) {
      window.history.pushState({}, '', `#${category.id}`);
    }
  };

  const followCatalogLink = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();

    const hash = event.currentTarget.hash;
    if (window.location.hash !== hash) {
      const category = findProductCategory(hash.slice(1));
      if (category) selectCategory(category);
      else window.history.pushState({}, '', hash);
    }

    const catalog = document.getElementById('product-catalog');
    catalog?.focus({ preventScroll: true });
    catalog?.scrollIntoView({ block: 'start', behavior: 'instant' });
  };

  useEffect(() => {
    let frameId = 0;
    const syncCategoryFromHash = () => {
      window.cancelAnimationFrame(frameId);
      const hash = window.location.hash.slice(1);
      const category = findProductCategory(hash);
      if (category) {
        setActiveCategoryId(category.id);
        setOpenProductId(category.products[0]!.id);
      }
      const target = category ? 'product-catalog'
        : ['product-catalog', 'product-business-panorama', 'company-introduction-execution'].includes(hash) ? hash : null;
      // Restore category deep links inside the page's own scroll container.
      if (target) frameId = window.requestAnimationFrame(() => {
        document.getElementById(target)?.scrollIntoView({ block: 'start', behavior: 'instant' });
      });
    };

    syncCategoryFromHash();
    window.addEventListener('hashchange', syncCategoryFromHash);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('hashchange', syncCategoryFromHash);
    };
  }, []);

  const handleCategoryKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = PRODUCT_CATEGORIES.findIndex((category) => category.id === activeCategory.id);
    const lastIndex = PRODUCT_CATEGORIES.length - 1;
    const nextIndex =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? currentIndex === lastIndex
          ? 0
          : currentIndex + 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? currentIndex === 0
            ? lastIndex
            : currentIndex - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? lastIndex
              : null;

    if (nextIndex === null) return;
    event.preventDefault();
    const nextCategory = PRODUCT_CATEGORIES[nextIndex];
    if (!nextCategory) return;

    selectCategory(nextCategory);
    requestAnimationFrame(() => document.getElementById(`product-category-tab-${nextCategory.id}`)?.focus());
  };

  return (
    <CatalogPage id="content-area" aria-labelledby="product-catalog-title">
      <SkipLink href="#product-catalog" onClick={followCatalogLink}>제품 목록으로 건너뛰기</SkipLink>
      <ProductMotionShowcase onCatalogLink={followCatalogLink} />
      <CompanyExecutionSystem readyToReveal />
      <CatalogContent data-product-catalog>
      <CatalogHeader>
        <HeaderCopy>
          <CatalogKicker>
            <ShoppingBag size={17} strokeWidth={2.3} aria-hidden="true" />
            Product introduction
          </CatalogKicker>
          <h1 id="product-catalog-title">제품소개</h1>
          <p>필요한 제품군을 먼저 고르고, 각 제품의 구성과 구매 상담 방법을 확인하세요.</p>
        </HeaderCopy>
        <CatalogSignal>
          <span>PRODUCTS</span>
          <strong>{TOTAL_PRODUCT_COUNT}</strong>
          <small>기존 제품 16개 · CY 실구동 웹제품 8개</small>
        </CatalogSignal>
      </CatalogHeader>

      <CatalogSection id="product-catalog" aria-labelledby="product-catalog-section-title" tabIndex={-1} $accent={activeCategory.accent}>
        <SectionHeading>
          <div>
            <span>PRODUCT CATALOG</span>
            <h2 id="product-catalog-section-title">제품소개</h2>
            <p>웹·앱, 업무자동화, 생성형 콘텐츠, 크리에디터까지. 실제 구동 화면과 제품별 구성으로 비즈니스에 맞는 서비스를 확인하세요.</p>
          </div>
          <ActiveCategoryMark aria-hidden="true" $accent={activeCategory.accent}>
            <ActiveIcon size={24} strokeWidth={2.1} />
            <span>{activeCategory.eyebrow}</span>
          </ActiveCategoryMark>
        </SectionHeading>

        <CategoryTabs role="tablist" aria-label="제품군 선택" onKeyDown={handleCategoryKeyDown}>
          {PRODUCT_CATEGORIES.map((category, index) => {
            const CategoryIcon = CATEGORY_ICONS[category.id];
            const isActive = category.id === activeCategory.id;
            return (
              <CategoryTab
                id={`product-category-tab-${category.id}`}
                key={category.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`product-category-panel-${category.id}`}
                tabIndex={isActive ? 0 : -1}
                $active={isActive}
                $accent={category.accent}
                onClick={() => selectCategory(category)}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                <CategoryIcon size={21} strokeWidth={2.3} aria-hidden="true" />
                <strong>{category.label}</strong>
                <small>제품 {category.products.length}개</small>
              </CategoryTab>
            );
          })}
        </CategoryTabs>

        <ProductPanel
          id={`product-category-panel-${activeCategory.id}`}
          role="tabpanel"
          aria-labelledby={`product-category-tab-${activeCategory.id}`}
          aria-live="polite"
        >
          <PanelHeader>
            <div>
              <span>{activeCategory.eyebrow}</span>
              <h3>{activeCategory.label}</h3>
              <p>{activeCategory.description}</p>
            </div>
            <strong>{activeCategory.products.length} PRODUCTS</strong>
          </PanelHeader>

          {activeCategory.id === 'partner' ? (
            <PartnerOverview aria-labelledby="partner-overview-title">
              <PartnerOverviewIntro>
                <span>CREEDITOR · CREATE, CONNECT, SELL</span>
                <h4 id="partner-overview-title">직접 만든 콘텐츠도, 소개하는 상품도 판매로 연결</h4>
                <p>
                  생성형은 영상·이미지·웹툰을 판매하고, 광고형은 네이버스토어·쿠팡파트너스·AliExpress·TEMU 등의
                  상품을 콘텐츠로 소개합니다. 제작부터 상품 링크 연결과 반응 확인까지 한 흐름으로 구성합니다.
                </p>
                <PartnerOverviewActions>
                  <PartnerPrimaryLink href={productInquiryHref('partner-onboarding')}>
                    크리에디터 도입 상담하기
                    <ArrowRight size={17} strokeWidth={2.4} aria-hidden="true" />
                  </PartnerPrimaryLink>
                  <PartnerTextLink href="#partner-products">4개 판매·운영 패키지 보기</PartnerTextLink>
                </PartnerOverviewActions>
              </PartnerOverviewIntro>

              <PartnerValueGrid aria-label="크리에디터 핵심 가치">
                {PARTNER_VALUE_PROPOSITIONS.map((value) => {
                  const ValueIcon = value.icon;
                  return (
                    <PartnerValueCard key={value.label}>
                      <span><ValueIcon size={19} strokeWidth={2.2} aria-hidden="true" /></span>
                      <strong>{value.label}</strong>
                      <p>{value.description}</p>
                    </PartnerValueCard>
                  );
                })}
              </PartnerValueGrid>

              <PartnerJourney aria-labelledby="partner-journey-title">
                <PartnerJourneyHeading>
                  <span><Workflow size={18} strokeWidth={2.2} aria-hidden="true" /></span>
                  <div>
                    <strong id="partner-journey-title">콘텐츠 기획부터 판매와 개선까지</strong>
                    <p>생성형 콘텐츠 판매와 광고형 상품 소개에 맞춰 필요한 패키지를 선택합니다.</p>
                  </div>
                </PartnerJourneyHeading>
                <PartnerJourneySteps>
                  {PARTNER_JOURNEY.map(([number, title, description]) => (
                    <li key={number}>
                      <span>{number}</span>
                      <strong>{title}</strong>
                      <p>{description}</p>
                    </li>
                  ))}
                </PartnerJourneySteps>
              </PartnerJourney>
            </PartnerOverview>
          ) : null}

          <ProductAccordions
            id={activeCategory.id === 'partner' ? 'partner-products' : undefined}
            aria-label={`${activeCategory.label} 제품 목록`}
          >
            {activeCategory.products.map((product, index) => {
              const isOpen = product.id === openProductId;
              const productPanelId = `product-detail-${activeCategory.id}-${product.id}`;
              const primaryScreen = product.screens?.[0];
              return (
                <ProductAccordion key={product.id} $open={isOpen} $accent={activeCategory.accent} data-product-accordion data-product-id={product.id}>
                  <ProductTrigger
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={productPanelId}
                    onClick={() => setOpenProductId((current) => (current === product.id ? null : product.id))}
                  >
                    <ProductNumber>{String(index + 1).padStart(2, '0')}</ProductNumber>
                    <ProductTriggerCopy>
                      {product.isCy ? <CyLiveBadge>CY 실제 구동</CyLiveBadge> : null}
                      <strong>{product.name}</strong>
                      <span>{product.summary}</span>
                    </ProductTriggerCopy>
                    <ChevronBox $open={isOpen}>
                      <ChevronDown size={20} strokeWidth={2.4} aria-hidden="true" />
                    </ChevronBox>
                  </ProductTrigger>

                  <ProductDetail id={productPanelId} hidden={!isOpen} $live={Boolean(product.isCy)}>
                    {isOpen && <>
                      <ProductDescription $live={Boolean(product.isCy)}>
                        <div>
                          <h4>{product.name}</h4>
                          <p>{product.description}</p>
                        </div>
                        <div>
                          <h5>포함 범위</h5>
                          <ProductIncludes>
                            {product.includes.map((item) => (
                              <li key={item}>
                                <Check size={16} strokeWidth={2.6} aria-hidden="true" />
                                {item}
                              </li>
                            ))}
                          </ProductIncludes>
                          <PurchaseRow>
                            <div>
                              <span>구매 방식</span>
                              <strong>{product.delivery}</strong>
                            </div>
                            <PurchaseLink href={product.isCy ? getCyQuoteMailto(product) : productInquiryHref(product.id)} prefetch={false}>
                              {product.isCy ? 'CY 상품 견적 요청' : '구매 상담 신청'}
                              <ArrowRight size={17} strokeWidth={2.4} aria-hidden="true" />
                            </PurchaseLink>
                          </PurchaseRow>
                        </div>
                      </ProductDescription>
                      <ProductPhoto $contain={activeCategory.id === 'partner' || Boolean(product.isCy)} $live={Boolean(product.isCy)}>
                        <div className="product-photo-image">
                          <Image
                            src={primaryScreen?.src ?? product.image}
                            alt={primaryScreen?.alt ?? product.imageAlt}
                            fill
                            sizes={product.isCy ? '(max-width: 760px) 100vw, 1000px' : '(max-width: 760px) 100vw, 44vw'}
                            loading="lazy"
                          />
                        </div>
                        {product.isCy && (
                          <figcaption>
                            <strong>{primaryScreen?.title ?? 'CY 실제 구동 화면'}</strong>
                            {primaryScreen && <span>{primaryScreen.description}</span>}
                          </figcaption>
                        )}
                      </ProductPhoto>
                      {product.screens && product.screens.length > 1 && (
                        <ProductScreenGallery aria-label={`${product.name} 실제 구동 화면`}>
                          <GalleryHeading>
                            <strong>업무 단계별 실제 화면</strong>
                          </GalleryHeading>
                          <GalleryGrid>
                            {product.screens.slice(1).map((screen) => (
                              <ScreenCard key={screen.src}>
                                <ScreenImage>
                                  <Image src={screen.src} alt={screen.alt} fill sizes="(max-width: 760px) 100vw, 520px" loading="lazy" />
                                </ScreenImage>
                                <figcaption>
                                  <strong>{screen.title}</strong>
                                  <span>{screen.description}</span>
                                </figcaption>
                              </ScreenCard>
                            ))}
                          </GalleryGrid>
                        </ProductScreenGallery>
                      )}
                    </>}
                  </ProductDetail>
                </ProductAccordion>
              );
            })}
          </ProductAccordions>
        </ProductPanel>
      </CatalogSection>
      </CatalogContent>
    </CatalogPage>
  );
}

const CatalogPage = styled.main`
  flex: 1;
  width: 100%;
  min-width: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  background: #061126;
  color: #f4f7ef;
`;

const CatalogContent = styled.div`
  padding: clamp(20px, 3vw, 40px) clamp(16px, 3vw, 54px) 64px;
`;

const SkipLink = styled.a`
  position: fixed;
  z-index: 30;
  top: 12px;
  left: 50%;
  transform: translate(-50%, -180%);
  border-radius: 8px;
  background: #ffffff;
  padding: 10px 14px;
  color: #061126;
  font-size: 0.82rem;
  font-weight: 900;
  text-decoration: none;
  transition: transform 160ms ease;

  &:focus,
  &:focus-visible {
    transform: translate(-50%, 0);
    outline: 3px solid #7dd3fc;
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const CatalogHeader = styled.header`
  width: min(1240px, 100%);
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(230px, 300px);
  gap: 22px;
  align-items: stretch;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const HeaderCopy = styled.div`
  min-width: 0;
  border: 1px solid rgba(244, 247, 239, 0.13);
  border-radius: 10px;
  background: rgba(244, 247, 239, 0.045);
  padding: clamp(26px, 4vw, 48px);

  h1 {
    margin: 18px 0 0;
    color: #ffffff;
    font-size: clamp(2.25rem, 4.4vw, 4.25rem);
    font-weight: 950;
    line-height: 1;
    text-wrap: balance;
    word-break: keep-all;
  }

  p {
    max-width: 660px;
    margin: 16px 0 0;
    color: rgba(244, 247, 239, 0.7);
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.65;
    word-break: keep-all;
  }
`;

const CatalogKicker = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #7dd3fc;
  font-size: 0.75rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

const CatalogSignal = styled.aside`
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  border: 1px solid rgba(96, 165, 250, 0.45);
  border-radius: 10px;
  background: #0b2143;
  padding: 26px;

  > span {
    color: rgba(244, 247, 239, 0.62);
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.09em;
  }

  strong {
    margin-top: 6px;
    color: #ffffff;
    font-size: 4rem;
    font-weight: 950;
    line-height: 0.95;
  }

  small {
    margin-top: 12px;
    color: #7dd3fc;
    font-size: 0.82rem;
    font-weight: 800;
    line-height: 1.45;
    word-break: keep-all;
  }
`;

const CatalogSection = styled.section<{ $accent: string }>`
  --catalog-accent: ${(props) => props.$accent};
  width: min(1240px, 100%);
  margin: 22px auto 0;
  border: 1px solid rgba(244, 247, 239, 0.13);
  border-radius: 10px;
  background: #081a36;
  padding: clamp(20px, 3vw, 36px);
`;

const SectionHeading = styled.header`
  min-width: 0;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;

  > div {
    min-width: 0;
  }

  > div > span,
  h2 {
    color: #ffffff;
  }

  > div > span {
    color: var(--catalog-accent);
    font-size: 0.73rem;
    font-weight: 900;
    letter-spacing: 0.1em;
  }

  h2 {
    margin: 10px 0 0;
    font-size: clamp(1.7rem, 3vw, 2.6rem);
    font-weight: 950;
    line-height: 1.1;
    word-break: keep-all;
  }

  p {
    margin: 11px 0 0;
    color: rgba(244, 247, 239, 0.66);
    font-size: 0.92rem;
    font-weight: 700;
    line-height: 1.55;
    word-break: keep-all;
  }

  @media (max-width: 640px) {
    align-items: flex-start;
    flex-direction: column;
  }
`;

const ActiveCategoryMark = styled.div<{ $accent: string }>`
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 9px;
  border: 1px solid ${(props) => `${props.$accent}70`};
  border-radius: 8px;
  background: #07152c;
  padding: 10px 12px;
  color: ${(props) => props.$accent};

  span {
    color: rgba(244, 247, 239, 0.78);
    font-size: 0.68rem;
    font-weight: 900;
    letter-spacing: 0.06em;
  }
`;

const CategoryTabs = styled.div`
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: 26px;

  @media (max-width: 840px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const CategoryTab = styled.button<{ $active: boolean; $accent: string }>`
  min-width: 0;
  min-height: 156px;
  display: grid;
  align-content: start;
  justify-items: start;
  gap: 12px;
  border: 1px solid ${(props) => (props.$active ? `${props.$accent}99` : 'rgba(244, 247, 239, 0.12)')};
  border-radius: 9px;
  background: ${(props) => (props.$active ? '#0d274d' : '#07172e')};
  padding: 18px;
  color: #ffffff;
  font: inherit;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: border-color 180ms ease, background-color 180ms ease, transform 180ms ease;

  > span {
    color: ${(props) => (props.$active ? props.$accent : 'rgba(244, 247, 239, 0.45)')};
    font-size: 0.71rem;
    font-weight: 950;
  }

  > svg {
    color: ${(props) => props.$accent};
  }

  strong {
    color: #ffffff;
    font-size: 1rem;
    font-weight: 900;
    line-height: 1.25;
    word-break: keep-all;
  }

  small {
    margin-top: auto;
    color: rgba(244, 247, 239, 0.62);
    font-size: 0.75rem;
    font-weight: 750;
  }

  &:hover {
    border-color: ${(props) => `${props.$accent}cc`};
    transform: translateY(-2px);
  }

  &:focus-visible {
    outline: 2px solid #ffffff;
    outline-offset: 3px;
  }

  @media (max-width: 640px) {
    min-height: 138px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:hover {
      transform: none;
    }
  }
`;

const ProductPanel = styled.section`
  min-width: 0;
  margin-top: 14px;
  border: 1px solid color-mix(in srgb, var(--catalog-accent) 48%, rgba(244, 247, 239, 0.17));
  border-radius: 10px;
  background: #07172e;
  overflow: hidden;
`;

const PanelHeader = styled.header`
  min-width: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  border-bottom: 1px solid rgba(244, 247, 239, 0.1);
  padding: 24px;

  > div {
    min-width: 0;
  }

  span {
    color: var(--catalog-accent);
    font-size: 0.7rem;
    font-weight: 900;
    letter-spacing: 0.1em;
  }

  h3 {
    margin: 8px 0 0;
    color: #ffffff;
    font-size: clamp(1.35rem, 2.4vw, 2rem);
    font-weight: 950;
    line-height: 1.16;
    word-break: keep-all;
  }

  p {
    margin: 9px 0 0;
    color: rgba(244, 247, 239, 0.65);
    font-size: 0.89rem;
    font-weight: 700;
    line-height: 1.55;
    word-break: keep-all;
  }

  > strong {
    flex: 0 0 auto;
    color: var(--catalog-accent);
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.08em;
  }

  @media (max-width: 560px) {
    padding: 20px;

    > strong {
      display: none;
    }
  }
`;

const PartnerOverview = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 0.88fr) minmax(0, 1.12fr);
  gap: 24px;
  margin: 14px 12px 2px;
  border: 1px solid rgba(245, 199, 102, 0.34);
  border-radius: 12px;
  background:
    radial-gradient(circle at 8% 0%, rgba(245, 199, 102, 0.12), transparent 36%),
    linear-gradient(135deg, #0b2344 0%, #08182f 62%, #07152a 100%);
  padding: clamp(22px, 3vw, 34px);

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }

  @media (max-width: 560px) {
    gap: 20px;
    margin-inline: 8px;
    padding: 22px 18px;
  }
`;

const PartnerOverviewIntro = styled.div`
  min-width: 0;
  align-self: center;

  > span {
    color: var(--catalog-accent);
    font-size: 0.68rem;
    font-weight: 950;
    letter-spacing: 0.11em;
  }

  h4 {
    max-width: 520px;
    margin: 12px 0 0;
    color: #ffffff;
    font-size: clamp(1.5rem, 2.8vw, 2.35rem);
    font-weight: 950;
    line-height: 1.16;
    text-wrap: balance;
    word-break: keep-all;
  }

  > p {
    max-width: 580px;
    margin: 16px 0 0;
    color: rgba(244, 247, 239, 0.72);
    font-size: 0.92rem;
    font-weight: 700;
    line-height: 1.7;
    word-break: keep-all;
  }
`;

const PartnerOverviewActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 24px;

  @media (max-width: 480px) {
    align-items: stretch;
    flex-direction: column;
  }
`;

const PartnerPrimaryLink = styled(Link)`
  min-height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border: 1px solid var(--catalog-accent);
  border-radius: 8px;
  background: var(--catalog-accent);
  padding: 0 16px;
  color: #061126;
  font-size: 0.83rem;
  font-weight: 950;
  text-decoration: none;
  transition: background-color 180ms ease, color 180ms ease;

  &:hover,
  &:focus-visible {
    background: transparent;
    color: var(--catalog-accent);
  }

  &:focus-visible {
    outline: 2px solid #ffffff;
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const PartnerTextLink = styled.a`
  min-height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(244, 247, 239, 0.19);
  border-radius: 8px;
  background: rgba(244, 247, 239, 0.04);
  padding: 0 15px;
  color: rgba(244, 247, 239, 0.86);
  font-size: 0.8rem;
  font-weight: 850;
  text-decoration: none;

  &:hover,
  &:focus-visible {
    border-color: var(--catalog-accent);
    color: var(--catalog-accent);
  }

  &:focus-visible {
    outline: 2px solid #ffffff;
    outline-offset: 3px;
  }
`;

const PartnerValueGrid = styled.div`
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 620px) {
    grid-template-columns: 1fr;
  }
`;

const PartnerValueCard = styled.article`
  min-width: 0;
  min-height: 190px;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(244, 247, 239, 0.12);
  border-radius: 10px;
  background: rgba(4, 15, 32, 0.58);
  padding: 18px;

  > span {
    width: 38px;
    height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(245, 199, 102, 0.44);
    border-radius: 9px;
    background: rgba(245, 199, 102, 0.09);
    color: var(--catalog-accent);
  }

  strong {
    margin-top: 18px;
    color: #ffffff;
    font-size: 0.95rem;
    font-weight: 900;
    line-height: 1.3;
  }

  p {
    margin: 9px 0 0;
    color: rgba(244, 247, 239, 0.64);
    font-size: 0.78rem;
    font-weight: 700;
    line-height: 1.58;
    word-break: keep-all;
  }

  @media (max-width: 620px) {
    min-height: 0;
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr);
    column-gap: 12px;
    padding: 15px;

    > span {
      grid-row: 1 / span 2;
    }

    strong,
    p {
      margin-top: 0;
    }

    p {
      margin-top: 4px;
    }
  }
`;

const PartnerJourney = styled.div`
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: minmax(200px, 0.72fr) minmax(0, 2fr);
  gap: 22px;
  align-items: start;
  border-top: 1px solid rgba(244, 247, 239, 0.12);
  padding-top: 22px;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
    gap: 16px;
  }
`;

const PartnerJourneyHeading = styled.div`
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 11px;
  align-items: start;

  > span {
    width: 38px;
    height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--catalog-accent);
    color: #061126;
  }

  strong {
    color: #ffffff;
    font-size: 0.93rem;
    font-weight: 900;
    line-height: 1.35;
  }

  p {
    margin: 5px 0 0;
    color: rgba(244, 247, 239, 0.58);
    font-size: 0.75rem;
    font-weight: 700;
    line-height: 1.5;
    word-break: keep-all;
  }
`;

const PartnerJourneySteps = styled.ol`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    position: relative;
    min-width: 0;
    border-left: 1px solid rgba(245, 199, 102, 0.27);
    padding: 1px 14px 3px;
  }

  li > span {
    color: var(--catalog-accent);
    font-size: 0.66rem;
    font-weight: 950;
    letter-spacing: 0.08em;
  }

  li > strong {
    display: block;
    margin-top: 7px;
    color: #ffffff;
    font-size: 0.84rem;
    font-weight: 900;
  }

  li > p {
    margin: 7px 0 0;
    color: rgba(244, 247, 239, 0.6);
    font-size: 0.72rem;
    font-weight: 700;
    line-height: 1.5;
    word-break: keep-all;
  }

  @media (max-width: 640px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px 0;
  }
`;

const ProductAccordions = styled.div`
  display: grid;
  gap: 10px;
  padding: 12px;
`;

const ProductAccordion = styled.article<{ $open: boolean; $accent: string }>`
  min-width: 0;
  overflow: hidden;
  border: 1px solid ${(props) => (props.$open ? `${props.$accent}9c` : 'rgba(244, 247, 239, 0.11)')};
  border-radius: 9px;
  background: ${(props) => (props.$open ? '#0c2344' : '#081a33')};
`;

const ProductTrigger = styled.button`
  width: 100%;
  min-width: 0;
  min-height: 84px;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 36px;
  gap: 13px;
  align-items: center;
  border: 0;
  background: transparent;
  padding: 16px 18px;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;

  &:focus-visible {
    outline: 2px solid #ffffff;
    outline-offset: -4px;
  }
`;

const ProductNumber = styled.span`
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--catalog-accent) 58%, rgba(244, 247, 239, 0.2));
  border-radius: 8px;
  color: var(--catalog-accent);
  font-size: 0.74rem;
  font-weight: 950;
`;

const ProductTriggerCopy = styled.span`
  min-width: 0;
  display: grid;
  gap: 5px;

  strong {
    color: #ffffff;
    font-size: 1rem;
    font-weight: 900;
    line-height: 1.24;
    word-break: keep-all;
  }

  span {
    overflow: hidden;
    color: rgba(244, 247, 239, 0.66);
    font-size: 0.8rem;
    font-weight: 700;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 560px) {
    span {
      white-space: normal;
    }
  }
`;

const CyLiveBadge = styled.span`
  width: fit-content;
  overflow: visible !important;
  border: 1px solid color-mix(in srgb, var(--catalog-accent) 52%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--catalog-accent) 12%, transparent);
  padding: 4px 8px;
  color: var(--catalog-accent) !important;
  font-size: 0.62rem !important;
  font-weight: 950 !important;
  letter-spacing: 0.05em;
  line-height: 1 !important;
  white-space: nowrap !important;
`;

const ChevronBox = styled.span<{ $open: boolean }>`
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(244, 247, 239, 0.15);
  border-radius: 8px;
  color: rgba(244, 247, 239, 0.76);
  transform: rotate(${(props) => (props.$open ? '180deg' : '0deg')});
  transition: transform 180ms ease;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const ProductDetail = styled.div<{ $live: boolean }>`
  display: grid;
  grid-template-columns: ${(props) => (props.$live ? '1fr' : 'minmax(0, 1.14fr) minmax(0, 0.86fr)')};
  border-top: 1px solid rgba(244, 247, 239, 0.1);
  animation: product-detail-reveal 180ms ease both;

  @keyframes product-detail-reveal {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  &[hidden] {
    display: none;
  }

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const ProductPhoto = styled.figure<{ $contain: boolean; $live: boolean }>`
  display: flex;
  flex-direction: column;
  min-width: 0;
  margin: 0;
  border-left: ${({ $live }) => $live ? '0' : '1px solid rgba(244, 247, 239, 0.1)'};
  border-top: ${({ $live }) => $live ? '1px solid rgba(244, 247, 239, 0.1)' : '0'};
  background: radial-gradient(circle at 50% 44%, rgba(37, 99, 235, 0.18), transparent 56%), #061126;
  overflow: hidden;

  .product-photo-image {
    position: relative;
    flex: 1 0 auto;
    min-height: ${({ $live }) => $live ? 'clamp(320px, 44vw, 540px)' : '280px'};
  }

  img {
    object-fit: ${({ $contain }) => $contain ? 'contain' : 'cover'};
    padding: ${({ $contain }) => $contain ? 'clamp(8px, 1.5vw, 20px)' : '0'};
  }

  figcaption {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 6px 16px;
    padding: 12px clamp(18px, 2.5vw, 28px);
    border-top: 1px solid rgba(244, 247, 239, 0.1);
    color: #afc4dd;
    font-size: 0.82rem;
    line-height: 1.6;
    word-break: keep-all;
  }

  figcaption strong { color: #f4f7ef; font-size: 0.88rem; }

  @media (max-width: 760px) {
    border-left: 0;
    border-top: 1px solid rgba(244, 247, 239, 0.1);
    .product-photo-image { min-height: min(62vw, 300px); }
  }
`;

const ProductDescription = styled.div<{ $live: boolean }>`
  display: grid;
  align-content: start;
  gap: 20px;
  min-width: 0;
  padding: clamp(18px, 2.5vw, 30px);

  h4 {
    margin: 0;
    color: #ffffff;
    font-size: clamp(1.3rem, 2.1vw, 1.85rem);
    font-weight: 850;
    line-height: 1.25;
    word-break: keep-all;
  }

  p {
    margin: 10px 0 0;
    color: rgba(244, 247, 239, 0.76);
    font-size: 0.92rem;
    line-height: 1.65;
    word-break: keep-all;
  }

  h5 {
    margin: 0 0 8px;
    color: #f4f7ef;
    font-size: 0.85rem;
    font-weight: 750;
  }

  @media (min-width: 1024px) {
    grid-template-columns: ${({ $live }) => $live ? 'minmax(0, 1fr) minmax(0, 1.2fr)' : '1fr'};
    column-gap: 30px;
  }
`;

const ProductScreenGallery = styled.section`
  grid-column: 1 / -1;
  border-top: 1px solid rgba(244, 247, 239, 0.11);
  background: rgba(3, 11, 25, 0.42);
  padding: clamp(22px, 3vw, 34px);
`;

const GalleryHeading = styled.header`
  margin-bottom: 14px;
  color: #ffffff;
  font-size: clamp(1.1rem, 1.8vw, 1.4rem);
  line-height: 1.25;
  word-break: keep-all;
`;

const GalleryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: 14px;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const ScreenCard = styled.figure`
  min-width: 0;
  margin: 0;
  overflow: hidden;
  border: 1px solid rgba(125, 211, 252, 0.18);
  border-radius: 10px;
  background: #07162c;

  figcaption {
    display: grid;
    gap: 7px;
    border-top: 1px solid rgba(244, 247, 239, 0.09);
    padding: 16px;
  }

  figcaption strong {
    color: #ffffff;
    font-size: 0.94rem;
    font-weight: 900;
    line-height: 1.3;
    word-break: keep-all;
  }

  figcaption span {
    color: rgba(244, 247, 239, 0.67);
    font-size: 0.8rem;
    font-weight: 700;
    line-height: 1.55;
    word-break: keep-all;
  }
`;

const ScreenImage = styled.div`
  position: relative;
  aspect-ratio: 1280 / 653;
  background: #eef2f7;

  img {
    object-fit: contain;
  }
`;

const ProductIncludes = styled.ul`
  display: grid;
  gap: 9px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    min-width: 0;
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    gap: 8px;
    align-items: start;
    color: rgba(244, 247, 239, 0.8);
    font-size: 0.86rem;
    font-weight: 700;
    line-height: 1.45;
    word-break: keep-all;
  }

  svg {
    margin-top: 2px;
    color: var(--catalog-accent);
  }
`;

const PurchaseRow = styled.div`
  min-width: 0;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid rgba(244, 247, 239, 0.11);

  > div {
    min-width: 0;
    display: grid;
    gap: 6px;
  }

  > div > span {
    color: rgba(244, 247, 239, 0.52);
    font-size: 0.68rem;
    font-weight: 900;
  }

  > div > strong {
    color: rgba(244, 247, 239, 0.86);
    font-size: 0.8rem;
    font-weight: 800;
    line-height: 1.4;
    word-break: keep-all;
  }

  @media (max-width: 560px) {
    align-items: stretch;
    flex-direction: column;
  }
`;

const PurchaseLink = styled(Link)`
  min-height: 44px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid var(--catalog-accent);
  border-radius: 8px;
  background: var(--catalog-accent);
  padding: 0 14px;
  color: #061126;
  font-size: 0.82rem;
  font-weight: 950;
  text-decoration: none;
  touch-action: manipulation;
  transition: background-color 180ms ease, color 180ms ease;

  &:hover,
  &:focus-visible {
    background: transparent;
    color: var(--catalog-accent);
    outline: none;
  }

  &:focus-visible {
    outline: 2px solid #ffffff;
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;
