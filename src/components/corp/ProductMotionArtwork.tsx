'use client';

import { memo } from 'react';
import styled, { keyframes } from 'styled-components';
import { DocumentAutomationScene } from './ProductWebDocumentScenes';
import { GlobalWebScene } from './ProductGlobalWebScene';
import { ProductCreEditorScene } from './ProductCreEditorScene';
import { ProductAutomationFlowScene } from './ProductAutomationFlowScenes';

type ProductMotionArtworkProps = {
  chapter: number;
  playing: boolean;
  reducedMotion: boolean;
  variant?: number;
  platform?: number;
};

const assemble = keyframes`
  from { opacity: 0; transform: translateY(18px); }
  to { opacity: 1; transform: translateY(0); }
`;
const trace = keyframes`from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; }`;
const float = keyframes`0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); }`;
const orbit = keyframes`from { transform: rotate(0); } to { transform: rotate(360deg); }`;
const flow = keyframes`from { stroke-dashoffset: 28; } to { stroke-dashoffset: 0; }`;
const scan = keyframes`from { transform: translateY(0); } to { transform: translateY(60px); }`;
const cursor = keyframes`from { transform: translateX(0); } to { transform: translateX(24px); }`;
const pulse = keyframes`0%, 100% { opacity: .4; } 50% { opacity: 1; }`;
const videoPan = keyframes`from { transform: translateX(-4px) scale(1); } to { transform: translateX(8px) scale(1.035); }`;
const wave = keyframes`from { transform: scaleY(.4); } to { transform: scaleY(1); }`;
const progress = keyframes`from { transform: scaleX(0); } to { transform: scaleX(1); }`;
const signalPacket = keyframes`
  0% { stroke-dashoffset: 100; opacity: 0; }
  8%, 85% { opacity: 1; }
  100% { stroke-dashoffset: 0; opacity: 0; }
`;
const signalRing = keyframes`
  0% { opacity: 0; transform: scale(.35); }
  12% { opacity: .65; }
  75%, 100% { opacity: 0; transform: scale(2.2); }
`;
const reactionBurst = keyframes`
  0%, 20% { opacity: 0; transform: scale(.45) rotate(-12deg); }
  35% { opacity: .85; transform: scale(1) rotate(0); }
  65%, 100% { opacity: 0; transform: scale(1.4) rotate(10deg); }
`;
const documentBatch = keyframes`
  0% { opacity: 0; }
  8%, 90% { opacity: 1; }
  100% { opacity: 0; }
`;
const documentCard = keyframes`
  0% { opacity: 0; transform: translate(-24px, 16px) scale(.94); }
  16% { opacity: 1; transform: translate(0, 0) scale(1); }
  78% { opacity: 1; transform: translate(0, 0) scale(1); }
  100% { opacity: 0; transform: translate(26px, -18px) scale(.96); }
`;
const documentStamp = keyframes`
  0%, 48% { opacity: 0; transform: scale(1.5) rotate(-16deg); }
  61% { opacity: 1; transform: scale(.92) rotate(3deg); }
  68%, 86% { opacity: 1; transform: scale(1) rotate(0); }
  100% { opacity: 0; transform: scale(1); }
`;
const motionWindow = keyframes`
  0% { opacity: 0; transform: translateY(10px); }
  12%, 78% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-12px); }
`;
const notification = keyframes`
  0% { opacity: 0; transform: translateX(22px) scale(.95); }
  14%, 76% { opacity: 1; transform: translateX(0) scale(1); }
  100% { opacity: 0; transform: translateY(-14px) scale(.97); }
`;
const reactionPop = keyframes`
  0%, 8% { opacity: 0; transform: scale(.85); }
  20% { opacity: 1; transform: scale(1.06); }
  30%, 65% { opacity: 1; transform: scale(1); }
  90%, 100% { opacity: 0; transform: scale(.96); }
`;
const screenWipe = keyframes`
  0%, 14% { opacity: 0; clip-path: inset(100% 0 0); }
  26%, 72% { opacity: 1; clip-path: inset(0); }
  90%, 100% { opacity: 0; clip-path: inset(0 0 100%); }
`;
const clipSweep = keyframes`
  0%, 20% { opacity: 0; transform: translateX(-180px); }
  35% { opacity: .3; }
  65%, 100% { opacity: 0; transform: translateX(220px); }
`;

