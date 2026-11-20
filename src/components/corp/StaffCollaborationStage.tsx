'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStaffReducedMotion } from './useStaffReducedMotion';
import { ArrowRight, Check, CheckCheck, Pause, Play, SkipForward } from 'lucide-react';
import styled, { keyframes } from 'styled-components';

type Actor = { id: string; name: string; role: string; photoIndex: number; accent: string };
type Scene = { title: string; output: string; departments: string[]; lines: [number, number, string, string][] };
// Participant indices are CEO, coordinator, then the four departments in each scene.
export const SCENES: Scene[] = [
  { title: '새로운 서비스 출시', output: '출시 검토안', departments: ['strategy', 'development', 'creator', 'marketing'], lines: [
    [0, 1, '이번엔 혼자 쓰기에도 편한 서비스를 만들어 보자.', '방향 설정'],
    [1, 2, 'COMPASS, 고객의 불편부터 정리해 줄래요?', '업무 배분'],
    [2, 3, '가입 과정이 길어요. 첫 화면부터 간단하게 가죠.', '문제 정의'],
    [3, 4, '좋아요! 입력은 줄였어요. 안내 문구 부탁해요.', '함께 제작'],
    [4, 5, '“바로 시작하기” 어때요? 소개 이미지도 보낼게요.', '자료 전달'],
    [5, 1, '좋네요. 이 메시지로 출시 캠페인 초안 묶었어요.', '결과 취합'],
    [1, 0, '개발·콘텐츠·캠페인 준비됐어요. 최종 검토해 주세요!', '대표 검토'],
  ] },
  { title: '콘텐츠 함께 만들기', output: '콘텐츠 제작안', departments: ['creator', 'media', 'marketing', 'automation'], lines: [
    [0, 1, '우리 서비스를 30초 안에 쉽고 재밌게 소개해 보자.', '아이디어'],
    [1, 2, 'MUSE, 첫 장면을 어떻게 열면 좋을까요?', '기획 요청'],
    [2, 3, '반복 업무가 사라지는 하루! 이 콘티로 찍어볼까요?', '콘티 공유'],
    [3, 4, '짧은 컷으로 편집했어요. 첫 문장이 잘 읽히나요?', '상호 검토'],
    [4, 5, '첫 문장은 더 짧게! 채널별 문구도 같이 보낼게요.', '피드백 반영'],
    [5, 1, '영상과 문구를 채널별 검토 목록으로 정리했어요.', '전달 준비'],
    [1, 0, '영상 초안과 게시안 모았어요. 대표님 의견은요?', '대표 검토'],
  ] },
  { title: '고객의 불편 해결', output: '고객 경험 개선안', departments: ['customer-success', 'development', 'automation', 'people-culture'], lines: [
    [0, 1, '같은 질문이 반복되네. 고객 입장에서 같이 살펴보자.', '문제 발견'],
    [1, 2, 'CARE, 고객이 가장 헷갈리는 부분을 알려 주세요.', '고객 이해'],
    [2, 3, '저장 완료를 놓치세요. 확인 메시지를 넣을까요?', '개선 제안'],
    [3, 4, '저장 상태를 더 잘 보이게 바꿨어요. 확인 부탁해요.', '개선 협업'],
    [4, 5, '재시도 흐름도 확인했어요. 팀 안내서도 바꿔주세요.', '품질 확인'],
    [5, 1, '응대 가이드까지 맞췄어요. 다음 질문도 줄겠네요!', '지식 공유'],
    [1, 0, '화면과 안내서를 함께 개선했어요. 확인해 주세요.', '대표 검토'],
  ] },
  { title: '새로운 파트너 제안', output: '파트너 제안 초안', departments: ['business-expansion', 'strategy', 'finance-management', 'creator'], lines: [
    [0, 1, '좋은 파트너를 찾았어. 서로 도움이 될 제안을 만들자.', '기회 발견'],
    [1, 2, 'BRIDGE, 상대 팀에 필요한 것부터 살펴봐 주세요.', '조사 요청'],
    [2, 3, '작은 팀의 운영 자동화가 필요하대요. 방향 어떨까요?', '전략 협의'],
    [3, 4, '작은 시범 프로젝트부터요. 비용도 검토해 주세요.', '범위 조율'],
    [4, 5, '예산 안에서 가능해요. 이 범위로 제안서 부탁해요.', '예산 검토'],
    [5, 1, '기대 효과를 한눈에 담았어요. 초안 전달합니다!', '제안서 작성'],
    [1, 0, '전략과 예산을 반영했어요. 보내기 전 검토해 주세요.', '대표 검토'],
  ] },
  { title: '하루를 마무리하며', output: '내일의 우선순위', departments: ['people-culture', 'finance-management', 'customer-success', 'strategy'], lines: [
    [0, 1, '오늘도 수고했어. 놓친 일 없는지 함께 정리하자.', '하루 회고'],
    [1, 2, 'HARMONY, 오늘 협업에서 배운 점이 있었나요?', '회고 시작'],
    [2, 3, '요청에 마감 시간을 쓰니 좋았어요. 비용 쪽은요?', '경험 공유'],
    [3, 4, '반복 작업 비용을 정리했어요. 고객 반응도 궁금해요.', '현황 공유'],
    [4, 5, '안내가 쉬워졌다는 의견이에요. 다음 개선에 넣어줘요.', '피드백 연결'],
    [5, 1, '내일은 고객 안내부터! 우선순위 세 가지로 줄였어요.', '다음 계획'],
    [1, 0, '내일의 할 일 정리 끝. 마지막 결정은 대표님께!', '대표 검토'],
  ] },
];

