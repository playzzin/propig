'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronDown, ArrowUpRight, BookOpen } from 'lucide-react';
import styled from 'styled-components';

const base = '/images/corp/founder-story';
const episodes = [
  { title: '내 첫 목표는, 화장실 있는 방', description: '수중의 17만 원에서 시작한 다시 살기.', summary: '출소 후 보호소와 작은 방을 거쳐, 현장에서 일하며 화장실이 있는 방을 마련합니다.', behind: [
    { id: '1-1', title: '당연했던 것들이 행복이 되기까지', summary: '혼자 천장을 보고 눕는 일과 내 화장실이 있는 방. 예전에는 몰랐던 작은 행복을 발견합니다.' },
  ] },
  { title: '일할수록 마이너스', description: '현장일, 배달, 대리운전. 내 오토바이를 사기까지.', summary: '하루를 꽉 채워 일해도 수수료와 렌트료가 빠져나갑니다. 조금씩 돈을 모아 자신의 오토바이를 마련합니다.', behind: [
    { id: '2-1', title: '같은 수수료, 달라진 자리', summary: '직업소개소를 운영하며 받던 수수료를, 직접 현장에서 일하고 내게 되면서 일하는 사람의 입장을 돌아봅니다.' },
    { id: '2-2', title: '작은 오토바이에서 찾은 행복', summary: '외제차를 타던 때를 지나 대중교통과 킥보드를 배웁니다. 작은 오토바이에서 이동의 자유와 행복을 느낍니다.' },
    { id: '2-3', title: '일을 바꾸기 전에, 나부터', summary: '현장의 고단함, 배달 실수, 대리운전 중 손님과의 다툼을 겪으며 자신도 달라져야 함을 깨닫습니다.' },
  ] },
  { title: '현장노가다에서 디지털노가다로...', description: '겨울을 지나며 찾기 시작한 새로운 가능성.', summary: '추위와 몸 상태에 흔들리는 일 대신 꾸준히 할 수 있는 일을 찾기 위해 중고 컴퓨터를 사고 공부를 시작합니다.', behind: [
    { id: '3-1', title: '현장에서 책상으로, 끝까지 해보자', summary: '컴퓨터 앞에서 더 오래 일해도 수입은 기대에 미치지 못했습니다. 공부와 실습을 거듭하며 만드는 재미를 찾지만, 오래 앉아 있는 사이 몸무게도 150kg까지 늘어납니다.' },
  ] },
  { title: '남의 일을 끝내던 밤, 내 일을 꿈꾸다', description: '프리랜서 개발을 거쳐 내 프로젝트를 준비하는 시간.', summary: '프리랜서로 개발하며 긴 노동시간과 수수료를 경험합니다. 실력이 늘면서 직접 프로젝트를 맡을 꿈을 키웁니다.', behind: [
    { id: '4-1', title: '중간을 지나, 고객과 직접 만나다', summary: '고객과 직접 소통하며 프로젝트 대금과 자신의 정산액 차이를 알게 됩니다. 기존 일을 소개하던 사람과 관계가 끊긴 뒤에도 작은 의뢰를 이어가며 시간당 2만 원을 벌기 시작합니다.' },
  ] },
  { title: '이제, 내 이름으로 시작한다', description: '오랜 친구와의 재회, 그리고 첫 수주.', summary: '친구의 장례식에서 건설회사를 운영하는 친구와 다시 만납니다. 첫 프로젝트와 착수금 100만 원을 받아 자신의 이름으로 일을 시작합니다.', behind: [
    { id: '5-1', title: '첫 프로젝트, 그 뒤의 진짜 이야기', summary: '첫 결과물에 대한 냉정한 피드백을 받고 다시 고칩니다. 고객이 편해졌다고 말하고 새 의뢰가 들어오지만, 자신감이 자만으로 바뀌는 모습도 돌아봅니다.' },
  ] },
];

function Comic({ file, title, summary }: { file: string; title: string; summary: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <figure>
      <figcaption>
        <p>{summary}</p>
        <a href={`${base}/${file}.png`} target="_blank" rel="noopener noreferrer">
          크게 보기 <span className="sr-only">— {title} (새 탭)</span><ArrowUpRight size={16} aria-hidden="true" />
        </a>
      </figcaption>
      {failed ? <p role="status">이미지를 불러오지 못했습니다. ‘크게 보기’로 다시 열어주세요.</p> : (
        <Image src={`${base}/${file}.png`} alt={`${title}. ${summary}`} width={1024} height={1536}
          unoptimized loading="lazy" onError={() => setFailed(true)} />
      )}
    </figure>
  );
}

