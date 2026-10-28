import { useId, type ReactNode } from 'react';
import { ReactionBurst, SignalPath, SignalPing } from './ProductMotionEffects';

const C = {
  cream: '#f3f7ff',
  pine: '#0a1830',
  deep: '#07101f',
  lime: '#93c5fd',
  teal: '#5eead4',
  coral: '#f5c766',
  muted: '#577390',
} as const;

function Reveal({ delay = 0, children }: { delay?: number; children: ReactNode }) {
  return <g className="assemble" style={{ animationDelay: `${delay}s` }}>{children}</g>;
}

function Tick({ x, y, size = 16, color = C.pine }: { x: number; y: number; size?: number; color?: string }) {
  return <path d={`M${x} ${y + size * .5}l${size * .35} ${size * .35} ${size * .65} ${-size * .75}`} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />;
}

function SmallGlobe({ x, y, r = 13 }: { x: number; y: number; r?: number }) {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx={x} cy={y} r={r} />
      <ellipse cx={x} cy={y} rx={r * .45} ry={r} />
      <path d={`M${x - r} ${y}h${r * 2}`} />
    </g>
  );
}

/** A shared internet service, seen on a computer and a phone across continents. */
export function GlobalWebScene({ variant = 0 }: { variant?: number } = {}) {
  const globeClip = useId();
  const mobile = variant === 1;
  const global = variant === 2;

  return (
    <g data-motion-scene="global-web" data-web-mode={global ? 'global' : mobile ? 'mobile' : 'desktop'}>
      <defs>
        <clipPath id={globeClip}><circle cx="498" cy="177" r="153" /></clipPath>
      </defs>

      <Reveal>
        <circle cx="498" cy="177" r="168" fill="none" stroke={C.muted} strokeDasharray="2 9" opacity=".45" />
        <circle cx="498" cy="177" r="153" fill={C.pine} stroke={global ? C.lime : C.muted} strokeWidth={global ? 2.5 : 1} />
        <g clipPath={`url(#${globeClip})`}>
          <g fill="none" stroke={C.muted} opacity=".3">
            <ellipse cx="498" cy="177" rx="92" ry="153" />
            <ellipse cx="498" cy="177" rx="33" ry="153" />
            <ellipse cx="498" cy="177" rx="153" ry="61" />
            <path d="M345 177h306M365 101h266M365 253h266" />
          </g>
          <g fill={C.muted} stroke={C.teal} strokeOpacity=".32" strokeWidth=".8">
            <path d="m352 103 25-21 21-5 15-12 24 3 14 13-10 15-17 2 2 18-15 11-4 20-13 10-7-17-15-4-4-17-16-3Z" />
            <path d="m413 154 16 8 7 17 18 12 2 20-12 19-3 24-13 20-9-11 1-23-8-17-7-22 7-19-6-15Z" />
            <path d="m444 56 19-12 14 8-8 21-17 7-9-9Z" />
            <path d="m478 105 7-14 14-5 9 7-3 11 13 9-10 10-16-2-2 13-14-4-7-12Z" />
            <path d="m483 138 21-9 25 15 5 24-13 22-6 30-17 16-10-24-15-19-7-29Z" />
            <path d="m509 94 10-22 23-10 18 9 16-10 27 8 11 19 23 6 20 24-8 21-19-6-13 17-18 2-8 26-16-8-8-23-14-8-17 5-9-20-19-8Z" />
            <path d="m559 174 13 7 7 18 13 10-5 8-16-9-10-15Z" />
            <path d="m594 224 22-8 21 12 5 22-25 10-23-7-10-14Z" />
            <path d="m629 164 5-18 5 4-4 20-5 6Z" />
          </g>
          <g fill="none" strokeLinecap="round">
            <path d="M407 132Q449 44 491 119Q547 48 592 139" stroke={C.teal} opacity=".25" strokeWidth="2" />
            <path className="trace" pathLength="1" d="M407 132Q449 44 491 119Q547 48 592 139" stroke={C.lime} strokeWidth="2" style={{ animationDelay: '.5s' }} />
            <path d="M407 132Q493 241 592 139" stroke={C.teal} strokeWidth="1" opacity=".3" />
            <SignalPath d="M407 132Q449 44 491 119Q547 48 592 139" color={C.lime} delay={.8} duration={3.6} />
            <SignalPath d="M407 132Q493 241 592 139" color={C.teal} delay={2.2} duration={3.6} reverse />
            {global && <>
              <path className="trace" pathLength="1" d="M491 119Q556 187 615 238Q575 278 407 132" stroke={C.teal} strokeWidth="2" style={{ animationDelay: '.8s' }} />
              <SignalPath d="M491 119Q556 187 615 238" color={C.coral} delay={1.1} duration={3.3} />
              <SignalPath d="M615 238Q575 278 407 132" color={C.lime} delay={2.2} duration={3.3} />
              <SignalPing x={615} y={238} color={C.coral} radius={17} delay={1.5} duration={3.6} />
            </>}
          </g>
        </g>
        {[[407, 132], [491, 119], [592, 139]].map(([x, y], index) => (
          <g key={x}>
            <SignalPing x={x} y={y} color={C.lime} delay={.8 + index * 1.2} duration={3.6} radius={19} />
            <circle cx={x} cy={y} r="4" fill={C.lime} />
          </g>
        ))}
      </Reveal>

      <Reveal delay={.4}>
        <text x="63" y="77" fill={C.cream} fontSize="22" fontWeight="700">{global ? '세계가 만나는 웹.' : mobile ? '손안에서 이어지는 웹.' : '넓은 화면, 하나의 업무.'}</text>
        <text x="63" y="105" fill={C.teal} fontSize="16">{global ? 'SEOUL → WORLD' : mobile ? 'TOUCH · CONNECT · CONTINUE' : 'DESKTOP · BROWSER · WORK'}</text>
        <path d="M63 126h163" stroke={C.muted} />
        <text x="371" y="91" fill={C.cream} fontSize="16">NEW YORK</text>
        <text x="474" y="56" fill={C.cream} fontSize="16">PARIS</text>
        <text x="614" y="145" fill={C.lime} fontSize="16">SEOUL</text>
      </Reveal>

      <Reveal delay={1.2}>
        <path d="M88 193h415q15 0 15 15v222H73V208q0-15 15-15Z" fill={C.deep} />
        <path d="M79 184h415q15 0 15 15v231H64V199q0-15 15-15Z" fill={C.pine} stroke={variant === 0 ? C.lime : C.muted} strokeWidth={variant === 0 ? 3 : 2} />
        <rect x="74" y="195" width="425" height="224" rx="5" fill={C.cream} />
        <path d="M79 195h415q5 0 5 5v33H74v-33q0-5 5-5Z" fill="#e2e7dc" />
        {[90, 103, 116].map((x, i) => <circle key={x} cx={x} cy="214" r="3.5" fill={i === 0 ? C.coral : C.muted} />)}
        <rect x="143" y="202" width="257" height="23" rx="5" fill={C.cream} />
        <path d="M154 212v-3a3 3 0 0 1 6 0v3m-7 0h8v7h-8Z" stroke={C.muted} fill="none" />
        <text x="171" y="219" fontSize="16" fill={C.muted}>{global ? 'propig / global' : mobile ? 'propig / connected' : 'propig / workspace'}</text>
        <path d="M452 207h11m-11 6h11m-11 6h11" stroke={C.muted} strokeWidth="1.5" />
        <text x="94" y="260" fill={C.pine} fontSize="17" fontWeight="800">PROPIG</text>
        <text x="353" y="260" fill={C.muted} fontSize="16">{global ? 'KO / EN / JA' : '내 업무 공간'}</text>
        <path d="M94 273h383" stroke={C.muted} opacity=".2" />
        <text x="95" y="305" fill={C.pine} fontSize="25" fontWeight="750">{global ? 'Hello, world.' : mobile ? '하던 일을, 어디서나.' : '나의 일을 한 화면에서.'}</text>
        <text x="96" y="331" fill={C.muted} fontSize="16">{global ? '안녕하세요 · Hello · こんにちは' : mobile ? '컴퓨터와 휴대폰, 같은 서비스.' : '고객 · 프로젝트 · 서비스 연결'}</text>
        <rect x="96" y="351" width="117" height="39" rx="6" fill={C.pine} />
        <text x="154" y="376" textAnchor="middle" fill={C.cream} fontSize="16">{global ? '언어 선택' : mobile ? '기기 연결' : '업무 시작'}</text>
        <path d="M231 371h49m-9-6 9 6-9 6" fill="none" stroke={C.muted} strokeWidth="1.5" />
        <g transform="translate(387 358)" color={C.pine}>
          {global ? <>
            <circle r="37" fill={C.lime} />
            <SmallGlobe x={0} y={0} r={22} />
            <circle cx="23" cy="-21" r="7" fill={C.teal} stroke={C.cream} strokeWidth="3" />
          </> : mobile ? <>
            <rect x="-43" y="-31" width="56" height="41" rx="4" fill={C.lime} stroke={C.pine} />
            <path d="M-15 10v10m-16 0H1" fill="none" stroke={C.pine} strokeWidth="2" />
            <rect x="14" y="-13" width="31" height="54" rx="7" fill={C.pine} />
            <rect x="18" y="-7" width="23" height="36" rx="3" fill={C.teal} />
            <path d="M25 35h8" stroke={C.cream} strokeWidth="2" strokeLinecap="round" />
            <SignalPath d="M-9-12h16v15h21" color={C.pine} delay={1} duration={2.8} />
          </> : <>
            <rect x="-44" y="-28" width="105" height="68" rx="5" fill="#e0e6d9" />
            {[0, 1, 2].map((index) => <g key={index} transform={`translate(-33 ${-14 + index * 20})`}>
              <rect y="-5" width="12" height="12" rx="3" fill={index === 2 ? C.lime : C.teal} />
              <Tick x={2} y={-4} size={8} />
              <path d={`M23 1h${index === 1 ? 34 : 48}`} stroke={C.pine} strokeWidth="3" strokeLinecap="round" opacity=".7" />
            </g>)}
          </>}
        </g>
        <path d="M64 430h445l39 24q5 5-10 7H34q-10-2-4-7Z" fill="#c5d2bf" stroke={C.muted} />
        <path d="M228 430h117l11 10H217Z" fill={C.muted} opacity=".45" />
        <path d="M36 454h502" stroke={C.cream} opacity=".8" />
        <g className="cursor">
          <path d="m253 346 5 24 6-8 10-1Z" fill={C.coral} stroke={C.pine} strokeWidth="1.5" strokeLinejoin="round" />
        </g>
      </Reveal>

      <Reveal delay={2.6}>
        <path d="M509 338h26v-39h15" stroke={C.teal} strokeWidth="1.5" fill="none" opacity=".45" />
        <g className="float">
          <rect x="558" y="222" width="151" height="267" rx="25" fill={C.deep} />
          <rect x="550" y="214" width="151" height="267" rx="25" fill={C.pine} stroke={mobile ? C.lime : C.muted} strokeWidth={mobile ? 3.5 : 2} />
          <rect x="558" y="222" width="135" height="251" rx="18" fill={C.cream} />
          <rect x="601" y="228" width="48" height="9" rx="4.5" fill={C.pine} />
          <text x="572" y="262" fill={C.pine} fontSize="16" fontWeight="800">PROPIG</text>
          <path d="M669 251h12m-12 5h12m-12 5h12" stroke={C.muted} strokeWidth="1.4" />
          <path d="M570 275h111" stroke={C.muted} opacity=".25" />
          <text x="572" y="301" fill={C.pine} fontSize="20" fontWeight="700">{global ? 'Hello,' : mobile ? '필요한 순간,' : '같은 업무,'}</text>
          <text x="572" y="326" fill={C.pine} fontSize="20" fontWeight="700">{global ? 'world.' : mobile ? '손안의 웹.' : '다른 화면.'}</text>
          <rect x="572" y="341" width="108" height="65" rx="8" fill={C.lime} />
          <g color={C.pine}><SmallGlobe x={626} y={373} r={22} /></g>
          <rect x="572" y="417" width="108" height="32" rx="5" fill={C.pine} />
          <text x="626" y="439" fill={C.cream} fontSize="16" textAnchor="middle">{global ? 'Get started' : mobile ? '터치로 시작' : '이어서 보기'}</text>
          <path d="M605 461h42" stroke={C.pine} strokeWidth="3" strokeLinecap="round" />
        </g>
      </Reveal>

      <g fill="none" stroke={C.teal} strokeWidth="1.5" opacity=".35">
        <path d="M459 184Q450 154 491 119" />
        <path d="M625 214Q641 177 592 139" />
      </g>
      <SignalPath d="M459 184Q450 154 491 119" color={C.lime} delay={1.6} duration={3.6} />
      <SignalPath d="M459 184Q450 154 491 119" color={C.teal} delay={3.1} duration={3.6} reverse />
      <SignalPath d="M625 214Q641 177 592 139" color={C.teal} delay={2.9} duration={3.6} />
      <SignalPath d="M625 214Q641 177 592 139" color={C.lime} delay={4.4} duration={3.6} reverse />
      <SignalPath d="M509 338h26v-39h15" color={C.lime} delay={3.4} duration={3.6} />
      <SignalPath d="M509 338h26v-39h15" color={C.teal} delay={5.1} duration={3.6} reverse />
      <SignalPing x={154} y={371} color={C.lime} delay={2} duration={3.6} radius={25} />
      <SignalPing x={626} y={433} color={C.lime} delay={3.7} duration={3.6} radius={23} />
      <ReactionBurst x={216} y={354} color={C.teal} delay={2.4} duration={3.6} />
      <ReactionBurst x={679} y={414} color={C.lime} delay={4.1} duration={3.6} />
      {(global ? ['언어를 선택하고', '지역을 넘어 응답하고', '세계의 고객과 연결되다'] : mobile ? ['화면을 터치하면', '기기 사이에 응답을 나누고', '이동 중에도 업무를 이어가다'] : ['웹에서 요청을 보내고', '서비스에서 응답하고', '업무를 한 화면에 연결하다']).map((label, index) => (
        <g key={label} className="motion-only motion-window" style={{ animationDelay: `${2.8 + index * 3}s`, animationDuration: '2.8s' }}>
          <rect x="277" y="146" width="238" height="35" rx="17.5" fill={index === 1 ? C.teal : C.lime} />
          <Tick x={292} y={155} size={16} />
          <text x="318" y="169" fill={C.pine} fontSize="16" fontWeight="650">{label}</text>
        </g>
      ))}
      <Reveal delay={5.7}>
        <text x="64" y="494" fill={C.teal} fontSize="16">안녕하세요 · Hello · Bonjour</text>
      </Reveal>
    </g>
  );
}

