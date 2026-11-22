'use client';

import type { ReactNode } from 'react';
import styled from 'styled-components';
import type { YouTubeShortFilm } from './productShowreelMedia';

export default function ProductPortraitStage({ children, film, descriptionId }: {
  children: ReactNode;
  film?: YouTubeShortFilm;
  descriptionId?: string;
}) {
  return (
    <Canvas data-portrait-stage data-film-stage={film ? true : undefined}>
      {film ? <div className="note film-note"><h4>{film.title}</h4></div>
        : <div className="note" aria-hidden="true"><span>SHORT.<br />STORY.<br />IMPACT.</span><small>한 장면의 가능성</small></div>}
      <div className="device" data-portrait-device data-native-frame={film ? true : undefined}>{children}</div>
      {film ? <div className="markers film-note"><i aria-hidden="true" /><p id={descriptionId}>{film.description}</p></div>
        : <div className="markers" aria-hidden="true"><i /><span>09<br /><b>16</b></span><small>VERTICAL<br />STORY</small></div>}
    </Canvas>
  );
}

const Canvas = styled.div`
  flex: 1; min-width: 0; min-height: 0; position: relative; display: grid; place-items: center;
  grid-template: minmax(0, 1fr) / minmax(0, 1fr); overflow: hidden; padding: 10px; background: #d6e2ef; container-type: size;
  .device {
    /* The external player's 200px opening and its bezel fit separately inside the stage. */
    --film-width: min(calc(100cqw - 10px), calc(56.25cqh - 5.625px));
    position: relative; box-sizing: content-box; width: min(200px, var(--film-width)); aspect-ratio: 9 / 16; overflow: hidden; background: #071322;
    border: 5px solid #102b22; border-radius: 18px; box-shadow: 0 8px 18px #19362630; z-index: 1;
  }
  .device[data-native-frame] { grid-area: 1 / 2; width: var(--film-width); }
  .note { position: absolute; left: 23px; top: 38px; color: #315578; }
  .note > span, h4 { font-family: Georgia, serif; font-size: 26px; line-height: 1.15; }
  .note small { display: block; margin-top: 14px; font-size: 9px; }
  h4 { margin: 0; font-weight: 650; word-break: keep-all; }
  .markers { position: absolute; right: 28px; bottom: 35px; display: grid; gap: 15px; color: #3f603c; }
  .markers i { width: 21px; height: 21px; border-top: 1px solid currentColor; border-right: 1px solid currentColor; justify-self: end; }
  .markers > span { font: 34px/1.1 Georgia, serif; text-align: right; }
  .markers b { font-weight: 400; color: #4b603f; }
  .markers small { font-size: 8px; line-height: 1.7; }
  &[data-film-stage] { grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); }
  .film-note { position: static; grid-row: 1; box-sizing: border-box; min-width: 0; width: 100%; }
  .note.film-note { grid-column: 1; align-self: start; padding: 28px 14px 0 13px; }
  .markers.film-note { grid-column: 3; grid-template-columns: minmax(0, 1fr); align-self: end; padding: 0 18px 25px 14px; }
  .film-note h4, .film-note p { min-width: 0; white-space: normal; overflow-wrap: anywhere; }
  .film-note p { width: min(100%, 210px); justify-self: end; margin: 0; font-size: clamp(13px, 1.8cqw, 16px); line-height: 1.65; word-break: keep-all; }
  @container (max-width: 620px) { .film-note { display: none; } }
  @container (max-width: 520px) {
    .note { left: 16px; top: 30px; } .note > span { font-size: 18px; } .note small { font-size: 8px; max-width: 45px; line-height: 1.7; }
  }
  @container (max-width: 420px) { .markers { right: 15px; } .markers > span { font-size: 24px; } .markers small { font-size: 7px; } }
  @container (max-width: 350px) { .note, .markers { display: none; } }
`;

export const VideoControls = styled.div`
  display: flex; align-items: center; gap: 9px; padding: 0 12px 1px; flex-shrink: 0; color: #173b2e;
  button { display: grid; place-items: center; min-height: 44px; min-width: 44px; border: 0; background: transparent; color: #173b2e; cursor: pointer; }
  input { flex: 1; min-width: 44px; width: 100%; height: 44px; accent-color: #46713b; cursor: pointer; margin: 0; }
  > span { flex-shrink: 0; font-size: 9px; font-variant-numeric: tabular-nums; } small { color: #58674f; font-size: 8px; }
  button[aria-pressed='true'] { color: #315832; }
  @container (max-width: 420px) { gap: 6px; padding: 0 7px 1px; }
`;
