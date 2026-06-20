'use client';

import { useState } from 'react';
import Image from 'next/image';
import {
  Activity,
  BadgeCheck,
  BriefcaseBusiness,
  ChevronDown,
  GraduationCap,
  Scale,
  ShieldAlert,
  Sparkles,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import styled, { css } from 'styled-components';
import { CorpEditableSection, type CorpSectionEditorState } from '@/components/corp/CorpSectionEditOverlay';
import type { CorpPage, CorpPageBlock } from '@/schemas/corpPageSchema';

type ProfileItem = {
  label: string;
  value: string;
};

type QuickFactItem = ProfileItem & {
  caption: string;
  progress: number;
  accent: string;
  subLabel: string;
  subValue: string;
  icon: LucideIcon;
};

type MetricItem = Extract<CorpPageBlock, { type: 'metric-grid' }>['data']['metrics'][number];

type AccordionSection = {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  items: ProfileItem[];
};

export type CeoIntroConfig = {
  portraitImageUrl: string;
  portraitImageAlt: string;
  portraitCaptionRole: string;
  portraitCaptionTitle: string;
  identityKicker: string;
  identityTitle: string;
  identityText: string;
  introKicker: string;
  introTitle: string;
  introBody: string;
  quickFacts: QuickFactItem[];
  profileSections: AccordionSection[];
  timelineTitle: string;
  timelineSteps: Array<{
    number: string;
    title: string;
    description: string;
    icon: LucideIcon;
  }>;
  closingNote: string;
};

interface CeoIntroSatirePageProps {
  config?: CeoIntroConfig;
  editor?: CorpSectionEditorState;
}

const profileSections: AccordionSection[] = [
  {
    id: 'body',
    number: '01',
    title: '신체 스펙',
    subtitle: '공식 수치와 현장 반응속도 사이',
    icon: Activity,
    items: [
      { label: '키', value: '약 180cm. 실제로는 조금 모자라지만, 프로필에는 언제나 반올림의 미학이 있다.' },
      { label: '몸무게', value: '전성기 최대 약 145kg. 현재는 110kg-120kg 사이를 유동적으로 왕복한다.' },
      { label: '시력', value: '좌 0.6 / 우 0.3. 멀리 있는 리스크보다 눈앞의 위기를 먼저 보는 타입.' },
      { label: '혈액형', value: 'B형. 자기 페이스가 강하고, 핑계도 비교적 빠르게 나온다.' },
      { label: '음주/흡연', value: '술은 안 마신다. 담배는 많이 핀다. 건강관리는 늘 다음 분기 핵심 과제다.' },
      { label: '특이사항', value: '중량급 체형이지만 위기 상황에서는 경량급 기동성을 보인다. 도망갈 때만큼은 조직 내 최상위권.' },
    ],
  },
  {
    id: 'education',
    number: '02',
    title: '학력',
    subtitle: '드림 스쿨과 현실 스쿨의 간극',
    icon: GraduationCap,
    items: [
      { label: '서울대학교 법과대학', value: '학사(LL.B) 2003.03-2007.02를 꿈꿨다.' },
      { label: '하버드대학교 로스쿨', value: '법학석사(LL.M) 2008.08-2009.05도 상상 속에서는 꽤 진지했다.' },
      { label: '예일대학교 로스쿨', value: '법학박사(J.S.D.) 2009.09-2014.05까지 가는 장기 시나리오도 있었다.' },
      { label: '실제 최종학력', value: '고졸. 대신 현장학, 생존전략, 재기론은 비공식 전공처럼 오래 수강했다.' },
    ],
  },
  {
    id: 'career',
    number: '03',
    title: '경력',
    subtitle: '이력서보다 생활력이 먼저였던 타임라인',
    icon: BriefcaseBusiness,
    items: [
      { label: '10대 중반', value: '문화일보 석간배달과 음식점 배달로 노동의 기본기를 배웠다.' },
      { label: '10대 후반', value: '각종 비공식 아르바이트를 경험했다. 공식 이력서에는 적기 난감한 챕터.' },
      { label: '20대 초반', value: '사행성 오락실 근무 및 운영. 확률과 리스크를 몸으로 익혔다.' },
      { label: '20대 중반', value: '휴대폰 판매와 운영. 말발, 손님 응대, 재고 스트레스를 한 번에 배웠다.' },
      { label: '20대 후반', value: '공익근무와 휴대폰 내구제. 제도권과 비제도권 사이를 오갔다.' },
      { label: '30대 초반', value: '도박 등으로 한 번 무너졌다. 경력 공백이 아니라 인생 손절매 구간.' },
      { label: '30대 중반', value: '인력사무실 운영. 사람, 현장, 돈의 속도를 동시에 관리했다.' },
      { label: '30대 후반', value: '건설시공팀과 인력사무실 운영. 현장형 리더십의 흙먼지 버전.' },
      { label: '40대 초반', value: '징역 복역 후 잠깐 열심히 살았다. “잠깐”이라는 표현이 이력의 핵심 포인트다.' },
      { label: '현재', value: '노가다, 배달, 대리, 택배 등 다양한 일을 경험 중. 직함보다 생계 대응력이 먼저다.' },
    ],
  },
  {
    id: 'skills',
    number: '04',
    title: '기술 및 자격증',
    subtitle: '바퀴 달린 것과 현장 감각',
    icon: BadgeCheck,
    items: [
      { label: '운전면허', value: '1종 보통, 1종 대형, 2종 소형 보유.' },
      { label: '현장 기술', value: '배달 동선, 대리운전 감각, 택배 적재, 인력 배치, 급한 상황 판단에 강하다.' },
      { label: '대표 역량', value: '계획서보다 빠른 실행, 회의보다 빠른 이동, 포장보다 빠른 인정.' },
    ],
  },
  {
    id: 'record',
    number: '05',
    title: '범죄 경력',
    subtitle: '투명경영이라고 부르기에는 꽤 무거운 페이지',
    icon: ShieldAlert,
    items: [
      { label: '형사 이력', value: '징역 1년. 미화할 수 없고, 숨기기에도 이미 너무 진한 구간.' },
      { label: '주요 경력', value: '사기, 폭행, 재물손괴 등 잡범 경력 보유.' },
      { label: '생활 기록', value: '과태료, 범칙금 등 자잘한 행정 이력도 다수. 성실함의 방향이 가끔 잘못 잡혔다.' },
      { label: '현재 메시지', value: '깨끗한 척보다 덜 위험한 건, 적어도 더럽게 지나온 길을 알고 있다는 점이다.' },
    ],
  },
];

const quickFacts: QuickFactItem[] = [
  {
    label: '최종학력',
    value: '고졸',
    caption: '현장에서 오래 배운 실행형 프로필',
    progress: 58,
    accent: '#60a5fa',
    subLabel: '검증',
    subValue: '실전형',
    icon: GraduationCap,
  },
  {
    label: '면허',
    value: '1종 대형',
    caption: '바퀴 달린 것과 현장 동선에 강한 타입',
    progress: 84,
    accent: '#34d399',
    subLabel: '가동성',
    subValue: '높음',
    icon: BadgeCheck,
  },
  {
    label: '주요 전공',
    value: '현장 생존',
    caption: '직함보다 실행력과 버티는 힘을 앞세웁니다.',
    progress: 91,
    accent: '#a78bfa',
    subLabel: '생존력',
    subValue: '상',
    icon: Scale,
  },
];

const iconMap: Record<string, LucideIcon> = {
  Activity,
  BadgeCheck,
  BriefcaseBusiness,
  GraduationCap,
  Scale,
  ShieldAlert,
  Sparkles,
  UserRound,
};

function findEnabledBlock(page: CorpPage | null | undefined, blockId: string) {
  return page?.blocks.find((block) => block.id === blockId && block.enabled !== false);
}

function getIconByName(name: string | null | undefined, fallback: LucideIcon) {
  return name ? iconMap[name] ?? fallback : fallback;
}

const quickFactAccents = ['#60a5fa', '#34d399', '#a78bfa', '#fbbf24', '#fb7185', '#2dd4bf'];
const quickFactProgress = [58, 84, 91, 76, 68, 88];

function clampProgress(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function readMetricProgress(metric: MetricItem, index: number) {
  if (typeof metric.progress === 'number' && Number.isFinite(metric.progress)) {
    return clampProgress(metric.progress);
  }

  const numericMatch = `${metric.value} ${metric.caption}`.match(/\d+(?:\.\d+)?/);
  if (numericMatch) {
    return clampProgress(Number(numericMatch[0]));
  }

  return quickFactProgress[index % quickFactProgress.length];
}

function buildQuickFact(metric: MetricItem, index: number): QuickFactItem {
  const progress = readMetricProgress(metric, index);

  return {
    label: metric.label,
    value: metric.value,
    caption: metric.caption,
    progress,
    accent: metric.accent?.trim() || quickFactAccents[index % quickFactAccents.length],
    subLabel: metric.subLabel?.trim() || '그래프 수치',
    subValue: metric.subValue?.trim() || `${progress}%`,
    icon: getIconByName(metric.icon, [GraduationCap, BadgeCheck, Scale, Activity, ShieldAlert, Sparkles][index % 6]),
  };
}

function parseProfileDetail(value: string): ProfileItem {
  const [label, ...rest] = value.split(/[:：]/);
  const detail = rest.join(':').trim();

  return detail ? { label: label.trim(), value: detail } : { label: '상세', value };
}

export function buildCeoIntroConfig(page?: CorpPage | null): CeoIntroConfig {
  const heroBlock = findEnabledBlock(page, 'ceo-hero');
  const mediaBlock = findEnabledBlock(page, 'ceo-media');
  const identityBlock = findEnabledBlock(page, 'ceo-identity');
  const sectionBlock = findEnabledBlock(page, 'ceo-profile-sections');
  const factsBlock = findEnabledBlock(page, 'ceo-facts');
  const timelineBlock = findEnabledBlock(page, 'ceo-timeline');
  const portrait = mediaBlock?.type === 'media-showcase' ? mediaBlock.data.media[0] : undefined;
  const features = sectionBlock?.type === 'feature-grid' ? sectionBlock.data.features : [];
  const timelineItems = timelineBlock?.type === 'timeline' ? timelineBlock.data.items : [];

  const nextSections = profileSections.map((section, index) => {
    const feature = features[index];
    const timelineItem = timelineItems[index];
    const bodyRows = [feature?.body, timelineItem?.body].filter((value): value is string => Boolean(value?.trim()));
    const detailRows = feature?.details && feature.details.length > 0 ? feature.details.map(parseProfileDetail) : [];

    return {
      ...section,
      number: feature?.meta?.trim() || section.number,
      title: feature?.title?.trim() || section.title,
      subtitle: timelineItem?.title?.trim() || section.subtitle,
      icon: getIconByName(feature?.icon || timelineItem?.icon, section.icon),
      items:
        detailRows.length > 0
          ? detailRows
          : bodyRows.length > 0
            ? bodyRows.map((value, rowIndex) => ({ label: rowIndex === 0 ? '상세' : '타임라인', value }))
            : section.items,
    };
  });

  return {
    portraitImageUrl:
      portrait?.url || (heroBlock?.type === 'hero' ? heroBlock.data.mediaUrl : undefined) || '/corp/ceo-intro-satire.png',
    portraitImageAlt: portrait?.alt || '공사 현장 분위기의 익명 풍자 대표 인물 사진',
    portraitCaptionRole: portrait?.caption?.split('·')[0]?.trim() || '대표이사',
    portraitCaptionTitle: portrait?.caption?.split('·')[1]?.trim() || '현장형 생존 전략가',
    identityKicker: identityBlock?.type === 'statement' ? identityBlock.data.eyebrow : '비공식 대표 약력',
    identityTitle:
      identityBlock?.type === 'statement'
        ? identityBlock.data.title
        : factsBlock?.type === 'metric-grid'
          ? factsBlock.data.title
          : '포장지는 얇고, 이력은 두껍다.',
    identityText:
      identityBlock?.type === 'statement'
        ? identityBlock.data.body
        : heroBlock?.type === 'hero'
        ? heroBlock.data.body
        : '학벌과 무결점 대신 현장, 시행착오, 재기, 생활력을 들고 온 대표. 이 소개는 장점만 광내는 기업 프로필 대신, 흠집까지 드러내는 풍자 버전이다.',
    introKicker: heroBlock?.type === 'hero' ? heroBlock.data.kicker : 'CEO SATIRE PROFILE',
    introTitle: heroBlock?.type === 'hero' ? heroBlock.data.headline : '대표소개, 이번엔 솔직하게 접어 봤습니다.',
    introBody:
      heroBlock?.type === 'hero'
        ? heroBlock.data.body
        : '그럴듯한 학위, 반듯한 경력, 완벽한 리더십 대신 실제에 가까운 재료를 기업 소개 문법으로 다시 정리했습니다. 펼치면 약력이고, 접으면 풍자입니다.',
    quickFacts:
      factsBlock?.type === 'metric-grid' && factsBlock.data.metrics.length > 0
        ? factsBlock.data.metrics.map(buildQuickFact)
        : quickFacts,
    profileSections: nextSections,
    timelineTitle: timelineBlock?.type === 'timeline' ? timelineBlock.data.title : '생활력이 먼저였던 타임라인',
    timelineSteps:
      timelineBlock?.type === 'timeline' && timelineBlock.data.items.length > 0
        ? timelineBlock.data.items.map((item, index) => ({
            number: item.date,
            title: item.title,
            description: item.body,
            icon: getIconByName(item.icon, [UserRound, BriefcaseBusiness, Scale, Sparkles][index % 4]),
          }))
        : [
            {
              number: '10대',
              title: '배달과 현장 경험',
              description: '신문, 배달, 각종 아르바이트를 통해 노동의 기본기를 배웠습니다.',
              icon: UserRound,
            },
            {
              number: '20대',
              title: '영업과 운영',
              description: '여행사, 의류 판매, 공익근무, 대리운전 등 말과 대응의 현장을 거쳤습니다.',
              icon: BriefcaseBusiness,
            },
            {
              number: '30대',
              title: '인력사무소 운영',
              description: '사람, 현장, 돈의 속도를 동시에 관리하며 운영 감각을 키웠습니다.',
              icon: Scale,
            },
            {
              number: '현재',
              title: '대표 역할',
              description: '멋진 직함보다 빠른 인정, 실행, 책임을 우선하는 대표 캐릭터로 정리됩니다.',
              icon: Sparkles,
            },
          ],
    closingNote:
      timelineBlock?.type === 'timeline' && timelineBlock.data.body.trim()
        ? timelineBlock.data.body
        : '결론: 번듯함은 약하고, 생존력은 강한 대표. 그래서 이 소개는 홍보자료보다 자백서에 가깝다.',
  };
}

const glassEmboss = css`
  border: 1px solid rgba(226, 232, 240, 0.12);
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.035) 31%, transparent 52%),
    linear-gradient(315deg, rgba(2, 6, 23, 0.78), rgba(15, 23, 42, 0.2) 50%, transparent 72%),
    var(--nexus-card);
  box-shadow:
    inset 1px 1px 0 rgba(255, 255, 255, 0.22),
    inset 8px 8px 22px rgba(255, 255, 255, 0.035),
    inset -10px -12px 24px rgba(2, 6, 23, 0.62),
    0 1px 0 rgba(255, 255, 255, 0.08),
    0 28px 76px rgba(0, 0, 0, 0.38);
  backdrop-filter: blur(18px);
`;

const recessedEmboss = css`
  box-shadow:
    inset 1px 1px 0 rgba(255, 255, 255, 0.16),
    inset 6px 6px 16px rgba(255, 255, 255, 0.03),
    inset -7px -8px 18px rgba(2, 6, 23, 0.62),
    0 1px 0 rgba(255, 255, 255, 0.055);
`;

export default function CeoIntroSatirePage({ config, editor }: CeoIntroSatirePageProps = {}) {
  const activeConfig = config ?? buildCeoIntroConfig();
  const [activeSection, setActiveSection] = useState(activeConfig.profileSections[0]?.id ?? '');

  return (
    <Page id="content-area" aria-labelledby="ceo-satire-title">
      <Shell>
        <PortraitColumn aria-label="대표 사진과 핵심 요약">
          <CorpEditableSection blockId="ceo-media" label="대표 이미지 수정" editor={editor}>
          <PortraitFrame>
            <PortraitImage
              src={activeConfig.portraitImageUrl}
              alt={activeConfig.portraitImageAlt}
              width={1024}
              height={1536}
              priority
              sizes="(max-width: 980px) 100vw, 42vw"
            />
            <PortraitCaption>
              <span>{activeConfig.portraitCaptionRole}</span>
              <strong>{activeConfig.portraitCaptionTitle}</strong>
            </PortraitCaption>
          </PortraitFrame>
          </CorpEditableSection>

          <CorpEditableSection blockId="ceo-identity" label="대표 요약 문구 수정" editor={editor}>
          <IdentityBlock>
            <IdentityKicker>
              <UserRound size={16} strokeWidth={2.4} aria-hidden="true" />
              {activeConfig.identityKicker}
            </IdentityKicker>
            <IdentityTitle>{activeConfig.identityTitle}</IdentityTitle>
            <IdentityText>{activeConfig.identityText}</IdentityText>
          </IdentityBlock>
          </CorpEditableSection>

          <CorpEditableSection blockId="ceo-facts" label="그래프 수치 수정" editor={editor}>
          <QuickFactRail aria-label="대표 핵심 정보">
            {activeConfig.quickFacts.map((fact) => {
              const Icon = fact.icon;

              return (
              <QuickFact key={fact.label} $accent={fact.accent}>
                <QuickFactHead>
                  <span>{fact.label}</span>
                  <Icon size={16} strokeWidth={2.35} aria-hidden="true" />
                </QuickFactHead>
                <strong>{fact.value}</strong>
                <p>{fact.caption}</p>
                <QuickFactMeter aria-label={`${fact.label} 그래프 수치 ${fact.progress}%`}>
                  <span style={{ width: `${fact.progress}%` }} />
                </QuickFactMeter>
                <QuickFactMeta>
                  <span>{fact.subLabel}</span>
                  <b>{fact.subValue}</b>
                </QuickFactMeta>
              </QuickFact>
            );
            })}
          </QuickFactRail>
          </CorpEditableSection>
        </PortraitColumn>

        <ContentColumn>
          <CorpEditableSection blockId="ceo-hero" label="첫 화면 문구 수정" editor={editor}>
          <Intro>
            <IntroKicker>
              <Sparkles size={16} strokeWidth={2.4} aria-hidden="true" />
              {activeConfig.introKicker}
            </IntroKicker>
            <h1 id="ceo-satire-title">{activeConfig.introTitle}</h1>
            <p>{activeConfig.introBody}</p>
          </Intro>
          </CorpEditableSection>

          <CorpEditableSection blockId="ceo-profile-sections" label="아코디언 수정" editor={editor}>
          <AccordionList aria-label="대표 소개 상세 아코디언">
            {activeConfig.profileSections.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              const panelId = `ceo-section-${section.id}`;

              return (
                <AccordionItem key={section.id} $active={isActive}>
                  <AccordionButton
                    type="button"
                    aria-expanded={isActive}
                    aria-controls={panelId}
                    onClick={() => setActiveSection(isActive ? '' : section.id)}
                  >
                    <SectionNumber>{section.number}</SectionNumber>
                    <SectionIcon $active={isActive}>
                      <Icon size={19} strokeWidth={2.3} aria-hidden="true" />
                    </SectionIcon>
                    <SectionHeading>
                      <strong>{section.title}</strong>
                      <span>{section.subtitle}</span>
                    </SectionHeading>
                    <Chevron $active={isActive} aria-hidden="true">
                      <ChevronDown size={20} strokeWidth={2.5} />
                    </Chevron>
                  </AccordionButton>

                  <AccordionPanel id={panelId} $active={isActive} aria-hidden={!isActive}>
                    <PanelInner $active={isActive}>
                      {section.items.map((item) => (
                        <ProfileRow key={`${section.id}-${item.label}`}>
                          <dt>{item.label}</dt>
                          <dd>{item.value}</dd>
                        </ProfileRow>
                      ))}
                    </PanelInner>
                  </AccordionPanel>
                </AccordionItem>
              );
            })}
          </AccordionList>
          </CorpEditableSection>

          <CorpEditableSection blockId="ceo-timeline" label="대표 타임라인 수정" editor={editor}>
            <CeoTimelineSection aria-label="대표 생활력 타임라인">
              <TimelineHeader>
                <span>{activeConfig.timelineTitle}</span>
                <p>{activeConfig.closingNote}</p>
              </TimelineHeader>
              <CeoTimelineGrid>
                {activeConfig.timelineSteps.map((step) => {
                  const Icon = step.icon;

                  return (
                    <CeoTimelineCard key={`${step.number}-${step.title}`}>
                      <b>{step.number}</b>
                      <Icon size={18} strokeWidth={2.35} aria-hidden="true" />
                      <strong>{step.title}</strong>
                      <p>{step.description}</p>
                    </CeoTimelineCard>
                  );
                })}
              </CeoTimelineGrid>
            </CeoTimelineSection>
          </CorpEditableSection>
        </ContentColumn>
      </Shell>
    </Page>
  );
}

