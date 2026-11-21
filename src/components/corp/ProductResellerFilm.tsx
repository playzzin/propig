'use client';

import type { CSSProperties } from 'react';
import Image from 'next/image';
import styled from 'styled-components';
import { RESELLER_CUTS, RESELLER_EPISODE_MS, type ResellerEpisode } from './productResellerEpisodes';

type FilmProps = {
  episode: ResellerEpisode;
  elapsedMs: number;
  playing: boolean;
  reducedMotion: boolean;
  onSelectShot: (milliseconds: number) => void;
};

export function ProductResellerFilm({ episode, elapsedMs, playing, reducedMotion, onSelectShot }: FilmProps) {
  const index = RESELLER_CUTS.reduce<number>((current, start, i) => elapsedMs >= start ? i : current, 0);
  const shot = episode.shots[index];
  const start = RESELLER_CUTS[index];
  const end = RESELLER_CUTS[index + 1] ?? RESELLER_EPISODE_MS;
  const [x, y, tilt] = episode.jolt;
  const camera = {
    '--cut-start': start / RESELLER_EPISODE_MS,
    '--cut-rate': RESELLER_EPISODE_MS / (end - start),
    '--focus': episode.focus,
    '--jolt-x': `${x}%`,
    '--jolt-y': `${y}%`,
    '--jolt-tilt': `${tilt}deg`,
  } as CSSProperties;

  return (
    <Film data-product-motion-artwork="3" data-still={reducedMotion}>
      <div className="reel-layout" data-motion-scene="creeditor" data-creeditor-mode="advertising">
        <figure data-commerce-platform={episode.id} aria-label={`그뚠이의 ${episode.item} 사용 후기`}>
          <div className="image-well">
            <div data-reseller-viewport>
              <div className="camera" data-cut={index} style={camera}>
                <Image
                  src={episode.image} alt={shot.alt} width={1536} height={1024}
                  className="sheet" unoptimized loading="eager" draggable={false} data-reseller-frame={index} data-cell={index}
                />
              </div>
            </div>
          </div>
          <figcaption data-reseller-dialogue aria-live={playing ? 'off' : 'polite'} aria-atomic="true">
            {index === 2 && <b>{episode.sound}</b>}
            <span>{shot.line}</span>
          </figcaption>
        </figure>
        <div className="filmstrip" role="group" aria-label={`${episode.item} 장면 선택`}>
          {episode.shots.map(({ label }, i) => (
            <button key={label} type="button" data-reseller-shot={i} aria-pressed={i === index}
              aria-label={`${i + 1}컷 ${label}`} onClick={() => onSelectShot(RESELLER_CUTS[i])}>
              <span className="thumbnail" aria-hidden="true">
                <Image className="sheet" src={episode.image} alt="" width={1536} height={1024} unoptimized draggable={false} data-cell={i} />
              </span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </Film>
  );
}

const Film = styled.div`
  width: 100%; min-width: 0; box-sizing: border-box; padding: 4px 0 12px;
  container: reseller / inline-size;

  .reel-layout {
    display: grid; grid-template-columns: minmax(0, 1fr) clamp(72px, 12%, 106px);
    gap: 12px; height: 100%; min-height: 0;
  }
  figure {
    display: grid; grid-template-rows: minmax(0, 1fr) auto; margin: 0; min-width: 0; min-height: 0;
    overflow: hidden; border: 1px solid #3b4645; border-radius: 12px; background: #171d1c;
  }
  .image-well { min-height: 0; min-width: 0; display: grid; place-items: center; container-type: size; }
  [data-reseller-viewport] { position: relative; width: min(100cqw, 150cqh); aspect-ratio: 3 / 2; overflow: hidden; }

  /* The camera and edits use the showreel's clock, including after pausing or seeking. */
  .camera {
    position: absolute; inset: 0; overflow: hidden; transform-origin: var(--focus);
    --t: clamp(0, calc((var(--scene-progress, 0) - var(--cut-start)) * var(--cut-rate)), 1);
  }
  .camera[data-cut='0'] { transform: scale(calc(1 + .024 * var(--t))); }
  .camera[data-cut='1'] { transform: scale(calc(1.016 + .055 * var(--t))); }
  .camera[data-cut='2'] {
    --hit: clamp(0, min(calc(var(--t) * 22), calc(2 - var(--t) * 12)), 1);
    --rebound: clamp(0, min(calc((var(--t) - .13) * 12), calc((.34 - var(--t)) * 9)), 1);
    --offset: calc(var(--hit) - .4 * var(--rebound));
    transform-origin: center;
    transform: scale(1.055) translate(calc(var(--jolt-x) * var(--offset)), calc(var(--jolt-y) * var(--offset))) rotate(calc(var(--jolt-tilt) * var(--offset)));
  }
  .camera[data-cut='3'] { transform: scale(calc(1.045 - .045 * var(--t))); }

  /* A four-cell sheet intentionally exceeds the corporate shell's 100% image-width cap. */
  .sheet { position: absolute; top: 0; left: 0; display: block; width: 200%; height: 200%; max-width: none !important; }
  .sheet[data-cell='1'], .sheet[data-cell='3'] { left: -100%; }
  .sheet[data-cell='2'], .sheet[data-cell='3'] { top: -100%; }
  &[data-still='true'] .camera { transform: none; }
  @media (prefers-reduced-motion: reduce) { .camera[data-cut] { transform: none; } }

  figcaption {
    display: flex; justify-content: center; align-items: center; gap: .55em; min-height: 42px; margin: 0;
    padding: 5px 10px; box-sizing: border-box; background: #182322; color: #fff5df;
    font-size: clamp(15px, 2.7cqw, 21px); font-weight: 650; line-height: 1.45; text-align: center; word-break: keep-all;
  }
  figcaption b { flex-shrink: 0; color: #ffd386; font-weight: 800; }
  .filmstrip { display: grid; align-content: center; gap: 6px; min-width: 0; }
  button {
    appearance: none; display: grid; gap: 3px; align-content: center; min-width: 0; min-height: 44px;
    margin: 0; padding: 3px; border: 2px solid transparent; border-radius: 8px;
    background: #142638; color: #d4dfeb; font: inherit; font-size: 12px; line-height: 1.4; cursor: pointer;
  }
  button[aria-pressed='true'] { border-color: #ffd386; color: #fff0cb; background: #383126; font-weight: 700; }
  button:hover { color: #fff; background: #25394b; }
  button:focus-visible { outline: 2px solid #a8d8ff; outline-offset: 2px; }
  .thumbnail { position: relative; display: block; overflow: hidden; width: 100%; aspect-ratio: 3 / 2; border-radius: 3px; }

  @container product-showreel (max-width: 760px) {
    &&[data-product-motion-artwork] { height: clamp(290px, calc(66.667cqw + 112px), 430px); }
  }
  @container reseller (max-width: 580px) {
    .reel-layout { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; gap: 5px; }
    .filmstrip { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
    button { align-items: center; justify-items: center; padding: 2px; gap: 1px; font-size: 11px; }
    .thumbnail { width: min(100%, 53px); }
    figcaption { min-height: 34px; padding: 3px 6px; }
  }
`;