function EpisodeButton({ episode, index, open, onToggle }: {
  episode: typeof episodes[number]; index: number; open: boolean; onToggle: () => void;
}) {
  const id = `founder-episode-${index + 1}`;
  return (
    <button className="episode-trigger" id={`${id}-trigger`} aria-expanded={open} aria-controls={id} onClick={onToggle}>
      <span className="number">0{index + 1}화</span>
      <span className="episode-portrait" aria-hidden="true">
        <span className="episode-character">
          <Image src={`${base}/guide-episode-${index + 1}.png`} alt="" width={160} height={160}
            sizes="72px" loading="lazy" />
        </span>
      </span>
      <span className="episode-copy"><strong>{episode.title}</strong></span>
      <span className="episode-action">
        <span className="toggle-label">{open ? '접기' : '펼쳐 읽기'}</span>
        <ChevronDown size={16} className="chevron" aria-hidden="true" />
      </span>
    </button>
  );
}

function EpisodeReader({ episode, index, open, onToggle }: {
  episode: typeof episodes[number]; index: number; open: boolean; onToggle: (fromFooter?: boolean) => void;
}) {
  const id = `founder-episode-${index + 1}`;
  return (
      <div id={id} role="region" aria-labelledby={`${id}-trigger`} hidden={!open}>
        {open ? <div className="reader">
          <div className="reader-heading">
            <span>{index + 1}화 · 본편과 비하인드</span>
            <h3>{episode.title}</h3>
            <p>{episode.description}</p>
          </div>
          <Comic file={`episode-${index + 1}`} title={`창업배경 ${index + 1}화 — ${episode.title}`} summary={episode.summary} />
          {episode.behind.length ? <div className="behind">
            <p className="behind-label">이 이야기의 비하인드</p>
            {episode.behind.map((story) => <div key={story.id} className="behind-item">
              <h4>{story.title}</h4>
              <Comic file={`behind-${story.id}`} title={story.title} summary={story.summary} />
            </div>)}
          </div> : null}
          <button className="close-reader" onClick={() => onToggle(true)}>이 회차 접기</button>
        </div> : null}
      </div>
  );
}

function alignEpisodeTitle(index: number, previousTop: number | null) {
  const title = document.getElementById(`founder-episode-${index + 1}-trigger`);
  if (!title) return;
  const navigation = title.parentElement;
  if (navigation) {
    const buttonBounds = title.getBoundingClientRect();
    const navigationBounds = navigation.getBoundingClientRect();
    const horizontalDelta = buttonBounds.left < navigationBounds.left + 8
      ? buttonBounds.left - navigationBounds.left - 8
      : buttonBounds.right > navigationBounds.right - 8
        ? buttonBounds.right - navigationBounds.right + 8 : 0;
    navigation.scrollBy({ left: horizontalDelta, behavior: 'instant' });
  }
  // The button strip scrolls horizontally; only its ancestors own page scrolling.
  let scrollport = navigation?.parentElement ?? null;
  while (scrollport && !/(auto|scroll)/.test(getComputedStyle(scrollport).overflowY)) {
    scrollport = scrollport.parentElement;
  }
  // Align after React has removed the old comic, before the browser paints.
  // Scrolling only the reader's scrollport avoids moving the surrounding app shell.
  const viewportTop = scrollport ? Math.max(0, scrollport.getBoundingClientRect().top) : 0;
  const viewportBottom = scrollport ? Math.min(window.innerHeight, scrollport.getBoundingClientRect().bottom) : window.innerHeight;
  const titleTop = previousTop === null ? viewportTop + 20
    : Math.max(viewportTop + 20, Math.min(previousTop, viewportBottom - title.offsetHeight - 20));
  const delta = title.getBoundingClientRect().top - titleTop;
  title.focus({ preventScroll: true });
  if (scrollport) scrollport.scrollBy({ top: delta, behavior: 'instant' });
  else window.scrollBy({ top: delta, behavior: 'instant' });
}

