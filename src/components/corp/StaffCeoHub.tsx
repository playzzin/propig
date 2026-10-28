'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Pause, Play, SkipForward } from 'lucide-react';
import styled, { keyframes } from 'styled-components';
import { SCENES } from './StaffCollaborationStage';
import { CEO, CORE_EXECUTIVES, DIVISIONS, EXECUTIVES, GENERAL_MANAGER, type Person } from './staffDirectory';
import { useStaffReducedMotion } from './useStaffReducedMotion';

export type StaffHubActivity = {
  sourceId: string;
  targetId: string;
  divisionIds: string[];
  phase: number;
  running: boolean;
};

type Props = {
  portrait: (person: Person, size: number) => ReactNode;
  onProfile: (person: Person, trigger: HTMLElement) => void;
  onActivityChange: (activity: StaffHubActivity) => void;
};

const LEADERS = [...CORE_EXECUTIVES, ...EXECUTIVES].map((person, index) => {
  const angle = -112.5 + index * 45;
  const radians = angle * Math.PI / 180;
  return { person, angle, x: 160 + Math.cos(radians) * 110, y: 180 + Math.sin(radians) * 110 };
});
const COLLABORATORS = [CEO, GENERAL_MANAGER, ...DIVISIONS.map(division => division.head)];
const DIVISION_EXECUTIVE: Record<string, string> = {
  development: 'cto', automation: 'coo', media: 'cmo', creator: 'cmo', marketing: 'cmo',
  strategy: 'cbo', 'customer-success': 'cao', 'finance-management': 'cfo',
  'people-culture': 'cpo', 'business-expansion': 'cbo',
};

