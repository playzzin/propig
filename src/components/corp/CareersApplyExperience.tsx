'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  Check,
  Clipboard,
  FileText,
  HeartHandshake,
  Mail,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  CAREER_SUPPORT_EMAIL,
  CAREER_TRACKS,
  getCareerApplicationMailto,
  getCareerTrack,
  type CareerApplicationDraft,
  type CareerTrackId,
} from '@/constants/careersExperience';
import type { CorpPageDefinition } from '@/constants/corpPages';
import * as S from './CareersApplyExperience.styles';

interface CareersApplyExperienceProps {
  page: CorpPageDefinition;
}

type FormErrors = Partial<Record<keyof CareerApplicationDraft | 'consent', string>>;
type PageStatus = 'idle' | 'restored' | 'saved' | 'email' | 'copied' | 'copy-error';

const STORAGE_KEY = 'propig-career-application-draft-v2';
const TEXT_MIN_LENGTH = 30;

const EMPTY_DRAFT: CareerApplicationDraft = {
  trackId: 'product',
  name: '',
  email: '',
  phone: '',
  portfolio: '',
  introduction: '',
  motivation: '',
  availability: '',
  questions: '',
};

function isCareerTrackId(value: unknown): value is CareerTrackId {
  return typeof value === 'string' && CAREER_TRACKS.some((track) => track.id === value);
}

