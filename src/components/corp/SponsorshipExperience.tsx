'use client';

import {
  ArrowDown,
  Banknote,
  CheckCircle2,
  Clock3,
  Coffee,
  Copy,
  Gift,
  HeartHandshake,
  Home,
  MessageCircle,
  PiggyBank,
  ReceiptText,
  Route,
  ShieldCheck,
  Sparkles,
  Soup,
  WalletCards,
} from 'lucide-react';
import { useState } from 'react';
import styled from 'styled-components';
import type { CorpPageDefinition } from '@/constants/corpPages';

interface SponsorshipExperienceProps {
  page: CorpPageDefinition;
}

const DONATION_ACCOUNT = {
  bank: '은행명 등록 예정',
  number: '000-0000-0000-00',
  holder: '예금주 등록 예정',
};

const SPENDING_ITEMS = [
  {
    icon: Home,
    label: '월세 생존권',
    value: '천장이 있는 사무실 겸 방',
    tone: '#f5c766',
  },
  {
    icon: Soup,
    label: '밥값 방어선',
    value: '회의 전 국밥, 회의 후 김밥',
    tone: '#5eead4',
  },
  {
    icon: Coffee,
    label: '카페인 연구비',
    value: '새벽 배포를 위한 합법 연료',
    tone: '#fb7185',
  },
];

const SUPPORT_LEVELS = [
  {
    amount: '3,000원부터',
    title: '커피 동료',
    body: '졸린 오후 한 시간을 깨우고, 미뤄둔 오류 한 줄을 다시 보게 합니다.',
    tone: '#fb7185',
  },
  {
    amount: '10,000원부터',
    title: '든든한 한 끼',
    body: '배고픔보다 아이디어를 먼저 생각할 수 있는 저녁 한 끼가 됩니다.',
    tone: '#5eead4',
  },
  {
    amount: '30,000원부터',
    title: '반나절의 집중',
    body: '급한 생계 걱정을 잠시 내려놓고 제품 하나를 끝까지 다듬는 시간이 됩니다.',
    tone: '#7dd3fc',
  },
  {
    amount: '100,000원부터',
    title: '한 달의 숨',
    body: '서버비와 생활비 사이에서 포기 대신 다음 업데이트를 선택할 여유가 됩니다.',
    tone: '#f5c766',
  },
];

const SUPPORT_LOOP = [
  { number: '01', title: '마음이 도착합니다', body: '크고 작음을 따지기 전에 한 사람이 다른 사람의 계속을 응원한 마음으로 받습니다.' },
  { number: '02', title: '오늘을 지킵니다', body: '밥, 월세, 커피처럼 숨길 이유 없는 현실을 버티는 데 먼저 보탭니다.' },
  { number: '03', title: '서비스에 돌아옵니다', body: '버틴 시간은 더 나은 화면, 덜 불편한 흐름, 오래 살아남는 기능으로 되돌아옵니다.' },
  { number: '04', title: '기록으로 남깁니다', body: '좋았던 일뿐 아니라 늦어진 이유와 실패한 시도도 가능한 범위에서 솔직하게 공유합니다.' },
];

