'use client';

import { useId, type ReactNode } from 'react';
import { ReactionBurst, SignalPath, SignalPing } from './ProductMotionEffects';

const C = {
  ink: '#07101f', surface: '#0d203c', raised: '#172e4a', border: '#314968',
  text: '#f3f7ff', muted: '#a9b9cf', blue: '#93c5fd', teal: '#5eead4', amber: '#f5c766',
};

const PLATFORMS = [
  { id: 'naver', name: '네이버스토어', logo: '/images/corp/commerce/naver.png', accent: '#53e38b', item: '데스크 조명', detail: '스토어 상품 소개' },
  { id: 'coupang', name: '쿠팡파트너스', logo: '/images/corp/commerce/coupang.png', accent: '#7dbdff', item: '무선 헤드폰', detail: '제휴 상품 소개' },
  { id: 'aliexpress', name: 'AliExpress', logo: '/images/corp/commerce/aliexpress.png', accent: '#ffaf83', item: '미니 카메라', detail: '글로벌 상품 소개' },
  { id: 'temu', name: 'TEMU', logo: '/images/corp/commerce/temu.png', accent: '#ffc077', item: '테이블 클록', detail: '라이프 상품 소개' },
] as const;

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

/** Original product illustrations keep the sample separate from real marketplace inventory. */
function ProductObject({ kind, color }: { kind: number; color: string }) {
  if (kind === 0) {
    return (
      <g>
        <path d="m18 28-73 107h150L35 28Z" fill={color} opacity=".12" />
        <ellipse cy="139" rx="73" ry="14" fill={C.ink} opacity=".3" />
        <path d="M3 12v115" stroke={C.text} strokeWidth="10" strokeLinecap="round" />
        <ellipse cy="130" rx="43" ry="9" fill={C.text} />
        <path d="m-44 30 22-53h48l25 53Z" fill={color} stroke={C.text} strokeOpacity=".65" />
        <ellipse cx="3" cy="30" rx="48" ry="9" fill={C.text} />
        <ellipse cx="3" cy="31" rx="35" ry="5" fill={color} />
        <path d="M3 52v49" stroke={color} strokeWidth="2" />
      </g>
    );
  }
  if (kind === 1) {
    return (
      <g>
        <ellipse cy="143" rx="70" ry="13" fill={C.ink} opacity=".3" />
        <path d="M-53 90V43a53 53 0 0 1 106 0v47" fill="none" stroke={C.ink} strokeWidth="23" />
        <path d="M-53 69V43a53 53 0 0 1 106 0v26" fill="none" stroke={color} strokeWidth="14" />
        <rect x="-69" y="65" width="35" height="65" rx="15" fill={C.text} transform="rotate(-9 -52 97)" />
        <rect x="34" y="65" width="35" height="65" rx="15" fill={C.text} transform="rotate(9 52 97)" />
        <rect x="-61" y="74" width="13" height="44" rx="6" fill={color} />
        <rect x="48" y="74" width="13" height="44" rx="6" fill={color} />
      </g>
    );
  }
  if (kind === 2) {
    return (
      <g>
        <ellipse cy="139" rx="80" ry="13" fill={C.ink} opacity=".3" />
        <rect x="-76" y="23" width="152" height="100" rx="22" fill={C.text} />
        <path d="M-76 62H76v38a23 23 0 0 1-23 23H-53a23 23 0 0 1-23-23Z" fill={color} />
        <rect x="-53" y="11" width="33" height="15" rx="5" fill={color} />
        <circle cx="6" cy="73" r="40" fill={C.surface} stroke={C.ink} strokeWidth="7" />
        <circle cx="6" cy="73" r="25" fill={C.border} stroke={color} strokeWidth="3" />
        <circle cx="-3" cy="64" r="10" fill={C.blue} opacity=".7" />
        <rect x="-59" y="37" width="25" height="10" rx="3" fill={C.ink} />
        <circle cx="56" cy="39" r="5" fill={color} />
      </g>
    );
  }
  return (
    <g>
      <ellipse cy="143" rx="77" ry="12" fill={C.ink} opacity=".3" />
      <rect x="-69" y="6" width="138" height="127" rx="32" fill={color} />
      <rect x="-54" y="22" width="108" height="88" rx="20" fill={C.ink} />
      <text x="0" y="79" textAnchor="middle" fill={C.text} fontSize="35" fontFamily="monospace">09:41</text>
      <path d="M-20 96h40" stroke={color} strokeWidth="3" strokeLinecap="round" />
      <rect x="-43" y="132" width="18" height="8" rx="3" fill={C.text} />
      <rect x="25" y="132" width="18" height="8" rx="3" fill={C.text} />
    </g>
  );
}

