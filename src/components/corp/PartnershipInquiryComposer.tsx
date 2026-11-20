'use client';

import { ArrowRight, Check, Clipboard, Clock3, FileLock2, Mail, MessageSquareText, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import type { PartnershipChapterId } from './PartnershipHubExperience';

const SUPPORT_EMAIL = 'support@propig.com';

const CHAPTER_LABELS: Record<PartnershipChapterId, string> = {
  business: '사업 제휴',
  advertising: '광고 제휴',
  investment: '투자 제휴',
  sponsorship: '후원 제휴',
};

const PRODUCT_CONTEXTS: Record<string, string> = {
  'web-product-starter': '웹제품 스타터',
  'web-operations-dashboard': '운영 대시보드',
  'web-customer-portal': '고객 포털',
  'web-ai-assistant': 'AI 업무 도우미',
  'cy-field-report': 'CY 모바일 현장일보 웹앱',
  'cy-workforce-database': 'CY 인력·자격·배치 통합DB',
  'cy-dashboard-starter': 'CY 운영 대시보드 스타터',
  'cy-integrated-suite': 'CY 통합 운영 ERP',
  'automation-document': '문서 처리 자동화',
  'automation-approval': '승인·알림 자동화',
  'automation-data-sync': '데이터 연결 자동화',
  'automation-ai-workflow': 'AI 워크플로',
  'cy-payroll-settlement': 'CY 근무·급여·수당 정산',
  'cy-tax-invoice': 'CY 세금계산서·미수금 관리',
  'cy-monthly-closing': 'CY 증빙 누락·월마감 자동화',
  'cy-progress-board': 'CY 공정·이슈·사진 자동화 보드',
  'media-product-film': '제품 소개 영상',
  'media-short-form': '숏폼 콘텐츠 패키지',
  'media-education': '교육·온보딩 영상',
  'media-brand-campaign': '브랜드 캠페인 영상',
  'partner-onboarding': '파트너 온보딩 키트',
  'partner-portal': '파트너 포털',
  'partner-co-selling': '공동 영업 운영',
  'partner-performance': '파트너 성과 대시보드',
};

interface InquiryFields {
  organization: string;
  problem: string;
  outcome: string;
  timingBudget: string;
  resources: string;
  contact: string;
}

const EMPTY_FIELDS: InquiryFields = {
  organization: '',
  problem: '',
  outcome: '',
  timingBudget: '',
  resources: '',
  contact: '',
};

function buildInquiryBody(type: PartnershipChapterId, fields: InquiryFields, productName: string): string {
  return [
    '안녕하세요. PRO PIG 제휴 페이지를 보고 연락드립니다.',
    '',
    `관심 있는 제휴: ${CHAPTER_LABELS[type]}`,
    ...(productName ? [`관심 제품·서비스: ${productName}`] : []),
    '',
    `1. 저희는 누구인가요?\n${fields.organization || '(작성 예정)'}`,
    `2. 함께 해결하고 싶은 문제는 무엇인가요?\n${fields.problem || '(작성 예정)'}`,
    `3. 기대하는 결과는 무엇인가요?\n${fields.outcome || '(작성 예정)'}`,
    `4. 희망 기간과 예산 범위는 어떻게 되나요?\n${fields.timingBudget || '(작성 예정)'}`,
    `5. 저희가 제공할 수 있는 자원은 무엇인가요?\n${fields.resources || '(작성 예정)'}`,
    '',
    `담당자 이름 / 연락처:\n${fields.contact || '(작성 예정)'}`,
  ].join('\n');
}

export function PartnershipInquiryComposer({ initialChapter }: { initialChapter: PartnershipChapterId }) {
  const [type, setType] = useState<PartnershipChapterId>(initialChapter);
  const [fields, setFields] = useState<InquiryFields>(EMPTY_FIELDS);
  const [productId, setProductId] = useState('');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    const requestedProduct = new URLSearchParams(window.location.search).get('product') ?? '';
    if (requestedProduct && PRODUCT_CONTEXTS[requestedProduct]) setProductId(requestedProduct);
  }, []);

  useEffect(() => {
    setType(initialChapter);
  }, [initialChapter]);

  const productName = productId ? PRODUCT_CONTEXTS[productId] ?? '' : '';
  const body = useMemo(() => buildInquiryBody(type, fields, productName), [fields, productName, type]);
  const subject = `[PRO PIG 제휴] ${productName || CHAPTER_LABELS[type]} 문의`;
  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const readinessFields = [fields.organization, fields.problem, fields.outcome, fields.timingBudget, fields.contact];
  const readyCount = readinessFields.filter((value) => value.trim().length > 0).length;

  const updateField = (key: keyof InquiryFields, value: string) => {
    setFields((current) => ({ ...current, [key]: value.slice(0, key === 'contact' ? 180 : 700) }));
    setCopyState('idle');
  };

  const copyBrief = async () => {
    try {
      await navigator.clipboard.writeText(`${subject}\n\n${body}`);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <Composer id="partnership-inquiry" aria-labelledby="partnership-inquiry-title" data-inquiry-ready="true">
      <ComposerIntro>
        <Eyebrow><MessageSquareText size={17} aria-hidden="true" />START WITH FIVE LINES</Eyebrow>
        <h2 id="partnership-inquiry-title">제안서가 없어도,<br /><em>다섯 줄이면 대화를 시작할 수 있어요.</em></h2>
        <p>아는 만큼만 적어도 됩니다. 입력 내용은 서버에 저장하거나 전송하지 않고, 마지막에 메일 앱을 열 때만 본문으로 넘깁니다.</p>
        <TrustList aria-label="문의 처리 원칙">
          <li><Clock3 size={17} aria-hidden="true" /><span><strong>접수 확인부터</strong> 검토가 길어지면 다음 안내 시점을 알려드립니다.</span></li>
          <li><FileLock2 size={17} aria-hidden="true" /><span><strong>민감 자료는 나중에</strong> 첫 연락에는 공개 가능한 최소 정보만 적어주세요.</span></li>
          <li><Sparkles size={17} aria-hidden="true" /><span><strong>작게 검증</strong> 가능하면 4–8주 파일럿과 종료 기준부터 맞춥니다.</span></li>
        </TrustList>
      </ComposerIntro>

      <FormCard>
        <CardHeader>
          <div>
            <span>제휴 브리프</span>
            <strong>{readyCount} / 5 준비</strong>
          </div>
          <Progress aria-label={`필수 질문 ${readyCount}개 작성됨`}><i style={{ width: `${(readyCount / 5) * 100}%` }} /></Progress>
        </CardHeader>

        {productName ? (
          <ProductContext role="status">
            <div><span>제품소개에서 이어온 상담</span><strong>{productName}</strong></div>
            <button type="button" onClick={() => setProductId('')} aria-label={`${productName} 상담 맥락 지우기`}><X size={17} aria-hidden="true" /></button>
          </ProductContext>
        ) : null}

        <Field>
          <span>관심 있는 제휴</span>
          <TypeGrid>
            {(Object.keys(CHAPTER_LABELS) as PartnershipChapterId[]).map((chapterId) => (
              <button key={chapterId} type="button" aria-pressed={type === chapterId} onClick={() => setType(chapterId)}>
                {type === chapterId ? <Check size={16} aria-hidden="true" /> : null}{CHAPTER_LABELS[chapterId]}
              </button>
            ))}
          </TypeGrid>
        </Field>

        <FieldGrid>
          <Field>
            <label htmlFor="partnership-organization">1. 어떤 팀인가요?</label>
            <input id="partnership-organization" value={fields.organization} onChange={(event) => updateField('organization', event.target.value)} placeholder="회사·팀 이름과 하는 일" />
          </Field>
          <Field>
            <label htmlFor="partnership-contact">연락받을 분</label>
            <input id="partnership-contact" value={fields.contact} onChange={(event) => updateField('contact', event.target.value)} placeholder="이름, 이메일 또는 전화번호" autoComplete="name" />
          </Field>
        </FieldGrid>

        <Field>
          <label htmlFor="partnership-problem">2. 함께 풀고 싶은 문제는 무엇인가요?</label>
          <textarea id="partnership-problem" value={fields.problem} onChange={(event) => updateField('problem', event.target.value)} placeholder="지금 반복되는 불편이나 놓치고 있는 기회를 적어주세요." rows={3} />
        </Field>

        <FieldGrid>
          <Field>
            <label htmlFor="partnership-outcome">3. 기대하는 변화</label>
            <textarea id="partnership-outcome" value={fields.outcome} onChange={(event) => updateField('outcome', event.target.value)} placeholder="함께한 뒤 무엇이 달라지면 좋을까요?" rows={3} />
          </Field>
          <Field>
            <label htmlFor="partnership-timing">4. 기간·예산 범위</label>
            <textarea id="partnership-timing" value={fields.timingBudget} onChange={(event) => updateField('timingBudget', event.target.value)} placeholder="미정이어도 괜찮습니다. 희망 시점만 적어주세요." rows={3} />
          </Field>
        </FieldGrid>

        <Field>
          <label htmlFor="partnership-resources">5. 함께 나눌 수 있는 자원 <small>선택</small></label>
          <input id="partnership-resources" value={fields.resources} onChange={(event) => updateField('resources', event.target.value)} placeholder="고객 접점, 기술, 콘텐츠, 운영 경험 등" />
        </Field>

        <Actions>
          <a href={mailto}><Mail size={18} aria-hidden="true" /><span><small>{readyCount < 5 ? '빈 항목은 메일에서 이어서 작성할 수 있어요' : '브리프가 준비됐어요'}</small><strong>작성한 내용으로 메일 열기</strong></span><ArrowRight size={18} aria-hidden="true" /></a>
          <button type="button" onClick={copyBrief}><Clipboard size={17} aria-hidden="true" />{copyState === 'copied' ? '복사했어요' : '브리프 복사'}</button>
        </Actions>
        <CopyStatus role="status" aria-live="polite">{copyState === 'failed' ? '자동 복사가 막혔어요. 메일 열기를 사용해 주세요.' : copyState === 'copied' ? '제목과 문의 내용을 클립보드에 복사했어요.' : ''}</CopyStatus>
      </FormCard>
    </Composer>
  );
}

