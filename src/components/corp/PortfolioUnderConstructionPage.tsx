'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  BellRing,
  Bot,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Database,
  FileSpreadsheet,
  Gauge,
  ReceiptText,
  Route,
  ScanLine,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import styled, { keyframes } from 'styled-components';
import type { CorpPageDefinition } from '@/constants/corpPages';

type Program = {
  id: string;
  index: string;
  title: string;
  shortTitle: string;
  eyebrow: string;
  summary: string;
  description: string;
  icon: LucideIcon;
  color: string;
  soft: string;
  capabilities: string[];
  signals: string[];
};

const PROGRAMS: Program[] = [
  {
    id: 'daily-report',
    index: '01',
    title: '현장 일보 · 현황',
    shortTitle: '일보 · 현황',
    eyebrow: 'FIELD OPERATIONS',
    summary: '현장의 오늘을 기록하고, 바로 판단할 수 있게 정리합니다.',
    description:
      '작업 인력, 공정, 이슈, 사진과 전달 사항을 하나의 흐름으로 모아 현장과 사무실의 정보 간격을 줄입니다.',
    icon: ClipboardCheck,
    color: '#69d8ee',
    soft: 'rgba(105, 216, 238, 0.14)',
    capabilities: ['일자별 현장 일보', '공정 · 이슈 상태 기록', '현장 사진과 첨부 자료'],
    signals: ['현장 입력', '현황 정리', '운영 공유'],
  },
  {
    id: 'payroll',
    index: '02',
    title: '급여 · 정산',
    shortTitle: '급여 · 정산',
    eyebrow: 'PAYROLL CONTROL',
    summary: '복잡한 정산 흐름을 확인 가능한 업무 단위로 바꿉니다.',
    description:
      '근무 기록과 정산 기준을 연결해 확인 과정은 명확하게, 반복 계산은 더 안정적으로 운영할 수 있게 돕습니다.',
    icon: Gauge,
    color: '#91e29c',
    soft: 'rgba(145, 226, 156, 0.14)',
    capabilities: ['근무 기준 확인', '급여 · 수당 정산', '검토 이력 관리'],
    signals: ['기준 입력', '정산 검토', '지급 준비'],
  },
  {
    id: 'people-db',
    index: '03',
    title: '인력 · DB',
    shortTitle: '인력 · DB',
    eyebrow: 'WORKFORCE DATA',
    summary: '사람과 역량 데이터를 현장 배치의 기준으로 연결합니다.',
    description:
      '인력 정보, 경력, 자격과 배치 이력을 한눈에 관리해 필요한 시점에 적절한 인력을 빠르게 찾을 수 있습니다.',
    icon: UsersRound,
    color: '#a9b5ff',
    soft: 'rgba(169, 181, 255, 0.15)',
    capabilities: ['인력 프로필 관리', '경력 · 자격 정보', '현장 배치 이력'],
    signals: ['인력 등록', '역량 확인', '배치 판단'],
  },
  {
    id: 'invoice',
    index: '04',
    title: '세금계산서',
    shortTitle: '세금계산서',
    eyebrow: 'FINANCIAL RECORDS',
    summary: '증빙과 발행 상태를 놓치지 않는 회계 보조 흐름을 만듭니다.',
    description:
      '거래처와 발행 정보를 업무 흐름에 맞춰 정리하고, 확인해야 할 상태를 빠르게 확인할 수 있도록 구성합니다.',
    icon: ReceiptText,
    color: '#f2c27b',
    soft: 'rgba(242, 194, 123, 0.15)',
    capabilities: ['거래처 발행 정보', '증빙 상태 확인', '정산 자료 연결'],
    signals: ['자료 수집', '발행 확인', '보관 · 조회'],
  },
];

const AUTOMATION_STEPS = [
  { title: '업무 진단', detail: '반복·대기·오류가 생기는 지점을 찾습니다.', icon: ScanLine },
  { title: '흐름 설계', detail: '입력, 승인, 예외 조건을 먼저 정리합니다.', icon: Route },
  { title: '도구 연결', detail: 'ERP, 문서, 메일, 스프레드시트를 잇습니다.', icon: Workflow },
  { title: '안전한 실행', detail: '중복 방지, 재시도, 알림 기준을 둡니다.', icon: ShieldCheck },
  { title: '운영 고도화', detail: '기록을 읽고 다음 자동화로 확장합니다.', icon: BarChart3 },
];

const DELIVERY_PRINCIPLES = [
  ['현장을 먼저 읽는 설계', '실제 입력 흐름과 확인 동선을 기준으로 화면을 구성합니다.'],
  ['사람의 판단을 남기는 자동화', '자동 실행과 최종 승인 지점을 명확하게 구분합니다.'],
  ['기록으로 이어지는 운영', '처리 결과, 예외, 다음 조치를 다시 확인할 수 있게 남깁니다.'],
];

interface PortfolioUnderConstructionPageProps {
  page: CorpPageDefinition;
}

