'use client';

import type { CSSProperties } from 'react';
import { BookOpen } from 'lucide-react';
import { SiInstagram, SiNaver, SiTiktok, SiTistory, SiWordpress, SiYoutube } from 'react-icons/si';
import styled, { css, keyframes } from 'styled-components';

type Channel = 'youtube' | 'tiktok' | 'blog' | 'instagram';
const CHANNEL_BRANDS = {
  youtube: { icon: SiYoutube, color: '#ef233c', name: 'YouTube', detail: '이야기를 담은 브랜드 영상' },
  tiktok: { icon: SiTiktok, color: '#101828', name: 'TikTok', detail: '짧고 선명한 순간의 콘텐츠' },
  blog: { icon: BookOpen, color: '#16834b', name: '블로그', detail: '읽고 머무는 브랜드의 이야기' },
  instagram: { icon: SiInstagram, color: '#d62976', name: 'Instagram', detail: '한 컷씩 이어지는 브랜드 스토리' },
} as const;
const CHANNEL_ORDER: Channel[] = ['youtube', 'tiktok', 'blog', 'instagram'];
const BLOG_BRANDS = [
  { id: 'naver', name: '네이버', icon: SiNaver, color: '#03c75a' },
  { id: 'tistory', name: '티스토리', icon: SiTistory, color: '#eb531f' },
  { id: 'wordpress', name: '워드프레스', icon: SiWordpress, color: '#21759b' },
] as const;

export function ContentBrandMark({ channel }: { channel: Channel }) {
  const { icon: Icon, color } = CHANNEL_BRANDS[channel];
  return <Mark data-channel-logo={channel} aria-hidden="true"><Icon color={color} size={18} /></Mark>;
}

export function ContentChannelMotion({ channel, playing, reducedMotion }: { channel: Channel; playing: boolean; reducedMotion: boolean }) {
  const brand = CHANNEL_BRANDS[channel];
  const activeIndex = CHANNEL_ORDER.indexOf(channel);
  return (
    <Ribbon data-content-brand-strip data-active-channel={channel} $moving={playing && !reducedMotion}>
      <Identity key={channel} $moving={playing && !reducedMotion}>
        <ContentBrandMark channel={channel} />
        <div><strong>{brand.name}</strong><span>{brand.detail}</span></div>
      </Identity>
      <ChannelRoute aria-hidden="true" style={{ '--brand-progress': activeIndex / (CHANNEL_ORDER.length - 1) } as CSSProperties}>
        <RouteLine><i /></RouteLine>
        {CHANNEL_ORDER.map((id, index) => <RouteStop key={id} data-channel-stop={id} data-active={id === channel} data-complete={index < activeIndex}><ContentBrandMark channel={id} /></RouteStop>)}
      </ChannelRoute>
    </Ribbon>
  );
}

export function BlogPlatformLogos() {
  return <BlogBrands role="group" aria-label="블로그 플랫폼">
    {BLOG_BRANDS.map(({ id, name, icon: Icon, color }) => <span key={id} data-blog-platform={id}><Icon color={color} size={18} aria-hidden="true" /><b>{name}</b></span>)}
  </BlogBrands>;
}

const enter = keyframes`
  from { opacity: .45; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
`;
const signal = keyframes`
  0% { opacity: 0; transform: translateX(-100%); }
  20%, 70% { opacity: .85; }
  100% { opacity: 0; transform: translateX(220%); }
`;
const Mark = styled.span`
  display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto;
  width: 24px; height: 24px; border-radius: 6px; background: #fff; border: 1px solid #dde5ed;
  > svg { display: block; flex: 0 0 auto; width: 16px; height: 16px; }
`;
const Ribbon = styled.div<{ $moving: boolean }>`
  display: flex; align-items: center; justify-content: space-between; gap: 18px; flex-shrink: 0;
  min-height: 62px; margin-bottom: 10px; padding: 9px 14px; border: 1px solid #294765; border-radius: 9px;
  background: #10243a; color: #edf5ff;
  ${({ $moving }) => $moving && css`[data-channel-stop][data-active='true'] { transform: translateY(-2px); border-color: #8fc9ff; box-shadow: 0 3px 12px #93c5fd24; }`}
  @container (max-width: 520px) { min-height: 54px; margin-bottom: 8px; padding: 8px 10px; gap: 8px; }
  @media (prefers-reduced-motion: reduce) { *, *::after { animation: none !important; transition: none !important; } }
`;
const Identity = styled.div<{ $moving: boolean }>`
  display: flex; align-items: center; gap: 10px; min-width: 0;
  > ${Mark} { width: 34px; height: 34px; border-radius: 9px; > svg { width: 22px; height: 22px; } }
  > div { min-width: 0; display: grid; gap: 3px; }
  strong { font-size: 14px; line-height: 1.3; }
  div > span { font-size: 11px; line-height: 1.5; color: #b8ccdf; }
  ${({ $moving }) => $moving && css`animation: ${enter} 450ms cubic-bezier(.22, 1, .36, 1) both;`}
  @container (max-width: 520px) { gap: 7px; > ${Mark} { width: 28px; height: 28px; > svg { width: 19px; height: 19px; } } strong { font-size: 12px; } div > span { display: none; } }
`;
const ChannelRoute = styled.div`
  position: relative; display: flex; align-items: center; justify-content: space-between; gap: 18px; flex-shrink: 0;
  @container (max-width: 520px) { gap: 8px; }
`;
const RouteLine = styled.div`
  position: absolute; top: 50%; left: 15px; right: 15px; height: 2px; background: #35536e; overflow: hidden;
  > i { display: block; width: 100%; height: 100%; transform: scaleX(var(--brand-progress)); transform-origin: left; background: #76d9cf; transition: transform 600ms ease; }
  &::after { content: ''; position: absolute; inset: 0; width: 38%; opacity: 0; background: #b6e8ff; animation: ${signal} 3.6s ease-in-out infinite; }
`;
const RouteStop = styled.span`
  position: relative; z-index: 1; display: grid; place-items: center; padding: 3px; border: 1px solid #35536e; border-radius: 9px; background: #0d1c30;
  transition: border-color 350ms, box-shadow 350ms, transform 350ms;
  &[data-complete='true'] { border-color: #488a88; }
  &[data-active='true'] { border-color: #8fc9ff; background: #234362; }
  @container (max-width: 520px) { padding: 2px; border-radius: 7px; > ${Mark} { width: 19px; height: 19px; border-radius: 4px; > svg { width: 13px; height: 13px; } } }
`;
const BlogBrands = styled.div`
  display: flex; align-items: center; gap: 14px; min-width: 0;
  > span { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
  svg { flex: 0 0 auto; width: 18px; height: 18px; }
  b { font-family: inherit; font-size: 11px; font-weight: 650; line-height: 1.3; color: #33483d; }
  @container (max-width: 520px) { width: 100%; justify-content: space-between; gap: 8px; svg { width: 16px; height: 16px; } b { font-size: 10px; } }
`;
