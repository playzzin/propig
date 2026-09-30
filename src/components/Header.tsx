'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getSiteHomePath } from '@/constants/siteHome';
import { useAuth } from '../contexts/AuthContext';
import { useMenuContext } from '@/contexts/MenuContext';
import { useSystem } from '@/contexts/SystemContext';
import { useBrandImageFallback } from '@/hooks/useBrandImageFallback';

const LoginModal = dynamic(
    () => import('./LoginModal').then((module) => module.LoginModal),
    { ssr: false },
);
const ProfileButton = dynamic(
    () => import('./ProfileButton').then((module) => module.ProfileButton),
    { ssr: false },
);
const MemoNotificationBell = dynamic(() => import('./propig/memos/MemoNotificationBell'), { ssr: false });

interface HeaderProps {
    isMobileSidebarOpen: boolean;
    toggleMobileSidebar: () => void;
    title?: string;
    description?: string;
}

const LEGACY_DESIGN_MODE_STORAGE_KEY = 'propig:design-mode';

export default function Header({
    isMobileSidebarOpen,
    toggleMobileSidebar,
    title,
    description,
}: HeaderProps) {
    const { currentUser, isConfigured, error } = useAuth();
    const { currentSite, siteData } = useMenuContext();
    const pathname = usePathname();
    const homePath = getSiteHomePath(currentSite, siteData);
    const siteName = siteData[currentSite]?.name || currentSite.toUpperCase();
    const { settings } = useSystem();
    const [isLoginOpen, setIsLoginOpen] = useState(false);
    const openLogin = useCallback(() => setIsLoginOpen(true), []);
    const closeLogin = useCallback(() => setIsLoginOpen(false), []);
    const rawLogoUrl = settings.envLogos?.[currentSite] || settings.logoUrl;
    const logoImage = useBrandImageFallback(rawLogoUrl);
    const menuLabel = isMobileSidebarOpen ? '메뉴 닫기' : '메뉴 열기';

    useEffect(() => {
        if (typeof document === 'undefined') return;

        document.documentElement.removeAttribute('data-propig-design');
        document.body.removeAttribute('data-propig-design');

        if (typeof window !== 'undefined') {
            window.localStorage.removeItem(LEGACY_DESIGN_MODE_STORAGE_KEY);
        }
    }, []);

    return (
        <>
            <header id="header">
                <div className="header-main">
                    <button
                        id="mobile-menu-toggle"
                        type="button"
                        className="mobile-logo-toggle"
                        onClick={toggleMobileSidebar}
                        aria-label={menuLabel}
                        aria-controls="sidebar"
                        aria-expanded={isMobileSidebarOpen}
                        title={menuLabel}
                    >
                        <i className="fa-solid fa-bars-staggered" aria-hidden="true" />
                    </button>
                    <Link
                        href={homePath}
                        className="mobile-brand-link"
                        aria-label={`${siteName} 홈`}
                        title={`${siteName} 홈`}
                        onClick={(event) => {
                            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                            if (homePath !== pathname && !window.dispatchEvent(new CustomEvent('propig:before-navigation', {
                                cancelable: true,
                                detail: { href: homePath },
                            }))) {
                                event.preventDefault();
                                return;
                            }
                            if (isMobileSidebarOpen) toggleMobileSidebar();
                        }}
                    >
                        {logoImage.canRenderImage ? (
                            <img
                                src={logoImage.displaySrc}
                                alt=""
                                className="mobile-logo-image"
                                onError={logoImage.markBroken}
                            />
                        ) : (
                            <i className="fa-solid fa-layer-group" aria-hidden="true" />
                        )}
                    </Link>

                    {title && (
                        <div className="header-title-block">
                            <h1>
                                {title}
                            </h1>
                            {description && (
                                <p>
                                    {description}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                <div className="header-actions">
                    {currentUser && <MemoNotificationBell key={currentUser.uid} uid={currentUser.uid} />}
                    {currentUser ? (
                        <ProfileButton onOpenSiteSelection={openLogin} />
                    ) : (
                        <button
                            type="button"
                            onClick={openLogin}
                            className="toggle-btn auth-login-btn"
                            title={isConfigured ? '로그인 및 사이트 선택' : error ?? '사이트 선택'}
                            aria-label="로그인"
                        >
                            <i className="fa-solid fa-user"></i>
                        </button>
                    )}
                </div>
            </header>

            {isLoginOpen ? (
                <LoginModal
                    isOpen
                    onClose={closeLogin}
                />
            ) : null}
        </>
    );
}