export function StaffCeoHub({ portrait, onProfile, onActivityChange }: Props) {
  const reduced = useStaffReducedMotion();
  const root = useRef<HTMLElement>(null);
  const activityCallback = useRef(onActivityChange);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [foreground, setForeground] = useState(true);
  const scene = SCENES[sceneIndex];
  const actors = ['ceo', 'general-manager', ...scene.departments.map(id => `${id}-head`)]
    .map(id => COLLABORATORS.find(person => person.id === id)!);
  const [from, to, message, phase] = scene.lines[step];
  const sourceId = actors[from].id;
  const targetId = actors[to].id;
  const divisionIds = scene.departments;
  const running = !paused && !reduced && visible && foreground;
  const activeExecutiveIds = new Set([
    DIVISION_EXECUTIVE[sourceId.replace(/-head$/, '')],
    DIVISION_EXECUTIVE[targetId.replace(/-head$/, '')],
    step === 6 ? 'clo' : step === 0 || step === 1 ? 'coo' : undefined,
  ]);

  useEffect(() => {
    activityCallback.current = onActivityChange;
  }, [onActivityChange]);

  useEffect(() => {
    activityCallback.current({ sourceId, targetId, divisionIds: [...divisionIds], phase: step, running });
  }, [sourceId, targetId, divisionIds, step, running]);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.1 });
    if (root.current) observer.observe(root.current);
    const updateForeground = () => setForeground(!document.hidden);
    updateForeground();
    document.addEventListener('visibilitychange', updateForeground);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', updateForeground);
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => {
      if (step === scene.lines.length - 1) {
        setSceneIndex(index => (index + 1) % SCENES.length);
        setStep(0);
      } else setStep(value => value + 1);
    }, 5400);
    return () => window.clearTimeout(timer);
  }, [running, sceneIndex, scene.lines.length, step]);

  const advance = () => {
    if (step === scene.lines.length - 1) {
      setSceneIndex(index => (index + 1) % SCENES.length);
      setStep(0);
    } else setStep(value => value + 1);
  };

  return (
    <Hub id="staff-collaboration" ref={root} aria-labelledby="staff-hub-title" data-running={running} data-step={step}>
      <Heading><h2 id="staff-hub-title">하나의 판단, 연결되는 실행</h2><span>HUMAN × AI</span></Heading>
      <Orbit aria-label="CEO 중심 경영진 조직도">
        <OrbitGrid aria-hidden="true" viewBox="0 0 320 340" preserveAspectRatio="none">
          {LEADERS.map(({ person, angle }) => <g key={person.id} transform={`translate(160 180) rotate(${angle})`} data-active={activeExecutiveIds.has(person.id)}>
            <line x1="46" y1="0" x2="106" y2="0" />
            <circle data-packet="" cx="0" cy="0" r="2" style={{ animationDelay: `${(angle + 112.5) / 90}s` }} />
          </g>)}
          <path className="control-link" d="M160 44 V132" />
        </OrbitGrid>
        <OrbitRing $size={246} aria-hidden="true"><OrbitSweep /><i /></OrbitRing>
        <OrbitRing $size={168} aria-hidden="true"><OrbitSweep $reverse /><i /></OrbitRing>
        <CeoPulse aria-hidden="true" />
        <ControlButton type="button" data-active={sourceId === GENERAL_MANAGER.id || targetId === GENERAL_MANAGER.id} onClick={event => onProfile(GENERAL_MANAGER, event.currentTarget)} aria-label={`${GENERAL_MANAGER.name} ${GENERAL_MANAGER.role} 상세 프로필 열기`}>
          {portrait(GENERAL_MANAGER, 28)}<span><strong>CONTROL</strong><small>총괄본부장</small></span>
        </ControlButton>
        {LEADERS.map(({ person, x, y }) => <ExecutiveButton key={person.id} type="button" $x={x / 320 * 100} $y={y} data-active={activeExecutiveIds.has(person.id)} onClick={event => onProfile(person, event.currentTarget)} aria-label={`${person.name} ${person.role} 상세 프로필 열기`} title={person.title}>
          <ExecutivePortrait>{portrait(person, 40)}{activeExecutiveIds.has(person.id) ? <i key={`${sceneIndex}-${step}`} aria-hidden="true" /> : null}</ExecutivePortrait>
          <strong>{person.name}</strong><small>{person.role}</small>
        </ExecutiveButton>)}
        <CeoButton type="button" data-ceo-anchor="" data-active={sourceId === CEO.id || targetId === CEO.id} onClick={event => onProfile(CEO, event.currentTarget)} aria-label={`${CEO.name} ${CEO.role} 상세 프로필 열기`}>
          {portrait(CEO, 72)}<span><strong>{CEO.name}</strong><small>HUMAN · CEO</small></span>
        </CeoButton>
      </Orbit>
      <Story>
        <StoryControls>
          <select aria-label="협업 시나리오 선택" value={sceneIndex} onChange={event => { setSceneIndex(Number(event.target.value)); setStep(0); }}>
            {SCENES.map((item, index) => <option value={index} key={item.title}>{item.title}</option>)}
          </select>
          <button type="button" onClick={() => setPaused(value => !value)} disabled={Boolean(reduced)} aria-label={reduced ? '동작 줄임 설정으로 자동 재생 꺼짐' : paused ? '대화 재생' : '대화 일시정지'} title={reduced ? '동작 줄임' : paused ? '재생' : '일시정지'}>{paused || reduced ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}</button>
          <button type="button" onClick={advance} aria-label="다음 대화" title="다음 대화"><SkipForward size={14} aria-hidden="true" /></button>
        </StoryControls>
        <Conversation aria-live={paused || reduced ? 'polite' : 'off'} aria-label="현재 협업 대화">
          <div><strong>{String(step + 1).padStart(2, '0')} · {phase}</strong><span>{actors[from].name}<ArrowRight size={10} aria-hidden="true" />{actors[to].name}</span></div>
          <p data-message="" key={`${sceneIndex}-${step}`}>{message}</p>
        </Conversation>
        <Steps aria-label="협업 7단계">
          {scene.lines.map(([, , , label], index) => <li key={`${sceneIndex}-${index}`}><button type="button" onClick={() => setStep(index)} aria-current={step === index ? 'step' : undefined} aria-label={`${index + 1}단계 ${label} 대화 보기`} title={`${index + 1}단계 · ${label}`}>{index + 1}</button></li>)}
        </Steps>
        <Status><span><i />{reduced ? '동작 줄임 · 수동 탐색' : paused ? '모션 일시정지' : running ? '협업 스토리 재생 중' : '재생 대기'}</span><small>시뮬레이션 · 실제 현황 아님</small></Status>
      </Story>
    </Hub>
  );
}

const orbit = keyframes`to { transform: rotate(360deg); }`;
const send = keyframes`0% { transform: translateX(48px); opacity: 0; } 18% { opacity: 0.85; } 82% { opacity: 0.85; } 100% { transform: translateX(106px); opacity: 0; }`;
const pulse = keyframes`0% { transform: scale(0.88); opacity: 0; } 22% { opacity: 0.38; } 100% { transform: scale(1.45); opacity: 0; }`;
const response = keyframes`0%, 100% { transform: scale(1); opacity: 0.25; } 45% { transform: scale(1.18); opacity: 0.8; }`;
const arrive = keyframes`from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); }`;

