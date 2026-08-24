'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    isAvailablePropigStoreAppId,
    PROPIG_STORE_MENU_ITEMS,
    PROPIG_STORE_PAGE_MENU_ITEM,
    type PropigStoreAppId,
} from '@/constants/propigStore';
import { isCompanyMenuRoute } from '@/constants/companyMenu';
import { DEFAULT_SITE_HOME_MENU_ITEMS } from '@/constants/siteHome';
import { MENU_PAGE_OPTIONS } from '@/constants/menuPages';
import { useMenuContext } from '@/contexts/MenuContext';
import { useSystem } from '@/contexts/SystemContext';
import { useBrandImageFallback } from '@/hooks/useBrandImageFallback';
import { usePropigAppRegistry } from '@/hooks/usePropigAppRegistry';
import { MenuItem } from '@/types/menu';

interface SidebarProps {
    currentEnv: string;
    isCollapsed: boolean;
    isMobileOpen?: boolean;
    isMobileViewport?: boolean;
    closeMobileSidebar?: () => void;
    setViewTitle: (title: string, desc: string) => void;
    toggleSidebar?: () => void;
}

interface PopoverState {
    top: number;
    title: string;
    items: MenuItem[];
    parent: MenuItem;
}

const PROPIG_ADMIN_DIVIDER_ID = 'propig-user-admin-divider';

const DEFAULT_PROPIG_ADMIN_DIVIDER: MenuItem = {
    id: PROPIG_ADMIN_DIVIDER_ID,
    text: '구분선',
    type: 'divider',
};

function isPropigHomeMenuItem(item: MenuItem): boolean {
    return item.id === DEFAULT_SITE_HOME_MENU_ITEMS.shop.id || item.path === DEFAULT_SITE_HOME_MENU_ITEMS.shop.path;
}

function isPropigStorePageMenuItem(item: MenuItem): boolean {
    return item.id === 'shop-store' || item.path === '/propig/store';
}

function getPropigManagedStoreAppId(item: Pick<MenuItem, 'id' | 'propigAppId'>): PropigStoreAppId | null {
    if (isAvailablePropigStoreAppId(item.propigAppId)) {
        return item.propigAppId;
    }

    const matchedStoreItem = PROPIG_STORE_MENU_ITEMS.find((storeItem) => storeItem.id === item.id);
    return isAvailablePropigStoreAppId(matchedStoreItem?.propigAppId)
        ? matchedStoreItem.propigAppId
        : null;
}

function filterInstalledPropigApps(
    item: MenuItem,
    isInstalled: (appId: PropigStoreAppId) => boolean,
): MenuItem | null {
    if (item.hidden) {
        return null;
    }

    const appId = getPropigManagedStoreAppId(item);
    if (appId && !isInstalled(appId)) {
        return null;
    }

    if (!item.sub || !Array.isArray(item.sub)) {
        return item;
    }

    const filteredSub = item.sub
        .map((subItem) => {
            if (typeof subItem === 'string') return subItem;
            return filterInstalledPropigApps(subItem, isInstalled);
        })
        .filter(Boolean) as MenuItem['sub'];
    const hasVisibleSubMenu = filteredSub?.some((subItem) => typeof subItem !== 'string') ?? false;

    if (!item.path && item.type === 'folder' && !hasVisibleSubMenu) {
        return null;
    }

    return { ...item, sub: filteredSub };
}

function isSameMenuTarget(left: MenuItem, right: MenuItem): boolean {
    const leftAppId = getPropigManagedStoreAppId(left);
    const rightAppId = getPropigManagedStoreAppId(right);
    if (leftAppId || rightAppId) {
        return Boolean(leftAppId && rightAppId && leftAppId === rightAppId);
    }

    const leftIsStorePage = isPropigStorePageMenuItem(left);
    const rightIsStorePage = isPropigStorePageMenuItem(right);
    if (leftIsStorePage || rightIsStorePage) {
        return leftIsStorePage && rightIsStorePage;
    }

    return (
        left.id === right.id ||
        Boolean(left.path && right.path && left.path === right.path)
    );
}

