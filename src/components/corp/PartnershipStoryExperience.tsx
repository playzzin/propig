'use client';

import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  CircleDollarSign,
  Eye,
  FileSearch,
  Handshake,
  HeartHandshake,
  Mail,
  Megaphone,
  MessageCircle,
  Route,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import styled from 'styled-components';
import type { CorpPageDefinition } from '@/constants/corpPages';

type PartnershipStoryKind = 'advertising' | 'investment';

interface PartnershipStoryExperienceProps {
  page: CorpPageDefinition;
  kind: PartnershipStoryKind;
}

interface StoryCard {
  eyebrow: string;
  title: string;
  description: string;
  punchline: string;
  icon: LucideIcon;
}

interface JourneyStep {
  number: string;
  title: string;
  description: string;
}

const ADVERTISING_FORMATS: StoryCard[] = [
  {
    eyebrow: 'BRAND FILM',
    title: '브랜드의 이유를 한 편의 이야기로',
    description: '무엇을 파는지보다 왜 시작했고 누구의 하루를 바꾸는지 먼저 꺼냅니다.',
    punchline: '스킵 버튼 앞에서도 3초는 더 머무는 이야기',
    icon: BookOpen,
  },
  {
    eyebrow: 'SOCIAL SERIES',
    title: '한 번 보고 끝나지 않는 연재형 콘텐츠',
    description: '밈, 숏폼, 카드뉴스를 브랜드 말투로 묶어 다음 편을 기다리게 만듭니다.',
    punchline: '알고리즘보다 먼저 사람의 단톡방에 도착',
    icon: MessageCircle,
  },
  {
    eyebrow: 'EXPERIENCE',
    title: '직접 만지고 웃고 기억하는 캠페인',
    description: '온라인 메시지를 이벤트·체험·참여 미션으로 번역해 고객이 이야기의 일부가 되게 합니다.',
    punchline: '광고를 봤다가 추억을 만들어버리는 사고',
    icon: Sparkles,
  },
  {
    eyebrow: 'PERFORMANCE',
    title: '감성과 숫자가 서로 삐치지 않는 운영',
    description: '클릭과 전환뿐 아니라 댓글의 온도, 저장 이유, 재방문 맥락까지 함께 읽습니다.',
    punchline: '예쁜데 팔리고, 팔리는데 미움받지 않게',
    icon: BarChart3,
  },
];

const ADVERTISING_PROCESS: JourneyStep[] = [
  { number: '01', title: '마음부터 인터뷰', description: '브랜드가 지키고 싶은 것과 고객이 진짜 서운한 지점을 함께 듣습니다.' },
  { number: '02', title: '한 문장에 모이기', description: '회의실에서만 멋있는 말 대신 고객이 친구에게 전할 한 문장을 정합니다.' },
  { number: '03', title: '작게 세상에 내놓기', description: '전체 예산을 태우기 전 작은 소재와 채널로 반응을 안전하게 확인합니다.' },
  { number: '04', title: '댓글의 표정 읽기', description: '좋아요 수만 보지 않고 왜 웃고, 왜 저장하고, 어디서 멈췄는지 해석합니다.' },
  { number: '05', title: '다음 편을 남기기', description: '성과와 실패를 재사용 가능한 자산으로 정리해 캠페인이 다음 캠페인을 돕게 합니다.' },
];

const INVESTMENT_THESES: StoryCard[] = [
  {
    eyebrow: 'PROBLEM',
    title: '불편함을 오래 지켜본 팀',
    description: '유행하는 문제를 빌려오지 않고 직접 겪고 반복해서 관찰한 문제를 다룹니다.',
    punchline: '문제와 헤어지지 못해 결국 제품을 만든 사람들',
    icon: Eye,
  },
  {
    eyebrow: 'EXECUTION',
    title: '슬라이드보다 먼저 움직이는 팀',
    description: '완벽한 계획을 기다리기보다 작은 결과물을 내고 고객의 반응으로 다음 결정을 만듭니다.',
    punchline: '회의록보다 배포 기록이 조금 더 긴 회사',
    icon: Route,
  },
  {
    eyebrow: 'ECONOMICS',
    title: '매출과 비용의 표정을 숨기지 않는 팀',
    description: '좋은 숫자만 확대하지 않고 성장 비용, 반복성, 회수 가능성을 같은 표에서 봅니다.',
    punchline: '엑셀에게도 솔직하고 투자자에게는 더 솔직하게',
    icon: CircleDollarSign,
  },
  {
    eyebrow: 'PARTNERSHIP',
    title: '돈 다음의 대화를 준비한 팀',
    description: '투자를 입금 이벤트가 아니라 채용·시장·운영의 난제를 함께 푸는 장기 관계로 봅니다.',
    punchline: '좋을 때 박수, 어려울 때 질문을 건네는 동행',
    icon: HeartHandshake,
  },
];