const Page = styled.main`
  --nexus-bg: #090d16;
  --nexus-card: rgba(19, 25, 38, 0.74);
  --nexus-card-strong: rgba(15, 23, 42, 0.88);
  --nexus-border: rgba(199, 210, 254, 0.15);
  --nexus-border-soft: rgba(226, 232, 240, 0.075);
  --nexus-text: #f8fafc;
  --nexus-muted: #cbd5e1;
  --nexus-faint: #94a3b8;
  --nexus-indigo: #6366f1;
  --nexus-blue: #3b82f6;
  --nexus-purple: #a855f7;
  --nexus-emerald: #10b981;
  --nexus-amber: #fbbf24;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
  isolation: isolate;
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
    linear-gradient(0deg, rgba(255, 255, 255, 0.032) 1px, transparent 1px),
    radial-gradient(circle at 20% 18%, rgba(99, 102, 241, 0.22), transparent 34%),
    radial-gradient(circle at 78% 32%, rgba(59, 130, 246, 0.14), transparent 31%),
    radial-gradient(circle at 56% 78%, rgba(16, 185, 129, 0.1), transparent 34%),
    var(--nexus-bg);
  background-size: 64px 64px, 64px 64px, auto, auto, auto, auto;
  color: var(--nexus-text);
  font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
  letter-spacing: 0;
`;

