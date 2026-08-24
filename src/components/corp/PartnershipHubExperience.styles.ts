import styled, { css, keyframes } from 'styled-components';

const ink = '#080b0a';
const paper = '#f3f0e8';
const mint = '#5eead4';
const yellow = '#ffcf5a';
const sky = '#7dd3fc';
const coral = '#fb8da1';

const enterPanel = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;

const nodeArrival = keyframes`
  0% { opacity: 0; transform: translateY(12px) scale(.92); }
  70% { opacity: 1; transform: translateY(-2px) scale(1.02); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
`;

const centerArrival = keyframes`
  0% { opacity: 0; transform: translate(-50%, -44%) scale(.88); }
  70% { opacity: 1; transform: translate(-50%, -51%) scale(1.03); }
  100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
`;

const signalBlink = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: .28; }
`;

const meterGrow = keyframes`
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
`;

const paperDrop = keyframes`
  0% { opacity: 0; transform: translateY(-14px) rotate(-1deg); }
  70% { opacity: 1; transform: translateY(3px) rotate(.25deg); }
  100% { opacity: 1; transform: translateY(0) rotate(0); }
`;

const progressPop = keyframes`
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
`;

const focusRing = css`
  &:focus-visible {
    outline: 2px solid ${paper};
    outline-offset: 4px;
  }
`;

const sectionShell = css`
  position: relative;
  min-width: 0;
  padding: clamp(72px, 9vw, 128px) clamp(22px, 5vw, 72px);
  border: 1px solid rgba(255, 255, 255, .14);
  border-top: 5px solid var(--chapter-accent, ${mint});
  border-radius: 34px;
  background-color: #101412;
  overflow: hidden;

  @media (max-width: 720px) {
    padding: 56px 18px;
    border-radius: 24px;
  }