export function SponsorshipExperience({ page }: SponsorshipExperienceProps) {
  const [copied, setCopied] = useState(false);
  const accountText = `${DONATION_ACCOUNT.bank} ${DONATION_ACCOUNT.number} ${DONATION_ACCOUNT.holder}`;

  const copyAccount = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      return;
    }

    await navigator.clipboard.writeText(accountText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Page id="content-area" aria-labelledby="sponsorship-title">
      <PageInner>
        <Hero>
          <HeroCopy>
            <Kicker>
              <PiggyBank size={17} strokeWidth={2.4} aria-hidden="true" />
              Personal Survival Sponsor
            </Kicker>
            <h1 id="sponsorship-title">{page.title}</h1>
            <p>
              후원금은 거창한 연구재단으로 순간이동하지 않습니다. 운영자가 밥 먹고, 월세 내고, 커피 마시며
              서비스를 계속 만지는 생활비에 조용히 합류합니다.
            </p>
          </HeroCopy>

          <ReceiptPanel aria-label="후원금 사용처 요약">
            <ReceiptTop>
              <ReceiptText size={27} strokeWidth={2.2} aria-hidden="true" />
              <span>영수증 같은 진실</span>
            </ReceiptTop>
            <strong>생활비</strong>
            <p>투명성은 높은데 품격은 일부러 낮춘 후원 안내입니다.</p>
          </ReceiptPanel>
        </Hero>

        <SpendingGrid aria-label="후원금 사용처">
          {SPENDING_ITEMS.map((item) => {
            const ItemIcon = item.icon;

            return (
              <SpendingCard key={item.label} $tone={item.tone}>
                <ItemIcon size={24} strokeWidth={2.35} aria-hidden="true" />
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </SpendingCard>
            );
          })}
        </SpendingGrid>

        <MainSection>
          <AccountPanel id="sponsorship-account" aria-labelledby="sponsorship-account-title">
            <AccountHead>
              <Banknote size={24} strokeWidth={2.35} aria-hidden="true" />
              <span>
                <small>후원하기</small>
                <strong id="sponsorship-account-title">계좌번호</strong>
              </span>
            </AccountHead>

            <AccountRows>
              <AccountRow>
                <span>은행</span>
                <strong>{DONATION_ACCOUNT.bank}</strong>
              </AccountRow>
              <AccountRow>
                <span>계좌</span>
                <strong>{DONATION_ACCOUNT.number}</strong>
              </AccountRow>
              <AccountRow>
                <span>예금주</span>
                <strong>{DONATION_ACCOUNT.holder}</strong>
              </AccountRow>
            </AccountRows>

            <CopyButton type="button" onClick={() => void copyAccount()} aria-label="후원 계좌 정보 복사" aria-live="polite">
              <Copy size={17} strokeWidth={2.5} aria-hidden="true" />
              {copied ? '복사됨' : '계좌정보 복사'}
            </CopyButton>

            <AccountNote>
              실제 송금 계좌가 확정되면 위 3줄만 바꾸면 됩니다. 지금은 잘못된 입금을 막기 위한 등록 예정 표기입니다.
            </AccountNote>
          </AccountPanel>

          <PromisePanel aria-label="후원 안내">
            <PromiseItem>
              <ShieldCheck size={21} strokeWidth={2.35} aria-hidden="true" />
              <span>숨기지 않습니다</span>
              <p>후원금은 운영자의 개인 생활비와 서비스 유지에 보탭니다.</p>
            </PromiseItem>
            <PromiseItem>
              <Sparkles size={21} strokeWidth={2.35} aria-hidden="true" />
              <span>대단한 리워드는 없습니다</span>
              <p>대신 화면 어딘가가 조금 더 오래 살아남을 가능성이 생깁니다.</p>
            </PromiseItem>
            <PromiseItem>
              <WalletCards size={21} strokeWidth={2.35} aria-hidden="true" />
              <span>소액도 충분합니다</span>
              <p>커피 한 잔이면 하루치 디버깅 표정이 달라집니다.</p>
            </PromiseItem>
          </PromisePanel>
        </MainSection>

        <LevelSection aria-labelledby="support-level-title">
          <SectionHead>
            <span>01 · SMALL MONEY, LONG BREATH</span>
            <h2 id="support-level-title">금액표가 아니라,<br />살아남는 시간표입니다.</h2>
            <p>
              아래 금액은 상품 가격도, 리워드 등급도 아닙니다. 작은 응원이 현실에서 어떤 시간으로
              번역될 수 있는지 보여주는 다정한 예시입니다.
            </p>
          </SectionHead>
          <LevelGrid>
            {SUPPORT_LEVELS.map((level, index) => (
              <LevelCard key={level.title} $tone={level.tone}>
                <span>{String(index + 1).padStart(2, '0')} · {level.amount}</span>
                <strong>{level.title}</strong>
                <p>{level.body}</p>
                <i aria-hidden="true" />
              </LevelCard>
            ))}
          </LevelGrid>
        </LevelSection>

        <LoopSection aria-labelledby="support-loop-title">
          <LoopIntro>
            <Route size={28} strokeWidth={2.3} aria-hidden="true" />
            <span>02 · THE SURVIVAL LOOP</span>
            <h2 id="support-loop-title">후원 한 번이<br />다음 화면이 되기까지</h2>
            <p>입금 알림에서 끝나지 않고, 운영자의 하루를 지나 다시 사용자 경험으로 돌아오는 순환입니다.</p>
          </LoopIntro>
          <LoopList>
            {SUPPORT_LOOP.map((step) => (
              <LoopItem key={step.number}>
                <span>{step.number}</span>
                <div><strong>{step.title}</strong><p>{step.body}</p></div>
                <ArrowDown size={18} aria-hidden="true" />
              </LoopItem>
            ))}
          </LoopList>
        </LoopSection>

        <LetterSection aria-labelledby="sponsor-letter-title">
          <LetterIcon><HeartHandshake size={30} strokeWidth={2.2} aria-hidden="true" /></LetterIcon>
          <div>
            <span>03 · A LETTER TO ONE PERSON</span>
            <h2 id="sponsor-letter-title">“계속 만들어주세요”라는 말은<br />생각보다 오래 사람을 움직입니다.</h2>
            <p>
              화면 뒤에도 밥을 거르고, 버그 앞에서 머리를 쥐어뜯고, 그래도 누군가 편해질 장면을 상상하며
              다시 키보드를 잡는 사람이 있습니다. 후원은 완벽한 서비스를 사는 돈이 아니라, 아직 완벽하지
              않아도 포기하지 말라는 조용한 편지에 가깝습니다.
            </p>
            <blockquote>이름을 남기지 않아도 괜찮습니다. 보내주신 마음은 다음 업데이트 어딘가에 오래 남습니다.</blockquote>
          </div>
        </LetterSection>

        <TransparencySection aria-labelledby="sponsor-transparency-title">
          <SectionHead>
            <span>04 · PROMISES WITH RECEIPTS</span>
            <h2 id="sponsor-transparency-title">고마움만 말하지 않고,<br />운영의 약속도 함께 적습니다.</h2>
            <p>{page.description} 아래 원칙은 페이지 장식이 아니라 후원을 받을 때 지켜야 할 최소한의 기준입니다.</p>
          </SectionHead>
          <TransparencyGrid>
            {[...page.checkpoints,
              '후원 여부에 따라 서비스의 기본 접근권이나 답변 순서를 차별하지 않습니다.',
              '계좌와 사용 기준이 확정되기 전에는 송금을 유도하지 않습니다.',
              '운영이 중단되거나 목적이 크게 바뀌면 가능한 범위에서 먼저 알립니다.',
            ].map((promise, index) => (
              <TransparencyCard key={promise}>
                {index < page.checkpoints.length ? <ShieldCheck size={19} aria-hidden="true" /> : <CheckCircle2 size={19} aria-hidden="true" />}
                <span>{String(index + 1).padStart(2, '0')}</span>
                <p>{promise}</p>
              </TransparencyCard>
            ))}
          </TransparencyGrid>
        </TransparencySection>

        <ClosingSection aria-labelledby="sponsor-closing-title">
          <ClosingCopy>
            <span>STAY FOR THE NEXT UPDATE</span>
            <h2 id="sponsor-closing-title">오늘의 후원이<br />내일의 “업데이트 완료”가 됩니다.</h2>
            <p>당장 후원하지 않아도 괜찮습니다. 한 번 더 찾아오고, 한 사람에게 소개하고, 응원 한마디를 남기는 일도 충분히 큰 힘입니다.</p>
          </ClosingCopy>
          <ClosingActions>
            <a href="#sponsorship-account"><Gift size={19} aria-hidden="true" />후원 안내 다시 보기</a>
            <span><Clock3 size={18} aria-hidden="true" />서두르지 않는 응원도 환영합니다.</span>
            <span><MessageCircle size={18} aria-hidden="true" />짧은 한마디도 오래 읽습니다.</span>
          </ClosingActions>
        </ClosingSection>
      </PageInner>
    </Page>
  );
}