export function PortfolioUnderConstructionPage({ page: _page }: PortfolioUnderConstructionPageProps) {
  const [activeProgramId, setActiveProgramId] = useState(PROGRAMS[0].id);
  const reduceMotion = useReducedMotion();
  const activeProgram = useMemo(
    () => PROGRAMS.find((program) => program.id === activeProgramId) ?? PROGRAMS[0],
    [activeProgramId],
  );

  return (
    <Page id="content-area" aria-labelledby="portfolio-title">
      <SkipLink href="#portfolio-programs">프로그램 소개로 건너뛰기</SkipLink>
      <Glow aria-hidden="true" />
      <Content>
        <TopLine>
          <BrandMark aria-label="청연ENG 포트폴리오">
            <span aria-hidden="true">CY</span>
            <strong>CHEONGYEON ENG</strong>
          </BrandMark>
          <SectionNav aria-label="포트폴리오 섹션">
            <a href="#portfolio-programs">프로그램</a>
            <a href="#portfolio-automation">자동화</a>
            <a href="#portfolio-process">실행 방식</a>
          </SectionNav>
        </TopLine>

        <Hero>
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.55, ease: 'easeOut' }}
          >
            <Eyebrow>
              <Sparkles size={16} aria-hidden="true" />
              DIGITAL OPERATIONS PORTFOLIO
            </Eyebrow>
            <h1 id="portfolio-title">
              현장을 이해하는 ERP와
              <br />
              <em>일하는 방식을 바꾸는 자동화.</em>
            </h1>
            <HeroLead>
              청연ENG의 운영 프로그램은 현장 일보, 급여·정산, 인력 DB, 세금계산서를 한 계정 안에서
              연결합니다. 반복 업무는 더 간결하게, 중요한 판단은 더 분명하게 만듭니다.
            </HeroLead>
            <HeroActions>
              <PrimaryAnchor href="#portfolio-programs">
                프로그램 살펴보기
                <ArrowRight size={18} aria-hidden="true" />
              </PrimaryAnchor>
              <SecondaryLink href="/corp/partnership/business">
                협업 문의
                <ArrowUpRight size={17} aria-hidden="true" />
              </SecondaryLink>
            </HeroActions>
          </motion.div>

          <HeroDashboard aria-label="청연ENG ERP 운영 개요">
            <DashboardTop>
              <div>
                <span>CYEE OPERATIONS</span>
                <strong>ERP CONTROL ROOM</strong>
              </div>
              <LivePill><i aria-hidden="true" />CONNECTED</LivePill>
            </DashboardTop>
            <DashboardBody>
              <SignalColumn>
                {PROGRAMS.map((program, index) => {
                  const Icon = program.icon;
                  return (
                    <motion.div
                      key={program.id}
                      initial={reduceMotion ? false : { opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: reduceMotion ? 0 : 0.18 + index * 0.09, duration: 0.36 }}
                    >
                      <DashboardSignal $tone={program.color}>
                        <Icon size={16} aria-hidden="true" />
                        <span>{program.shortTitle}</span>
                        <b aria-hidden="true" />
                      </DashboardSignal>
                    </motion.div>
                  );
                })}
              </SignalColumn>
              <CommandMap aria-hidden="true">
                <MapOrbit />
                <MapCore>CY</MapCore>
                <MapNode $position="one" />
                <MapNode $position="two" />
                <MapNode $position="three" />
                <MapNode $position="four" />
                <MapLine $line="left" />
                <MapLine $line="right" />
                <MapLine $line="top" />
                <MapLine $line="bottom" />
              </CommandMap>
            </DashboardBody>
            <DashboardFooter>
              <span>FIELD</span><b />
              <span>DATA</span><b />
              <span>DECISION</span>
            </DashboardFooter>
          </HeroDashboard>
        </Hero>

        <MetricStrip aria-label="청연ENG 운영 포트폴리오 구성">
          <MetricItem>
            <span>운영 핵심 모듈</span>
            <CountUp value={4} suffix="개" />
            <small>현장 · 정산 · 인력 · 증빙</small>
          </MetricItem>
          <MetricItem>
            <span>연결 기준</span>
            <strong>ONE ACCOUNT</strong>
            <small>하나의 계정으로 이어지는 운영</small>
          </MetricItem>
          <MetricItem>
            <span>자동화 설계 단계</span>
            <CountUp value={5} suffix="단계" />
            <small>진단부터 운영 고도화까지</small>
          </MetricItem>
          <MetricItem>
            <span>운영 원칙</span>
            <CountUp value={3} suffix="가지" />
            <small>현장 · 판단 · 기록 중심</small>
          </MetricItem>
        </MetricStrip>

        <Section id="portfolio-programs" aria-labelledby="portfolio-programs-title">
          <SectionHeading>
            <div>
              <Eyebrow><Building2 size={16} aria-hidden="true" />CHEONGYEON ENG PROGRAMS</Eyebrow>
              <h2 id="portfolio-programs-title">하나의 운영 흐름, 네 가지 핵심 프로그램</h2>
              <p>일상적인 현장 업무를 데이터로 정리하고, 필요한 순간에 바로 확인할 수 있는 기준을 만듭니다.</p>
            </div>
            <SectionCount><span>CORE</span><strong>04</strong></SectionCount>
          </SectionHeading>

          <ProgramLayout>
            <ProgramList role="tablist" aria-label="청연ENG 프로그램 선택">
              {PROGRAMS.map((program) => {
                const Icon = program.icon;
                const active = activeProgram.id === program.id;
                return (
                  <ProgramButton
                    key={program.id}
                    id={`portfolio-program-${program.id}`}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-controls="portfolio-program-details"
                    $active={active}
                    $color={program.color}
                    onClick={() => setActiveProgramId(program.id)}
                  >
                    <span>{program.index}</span>
                    <Icon size={22} aria-hidden="true" />
                    <b>{program.title}</b>
                    <ChevronRight size={18} aria-hidden="true" />
                  </ProgramButton>
                );
              })}
            </ProgramList>

            <ProgramDetail
              id="portfolio-program-details"
              role="tabpanel"
              aria-labelledby={`portfolio-program-${activeProgram.id}`}
              $tone={activeProgram.color}
              $soft={activeProgram.soft}
            >
              <motion.div
                key={activeProgram.id}
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.26 }}
              >
                <DetailHeader>
                  <div><span>{activeProgram.eyebrow}</span><h3>{activeProgram.title}</h3></div>
                  <DetailIcon data-program-detail-icon><activeProgram.icon size={28} aria-hidden="true" /></DetailIcon>
                </DetailHeader>
                <p>{activeProgram.description}</p>
                <CapabilityList>
                  {activeProgram.capabilities.map((capability) => (
                    <li key={capability}><BadgeCheck size={17} aria-hidden="true" />{capability}</li>
                  ))}
                </CapabilityList>
                <SignalTrack aria-label={`${activeProgram.title} 업무 흐름`}>
                  {activeProgram.signals.map((signal, index) => (
                    <div key={signal}>
                      <b>{String(index + 1).padStart(2, '0')}</b>
                      <span>{signal}</span>
                    </div>
                  ))}
                </SignalTrack>
              </motion.div>
            </ProgramDetail>
          </ProgramLayout>
        </Section>

        <Section id="portfolio-automation" aria-labelledby="portfolio-automation-title">
          <AutomationShell>
            <AutomationCopy>
              <Eyebrow><Bot size={16} aria-hidden="true" />APP & WORKFLOW AUTOMATION</Eyebrow>
              <h2 id="portfolio-automation-title">반복 업무는 흐름으로 만들고, 중요한 결정은 더 선명하게.</h2>
              <p>
                자동화는 단순히 클릭을 줄이는 일이 아닙니다. 업무 목적, 예외, 승인 기준과 복구 방법까지 설계해
                팀이 안심하고 사용할 수 있는 운영 시스템으로 완성합니다.
              </p>
              <AutomationSignals>
                <span><CheckCircle2 size={17} aria-hidden="true" />사람 승인 기준</span>
                <span><CheckCircle2 size={17} aria-hidden="true" />예외 · 재시도 설계</span>
                <span><CheckCircle2 size={17} aria-hidden="true" />실행 이력 확인</span>
              </AutomationSignals>
            </AutomationCopy>
            <AutomationVisual aria-label="자동화 실행 흐름">
              <AutomationStatus><BellRing size={17} aria-hidden="true" />AUTOMATION READY</AutomationStatus>
              <AutomationFlow>
                <FlowSource><FileSpreadsheet size={20} aria-hidden="true" /><span>입력 데이터</span></FlowSource>
                <FlowPath aria-hidden="true"><i /><i /><i /></FlowPath>
                <FlowEngine><Workflow size={30} aria-hidden="true" /><strong>FLOW</strong><span>승인 · 예외 · 기록</span></FlowEngine>
                <FlowPath aria-hidden="true"><i /><i /><i /></FlowPath>
                <FlowOutput><Database size={20} aria-hidden="true" /><span>운영 결과</span></FlowOutput>
              </AutomationFlow>
              <AutomationMeta><span>INPUT</span><span>RULES</span><span>APPROVAL</span><span>LOG</span></AutomationMeta>
            </AutomationVisual>
          </AutomationShell>

          <StepGrid>
            {AUTOMATION_STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <motion.article
                  key={step.title}
                  initial={reduceMotion ? false : { opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.25 }}
                  transition={{ duration: reduceMotion ? 0 : 0.38, delay: reduceMotion ? 0 : index * 0.06 }}
                >
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <Icon size={23} aria-hidden="true" />
                  <h3>{step.title}</h3>
                  <p>{step.detail}</p>
                </motion.article>
              );
            })}
          </StepGrid>
        </Section>

        <Section id="portfolio-process" aria-labelledby="portfolio-process-title">
          <ProcessHeader>
            <div>
              <Eyebrow><BriefcaseBusiness size={16} aria-hidden="true" />DELIVERY PRINCIPLES</Eyebrow>
              <h2 id="portfolio-process-title">청연ENG의 프로그램은 ‘사용하는 순간’을 기준으로 설계합니다.</h2>
            </div>
            <p>소개용 화면에 머무르지 않고, 현장의 입력부터 운영팀의 확인과 다음 조치까지 이어지는 실제 업무 경험을 만듭니다.</p>
          </ProcessHeader>
          <PrincipleGrid>
            {DELIVERY_PRINCIPLES.map(([title, detail], index) => (
              <PrincipleCard key={title}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h3>{title}</h3>
                <p>{detail}</p>
              </PrincipleCard>
            ))}
            <PrinciplePanel>
              <Clock3 size={24} aria-hidden="true" />
              <strong>현장 입력 → 운영 판단 → 다음 실행</strong>
              <small>단절된 업무를 하나의 운영 리듬으로 연결합니다.</small>
            </PrinciplePanel>
          </PrincipleGrid>
        </Section>

        <ClosingPanel>
          <div>
            <Eyebrow><Sparkles size={16} aria-hidden="true" />BUILD THE NEXT FLOW</Eyebrow>
            <h2>현재의 업무를, 다음 단계의 운영 경험으로 바꿉니다.</h2>
            <p>청연ENG ERP와 앱 자동화 포트폴리오를 바탕으로, 현장에 맞는 새로운 실행 흐름을 함께 설계할 수 있습니다.</p>
          </div>
          <PrimaryLink href="/corp/partnership/business">
            사업 협업 이야기하기 <ArrowRight size={18} aria-hidden="true" />
          </PrimaryLink>
        </ClosingPanel>
      </Content>
    </Page>
  );
}

