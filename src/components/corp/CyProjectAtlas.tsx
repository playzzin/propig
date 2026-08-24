'use client';

import { useState } from 'react';
import {
  AppWindow,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileSpreadsheet,
  ReceiptText,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import styled from 'styled-components';

type PreviewKind = 'dashboard' | 'form' | 'records' | 'workflow';

type CyScreen = {
  id: string;
  title: string;
  description: string;
  action: string;
  flow: [string, string, string, string];
  preview: PreviewKind;
};

type CyModule = {
  id: string;
  index: string;
  label: string;
  eyebrow: string;
  description: string;
  accent: string;
  icon: LucideIcon;
  screens: CyScreen[];
};

const CY_MODULES: CyModule[] = [
  {
    id: 'field',
    index: '01',
    label: '현장 운영',
    eyebrow: 'FIELD OPERATIONS',
    description: '현장의 오늘을 기록하고, 공정과 이슈를 사무실의 판단으로 연결합니다.',
    accent: '#70d8ee',
    icon: ClipboardCheck,
    screens: [
      {
        id: 'field-dashboard',
        title: '현장 대시보드',
        description: '오늘의 인력·공정·이슈를 한 화면에서 먼저 확인하는 운영 시작점입니다.',
        action: '오늘의 현장 상태 확인',
        flow: ['현황 확인', '이슈 선택', '담당자 공유', '조치 기록'],
        preview: 'dashboard',
      },
      {
        id: 'field-report',
        title: '일일 작업일보',
        description: '작업 내용, 투입 인력, 현장 사진과 전달 사항을 기준화해 입력합니다.',
        action: '일보 작성 및 제출',
        flow: ['기본 정보', '작업 입력', '사진 첨부', '공유 요청'],
        preview: 'form',
      },
      {
        id: 'field-progress',
        title: '공정 · 이슈 현황',
        description: '진행 중인 공정과 해결이 필요한 이슈를 우선순위로 관리합니다.',
        action: '이슈 상태 갱신',
        flow: ['공정 확인', '이슈 등록', '담당 배정', '완료 검토'],
        preview: 'workflow',
      },
      {
        id: 'field-assets',
        title: '사진 · 첨부 자료',
        description: '현장 사진과 문서를 일자와 공정 기준으로 축적해 다시 찾기 쉽게 만듭니다.',
        action: '현장 자료 탐색',
        flow: ['자료 검색', '공정 필터', '미리 보기', '운영 공유'],
        preview: 'records',
      },
      {
        id: 'field-share',
        title: '운영 공유 보드',
        description: '현장의 결정 사항과 다음 요청을 팀이 같은 맥락으로 확인하는 보드입니다.',
        action: '다음 조치 공유',
        flow: ['요청 확인', '조치 작성', '검토 지정', '이력 저장'],
        preview: 'workflow',
      },
    ],
  },
  {
    id: 'payroll',
    index: '02',
    label: '급여 · 정산',
    eyebrow: 'PAYROLL CONTROL',
    description: '근무 기록에서 지급 준비까지, 계산 과정과 검토 책임을 분명하게 남깁니다.',
    accent: '#9be2a2',
    icon: FileSpreadsheet,
    screens: [
      {
        id: 'payroll-attendance',
        title: '근무 기록',
        description: '급여 산정의 기준이 되는 근무 시간과 현장별 투입 정보를 정리합니다.',
        action: '근무 기준 검토',
        flow: ['근무 수집', '누락 확인', '기준 반영', '확정 대기'],
        preview: 'records',
      },
      {
        id: 'payroll-calculate',
        title: '급여 · 수당 산정',
        description: '기본급, 수당, 공제 조건을 한 흐름에서 검토 가능한 계산 단위로 만듭니다.',
        action: '산정 내역 확인',
        flow: ['대상 선택', '조건 계산', '차이 확인', '검토 요청'],
        preview: 'dashboard',
      },
      {
        id: 'payroll-approval',
        title: '검토 · 승인',
        description: '담당자의 검토와 최종 승인을 분리해 예외 발생 지점을 명확히 보여줍니다.',
        action: '승인 상태 처리',
        flow: ['산정 검토', '예외 메모', '승인 요청', '확정 기록'],
        preview: 'workflow',
      },
      {
        id: 'payroll-payment',
        title: '지급 준비',
        description: '확정된 지급 대상을 실행 직전 다시 확인할 수 있는 마지막 안전 구간입니다.',
        action: '지급 목록 준비',
        flow: ['확정 목록', '계좌 확인', '지급 예정', '결과 보관'],
        preview: 'form',
      },
      {
        id: 'payroll-history',
        title: '정산 이력',
        description: '월별 결과와 수정 사유를 다시 확인할 수 있도록 정산의 맥락을 보존합니다.',
        action: '정산 이력 조회',
        flow: ['기간 선택', '변경 비교', '근거 확인', '보고 공유'],
        preview: 'records',
      },
    ],
  },
  {
    id: 'people',
    index: '03',
    label: '인력 · DB',
    eyebrow: 'WORKFORCE DATA',
    description: '사람의 정보와 배치 이력을 운영 가능한 데이터로 바꾸는 인력 관리 영역입니다.',
    accent: '#aeb9ff',
    icon: UsersRound,
    screens: [
      {
        id: 'people-dashboard',
        title: '인력 현황',
        description: '가용 인력, 현장 배치, 확인이 필요한 변동 사항을 한 번에 파악합니다.',
        action: '가용 인력 확인',
        flow: ['인력 현황', '배치 확인', '공백 파악', '요청 전달'],
        preview: 'dashboard',
      },
      {
        id: 'people-profile',
        title: '인력 프로필',
        description: '연락처, 역할, 소속과 필요한 운영 정보를 하나의 프로필로 관리합니다.',
        action: '인력 정보 조회',
        flow: ['대상 검색', '기본 정보', '운영 메모', '변경 저장'],
        preview: 'records',
      },
      {
        id: 'people-qualification',
        title: '자격 · 경력',
        description: '보유 자격과 현장 경력을 배치 판단에 바로 활용할 수 있게 정리합니다.',
        action: '역량 기준 검토',
        flow: ['이력 확인', '자격 등록', '만료 점검', '배치 반영'],
        preview: 'form',
      },
      {
        id: 'people-assignment',
        title: '현장 배치',
        description: '현장별 필요한 역할과 실제 배치를 비교해 운영 공백을 줄입니다.',
        action: '현장 배치 조정',
        flow: ['수요 확인', '인력 선택', '배치 검토', '공유 완료'],
        preview: 'workflow',
      },
      {
        id: 'people-search',
        title: '인력 검색 · 필터',
        description: '역할, 경력, 자격, 배치 가능 상태를 기준으로 필요한 인력을 빠르게 찾습니다.',
        action: '조건별 인력 탐색',
        flow: ['조건 설정', '결과 확인', '후보 비교', '배치 이동'],
        preview: 'records',
      },
    ],
  },
  {
    id: 'invoice',
    index: '04',
    label: '세금계산서',
    eyebrow: 'FINANCIAL RECORDS',
    description: '거래처와 증빙, 발행 상태를 연결해 월별 정산의 누락을 줄입니다.',
    accent: '#efc47f',
    icon: ReceiptText,
    screens: [
      {
        id: 'invoice-partner',
        title: '거래처 관리',
        description: '발행에 필요한 거래처 정보와 담당자, 처리 기준을 일관되게 관리합니다.',
        action: '거래처 정보 확인',
        flow: ['거래처 검색', '정보 확인', '담당 지정', '기준 저장'],
        preview: 'records',
      },
      {
        id: 'invoice-issue',
        title: '세금계산서 발행',
        description: '발행 대상과 금액, 첨부 근거를 같은 작업 단위에서 확인하도록 설계했습니다.',
        action: '발행 내용 준비',
        flow: ['대상 선택', '금액 입력', '증빙 연결', '발행 확인'],
        preview: 'form',
      },
      {
        id: 'invoice-evidence',
        title: '증빙 확인',
        description: '검토가 필요한 문서와 누락 가능성을 발행 전 단계에서 먼저 드러냅니다.',
        action: '증빙 상태 검토',
        flow: ['증빙 수집', '누락 점검', '검토 요청', '발행 반영'],
        preview: 'workflow',
      },
      {
        id: 'invoice-history',
        title: '발행 · 정산 이력',
        description: '발행 결과와 수정 이력을 거래처 및 기간 기준으로 빠르게 확인합니다.',
        action: '발행 이력 조회',
        flow: ['기간 선택', '이력 확인', '수정 비교', '보고 출력'],
        preview: 'records',
      },
      {
        id: 'invoice-close',
        title: '월별 마감',
        description: '월 단위의 발행 진행률과 남은 확인 사항을 마감 보드로 관리합니다.',
        action: '마감 진행 확인',
        flow: ['진행률 확인', '미완료 점검', '마감 승인', '기록 보관'],
        preview: 'dashboard',
      },
    ],
  },
];

const CY_SCREENS = CY_MODULES.flatMap((module) =>
  module.screens.map((screen) => ({ ...screen, module })),
);

const PROJECT_FACTS = [
  ['01', '운영 제품', 'CY ERP'],
  ['04', '핵심 모듈', '현장 · 정산 · 인력 · 증빙'],
  ['20', '포트폴리오 화면', '메뉴와 세부 페이지 전체'],
  ['04', '공통 운영 기준', '확인 · 입력 · 승인 · 기록'],
] as const;

export function CyProjectAtlas() {
  const [activeScreenId, setActiveScreenId] = useState(CY_SCREENS[0].id);
  const activeScreen = CY_SCREENS.find((screen) => screen.id === activeScreenId) ?? CY_SCREENS[0];
  const { module } = activeScreen;
  const ModuleIcon = module.icon;

  return (
    <AtlasSection id="portfolio-map" aria-labelledby="portfolio-map-title">
      <AtlasIntro>
        <div>
          <Kicker><AppWindow size={16} aria-hidden="true" />CY PROJECT ATLAS</Kicker>
          <h2 id="portfolio-map-title">CY 프로젝트를 만든 이유와, 실제 제품 전체를 한 장에 담았습니다.</h2>
          <p>
            CY는 현장 업무가 기록에서 끝나지 않고 정산, 인력 배치, 증빙 관리와 이어지도록 만든 운영 ERP입니다.
            이 포트폴리오는 프로젝트의 기능 목록이 아니라, 사용자가 어떤 메뉴를 거쳐 일을 완료하는지까지 보여주는 제품 지도입니다.
          </p>
        </div>
        <AtlasStatement>
          <span>DESIGN → BUILD → OPERATE</span>
          <strong>업무의 시작과 끝이 끊기지 않도록</strong>
          <small>모든 화면을 확인 · 입력 · 검토 · 기록의 하나의 리듬으로 설계했습니다.</small>
        </AtlasStatement>
      </AtlasIntro>

      <FactGrid aria-label="CY 프로젝트 구성 요약">
        {PROJECT_FACTS.map(([value, label, detail]) => (
          <FactItem key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
            <small>{detail}</small>
          </FactItem>
        ))}
      </FactGrid>

      <MapHeading>
        <div>
          <Kicker><Building2 size={16} aria-hidden="true" />FULL PRODUCT NAVIGATION</Kicker>
          <h3>4개 모듈, 20개 메뉴를 빠짐없이 연결한 제품 구조</h3>
        </div>
        <p>메뉴를 선택하면 해당 화면이 해결하는 일과 핵심 동선을 바로 확인할 수 있습니다.</p>
      </MapHeading>

      <NavigationMap aria-label="CY ERP 전체 메뉴 지도">
        {CY_MODULES.map((item) => {
          const ItemIcon = item.icon;
          const isActiveModule = item.id === module.id;

          return (
            <ModuleGroup key={item.id} $active={isActiveModule} $accent={item.accent}>
              <ModuleTitle>
                <span>{item.index}</span>
                <i><ItemIcon size={18} aria-hidden="true" /></i>
                <div><small>{item.eyebrow}</small><strong>{item.label}</strong></div>
              </ModuleTitle>
              <p>{item.description}</p>
              <MenuList>
                {item.screens.map((screen, index) => {
                  const selected = screen.id === activeScreen.id;
                  return (
                    <MenuButton
                      key={screen.id}
                      type="button"
                      aria-pressed={selected}
                      aria-controls="cy-screen-preview"
                      $active={selected}
                      onClick={() => setActiveScreenId(screen.id)}
                    >
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <b>{screen.title}</b>
                      <ChevronRight size={15} aria-hidden="true" />
                    </MenuButton>
                  );
                })}
              </MenuList>
            </ModuleGroup>
          );
        })}
      </NavigationMap>

      <ScreenPreview id="cy-screen-preview" aria-live="polite" $accent={module.accent}>
        <PreviewTop>
          <PreviewRoute><span>CY ERP</span><ChevronRight size={13} aria-hidden="true" /><span>{module.label}</span><ChevronRight size={13} aria-hidden="true" /><strong>{activeScreen.title}</strong></PreviewRoute>
          <PreviewStatus><CheckCircle2 size={15} aria-hidden="true" />PORTFOLIO VIEW</PreviewStatus>
        </PreviewTop>
        <PreviewBody>
          <PreviewCopy>
            <PreviewIcon><ModuleIcon size={23} aria-hidden="true" /></PreviewIcon>
            <Kicker>{module.eyebrow}</Kicker>
            <h3>{activeScreen.title}</h3>
            <p>{activeScreen.description}</p>
            <PreviewAction><span>PRIMARY ACTION</span><strong>{activeScreen.action}</strong></PreviewAction>
            <FlowList aria-label={`${activeScreen.title} 사용자 흐름`}>
              {activeScreen.flow.map((step, index) => (
                <li key={step}><span>{String(index + 1).padStart(2, '0')}</span><b>{step}</b></li>
              ))}
            </FlowList>
          </PreviewCopy>
          <ProductCanvas aria-label={`${activeScreen.title} 화면 구성 예시`}>
            <CanvasTop><span>CY OPERATIONS</span><i /><b>{activeScreen.title}</b><small>새로 만들기</small></CanvasTop>
            <CanvasContent>{renderPreview(activeScreen.preview)}</CanvasContent>
          </ProductCanvas>
        </PreviewBody>
      </ScreenPreview>

      <ScopeFooter>
        <BriefcaseBusiness size={20} aria-hidden="true" />
        <div><strong>CY 포트폴리오의 핵심</strong><span>각 메뉴는 독립된 화면이 아니라 다음 업무를 위한 근거를 남기는 운영 흐름으로 연결됩니다.</span></div>
      </ScopeFooter>
    </AtlasSection>
  );
}

function renderPreview(kind: PreviewKind) {
  if (kind === 'form') {
    return (
      <FormPreview>
        <div><span>01</span><b>기본 정보</b><i /></div><div><span>02</span><b>운영 내용</b><i /></div><div><span>03</span><b>검토 · 제출</b></div>
        <section><small>작업 기준</small><strong>필수 정보를 빠짐없이 입력합니다.</strong></section>
        <section><small>확인 메모</small><strong>예외 사항은 검토 대상에 자동으로 남깁니다.</strong></section>
      </FormPreview>
    );
  }

  if (kind === 'records') {
    return (
      <RecordsPreview>
        <SearchBar><span>검색어 또는 조건 입력</span><b>필터</b></SearchBar>
        {['기준 데이터와 최신 상태를 함께 확인', '변경 이력과 담당자를 한 줄로 정리', '필요한 기록만 빠르게 다시 찾기'].map((line, index) => (
          <div key={line}><i>{String(index + 1).padStart(2, '0')}</i><span>{line}</span><b>{index === 1 ? '검토' : '확인'}</b></div>
        ))}
      </RecordsPreview>
    );
  }

  if (kind === 'workflow') {
    return (
      <WorkflowPreview>
        {['확인 필요', '진행 중', '검토 완료'].map((title, index) => (
          <section key={title}><header><span>{title}</span><b>{index + 1}</b></header><div>{index === 0 ? '새 요청을 확인합니다.' : index === 1 ? '담당자가 조치 중입니다.' : '다음 업무로 기록됩니다.'}</div></section>
        ))}
      </WorkflowPreview>
    );
  }

  return (
    <DashboardPreview>
      <div><span>오늘 확인</span><strong>08</strong><small>확인이 필요한 운영 항목</small></div>
      <div><span>처리 완료</span><strong>24</strong><small>기록과 함께 마감된 항목</small></div>
      <section><i /><i /><i /><i /><i /><i /></section>
      <footer><span>운영 흐름</span><b /><span>상태 기준</span><b /><span>다음 조치</span></footer>
    </DashboardPreview>
  );
}

const AtlasSection = styled.section`
  padding-top: clamp(82px, 11vw, 138px);
  scroll-margin-top: 24px;
`;

const AtlasIntro = styled.header`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 0.34fr);
  align-items: end;
  gap: 32px;

  h2 { max-width: 820px; margin: 14px 0 0; color: #f5fbfe; font-size: clamp(2rem, 4vw, 3.4rem); font-weight: 900; letter-spacing: -0.035em; line-height: 1.16; text-wrap: balance; word-break: keep-all; }
  p { max-width: 790px; margin: 18px 0 0; color: rgba(211, 231, 239, 0.7); font-size: 1rem; font-weight: 650; line-height: 1.78; word-break: keep-all; }
  @media (max-width: 850px) { grid-template-columns: 1fr; gap: 20px; }
`;

const Kicker = styled.span`
  width: fit-content;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #91dfec;
  font-size: 0.7rem;
  font-weight: 900;
  letter-spacing: 0.12em;
  line-height: 1.25;
`;

const AtlasStatement = styled.aside`
  min-height: 158px;
  padding: 18px;
  border-left: 2px solid #8eddeb;
  background-color: rgba(124, 211, 232, 0.06);
  display: grid;
  align-content: center;
  gap: 8px;

  span { color: #8eddeb; font-size: 0.64rem; font-weight: 900; letter-spacing: 0.12em; }
  strong { color: #effaff; font-size: 1.05rem; font-weight: 900; line-height: 1.4; word-break: keep-all; }
  small { color: rgba(210, 229, 236, 0.6); font-size: 0.75rem; font-weight: 700; line-height: 1.55; word-break: keep-all; }
`;

const FactGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-top: 34px;
  border-top: 1px solid rgba(182, 215, 227, 0.16);
  border-bottom: 1px solid rgba(182, 215, 227, 0.16);
  @media (max-width: 820px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;

const FactItem = styled.div`
  min-width: 0;
  min-height: 140px;
  padding: 22px 20px;
  display: grid;
  align-content: start;
  gap: 5px;
  border-right: 1px solid rgba(182, 215, 227, 0.16);
  &:last-child { border-right: 0; }
  strong { color: #f2fbff; font-size: clamp(1.8rem, 3vw, 2.45rem); font-weight: 900; letter-spacing: -0.05em; line-height: 1; font-variant-numeric: tabular-nums; }
  span { color: #a7e5ef; font-size: 0.76rem; font-weight: 900; }
  small { color: rgba(210, 228, 236, 0.58); font-size: 0.73rem; font-weight: 700; line-height: 1.45; word-break: keep-all; }
  @media (max-width: 820px) { &:nth-child(2) { border-right: 0; } &:nth-child(n + 3) { border-top: 1px solid rgba(182, 215, 227, 0.16); } }
  @media (max-width: 500px) { min-height: 122px; padding: 18px 14px; }
`;

const MapHeading = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(230px, 0.42fr);
  align-items: end;
  gap: 28px;
  margin-top: clamp(62px, 8vw, 100px);
  h3 { margin: 12px 0 0; color: #f1f9fc; font-size: clamp(1.55rem, 2.8vw, 2.4rem); font-weight: 900; letter-spacing: -0.03em; line-height: 1.24; word-break: keep-all; }
  p { margin: 0; color: rgba(210, 229, 237, 0.65); font-size: 0.88rem; font-weight: 700; line-height: 1.65; word-break: keep-all; }
  @media (max-width: 780px) { grid-template-columns: 1fr; gap: 13px; }
`;

const NavigationMap = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 28px;
  @media (max-width: 740px) { grid-template-columns: 1fr; }
`;

const ModuleGroup = styled.section<{ $active: boolean; $accent: string }>`
  min-width: 0;
  padding: 20px;
  border: 1px solid ${(props) => (props.$active ? `color-mix(in srgb, ${props.$accent} 52%, transparent)` : 'rgba(182, 215, 227, 0.14)')};
  background-color: ${(props) => (props.$active ? `color-mix(in srgb, ${props.$accent} 8%, rgba(9, 17, 28, 0.72))` : 'rgba(8, 15, 25, 0.6)')};
  box-shadow: ${(props) => (props.$active ? `inset 3px 0 0 ${props.$accent}` : 'none')};
  transition: border-color 180ms ease, background-color 180ms ease, box-shadow 180ms ease;
  @media (max-width: 500px) { padding: 16px; }
`;

const ModuleTitle = styled.div`
  display: grid;
  grid-template-columns: 28px 38px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  > span { color: rgba(199, 224, 234, 0.42); font-size: 0.7rem; font-weight: 900; font-variant-numeric: tabular-nums; }
  i { width: 38px; height: 38px; display: grid; place-items: center; border: 1px solid rgba(171, 220, 232, 0.2); border-radius: 8px; color: #b7edf5; background-color: rgba(132, 214, 232, 0.08); }
  div { min-width: 0; display: grid; gap: 3px; }
  small { overflow: hidden; color: rgba(194, 219, 229, 0.5); font-size: 0.6rem; font-weight: 900; letter-spacing: 0.1em; text-overflow: ellipsis; white-space: nowrap; }
  strong { color: #f0f9fc; font-size: 1rem; font-weight: 900; }
`;

const MenuList = styled.div`
  display: grid;
  gap: 4px;
  margin-top: 15px;
`;

const MenuButton = styled.button<{ $active: boolean }>`
  width: 100%;
  min-width: 0;
  min-height: 42px;
  padding: 0 10px;
  display: grid;
  grid-template-columns: 23px minmax(0, 1fr) 16px;
  align-items: center;
  gap: 7px;
  border: 1px solid ${(props) => (props.$active ? 'rgba(173, 231, 241, 0.38)' : 'transparent')};
  border-radius: 7px;
  color: ${(props) => (props.$active ? '#f4fbfd' : 'rgba(220, 237, 243, 0.7)')};
  background-color: ${(props) => (props.$active ? 'rgba(161, 226, 239, 0.12)' : 'transparent')};
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease;

  > span { color: ${(props) => (props.$active ? '#a5e9f4' : 'rgba(192, 218, 228, 0.4)')}; font-size: 0.64rem; font-weight: 900; font-variant-numeric: tabular-nums; }
  b { overflow: hidden; font-size: 0.78rem; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
  svg { justify-self: end; opacity: ${(props) => (props.$active ? 1 : 0.44)}; }
  &:hover { border-color: rgba(173, 231, 241, 0.25); background-color: rgba(161, 226, 239, 0.07); color: #f4fbfd; }
  &:focus-visible { outline: 2px solid #a3e5f2; outline-offset: 2px; }
`;

const ScreenPreview = styled.article<{ $accent: string }>`
  overflow: hidden;
  margin-top: 20px;
  border: 1px solid color-mix(in srgb, ${(props) => props.$accent} 38%, transparent);
  background-color: rgba(8, 16, 27, 0.84);
  box-shadow: inset 0 3px 0 ${(props) => props.$accent}, 0 22px 50px rgba(0, 0, 0, 0.18);
`;

const PreviewTop = styled.header`
  min-height: 55px;
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  border-bottom: 1px solid rgba(183, 215, 227, 0.14);
  @media (max-width: 560px) { min-height: auto; padding: 13px 15px; align-items: flex-start; flex-direction: column; }
`;

const PreviewRoute = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgba(203, 226, 235, 0.54);
  font-size: 0.72rem;
  font-weight: 800;
  overflow: hidden;
  > span, strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  strong { color: #e7f7fb; }
`;

const PreviewStatus = styled.span`
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #a8eeb7;
  font-size: 0.62rem;
  font-weight: 900;
  letter-spacing: 0.08em;
`;

const PreviewBody = styled.div`
  display: grid;
  grid-template-columns: minmax(270px, 0.72fr) minmax(0, 1.28fr);
  min-height: 400px;
  @media (max-width: 880px) { grid-template-columns: 1fr; }
`;

const PreviewCopy = styled.div`
  position: relative;
  padding: 32px;
  border-right: 1px solid rgba(183, 215, 227, 0.14);
  display: grid;
  align-content: start;
  gap: 12px;
  h3 { margin: 0; color: #f0fbfe; font-size: clamp(1.55rem, 3vw, 2.1rem); font-weight: 900; letter-spacing: -0.035em; line-height: 1.18; word-break: keep-all; }
  p { margin: 0; color: rgba(211, 231, 239, 0.68); font-size: 0.86rem; font-weight: 700; line-height: 1.7; word-break: keep-all; }
  @media (max-width: 880px) { border-right: 0; border-bottom: 1px solid rgba(183, 215, 227, 0.14); }
  @media (max-width: 500px) { padding: 22px 16px; }
`;

const PreviewIcon = styled.i`
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(168, 226, 238, 0.34);
  border-radius: 10px;
  color: #a8e8f3;
  background-color: rgba(124, 211, 232, 0.1);
`;

const PreviewAction = styled.div`
  margin-top: 6px;
  padding: 13px 14px;
  border-left: 2px solid #93e0ed;
  background-color: rgba(147, 224, 237, 0.07);
  display: grid;
  gap: 4px;
  span { color: rgba(168, 224, 235, 0.58); font-size: 0.62rem; font-weight: 900; letter-spacing: 0.1em; }
  strong { color: #eaf9fc; font-size: 0.85rem; font-weight: 900; word-break: keep-all; }
`;

const FlowList = styled.ol`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px;
  padding: 0;
  margin: 6px 0 0;
  list-style: none;
  li { min-width: 0; display: grid; gap: 5px; }
  span { color: #9ce3ef; font-size: 0.62rem; font-weight: 900; font-variant-numeric: tabular-nums; }
  b { color: rgba(229, 243, 248, 0.76); font-size: 0.68rem; font-weight: 800; line-height: 1.35; word-break: keep-all; }
`;

const ProductCanvas = styled.div`
  min-width: 0;
  padding: 20px;
  background-color: #091321;
  @media (max-width: 500px) { padding: 14px; }
`;

const CanvasTop = styled.div`
  min-height: 42px;
  padding: 0 11px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(179, 215, 227, 0.14);
  background-color: rgba(255, 255, 255, 0.025);
  span { color: rgba(190, 218, 229, 0.46); font-size: 0.58rem; font-weight: 900; letter-spacing: 0.1em; }
  i { width: 1px; height: 14px; background-color: rgba(179, 215, 227, 0.18); }
  b { min-width: 0; flex: 1; overflow: hidden; color: #eaf7fb; font-size: 0.72rem; font-weight: 900; text-overflow: ellipsis; white-space: nowrap; }
  small { flex: 0 0 auto; min-height: 26px; padding: 0 8px; border: 1px solid rgba(157, 224, 236, 0.34); border-radius: 5px; color: #b9eff6; background-color: rgba(137, 217, 233, 0.1); display: inline-flex; align-items: center; font-size: 0.62rem; font-weight: 900; }
`;

const CanvasContent = styled.div`
  min-height: 294px;
  padding-top: 13px;
  @media (max-width: 500px) { min-height: 270px; }
`;

const DashboardPreview = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
  > div { min-width: 0; min-height: 96px; padding: 14px; border: 1px solid rgba(179, 215, 227, 0.14); background-color: rgba(255, 255, 255, 0.022); display: grid; align-content: start; gap: 4px; }
  > div span { color: rgba(194, 219, 229, 0.58); font-size: 0.63rem; font-weight: 800; }
  > div strong { color: #eaf9fc; font-size: 1.5rem; font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums; }
  > div small { color: rgba(198, 223, 233, 0.48); font-size: 0.61rem; font-weight: 700; line-height: 1.35; word-break: keep-all; }
  section { grid-column: 1 / -1; min-height: 116px; padding: 14px; border: 1px solid rgba(179, 215, 227, 0.14); display: flex; align-items: end; gap: 8px; background-color: rgba(255, 255, 255, 0.018); }
  section i { flex: 1; min-width: 0; height: var(--bar-height); border-radius: 3px 3px 0 0; background-color: rgba(129, 215, 232, 0.44); }
  section i:nth-child(1) { --bar-height: 35%; } section i:nth-child(2) { --bar-height: 62%; } section i:nth-child(3) { --bar-height: 48%; } section i:nth-child(4) { --bar-height: 76%; } section i:nth-child(5) { --bar-height: 57%; } section i:nth-child(6) { --bar-height: 88%; background-color: rgba(155, 226, 162, 0.68); }
  footer { grid-column: 1 / -1; display: flex; align-items: center; justify-content: center; gap: 8px; color: rgba(191, 220, 230, 0.45); font-size: 0.58rem; font-weight: 900; letter-spacing: 0.08em; }
  footer b { width: 16px; height: 1px; background-color: rgba(179, 215, 227, 0.25); }
`;

const FormPreview = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  > div { min-width: 0; min-height: 68px; padding: 10px; border: 1px solid rgba(179, 215, 227, 0.14); background-color: rgba(255, 255, 255, 0.018); display: grid; align-content: center; gap: 4px; }
  > div span { color: #9de0ec; font-size: 0.58rem; font-weight: 900; }
  > div b { color: rgba(231, 245, 249, 0.78); font-size: 0.68rem; font-weight: 850; word-break: keep-all; }
  > div i { width: 100%; height: 3px; background-color: rgba(144, 222, 236, 0.32); }
  > div:nth-child(2) i { background-color: rgba(144, 222, 236, 0.6); } > div:nth-child(3) i { background-color: rgba(155, 226, 162, 0.7); }
  section { grid-column: 1 / -1; min-height: 80px; padding: 14px; border: 1px solid rgba(179, 215, 227, 0.14); background-color: rgba(255, 255, 255, 0.018); display: grid; align-content: center; gap: 5px; }
  section small { color: rgba(188, 217, 227, 0.52); font-size: 0.62rem; font-weight: 900; } section strong { color: rgba(234, 247, 250, 0.8); font-size: 0.74rem; font-weight: 800; word-break: keep-all; }
`;

const RecordsPreview = styled.div`
  display: grid;
  gap: 7px;
  > div { min-width: 0; min-height: 51px; padding: 0 11px; display: grid; grid-template-columns: 26px minmax(0, 1fr) 36px; align-items: center; gap: 9px; border: 1px solid rgba(179, 215, 227, 0.14); background-color: rgba(255, 255, 255, 0.018); }
  > div i { color: #a1e0ed; font-size: 0.6rem; font-style: normal; font-weight: 900; } > div span { overflow: hidden; color: rgba(230, 244, 248, 0.74); font-size: 0.68rem; font-weight: 780; text-overflow: ellipsis; white-space: nowrap; } > div b { min-height: 20px; display: inline-grid; place-items: center; border: 1px solid rgba(155, 226, 162, 0.24); color: #afe9b8; background-color: rgba(155, 226, 162, 0.07); font-size: 0.56rem; font-weight: 900; }
`;

const SearchBar = styled.div`
  min-height: 42px !important;
  grid-template-columns: minmax(0, 1fr) 40px !important;
  span { color: rgba(190, 218, 229, 0.46) !important; font-size: 0.65rem !important; } b { min-height: 24px !important; border-color: rgba(158, 224, 236, 0.28) !important; color: #a7e5ef !important; background-color: rgba(137, 217, 233, 0.08) !important; }
`;

const WorkflowPreview = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  section { min-width: 0; min-height: 226px; padding: 10px; border: 1px solid rgba(179, 215, 227, 0.14); background-color: rgba(255, 255, 255, 0.018); display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 10px; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 6px; color: rgba(222, 241, 246, 0.74); font-size: 0.65rem; font-weight: 900; word-break: keep-all; }
  header b { width: 18px; height: 18px; display: grid; place-items: center; border-radius: 50%; color: #9ce2ee; background-color: rgba(137, 217, 233, 0.12); font-size: 0.6rem; }
  section > div { min-width: 0; min-height: 78px; padding: 11px; border-left: 2px solid rgba(155, 226, 162, 0.72); color: rgba(216, 235, 241, 0.66); background-color: rgba(155, 226, 162, 0.06); font-size: 0.67rem; font-weight: 750; line-height: 1.5; word-break: keep-all; }
  section:nth-child(2) > div { border-left-color: rgba(155, 213, 238, 0.76); background-color: rgba(137, 217, 233, 0.07); } section:nth-child(3) > div { border-left-color: rgba(173, 185, 255, 0.78); background-color: rgba(173, 185, 255, 0.07); }
  @media (max-width: 480px) { section { min-height: 188px; padding: 8px; } }
`;

const ScopeFooter = styled.footer`
  min-height: 82px;
  margin-top: 14px;
  padding: 17px 20px;
  border-top: 1px solid rgba(178, 215, 228, 0.16);
  border-bottom: 1px solid rgba(178, 215, 228, 0.16);
  display: flex;
  align-items: center;
  gap: 12px;
  color: #9be2ee;
  div { min-width: 0; display: grid; gap: 3px; }
  strong { color: #eaf9fc; font-size: 0.82rem; font-weight: 900; } span { color: rgba(207, 229, 237, 0.6); font-size: 0.75rem; font-weight: 700; line-height: 1.5; word-break: keep-all; }
`;