const Page = styled.main`
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 28px;
  color: #fff8e7;
  background:
    linear-gradient(135deg, rgba(15, 14, 11, 0.98) 0%, rgba(24, 28, 24, 0.98) 48%, rgba(14, 18, 18, 1) 100%),
    repeating-linear-gradient(90deg, rgba(245, 199, 102, 0.1) 0 1px, transparent 1px 88px),
    repeating-linear-gradient(0deg, rgba(94, 234, 212, 0.06) 0 1px, transparent 1px 72px);

  @media (max-width: 760px) {
    padding: 16px;
  }
`;

const PageInner = styled.div`
  min-width: 0;
  width: min(100%, 1240px);
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 18px;
`;

const Hero = styled.section`
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(250px, 340px);
  gap: 18px;
  align-items: stretch;

  @media (max-width: 880px) {
    grid-template-columns: 1fr;
  }
`;

const HeroCopy = styled.div`
  min-width: 0;
  padding: 34px;
  border: 1px solid rgba(255, 248, 231, 0.13);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(245, 199, 102, 0.12), rgba(94, 234, 212, 0.055)),
    rgba(255, 248, 231, 0.045);

  h1 {
    margin: 16px 0 0;
    color: #ffffff;
    font-size: 2.55rem;
    line-height: 1.08;
    font-weight: 950;
    letter-spacing: 0;
    word-break: keep-all;
  }

  p {
    max-width: 790px;
    margin: 16px 0 0;
    color: rgba(255, 248, 231, 0.75);
    font-size: 1.02rem;
    line-height: 1.74;
    word-break: keep-all;
  }

  @media (max-width: 760px) {
    padding: 24px;

    h1 {
      font-size: 2rem;
    }
  }
`;

