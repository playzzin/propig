'use client';

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
};

function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return <g className="assemble" style={{ animationDelay: `${delay}s` }}>{children}</g>;
}

function Tick({ x, y, color = C.pine }: { x: number; y: number; color?: string }) {
  return <path d={`m${x} ${y + 5} 5 5 10-11`} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />;
}

function ClipCut({ children, delay, duration = 3.6 }: { children: ReactNode; delay: number; duration?: number }) {
  return <g className="motion-secondary motion-window" style={{ animationDelay: `${delay}s`, animationDuration: `${duration}s` }}>{children}</g>;
}

function Notification({ x, y, label, delay, width = 174, duration = 2.3, color = C.lime }: {
  x: number; y: number; label: string; delay: number; width?: number; duration?: number; color?: string;
}) {
  return (
    <g transform={`translate(${x} ${y})`} data-motion-notification={label}>
      <g className="motion-secondary notification" style={{ animationDelay: `${delay}s`, animationDuration: `${duration}s` }}>
        <rect width={width} height="31" rx="15.5" fill={color} />
        <circle cx="18" cy="15.5" r="9" fill={C.pine} />
        <path d="m14 15 3 3 5-6" stroke={C.cream} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <text x="34" y="21" fontSize="16" fill={C.pine}>{label}</text>
      </g>
    </g>
  );
}

function ProductFilm({ gradient }: { gradient: string }) {
  return (
    <>
      <rect width="160" height="250" fill={C.coral} />
      <path d="M0 0h59L0 190ZM160 0h-23L32 250h128Z" fill={C.cream} opacity=".25" />
      <g className="video-pan">
        <circle cx="80" cy="112" r="67" fill="none" stroke={C.cream} strokeWidth="1" opacity=".7" />
        <g className="orbit" style={{ transformOrigin: '80px 112px', transformBox: 'view-box' }}>
          <ellipse cx="80" cy="112" rx="72" ry="23" fill="none" stroke={C.pine} strokeWidth="1.3" opacity=".4" transform="rotate(-34 80 112)" />
          <circle cx="31" cy="78" r="5" fill={C.lime} />
        </g>
        <path d="M20 190h120v60H20Z" fill={C.pine} />
        <ellipse cx="80" cy="190" rx="60" ry="16" fill={C.muted} />
        <ellipse cx="84" cy="188" rx="33" ry="9" fill={C.deep} opacity=".45" />
        <g className="float">
          <rect x="62" y="58" width="36" height="21" rx="4" fill={C.pine} />
          <path d="M59 77h42q7 0 7 8v89q0 11-11 11H63q-11 0-11-11V85q0-8 7-8Z" fill={`url(#${gradient})`} />
          <path d="M59 86v82" stroke={C.cream} strokeWidth="3" strokeLinecap="round" opacity=".6" />
          <rect x="59" y="110" width="42" height="43" rx="2" fill={C.pine} />
          <path d="M69 120h22m-22 7h15m-15 13h22" stroke={C.lime} strokeWidth="2" />
          <circle cx="81" cy="96" r="4" fill={C.pine} opacity=".45" />
        </g>
      </g>
      <ClipCut delay={3.4}>
        <rect width="160" height="250" fill={C.teal} />
        <g className="video-pan">
          <circle cx="110" cy="100" r="91" fill={C.cream} opacity=".45" />
          <path d="M-20 190 180 101v149H-20Z" fill={C.pine} />
          <g transform="translate(35 49) rotate(-12 45 87)">
            <g className="float">
              <rect x="25" y="0" width="39" height="26" rx="5" fill={C.pine} />
              <rect x="14" y="22" width="61" height="118" rx="15" fill={`url(#${gradient})`} />
              <rect x="20" y="55" width="49" height="47" rx="3" fill={C.pine} />
              <text x="44" y="77" textAnchor="middle" fill={C.lime} fontSize="11">YOUR</text>
              <text x="44" y="91" textAnchor="middle" fill={C.cream} fontSize="11">STORY.</text>
              <path d="M23 36v69" stroke="white" strokeWidth="3" opacity=".7" />
            </g>
          </g>
        </g>
        <text x="13" y="22" fill={C.pine} fontSize="14">A NEW</text>
        <text x="13" y="40" fill={C.pine} fontSize="14">PERSPECTIVE.</text>
      </ClipCut>
      <ClipCut delay={7.1} duration={4}>
        <rect width="160" height="250" fill={C.pine} />
        <g className="video-pan">
          <circle cx="133" cy="118" r="100" fill={C.coral} />
          <path d="m-20 224 180-83v109H-20Z" fill={C.lime} />
          <g transform="translate(71 83)">
            <g className="float">
              <rect x="7" width="26" height="18" rx="3" fill={C.pine} />
              <rect y="14" width="40" height="72" rx="8" fill={`url(#${gradient})`} />
              <rect x="6" y="37" width="28" height="27" rx="2" fill={C.pine} />
              <path d="M12 45h16m-16 7h11" stroke={C.lime} strokeWidth="2" />
            </g>
          </g>
        </g>
        <text x="13" y="36" fill={C.cream} fontSize="24" fontWeight="800">DESIGNED</text>
        <text x="13" y="63" fill={C.cream} fontSize="24" fontWeight="800">TO MOVE.</text>
        <SignalPing x={92} y={125} delay={.8} radius={31} color={C.cream} />
      </ClipCut>
      <g className="motion-only clip-sweep" opacity=".18"><path d="M-60 0h22L61 250H39Z" fill="white" /></g>
    </>
  );
}

