import { useId, type ReactNode } from 'react';
import { SignalPath, SignalPing } from './ProductMotionEffects';

const C = {
  paper: '#f3f7ff',
  navy: '#0a1830',
  deep: '#07101f',
  line: '#385572',
  muted: '#adbed4',
  blue: '#93c5fd',
  mint: '#5eead4',
} as const;

function Reveal({ delay = 0, children }: { delay?: number; children: ReactNode }) {
  return <g className="assemble" style={{ animationDelay: `${delay}s` }}>{children}</g>;
}

/** The mascot belongs to the product screen, so it scales and moves with the device. */
function DesktopWorkmate() {
  return (
    <g data-device-character="desktop" pointerEvents="none">
      <rect x="702" y="155" width="227" height="265" rx="12" fill="#e2eee5" stroke="#cadfcf" />
      <path d="M703 344q67-36 112-8t113-13v84a12 12 0 0 1-12 12H715a12 12 0 0 1-12-12Z" fill="#d0e3d6" />
      <text x="720" y="179" fontSize="10" letterSpacing="1.4" fill="#507161">그뚠웹 · 업무 도우미</text>
      <text x="720" y="204" fontSize="19" fontWeight="700" fill="#234c3d">그뚠이와 함께.</text>
      <ellipse cx="816" cy="384" rx="64" ry="7" fill="#749981" opacity=".18" />
      <image data-mascot-pose="work" href="/images/corp/products/global/ddunddun-work.png" x="721" y="211" width="190" height="178" preserveAspectRatio="xMidYMid meet" />
      <rect x="735" y="391" width="162" height="20" rx="10" fill="#f4faf4" />
      <circle cx="750" cy="401" r="3" fill="#43826a" />
      <text x="760" y="405" fontSize="10" fill="#355e4b">오늘의 업무도 차근차근</text>
    </g>
  );
}

function MobileWorkmate() {
  return (
    <g data-device-character="mobile" pointerEvents="none">
      <rect x="22" y="211" width="316" height="198" rx="19" fill="#dcebdc" />
      <path d="M22 349q77-27 144 10t172-8v39a19 19 0 0 1-19 19H41a19 19 0 0 1-19-19Z" fill="#c5dfcc" />
      <text x="42" y="239" fontSize="10" letterSpacing="1.3" fill="#527761">그뚠앱 · 오늘도 함께</text>
      <text x="42" y="274" fontSize="25" fontWeight="700" fill="#244d3b">오늘도</text>
      <text x="42" y="306" fontSize="25" fontWeight="700" fill="#244d3b">가볍게.</text>
      <text x="43" y="333" fontSize="11" fill="#527761">그뚠이와 함께하는 하루</text>
      <ellipse cx="253" cy="391" rx="60" ry="6" fill="#6b9479" opacity=".2" />
      <image data-mascot-pose="success" href="/images/corp/products/global/ddunddun-success.png" x="162" y="223" width="174" height="174" preserveAspectRatio="xMidYMid meet" />
      <rect x="42" y="367" width="112" height="26" rx="13" fill="#2c5b45" />
      <text x="58" y="384" fontSize="10" fill="#f3faf1">오늘의 일정 보기 →</text>
    </g>
  );
}

/** Each device uses its own illustrated product screen, without cropping its content. */
function Desktop({ x, y, width, active = false }: { x: number; y: number; width: number; active?: boolean }) {
  const clip = useId();
  const height = width * .625;
  return (
    <g transform={`translate(${x} ${y})`} data-device="desktop">
      <defs><clipPath id={clip}><rect width={width} height={height} rx="4" /></clipPath></defs>
      <rect x="-8" y="-25" width={width + 16} height={height + 34} rx="12" fill={C.deep} stroke={active ? C.blue : C.line} strokeWidth={active ? 1.8 : 1} />
      <g fill={C.muted} opacity=".65">
        {[5, 15, 25].map(cx => <circle key={cx} cx={cx} cy="-13" r="2.3" />)}
      </g>
      <rect x={width * .25} y="-19" width={width * .5} height="12" rx="4" fill="#18304c" />
      <path d={`M${width * .25 + 8} -13h${width * .3}`} stroke={C.muted} strokeWidth="1.4" opacity=".5" />
      <image data-screen-kind="desktop" href="/images/corp/products/global/desktop-workspace.svg" width={width} height={height} clipPath={`url(#${clip})`} preserveAspectRatio="xMidYMid meet" />
      <g clipPath={`url(#${clip})`}><svg width={width} height={height} viewBox="0 0 960 600" aria-hidden="true"><DesktopWorkmate /></svg></g>
      <path d={`M-8 ${height + 9}h${width + 16}l17 11H-25Z`} fill="#294560" stroke="#527393" />
      <path d={`M${width * .36} ${height + 10}h${width * .28}l-5 4H${width * .36 + 5}Z`} fill={C.muted} opacity=".65" />
    </g>
  );
}

