'use client';

import styled, { keyframes } from 'styled-components';

const POSES = [
  { id: 'create', image: 'work', message: '아이디어? 내가 만들어볼게!' },
  { id: 'present', image: 'point', message: '영상·그림·웹툰, 한 팩으로!' },
  { id: 'deliver', image: 'success', message: '주문 확인! 파일 보냈어!' },
] as const;

// A single 12-second timeline follows the existing three commerce stages.
const pose = keyframes`
  0%, 29% { opacity: 1; transform: translateY(0); }
  32%, 100% { opacity: 0; transform: translateY(-4px); }
`;
const collect = keyframes`
  0%, 4% { opacity: 0; transform: translate(-45px, 20px) rotate(-12deg) scale(.8); }
  10%, 32% { opacity: 1; transform: translate(0, 0) rotate(0) scale(1); }
  40%, 100% { opacity: 0; transform: translate(48px, 94px) rotate(6deg) scale(.4); }
`;
const packageReady = keyframes`
  0%, 36% { opacity: 0; transform: translateY(12px) scale(.9); }
  43%, 65% { opacity: 1; transform: translateY(0) scale(1); }
  73%, 100% { opacity: 0; transform: translate(58px, -18px) scale(.6); }
`;
const confirmation = keyframes`
  0%, 70% { opacity: 0; transform: translateY(8px) scale(.94); }
  78%, 100% { opacity: 1; transform: translateY(0) scale(1); }
`;

const Studio = styled.g`
  .creator-pose { opacity: 0; animation: ${pose} 12s linear infinite; }
  .creator-pose[data-content-pose="create"] { opacity: 1; }
  .creator-card { transform-box: fill-box; transform-origin: center; opacity: 0; animation: ${collect} 12s cubic-bezier(.22, 1, .36, 1) infinite; }
  .creator-package { transform-box: fill-box; transform-origin: center; animation: ${packageReady} 12s ease infinite both; }
  .creator-confirmation { transform-box: fill-box; transform-origin: center; animation: ${confirmation} 12s ease infinite both; }
`;

/** Decorative SVG scene; the surrounding HTML caption provides its accessible description. */
export function ProductContentSaleScene({ id }: { id: string }) {
  return (
    <Studio data-content-creator>
      <defs><clipPath id={`${id}-creator-stage`}><rect x="269" y="124" width="237" height="230" rx="10" /></clipPath></defs>
      <rect x="258" y="86" width="259" height="316" rx="16" fill="#f3f7ff" />
      <circle cx="278" cy="107" r="4" fill="#314968" />
      <text x="291" y="113" fill="#07101f" fontSize="16">그뚠이의 콘텐츠 상점</text>
      <g clipPath={`url(#${id}-creator-stage)`}>
        <rect x="269" y="124" width="237" height="230" fill="#e8eee2" />
        <path d="M269 329h237" stroke="#cbd6c6" />
        <ellipse cx="387" cy="343" rx="72" ry="7" fill="#344c41" opacity=".12" />
        {POSES.map((item, index) => (
          <g key={item.id} className="creator-pose" data-content-pose={item.id} style={{ animationDelay: `${index * 4}s` }}>
            <image data-content-character={item.id} href={`/images/corp/products/global/ddunddun-${item.image}.png`} x="290" y="172" width="195" height="179" preserveAspectRatio="xMidYMax meet" />
            <path d="M290 133h195a9 9 0 0 1 9 9v18a9 9 0 0 1-9 9h-82l-12 10-2-10h-99a9 9 0 0 1-9-9v-18a9 9 0 0 1 9-9Z" fill="#fff" stroke="#cad7cd" />
            <text data-content-speech x="387" y="156" textAnchor="middle" fill="#172e4a" fontSize="15">{item.message}</text>
          </g>
        ))}
        {['영상', '이미지', '웹툰'].map((label, index) => (
          <g key={label} transform={`translate(${index === 1 ? 444 : 278} ${205 + index * 39})`}>
            <g className="creator-card motion-only" data-content-flying-card={label} style={{ animationDelay: `${index * .5}s` }}>
              <rect width="53" height="36" rx="7" fill="#fff" stroke="#a3b6a3" />
              {index === 0 ? <path d="m8 9 11 8-11 8Z" fill="#314968" /> : index === 1 ? <path d="M7 25 14 11 23 25Z" fill="#56836f" /> : <path d="M7 9h16v14H15l-5 4v-4H7Z" fill="#8b6833" />}
              <text x="35" y="22" fill="#172e4a" textAnchor="middle" fontSize="10">{label}</text>
            </g>
          </g>
        ))}
        <g className="creator-package motion-only" data-content-package>
          <rect x="430" y="265" width="62" height="72" rx="7" fill="#172e4a" transform="rotate(7 461 301)" />
          <rect x="423" y="260" width="62" height="72" rx="7" fill="#93c5fd" stroke="#fff" strokeWidth="2" />
          <path d="M438 283h32m-32 9h26m-26 9h21" stroke="#172e4a" strokeWidth="3" strokeLinecap="round" />
          <text x="454" y="321" textAnchor="middle" fill="#07101f" fontSize="12">콘텐츠 팩</text>
        </g>
        <g className="creator-confirmation motion-only" data-content-confirmation>
          <rect x="283" y="312" width="209" height="31" rx="15" fill="#172e4a" />
          <path d="m297 327 5 5 9-11" fill="none" stroke="#5eead4" strokeWidth="2.5" strokeLinecap="round" />
          <text x="395" y="333" fill="#f3f7ff" textAnchor="middle" fontSize="15">고객에게 전달했어요</text>
        </g>
      </g>
      <text x="276" y="377" fill="#07101f" fontSize="20">그뚠이 스토리 팩</text>
      <text x="276" y="394" fill="#314968" fontSize="12">영상 + 이미지 + 웹툰 · 디지털 상품</text>
    </Studio>
  );
}
