'use client';

import type { IframeHTMLAttributes } from 'react';

export const YOUTUBE_EMBED_ALLOW =
  'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';

function normalizeYouTubeCandidate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\/\//.test(trimmed)) return `https:${trimmed}`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/(^|\.)youtu\.be\//i.test(trimmed) || /(^|\.)youtube(?:-nocookie)?\.com\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  return null;
}

function parseTimeToSeconds(value: string | null) {
  if (!value) return undefined;
  const clean = value.trim().toLowerCase();
  if (!clean) return undefined;

  if (/^\d+$/.test(clean)) return Number(clean);

  const match = clean.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
  if (!match) return undefined;

  const [, hours = '0', minutes = '0', seconds = '0'] = match;
  const total = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
  return Number.isFinite(total) && total > 0 ? total : undefined;
}

function readYouTubeVideoId(url: URL) {
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  const pathParts = url.pathname.split('/').filter(Boolean);
  const isYouTubeHost = host === 'youtube.com' || host.endsWith('.youtube.com');
  const isYouTubeNoCookieHost = host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com');

  if (host === 'youtu.be') return pathParts[0];
  if (!isYouTubeHost && !isYouTubeNoCookieHost) return null;

  if (url.pathname === '/watch') return url.searchParams.get('v');
  if (['embed', 'shorts', 'live', 'v'].includes(pathParts[0] ?? '')) return pathParts[1];

  return null;
}

export function getYouTubeEmbedUrl(value: string | null | undefined) {
  if (!value) return null;

  const candidate = normalizeYouTubeCandidate(value);
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    const videoId = readYouTubeVideoId(url)?.trim();
    if (!videoId || !/^[\w-]{6,}$/.test(videoId)) return null;

    const embedUrl = new URL(`https://www.youtube-nocookie.com/embed/${videoId}`);
    embedUrl.searchParams.set('rel', '0');
    embedUrl.searchParams.set('modestbranding', '1');

    const start = parseTimeToSeconds(url.searchParams.get('start') ?? url.searchParams.get('t'));
    if (start) embedUrl.searchParams.set('start', String(start));

    return embedUrl.toString();
  } catch {
    return null;
  }
}

interface CorpYouTubeEmbedProps extends Omit<IframeHTMLAttributes<HTMLIFrameElement>, 'src'> {
  url: string;
  title: string;
}

export function CorpYouTubeEmbed({ url, title, ...props }: CorpYouTubeEmbedProps) {
  const src = getYouTubeEmbedUrl(url);
  if (!src) return null;

  return (
    <iframe
      src={src}
      title={title}
      loading="lazy"
      allow={YOUTUBE_EMBED_ALLOW}
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
      {...props}
    />
  );
}