const Kicker = styled.span`
  display: inline-flex;
  width: fit-content;
  min-height: 34px;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid rgba(245, 199, 102, 0.42);
  border-radius: 999px;
  color: #f5c766;
  background: rgba(245, 199, 102, 0.1);
  font-size: 0.78rem;
  font-weight: 950;
  letter-spacing: 0;
`;

const ReceiptPanel = styled.aside`
  min-width: 0;
  min-height: 238px;
  padding: 24px;
  border: 1px dashed rgba(245, 199, 102, 0.52);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  background:
    linear-gradient(180deg, rgba(255, 248, 231, 0.11), rgba(255, 248, 231, 0.045)),
    rgba(12, 14, 13, 0.78);

  strong {
    margin-top: 18px;
    color: #ffffff;
    font-size: 3rem;
    line-height: 0.95;
    font-weight: 950;
    letter-spacing: 0;
  }

  p {
    margin: 14px 0 0;
    color: rgba(255, 248, 231, 0.68);
    line-height: 1.6;
    word-break: keep-all;
  }
`;

const ReceiptTop = styled.span`
  display: flex;
  align-items: center;
  gap: 10px;
  color: #5eead4;
  font-size: 0.84rem;
  font-weight: 950;
`;

const SpendingGrid = styled.section`
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const SpendingCard = styled.article<{ $tone: string }>`
  min-width: 0;
  min-height: 160px;
  padding: 20px;
  border: 1px solid ${(props) => `${props.$tone}55`};
  border-radius: 8px;
  display: grid;
  gap: 12px;
  align-content: start;
  background:
    linear-gradient(145deg, ${(props) => `${props.$tone}16`}, rgba(255, 248, 231, 0.035)),
    rgba(14, 16, 14, 0.82);

  svg {
    color: ${(props) => props.$tone};
  }

  span {
    color: rgba(255, 248, 231, 0.56);
    font-size: 0.78rem;
    font-weight: 950;
  }

  strong {
    color: #ffffff;
    font-size: 1.22rem;
    line-height: 1.28;
    font-weight: 950;
    letter-spacing: 0;
    word-break: keep-all;
  }