function LandscapeFilm() {
  return (
    <>
      <rect width="282" height="145" fill={C.teal} />
      <g className="video-pan" style={{ transformOrigin: '140px 72px' }}>
        <circle cx="208" cy="36" r="25" fill={C.cream} />
        <path d="M-25 100 57 42l76 62 54-41 111 71v41H-25Z" fill={C.muted} />
        <path d="M-25 119 58 79l83 45 65-29 92 35v45H-25Z" fill={C.pine} />
        <path d="M-25 149 69 120l68 24 71-10 90 29v28H-25Z" fill={C.deep} />
        <path d="m172 110-19 19 22 12-30 13" stroke={C.teal} strokeWidth="4" opacity=".65" fill="none" />
      </g>
      <path d="M13 23v-9h12m231 0h12v9M13 122v9h12m231 0h12v-9" stroke={C.cream} strokeWidth="1.5" fill="none" opacity=".75" />
      <text x="22" y="54" fontSize="25" fill={C.cream} fontWeight="800">BEYOND</text>
      <text x="22" y="81" fontSize="25" fill={C.cream} fontWeight="800">THE FRAME.</text>
      <ClipCut delay={3.2}>
        <rect width="282" height="145" fill={C.coral} />
        <g className="video-pan">
          <circle cx="83" cy="58" r="49" fill={C.cream} />
          <path d="M-18 109 68 50l86 79 48-41 99 46v25H-18Z" fill={C.pine} />
          <path d="M-18 139 88 109l58 24 78-22 77 29v25H-18Z" fill={C.deep} />
          <path d="m104 113 26 15-19 16" stroke={C.coral} strokeWidth="3" fill="none" />
        </g>
        <text x="164" y="39" fill={C.pine} fontSize="17">A NEW VIEW.</text>
        <rect x="167" y="49" width="84" height="2" fill={C.pine} />
        <text x="18" y="112" fill={C.cream} fontSize="16">하나의 이야기가 장면이 되다</text>
      </ClipCut>
      <ClipCut delay={7} duration={4}>
        <rect width="282" height="145" fill={C.pine} />
        <g className="video-pan"><path d="m190-20 120 74-98 129-69-33Z" fill={C.teal} /></g>
        <g className="spin" style={{ transformOrigin: '226px 67px', transformBox: 'view-box' }}>
          <path d="m226 19 9 29 30-7-20 24 23 20-30-2-5 30-13-27-28 13 15-26-26-15 30-5Z" fill={C.lime} />
        </g>
        <text x="17" y="52" fill={C.cream} fontSize="30" fontWeight="800">MAKE</text>
        <text x="17" y="86" fill={C.lime} fontSize="30" fontWeight="800">A SCENE.</text>
        <text x="18" y="119" fill={C.cream} fontSize="16">상상을 브랜드 필름으로</text>
      </ClipCut>
      <g className="motion-only clip-sweep" opacity=".1"><path d="M-70 0h28L49 145H21Z" fill="white" /></g>
    </>
  );
}