const INVESTMENT_QUESTIONS = [
  '대표가 휴가를 가도 일주일은 굴러갈 수 있나요?',
  '고객이 칭찬한 기능과 실제 돈을 낸 이유가 같은가요?',
  '이번 달 숫자가 두 배가 된 이유를 다음 달에도 설명할 수 있나요?',
  'AI가 없어도 사업은 남고, AI가 있으면 얼마나 더 좋아지나요?',
  '가장 뼈아픈 실패 하나가 지금의 운영 규칙을 어떻게 바꿨나요?',
  '투자금이 예상보다 늦어져도 지킬 수 있는 가장 중요한 약속은 무엇인가요?',
];

const INVESTMENT_100_DAYS: JourneyStep[] = [
  { number: 'D+00', title: '같은 지도 펼치기', description: '투자 목적, 의사결정 권한, 보고 방식과 절대 놓치지 않을 원칙을 맞춥니다.' },
  { number: 'D+14', title: '숫자의 출처 연결하기', description: '핵심 지표의 정의와 원천 데이터를 정리해 같은 숫자를 다르게 읽는 일을 막습니다.' },
  { number: 'D+30', title: '가장 위험한 가설 깨기', description: '시장·제품·운영 중 실패 비용이 가장 큰 가설부터 짧은 실험으로 확인합니다.' },
  { number: 'D+60', title: '사람과 시스템 보강하기', description: '대표 개인의 체력으로 버티던 일을 채용, 자동화, 문서화로 팀의 능력으로 옮깁니다.' },
  { number: 'D+100', title: '다음 300일 결정하기', description: '성과와 오차를 함께 리뷰하고 다음 투자·확장·집중 기준을 다시 합의합니다.' },
];

const INVESTMENT_USE = [
  { label: 'PRODUCT', title: '고객이 다시 찾는 제품', body: '핵심 경험과 안정성을 먼저 강화합니다.', tone: '#78f0ca' },
  { label: 'PEOPLE', title: '한 사람이 무너지지 않는 팀', body: '채용과 문서화로 대표·핵심 인력의 병목을 줄입니다.', tone: '#7dd3fc' },
  { label: 'MARKET', title: '반복 가능한 고객 획득', body: '우연한 매출을 설명 가능한 성장 루프로 바꿉니다.', tone: '#f9c66a' },
  { label: 'RUNWAY', title: '조급함을 줄이는 시간', body: '좋은 판단을 지킬 수 있는 운영 여유를 확보합니다.', tone: '#fb8da1' },
];

const EXTRA_GUARDRAILS: Record<PartnershipStoryKind, string[]> = {
  advertising: [
    '조회수를 위해 혐오·불안·오해를 고의로 키우지 않습니다.',
    '고객 데이터와 출연자의 동의 범위를 제작 전에 분명히 확인합니다.',
    '성과가 낮은 소재도 숨기지 않고 다음 판단에 쓸 수 있게 기록합니다.',
    '브랜드가 하지 않은 일을 한 것처럼 포장하지 않습니다.',
  ],
  investment: [
    '좋은 숫자만 골라 보여주거나 지표의 정의를 중간에 바꾸지 않습니다.',
    '실사 자료에는 담당자·기준일·출처를 남겨 사실과 전망을 구분합니다.',
    '협상 중에도 고객과 구성원의 안전을 담보로 무리한 성장을 약속하지 않습니다.',
    '투자 이후의 보고·의사결정·이해상충 원칙을 계약 전에 논의합니다.',
  ],
};