`;

const MainSection = styled.section`
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(310px, 420px) minmax(0, 1fr);
  gap: 18px;
  align-items: stretch;

  @media (max-width: 940px) {
    grid-template-columns: 1fr;
  }
`;

const AccountPanel = styled.aside`
  min-width: 0;
  padding: 24px;
  border: 1px solid rgba(245, 199, 102, 0.46);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(245, 199, 102, 0.13), rgba(255, 248, 231, 0.045)),
    rgba(13, 14, 12, 0.9);
`;

const AccountHead = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
  color: #f5c766;

  > span {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  small {
    color: rgba(255, 248, 231, 0.55);
    font-size: 0.76rem;
    font-weight: 950;
  }

  strong {
    color: #ffffff;
    font-size: 1.45rem;
    line-height: 1.16;
    font-weight: 950;
    letter-spacing: 0;
  }
`;

const AccountRows = styled.dl`
  display: grid;
  gap: 10px;
  margin: 22px 0 0;
`;

const AccountRow = styled.div`
  min-width: 0;
  padding: 14px 0;
  border-bottom: 1px solid rgba(255, 248, 231, 0.11);
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 12px;
  align-items: baseline;

  span {
    color: rgba(255, 248, 231, 0.52);
    font-size: 0.78rem;
    font-weight: 950;
  }

  strong {
    color: #ffffff;
    font-size: 1rem;
    line-height: 1.35;
    font-weight: 900;
    letter-spacing: 0;
    overflow-wrap: anywhere;
  }
`;

const CopyButton = styled.button`
  width: 100%;
  min-height: 44px;
  margin-top: 18px;
  border: 1px solid rgba(94, 234, 212, 0.48);
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #06110f;
  background: #5eead4;
  font-size: 0.88rem;
  font-weight: 950;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid #ffffff;
    outline-offset: 2px;
  }
`;

const AccountNote = styled.p`
  margin: 14px 0 0;
  color: rgba(255, 248, 231, 0.6);
  font-size: 0.86rem;
  line-height: 1.62;
  word-break: keep-all;
`;

const PromisePanel = styled.div`
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 1120px) {
    grid-template-columns: 1fr;
  }
`;

const PromiseItem = styled.article`
  min-width: 0;
  min-height: 220px;
  padding: 22px;
  border: 1px solid rgba(255, 248, 231, 0.12);
  border-radius: 8px;
  background: rgba(255, 248, 231, 0.052);

  svg {
    color: #fb7185;
  }

  span {
    display: block;
    margin-top: 22px;
    color: #ffffff;
    font-size: 1.08rem;
    line-height: 1.25;
    font-weight: 950;
    letter-spacing: 0;
    word-break: keep-all;
  }

  p {
    margin: 12px 0 0;
    color: rgba(255, 248, 231, 0.69);
    line-height: 1.66;
    word-break: keep-all;
  }
`;

const SectionHead = styled.header`
  max-width: 850px;

  > span {
    color: #5eead4;
    font-size: 0.7rem;
    font-weight: 950;
  }

  h2 {
    margin: 10px 0 0;
    color: #ffffff;
    font-size: clamp(1.8rem, 4vw, 3.35rem);
    line-height: 1.06;
    font-weight: 950;
    word-break: keep-all;
    text-wrap: balance;
  }

  p {
    max-width: 760px;
    margin: 16px 0 0;
    color: rgba(255, 248, 231, 0.67);
    line-height: 1.72;
    word-break: keep-all;
  }
`;