function TypeFilm() {
  return (
    <>
      <rect width="150" height="217" fill={C.lime} />
      <g className="video-pan">
        <path d="m-45 192 170-170 26 26L-19 218Zm69 49L194 71l26 26L50 267Z" fill={C.pine} />
        <g className="spin" style={{ transformOrigin: '103px 66px', transformBox: 'view-box' }}>
          <path d="m103 19 12 30 31-4-22 22 12 29-30-13-23 22 4-31-30-12 31-8Z" fill={C.coral} />
        </g>
      </g>
      <text x="12" y="44" fill={C.pine} fontSize="24" fontWeight="800">MAKE</text>
      <text x="12" y="73" fill={C.pine} fontSize="24" fontWeight="800">IT MOVE.</text>
      <rect x="10" y="144" width="130" height="30" rx="3" fill={C.deep} />
      <text x="75" y="165" fill={C.cream} fontSize="17" textAnchor="middle">한 컷의 임팩트</text>
      <path d="M12 190h126" stroke={C.pine} strokeWidth="3" opacity=".3" />
      <path className="progress" d="M12 190h126" stroke={C.pine} strokeWidth="3" />
      <ClipCut delay={4} duration={3.2}>
        <rect width="150" height="217" fill={C.coral} />
        <g className="video-pan"><path d="m110-30 70 30-137 242-50-39Z" fill={C.pine} /></g>
        <text x="12" y="40" fill={C.cream} fontSize="27" fontWeight="800">STOP.</text>
        <text x="12" y="71" fill={C.cream} fontSize="27" fontWeight="800">WATCH.</text>
        <text x="12" y="102" fill={C.lime} fontSize="27" fontWeight="800">REPLAY.</text>
        <g className="reaction-pop" style={{ animationDelay: '4.4s', transformOrigin: '75px 157px', transformBox: 'view-box' }}>
          <path d="M75 174 49 149a15 15 0 0 1 26-15 15 15 0 0 1 26 15Z" fill={C.lime} />
        </g>
        <text x="75" y="199" textAnchor="middle" fill={C.cream} fontSize="16">눈길을 잡는 숏폼</text>
      </ClipCut>
      <ClipCut delay={7.5} duration={3.7}>
        <rect width="150" height="217" fill={C.teal} />
        <g className="spin" style={{ transformOrigin: '75px 113px', transformBox: 'view-box' }}>
          <path d="m75 51 14 39 40-8-27 30 26 31-40-9-14 39-13-39-40 8 27-30-26-31 40 9Z" fill={C.pine} />
        </g>
        <text x="12" y="34" fill={C.pine} fontSize="24" fontWeight="800">STORY</text>
        <text x="12" y="63" fill={C.pine} fontSize="24" fontWeight="800">IN MOTION.</text>
        <rect x="15" y="182" width="120" height="23" rx="11" fill={C.cream} />
        <text x="75" y="199" textAnchor="middle" fill={C.pine} fontSize="15">채널에 맞게 변환</text>
      </ClipCut>
    </>
  );
}