export function PartnershipStoryExperience({ page, kind }: PartnershipStoryExperienceProps) {
  const isAdvertising = kind === 'advertising';
  const accent = isAdvertising ? '#ffcf5a' : '#78f0ca';
  const accentSecondary = isAdvertising ? '#ff7f6e' : '#7dd3fc';
  const guardrails = [...page.checkpoints, ...EXTRA_GUARDRAILS[kind]];

  return (
    <Page id="content-area" aria-labelledby="partnership-story-title" $accent={accent} $secondary={accentSecondary}>
      <PageInner>
        <Hero>
          <HeroCopy>
            <Kicker $accent={accent}>
              {isAdvertising ? <Megaphone size={17} aria-hidden="true" /> : <Handshake size={17} aria-hidden="true" />}
              {isAdvertising ? 'PRO PIG · HEARTBEAT CAMPAIGN STUDIO' : 'PRO PIG · LONG-TERM INVESTOR ROOM'}
            </Kicker>
            <h1 id="partnership-story-title">
              {isAdvertising ? (
                <>광고비를 태우지 않고,<em>마음에 불을 붙입니다.</em></>
              ) : (
                <>돈보다 긴 질문을,<em>함께 나눌 투자자를 찾습니다.</em></>
              )}
            </h1>
            <HeroLead>
              {isAdvertising
                ? '사람은 광고를 보기 위해 하루를 시작하지 않습니다. 그래서 끼어드는 광고보다 기억하고 싶은 이야기를 만듭니다. 웃기되 가볍지 않고, 감성적이되 성과를 숨기지 않습니다.'
                : '투자는 통장에 찍히는 숫자보다 오래 남는 관계입니다. 잘될 때 박수만 보내는 분보다, 어려울 때 더 좋은 질문으로 다음 결정을 함께 만드는 파트너를 기다립니다.'}
            </HeroLead>
            <HeroActions>
              <PrimaryLink href={isAdvertising ? '#campaign-menu' : '#investment-thesis'} $accent={accent}>
                {isAdvertising ? '캠페인 메뉴 보기' : '투자 논리 살펴보기'}
                <ArrowRight size={17} aria-hidden="true" />
              </PrimaryLink>
              <GhostLink href="#partnership-contact">대화 시작하기</GhostLink>
            </HeroActions>
          </HeroCopy>

          <SignalBoard $accent={accent} $secondary={accentSecondary} aria-label={isAdvertising ? '캠페인 신호판' : '투자 동행 신호판'}>
            <SignalHeader>
              <span>{isAdvertising ? 'LIVE BRAND SIGNAL' : 'LONG-TERM SIGNAL'}</span>
              <b>ON AIR</b>
            </SignalHeader>
            <SignalCore>
              {isAdvertising ? <Megaphone size={34} aria-hidden="true" /> : <HeartHandshake size={34} aria-hidden="true" />}
              <strong>{isAdvertising ? 'BRAND ↔ PEOPLE' : 'FOUNDER ↔ PARTNER'}</strong>
              <p>{isAdvertising ? '노출보다 기억, 클릭보다 관계' : '자본보다 신뢰, 보고보다 대화'}</p>
            </SignalCore>
            <SignalRows>
              {(isAdvertising
                ? [['MESSAGE', '사람의 말'], ['MOMENT', '지금의 감정'], ['MEASURE', '다음 결정']]
                : [['TRUTH', '있는 그대로'], ['PACE', '지속 가능한 속도'], ['TRUST', '어려울 때 더 가까이']]
              ).map(([label, value]) => (
                <div key={label}><span>{label}</span><strong>{value}</strong><i /></div>
              ))}
            </SignalRows>
          </SignalBoard>
        </Hero>

        <PromiseStrip aria-label={`${page.title} 핵심 약속`}>
          {(isAdvertising
            ? [
                ['01', '재미는 시선을 부르고'],
                ['02', '진심은 마음을 남기고'],
                ['03', '데이터는 다음 편을 만듭니다'],
              ]
            : [
                ['01', '좋은 숫자는 근거와 함께'],
                ['02', '나쁜 소식은 더 빠르게'],
                ['03', '성장은 사람을 지키면서'],
              ]
          ).map(([number, text]) => <div key={number}><span>{number}</span><strong>{text}</strong></div>)}
        </PromiseStrip>

        {isAdvertising ? (
          <>
            <StorySection id="campaign-menu" aria-labelledby="campaign-menu-title">
              <SectionHeading>
                <span>01 · CAMPAIGN MENU</span>
                <h2 id="campaign-menu-title">무엇을 광고할지보다, 어떤 마음을 남길지.</h2>
                <p>브랜드의 사정과 고객의 하루가 만나는 방식에 따라 가장 어울리는 캠페인 메뉴를 고릅니다.</p>
              </SectionHeading>
              <StoryGrid>
                {ADVERTISING_FORMATS.map((card, index) => <StoryCardView key={card.title} card={card} index={index} accent={accent} />)}
              </StoryGrid>
            </StorySection>

            <EmotionSection aria-labelledby="advertising-emotion-title" $accent={accent}>
              <EmotionQuote>
                <span>THE HUMAN BRIEF</span>
                <blockquote id="advertising-emotion-title">“우리 제품을 알리고 싶어요”보다<br />“이 사람의 오늘을 조금 낫게 하고 싶어요”에서 시작합니다.</blockquote>
                <p>좋은 광고는 브랜드가 크게 말한 기록이 아니라, 누군가 자기 이야기처럼 조용히 저장한 장면이라고 믿습니다.</p>
              </EmotionQuote>
              <RadioPanel aria-label="광고 감정 주파수">
                <div><span>웃음</span><b style={{ width: '88%' }} /></div>
                <div><span>공감</span><b style={{ width: '96%' }} /></div>
                <div><span>과장</span><b style={{ width: '18%' }} /></div>
                <div><span>진심</span><b style={{ width: '100%' }} /></div>
                <small>※ 과장은 양념통에만 보관합니다.</small>
              </RadioPanel>
            </EmotionSection>

            <StorySection aria-labelledby="campaign-process-title">
              <SectionHeading>
                <span>02 · FROM FEELING TO RESULT</span>
                <h2 id="campaign-process-title">감정을 성과로 번역하는 5개의 장면</h2>
                <p>감성만 남거나 숫자만 남지 않도록, 마음과 실행을 같은 흐름에서 관리합니다.</p>
              </SectionHeading>
              <JourneyRail>{ADVERTISING_PROCESS.map((step) => <JourneyStepView key={step.number} step={step} accent={accent} />)}</JourneyRail>
            </StorySection>
          </>
        ) : (
          <>
            <FounderLetter aria-labelledby="founder-letter-title" $accent={accent}>
              <LetterMark><HeartHandshake size={32} aria-hidden="true" /></LetterMark>
              <div>
                <span>LETTER FROM THE BUILDER</span>
                <h2 id="founder-letter-title">좋은 날의 그래프보다, 어려운 날의 태도를 봐 주세요.</h2>
                <p>모든 달이 우상향하지는 않을 겁니다. 중요한 것은 숫자가 흔들릴 때 고객을 속이지 않고, 동료를 소모하지 않고, 문제를 더 정확히 배우는 팀인가 하는 점입니다.</p>
                <blockquote>“자금이 떨어질까 두려운 회사가 아니라, 신뢰가 떨어질까 더 두려운 회사를 만들겠습니다.”</blockquote>
              </div>
            </FounderLetter>

            <StorySection id="investment-thesis" aria-labelledby="investment-thesis-title">
              <SectionHeading>
                <span>01 · WHY THIS TEAM</span>
                <h2 id="investment-thesis-title">투자 검토실에 올리고 싶은 네 가지 증거</h2>
                <p>거대한 약속보다 문제, 실행, 경제성, 관계에 관한 작은 증거를 차곡차곡 보여드립니다.</p>
              </SectionHeading>
              <StoryGrid>{INVESTMENT_THESES.map((card, index) => <StoryCardView key={card.title} card={card} index={index} accent={accent} />)}</StoryGrid>
            </StorySection>

            <UseSection aria-labelledby="use-of-funds-title" $accent={accent}>
              <SectionHeading>
                <span>02 · CAPITAL WITH A JOB</span>
                <h2 id="use-of-funds-title">들어온 자금마다 맡을 일이 있어야 합니다.</h2>
                <p>아래는 투자금 사용의 우선순위를 논의하는 프레임입니다. 실제 비율과 집행안은 실사와 계약 과정에서 투명하게 확정합니다.</p>
              </SectionHeading>
              <UseGrid>
                {INVESTMENT_USE.map((item, index) => (
                  <UseCard key={item.label} $tone={item.tone}>
                    <span>{String(index + 1).padStart(2, '0')} · {item.label}</span>
                    <strong>{item.title}</strong>
                    <p>{item.body}</p>
                    <i aria-hidden="true" />
                  </UseCard>
                ))}
              </UseGrid>
            </UseSection>

            <QuestionCourt aria-labelledby="question-court-title">
              <QuestionIntro>
                <FileSearch size={28} aria-hidden="true" />
                <span>FRIENDLY DUE DILIGENCE</span>
                <h2 id="question-court-title">불편하지만 회사를 건강하게 만드는 질문들</h2>
                <p>정답을 꾸미는 대신 함께 자료를 열고 모르는 부분은 모른다고 답하겠습니다.</p>
              </QuestionIntro>
              <QuestionList>{INVESTMENT_QUESTIONS.map((question, index) => <li key={question}><span>{String(index + 1).padStart(2, '0')}</span><p>{question}</p></li>)}</QuestionList>
            </QuestionCourt>

            <StorySection aria-labelledby="investment-100-days-title">
              <SectionHeading>
                <span>03 · THE FIRST 100 DAYS</span>
                <h2 id="investment-100-days-title">투자 이후 더 가까워지는 100일</h2>
                <p>입금 후 연락이 뜸해지는 관계가 아니라, 가장 중요한 가설과 운영 체력을 함께 점검합니다.</p>
              </SectionHeading>
              <JourneyRail>{INVESTMENT_100_DAYS.map((step) => <JourneyStepView key={step.number} step={step} accent={accent} />)}</JourneyRail>
            </StorySection>
          </>
        )}

        <GuardrailSection aria-labelledby="partnership-guardrails-title">
          <SectionHeading>
            <span>{isAdvertising ? '03' : '04'} · PROMISES WE DO NOT HIDE</span>
            <h2 id="partnership-guardrails-title">재미와 성장보다 먼저 지킬 선</h2>
            <p>{page.description} 아래 기준은 멋진 문구가 아니라 실제 검토와 운영에서 사용하는 약속입니다.</p>
          </SectionHeading>
          <GuardrailGrid>
            {guardrails.map((item, index) => (
              <GuardrailCard key={item} $accent={accent}>
                {index < page.checkpoints.length ? <ShieldCheck size={19} aria-hidden="true" /> : <CheckCircle2 size={19} aria-hidden="true" />}
                <span>{String(index + 1).padStart(2, '0')}</span>
                <p>{item}</p>
              </GuardrailCard>
            ))}
          </GuardrailGrid>
        </GuardrailSection>

        <ContactSection id="partnership-contact" aria-labelledby="partnership-contact-title" $accent={accent}>
          <ContactCopy>
            <span>{isAdvertising ? 'SEND A STRANGE, HONEST BRIEF' : 'OPEN THE IR CONVERSATION'}</span>
            <h2 id="partnership-contact-title">
              {isAdvertising ? '완벽한 기획서보다, 진짜 고민 한 줄이면 충분합니다.' : '좋은 질문 하나를 들고 오시면, 있는 자료부터 함께 열겠습니다.'}
            </h2>
            <p>
              {isAdvertising
                ? '“예산은 작지만 사람을 웃게 하고 싶어요” 같은 솔직한 제안을 환영합니다. 목표·대상·가능한 일정만 알려주세요.'
                : '투자 단계, 관심 있는 논점, 확인하고 싶은 자료를 알려주시면 과장 없는 첫 대화를 준비하겠습니다.'}
            </p>
          </ContactCopy>
          <ContactAction href={`mailto:support@propig.com?subject=PRO%20PIG%20${isAdvertising ? '광고제휴' : '투자제휴'}%20문의`} $accent={accent}>
            <Mail size={20} aria-hidden="true" />
            <span><small>support@propig.com</small><strong>{isAdvertising ? '광고 이야기 시작하기' : '투자 대화 시작하기'}</strong></span>
            <ArrowRight size={20} aria-hidden="true" />
          </ContactAction>
        </ContactSection>
      </PageInner>
    </Page>
  );
}

