'use client';

import { useId } from 'react';
import styled, { css, keyframes } from 'styled-components';

type DeskEffectsProps = { variant: number; playing: boolean; reducedMotion: boolean };
const DOCUMENTS = [
  ['요청서', '명세서', '보고서', '확인서', '완료'],
  ['급여', '견적', '거래', '명세', '검토'],
  ['계약', '발주', '구매', '지출', '확인'],
  ['보고', '출장', '휴가', '증명', '정산'],
] as const;
const PROGRAMS = [
  ['거래 내역', '계산서 작성', '발행 결과'],
  ['급여 명단', '이체 검토', '처리 결과'],
  ['안내 작성', '메시지 연결', '발송 결과'],
  ['주문 접수', '결제 확인', '주문 완료'],
] as const;

function BotFace({ x, y, color = '#84e8ce', size = 1 }: { x: number; y: number; color?: string; size?: number }) {
  return <g transform={`translate(${x} ${y}) scale(${size})`}>
    <path d="M20 8V2" stroke={color} strokeWidth="3" /><circle cx="20" cy="2" r="3" fill={color} />
    <rect x="1" y="8" width="38" height="29" rx="9" fill={color} />
    <path d="M0 18h-4v10h4m40-10h4v10h-4" fill="none" stroke={color} strokeWidth="3" />
    <circle cx="12" cy="21" r="3" fill="#102b3c" /><circle cx="28" cy="21" r="3" fill="#102b3c" />
    <path d="M13 29q7 5 14 0" fill="none" stroke="#102b3c" strokeWidth="2.5" strokeLinecap="round" />
  </g>;
}

function Papers({ variant }: { variant: number }) {
  const labels = DOCUMENTS[variant] ?? DOCUMENTS[0];
  return <g data-desk-scene="papers">
    <ellipse cx="852" cy="616" rx="112" ry="12" fill="#152a35" opacity=".22" />
    {labels.map((label, index) => <g key={label} transform={`translate(${757 + index * 5} ${583 - index * 5})`}>
      <Paper data-paper-flight={index} style={{ animationDelay: `${.45 + index * 1.45}s` }}>
        <path d="M0 2h127l22 24v152H0Z" fill={index % 2 ? '#edf5ff' : '#fffdf3'} stroke="#9ab4be" strokeWidth="2" />
        <path d="M127 2v24h22" fill="#d4e7df" stroke="#9ab4be" strokeWidth="2" />
        <rect x="14" y="20" width="72" height="10" rx="3" fill="#5eb9a5" />
        <text x="14" y="60" fill="#234b52" fontSize="23" fontWeight="700">{label}</text>
        <g stroke="#a9bec8" strokeWidth="5" strokeLinecap="round"><path d="M16 82h112M16 101h93M16 120h112M16 139h69" /></g>
        <path d="m109 143 8 8 17-22" fill="none" stroke="#43997e" strokeWidth="5" strokeLinecap="round" />
      </Paper>
    </g>)}
    <DeskGlow className="desk-result" cx="848" cy="610" rx="124" ry="20" fill="none" stroke="#94e8cf" strokeWidth="4" style={{ animationDelay: '8s' }} />
  </g>;
}

function DigitalScreens({ variant }: { variant: number }) {
  const labels = PROGRAMS[variant - 4] ?? PROGRAMS[0];
  return <g data-desk-scene="screens">
    <path d="M1110 500q-65 45-119 65" fill="none" stroke="#69dec7" strokeWidth="4" strokeDasharray="9 9" opacity=".65" />
    {labels.map((label, index) => <g key={label} transform={`translate(${966 + index * 57} ${94 + index * 115})`}>
      <Screen data-digital-window={index} style={{ animationDelay: `${.6 + index * 2.8}s` }}>
        <rect width="310" height="184" rx="15" fill="#0d263b" fillOpacity=".97" stroke={index === 2 ? '#80e8cc' : '#92caff'} strokeWidth="4" />
        <path d="M2 39h306" stroke="#457591" strokeWidth="2" />
        {[20, 34, 48].map(x => <circle key={x} cx={x} cy="20" r="4" fill="#89b2ce" />)}
        <text x="22" y="78" fill="#edf8ff" fontSize="25" fontWeight="700">{label}</text>
        <path d="M24 102h159M24 121h116" stroke="#7b9bb3" strokeWidth="6" strokeLinecap="round" />
        <rect x="23" y="145" width="170" height="12" rx="6" fill="#244961" />
        <rect x="23" y="145" width={75 + index * 42} height="12" rx="6" fill="#6edac2" />
        <circle cx="255" cy="124" r="26" fill="#80e8cc" />
        <path d="m242 124 9 9 18-22" fill="none" stroke="#163d3d" strokeWidth="5" strokeLinecap="round" />
      </Screen>
    </g>)}
  </g>;
}