export function SocialContentScene() {
  const id = useId().replace(/:/g, '');
  const film = `${id}-product-film`;
  const wide = `${id}-wide`;
  const reels = `${id}-reels`;
  const short = `${id}-short`;
  const blog = `${id}-blog`;

  return (
    <g data-motion-scene="social-content">
      <defs>
        <linearGradient id={film} x1="0" x2="1">
          <stop stopColor={C.cream} />
          <stop offset=".48" stopColor="#ffffff" />
          <stop offset="1" stopColor="#cbd1b9" />
        </linearGradient>
        <clipPath id={wide}><rect width="282" height="145" rx="3" /></clipPath>
        <clipPath id={reels}><rect width="150" height="250" rx="3" /></clipPath>
        <clipPath id={short}><rect width="150" height="217" rx="3" /></clipPath>
        <clipPath id={blog}><rect width="70" height="79" rx="3" /></clipPath>
      </defs>

      <Reveal>
        <text x="37" y="43" fill={C.cream} fontSize="23">하나의 이야기, 채널마다 새로운 장면</text>
        <path d="M38 61h678" stroke={C.muted} opacity=".5" />
      </Reveal>

      <g className="motion-only" fill="none" strokeWidth="1.5">
        <path d="M188 79v-7h438v39" stroke={C.muted} opacity=".45" />
        <SignalPath d="M188 79v-7h250v6" color={C.lime} delay={1.6} duration={3} />
        <SignalPath d="M438 78v-6h188v39" color={C.teal} delay={3.2} duration={3.4} />
        <SignalPath d="M35 205H21v177h12" color={C.coral} delay={4.5} duration={3.2} />
      </g>

      <Reveal delay={.2}>
        <rect x="43" y="91" width="304" height="221" rx="10" fill={C.deep} />
        <rect x="35" y="83" width="304" height="221" rx="10" fill={C.cream} />
        <rect x="49" y="96" width="27" height="20" rx="5" fill={C.coral} />
        <path d="m59 101 8 5-8 5Z" fill={C.pine} />
        <text x="84" y="113" fill={C.pine} fontSize="19">YouTube</text>
        <text x="323" y="112" textAnchor="end" fill={C.muted} fontSize="16">16:9</text>
        <g transform="translate(46 127)">
          <g clipPath={`url(#${wide})`}><LandscapeFilm /></g>
        </g>
        <SignalPing x={307} y={145} delay={2} color={C.cream} radius={10} />
        <rect x="58" y="252" width="258" height="3" rx="1.5" fill={C.cream} opacity=".3" />
        <rect className="progress" x="58" y="252" width="258" height="3" rx="1.5" fill={C.lime} />
        <text x="49" y="292" fill={C.pine} fontSize="17">브랜드 필름 · 장면과 사운드</text>
      </Reveal>

      <Reveal delay={.55}>
        <rect x="362" y="88" width="166" height="330" rx="23" fill={C.deep} />
        <rect x="355" y="80" width="166" height="330" rx="23" fill={C.cream} />
        <text x="370" y="110" fill={C.pine} fontSize="20">Instagram</text>
        <g transform="translate(363 121)">
          <g clipPath={`url(#${reels})`}><ProductFilm gradient={film} /></g>
        </g>
        <g transform="translate(491 149)">
          <g className="motion-only reaction-pop" style={{ animationDelay: '2.1s' }}>
            <circle r="14" fill={C.cream} />
            <path d="M0 6-7-1a4 4 0 0 1 7-4 4 4 0 0 1 7 4Z" fill={C.pine} />
          </g>
        </g>
        <ReactionBurst x={491} y={149} delay={2.5} color={C.lime} />
        <rect x="375" y="324" width="126" height="29" rx="3" fill={C.pine} />
        <text x="438" y="344" textAnchor="middle" fill={C.cream} fontSize="17">브랜드 릴스</text>
        <path d="M375 363h125" stroke={C.cream} strokeWidth="3" opacity=".4" />
        <path className="progress" d="M375 363h125" stroke={C.lime} strokeWidth="3" />
        <text x="369" y="394" fill={C.pine} fontSize="16">Reels</text>
        <text x="504" y="394" textAnchor="end" fill={C.muted} fontSize="16">9:16</text>
      </Reveal>

      <Reveal delay={.9}>
        <rect x="551" y="123" width="166" height="296" rx="23" fill={C.deep} />
        <rect x="544" y="115" width="166" height="296" rx="23" fill={C.pine} stroke={C.muted} strokeWidth="2" />
        <text x="560" y="145" fill={C.cream} fontSize="20">TikTok</text>
        <g transform="translate(552 156)">
          <g clipPath={`url(#${short})`}><TypeFilm /></g>
        </g>
        <ReactionBurst x={681} y={345} delay={5.4} color={C.cream} />
        <text x="559" y="394" fill={C.cream} fontSize="16">Short video</text>
        <path d="m681 385 5 5-5 5m8-10 5 5-5 5" stroke={C.teal} strokeWidth="2" fill="none" />
      </Reveal>

      <Reveal delay={1.2}>
        <rect x="43" y="330" width="304" height="119" rx="9" fill={C.deep} />
        <rect x="35" y="322" width="304" height="119" rx="9" fill={C.cream} />
        <text x="50" y="348" fill={C.pine} fontSize="20">Blog</text>
        <text x="323" y="348" textAnchor="end" fill={C.muted} fontSize="16">스토리 에디터</text>
        <g transform="translate(50 358)">
          <g clipPath={`url(#${blog})`}>
            <g transform="translate(-1 -15) scale(.46)"><ProductFilm gradient={film} /></g>
          </g>
        </g>
        <text x="135" y="380" fill={C.pine} fontSize="18">장면에서 시작한 이야기</text>
        <path d="M136 394h173m-173 10h147m-147 10h164" stroke={C.muted} strokeWidth="3" opacity=".45" />
        <path className="cursor" d="M312 389v11" stroke={C.pine} strokeWidth="2" />
        <g className="motion-only">
          <SignalPath d="M136 394h173" color={C.pine} delay={2} duration={2.5} />
          <SignalPath d="M136 404h147" color={C.pine} delay={2.4} duration={2.5} />
          <SignalPath d="M136 414h164" color={C.pine} delay={2.8} duration={2.5} />
        </g>
      </Reveal>

      <Reveal delay={1.7}>
        <path d="M363 434h347M363 434v-12m347 12v-12" stroke={C.muted} fill="none" />
        <text x="536" y="456" fill={C.teal} textAnchor="middle" fontSize="16">영상 · 자막 · 채널별 포맷</text>
        <path d="M38 475h676" stroke={C.muted} opacity=".4" />
        <text x="38" y="502" fill={C.cream} fontSize="18">기획</text>
        <path className="flow" d="M91 495h66m107 0h66m147 0h64" stroke={C.teal} strokeWidth="2" strokeDasharray="5 5" />
        <SignalPath d="M91 495h66" color={C.lime} delay={1.4} duration={2.2} />
        <SignalPath d="M264 495h66" color={C.lime} delay={2.1} duration={2.2} />
        <SignalPath d="M477 495h64" color={C.lime} delay={2.8} duration={2.2} />
        <text x="178" y="502" fill={C.cream} fontSize="18">생성·편집</text>
        <text x="351" y="502" fill={C.cream} fontSize="18">채널별 변환</text>
        <text x="563" y="502" fill={C.lime} fontSize="18">콘텐츠 전달</text>
      </Reveal>
      <Notification x={541} y={20} label="YouTube 영상 전달" delay={2} />
      <Notification x={541} y={20} label="Reels 포맷 변환" delay={4.3} color={C.teal} />
      <Notification x={541} y={20} label="TikTok 숏폼 완성" delay={6.6} color={C.coral} />
      <Notification x={541} y={20} label="블로그 이야기 연결" delay={8.9} />
    </g>
  );
}

