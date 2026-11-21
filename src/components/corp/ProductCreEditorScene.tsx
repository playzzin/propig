'use client';

import { useId, type ReactNode } from 'react';
import { ReactionBurst, SignalPath } from './ProductMotionEffects';
import { ProductContentSaleScene } from './ProductContentSaleScene';
import { SHOWREEL_MEDIA } from './productShowreelMedia';

const C = {
  ink: '#07101f', surface: '#0d203c', raised: '#172e4a', border: '#314968',
  text: '#f3f7ff', muted: '#a9b9cf', blue: '#93c5fd', teal: '#5eead4', amber: '#f5c766',
};

function Enter({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return <g className="assemble" style={{ animationDelay: `${delay}s` }}>{children}</g>;
}

function Check({ x, y, color = C.teal }: { x: number; y: number; color?: string }) {
  return <path d={`m${x} ${y} 5 5 10-11`} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />;
}

function Play({ x, y, radius = 16 }: { x: number; y: number; radius?: number }) {
  return <g><circle cx={x} cy={y} r={radius} fill={C.ink} fillOpacity=".8" stroke={C.text} strokeOpacity=".5" /><path d={`m${x - 4} ${y - 7} 11 7-11 7Z`} fill={C.text} /></g>;
}

function StepRibbon({ step, title, detail, accent = C.teal }: { step: number; title: string; detail: string; accent?: string }) {
  return (
    <g className="motion-secondary motion-window" data-creeditor-step={step} style={{ animationDelay: `${step * 4}s` }}>
      <rect x="38" y="443" width="684" height="51" rx="12" fill={C.raised} stroke={accent} strokeOpacity=".55" />
      <circle cx="63" cy="468" r="14" fill={accent} />
      <text x="63" y="474" textAnchor="middle" fill={C.ink} fontSize="17">{step + 1}</text>
      <text x="88" y="475" fill={C.text} fontSize="21">{title}</text>
      <text x="698" y="474" textAnchor="end" fill={accent} fontSize="18">{detail}</text>
    </g>
  );
}

function StepOutline({ step, x, y, width, height, color = C.teal }: { step: number; x: number; y: number; width: number; height: number; color?: string }) {
  return (
    <g className="motion-secondary motion-window" style={{ animationDelay: `${step * 4}s` }}>
      <rect x={x} y={y} width={width} height={height} rx="17" fill="none" stroke={color} strokeWidth="2" />
      <path className="document-write" d={`M${x + 18} ${y + height}h${width - 36}`} fill="none" stroke={color} strokeWidth="4" style={{ animationDelay: `${step * 4 + .6}s`, animationDuration: '2.8s' }} />
    </g>
  );
}

export function ProductCreEditorScene() {
  const id = useId().replace(/:/g, '');
  return (
    <g data-motion-scene="creeditor" data-creeditor-mode="content">
      <defs>
        <clipPath id={`${id}-thumb`}><rect width="62" height="60" rx="7" /></clipPath>
      </defs>
      <Enter>
        <text x="38" y="46" fill={C.text} fontSize="25">그뚠이의 아이디어가, 콘텐츠 상품으로.</text>
        <text x="721" y="44" fill={C.muted} fontSize="14" textAnchor="end">브랜드 시연</text>
        <path d="M38 64h684" stroke={C.border} />
      </Enter>

      <path d="M232 250h26M517 250h32" stroke={C.border} strokeWidth="2" fill="none" />
      <SignalPath d="M204 174h29q12 0 12 12v52q0 12 12 12h22" delay={.7} color={C.blue} />
      <SignalPath d="M204 337h29q12 0 12-12v-63q0-12 12-12h22" delay={2.4} color={C.teal} />
      <SignalPath d="M497 250h53" delay={4.5} color={C.teal} duration={2.6} />
      <SignalPath d="M620 407v17H388v-26" delay={8.5} color={C.blue} duration={3} reverse />

      <Enter delay={.15}>
        <text x="42" y="103" fill={C.blue} fontSize="18">01 · 콘텐츠 패키지</text>
        <rect x="38" y="119" width="194" height="283" rx="15" fill={C.surface} stroke={C.border} />
        <g transform="translate(50 135)">
          <g clipPath={`url(#${id}-thumb)`}>
            <image href={SHOWREEL_MEDIA.productFilmPoster} width="62" height="60" preserveAspectRatio="xMidYMid slice" />
            <Play x={31} y={30} radius={12} />
          </g>
          <text x="74" y="24" fill={C.text} fontSize="20">브랜드 영상</text>
          <text x="74" y="49" fill={C.muted} fontSize="15">영상 · 숏폼</text>
        </g>
        <path d="M52 208h166" stroke={C.border} />
        <g transform="translate(50 219)">
          <rect width="62" height="60" rx="7" fill={C.blue} />
          <circle cx="44" cy="18" r="10" fill={C.text} />
          <path d="m2 57 18-29 16 15 12-13 13 27Z" fill={C.surface} />
          <text x="74" y="24" fill={C.text} fontSize="20">디자인 팩</text>
          <text x="74" y="49" fill={C.muted} fontSize="15">이미지 · 템플릿</text>
        </g>
        <path d="M52 291h166" stroke={C.border} />
        <g transform="translate(50 303)">
          <g clipPath={`url(#${id}-thumb)`}>
            <image href={SHOWREEL_MEDIA.webtoon} width="124" height="186" preserveAspectRatio="xMinYMin slice" />
          </g>
          <text x="74" y="24" fill={C.text} fontSize="20">웹툰 시리즈</text>
          <text x="74" y="49" fill={C.muted} fontSize="15">이야기 · 일러스트</text>
        </g>
        <rect x="51" y="376" width="168" height="4" rx="2" fill={C.border} />
        <rect className="progress" x="51" y="376" width="168" height="4" rx="2" fill={C.blue} style={{ animationDuration: '3s' }} />
      </Enter>

      <Enter delay={.5}>
        <ProductContentSaleScene id={id} />
      </Enter>

      <Enter delay={.9}>
        <text x="552" y="103" fill={C.teal} fontSize="18">03 · 주문과 전달</text>
        <rect x="548" y="119" width="174" height="283" rx="15" fill={C.surface} stroke={C.border} />
        <rect x="565" y="133" width="140" height="74" rx="9" fill="#e8eee2" />
        <image data-content-delivery-preview href={SHOWREEL_MEDIA.mascots.success} x="568" y="136" width="69" height="69" preserveAspectRatio="xMidYMid meet" />
        <rect x="647" y="153" width="43" height="42" rx="7" fill={C.surface} />
        <Check x={661} y={174} />
        <text x="635" y="230" fill={C.text} textAnchor="middle" fontSize="21">디지털 상품</text>
        <path d="M568 248h134" stroke={C.border} />
        <text x="566" y="276" fill={C.muted} fontSize="18">주문 확인</text><Check x={682} y={269} />
        <text x="566" y="312" fill={C.muted} fontSize="18">파일 전달</text><Check x={682} y={305} />
        <rect x="565" y="342" width="140" height="38" rx="8" fill={C.teal} />
        <text x="635" y="367" fill={C.ink} textAnchor="middle" fontSize="19">콘텐츠 수령</text>
        <ReactionBurst x={635} y={175} color={C.teal} delay={8.1} />
      </Enter>

      <StepOutline step={0} x={35} y={116} width={200} height={289} color={C.blue} />
      <StepOutline step={1} x={255} y={83} width={265} height={322} color={C.blue} />
      <StepOutline step={2} x={545} y={116} width={180} height={289} />
      <text x="38" y="474" fill={C.muted} fontSize="19">콘텐츠 제작</text>
      <path d="M177 468h58m-7-5 7 5-7 5M421 468h58m-7-5 7 5-7 5" fill="none" stroke={C.border} strokeWidth="2" />
      <text x="269" y="474" fill={C.text} fontSize="19">상품 구성 · 판매</text>
      <text x="514" y="474" fill={C.teal} fontSize="19">주문 확인 · 전달</text>
      <StepRibbon step={0} title="그뚠이와 콘텐츠 만들기" detail="영상 · 이미지 · 웹툰" accent={C.blue} />
      <StepRibbon step={1} title="나만의 콘텐츠 상품 소개" detail="패키지 구성 · 판매" accent={C.blue} />
      <StepRibbon step={2} title="주문 확인! 콘텐츠 전달 완료" detail="그뚠이의 완료 알림" />
    </g>
  );
}