const LevelSection = styled.section`
  padding: clamp(26px, 5vw, 52px);
  border: 1px solid rgba(94, 234, 212, 0.25);
  border-radius: 22px 6px 22px 6px;
  background:
    radial-gradient(circle at 88% 10%, rgba(94, 234, 212, 0.12), transparent 30%),
    rgba(255, 248, 231, 0.035);
  content-visibility: auto;
  contain-intrinsic-size: 650px;
`;

const LevelGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: 28px;

  @media (max-width: 980px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 580px) {
    grid-template-columns: 1fr;
  }
`;

const LevelCard = styled.article<{ $tone: string }>`
  min-width: 0;
  min-height: 225px;
  display: flex;
  flex-direction: column;
  padding: 20px;
  border: 1px solid ${(props) => `${props.$tone}4d`};
  background: linear-gradient(145deg, ${(props) => `${props.$tone}12`}, rgba(255, 248, 231, 0.025));

  span {
    color: ${(props) => props.$tone};
    font-size: 0.68rem;
    font-weight: 950;
  }

  strong {
    margin-top: 20px;
    color: #ffffff;
    font-size: 1.3rem;
    font-weight: 950;
  }

  p {
    margin: 11px 0 0;
    color: rgba(255, 248, 231, 0.64);
    font-size: 0.88rem;
    line-height: 1.65;
    word-break: keep-all;
  }

  i {
    width: 100%;
    height: 5px;
    margin-top: auto;
    background: ${(props) => props.$tone};
  }
`;

const LoopSection = styled.section`
  display: grid;
  grid-template-columns: minmax(270px, 0.58fr) minmax(0, 1fr);
  gap: 18px;
  align-items: start;
  content-visibility: auto;
  contain-intrinsic-size: 620px;

  @media (max-width: 880px) {
    grid-template-columns: 1fr;
  }
`;

const LoopIntro = styled.header`
  position: sticky;
  top: 20px;
  padding: 28px;
  border: 1px solid rgba(245, 199, 102, 0.35);
  border-radius: 18px 5px 18px 5px;
  color: #f5c766;
  background: rgba(17, 17, 14, 0.94);

  > span {
    display: block;
    margin-top: 26px;
    color: rgba(255, 248, 231, 0.46);
    font-size: 0.68rem;
    font-weight: 950;
  }

  h2 {
    margin: 10px 0 0;
    color: #ffffff;
    font-size: clamp(1.65rem, 3vw, 2.7rem);
    line-height: 1.08;
    font-weight: 950;
    word-break: keep-all;
  }

  p {
    margin: 16px 0 0;
    color: rgba(255, 248, 231, 0.65);
    line-height: 1.68;
    word-break: keep-all;
  }

  @media (max-width: 880px) {
    position: static;
  }
`;

const LoopList = styled.ol`
  display: grid;
  gap: 9px;
  margin: 0;
  padding: 0;
  list-style: none;
`;

const LoopItem = styled.li`
  min-width: 0;
  min-height: 122px;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
  padding: 22px;
  border: 1px solid rgba(255, 248, 231, 0.11);
  background: rgba(255, 248, 231, 0.04);

  > span {
    color: #5eead4;
    font-size: 0.72rem;
    font-weight: 950;
  }

  strong {
    color: #ffffff;
    font-size: 1.08rem;
    font-weight: 950;
  }

  p {
    margin: 8px 0 0;
    color: rgba(255, 248, 231, 0.62);
    font-size: 0.86rem;
    line-height: 1.62;
    word-break: keep-all;
  }

  > svg {
    color: rgba(245, 199, 102, 0.62);
  }

  &:last-child > svg {
    display: none;
  }