const Composer = styled.section`
  scroll-margin-top: 86px;
  display: grid;
  grid-template-columns: minmax(260px, .72fr) minmax(0, 1.28fr);
  gap: clamp(28px, 5vw, 72px);
  padding: clamp(34px, 5vw, 72px);
  border: 1px solid rgba(94, 234, 212, .28);
  border-radius: 34px;
  background: radial-gradient(circle at 10% 0%, rgba(94, 234, 212, .11), transparent 38%), #101412;
  color: #f3f0e8;

  @media (max-width: 900px) { grid-template-columns: 1fr; }
  @media (max-width: 640px) { padding: 28px 18px; border-radius: 24px; }
`;

const ComposerIntro = styled.div`
  h2 { margin: 20px 0 18px; font-size: clamp(34px, 4.2vw, 61px); line-height: 1.05; letter-spacing: -.055em; word-break: keep-all; }
  h2 em { display: block; margin-top: 9px; color: #5eead4; font-style: normal; font-size: .7em; line-height: 1.25; }
  > p { margin: 0; color: rgba(243, 240, 232, .7); font-size: 16px; line-height: 1.8; word-break: keep-all; }
`;

const Eyebrow = styled.span`
  display: inline-flex; align-items: center; gap: 8px; color: #5eead4; font-size: 12px; font-weight: 900; letter-spacing: .12em;
`;

