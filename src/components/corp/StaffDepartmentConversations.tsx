'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';
import { ArrowRight, CheckCheck, MessageCircle, Pause, Play, SkipForward } from 'lucide-react';
import styled, { keyframes } from 'styled-components';

// Each pair follows the order of the department's ten existing staff cards.
const DIALOGUES: Record<string, [string, string][]> = {
  development: [
    ['웹에서 쓰던 흐름, 앱에서도 자연스러울까요?', '네! 작은 화면에 맞춰 버튼 위치도 맞출게요.'],
    ['응답 형식 정리했어요. 화면에 연결해 볼래요?', '좋아요. 빈 결과와 오류 안내도 같이 챙길게요.'],
    ['공통 모듈 바뀌었어요. API 쪽 영향 없을까요?', '호환성부터 확인하고 예제로 정리해 둘게요.'],
    ['수정한 화면 검증 끝! 배포 검토 준비할까요?', '변경 목록과 되돌리는 절차까지 묶을게요.'],
    ['데이터 흐름 정리했어요. 접근 범위 봐 주세요.', '필요한 권한만 쓰는지 함께 확인할게요.'],
  ],
  automation: [
    ['매번 복사하던 보고서, 자동으로 묶어볼까요?', '좋아요! 사람이 확인할 부분부터 나눠봐요.'],
    ['반복 입력 순서 정리했어요. 예외는 어떻게 하죠?', '판단이 필요한 항목은 검토함으로 보낼게요.'],
    ['새 데이터가 들어왔어요. 빠진 값 좀 봐줄래요?', '형식부터 확인하고 누락 목록 돌려드릴게요.'],
    ['실행 준비는 끝났어요. 운영 순서 확인할까요?', '체크리스트 맞추고 최종 확인을 요청해요.'],
    ['캠페인 질문이 늘었네요. 답변을 모아볼까요?', '자주 묻는 질문부터 초안으로 묶어볼게요.'],
  ],
  media: [
    ['첫 장면은 작업 전후를 비교하면 어때요?', '좋아요. 같은 구도로 두 장면 잡아볼게요.'],
    ['편집 리듬 맞췄어요. 전환 효과 부탁해요.', '핵심 장면에만 가볍게 움직임 넣을게요.'],
    ['목소리가 작게 들리네요. 송출 전에 맞출까요?', '네, 음량을 확인하고 리허설부터 해봐요.'],
    ['세로 영상 초안이에요. 채널 문구 맞춰줄래요?', '제목이 잘리지 않도록 미리보기 확인할게요.'],
    ['촬영 자료 정리했어요. 빠진 컷이 있나요?', '목록 대조할게요. 엔딩 컷도 꼭 챙겨요!'],
  ],
  creator: [
    ['이 이야기, 첫 문장을 어떻게 열까요?', '“혼자서도 함께처럼”으로 시작해 보면요?'],
    ['표지 색감 잡았어요. 그림 톤도 맞춰줄래요?', '따뜻한 색을 조금 더해 같은 느낌으로 갈게요.'],
    ['캐릭터가 손 흔드는 포즈, 자연스러울까요?', '팔 각도를 낮추면 더 친근해 보여요!'],
    ['브랜드 이야기를 짧은 게시물로 나눠볼까요?', '좋아요. 장면마다 한 문장씩 담아볼게요.'],
    ['웹에 넣을 콘텐츠예요. 읽기 편한지 봐주세요.', '휴대폰에서도 확인할게요. 문단은 짧게요!'],
  ],
  marketing: [
    ['이번 주엔 어떤 주제를 먼저 소개할까요?', '고객이 자주 묻는 활용 팁부터 써볼게요.'],
    ['첫 방문 고객에게 어떤 안내가 좋을까요?', '관심 주제별로 도움이 되는 팁을 나눠봐요.'],
    ['브랜드 문구 바꿨어요. 검색 제목은 어때요?', '찾기 쉬운 표현을 넣되 말투는 유지할게요.'],
    ['게시물 반응을 함께 살펴볼까요?', '저장한 글부터 보고 다음 실험을 골라봐요.'],
    ['캠페인 가설 세웠어요. 시장 의견이 궁금해요.', '비슷한 고객의 질문을 모아 전달할게요.'],
  ],
  strategy: [
    ['다음 분기엔 무엇에 집중하면 좋을까요?', '고객이 반복해서 쓰는 기능부터 살펴봐요.'],
    ['이번 주 할 일을 줄여봤어요. 기준에 맞나요?', '핵심 목표에 연결되는 세 가지부터 가요.'],
    ['새 시장 자료예요. 작은 실험으로 이어볼까요?', '고객 한 명의 문제부터 검증해 보면 좋겠어요.'],
    ['프로젝트별 우선순위, 데이터로 비교할까요?', '같은 기간과 기준으로 표를 맞춰볼게요.'],
    ['개선 아이디어 모았어요. 검토 안건에 넣을까요?', '결정할 것과 참고할 것을 나눠 정리할게요.'],
  ],
  'customer-success': [
    ['처음 온 고객에게 안내가 너무 길지 않을까요?', '첫 작업까지 필요한 세 단계만 남겨봐요.'],
    ['사용 중 막힌 부분을 찾았어요. 의견도 있나요?', '같은 질문이 있었어요. 함께 묶어 공유할게요.'],
    ['설명 화면 바뀌었어요. 교육 자료도 맞출까요?', '네, 따라 해보는 예시부터 새로 잡을게요.'],
    ['오래 쓰는 고객에게 어떤 팁이 도움 될까요?', '커뮤니티에서 나온 활용법을 모아볼게요.'],
    ['오늘 접수된 문의예요. 놓친 흐름이 있을까요?', '처음부터 따라 해보고 개선점을 남길게요.'],
  ],
  'finance-management': [
    ['이번 달 계획과 실제 내역, 같이 맞춰볼까요?', '항목별로 비교하고 차이 나는 곳을 표시할게요.'],
    ['일정에 맞춰 준비할 자료를 정리했어요.', '자금 일정과 겹치는 부분도 확인할게요.'],
    ['검토용 설명 자료예요. 근거가 충분할까요?', '출처와 기준일이 빠진 곳부터 확인해요.'],
    ['구매 조건 정리했어요. 계약 초안 봐줄래요?', '납기와 검수 기준도 나란히 비교할게요.'],
    ['매출 흐름에서 확인할 부분이 보여요.', '한 번의 변동인지 추세인지 같이 살펴봐요.'],
  ],
  'people-culture': [
    ['새 동료에게 어떤 안내를 먼저 주면 좋을까요?', '역할과 도움 요청할 곳부터 알려줘요.'],
    ['이번에 배운 팁, 팀에 나누면 좋겠어요.', '짧은 사례로 남겨 다음 협업 때 꺼내봐요.'],
    ['성과를 정리할 때 협업 과정도 담을까요?', '좋아요. 기여한 부분이 잘 보이게 맞춰봐요.'],
    ['반복 업무가 몰리네요. 나눠볼 수 있을까요?', '봇에게 맡길 일과 사람이 볼 일을 나눠봐요.'],
    ['업무 흐름을 보니 집중 시간이 필요해 보여요.', '회의는 모으고 작업 시간은 비워둘게요.'],
  ],
  'business-expansion': [
    ['새 고객은 어떤 문제를 가장 먼저 풀고 싶대요?', '운영 시간을 줄이고 싶대요. 사례를 찾아봐요.'],
    ['작은 시범 도입안이에요. 파트너와 맞을까요?', '역할과 기대 결과부터 같이 맞춰볼게요.'],
    ['해외 소개 자료, 현지 표현이 자연스러울까요?', '파트너가 이해하기 쉬운 예시로 바꿔봐요.'],
    ['제안 범위가 정리됐어요. 빠진 항목 있나요?', '일정과 기대 효과를 한 장으로 묶을게요.'],
    ['유입 채널별 문의를 나눠봤어요.', '다음 대화가 필요한 기회부터 정리할게요.'],
  ],
};

