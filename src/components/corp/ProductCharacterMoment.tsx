'use client';

import { memo } from 'react';
import Image from 'next/image';
import { ArrowUpRight, Check, Globe2, Sparkles } from 'lucide-react';
import styled, { css, keyframes } from 'styled-components';

type ProductCharacterMomentProps = {
  chapter: number;
  scene: number;
  playing: boolean;
  reducedMotion: boolean;
  cycle: number;
};

type Pose = 'point' | 'work' | 'success' | 'celebrate';
type Phase = 'first' | 'second';

const POSES = {
  point: { icon: Globe2, message: '여기부터 시작!' },
  work: { icon: ArrowUpRight, message: '차근차근 만드는 중!' },
  success: { icon: Check, message: '준비 완료!' },
  celebrate: { icon: Sparkles, message: '좋아요, 완성!' },
} as const;
const BEATS = ['connect', 'complete', 'create', 'deliver'] as const;

// Two distinct poses make brief appearances; most of the twelve-second scene stays clear.
const firstAppearance = keyframes`
  0%, 10% { opacity: 0; transform: translate(-20px, 18px) scale(.86); }
  14% { opacity: 1; transform: translate(0, -3px) scale(1.025); }
  17%, 23% { opacity: 1; transform: translate(0, 0) scale(1); }
  27%, 100% { opacity: 0; transform: translate(12px, -14px) scale(.94); }
`;
const secondAppearance = keyframes`
  0%, 58% { opacity: 0; transform: translate(20px, 16px) scale(.86); }
  62% { opacity: 1; transform: translate(0, -4px) scale(1.025); }
  65%, 71% { opacity: 1; transform: translate(0, 0) scale(1); }
  75%, 100% { opacity: 0; transform: translate(-10px, -14px) scale(.94); }
`;
const firstReaction = keyframes`
  0%, 15%, 23%, 100% { transform: translateY(0) rotate(0); }
  18% { transform: translateY(-6px) rotate(-1.5deg); }
  21% { transform: translateY(-1px) rotate(1deg); }
`;
const secondReaction = keyframes`
  0%, 63%, 72%, 100% { transform: translateY(0) rotate(0); }
  66% { transform: translateY(-8px) rotate(-2deg); }
  69% { transform: translateY(-1px) rotate(1deg); }
`;

const reducedAppearance = css`
  &, *, *::before, *::after { animation: none !important; }
  [data-character-frame='second'], [data-character-bubble] { display: none; }
  [data-character-frame='first'] {
    left: auto; right: 2%; top: 50%; width: 84px; height: 84px;
    transform: translateY(-50%);
  }
  [data-character-appearance] { opacity: 1; transform: none; }
  [data-character-image] { width: 72px; height: 72px; transform: none; }
`;

const Overlay = styled.div<{ $playing: boolean; $reducedMotion: boolean }>`
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  user-select: none;

  &, *, *::before, *::after {
    animation-play-state: ${({ $playing }) => $playing ? 'running' : 'paused'} !important;
  }
  @container product-showreel (max-width: 760px) {
    [data-character-frame] { width: 168px; height: 180px; }
    [data-character-frame='first'] { left: 52%; }
    [data-character-frame='second'] { left: 64%; }
    [data-character-image] { width: 118px; height: 118px; }
    [data-character-bubble] { max-width: 160px; padding: 4px 7px; font-size: 10px; gap: 4px; }
    [data-character-bubble] > svg { width: 13px; height: 13px; }
  }
  ${({ $reducedMotion }) => $reducedMotion && reducedAppearance}
  @media (prefers-reduced-motion: reduce) { ${reducedAppearance} }
`;

const Frame = styled.div<{ $phase: Phase }>`
  position: absolute;
  top: 50%;
  left: ${({ $phase }) => $phase === 'first' ? '58%' : '68%'};
  width: 264px;
  height: 284px;
  transform: translate(-50%, -50%);
`;

const Appearance = styled.div<{ $phase: Phase }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 100%;
  height: 100%;
  opacity: 0;
  transform-origin: 50% 75%;
  animation: ${({ $phase }) => $phase === 'first' ? firstAppearance : secondAppearance} 12s cubic-bezier(.22, 1, .36, 1) infinite both;
`;

const Character = styled(Image)<{ $phase: Phase }>`
  display: block;
  flex: 0 0 auto;
  width: 220px;
  height: 220px;
  object-fit: contain;
  transform-origin: 50% 85%;
  animation: ${({ $phase }) => $phase === 'first' ? firstReaction : secondReaction} 12s ease-in-out infinite both;
`;

const Bubble = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 220px;
  padding: 6px 10px;
  border: 1px solid #4f7b94;
  border-radius: 12px 12px 12px 3px;
  background: #102b42f2;
  color: #e5f1ff;
  font-size: 12px;
  line-height: 1.5;
  word-break: keep-all;
  overflow-wrap: anywhere;

  > svg { width: 16px; height: 16px; flex: 0 0 auto; color: #5eead4; }
`;

function ProductCharacterMoment({ chapter, scene, playing, reducedMotion, cycle }: ProductCharacterMomentProps) {
  const index = Number.isFinite(chapter) ? Math.max(0, Math.min(BEATS.length - 1, Math.floor(chapter))) : 0;
  const variant = Number.isFinite(scene) ? Math.abs(Math.floor(scene)) : 0;
  const first: Pose = index === 1 || (index === 0 && variant % 3 === 1) || (index === 2 && variant % 2 === 0) ? 'work' : 'point';
  const second: Pose = index === 2 || (index === 0 && variant % 3 === 2) ? 'celebrate' : 'success';
  const poses: { phase: Phase; pose: Pose }[] = [{ phase: 'first', pose: first }, { phase: 'second', pose: second }];

  return (
    <Overlay
      key={`${chapter}-${scene}-${cycle}`}
      $playing={playing}
      $reducedMotion={reducedMotion}
      aria-hidden="true"
      data-product-character
      data-character-beat={BEATS[index]}
      data-character-active={playing && !reducedMotion}
      data-character-playing={playing}
      data-character-reduced-motion={reducedMotion}
      data-character-cycle={cycle}
      data-character-period={12000}
    >
      {poses.map(({ phase, pose }) => {
        const { icon: Icon, message } = POSES[pose];
        return (
          <Frame key={phase} $phase={phase} data-character-frame={phase} data-character-pose={pose}>
            <Appearance $phase={phase} data-character-appearance={phase}>
              <Bubble data-character-bubble><Icon aria-hidden="true" /><span>{message}</span></Bubble>
              <Character
                $phase={phase}
                data-character-image
                src={`/images/corp/products/global/ddunddun-${pose}.png`}
                alt=""
                width={1254}
                height={1254}
                unoptimized
                loading="eager"
                draggable={false}
              />
            </Appearance>
          </Frame>
        );
      })}
    </Overlay>
  );
}

export default memo(ProductCharacterMoment);