`;

const LetterSection = styled.section`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 24px;
  padding: clamp(28px, 5vw, 56px);
  border: 1px solid rgba(251, 113, 133, 0.36);
  border-radius: 26px 7px 26px 7px;
  background:
    radial-gradient(circle at 85% 18%, rgba(251, 113, 133, 0.15), transparent 31%),
    rgba(255, 248, 231, 0.035);
  content-visibility: auto;
  contain-intrinsic-size: 430px;

  > div:last-child > span {
    color: #fb7185;
    font-size: 0.68rem;
    font-weight: 950;
  }

  h2 {
    margin: 10px 0 0;
    color: #ffffff;
    font-size: clamp(1.8rem, 3.7vw, 3.25rem);
    line-height: 1.08;
    font-weight: 950;
    word-break: keep-all;
    text-wrap: balance;
  }

  p {
    max-width: 900px;
    margin: 18px 0 0;
    color: rgba(255, 248, 231, 0.69);
    line-height: 1.78;
    word-break: keep-all;
  }

  blockquote {
    margin: 26px 0 0;
    padding-left: 18px;
    border-left: 3px solid #fb7185;
    color: #ffffff;
    font-weight: 900;
    line-height: 1.72;
    word-break: keep-all;
  }

  @media (max-width: 620px) {
    grid-template-columns: 1fr;
  }
`;

const LetterIcon = styled.div`
  width: 66px;
  height: 66px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(251, 113, 133, 0.52);
  border-radius: 20px 6px 20px 6px;
  color: #fb7185;
  background: rgba(251, 113, 133, 0.09);
`;

const TransparencySection = styled.section`
  padding: clamp(26px, 5vw, 50px);
  border: 1px solid rgba(125, 211, 252, 0.25);
  background: rgba(255, 248, 231, 0.025);
  content-visibility: auto;
  contain-intrinsic-size: 700px;
`;

const TransparencyGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
  margin-top: 26px;

  @media (max-width: 700px) {
    grid-template-columns: 1fr;
  }
`;

const TransparencyCard = styled.article`
  min-width: 0;
  min-height: 96px;
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  gap: 11px;
  align-items: start;
  padding: 18px;
  border: 1px solid rgba(255, 248, 231, 0.11);
  border-left-color: #7dd3fc;
  background: rgba(255, 248, 231, 0.035);

  svg {
    margin-top: 2px;
    color: #7dd3fc;
  }

  span {
    color: rgba(255, 248, 231, 0.38);
    font-size: 0.68rem;
    font-weight: 950;
  }

  p {
    margin: 0;
    color: rgba(255, 248, 231, 0.72);
    line-height: 1.6;
    word-break: keep-all;
  }
`;

const ClosingSection = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 0.42fr);
  gap: 28px;
  align-items: end;
  padding: clamp(30px, 6vw, 64px);
  border: 1px solid rgba(245, 199, 102, 0.5);
  border-radius: 28px 8px 28px 8px;
  background:
    linear-gradient(135deg, rgba(245, 199, 102, 0.16), transparent 52%),
    rgba(15, 15, 12, 0.96);

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
  }
`;

const ClosingCopy = styled.div`
  > span {
    color: #f5c766;
    font-size: 0.68rem;
    font-weight: 950;
  }

  h2 {
    margin: 10px 0 0;
    color: #ffffff;
    font-size: clamp(1.9rem, 4vw, 3.6rem);
    line-height: 1.04;
    font-weight: 950;
    word-break: keep-all;
    text-wrap: balance;
  }

  p {
    max-width: 760px;
    margin: 17px 0 0;
    color: rgba(255, 248, 231, 0.68);
    line-height: 1.7;
    word-break: keep-all;
  }
`;

const ClosingActions = styled.div`
  display: grid;
  gap: 10px;

  a,
  span {
    min-height: 46px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 15px;
    border: 1px solid rgba(255, 248, 231, 0.14);
    color: rgba(255, 248, 231, 0.72);
    font-size: 0.82rem;
    font-weight: 850;
  }

  a {
    border-color: #f5c766;
    color: #171309;
    background: #f5c766;
    text-decoration: none;
    font-weight: 950;
  }

  a:focus-visible {
    outline: 2px solid #ffffff;
    outline-offset: 3px;
  }
`;