`;

export const Page = styled.main`
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  color: ${paper};
  background-color: ${ink};
  scroll-behavior: smooth;
  scrollbar-gutter: stable;
  font-family: var(--font-pretendard), var(--font-noto-sans-kr), system-ui, sans-serif;

  &, * { box-sizing: border-box; }
  button, a { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
  button { font: inherit; }

  [data-reveal] {
    opacity: 1;
    transform: none;
  }

  &[data-motion-ready='true'] [data-reveal][data-reveal-state='waiting'] {
    opacity: 0;
    transform: translateY(22px);
  }

  &[data-motion-ready='true'] [data-reveal][data-reveal-state='visible'] {
    opacity: 1;
    transform: translateY(0);
    transition: opacity 520ms cubic-bezier(.22, 1, .36, 1), transform 520ms cubic-bezier(.22, 1, .36, 1);
  }

  @media (prefers-reduced-motion: reduce) {
    scroll-behavior: auto;

    &, *, *::before, *::after {
      animation-duration: .01ms !important;
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
      transition-duration: .01ms !important;
    }

    [data-reveal],
    &[data-motion-ready='true'] [data-reveal][data-reveal-state='waiting'],
    &[data-motion-ready='true'] [data-reveal][data-reveal-state='visible'] {
      opacity: 1 !important;
      transform: none !important;
    }
  }
`;

export const PageInner = styled.div`
  width: min(100%, 1480px);
  min-width: 0;
  margin: 0 auto;
  padding: clamp(20px, 3.5vw, 52px);
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: clamp(28px, 5vw, 72px);
`;

export const Hero = styled.section`
  min-width: 0;
  min-height: min(780px, calc(100vh - 104px));
  display: grid;
  grid-template-columns: minmax(0, 1.02fr) minmax(430px, .98fr);
  align-items: center;
  gap: clamp(40px, 7vw, 104px);
  padding: clamp(46px, 7vw, 92px) clamp(10px, 2vw, 30px);

  @media (max-width: 1060px) {
    min-height: auto;
    grid-template-columns: 1fr;
  }
`;

export const HeroCopy = styled.div`
  min-width: 0;
`;

export const Kicker = styled.p`
  display: inline-flex;
  align-items: center;
  gap: 9px;
  margin: 0 0 26px;
  padding: 9px 13px;
  border: 1px solid rgba(94, 234, 212, .45);
  border-radius: 999px;
  color: ${mint};
  background-color: rgba(94, 234, 212, .08);
  font-size: 12px;
  font-weight: 850;
  letter-spacing: .12em;
`;

export const HeroTitle = styled.h1`
  margin: 0;
  color: #fffdf7;
  font-size: clamp(52px, 7vw, 104px);
  font-weight: 950;
  line-height: .98;
  word-break: keep-all;

  em {
    display: block;
    margin-top: 18px;
    color: ${mint};
    font-family: var(--font-nanum-pen-script), var(--font-pretendard), sans-serif;
    font-size: .58em;
    font-style: normal;
    font-weight: 800;
    line-height: 1.08;
  }

  @media (max-width: 640px) {
    font-size: clamp(45px, 15vw, 72px);
  }
`;

export const HeroLead = styled.p`
  max-width: 680px;
  margin: 30px 0 0;
  color: rgba(243, 240, 232, .72);
  font-size: clamp(16px, 1.6vw, 20px);
  font-weight: 560;
  line-height: 1.85;
  word-break: keep-all;
`;

export const HeroActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  margin-top: 34px;
`;

export const PrimaryAction = styled.button`
  min-height: 52px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 22px;
  border: 1px solid ${mint};
  border-radius: 999px;
  color: ${ink};
  background-color: ${mint};
  font-weight: 900;
  white-space: nowrap;
  cursor: pointer;
  transition: transform 180ms ease, background-color 180ms ease;
  touch-action: manipulation;

  &:hover { transform: translateY(-2px); background-color: #92f7e7; }
  ${focusRing}
`;

export const TextAction = styled.a`
  min-height: 52px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 0 18px;
  color: ${paper};
  border-radius: 999px;
  font-weight: 820;
  text-decoration: none;
  transition: color 180ms ease, transform 180ms ease;

  &:hover { color: ${mint}; transform: translateY(-2px); }
  ${focusRing}
`;

export const Constellation = styled.div`
  position: relative;
  min-height: 530px;
  border: 1px solid rgba(255, 255, 255, .16);
  border-radius: 50%;
  background-color: #111714;
  isolation: isolate;

  &::before,
  &::after {
    content: '';
    position: absolute;
    inset: 14%;
    z-index: -1;
    border: 1px dashed rgba(94, 234, 212, .26);
    border-radius: 50%;
  }

  &::after {
    inset: 33%;
    border-style: solid;
    border-color: rgba(255, 207, 90, .22);
  }

  @media (max-width: 1060px) {
    width: min(100%, 620px);
    min-height: 570px;
    margin: 0 auto;
  }

  @media (max-width: 620px) {
    min-height: 440px;
  }
`;

export const StageCenter = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  width: 162px;
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 5px;
  padding: 20px;
  color: ${ink};
  border-radius: 50%;
  background-color: ${mint};
  text-align: center;
  animation: ${centerArrival} 620ms cubic-bezier(.22, 1, .36, 1) 140ms both;

  strong { font-size: 25px; line-height: 1; }
  span { max-width: 105px; font-size: 12px; font-weight: 800; line-height: 1.35; }

  @media (max-width: 620px) {
    width: 126px;
    strong { font-size: 20px; }
    span { font-size: 10px; }
  }
`;

export const StageNode = styled.div<{ $accent: string; $index: number }>`
  position: absolute;
  ${({ $index }) => {
    const positions = [
      css`top: 15%; left: 6%;`,
      css`top: 13%; right: 6%;`,
      css`bottom: 15%; left: 8%;`,
      css`bottom: 13%; right: 8%;`,
    ];
    return positions[$index] ?? positions[0];
  }}
  min-width: 118px;
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 14px 18px;
  border: 1px solid ${({ $accent }) => $accent};
  border-radius: 18px;
  color: ${({ $accent }) => $accent};
  background-color: #0b0e0d;
  font-weight: 900;
  box-shadow: 0 12px 30px rgba(0, 0, 0, .25);
  animation: ${nodeArrival} 520ms cubic-bezier(.22, 1, .36, 1) ${({ $index }) => 210 + $index * 70}ms both;

  @media (max-width: 620px) {
    min-width: 94px;
    min-height: 58px;
    padding: 10px 12px;
    font-size: 14px;
    ${({ $index }) => {
      const positions = [
        css`top: 10%; left: 2%;`,
        css`top: 10%; right: 2%;`,
        css`bottom: 12%; left: 3%;`,
        css`bottom: 12%; right: 3%;`,
      ];
      return positions[$index] ?? positions[0];
    }}
  }
`;

export const StageCaption = styled.p`
  position: absolute;
  left: 50%;
  bottom: 6%;
  margin: 0;
  padding: 7px 11px;
  transform: translateX(-50%);
  color: rgba(243, 240, 232, .56);
  background-color: #111714;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;

  @media (max-width: 620px) { bottom: 3%; }
`;

export const HeroMarquee = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(12px, 2.6vw, 34px);
  padding: 18px 22px;
  border-block: 1px solid rgba(255, 255, 255, .14);
  color: rgba(243, 240, 232, .66);
  background-color: #0c100e;
  font-size: clamp(12px, 1.2vw, 15px);
  font-weight: 800;
  text-align: center;

  i { width: 5px; height: 5px; flex: 0 0 auto; border-radius: 50%; background-color: ${mint}; }

  @media (max-width: 720px) {
    justify-content: flex-start;
    overflow-x: auto;
    scrollbar-width: none;
    span { white-space: nowrap; }
    &::-webkit-scrollbar { display: none; }
  }
`;

export const ChapterNav = styled.nav`
  position: sticky;
  top: 0;
  z-index: 30;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, .14);
  border-radius: 22px;
  background-color: rgba(8, 11, 10, .94);
  box-shadow: 0 18px 42px rgba(0, 0, 0, .32);
`;

export const ChapterNavInner = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;

  @media (max-width: 720px) {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
    &::-webkit-scrollbar { display: none; }
  }
`;

export const ChapterNavButton = styled.button<{ $accent: string; $active: boolean }>`
  min-width: 0;
  min-height: 54px;
  display: grid;
  grid-template-columns: auto auto 1fr;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border: 1px solid ${({ $active, $accent }) => $active ? $accent : 'transparent'};
  border-radius: 14px;
  color: ${({ $active, $accent }) => $active ? $accent : 'rgba(243, 240, 232, .6)'};
  background-color: ${({ $active }) => $active ? 'rgba(255, 255, 255, .07)' : 'transparent'};
  cursor: pointer;
  text-align: left;
  transition: color 180ms ease, border-color 180ms ease, background-color 180ms ease, transform 180ms ease;
  touch-action: manipulation;

  > span { font-size: 10px; font-weight: 900; opacity: .7; }
  > strong { overflow: hidden; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
  &:hover { color: ${({ $accent }) => $accent}; transform: translateY(-1px); }
  ${focusRing}

  @media (max-width: 720px) {
    flex: 0 0 min(42vw, 176px);
    scroll-snap-align: start;
  }
`;

export const Chapter = styled.section<{ $accent: string }>`
  ${sectionShell}
  --chapter-accent: ${({ $accent }) => $accent};
  scroll-margin-top: 92px;
`;

export const ChapterIntro = styled.header`
  max-width: 990px;
  position: relative;
  z-index: 1;
`;

export const ChapterLabel = styled.p`
  display: inline-flex;
  align-items: center;
  gap: 9px;
  margin: 0 0 22px;
  color: var(--chapter-accent, ${mint});
  font-size: 12px;
  font-weight: 900;
  letter-spacing: .11em;
`;

export const ChapterTitle = styled.h2`
  margin: 0;
  color: #fffdf7;
  font-size: clamp(38px, 5.4vw, 76px);
  font-weight: 950;
  line-height: 1.08;
  text-wrap: balance;
  word-break: keep-all;

  em { color: var(--chapter-accent, ${mint}); font-style: normal; }
`;

export const ChapterLead = styled.p`
  max-width: 800px;
  margin: 24px 0 0;
  color: rgba(243, 240, 232, .7);
  font-size: clamp(16px, 1.5vw, 19px);
  font-weight: 550;
  line-height: 1.85;
  word-break: keep-all;
`;

export const StoryAside = styled.aside`
  max-width: 580px;
  margin: 48px 0 0 auto;
  padding: 24px;
  border: 1px dashed rgba(94, 234, 212, .48);
  border-radius: 20px;
  background-color: rgba(94, 234, 212, .06);
  transform: rotate(.5deg);

  span { display: block; color: ${mint}; font-size: 11px; font-weight: 900; letter-spacing: .12em; }
  strong { display: block; margin-top: 12px; font-size: 22px; }
  p { margin: 9px 0 0; color: rgba(243, 240, 232, .72); line-height: 1.7; }
  small { display: block; margin-top: 14px; color: rgba(243, 240, 232, .45); line-height: 1.55; }
`;

export const PracticalBrief = styled.section<{ $accent: string }>`
  --brief-accent: ${({ $accent }) => $accent};
  margin-top: clamp(42px, 6vw, 72px);
  padding: clamp(28px, 4vw, 48px) 0;
  border-top: 1px solid rgba(255, 255, 255, .18);
  border-bottom: 1px solid rgba(255, 255, 255, .18);
`;

export const BriefHeader = styled.header`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 28px;

  > div { min-width: 0; }
  > div > span { display: flex; align-items: center; gap: 8px; color: var(--brief-accent); font-size: 11px; font-weight: 950; letter-spacing: .1em; }
  h3 { max-width: 820px; margin: 16px 0 0; color: #fffdf7; font-size: clamp(27px, 3.2vw, 44px); line-height: 1.18; text-wrap: balance; word-break: keep-all; }
  p { max-width: 820px; margin: 14px 0 0; color: rgba(243, 240, 232, .65); font-size: 15px; line-height: 1.75; word-break: keep-all; }

  @media (max-width: 850px) { grid-template-columns: 1fr; align-items: start; }
`;

export const BriefCta = styled.a`
  min-height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 12px 15px;
  border: 1px solid var(--brief-accent);
  border-radius: 12px;
  color: ${ink};
  background-color: var(--brief-accent);
  font-size: 13px;
  font-weight: 900;
  text-decoration: none;
  white-space: nowrap;
  transition: transform 180ms ease, box-shadow 180ms ease;

  > svg:last-child { transition: transform 180ms ease; }
  &:hover { transform: translateY(-2px); box-shadow: 5px 5px 0 rgba(0, 0, 0, .32); }
  &:hover > svg:last-child { transform: translateX(2px); }
  ${focusRing}

  @media (max-width: 520px) { width: 100%; white-space: normal; }
`;

export const BriefFacts = styled.dl`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 38px 0 0;
  padding: 0;
  border-top: 1px solid rgba(255, 255, 255, .12);
  border-bottom: 1px solid rgba(255, 255, 255, .12);

  @media (max-width: 980px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 560px) { grid-template-columns: 1fr; }
`;

export const BriefFact = styled.div`
  min-width: 0;
  padding: 24px clamp(14px, 2vw, 24px);
  border-right: 1px solid rgba(255, 255, 255, .12);

  &:first-child { padding-left: 0; }
  &:last-child { padding-right: 0; border-right: 0; }
  dt { color: var(--brief-accent); font-size: 11px; font-weight: 950; letter-spacing: .08em; }
  dd { margin: 12px 0 0; color: #fffdf7; font-size: 16px; font-weight: 850; line-height: 1.45; word-break: keep-all; }
  small { display: block; margin-top: 9px; color: rgba(243, 240, 232, .48); font-size: 12px; line-height: 1.55; }

  @media (min-width: 561px) and (max-width: 980px) {
    &:nth-child(2) { padding-right: 0; border-right: 0; }
    &:nth-child(3) { padding-left: 0; }
    &:nth-child(n + 3) { border-top: 1px solid rgba(255, 255, 255, .12); }
  }

  @media (max-width: 560px) {
    padding-inline: 0;
    border-right: 0;
    &:not(:first-child) { border-top: 1px solid rgba(255, 255, 255, .12); }
  }
`;

export const FitGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 24px;

  @media (max-width: 760px) { grid-template-columns: 1fr; }
`;

export const FitColumn = styled.div<{ $tone: 'fit' | 'pause' }>`
  padding: clamp(20px, 2.8vw, 28px);
  border-left: 3px solid ${({ $tone }) => $tone === 'fit' ? 'var(--brief-accent)' : coral};
  background-color: ${({ $tone }) => $tone === 'fit' ? 'rgba(255, 255, 255, .045)' : 'rgba(251, 141, 161, .055)'};

  > span { display: flex; align-items: center; gap: 8px; color: ${({ $tone }) => $tone === 'fit' ? 'var(--brief-accent)' : coral}; font-size: 13px; font-weight: 950; }
  ul { display: grid; gap: 10px; margin: 18px 0 0; padding: 0; list-style: none; }
  li { position: relative; padding-left: 16px; color: rgba(243, 240, 232, .68); font-size: 13px; line-height: 1.6; }
  li::before { content: ''; position: absolute; top: .67em; left: 0; width: 5px; height: 5px; border-radius: 50%; background-color: ${({ $tone }) => $tone === 'fit' ? 'var(--brief-accent)' : coral}; }
`;

export const BriefFootnote = styled.div`
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: start;
  gap: 10px;
  margin-top: 22px;
  color: rgba(243, 240, 232, .5);

  svg { margin-top: 2px; color: var(--brief-accent); }
  p { margin: 0; font-size: 12px; line-height: 1.65; }
`;

export const BusinessLab = styled.div`
  margin-top: 42px;
  border: 1px solid rgba(255, 255, 255, .14);
  border-radius: 25px;
  background-color: #0a0e0c;
  overflow: hidden;
`;

export const BusinessTabs = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  background-color: rgba(255, 255, 255, .12);

  @media (max-width: 720px) {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
    &::-webkit-scrollbar { display: none; }
  }
`;

export const BusinessTab = styled.button<{ $accent: string; $active: boolean }>`
  min-height: 94px;
  display: grid;
  grid-template-columns: auto auto;
  align-content: center;
  justify-content: start;
  gap: 6px 9px;
  padding: 18px;
  border: 0;
  color: ${({ $active, $accent }) => $active ? $accent : 'rgba(243, 240, 232, .55)'};
  background-color: ${({ $active }) => $active ? '#151a17' : '#0c100e'};
  cursor: pointer;
  text-align: left;
  transition: color 180ms ease, background-color 180ms ease;

  span { font-size: 10px; font-weight: 900; opacity: .7; }
  strong { grid-column: 1 / -1; color: inherit; font-size: 15px; }
  &:hover { color: ${({ $accent }) => $accent}; background-color: #151a17; }
  ${focusRing}

  @media (max-width: 720px) {
    flex: 0 0 min(72vw, 250px);
    scroll-snap-align: start;
  }
`;

export const BusinessPanel = styled.div<{ $accent: string }>`
  --panel-accent: ${({ $accent }) => $accent};
  display: grid;
  grid-template-columns: minmax(0, 1.12fr) minmax(300px, .88fr);
  gap: 34px;
  padding: clamp(25px, 4vw, 50px);
  outline: none;
  animation: ${enterPanel} 280ms cubic-bezier(.22, 1, .36, 1) both;

  &:focus-visible { box-shadow: inset 0 0 0 2px var(--panel-accent); }

  @media (max-width: 820px) { grid-template-columns: 1fr; }
`;

export const PanelTop = styled.div`
  > span { display: flex; align-items: center; gap: 9px; color: var(--panel-accent); font-size: 12px; font-weight: 900; letter-spacing: .1em; }
  h3 { margin: 18px 0 0; color: #fffdf7; font-size: clamp(28px, 3.3vw, 48px); line-height: 1.18; word-break: keep-all; }
  p { margin: 17px 0 0; color: rgba(243, 240, 232, .68); font-size: 16px; line-height: 1.75; }
  > strong { display: flex; align-items: flex-start; gap: 8px; margin-top: 24px; padding: 15px; border-left: 3px solid var(--panel-accent); color: rgba(243, 240, 232, .82); background-color: rgba(255, 255, 255, .05); font-size: 14px; line-height: 1.55; }
  > strong svg { flex: 0 0 auto; margin-top: 2px; color: var(--panel-accent); }
`;

export const PanelLists = styled.div`
  display: grid;
  gap: 14px;
`;

export const MiniList = styled.div`
  padding: 21px;
  border: 1px solid rgba(255, 255, 255, .12);
  border-radius: 18px;
  background-color: rgba(255, 255, 255, .035);

  > span { display: flex; align-items: center; gap: 8px; color: var(--panel-accent); font-size: 13px; font-weight: 900; }
  ul { display: grid; gap: 10px; margin: 16px 0 0; padding: 0; list-style: none; }
  li { display: flex; align-items: flex-start; gap: 8px; color: rgba(243, 240, 232, .69); font-size: 14px; line-height: 1.5; }
  li svg { flex: 0 0 auto; margin-top: 2px; color: var(--panel-accent); }
`;

export const AdvertisingScene = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(320px, .95fr);
  gap: 22px;
  margin-top: 48px;

  @media (max-width: 850px) { grid-template-columns: 1fr; }
`;

export const HumanBrief = styled.article`
  padding: clamp(26px, 4vw, 45px);
  border: 1px solid rgba(255, 207, 90, .36);
  border-radius: 24px;
  background-color: rgba(255, 207, 90, .07);

  > span { color: ${yellow}; font-size: 11px; font-weight: 900; letter-spacing: .12em; }
  blockquote { margin: 23px 0 0; color: #fffdf7; font-size: clamp(24px, 3vw, 40px); font-weight: 900; line-height: 1.32; word-break: keep-all; }
  p { max-width: 650px; margin: 23px 0 0; color: rgba(243, 240, 232, .65); line-height: 1.78; }
`;

export const RadioPanel = styled.aside`
  padding: clamp(26px, 4vw, 42px);
  border-radius: 24px;
  color: ${ink};
  background-color: ${yellow};

  > strong { display: flex; align-items: center; justify-content: space-between; gap: 16px; font-size: 12px; letter-spacing: .08em; }
  > strong em { padding: 6px 9px; border-radius: 999px; color: #fff; background-color: #ef4444; font-style: normal; animation: ${signalBlink} 520ms ease 2; }
  > p { margin: 23px 0 0; padding-top: 17px; border-top: 1px solid rgba(8, 11, 10, .22); font-size: 12px; font-weight: 760; }
`;

export const RadioMeter = styled.div<{ $value: number; $delay: number }>`
  display: grid;
  grid-template-columns: 44px 1fr 28px;
  align-items: center;
  gap: 10px;
  margin-top: 19px;
  color: rgba(8, 11, 10, .78);
  font-size: 12px;
  font-weight: 900;

  > i { height: 7px; border-radius: 999px; background-color: rgba(8, 11, 10, .15); overflow: hidden; }
  > i b { display: block; width: ${({ $value }) => $value}%; height: 100%; border-radius: inherit; background-color: ${ink}; transform-origin: left; }
  > small { text-align: right; font-weight: 950; }

  [data-reveal-state='visible'] & > i b {
    animation: ${meterGrow} 620ms cubic-bezier(.22, 1, .36, 1) ${({ $delay }) => 180 + $delay * 75}ms both;
  }
`;

export const FormatGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 22px;

  @media (max-width: 980px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 570px) { grid-template-columns: 1fr; }
`;

export const FormatCard = styled.article<{ $index: number }>`
  min-height: 245px;
  display: flex;
  flex-direction: column;
  padding: 23px;
  border: 1px solid rgba(255, 255, 255, .13);
  border-radius: 20px;
  background-color: ${({ $index }) => $index % 2 === 0 ? '#151714' : '#0c100e'};
  transition: transform 180ms ease, border-color 180ms ease;

  > span { color: ${yellow}; font-size: 10px; font-weight: 900; letter-spacing: .08em; }
  > svg { margin-top: 32px; color: ${yellow}; }
  h3 { margin: auto 0 0; color: #fffdf7; font-size: 20px; line-height: 1.35; }
  p { margin: 10px 0 0; color: rgba(243, 240, 232, .58); font-size: 14px; line-height: 1.62; }
  &:hover { transform: translateY(-3px); border-color: rgba(255, 207, 90, .65); }
`;

export const JourneyRail = styled.ol`
  position: relative;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0;
  margin: 48px 0 0;
  padding: 0;
  list-style: none;

  @media (max-width: 860px) { grid-template-columns: 1fr; gap: 11px; }
`;

export const JourneyStep = styled.li<{ $accent: string }>`
  position: relative;
  min-width: 0;
  padding: 0 20px 18px 0;

  > span { color: ${({ $accent }) => $accent}; font-size: 11px; font-weight: 950; }
  > i { position: relative; display: block; width: 100%; height: 2px; margin: 14px 0 23px; background-color: rgba(255, 255, 255, .15); }
  > i::before { content: ''; position: absolute; top: 50%; left: 0; width: 11px; height: 11px; border: 3px solid #101412; border-radius: 50%; background-color: ${({ $accent }) => $accent}; transform: translateY(-50%); }
  h3 { margin: 0; color: #fffdf7; font-size: 17px; }
  p { margin: 9px 0 0; color: rgba(243, 240, 232, .55); font-size: 13px; line-height: 1.62; }

  @media (max-width: 860px) {
    padding: 17px 17px 17px 53px;
    border: 1px solid rgba(255, 255, 255, .1);
    border-radius: 15px;
    > i { position: absolute; top: 22px; left: 22px; width: 2px; height: calc(100% - 44px); margin: 0; }
    > i::before { top: 0; left: 50%; transform: translate(-50%, 0); }
  }
`;

export const InvestmentLetter = styled.article`
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 26px;
  margin-top: 48px;
  padding: clamp(25px, 4vw, 46px);
  border: 1px solid rgba(125, 211, 252, .38);
  border-radius: 8px 28px 28px 28px;
  background-color: rgba(125, 211, 252, .07);

  > div > span { color: ${sky}; font-size: 11px; font-weight: 900; letter-spacing: .11em; }
  h3 { margin: 16px 0 0; color: #fffdf7; font-family: ui-serif, Georgia, serif; font-size: clamp(24px, 3vw, 40px); line-height: 1.42; word-break: keep-all; }
  p { max-width: 790px; margin: 18px 0 0; color: rgba(243, 240, 232, .63); line-height: 1.78; }

  @media (max-width: 620px) { grid-template-columns: 1fr; }
`;

export const LetterMark = styled.div`
  width: 70px;
  height: 70px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: ${ink};
  background-color: ${sky};
`;

export const ThesisGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 22px;

  @media (max-width: 980px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 570px) { grid-template-columns: 1fr; }
`;

export const ThesisCard = styled.article<{ $index: number }>`
  min-height: 260px;
  display: flex;
  flex-direction: column;
  padding: 23px;
  border: 1px solid rgba(255, 255, 255, .13);
  border-radius: ${({ $index }) => $index === 0 ? '6px 22px 22px 22px' : '22px'};
  background-color: #0c100e;
  transition: transform 180ms ease, border-color 180ms ease;

  > span { color: ${sky}; font-size: 10px; font-weight: 900; letter-spacing: .08em; }
  > svg { margin-top: 32px; color: ${sky}; }
  h3 { margin: auto 0 0; color: #fffdf7; font-size: 20px; line-height: 1.35; }
  p { margin: 10px 0 0; color: rgba(243, 240, 232, .58); font-size: 14px; line-height: 1.62; }
  &:hover { transform: translateY(-3px); border-color: rgba(125, 211, 252, .66); }
`;

export const QuestionCourt = styled.div`
  display: grid;
  grid-template-columns: minmax(250px, .7fr) minmax(0, 1.3fr);
  gap: 32px;
  margin-top: 48px;
  padding: clamp(25px, 4vw, 45px);
  border-top: 1px solid rgba(255, 255, 255, .14);
  border-bottom: 1px solid rgba(255, 255, 255, .14);

  > div > svg { color: ${sky}; }
  > div > span { display: block; margin-top: 18px; color: ${sky}; font-size: 11px; font-weight: 900; letter-spacing: .1em; }
  h3 { margin: 13px 0 0; color: #fffdf7; font-size: 27px; line-height: 1.3; }
  > div > p { margin: 13px 0 0; color: rgba(243, 240, 232, .58); line-height: 1.7; }

  @media (max-width: 800px) { grid-template-columns: 1fr; }
`;

export const QuestionList = styled.ol`
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;

  li { display: grid; grid-template-columns: 35px 1fr; align-items: start; gap: 12px; padding: 14px; border: 1px solid rgba(255, 255, 255, .1); border-radius: 13px; background-color: rgba(255, 255, 255, .025); }
  span { color: ${sky}; font-size: 11px; font-weight: 900; }
  p { margin: 0; color: rgba(243, 240, 232, .7); font-size: 14px; line-height: 1.55; }
`;

export const HundredDays = styled.ol`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 40px 0 0;
  padding: 0;
  list-style: none;

  @media (max-width: 850px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 520px) { grid-template-columns: 1fr; }
`;

export const DayStep = styled.li`
  padding: 22px;
  border-radius: 18px;
  color: ${ink};
  background-color: ${sky};

  > span { font-size: 11px; font-weight: 950; letter-spacing: .08em; }
  h3 { margin: 26px 0 0; font-size: 20px; }
  p { margin: 8px 0 0; color: rgba(8, 11, 10, .7); font-size: 13px; line-height: 1.58; }

  &:nth-child(even) { background-color: #c6ecfd; }
`;

export const SponsorshipScene = styled.div`
  display: grid;
  grid-template-columns: minmax(300px, .74fr) minmax(0, 1.26fr);
  gap: 22px;
  align-items: stretch;
  margin-top: 48px;

  @media (max-width: 850px) { grid-template-columns: 1fr; }
`;

export const Receipt = styled.article`
  position: relative;
  min-height: 360px;
  display: flex;
  flex-direction: column;
  padding: clamp(27px, 4vw, 42px);
  color: ${ink};
  background-color: ${paper};
  box-shadow: 10px 12px 0 rgba(251, 141, 161, .34);

  > span { display: flex; align-items: center; gap: 9px; font-size: 12px; font-weight: 950; letter-spacing: .08em; }
  > strong { margin-top: auto; font-size: clamp(46px, 6vw, 76px); line-height: 1; }
  > p { margin: 16px 0 0; color: rgba(8, 11, 10, .68); line-height: 1.65; }
  > i { display: block; margin: 22px 0 14px; border-top: 2px dashed rgba(8, 11, 10, .3); }
  > small { color: rgba(8, 11, 10, .58); font-weight: 800; line-height: 1.45; }

  [data-reveal-state='visible'] & { animation: ${paperDrop} 680ms cubic-bezier(.22, 1, .36, 1) 120ms both; }
`;

export const SpendGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 520px) { grid-template-columns: 1fr; }
`;

export const SpendCard = styled.article<{ $tone: string }>`
  min-height: 172px;
  display: flex;
  flex-direction: column;
  padding: 22px;
  border-radius: 20px;
  color: ${ink};
  background-color: ${({ $tone }) => $tone};

  svg { margin-left: auto; }
  span { margin-top: auto; font-size: 11px; font-weight: 900; letter-spacing: .08em; }
  strong { margin-top: 8px; font-size: 18px; line-height: 1.35; word-break: keep-all; }
`;

export const LevelGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 22px;

  @media (max-width: 930px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 520px) { grid-template-columns: 1fr; }
`;

export const LevelCard = styled.article`
  position: relative;
  min-height: 230px;
  padding: 23px 23px 35px;
  border: 1px solid rgba(255, 255, 255, .13);
  border-radius: 20px;
  background-color: #0c100e;
  overflow: hidden;

  > span { color: ${coral}; font-size: 10px; font-weight: 900; letter-spacing: .08em; }
  h3 { margin: 55px 0 0; color: #fffdf7; font-size: 21px; }
  p { margin: 10px 0 0; color: rgba(243, 240, 232, .56); font-size: 14px; line-height: 1.62; }
  i { position: absolute; right: -12px; bottom: -12px; width: 58px; height: 58px; border: 10px solid rgba(251, 141, 161, .25); border-radius: 50%; }
`;

export const LoopRail = styled.ol`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin: 42px 0 0;
  padding: 0;
  list-style: none;

  @media (max-width: 900px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 520px) { grid-template-columns: 1fr; }
`;

export const LoopStep = styled.li`
  min-width: 0;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 13px;
  align-items: start;
  padding: 19px;
  border: 1px solid rgba(251, 141, 161, .28);
  border-radius: 16px;
  background-color: rgba(251, 141, 161, .055);

  > span { color: ${coral}; font-size: 11px; font-weight: 950; }
  h3 { margin: 0; color: #fffdf7; font-size: 16px; }
  p { margin: 7px 0 0; color: rgba(243, 240, 232, .55); font-size: 13px; line-height: 1.55; }
  > svg { color: ${coral}; transition: transform 180ms ease; }
  &:hover > svg { transform: translateX(3px); }
`;

export const ChemistrySection = styled.section`
  ${sectionShell}
  --chapter-accent: ${yellow};
  display: grid;
  grid-template-columns: minmax(270px, .72fr) minmax(0, 1.28fr);
  gap: clamp(34px, 6vw, 90px);
  align-items: center;
  scroll-margin-top: 92px;
  content-visibility: auto;
  contain-intrinsic-size: auto 760px;

  @media (max-width: 900px) { grid-template-columns: 1fr; }
`;

export const ChemistryCopy = styled.div`
  > span { display: flex; align-items: center; gap: 9px; color: ${yellow}; font-size: 12px; font-weight: 900; letter-spacing: .08em; }
  h2 { margin: 20px 0 0; color: #fffdf7; font-size: clamp(36px, 4.5vw, 64px); line-height: 1.12; word-break: keep-all; }
  p { margin: 20px 0 0; color: rgba(243, 240, 232, .62); line-height: 1.75; }
`;

export const ChemistryPanel = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(230px, .9fr);
  border: 1px solid rgba(255, 207, 90, .32);
  border-radius: 22px;
  background-color: #0b0f0d;
  overflow: hidden;

  > div:first-child { display: grid; gap: 7px; padding: 14px; border-right: 1px solid rgba(255, 255, 255, .1); }

  @media (max-width: 680px) {
    grid-template-columns: 1fr;
    > div:first-child { border-right: 0; border-bottom: 1px solid rgba(255, 255, 255, .1); }
  }
`;

export const ChemistryQuestion = styled.button<{ $selected: boolean }>`
  min-height: 58px;
  display: grid;
  grid-template-columns: 31px 1fr;
  align-items: center;
  gap: 10px;
  padding: 10px 13px;
  border: 1px solid ${({ $selected }) => $selected ? yellow : 'transparent'};
  border-radius: 13px;
  color: ${({ $selected }) => $selected ? paper : 'rgba(243, 240, 232, .58)'};
  background-color: ${({ $selected }) => $selected ? 'rgba(255, 207, 90, .09)' : 'transparent'};
  cursor: pointer;
  text-align: left;
  transition: border-color 160ms ease, color 160ms ease, background-color 160ms ease, transform 160ms ease;

  > span { width: 28px; height: 28px; display: grid; place-items: center; border: 1px solid currentColor; border-radius: 50%; font-size: 10px; font-weight: 900; }
  strong { font-size: 13px; line-height: 1.45; }
  &:hover { transform: translateX(2px); color: ${paper}; }
  ${focusRing}
`;

export const ChemistryResult = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: clamp(25px, 4vw, 38px);
  animation: ${enterPanel} 300ms cubic-bezier(.22, 1, .36, 1) both;

  > span { color: ${yellow}; font-size: 11px; font-weight: 950; letter-spacing: .1em; }
  > strong { margin-top: 25px; color: #fffdf7; font-size: 25px; line-height: 1.25; }
  > p { margin: 12px 0 0; color: rgba(243, 240, 232, .6); font-size: 14px; line-height: 1.65; }
`;

export const ProgressTrack = styled.div`
  height: 8px;
  margin-top: 25px;
  border-radius: 999px;
  background-color: rgba(255, 255, 255, .12);
  overflow: hidden;
`;

export const ProgressFill = styled.i<{ $value: number }>`
  display: block;
  width: ${({ $value }) => $value}%;
  height: 100%;
  border-radius: inherit;
  background-color: ${yellow};
  transform-origin: left;
  animation: ${progressPop} 420ms cubic-bezier(.22, 1, .36, 1) both;
`;

export const JourneySection = styled.section`
  ${sectionShell}
  --chapter-accent: ${mint};
  content-visibility: auto;
  contain-intrinsic-size: auto 820px;
`;

export const PromiseSection = styled.section`
  ${sectionShell}
  --chapter-accent: ${coral};
  content-visibility: auto;
  contain-intrinsic-size: auto 1000px;
`;

export const PromiseGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 44px;

  @media (max-width: 760px) { grid-template-columns: 1fr; }
`;

export const PromiseCard = styled.article<{ $accent: string }>`
  padding: clamp(22px, 3vw, 31px);
  border: 1px solid rgba(255, 255, 255, .13);
  border-left: 4px solid ${({ $accent }) => $accent};
  border-radius: 8px 19px 19px 8px;
  background-color: #0b0f0d;

  > span { display: flex; align-items: center; gap: 9px; color: ${({ $accent }) => $accent}; font-size: 13px; font-weight: 950; }
  ul { display: grid; gap: 10px; margin: 20px 0 0; padding: 0; list-style: none; }
  li { display: flex; align-items: flex-start; gap: 9px; color: rgba(243, 240, 232, .64); font-size: 14px; line-height: 1.55; }
  li svg { flex: 0 0 auto; margin-top: 2px; color: ${({ $accent }) => $accent}; }
`;

export const EvidenceSection = styled.section`
  ${sectionShell}
  --chapter-accent: ${sky};
  content-visibility: auto;
  contain-intrinsic-size: auto 920px;
`;

export const EvidenceStatus = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(210px, .32fr);
  gap: 1px;
  margin-top: 44px;
  border: 1px solid rgba(125, 211, 252, .35);
  background-color: rgba(125, 211, 252, .35);

  > div { padding: clamp(25px, 4vw, 42px); background-color: #0b0f0d; }
  > div > span { display: flex; align-items: center; gap: 8px; color: ${sky}; font-size: 12px; font-weight: 950; letter-spacing: .08em; }
  > div > strong { display: block; margin-top: 18px; color: #fffdf7; font-size: clamp(23px, 3vw, 37px); line-height: 1.22; }
  > div > p { max-width: 770px; margin: 14px 0 0; color: rgba(243, 240, 232, .61); font-size: 14px; line-height: 1.72; }
  > small { display: flex; flex-direction: column; justify-content: flex-end; padding: clamp(24px, 3vw, 34px); color: ${ink}; background-color: ${sky}; font-size: 10px; font-weight: 950; letter-spacing: .1em; }
  > small strong { margin-top: 13px; font-size: 20px; letter-spacing: -.02em; }
  > small time { margin-top: 28px; font-size: 10px; font-weight: 760; letter-spacing: 0; opacity: .62; }

  @media (max-width: 720px) { grid-template-columns: 1fr; }
`;

export const RecordGrid = styled.ol`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  margin: 18px 0 0;
  padding: 1px;
  background-color: rgba(255, 255, 255, .12);
  list-style: none;

  @media (max-width: 680px) { grid-template-columns: 1fr; }
`;

export const RecordItem = styled.li`
  min-width: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 17px;
  padding: clamp(20px, 3vw, 29px);
  background-color: #0c100e;

  > span { color: ${sky}; font-size: 11px; font-weight: 950; }
  h3 { margin: 0; color: #fffdf7; font-size: 17px; }
  p { margin: 9px 0 0; color: rgba(243, 240, 232, .56); font-size: 13px; line-height: 1.65; }
`;

export const FaqSection = styled.section`
  ${sectionShell}
  --chapter-accent: ${yellow};
  content-visibility: auto;
  contain-intrinsic-size: auto 1180px;
`;

export const FaqList = styled.div`
  margin-top: 44px;
  border-top: 1px solid rgba(255, 255, 255, .18);
`;

export const FaqItem = styled.details`
  border-bottom: 1px solid rgba(255, 255, 255, .18);

  summary {
    min-height: 74px;
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
    padding: 18px 2px;
    color: #fffdf7;
    cursor: pointer;
    list-style: none;
  }

  summary::-webkit-details-marker { display: none; }
  summary > span { color: ${yellow}; font-size: 11px; font-weight: 950; }
  summary > strong { font-size: clamp(15px, 1.5vw, 18px); line-height: 1.45; word-break: keep-all; }
  summary::after { content: '+'; width: 30px; height: 30px; display: grid; place-items: center; border: 1px solid rgba(255, 207, 90, .55); border-radius: 50%; color: ${yellow}; font-size: 19px; font-weight: 500; transition: transform 180ms ease, background-color 180ms ease; }
  &[open] summary::after { content: '−'; color: ${ink}; background-color: ${yellow}; transform: rotate(180deg); }
  summary:focus-visible { outline: 2px solid ${yellow}; outline-offset: 4px; }
  > p { max-width: 900px; margin: -2px 44px 0 48px; padding: 0 0 25px; color: rgba(243, 240, 232, .62); font-size: 14px; line-height: 1.75; }

  @media (max-width: 560px) {
    summary { grid-template-columns: 27px minmax(0, 1fr) auto; gap: 9px; }
    > p { margin-inline: 36px 6px; }
  }
`;

export const FinalSection = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(320px, .92fr);
  gap: clamp(35px, 7vw, 100px);
  align-items: end;
  padding: clamp(58px, 9vw, 118px) clamp(25px, 6vw, 80px);
  border-radius: 34px;
  color: ${ink};
  background-color: ${mint};
  content-visibility: auto;
  contain-intrinsic-size: auto 600px;

  > div:last-child > p { display: flex; align-items: center; gap: 8px; margin: 17px 3px 0; color: rgba(8, 11, 10, .65); font-size: 12px; font-weight: 760; }

  @media (max-width: 850px) { grid-template-columns: 1fr; }
  @media (max-width: 620px) { border-radius: 24px; }
`;

export const FinalCopy = styled.div`
  > span { font-size: 11px; font-weight: 950; letter-spacing: .12em; }
  h2 { margin: 19px 0 0; font-size: clamp(38px, 5.5vw, 74px); line-height: 1.07; word-break: keep-all; }
  p { max-width: 700px; margin: 23px 0 0; color: rgba(8, 11, 10, .68); font-size: 16px; line-height: 1.72; }
`;

export const ContactButton = styled.a`
  min-height: 86px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 15px;
  padding: 17px 20px;
  border: 2px solid ${ink};
  border-radius: 18px;
  color: ${paper};
  background-color: ${ink};
  text-decoration: none;
  transition: transform 180ms ease, box-shadow 180ms ease;

  span { display: grid; gap: 4px; }
  small { color: rgba(243, 240, 232, .58); font-size: 11px; }
  strong { font-size: 17px; }
  > svg:last-child { transition: transform 180ms ease; }
  &:hover { transform: translateY(-2px); box-shadow: 7px 7px 0 rgba(8, 11, 10, .2); }
  &:hover > svg:last-child { transform: translateX(3px); }
  ${focusRing}
`;
