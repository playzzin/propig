'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useSystem } from '@/contexts/SystemContext';
import { useMenuContext } from '@/contexts/MenuContext';
import type { MenuItem, SiteDataType } from '@/types/menu';

const DEFAULT_FAVICON = '/favicon.ico';
const PROPIG_FAVICON = '/propig-favicon.svg';
const DYNAMIC_ICON_LINK_SELECTOR = 'link[data-dynamic-favicon="true"]';
const ICON_LINK_SELECTOR = 'link[rel~="icon"], link[rel="shortcut icon"]';
const SITE_ID_ALIASES: Record<string, string[]> = {
    shop: ['propig'],
    propig: ['shop'],
};
const DEFAULT_SITE_FAVICONS: Record<string, string> = {
    shop: PROPIG_FAVICON,
    propig: PROPIG_FAVICON,
};

function menuContainsPath(items: MenuItem[], pathname: string): boolean {
    return items.some((item) => {
        if (item.path) {
            if (item.path === pathname) return true;
            if (item.path !== '/' && pathname.startsWith(`${item.path}/`)) return true;
        }

        if (!item.sub) return false;

        return item.sub.some((subItem) => {
            if (typeof subItem === 'string') return false;
            return menuContainsPath([subItem], pathname);
        });
    });
}

function findSiteIdByPath(siteData: SiteDataType, pathname: string): string | null {
    for (const [siteId, site] of Object.entries(siteData)) {
        if (siteId === 'account-menu') continue;
        if (menuContainsPath(site.menu, pathname)) {
            return siteId;
        }
    }

    return null;
}

function withCacheBust(src: string, siteId: string): string {
    const trimmed = src.trim();
    if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
        return trimmed;
    }

    try {
        const url = new URL(trimmed, window.location.origin);
        url.searchParams.set('favicon_site', siteId);
        url.searchParams.set('favicon_v', String(Date.now()));
        return url.toString();
    } catch {
        return trimmed;
    }
}

function inferIconType(href: string): string | null {
    let normalized = href.split('?')[0] ?? '';

    try {
        normalized = decodeURIComponent(normalized);
    } catch {
        // Keep the raw path if the source URL contains a malformed escape sequence.
    }

    normalized = normalized.toLowerCase();

    if (normalized.endsWith('.ico')) return 'image/x-icon';
    if (normalized.endsWith('.png')) return 'image/png';
    if (normalized.endsWith('.svg')) return 'image/svg+xml';
    if (normalized.endsWith('.webp')) return 'image/webp';
    if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg';

    return null;
}

function appendIconLink(rel: string, href: string) {
    const link = document.createElement('link');
    link.rel = rel;
    link.href = href;
    link.setAttribute('data-dynamic-favicon', 'true');

    const iconType = inferIconType(href);
    if (iconType) {
        link.type = iconType;
    }

    document.head.appendChild(link);
}

function removeDynamicIconLinks() {
    document.querySelectorAll(DYNAMIC_ICON_LINK_SELECTOR).forEach((node) => node.remove());
}

function syncExistingIconLinks(href: string): number {
    const iconType = inferIconType(href);
    let syncedCount = 0;

    document.querySelectorAll(ICON_LINK_SELECTOR).forEach((node) => {
        if (!(node instanceof HTMLLinkElement) || node.dataset.dynamicFavicon === 'true') {
            return;
        }

        node.href = href;
        syncedCount += 1;

        if (iconType) {
            node.type = iconType;
            return;
        }

        node.removeAttribute('type');
    });

    return syncedCount;
}

function resolveSiteFavicon(
    envFavicons: Record<string, string> | undefined,
    siteId: string,
): string | undefined {
    const directFavicon = envFavicons?.[siteId]?.trim();
    if (directFavicon) {
        return directFavicon;
    }

    for (const alias of SITE_ID_ALIASES[siteId] ?? []) {
        const aliasFavicon = envFavicons?.[alias]?.trim();
        if (aliasFavicon) {
            return aliasFavicon;
        }
    }

    return DEFAULT_SITE_FAVICONS[siteId];
}

export default function DynamicFavicon() {
    const { settings } = useSystem();
    const { currentSite, siteData } = useMenuContext();
    const pathname = usePathname();

    useEffect(() => {
        const pathnameSite = findSiteIdByPath(siteData, pathname || '/');
        const faviconSite = pathnameSite || currentSite;
        const currentFavicon =
            resolveSiteFavicon(settings.envFavicons, faviconSite) ||
            settings.faviconUrl ||
            DEFAULT_FAVICON;
        const href = withCacheBust(currentFavicon, faviconSite);

        removeDynamicIconLinks();
        const syncedIconCount = syncExistingIconLinks(href);

        if (syncedIconCount === 0) {
            appendIconLink('icon', href);
            appendIconLink('shortcut icon', href);
        }

        return removeDynamicIconLinks;
    }, [currentSite, pathname, settings.envFavicons, settings.faviconUrl, siteData]);

    return null;
}