function Phone({ x, y, width, active = false }: { x: number; y: number; width: number; active?: boolean }) {
  const clip = useId();
  const height = width * 2;
  return (
    <g transform={`translate(${x} ${y})`} data-device="mobile">
      <defs><clipPath id={clip}><rect width={width} height={height} rx={width * .13} /></clipPath></defs>
      <rect x="-6" y="-6" width={width + 12} height={height + 12} rx={width * .17} fill={C.deep} stroke={active ? C.mint : C.line} strokeWidth={active ? 2 : 1.3} />
      <image data-screen-kind="mobile" href="/images/corp/products/global/mobile-workspace.svg" width={width} height={height} clipPath={`url(#${clip})`} preserveAspectRatio="xMidYMid meet" />
      <g clipPath={`url(#${clip})`}><svg width={width} height={height} viewBox="0 0 360 720" aria-hidden="true"><MobileWorkmate /></svg></g>
      <rect x={width * .35} y="4" width={width * .3} height="5" rx="2.5" fill={C.deep} />
      <path d={`M${width * .35} ${height - 6}h${width * .3}`} stroke={C.navy} strokeWidth="2.5" strokeLinecap="round" />
    </g>
  );
}

function Route({ d, delay = 0, color = C.mint }: { d: string; delay?: number; color?: string }) {
  return (
    <g fill="none">
      <path d={d} stroke={color} strokeWidth="1.5" opacity=".25" />
      <path className="trace" pathLength="1" d={d} stroke={color} strokeWidth="1.5" style={{ animationDelay: `${delay}s` }} />
      <SignalPath d={d} color={color} delay={delay + .8} duration={4.8} />
    </g>
  );
}

function WorldMap({ opacity = 1 }: { opacity?: number }) {
  return (
    <g data-global-map="true" opacity={opacity}>
      <g fill="none" stroke={C.line} strokeWidth=".7" opacity=".55">
        {[95, 150, 205, 260].map(y => <path key={y} d={`M177 ${y}h426`} />)}
        {[220, 300, 380, 460, 540].map(x => <path key={x} d={`M${x} 62v230`} />)}
      </g>
      <g fill="#1b3c54" stroke="#52788c" strokeWidth=".8" strokeLinejoin="round">
        <path d="m184 106 25-24 40-8 18 9 25-8 17 17-9 22-27 4-13 15-6 26-16 2-10-22-22-10-5-15Z" />
        <path d="m267 160 23 4 11 22 17 14-7 23-14 16-7 31-13 8-7-24 5-23-11-23-8-23Z" />
        <path d="m307 66 25-10 13 11-14 26-16 2Z" />
        <path d="m367 111 13-14 14 3 5 14 18 5-11 12-20-3-8 11-15-9Z" />
        <path d="m371 143 29-8 26 20 7 23-13 21-13 34-17 8-13-28-13-22-7-25Z" />
        <path d="m411 100 18-21 32-6 26 10 18-9 26 15 30-4 34 24-4 18-24 2-10 18-23 10-14 26-18-8-6-29-21-13-17 8-18-19-19-2Z" />
        <path d="m488 181 15 4 15 19 20 7-4 9-25-11-13-14Z" />
        <path d="m532 231 25-10 29 14 7 22-23 13-29-9-15-14Z" />
        <path d="m568 154 5-17 5 6-4 18-6 4Z" />
        <path d="m429 216 4 13-4 13-4-12Z" />
      </g>
    </g>
  );
}

function City({ x, y, name, above = false, delay = 0 }: { x: number; y: number; name: string; above?: boolean; delay?: number }) {
  return (
    <g data-global-city={name}>
      <SignalPing x={x} y={y} radius={7} delay={delay} duration={4.8} />
      <circle cx={x} cy={y} r="5" fill={C.mint} stroke={C.navy} strokeWidth="2" />
      <text x={x} y={y + (above ? -14 : 23)} textAnchor="middle" fill={C.paper} fontSize="14" stroke={C.navy} strokeWidth="4" paintOrder="stroke">{name}</text>
    </g>
  );
}

function Locale({ x, y, code, label, active = false, width = 120 }: { x: number; y: number; code: string; label: string; active?: boolean; width?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={width} height="31" rx="15.5" fill={active ? '#173d43' : '#102640'} stroke={active ? '#458c85' : C.line} />
      <text x="15" y="21" fontSize="14" fill={active ? C.mint : C.blue}>{code}</text>
      <text x="45" y="21" fontSize="13" fill={C.paper}>{label}</text>
    </g>
  );
}