type DocumentKind = 'plan' | 'payroll' | 'labor' | 'quote' | 'statement' | 'tax'
  | 'contract' | 'purchase' | 'request' | 'expense' | 'receipt' | 'inventory'
  | 'report' | 'travel' | 'leave' | 'certificate' | 'delivery' | 'settlement';

type DocumentSpec = { title: string; kind: DocumentKind; color: string };

const DOCUMENT_BATCHES: { label: string; detail: string; documents: DocumentSpec[] }[] = [
  {
    label: '사업 · 급여 · 거래', detail: '기본 서류 01 — 06',
    documents: [
      { title: '사업계획서', kind: 'plan', color: C.lime },
      { title: '월급명세서', kind: 'payroll', color: C.teal },
      { title: '노임명세서', kind: 'labor', color: C.cream },
      { title: '견적서', kind: 'quote', color: C.cream },
      { title: '거래명세서', kind: 'statement', color: C.teal },
      { title: '세금계산서', kind: 'tax', color: C.coral },
    ],
  },
  {
    label: '계약 · 구매 · 정산', detail: '운영 서류 07 — 12',
    documents: [
      { title: '근로계약서', kind: 'contract', color: C.teal },
      { title: '발주서', kind: 'purchase', color: C.lime },
      { title: '구매요청서', kind: 'request', color: C.cream },
      { title: '지출결의서', kind: 'expense', color: C.coral },
      { title: '입금확인서', kind: 'receipt', color: C.teal },
      { title: '재고명세서', kind: 'inventory', color: C.lime },
    ],
  },
  {
    label: '보고 · 인사 · 납품', detail: '업무 서류 13 — 18',
    documents: [
      { title: '업무보고서', kind: 'report', color: C.lime },
      { title: '출장신청서', kind: 'travel', color: C.cream },
      { title: '휴가신청서', kind: 'leave', color: C.teal },
      { title: '재직증명서', kind: 'certificate', color: C.teal },
      { title: '납품확인서', kind: 'delivery', color: C.coral },
      { title: '정산보고서', kind: 'settlement', color: C.lime },
    ],
  },
];