function CountUp({ value, suffix }: { value: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.7 });
  const reduceMotion = useReducedMotion();
  const [displayValue, setDisplayValue] = useState(reduceMotion ? value : 0);

  useEffect(() => {
    if (!inView) return;
    let frame = 0;
    if (reduceMotion) {
      frame = requestAnimationFrame(() => setDisplayValue(value));
      return () => cancelAnimationFrame(frame);
    }

    const startedAt = performance.now();
    const duration = 700;
    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      setDisplayValue(Math.round(value * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, reduceMotion, value]);

  return <strong ref={ref}>{displayValue}{suffix}</strong>;
}

const pulse = keyframes`
  0%, 100% { opacity: 0.44; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.12); }
`;

const drift = keyframes`
  0%, 100% { transform: translate3d(0, 0, 0); }
  50% { transform: translate3d(0, -10px, 0); }
`;

const flow = keyframes`
  from { transform: translateX(-12px); opacity: 0; }
  50% { opacity: 1; }
  to { transform: translateX(12px); opacity: 0; }
`;

const Page = styled.main`
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  scroll-behavior: smooth;
  color: #eaf2f7;
  background-color: #060b14;

  &::before,
  &::after {
    content: '';
    position: fixed;
    z-index: 0;
    pointer-events: none;
    border-radius: 50%;
    filter: blur(2px);
  }

  &::before { width: 46vw; height: 46vw; top: -22vw; right: -16vw; background: radial-gradient(circle, rgba(31, 169, 199, 0.18), transparent 68%); }
  &::after { width: 42vw; height: 42vw; left: -20vw; top: 36vw; background: radial-gradient(circle, rgba(60, 107, 186, 0.13), transparent 70%); }

  @media (max-width: 720px) {
    &::before { width: 96vw; height: 96vw; top: -50vw; right: -47vw; }
    &::after { width: 92vw; height: 92vw; left: -52vw; top: 92vw; }
  }
`;

const SkipLink = styled.a`
  position: absolute;
  z-index: 10;
  left: 16px;
  top: -56px;
  padding: 10px 14px;
  border-radius: 8px;
  color: #071019;
  background-color: #9ce5f5;
  font-weight: 900;
  text-decoration: none;

  &:focus { top: 12px; }
`;

const Glow = styled.div`
  position: absolute;
  z-index: 0;
  left: 45%;
  top: 620px;
  width: 1px;
  height: 860px;
  background-color: rgba(105, 216, 238, 0.22);
  box-shadow: 0 0 60px 20px rgba(105, 216, 238, 0.08);
  transform: rotate(29deg);
  pointer-events: none;
`;

const Content = styled.div`
  position: relative;
  z-index: 1;
  width: min(100%, 1240px);
  margin: 0 auto;
  padding: 26px clamp(18px, 3vw, 42px) 72px;

  section { scroll-margin-top: 24px; }

  @media (max-width: 720px) { padding: 18px 16px 42px; }
`;

const TopLine = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding-bottom: 20px;
  border-bottom: 1px solid rgba(188, 213, 224, 0.13);
`;

const BrandMark = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;

  span { display: inline-grid; place-items: center; width: 30px; height: 30px; border: 1px solid rgba(105, 216, 238, 0.52); border-radius: 50%; color: #9ce5f5; font-size: 0.68rem; font-weight: 950; letter-spacing: 0.08em; }
  strong { color: rgba(234, 242, 247, 0.86); font-size: 0.73rem; font-weight: 900; letter-spacing: 0.14em; white-space: nowrap; }

  @media (max-width: 520px) { strong { font-size: 0.65rem; letter-spacing: 0.08em; } }
`;

const SectionNav = styled.nav`
  display: flex;
  align-items: center;
  gap: 6px;

  a { min-height: 32px; display: inline-flex; align-items: center; padding: 0 9px; border-radius: 7px; color: rgba(213, 228, 237, 0.62); font-size: 0.76rem; font-weight: 800; text-decoration: none; transition: color 160ms ease, background-color 160ms ease; }
  a:hover, a:focus-visible { color: #ecfaff; background-color: rgba(105, 216, 238, 0.1); outline: 2px solid rgba(105, 216, 238, 0.5); outline-offset: 2px; }

  @media (max-width: 600px) { display: none; }
`;

const Hero = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1.12fr) minmax(350px, 0.88fr);
  align-items: center;
  gap: clamp(34px, 6vw, 96px);
  min-height: 510px;
  padding: clamp(54px, 7vw, 102px) 0 48px;

  h1 { max-width: 710px; margin: 17px 0 0; color: #f6fbff; font-size: clamp(2.7rem, 5.1vw, 5.1rem); font-weight: 900; letter-spacing: -0.035em; line-height: 1.08; text-wrap: balance; word-break: keep-all; }
  h1 em { color: #86dceb; font-style: normal; }

  @media (max-width: 970px) { grid-template-columns: 1fr; min-height: auto; padding-top: 56px; }
  @media (max-width: 560px) { padding-top: 44px; h1 { font-size: 2.6rem; letter-spacing: -0.03em; } }
`;

const Eyebrow = styled.span`
  width: fit-content;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #8cdae9;
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.11em;
  line-height: 1.2;
`;

const HeroLead = styled.p`
  max-width: 670px;
  margin: 22px 0 0;
  color: rgba(219, 233, 240, 0.74);
  font-size: clamp(1rem, 1.5vw, 1.12rem);
  font-weight: 650;
  line-height: 1.78;
  word-break: keep-all;
`;

const HeroActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 30px;
`;

const PrimaryAnchor = styled.a`
  min-height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 17px;
  border: 1px solid #9ce5f5;
  border-radius: 8px;
  color: #061017;
  background-color: #9ce5f5;
  font-size: 0.9rem;
  font-weight: 900;
  text-decoration: none;
  transition: transform 170ms ease, background-color 170ms ease, box-shadow 170ms ease;
  touch-action: manipulation;

  &:hover { transform: translateY(-2px); background-color: #c2f2fb; box-shadow: 0 16px 36px rgba(105, 216, 238, 0.18); }
  &:focus-visible { outline: 3px solid rgba(156, 229, 245, 0.48); outline-offset: 3px; }
  @media (prefers-reduced-motion: reduce) { transition: background-color 170ms ease; &:hover { transform: none; } }
`;

const SecondaryLink = styled(Link)`
  min-height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 16px;
  border: 1px solid rgba(205, 223, 232, 0.2);
  border-radius: 8px;
  color: rgba(234, 242, 247, 0.9);
  background-color: rgba(255, 255, 255, 0.035);
  font-size: 0.9rem;
  font-weight: 850;
  text-decoration: none;
  transition: border-color 170ms ease, background-color 170ms ease, color 170ms ease;

  &:hover, &:focus-visible { border-color: rgba(156, 229, 245, 0.6); background-color: rgba(105, 216, 238, 0.1); color: #fff; }
  &:focus-visible { outline: 2px solid #9ce5f5; outline-offset: 3px; }
`;

const HeroDashboard = styled.aside`
  position: relative;
  overflow: hidden;
  min-height: 380px;
  padding: 18px;
  border: 1px solid rgba(145, 185, 205, 0.25);
  border-radius: 12px;
  background-color: rgba(11, 21, 34, 0.9);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.28), inset 0 0 0 1px rgba(255, 255, 255, 0.025);
  animation: ${drift} 6s ease-in-out infinite;

  &::before { content: ''; position: absolute; inset: 0; pointer-events: none; opacity: 0.36; background-image: linear-gradient(rgba(134, 220, 235, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(134, 220, 235, 0.08) 1px, transparent 1px); background-size: 26px 26px; }
  @media (prefers-reduced-motion: reduce) { animation: none; }
`;

const DashboardTop = styled.div`
  position: relative; z-index: 1; display: flex; align-items: center; justify-content: space-between; gap: 12px;
  > div { display: grid; gap: 4px; }
  span { color: rgba(185, 220, 231, 0.58); font-size: 0.6rem; font-weight: 900; letter-spacing: 0.12em; }
  strong { color: #e9f7fc; font-size: 0.82rem; font-weight: 900; letter-spacing: 0.06em; }
`;

const LivePill = styled.span`
  display: inline-flex; align-items: center; gap: 6px; min-height: 24px; padding: 0 8px; border: 1px solid rgba(145, 226, 156, 0.36); border-radius: 999px; color: #a9eeb2; background-color: rgba(145, 226, 156, 0.08); font-size: 0.58rem; font-weight: 900; letter-spacing: 0.07em;
  i { width: 6px; height: 6px; border-radius: 50%; background-color: #91e29c; animation: ${pulse} 1.8s ease-in-out infinite; }
`;

const DashboardBody = styled.div`
  position: relative; z-index: 1; display: grid; grid-template-columns: minmax(145px, 0.9fr) minmax(160px, 1fr); align-items: center; gap: 12px; min-height: 278px;
  @media (max-width: 430px) { grid-template-columns: 1fr; }
`;

const SignalColumn = styled.div` display: grid; gap: 8px; `;
const DashboardSignal = styled.div<{ $tone: string }>`
  display: grid; grid-template-columns: 20px minmax(0, 1fr) 8px; align-items: center; gap: 7px; min-height: 42px; padding: 0 10px; border: 1px solid color-mix(in srgb, ${(props) => props.$tone} 34%, transparent); border-radius: 7px; color: ${(props) => props.$tone}; background-color: rgba(7, 14, 24, 0.72);
  span { min-width: 0; overflow: hidden; color: rgba(229, 243, 249, 0.78); font-size: 0.69rem; font-weight: 850; text-overflow: ellipsis; white-space: nowrap; }
  b { width: 6px; height: 6px; border-radius: 50%; background-color: ${(props) => props.$tone}; box-shadow: 0 0 12px ${(props) => props.$tone}; }
`;

const CommandMap = styled.div` position: relative; width: min(100%, 228px); aspect-ratio: 1; justify-self: center; border: 1px solid rgba(134, 220, 235, 0.22); border-radius: 50%; background-color: rgba(5, 13, 23, 0.72); `;
const MapOrbit = styled.div` position: absolute; inset: 12%; border: 1px dashed rgba(134, 220, 235, 0.36); border-radius: 50%; animation: ${drift} 4.8s ease-in-out infinite reverse; `;
const MapCore = styled.div` position: absolute; inset: 50% auto auto 50%; display: grid; place-items: center; width: 56px; height: 56px; border: 1px solid rgba(156, 229, 245, 0.72); border-radius: 50%; color: #d9f7fc; background-color: #0c2634; font-size: 0.9rem; font-weight: 950; letter-spacing: 0.06em; transform: translate(-50%, -50%); box-shadow: 0 0 34px rgba(105, 216, 238, 0.18); `;
const MapNode = styled.i<{ $position: 'one' | 'two' | 'three' | 'four' }>`
  position: absolute; width: 13px; height: 13px; border-radius: 50%; background-color: #9ce5f5; box-shadow: 0 0 14px rgba(156, 229, 245, 0.72); animation: ${pulse} 2.4s ease-in-out infinite;
  ${(props) => ({ one: 'left: 17%; top: 18%;', two: 'right: 15%; top: 26%; animation-delay: 0.4s;', three: 'right: 24%; bottom: 15%; animation-delay: 0.8s;', four: 'left: 18%; bottom: 25%; animation-delay: 1.2s;' }[props.$position])}
`;
const MapLine = styled.i<{ $line: 'left' | 'right' | 'top' | 'bottom' }>`
  position: absolute; left: 50%; top: 50%; width: 33%; height: 1px; background-color: rgba(156, 229, 245, 0.36); transform-origin: left center;
  ${(props) => ({ left: 'transform: rotate(224deg);', right: 'transform: rotate(-36deg);', top: 'transform: rotate(-130deg);', bottom: 'transform: rotate(44deg);' }[props.$line])}
`;

const DashboardFooter = styled.div`
  position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; gap: 8px; padding-top: 10px; border-top: 1px solid rgba(134, 220, 235, 0.16); color: rgba(189, 223, 234, 0.5); font-size: 0.58rem; font-weight: 900; letter-spacing: 0.08em;
  b { width: 16px; height: 1px; background-color: rgba(134, 220, 235, 0.26); }
`;

const MetricStrip = styled.section`
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-top: 1px solid rgba(188, 213, 224, 0.14); border-bottom: 1px solid rgba(188, 213, 224, 0.14);
  @media (max-width: 860px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;
const MetricItem = styled.div`
  min-width: 0; display: grid; align-content: start; gap: 7px; min-height: 142px; padding: 24px 20px; border-right: 1px solid rgba(188, 213, 224, 0.14);
  &:last-child { border-right: 0; }
  > span { color: rgba(190, 214, 224, 0.55); font-size: 0.7rem; font-weight: 850; }
  strong { color: #eff9fc; font-size: clamp(1.45rem, 2.5vw, 2rem); font-weight: 900; letter-spacing: -0.03em; line-height: 1.08; font-variant-numeric: tabular-nums; }
  small { color: rgba(211, 230, 237, 0.62); font-size: 0.76rem; font-weight: 700; line-height: 1.45; word-break: keep-all; }
  @media (max-width: 860px) { &:nth-child(2) { border-right: 0; } &:nth-child(n+3) { border-top: 1px solid rgba(188, 213, 224, 0.14); } }
  @media (max-width: 480px) { min-height: 124px; padding: 20px 14px; }
`;

const Section = styled.section`
  padding-top: clamp(82px, 11vw, 138px);
`;
const SectionHeading = styled.div`
  display: flex; align-items: end; justify-content: space-between; gap: 30px; margin-bottom: 30px;
  h2 { max-width: 840px; margin: 15px 0 0; color: #f0f8fb; font-size: clamp(2rem, 3.8vw, 3.5rem); font-weight: 900; letter-spacing: -0.032em; line-height: 1.14; text-wrap: balance; word-break: keep-all; }
  p { max-width: 730px; margin: 16px 0 0; color: rgba(211, 230, 237, 0.68); font-size: 1rem; font-weight: 650; line-height: 1.7; word-break: keep-all; }
  @media (max-width: 700px) { display: block; margin-bottom: 22px; }
`;
const SectionCount = styled.div`
  flex: 0 0 auto; display: grid; gap: 2px; min-width: 86px; padding-bottom: 6px; text-align: right;
  span { color: rgba(156, 229, 245, 0.62); font-size: 0.64rem; font-weight: 900; letter-spacing: 0.12em; }
  strong { color: #9ce5f5; font-size: 2.55rem; font-weight: 900; line-height: 0.9; font-variant-numeric: tabular-nums; }
  @media (max-width: 700px) { margin-top: 20px; text-align: left; }
`;

const ProgramLayout = styled.div`
  display: grid; grid-template-columns: minmax(230px, 0.54fr) minmax(0, 1fr); gap: 12px;
  @media (max-width: 760px) { grid-template-columns: 1fr; }
`;
const ProgramList = styled.div` display: grid; gap: 8px; `;
const ProgramButton = styled.button<{ $active: boolean; $color: string }>`
  width: 100%; min-height: 76px; display: grid; grid-template-columns: 29px 27px minmax(0, 1fr) 18px; align-items: center; gap: 10px; padding: 13px 16px; border: 1px solid ${(props) => (props.$active ? `${props.$color}77` : 'rgba(188, 213, 224, 0.15)')}; border-left: 3px solid ${(props) => (props.$active ? props.$color : 'transparent')}; border-radius: 8px; color: #eaf2f7; background-color: ${(props) => (props.$active ? 'rgba(255, 255, 255, 0.07)' : 'rgba(255, 255, 255, 0.028)')}; cursor: pointer; font: inherit; text-align: left; transition: transform 170ms ease, border-color 170ms ease, background-color 170ms ease; touch-action: manipulation; -webkit-tap-highlight-color: transparent;
  > span { color: rgba(193, 217, 227, 0.5); font-size: 0.68rem; font-weight: 900; }
  > svg { color: ${(props) => props.$color}; }
  > b { min-width: 0; color: ${(props) => (props.$active ? '#fff' : 'rgba(234, 242, 247, 0.78)')}; font-size: 0.95rem; font-weight: 850; word-break: keep-all; }
  > svg:last-child { color: rgba(193, 217, 227, 0.44); transform: ${(props) => (props.$active ? 'translateX(2px)' : 'none')}; }
  &:hover { transform: translateX(2px); border-color: ${(props) => `${props.$color}66`}; }
  &:focus-visible { outline: 2px solid ${(props) => props.$color}; outline-offset: 3px; }
  @media (prefers-reduced-motion: reduce) { transition: border-color 170ms ease, background-color 170ms ease; &:hover { transform: none; } }
`;

const ProgramDetail = styled.article<{ $tone: string; $soft: string }>`
  min-width: 0; min-height: 340px; padding: clamp(23px, 4vw, 42px); border: 1px solid ${(props) => `${props.$tone}5a`}; border-radius: 10px; background-color: rgba(255, 255, 255, 0.045); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.018);
  [data-program-detail-icon] { color: ${(props) => props.$tone}; background-color: ${(props) => props.$soft}; border-color: ${(props) => `${props.$tone}55`}; }
  p { max-width: 720px; margin: 18px 0 0; color: rgba(222, 237, 243, 0.74); font-size: 1rem; font-weight: 650; line-height: 1.74; word-break: keep-all; }
`;
const DetailHeader = styled.div`
  display: flex; align-items: start; justify-content: space-between; gap: 22px;
  > div { min-width: 0; display: grid; gap: 8px; }
  span { color: rgba(190, 216, 226, 0.62); font-size: 0.72rem; font-weight: 900; letter-spacing: 0.1em; }
  h3 { margin: 0; color: #f3fbfe; font-size: clamp(1.7rem, 3vw, 2.45rem); font-weight: 900; letter-spacing: -0.03em; line-height: 1.1; word-break: keep-all; }
`;
const DetailIcon = styled.span`
  width: 54px; height: 54px; flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; border: 1px solid; border-radius: 8px;
`;
const CapabilityList = styled.ul`
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; margin: 28px 0 0; padding: 0; list-style: none;
  li { min-width: 0; display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 7px; color: rgba(230, 243, 248, 0.82); font-size: 0.83rem; font-weight: 770; line-height: 1.45; word-break: keep-all; }
  svg { color: #9ce5f5; }
  @media (max-width: 600px) { grid-template-columns: 1fr; }
`;
const SignalTrack = styled.div`
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 30px; padding-top: 18px; border-top: 1px solid rgba(188, 213, 224, 0.14);
  > div { min-width: 0; display: grid; gap: 7px; }
  b { color: #9ce5f5; font-size: 0.68rem; font-weight: 900; letter-spacing: 0.08em; }
  span { color: rgba(225, 241, 247, 0.75); font-size: 0.81rem; font-weight: 780; word-break: keep-all; }
`;

const AutomationShell = styled.div`
  display: grid; grid-template-columns: minmax(0, 0.94fr) minmax(340px, 1.06fr); gap: 42px; align-items: center; padding: clamp(28px, 5vw, 58px); border: 1px solid rgba(156, 229, 245, 0.2); border-radius: 12px; background-color: rgba(11, 22, 35, 0.72);
  @media (max-width: 900px) { grid-template-columns: 1fr; gap: 30px; }
  @media (max-width: 520px) { padding: 24px 18px; }
`;
const AutomationCopy = styled.div`
  h2 { max-width: 640px; margin: 15px 0 0; color: #f2fbfd; font-size: clamp(2rem, 3.7vw, 3.3rem); font-weight: 900; letter-spacing: -0.035em; line-height: 1.13; text-wrap: balance; word-break: keep-all; }
  p { margin: 19px 0 0; color: rgba(213, 230, 237, 0.7); font-size: 1rem; font-weight: 650; line-height: 1.75; word-break: keep-all; }
`;
const AutomationSignals = styled.div`
  display: flex; flex-wrap: wrap; gap: 8px; margin-top: 24px;
  span { min-height: 32px; display: inline-flex; align-items: center; gap: 6px; padding: 0 10px; border: 1px solid rgba(156, 229, 245, 0.18); border-radius: 999px; color: rgba(220, 240, 247, 0.78); background-color: rgba(156, 229, 245, 0.07); font-size: 0.74rem; font-weight: 800; }
  svg { color: #9ce5f5; }
`;
const AutomationVisual = styled.div`
  min-width: 0; padding: 18px; border: 1px solid rgba(156, 229, 245, 0.2); border-radius: 9px; background-color: rgba(4, 12, 21, 0.72); box-shadow: inset 0 0 40px rgba(105, 216, 238, 0.04);
`;
const AutomationStatus = styled.div`
  display: inline-flex; align-items: center; gap: 7px; color: #9ce5f5; font-size: 0.65rem; font-weight: 900; letter-spacing: 0.1em;
`;
const AutomationFlow = styled.div`
  display: grid; grid-template-columns: 1fr 34px 1.22fr 34px 1fr; align-items: center; gap: 5px; min-height: 172px;
  @media (max-width: 450px) { grid-template-columns: 1fr; gap: 10px; padding: 20px 0; }
`;
const FlowSource = styled.div` display: grid; justify-items: center; gap: 10px; padding: 12px 8px; border: 1px solid rgba(169, 181, 255, 0.34); border-radius: 8px; color: #bac3ff; background-color: rgba(169, 181, 255, 0.08); font-size: 0.68rem; font-weight: 850; text-align: center; `;
const FlowOutput = styled(FlowSource)` border-color: rgba(145, 226, 156, 0.34); color: #b2f2bb; background-color: rgba(145, 226, 156, 0.08); `;
const FlowPath = styled.div`
  position: relative; height: 1px; overflow: hidden; background-color: rgba(156, 229, 245, 0.25);
  i { position: absolute; top: -2px; width: 5px; height: 5px; border-radius: 50%; background-color: #9ce5f5; animation: ${flow} 1.8s linear infinite; }
  i:nth-child(2) { animation-delay: 0.6s; } i:nth-child(3) { animation-delay: 1.2s; }
  @media (max-width: 450px) { width: 1px; height: 22px; justify-self: center; i { animation: ${pulse} 1.8s ease-in-out infinite; } }
  @media (prefers-reduced-motion: reduce) { i { animation: none; opacity: 0.8; } }
`;
const FlowEngine = styled.div`
  display: grid; justify-items: center; gap: 7px; padding: 18px 10px; border: 1px solid rgba(156, 229, 245, 0.52); border-radius: 9px; color: #a9eefa; background-color: rgba(105, 216, 238, 0.1); text-align: center; box-shadow: 0 0 24px rgba(105, 216, 238, 0.08);
  strong { color: #effcff; font-size: 0.95rem; font-weight: 950; letter-spacing: 0.1em; } span { color: rgba(205, 237, 246, 0.7); font-size: 0.63rem; font-weight: 800; white-space: nowrap; }
`;
const AutomationMeta = styled.div`
  display: flex; justify-content: space-between; gap: 8px; padding-top: 15px; border-top: 1px solid rgba(156, 229, 245, 0.14); color: rgba(190, 220, 230, 0.52); font-size: 0.6rem; font-weight: 900; letter-spacing: 0.08em;
`;
const StepGrid = styled.div`
  display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; margin-top: 12px;
  article { position: relative; min-width: 0; min-height: 206px; padding: 20px; border: 1px solid rgba(188, 213, 224, 0.14); border-radius: 8px; background-color: rgba(255, 255, 255, 0.028); }
  article > span { display: block; color: rgba(156, 229, 245, 0.56); font-size: 0.68rem; font-weight: 900; } article > svg { margin-top: 18px; color: #9ce5f5; }
  h3 { margin: 16px 0 0; color: #eefaff; font-size: 1.02rem; font-weight: 900; word-break: keep-all; } p { margin: 9px 0 0; color: rgba(210, 230, 238, 0.65); font-size: 0.8rem; font-weight: 650; line-height: 1.58; word-break: keep-all; }
  @media (max-width: 980px) { grid-template-columns: repeat(3, minmax(0, 1fr)); } @media (max-width: 620px) { grid-template-columns: 1fr; article { min-height: 0; } }
`;

const ProcessHeader = styled.div`
  display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(260px, 0.7fr); gap: 30px; align-items: end;
  h2 { margin: 15px 0 0; }
  > p { margin: 0; color: rgba(211, 230, 237, 0.7); font-size: 0.98rem; font-weight: 650; line-height: 1.7; word-break: keep-all; }
  @media (max-width: 780px) { grid-template-columns: 1fr; gap: 18px; }
`;
const PrincipleGrid = styled.div`
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 30px;
  @media (max-width: 860px) { grid-template-columns: repeat(2, minmax(0, 1fr)); } @media (max-width: 560px) { grid-template-columns: 1fr; }
`;
const PrincipleCard = styled.article`
  min-width: 0; min-height: 206px; padding: 24px; border: 1px solid rgba(188, 213, 224, 0.14); border-radius: 8px; background-color: rgba(255, 255, 255, 0.026);
  > span { color: #9ce5f5; font-size: 0.7rem; font-weight: 900; letter-spacing: 0.1em; } h3 { margin: 30px 0 0; color: #f1fbfe; font-size: 1.15rem; font-weight: 900; word-break: keep-all; } p { margin: 10px 0 0; color: rgba(211, 230, 237, 0.67); font-size: 0.85rem; font-weight: 650; line-height: 1.62; word-break: keep-all; }
`;
const PrinciplePanel = styled.aside`
  min-width: 0; min-height: 206px; display: grid; align-content: end; gap: 10px; padding: 24px; border: 1px solid rgba(156, 229, 245, 0.36); border-radius: 8px; background-color: rgba(105, 216, 238, 0.1); color: #9ce5f5;
  strong { color: #ecfbff; font-size: 1.18rem; font-weight: 900; line-height: 1.38; word-break: keep-all; } small { color: rgba(213, 240, 247, 0.7); font-size: 0.82rem; font-weight: 700; line-height: 1.52; word-break: keep-all; }
`;

const ClosingPanel = styled.section`
  display: flex; align-items: end; justify-content: space-between; gap: 30px; margin-top: clamp(82px, 11vw, 138px); padding: clamp(30px, 6vw, 66px); border: 1px solid rgba(156, 229, 245, 0.28); border-radius: 12px; background-color: #0b1a29; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.2);
  h2 { max-width: 740px; margin: 16px 0 0; color: #f3fcff; font-size: clamp(2rem, 3.7vw, 3.4rem); font-weight: 900; letter-spacing: -0.035em; line-height: 1.12; text-wrap: balance; word-break: keep-all; }
  p { max-width: 700px; margin: 16px 0 0; color: rgba(214, 234, 241, 0.72); font-size: 1rem; font-weight: 650; line-height: 1.7; word-break: keep-all; }
  @media (max-width: 760px) { display: grid; align-items: start; }
`;
const PrimaryLink = styled(Link)`
  flex: 0 0 auto; min-height: 48px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 0 18px; border: 1px solid #9ce5f5; border-radius: 8px; color: #071018; background-color: #9ce5f5; font-size: 0.88rem; font-weight: 900; text-decoration: none; transition: transform 170ms ease, background-color 170ms ease;
  &:hover { transform: translateY(-2px); background-color: #c2f2fb; } &:focus-visible { outline: 3px solid rgba(156, 229, 245, 0.48); outline-offset: 3px; }
  @media (prefers-reduced-motion: reduce) { transition: background-color 170ms ease; &:hover { transform: none; } }
`;