const Shell = styled.div`
  width: min(1180px, 100%);
  margin: 0 auto;
  padding: 38px 32px 64px;
  display: grid;
  grid-template-columns: minmax(300px, 0.88fr) minmax(430px, 1.12fr);
  gap: 30px;
  align-items: start;
  position: relative;

  &::before {
    content: '';
    position: absolute;
    inset: 26px 18px auto auto;
    width: 170px;
    height: 170px;
    z-index: 0;
    border-radius: 999px;
    background: radial-gradient(circle, rgba(99, 102, 241, 0.2), transparent 68%);
    filter: blur(8px);
    pointer-events: none;
  }

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
    padding: 28px 18px 44px;
  }

  @media (max-width: 520px) {
    padding: 18px 12px 34px;
  }
`;

const PortraitColumn = styled.aside`
  min-width: 0;
  display: grid;
  gap: 18px;
  position: sticky;
  top: 24px;
  z-index: 1;
  padding: 16px;
  border-radius: 8px;
  ${glassEmboss}

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    background:
      linear-gradient(120deg, rgba(99, 102, 241, 0.18), transparent 42%),
      linear-gradient(300deg, rgba(16, 185, 129, 0.09), transparent 52%);
    pointer-events: none;
  }

  &::after {
    content: '';
    width: fit-content;
    position: absolute;
    inset: 14px 14px auto auto;
    width: 54px;
    height: 3px;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--nexus-blue), var(--nexus-indigo), var(--nexus-purple));
    box-shadow: 0 0 18px rgba(99, 102, 241, 0.46);
  }

  @media (max-width: 980px) {
    position: static;
    max-width: 640px;
    margin: 0 auto;
  }
`;