function StoryCardView({ card, index, accent }: { card: StoryCard; index: number; accent: string }) {
  const Icon = card.icon;
  return (
    <StoryCardArticle $accent={accent}>
      <StoryCardTop><span>{String(index + 1).padStart(2, '0')} · {card.eyebrow}</span><Icon size={22} aria-hidden="true" /></StoryCardTop>
      <h3>{card.title}</h3>
      <p>{card.description}</p>
      <strong>{card.punchline}</strong>
    </StoryCardArticle>
  );
}

function JourneyStepView({ step, accent }: { step: JourneyStep; accent: string }) {
  return (
    <JourneyStepArticle $accent={accent}>
      <span>{step.number}</span><i aria-hidden="true" /><h3>{step.title}</h3><p>{step.description}</p>
    </JourneyStepArticle>
  );
}

const Page = styled.main<{ $accent: string; $secondary: string }>`
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: clamp(18px, 3vw, 36px);
  color: #f8faf7;
  background:
    radial-gradient(circle at 9% 7%, ${(props) => `${props.$accent}1d`}, transparent 28%),
    radial-gradient(circle at 92% 21%, ${(props) => `${props.$secondary}17`}, transparent 25%),
    linear-gradient(145deg, #070a09 0%, #0e1312 48%, #080a0a 100%);

  &,
  * {
    box-sizing: border-box;
    letter-spacing: 0;
  }
`;