export default function FounderStory() {
  const [openEpisode, setOpenEpisode] = useState<number | null>(null);
  const pendingAlignment = useRef<{ index: number; previousTop: number | null } | null>(null);
  const selectedEpisode = openEpisode === null ? null : episodes[openEpisode];

  useLayoutEffect(() => {
    const pending = pendingAlignment.current;
    if (!pending) return;
    pendingAlignment.current = null;
    alignEpisodeTitle(pending.index, pending.previousTop);
  }, [openEpisode]);

  const toggleEpisode = (index: number, fromFooter = false) => {
    const closing = openEpisode === index;
    const title = document.getElementById(`founder-episode-${index + 1}-trigger`);
    pendingAlignment.current = {
      index,
      previousTop: closing && !fromFooter ? title?.getBoundingClientRect().top ?? null : null,
    };
    setOpenEpisode(closing ? null : index);
  };

  const startReading = () => {
    const index = openEpisode ?? 0;
    if (openEpisode === index) {
      alignEpisodeTitle(index, null);
      return;
    }
    pendingAlignment.current = { index, previousTop: null };
    setOpenEpisode(index);
  };
  return <StorySection id="founder-story" aria-labelledby="founder-story-title">
    <div className="inner">
      <header>
        <div className="story-copy">
        <span className="eyebrow"><BookOpen size={17} aria-hidden="true" /> 그뚠이 스토리</span>
        <h2 id="founder-story-title">창업배경</h2>
        <p>화장실 있는 방, 내 오토바이, 그리고 한 대의 컴퓨터.<br />지금의 나를 만든 시간을 웹툰으로 담았습니다.</p>
        <div className="reading-note"><span>본편 {episodes.length}화 · 비하인드 {episodes.reduce((total, episode) => total + episode.behind.length, 0)}편</span><span>아래 회차 버튼을 눌러 이야기를 펼쳐보세요.</span></div>
        </div>
        <button className="reading-guide" onClick={startReading} aria-label={`그뚠이와 창업배경 ${(openEpisode ?? 0) + 1}화 펼쳐 읽기`} aria-controls={`founder-episode-${(openEpisode ?? 0) + 1}`}>
          <span className="guide-bubble">
            <strong>{openEpisode === null ? '내 이야기, 한번 들어볼래?' : `지금 읽는 이야기 · ${openEpisode + 1}화`}</strong>
            <span>{selectedEpisode ? selectedEpisode.title : <>원하는 회차를 고르면<br />웹툰이 펼쳐져요.</>}</span>
            <span className="guide-action">{openEpisode === null ? '1화부터 읽기' : `${openEpisode + 1}화 이어 읽기`} <ChevronDown size={16} aria-hidden="true" /></span>
          </span>
          <span className="guide-portrait" aria-hidden="true">
            <Image key={openEpisode ?? 'guide'} src={`${base}/${openEpisode === null ? 'reading-guide-character.png' : `guide-episode-${openEpisode + 1}.png`}`} alt="" width={312} height={312} sizes="(max-width: 640px) 144px, 156px" className="guide-character" />
          </span>
        </button>
      </header>
      <div className="episodes">
        <div className="episode-navigation" role="group" aria-label="창업배경 회차 선택">
          {episodes.map((episode, index) => <EpisodeButton key={episode.title} episode={episode} index={index}
            open={openEpisode === index} onToggle={() => toggleEpisode(index)} />)}
        </div>
        {episodes.map((episode, index) => <EpisodeReader key={episode.title} episode={episode} index={index}
          open={openEpisode === index} onToggle={(fromFooter) => toggleEpisode(index, fromFooter)} />)}
      </div>
    </div>
  </StorySection>;
}