type Session = { ids: string[]; phase: number; rounds: Record<string, number>; cursor: number };
type ConversationState = {
  session: Session; paused: boolean; reduced: boolean; running: boolean;
  register: (id: string, visible: boolean) => void; next: () => void; nextDepartment: (id: string) => void; toggle: () => void;
};
const ConversationContext = createContext<ConversationState | null>(null);
const DURATIONS = [3600, 4600, 1400, 4600, 2400];

function advanceSession(current: Session, visible: string[]): Session {
  if (!visible.length) return current;
  if (current.ids.some(id => visible.includes(id)) && current.phase > 0) {
    return { ...current, phase: (current.phase + 1) % DURATIONS.length };
  }
  const ids = Array.from({ length: Math.min(2, visible.length) }, (_, offset) => visible[(current.cursor + offset) % visible.length]);
  const rounds = { ...current.rounds };
  ids.forEach(id => { rounds[id] = ((rounds[id] ?? -1) + 1) % DIALOGUES[id].length; });
  return { ids, phase: 1, rounds, cursor: current.cursor + ids.length };
}

export function StaffConversationProvider({ children }: { children: ReactNode }) {
  const reduced = Boolean(useReducedMotion());
  const [paused, setPaused] = useState(false);
  const [foreground, setForeground] = useState(true);
  const [visible, setVisible] = useState<string[]>([]);
  const [session, setSession] = useState<Session>({ ids: [], phase: 0, rounds: {}, cursor: 0 });
  const register = useCallback((id: string, isVisible: boolean) => {
    setVisible(current => {
      if (current.includes(id) === isVisible) return current;
      const updated = isVisible ? [...current, id] : current.filter(value => value !== id);
      return Object.keys(DIALOGUES).filter(value => updated.includes(value));
    });
  }, []);
  const next = useCallback(() => setSession(current => advanceSession(current, visible.length ? visible : Object.keys(DIALOGUES).slice(0, 2))), [visible]);
  const nextDepartment = useCallback((id: string) => {
    setSession(current => current.ids.includes(id) && current.phase > 0
      ? advanceSession(current, [id])
      : { ...current, ids: [id], phase: 1, rounds: { ...current.rounds, [id]: ((current.rounds[id] ?? -1) + 1) % DIALOGUES[id].length } });
  }, []);
  const running = !paused && !reduced && foreground && visible.length > 0;

  useEffect(() => {
    const update = () => setForeground(!document.hidden);
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(next, session.ids.some(id => visible.includes(id)) ? DURATIONS[session.phase] : 1000);
    return () => window.clearTimeout(timer);
  }, [next, running, session, visible]);

  return <ConversationContext.Provider value={{ session, paused, reduced, running, register, next, nextDepartment, toggle: () => setPaused(value => !value) }}>{children}</ConversationContext.Provider>;
}