const PageInner = styled.div`
  min-width: 0;
  width: min(100%, 1260px);
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: clamp(28px, 5vw, 70px);
`;

const Hero = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(330px, 0.65fr);
  gap: 16px;

  @media (max-width: 940px) { grid-template-columns: 1fr; }
`;

const HeroCopy = styled.div`
  min-width: 0;
  padding: clamp(28px, 5vw, 58px);
  border: 1px solid rgba(248, 250, 247, 0.12);
  border-radius: 22px 6px 22px 6px;
  background-color: rgba(5, 10, 8, 0.82);

  h1 {
    max-width: 840px;
    margin: 24px 0 0;
    color: #ffffff;
    font-size: clamp(2.4rem, 5.3vw, 5.45rem);
    line-height: 0.97;
    font-weight: 950;
    word-break: keep-all;
    text-wrap: balance;
  }

  h1 em { display: block; margin-top: 10px; color: rgba(248, 250, 247, 0.42); font-style: normal; }
`;

const Kicker = styled.span<{ $accent: string }>`
  width: fit-content;
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border: 1px solid ${(props) => `${props.$accent}68`};
  border-radius: 999px;
  color: ${(props) => props.$accent};
  background-color: ${(props) => `${props.$accent}0e`};
  font-size: 0.72rem;
  font-weight: 950;
`;

const HeroLead = styled.p`
  max-width: 820px;
  margin: 24px 0 0;
  color: rgba(248, 250, 247, 0.7);
  font-size: clamp(0.98rem, 1.6vw, 1.12rem);
  line-height: 1.78;
  word-break: keep-all;
  text-wrap: pretty;
`;

const HeroActions = styled.div`display: flex; flex-wrap: wrap; gap: 9px; margin-top: 28px;`;

const PrimaryLink = styled.a<{ $accent: string }>`
  min-height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px;
  border: 1px solid ${(props) => props.$accent};
  border-radius: 999px;
  color: #07100d;
  background-color: ${(props) => props.$accent};
  font-size: 0.84rem;
  font-weight: 950;
  text-decoration: none;
  transition: filter 180ms ease, transform 180ms ease;
  &:hover { filter: brightness(1.08); transform: translateY(-2px); }
  &:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
  @media (prefers-reduced-motion: reduce) { transition: none; &:hover { transform: none; } }