function isMenuRouteActive(item: MenuItem, pathname: string | null): boolean {
    if (item.path === pathname) return true;

    return (
        item.id === 'corp-partnership' &&
        Boolean(pathname?.startsWith('/corp/partnership/'))
    );
}

function appendIfMissing(items: MenuItem[], item: MenuItem): MenuItem[] {
    return items.some((existingItem) => isSameMenuTarget(existingItem, item))
        ? items
        : [...items, item];
}

function getMenuItemHref(item: MenuItem): string {
    return item.path || '#';
}

function collectIdlePrefetchTargets(items: MenuItem[], pathname: string | null, limit = 4): string[] {
    const targets: string[] = [];

    const visit = (menuItems: MenuItem[]) => {
        for (const item of menuItems) {
            if (targets.length >= limit) return;
            if (
                item.path &&
                !item.external &&
                item.path !== pathname &&
                item.path.startsWith('/') &&
                !isCompanyMenuRoute(item.path) &&
                !targets.includes(item.path)
            ) {
                targets.push(item.path);
            }

            const subItems = (item.sub || []).filter((sub): sub is MenuItem => typeof sub !== 'string');
            if (subItems.length > 0) visit(subItems);
        }
    };

    visit(items);
    return targets;
}

function ensureDefaultPropigMenuItems(items: MenuItem[]): MenuItem[] {
    return [PROPIG_STORE_PAGE_MENU_ITEM, ...PROPIG_STORE_MENU_ITEMS].reduce(
        (nextItems, item) => appendIfMissing(nextItems, item),
        items,
    );
}

const CORP_MENU_GROUPS = [
    { key: 'company', label: '회사소개', icon: 'building', group: '기업' },
    { key: 'project', label: '프로젝트', icon: 'diagram-project', group: '프로젝트' },
    { key: 'partnership', label: '제휴하기', icon: 'handshake', group: '제휴' },
    { key: 'careers', label: '인재채용', icon: 'briefcase', group: '채용' },
] as const;

function collectMenuPaths(items: MenuItem[]): Set<string> {
    const paths = new Set<string>();
    const visit = (menuItems: MenuItem[]) => {
        menuItems.forEach((item) => {
            if (item.path) paths.add(item.path);
            const children = (item.sub || []).filter((sub): sub is MenuItem => typeof sub !== 'string');
            visit(children);
        });
    };
    visit(items);
    return paths;
}

function ensureCorpMenuItems(items: MenuItem[]): MenuItem[] {
    const knownPaths = collectMenuPaths(items);
    const nextItems = [...items];

    CORP_MENU_GROUPS.forEach((group) => {
        const missingItems: MenuItem[] = MENU_PAGE_OPTIONS
            .filter((page) => page.group === group.group && page.path.startsWith('/corp/') && !knownPaths.has(page.path))
            .map((page) => ({
                id: `corp-required-${page.path.replace(/[^a-z0-9]+/gi, '-')}`,
                text: page.label,
                path: page.path,
                icon: page.icon || 'link',
                type: 'link',
            }));

        if (missingItems.length === 0) return;

        const groupIndex = nextItems.findIndex((item) => {
            if (item.text === group.label) return true;
            const children = (item.sub || []).filter((sub): sub is MenuItem => typeof sub !== 'string');
            return children.some((child) => child.path?.startsWith(`/corp/${group.key}/`));
        });

        if (groupIndex >= 0) {
            const existing = nextItems[groupIndex];
            const existingChildren = (existing.sub || []).filter((sub): sub is MenuItem => typeof sub !== 'string');
            const parentPage = existing.path
                ? MENU_PAGE_OPTIONS.find((page) => page.path === existing.path)
                : undefined;
            const parentPathItem = parentPage && !existingChildren.some((child) => child.path === parentPage.path)
                ? [{
                    id: `corp-required-${parentPage.path.replace(/[^a-z0-9]+/gi, '-')}`,
                    text: parentPage.label,
                    path: parentPage.path,
                    icon: parentPage.icon || existing.icon || 'link',
                    type: 'link' as const,
                }]
                : [];
            nextItems[groupIndex] = {
                ...existing,
                sub: [...parentPathItem, ...(existing.sub || []), ...missingItems],
            };
        } else {
            nextItems.push({
                id: `corp-required-${group.key}`,
                text: group.label,
                icon: group.icon,
                type: 'folder',
                sub: missingItems,
            });
        }

        missingItems.forEach((item) => {
            if (item.path) knownPaths.add(item.path);
        });
    });

    return nextItems;
}

