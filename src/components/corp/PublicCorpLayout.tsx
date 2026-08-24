'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import styled from 'styled-components';

const NAV_ITEMS = [
  { href: '/corp', label: '기업 홈', exact: true },
  { href: '/corp/company/introduction', label: '회사소개' },
  { href: '/corp/company/ceo-intro', label: '대표소개' },
  { href: '/corp/company/product-introduction', label: '제품소개' },
  { href: '/corp/company/staff-intro', label: '구성원' },
  { href: '/corp/portfolio', label: '포트폴리오' },
  { href: '/corp/careers/jobs', label: '채용정보' },
  { href: '/corp/partnership/business', label: '제휴하기' },
] as const;

function isActivePath(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavigationLinks({ pathname, mobile = false }: { pathname: string; mobile?: boolean }) {
  return NAV_ITEMS.map((item) => {
    const active = isActivePath(pathname, item.href, 'exact' in item ? item.exact : false);
    return (
      <NavLink
        key={item.href}
        href={item.href}
        className="corp-header-link"
        aria-current={active ? 'page' : undefined}
        $active={active}
        $mobile={mobile}
      >
        {item.label}
      </NavLink>
    );
  });
}

export function PublicCorpLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() || '/corp';

  return (
    <Shell>
      <SkipLink href="#content-area">본문으로 건너뛰기</SkipLink>
      <Header>
        <HeaderInner>
          <Brand href="/corp" aria-label="Propig 기업 사이트 홈">
            <BrandMark aria-hidden="true">P</BrandMark>
            <BrandCopy><strong>PROPIG</strong><span>COMPANY</span></BrandCopy>
          </Brand>

          <DesktopNav aria-label="기업 사이트 주요 메뉴">
            <NavigationLinks pathname={pathname} />
          </DesktopNav>

          <MobileMenu>
            <summary aria-label="기업 사이트 메뉴 열기"><span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" /></summary>
            <MobilePanel>
              <MobileHeading><strong>기업 사이트</strong><span>원하는 페이지로 이동하세요.</span></MobileHeading>
              <MobileNav aria-label="기업 사이트 모바일 메뉴">
                <NavigationLinks pathname={pathname} mobile />
              </MobileNav>
            </MobilePanel>
          </MobileMenu>
        </HeaderInner>
      </Header>
      <Content>{children}</Content>
    </Shell>
  );
}

const Shell = styled.div`
  min-width: 0;
  min-height: 100%;
  background: #f7f6f1;
`;

const SkipLink = styled.a`
  position: fixed;
  z-index: 1000;
  top: 8px;
  left: 8px;
  padding: 10px 14px;
  border-radius: 10px;
  color: #fff;
  background: #102a24;
  transform: translateY(-150%);
  &:focus { transform: translateY(0); }
`;

const Header = styled.header`
  position: sticky;
  z-index: 100;
  top: 0;
  border-bottom: 1px solid rgba(24, 54, 47, 0.1);
  background: rgba(250, 249, 245, 0.94);
  backdrop-filter: blur(18px);
`;

const HeaderInner = styled.div`
  width: min(100% - 32px, 1320px);
  min-height: 66px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 24px;
`;

const Brand = styled(Link)`
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
  color: #153a31;
  text-decoration: none;
  border-radius: 12px;
  &:focus-visible { outline: 3px solid rgba(242, 178, 73, 0.5); outline-offset: 4px; }
`;

const BrandMark = styled.span`
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 11px;
  color: #fff;
  font-weight: 900;
  background: linear-gradient(145deg, #e8943c, #c7642c);
  box-shadow: 0 8px 20px rgba(197, 100, 44, 0.22);
`;

const BrandCopy = styled.span`
  display: grid;
  line-height: 1;
  strong { font-size: 0.9rem; letter-spacing: 0.08em; }
  span { margin-top: 4px; color: #6a7f79; font-size: 0.58rem; letter-spacing: 0.22em; }
`;

const DesktopNav = styled.nav`
  min-width: 0;
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  @media (max-width: 1080px) { display: none; }
`;

const NavLink = styled(Link)<{ $active: boolean; $mobile: boolean }>`
  min-height: ${({ $mobile }) => ($mobile ? '48px' : '42px')};
  display: inline-flex;
  align-items: center;
  justify-content: ${({ $mobile }) => ($mobile ? 'flex-start' : 'center')};
  padding: ${({ $mobile }) => ($mobile ? '0 14px' : '0 12px')};
  border-radius: 12px;
  color: ${({ $active }) => ($active ? '#153a31' : '#536862')};
  background: ${({ $active }) => ($active ? 'rgba(224, 169, 83, 0.16)' : 'transparent')};
  font-size: 0.82rem;
  font-weight: ${({ $active }) => ($active ? 800 : 650)};
  text-decoration: none;
  white-space: nowrap;
  transition: color 150ms ease, background 150ms ease;
  &:hover { color: #153a31; background: rgba(24, 54, 47, 0.06); }
  &:focus-visible { outline: 3px solid rgba(242, 178, 73, 0.45); outline-offset: 2px; }
`;

const MobileMenu = styled.details`
  position: relative;
  margin-left: auto;
  display: none;
  summary {
    width: 46px;
    height: 46px;
    display: grid;
    place-content: center;
    gap: 5px;
    border: 1px solid rgba(24, 54, 47, 0.14);
    border-radius: 14px;
    cursor: pointer;
    list-style: none;
    background: #fff;
  }
  summary::-webkit-details-marker { display: none; }
  summary span { width: 20px; height: 2px; border-radius: 2px; background: #153a31; }
  summary:focus-visible { outline: 3px solid rgba(242, 178, 73, 0.45); outline-offset: 2px; }
  &[open] summary { background: #f2e5d0; }
  @media (max-width: 1080px) { display: block; }
`;

const MobilePanel = styled.div`
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  width: min(320px, calc(100vw - 32px));
  padding: 14px;
  border: 1px solid rgba(24, 54, 47, 0.12);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 24px 60px rgba(27, 48, 42, 0.18);
`;

const MobileHeading = styled.div`
  display: grid;
  gap: 4px;
  padding: 8px 10px 12px;
  strong { color: #153a31; font-size: 0.9rem; }
  span { color: #71827d; font-size: 0.76rem; }
`;

const MobileNav = styled.nav`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  a { white-space: normal; }
`;

const Content = styled.div`
  min-width: 0;
`;