`;

const GhostLink = styled.a`
  min-height: 46px;
  display: inline-flex;
  align-items: center;
  padding: 10px 16px;
  border: 1px solid rgba(248, 250, 247, 0.16);
  border-radius: 999px;
  color: #fff;
  background-color: rgba(248, 250, 247, 0.04);
  font-size: 0.84rem;
  font-weight: 900;
  text-decoration: none;
  &:hover { background-color: rgba(248, 250, 247, 0.08); }
  &:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
`;

const SignalBoard = styled.aside<{ $accent: string; $secondary: string }>`
  min-width: 0;
  min-height: 430px;
  display: flex;
  flex-direction: column;
  padding: 24px;
  border: 1px solid ${(props) => `${props.$accent}62`};
  border-radius: 6px 22px 6px 22px;
  color: ${(props) => props.$accent};
  background:
    linear-gradient(160deg, ${(props) => `${props.$accent}16`}, transparent 46%),
    linear-gradient(340deg, ${(props) => `${props.$secondary}10`}, transparent 52%),
    #090e0c;

  @media (max-width: 940px) { min-height: 340px; }
`;

const SignalHeader = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  > span { color: rgba(248, 250, 247, 0.52); font-size: 0.66rem; font-weight: 950; }
  b { color: #07100d; background-color: #78f0ca; padding: 5px 8px; border-radius: 999px; font-size: 0.62rem; }
`;

const SignalCore = styled.div`
  display: grid; gap: 11px; margin: auto 0 24px;
  strong { color: #fff; font-size: clamp(1.75rem, 3vw, 2.6rem); line-height: 1; font-weight: 950; word-break: keep-all; }
  p { margin: 0; color: rgba(248, 250, 247, 0.62); line-height: 1.55; }
`;

const SignalRows = styled.div`
  display: grid; gap: 1px; background-color: rgba(248, 250, 247, 0.08);
  div { display: grid; grid-template-columns: 78px minmax(0, 1fr) 28px; gap: 10px; align-items: center; padding: 11px; background-color: #0b110f; }
  span { color: rgba(248, 250, 247, 0.4); font-size: 0.62rem; font-weight: 950; }
  strong { color: #fff; font-size: 0.78rem; font-weight: 900; }
  i { width: 7px; height: 7px; justify-self: end; border-radius: 50%; background-color: currentColor; box-shadow: 0 0 12px currentColor; }
`;

const PromiseStrip = styled.section`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-top: 1px solid rgba(248, 250, 247, 0.12);
  border-bottom: 1px solid rgba(248, 250, 247, 0.12);
  div { min-width: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 12px; padding: 22px; border-right: 1px solid rgba(248, 250, 247, 0.1); }
  div:last-child { border-right: 0; }
  span { color: rgba(248, 250, 247, 0.34); font-size: 0.7rem; font-weight: 950; }
  strong { color: #fff; line-height: 1.45; font-weight: 900; word-break: keep-all; }
  @media (max-width: 720px) { grid-template-columns: 1fr; div { border-right: 0; border-bottom: 1px solid rgba(248, 250, 247, 0.1); } div:last-child { border-bottom: 0; } }
`;

const StorySection = styled.section`
  min-width: 0;
  scroll-margin-top: 24px;
  content-visibility: auto;
  contain-intrinsic-size: 760px;
`;

const SectionHeading = styled.header`
  max-width: 900px;
  > span { color: rgba(248, 250, 247, 0.45); font-size: 0.68rem; font-weight: 950; }
  h2 { margin: 9px 0 0; color: #fff; font-size: clamp(1.8rem, 3.5vw, 3.35rem); line-height: 1.06; font-weight: 950; word-break: keep-all; text-wrap: balance; }
  p { max-width: 780px; margin: 14px 0 0; color: rgba(248, 250, 247, 0.62); line-height: 1.7; word-break: keep-all; text-wrap: pretty; }
`;

const StoryGrid = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 24px;
  @media (max-width: 760px) { grid-template-columns: 1fr; }