function DocumentWrite({ delay, children }: { delay: number; children: ReactNode }) {
  return <g className="document-write" style={{ animationDelay: `${delay}s` }}>{children}</g>;
}

const WORK_ACTIONS = [
  { id: 'invoice-request', label: '발행', path: 'M5 3h10l4 4v14H5ZM14 3v5h5M8 12h8m-8 4h6' },
  { id: 'payroll-request', label: '급여', path: 'm3 8 9-5 9 5ZM6 11v7m6-7v7m6-7v7M3 21h18' },
  { id: 'send-notification', label: '알림', path: 'M4 4h16v12H10l-5 4v-4H4ZM8 8h8m-8 4h5' },
  { id: 'payment-sync', label: '결제', path: 'M3 5h18v14H3ZM3 10h18m-14 5h4' },
  { id: 'browser-query', label: '탐색', path: 'M3 3h18v17H3ZM3 8h18m-13 4 3 6 2-3 3-1Z' },
  { id: 'agent-execute', label: '봇 실행', path: 'M5 7h14v13H5ZM12 3v4M8 12h1m6 0h1m-8 4h8M2 11v5m20-5v5' },
] as const;

function WorkExecutionConsole() {
  const phases = [
    { id: 'validate-records', title: '조건 확인', detail: '자료를 자동 분류', path: 'M1 4h21M1 12h15M1 20h11M18 16l3 3 6-7', color: C.lime },
    { id: 'request-approval', title: '검토 요청', detail: '담당자 확인', path: 'M3 3h20v22H3ZM8 13l4 4 7-8', color: C.coral },
    { id: 'dispatch-work', title: '작업 전달', detail: '실행 결과 연결', path: 'M1 6h21m-6-5 6 5-6 5M25 21H4m6-5-6 5 6 5', color: C.teal },
  ] as const;

  return <>
    <Reveal delay={.3}>
      <g data-work-action="receive-input">
        <rect x="36" y="89" width="144" height="125" rx="10" fill={C.pine} stroke={C.muted} />
        <circle cx="55" cy="113" r="4" fill={C.teal} className="pulse" />
        <text x="67" y="120" fill={C.cream} fontSize="19" fontWeight="700">자료 접수</text>
        <path d="M52 134h112" stroke={C.muted} opacity=".5" />
        <text x="52" y="159" fill={C.teal} fontSize="16">회사 · 인사</text>
        <text x="52" y="183" fill={C.teal} fontSize="16">품목 · 거래</text>
        <path d="M52 198h112" stroke={C.muted} strokeWidth="3" strokeLinecap="round" opacity=".4" />
        <g className="motion-only"><DocumentWrite delay={.6}><path d="M52 198h88" stroke={C.teal} strokeWidth="3" strokeLinecap="round" /></DocumentWrite></g>
        <g className="motion-only screen-wipe" style={{ animationDelay: '.3s' }}>
          <rect x="45" y="141" width="126" height="61" fill={C.teal} opacity=".1" />
          <path d="M45 141h126" stroke={C.teal} strokeWidth="1.5" />
        </g>
      </g>
      <path d="M108 214v26" stroke={C.muted} strokeWidth="1.5" />
      <rect x="36" y="240" width="144" height="132" rx="10" fill={C.pine} stroke={C.teal} strokeOpacity=".65" />
      <text x="52" y="269" fill={C.cream} fontSize="19" fontWeight="700">업무 자동화</text>
      <path d="M52 282h112" stroke={C.muted} opacity=".5" />
      <g fill="none" stroke={C.lime} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M54 301h21m-5-5 5 5-5 5M77 319H56m5-5-5 5 5 5" />
      </g>
      <text x="89" y="316" fill={C.lime} fontSize="18">실행 연결</text>
      <text x="52" y="346" fill={C.teal} fontSize="16">조건 · 검토 · 전달</text>
      {phases.map(({ id, title, detail, path, color }, index) => <g key={id} data-work-action={id} className="motion-secondary motion-window" style={{ animationDelay: `${index * 4}s`, animationDuration: '4s' }}>
        <rect x="44" y="289" width="128" height="72" rx="5" fill={C.pine} />
        <g transform="translate(51 296)" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></g>
        <text x="85" y="316" fill={color} fontSize="18">{title}</text>
        <text x="52" y="346" fill={C.teal} fontSize="16">{detail}</text>
        <rect x="36" y="240" width="144" height="132" rx="10" fill="none" stroke={color} strokeWidth="2" />
        <g className="motion-only cursor"><path d="m139 323 5 21 6-7 9-2Z" fill={C.coral} stroke={C.deep} strokeWidth="1.5" /></g>
      </g>)}
    </Reveal>
    <SignalPath d="M108 214v26" color={C.teal} delay={.6} duration={4} />
    <SignalPing x={108} y={304} color={C.lime} delay={.8} duration={4} radius={36} />
    <ReactionBurst x={177} y={244} color={C.teal} delay={1.3} duration={4} />
  </>;
}