function BotReplies({ variant, clipId }: { variant: number; clipId: string }) {
  const labels = variant === 8 ? ['접속했어요', '입력했어요', '확인 끝!'] : ['자료 모았어요', '정리했어요', '보고할게요'];
  return <g data-desk-scene="bots">
    <defs><clipPath id={clipId}><path d="m1151 193 228 12-5 232-239-11Z" /></clipPath></defs>
    <path d="m1151 193 228 12-5 232-239-11Z" fill="#0b2439" stroke="#8adfcb" strokeWidth="5" />
    <g clipPath={`url(#${clipId})`}>
      <g transform="matrix(1 .05 -.07 1 1155 205)">
        <text x="9" y="22" fill="#a4dded" fontSize="18" fontWeight="700">그뚠 봇 · 답장</text>
        {labels.map((label, index) => <g key={label} transform={`translate(10 ${42 + index * 56})`}>
          <Reply data-bot-reply={index} style={{ animationDelay: `${1 + index * 3.1}s` }}>
            <BotFace x={0} y={2} size={.75} color={['#84e8ce', '#9bcaff', '#f4d28c'][index]} />
            <rect x="38" y="1" width="153" height="38" rx="10" fill={index === 2 ? '#b5f1db' : '#e5f2f9'} />
            <path d="m40 25-9 10h9" fill={index === 2 ? '#b5f1db' : '#e5f2f9'} />
            <text x="48" y="26" fill="#193b45" fontSize="19" fontWeight="700">{label}</text>
          </Reply>
        </g>)}
      </g>
    </g>
    <g transform="translate(923 65)">
      <Reply data-bot-summary style={{ animationDelay: '8.3s' }}>
        <rect width="459" height="91" rx="22" fill="#d9f7e8" stroke="#7ce2bd" strokeWidth="3" />
        <path d="m340 89 32 33 5-33" fill="#d9f7e8" />
        <BotFace x={20} y={19} size={1.2} color="#58ba98" />
        <text x="85" y="40" fill="#376c58" fontSize="21">그뚠 봇의 답장</text>
        <text x="85" y="70" fill="#173f31" fontSize="29" fontWeight="750">{variant === 8 ? '반복 입력, 끝냈어요!' : '맡긴 일, 정리 끝!'}</text>
      </Reply>
    </g>
  </g>;
}

/** Coordinates match the desk and monitor in the shared 1448×1086 character scenes. */
export default function ProductAutomationDeskEffects({ variant, playing, reducedMotion }: DeskEffectsProps) {
  const clipId = useId();
  const category = variant < 4 ? 'documents' : variant < 8 ? 'integrations' : 'agents';
  return <Layer data-desk-effects={category} $playing={playing} $reducedMotion={reducedMotion}>
    <svg viewBox="0 0 1448 1086" aria-hidden="true" focusable="false">
      {category === 'documents' ? <Papers variant={variant} /> : category === 'integrations' ? <DigitalScreens variant={variant} /> : <BotReplies variant={variant} clipId={clipId} />}
    </svg>
  </Layer>;
}

const flyPaper = keyframes`
  0% { opacity: 0; transform: translate(480px, -460px) rotate(28deg) scale(1.05); }
  12% { opacity: 1; }
  55% { transform: translate(170px, -300px) rotate(-16deg) scale(1.08); }
  82% { transform: translate(-10px, -30px) rotate(-9deg) scale(1, .4); }
  100% { opacity: 1; transform: rotate(-7deg) skewX(40deg) scale(1, .22); }
`;
const flyScreen = keyframes`
  0% { opacity: 0; transform: translate(430px, -190px) rotate(18deg) scale(.6); }
  18% { opacity: .85; }
  70% { transform: translate(-16px, 8px) rotate(-3deg) scale(1.04); }
  100% { opacity: 1; transform: none; }
`;
const replyIn = keyframes`
  from { opacity: 0; transform: translate(24px, 14px) scale(.92); }
  to { opacity: 1; transform: none; }
`;
const resultGlow = keyframes`0% { opacity: 0; } 35% { opacity: .8; } 100% { opacity: 0; }`;
const Layer = styled.div<{ $playing: boolean; $reducedMotion: boolean }>`
  position: absolute; inset: 0; z-index: 1; pointer-events: none;
  > svg { display: block; width: 100%; height: 100%; overflow: hidden; }
  *, *::before, *::after { animation-play-state: ${({ $playing }) => $playing ? 'running' : 'paused'} !important; }
  ${({ $reducedMotion }) => $reducedMotion && css`*, *::before, *::after { animation: none !important; }`}
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; } }
`;
const Paper = styled.g`opacity: 1; transform: rotate(-7deg) skewX(40deg) scale(1, .22); transform-origin: 0 0; animation: ${flyPaper} 1.8s cubic-bezier(.25,.65,.3,1) both;`;
const Screen = styled.g`opacity: 1; transform-origin: 155px 92px; animation: ${flyScreen} 1.9s cubic-bezier(.2,.7,.2,1) both;`;
const Reply = styled.g`opacity: 1; transform-box: fill-box; transform-origin: center; animation: ${replyIn} .65s cubic-bezier(.2,.75,.2,1) both;`;
const DeskGlow = styled.ellipse`opacity: 0; animation: ${resultGlow} 2s ease-out both;`;
