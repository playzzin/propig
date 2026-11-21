'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';
import { Captions, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import styled from 'styled-components';
import { YOUTUBE_SHORT as film } from './productShowreelMedia';

type Props = {
  playing: boolean;
  reducedMotion: boolean;
  sceneElapsedMs: number;
  onPlaybackChange: (playing: boolean) => void;
  onSeek: (milliseconds: number) => void;
};
type Status = 'idle' | 'loading' | 'ready' | 'blocked' | 'error';

function timecode(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function alignWithScene(video: HTMLVideoElement, elapsedMs: number) {
  if (!Number.isFinite(video.duration)) return;
  const progress = parseFloat(getComputedStyle(video).getPropertyValue('--scene-progress'));
  const seconds = (Number.isFinite(progress) ? progress * film.durationMs : elapsedMs) / 1000;
  const target = Math.max(0, Math.min(seconds, video.duration));
  if (Math.abs(video.currentTime - target) > .45) video.currentTime = target;
}

export default function ProductYouTubeShort({ playing, reducedMotion, sceneElapsedMs, onPlaybackChange, onSeek }: Props) {
  const player = useRef<HTMLVideoElement>(null);
  const captionTrack = useRef<HTMLTrackElement>(null);
  const playButton = useRef<HTMLButtonElement>(null);
  const synopsisId = useId();
  const attempt = useRef(0);
  const pendingSeek = useRef<number | null>(null);
  const [requested, setRequested] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [muted, setMuted] = useState(true);
  const [captions, setCaptions] = useState(true);
  const length = duration || film.durationMs / 1000;
  const canPause = videoPlaying || (playing && (!reducedMotion || requested) && status === 'loading');

  const start = useCallback((video: HTMLVideoElement) => {
    if (!video.hasAttribute('src')) video.src = film.src;
    if (!video.paused) return;
    const ticket = ++attempt.current;
    void video.play().catch((error: DOMException) => {
      if (ticket !== attempt.current || !video.isConnected || error.name === 'AbortError') return;
      setStatus(error.name === 'NotAllowedError' ? 'blocked' : 'error');
    });
  }, []);

  useEffect(() => {
    const video = player.current;
    if (!video) return;
    return () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, []);

  useEffect(() => {
    const video = player.current;
    if (!video) return;
    const prefersStill = reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (playing && (!prefersStill || requested)) {
      if (!video.error) start(video);
    } else {
      attempt.current++;
      video.pause();
    }
  }, [playing, reducedMotion, requested, start]);

  useEffect(() => {
    const video = player.current;
    // An explicitly started short keeps its native playhead while the reduced-motion tour stays still.
    if (!reducedMotion && playing && video && !video.paused && pendingSeek.current === null) alignWithScene(video, sceneElapsedMs);
  }, [playing, reducedMotion, sceneElapsedMs]);

  useEffect(() => {
    const track = captionTrack.current?.track;
    if (track) track.mode = captions ? 'showing' : 'hidden';
  }, [captions]);

  function playOrPause(retry = false) {
    const video = player.current;
    if (!video) return;
    if (canPause && !retry) {
      attempt.current++;
      video.pause();
      onPlaybackChange(false);
      return;
    }
    if (retry || video.error) {
      setStatus('loading');
      if (reducedMotion) pendingSeek.current ??= position;
      video.src = film.src;
      video.load();
      playButton.current?.focus({ preventScroll: true });
    } else if (video.ended || position >= length) {
      video.currentTime = 0;
      onSeek(0);
    }
    setRequested(true);
    onPlaybackChange(true);
    start(video);
  }

  function seek(seconds: number) {
    const video = player.current;
    if (!video) return;
    attempt.current++;
    video.pause();
    setPosition(seconds);
    onSeek(Math.round(seconds * 1000));
    if (Number.isFinite(video.duration)) {
      video.currentTime = seconds;
    } else {
      pendingSeek.current = seconds;
      if (!video.hasAttribute('src')) video.src = film.src;
    }
  }

  function loadedMetadata(video: HTMLVideoElement) {
    if (!Number.isFinite(video.duration)) return;
    setDuration(video.duration);
    if (pendingSeek.current !== null) {
      video.currentTime = Math.min(video.duration, pendingSeek.current);
      pendingSeek.current = null;
    } else if (playing && !reducedMotion) {
      alignWithScene(video, sceneElapsedMs);
    }
    setPosition(video.currentTime);
  }

  return (
    <Short data-video-id="duck-director" data-video-format="portrait" data-player-state={videoPlaying ? 'playing' : 'paused'}
      data-player-status={status} data-player-time={position} data-player-duration={duration} data-player-muted={muted}>
      <div className="projection">
        <div className="portrait">
          <video ref={player} data-grok-video aria-label={film.title} aria-describedby={synopsisId} poster={film.poster} muted={muted} playsInline preload="metadata"
            onLoadStart={() => setStatus('loading')}
            onLoadedMetadata={event => loadedMetadata(event.currentTarget)}
            onLoadedData={() => setStatus('ready')}
            onPlaying={event => { setVideoPlaying(!event.currentTarget.paused); setStatus('ready'); }}
            onPause={event => setVideoPlaying(!event.currentTarget.paused)}
            onEnded={() => setVideoPlaying(false)}
            onTimeUpdate={event => setPosition(event.currentTarget.currentTime)}
            onSeeked={event => setPosition(event.currentTarget.currentTime)}
            onVolumeChange={event => setMuted(event.currentTarget.muted)}
            onError={event => { if (event.currentTarget.error) { setStatus('error'); setVideoPlaying(false); } }}>
            <track ref={captionTrack} kind="captions" src={film.captions} srcLang="ko" label="한국어" default />
          </video>
          {status === 'error' && <Image className="poster" src={film.poster} alt="" width={720} height={1280} unoptimized />}
        </div>
      </div>
      <div className="synopsis">
        <h4>{film.title}</h4>
        <p id={synopsisId}>{film.description}</p>
        {status === 'error' && <div className="recovery"><span role="status">영상을 불러오지 못했습니다.</span>
          <button type="button" onClick={() => playOrPause(true)}><RotateCcw size={15} aria-hidden="true" />다시 불러오기</button>
        </div>}
      </div>
      <div className="transport">
        <button className="play" ref={playButton} type="button" aria-label={`YouTube 영상 ${canPause ? '일시정지' : '재생'}`}
          onClick={() => playOrPause()}>{canPause ? <Pause size={19} /> : <Play size={19} />}</button>
        <div className="timeline">
          <input type="range" aria-label="YouTube 영상 재생 위치" aria-valuetext={`${timecode(position)} / ${timecode(length)}`}
            min={0} max={length} step={.1} value={Math.min(position, length)} onChange={event => seek(event.currentTarget.valueAsNumber)} />
          <span aria-hidden="true">{timecode(position)} / {timecode(length)}</span>
        </div>
        <button type="button" aria-label={`YouTube 소리 ${muted ? '켜기' : '끄기'}`} onClick={() => setMuted(!muted)}>
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <button type="button" aria-label="한국어 자막" aria-pressed={captions} onClick={() => setCaptions(!captions)}><Captions size={19} /></button>
      </div>
    </Short>
  );
}

const Short = styled.div`
  height: 100%; min-height: 0; min-width: 0; flex: 1; display: grid;
  grid-template: 'picture text' 1fr 'picture controls' 1fr / minmax(0, .9fr) minmax(0, 1fr);
  gap: 12px clamp(14px, 4cqw, 44px); padding: 10px clamp(12px, 7cqw, 72px);
  background: #172322; color: #faf2df;
  .projection { grid-area: picture; display: grid; justify-items: end; align-items: center; min-height: 0; min-width: 0; container-type: size; }
  .portrait { position: relative; width: min(100cqw, 56.25cqh); aspect-ratio: 9 / 16; overflow: hidden; border-radius: 9px; background: #0b1011; }
  video, .poster { display: block; width: 100%; height: 100%; object-fit: contain; }
  .poster { position: absolute; inset: 0; }
  video::cue { color: white; background: #101819d9; }
  .synopsis { grid-area: text; align-self: end; min-width: 0; }
  h4 { margin: 0; color: #ffdfa0; font-size: clamp(21px, 3.8cqw, 34px); line-height: 1.16; font-weight: 750; word-break: keep-all; }
  p { margin: 11px 0 0; max-width: 31ch; color: #e6e6da; font-size: clamp(13px, 1.8cqw, 16px); line-height: 1.65; word-break: keep-all; }
  .transport { grid-area: controls; align-self: start; display: grid; grid-template-columns: 44px minmax(44px, 1fr) repeat(2, 44px); max-width: 360px; align-items: start; gap: 4px; }
  button { display: inline-grid; place-items: center; min-width: 44px; min-height: 44px; padding: 0; border: 1px solid #475a55; border-radius: 8px; background: #20342f; color: #edf4e9; cursor: pointer; }
  button:hover { border-color: #abc8ba; }
  button.play { border-color: #f9d185; background: #f9d185; color: #30291b; }
  button[aria-pressed='true'] { color: #ffdf9d; border-color: #86734c; }
  button svg { pointer-events: none; }
  .timeline { min-width: 0; position: relative; }
  input { display: block; width: 100%; height: 44px; margin: 0; accent-color: #f9ce7c; cursor: pointer; }
  .timeline span { display: block; margin-top: -5px; color: #d7e2d8; font-size: 11px; font-variant-numeric: tabular-nums; line-height: 1.25; text-align: center; white-space: nowrap; }
  .recovery { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; margin-top: 7px; color: #ffdcc3; font-size: 12px; }
  .recovery button { display: inline-flex; gap: 5px; align-items: center; justify-content: center; padding-inline: 8px; color: #fff3e3; font-size: 12px; }
  @container (max-width: 560px) {
    grid-template: 'picture' minmax(0, 1fr) 'text' auto 'controls' auto / minmax(0, 1fr);
    gap: 4px; padding: 6px 9px;
    .projection { justify-items: center; }
    .synopsis { text-align: center; }
    .synopsis h4 { display: none; }
    p { max-width: none; margin: 0; font-size: 12px; line-height: 1.4; }
    &[data-player-status='error'] .synopsis p { display: none; }
    .recovery { justify-content: center; margin: 0; }
    .transport { width: 100%; justify-self: center; }
    .timeline span { position: absolute; inset: auto 0 0; margin: 0; pointer-events: none; }
  }
  @container (max-width: 300px) {
    &:not([data-player-status='error']) { grid-template-areas: 'picture' 'controls'; grid-template-rows: minmax(0, 1fr) auto; padding-block: 3px; }
    &:not([data-player-status='error']) .synopsis { display: none; }
  }
`;
