'use client';

import { useId, useState } from 'react';
import Image from 'next/image';
import { Clapperboard, MonitorSmartphone, Pause, Play } from 'lucide-react';
import styled from 'styled-components';
import ProductMotionArtwork from './ProductMotionArtwork';
import { WEB_STORY_CUTS, WEB_STORY_MS, type WebStory } from './productWebStories';
import { showreelVideoEvents, useShowreelVideo } from './useShowreelVideo';

type Props = {
  story: WebStory;
  variant: number;
  elapsedMs: number;
  playing: boolean;
  reducedMotion: boolean;
  onSelectShot: (milliseconds: number) => void;
  onTogglePlayback?: () => void;
  onInspect: () => void;
};

export default function ProductWebStory({ story, variant, elapsedMs, playing, reducedMotion, onSelectShot, onTogglePlayback, onInspect }: Props) {
  const [viewStory, setViewStory] = useState(true);
  const panelId = useId();
  const enabled = viewStory && !reducedMotion;
  const { player, selectShot } = useShowreelVideo({
    source: story.video, durationMs: WEB_STORY_MS, elapsedMs, playing, enabled, onSelectShot,
  });
  const index = WEB_STORY_CUTS.reduce<number>((current, start, i) => elapsedMs >= start ? i : current, 0);
  const shot = story.shots[index];
  const switchView = () => {
    if (viewStory) onInspect();
    setViewStory(value => !value);
  };

  return (
    <Story data-web-story={story.id} data-web-view={viewStory ? 'story' : 'screen'}
      data-product-motion-artwork={viewStory ? '0' : undefined} aria-label={story.label}>
      <header className="story-header">
        <h4>{viewStory ? story.title : story.label}</h4>
        <div className="story-controls">
          {viewStory && onTogglePlayback && <button type="button" data-web-playback onClick={onTogglePlayback}
            aria-label={`${story.label} 이야기 ${playing ? '일시정지' : '재생'}`}>
            {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
          </button>}
          <button type="button" data-web-view-toggle aria-controls={panelId} onClick={switchView}>
            {viewStory ? <MonitorSmartphone size={16} aria-hidden="true" /> : <Clapperboard size={16} aria-hidden="true" />}
            {viewStory ? '제품 화면 보기' : '이야기 보기'}
          </button>
        </div>
      </header>
      <div id={panelId} className="view">
        {viewStory ? (
          <div className="story-layout">
            <figure aria-label={story.premise}>
              <div className="picture">
                <div data-web-viewport>
                  <Image className="sheet" data-cell={index} data-web-frame={index} src={story.image} alt={shot.alt}
                    width={1536} height={1024} loading="eager" unoptimized draggable={false} />
                  {enabled && <video key={story.id} ref={player} data-web-video={story.id} {...showreelVideoEvents}
                    aria-hidden="true" muted playsInline disablePictureInPicture preload={playing ? 'auto' : 'metadata'} />}
                </div>
              </div>
              <figcaption>
                <span data-web-dialogue aria-live={playing ? 'off' : 'polite'} aria-atomic="true">{shot.line}</span>
              </figcaption>
            </figure>
            <div className="cuts" role="group" aria-label={`${story.label} 이야기 장면 선택`}>
              {story.shots.map(({ label }, i) => (
                <button key={label} type="button" data-web-shot={i} aria-pressed={i === index}
                  aria-label={`${i + 1}컷 ${label}`} onClick={() => selectShot(WEB_STORY_CUTS[i])}>
                  <span className="thumbnail" aria-hidden="true">
                    <Image className="sheet" data-cell={i} src={story.image} alt="" width={1536} height={1024}
                      unoptimized draggable={false} />
                  </span>
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : <ProductMotionArtwork chapter={0} variant={variant} playing={playing} reducedMotion={reducedMotion || !playing} />}
      </div>
    </Story>
  );
}

const Story = styled.section`
  display: flex; flex-direction: column; width: 100%; min-width: 0; min-height: 0; gap: 6px;
  &[data-web-view='screen'] { flex: 1; }
  .story-header { display: flex; flex: none; align-items: center; justify-content: space-between; gap: 8px; }
  .story-controls { display: flex; flex: none; align-items: center; gap: 4px; }
  h4 {
    margin: 0; padding-inline-start: 9px; border-inline-start: 3px solid #f4c76c; color: #f6e2b3;
    font-size: clamp(15px, 2.4cqw, 20px); font-weight: 750; line-height: 1.3; word-break: keep-all;
  }
  button { appearance: none; min-width: 44px; min-height: 44px; margin: 0; font: inherit; cursor: pointer; }
  button:focus-visible { outline: 3px solid #a7e7dc; outline-offset: -3px; }
  [data-web-view-toggle] {
    display: inline-flex; align-items: center; justify-content: center; gap: 6px; flex: none; padding: 4px 11px;
    border: 1px solid #47636a; border-radius: 8px; background: #112b30; color: #aee4dc;
    font-size: 12px; font-weight: 700; line-height: 1.25;
  }
  [data-web-view-toggle]:hover, [data-web-playback]:hover { background: #214045; color: #fff; }
  .view { display: flex; flex: 1; flex-direction: column; min-height: 0; min-width: 0; }
  .story-layout {
    display: grid; flex: 1; min-height: 0; grid-template-columns: minmax(0, 1fr) clamp(82px, 13%, 118px); gap: 10px;
  }
  figure {
    display: grid; grid-template-rows: minmax(0, 1fr) auto; margin: 0; min-height: 0; min-width: 0; overflow: hidden;
    border: 1px solid #385657; border-radius: 12px; background: #09171b;
  }
  .picture { display: grid; place-items: center; min-height: 0; min-width: 0; container-type: size; }
  [data-web-viewport] { position: relative; width: min(100cqw, 150cqh); aspect-ratio: 3 / 2; overflow: hidden; }
  .sheet { position: absolute; top: 0; left: 0; display: block; width: 200%; height: 200%; max-width: none !important; }
  .sheet[data-cell='1'], .sheet[data-cell='3'] { left: -100%; }
  .sheet[data-cell='2'], .sheet[data-cell='3'] { top: -100%; }
  [data-web-video] {
    position: absolute; inset: 0; display: block; width: 100%; height: 100%; object-fit: contain; opacity: 0; pointer-events: none;
  }
  [data-web-video][data-presented='true'] { opacity: 1; }
  figcaption {
    display: flex; align-items: center; min-height: 30px; margin: 0; padding-inline: 6px;
    background: #10272c; color: #fff6df; font-size: clamp(14px, 2.4cqw, 19px); line-height: 1.4; font-weight: 650;
  }
  [data-web-dialogue] { flex: 1; min-width: 0; padding: 2px 0; text-align: center; word-break: keep-all; }
  [data-web-playback] {
    display: grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 1px solid #64553a; border-radius: 8px;
    color: #f8cc75; background: #282a26;
  }
  .cuts { display: grid; min-width: 0; align-content: center; gap: 5px; }
  [data-web-shot] {
    display: grid; align-content: center; justify-items: center; gap: 3px; min-width: 0; padding: 3px;
    border: 1px solid #334b51; border-radius: 8px; background: #11252b; color: #d1e1df;
    font-size: 12px; line-height: 1.35; word-break: keep-all;
  }
  [data-web-shot]:hover { border-color: #77b9af; }
  [data-web-shot][aria-pressed='true'] { border-color: #f3c96a; background: #393224; color: #ffe7a9; font-weight: 700; }
  .thumbnail { position: relative; width: min(100%, 89px); aspect-ratio: 3 / 2; overflow: hidden; border-radius: 4px; }

  @container (min-width: 700px) {
    &[data-web-view='screen'] { position: relative; }
    /* The native illustrations leave space between their heading and status at the top. */
    &[data-web-view='screen'] .story-header { position: absolute; top: 0; inset-inline-end: 18%; z-index: 1; }
    &[data-web-view='screen'] h4 { display: none; }
  }
  @container product-showreel (max-width: 760px) {
    &&[data-product-motion-artwork] { height: auto; min-height: 0; flex: none; }
    .story-layout { grid-template-columns: minmax(0, 1fr); gap: 4px; }
    .picture { container-type: inline-size; }
    [data-web-viewport] { width: 100%; }
    .cuts { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
    [data-web-shot] { gap: 1px; padding: 2px; font-size: 11px; }
    .thumbnail { width: min(100%, 36px); }
  }
  @container product-showreel (max-width: 350px) { [data-web-view-toggle] svg { display: none; } }
`;