function ContentSale({ id }: { id: string }) {
  return (
    <>
      <defs>
        <clipPath id={`${id}-film`}><rect x="279" y="133" width="217" height="131" rx="9" /></clipPath>
        <clipPath id={`${id}-thumb`}><rect width="62" height="60" rx="7" /></clipPath>
      </defs>
      <Enter>
        <text x="38" y="46" fill={C.text} fontSize="25">만든 콘텐츠가, 하나의 상품이 되다.</text>
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
            <image href="/videos/corp/product-story-youtube.jpg" width="62" height="60" preserveAspectRatio="xMidYMid slice" />
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
            <image href="/images/corp/founder-story/episode-1.png" width="124" height="186" preserveAspectRatio="xMinYMin slice" />
          </g>
          <text x="74" y="24" fill={C.text} fontSize="20">웹툰 시리즈</text>
          <text x="74" y="49" fill={C.muted} fontSize="15">이야기 · 일러스트</text>
        </g>
        <rect x="51" y="376" width="168" height="4" rx="2" fill={C.border} />
        <rect className="progress" x="51" y="376" width="168" height="4" rx="2" fill={C.blue} style={{ animationDuration: '3s' }} />
      </Enter>

      <Enter delay={.5}>
        <rect x="258" y="86" width="259" height="316" rx="16" fill={C.text} />
        <circle cx="278" cy="109" r="3" fill={C.border} /><circle cx="290" cy="109" r="3" fill={C.border} opacity=".5" /><circle cx="302" cy="109" r="3" fill={C.border} opacity=".25" />
        <text x="495" y="114" textAnchor="end" fill={C.ink} fontSize="14">CREEDITOR / SHOP</text>
        <g clipPath={`url(#${id}-film)`}>
          <image className="video-pan" href="/videos/corp/product-story-youtube.jpg" x="279" y="133" width="217" height="131" preserveAspectRatio="xMidYMid slice" />
          <Play x={387} y={198} radius={23} />
          <rect x="287" y="142" width="56" height="22" rx="5" fill={C.ink} />
          <text x="315" y="158" textAnchor="middle" fill={C.text} fontSize="12">PREVIEW</text>
          <rect className="clip-sweep motion-only" x="279" y="133" width="70" height="131" fill={C.text} />
        </g>
        <text x="279" y="295" fill={C.ink} fontSize="23">브랜드 스토리 팩</text>
        <text x="279" y="321" fill={C.border} fontSize="16">영상 + 이미지 + 웹툰</text>
        <rect x="279" y="340" width="217" height="42" rx="8" fill={C.ink} />
        <text x="386" y="367" textAnchor="middle" fill={C.text} fontSize="19">콘텐츠 상품 보기</text>
        <g className="motion-only reaction-pop" style={{ animationDelay: '4.5s' }}>
          <path d="m467 360 8 23 5-9 9-4Z" fill={C.teal} stroke={C.ink} strokeWidth="2" />
        </g>
        <SignalPing x={387} y={361} radius={24} delay={4.8} duration={4} />
      </Enter>

      <Enter delay={.9}>
        <text x="552" y="103" fill={C.teal} fontSize="18">03 · 주문과 전달</text>
        <rect x="548" y="119" width="174" height="283" rx="15" fill={C.surface} stroke={C.border} />
        <circle cx="635" cy="175" r="31" fill={C.raised} stroke={C.teal} strokeOpacity=".5" />
        <path d="M622 169h26v25h-26Z" fill="none" stroke={C.teal} strokeWidth="2" /><path d="M628 169v-5a7 7 0 0 1 14 0v5" fill="none" stroke={C.teal} strokeWidth="2" />
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
      <StepRibbon step={0} title="콘텐츠를 상품으로 구성" detail="영상 · 이미지 · 웹툰" accent={C.blue} />
      <StepRibbon step={1} title="상품 미리보기 공개" detail="패키지 소개 · 구매 연결" accent={C.blue} />
      <StepRibbon step={2} title="주문에서 콘텐츠 전달까지" detail="파일 전달 완료 시연" />
    </>
  );
}

