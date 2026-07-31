'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  HeartHandshake,
  Info,
  PartyPopper,
  Send,
  UserRoundPlus,
  type LucideIcon,
} from 'lucide-react';
import styled from 'styled-components';
import type { CorpPageDefinition } from '@/constants/corpPages';

interface CareersApplyExperienceProps {
  page: CorpPageDefinition;
  selectedPositionId?: string;
}

type PositionId = 'staff' | 'friends' | 'girlfriend' | 'other';
type FormField = 'applicantName' | 'email' | 'availability' | 'introduction' | 'portfolioUrl' | 'agreement';
type FormErrors = Partial<Record<FormField, string>>;

interface ApplicationPosition {
  id: PositionId;
  eyebrow: string;
  title: string;
  role: string;
  description: string;
  promptLabel: string;
  promptPlaceholder: string;
  accent: string;
  icon: LucideIcon;
}

const APPLICATION_POSITIONS: ApplicationPosition[] = [
  {
    id: 'staff',
    eyebrow: '01 · Staff',
    title: '직원구함',
    role: '실행력 있는 인간 멀티툴',
    description: '아이디어를 결과물로 바꾸고, 팀의 다음 병목까지 함께 살피는 동료를 찾습니다.',
    promptLabel: '경험 또는 작업물 소개',
    promptPlaceholder: '가장 잘 해결했던 문제와 본인의 역할을 적어주세요…',
    accent: '#60a5fa',
    icon: BriefcaseBusiness,
  },
  {
    id: 'friends',
    eyebrow: '02 · Friends',
    title: '친구구함',
    role: '퇴근 후에도 어색하지 않은 장기 동료',
    description: '안부와 취향, 새로운 경험을 편하게 나누며 오래 갈 수 있는 친구를 기다립니다.',
    promptLabel: '관심사와 함께 나누고 싶은 일',
    promptPlaceholder: '최근 가장 즐거웠던 일이나 함께 해보고 싶은 활동을 적어주세요…',
    accent: '#5eead4',
    icon: UserRoundPlus,
  },
  {
    id: 'girlfriend',
    eyebrow: '03 · Love',
    title: '여친구함',
    role: '서로의 편이 되어 줄 장기 파트너',
    description: '솔직한 대화와 상호 존중을 바탕으로 일상과 미래를 천천히 나눌 파트너를 찾습니다.',
    promptLabel: '나를 소개하는 말',
    promptPlaceholder: '좋아하는 일, 중요하게 생각하는 관계의 기준을 편하게 적어주세요…',
    accent: '#fb7185',
    icon: HeartHandshake,
  },
  {
    id: 'other',
    eyebrow: '04 · Other',
    title: '기타구함',
    role: '정의되지 않은 빈칸을 채울 특별 인재',
    description: '운동메이트, 여행동행, 밥친구처럼 아직 이름 붙이기 전인 역할도 제안할 수 있습니다.',
    promptLabel: '지원하고 싶은 역할',
    promptPlaceholder: '왜 이 역할이 필요한지, 무엇을 함께 해보고 싶은지 적어주세요…',
    accent: '#f5c766',
    icon: PartyPopper,
  },
];

const FORM_FIELD_IDS: Record<FormField, string> = {
  applicantName: 'career-apply-name',
  email: 'career-apply-email',
  availability: 'career-apply-availability',
  introduction: 'career-apply-introduction',
  portfolioUrl: 'career-apply-portfolio-url',
  agreement: 'career-apply-agreement',
};

function findPosition(positionId: string | null): ApplicationPosition {
  return APPLICATION_POSITIONS.find((position) => position.id === positionId) ?? APPLICATION_POSITIONS[0];
}

