'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';
import { ArrowRight, CheckCheck, MessageCircle, Pause, Play, SkipForward } from 'lucide-react';
import styled, { keyframes } from 'styled-components';

type Actor = { id: string; name: string; role: string; photoIndex: number; accent: string };
type Scene = { title: string; output: string; departments: string[]; lines: [number, number, string, string][] };
// Participant indices are CEO, coordinator, then the four departments in each scene.
const SCENES: Scene[] = [
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

export function StaffCollaborationStage({ people, portrait }: { people: Actor[]; portrait: (person: Actor) => ReactNode }) {
  const reduced = useReducedMotion();
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
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.15 });
    if (root.current) observer.observe(root.current);
    const update = () => setForeground(!document.hidden);
    update();
    document.addEventListener('visibilitychange', update);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, []);

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
      const y1 = (source?.getBoundingClientRect().bottom ?? a.bottom) + 5 - bounds.y;
      const x2 = b.x + b.width / 2 - bounds.x;
      const y2 = (target?.getBoundingClientRect().bottom ?? b.bottom) + 5 - bounds.y;
      setPath(`M ${x1} ${y1} C ${x1} ${y1 + 28}, ${x2} ${y2 + 28}, ${x2} ${y2}`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [from, to, sceneIndex]);

  const advance = () => {
    setTyping(false);
    if (step === scene.lines.length - 1) { setSceneIndex(index => (index + 1) % SCENES.length); setStep(0); }
    else setStep(value => value + 1);
  };

  return (
    <Stage ref={root} aria-labelledby="collaboration-title" data-running={running} data-step={step}>
      <Header>
        <div><Eyebrow><span /> ONE HUMAN · AI TEAM</Eyebrow><h2 id="collaboration-title">혼자 일하지만, 혼자 만드는 건 아니니까.</h2><p>방향은 내가, 실행은 부서 봇들과 함께. 요청이 협업이 되고, 다시 나의 결정으로 돌아옵니다.</p></div>
        <Controls>
          <button type="button" onClick={() => { setPaused(value => !value); setTyping(false); }} disabled={Boolean(reduced)} aria-label={paused ? '대화 재생' : '대화 일시정지'}>{paused || reduced ? <Play size={15} /> : <Pause size={15} />}{reduced ? '동작 줄임' : paused ? '재생' : '일시정지'}</button>
          <button type="button" onClick={advance} aria-label="다음 대화"><SkipForward size={15} />다음</button>
        </Controls>
      </Header>
      <Topics aria-label="협업 시나리오">
        {SCENES.map((item, index) => <button type="button" key={item.title} aria-pressed={sceneIndex === index} onClick={() => { setSceneIndex(index); setStep(0); setTyping(false); }}>{item.title}</button>)}
      </Topics>
      <Workspace>
        <NetworkBoard ref={board} aria-label="대화하는 대표와 부서 봇 조직도">
          <Wires data-collaboration-wire="" aria-hidden="true"><path d={path} stroke={actors[from].accent} opacity="0.2" strokeWidth="8" /><path className="signal" d={path} stroke={actors[from].accent} strokeWidth="2" strokeDasharray="7 9" /></Wires>
          {actors.map((person, index) => {
            const speaking = index === from;
            const listening = index === to;
            const previous = scene.lines.slice(0, step).findLast(line => line[0] === index);
            return <ActorNode key={person.id} data-actor-index={index} data-speaking={speaking} $accent={person.accent}>
              <Bubble data-active={speaking} key={`${person.id}-${speaking ? step : 'idle'}`}>
                {speaking ? <><small>{actors[to].name}에게 <ArrowRight size={11} /></small>{message}</> : previous ? <><small><CheckCheck size={12} /> 전달 완료</small>{previous[2]}</> : <><small>{index === 0 ? 'HUMAN · 최종 결정' : 'AI · 부서 파트너'}</small>{listening ? '네, 듣고 있어요. 함께 풀어볼게요.' : index === 0 ? '내 생각을 팀의 실행으로.' : '필요한 순간, 함께할 준비 중.'}</>}
              </Bubble>
              <Identity><Avatar data-active={speaking || listening}>{portrait(person)}</Avatar><div><strong>{person.name}</strong><span>{index === 0 ? '대표 · 사람 1명' : person.role}</span><em>{speaking ? '이야기하는 중' : listening ? typing && running ? '답변 준비 중 ···' : '메시지 확인 중' : previous ? '업무 이어가는 중' : '협업 대기'}</em></div></Identity>
            </ActorNode>;
          })}
        </NetworkBoard>
        <Conversation aria-label="협업 대화 기록">
          <Eyebrow><MessageCircle size={14} /> TEAM CONVERSATION</Eyebrow>
          <h3>{scene.title}</h3>
          <Phase><span>{String(step + 1).padStart(2, '0')} / 07</span><strong>{phase}</strong></Phase>
          <Steps aria-label={`협업 7단계 중 ${step + 1}단계`}>{scene.lines.map((_, index) => <i key={index} data-done={index <= step} />)}</Steps>
          <Messages aria-live={paused || reduced ? 'polite' : 'off'}>
            {scene.lines.slice(Math.max(0, step - 2), step + 1).map(([sender, receiver, text], index) => <div key={`${sceneIndex}-${step}-${index}`}><small>{actors[sender].name}<ArrowRight size={10} />{actors[receiver].name}</small><p>{text}</p></div>)}
          </Messages>
          <Receipt><CheckCheck size={17} /><div><strong>{scene.output}</strong><span>{step === 6 ? '대표의 최종 검토로 이어집니다' : '부서의 의견을 하나씩 모으는 중'}</span></div></Receipt>
        </Conversation>
      </Workspace>
      <Footnote><span><i />{reduced ? '수동으로 대화 살펴보기' : paused ? '대화 일시정지' : '협업 스토리 재생 중'}</span>업무 방식을 보여주는 시뮬레이션입니다. 실제 접속·작업 현황이 아닙니다.</Footnote>
    </Stage>
  );
}

