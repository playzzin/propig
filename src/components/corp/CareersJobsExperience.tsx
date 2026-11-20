'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  CircleHelp,
  Heart,
  Lightbulb,
  MessageCircleHeart,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import styled from 'styled-components';
import {
  CAREER_FAQS,
  CAREER_PROCESS,
  CAREER_TRACKS,
  getCareerTrack,
  type CareerTrackId,
} from '@/constants/careersExperience';
import type { CorpPageDefinition } from '@/constants/corpPages';

interface CareersJobsExperienceProps {
  page: CorpPageDefinition;
}

const WORKING_PRINCIPLES = [
  {
    title: '문제 앞에서는 직급보다 맥락',
    description: '누가 말했는지보다 왜 필요한지, 사용자가 어디에서 막혔는지, 어떤 제약이 있는지부터 함께 봅니다.',
    icon: Lightbulb,
  },
  {
    title: '빠르게 만들되 검수는 사람답게',
    description: 'AI와 자동화를 적극적으로 사용하지만 사실, 품질, 권리, 안전에 대한 마지막 책임은 사람에게 남깁니다.',
    icon: ShieldCheck,
  },
  {
    title: '모르는 것을 숨기지 않는 팀',
    description: '완벽한 답보다 빠른 질문과 위험 공유를 환영합니다. 실수는 비난보다 재발 방지 장치로 바꿉니다.',
    icon: MessageCircleHeart,
  },
  {
    title: '지속 가능한 속도로 끝까지',
    description: '야근과 희생을 열정의 기본값으로 삼지 않습니다. 우선순위와 완료 기준을 맞추고 작은 결과를 꾸준히 냅니다.',
    icon: Heart,
  },
] as const;