export function CareersApplyExperience({ page, selectedPositionId }: CareersApplyExperienceProps) {
  const router = useRouter();
  const selectedPosition = findPosition(selectedPositionId ?? null);
  const SelectedIcon = selectedPosition.icon;
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [confirmationName, setConfirmationName] = useState<string | null>(null);

  const selectPosition = (positionId: PositionId) => {
    router.replace(`/corp/careers/apply?position=${positionId}`, { scroll: false });
    setConfirmationName(null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const applicantName = String(formData.get('applicantName') ?? '').trim();
    const email = String(formData.get('email') ?? '').trim();
    const availability = String(formData.get('availability') ?? '').trim();
    const introduction = String(formData.get('introduction') ?? '').trim();
    const portfolioUrl = String(formData.get('portfolioUrl') ?? '').trim();
    const agreement = formData.get('agreement') === 'on';
    const nextErrors: FormErrors = {};

    if (!applicantName) nextErrors.applicantName = '이름을 입력해 주세요.';
    if (!email) {
      nextErrors.email = '이메일을 입력해 주세요.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      nextErrors.email = '연락 가능한 이메일 형식을 확인해 주세요.';
    }
    if (!availability) nextErrors.availability = '연락 가능 시점을 선택해 주세요.';
    if (introduction.length < 20) nextErrors.introduction = '20자 이상으로 지원 내용을 적어주세요.';
    if (portfolioUrl) {
      try {
        new URL(portfolioUrl);
      } catch {
        nextErrors.portfolioUrl = 'https://로 시작하는 링크인지 확인해 주세요.';
      }
    }
    if (!agreement) nextErrors.agreement = '안내 사항을 확인한 뒤 동의해 주세요.';

    setFormErrors(nextErrors);

    const firstError = (Object.keys(FORM_FIELD_IDS) as FormField[]).find((field) => nextErrors[field]);
    if (firstError) {
      document.getElementById(FORM_FIELD_IDS[firstError])?.focus();
      setConfirmationName(null);
      return;
    }

    setConfirmationName(applicantName);
  };

  return (
    <Page id="content-area" aria-labelledby="careers-apply-title" $accent={selectedPosition.accent}>
      <PageInner>
        <Hero>
          <HeroCopy>
            <Kicker>
              <ClipboardCheck size={16} strokeWidth={2.4} aria-hidden="true" />
              PRO PIG Application Desk
            </Kicker>
            <h1 id="careers-apply-title">{page.title}</h1>
            <p>채용공고에서 확인한 포지션을 선택하고, 필요한 내용을 한 번에 정리하세요. 선택한 포지션에 맞춰 지원 질문이 바뀝니다.</p>
            <HeroLink href="/corp/careers/jobs">
              <ArrowLeft size={16} strokeWidth={2.4} aria-hidden="true" />
              채용공고 다시 보기
            </HeroLink>
          </HeroCopy>

          <SelectedPanel $accent={selectedPosition.accent} aria-label="선택한 지원 포지션">
            <SelectedIcon size={27} strokeWidth={2.15} aria-hidden="true" />
            <span>선택된 포지션</span>
            <strong>{selectedPosition.title}</strong>
            <p>{selectedPosition.role}</p>
          </SelectedPanel>
        </Hero>

        <Steps aria-label="지원 절차">
          <li>
            <b>01</b>
            <span>포지션 선택</span>
            <small>공고와 맞는 역할을 고릅니다.</small>
          </li>
          <li>
            <b>02</b>
            <span>지원 내용 작성</span>
            <small>연락처와 소개를 빠짐없이 확인합니다.</small>
          </li>
          <li>
            <b>03</b>
            <span>내용 점검</span>
            <small>입력 오류를 먼저 확인합니다.</small>
          </li>
        </Steps>

        <ContentGrid>
          <ApplicationForm noValidate onSubmit={handleSubmit} aria-describedby="career-apply-form-note">
            <FormHeading>
              <span>Application Form</span>
              <h2>지원 포지션과 내용을 작성해 주세요</h2>
              <p id="career-apply-form-note">별표(*) 항목은 필수입니다. 오류가 있으면 해당 입력란으로 바로 이동합니다.</p>
            </FormHeading>

            <PositionFieldset>
              <legend>지원 포지션 *</legend>
              <PositionGrid>
                {APPLICATION_POSITIONS.map((position) => {
                  const PositionIcon = position.icon;
                  const isSelected = position.id === selectedPosition.id;

                  return (
                    <PositionOption key={position.id} $accent={position.accent} $selected={isSelected}>
                      <input
                        type="radio"
                        name="position"
                        value={position.id}
                        checked={isSelected}
                        onChange={() => selectPosition(position.id)}
                      />
                      <span>
                        <PositionIcon size={18} strokeWidth={2.3} aria-hidden="true" />
                        <b>{position.title}</b>
                        <small>{position.description}</small>
                      </span>
                    </PositionOption>
                  );
                })}
              </PositionGrid>
            </PositionFieldset>

            <FormGrid>
              <Field>
                <label htmlFor={FORM_FIELD_IDS.applicantName}>이름 *</label>
                <Input
                  id={FORM_FIELD_IDS.applicantName}
                  name="applicantName"
                  type="text"
                  autoComplete="name"
                  aria-invalid={Boolean(formErrors.applicantName)}
                  aria-describedby={formErrors.applicantName ? `${FORM_FIELD_IDS.applicantName}-error` : undefined}
                  placeholder="이름을 입력해 주세요…"
                />
                {formErrors.applicantName ? <FieldError id={`${FORM_FIELD_IDS.applicantName}-error`}>{formErrors.applicantName}</FieldError> : null}
              </Field>

              <Field>
                <label htmlFor={FORM_FIELD_IDS.email}>이메일 *</label>
                <Input
                  id={FORM_FIELD_IDS.email}
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  spellCheck={false}
                  aria-invalid={Boolean(formErrors.email)}
                  aria-describedby={formErrors.email ? `${FORM_FIELD_IDS.email}-error` : undefined}
                  placeholder="name@example.com…"
                />
                {formErrors.email ? <FieldError id={`${FORM_FIELD_IDS.email}-error`}>{formErrors.email}</FieldError> : null}
              </Field>

              <Field>
                <label htmlFor={FORM_FIELD_IDS.availability}>연락 가능 시점 *</label>
                <Select
                  id={FORM_FIELD_IDS.availability}
                  name="availability"
                  defaultValue=""
                  aria-invalid={Boolean(formErrors.availability)}
                  aria-describedby={formErrors.availability ? `${FORM_FIELD_IDS.availability}-error` : undefined}
                >
                  <option value="" disabled>선택해 주세요…</option>
                  <option value="anytime">상시 연락 가능</option>
                  <option value="weekday-evening">평일 저녁 위주</option>
                  <option value="weekend">주말 위주</option>
                  <option value="consultation">일정 협의 필요</option>
                </Select>
                {formErrors.availability ? <FieldError id={`${FORM_FIELD_IDS.availability}-error`}>{formErrors.availability}</FieldError> : null}
              </Field>

              <Field>
                <label htmlFor={FORM_FIELD_IDS.portfolioUrl}>관련 링크 (선택)</label>
                <Input
                  id={FORM_FIELD_IDS.portfolioUrl}
                  name="portfolioUrl"
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  spellCheck={false}
                  aria-invalid={Boolean(formErrors.portfolioUrl)}
                  aria-describedby={formErrors.portfolioUrl ? `${FORM_FIELD_IDS.portfolioUrl}-error` : undefined}
                  placeholder="https://portfolio.example.com…"
                />
                {formErrors.portfolioUrl ? <FieldError id={`${FORM_FIELD_IDS.portfolioUrl}-error`}>{formErrors.portfolioUrl}</FieldError> : null}
              </Field>
            </FormGrid>

            <Field>
              <label htmlFor={FORM_FIELD_IDS.introduction}>{selectedPosition.promptLabel} *</label>
              <TextArea
                id={FORM_FIELD_IDS.introduction}
                name="introduction"
                rows={7}
                aria-invalid={Boolean(formErrors.introduction)}
                aria-describedby={formErrors.introduction ? `${FORM_FIELD_IDS.introduction}-error` : `${FORM_FIELD_IDS.introduction}-hint`}
                placeholder={selectedPosition.promptPlaceholder}
              />
              <FieldHint id={`${FORM_FIELD_IDS.introduction}-hint`}>20자 이상으로, 본인을 가장 잘 보여 주는 사례를 적어주세요.</FieldHint>
              {formErrors.introduction ? <FieldError id={`${FORM_FIELD_IDS.introduction}-error`}>{formErrors.introduction}</FieldError> : null}
            </Field>

            <AgreementRow $invalid={Boolean(formErrors.agreement)}>
              <input id={FORM_FIELD_IDS.agreement} name="agreement" type="checkbox" aria-describedby={formErrors.agreement ? `${FORM_FIELD_IDS.agreement}-error` : undefined} />
              <label htmlFor={FORM_FIELD_IDS.agreement}>입력한 연락처와 소개 내용이 지원 검토에 필요함을 확인했습니다. *</label>
            </AgreementRow>
            {formErrors.agreement ? <FieldError id={`${FORM_FIELD_IDS.agreement}-error`}>{formErrors.agreement}</FieldError> : null}

            <FormFooter>
              <SubmitButton type="submit" $accent={selectedPosition.accent}>
                지원 내용 확인
                <Send size={16} strokeWidth={2.5} aria-hidden="true" />
              </SubmitButton>
              <PrivacyNote>
                <Info size={16} strokeWidth={2.3} aria-hidden="true" />
                현재 이 화면은 입력 오류만 확인하며, 작성한 개인정보를 저장하거나 외부로 전송하지 않습니다.
              </PrivacyNote>
            </FormFooter>

            {confirmationName ? (
              <Confirmation role="status" aria-live="polite" $accent={selectedPosition.accent}>
                <CheckCircle2 size={19} strokeWidth={2.5} aria-hidden="true" />
                <span><strong>{confirmationName}님</strong>의 {selectedPosition.title} 지원 내용을 확인했습니다. 전송 전에는 입력 내용을 한 번 더 검토해 주세요.</span>
              </Confirmation>
            ) : null}
          </ApplicationForm>

          <Aside>
            <AsideSection>
              <span>Selected role</span>
              <h2>{selectedPosition.title}</h2>
              <p>{selectedPosition.description}</p>
              <RoleLink href="/corp/careers/jobs">
                공고 세부 내용 확인
                <ArrowRight size={16} strokeWidth={2.4} aria-hidden="true" />
              </RoleLink>
            </AsideSection>

            <AsideSection>
              <span>Before you apply</span>
              <h2>지원 전 확인</h2>
              <Checklist>
                <li><CheckCircle2 size={16} strokeWidth={2.4} aria-hidden="true" />선택한 포지션의 역할과 전형 흐름을 확인합니다.</li>
                <li><CheckCircle2 size={16} strokeWidth={2.4} aria-hidden="true" />연락 가능한 이메일과 일정을 정확히 적습니다.</li>
                <li><CheckCircle2 size={16} strokeWidth={2.4} aria-hidden="true" />상대방의 경계와 안전을 존중하는 방식으로 지원합니다.</li>
              </Checklist>
            </AsideSection>

            <AsideSection $muted>
              <FileText size={20} strokeWidth={2.25} aria-hidden="true" />
              <h2>접수 채널 안내</h2>
              <p>온라인 접수 전송 채널은 아직 연결하지 않았습니다. 운영 채널이 정해지면 이 양식을 전송 단계와 연결할 수 있습니다.</p>
            </AsideSection>
          </Aside>
        </ContentGrid>
      </PageInner>
    </Page>
  );
}

export function CareersApplyQueryExperience({ page }: Pick<CareersApplyExperienceProps, 'page'>) {
  const searchParams = useSearchParams();

  return <CareersApplyExperience page={page} selectedPositionId={searchParams?.get('position') ?? undefined} />;
}

const Page = styled.main<{ $accent: string }>`
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: clamp(16px, 3vw, 32px);
  color: #f4f7ef;
  color-scheme: dark;
  background:
    radial-gradient(circle at 12% 4%, ${(props) => `${props.$accent}1d`}, transparent 28%),
    radial-gradient(circle at 88% 10%, rgba(96, 165, 250, 0.12), transparent 25%),
    linear-gradient(135deg, #08100e 0%, #111815 52%, #080a09 100%);
`;

const PageInner = styled.div`
  width: min(100%, 1180px);
  margin: 0 auto;
  display: grid;
  gap: 18px;
  padding-bottom: 36px;
`;

const Hero = styled.section`
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(250px, 330px);
  gap: 18px;

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
  }
`;

const HeroCopy = styled.div`
  min-width: 0;
  padding: clamp(24px, 4vw, 42px);
  border: 1px solid rgba(244, 247, 239, 0.12);
  border-radius: 10px;
  background: rgba(244, 247, 239, 0.052);

  h1 {
    margin: 16px 0 0;
    color: #ffffff;
    font-size: clamp(2.1rem, 4.6vw, 4.2rem);
    line-height: 1;
    font-weight: 950;
    text-wrap: balance;
    word-break: keep-all;
  }

  p {
    max-width: 720px;
    margin: 16px 0 0;
    color: rgba(244, 247, 239, 0.72);
    line-height: 1.7;
    text-wrap: pretty;
    word-break: keep-all;
  }
`;

const Kicker = styled.span`
  width: fit-content;
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid rgba(244, 247, 239, 0.18);
  border-radius: 999px;
  color: rgba(244, 247, 239, 0.8);
  background: rgba(244, 247, 239, 0.06);
  font-size: 0.76rem;
  font-weight: 900;
  letter-spacing: 0;
`;

const HeroLink = styled(Link)`
  width: fit-content;
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 24px;
  padding: 0 13px;
  border: 1px solid rgba(244, 247, 239, 0.14);
  border-radius: 8px;
  color: #f4f7ef;
  background: rgba(244, 247, 239, 0.045);
  font-size: 0.84rem;
  font-weight: 900;
  text-decoration: none;
  transition: border-color 180ms ease, background 180ms ease, transform 180ms ease;
  touch-action: manipulation;

  &:hover {
    border-color: rgba(244, 247, 239, 0.3);
    background: rgba(244, 247, 239, 0.09);
    transform: translateY(-1px);
  }

  &:focus-visible {
    outline: 2px solid #ffffff;
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:hover {
      transform: none;
    }
  }
`;

const SelectedPanel = styled.aside<{ $accent: string }>`
  min-width: 0;
  min-height: 236px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 26px;
  border: 1px solid ${(props) => `${props.$accent}55`};
  border-radius: 10px;
  color: ${(props) => props.$accent};
  background:
    linear-gradient(180deg, ${(props) => `${props.$accent}1d`}, rgba(244, 247, 239, 0.035)),
    rgba(244, 247, 239, 0.042);

  span {
    margin-top: 24px;
    color: rgba(244, 247, 239, 0.6);
    font-size: 0.76rem;
    font-weight: 900;
  }

  strong {
    margin-top: 8px;
    color: #ffffff;
    font-size: 2rem;
    line-height: 1.06;
    font-weight: 950;
    word-break: keep-all;
  }

  p {
    margin: 10px 0 0;
    color: rgba(244, 247, 239, 0.7);
    line-height: 1.55;
    word-break: keep-all;
  }
`;

const Steps = styled.ol`
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    min-width: 0;
    min-height: 108px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-content: start;
    gap: 5px 10px;
    padding: 16px;
    border: 1px solid rgba(244, 247, 239, 0.1);
    border-radius: 8px;
    background: rgba(244, 247, 239, 0.045);
  }

  b {
    grid-row: span 2;
    color: rgba(244, 247, 239, 0.42);
    font-size: 0.76rem;
    font-variant-numeric: tabular-nums;
  }

  span {
    color: #ffffff;
    font-size: 0.92rem;
    font-weight: 900;
  }

  small {
    color: rgba(244, 247, 239, 0.62);
    line-height: 1.45;
    word-break: keep-all;
  }

  @media (max-width: 700px) {
    grid-template-columns: 1fr;
  }
`;

const ContentGrid = styled.div`
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 330px);
  gap: 18px;
  align-items: start;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`;

const ApplicationForm = styled.form`
  min-width: 0;
  display: grid;
  gap: 20px;
  padding: clamp(20px, 3vw, 30px);
  border: 1px solid rgba(244, 247, 239, 0.12);
  border-radius: 10px;
  background: rgba(244, 247, 239, 0.052);
`;

const FormHeading = styled.header`
  span,
  p {
    color: rgba(244, 247, 239, 0.6);
  }

  span {
    font-size: 0.74rem;
    font-weight: 900;
    text-transform: uppercase;
  }

  h2 {
    margin: 8px 0 0;
    color: #ffffff;
    font-size: clamp(1.35rem, 2.8vw, 1.9rem);
    line-height: 1.18;
    font-weight: 950;
    text-wrap: balance;
    word-break: keep-all;
  }

  p {
    margin: 9px 0 0;
    font-size: 0.9rem;
    line-height: 1.55;
    word-break: keep-all;
  }
`;

const PositionFieldset = styled.fieldset`
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;

  legend {
    padding: 0;
    color: #ffffff;
    font-size: 0.92rem;
    font-weight: 900;
  }
`;

const PositionGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 10px;

  @media (max-width: 620px) {
    grid-template-columns: 1fr;
  }
`;

const PositionOption = styled.label<{ $accent: string; $selected: boolean }>`
  min-width: 0;
  min-height: 112px;
  position: relative;
  display: block;
  padding: 15px;
  border: 1px solid ${(props) => (props.$selected ? `${props.$accent}a8` : 'rgba(244, 247, 239, 0.12)')};
  border-radius: 8px;
  color: #f4f7ef;
  background: ${(props) => (props.$selected ? `${props.$accent}17` : 'rgba(244, 247, 239, 0.035)')};
  cursor: pointer;
  transition: border-color 180ms ease, background 180ms ease, transform 180ms ease;
  touch-action: manipulation;

  input {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  > span {
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 4px 9px;
  }

  svg {
    grid-row: span 2;
    color: ${(props) => props.$accent};
  }

  b {
    color: #ffffff;
    font-size: 0.95rem;
    line-height: 1.25;
    font-weight: 900;
  }

  small {
    color: rgba(244, 247, 239, 0.64);
    line-height: 1.45;
    word-break: keep-all;
  }

  &:hover {
    border-color: ${(props) => `${props.$accent}9c`};
    background: ${(props) => `${props.$accent}21`};
    transform: translateY(-1px);
  }

  &:focus-within {
    outline: 2px solid #ffffff;
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:hover {
      transform: none;
    }
  }
`;

const FormGrid = styled.div`
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const Field = styled.div`
  min-width: 0;
  display: grid;
  gap: 8px;

  label {
    color: #ffffff;
    font-size: 0.9rem;
    font-weight: 900;
  }
`;

const fieldControlStyles = `
  width: 100%;
  min-width: 0;
  border: 1px solid rgba(244, 247, 239, 0.15);
  border-radius: 8px;
  color: #ffffff;
  background: rgba(5, 10, 8, 0.58);
  font: inherit;
  line-height: 1.45;
  transition: border-color 180ms ease, box-shadow 180ms ease, background 180ms ease;

  &::placeholder {
    color: rgba(244, 247, 239, 0.38);
  }

  &:hover {
    border-color: rgba(244, 247, 239, 0.28);
  }

  &:focus-visible {
    border-color: #93c5fd;
    box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.18);
    outline: none;
  }

  &[aria-invalid='true'] {
    border-color: #fb7185;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const Input = styled.input`
  ${fieldControlStyles}
  min-height: 46px;
  padding: 0 13px;
`;

const Select = styled.select`
  ${fieldControlStyles}
  min-height: 46px;
  padding: 0 12px;

  option {
    color: #ffffff;
    background: #111815;
  }
`;

const TextArea = styled.textarea`
  ${fieldControlStyles}
  min-height: 160px;
  padding: 12px 13px;
  resize: vertical;
`;

const FieldHint = styled.small`
  color: rgba(244, 247, 239, 0.5);
  font-size: 0.8rem;
  line-height: 1.45;
`;

const FieldError = styled.small`
  color: #fda4af;
  font-size: 0.82rem;
  font-weight: 800;
  line-height: 1.4;
`;

const AgreementRow = styled.div<{ $invalid: boolean }>`
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 13px;
  border: 1px solid ${(props) => (props.$invalid ? 'rgba(251, 113, 133, 0.7)' : 'rgba(244, 247, 239, 0.12)')};
  border-radius: 8px;
  background: rgba(244, 247, 239, 0.032);

  input {
    width: 18px;
    height: 18px;
    flex: 0 0 auto;
    margin: 1px 0 0;
    accent-color: #93c5fd;
  }

  label {
    color: rgba(244, 247, 239, 0.76);
    font-size: 0.88rem;
    line-height: 1.5;
    cursor: pointer;
    word-break: keep-all;
  }

  &:focus-within {
    outline: 2px solid #ffffff;
    outline-offset: 3px;
  }
`;

const FormFooter = styled.div`
  min-width: 0;
  display: grid;
  gap: 12px;
`;

const SubmitButton = styled.button<{ $accent: string }>`
  width: fit-content;
  min-height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 17px;
  border: 1px solid ${(props) => props.$accent};
  border-radius: 8px;
  color: #06110f;
  background: ${(props) => props.$accent};
  box-shadow: 0 12px 24px ${(props) => `${props.$accent}1c`};
  font: inherit;
  font-size: 0.9rem;
  font-weight: 950;
  cursor: pointer;
  transition: filter 180ms ease, transform 180ms ease;
  touch-action: manipulation;

  &:hover {
    filter: brightness(1.08);
    transform: translateY(-1px);
  }

  &:focus-visible {
    outline: 2px solid #ffffff;
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:hover {
      transform: none;
    }
  }
`;

const PrivacyNote = styled.p`
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  color: rgba(244, 247, 239, 0.56);
  font-size: 0.8rem;
  line-height: 1.5;
  word-break: keep-all;

  svg {
    flex: 0 0 auto;
    margin-top: 2px;
    color: #93c5fd;
  }
`;

const Confirmation = styled.div<{ $accent: string }>`
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 13px;
  border: 1px solid ${(props) => `${props.$accent}66`};
  border-radius: 8px;
  color: rgba(244, 247, 239, 0.82);
  background: ${(props) => `${props.$accent}12`};
  line-height: 1.55;
  word-break: keep-all;

  svg {
    flex: 0 0 auto;
    margin-top: 2px;
    color: ${(props) => props.$accent};
  }

  strong {
    color: #ffffff;
  }
`;

const Aside = styled.aside`
  min-width: 0;
  display: grid;
  gap: 12px;
`;

const AsideSection = styled.section<{ $muted?: boolean }>`
  min-width: 0;
  padding: 20px;
  border: 1px solid rgba(244, 247, 239, 0.1);
  border-radius: 10px;
  background: ${(props) => (props.$muted ? 'rgba(244, 247, 239, 0.035)' : 'rgba(244, 247, 239, 0.052)')};

  > span {
    color: rgba(244, 247, 239, 0.5);
    font-size: 0.72rem;
    font-weight: 900;
    text-transform: uppercase;
  }

  > svg {
    color: #93c5fd;
  }

  h2 {
    margin: 8px 0 0;
    color: #ffffff;
    font-size: 1.13rem;
    line-height: 1.2;
    font-weight: 950;
    word-break: keep-all;
  }

  p {
    margin: 10px 0 0;
    color: rgba(244, 247, 239, 0.66);
    font-size: 0.9rem;
    line-height: 1.62;
    word-break: keep-all;
  }
`;

const RoleLink = styled(Link)`
  width: fit-content;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-top: 16px;
  color: #bfdbfe;
  font-size: 0.84rem;
  font-weight: 900;
  text-decoration: none;

  &:hover {
    color: #ffffff;
  }

  &:focus-visible {
    border-radius: 4px;
    outline: 2px solid #ffffff;
    outline-offset: 3px;
  }
`;

const Checklist = styled.ul`
  display: grid;
  gap: 11px;
  margin: 14px 0 0;
  padding: 0;
  list-style: none;

  li {
    min-width: 0;
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    gap: 8px;
    color: rgba(244, 247, 239, 0.7);
    font-size: 0.87rem;
    line-height: 1.5;
    word-break: keep-all;
  }

  svg {
    margin-top: 2px;
    color: #6ee7b7;
  }
`;