const Hub = styled.section`
  --hub-accent: #c0ef83; --hub-ink: #f3f1e8; --hub-muted: #a5afaa; --hub-line: #ffffff18;
  position: relative; min-width: 0; width: 100%; padding: 12px 10px 10px; color: var(--hub-ink); background: transparent;
  border: 1px solid transparent; border-radius: 18px; scroll-margin-top: 90px;
  button, select { font: inherit; touch-action: manipulation; }
  button { cursor: pointer; }
  button:focus-visible, select:focus-visible { outline: 2px solid var(--hub-accent); outline-offset: 3px; }
  &[data-running='false'] *, &[data-running='false'] *::before, &[data-running='false'] *::after { animation-play-state: paused !important; }
  &[data-running='false'] [data-message] { animation: none; }
  @media(prefers-reduced-motion:reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
`;
const Heading = styled.header`
  display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 18px;
  h2 { margin: 0; font-size: 11px; font-weight: 550; line-height: 1.4; }
  > span { color: var(--hub-accent); font-size: 7px; letter-spacing: 0.1em; white-space: nowrap; }
`;
const Orbit = styled.div`
  position: relative; width: 100%; height: 340px;
`;
const OrbitGrid = styled.svg`
  position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none;
  line { stroke: #ffffff12; stroke-width: 1; }
  [data-packet] { fill: var(--hub-accent); animation: ${send} 3.8s linear infinite; opacity: 0; }
  g[data-active='true'] line { stroke: #c0ef8360; }
  g:not([data-active='true']) [data-packet] { fill: #9ebf9c; opacity: 0.35; }
  .control-link { fill: none; stroke: #c0ef8333; stroke-width: 1; stroke-dasharray: 3 5; }
`;
const OrbitRing = styled.div<{ $size: number }>`
  position: absolute; top: 180px; left: 50%; width: ${p => p.$size}px; height: ${p => p.$size}px; transform: translate(-50%, -50%); border: 1px solid #ffffff0d; border-radius: 50%; pointer-events: none;
  > i { position: absolute; top: -2px; left: 50%; width: 3px; height: 3px; border-radius: 50%; background: #b3c8ad; }
`;
const OrbitSweep = styled.div<{ $reverse?: boolean }>`
  position: absolute; inset: -1px; border: 1px solid transparent; border-top-color: #c0ef8370; border-right-color: #c0ef8315; border-radius: 50%; animation: ${orbit} ${p => p.$reverse ? '24s' : '38s'} linear infinite; animation-direction: ${p => p.$reverse ? 'reverse' : 'normal'};
  &::after { content: ''; position: absolute; top: 13%; right: 13%; width: 4px; height: 4px; border-radius: 50%; background: var(--hub-accent); box-shadow: 0 0 7px #c0ef8360; }
`;
const CeoPulse = styled.div`
  position: absolute; left: calc(50% - 44px); top: 136px; width: 88px; height: 88px; pointer-events: none;
  &::before, &::after { content: ''; position: absolute; inset: 0; border: 1px solid var(--hub-accent); border-radius: 50%; animation: ${pulse} 4.8s ease-out infinite; }
  &::after { animation-delay: 2.4s; }
`;
const ControlButton = styled.button`
  position: absolute; z-index: 2; top: 0; left: 50%; transform: translateX(-50%); display: flex; align-items: center; justify-content: center; gap: 7px; min-width: 110px; min-height: 44px; padding: 4px 8px;
  border: 1px solid #ffffff20; border-radius: 10px; background: #141e20; color: var(--hub-ink);
  [data-portrait] { box-shadow: none; border-radius: 50%; border-color: #ffffff30; }
  strong, small { display: block; } strong { font-size: 10px; font-weight: 600; } small { margin-top: 3px; font-size: 8px; color: var(--hub-muted); }
  &[data-active='true'], &:hover { border-color: #c0ef8370; }
`;
const ExecutiveButton = styled.button<{ $x: number; $y: number }>`
  position: absolute; z-index: 2; left: ${p => p.$x}%; top: ${p => p.$y}px; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; width: 60px; min-height: 66px; padding: 2px; border: 0; border-radius: 9px; background: #101719; color: var(--hub-ink);
  strong { margin-top: 2px; font-size: 9px; line-height: 1.1; font-weight: 600; } small { margin-top: 1px; color: var(--hub-muted); font-size: 8px; line-height: 1.1; }
  &[data-active='true'] strong { color: var(--hub-accent); }
  &:hover { background: #1a2525; }
`;
const ExecutivePortrait = styled.span`
  position: relative; display: block; width: 40px; height: 40px;
  [data-portrait] { box-shadow: none; border-color: #ffffff28; border-radius: 50%; }
  > i { position: absolute; inset: -3px; border: 1px solid var(--hub-accent); border-radius: 50%; animation: ${response} 1.4s ease-in-out 3; }
`;
const CeoButton = styled.button`
  position: absolute; z-index: 3; left: 50%; top: 180px; transform: translate(-50%, -50%); display: grid; place-items: center; width: 84px; height: 84px; padding: 5px; border: 1px solid #c0ef8370; border-radius: 50%; background: #17231c; color: var(--hub-ink);
  [data-portrait] { box-shadow: none; border: 1px solid #c0ef83aa; border-radius: 50%; }
  > span:not([data-portrait]) { position: absolute; top: 84px; left: 50%; transform: translateX(-50%); width: 100px; text-align: center; pointer-events: none; }
  strong, small { display: block; } strong { font-size: 12px; font-weight: 650; line-height: 1.2; } small { margin-top: 2px; font-size: 7px; color: var(--hub-accent); letter-spacing: 0.06em; line-height: 1.2; }
  &[data-active='true'] { border-color: var(--hub-accent); background: #22331e; }
  &:hover { background: #283b23; }
`;
const Story = styled.div`
  position: relative; display: grid; gap: 7px; padding-top: 10px; border-top: 1px solid var(--hub-line); background: var(--board-bg);
`;
const StoryControls = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr) 30px 30px; gap: 5px;
  select { min-width: 0; width: 100%; height: 30px; padding: 3px 6px; border: 1px solid #ffffff24; border-radius: 5px; color: var(--hub-ink); background: #1a2222; color-scheme: dark; font-size: 11px; }
  button { display: grid; place-items: center; height: 30px; padding: 0; border: 1px solid #ffffff24; border-radius: 5px; color: var(--hub-ink); background: transparent; }
  button:hover { background: #ffffff10; } button:disabled { cursor: default; color: var(--hub-muted); opacity: 0.6; }
  @media(max-width:700px), (pointer:coarse) { grid-template-columns: minmax(0, 1fr) 44px 44px; select, button { height: 44px; } }
`;
const Conversation = styled.div`
  min-width: 0;
  > div { display: flex; align-items: center; justify-content: space-between; gap: 6px; min-height: 14px; }
  strong { flex-shrink: 0; color: var(--hub-accent); font-size: 9px; font-weight: 550; font-variant-numeric: tabular-nums; }
  span { display: flex; align-items: center; gap: 4px; min-width: 0; color: var(--hub-muted); font-size: 8px; overflow-wrap: anywhere; }
  svg { flex-shrink: 0; }
  p { min-height: 38px; margin: 5px 0 0; font-size: 12px; line-height: 1.6; word-break: keep-all; overflow-wrap: anywhere; animation: ${arrive} 300ms ease-out both; }
`;
const Steps = styled.ol`
  display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 3px; margin: 0; padding: 0; list-style: none;
  button { width: 100%; height: 25px; padding: 0; border: 1px solid transparent; border-radius: 4px; background: #ffffff05; color: var(--hub-muted); font-size: 10px; font-variant-numeric: tabular-nums; }
  button[aria-current='step'] { border-color: #c0ef834d; background: #c0ef8314; color: var(--hub-accent); }
  button:hover { color: var(--hub-ink); background: #ffffff10; }
  @media(max-width:700px), (pointer:coarse) { grid-template-columns: repeat(auto-fit, minmax(44px, 1fr)); button { min-width: 44px; height: 44px; } }
`;
const Status = styled.footer`
  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 5px 8px; color: var(--hub-muted); font-size: 7px; line-height: 1.5;
  > span { display: flex; align-items: center; gap: 4px; color: var(--hub-accent); }
  i { width: 3px; height: 3px; border-radius: 50%; background: currentColor; } small { font-size: inherit; }
`;