function useConversations() {
  const context = useContext(ConversationContext);
  if (!context) throw new Error('StaffConversationProvider is required');
  return context;
}

export function StaffConversationControls() {
  const { paused, reduced, toggle, next } = useConversations();
  return <ControlBar>
    <div><MessageCircle size={16} aria-hidden="true" /><span><strong>부서 안의 작은 대화</strong><small>직원들이 질문과 아이디어를 나누는 협업 시뮬레이션</small></span></div>
    <div>
      <button type="button" onClick={toggle} disabled={reduced} aria-label={paused ? '직원 대화 재생' : '직원 대화 일시정지'}>{paused || reduced ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}{reduced ? '동작 줄임' : paused ? '재생' : '일시정지'}</button>
      <button type="button" onClick={next} aria-label="직원 다음 대화"><SkipForward size={14} aria-hidden="true" />다음 대화</button>
    </div>
  </ControlBar>;
}

export function DepartmentConversation({ id, label, accent, teams, portrait, children }: {
  id: string; label: string; accent: string; teams: { name: string; lead: string }[];
  portrait: (index: number) => ReactNode;
  children: (speaker: number | null, listener: number | null) => ReactNode;
}) {
  const { session, running, paused, reduced, register, nextDepartment, toggle } = useConversations();
  const tray = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
      register(id, entry.isIntersecting);
    }, { threshold: 0.25 });
    if (tray.current) observer.observe(tray.current);
    return () => { observer.disconnect(); register(id, false); };
  }, [id, register]);
  const round = session.rounds[id] ?? 0;
  const pair = [round * 2, round * 2 + 1];
  const active = visible && session.ids.includes(id) && session.phase > 0;
  const phase = active ? session.phase : 0;
  const speaker = phase === 1 ? pair[0] : phase === 3 ? pair[1] : null;
  const listener = phase === 1 ? pair[1] : phase === 3 ? pair[0] : null;
  const lines = DIALOGUES[id][round];
  return <Roster $accent={accent} data-department-conversation={id} data-phase={phase} data-round={round} data-running={running && visible}>
    <ConversationTray ref={tray} aria-label={`${label} 직원 대화`}>
      <TrayHeading><span><i />{phase === 0 ? '각자의 일을 하다가, 잠깐 함께' : phase === 2 ? '동료의 답변을 기다리는 중' : phase === 4 ? '다시 각자의 작업으로' : '지금, 동료와 이야기 중'}</span><div>
        <button type="button" onClick={toggle} disabled={reduced} aria-label={`${label} 직원 대화 ${paused ? '재생' : '일시정지'}`}>{paused || reduced ? <Play size={12} aria-hidden="true" /> : <Pause size={12} aria-hidden="true" />}</button>
        <button type="button" onClick={() => nextDepartment(id)} aria-label={`${label} 직원 다음 대화`}><SkipForward size={12} aria-hidden="true" /></button>
      </div></TrayHeading>
      <Exchange aria-live={paused || reduced ? 'polite' : 'off'}>
        <Speech key={`${round}-question`} data-current={phase === 1} data-idle={phase === 0}>
          <div className="staff-avatar">{portrait(pair[0])}</div><div className="staff-bubble"><small>{teams[pair[0]].name}</small><p>{phase ? lines[0] : '잠깐, 같이 생각해 볼까요?'}</p></div>
        </Speech>
        <Thread aria-hidden="true" data-active={phase === 1 || phase === 3} data-reply={phase === 3}><span /><ArrowRight size={11} /></Thread>
        <Speech key={`${round}-answer`} data-current={phase === 3} data-idle={phase < 3}>
          <div className="staff-avatar">{portrait(pair[1])}</div><div className="staff-bubble"><small>{teams[pair[1]].name}</small>{phase === 2 ? <Typing aria-label="답변 준비 중"><i /><i /><i /></Typing> : <p>{phase >= 3 ? lines[1] : '좋아요, 필요한 순간 불러줘요.'}</p>}</div>
        </Speech>
      </Exchange>
      <TrayFooter>{phase === 4 ? <><CheckCheck size={12} aria-hidden="true" />의견 전달 · 협업 이어가기</> : <><MessageCircle size={12} aria-hidden="true" />{phase ? `${teams[pair[0]].lead.replace(' 팀장', '')} ↔ ${teams[pair[1]].lead.replace(' 팀장', '')}` : '틈틈이 나누는 아이디어와 업무 이야기'}</>}</TrayFooter>
    </ConversationTray>
    {children(speaker, listener)}
  </Roster>;
}

