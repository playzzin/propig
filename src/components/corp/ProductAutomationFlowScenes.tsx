import type { ReactNode } from 'react';
import { ReactionBurst, SignalPath, SignalPing } from './ProductMotionEffects';

const C = {
  cream: '#f3f7ff', pine: '#0a1830', deep: '#07101f', lime: '#93c5fd',
  teal: '#5eead4', coral: '#f5c766', muted: '#577390', line: '#d8e2f0',
};

function Tick({ x, y, color = C.pine }: { x: number; y: number; color?: string }) {
  return <path d={`m${x} ${y + 5} 5 5 11-12`} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />;
}

function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return <g className="assemble" style={{ animationDelay: `${delay}s` }}>{children}</g>;
}

function Phase({ children, step }: { children: ReactNode; step: number }) {
  return <g className="motion-secondary motion-window" style={{ animationDelay: `${step * 4}s`, animationDuration: '4s' }}>{children}</g>;
}

function Writing({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return <g className="document-write" style={{ animationDelay: `${delay}s` }}>{children}</g>;
}

function ActionCursor({ x, y, action, step = 1 }: { x: number; y: number; action: string; step?: number }) {
  return <g data-work-action={action}>
    <Phase step={step}>
      <g transform={`translate(${x} ${y})`}>
        <circle className="reaction-pop" r="17" fill={C.coral} fillOpacity=".2" stroke={C.coral} strokeWidth="1.5" style={{ animationDelay: `${step * 4 + .5}s`, animationDuration: '1.6s' }} />
        <g className="cursor" style={{ animationDelay: `${step * 4}s`, animationDuration: '1.4s' }}>
          <path d="m0 0 5 25 7-9 10-1Z" fill={C.coral} stroke={C.deep} strokeWidth="1.5" />
        </g>
      </g>
    </Phase>
  </g>;
}

function ResultReceipt({ x, y, width, action, label, detail }: { x: number; y: number; width: number; action: string; label: string; detail: string }) {
  return <g data-work-action={action}>
    <g className="motion-secondary notification" style={{ animationDelay: '8s', animationDuration: '4s' }}>
      <rect x={x} y={y} width={width} height="58" rx="8" fill={C.teal} />
      <text x={x + width / 2} y={y + 23} textAnchor="middle" fill={C.pine} fontSize="17" fontWeight="750">{label}</text>
      <text x={x + width / 2} y={y + 46} textAnchor="middle" fill={C.pine} fontSize="15">{detail}</text>
    </g>
  </g>;
}

function Connection({ d, delay = 0 }: { d: string; delay?: number }) {
  return <>
    <path d={d} fill="none" stroke={C.muted} strokeWidth="1.5" strokeDasharray="4 6" />
    <SignalPath d={d} color={C.lime} delay={delay} duration={3.2} />
    <SignalPath d={d} color={C.teal} delay={delay + 1.8} duration={3.2} reverse />
  </>;
}

function StatusSequence({ steps, summary }: { steps: readonly string[]; summary: string }) {
  return <g>
    <path d="M52 448h656" stroke={C.muted} opacity=".4" />
    <text x="380" y="483" fill={C.teal} fontSize="16" textAnchor="middle">{summary}</text>
    {steps.map((label, index) => <g key={label} data-flow-step={index} data-work-action={['receive-task', 'execute-task', 'record-result'][index]} className="motion-secondary motion-window" style={{ animationDelay: `${index * 4}s`, animationDuration: '4s' }}>
      <rect x="113" y="459" width="534" height="35" rx="17.5" fill={index === 1 ? C.teal : C.lime} />
      <circle cx="139" cy="476.5" r="10" fill={C.pine} />
      <text x="139" y="482" textAnchor="middle" fontSize="16" fill={C.cream}>{index + 1}</text>
      <text x="167" y="482" fill={C.pine} fontSize="17">{label}</text>
    </g>)}
  </g>;
}

function Frame({ name, title, steps, summary, children }: {
  name: string; title: string; steps: readonly string[]; summary: string; children: ReactNode;
}) {
  return <g data-automation-flow={name}>
    <text x="50" y="51" fill={C.cream} fontSize="22" fontWeight="750">{title}</text>
    <rect x="543" y="28" width="169" height="31" rx="15.5" fill={C.muted} fillOpacity=".27" stroke={C.muted} />
    <circle cx="561" cy="44" r="4" fill={C.lime} />
    <text x="574" y="50" fill={C.teal} fontSize="16">연동 흐름 시연</text>
    {children}
    <StatusSequence steps={steps} summary={summary} />
  </g>;
}

function WindowChrome({ x, y, width, label, children }: { x: number; y: number; width: number; label: string; children: ReactNode }) {
  return <g transform={`translate(${x} ${y})`}>
    <rect width={width} height="330" rx="13" fill={C.cream} />
    <path d={`M13 0h${width - 26}q13 0 13 13v31H0V13Q0 0 13 0Z`} fill={C.line} />
    {[19, 32, 45].map((cx, index) => <circle key={cx} cx={cx} cy="22" r="3.5" fill={index === 0 ? C.coral : C.muted} />)}
    <text x="65" y="28" fill={C.pine} fontSize="16">{label}</text>
    {children}
  </g>;
}

function TaxInvoiceScene() {
  return <Frame name="tax-invoice" title="세금계산서 발행" summary="거래 정보 → 발행 요청 → 결과 보관" steps={['거래 정보를 세금계산서에 채워요', '담당자 확인 후 발행 요청을 보내요', '발행 결과와 문서를 함께 보관해요']}>
    <Reveal>
      <WindowChrome x={48} y={85} width={405} label="거래 · 세금계산서">
        <text x="25" y="80" fontSize="23" fill={C.pine} fontWeight="750">전자 세금계산서</text>
        <rect x="284" y="59" width="96" height="29" rx="14.5" fill={C.teal} />
        <text x="332" y="79" textAnchor="middle" fontSize="16" fill={C.pine}>시연 문서</text>
        <rect x="25" y="103" width="355" height="139" rx="6" fill="none" stroke={C.muted} strokeOpacity=".35" />
        {['공급자', '공급받는자', '거래 품목', '작성일'].map((label, index) => <g key={label}>
          {index > 0 && <path d={`M25 ${103 + index * 35}h355`} stroke={C.line} />}
          <text x="39" y={126 + index * 35} fontSize="16" fill={C.muted}>{label}</text>
          <Writing delay={index * .35 + .5}><text x="151" y={126 + index * 35} fontSize="16" fill={C.pine}>{['시연 공급자', '시연 거래처', '콘텐츠 제작 서비스', '선택한 거래일'][index]}</text></Writing>
        </g>)}
        <path d="M134 103v139" stroke={C.line} />
        <rect x="25" y="264" width="168" height="40" rx="6" fill={C.pine} />
        <text x="109" y="290" textAnchor="middle" fontSize="17" fill={C.cream}>검토 · 발행 요청</text>
        <text x="219" y="289" fontSize="16" fill={C.muted}>거래 정보 연동</text>
        <ActionCursor x={160} y={284} action="submit-invoice" />
        <Phase step={1}><rect x="15" y="252" width="188" height="64" rx="10" fill="none" stroke={C.teal} strokeWidth="3" /></Phase>
      </WindowChrome>
    </Reveal>
    <Connection d="M453 244h38v-42h29" delay={1.2} />
    <Connection d="M520 354h-28v-45h-39" delay={6.4} />
    <Reveal delay={.7}>
      <rect x="520" y="120" width="192" height="149" rx="12" fill={C.deep} stroke={C.muted} />
      <rect x="579" y="145" width="74" height="43" rx="6" fill={C.muted} fillOpacity=".4" stroke={C.teal} />
      <path d="M590 156h35m-35 12h35" stroke={C.teal} strokeWidth="2" />
      <circle cx="640" cy="162" r="4" fill={C.lime} className="pulse" />
      <text x="616" y="221" textAnchor="middle" fill={C.cream} fontSize="19">발행 서비스</text>
      <text x="616" y="246" textAnchor="middle" fill={C.teal} fontSize="16">요청 · 응답 연결</text>
      <rect x="520" y="297" width="192" height="118" rx="12" fill={C.teal} />
      <circle cx="548" cy="328" r="13" fill={C.pine} /><Tick x={540} y={323} color={C.cream} />
      <text x="572" y="334" fill={C.pine} fontSize="18">발행 결과</text>
      <text x="540" y="366" fill={C.pine} fontSize="16">처리 상태 · 원본 문서</text>
      <text x="540" y="391" fill={C.pine} fontSize="16">거래 내역에 연결</text>
      <Phase step={2}><rect x="520" y="297" width="192" height="118" rx="12" fill="none" stroke={C.lime} strokeWidth="3" /></Phase>
    </Reveal>
    <ResultReceipt x={530} y={349} width={172} action="archive-invoice" label="응답 수신 · 문서 보관" detail="거래 내역에 결과 연결" />
    <SignalPing x={616} y={166} delay={3.8} radius={24} /><ReactionBurst x={697} y={304} delay={8.1} />
  </Frame>;
}

function PayrollScene() {
  return <Frame name="payroll" title="급여 이체 · 결과 대사" summary="급여 명세 → 담당자 승인 → 이체 결과" steps={['급여명세서와 지급 목록을 연결해요', '담당자 승인을 거쳐 이체를 요청해요', '이체 결과를 급여대장과 맞춰요']}>
    <Reveal>
      <WindowChrome x={48} y={85} width={473} label="급여 지급 관리">
        <text x="24" y="80" fontSize="22" fill={C.pine} fontWeight="750">지급 대상 · 계좌 확인</text>
        <rect x="24" y="101" width="425" height="32" rx="4" fill={C.line} />
        <text x="38" y="123" fontSize="16" fill={C.muted}>지급 대상</text><text x="176" y="123" fontSize="16" fill={C.muted}>등록 계좌</text><text x="336" y="123" fontSize="16" fill={C.muted}>명세서</text>
        {['담당자 A', '담당자 B', '담당자 C'].map((label, index) => <g key={label}>
          <path d={`M24 ${175 + index * 42}h425`} stroke={C.line} />
          <text x="38" y={160 + index * 42} fontSize="17" fill={C.pine}>{label}</text>
          <text x="176" y={160 + index * 42} fontSize="16" fill={C.muted}>은행 · ••••</text>
          <Writing delay={.4 + index * .5}><rect x="333" y={141 + index * 42} width="96" height="27" rx="13.5" fill={C.teal} /><text x="381" y={160 + index * 42} textAnchor="middle" fontSize="16" fill={C.pine}>연결됨</text></Writing>
        </g>)}
        <rect x="24" y="275" width="198" height="35" rx="6" fill={C.pine} />
        <text x="123" y="298" textAnchor="middle" fontSize="17" fill={C.cream}>담당자 승인 후 요청</text>
        <text x="248" y="298" fontSize="16" fill={C.muted}>예시 지급 목록</text>
        <ActionCursor x={163} y={293} action="approve-payroll" />
        <Phase step={1}><rect x="16" y="267" width="214" height="51" rx="10" fill="none" stroke={C.teal} strokeWidth="3" /></Phase>
      </WindowChrome>
    </Reveal>
    <Connection d="M521 220h24v-42h31" delay={2.2} />
    <Connection d="M576 355h-30v-69h-25" delay={6.5} />
    <Reveal delay={.8}>
      <rect x="576" y="118" width="136" height="144" rx="13" fill={C.lime} />
      <path d="m611 156 33-17 33 17Zm7 9v29m17-29v29m18-29v29m17-29v29m-59 7h66" fill="none" stroke={C.pine} strokeWidth="3" strokeLinejoin="round" />
      <text x="644" y="233" textAnchor="middle" fill={C.pine} fontSize="18">은행 연결</text>
      <rect x="576" y="294" width="136" height="121" rx="13" fill={C.deep} stroke={C.muted} />
      <circle cx="644" cy="326" r="15" fill={C.teal} /><Tick x={636} y={321} />
      <text x="644" y="365" textAnchor="middle" fill={C.cream} fontSize="18">결과 대사</text>
      <text x="644" y="390" textAnchor="middle" fill={C.teal} fontSize="16">완료 · 재확인</text>
    </Reveal>
    <ResultReceipt x={584} y={347} width={120} action="reconcile-payroll" label="명세서 반영" detail="대사 결과 연결" />
    <SignalPing x={644} y={171} delay={3.2} radius={22} /><ReactionBurst x={702} y={303} delay={8.4} />
    <Phase step={2}><path d="M556 325v68" stroke={C.lime} strokeWidth="3" strokeLinecap="round" /></Phase>
  </Frame>;
}

function KakaoScene() {
  return <Frame name="kakao" title="카카오톡 메시지 발송" summary="알림 내용 → 발송 요청 → 수신 결과" steps={['업무 데이터로 알림 내용을 채워요', '발송 대상을 확인하고 메시지를 보내요', '수신 결과를 업무 기록에 남겨요']}>
    <Reveal>
      <WindowChrome x={48} y={85} width={368} label="업무 알림 템플릿">
        <text x="24" y="80" fill={C.pine} fontSize="22" fontWeight="750">필요한 알림을, 제때.</text>
        <text x="24" y="110" fill={C.muted} fontSize="16">대상 · 템플릿 · 발송 조건</text>
        <rect x="24" y="131" width="320" height="123" rx="8" fill="#e2eaf5" />
        <Writing delay={.6}><text x="42" y="160" fill={C.pine} fontSize="17">안녕하세요, 담당자님.</text></Writing>
        <Writing delay={1.1}><text x="42" y="190" fill={C.pine} fontSize="17">요청하신 서류가 준비되었어요.</text></Writing>
        <Writing delay={1.6}><text x="42" y="220" fill={C.muted} fontSize="16">아래에서 내용을 확인해 주세요.</text></Writing>
        <rect x="24" y="274" width="174" height="37" rx="6" fill={C.pine} />
        <text x="111" y="299" textAnchor="middle" fill={C.cream} fontSize="17">메시지 발송 요청</text>
        <ActionCursor x={156} y={297} action="send-kakao-message" />
      </WindowChrome>
    </Reveal>
    <Connection d="M416 235h43v-34h39" delay={2.3} />
    <Connection d="M498 355h-38v-49h-44" delay={7.2} />
    <Reveal delay={.7}>
      <rect x="498" y="83" width="214" height="340" rx="27" fill={C.deep} stroke={C.muted} strokeWidth="2" />
      <rect x="506" y="91" width="198" height="324" rx="21" fill="#dbe7f5" />
      <rect x="574" y="98" width="62" height="9" rx="4.5" fill={C.pine} />
      <path d="M526 124l-7 7 7 7" fill="none" stroke={C.pine} strokeWidth="2" />
      <text x="544" y="137" fill={C.pine} fontSize="18">브랜드 알림</text>
      <path d="M514 150h182" stroke={C.pine} strokeOpacity=".15" />
      <rect x="520" y="169" width="170" height="177" rx="10" fill={C.cream} />
      <path d="m520 188-8-5 8 20" fill={C.cream} />
      <rect x="520" y="169" width="170" height="32" rx="10" fill={C.lime} />
      <rect x="520" y="185" width="170" height="16" fill={C.lime} />
      <text x="535" y="191" fill={C.pine} fontSize="16">업무 알림 · 예시</text>
      <text x="534" y="229" fill={C.pine} fontSize="17">서류가</text><text x="534" y="254" fill={C.pine} fontSize="17">준비되었어요.</text>
      <rect x="533" y="283" width="144" height="43" rx="5" fill={C.pine} />
      <text x="605" y="311" textAnchor="middle" fill={C.cream} fontSize="17">서류 확인하기</text>
      <text x="605" y="377" textAnchor="middle" fill={C.muted} fontSize="16">발송 · 수신 기록</text>
      <path d="M580 401h50" stroke={C.pine} strokeWidth="4" strokeLinecap="round" />
      <Phase step={1}><rect x="520" y="169" width="170" height="177" rx="10" fill="none" stroke={C.teal} strokeWidth="4" /></Phase>
      <g data-work-action="receive-kakao-status"><Phase step={2}><rect x="535" y="354" width="140" height="31" rx="15.5" fill={C.teal} /><Tick x={549} y={364} /><text x="576" y="376" fill={C.pine} fontSize="16">결과 기록</text></Phase></g>
    </Reveal>
    <SignalPing x={605} y={305} delay={5.3} radius={24} /><ReactionBurst x={681} y={175} color={C.teal} delay={4.2} />
  </Frame>;
}

function PaymentScene() {
  return <Frame name="pg-payment" title="PG사 연결 · 결제 자동화" summary="주문 접수 → 결제 응답 → 주문 상태 반영" steps={['주문 내용에서 결제 요청을 만들어요', 'PG사 결제창에서 처리 결과를 받아요', '결과에 맞춰 주문 상태를 반영해요']}>
    <Reveal>
      <WindowChrome x={48} y={85} width={374} label="브랜드 스토어 · 주문">
        <rect x="24" y="68" width="76" height="83" rx="8" fill={C.teal} />
        <path d="M45 95h34v39H45Zm9 0v-6a8 8 0 0 1 16 0v6" fill="none" stroke={C.pine} strokeWidth="2.5" />
        <text x="117" y="92" fill={C.pine} fontSize="21">콘텐츠 패키지</text>
        <text x="117" y="121" fill={C.muted} fontSize="16">브랜드 시연 상품</text>
        <text x="24" y="185" fill={C.muted} fontSize="16">주문 내역</text><text x="218" y="185" fill={C.pine} fontSize="17">선택 상품 확인</text>
        <path d="M24 201h326" stroke={C.line} />
        <text x="24" y="231" fill={C.muted} fontSize="16">결제 정보</text><text x="218" y="231" fill={C.pine} fontSize="17">결제 수단 선택</text>
        <rect x="24" y="268" width="326" height="42" rx="7" fill={C.pine} />
        <text x="187" y="295" textAnchor="middle" fill={C.cream} fontSize="18">결제 요청</text>
        <ActionCursor x={237} y={289} action="request-payment" />
      </WindowChrome>
    </Reveal>
    <Connection d="M422 202h31v-35h36" delay={1.3} />
    <Connection d="M489 361h-37v-63h-30" delay={7.1} />
    <Reveal delay={.6}>
      <rect x="489" y="92" width="223" height="192" rx="14" fill={C.lime} />
      <text x="509" y="124" fill={C.pine} fontSize="21">PG 결제 연결</text>
      <rect x="509" y="144" width="183" height="80" rx="9" fill={C.pine} />
      <rect x="526" y="163" width="26" height="19" rx="4" fill={C.teal} />
      <path d="M526 202h75m39-35h32" stroke={C.cream} strokeWidth="3" strokeLinecap="round" />
      <text x="509" y="257" fill={C.pine} fontSize="17">결제 수단 · 처리 응답</text>
      <rect x="489" y="310" width="223" height="105" rx="12" fill={C.deep} stroke={C.muted} />
      <circle cx="520" cy="343" r="14" fill={C.teal} /><Tick x={512} y={338} />
      <text x="546" y="349" fill={C.cream} fontSize="19">주문 상태 반영</text>
      <text x="510" y="386" fill={C.teal} fontSize="16">결제 결과 → 주문 기록</text>
      <Phase step={1}><rect x="489" y="92" width="223" height="192" rx="14" fill="none" stroke={C.teal} strokeWidth="4" /></Phase>
      <Phase step={2}><rect x="489" y="310" width="223" height="105" rx="12" fill="none" stroke={C.lime} strokeWidth="3" /></Phase>
    </Reveal>
    <ResultReceipt x={499} y={351} width={203} action="sync-payment-result" label="주문 갱신 · 결과 저장" detail="결제 응답을 업무에 반영" />
    <SignalPing x={648} y={177} color={C.cream} delay={4.4} radius={21} /><ReactionBurst x={700} y={318} delay={8.1} />
  </Frame>;
}

function BrowserScene() {
  return <Frame name="browser" title="브라우저 자동화" summary="화면 탐색 → 입력 · 클릭 → 결과 수집" steps={['브라우저에서 필요한 화면을 찾아요', '입력하고 클릭하며 반복 작업을 수행해요', '화면의 결과를 표와 기록으로 모아요']}>
    <Reveal>
      <WindowChrome x={48} y={85} width={482} label="브라우저 · 업무 포털">
        <rect x="22" y="60" width="438" height="29" rx="5" fill={C.line} />
        <path d="m35 70-5 5 5 5m10-10 5 5-5 5" stroke={C.muted} strokeWidth="1.5" fill="none" />
        <text x="65" y="81" fill={C.muted} fontSize="16">시연 업무 화면 / 조회</text>
        <text x="24" y="123" fill={C.pine} fontSize="22" fontWeight="750">자료 조회 · 정리</text>
        <rect x="24" y="143" width="288" height="37" rx="6" fill="none" stroke={C.muted} strokeOpacity=".45" />
        <g data-work-action="enter-search-criteria"><Writing delay={.8}><text x="39" y="168" fill={C.pine} fontSize="17">선택한 기간의 거래 내역</text></Writing></g>
        <rect x="324" y="143" width="134" height="37" rx="6" fill={C.pine} />
        <text x="391" y="168" textAnchor="middle" fill={C.cream} fontSize="17">조회</text>
        <rect x="24" y="197" width="434" height="30" rx="3" fill={C.line} />
        <text x="36" y="218" fill={C.muted} fontSize="16">조회 결과</text><text x="211" y="218" fill={C.muted} fontSize="16">구분</text><text x="351" y="218" fill={C.muted} fontSize="16">처리</text>
        {['선택한 거래 내역', '관련 첨부 문서'].map((label, index) => <g key={label}>
          <path d={`M24 ${268 + index * 39}h434`} stroke={C.line} />
          <Writing delay={1.6 + index * .5}><text x="36" y={252 + index * 39} fill={C.pine} fontSize="16">{label}</text><text x="211" y={252 + index * 39} fill={C.muted} fontSize="16">{index ? '문서' : '자료'}</text><Tick x={370} y={241 + index * 39} /></Writing>
        </g>)}
        <ActionCursor x={367} y={166} action="click-browser-search" />
        <Phase step={0}><rect x="17" y="137" width="302" height="49" rx="9" fill="none" stroke={C.teal} strokeWidth="3" /></Phase>
        <Phase step={1}><rect x="319" y="138" width="144" height="47" rx="9" fill="none" stroke={C.teal} strokeWidth="3" /></Phase>
        <Phase step={2}><g className="scan"><path d="M25 235h432" stroke={C.teal} strokeWidth="3" opacity=".8" /></g></Phase>
      </WindowChrome>
    </Reveal>
    <Connection d="M530 286h22v-44h24" delay={4.3} />
    <Reveal delay={.8}>
      <rect x="576" y="151" width="136" height="216" rx="12" fill={C.teal} />
      <path d="M615 175h38l18 18v52h-56Zm38 0v18h18m-44 21h32m-32 13h23" fill="none" stroke={C.pine} strokeWidth="2.5" strokeLinejoin="round" />
      <text x="644" y="277" textAnchor="middle" fill={C.pine} fontSize="19">결과 수집</text>
      <text x="644" y="307" textAnchor="middle" fill={C.pine} fontSize="16">표 · 문서</text>
      <text x="644" y="333" textAnchor="middle" fill={C.pine} fontSize="16">처리 기록</text>
    </Reveal>
    <ResultReceipt x={584} y={293} width={120} action="collect-browser-results" label="결과 정리" detail="표 · 문서로 저장" />
    <Connection d="M576 344h-23v40h-23" delay={8.3} />
    <SignalPing x={439} y={248} delay={3.5} radius={17} /><ReactionBurst x={699} y={159} delay={8.2} />
  </Frame>;
}

function AgentScene() {
  return <Frame name="agent" title="에이전트봇 자동화" summary="업무 목표 → 도구 실행 → 검토 · 결과 전달" steps={['요청한 업무를 실행 단계로 나눠요', '필요한 도구와 프로그램을 연결해요', '검토가 필요한 작업을 확인하고 전달해요']}>
    <Reveal>
      <rect x="48" y="85" width="205" height="330" rx="13" fill={C.cream} />
      <circle cx="87" cy="126" r="20" fill={C.pine} />
      <rect x="75" y="118" width="24" height="17" rx="5" fill="none" stroke={C.lime} strokeWidth="2" /><path d="M87 112v6m-7 7h1m12 0h1m-12 5h10" stroke={C.lime} strokeWidth="2" strokeLinecap="round" />
      <text x="118" y="133" fill={C.pine} fontSize="20">업무 요청</text>
      <text x="69" y="181" fill={C.pine} fontSize="21">거래 내역을</text><text x="69" y="211" fill={C.pine} fontSize="21">정리해 줘.</text>
      <path d="M69 236h163" stroke={C.line} />
      {['자료 확인', '문서 작성', '결과 전달'].map((label, index) => <g key={label}>
        <circle cx="77" cy={268 + index * 44} r="10" fill={index === 1 ? C.teal : C.line} />
        <text x="77" y={274 + index * 44} fill={C.pine} textAnchor="middle" fontSize="16">{index + 1}</text>
        <text x="100" y={274 + index * 44} fill={C.pine} fontSize="18">{label}</text>
      </g>)}
    </Reveal>
    <Connection d="M253 176h42" delay={.8} />
    <Connection d="M253 312h20v-25h22" delay={4.7} />
    <Reveal delay={.5}>
      <rect x="295" y="85" width="417" height="330" rx="13" fill={C.deep} stroke={C.muted} />
      <text x="319" y="123" fill={C.cream} fontSize="21">실행 계획 · 검토 큐</text>
      <path d="M319 141h369" stroke={C.muted} opacity=".5" />
      {[
        { title: '자료 확인', detail: '브라우저 · 데이터 연결', color: C.teal },
        { title: '문서 작성', detail: '템플릿 · 업무 자동화', color: C.lime },
        { title: '담당자 검토', detail: '확인 후 결과 전달', color: C.coral },
      ].map(({ title, detail, color }, index) => <g key={title}>
        <rect x="319" y={158 + index * 75} width="369" height="59" rx="9" fill={C.pine} stroke={C.muted} strokeOpacity=".6" />
        <circle cx="343" cy={188 + index * 75} r="12" fill={color} /><Tick x={335} y={183 + index * 75} />
        <text x="370" y={183 + index * 75} fill={C.cream} fontSize="18">{title}</text>
        <text x="370" y={206 + index * 75} fill={C.teal} fontSize="16">{detail}</text>
        <g data-work-action={['agent-read-data', 'agent-compose-document', 'agent-request-review'][index]}><Phase step={index}><rect x="319" y={158 + index * 75} width="369" height="59" rx="9" fill="none" stroke={color} strokeWidth="2.5" /><circle cx="665" cy={188 + index * 75} r="5" fill={color} className="pulse" /></Phase></g>
      </g>)}
      <text x="319" y="394" fill={C.teal} fontSize="16">작업 이력과 검토 결과를 함께 남겨요</text>
    </Reveal>
    <ActionCursor x={651} y={339} action="confirm-agent-delivery" step={2} />
    <Connection d="M699 187h17v150h-17" delay={2.6} />
    <Connection d="M295 387h-21v-31h-21" delay={8.3} />
    <SignalPing x={343} y={263} delay={4.2} radius={13} /><ReactionBurst x={684} y={316} color={C.coral} delay={8.3} />
  </Frame>;
}

const FLOW_SCENES = [TaxInvoiceScene, PayrollScene, KakaoScene, PaymentScene, BrowserScene, AgentScene] as const;

export function ProductAutomationFlowScene({ variant = 4 }: { variant?: number }) {
  const Scene = FLOW_SCENES[variant - 4] ?? TaxInvoiceScene;
  return <Scene />;
}