const PortraitFrame = styled.figure`
  margin: 0;
  position: relative;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid rgba(226, 232, 240, 0.13);
  aspect-ratio: 4 / 5;
  background: rgba(15, 23, 42, 0.86);
  box-shadow:
    inset 1px 1px 0 rgba(255, 255, 255, 0.18),
    inset 8px 8px 20px rgba(255, 255, 255, 0.03),
    inset -10px -12px 24px rgba(2, 6, 23, 0.66),
    0 1px 0 rgba(255, 255, 255, 0.06),
    0 20px 62px rgba(0, 0, 0, 0.32);

  &::before {
    content: 'CEO PROFILE';
    position: absolute;
    top: 14px;
    left: 14px;
    z-index: 2;
    min-height: 34px;
    display: inline-flex;
    align-items: center;
    padding: 0 12px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.66);
    color: #c7d2fe;
    font-size: 0.72rem;
    font-weight: 900;
    ${recessedEmboss}
    backdrop-filter: blur(12px);
  }

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      linear-gradient(180deg, transparent 40%, rgba(2, 6, 23, 0.9) 100%),
      linear-gradient(120deg, rgba(99, 102, 241, 0.08), transparent 42%, rgba(16, 185, 129, 0.08)),
      linear-gradient(90deg, rgba(255, 255, 255, 0.065) 1px, transparent 1px),
      linear-gradient(0deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
    background-size: auto, auto, 54px 54px, 54px 54px;
    mix-blend-mode: screen;
    opacity: 0.72;
  }
`;