function organizePropigSidebarMenu(
    items: MenuItem[],
    isInstalled: (appId: PropigStoreAppId) => boolean,
    installedAppIds: PropigStoreAppId[],
): MenuItem[] {
    let dividerItem: MenuItem = DEFAULT_PROPIG_ADMIN_DIVIDER;
    const fixedItems: MenuItem[] = [];
    const userItems: MenuItem[] = [];
    const adminItems: MenuItem[] = [];
    const appOrder = new Map(installedAppIds.map((appId, index) => [appId, index]));

    for (const item of ensureDefaultPropigMenuItems(items)) {
        if (item.hidden) {
            continue;
        }

        if (item.type === 'divider') {
            if (dividerItem.id === PROPIG_ADMIN_DIVIDER_ID) {
                dividerItem = item;
            }
            continue;
        }

        const filteredItem = filterInstalledPropigApps(item, isInstalled);
        if (!filteredItem) continue;

        const appId = getPropigManagedStoreAppId(filteredItem);
        if (isPropigHomeMenuItem(filteredItem)) {
            fixedItems.push(filteredItem);
            continue;
        }

        if (appId) {
            userItems.push(filteredItem);
            continue;
        }

        adminItems.push(filteredItem);
    }

    const hasPropigHome = fixedItems.some(isPropigHomeMenuItem);
    const getAppOrder = (item: MenuItem) => {
        const appId = getPropigManagedStoreAppId(item);
        return appId ? appOrder.get(appId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
    };
    const orderedUserItems = [...userItems].sort((left, right) => {
        return getAppOrder(left) - getAppOrder(right);
    });
    const topItems = [
        ...(hasPropigHome ? [] : [DEFAULT_SITE_HOME_MENU_ITEMS.shop]),
        ...fixedItems.filter(isPropigHomeMenuItem),
        ...orderedUserItems,
    ];

    return adminItems.length > 0
        ? [...topItems, dividerItem, ...adminItems]
        : topItems;
}

export default function Sidebar({
    currentEnv,
    isCollapsed,
    isMobileOpen = false,
    isMobileViewport = false,
    closeMobileSidebar,
    setViewTitle,
    toggleSidebar
}: SidebarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const { filteredMenu, siteData } = useMenuContext();
    const appRegistry = usePropigAppRegistry();
    const [openItems, setOpenItems] = useState<string[]>([]);
    const [popover, setPopover] = useState<PopoverState | null>(null);
    const usesCollapsedBehavior = isCollapsed && !isMobileOpen;
    const shouldFilterPropigStoreApps = currentEnv === 'shop';
    const menuSource = useMemo(
        () => (pathname?.startsWith('/corp') ? ensureCorpMenuItems(filteredMenu) : filteredMenu),
        [filteredMenu, pathname],
    );
    const visibleMenu = useMemo(
        () =>
            shouldFilterPropigStoreApps
                ? organizePropigSidebarMenu(menuSource, appRegistry.isInstalled, appRegistry.installedAppIds)
                : menuSource,
        [appRegistry.installedAppIds, appRegistry.isInstalled, menuSource, shouldFilterPropigStoreApps],
    );
    const idlePrefetchTargets = useMemo(
        () => collectIdlePrefetchTargets(visibleMenu, pathname),
        [pathname, visibleMenu],
    );

    const getSubMenuItems = useCallback(
        (item: MenuItem): MenuItem[] =>
            (item.sub || []).filter((sub): sub is MenuItem => typeof sub !== 'string'),
        [],
    );

    const isMenuItemActive = useCallback((item: MenuItem): boolean => {
        const walk = (menuItem: MenuItem): boolean => {
            if (isMenuRouteActive(menuItem, pathname)) return true;
            return getSubMenuItems(menuItem).some(walk);
        };

        return walk(item);
    }, [getSubMenuItems, pathname]);

    const prefetchMenuItem = useCallback((item: MenuItem) => {
        if (
            !item.path ||
            item.external ||
            item.path === pathname ||
            !item.path.startsWith('/') ||
            isCompanyMenuRoute(item.path)
        ) return;
        router.prefetch(item.path);
    }, [pathname, router]);

    const prefetchMenuItemOnPointerDown = useCallback((item: MenuItem) => {
        if (item.path && !item.external && item.path !== pathname && item.path.startsWith('/')) {
            router.prefetch(item.path);
        }
    }, [pathname, router]);

    useEffect(() => {
        if (idlePrefetchTargets.length === 0) return;

        const connection = (navigator as Navigator & {
            connection?: { saveData?: boolean; effectiveType?: string };
        }).connection;
        if (connection?.saveData || connection?.effectiveType?.includes('2g')) return;

        const prefetch = () => {
            idlePrefetchTargets.forEach((target) => router.prefetch(target));
        };
        const idleWindow = window as typeof window & {
            requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
            cancelIdleCallback?: (handle: number) => void;
        };

        if (idleWindow.requestIdleCallback) {
            const idleId = idleWindow.requestIdleCallback(prefetch, { timeout: 1_500 });
            return () => idleWindow.cancelIdleCallback?.(idleId);
        }

        const timeoutId = window.setTimeout(prefetch, 800);
        return () => window.clearTimeout(timeoutId);
    }, [idlePrefetchTargets, router]);

    const navigateToMenuItem = useCallback((item: MenuItem) => {
        if (!item.path) return;
        if (item.path === pathname) {
            closeMobileSidebar?.();
            return;
        }

        const navigationEvent = new CustomEvent('propig:before-navigation', {
            cancelable: true,
            detail: { href: item.path },
        });
        if (!window.dispatchEvent(navigationEvent)) return;

        router.push(item.path);
        closeMobileSidebar?.();
        setViewTitle(item.text, `현재 환경: ${currentEnv} / 메뉴: ${item.text}`);
    }, [closeMobileSidebar, currentEnv, pathname, router, setViewTitle]);

    useEffect(() => {
        queueMicrotask(() => {
            if (usesCollapsedBehavior) {
                setOpenItems([]);
            } else {
                setPopover(null);
            }
        });
    }, [usesCollapsedBehavior]);

    useEffect(() => {
        if (usesCollapsedBehavior) return;

        const activeParent = visibleMenu.find((item) =>
            getSubMenuItems(item).length > 0 && isMenuItemActive(item),
        );

        if (!activeParent) return;

        let cancelled = false;
        queueMicrotask(() => {
            if (cancelled) return;
            setOpenItems((prev) => (prev.includes(activeParent.id) ? prev : [activeParent.id]));
        });

        return () => {
            cancelled = true;
        };
    }, [getSubMenuItems, isMenuItemActive, usesCollapsedBehavior, visibleMenu]);

    const toggleMenuItem = (item: MenuItem) => {
        setOpenItems((prev) => (prev.includes(item.id) ? [] : [item.id]));
    };

    const handleMenuClick = (item: MenuItem, event: React.MouseEvent) => {
        const subItems = getSubMenuItems(item);
        const hasSub = subItems.length > 0;

        if (usesCollapsedBehavior && hasSub) {
            event.stopPropagation();
            const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
            setPopover({
                top: rect.top,
                title: item.text,
                items: subItems,
                parent: item,
            });
            return;
        }

        setPopover(null);

        if (item.path) {
            if (hasSub) {
                setOpenItems([item.id]);
            }
            navigateToMenuItem(item);
            return;
        }

        if (hasSub) {
            toggleMenuItem(item);
        }
    };

    const handleMenuToggle = (item: MenuItem, event: React.MouseEvent) => {
        event.stopPropagation();
        setPopover(null);
        toggleMenuItem(item);
    };

    const handleAnchorMenuClick = (item: MenuItem, event: React.MouseEvent<HTMLAnchorElement>) => {
        if (!item.path) {
            event.preventDefault();
            return;
        }

        if (item.path === pathname) {
            event.preventDefault();
            setPopover(null);
            closeMobileSidebar?.();
            return;
        }

        if (item.external) {
            setPopover(null);
            closeMobileSidebar?.();
            return;
        }

        const navigationEvent = new CustomEvent('propig:before-navigation', {
            cancelable: true,
            detail: { href: item.path },
        });
        if (!window.dispatchEvent(navigationEvent)) {
            event.preventDefault();
            return;
        }

        setPopover(null);
        closeMobileSidebar?.();
        setViewTitle(item.text, `현재 환경: ${currentEnv} / 메뉴: ${item.text}`);
    };

    const { settings } = useSystem();
    const rawLogoUrl = settings.envLogos?.[currentEnv] || settings.logoUrl;
    const logoImage = useBrandImageFallback(rawLogoUrl);
    const currentSiteName = siteData[currentEnv]?.name || currentEnv.toUpperCase();

    return (
        <aside
            id="sidebar"
            className={`${isCollapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`}
            role={isMobileViewport ? 'dialog' : undefined}
            aria-label={isMobileViewport ? '주 메뉴' : undefined}
            aria-modal={isMobileViewport && isMobileOpen ? 'true' : undefined}
            aria-hidden={isMobileViewport && !isMobileOpen ? true : undefined}
            inert={isMobileViewport && !isMobileOpen ? true : undefined}
            tabIndex={isMobileViewport ? -1 : undefined}
        >
            <button
                type="button"
                className="sidebar-brand"
                onClick={toggleSidebar}
                style={{ cursor: 'pointer' }}
                aria-label={isMobileViewport ? '메뉴 닫기' : '메뉴 접기'}
                title={isMobileViewport ? '메뉴 닫기' : '메뉴 접기'}
            >
                <div className="brand-icon flex-center">
                    {logoImage.canRenderImage ? (
                        <img
                            src={logoImage.displaySrc}
                            alt={`${currentSiteName} logo`}
                            onError={logoImage.markBroken}
                            style={{
                                width: '100%',
                                height: '100%',
                                display: 'block',
                                objectFit: 'contain'
                            }}
                        />
                    ) : (
                        <i className="fa-solid fa-layer-group"></i>
                    )}
                </div>
                {!usesCollapsedBehavior && (
                    <span className="brand-name">
                        {currentSiteName}
                    </span>
                )}
            </button>

            <div className="menu-container">
                <ul className="nav-list">
                    {visibleMenu.map((item) => {
                        if (item.type === 'divider') {
                            return (
                                <li
                                    key={item.id}
                                    className="menu-divider"
                                    role="separator"
                                    aria-label={item.text || '구분선'}
                                />
                            );
                        }

                        const subItems = getSubMenuItems(item);
                        const hasSub = subItems.length > 0;
                        const isOpen = openItems.includes(item.id);
                        const isActive = isMenuItemActive(item);
                        const iconName = item.icon || (item.type === 'folder' ? 'folder' : 'link');

                        return (
                            <li key={item.id} className={`nav-item ${isActive ? 'active' : ''} ${isOpen ? 'open' : ''}`}>
                                {hasSub ? (
                                    <div className="nav-btn nav-btn-composite">
                                        <button
                                            type="button"
                                            className="nav-action"
                                            onClick={(event) => handleMenuClick(item, event)}
                                            onMouseEnter={() => prefetchMenuItem(item)}
                                            onFocus={() => prefetchMenuItem(item)}
                                            title={usesCollapsedBehavior ? item.text : undefined}
                                        >
                                            <span className="nav-icon">
                                                <i className={`fa-solid fa-${iconName}`}></i>
                                            </span>
                                            <span className="nav-label">{item.text}</span>
                                        </button>

                                        {!usesCollapsedBehavior && (
                                            <button
                                                type="button"
                                                className="nav-toggle"
                                                onClick={(event) => handleMenuToggle(item, event)}
                                                aria-label={`${item.text} 하위 메뉴 ${isOpen ? '접기' : '펼치기'}`}
                                                aria-expanded={isOpen}
                                            >
                                                <i className="fa-solid fa-chevron-right nav-arrow"></i>
                                            </button>
                                        )}
                                    </div>
                                ) : item.external ? (
                                    <a
                                        href={getMenuItemHref(item)}
                                        className="nav-btn"
                                        onClick={(event) => handleAnchorMenuClick(item, event)}
                                        title={usesCollapsedBehavior ? item.text : undefined}
                                    >
                                        <span className="nav-icon">
                                            <i className={`fa-solid fa-${iconName}`}></i>
                                        </span>
                                        <span className="nav-label">{item.text}</span>
                                    </a>
                                ) : (
                                    <Link
                                        href={getMenuItemHref(item)}
                                        className="nav-btn"
                                        prefetch={null}
                                        aria-current={isActive ? 'page' : undefined}
                                        onClick={(event) => handleAnchorMenuClick(item, event)}
                                        onMouseEnter={() => prefetchMenuItem(item)}
                                        onFocus={() => prefetchMenuItem(item)}
                                        onPointerDown={() => prefetchMenuItemOnPointerDown(item)}
                                        title={usesCollapsedBehavior ? item.text : undefined}
                                    >
                                        <span className="nav-icon">
                                            <i className={`fa-solid fa-${iconName}`}></i>
                                        </span>
                                        <span className="nav-label">{item.text}</span>
                                    </Link>
                                )}

                                {hasSub && (
                                    <ul className="sub-nav">
                                        {subItems.map((sub) => (
                                            <li key={sub.id} className={`sub-nav-item ${isMenuItemActive(sub) ? 'active' : ''}`}>
                                                <Link
                                                    href={getMenuItemHref(sub)}
                                                    prefetch={sub.external ? false : null}
                                                    className={sub.path === pathname ? 'active' : ''}
                                                    aria-current={sub.path === pathname ? 'page' : undefined}
                                                    onMouseEnter={() => prefetchMenuItem(sub)}
                                                    onFocus={() => prefetchMenuItem(sub)}
                                                    onPointerDown={() => prefetchMenuItemOnPointerDown(sub)}
                                                    onClick={(event) => handleAnchorMenuClick(sub, event)}
                                                >
                                                    {sub.text}
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </div>

            <div
                className={`popover-card ${popover ? 'active' : ''}`}
                style={{
                    top: popover?.top,
                    left: 'calc(var(--sb-collapsed) + 8px)',
                    display: popover ? 'block' : 'none'
                }}
            >
                {popover && (
                    <>
                        {popover.parent.path ? (
                            <Link
                                href={getMenuItemHref(popover.parent)}
                                prefetch={popover.parent.external ? false : null}
                                className="popover-header popover-header-link"
                                aria-current={popover.parent.path === pathname ? 'page' : undefined}
                                onMouseEnter={() => prefetchMenuItem(popover.parent)}
                                onFocus={() => prefetchMenuItem(popover.parent)}
                                onPointerDown={() => prefetchMenuItemOnPointerDown(popover.parent)}
                                onClick={(event) => handleAnchorMenuClick(popover.parent, event)}
                            >
                                <span>{popover.title}</span>
                                <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
                            </Link>
                        ) : (
                            <div className="popover-header">{popover.title}</div>
                        )}

                        {popover.items.map((subItem) => (
                            <Link
                                key={subItem.id}
                                href={getMenuItemHref(subItem)}
                                prefetch={subItem.external ? false : null}
                                className="popover-link"
                                aria-current={subItem.path === pathname ? 'page' : undefined}
                                onMouseEnter={() => prefetchMenuItem(subItem)}
                                onFocus={() => prefetchMenuItem(subItem)}
                                onPointerDown={() => prefetchMenuItemOnPointerDown(subItem)}
                                onClick={(event) => handleAnchorMenuClick(subItem, event)}
                            >
                                {subItem.text}
                            </Link>
                        ))}
                    </>
                )}
            </div>
        </aside>
    );
}
