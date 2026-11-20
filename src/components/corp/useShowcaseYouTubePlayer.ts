'use client';

import { useEffect, useRef, useState } from 'react';

type Player = {
  playVideo(): void; pauseVideo(): void; mute(): void; unMute(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number; getDuration(): number; destroy(): void;
};
type PlayerEvent = { target: Player; data?: number };
type YouTubeApi = { Player: new (frame: HTMLIFrameElement, options: { events: Record<string, (event: PlayerEvent) => void> }) => Player };
type YouTubeWindow = Window & { YT?: YouTubeApi; onYouTubeIframeAPIReady?: () => void };
let apiPromise: Promise<YouTubeApi> | null = null;

function loadApi() {
  const scope = window as YouTubeWindow;
  if (scope.YT?.Player) return Promise.resolve(scope.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    const previous = scope.onYouTubeIframeAPIReady;
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    const script = existing ?? document.createElement('script');
    const cleanup = () => {
      window.clearTimeout(timeout);
      script.removeEventListener('error', fail);
      if (scope.onYouTubeIframeAPIReady === ready) scope.onYouTubeIframeAPIReady = previous;
    };
    const fail = () => { cleanup(); if (!existing) script.remove(); reject(new Error('YouTube player API unavailable')); };
    const ready = () => { cleanup(); try { previous?.(); } finally { if (scope.YT?.Player) resolve(scope.YT); else reject(new Error('YouTube player API missing')); } };
    const timeout = window.setTimeout(fail, 15000);
    scope.onYouTubeIframeAPIReady = ready;
    script.addEventListener('error', fail, { once: true });
    if (!existing) { script.src = 'https://www.youtube.com/iframe_api'; script.async = true; document.head.appendChild(script); }
  }).catch(error => { apiPromise = null; throw error; });
  return apiPromise;
}

/** Official iframe API keeps external Shorts in sync with the shared showcase controls. */
export function useShowcaseYouTubePlayer({ videoId, title, shouldPlay, onUserPlay, onUserPause }: { videoId: string; title: string; shouldPlay: boolean; onUserPlay: () => void; onUserPause: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const readyRef = useRef(false);
  const desired = useRef(shouldPlay);
  const pauseCallback = useRef(onUserPause);
  const playCallback = useRef(onUserPlay);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [blocked, setBlocked] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(true);

  useEffect(() => { pauseCallback.current = onUserPause; }, [onUserPause]);
  useEffect(() => { playCallback.current = onUserPlay; }, [onUserPlay]);
  useEffect(() => {
    desired.current = shouldPlay;
    if (readyRef.current) {
      if (shouldPlay) playerRef.current?.playVideo();
      else playerRef.current?.pauseVideo();
    }
  }, [shouldPlay]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let inView = false;
    let poll: number | undefined;
    let player: Player | undefined;
    readyRef.current = false;
    const frame = document.createElement('iframe');
    const params = new URLSearchParams({ enablejsapi: '1', origin: window.location.origin, autoplay: '0', mute: '1', controls: '0', playsinline: '1', rel: '0', loop: '1', playlist: videoId });
    frame.src = `https://www.youtube-nocookie.com/embed/${videoId}?${params}`;
    frame.title = title;
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.dataset.youtubePlayer = videoId;
    host.appendChild(frame);
    const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting && entry.intersectionRatio >= .5; }, { threshold: .5 });
    observer.observe(host);
    const fail = () => { if (!disposed) { window.clearInterval(poll); setStatus('error'); setVideoPlaying(false); } };
    const timeout = window.setTimeout(fail, 20000);
    loadApi().then(api => {
      if (disposed) return;
      player = new api.Player(frame, { events: {
        onReady: event => {
          if (disposed) return;
          window.clearTimeout(timeout);
          readyRef.current = true;
          event.target.mute();
          setStatus('ready');
          if (desired.current) event.target.playVideo();
          else event.target.pauseVideo();
          poll = window.setInterval(() => {
            if (disposed) return;
            const time = event.target.getCurrentTime();
            const length = event.target.getDuration();
            if (Number.isFinite(time)) setPosition(time);
            if (Number.isFinite(length) && length > 0) setDuration(length);
          }, 500);
        },
        onStateChange: event => {
          if (disposed) return;
          if (event.data === 1 && !desired.current) {
            const userStarted = document.activeElement === frame && document.visibilityState === 'visible' && inView;
            if (!userStarted) { event.target.pauseVideo(); return; }
            desired.current = true;
            playCallback.current();
          }
          setVideoPlaying(event.data === 1);
          if (event.data === 1 || event.data === 2 || event.data === 5) setStatus('ready');
          if (event.data === 1) setBlocked(false);
          if (event.data === 3) setStatus('loading');
          if (event.data === 2 && desired.current) pauseCallback.current();
        },
        onError: fail,
        onAutoplayBlocked: () => { if (!disposed) { setBlocked(true); setStatus('ready'); setVideoPlaying(false); } },
      } });
      playerRef.current = player;
    }).catch(fail);
    return () => {
      disposed = true; readyRef.current = false; playerRef.current = null;
      window.clearTimeout(timeout); window.clearInterval(poll);
      observer.disconnect(); player?.destroy(); frame.remove();
    };
  }, [videoId, title, attempt]);

  return {
    hostRef, status, blocked, videoPlaying, position, duration, muted,
    play: () => { desired.current = true; setBlocked(false); if (readyRef.current) playerRef.current?.playVideo(); },
    pause: () => { desired.current = false; if (readyRef.current) playerRef.current?.pauseVideo(); },
    seek: (seconds: number) => { if (readyRef.current && Number.isFinite(seconds)) { playerRef.current?.seekTo(seconds, true); setPosition(seconds); } },
    toggleMute: () => { if (!readyRef.current) return; if (muted) playerRef.current?.unMute(); else playerRef.current?.mute(); setMuted(!muted); },
    retry: () => { setStatus('loading'); setBlocked(false); setPosition(0); setDuration(0); setMuted(true); setAttempt(value => value + 1); },
  };
}