const PortraitImage = styled(Image)`
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 24%;
  filter: contrast(1.05) saturate(0.9) brightness(0.86);
`;

const PortraitCaption = styled.figcaption`
  position: absolute;
  left: 18px;
  right: 18px;
  bottom: 18px;
  z-index: 1;
  display: grid;
  gap: 6px;

  span {
    width: fit-content;
    padding: 6px 10px;
    border: 1px solid rgba(199, 210, 254, 0.2);
    border-radius: 999px;
    color: #c7d2fe;
    font-size: 0.76rem;
    font-weight: 900;
    line-height: 1;
    letter-spacing: 0;
    background: rgba(15, 23, 42, 0.72);
    ${recessedEmboss}
    backdrop-filter: blur(12px);
  }

  strong {
    color: var(--nexus-text);
    font-size: 1.35rem;
    line-height: 1.18;
    text-shadow: 0 8px 24px rgba(0, 0, 0, 0.36);
  }
`;

const IdentityBlock = styled.div`
  display: grid;
  gap: 9px;
  padding: 14px;
  border: 1px solid rgba(226, 232, 240, 0.085);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.58);
  ${recessedEmboss}
`;

const IdentityKicker = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #a5b4fc;
  font-size: 0.82rem;
  font-weight: 800;
`;

const IdentityTitle = styled.h2`
  margin: 0;
  color: var(--nexus-text);
  font-size: 1.34rem;
  line-height: 1.24;
  word-break: keep-all;
  overflow-wrap: break-word;