export function RevenuePartnerScene({ variant = 0 }: { variant?: number } = {}) {
  const id = useId().replace(/:/g, '');
  const product = `${id}-partner-product`;
  const creative = `${id}-partner-creative`;
  const advertising = variant === 1;

  return (
    <g data-motion-scene="revenue-partner" data-partner-mode={advertising ? 'advertising' : 'content'}>
      <defs>
        <clipPath id={product}><rect width="75" height="87" rx="4" /></clipPath>
        <clipPath id={creative}><rect width="75" height="87" rx="4" /></clipPath>
      </defs>

      <Reveal>
        <text x="38" y="44" fill={C.cream} fontSize="23">{advertising ? '광고의 관심을, 상품의 주문으로' : '만든 콘텐츠를, 판매할 수 있는 상품으로'}</text>
        <path d="M38 64h676" stroke={C.muted} opacity=".5" />
      </Reveal>

      <g fill="none" strokeWidth="2">
        <path d="M284 176h28q12 0 12 12v63h24M284 351h28q12 0 12-12v-64h24" stroke={C.muted} />
        <path className="trace" pathLength="1" d="M284 176h28q12 0 12 12v63h24" stroke={C.lime} style={{ animationDelay: '1.1s' }} />
        <path className="trace" pathLength="1" d="M284 351h28q12 0 12-12v-64h24" stroke={C.teal} style={{ animationDelay: '1.5s' }} />
        <path className="flow" d="M324 250h24m-24 25h24" stroke={C.cream} strokeDasharray="4 6" />
        <SignalPath d="M284 176h28q12 0 12 12v63h24" color={C.lime} delay={1.5} duration={3.2} />
        <SignalPath d="M284 351h28q12 0 12-12v-64h24" color={C.teal} delay={2.7} duration={3.2} />
        <SignalPath d="M284 176h28q12 0 12 12v63h24" color={C.cream} delay={4.8} duration={4} reverse />
      </g>

      <Reveal delay={.25}>
        <rect x="45" y="102" width="239" height="150" rx="12" fill={C.deep} />
        <rect x="38" y="94" width="239" height="150" rx="12" fill={C.cream} stroke={advertising ? C.muted : C.lime} strokeWidth={advertising ? 1 : 3} />
        <text x="56" y="125" fill={C.pine} fontSize="22">생성형</text>
        <rect x="211" y="109" width="48" height="24" rx="12" fill={C.lime} />
        <text x="235" y="127" fill={C.pine} fontSize="16" textAnchor="middle">제작</text>
        <g transform="translate(56 141)">
          <g clipPath={`url(#${product})`}>
            <rect width="75" height="87" fill={C.coral} />
            <g className="video-pan">
              <circle cx="38" cy="40" r="30" fill="none" stroke={C.cream} />
              <path d="M5 70h65v17H5Z" fill={C.muted} />
              <ellipse cx="38" cy="70" rx="33" ry="8" fill={C.pine} />
              <g className="float">
                <rect x="31" y="21" width="14" height="9" rx="2" fill={C.pine} />
                <rect x="25" y="28" width="26" height="41" rx="5" fill={C.cream} />
                <rect x="28" y="41" width="20" height="16" rx="1" fill={C.pine} />
                <path d="M32 46h12m-12 5h8" stroke={C.lime} />
              </g>
            </g>
            <ClipCut delay={3.5} duration={3.5}>
              <rect width="75" height="87" fill={C.pine} />
              <g className="video-pan">
                <circle cx="52" cy="22" r="17" fill={C.lime} />
                <path d="m-9 77 35-41 30 27 29-31v64H-9Z" fill={C.teal} />
              </g>
              <text x="8" y="19" fill={C.cream} fontSize="12">BRAND</text>
              <text x="8" y="33" fill={C.cream} fontSize="12">FILM.</text>
            </ClipCut>
            <ClipCut delay={7.3} duration={3.7}>
              <rect width="75" height="87" fill={C.lime} />
              <g className="spin" style={{ transformOrigin: '39px 42px', transformBox: 'view-box' }}>
                <path d="m39 10 7 22 23-3-17 16 10 21-22-9-16 17 3-23-21-8 22-6Z" fill={C.pine} />
              </g>
              <text x="37" y="79" textAnchor="middle" fill={C.pine} fontSize="11">CONTENT PACK</text>
            </ClipCut>
          </g>
        </g>
        <text x="145" y="167" fill={C.pine} fontSize="18">{advertising ? '광고 소재 제작' : '영상 · 웹툰'}</text>
        <text x="145" y="193" fill={C.pine} fontSize="18">{advertising ? '채널별 편집' : '패키지 판매'}</text>
        <path d="M146 211h77" stroke={C.muted} strokeWidth="2" />
        <path d="m217 206 7 5-7 5" stroke={C.pine} fill="none" strokeWidth="2" />
      </Reveal>

      <Reveal delay={.6}>
        <rect x="45" y="279" width="239" height="150" rx="12" fill={C.deep} />
        <rect x="38" y="271" width="239" height="150" rx="12" fill={C.teal} stroke={advertising ? C.lime : C.muted} strokeWidth={advertising ? 3 : 1} />
        <text x="56" y="302" fill={C.pine} fontSize="22">광고형</text>
        <rect x="211" y="286" width="48" height="24" rx="12" fill={C.pine} />
        <text x="235" y="304" fill={C.cream} fontSize="16" textAnchor="middle">광고</text>
        <g transform="translate(56 318)">
          <g clipPath={`url(#${creative})`}>
            <rect width="75" height="87" fill={C.pine} />
            <g className="spin" style={{ transformOrigin: '52px 26px', transformBox: 'view-box' }}>
              <path d="m52-4 7 18 19-2-14 13 7 18-18-8-14 14 2-19-18-7 19-5Z" fill={C.coral} />
            </g>
            <text x="7" y="29" fill={C.cream} fontSize="19">YOUR</text>
            <text x="7" y="51" fill={C.lime} fontSize="17">BRAND.</text>
            <rect x="8" y="65" width="59" height="12" rx="3" fill={C.lime} />
            <path className="cursor" d="m40 68 6 16 2-6 7-1Z" fill={C.cream} stroke={C.pine} />
            <ClipCut delay={4.3} duration={3.4}>
              <rect width="75" height="87" fill={C.coral} />
              <g className="video-pan"><path d="m52-5 33 12-50 88-28-21Z" fill={C.pine} /></g>
              <text x="7" y="28" fill={C.cream} fontSize="18">MAKE</text>
              <text x="7" y="49" fill={C.lime} fontSize="14">IT SEEN.</text>
              <rect x="8" y="65" width="59" height="13" rx="4" fill={C.cream} />
              <text x="37" y="75" textAnchor="middle" fill={C.pine} fontSize="10">자세히 보기</text>
            </ClipCut>
          </g>
        </g>
        <ReactionBurst x={106} y={389} color={C.pine} delay={3.2} />
        <text x="145" y="344" fill={C.pine} fontSize="18">{advertising ? '캠페인 연결' : '상품 알리기'}</text>
        <text x="145" y="370" fill={C.pine} fontSize="18">{advertising ? '고객 유입' : '고객과 만나기'}</text>
        <path d="M146 389h77" stroke={C.pine} strokeWidth="2" opacity=".45" />
        <path d="m217 384 7 5-7 5" stroke={C.pine} fill="none" strokeWidth="2" />
      </Reveal>

      <Reveal delay={1.1}>
        <path d="M357 156h191v227H357Z" fill={C.deep} />
        <path d="M346 145h191v227H346Z" fill={C.cream} />
        <path d="m346 145 19-37h153l19 37Z" fill={C.lime} />
        <path d="m365 108-19 37h38l11-37Zm61 0-3 37h38l-3-37Zm62 0 11 37h38l-19-37Z" fill={C.muted} />
        {[346, 384, 422, 460, 498].map((x, index) => (
          <path key={x} d={`M${x} 145h38v10a19 15 0 0 1-38 0Z`} fill={index % 2 === 0 ? C.muted : C.lime} />
        ))}
        <text x="441" y="196" textAnchor="middle" fill={C.pine} fontSize="21">{advertising ? 'AD CAMPAIGN' : 'CONTENT SHOP'}</text>
        <path d="M364 209h155" stroke={C.muted} opacity=".35" />
        <rect x="363" y="225" width="65" height="73" rx="4" fill={C.pine} />
        <path d="m370 284 16-35 14 20 16-31v60h-46Z" fill={C.teal} />
        <circle cx="378" cy="240" r="6" fill={C.lime} />
        <g transform="translate(363 225)">
          <ClipCut delay={4.6} duration={3.5}>
            <rect width="65" height="73" rx="4" fill={C.lime} />
            <g className="spin" style={{ transformOrigin: '33px 36px', transformBox: 'view-box' }}>
              <path d="m33 8 7 17 18-2-13 14 7 17-18-7-14 14 2-18-17-7 18-5Z" fill={C.pine} />
            </g>
            <text x="33" y="64" textAnchor="middle" fill={C.pine} fontSize="11">PACK</text>
          </ClipCut>
        </g>
        <rect x="442" y="225" width="77" height="73" rx="4" fill={C.coral} />
        <g className="float" style={{ animationDelay: '-2s' }}>
          <rect x="470" y="239" width="22" height="39" rx="4" fill={C.cream} />
          <rect x="474" y="233" width="14" height="8" rx="2" fill={C.pine} />
          <path d="M474 254h14m-14 5h10" stroke={C.pine} strokeWidth="2" />
        </g>
        <text x="396" y="319" textAnchor="middle" fill={C.pine} fontSize="16">{advertising ? '광고 소재' : '브랜드 필름'}</text>
        <text x="480" y="319" textAnchor="middle" fill={C.pine} fontSize="16">{advertising ? '연결 상품' : '콘텐츠 팩'}</text>
        <rect x="363" y="333" width="156" height="27" rx="5" fill={C.pine} />
        <text x="441" y="353" textAnchor="middle" fill={C.cream} fontSize="18">{advertising ? '광고 → 주문 연결' : '구매 → 콘텐츠 전달'}</text>
        <SignalPing x={441} y={347} delay={4.6} duration={3.1} radius={27} color={C.lime} />
        <g transform="translate(499 347)">
          <g className="motion-only reaction-pop" style={{ animationDelay: '4.1s' }}>
            <path d="m0 0 7 18 3-7 7-3Z" fill={C.lime} stroke={C.pine} strokeWidth="1.5" />
          </g>
        </g>
      </Reveal>

      <path className="trace" pathLength="1" d="M538 255h36" stroke={C.lime} strokeWidth="2.5" fill="none" style={{ animationDelay: '2s' }} />
      <path d="m565 249 8 6-8 6" stroke={C.lime} strokeWidth="2" fill="none" />
      <SignalPath d="M538 255h36" color={C.cream} delay={4.1} duration={2.6} />
      <SignalPath d="M538 255h36" color={C.teal} delay={6} duration={3} reverse />

      <Reveal delay={1.9}>
        <path d="M584 167h137v193l-10-6-10 6-10-6-10 6-10-6-10 6-10-6-10 6-10-6-10 6-10-6-10 6-10-6-7 5Z" fill={C.deep} />
        <path d="M577 159h137v193l-10-6-10 6-10-6-10 6-10-6-10 6-10-6-10 6-10-6-10 6-10-6-10 6-10-6-7 5Z" fill={C.cream} />
        <circle cx="645" cy="199" r="22" fill={C.lime} />
        <Tick x={637} y={195} />
        <SignalPing x={645} y={199} radius={27} delay={5.2} duration={3.8} color={C.pine} />
        <ReactionBurst x={645} y={199} delay={6.4} duration={4} color={C.pine} />
        <text x="645" y="242" textAnchor="middle" fill={C.pine} fontSize="20">{advertising ? '광고형 정산' : '콘텐츠 정산'}</text>
        <path d="M591 257h109" stroke={C.muted} strokeDasharray="3 4" />
        <text x="594" y="282" fill={C.muted} fontSize="16">{advertising ? '유입·판매' : '상품 판매'}</text>
        <Tick x={680} y={273} />
        <text x="594" y="312" fill={C.muted} fontSize="16">{advertising ? '광고 내역' : '전달 내역'}</text>
        <Tick x={680} y={303} />
      </Reveal>

      <Reveal delay={2.4}>
        <path className="flow" d="M441 379v38h203v-52" stroke={C.teal} strokeWidth="2" strokeDasharray="5 6" fill="none" />
        <SignalPath d="M441 379v38h203v-52" color={C.lime} delay={6.1} duration={3.6} />
        <rect x="523" y="395" width="138" height="43" rx="21" fill={C.lime} />
        <text x="592" y="423" textAnchor="middle" fill={C.pine} fontSize="23">수익화</text>
        <ReactionBurst x={680} y={416} delay={8.2} color={C.lime} />
        <path d="M38 457h676" stroke={C.muted} opacity=".4" />
        <text x="38" y="489" fill={C.cream} fontSize="18">콘텐츠 판매</text>
        <text x="186" y="489" fill={C.teal} fontSize="18">+</text>
        <text x="218" y="489" fill={C.cream} fontSize="18">광고 캠페인</text>
        <path d="M349 482h54m-7-5 7 5-7 5" stroke={C.teal} strokeWidth="2" fill="none" />
        <text x="427" y="489" fill={C.lime} fontSize="18">판매부터 정산까지 연결</text>
      </Reveal>
      <Notification x={348} y={71} width={188} label={advertising ? '광고 소재 연결' : '콘텐츠 패키지 구성'} delay={2.1} duration={2.7} />
      <Notification x={348} y={71} width={188} label={advertising ? '캠페인에서 고객 유입' : '스토어 상품 연결'} delay={5.3} duration={3} color={C.teal} />
      <Notification x={551} y={111} width={164} label={advertising ? '상품 주문 연결' : '콘텐츠 주문 확인'} delay={6.1} duration={2.5} />
      <Notification x={551} y={111} width={164} label={advertising ? '캠페인 내역 전달' : '콘텐츠 전달 확인'} delay={8.8} duration={2.7} color={C.teal} />
    </g>
  );
}