function AdvertisingSale({ id, platform }: { id: string; platform: number }) {
  const selected = PLATFORMS[platform] ?? PLATFORMS[0];
  const index = PLATFORMS.indexOf(selected);
  return (
    <g data-commerce-platform={selected.id}>
      <defs><clipPath id={`${id}-creative`}><rect x="263" y="126" width="239" height="231" rx="9" /></clipPath></defs>
      <Enter>
        <text x="38" y="46" fill={C.text} fontSize="25">상품을 발견하고, 콘텐츠로 연결하다.</text>
        <text x="721" y="44" fill={C.muted} fontSize="14" textAnchor="end">브랜드 시연</text>
        <path d="M38 64h684" stroke={C.border} />
      </Enter>
      <path d="M212 251h36M518 251h28" stroke={C.border} strokeWidth="2" />
      <SignalPath d={`M199 ${151 + index * 63}h25q12 0 12 ${index < 2 ? 12 : -12}V239q0 12 12 12h16`} color={selected.accent} delay={.8} duration={2.7} />
      <SignalPath d="M502 251h44" delay={4.2} color={selected.accent} duration={2.7} />
      <SignalPath d="M635 405v20H382v-24" delay={8.3} color={C.teal} duration={3.7} reverse />

      <Enter delay={.15}>
        <text x="40" y="102" fill={selected.accent} fontSize="18">01 · 상품 채널</text>
        {PLATFORMS.map((item, itemIndex) => (
          <g key={item.id} transform={`translate(38 ${124 + itemIndex * 63})`} opacity={item.id === selected.id ? 1 : .58}>
            <rect width="174" height="54" rx="10" fill={item.id === selected.id ? C.raised : C.surface} stroke={item.id === selected.id ? item.accent : C.border} strokeWidth={item.id === selected.id ? 2 : 1} />
            {item.id === 'coupang' ? (
              <>
                <rect x="10" y="4" width="120" height="32" rx="5" fill="#fff" />
                <image href={item.logo} x="14" y="5" width="112" height="32" preserveAspectRatio="xMidYMid meet" />
                <text x="15" y="46" fill={C.muted} fontSize="12">쿠팡파트너스</text>
              </>
            ) : (
              <>
                <rect x="10" y="10" width="34" height="34" rx="8" fill="#fff" />
                <image href={item.logo} x="13" y="13" width="28" height="28" preserveAspectRatio="xMidYMid meet" />
                <text x="53" y="34" fill={C.text} fontSize={itemIndex < 2 ? 17 : 20}>{item.name}</text>
              </>
            )}
          </g>
        ))}
        <text x="41" y="402" fill={C.muted} fontSize="16">상품 · 제휴 링크 활용</text>
      </Enter>

      <Enter delay={.45}>
        <rect x="247" y="84" width="271" height="323" rx="17" fill={C.text} />
        <circle cx="270" cy="107" r="4" fill={selected.accent} />
        <text x="283" y="113" fill={C.ink} fontSize="16">CREEDITOR / AD STUDIO</text>
        <g clipPath={`url(#${id}-creative)`}>
          <rect x="263" y="126" width="239" height="231" fill={C.raised} />
          <circle cx="382" cy="234" r="91" fill="none" stroke={selected.accent} strokeOpacity=".22" />
          <circle cx="382" cy="234" r="70" fill="none" stroke={selected.accent} strokeOpacity=".13" />
          <text x="278" y="151" fill={selected.accent} fontSize="12">EVERYDAY, REIMAGINED.</text>
          <g transform="translate(382 181)"><g className="float"><ProductObject kind={index} color={selected.accent} /></g></g>
          <path className="clip-sweep motion-only" d="m245 126 45 0 90 231h-45Z" fill={C.text} />
          <rect x="275" y="330" width="135" height="20" rx="10" fill={C.ink} />
          <text x="343" y="345" fill={C.text} textAnchor="middle" fontSize="12">상품 소개 영상 · 시연</text>
          <Play x={479} y={336} radius={13} />
        </g>
        <text x="264" y="387" fill={C.ink} fontSize="21">{selected.item} 스토리</text>
        <g transform="translate(470 370)"><path d="M0 0v17m7-13v9m7-16v23m7-17v11" fill="none" stroke={C.border} strokeWidth="3" strokeLinecap="round" className="wave" /></g>
      </Enter>

      <Enter delay={.9}>
        <rect x="546" y="119" width="176" height="288" rx="19" fill={C.surface} stroke={C.border} />
        <rect x="608" y="129" width="52" height="5" rx="2.5" fill={C.border} />
        <text x="634" y="167" textAnchor="middle" fill={C.text} fontSize="20">콘텐츠에서 발견</text>
        <rect x="561" y="183" width="146" height="86" rx="9" fill={C.raised} />
        <g transform="translate(634 191) scale(.47)"><ProductObject kind={index} color={selected.accent} /></g>
        <text x="634" y="295" textAnchor="middle" fill={C.text} fontSize="19">{selected.item}</text>
        <rect x="560" y="312" width="148" height="37" rx="8" fill={selected.accent} />
        <text x="634" y="337" textAnchor="middle" fill={C.ink} fontSize="18">상품 링크 보기</text>
        <g className="motion-only reaction-pop" style={{ animationDelay: '5.2s' }}><path d="m682 332 7 20 4-8 8-3Z" fill={C.text} stroke={C.ink} strokeWidth="2" /></g>
        <path d="M561 362h146" stroke={C.border} />
        <path d="M569 380c-7-9-17 2 0 12 17-10 7-21 0-12Z" fill="none" stroke={selected.accent} strokeWidth="1.7" />
        <text x="586" y="390" fill={C.muted} fontSize="15">관심 · 클릭 · 유입</text>
        <SignalPing x={634} y={331} radius={26} color={selected.accent} delay={5} duration={3.8} />
        <ReactionBurst x={569} y={383} color={selected.accent} delay={8.1} duration={3.9} />
      </Enter>

      <g className="motion-only motion-secondary notification" style={{ animationDelay: '8s', animationDuration: '3.8s' }}>
        <rect x="551" y="75" width="170" height="33" rx="16" fill={selected.accent} />
        <Check x={563} y={91} color={C.ink} /><text x="590" y="98" fill={C.ink} fontSize="17">상품 링크 연결</text>
      </g>
      <StepOutline step={0} x={35} y={121 + index * 63} width={180} height={60} color={selected.accent} />
      <StepOutline step={1} x={244} y={81} width={277} height={329} color={selected.accent} />
      <StepOutline step={2} x={543} y={116} width={182} height={294} color={selected.accent} />
      <text x="38" y="474" fill={C.muted} fontSize="19">상품 선택</text>
      <path d="M153 468h72m-7-5 7 5-7 5M417 468h62m-7-5 7 5-7 5" fill="none" stroke={C.border} strokeWidth="2" />
      <text x="263" y="474" fill={C.text} fontSize="19">콘텐츠 제작 · 광고</text>
      <text x="514" y="474" fill={selected.accent} fontSize="19">상품 링크 · 반응</text>
      <StepRibbon step={0} title={`${selected.name} 상품 선택`} detail={selected.detail} accent={selected.accent} />
      <StepRibbon step={1} title="상품의 매력을 콘텐츠로" detail="영상 · 리뷰 · 광고 소재" accent={selected.accent} />
      <StepRibbon step={2} title="관심에서 상품 링크까지" detail="클릭 · 유입 흐름 시연" accent={selected.accent} />
    </g>
  );
}

export function ProductCreEditorScene({ variant = 0, platform = 0 }: { variant?: number; platform?: number } = {}) {
  const id = useId().replace(/:/g, '');
  const advertising = variant === 1;
  return (
    <g data-motion-scene="creeditor" data-creeditor-mode={advertising ? 'advertising' : 'content'}>
      {advertising ? <AdvertisingSale id={id} platform={platform} /> : <ContentSale id={id} />}
    </g>
  );
}