`;

const IdentityText = styled.p`
  margin: 0;
  color: var(--nexus-muted);
  font-size: 0.96rem;
  line-height: 1.72;
  word-break: keep-all;
  overflow-wrap: break-word;
`;

const QuickFactRail = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
  gap: 10px;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const QuickFact = styled.div<{ $accent: string }>`
  min-width: 0;
  min-height: 176px;
  padding: 13px;
  display: grid;
  align-content: start;
  gap: 8px;
  border: 1px solid rgba(226, 232, 240, 0.085);
  border-radius: 8px;
  color: ${(props) => props.$accent};
  background:
    linear-gradient(145deg, ${(props) => `${props.$accent}26`}, transparent 42%),
    rgba(255, 255, 255, 0.034);
  ${recessedEmboss}

  strong {
    color: var(--nexus-text);
    font-size: 1.14rem;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }

  p {
    min-height: 42px;
    margin: 0;
    color: var(--nexus-muted);
    font-size: 0.75rem;
    font-weight: 750;
    line-height: 1.42;
    word-break: keep-all;
    overflow-wrap: break-word;
  }
`;

const QuickFactHead = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;

  span {
    color: var(--nexus-faint);
    font-size: 0.75rem;
    font-weight: 850;
  }

  svg {
    flex: 0 0 auto;
    color: #c7d2fe;
  }
`;

const QuickFactMeter = styled.div`
  height: 9px;
  overflow: hidden;
  border-radius: 999px;
  border: 1px solid rgba(226, 232, 240, 0.11);
  background: rgba(2, 6, 23, 0.48);
  box-shadow:
    inset 1px 1px 0 rgba(255, 255, 255, 0.12),
    inset -4px -4px 10px rgba(2, 6, 23, 0.46);

  span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, currentColor, #ffffff);
    opacity: 0.9;
  }
`;