function WorkActionLane() {
  return <Reveal delay={.2}>
    <path d="M36 466h668" stroke={C.muted} opacity=".5" />
    <path d="M61 492h584" stroke={C.muted} strokeDasharray="3 7" opacity=".5" />
    <SignalPath d="M61 492h584" color={C.teal} delay={1.8} duration={4} />
    {WORK_ACTIONS.map(({ id, label, path }, index) => <g key={id} data-work-action={id} transform={`translate(${36 + index * 112} 475)`}>
      <rect width="106" height="34" rx="17" fill={C.pine} stroke={C.muted} strokeOpacity=".6" />
      <g transform="translate(10 5)" fill="none" stroke={C.teal} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></g>
      <text x="39" y="24" fill={C.cream} fontSize="18">{label}</text>
      <g className="motion-secondary motion-window" style={{ animationDelay: `${8 + index * .12}s`, animationDuration: '3s' }}>
        <rect width="106" height="34" rx="17" fill="none" stroke={C.teal} strokeWidth="2" />
        <circle cx="98" cy="3" r="4" fill={C.teal} />
      </g>
    </g>)}
  </Reveal>;
}

function DocumentContents({ kind, color, delay }: { kind: DocumentKind; color: string; delay: number }) {
  if (kind === 'plan' || kind === 'report' || kind === 'settlement') {
    const caption = kind === 'plan' ? '목표 · 실행 계획' : kind === 'report' ? '업무 · 진행 현황' : '매출 · 정산 내역';
    return (
      <g>
        <text x="15" y="63" fontSize="16" fill={C.muted}>{caption}</text>
        <path d="M16 123V80m0 43h113" fill="none" stroke={C.muted} opacity=".4" />
        {[{ x: 27, y: 102, h: 21 }, { x: 55, y: 91, h: 32 }, { x: 83, y: 77, h: 46 }].map(({ x, y, h }, index) => (
          <DocumentWrite key={x} delay={delay + index * .12}>
            <rect x={x} y={kind === 'settlement' ? y + 6 : y} width="19" height={kind === 'settlement' ? h - 6 : h} rx="2" fill={index === 2 ? C.pine : C.teal} />
          </DocumentWrite>
        ))}
        <path className="trace" pathLength="1" d={kind === 'report' ? 'm28 89 23 8 23-22 21-8' : 'm28 94 35-15 32-16'} fill="none" stroke={C.pine} strokeWidth="1.5" style={{ animationDelay: `${delay + .2}s`, animationDuration: '1s' }} />
        <path d="M16 138h72" stroke={C.muted} strokeWidth="3" strokeLinecap="round" opacity=".35" />
      </g>
    );
  }

  if (kind === 'contract' || kind === 'certificate') {
    return (
      <g>
        <text x="15" y="64" fontSize="16" fill={C.muted}>{kind === 'contract' ? '근로 조건 · 약정' : '소속 · 재직 정보'}</text>
        {[81, 94, 107].map((y, index) => (
          <DocumentWrite key={y} delay={delay + index * .15}>
            <path d={`M16 ${y}h${index === 1 ? 88 : 111}`} stroke={C.muted} strokeWidth="3" strokeLinecap="round" opacity=".45" />
          </DocumentWrite>
        ))}
        <path d="M16 147h81" stroke={C.muted} opacity=".4" />
        <path className="trace" pathLength="1" d="m30 139 10-13-2 17 14-16-4 16 12-9 6 6 12-10" fill="none" stroke={C.pine} strokeWidth="1.8" strokeLinecap="round" style={{ animationDelay: `${delay + .8}s`, animationDuration: '.65s' }} />
      </g>
    );
  }

  if (kind === 'request' || kind === 'expense' || kind === 'travel' || kind === 'leave') {
    const fields = kind === 'request' ? ['요청 품목', '구매 사유'] : kind === 'expense' ? ['사용 내역', '지출 금액'] : kind === 'travel' ? ['출장 일정', '방문 목적'] : ['신청 기간', '휴가 구분'];
    return (
      <g>
        {fields.map((label, index) => (
          <g key={label} transform={`translate(15 ${54 + index * 41})`}>
            <text y="11" fontSize="15" fill={C.muted}>{label}</text>
            <path d="M0 29h119" stroke={C.muted} opacity=".25" />
            <DocumentWrite delay={delay + index * .25}>
              <path d="M1 23h77" stroke={C.pine} strokeWidth="3" strokeLinecap="round" opacity=".6" />
            </DocumentWrite>
          </g>
        ))}
        <rect x="15" y="142" width="12" height="12" rx="2" fill="none" stroke={C.muted} />
        <DocumentWrite delay={delay + .7}><Tick x={17} y={143} size={8} /></DocumentWrite>
        <text x="34" y="152" fontSize="14" fill={C.muted}>검토 요청</text>
      </g>
    );
  }

  if (kind === 'tax') {
    return (
      <g>
        <path d="M15 54h119v70H15Z M15 77h119M75 54v70M15 100h119" fill="none" stroke={C.coral} />
        {[65, 88, 112].map((y, index) => (
          <DocumentWrite key={y} delay={delay + index * .18}>
            <path d={`M24 ${y}h38m23 0h36`} stroke={C.muted} strokeWidth="3" strokeLinecap="round" opacity=".55" />
          </DocumentWrite>
        ))}
        <text x="16" y="146" fontSize="16" fill={C.muted}>전자 문서</text>
      </g>
    );
  }

  const tableLabels = kind === 'payroll' ? ['지급', '공제', '합계']
    : kind === 'labor' ? ['근무', '공수', '합계']
      : kind === 'quote' || kind === 'purchase' ? ['품목', '수량', '금액']
        : kind === 'receipt' ? ['입금', '금액', '확인']
          : kind === 'inventory' ? ['품목', '재고', '합계']
            : kind === 'delivery' ? ['납품', '수량', '확인'] : ['거래', '품목', '수량'];

  return (
    <g>
      <rect x="15" y="51" width="119" height="24" rx="2" fill={color === C.cream ? '#e0e6d9' : color} />
      <text x="23" y="68" fill={C.pine} fontSize="16">{tableLabels[0]}</text>
      <text x="89" y="68" fill={C.pine} fontSize="16">{tableLabels[1]}</text>
      {[87, 106, 125].map((y, index) => (
        <DocumentWrite key={y} delay={delay + index * .18}>
          <path d={`M16 ${y + 7}h118`} stroke={C.muted} opacity=".25" />
          <path d={`M23 ${y}h${kind === 'labor' ? 34 : 42}m${kind === 'labor' ? 35 : 27} 0h24`} stroke={C.muted} strokeWidth="3" strokeLinecap="round" opacity={index === 2 ? .75 : .45} />
        </DocumentWrite>
      ))}
      <text x="16" y="151" fill={C.muted} fontSize="16">{tableLabels[2]}</text>
    </g>
  );
}