export function CareersJobsExperience({ page: _page }: CareersJobsExperienceProps) {
  const [activeTrackId, setActiveTrackId] = useState<CareerTrackId>(() => getCareerTrack(undefined).id);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeTrack = getCareerTrack(activeTrackId);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      const params = new URLSearchParams(window.location.search);
      setActiveTrackId(getCareerTrack(params.get('track') ?? params.get('position') ?? undefined).id);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  const selectTrack = (trackId: CareerTrackId) => {
    setActiveTrackId(trackId);
    const url = new URL(window.location.href);
    url.searchParams.set('track', trackId);
    url.searchParams.delete('position');
    window.history.replaceState(window.history.state, '', url);
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % CAREER_TRACKS.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + CAREER_TRACKS.length) % CAREER_TRACKS.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = CAREER_TRACKS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTrack = CAREER_TRACKS[nextIndex];
    selectTrack(nextTrack.id);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <Page id="content-area" aria-labelledby="careers-title">
      <Hero>
        <HeroInner>
          <HeroCopy>
            <Eyebrow><Sparkles size={15} aria-hidden="true" /> CAREERS AT PRO PIG</Eyebrow>
            <h1 id="careers-title">완성된 사람보다,<br /><em>함께 다음 장면을 만들 사람</em></h1>
            <p>
              우리는 혼자 모든 답을 아는 사람보다 모르는 것을 질문하고, 작은 약속을 지키며,
              아이디어를 실제 결과까지 데려가는 사람과 오래 일하고 싶습니다.
            </p>
            <HeroActions>
              <PrimaryLink href="#career-tracks">함께할 분야 보기 <ArrowRight size={17} aria-hidden="true" /></PrimaryLink>
              <SecondaryLink href="/corp/careers/apply">인재풀 문의 작성</SecondaryLink>
            </HeroActions>
          </HeroCopy>

          <StatusCard aria-label="현재 채용 안내">
            <StatusDot><span /> CURRENT STATUS</StatusDot>
            <strong>지금은 확정 공고보다<br />좋은 인연을 먼저 기다립니다.</strong>
            <p>현재 공개된 확정 인원·마감일이 있는 포지션은 없습니다. 인재풀 또는 협업 제안을 보내주시면 역할이 실제로 열릴 때 먼저 살펴봅니다.</p>
            <StatusMeta>
              <span><b>접수 형태</b> 인재풀 · 협업 제안</span>
              <span><b>서류 형식</b> 자유 형식 · 링크 가능</span>
              <span><b>중요 기준</b> 문제 해결 과정과 태도</span>
            </StatusMeta>
          </StatusCard>
        </HeroInner>
      </Hero>

      <Content>
        <WarmIntro aria-labelledby="warm-intro-title">
          <WarmHeadline>
            <span>사람을 채우기보다 관계를 시작합니다</span>
            <h2 id="warm-intro-title">지원 버튼 앞에서 망설이는 마음까지 이해하고 싶습니다.</h2>
          </WarmHeadline>
          <WarmCopy>
            <p>“내 경력이 충분할까”, “지금 지원해도 될까”, “공고에 없는 경험도 의미가 있을까.” 지원 전의 망설임은 자연스럽습니다.</p>
            <p>모든 조건에 맞추려 자신을 과장하지 않아도 됩니다. 해본 일, 배우는 방식, 함께 풀고 싶은 문제를 솔직하게 들려주세요. 우리도 아직 정해지지 않은 조건을 멋진 문구로 포장하지 않겠습니다.</p>
          </WarmCopy>
        </WarmIntro>

        <Section aria-labelledby="principles-title">
          <SectionHeading>
            <span>HOW WE WORK</span>
            <h2 id="principles-title">함께 일할 때 지키고 싶은 네 가지</h2>
            <p>복지 목록보다 먼저, 매일의 대화와 의사결정에서 실제로 지키고 싶은 기준을 공유합니다.</p>
          </SectionHeading>
          <PrincipleGrid>
            {WORKING_PRINCIPLES.map(({ title, description, icon: Icon }) => (
              <PrincipleCard key={title}>
                <Icon size={21} aria-hidden="true" />
                <strong>{title}</strong>
                <p>{description}</p>
              </PrincipleCard>
            ))}
          </PrincipleGrid>
        </Section>

        <Section id="career-tracks" aria-labelledby="tracks-title">
          <SectionHeading>
            <span>WHERE YOU CAN CONTRIBUTE</span>
            <h2 id="tracks-title">직함보다 기여하고 싶은 장면을 골라주세요.</h2>
            <p>아래 분야는 확정 채용 공고가 아니라 관심과 경험을 설명하기 위한 안내입니다. 실제 역할이 열리면 조건을 별도 공고로 확인합니다.</p>
          </SectionHeading>

          <TrackTabs role="tablist" aria-label="관심 분야 선택">
            {CAREER_TRACKS.map((track, index) => {
              const active = track.id === activeTrack.id;
              return (
                <TrackTab
                  key={track.id}
                  ref={(element) => { tabRefs.current[index] = element; }}
                  id={`career-track-${track.id}-tab`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={`career-track-${track.id}-panel`}
                  tabIndex={active ? 0 : -1}
                  $active={active}
                  $accent={track.accent}
                  onClick={() => selectTrack(track.id)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                >
                  <small>{track.eyebrow}</small>
                  <strong>{track.label}</strong>
                  <span>{track.summary}</span>
                </TrackTab>
              );
            })}
          </TrackTabs>

          <TrackPanel
            id={`career-track-${activeTrack.id}-panel`}
            role="tabpanel"
            aria-labelledby={`career-track-${activeTrack.id}-tab`}
            tabIndex={0}
            $accent={activeTrack.accent}
          >
            <TrackLead>
              <span>{activeTrack.eyebrow}</span>
              <h3>{activeTrack.title}</h3>
              <p>{activeTrack.mission}</p>
              <TrackApplyLink href={`/corp/careers/apply?track=${activeTrack.id}`} $accent={activeTrack.accent}>
                이 분야로 문의 작성 <ArrowRight size={17} aria-hidden="true" />
              </TrackApplyLink>
            </TrackLead>
            <TrackColumns>
              <TrackList>
                <h4><BadgeCheck size={17} aria-hidden="true" /> 함께 만들 장면</h4>
                <ul>{activeTrack.contributions.map((item) => <li key={item}>{item}</li>)}</ul>
              </TrackList>
              <TrackList>
                <h4><UsersRound size={17} aria-hidden="true" /> 반가운 신호</h4>
                <ul>{activeTrack.signals.map((item) => <li key={item}>{item}</li>)}</ul>
              </TrackList>
              <TrackList $muted>
                <h4><ShieldCheck size={17} aria-hidden="true" /> 없어도 되는 것</h4>
                <ul>{activeTrack.notRequired.map((item) => <li key={item}>{item}</li>)}</ul>
              </TrackList>
            </TrackColumns>
          </TrackPanel>
        </Section>

        <Section aria-labelledby="process-title">
          <SectionHeading>
            <span>CANDIDATE JOURNEY</span>
            <h2 id="process-title">평가받는 절차보다 서로 확인하는 대화</h2>
            <p>역할이 실제로 열렸을 때의 기본 흐름입니다. 역할 특성에 따라 달라지는 부분은 시작 전에 안내합니다.</p>
          </SectionHeading>
          <ProcessList>
            {CAREER_PROCESS.map((item) => (
              <ProcessCard key={item.step}>
                <b>{item.step}</b>
                <div><h3>{item.title}</h3><p>{item.description}</p><small>{item.candidatePromise}</small></div>
              </ProcessCard>
            ))}
          </ProcessList>
        </Section>

        <HumanNote>
          <MessageCircleHeart size={28} aria-hidden="true" />
          <div>
            <span>A NOTE FROM THE TEAM</span>
            <h2>잘 맞는 사람은 체크리스트 밖에 있을 수 있습니다.</h2>
            <p>요건을 모두 채우지 못해도 괜찮습니다. 대신 지금 할 수 있는 일, 배우고 있는 것, 도움이 필요한 부분을 솔직하게 말해 주세요. 우리도 역할의 기대와 아직 정해지지 않은 조건을 같은 솔직함으로 이야기하겠습니다.</p>
          </div>
        </HumanNote>

        <Section aria-labelledby="faq-title">
          <SectionHeading>
            <span>BEFORE YOU APPLY</span>
            <h2 id="faq-title">지원 전에 자주 묻는 질문</h2>
          </SectionHeading>
          <FaqList>
            {CAREER_FAQS.map((item) => (
              <details key={item.question}>
                <summary><CircleHelp size={18} aria-hidden="true" /><strong>{item.question}</strong><span>+</span></summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </FaqList>
        </Section>

        <Closing>
          <div><span>READY WHEN YOU ARE</span><h2>완벽한 지원서보다 진짜 대화를 기다립니다.</h2><p>지금 열린 역할이 없어도 괜찮습니다. 함께 풀고 싶은 문제와 당신이 일하는 방식을 알려주세요.</p></div>
          <PrimaryLink href={`/corp/careers/apply?track=${activeTrack.id}`}>인재풀 문의 시작 <ArrowRight size={17} aria-hidden="true" /></PrimaryLink>
        </Closing>
      </Content>
    </Page>
  );
}

const Page = styled.main`
  min-width: 0;
  color: #15352d;
  background: #f6f4ed;
`;

const Hero = styled.section`
  padding: clamp(72px, 10vw, 132px) 24px clamp(64px, 9vw, 112px);
  color: #f8fff9;
  background:
    radial-gradient(circle at 12% 12%, rgba(121, 216, 188, 0.22), transparent 31%),
    radial-gradient(circle at 90% 8%, rgba(139, 188, 255, 0.17), transparent 28%),
    linear-gradient(145deg, #09261f, #123d32 62%, #0a2922);
`;
const HeroInner = styled.div`
  width: min(1180px, 100%); margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(310px, .72fr); gap: clamp(32px, 6vw, 84px); align-items: center;
  @media (max-width: 860px) { grid-template-columns: 1fr; }
`;
const HeroCopy = styled.div`
  min-width: 0;
  h1 { margin: 22px 0 0; font-size: clamp(2.65rem, 6.2vw, 5.6rem); line-height: .99; letter-spacing: -.055em; font-weight: 900; word-break: keep-all; text-wrap: balance; }
  h1 em { color: #a8e7d1; font-style: normal; }
  p { max-width: 700px; margin: 25px 0 0; color: rgba(248,255,249,.72); font-size: clamp(1rem, 1.4vw, 1.15rem); line-height: 1.8; word-break: keep-all; }
`;
const Eyebrow = styled.span`
  display: inline-flex; align-items: center; gap: 8px; color: #bdebdc; font-size: .76rem; font-weight: 900; letter-spacing: .14em;
`;
const HeroActions = styled.div`
  display: flex; flex-wrap: wrap; gap: 10px; margin-top: 30px;
  @media (max-width: 520px) { > a { width: 100%; } }
`;
const PrimaryLink = styled(Link)`
  min-height: 48px; display: inline-flex; align-items: center; justify-content: center; gap: 9px; padding: 0 19px; border-radius: 999px; color: #09261f; background: #b8efd9; font-weight: 900; text-decoration: none; transition: transform 180ms ease, background 180ms ease;
  &:hover { transform: translateY(-2px); background: #d3f8e9; }
  &:focus-visible { outline: 3px solid #fff; outline-offset: 3px; }
  @media (prefers-reduced-motion: reduce) { transition: none; &:hover { transform: none; } }
`;
const SecondaryLink = styled(Link)`
  min-height: 48px; display: inline-flex; align-items: center; justify-content: center; padding: 0 19px; border: 1px solid rgba(255,255,255,.24); border-radius: 999px; color: #fff; font-weight: 850; text-decoration: none;
  &:hover { background: rgba(255,255,255,.08); }
  &:focus-visible { outline: 3px solid #fff; outline-offset: 3px; }
`;
const StatusCard = styled.aside`
  padding: 27px; border: 1px solid rgba(255,255,255,.16); border-radius: 26px; background: rgba(255,255,255,.075); box-shadow: 0 24px 70px rgba(0,0,0,.18); backdrop-filter: blur(12px);
  > strong { display: block; margin-top: 20px; color: #fff; font-size: 1.35rem; line-height: 1.4; word-break: keep-all; }
  > p { margin: 13px 0 0; color: rgba(255,255,255,.67); font-size: .9rem; line-height: 1.72; word-break: keep-all; }
`;
const StatusDot = styled.span`
  display: inline-flex; align-items: center; gap: 8px; color: #bdebdc; font-size: .68rem; font-weight: 900; letter-spacing: .13em;
  span { width: 8px; height: 8px; border-radius: 50%; background: #73e6ba; box-shadow: 0 0 0 5px rgba(115,230,186,.13); }
`;
const StatusMeta = styled.div`
  display: grid; gap: 9px; margin-top: 22px; padding-top: 18px; border-top: 1px solid rgba(255,255,255,.12);
  span { display: flex; justify-content: space-between; gap: 16px; color: rgba(255,255,255,.72); font-size: .8rem; }
  b { color: rgba(255,255,255,.46); font-weight: 800; }
`;
const Content = styled.div`
  width: min(1180px, calc(100% - 40px)); margin: 0 auto; padding: clamp(60px, 8vw, 104px) 0 90px; display: grid; gap: clamp(72px, 9vw, 118px);
  @media (max-width: 520px) { width: min(100% - 28px, 1180px); }
`;
const WarmIntro = styled.section`
  display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); gap: clamp(30px, 6vw, 86px); align-items: start;
  @media (max-width: 760px) { grid-template-columns: 1fr; }
`;
const WarmHeadline = styled.header`
  span { color: #397a67; font-size: .75rem; font-weight: 900; letter-spacing: .08em; }
  h2 { margin: 13px 0 0; font-size: clamp(2rem, 4vw, 3.55rem); line-height: 1.14; letter-spacing: -.045em; word-break: keep-all; text-wrap: balance; }
`;
const WarmCopy = styled.div`
  display: grid; gap: 16px; padding-top: 28px; border-top: 1px solid #cad7cf;
  p { margin: 0; color: #4b625b; font-size: 1rem; line-height: 1.85; word-break: keep-all; }
`;
const Section = styled.section`scroll-margin-top: 30px;`;
const SectionHeading = styled.header`
  max-width: 760px; margin-bottom: 30px;
  span { color: #3c7d69; font-size: .72rem; font-weight: 950; letter-spacing: .13em; }
  h2 { margin: 11px 0 0; color: #15352d; font-size: clamp(1.9rem, 3.6vw, 3.15rem); line-height: 1.13; letter-spacing: -.04em; word-break: keep-all; text-wrap: balance; }
  p { margin: 14px 0 0; color: #64766f; line-height: 1.75; word-break: keep-all; }
`;
const PrincipleGrid = styled.div`
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px;
  @media (max-width: 900px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 540px) { grid-template-columns: 1fr; }
`;
const PrincipleCard = styled.article`
  min-width: 0; min-height: 220px; display: flex; flex-direction: column; padding: 24px; border: 1px solid #d8dfda; border-radius: 20px; background: rgba(255,255,255,.55);
  svg { color: #3d8b72; }
  strong { margin-top: auto; padding-top: 34px; font-size: 1.03rem; line-height: 1.4; }
  p { margin: 9px 0 0; color: #66766f; font-size: .86rem; line-height: 1.65; word-break: keep-all; }
`;
const TrackTabs = styled.div`
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; margin-bottom: 12px;
  @media (max-width: 900px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 540px) { grid-template-columns: 1fr; }
`;
const TrackTab = styled.button<{ $active: boolean; $accent: string }>`
  min-height: 164px; display: flex; flex-direction: column; align-items: flex-start; padding: 20px; border: 1px solid ${({ $active, $accent }) => $active ? $accent : '#d3dcd6'}; border-radius: 18px; color: #15352d; background: ${({ $active, $accent }) => $active ? `${$accent}24` : 'rgba(255,255,255,.58)'}; text-align: left; font: inherit; cursor: pointer;
  small { color: #648078; font-size: .65rem; font-weight: 900; letter-spacing: .08em; }
  strong { margin-top: 12px; font-size: 1rem; }
  span { margin-top: 9px; color: #697a73; font-size: .78rem; line-height: 1.5; word-break: keep-all; }
  &:focus-visible { outline: 3px solid #246c58; outline-offset: 3px; }
`;
const TrackPanel = styled.article<{ $accent: string }>`
  display: grid; grid-template-columns: minmax(260px, .72fr) minmax(0, 1.28fr); gap: 34px; padding: clamp(25px, 4vw, 42px); border: 1px solid ${({ $accent }) => `${$accent}99`}; border-radius: 26px; background: linear-gradient(140deg, ${({ $accent }) => `${$accent}24`}, rgba(255,255,255,.68));
  &:focus { outline: none; }
  @media (max-width: 820px) { grid-template-columns: 1fr; }
`;
const TrackLead = styled.div`
  > span { color: #47776a; font-size: .69rem; font-weight: 950; letter-spacing: .11em; }
  h3 { margin: 12px 0 0; font-size: clamp(1.65rem, 3vw, 2.55rem); line-height: 1.16; letter-spacing: -.035em; word-break: keep-all; }
  p { margin: 15px 0 0; color: #5b7068; line-height: 1.72; word-break: keep-all; }
`;
const TrackApplyLink = styled(Link)<{ $accent: string }>`
  min-height: 46px; width: fit-content; display: inline-flex; align-items: center; gap: 8px; margin-top: 23px; padding: 0 17px; border-radius: 999px; color: #15352d; background: ${({ $accent }) => $accent}; font-weight: 900; text-decoration: none;
  &:focus-visible { outline: 3px solid #15352d; outline-offset: 3px; }
`;
const TrackColumns = styled.div`display: grid; gap: 10px;`;
const TrackList = styled.section<{ $muted?: boolean }>`
  padding: 18px 20px; border: 1px solid ${({ $muted }) => $muted ? '#d8d7ca' : '#d0ddd6'}; border-radius: 16px; background: ${({ $muted }) => $muted ? 'rgba(246,241,221,.58)' : 'rgba(255,255,255,.6)'};
  h4 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: .86rem; }
  ul { display: grid; gap: 8px; margin: 13px 0 0; padding: 0; list-style: none; }
  li { position: relative; padding-left: 16px; color: #596c65; font-size: .82rem; line-height: 1.55; word-break: keep-all; }
  li::before { content: ''; position: absolute; left: 0; top: .62em; width: 5px; height: 5px; border-radius: 50%; background: #64a890; }
`;
const ProcessList = styled.ol`
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 0; padding: 0; list-style: none;
  @media (max-width: 920px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 540px) { grid-template-columns: 1fr; }
`;
const ProcessCard = styled.li`
  min-height: 260px; padding: 22px; border-top: 3px solid #67ae96; border-radius: 0 0 18px 18px; background: #fff;
  > b { color: #5ca088; font-size: 1.35rem; }
  h3 { margin: 35px 0 0; font-size: 1.05rem; line-height: 1.4; }
  p { margin: 10px 0 0; color: #65766f; font-size: .82rem; line-height: 1.62; word-break: keep-all; }
  small { display: block; margin-top: 16px; padding-top: 14px; border-top: 1px solid #e1e5e2; color: #3d705f; font-size: .74rem; line-height: 1.55; word-break: keep-all; }
`;
const HumanNote = styled.aside`
  display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 23px; padding: clamp(28px, 5vw, 52px); border-radius: 28px; color: #f8fff9; background: #153d32;
  > svg { color: #9de1c9; }
  span { color: #9de1c9; font-size: .69rem; font-weight: 950; letter-spacing: .13em; }
  h2 { margin: 10px 0 0; font-size: clamp(1.7rem, 3.2vw, 2.7rem); line-height: 1.18; letter-spacing: -.035em; word-break: keep-all; }
  p { max-width: 800px; margin: 15px 0 0; color: rgba(255,255,255,.7); line-height: 1.75; word-break: keep-all; }
  @media (max-width: 540px) { grid-template-columns: 1fr; }
`;
const FaqList = styled.div`
  border-top: 1px solid #cfd9d3;
  details { border-bottom: 1px solid #cfd9d3; }
  summary { min-height: 67px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px; cursor: pointer; list-style: none; }
  summary::-webkit-details-marker { display: none; }
  summary svg { color: #4d927c; }
  summary strong { font-size: .95rem; line-height: 1.5; word-break: keep-all; }
  summary span { color: #4d927c; font-size: 1.2rem; }
  p { margin: 0; padding: 0 36px 23px; color: #61736c; line-height: 1.75; word-break: keep-all; }
  details[open] summary span { transform: rotate(45deg); }
`;
const Closing = styled.section`
  display: flex; align-items: center; justify-content: space-between; gap: 32px; padding: clamp(28px, 5vw, 50px); border-radius: 28px; color: #fff; background: linear-gradient(135deg, #17493b, #0c2d25);
  span { color: #9ce1c8; font-size: .68rem; font-weight: 950; letter-spacing: .12em; }
  h2 { margin: 9px 0 0; font-size: clamp(1.55rem, 3vw, 2.35rem); line-height: 1.2; word-break: keep-all; }
  p { margin: 10px 0 0; color: rgba(255,255,255,.65); line-height: 1.65; word-break: keep-all; }
  > a { flex: 0 0 auto; }
  @media (max-width: 720px) { align-items: stretch; flex-direction: column; > a { width: 100%; } }
`;
