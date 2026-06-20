'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
import { ACCOUNT_MENU_SITE_ID, getSwitchableSiteEntries } from '@/constants/accountMenu';
import { getSiteHomePath } from '@/constants/siteHome';
import { useMenuContext } from '@/contexts/MenuContext';
import { useMenu } from '@/hooks/useMenu';
import { useMenuSitesQuery } from '@/hooks/useMenuSitesQuery';
import { MenuItem } from '@/types/menu';
import type { ManagedUserPermissionKey } from '@/types/userAccess';

type AccountMenuRenderItem = {
  item: MenuItem;
  depth: number;
  kind: 'divider' | 'group' | 'link';
};

const ROLE_LABELS: Record<string, string> = {
  admin: '관리자',
  user: '사용자',
  partner: '파트너',
  guest: '게스트',
};

const POSITION_LABELS: Record<string, string> = {
  ceo: '최고 관리자',
  manager: '매니저',
  staff: '스태프',
  intern: '인턴',
};

const PERMISSION_LABELS: Array<[ManagedUserPermissionKey, string]> = [
  ['userManagement', '유저 관리'],
  ['menuManagement', '메뉴 관리'],
  ['projectBoardManagement', '프로젝트 보드'],
  ['photoManagement', '사진첩'],
  ['storageManagement', 'Storage'],
];

function getMenuChildren(item: MenuItem): MenuItem[] {
  if (!item.sub) return [];
  return item.sub.filter((subItem): subItem is MenuItem => typeof subItem !== 'string');
}

function flattenAccountMenu(items: MenuItem[], depth = 0): AccountMenuRenderItem[] {
  return items.flatMap((item) => {
    if (item.type === 'divider') {
      return [{ item, depth, kind: 'divider' as const }];
    }

    const children = getMenuChildren(item);
    if (children.length > 0) {
      return [
        { item, depth, kind: 'group' as const },
        ...flattenAccountMenu(children, depth + 1),
      ];
    }

    return [{ item, depth, kind: 'link' as const }];
  });
}