const TrustList = styled.ul`
  display: grid; gap: 12px; margin: 28px 0 0; padding: 0; list-style: none;
  li { display: flex; gap: 11px; padding: 14px; border: 1px solid rgba(255,255,255,.1); border-radius: 16px; background: rgba(255,255,255,.025); color: rgba(243,240,232,.7); }
  svg { flex: 0 0 auto; margin-top: 2px; color: #5eead4; }
  span { font-size: 13px; line-height: 1.65; }
  strong { display: block; color: #f3f0e8; font-size: 14px; }
`;

const FormCard = styled.div`
  min-width: 0; padding: clamp(20px, 3vw, 34px); border: 1px solid rgba(255,255,255,.14); border-radius: 24px; background: #0a0e0c;
`;

const CardHeader = styled.div`
  display: grid; gap: 13px; margin-bottom: 22px;
  > div { display: flex; justify-content: space-between; gap: 16px; align-items: baseline; }
  span { color: rgba(243,240,232,.58); font-size: 12px; font-weight: 850; letter-spacing: .1em; text-transform: uppercase; }
  strong { color: #5eead4; font-size: 14px; }
`;

const Progress = styled.div`
  height: 5px; overflow: hidden; border-radius: 999px; background: rgba(255,255,255,.1);
  i { display: block; height: 100%; border-radius: inherit; background: #5eead4; transition: width 220ms ease; }
`;

