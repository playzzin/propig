'use client';

import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Crown, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import styled, { createGlobalStyle } from 'styled-components';
import { StaffOverviewBoard } from './StaffOverviewBoard';
import { PROFILE_ATLAS_PATHS, type Person } from './staffDirectory';
import { useStaffReducedMotion } from './useStaffReducedMotion';

function ProfilePhoto({
  person,
  size,
  priority = false,
}: {
  person: Pick<Person, 'name' | 'photoIndex' | 'accent'>;
  size: number;
  priority?: boolean;
}) {
  const atlasIndex = Math.floor(person.photoIndex / 16);
  const atlasPath = PROFILE_ATLAS_PATHS[atlasIndex] ?? PROFILE_ATLAS_PATHS[0];
  const localPhotoIndex = person.photoIndex % 16;
  const column = localPhotoIndex % 4;
  const row = Math.floor(localPhotoIndex / 4);

  return (
    <Portrait data-portrait="" $size={size} $accent={person.accent}>
      <AtlasImage
        src={atlasPath}
        alt={`${person.name} 프로필`}
        width={1280}
        height={1280}
        priority={priority}
        loading={priority ? 'eager' : 'lazy'}
        sizes={`${size * 4}px`}
        $column={column}
        $row={row}
      />
    </Portrait>
  );
}

