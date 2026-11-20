'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, Network, Sparkles } from 'lucide-react';
import styled, { keyframes } from 'styled-components';
import { StaffCeoHub, type StaffHubActivity } from './StaffCeoHub';
import { DIVISIONS, SUPPORT_UNITS, buildTeamPerson, type Person } from './staffDirectory';

type Props = {
  portrait: (person: Person, size: number) => ReactNode;
  onProfile: (person: Person, trigger: HTMLElement) => void;
};
type Connection = { id: string; path: string; x: number; y: number; color: string };
const initialActivity: StaffHubActivity = {
  sourceId: 'ceo', targetId: 'general-manager', divisionIds: ['strategy', 'development', 'creator', 'marketing'], phase: 0, running: false,
};

export function StaffOverviewBoard({ portrait, onProfile }: Props) {
  const networkRef = useRef<HTMLDivElement>(null);
  const [activity, setActivity] = useState(initialActivity);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [focusedDivision, setFocusedDivision] = useState<string | null>(null);

  useEffect(() => {
    const network = networkRef.current;
    if (!network) return;
    let disposed = false;
    const measure = () => {
      if (disposed) return;
      const center = network.querySelector('[data-ceo-anchor]')?.getBoundingClientRect();
      const bounds = network.getBoundingClientRect();
      if (!center) return;
      const startX = center.x + center.width / 2 - bounds.x;
      const startY = center.y + center.height / 2 - bounds.y;
      setConnections(DIVISIONS.flatMap((division, index) => {
        const nodeElement = network.querySelector(`[data-division="${division.id}"]`);
        const node = nodeElement?.getBoundingClientRect();
        const head = nodeElement?.querySelector('button')?.getBoundingClientRect();
        if (!node) return [];
        const x = (index < 5 ? node.right : node.left) - bounds.x;
        const y = (head ? head.top + head.height / 2 : node.top + 16) - bounds.y;
        const bend = startX + (x - startX) * .62;
        return [{ id: division.id, path: `M ${startX} ${startY} C ${bend} ${startY}, ${bend} ${y}, ${x} ${y}`, x, y, color: division.accent }];
      }));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(network);
    network.querySelectorAll('[data-division], [data-ceo-anchor]').forEach(element => observer.observe(element));
    const settleEntrance = (event: AnimationEvent) => {
      if (event.target instanceof Element && event.target.hasAttribute('data-division')) measure();
    };
    network.addEventListener('animationend', settleEntrance);
    measure();
    void document.fonts.ready.then(measure);
    return () => { disposed = true; observer.disconnect(); network.removeEventListener('animationend', settleEntrance); };
  }, []);

  const divisionIsActive = (id: string) => {
    if (focusedDivision) return focusedDivision === id;
    if (activity.phase === 0 || activity.phase === 6) return activity.divisionIds.includes(id);
    return activity.sourceId === `${id}-head` || activity.targetId === `${id}-head`;
  };

  return (
    <Board aria-labelledby="staff-intro-title" data-staff-overview="" data-motion-running={activity.running}>
      <Heading>
        <div><Eyebrow><i /> PEOPLE × AI · CONNECTED ORGANIZATION</Eyebrow><h1 id="staff-intro-title">한 사람의 방향, 함께 움직이는 조직.</h1></div>
        <Counts aria-label="조직 구성"><span><strong>01</strong> CEO</span><span><strong>10</strong> 전문 부서</span><span><strong>100</strong> AI 팀장</span></Counts>
      </Heading>

      <Organization aria-label="CEO를 중심으로 연결된 전체 조직">
        <NetworkHeading>
          <div><Network size={14} aria-hidden="true" /><span>CEO 중심 협업 네트워크</span></div>
          <FlowLegend aria-label="업무 흐름"><span data-active={activity.phase === 0}>01 방향 제시</span><i /><span data-active={activity.phase > 0 && activity.phase < 6}>02 협업 실행</span><i /><span data-active={activity.phase === 6}>03 CEO 검토</span></FlowLegend>
          <p>인물과 팀을 눌러 상세 프로필 보기</p>
        </NetworkHeading>
        <NetworkGrid ref={networkRef}>
          <Connections aria-hidden="true" data-organization-connections="">
            {connections.map(connection => {
              const active = divisionIsActive(connection.id);
              const inbound = activity.phase === 6 || activity.sourceId === `${connection.id}-head`;
              return <g key={connection.id} data-connection={connection.id} data-active={active} data-inbound={inbound} style={{ color: connection.color }}>
                <path d={connection.path} className="connection-track" />
                <path d={connection.path} className="connection-light" pathLength={100} />
                <circle cx={connection.x} cy={connection.y} r={3} className="connection-port" />
              </g>;
            })}
          </Connections>
          <HubSlot><StaffCeoHub portrait={portrait} onProfile={onProfile} onActivityChange={setActivity} /></HubSlot>
          {DIVISIONS.map((division, index) => {
            const active = divisionIsActive(division.id);
            return <Department
              key={division.id} $accent={division.accent} $side={index < 5 ? 'left' : 'right'} $row={index % 5 + 1}
              data-division={division.id} data-active={active} data-performance-region="staff-org-node"
              onMouseEnter={() => setFocusedDivision(division.id)} onMouseLeave={() => setFocusedDivision(null)}
              onFocus={() => setFocusedDivision(division.id)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocusedDivision(null); }}
              style={{ animationDelay: `${(index % 5) * 60}ms` }}>
              <DepartmentHead type="button" onClick={event => onProfile(division.head, event.currentTarget)} aria-label={`${division.label} ${division.head.name} 본부장 상세 프로필 열기`}>
                {portrait(division.head, 28)}<div><h2>{division.label}</h2><span>{division.head.name} <i>· 본부장</i></span></div><DepartmentState aria-hidden="true"><i />{String(index + 1).padStart(2, '0')}</DepartmentState>
              </DepartmentHead>
              <TeamRoster aria-label={`${division.label} 10개 팀`}>
                {division.teams.map(team => <li key={team.name}><button type="button" data-team-profile="" title={`${team.name} · ${team.lead}`} aria-label={`${team.name} ${team.lead} 상세 프로필 열기`} onClick={event => onProfile(buildTeamPerson(division, team), event.currentTarget)}>{team.name}</button></li>)}
              </TeamRoster>
            </Department>;
          })}
        </NetworkGrid>
      </Organization>

      <Support aria-labelledby="support-title">
        <SupportHeading><h2 id="support-title"><Sparkles size={14} aria-hidden="true" />전략적 지원 조직</h2><span>조직의 모든 연결을 더 단단하게.</span></SupportHeading>
        <SupportUnits>
          {SUPPORT_UNITS.map(unit => <button key={unit.id} type="button" data-performance-region="staff-flow-step" onClick={event => onProfile(unit.lead, event.currentTarget)} aria-label={`${unit.label} ${unit.lead.name} 상세 프로필 열기`}>
            {portrait(unit.lead, 26)}<div><strong>{unit.label}</strong><span>{unit.lead.name} · {unit.executive} 직속</span></div><ArrowUpRight size={12} aria-hidden="true" />
          </button>)}
        </SupportUnits>
      </Support>
    </Board>
  );
}

