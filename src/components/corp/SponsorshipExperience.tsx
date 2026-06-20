'use client';

import {
  Banknote,
  Coffee,
  Copy,
  Home,
  PiggyBank,
  ReceiptText,
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
          <AccountPanel aria-labelledby="sponsorship-account-title">
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

            <CopyButton type="button" onClick={() => void copyAccount()} aria-label="후원 계좌 정보 복사">
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
  width: min(100%, 1240px);
  margin: 0 auto;
  display: grid;
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
