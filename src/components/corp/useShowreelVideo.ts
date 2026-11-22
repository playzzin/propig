'use client';

import { useEffect, useRef, type SyntheticEvent } from 'react';

type VideoOptions = {
  source: string;
  durationMs: number;
  elapsedMs: number;
  playing: boolean;
  enabled: boolean;
  onSelectShot: (milliseconds: number) => void;
};

function revealDecodedFrame({ currentTarget: video }: SyntheticEvent<HTMLVideoElement>) {
  if (!video.paused && !video.seeking && video.readyState >= video.HAVE_CURRENT_DATA) {
    video.dataset.presented = 'true';
  }
}

function revealIllustration({ currentTarget: video, type }: SyntheticEvent<HTMLVideoElement>) {
  if (type === 'error' || !video.paused) delete video.dataset.presented;
}

export const showreelVideoEvents = {
  onPlaying: revealDecodedFrame,
  onSeeked: revealDecodedFrame,
  onSeeking: revealIllustration,
  onWaiting: revealIllustration,
  onError: revealIllustration,
};

export function useShowreelVideo({ source, durationMs, elapsedMs, playing, enabled, onSelectShot }: VideoOptions) {
  const player = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = player.current;
    if (!enabled || !video) return;
    return () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [enabled, source]);

  useEffect(() => {
    const video = player.current;
    if (!enabled || !video) return;
    if (!playing) {
      video.pause();
      return;
    }
    // An offscreen stage or a reduced-motion visit can display the illustration without fetching a film.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!video.hasAttribute('src')) {
      video.muted = true;
      video.src = source;
    }
    void video.play().catch((error: DOMException) => {
      if (error.name !== 'AbortError' && video.paused) delete video.dataset.presented;
    });
  }, [playing, enabled, source]);

  useEffect(() => {
    const video = player.current;
    if (!enabled || !playing || !video?.hasAttribute('src')) return;
    const synchronize = () => {
      if (!Number.isFinite(video.duration)) return;
      // The shared clock retains the subsecond position between the caption's second-by-second updates.
      const progress = parseFloat(getComputedStyle(video).getPropertyValue('--scene-progress'));
      const clockMs = Number.isFinite(progress) ? progress * durationMs : elapsedMs;
      const target = Math.max(0, Math.min(clockMs / 1000, video.duration - .04));
      if (Math.abs(video.currentTime - target) > .4) video.currentTime = target;
    };
    synchronize();
    video.addEventListener('loadedmetadata', synchronize);
    return () => video.removeEventListener('loadedmetadata', synchronize);
  }, [durationMs, elapsedMs, playing, enabled, source]);

  const selectShot = (milliseconds: number) => {
    const video = player.current;
    if (video) {
      video.pause();
      delete video.dataset.presented;
      if (Number.isFinite(video.duration)) video.currentTime = milliseconds / 1000;
    }
    onSelectShot(milliseconds);
  };
  return { player, selectShot };
}