export function StaffIntroOrgChartExperience() {
  const reduceMotion = useStaffReducedMotion();
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);

  const openProfile = useCallback((person: Person, trigger: HTMLElement) => {
    lastTriggerRef.current = trigger;
    setSelectedPerson(person);
  }, []);

  const closeProfile = useCallback(() => {
    setSelectedPerson(null);
    window.setTimeout(() => lastTriggerRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!selectedPerson) return;

    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeProfile();
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (drawerRef.current?.contains(event.target)) return;
      if (lastTriggerRef.current?.contains(event.target)) return;
      setSelectedPerson(null);
    };

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('pointerdown', handlePointerDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [closeProfile, selectedPerson]);

  return (
    <Page id="staff-intro-page">
      <StaffIntroMotionStyles />
      <StaffOverviewBoard
        portrait={(person, size) => <ProfilePhoto person={person} size={size} priority={person.id === 'ceo'} />}
        onProfile={openProfile}
      />

      <AnimatePresence>
        {selectedPerson ? (
          <DrawerLayer
            key="profile-drawer"
            aria-live="polite"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <ProfileDrawer
              ref={drawerRef}
              role="dialog"
              aria-modal="false"
              aria-labelledby="profile-drawer-title"
              initial={reduceMotion ? false : { opacity: 0, x: 42, y: 12, scale: 0.965 }}
              animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 36, y: 8, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 260, damping: 27, mass: 0.78 }}
            >
              <DrawerAccent $accent={selectedPerson.accent} aria-hidden="true" />
              <DrawerHeader>
                <div>
                  <span>PROFILE DIRECTORY</span>
                  <strong>{selectedPerson.level} 상세정보</strong>
                </div>
                <DrawerClose ref={closeButtonRef} type="button" onClick={closeProfile} aria-label="프로필 닫기">
                  <X size={20} strokeWidth={2.2} aria-hidden="true" />
                </DrawerClose>
              </DrawerHeader>
              <DrawerBody>
                <DrawerHero $accent={selectedPerson.accent}>
                  <ProfilePhoto person={selectedPerson} size={112} />
                  <div>
                    <DrawerRole>{selectedPerson.role}</DrawerRole>
                    <h2 id="profile-drawer-title">{selectedPerson.name}</h2>
                    <span>{selectedPerson.title}</span>
                  </div>
                </DrawerHero>
                <DrawerQuote>
                  <Crown size={17} strokeWidth={2} aria-hidden="true" />
                  <p>{selectedPerson.description}</p>
                </DrawerQuote>
                <DrawerSection>
                  <span>CORE EXPERTISE</span>
                  <MetaList>
                    {selectedPerson.meta.map((item) => <li key={item}>{item}</li>)}
                  </MetaList>
                </DrawerSection>
                <DrawerSection>
                  <span>KEY RESPONSIBILITIES</span>
                  <ResponsibilityList>
                    {selectedPerson.responsibilities.map((item) => (
                      <li key={item}>
                        <CheckCircle2 size={16} strokeWidth={2.1} aria-hidden="true" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ResponsibilityList>
                </DrawerSection>
              </DrawerBody>
              <DrawerFooter>
                <Link href="/corp/careers/jobs">
                  채용 포지션 확인
                  <ArrowRight size={15} strokeWidth={2.4} aria-hidden="true" />
                </Link>
              </DrawerFooter>
            </ProfileDrawer>
          </DrawerLayer>
        ) : null}
      </AnimatePresence>
    </Page>
  );
}

const Page = styled.main`
  --board-bg: #101719;
  --board-surface: #162022;
  --board-surface-strong: #1b2729;
  --board-line: #ffffff24;
  --board-ink: #f3f1e8;
  --board-muted: #a5afaa;
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 100%;
  overflow-x: clip;
  color: var(--board-ink);
  background: var(--board-bg);
  color-scheme: dark;
  font-family: 'Pretendard Variable', Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;

  section[id], div[id], header[id] { scroll-margin-top: 90px; }
  button:focus-visible, a:focus-visible, summary:focus-visible { outline: 2px solid #c0ef83; outline-offset: 4px; }
  button,
  a {
    touch-action: manipulation;
    -webkit-tap-highlight-color: rgba(102, 215, 255, 0.18);
  }
`;

const Portrait = styled.span<{ $size: number; $accent: string }>`
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  width: ${(props) => props.$size}px;
  height: ${(props) => props.$size}px;
  display: block;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, ${(props) => props.$accent} 68%, white);
  border-radius: 18px;
  background: #132439;
  box-shadow: 0 10px 28px color-mix(in srgb, ${(props) => props.$accent} 18%, transparent);
`;

const AtlasImage = styled(Image)<{ $column: number; $row: number }>`
  position: absolute;
  z-index: 1;
  top: ${(props) => props.$row * -100}%;
  left: ${(props) => props.$column * -100}%;
  width: 400%;
  max-width: none;
  height: 400%;
  object-fit: cover;
`;

const DrawerLayer = styled(motion.div)`
  position: fixed;
  inset: 0;
  z-index: 3000;
  pointer-events: none;
`;

const ProfileDrawer = styled(motion.aside)`
  position: absolute;
  z-index: 1;
  top: clamp(76px, 8vh, 104px);
  right: clamp(12px, 1.6vw, 26px);
  bottom: clamp(12px, 1.6vw, 24px);
  width: min(438px, calc(100vw - 28px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  pointer-events: auto;
  border: 1px solid var(--board-line);
  border-radius: 10px;
  color: #edf6ff;
  background: var(--board-surface);
  box-shadow: none;

  @media (max-width: 700px) {
    top: auto;
    right: 10px;
    bottom: 10px;
    left: 10px;
    width: auto;
    height: min(74dvh, 680px);
    max-height: min(74dvh, 680px);
    border-radius: 20px;
  }
`;

const DrawerAccent = styled.div<{ $accent: string }>`
  position: absolute;
  z-index: 4;
  top: 0;
  left: 26px;
  right: 26px;
  height: 2px;
  border-radius: 0 0 999px 999px;
  background: linear-gradient(90deg, transparent, ${(props) => props.$accent}, transparent);
  box-shadow: 0 0 18px color-mix(in srgb, ${(props) => props.$accent} 55%, transparent);
`;

const DrawerHeader = styled.header`
  flex: 0 0 auto;
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 13px 16px 13px 22px;
  border-bottom: 1px solid rgba(104, 174, 241, 0.2);
  background: var(--board-surface);

  > div {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  span {
    color: #69ddf4;
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.12em;
  }

  strong {
    color: #b7c9df;
    font-size: 0.72rem;
    font-weight: 760;
  }
`;

const DrawerClose = styled.button`
  flex: 0 0 auto;
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(106, 178, 243, 0.26);
  border-radius: 11px;
  color: #cce1f8;
  background: rgba(18, 48, 85, 0.5);
  cursor: pointer;
  transition: color 150ms ease, border-color 150ms ease, background 150ms ease;

  &:hover {
    color: #ffffff;
    border-color: #6ddff6;
    background: rgba(37, 93, 145, 0.64);
  }

  &:focus-visible {
    outline: 3px solid #6ddff6;
    outline-offset: 2px;
  }
`;

const DrawerBody = styled.div`
  flex: 1;
  min-height: 0;
  display: grid;
  grid-auto-rows: max-content;
  align-content: start;
  gap: 14px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 22px;

  @media (max-width: 520px) {
    padding: 18px 14px;
  }
`;

const DrawerHero = styled.section<{ $accent: string }>`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 18px;
  align-items: center;
  padding: 20px;
  overflow: hidden;
  border: 1px solid var(--board-line);
  border-radius: 10px;
  background: var(--board-surface);

  > div {
    min-width: 0;
  }

  h2 {
    margin: 7px 0 0;
    color: #ffffff;
    font-size: 1.8rem;
    font-weight: 700;
    line-height: 1.05;
    word-break: keep-all;
  }

  > div > span:last-child {
    display: block;
    margin-top: 7px;
    color: #b2c5dc;
    font-size: 0.74rem;
    font-weight: 720;
  }

  @media (max-width: 390px) {
    grid-template-columns: 1fr;
  }
`;

const DrawerRole = styled.span`
  width: fit-content;
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 9px;
  border: 1px solid rgba(107, 219, 244, 0.4);
  border-radius: 7px;
  color: #7ee8ff;
  background: rgba(23, 124, 165, 0.18);
  font-size: 0.6875rem;
  font-weight: 700;
`;

const DrawerQuote = styled.blockquote`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  margin: 0;
  padding: 16px 17px;
  border-left: 3px solid #57d7ef;
  border-radius: 0 13px 13px 0;
  color: #69ddf4;
  background: var(--board-surface);

  p {
    margin: 0;
    color: #b8cde4;
    font-size: 0.76rem;
    font-weight: 680;
    line-height: 1.65;
    word-break: keep-all;
  }
`;

const DrawerSection = styled.section`
  padding: 17px;
  border: 1px solid var(--board-line);
  border-radius: 10px;
  background: var(--board-surface);

  > span {
    color: #73dff5;
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.11em;
  }
`;

const MetaList = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;

  li {
    padding: 7px 9px;
    border: 1px solid rgba(108, 169, 225, 0.23);
    border-radius: 999px;
    color: #bfd3ea;
    background: rgba(27, 59, 95, 0.48);
    font-size: 0.6875rem;
    font-weight: 760;
  }
`;

const ResponsibilityList = styled.ul`
  display: grid;
  gap: 10px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;

  li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 9px;
    align-items: start;
    color: #63dbf2;
  }

  span {
    color: #afc3db;
    font-size: 0.7rem;
    font-weight: 690;
    line-height: 1.5;
  }
`;

const DrawerFooter = styled.footer`
  flex: 0 0 auto;
  padding: 14px 22px calc(14px + env(safe-area-inset-bottom));
  border-top: 1px solid rgba(104, 174, 241, 0.2);
  background: var(--board-surface);

  a {
    min-height: 46px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border-radius: 10px;
    color: #03101e;
    background: #c0ef83;
    font-size: 0.72rem;
    font-weight: 700;
    text-decoration: none;
    transition: transform 150ms ease, filter 150ms ease;
  }

  a:hover {
    transform: translateY(-2px);
    filter: brightness(1.07);
  }

  a:focus-visible {
    outline: 3px solid #ffffff;
    outline-offset: 3px;
  }
`;

const StaffIntroMotionStyles = createGlobalStyle`
  @media (prefers-reduced-motion: reduce) {
    #staff-intro-page *,
    #staff-intro-page *::before,
    #staff-intro-page *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
      transition-duration: 0.01ms !important;
    }
  }
`;