export const ProfileButton: React.FC = () => {
  const { currentUser, logout } = useAuth();
  const { currentSite, setCurrentSite, siteData, userRole, currentPosition, siteAccess, menuAccess, permissions } = useMenuContext();
  const { data: remoteSites } = useMenuSitesQuery();
  const { filteredMenu: accountMenu } = useMenu({
    siteId: ACCOUNT_MENU_SITE_ID,
    userRole,
    position: currentPosition,
    permissions,
    menuAccess,
  });
  const router = useRouter();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState('');

  const availableSites = useMemo(() => {
    return remoteSites && Object.keys(remoteSites).length > 0 ? remoteSites : siteData;
  }, [remoteSites, siteData]);

  const siteEntries = useMemo(
    () =>
      getSwitchableSiteEntries(availableSites).filter(
        ([siteId]) => userRole === 'admin' || siteAccess[siteId] !== false,
      ),
    [availableSites, siteAccess, userRole],
  );

  const accountMenuItems = useMemo(() => flattenAccountMenu(accountMenu), [accountMenu]);

  useEffect(() => {
    if (!isMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) {
        return;
      }

      setIsMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen]);

  if (!currentUser) {
    return null;
  }

  const displayName = currentUser.displayName ?? '사용자';
  const displayEmail = currentUser.email ?? '이메일 없음';
  const profileLabel = currentUser.displayName || currentUser.email || '사용자 메뉴';

  const roleLabel = ROLE_LABELS[userRole] || userRole;
  const positionLabel = POSITION_LABELS[currentPosition] || currentPosition;
  const activePermissionLabels =
    userRole === 'admin'
      ? ['전체 관리']
      : PERMISSION_LABELS.filter(([key]) => permissions[key] === true).map(([, label]) => label);

  const handleSwitchEnvironment = (siteId: string) => {
    setCurrentSite(siteId);
    setIsMenuOpen(false);
    router.push(getSiteHomePath(siteId, availableSites));
  };

  const handleOpenMenuRegistration = (targetSiteId: string) => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('admin_menu_requested_panel', 'tools');
      window.sessionStorage.setItem('admin_menu_requested_site', targetSiteId);
      window.dispatchEvent(new Event('admin-menu-open-panel'));
    }

    setIsMenuOpen(false);
    router.push('/admin/menu');
  };

  const handleAccountMenuClick = (item: MenuItem) => {
    if (!item.path) return;

    setIsMenuOpen(false);
    if (item.external && typeof window !== 'undefined') {
      window.open(item.path, '_blank', 'noopener,noreferrer');
      return;
    }

    router.push(item.path);
  };

  const handleLogout = async () => {
    setError('');
    setIsLoggingOut(true);

    try {
      await logout();
      setIsMenuOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '로그아웃에 실패했습니다.');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const renderAvatar = () =>
    currentUser.photoURL ? (
      <div className="auth-avatar">
        { }
        <img src={currentUser.photoURL} alt="Profile" />
      </div>
    ) : (
      <div className="auth-avatar auth-avatar-fallback">
        <span>{currentUser.displayName?.[0] || currentUser.email?.[0] || 'U'}</span>
      </div>
    );

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          setError('');
          setIsMenuOpen((prev) => !prev);
        }}
        className={`auth-profile-btn ${isMenuOpen ? 'active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
      >
        {renderAvatar()}
        <span className="auth-profile-name">{profileLabel}</span>
        <span className={`auth-profile-role is-${userRole}`}>{roleLabel}</span>
        <i className="fa-solid fa-chevron-down auth-profile-caret" aria-hidden="true" />
      </button>

      {isMenuOpen ? (
        <div className="auth-account-overlay">
          <section ref={panelRef} className="auth-account-card" role="menu" aria-label="계정 및 작업 환경">
            <div className="auth-account-head">
              <div className="auth-account-avatar">{renderAvatar()}</div>
              <div className="auth-account-copy">
                <strong>{displayName}</strong>
                <span>{displayEmail}</span>
                <div className="auth-account-role-row">
                  <span className={`auth-profile-role is-${userRole}`}>{roleLabel}</span>
                  <span className="auth-profile-position">{positionLabel}</span>
                </div>
              </div>
            </div>

            <div className="auth-account-section">
              <div className="auth-account-section-title">권한</div>
              <div className="auth-account-permission-grid">
                {activePermissionLabels.length > 0 ? (
                  activePermissionLabels.map((label) => (
                    <span key={label} className="auth-account-permission">
                      {label}
                    </span>
                  ))
                ) : (
                  <span className="auth-account-permission is-muted">기본 사용자</span>
                )}
              </div>
            </div>

            <div className="auth-account-section">
              <div className="auth-account-section-title">작업 환경 전환</div>
              <div className="auth-account-env-grid">
                {siteEntries.map(([siteId, site]) => (
                  <button
                    key={siteId}
                    type="button"
                    className={`auth-account-env ${siteId === currentSite ? 'active' : ''}`}
                    onClick={() => handleSwitchEnvironment(siteId)}
                    role="menuitem"
                  >
                    <i
                      className={`fa-solid fa-${site.icon || 'globe'}`}
                      style={{ color: site.color || 'var(--primary)' }}
                      aria-hidden="true"
                    />
                    <span>{site.name}</span>
                  </button>
                ))}
              </div>

              {siteEntries.length === 0 ? (
                <p className="auth-account-empty">등록된 사이트모드가 없습니다.</p>
              ) : null}
            </div>

            <div className="auth-account-section">
              <div className="auth-account-section-title">우측 메뉴</div>
              {accountMenuItems.length > 0 ? (
                <div className="auth-account-shortcuts">
                  {accountMenuItems.map(({ item, depth, kind }) => {
                    if (kind === 'divider') {
                      return <div key={item.id} className="auth-account-shortcut-divider" role="separator" />;
                    }

                    if (kind === 'group') {
                      return (
                        <div
                          key={item.id}
                          className="auth-account-shortcut-group"
                          style={{ paddingLeft: 2 + depth * 14 }}
                        >
                          <i className={`fa-solid fa-${item.icon || 'folder'}`} aria-hidden="true" />
                          <span>{item.text}</span>
                        </div>
                      );
                    }

                    return (
                      <button
                        key={item.id}
                        type="button"
                        className="auth-account-shortcut"
                        style={{ paddingLeft: 10 + depth * 14 }}
                        onClick={() => handleAccountMenuClick(item)}
                        role="menuitem"
                        disabled={!item.path}
                      >
                        <span className="auth-account-shortcut-icon" aria-hidden="true">
                          <i className={`fa-solid fa-${item.icon || 'link'}`} />
                        </span>
                        <span className="auth-account-shortcut-copy">{item.text}</span>
                        <i className="fa-solid fa-chevron-right auth-account-action-caret" aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="auth-account-empty">등록된 우측 메뉴가 없습니다.</p>
              )}
            </div>

            <div className="auth-account-section">
              <div className="auth-account-section-title">메뉴 관리</div>
              <button
                type="button"
                className="auth-account-action"
                onClick={() => handleOpenMenuRegistration(currentSite)}
                role="menuitem"
              >
                <span className="auth-account-action-icon" aria-hidden="true">
                  <i className="fa-solid fa-square-plus" />
                </span>
                <span className="auth-account-action-copy">
                  <strong>메뉴 등록</strong>
                  <span>현재 작업 환경에 페이지 메뉴를 추가합니다</span>
                </span>
                <i className="fa-solid fa-chevron-right auth-account-action-caret" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="auth-account-action"
                onClick={() => handleOpenMenuRegistration(ACCOUNT_MENU_SITE_ID)}
                role="menuitem"
              >
                <span className="auth-account-action-icon" aria-hidden="true">
                  <i className="fa-solid fa-user-gear" />
                </span>
                <span className="auth-account-action-copy">
                  <strong>우측 메뉴 등록</strong>
                  <span>프로필 패널에 페이지 바로가기를 추가합니다</span>
                </span>
                <i className="fa-solid fa-chevron-right auth-account-action-caret" aria-hidden="true" />
              </button>
            </div>

            {error ? (
              <div className="auth-alert error" style={{ marginTop: 12 }}>
                <i className="fa-solid fa-triangle-exclamation" style={{ marginTop: 2 }} />
                <div>{error}</div>
              </div>
            ) : null}

            <button
              type="button"
              className="auth-account-logout"
              onClick={handleLogout}
              disabled={isLoggingOut}
              role="menuitem"
            >
              <i className="fa-solid fa-right-from-bracket" aria-hidden="true" />
              {isLoggingOut ? '로그아웃 중...' : '로그아웃'}
            </button>
          </section>
        </div>
      ) : null}
    </div>
  );
};
