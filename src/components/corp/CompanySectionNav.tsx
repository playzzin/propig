'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styled from 'styled-components';

export const companySectionNavItems = [
  { id: 'intro', label: '회사소개', href: '/corp/company/introduction' },
  { id: 'background', label: '창업배경', href: '/corp/company/founding-background' },
  { id: 'ceo', label: '대표소개', href: '/corp/company/ceo-intro' },
  { id: 'staff', label: '직원소개', href: '/corp/company/staff-intro' },
  { id: 'technology', label: '기업기술', href: '/corp/company/technology' },
  { id: 'business', label: '사업영역', href: '/corp/company/business-area' },
  { id: 'social', label: '사회공헌', href: '/corp/company/social-contribution' },
] as const;

const FOUNDING_BACKGROUND_HREF = '/corp/company/founding-background';
const FOUNDING_AUDIO_UNLOCK_STORAGE_KEY = 'propig:founding-background-audio-unlocked';

export type CompanySectionId = (typeof companySectionNavItems)[number]['id'];
export interface CompanySectionNavItem {
  id: string;
  label: string;
  href: string;
}

interface CompanySectionNavProps {
  activeId?: string;
  activeHref?: string;
  items?: readonly CompanySectionNavItem[];
  ariaLabel?: string;
  className?: string;
}

function normalizeHref(href: string): string {
  return href.replace(/\/$/, '');
}

function rememberFoundingAudioIntent(href: string) {
  if (normalizeHref(href) !== FOUNDING_BACKGROUND_HREF) return;
  window.sessionStorage.setItem(FOUNDING_AUDIO_UNLOCK_STORAGE_KEY, '1');
}

export function CompanySectionNav({
  activeId,
  activeHref,
  items,
  ariaLabel = '회사소개 섹션 메뉴',
  className,
}: CompanySectionNavProps) {
  const pathname = usePathname();
  const normalizedPathname = pathname?.replace(/\/$/, '') ?? '';
  const normalizedActiveHref = activeHref?.replace(/\/$/, '');
  const navItems = items ?? companySectionNavItems;

  return (
    <NavContainer className={className} aria-label={ariaLabel}>
      {navItems.map((item) => {
        const normalizedItemHref = item.href.replace(/\/$/, '');
        const isActive = activeId
          ? activeId === item.id
          : normalizedActiveHref
            ? normalizedActiveHref === normalizedItemHref
            : normalizedPathname === normalizedItemHref;

        return (
          <NavItem
            key={item.id}
            href={item.href}
            $active={isActive}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => rememberFoundingAudioIntent(item.href)}
            onPointerDown={() => rememberFoundingAudioIntent(item.href)}
          >
            {item.label}
            {isActive && <ActiveIndicator />}
          </NavItem>
        );
      })}
    </NavContainer>
  );
}

const NavContainer = styled.nav`
  --company-section-nav-height: 64px;
  --company-section-nav-tab-width: 98px;
  flex: 0 0 var(--company-section-nav-height);
  width: 100%;
  min-height: var(--company-section-nav-height);
  display: flex;
  align-items: stretch;
  justify-content: flex-start;
  gap: 6px;
  overflow-x: auto;
  padding: 0 16px;
  box-sizing: border-box;
  background: rgba(15, 23, 42, 0.88);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  position: relative;
  top: 0;
  z-index: 50;
  scrollbar-width: thin;
  scrollbar-color: rgba(129, 140, 248, 0.55) transparent;
  scroll-padding-inline: 16px;
  scroll-snap-type: x proximity;

  @media (min-width: 1440px) {
    justify-content: center;
  }

  &::-webkit-scrollbar {
    height: 5px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(129, 140, 248, 0.44);
    border-radius: 999px;
  }

  @media (max-width: 768px) {
    --company-section-nav-height: 58px;
    --company-section-nav-tab-width: 90px;
    padding: 0 12px;
    scroll-padding-inline: 12px;
  }
`;

const NavItem = styled(Link)<{ $active: boolean }>`
  flex: 0 0 var(--company-section-nav-tab-width);
  width: var(--company-section-nav-tab-width);
  min-height: calc(var(--company-section-nav-height) - 1px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  padding: 0 8px;
  color: ${(props) => (props.$active ? '#f8fafc' : '#94a3b8')};
  font-size: 0.92rem;
  font-weight: ${(props) => (props.$active ? 800 : 600)};
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
  scroll-snap-align: start;
  transition: color 0.24s ease, background 0.24s ease;

  &:hover {
    color: #f8fafc;
  }

  &:focus-visible {
    outline: 2px solid #818cf8;
    outline-offset: -4px;
  }

  @media (max-width: 768px) {
    font-size: 0.88rem;
  }
`;

const ActiveIndicator = styled.span`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
  background: #818cf8;
  border-radius: 3px 3px 0 0;
`;