`;

const StoryCardArticle = styled.article<{ $accent: string }>`
  min-width: 0; min-height: 270px; display: flex; flex-direction: column; padding: clamp(22px, 3vw, 30px);
  border: 1px solid rgba(248, 250, 247, 0.11); border-top-color: ${(props) => `${props.$accent}6c`}; border-radius: 6px 18px 6px 18px;
  background: linear-gradient(150deg, ${(props) => `${props.$accent}0e`}, transparent 48%), rgba(248, 250, 247, 0.035);
  h3 { margin: 28px 0 0; color: #fff; font-size: clamp(1.3rem, 2.3vw, 1.8rem); line-height: 1.18; font-weight: 950; word-break: keep-all; }
  p { margin: 13px 0 0; color: rgba(248, 250, 247, 0.65); line-height: 1.66; word-break: keep-all; }
  > strong { margin-top: auto; padding-top: 24px; color: ${(props) => props.$accent}; font-size: 0.82rem; line-height: 1.5; word-break: keep-all; }
`;

const StoryCardTop = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: 12px; color: rgba(248, 250, 247, 0.48);
  span { font-size: 0.66rem; font-weight: 950; }
`;

const EmotionSection = styled.section<{ $accent: string }>`
  display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(280px, 0.55fr); gap: 16px; align-items: stretch;
  padding: clamp(24px, 4vw, 46px); border: 1px solid ${(props) => `${props.$accent}52`}; border-radius: 24px 6px 24px 6px;
  background: linear-gradient(130deg, ${(props) => `${props.$accent}13`}, transparent 48%), #0a0f0d;
  @media (max-width: 820px) { grid-template-columns: 1fr; }
`;

const EmotionQuote = styled.div`
  > span { color: rgba(248, 250, 247, 0.43); font-size: 0.68rem; font-weight: 950; }
  blockquote { margin: 18px 0 0; color: #fff; font-size: clamp(1.65rem, 3.1vw, 2.8rem); line-height: 1.22; font-weight: 950; word-break: keep-all; text-wrap: balance; }
  p { max-width: 720px; margin: 18px 0 0; color: rgba(248, 250, 247, 0.64); line-height: 1.7; word-break: keep-all; }
`;

const RadioPanel = styled.div`
  display: grid; gap: 15px; align-content: center; padding: 24px; border: 1px solid rgba(248, 250, 247, 0.1); background-color: rgba(248, 250, 247, 0.035);
  div { display: grid; grid-template-columns: 52px minmax(0, 1fr); gap: 10px; align-items: center; }
  span { color: rgba(248, 250, 247, 0.67); font-size: 0.75rem; font-weight: 900; }
  div::after { content: ''; grid-column: 2; grid-row: 1; height: 7px; border-radius: 99px; background-color: rgba(248, 250, 247, 0.08); }
  b { z-index: 1; grid-column: 2; grid-row: 1; height: 7px; border-radius: 99px; background-color: #ffcf5a; }
  small { margin-top: 8px; color: rgba(248, 250, 247, 0.42); font-size: 0.68rem; }
`;

const JourneyRail = styled.div`
  display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 0; margin-top: 28px;
  @media (max-width: 940px) { grid-template-columns: 1fr; }
`;

const JourneyStepArticle = styled.article<{ $accent: string }>`
  position: relative; min-width: 0; padding: 22px; border-top: 1px solid ${(props) => `${props.$accent}5c`}; border-right: 1px solid rgba(248, 250, 247, 0.09);
  > span { color: ${(props) => props.$accent}; font-size: 0.7rem; font-weight: 950; }
  i { display: block; width: 9px; height: 9px; margin-top: 16px; border-radius: 50%; background-color: ${(props) => props.$accent}; box-shadow: 0 0 0 6px ${(props) => `${props.$accent}13`}; }
  h3 { margin: 22px 0 0; color: #fff; font-size: 1.08rem; line-height: 1.3; font-weight: 950; word-break: keep-all; }
  p { margin: 10px 0 0; color: rgba(248, 250, 247, 0.58); font-size: 0.84rem; line-height: 1.6; word-break: keep-all; }
  @media (max-width: 940px) { display: grid; grid-template-columns: 52px minmax(0, 1fr); gap: 5px 14px; border-right: 0; h3 { margin: 0; } p { grid-column: 2; } i { display: none; } }
`;

const FounderLetter = styled.section<{ $accent: string }>`
  display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 24px; padding: clamp(26px, 4vw, 48px);
  border: 1px solid ${(props) => `${props.$accent}58`}; border-radius: 24px 6px 24px 6px; background: linear-gradient(135deg, ${(props) => `${props.$accent}12`}, transparent 54%), #09100d;
  > div:last-child > span { color: ${(props) => props.$accent}; font-size: 0.68rem; font-weight: 950; }
  h2 { margin: 11px 0 0; color: #fff; font-size: clamp(1.75rem, 3.5vw, 3.25rem); line-height: 1.08; font-weight: 950; word-break: keep-all; text-wrap: balance; }
  p { max-width: 900px; margin: 17px 0 0; color: rgba(248, 250, 247, 0.66); line-height: 1.74; word-break: keep-all; }
  blockquote { margin: 24px 0 0; padding-left: 18px; border-left: 3px solid ${(props) => props.$accent}; color: #fff; font-size: 1.05rem; line-height: 1.7; font-weight: 900; word-break: keep-all; }
  @media (max-width: 620px) { grid-template-columns: 1fr; }
`;

const LetterMark = styled.div`
  width: 64px; height: 64px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid rgba(120, 240, 202, 0.54); border-radius: 20px 6px 20px 6px; color: #78f0ca; background-color: rgba(120, 240, 202, 0.09);
`;

const UseSection = styled.section<{ $accent: string }>`
  padding: clamp(24px, 4vw, 44px); border: 1px solid ${(props) => `${props.$accent}42`}; border-radius: 6px 22px 6px 22px; background-color: #090f0d;
`;

const UseGrid = styled.div`
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-top: 26px;
  @media (max-width: 940px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 580px) { grid-template-columns: 1fr; }
`;

const UseCard = styled.article<{ $tone: string }>`
  min-width: 0; min-height: 210px; display: flex; flex-direction: column; padding: 20px; border: 1px solid ${(props) => `${props.$tone}45`}; background-color: rgba(248, 250, 247, 0.025);
  span { color: ${(props) => props.$tone}; font-size: 0.66rem; font-weight: 950; }
  strong { margin-top: 18px; color: #fff; font-size: 1.15rem; line-height: 1.3; font-weight: 950; word-break: keep-all; }
  p { margin: 10px 0 0; color: rgba(248, 250, 247, 0.58); font-size: 0.84rem; line-height: 1.6; word-break: keep-all; }
  i { width: 100%; height: 5px; margin-top: auto; background-color: ${(props) => props.$tone}; transform-origin: left; }
`;

const QuestionCourt = styled.section`
  display: grid; grid-template-columns: minmax(280px, 0.58fr) minmax(0, 1fr); gap: 18px; align-items: start;
  @media (max-width: 860px) { grid-template-columns: 1fr; }
`;

const QuestionIntro = styled.header`
  position: sticky; top: 20px; padding: 26px; border: 1px solid rgba(125, 211, 252, 0.36); border-radius: 18px 5px 18px 5px; color: #7dd3fc; background-color: #0a1113;
  span { display: block; margin-top: 24px; color: rgba(248, 250, 247, 0.44); font-size: 0.66rem; font-weight: 950; }
  h2 { margin: 9px 0 0; color: #fff; font-size: clamp(1.6rem, 3vw, 2.55rem); line-height: 1.1; font-weight: 950; word-break: keep-all; }
  p { margin: 14px 0 0; color: rgba(248, 250, 247, 0.62); line-height: 1.65; word-break: keep-all; }
  @media (max-width: 860px) { position: static; }
`;

const QuestionList = styled.ol`
  display: grid; gap: 9px; margin: 0; padding: 0; list-style: none;
  li { min-width: 0; min-height: 92px; display: grid; grid-template-columns: 38px minmax(0, 1fr); gap: 13px; align-items: center; padding: 20px; border: 1px solid rgba(248, 250, 247, 0.1); background-color: rgba(248, 250, 247, 0.035); }
  span { color: #78f0ca; font-size: 0.7rem; font-weight: 950; }
  p { margin: 0; color: #fff; font-size: 0.97rem; line-height: 1.55; font-weight: 850; word-break: keep-all; }
`;

const GuardrailSection = styled.section`content-visibility: auto; contain-intrinsic-size: 620px;`;

const GuardrailGrid = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; margin-top: 24px;
  @media (max-width: 720px) { grid-template-columns: 1fr; }
`;

const GuardrailCard = styled.article<{ $accent: string }>`
  min-width: 0; min-height: 96px; display: grid; grid-template-columns: auto auto minmax(0, 1fr); gap: 11px; align-items: start; padding: 18px; border: 1px solid rgba(248, 250, 247, 0.1); border-left-color: ${(props) => props.$accent}; background-color: rgba(248, 250, 247, 0.035);
  svg { margin-top: 2px; color: ${(props) => props.$accent}; }
  span { color: rgba(248, 250, 247, 0.34); font-size: 0.68rem; font-weight: 950; }
  p { margin: 0; color: rgba(248, 250, 247, 0.72); line-height: 1.58; word-break: keep-all; }
`;

const ContactSection = styled.section<{ $accent: string }>`
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(290px, 0.46fr); gap: 24px; align-items: end; padding: clamp(26px, 5vw, 54px); border: 1px solid ${(props) => `${props.$accent}66`}; border-radius: 24px 6px 24px 6px; background: linear-gradient(135deg, ${(props) => `${props.$accent}16`}, transparent 52%), #090f0d; scroll-margin-top: 24px;
  @media (max-width: 860px) { grid-template-columns: 1fr; }
`;

const ContactCopy = styled.div`
  span { color: rgba(248, 250, 247, 0.46); font-size: 0.68rem; font-weight: 950; }
  h2 { max-width: 800px; margin: 10px 0 0; color: #fff; font-size: clamp(1.75rem, 3.4vw, 3.1rem); line-height: 1.08; font-weight: 950; word-break: keep-all; text-wrap: balance; }
  p { max-width: 760px; margin: 16px 0 0; color: rgba(248, 250, 247, 0.62); line-height: 1.7; word-break: keep-all; }
`;

const ContactAction = styled.a<{ $accent: string }>`
  min-width: 0; min-height: 88px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 18px; border: 1px solid ${(props) => props.$accent}; border-radius: 8px; color: #07100d; background-color: ${(props) => props.$accent}; text-decoration: none;
  span { min-width: 0; }
  small, strong { display: block; overflow-wrap: anywhere; }
  small { font-size: 0.67rem; font-weight: 850; opacity: 0.7; }
  strong { margin-top: 3px; font-size: 0.92rem; font-weight: 950; }
  &:hover { filter: brightness(1.06); }
  &:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
`;
