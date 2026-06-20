'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useMenuContext } from '@/contexts/MenuContext';
import { useSystem } from '@/contexts/SystemContext';
import { LoginModal } from './LoginModal';
import { ProfileButton } from './ProfileButton';

interface HeaderProps {
    isMobileSidebarOpen: boolean;
    toggleMobileSidebar: () => void;
    title?: string;
    description?: string;
    hideMobileTitle?: boolean;
}

const LEGACY_DESIGN_MODE_STORAGE_KEY = 'propig:design-mode';

export default function Header({
    isMobileSidebarOpen,
    toggleMobileSidebar,
    title,
    description,
    hideMobileTitle = false
}: HeaderProps) {
    const { currentUser, isConfigured, error } = useAuth();
    const { currentSite } = useMenuContext();
    const { settings } = useSystem();
    const [isLoginOpen, setIsLoginOpen] = useState(false);
    const [brokenLogoUrl, setBrokenLogoUrl] = useState<string | null>(null);

    const canOpenLogin = isConfigured;
    const logoUrl = settings.envLogos?.[currentSite] || settings.logoUrl;
    const isLogoBroken = Boolean(logoUrl && brokenLogoUrl === logoUrl);

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
                <div className="header-main" style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: 0 }}>
                    <button
                        type="button"
                        className="mobile-logo-toggle"
                        onClick={toggleMobileSidebar}
                        aria-label={isMobileSidebarOpen ? '메뉴 닫기' : '메뉴 열기'}
                        title={isMobileSidebarOpen ? '메뉴 닫기' : '메뉴 열기'}
                    >
                        {logoUrl && !isLogoBroken ? (
                            <img
                                src={logoUrl}
                                alt=""
                                className="mobile-logo-image"
                                onError={() => setBrokenLogoUrl(logoUrl)}
                            />
                        ) : (
                            <i className="fa-solid fa-bars-staggered"></i>
                        )}
                        {logoUrl && !isLogoBroken && (
                            <span className="mobile-menu-mark" aria-hidden="true">
                                <i className="fa-solid fa-bars-staggered" />
                            </span>
                        )}
                    </button>

                    {title && (
                        <div className={`header-title-block ${hideMobileTitle ? 'hide-mobile-title' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                            <h1 style={{
                                margin: 0,
                                fontSize: '1.2rem',
                                fontWeight: 600,
                                color: 'var(--text-main)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                            }}>
                                {title}
                            </h1>
                            {description && (
                                <p style={{
                                    margin: 0,
                                    fontSize: '0.8rem',
                                    color: 'var(--text-dim)',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis'
                                }}>
                                    {description}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {/* 로그인 상태에 따라 버튼 또는 프로필 표시 */}
                    {currentUser ? (
                        <ProfileButton />
                    ) : (
                        <button
                            onClick={() => {
                                if (!canOpenLogin) return;
                                setIsLoginOpen(true);
                            }}
                            className="toggle-btn auth-login-btn"
                            title={canOpenLogin ? '로그인' : error ?? 'Firebase가 설정되지 않았습니다.'}
                            aria-label="로그인"
                            disabled={!canOpenLogin}
                        >
                            <i className="fa-solid fa-user"></i>
                        </button>
                    )}
                </div>
            </header>

            <LoginModal
                isOpen={isLoginOpen}
                onClose={() => setIsLoginOpen(false)}
            />
        </>
    );
}
