'use client';

import { ArrowLeft, BadgeCheck, Clock3, HardHat, Sparkles } from 'lucide-react';
import Link from 'next/link';
import styled, { keyframes } from 'styled-components';
import type { CorpPageDefinition } from '@/constants/corpPages';

interface PortfolioUnderConstructionPageProps {
  page: CorpPageDefinition;
}

export function PortfolioUnderConstructionPage({ page }: PortfolioUnderConstructionPageProps) {
  return (
    <Page id="content-area" aria-labelledby="portfolio-under-construction-title">
      <AmbientLine aria-hidden="true" />
      <Hero>
        <NoticeBlock>
          <Kicker>
            <HardHat size={18} strokeWidth={2.3} aria-hidden="true" />
            공사중
          </Kicker>
          <h1 id="portfolio-under-construction-title">{page.title} 페이지는 준비 중입니다.</h1>
          <Lead>
            완료된 프로젝트와 성과 사례를 한눈에 볼 수 있도록 콘텐츠 구조, 대표 이미지,
            성과 지표를 정리하고 있습니다.
          </Lead>

          <ActionRow>
            <HomeLink href="/corp/project">
              <ArrowLeft size={18} strokeWidth={2.4} aria-hidden="true" />
              프로젝트 보기
            </HomeLink>
            <StatusPill>
              <Clock3 size={16} strokeWidth={2.4} aria-hidden="true" />
              업데이트 예정
            </StatusPill>
          </ActionRow>
        </NoticeBlock>

        <ProgressPanel aria-label="포트폴리오 페이지 준비 항목">
          <PanelHeader>
            <Sparkles size={20} strokeWidth={2.2} aria-hidden="true" />
            <span>Preparation</span>
          </PanelHeader>
          <ProgressList>
            <li>
              <BadgeCheck size={18} strokeWidth={2.4} aria-hidden="true" />
              <span>성과 사례 분류 체계 정리</span>
            </li>
            <li>
              <BadgeCheck size={18} strokeWidth={2.4} aria-hidden="true" />
              <span>대표 이미지 및 결과물 검수</span>
            </li>
            <li>
              <BadgeCheck size={18} strokeWidth={2.4} aria-hidden="true" />
              <span>공개용 성과 지표 문안 조정</span>
            </li>
          </ProgressList>
        </ProgressPanel>
      </Hero>
    </Page>
  );
}

const sweep = keyframes`
  0% {
    transform: translateX(-18%);
  }
  100% {
    transform: translateX(18%);
  }
`;

const Page = styled.main`
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  padding: clamp(20px, 4vw, 52px);
  color: #f7fbf8;
  background:
    radial-gradient(circle at 14% 18%, rgba(58, 175, 134, 0.2), transparent 28%),
    radial-gradient(circle at 82% 16%, rgba(245, 199, 102, 0.18), transparent 30%),
    linear-gradient(135deg, #07110f 0%, #111818 46%, #14100b 100%);

  @media (max-width: 720px) {
    overflow-y: auto;
  }
`;

const AmbientLine = styled.div`
  position: absolute;
  inset: auto -8% 12% -8%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(245, 199, 102, 0.62), transparent);
  animation: ${sweep} 5s ease-in-out infinite alternate;
`;

const Hero = styled.section`
  position: relative;
  z-index: 1;
  width: min(100%, 1120px);
  min-height: min(620px, calc(100vh - 104px));
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
  gap: clamp(18px, 3vw, 32px);
  align-items: center;

  @media (max-width: 860px) {
    min-height: auto;
    grid-template-columns: 1fr;
    align-content: center;
  }
`;

const NoticeBlock = styled.div`
  min-width: 0;

  h1 {
    max-width: 760px;
    margin: 18px 0 0;
    color: #ffffff;
    font-size: 4.45rem;
    line-height: 1.08;
    letter-spacing: 0;
    font-weight: 950;
    word-break: keep-all;
    overflow-wrap: anywhere;
  }

  @media (max-width: 980px) {
    h1 {
      font-size: 3.45rem;
    }
  }

  @media (max-width: 560px) {
    h1 {
      font-size: 2.38rem;
      line-height: 1.13;
    }
  }
`;

const Kicker = styled.div`
  width: fit-content;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border: 1px solid rgba(245, 199, 102, 0.48);
  border-radius: 999px;
  color: #ffe09c;
  background: rgba(245, 199, 102, 0.1);
  font-size: 0.83rem;
  font-weight: 850;
  letter-spacing: 0;
`;

const Lead = styled.p`
  max-width: 680px;
  margin: 20px 0 0;
  color: rgba(247, 251, 248, 0.76);
  font-size: 1.12rem;
  line-height: 1.76;
  word-break: keep-all;

  @media (max-width: 560px) {
    font-size: 1rem;
  }
`;

const ActionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 30px;
`;

const HomeLink = styled(Link)`
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 16px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  color: #08100e;
  background: #f5c766;
  font-size: 0.94rem;
  font-weight: 850;
  text-decoration: none;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    background 180ms ease;

  &:hover {
    transform: translateY(-1px);
    background: #ffdc86;
    box-shadow: 0 16px 34px rgba(245, 199, 102, 0.2);
  }

  &:focus-visible {
    outline: 3px solid rgba(245, 199, 102, 0.38);
    outline-offset: 3px;
  }
`;

const StatusPill = styled.span`
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  color: rgba(247, 251, 248, 0.78);
  background: rgba(255, 255, 255, 0.06);
  font-size: 0.9rem;
  font-weight: 760;
`;

const ProgressPanel = styled.aside`
  min-width: 0;
  padding: 24px;
  border: 1px solid rgba(255, 255, 255, 0.13);
  border-radius: 8px;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.13), rgba(255, 255, 255, 0.045)),
    rgba(8, 16, 14, 0.56);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(18px);
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 9px;
  color: #ffe09c;
  font-size: 0.78rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

const ProgressList = styled.ul`
  display: grid;
  gap: 12px;
  margin: 20px 0 0;
  padding: 0;
  list-style: none;

  li {
    min-width: 0;
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr);
    gap: 10px;
    align-items: start;
    padding: 14px 0;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    color: rgba(247, 251, 248, 0.82);
    font-size: 0.95rem;
    line-height: 1.52;
    word-break: keep-all;
  }

  svg {
    color: #8ee0ba;
  }
`;