/** Example forms only: no personal records or claims of statutory issuance. */
export function DocumentAutomationScene({ variant = 0 }: { variant?: number } = {}) {
  const selectedIndex = Math.min(Math.max(variant - 1, 0), DOCUMENT_BATCHES.length - 1);
  const batches = variant > 0 ? Array.from({ length: 3 }, () => DOCUMENT_BATCHES[selectedIndex]) : DOCUMENT_BATCHES;
  return (
    <g data-motion-scene="document-automation" data-document-group={variant}>
      <Reveal>
        <text x="36" y="43" fill={C.cream} fontSize="22" fontWeight="700">자료에서 실행까지, 업무 자동화.</text>
        <text x="704" y="43" fill={C.teal} fontSize="16" textAnchor="end">{variant > 0 ? '선택한 6종 반복 보기' : '18종 문서 구성 예시'}</text>
        <path d="M36 62h668" stroke={C.muted} opacity=".4" />
      </Reveal>

      <WorkExecutionConsole />

      <g fill="none" strokeWidth="1.5">
        <path d="M180 334h19V72h534v192H199v70m171-262v379m171-379v379" stroke={C.muted} opacity=".45" />
        <path d="M180 334h19V72h534v192H199" stroke={C.teal} opacity=".35" />
      </g>
      <SignalPath d="M180 334h19V72h534v192H199" color={C.lime} delay={.6} duration={4} />
      <SignalPath d="M180 334h19v117h534" color={C.teal} delay={1.2} duration={4} />
      <SignalPath d="M733 451H199V334h-19" color={C.coral} delay={7.8} duration={4} />

      {batches.map(({ label, detail, documents }, batchIndex) => (
        <g
          key={`${label}-${batchIndex}`}
          data-document-batch={batchIndex}
          className={`document-batch${batchIndex > 0 ? ' motion-secondary' : ''}`}
          style={{ animationDelay: `${batchIndex * 4}s` }}
        >
          <text x="36" y="412" fill={C.cream} fontSize="17" fontWeight="700">{label}</text>
          <text x="36" y="436" fill={C.teal} fontSize="14">{detail}</text>
          {documents.map(({ title, kind, color }, index) => {
            const x = 222 + (index % 3) * 171;
            const y = index < 3 ? 89 : 276;
            const delay = batchIndex * 4 + index * .08;
            return (
              <g key={kind} transform={`translate(${x} ${y})`} data-document-title={title}>
                <g className="document-card" style={{ animationDelay: `${delay}s` }}>
                  <path d="M5 6h144v166H5Z" fill={C.deep} opacity=".9" />
                  <path d="M0 0h126l20 20v146H0Z" fill={C.cream} />
                  <path d="M126 0v20h20" fill="#d5dece" />
                  <rect x="0" y="0" width="5" height="166" fill={color} />
                  <text x="15" y="31" fontSize="20" fontWeight="750" fill={C.pine}>{title}</text>
                  <path d="M15 41h105" stroke={C.muted} opacity=".2" />
                  <DocumentContents kind={kind} color={color} delay={delay + .4} />
                  <g className="motion-only screen-wipe" style={{ animationDelay: `${delay + .7}s`, animationDuration: '2.5s', animationIterationCount: 1 }}>
                    <rect x="8" y="47" width="132" height="111" fill={C.teal} opacity=".08" />
                    <path d="M8 47h132" stroke={C.teal} strokeWidth="1.5" />
                  </g>
                  <g className="document-stamp" style={{ animationDelay: `${delay}s` }}>
                    <circle cx="124" cy="146" r="14" fill={C.pine} stroke={C.cream} strokeWidth="2" />
                    <Tick x={116} y={138} size={16} color={C.lime} />
                  </g>
                  <ReactionBurst x={124} y={146} color={C.teal} delay={delay + 1.8} duration={4} />
                </g>
              </g>
            );
          })}
        </g>
      ))}

      <WorkActionLane />
    </g>
  );
}