/** A connected product story with enlarged, distinct desktop and mobile artwork. */
export function GlobalWebScene({ variant = 0 }: { variant?: number } = {}) {
  const mobile = variant === 1;
  const global = variant === 2;
  return (
    <g data-motion-scene="global-web" data-web-mode={global ? 'global' : mobile ? 'mobile' : 'pc'}>
      <path d="M30 430h700" stroke={C.line} opacity=".5" />
      <text x="30" y="25" fontSize="13" letterSpacing="1.7" fill={C.muted}>{global ? '어디서든 하나로 이어지는 업무.' : mobile ? '그뚠앱으로, 이동 중에도 가볍게.' : '그뚠웹으로, 한눈에 정리하는 하루.'}</text>
      <g transform="translate(643 12)">
        <circle cx="0" cy="7" r="3" fill={C.mint} />
        <text x="11" y="12" fontSize="12" fill={C.muted}>그뚠웹 · 그뚠앱</text>
      </g>

      {global ? <>
        <g transform="translate(-40 24) scale(1.1)">
          <Reveal><WorldMap /></Reveal>
          <Reveal delay={.2}>
            <Route d="M275 132Q322 53 387 111" delay={.4} color={C.blue} />
            <Route d="M387 111Q445 46 531 142" delay={.75} />
            <Route d="M531 142Q563 102 568 164" delay={1.1} color={C.blue} />
            <Route d="M275 132Q407 304 568 164" delay={1.5} />
            <City x={275} y={132} name="뉴욕" delay={.4} />
            <City x={387} y={111} name="런던" above delay={1.5} />
            <City x={531} y={142} name="서울" above delay={2.5} />
            <City x={568} y={164} name="도쿄" delay={3.5} />
          </Reveal>
        </g>
        <Reveal delay={.3}><Desktop x={49} y={250} width={220} /></Reveal>
        <Reveal delay={.5}><Phone x={631} y={181} width={108} /></Reveal>
        <Route d="M277 310Q300 240 262.5 169.2" delay={1.8} color={C.blue} />
        <Route d="M584.8 204.4Q610 222 625 242" delay={2.1} />
        <Reveal delay={.8}>
          <Locale x={286} y={352} code="KO" label="한국어" width={104} active />
          <Locale x={398} y={352} code="EN" label="English" width={104} />
          <Locale x={510} y={352} code="JA" label="日本語" width={104} />
        </Reveal>
      </> : mobile ? <>
        <g transform="translate(-40 35) scale(1.15)"><WorldMap opacity={.35} /></g>
        <Route d="M261 232Q277 232 287 206" delay={.4} color={C.blue} />
        <Route d="M473 204Q490 204 503 167" delay={1} />
        <Route d="M473 290Q489 290 503 292" delay={1.8} />
        <Reveal delay={.3}><Desktop x={43} y={184} width={210} /></Reveal>
        <Reveal delay={.15}><Phone x={293} y={52} width={174} active /></Reveal>
        <Reveal delay={.55}>
          <text x="43" y="120" fontSize="18" fill={C.paper}>그뚠웹의 업무를,</text>
          <text x="43" y="146" fontSize="15" fill={C.muted}>그뚠앱으로 이어서.</text>
          <g transform="translate(503 125)">
            <rect width="221" height="86" rx="13" fill="#112a40" stroke={C.line} />
            <circle cx="26" cy="26" r="5" fill={C.mint} />
            <text x="42" y="32" fontSize="18" fill={C.paper}>서울 → 도쿄</text>
            <text x="21" y="63" fontSize="15" fill={C.muted}>현장의 일정 · 메시지 · 작업</text>
          </g>
          <g transform="translate(503 258)">
            <rect width="221" height="78" rx="13" fill="#112a40" stroke={C.line} />
            <path d="m20 30 7 7 13-16" fill="none" stroke={C.mint} strokeWidth="2.5" strokeLinecap="round" />
            <text x="53" y="30" fontSize="17" fill={C.paper}>한 번의 터치로 연결</text>
            <text x="53" y="57" fontSize="14" fill={C.muted}>같은 프로젝트, 새로운 화면</text>
          </g>
          <text x="148" y="365" fontSize="14" fill={C.blue} textAnchor="middle">그뚠웹</text>
          <text x="613" y="374" fontSize="15" fill={C.mint} textAnchor="middle">한국어 · 영어 · 일본어</text>
        </Reveal>
        <SignalPing x={529} y={151} radius={8} delay={1.4} />
      </> : <>
        <g transform="translate(-40 30) scale(1.15)"><WorldMap opacity={.3} /></g>
        <Reveal delay={.1}><Desktop x={30} y={78} width={500} active /></Reveal>
        <Route d="M538 218Q560 218 560 180H584" delay={.8} />
        <Route d="M584 302H564Q554 302 554 277H538" delay={2} color={C.blue} />
        <Reveal delay={.4}>
          <g className="float"><Phone x={590} y={110} width={130} /></g>
        </Reveal>
        <Reveal delay={.6}>
          <text x="655" y="80" fontSize="16" textAnchor="middle" fill={C.paper}>그뚠앱</text>
          <text x="655" y="399" fontSize="15" textAnchor="middle" fill={C.mint}>서울 · 런던</text>
          <text x="655" y="419" fontSize="14" textAnchor="middle" fill={C.muted}>뉴욕</text>
        </Reveal>
        <SignalPing x={560} y={218} radius={8} delay={1.5} />
      </>}
    </g>
  );
}
