'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { SiteId, Position, Role, MenuContextType } from '@/types/menu';
import { useMenu } from '@/hooks/useMenu';
import { useCurrentUserAccess } from '@/hooks/useCurrentUserAccess';
import { getFirstAccessibleSiteId } from '@/utils/menuAccess';

const MenuContext = createContext<MenuContextType | undefined>(undefined);
const SELECTED_SITE_STORAGE_KEY = 'propig_selected_menu_site';

function getRouteSite(pathname: string | null): SiteId | null {
  if (!pathname) return null;
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'admin';
  if (pathname === '/blog' || pathname.startsWith('/blog/')) return 'blog';
  if (pathname === '/corp' || pathname.startsWith('/corp/')) return 'corp';
  if (pathname === '/propig' || pathname.startsWith('/propig/')) return 'shop';
  if (pathname === '/shop' || pathname.startsWith('/shop/')) return 'shop';
  return null;
}

function readStoredSite(): SiteId | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage.getItem(SELECTED_SITE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredSite(siteId: SiteId): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(SELECTED_SITE_STORAGE_KEY, siteId);
  } catch {
    // Ignore storage failures so navigation still works in restricted browsers.
  }
}

interface MenuProviderProps {
  children: ReactNode;
  initialSite?: SiteId;
  initialPosition?: Position;
  initialRole?: Role;
}

export function MenuProvider({ 
  children, 
  initialSite = 'admin',
  initialPosition = 'staff',
  initialRole = 'guest'
}: MenuProviderProps) {
  const pathname = usePathname();
  const currentAccess = useCurrentUserAccess();
  const [currentSite, setCurrentSite] = useState<SiteId>(() => getRouteSite(pathname) ?? initialSite);
  const [currentPosition, setCurrentPosition] = useState<Position>(initialPosition);
  const userRole = (currentAccess.access.role || initialRole) as Role;

  const menuData = useMenu({
    siteId: currentSite,
    userRole,
    position: currentPosition,
    permissions: currentAccess.access.permissions,
    menuAccess: currentAccess.access.menuAccess,
  });

  const syncedPath = useRef<string | null | undefined>(undefined);
  const selectionRevision = useRef(0);
  const handleSetCurrentSite = useCallback((siteId: SiteId) => {
    // A manual selection owns the current URL until navigation commits.
    syncedPath.current = pathname;
    selectionRevision.current += 1;
    setCurrentSite(siteId);
    writeStoredSite(siteId);
  }, [pathname]);

  const handleSetCurrentPosition = useCallback((position: Position) => {
    setCurrentPosition(position);
  }, []);

  useEffect(() => {
    const nextPosition = currentAccess.access.position as Position;
    if (nextPosition && nextPosition !== currentPosition) {
      queueMicrotask(() => setCurrentPosition(nextPosition));
    }
  }, [currentAccess.access.position, currentPosition]);

  useEffect(() => {
    if (currentAccess.isLoading || menuData.isLoading || Object.keys(menuData.siteData).length === 0) return;
    const routeChanged = syncedPath.current !== pathname;
    const firstSync = syncedPath.current === undefined;
    const targetSite = getFirstAccessibleSiteId(
      menuData.siteData,
      {
        role: userRole,
        siteAccess: currentAccess.access.siteAccess,
        permissions: currentAccess.access.permissions,
      },
      routeChanged
        ? [getRouteSite(pathname), firstSync ? readStoredSite() : currentSite, initialSite]
        : [currentSite, readStoredSite(), initialSite],
    );
    const revision = selectionRevision.current;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || revision !== selectionRevision.current) return;
      syncedPath.current = pathname;
      if (!targetSite || targetSite === currentSite) return;
      setCurrentSite(targetSite);
      writeStoredSite(targetSite);
    });
    return () => { cancelled = true; };
  }, [
    currentAccess.access.permissions,
    currentAccess.access.siteAccess,
    currentAccess.isLoading,
    currentSite,
    initialSite,
    menuData.isLoading,
    menuData.siteData,
    pathname,
    userRole,
  ]);

  const contextValue: MenuContextType = {
    currentSite,
    setCurrentSite: handleSetCurrentSite,
    currentPosition,
    setCurrentPosition: handleSetCurrentPosition,
    userRole,
    siteAccess: currentAccess.access.siteAccess,
    menuAccess: currentAccess.access.menuAccess,
    permissions: currentAccess.access.permissions,
    filteredMenu: menuData.filteredMenu,
    isLoading: menuData.isLoading || currentAccess.isLoading,
    siteData: menuData.siteData,
    activePath: menuData.activePath,
  };

  return (
    <MenuContext.Provider value={contextValue}>
      {children}
    </MenuContext.Provider>
  );
}

export function useMenuContext() {
  const context = useContext(MenuContext);
  if (!context) {
    throw new Error('useMenuContext must be used within MenuProvider');
  }
  return context;
}
