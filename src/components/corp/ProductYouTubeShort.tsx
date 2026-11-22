'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';
import { Captions, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import styled from 'styled-components';
import ProductPortraitStage, { VideoControls } from './ProductPortraitStage';
import type { YouTubeShortFilm } from './productShowreelMedia';

type Props = {
  film: YouTubeShortFilm;
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

function alignWithScene(video: HTMLVideoElement, elapsedMs: number, sceneDurationMs: number) {
  if (!Number.isFinite(video.duration)) return;
  const progress = parseFloat(getComputedStyle(video).getPropertyValue('--scene-progress'));
  const seconds = (Number.isFinite(progress) ? progress * sceneDurationMs : elapsedMs) / 1000;
  const target = Math.max(0, Math.min(seconds, video.duration));
  if (Math.abs(video.currentTime - target) > .45) video.currentTime = target;
}

export default function ProductYouTubeShort({ film, playing, reducedMotion, sceneElapsedMs, onPlaybackChange, onSeek }: Props) {
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
  }, [film.src]);

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
    if (!reducedMotion && playing && video && !video.paused && pendingSeek.current === null) alignWithScene(video, sceneElapsedMs, film.durationMs);
  }, [playing, reducedMotion, sceneElapsedMs, film.durationMs]);

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
      alignWithScene(video, sceneElapsedMs, film.durationMs);
    }
    setPosition(video.currentTime);
  }

  return (
    <Short data-video-id={film.id} data-video-format="portrait" data-player-state={videoPlaying ? 'playing' : 'paused'}
      data-player-status={status} data-player-time={position} data-player-duration={duration} data-player-muted={muted}>
      <ProductPortraitStage film={film} descriptionId={synopsisId}>
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
        {status === 'error' && <>
          <Image className="poster" src={film.poster} alt="" width={720} height={1280} unoptimized />
          <div className="recovery"><span role="status">영상을 불러오지 못했습니다.</span>
            <button type="button" onClick={() => playOrPause(true)}><RotateCcw size={15} aria-hidden="true" />다시 불러오기</button>
          </div>
        </>}
      </ProductPortraitStage>
      <VideoControls data-portrait-controls>
        <button ref={playButton} type="button" aria-label={`YouTube 영상 ${canPause ? '일시정지' : '재생'}`}
          onClick={() => playOrPause()}>{canPause ? <Pause size={18} fill="currentColor" aria-hidden="true" /> : <Play size={18} fill="currentColor" aria-hidden="true" />}</button>
        <input type="range" aria-label="YouTube 영상 재생 위치" aria-valuetext={`${timecode(position)} / ${timecode(length)}`}
          min={0} max={length} step={.1} value={Math.min(position, length)} onChange={event => seek(event.currentTarget.valueAsNumber)} />
        <span aria-hidden="true">{timecode(position)}<small> / {timecode(length)}</small></span>
        <button type="button" aria-label={`YouTube 소리 ${muted ? '켜기' : '끄기'}`} onClick={() => setMuted(!muted)}>
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <button type="button" aria-label="한국어 자막" aria-pressed={captions} onClick={() => setCaptions(!captions)}><Captions size={19} /></button>
      </VideoControls>
    </Short>
  );
}

const Short = styled.div`
  height: 100%; min-height: 0; min-width: 0; flex: 1; display: flex; flex-direction: column; background: #f5f4ed;
  video, .poster { position: absolute; inset: 0; display: block; width: 100%; height: 100%; object-fit: contain; }
  video::cue { color: white; background: #101819d9; }
  .recovery {
    position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 8px; padding: 8px; text-align: center; color: #fff; background: #102b22c4; font-size: 12px;
  }
  .recovery button {
    min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 5px;
    padding: 6px 10px; border: 1px solid #93c5fd; border-radius: 5px; background: #93c5fd; color: #172e4a; cursor: pointer;
  }
`;