const StorySection = styled.section`
  --story-surface: #ffffff;
  --story-soft: #edf3ff;
  --story-border: #dfe6ef;
  --story-accent: #2563eb;
  --story-muted: #64748b;
  background: transparent;
  color: #172033;
  padding: 56px 32px;
  .inner { width: min(100%, 1120px); margin: 0 auto; }
  header { display: grid; grid-template-columns: minmax(0, 1fr) 340px; align-items: center; gap: 24px; margin-bottom: 28px; }
  .story-copy { min-width: 0; }
  .reading-guide { display: flex; align-items: center; justify-content: center; position: relative; isolation: isolate; width: 100%; min-height: 184px; padding: 12px 0; border-radius: 16px; background: transparent; text-align: left; touch-action: manipulation; }
  .reading-guide::before { content: ''; position: absolute; z-index: -1; right: 6px; bottom: 16px; width: 148px; height: 148px; border-radius: 50%; background: var(--story-soft); }
  .guide-bubble { position: relative; z-index: 1; display: grid; gap: 10px; width: 188px; flex-shrink: 0; padding: 18px 16px; border: 1px solid #cbdcfb; border-radius: 16px 16px 4px 16px; background: var(--story-surface); box-shadow: 0 8px 24px rgba(37, 99, 235, 0.06); }
  .guide-bubble strong { font-size: 14px; line-height: 1.5; word-break: keep-all; }
  .guide-bubble > span { font-size: 13px; line-height: 1.65; color: var(--story-muted); }
  .guide-bubble .guide-action { display: flex; align-items: center; gap: 6px; color: var(--story-accent); font-weight: 750; }
  .guide-portrait { display: block; width: 156px; height: 156px; flex-shrink: 0; margin-left: -12px; align-self: flex-end; transform-origin: 50% 90%; transition: transform 240ms ease; }
  .guide-character { display: block; border-radius: 16px; width: 100%; height: 100%; object-fit: contain; animation: story-character-pop 520ms ease both; }
  .guide-bubble { transition: border-color 180ms ease, background-color 180ms ease; }
  .reading-guide:focus-visible .guide-bubble { border-color: var(--story-accent); background: #f5f8ff; }
  .reading-guide:focus-visible .guide-portrait { transform: translateY(-5px) rotate(3deg); }
  .reading-guide:active .guide-portrait { transform: translateY(2px) scale(0.96); }
  .episode-trigger { scroll-margin-top: 88px; }
  .eyebrow { display: flex; align-items: center; gap: 8px; color: var(--story-accent); font-size: 13px; font-weight: 750; }
  h2 { margin: 14px 0; font-size: 32px; line-height: 1.35; font-weight: 850; }
  .story-copy > p { font-size: 15px; line-height: 1.8; color: var(--story-muted); margin: 0; word-break: keep-all; }
  .reading-note { display: flex; flex-wrap: wrap; gap: 8px 20px; margin-top: 24px; color: var(--story-muted); font-size: 12px; }
  .reading-note > :first-child { font-weight: 700; color: var(--story-accent); }
  .episodes { overflow-anchor: none; min-width: 0; }
  .episode-navigation { display: grid; grid-template-columns: repeat(5, minmax(144px, 1fr)); align-items: stretch; gap: 12px; overflow-x: auto; padding: 10px 3px 14px; scrollbar-width: thin; scrollbar-color: #b9c9e4 transparent; }
  h3, h4 { margin: 0; }
  button { border: 0; cursor: pointer; color: inherit; }
  .episode-trigger { display: grid; grid-template-rows: auto 72px 1fr auto; justify-items: center; min-width: 0; gap: 10px; padding: 16px 12px; border: 1px solid var(--story-border); border-radius: 14px; text-align: center; background: var(--story-surface); touch-action: manipulation; transition: background-color 180ms ease, border-color 180ms ease; }
  .episode-trigger:focus-visible, .episode-trigger[aria-expanded='true'] { background: var(--story-soft); border-color: var(--story-accent); }
  button:focus-visible, a:focus-visible { outline: 3px solid var(--story-accent); outline-offset: -3px; }
  .number { font-size: 13px; color: var(--story-muted); font-weight: 750; font-variant-numeric: tabular-nums; }
  .episode-portrait { display: block; width: 72px; height: 72px; border-radius: 18px; background: var(--story-soft); transform-origin: 50% 85%; transition: transform 240ms ease; }
  .episode-character { display: block; width: 100%; height: 100%; transform-origin: 50% 85%; }
  .episode-character img { display: block; width: 100%; height: 100%; object-fit: contain; border-radius: 18px; }
  .episode-trigger:focus-visible .episode-portrait { transform: translateY(-4px) rotate(-4deg); }
  .episode-trigger:active .episode-portrait { transform: translateY(2px) scale(0.94); }
  .episode-trigger[aria-expanded='true'] .episode-character { animation: story-character-pop 520ms ease both; }
  .episode-trigger[aria-expanded='true'] .number { color: var(--story-accent); }
  .episode-copy { min-width: 0; min-height: 63px; display: grid; align-content: start; }
  .episode-copy strong { font-size: 14px; line-height: 1.5; word-break: keep-all; overflow-wrap: anywhere; }
  .episode-action { display: flex; align-items: center; justify-content: center; gap: 6px; }
  .toggle-label { font-size: 12px; font-weight: 650; color: var(--story-muted); white-space: nowrap; }
  .chevron { flex-shrink: 0; color: var(--story-accent); transition: transform 180ms ease; }
  [aria-expanded='true'] .chevron { transform: rotate(180deg); }
  [aria-expanded='true'] .toggle-label { color: var(--story-accent); }
  .reader { margin-top: 8px; padding: 0 0 24px; border: 1px solid var(--story-border); border-radius: 14px; background: var(--story-surface); animation: story-reader-reveal 240ms ease both; }
  .reader-heading { padding: 24px 20px 18px; border-bottom: 1px solid var(--story-border); }
  .reader-heading > span { color: var(--story-accent); font-size: 12px; font-weight: 750; }
  .reader-heading h3 { margin-top: 10px; font-size: 22px; line-height: 1.5; word-break: keep-all; }
  .reader-heading p { margin: 8px 0 0; color: var(--story-muted); font-size: 14px; line-height: 1.7; word-break: keep-all; }
  figure { margin: 0 auto; max-width: 1024px; }
  figcaption { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; padding: 18px 20px; font-size: 13px; line-height: 1.7; }
  figcaption p { margin: 0; color: var(--story-muted); }
  figcaption a { display: inline-flex; align-items: center; gap: 4px; min-height: 44px; flex-shrink: 0; color: var(--story-accent); text-underline-offset: 4px; }
  figure img { display: block; width: 100%; height: auto; }
  .behind { width: min(100%, 1024px); margin: 24px auto 0; }
  .behind-label { padding: 16px 20px; margin: 0; background: var(--story-soft); font-size: 12px; font-weight: 750; color: var(--story-accent); }
  .behind-item { border-top: 1px solid var(--story-border); }
  h4 { padding: 18px 20px 0; font-size: 14px; line-height: 1.6; }
  .close-reader { display: block; margin: 24px auto 0; border: 1px solid var(--story-border); border-radius: 8px; padding: 12px 24px; color: var(--story-accent); background: var(--story-surface); font-size: 13px; }
  .close-reader:hover { background: var(--story-soft); }
  @keyframes story-character-pop {
    0% { transform: translateY(0) rotate(0); }
    35% { transform: translateY(-8px) rotate(-5deg); }
    65% { transform: translateY(-2px) rotate(3deg); }
    100% { transform: translateY(0) rotate(0); }
  }
  @keyframes story-reader-reveal {
    from { opacity: 0; transform: translateY(-6px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @media (hover: hover) and (pointer: fine) {
    .reading-guide:hover .guide-bubble { border-color: var(--story-accent); background: #f5f8ff; }
    .reading-guide:hover .guide-portrait { transform: translateY(-5px) rotate(3deg); }
    .reading-guide:active .guide-portrait { transform: translateY(2px) scale(0.96); }
    .episode-trigger:hover { background: var(--story-soft); border-color: var(--story-accent); }
    .episode-trigger:hover .episode-portrait { transform: translateY(-4px) rotate(-4deg); }
    .episode-trigger:active .episode-portrait { transform: translateY(2px) scale(0.94); }
  }
  @media (max-width: 1000px) {
    header { grid-template-columns: minmax(0, 1fr); gap: 16px; }
    .reading-guide { width: min(100%, 340px); justify-self: end; }
  }
  @media (max-width: 640px) {
    padding: 32px 16px;
    h2 { font-size: 25px; }
    .reading-guide { min-height: 180px; }
    .guide-bubble { width: min(58%, 168px); padding: 14px 12px; }
    .guide-portrait { width: 42%; max-width: 144px; height: auto; aspect-ratio: 1; margin-left: -12px; }
    .reading-guide::before { width: 144px; height: 144px; }
    .guide-bubble strong { font-size: 13px; }
    .guide-bubble > span { font-size: 12px; }
    .episode-navigation { gap: 10px; }
    .reader-heading { padding: 20px 12px 16px; }
    .reader-heading h3 { font-size: 19px; }
    figcaption { flex-direction: column; gap: 4px; padding: 16px 12px; }
    h4, .behind-label { padding-left: 12px; padding-right: 12px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .episode-trigger, .episode-portrait, .chevron, .guide-portrait, .guide-bubble { transition: none; }
    .episode-character, .guide-character, .reader { animation: none !important; }
    .episode-trigger .episode-portrait, .reading-guide .guide-portrait { transform: none !important; }
  }
`;