const Artwork = styled.div<{ $playing: boolean; $reducedMotion: boolean; $wide: boolean }>`
  position: relative; width: 100%; min-width: 0; height: ${({ $wide }) => $wide ? 'clamp(180px, 28cqw, 330px)' : 'clamp(220px, 33cqw, 320px)'}; isolation: isolate; color: #f3f7ff;
  > svg { display: block; width: 100%; height: 100%; overflow: visible; font-family: inherit; }
  text { font-weight: 600; }
  .assemble { animation: ${assemble} .9s cubic-bezier(.22, 1, .36, 1) both; }
  .trace { stroke-dasharray: 1; animation: ${trace} 1.8s cubic-bezier(.22, 1, .36, 1) both; }
  .float { animation: ${float} 6s ease-in-out infinite; }
  .orbit, .spin { transform-box: fill-box; transform-origin: center; animation: ${orbit} 12s linear infinite; }
  .flow { stroke-dasharray: 4 10; animation: ${flow} 3s linear infinite; }
  .scan { animation: ${scan} 3s ease-in-out alternate infinite; }
  .cursor { animation: ${cursor} 4s ease-in-out alternate infinite; }
  .pulse { animation: ${pulse} 3s ease-in-out infinite; }
  .video-pan { transform-box: fill-box; transform-origin: center; animation: ${videoPan} 6s ease-in-out alternate infinite; }
  .wave { transform-box: fill-box; transform-origin: bottom; animation: ${wave} 2s ease-in-out alternate infinite; }
  .progress { transform-box: fill-box; transform-origin: left; animation: ${progress} 8s linear both; }
  .signal-packet { stroke-dasharray: 3 97; animation: ${signalPacket} 2.8s linear infinite both; }
  .signal-glow { stroke-opacity: .16; }
  .signal-ring { transform-box: fill-box; transform-origin: center; animation: ${signalRing} 3.2s ease-out infinite both; }
  .reaction-burst { transform-box: fill-box; transform-origin: center; animation: ${reactionBurst} 4s ease-out infinite both; }
  .document-batch { animation: ${documentBatch} 4s linear both; }
  .document-card { transform-box: fill-box; transform-origin: center; animation: ${documentCard} 3.35s cubic-bezier(.22, 1, .36, 1) both; }
  .document-write { transform-box: fill-box; transform-origin: left; animation: ${progress} 1s ease-out both; }
  .document-stamp { transform-box: fill-box; transform-origin: center; animation: ${documentStamp} 3.35s ease-out both; }
  .motion-window { animation: ${motionWindow} 4s ease both; }
  .notification { transform-box: fill-box; transform-origin: center; animation: ${notification} 4s cubic-bezier(.22, 1, .36, 1) both; }
  .reaction-pop { transform-box: fill-box; transform-origin: center; animation: ${reactionPop} 4s ease infinite both; }
  .screen-wipe { animation: ${screenWipe} 4s ease-in-out infinite both; }
  .clip-sweep { animation: ${clipSweep} 4s ease-in-out infinite both; }
  .motion-secondary { opacity: 0; }
  *, *::before, *::after {
    animation-play-state: ${({ $playing }) => $playing ? 'running' : 'paused'} !important;
    ${({ $reducedMotion }) => $reducedMotion && 'animation: none !important;'}
  }
  ${({ $reducedMotion }) => $reducedMotion && '.motion-only, .motion-secondary { display: none !important; }'}
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation: none !important; }
    .motion-only, .motion-secondary { display: none !important; }
  }
`;

const SCENES = [GlobalWebScene, DocumentAutomationScene, GlobalWebScene] as const;

function ProductMotionArtwork({ chapter, playing, reducedMotion, variant = 0, platform = 0 }: ProductMotionArtworkProps) {
  const Scene = chapter === 1 && variant >= 4 ? ProductAutomationFlowScene : SCENES[chapter] ?? GlobalWebScene;
  const wide = chapter === 0;
  const bottom = wide ? 420 : 500;
  return (
    <Artwork $playing={playing} $reducedMotion={reducedMotion} $wide={wide} data-product-motion-artwork={chapter}>
      <svg viewBox={`0 0 760 ${wide ? 440 : 520}`} aria-hidden="true" focusable="false">
        <g fill="none" stroke="#577390" opacity=".3">
          <path d={`M26 55V20h35M699 20h35v35M26 ${bottom - 35}v35h35M699 ${bottom}h35v-35`} />
          {[130, 230, 330, 430, 530, 630].map(x => <path key={x} d={`M${x} 17v6M${x} ${bottom - 3}v6`} />)}
        </g>
        {chapter === 3 ? <ProductCreEditorScene variant={variant} platform={platform} /> : <Scene variant={variant} />}
      </svg>
    </Artwork>
  );
}

export default memo(ProductMotionArtwork);