const arrive = keyframes`from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); }`;
const transmit = keyframes`from { stroke-dashoffset: 100; } to { stroke-dashoffset: 0; }`;
const breathe = keyframes`0%,100% {opacity:.45;transform:scale(.8);} 50% {opacity:1;transform:scale(1.15);}`;
const Board = styled.div`
  --overview-accent:#c0ef83;
  max-width:1800px;margin:0 auto;padding:12px 18px;display:grid;gap:12px;color:var(--board-ink);
  button{font-family:inherit;cursor:pointer;}
  button:focus-visible{outline:2px solid var(--overview-accent);outline-offset:3px;}
  &[data-motion-running='false'] .connection-light {animation-play-state:paused !important;}
  @media(max-width:700px){padding:16px 12px;gap:20px;}
  @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none !important;transition:none !important;}}
`;
const Heading = styled.header`
  display:flex;align-items:center;justify-content:space-between;gap:20px;
  h1{font-size:24px;font-weight:650;line-height:1.3;margin:6px 0 0;letter-spacing:0;}
  @media(max-width:1150px){h1{font-size:22px;}}
  @media(max-width:700px){flex-wrap:wrap;gap:14px;h1{font-size:24px;max-width:320px;word-break:keep-all;}}
`;
const Eyebrow = styled.div`display:flex;align-items:center;gap:6px;font-size:8px;letter-spacing:.12em;color:var(--overview-accent);i{width:5px;height:5px;border-radius:50%;background:currentColor;}`;
const Counts = styled.div`
  display:flex;gap:18px;align-items:center;
  >span{display:flex;align-items:baseline;gap:5px;font-size:10px;color:var(--board-muted);white-space:nowrap;}
  strong{color:var(--board-ink);font-size:24px;font-weight:450;font-variant-numeric:tabular-nums;}
  @media(max-width:700px){width:100%;justify-content:space-between;padding:8px 0;border-block:1px solid var(--board-line);strong{font-size:22px;}}
`;
const Organization = styled.section`min-width:0;`;
const NetworkHeading = styled.div`
  display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;min-height:22px;
  >div:first-child{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--board-muted);}svg{color:var(--overview-accent);}
  p{margin:0;font-size:9px;color:var(--board-muted);}
  @media(max-width:1250px){p{display:none;}}
  @media(max-width:700px){flex-wrap:wrap;gap:10px;}
`;
const FlowLegend = styled.div`
  display:flex;align-items:center;gap:8px;font-size:9px;color:var(--board-muted);
  span{transition:color .25s ease;}span[data-active='true']{color:var(--overview-accent);}i{width:15px;height:1px;background:var(--board-line);}
`;
const NetworkGrid = styled.div`
  position:relative;isolation:isolate;display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,.94fr) minmax(0,1fr);grid-template-rows:repeat(5,auto);gap:7px 22px;
  @media(max-width:1250px){grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:auto;gap:12px;}
  @media(max-width:560px){grid-template-columns:minmax(0,1fr);}
`;
const HubSlot = styled.div`
  position:relative;z-index:1;grid-column:2;grid-row:1 / 6;min-width:0;display:flex;align-items:center;justify-content:center;
  >section{width:100%;}
  @media(max-width:1250px){grid-column:1 / -1;grid-row:auto;>section{max-width:440px;}}
`;
const Connections = styled.svg`
  position:absolute;z-index:0;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;
  path{fill:none;vector-effect:non-scaling-stroke;}
  .connection-track{stroke:currentColor;stroke-width:1;opacity:.15;transition:opacity .4s;}
  .connection-light{stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-dasharray:5 95;opacity:0;animation:${transmit} 2.8s linear infinite;}
  .connection-port{fill:var(--board-bg);stroke:currentColor;stroke-width:1;opacity:.5;transition:opacity .3s;}
  g[data-active='true'] .connection-track{opacity:.55;}
  g[data-active='true'] .connection-light{opacity:1;}
  g[data-active='true'] .connection-port{fill:currentColor;opacity:1;}
  g[data-inbound='true'] .connection-light{animation-direction:reverse;}
  @media(max-width:1250px){display:none;}
`;
const Department = styled.article<{ $accent:string; $side:'left'|'right'; $row:number }>`
  --department-accent:${p=>p.$accent};position:relative;z-index:1;grid-column:${p=>p.$side==='left'?1:3};grid-row:${p=>p.$row};min-width:0;border:1px solid var(--board-line);border-radius:9px;background:var(--board-surface);animation:${arrive} .45s ease-out both;transition:border-color .4s,box-shadow .4s;
  &[data-active='true']{border-color:color-mix(in srgb,var(--department-accent) 65%,transparent);box-shadow:0 0 18px color-mix(in srgb,var(--department-accent) 7%,transparent);}
  @media(max-width:1250px){grid-column:auto;grid-row:auto;}
`;
const DepartmentHead = styled.button`
  display:flex;align-items:center;gap:8px;padding:3px 9px;width:100%;border:0;border-bottom:1px solid #ffffff0c;border-radius:8px 8px 0 0;background:transparent;color:var(--board-ink);text-align:left;
  >div{min-width:0;display:flex;align-items:baseline;flex-wrap:wrap;gap:3px 7px;line-height:1.25;}h2{font-size:12px;font-weight:650;margin:0;white-space:nowrap;}div>span{font-size:9px;color:var(--department-accent);}i{font-style:normal;color:var(--board-muted);}
  [data-portrait]{width:24px;height:24px;flex-shrink:0;border-radius:7px;box-shadow:none;}&:hover{background:#ffffff07;}
  @media(max-width:700px){padding:10px;h2{font-size:14px;}div>span{font-size:10px;}[data-portrait]{width:34px;height:34px;}}
`;
const DepartmentState = styled.span`
  display:flex;align-items:center;gap:6px;margin-left:auto;font-size:9px;color:var(--board-muted);font-variant-numeric:tabular-nums;
  i{width:4px;height:4px;border-radius:50%;background:var(--department-accent);opacity:.35;}
  [data-active='true'] & i{animation:${breathe} 2s ease-in-out infinite;}
  [data-motion-running='false'] & i{animation-play-state:paused !important;}
`;
const TeamRoster = styled.ul`
  display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0 5px;list-style:none;margin:0;padding:3px 8px;
  li{min-width:0;}button{display:block;width:100%;min-height:18px;padding:1px 0;border:0;border-radius:3px;color:#bbc7c0;background:transparent;text-align:left;font-size:10px;line-height:1.5;white-space:nowrap;}
  button:hover{color:var(--board-ink);background:#ffffff0b;}
  @media(min-width:1500px){button{font-size:11px;}}
  @media(max-width:1250px){button{font-size:11px;min-height:27px;}}
  @media(max-width:700px){grid-template-columns:repeat(2,minmax(0,1fr));gap:2px 8px;padding:6px 10px;button{min-height:44px;font-size:12px;}}
`;
const Support = styled.section`min-width:0;`;
const SupportHeading = styled.div`
  display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:7px;
  h2{display:flex;align-items:center;gap:7px;margin:0;font-size:12px;font-weight:600;}svg{color:var(--overview-accent);}span{font-size:9px;color:var(--board-muted);}
  @media(max-width:700px){span{display:none;}}
`;
const SupportUnits = styled.div`
  display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px;
  button{display:flex;align-items:center;gap:7px;padding:7px;min-width:0;border:1px solid var(--board-line);border-radius:7px;background:var(--board-surface);color:var(--board-ink);text-align:left;transition:border-color .2s,transform .2s;}
  button>div{min-width:0;line-height:1.3;}strong{display:block;font-size:10px;font-weight:550;white-space:nowrap;}button span:not([data-portrait]){display:block;font-size:9px;color:var(--board-muted);margin-top:3px;}button>svg{margin-left:auto;flex-shrink:0;color:var(--board-muted);}
  [data-portrait]{flex-shrink:0;box-shadow:none;border-radius:7px;}button:hover{border-color:#c0ef8360;transform:translateY(-2px);}
  @media(max-width:1250px){grid-template-columns:repeat(3,minmax(0,1fr));}
  @media(max-width:850px){grid-template-columns:repeat(2,minmax(0,1fr));}
  @media(max-width:560px){grid-template-columns:1fr;button{min-height:55px;padding:10px;}strong{font-size:12px;}}
`;