const QuickFactMeta = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--nexus-faint);
  font-size: 0.72rem;
  font-weight: 850;

  b {
    color: #c7d2fe;
    font-size: 0.78rem;
  }
`;

const ContentColumn = styled.section`
  min-width: 0;
  display: grid;
  gap: 20px;
  z-index: 1;
  padding: 16px;
  border-radius: 8px;
  ${glassEmboss}
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.045) 1px, transparent 1px),
      linear-gradient(0deg, rgba(255, 255, 255, 0.032) 1px, transparent 1px);
    background-size: 54px 54px;
    opacity: 0.28;
    mix-blend-mode: screen;
  }

  > * {
    position: relative;
    z-index: 1;
  }
`;

const Intro = styled.header`
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid rgba(226, 232, 240, 0.12);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(99, 102, 241, 0.16), transparent 42%),
    rgba(15, 23, 42, 0.66);
  position: relative;
  ${recessedEmboss}

  &::after {
    content: '';
    position: absolute;
    top: 16px;
    right: 16px;
    width: 70px;
    height: 4px;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--nexus-blue), var(--nexus-indigo), var(--nexus-purple));
    box-shadow: 0 0 18px rgba(99, 102, 241, 0.44);
  }

  h1 {
    margin: 0;
    max-width: 720px;
    color: var(--nexus-text);
    font-size: 2.28rem;
    line-height: 1.15;
    letter-spacing: 0;
    word-break: keep-all;
    overflow-wrap: break-word;
  }

  p {
    margin: 0;
    max-width: 740px;
    color: var(--nexus-muted);
    font-size: 1.02rem;
    line-height: 1.75;
    word-break: keep-all;
    overflow-wrap: break-word;
  }

  @media (max-width: 620px) {
    &::after {
      position: static;
      width: fit-content;
      margin-top: 2px;
      transform: rotate(-1deg);
    }

    h1 {
      font-size: 1.86rem;
      line-height: 1.22;
    }

    p {
      font-size: 0.98rem;
    }
  }
`;

const IntroKicker = styled.span`
  width: fit-content;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid rgba(165, 180, 252, 0.2);
  color: #a5b4fc;
  background: rgba(99, 102, 241, 0.11);
  font-size: 0.78rem;
  font-weight: 900;
  ${recessedEmboss}
`;

const AccordionList = styled.div`
  display: grid;
  gap: 10px;
`;

const AccordionItem = styled.article<{ $active: boolean }>`
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid ${(props) => (props.$active ? 'rgba(165, 180, 252, 0.3)' : 'rgba(226, 232, 240, 0.075)')};
  background: ${(props) =>
    props.$active
      ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.16), rgba(15, 23, 42, 0.74))'
      : 'rgba(15, 23, 42, 0.54)'};
  box-shadow: ${(props) =>
    props.$active
      ? 'inset 1px 1px 0 rgba(255, 255, 255, 0.18), inset 7px 7px 18px rgba(255, 255, 255, 0.03), inset -9px -10px 22px rgba(2, 6, 23, 0.62), 0 1px 0 rgba(255, 255, 255, 0.06), 0 18px 42px rgba(0, 0, 0, 0.27)'
      : 'inset 1px 1px 0 rgba(255, 255, 255, 0.11), inset 5px 5px 14px rgba(255, 255, 255, 0.024), inset -7px -8px 18px rgba(2, 6, 23, 0.56)'};
  position: relative;
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    box-shadow 0.2s ease;

  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 5px;
    background: ${(props) =>
      props.$active
        ? 'linear-gradient(180deg, var(--nexus-blue), var(--nexus-indigo), var(--nexus-purple))'
        : 'rgba(148, 163, 184, 0.16)'};
    box-shadow: ${(props) => (props.$active ? '0 0 18px rgba(99, 102, 241, 0.42)' : 'none')};
  }
`;

const AccordionButton = styled.button`
  width: 100%;
  min-height: 74px;
  display: grid;
  grid-template-columns: 42px 42px minmax(0, 1fr) 34px;
  gap: 12px;
  align-items: center;
  padding: 14px 16px;
  color: inherit;
  background: transparent;
  border: 0;
  cursor: pointer;
  text-align: left;

  &:focus-visible {
    outline: 2px solid var(--nexus-indigo);
    outline-offset: -3px;
  }

  @media (max-width: 520px) {
    min-height: 68px;
    grid-template-columns: 34px 36px minmax(0, 1fr) 26px;
    gap: 9px;
    padding: 12px;
  }
`;

const SectionNumber = styled.span`
  color: var(--nexus-faint);
  font-size: 0.84rem;
  font-weight: 900;
`;

const SectionIcon = styled.span<{ $active: boolean }>`
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: ${(props) => (props.$active ? '#f8fafc' : '#a5b4fc')};
  background: ${(props) =>
    props.$active
      ? 'linear-gradient(135deg, var(--nexus-blue), var(--nexus-indigo))'
      : 'rgba(99, 102, 241, 0.11)'};
  box-shadow:
    inset 1px 1px 0 rgba(255, 255, 255, 0.24),
    inset 5px 5px 12px rgba(255, 255, 255, 0.04),
    inset -6px -7px 15px rgba(2, 6, 23, 0.58),
    ${(props) => (props.$active ? '0 10px 24px rgba(99, 102, 241, 0.28)' : 'none')};

  @media (max-width: 520px) {
    width: 36px;
    height: 36px;
  }