export function StaffCollaborationStage({ people, portrait, compact = false }: { people: Actor[]; portrait: (person: Actor) => ReactNode; compact?: boolean }) {
  const reduced = useStaffReducedMotion();
  const [sceneIndex, setSceneIndex] = useState(0);
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [foreground, setForeground] = useState(true);
  const [typing, setTyping] = useState(false);
  const [path, setPath] = useState('');
  const root = useRef<HTMLElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const scene = SCENES[sceneIndex];
  const actors = ['ceo', 'general-manager', ...scene.departments.map(id => `${id}-head`)].map(id => people.find(person => person.id === id)!);
  const [from, to, message, phase] = scene.lines[step];
  const running = !paused && !reduced && visible && foreground;

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.1 });
    if (root.current) observer.observe(root.current);
    const update = () => setForeground(!document.hidden);
    update();
    document.addEventListener('visibilitychange', update);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, [compact]);

  useEffect(() => {
    if (!running) return;
    const typingTimer = window.setTimeout(() => setTyping(true), 4100);
    const nextTimer = window.setTimeout(() => {
      setTyping(false);
      if (step === scene.lines.length - 1) { setSceneIndex(index => (index + 1) % SCENES.length); setStep(0); }
      else setStep(value => value + 1);
    }, 5400);
    return () => { window.clearTimeout(typingTimer); window.clearTimeout(nextTimer); };
  }, [running, sceneIndex, scene.lines.length, step]);

  useEffect(() => {
    const element = board.current;
    if (!element) return;
    const update = () => {
      const source = element.querySelector(`[data-actor-index="${from}"]`);
      const target = element.querySelector(`[data-actor-index="${to}"]`);
      const a = source?.querySelector('[data-portrait]')?.getBoundingClientRect();
      const b = target?.querySelector('[data-portrait]')?.getBoundingClientRect();
      const bounds = element.getBoundingClientRect();
      if (!a || !b) return;
      const x1 = a.x + a.width / 2 - bounds.x;
      const y1 = (source?.getBoundingClientRect().bottom ?? a.bottom) + (compact ? 2 : 5) - bounds.y;
      const x2 = b.x + b.width / 2 - bounds.x;
      const y2 = (target?.getBoundingClientRect().bottom ?? b.bottom) + (compact ? 2 : 5) - bounds.y;
      const bend = Math.max(y1, y2) + (compact ? 8 : 28);
      setPath(`M ${x1} ${y1} C ${x1} ${bend}, ${x2} ${bend}, ${x2} ${y2}`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [from, to, sceneIndex, compact]);

  const advance = () => {
    setTyping(false);
    if (step === scene.lines.length - 1) { setSceneIndex(index => (index + 1) % SCENES.length); setStep(0); }
    else setStep(value => value + 1);
  };

  if (compact) {
    return (
      <CompactStage id="staff-collaboration" ref={root} aria-labelledby="collaboration-title" data-running={running} data-step={step}>
        <CompactHeader>
          <h2 id="collaboration-title">협업 스튜디오</h2>
          <select aria-label="협업 시나리오 선택" value={sceneIndex} onChange={event => { setSceneIndex(Number(event.target.value)); setStep(0); setTyping(false); }}>
            {SCENES.map((item, index) => <option key={item.title} value={index}>{item.title}</option>)}
          </select>
          <CompactControls>
            <button type="button" onClick={() => { setPaused(value => !value); setTyping(false); }} disabled={Boolean(reduced)} aria-label={reduced ? '동작 줄임 설정으로 자동 재생 꺼짐' : paused ? '대화 재생' : '대화 일시정지'} title={reduced ? '동작 줄임' : paused ? '재생' : '일시정지'}>{paused || reduced ? <Play size={13} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />}</button>
            <button type="button" onClick={advance} aria-label="다음 대화" title="다음 대화"><SkipForward size={13} aria-hidden="true" /></button>
          </CompactControls>
        </CompactHeader>
        <CompactConversation aria-label="현재 협업 대화" aria-live={paused || reduced ? 'polite' : 'off'}>
          <div><strong>{String(step + 1).padStart(2, '0')} · {phase}</strong><span>{actors[from].name}<ArrowRight size={11} aria-hidden="true" />{actors[to].name}</span></div>
          <p data-message="" key={`${sceneIndex}-${step}`}>{message}</p>
        </CompactConversation>
        <CompactNetwork ref={board} aria-label="대화하는 대표와 부서 봇 조직도">
          <Wires key={`${sceneIndex}-${step}`} data-collaboration-wire="" aria-hidden="true"><path d={path} stroke="var(--studio-line)" strokeWidth="1" /><path className="signal" d={path} stroke="var(--studio-accent)" strokeWidth="1.5" strokeDasharray="6 8" /></Wires>
          {actors.map((person, index) => <CompactActor key={person.id} data-actor-index={index} data-speaking={index === from} data-listening={index === to} title={`${person.name} · ${index === 0 ? '대표 · 사람 1명' : person.role}${index === from ? ' · 이야기하는 중' : index === to ? ' · 메시지 확인 중' : ''}`}>
            <Avatar data-active={index === from || index === to}>{portrait(person)}</Avatar><span>{person.name}</span>
          </CompactActor>)}
        </CompactNetwork>
        <CompactFooter>
          <CompactSteps aria-label="협업 7단계">
            {scene.lines.map(([, , , label], index) => <li key={`${sceneIndex}-${index}`}><button type="button" aria-current={step === index ? 'step' : undefined} aria-label={`${index + 1}단계 ${label} 대화 보기`} title={`${index + 1}단계 · ${label}`} onClick={() => { setStep(index); setTyping(false); }}>{index + 1}</button></li>)}
          </CompactSteps>
          <small title={`${scene.output} · 업무 방식을 보여주는 시뮬레이션이며 실제 접속·작업 현황이 아닙니다.`}>업무 시뮬레이션 · 실제 현황 아님</small>
        </CompactFooter>
      </CompactStage>
    );
  }

  return (
    <Stage id="staff-collaboration" ref={root} aria-labelledby="collaboration-title" data-running={running} data-step={step}>
      <Header>
        <div><Eyebrow><span /> COLLABORATION IN MOTION</Eyebrow><h2 id="collaboration-title">생각이 팀의 결과가 되는 과정.</h2><p>방향은 내가, 실행은 부서 봇들과 함께. 요청이 협업이 되고, 다시 나의 결정으로 돌아옵니다.</p></div>
        <Controls>
          <button type="button" onClick={() => { setPaused(value => !value); setTyping(false); }} disabled={Boolean(reduced)} aria-label={reduced ? '동작 줄임 설정으로 자동 재생 꺼짐' : paused ? '대화 재생' : '대화 일시정지'}>{paused || reduced ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}{reduced ? '동작 줄임' : paused ? '재생' : '일시정지'}</button>
          <button type="button" onClick={advance} aria-label="다음 대화"><SkipForward size={15} aria-hidden="true" />다음</button>
        </Controls>
      </Header>
      <Topics aria-label="협업 시나리오">
        {SCENES.map((item, index) => <button type="button" key={item.title} aria-pressed={sceneIndex === index} onClick={() => { setSceneIndex(index); setStep(0); setTyping(false); }}><span>{String(index + 1).padStart(2, '0')}</span>{item.title}</button>)}
      </Topics>
      <Workspace>
        <Studio>
          <SceneHeading><span>SCENE {String(sceneIndex + 1).padStart(2, '0')} / 05</span><h3>{scene.title}</h3></SceneHeading>
          <Conversation aria-label="현재 협업 대화" aria-live={paused || reduced ? 'polite' : 'off'}>
            <Phase><span aria-hidden="true">{String(step + 1).padStart(2, '0')}</span><div><small>STEP {step + 1} OF {scene.lines.length}</small><strong>{phase}</strong></div></Phase>
            <Message data-message="" key={`${sceneIndex}-${step}`}><span aria-hidden="true">“</span><p>{message}</p></Message>
            <Exchange><strong>{actors[from].name}</strong><ArrowRight size={17} aria-hidden="true" /><span>{actors[to].name}</span><small>{typing && running ? '다음 이야기 준비 중…' : '생각을 연결하는 중'}</small></Exchange>
          </Conversation>
          <Progress aria-hidden="true"><span key={`${sceneIndex}-${step}-${running}`} /></Progress>
          <NetworkBoard ref={board} aria-label="대화하는 대표와 부서 봇 조직도">
            <Wires key={`${sceneIndex}-${step}`} data-collaboration-wire="" aria-hidden="true"><path d={path} stroke="var(--studio-line)" strokeWidth="1" /><path className="signal" d={path} stroke="var(--studio-accent)" strokeWidth="1.5" strokeDasharray="6 8" /></Wires>
            {actors.map((person, index) => {
              const speaking = index === from;
              const listening = index === to;
              const participated = scene.lines.slice(0, step).some(line => line[0] === index);
              return <ActorNode key={person.id} data-actor-index={index} data-speaking={speaking} data-listening={listening}>
                <Avatar data-active={speaking || listening}>{portrait(person)}<span data-actor-kind="" aria-hidden="true">{index === 0 ? 'H' : 'AI'}</span></Avatar>
                <Identity><strong>{person.name}</strong><span>{index === 0 ? '대표 · 사람 1명' : person.role}</span><em>{speaking ? '이야기하는 중' : listening ? '메시지 확인 중' : participated ? '업무 이어가는 중' : '협업 대기'}</em></Identity>
              </ActorNode>;
            })}
          </NetworkBoard>
        </Studio>
        <Workflow aria-label="협업 7단계">
          <Eyebrow>THE WORKFLOW</Eyebrow>
          <Steps>
            {scene.lines.map(([, , , label], index) => <li key={`${sceneIndex}-${index}`}><button type="button" aria-current={step === index ? 'step' : undefined} aria-label={`${index + 1}단계 ${label} 대화 보기`} data-done={index < step} onClick={() => { setStep(index); setTyping(false); }}><span>{index < step ? <Check size={13} aria-hidden="true" /> : String(index + 1).padStart(2, '0')}</span><strong>{label}</strong>{index === step ? <ArrowRight size={15} aria-hidden="true" /> : null}</button></li>)}
          </Steps>
          <Receipt><CheckCheck size={19} aria-hidden="true" /><div><small>함께 만드는 결과</small><strong>{scene.output}</strong><span>{step === 6 ? '대표의 최종 검토로 이어집니다' : '부서의 의견을 하나씩 모으는 중'}</span></div></Receipt>
        </Workflow>
      </Workspace>
      <Footnote><span><i />{reduced ? '수동으로 대화 살펴보기' : paused ? '대화 일시정지' : running ? '협업 스토리 재생 중' : '협업 스토리 대기 중'}</span>업무 방식을 보여주는 시뮬레이션입니다. 실제 접속·작업 현황이 아닙니다.</Footnote>
    </Stage>
  );
}

const travel = keyframes`to { stroke-dashoffset: -56; }`;
const arrive = keyframes`from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); }`;
const progress = keyframes`from { transform: scaleX(0); } to { transform: scaleX(1); }`;
const Stage = styled.section`
  --studio-bg: #101719; --studio-ink: #f3f1e8; --studio-muted: #a5afaa; --studio-accent: #c0ef83; --studio-line: #ffffff1a;
  min-width: 0; scroll-margin-top: 96px; border: 1px solid var(--studio-line); border-radius: 24px; background: var(--studio-bg); color: var(--studio-ink); overflow: hidden;
  button { cursor: pointer; font: inherit; touch-action: manipulation; }
  button:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: -4px; }
  &[data-running='false'] *, &[data-running='false'] *::after { animation-play-state: paused !important; }
  &[data-running='false'] [data-message] { animation: none; }
  @media (prefers-reduced-motion: reduce) { *, *::after { animation: none !important; transition: none !important; } }
`;
const CompactStage = styled(Stage)`
  display: grid; gap: 6px; padding: 8px 12px; border-radius: 14px;
  select { font: inherit; color: var(--studio-ink); color-scheme: dark; }
  select:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 2px; }
  @media(max-width:760px), (pointer:coarse) { gap: 10px; padding: 12px; }
`;
const CompactHeader = styled.header`
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; min-width: 0;
  h2 { margin: 0; color: var(--studio-ink); font-size: 13px; font-weight: 650; white-space: nowrap; }
  select { justify-self: end; width: 100%; max-width: 180px; min-width: 0; min-height: 28px; padding: 3px 6px; border: 1px solid var(--studio-line); border-radius: 5px; background: #1a2222; font-size: 11px; }
  @media(max-width:760px), (pointer:coarse) {
    grid-template-columns: minmax(0, 1fr) auto;
    h2 { grid-column: 1 / -1; }
    select { justify-self: start; max-width: none; min-height: 44px; font-size: 12px; }
  }
`;
const CompactControls = styled.div`
  display: flex; gap: 4px;
  button { display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 1px solid var(--studio-line); border-radius: 5px; background: transparent; color: var(--studio-ink); }
  button:hover { background: #ffffff10; border-color: #ffffff50; }
  button:disabled { cursor: default; opacity: 0.5; }
  @media(max-width:760px), (pointer:coarse) { button { width: 44px; height: 44px; } }
`;
const CompactConversation = styled.div`
  min-width: 0;
  > div { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 14px; font-size: 10px; }
  strong { flex-shrink: 0; color: var(--studio-accent); font-weight: 600; font-variant-numeric: tabular-nums; }
  span { display: flex; min-width: 0; align-items: center; justify-content: flex-end; gap: 5px; color: var(--studio-muted); overflow-wrap: anywhere; }
  svg { flex-shrink: 0; }
  p { min-height: 39px; margin: 3px 0 0; color: var(--studio-ink); font-size: 14px; line-height: 1.4; word-break: keep-all; overflow-wrap: anywhere; animation: ${arrive} 320ms ease-out both; }
`;
const CompactNetwork = styled.div`
  position: relative; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 7px; padding: 2px 1px 9px;
`;
const CompactActor = styled.div`
  position: relative; z-index: 1; display: flex; min-width: 0; flex-direction: column; align-items: center; gap: 4px;
  > div { border-radius: 10px; }
  [data-portrait] { width: 38px; height: 38px; border-radius: 9px; }
  > span { max-width: 100%; color: var(--studio-muted); font-size: 9px; line-height: 1.2; text-align: center; overflow-wrap: anywhere; }
  &[data-speaking='true'] > span, &[data-listening='true'] > span { color: var(--studio-accent); }
`;
const CompactFooter = styled.footer`
  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px 10px;
  > small { color: var(--studio-muted); font-size: 9px; line-height: 1.4; }
  @media(max-width:760px), (pointer:coarse) { > small { flex-basis: 100%; margin-top: 2px; } }
`;
const CompactSteps = styled.ol`
  display: flex; flex-wrap: wrap; gap: 3px; margin: 0; padding: 0; list-style: none;
  button { display: grid; place-items: center; width: 28px; height: 26px; padding: 0; border: 1px solid transparent; border-radius: 4px; background: #ffffff05; color: var(--studio-muted); font-size: 10px; font-variant-numeric: tabular-nums; }
  button[aria-current='step'] { border-color: #c0ef834d; background: #c0ef8314; color: var(--studio-accent); }
  button:hover { color: var(--studio-ink); background: #ffffff10; }
  @media(max-width:760px), (pointer:coarse) { width: 100%; gap: 2px; li { flex: 1; min-width: 44px; } button { width: 100%; min-width: 44px; height: 44px; font-size: 11px; } }
`;
const Header = styled.header`
  padding: 36px 32px 28px; display: flex; gap: 24px; align-items: center; justify-content: space-between;
  h2 { margin: 14px 0 10px; font-size: 1.75rem; font-weight: 650; line-height: 1.45; color: var(--studio-ink); word-break: keep-all; text-wrap: balance; }
  p { margin: 0; max-width: 620px; color: var(--studio-muted); font-size: 0.83rem; line-height: 1.8; word-break: keep-all; }
  @media(max-width: 760px) { padding: 28px 20px 20px; flex-direction: column; align-items: flex-start; gap: 18px; h2 { font-size: 1.45rem; } }
`;
const Eyebrow = styled.div`
  display: flex; align-items: center; gap: 9px; color: var(--studio-accent); font-size: 0.64rem; font-weight: 700; letter-spacing: 0.12em;
  > span { width: 6px; height: 6px; background: currentColor; border-radius: 50%; }
`;
const Controls = styled.div`
  display: flex; flex-shrink: 0; gap: 8px;
  button { display: flex; align-items: center; justify-content: center; gap: 7px; min-width: 78px; min-height: 44px; padding: 0 14px; border: 1px solid #ffffff2e; border-radius: 999px; background: transparent; color: var(--studio-ink); font-size: 0.74rem; transition: background 160ms, border-color 160ms; }
  button:hover { background: #ffffff0c; border-color: #ffffff60; } button:disabled { cursor: default; color: var(--studio-muted); }
`;
const Topics = styled.div`
  padding: 0 32px 26px; display: flex; gap: 7px; flex-wrap: wrap;
  button { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 10px 13px; border: 1px solid var(--studio-line); border-radius: 7px; color: var(--studio-muted); background: transparent; font-size: 0.72rem; transition: background 160ms, color 160ms; }
  button > span { opacity: 0.6; font-size: 0.6rem; font-variant-numeric: tabular-nums; }
  button[aria-pressed='true'] { color: #17221b; background: var(--studio-accent); border-color: var(--studio-accent); }
  button:hover:not([aria-pressed='true']) { color: var(--studio-ink); background: #ffffff08; }
  @media(max-width:760px) { padding: 0 20px 20px; gap: 6px; button { padding: 9px 10px; font-size: 0.7rem; } }
`;
const Workspace = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr) 240px; border-top: 1px solid var(--studio-line);
  @media(max-width:1000px) { grid-template-columns: minmax(0, 1fr); }
`;
const Studio = styled.div`min-width: 0;`;
const SceneHeading = styled.div`
  padding: 26px 32px 0; display: flex; gap: 16px; justify-content: space-between; align-items: center;
  > span { color: var(--studio-muted); font-size: 0.6rem; letter-spacing: 0.09em; font-variant-numeric: tabular-nums; }
  h3 { margin: 0; font-size: 0.77rem; font-weight: 500; color: var(--studio-muted); }
  @media(max-width:620px) { padding: 24px 20px 0; gap: 10px; }
`;
const Conversation = styled.div`
  padding: 36px 40px 30px;
  @media(max-width:620px) { padding: 28px 20px 24px; }
`;
const Phase = styled.div`
  display: flex; align-items: center; gap: 22px;
  > span { font-size: 5rem; line-height: 1; font-weight: 350; font-variant-numeric: tabular-nums; color: var(--studio-accent); }
  small { display: block; font-size: 0.58rem; letter-spacing: 0.1em; color: var(--studio-muted); }
  strong { display: block; margin-top: 10px; font-size: 0.95rem; font-weight: 500; }
  @media(max-width:620px) { gap: 18px; > span { font-size: 4rem; } }
`;
const Message = styled.blockquote`
  position: relative; margin: 28px 0 20px; min-height: 96px; animation: ${arrive} 420ms ease-out both;
  > span { position: absolute; top: -13px; left: -20px; color: #c0ef834d; font: 2.5rem Georgia, serif; }
  p { margin: 0; max-width: 650px; color: var(--studio-ink); font-size: 1.6rem; font-weight: 500; line-height: 1.6; word-break: keep-all; overflow-wrap: anywhere; text-wrap: pretty; }
  @media(max-width:620px) { margin: 24px 0 20px; min-height: 126px; > span { left: -10px; } p { font-size: 1.25rem; line-height: 1.7; } }
`;
const Exchange = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; gap: 10px; min-height: 24px; font-size: 0.73rem; color: var(--studio-muted);
  strong { color: var(--studio-accent); font-weight: 600; } svg { color: var(--studio-accent); }
  small { margin-left: auto; font-size: 0.62rem; }
  @media(max-width:620px) { small { flex-basis: 100%; margin-left: 0; padding-top: 5px; } }
`;
const Progress = styled.div`
  height: 1px; background: var(--studio-line);
  > span { display: block; height: 1px; background: var(--studio-accent); transform-origin: left; animation: ${progress} 5400ms linear both; }
`;
const NetworkBoard = styled.div`
  position: relative; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; padding: 30px 24px 42px;
  @media(max-width:620px) { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 36px 10px; padding: 26px 16px 42px; }
`;
const Wires = styled.svg`
  position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; fill: none;
  .signal { animation: ${travel} 2.7s linear 2; }
`;
const ActorNode = styled.div`
  position: relative; min-width: 0; z-index: 1; display: flex; flex-direction: column; align-items: center;
  &[data-speaking='true'] em, &[data-listening='true'] em { color: var(--studio-accent); }
`;
const Identity = styled.div`
  width: 100%; margin-top: 14px; text-align: center; word-break: keep-all; overflow-wrap: anywhere;
  strong, span, em { display: block; }
  strong { font-size: 0.65rem; color: var(--studio-ink); font-weight: 650; }
  span { margin-top: 5px; min-height: 28px; color: var(--studio-muted); font-size: 0.58rem; line-height: 1.5; }
  em { margin-top: 5px; color: #929e97; font-size: 0.56rem; font-style: normal; line-height: 1.5; }
`;
const Avatar = styled.div`
  position: relative; flex-shrink: 0; border-radius: 18px; opacity: 0.65; transition: opacity 250ms, outline-color 250ms;
  [data-portrait] { box-shadow: none; border-color: #ffffff30; }
  [data-actor-kind] { position: absolute; z-index: 2; bottom: -4px; right: -5px; padding: 3px 5px; border: 1px solid #ffffff26; border-radius: 4px; background: var(--studio-bg); color: var(--studio-muted); font-size: 0.5rem; font-weight: 700; }
  &[data-active='true'] { opacity: 1; outline: 1px solid var(--studio-accent); outline-offset: 4px; [data-actor-kind] { color: var(--studio-accent); } }
`;
const Workflow = styled.aside`
  padding: 28px 22px; border-left: 1px solid var(--studio-line); background: #ffffff02;
  @media(max-width:1000px) { padding: 24px 28px; border-left: 0; border-top: 1px solid var(--studio-line); }
  @media(max-width:620px) { padding: 24px 20px; }
`;
const Steps = styled.ol`
  display: grid; gap: 3px; padding: 0; margin: 20px 0 26px; list-style: none;
  button { display: flex; align-items: center; width: 100%; gap: 10px; min-height: 44px; padding: 8px 10px; border: 0; border-radius: 5px; background: transparent; color: var(--studio-muted); text-align: left; transition: background 160ms, color 160ms; }
  button > span { width: 23px; flex-shrink: 0; font-size: 0.6rem; font-variant-numeric: tabular-nums; }
  strong { flex: 1; font-size: 0.74rem; font-weight: 500; } button > svg { flex-shrink: 0; }
  button[aria-current='step'] { color: var(--studio-accent); background: #c0ef830e; }
  button[data-done='true'] > span { color: var(--studio-accent); }
  button:hover { background: #ffffff0a; color: var(--studio-ink); }
  @media(min-width:621px) and (max-width:1000px) { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  @media(max-width:620px) { grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 8px; button { padding: 8px; gap: 5px; } strong { font-size: 0.7rem; } }
`;
const Receipt = styled.div`
  border-top: 1px solid var(--studio-line); padding-top: 22px; display: flex; gap: 10px; color: var(--studio-accent);
  > svg { flex-shrink: 0; margin-top: 2px; } small { display: block; color: var(--studio-muted); font-size: 0.6rem; }
  strong { display: block; margin-top: 8px; font-size: 0.85rem; font-weight: 550; color: var(--studio-ink); } span { display: block; margin-top: 8px; font-size: 0.61rem; line-height: 1.7; color: var(--studio-muted); }
`;
const Footnote = styled.footer`
  border-top: 1px solid var(--studio-line); padding: 17px 32px; display: flex; flex-wrap: wrap; gap: 10px 20px; justify-content: space-between; color: var(--studio-muted); font-size: 0.61rem; line-height: 1.7;
  span { display: flex; gap: 7px; align-items: center; color: var(--studio-accent); } i { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
  @media(max-width:620px) { padding: 18px 20px; }
`;
