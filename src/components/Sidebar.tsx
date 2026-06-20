'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
    isAvailablePropigStoreAppId,
    PROPIG_STORE_MENU_ITEMS,
    PROPIG_STORE_PAGE_MENU_ITEM,
    type PropigStoreAppId,
} from '@/constants/propigStore';
import { DEFAULT_SITE_HOME_MENU_ITEMS } from '@/constants/siteHome';
import { useMenuContext } from '@/contexts/MenuContext';
import { useSystem } from '@/contexts/SystemContext';
import { usePropigAppRegistry } from '@/hooks/usePropigAppRegistry';
import { MenuItem } from '@/types/menu';

interface SidebarProps {
    currentEnv: string;
    isCollapsed: boolean;
    isMobileOpen?: boolean;
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

function appendIfMissing(items: MenuItem[], item: MenuItem): MenuItem[] {
    return items.some((existingItem) => isSameMenuTarget(existingItem, item))
        ? items
        : [...items, item];
}

function ensureDefaultPropigMenuItems(items: MenuItem[]): MenuItem[] {
    return [PROPIG_STORE_PAGE_MENU_ITEM, ...PROPIG_STORE_MENU_ITEMS].reduce(
        (nextItems, item) => appendIfMissing(nextItems, item),
        items,
    );
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

    return topItems.length > 0 || adminItems.length > 0
        ? [...topItems, dividerItem, ...adminItems]
        : topItems;
}

export default function Sidebar({
    currentEnv,
    isCollapsed,
    isMobileOpen = false,
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
    const menuSource = shouldFilterPropigStoreApps
        ? siteData[currentEnv]?.menu ?? filteredMenu
        : filteredMenu;
    const visibleMenu = useMemo(
        () =>
            shouldFilterPropigStoreApps
                ? organizePropigSidebarMenu(menuSource, appRegistry.isInstalled, appRegistry.installedAppIds)
                : menuSource,
        [appRegistry.installedAppIds, appRegistry.isInstalled, menuSource, shouldFilterPropigStoreApps],
    );

    const getSubMenuItems = useCallback(
        (item: MenuItem): MenuItem[] =>
            (item.sub || []).filter((sub): sub is MenuItem => typeof sub !== 'string'),
        [],
    );

    const isMenuItemActive = useCallback((item: MenuItem): boolean => {
        const walk = (menuItem: MenuItem): boolean => {
            if (menuItem.path === pathname) return true;
            return getSubMenuItems(menuItem).some(walk);
        };

        return walk(item);
    }, [getSubMenuItems, pathname]);

    const navigateToMenuItem = (item: MenuItem) => {
        if (!item.path) return;
        router.push(item.path);
        closeMobileSidebar?.();
        setViewTitle(item.text, `현재 환경: ${currentEnv} / 메뉴: ${item.text}`);
    };

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

    const handleSubMenuClick = (subItem: MenuItem) => {
        navigateToMenuItem(subItem);
        setPopover(null);
    };

    const { settings } = useSystem();
    const logoUrl = settings.envLogos?.[currentEnv] || settings.logoUrl;
    const currentSiteName = siteData[currentEnv]?.name || currentEnv.toUpperCase();

    return (
        <aside id="sidebar" className={`${isCollapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`}>
            <div
                className="sidebar-brand"
                onClick={toggleSidebar}
                style={{ cursor: 'pointer' }}
                title="메뉴 접기"
            >
                <div className="brand-icon flex-center">
                    {logoUrl ? (
                        <img
                            src={logoUrl}
                            alt="Logo"
                            style={{
                                width: '46.8px',
                                height: '46.8px',
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
            </div>

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
                                ) : (
                                    <button
                                        type="button"
                                        className="nav-btn"
                                        onClick={(event) => handleMenuClick(item, event)}
                                        title={usesCollapsedBehavior ? item.text : undefined}
                                    >
                                        <span className="nav-icon">
                                            <i className={`fa-solid fa-${iconName}`}></i>
                                        </span>
                                        <span className="nav-label">{item.text}</span>
                                    </button>
                                )}

                                {hasSub && (
                                    <ul className="sub-nav">
                                        {subItems.map((sub) => (
                                            <li key={sub.id} className={`sub-nav-item ${isMenuItemActive(sub) ? 'active' : ''}`}>
                                                <a
                                                    href="#"
                                                    className={sub.path === pathname ? 'active' : ''}
                                                    onClick={(event) => {
                                                        event.preventDefault();
                                                        handleSubMenuClick(sub);
                                                    }}
                                                >
                                                    {sub.text}
                                                </a>
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
                            <a
                                href="#"
                                className="popover-header popover-header-link"
                                onClick={(event) => {
                                    event.preventDefault();
                                    handleSubMenuClick(popover.parent);
                                }}
                            >
                                <span>{popover.title}</span>
                                <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
                            </a>
                        ) : (
                            <div className="popover-header">{popover.title}</div>
                        )}

                        {popover.items.map((subItem) => (
                            <a
                                key={subItem.id}
                                href="#"
                                className="popover-link"
                                onClick={(event) => {
                                    event.preventDefault();
                                    handleSubMenuClick(subItem);
                                }}
                            >
                                {subItem.text}
                            </a>
                        ))}
                    </>
                )}
            </div>
        </aside>
    );
}