const dot = keyframes`50% { opacity: 0.35; transform: translateY(-3px); }`;
const enter = keyframes`from { opacity: 0.5; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); }`;
const transmit = keyframes`from { transform: translateX(-100%); } to { transform: translateX(300%); }`;
const Roster = styled.div<{ $accent: string }>`
  --staff-accent: ${props => props.$accent};
  &[data-running='false'] *, &[data-running='false'] *::after { animation-play-state: paused !important; }
  &[data-running='false'] .staff-bubble { animation: none !important; }
  @media(prefers-reduced-motion: reduce) { *, *::after { animation: none !important; } }
`;
const ControlBar = styled.div`
  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px; margin: 16px 0 22px; padding: 14px 16px; border: 1px solid #2e4964; border-radius: 12px; color: #91ded6; background: #091c30;
  > div { display: flex; align-items: center; gap: 8px; } strong { font-size: 0.78rem; } small { display: block; margin-top: 5px; color: #a6bcd3; font-size: 0.67rem; line-height: 1.5; }
  button { display: inline-flex; gap: 6px; align-items: center; min-height: 38px; padding: 8px 11px; border: 1px solid #34516f; border-radius: 8px; color: #d7e9fa; background: #10263b; font: inherit; font-size: 0.7rem; cursor: pointer; }
  button:hover { border-color: #91ded6; } button:disabled { cursor: default; color: #9fb6cf; }
  button:focus-visible { outline: 3px solid #91ded6; outline-offset: 3px; }
`;
const ConversationTray = styled.div`
  min-width: 0; padding: 10px 10px 8px; background: #071b30; border-bottom: 1px solid #29415d;
`;
const TrayHeading = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: 4px; min-height: 32px; margin-bottom: 8px;
  > span { display: flex; align-items: center; gap: 5px; color: #a5bcd5; font-size: 0.55rem; line-height: 1.5; }
  > div { display: flex; gap: 3px; }
  i { width: 4px; height: 4px; flex-shrink: 0; border-radius: 50%; background: var(--staff-accent); }
  button { flex-shrink: 0; display: grid; place-items: center; width: 32px; height: 32px; border: 1px solid #34516f; border-radius: 8px; color: #b4d4ef; background: transparent; cursor: pointer; }
  button:hover { background: #19324d; } button:focus-visible { outline: 2px solid #91ded6; outline-offset: 2px; }
  button:disabled { cursor: default; opacity: 0.6; }
`;
const Exchange = styled.div`display: grid; gap: 0;`;
const Speech = styled.div`
  display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 8px; align-items: start; min-width: 0;
  .staff-avatar { margin-top: 7px; border-radius: 50%; }
  .staff-bubble { position: relative; padding: 9px 10px; min-height: 104px; border: 1px solid #33506f; border-radius: 2px 12px 12px; background: #102940; }
  small { display: block; color: var(--staff-accent); font-size: 0.56rem; line-height: 1.5; }
  p { margin: 6px 0 0; color: #d2e5f7; font-size: 0.66rem; line-height: 1.65; word-break: keep-all; overflow-wrap: anywhere; }
  &[data-current='true'] .staff-avatar { outline: 2px solid var(--staff-accent); outline-offset: 2px; }
  &[data-current='true'] .staff-bubble { border-color: var(--staff-accent); animation: ${enter} 0.35s ease-out; }
  &[data-idle='true'] .staff-bubble { background: #0a2036; border-color: #263e58; p { color: #9bb3cc; } }
  @container(max-width: 230px) { grid-template-columns: 28px minmax(0, 1fr); gap: 6px; .staff-avatar { transform: scale(0.78); transform-origin: top left; } .staff-bubble { padding: 8px; min-height: 130px; } }
`;
const Thread = styled.div`
  display: flex; align-items: center; gap: 4px; height: 18px; margin-left: 17px; margin-right: 12px; color: #3f6486;
  > span { position: relative; width: 100%; height: 1px; background: #2b4968; overflow: hidden; }
  &[data-active='true'] { color: var(--staff-accent); > span::after { content: ''; position: absolute; width: 35%; inset-block: 0; left: 0; background: var(--staff-accent); animation: ${transmit} 1.8s linear infinite; } }
  &[data-reply='true'] { transform: scaleX(-1); }
`;
const Typing = styled.div`
  display: flex; align-items: center; gap: 5px; min-height: 32px;
  i { width: 4px; height: 4px; border-radius: 50%; background: var(--staff-accent); animation: ${dot} 0.9s ease-in-out infinite; }
  i:nth-child(2) { animation-delay: 0.15s; } i:nth-child(3) { animation-delay: 0.3s; }
`;
const TrayFooter = styled.div`
  display: flex; align-items: center; gap: 5px; min-height: 30px; color: #a0bad5; font-size: 0.53rem; line-height: 1.5;
`;