const travel = keyframes`to { stroke-dashoffset: -64; }`;
const arrive = keyframes`from { opacity: 0.4; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); }`;
const breathe = keyframes`50% { transform: translateY(-3px); }`;
const Stage = styled.section`
  border: 1px solid var(--board-line); border-radius: 22px; background: #061225; overflow: hidden;
  button { cursor: pointer; font: inherit; }
  button:focus-visible { outline: 3px solid #80e8df; outline-offset: 3px; }
  &[data-running='false'] * { animation-play-state: paused !important; }
  @media (prefers-reduced-motion: reduce) { *, *::after { animation: none !important; transition: none !important; } }
`;
const Header = styled.header`
  padding: 26px 26px 18px; display: flex; gap: 20px; align-items: center; justify-content: space-between;
  h2 { margin: 10px 0; font-size: 1.4rem; line-height: 1.45; color: #f5f9ff; word-break: keep-all; }
  p { margin: 0; color: #9eb1ca; font-size: 0.8rem; line-height: 1.7; word-break: keep-all; }
  @media(max-width: 760px) { padding: 20px 16px 12px; flex-direction: column; align-items: flex-start; h2 { font-size: 1.2rem; } }
`;
const Eyebrow = styled.div`
  display: flex; align-items: center; gap: 8px; color: #88ddd5; font-size: 0.62rem; font-weight: 800; letter-spacing: 0.1em;
  > span { width: 6px; height: 6px; background: #88ddd5; border-radius: 50%; }
`;
const Controls = styled.div`
  display: flex; flex-shrink: 0; gap: 6px;
  button { display: flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 12px; border: 1px solid #34465f; border-radius: 9px; background: #101f35; color: #e4edf8; font-size: 0.72rem; }
  button:hover { background: #20364f; } button:disabled { cursor: default; color: #9eb1ca; }
`;
const Topics = styled.div`
  padding: 0 26px 20px; display: flex; gap: 7px; flex-wrap: wrap;
  button { min-height: 38px; padding: 8px 12px; border: 1px solid #2b3b53; border-radius: 8px; color: #b2c3da; background: transparent; font-size: 0.72rem; }
  button[aria-pressed='true'] { color: #a1f1e0; background: #143535; border-color: #397a74; }
  button:hover { border-color: #80d8cb; }
  @media(max-width:760px) { padding: 0 16px 16px; gap: 6px; }
`;
const Workspace = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr) 280px; border-top: 1px solid #20334c;
  @media(max-width:1100px) { grid-template-columns: 1fr; }