const ProductContext = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 20px; padding: 14px 16px; border: 1px solid rgba(255,207,90,.4); border-radius: 16px; background: rgba(255,207,90,.08);
  div { min-width: 0; display: grid; gap: 3px; }
  span { color: rgba(243,240,232,.58); font-size: 11px; font-weight: 800; }
  strong { overflow: hidden; text-overflow: ellipsis; color: #ffcf5a; font-size: 14px; white-space: nowrap; }
  button { flex: 0 0 auto; width: 36px; height: 36px; display: grid; place-items: center; border: 0; border-radius: 50%; color: #f3f0e8; background: rgba(255,255,255,.08); cursor: pointer; }
  button:focus-visible { outline: 2px solid #ffcf5a; outline-offset: 3px; }
`;

const FieldGrid = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 15px;
  @media (max-width: 620px) { grid-template-columns: 1fr; }
`;

const Field = styled.div`
  display: grid; gap: 9px; margin-bottom: 17px;
  > span, label { color: #f3f0e8; font-size: 13px; font-weight: 800; }
  label small { margin-left: 6px; color: rgba(243,240,232,.45); font-weight: 650; }
  input, textarea { width: 100%; min-width: 0; border: 1px solid rgba(255,255,255,.14); border-radius: 13px; color: #fffdf7; background: #121816; padding: 13px 14px; font: inherit; font-size: 14px; line-height: 1.55; resize: vertical; }
  input { min-height: 48px; }
  textarea { min-height: 92px; }
  input::placeholder, textarea::placeholder { color: rgba(243,240,232,.35); }
  input:focus, textarea:focus { outline: none; border-color: #5eead4; box-shadow: 0 0 0 3px rgba(94,234,212,.11); }
`;

const TypeGrid = styled.div`
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px;
  button { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 8px; border: 1px solid rgba(255,255,255,.12); border-radius: 11px; color: rgba(243,240,232,.66); background: #121816; font: inherit; font-size: 12px; font-weight: 780; cursor: pointer; }
  button[aria-pressed='true'] { border-color: #5eead4; color: #07100d; background: #5eead4; }
  button:focus-visible { outline: 2px solid #f3f0e8; outline-offset: 3px; }
  @media (max-width: 520px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;

const Actions = styled.div`
  display: flex; align-items: stretch; gap: 10px; margin-top: 7px;
  a { flex: 1; min-height: 58px; display: flex; align-items: center; justify-content: center; gap: 11px; padding: 10px 17px; border-radius: 15px; color: #07100d; background: #5eead4; text-decoration: none; }
  a span { min-width: 0; display: grid; gap: 2px; }
  a small { font-size: 10px; font-weight: 720; opacity: .72; }
  a strong { font-size: 14px; }
  a > svg:last-child { margin-left: auto; }
  > button { min-height: 58px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 0 17px; border: 1px solid rgba(255,255,255,.16); border-radius: 15px; color: #f3f0e8; background: #151b18; font: inherit; font-size: 13px; font-weight: 800; cursor: pointer; }
  a:focus-visible, button:focus-visible { outline: 2px solid #f3f0e8; outline-offset: 3px; }
  @media (max-width: 560px) { flex-direction: column; a, > button { width: 100%; } }
`;

const CopyStatus = styled.p`
  min-height: 20px; margin: 8px 2px 0; color: rgba(243,240,232,.6); font-size: 12px; line-height: 1.5;
`;