function readStoredDraft(): CareerApplicationDraft | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CareerApplicationDraft>;
    if (!isCareerTrackId(parsed.trackId)) return null;
    return {
      trackId: parsed.trackId,
      name: typeof parsed.name === 'string' ? parsed.name : '',
      email: typeof parsed.email === 'string' ? parsed.email : '',
      phone: typeof parsed.phone === 'string' ? parsed.phone : '',
      portfolio: typeof parsed.portfolio === 'string' ? parsed.portfolio : '',
      introduction: typeof parsed.introduction === 'string' ? parsed.introduction : '',
      motivation: typeof parsed.motivation === 'string' ? parsed.motivation : '',
      availability: typeof parsed.availability === 'string' ? parsed.availability : '',
      questions: typeof parsed.questions === 'string' ? parsed.questions : '',
    };
  } catch {
    return null;
  }
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function CareersApplyExperience({ page: _page }: CareersApplyExperienceProps) {
  const [draft, setDraft] = useState<CareerApplicationDraft>({ ...EMPTY_DRAFT });
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState<PageStatus>('idle');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      const params = new URLSearchParams(window.location.search);
      const selectedPositionId = params.get('track') ?? params.get('position') ?? undefined;
      const requestedTrack = getCareerTrack(selectedPositionId);
      const stored = readStoredDraft();
      if (stored) {
        setDraft({ ...stored, trackId: selectedPositionId ? requestedTrack.id : stored.trackId });
        setStatus('restored');
      } else {
        setDraft((current) => ({ ...current, trackId: requestedTrack.id }));
      }
      setHydrated(true);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    if (!hydrated) return undefined;
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      setStatus((current) => current === 'email' || current === 'copied' ? current : 'saved');
    }, 450);
    return () => window.clearTimeout(timer);
  }, [draft, hydrated]);

  const activeTrack = getCareerTrack(draft.trackId);
  const readiness = useMemo(() => {
    const checks = [
      draft.name.trim().length > 0,
      isValidEmail(draft.email.trim()),
      draft.introduction.trim().length >= TEXT_MIN_LENGTH,
      draft.motivation.trim().length >= TEXT_MIN_LENGTH,
      consent,
    ];
    return { done: checks.filter(Boolean).length, total: checks.length };
  }, [consent, draft]);
  const progress = Math.round((readiness.done / readiness.total) * 100);

  const updateDraft = <K extends keyof CareerApplicationDraft>(key: K, value: CareerApplicationDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setStatus('idle');
  };

  const resetDraft = () => {
    if (!window.confirm('이 브라우저에 저장된 지원 초안을 모두 지울까요?')) return;
    const next = { ...EMPTY_DRAFT, trackId: draft.trackId };
    setDraft(next);
    setConsent(false);
    setErrors({});
    setStatus('idle');
    window.localStorage.removeItem(STORAGE_KEY);
    document.getElementById('career-name')?.focus();
  };

  const validate = (): FormErrors => {
    const next: FormErrors = {};
    if (!draft.name.trim()) next.name = '이름 또는 불리고 싶은 이름을 입력해 주세요.';
    if (!draft.email.trim()) next.email = '답변받을 이메일을 입력해 주세요.';
    else if (!isValidEmail(draft.email.trim())) next.email = '이메일 형식을 확인해 주세요.';
    if (draft.introduction.trim().length < TEXT_MIN_LENGTH) next.introduction = `${TEXT_MIN_LENGTH}자 이상으로 경험과 일하는 방식을 소개해 주세요.`;
    if (draft.motivation.trim().length < TEXT_MIN_LENGTH) next.motivation = `${TEXT_MIN_LENGTH}자 이상으로 함께하고 싶은 이유를 적어 주세요.`;
    if (!consent) next.consent = '이메일 지원 방식과 개인정보 안내를 확인해 주세요.';
    return next;
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    const firstError = (['name', 'email', 'introduction', 'motivation', 'consent'] as const).find((key) => nextErrors[key]);
    if (firstError) {
      document.getElementById(firstError === 'consent' ? 'career-consent' : `career-${firstError}`)?.focus();
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    setStatus('email');
    window.location.href = getCareerApplicationMailto(draft);
  };

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(CAREER_SUPPORT_EMAIL);
      setStatus('copied');
    } catch {
      setStatus('copy-error');
    }
  };

  const statusMessage: Record<PageStatus, string> = {
    idle: '',
    restored: '이 브라우저에 저장된 이전 초안을 불러왔습니다.',
    saved: '초안이 이 브라우저에 저장됐습니다.',
    email: '이메일 앱을 열었습니다. 내용을 검토하고 필요한 파일을 첨부한 뒤 직접 전송해 주세요.',
    copied: '지원 이메일 주소를 복사했습니다.',
    'copy-error': `복사하지 못했습니다. ${CAREER_SUPPORT_EMAIL}을 직접 사용해 주세요.`,
  };

  return (
    <S.Page id="content-area" aria-labelledby="apply-title" $accent={activeTrack.accent}>
      <S.Hero>
        <S.HeroCopy>
          <S.Eyebrow><HeartHandshake size={16} aria-hidden="true" /> START A CONVERSATION</S.Eyebrow>
          <h1 id="apply-title">지원서는 심사표가 아니라<br /><em>첫 대화의 시작</em>입니다.</h1>
          <p>완벽하게 자신을 포장하지 않아도 됩니다. 해본 일, 배우는 방식, Propig과 함께 만들고 싶은 장면을 당신의 언어로 들려주세요.</p>
          <S.BackLink href="/corp/careers/jobs"><ArrowLeft size={16} aria-hidden="true" /> 채용정보 다시 보기</S.BackLink>
        </S.HeroCopy>
        <S.HeroGuide>
          <span><ShieldCheck size={17} aria-hidden="true" /> PRIVACY FIRST</span>
          <strong>작성 내용은 자동 제출되지 않습니다.</strong>
          <p>초안은 현재 브라우저에만 저장됩니다. 마지막 버튼을 누르면 이메일 앱이 열리며, 내용을 직접 확인하고 전송해야 지원 문의가 전달됩니다.</p>
          <ul>
            <li><Check size={15} aria-hidden="true" /> 서버 자동 저장 없음</li>
            <li><Check size={15} aria-hidden="true" /> 이메일 전송 전 최종 검토</li>
            <li><Check size={15} aria-hidden="true" /> 비밀정보·고객자료 첨부 금지</li>
          </ul>
        </S.HeroGuide>
      </S.Hero>

      <S.Content>
        <S.ProgressSection aria-label={`지원서 준비 진행률 ${progress}%`}>
          <S.ProgressCopy>
            <span>YOUR PROGRESS</span>
            <strong>{readiness.done} / {readiness.total} 준비 완료</strong>
            <small>{progress === 100 ? '이메일 지원 초안을 열 준비가 됐습니다.' : '필수 항목을 채우면 마지막 단계로 이동할 수 있습니다.'}</small>
          </S.ProgressCopy>
          <S.ProgressTrack><span style={{ transform: `scaleX(${progress / 100})` }} /></S.ProgressTrack>
          <S.StepList>
            <li data-active="true"><b>01</b><span>관심 분야</span></li>
            <li data-active={Boolean(draft.name || draft.email)}><b>02</b><span>기본 정보</span></li>
            <li data-active={Boolean(draft.introduction || draft.motivation)}><b>03</b><span>나의 이야기</span></li>
            <li data-active={progress === 100}><b>04</b><span>검토·전송</span></li>
          </S.StepList>
        </S.ProgressSection>

        <S.Layout>
          <S.Form noValidate onSubmit={handleSubmit}>
            <S.FormSection aria-labelledby="track-heading">
              <S.SectionHeading><span>STEP 01</span><h2 id="track-heading">어떤 장면에 함께하고 싶나요?</h2><p>확정 채용 포지션이 아니라 관심과 경험을 설명하기 위한 분야입니다.</p></S.SectionHeading>
              <S.TrackGrid>
                {CAREER_TRACKS.map((track) => (
                  <S.TrackChoice key={track.id} $selected={draft.trackId === track.id} $accent={track.accent}>
                    <input
                      id={`career-track-${track.id}`}
                      type="radio"
                      name="trackId"
                      value={track.id}
                      checked={draft.trackId === track.id}
                      onChange={() => updateDraft('trackId', track.id)}
                    />
                    <label htmlFor={`career-track-${track.id}`}>
                      <small>{track.eyebrow}</small><strong>{track.label}</strong><span>{track.summary}</span>
                    </label>
                  </S.TrackChoice>
                ))}
              </S.TrackGrid>
            </S.FormSection>

            <S.FormSection aria-labelledby="identity-heading">
              <S.SectionHeading><span>STEP 02</span><h2 id="identity-heading">답변받을 정보를 알려주세요.</h2><p>필요한 정보만 받습니다. 전화번호와 포트폴리오 링크는 선택입니다.</p></S.SectionHeading>
              <S.FieldGrid>
                <S.Field>
                  <label htmlFor="career-name">이름 또는 불리고 싶은 이름 *</label>
                  <input id="career-name" type="text" autoComplete="name" value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'career-name-error' : undefined} placeholder="예: 김프로" />
                  {errors.name ? <S.Error id="career-name-error">{errors.name}</S.Error> : null}
                </S.Field>
                <S.Field>
                  <label htmlFor="career-email">이메일 *</label>
                  <input id="career-email" type="email" inputMode="email" autoComplete="email" value={draft.email} onChange={(event) => updateDraft('email', event.target.value)} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'career-email-error' : undefined} placeholder="name@example.com" />
                  {errors.email ? <S.Error id="career-email-error">{errors.email}</S.Error> : null}
                </S.Field>
                <S.Field>
                  <label htmlFor="career-phone">연락처 <small>선택</small></label>
                  <input id="career-phone" type="tel" inputMode="tel" autoComplete="tel" value={draft.phone} onChange={(event) => updateDraft('phone', event.target.value)} placeholder="이메일 외 연락이 필요할 때만" />
                </S.Field>
                <S.Field>
                  <label htmlFor="career-portfolio">포트폴리오·작업 링크 <small>선택</small></label>
                  <input id="career-portfolio" type="url" inputMode="url" value={draft.portfolio} onChange={(event) => updateDraft('portfolio', event.target.value)} placeholder="https://" />
                  <S.Hint>공개할 권한이 있는 링크만 입력해 주세요.</S.Hint>
                </S.Field>
              </S.FieldGrid>
            </S.FormSection>

            <S.FormSection aria-labelledby="story-heading">
              <S.SectionHeading><span>STEP 03</span><h2 id="story-heading">경력보다 문제를 푸는 방식을 들려주세요.</h2><p>문장이 매끄럽지 않아도 괜찮습니다. 구체적인 장면 하나가 긴 자기소개보다 더 많은 것을 말해줍니다.</p></S.SectionHeading>
              <S.Field>
                <label htmlFor="career-introduction">나와 경험 소개 *</label>
                <textarea id="career-introduction" rows={7} value={draft.introduction} onChange={(event) => updateDraft('introduction', event.target.value)} aria-invalid={Boolean(errors.introduction)} aria-describedby={errors.introduction ? 'career-introduction-error' : 'career-introduction-hint'} placeholder="어떤 문제를 맡았고, 무엇을 판단했으며, 결과와 배운 점은 무엇이었나요?" />
                <S.TextMeta id="career-introduction-hint"><span>고객·회사 비밀정보는 가리고 작성해 주세요.</span><b data-ready={draft.introduction.trim().length >= TEXT_MIN_LENGTH}>{draft.introduction.trim().length}자</b></S.TextMeta>
                {errors.introduction ? <S.Error id="career-introduction-error">{errors.introduction}</S.Error> : null}
              </S.Field>
              <S.Field>
                <label htmlFor="career-motivation">Propig과 함께하고 싶은 이유 *</label>
                <textarea id="career-motivation" rows={7} value={draft.motivation} onChange={(event) => updateDraft('motivation', event.target.value)} aria-invalid={Boolean(errors.motivation)} aria-describedby={errors.motivation ? 'career-motivation-error' : 'career-motivation-hint'} placeholder="어떤 제품이나 문제에 관심이 있고, 함께 어떤 변화를 만들고 싶나요?" />
                <S.TextMeta id="career-motivation-hint"><span>정답보다 당신이 중요하게 보는 기준을 알고 싶습니다.</span><b data-ready={draft.motivation.trim().length >= TEXT_MIN_LENGTH}>{draft.motivation.trim().length}자</b></S.TextMeta>
                {errors.motivation ? <S.Error id="career-motivation-error">{errors.motivation}</S.Error> : null}
              </S.Field>
              <S.FieldGrid>
                <S.Field>
                  <label htmlFor="career-availability">가능한 시점·협업 형태 <small>선택</small></label>
                  <textarea id="career-availability" rows={4} value={draft.availability} onChange={(event) => updateDraft('availability', event.target.value)} placeholder="예: 다음 달부터 대화 가능, 프로젝트 협업 우선" />
                </S.Field>
                <S.Field>
                  <label htmlFor="career-questions">먼저 확인하고 싶은 질문 <small>선택</small></label>
                  <textarea id="career-questions" rows={4} value={draft.questions} onChange={(event) => updateDraft('questions', event.target.value)} placeholder="역할, 보상, 근무 방식, 팀에 대해 궁금한 점" />
                </S.Field>
              </S.FieldGrid>
            </S.FormSection>

            <S.FormSection aria-labelledby="review-heading">
              <S.SectionHeading><span>STEP 04</span><h2 id="review-heading">마지막으로 전송 방식을 확인해 주세요.</h2><p>이 버튼은 서버에 지원서를 제출하지 않고 기본 이메일 앱에 작성 내용을 옮깁니다.</p></S.SectionHeading>
              <S.Consent $invalid={Boolean(errors.consent)}>
                <input id="career-consent" type="checkbox" checked={consent} onChange={(event) => { setConsent(event.target.checked); setErrors((current) => ({ ...current, consent: undefined })); }} aria-describedby={errors.consent ? 'career-consent-error' : 'career-consent-note'} />
                <label htmlFor="career-consent"><strong>이메일 지원 방식과 개인정보 안내를 확인했습니다. *</strong><span id="career-consent-note">초안은 현재 브라우저에만 저장되며, 이메일 앱에서 직접 전송한 내용만 {CAREER_SUPPORT_EMAIL}로 전달됩니다.</span></label>
              </S.Consent>
              {errors.consent ? <S.Error id="career-consent-error">{errors.consent}</S.Error> : null}

              <S.Actions>
                <S.ResetButton type="button" onClick={resetDraft}><RotateCcw size={16} aria-hidden="true" /> 초안 초기화</S.ResetButton>
                <S.SubmitButton type="submit" $ready={progress === 100}>이메일 지원 초안 열기 <ArrowRight size={17} aria-hidden="true" /></S.SubmitButton>
              </S.Actions>
              <S.Status role="status" aria-live="polite">{statusMessage[status]}</S.Status>
            </S.FormSection>
          </S.Form>

          <S.Sidebar>
            <S.SideCard $accent={activeTrack.accent}>
              <BriefcaseBusiness size={22} aria-hidden="true" />
              <span>SELECTED TRACK</span>
              <h2>{activeTrack.label}</h2>
              <p>{activeTrack.title}</p>
              <ul>{activeTrack.signals.map((signal) => <li key={signal}><BadgeCheck size={14} aria-hidden="true" />{signal}</li>)}</ul>
            </S.SideCard>
            <S.SideCard>
              <FileText size={21} aria-hidden="true" />
              <span>BEFORE SENDING</span>
              <h2>이메일 앱에서 확인할 것</h2>
              <ul>
                <li><Check size={14} aria-hidden="true" />작성 내용 다시 읽기</li>
                <li><Check size={14} aria-hidden="true" />필요한 이력서·포트폴리오 첨부</li>
                <li><Check size={14} aria-hidden="true" />비밀정보와 개인정보 제거</li>
                <li><Check size={14} aria-hidden="true" />받는 주소 확인 후 직접 전송</li>
              </ul>
            </S.SideCard>
            <S.EmailCard>
              <Mail size={20} aria-hidden="true" />
              <div><span>지원 이메일</span><strong>{CAREER_SUPPORT_EMAIL}</strong></div>
              <button type="button" onClick={copyEmail}><Clipboard size={15} aria-hidden="true" /> 주소 복사</button>
            </S.EmailCard>
            <S.DraftNote><Save size={18} aria-hidden="true" /><p><strong>자동 초안 저장</strong>입력 내용은 이 브라우저의 localStorage에만 저장됩니다. 공용 기기에서는 작업 후 반드시 초기화해 주세요.</p></S.DraftNote>
            <S.JobsLink href="/corp/careers/jobs"><Sparkles size={16} aria-hidden="true" /> 다른 관심 분야 살펴보기</S.JobsLink>
          </S.Sidebar>
        </S.Layout>
      </S.Content>
    </S.Page>
  );
}