`;

const SectionHeading = styled.span`
  min-width: 0;
  display: grid;
  gap: 5px;

  strong {
    color: var(--nexus-text);
    font-size: 1.02rem;
    line-height: 1.25;
    word-break: keep-all;
    overflow-wrap: break-word;
  }

  span {
    color: var(--nexus-muted);
    font-size: 0.86rem;
    line-height: 1.35;
    word-break: keep-all;
    overflow-wrap: break-word;
  }
`;

const Chevron = styled.span<{ $active: boolean }>`
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${(props) => (props.$active ? '#c7d2fe' : 'var(--nexus-faint)')};
  transform: rotate(${(props) => (props.$active ? '180deg' : '0deg')});
  transition: transform 0.2s ease;
`;

const AccordionPanel = styled.div<{ $active: boolean }>`
  display: grid;
  grid-template-rows: ${(props) => (props.$active ? '1fr' : '0fr')};
  overflow: hidden;
  opacity: ${(props) => (props.$active ? 1 : 0)};
  visibility: ${(props) => (props.$active ? 'visible' : 'hidden')};
  pointer-events: ${(props) => (props.$active ? 'auto' : 'none')};
  transition:
    grid-template-rows 0.26s ease,
    opacity 0.16s ease,
    visibility 0s ${(props) => (props.$active ? '0s' : '0.16s')};
`;

const PanelInner = styled.dl<{ $active: boolean }>`
  min-height: 0;
  overflow: hidden;
  margin: 0;
  padding: ${(props) => (props.$active ? '0 16px 16px 112px' : '0 16px 0 112px')};
  display: grid;
  gap: 10px;
  transform: translateY(${(props) => (props.$active ? '0' : '-4px')});
  transition:
    padding 0.26s ease,
    transform 0.26s ease;

  @media (max-width: 520px) {
    padding: ${(props) => (props.$active ? '0 12px 14px 12px' : '0 12px 0 12px')};
  }
`;

const ProfileRow = styled.div`
  display: grid;
  grid-template-columns: minmax(96px, 0.25fr) minmax(0, 1fr);
  gap: 14px;
  padding-top: 10px;
  border-top: 1px solid var(--nexus-border-soft);

  dt {
    color: #a5b4fc;
    font-size: 0.86rem;
    font-weight: 900;
    line-height: 1.5;
  }

  dd {
    margin: 0;
    color: var(--nexus-muted);
    font-size: 0.96rem;
    line-height: 1.66;
    word-break: keep-all;
    overflow-wrap: break-word;
  }

  @media (max-width: 620px) {
    grid-template-columns: 1fr;
    gap: 3px;
  }
`;

const CeoTimelineSection = styled.section`
  display: grid;
  gap: 12px;
  margin: 2px 0 0;
  padding: 16px;
  border: 1px solid rgba(165, 180, 252, 0.2);
  border-radius: 8px;
  color: var(--nexus-muted);
  background:
    linear-gradient(135deg, rgba(99, 102, 241, 0.16), transparent 44%),
    rgba(15, 23, 42, 0.66);
  position: relative;
  ${recessedEmboss}

  &::after {
    content: '';
    position: absolute;
    right: 14px;
    bottom: 10px;
    width: 48px;
    height: 3px;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--nexus-emerald), var(--nexus-blue));
    opacity: 0.8;
  }

`;

const TimelineHeader = styled.header`
  display: grid;
  gap: 7px;

  span {
    color: #a5b4fc;
    font-size: 0.82rem;
    font-weight: 950;
  }

  p {
    margin: 0;
    max-width: 760px;
    color: var(--nexus-muted);
    font-size: 0.96rem;
    line-height: 1.65;
    word-break: keep-all;
  }
`;

const CeoTimelineGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const CeoTimelineCard = styled.article`
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 7px 9px;
  align-items: start;
  padding: 12px;
  border: 1px solid rgba(226, 232, 240, 0.085);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.036);

  b {
    grid-column: 1 / -1;
    width: fit-content;
    border-radius: 999px;
    padding: 4px 8px;
    color: #c7d2fe;
    background: rgba(99, 102, 241, 0.18);
    font-size: 0.72rem;
    font-weight: 950;
  }

  svg {
    color: #a5b4fc;
    margin-top: 2px;
  }

  strong {
    color: var(--nexus-text);
    font-size: 0.98rem;
    line-height: 1.38;
  }

  p {
    grid-column: 1 / -1;
    margin: 0;
    color: var(--nexus-muted);
    font-size: 0.86rem;
    line-height: 1.58;
    word-break: keep-all;
  }
`;