`;
const NetworkBoard = styled.div`
  position: relative; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 48px 28px; padding: 28px;
  background-image: radial-gradient(#24405a 0.7px, transparent 0.7px); background-size: 18px 18px;
  @media(max-width:620px) { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 32px 14px; padding: 20px 12px; }
`;
const Wires = styled.svg`
  position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; fill: none;
  .signal { animation: ${travel} 1.6s linear infinite; }
`;
const ActorNode = styled.div<{ $accent: string }>`
  --actor-color: ${props => props.$accent}; position: relative; min-width: 0; z-index: 1;
`;
const Bubble = styled.div`
  position: relative; min-height: 110px; padding: 13px 14px; border: 1px solid #293c56; border-radius: 13px 13px 13px 3px; color: #98adc6; background: #0b1a2e; font-size: 0.74rem; line-height: 1.65; word-break: keep-all; overflow-wrap: anywhere;
  small { display: flex; align-items: center; gap: 5px; margin-bottom: 7px; color: #91a9c6; font-size: 0.6rem; }
  &::after { content: ''; position: absolute; bottom: -7px; left: 25px; width: 12px; height: 12px; background: inherit; border-right: inherit; border-bottom: inherit; transform: rotate(45deg); }
  &[data-active='true'] { color: #f3f8ff; background: #133148; border-color: var(--actor-color); animation: ${arrive} 0.35s ease-out; box-shadow: 0 0 24px #53c7df12; small { color: var(--actor-color); } }
  @media(max-width:620px) { min-height: 144px; padding: 10px; font-size: 0.7rem; }
`;
const Identity = styled.div`
  display: flex; align-items: center; gap: 10px; margin-top: 18px;
  > div:last-child { min-width: 0; } strong, span, em { display: block; }
  strong { font-size: 0.78rem; color: #f4f8ff; } span { margin-top: 4px; color: #a4b8d1; font-size: 0.61rem; }
  em { margin-top: 6px; color: var(--actor-color); font-size: 0.6rem; font-style: normal; }
  @media(max-width:620px) { flex-direction: column; align-items: flex-start; gap: 8px; }
`;
const Avatar = styled.div`
  flex-shrink: 0; border-radius: 50%; background: #0b1a2e;
  &[data-active='true'] { outline: 2px solid var(--actor-color); outline-offset: 4px; animation: ${breathe} 2.4s ease-in-out infinite; }
`;
const Conversation = styled.aside`
  padding: 26px 20px; border-left: 1px solid #20334c; background: #08172a;
  h3 { font-size: 1rem; margin: 14px 0 20px; }
  @media(max-width:1100px) { border-left: 0; border-top: 1px solid #20334c; }
`;
const Phase = styled.div`
  display: flex; justify-content: space-between; gap: 10px; font-size: 0.68rem; span { color: #91a9c6; font-variant-numeric: tabular-nums; } strong { color: #9be7dc; }
`;
const Steps = styled.div`
  display: flex; gap: 4px; margin: 12px 0 22px; i { flex: 1; height: 3px; background: #263a51; border-radius: 4px; } i[data-done='true'] { background: #80d8cb; }
`;
const Messages = styled.div`
  min-height: 270px; display: flex; flex-direction: column; gap: 18px;
  > div { border-left: 2px solid #335671; padding-left: 12px; }
  small { display: flex; align-items: center; gap: 6px; color: #8cbfd8; font-size: 0.6rem; }
  p { margin: 7px 0 0; color: #cfdbeb; font-size: 0.73rem; line-height: 1.7; word-break: keep-all; }
`;
const Receipt = styled.div`
  border-top: 1px solid #263c53; padding-top: 16px; display: flex; gap: 10px; color: #88ddd5;
  strong { display: block; font-size: 0.73rem; } span { display: block; margin-top: 6px; font-size: 0.62rem; color: #9eb1ca; }
`;
const Footnote = styled.footer`
  border-top: 1px solid #20334c; padding: 14px 26px; display: flex; flex-wrap: wrap; gap: 10px 20px; justify-content: space-between; color: #91a9c6; font-size: 0.64rem; line-height: 1.6;
  span { display: flex; gap: 7px; align-items: center; color: #9be7dc; } i { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
`;
