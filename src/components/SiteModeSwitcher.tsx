'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { getSwitchableSiteEntries } from '@/constants/accountMenu';
import { getSiteHomePath } from '@/constants/siteHome';
import { useMenuContext } from '@/contexts/MenuContext';
import { canAccessSiteMode } from '@/utils/menuAccess';

export function SiteModeSwitcher() {
  const router = useRouter();
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const {
    currentSite,
    setCurrentSite,
    siteData,
    userRole,
    siteAccess,
    permissions,
    isLoading,
  } = useMenuContext();

  const availableSites = useMemo(
    () =>
      getSwitchableSiteEntries(siteData).filter(([siteId]) =>
        canAccessSiteMode(siteId, siteData, {
          role: userRole,
          siteAccess,
          permissions,
        }),
      ),
    [permissions, siteAccess, siteData, userRole],
  );

  const currentSiteData = siteData[currentSite];
  const currentName = currentSiteData?.name || currentSite.toUpperCase();
  const currentIcon = currentSiteData?.icon || 'globe';

  useEffect(() => {
    const close = () => detailsRef.current?.removeAttribute('open');
    const handlePointerDown = (event: PointerEvent) => {
      if (!detailsRef.current?.contains(event.target as Node)) close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const selectSite = (siteId: string) => {
    if (siteId === currentSite) {
      detailsRef.current?.removeAttribute('open');
      return;
    }

    const href = getSiteHomePath(siteId, siteData);
    if (!window.dispatchEvent(new CustomEvent('propig:before-navigation', {
      cancelable: true,
      detail: { href },
    }))) return;
    setCurrentSite(siteId);
    detailsRef.current?.removeAttribute('open');
    router.push(href);
  };

  return (
    <details ref={detailsRef} className="site-mode-switcher">
      <summary
        className="site-mode-switcher-trigger"
        aria-label={`현재 사이트 모드: ${currentName}. 다른 사이트 모드 보기`}
        title="사이트 모드 전환"
      >
        <i className={`fa-solid fa-${currentIcon}`} aria-hidden="true" />
        <span className="site-mode-switcher-current">
          <small>사이트 모드</small>
          <strong>{currentName}</strong>
        </span>
        <i className="fa-solid fa-chevron-down site-mode-switcher-caret" aria-hidden="true" />
      </summary>

      <section className="site-mode-switcher-panel" aria-label="사이트 모드 선택">
        <header>
          <strong>사이트 모드</strong>
          <span>이동할 사이트를 선택하세요.</span>
        </header>

        {isLoading && availableSites.length === 0 ? (
          <p className="site-mode-switcher-empty" role="status">사이트 목록을 불러오는 중입니다.</p>
        ) : (
          <div className="site-mode-switcher-list" role="list">
            {availableSites.map(([siteId, site]) => {
              const active = siteId === currentSite;
              return (
                <button
                  key={siteId}
                  type="button"
                  role="listitem"
                  className={active ? 'active' : undefined}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => selectSite(siteId)}
                  onMouseEnter={() => router.prefetch(getSiteHomePath(siteId, siteData))}
                  onFocus={() => router.prefetch(getSiteHomePath(siteId, siteData))}
                >
                  <span
                    className="site-mode-switcher-icon"
                    style={{ '--site-mode-color': site.color || '#3b82f6' } as CSSProperties}
                    aria-hidden="true"
                  >
                    <i className={`fa-solid fa-${site.icon || 'globe'}`} />
                  </span>
                  <span>{site.name || siteId}</span>
                  {active ? <small>현재</small> : <i className="fa-solid fa-arrow-right" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        )}
      </section>
    </details>
  );
}
