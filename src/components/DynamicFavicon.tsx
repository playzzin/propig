'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useSystem } from '@/contexts/SystemContext';
import { useMenuContext } from '@/contexts/MenuContext';
import type { MenuItem, SiteDataType } from '@/types/menu';
import {
    BRAND_ASSET_VERSION,
    normalizeBrandAssetUrl,
} from '@/constants/brandAssets';

const FAVICON_VERSION = BRAND_ASSET_VERSION;
const DYNAMIC_ICON_LINK_SELECTOR = 'link[data-dynamic-favicon="true"]';
const SITE_ID_ALIASES: Record<string, string[]> = {
    shop: ['propig'],
    propig: ['shop'],
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

function withStableCacheKey(src: string, siteId: string, version?: number): string {
    const trimmed = src.trim();
    if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
        return trimmed;
    }

    try {
        const url = new URL(trimmed, window.location.origin);
        url.searchParams.set('favicon_site', siteId);
        url.searchParams.set('favicon_v', `${FAVICON_VERSION}-${version ?? 'current'}`);
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

function upsertDynamicIconLink(rel: string, href: string): HTMLLinkElement {
    const matchingLinks = Array.from(document.querySelectorAll<HTMLLinkElement>(DYNAMIC_ICON_LINK_SELECTOR)).filter(
        (link) => link.rel === rel,
    );
    const link = matchingLinks[0] ?? document.createElement('link');

    link.rel = rel;
    link.setAttribute('data-dynamic-favicon', 'true');
    link.href = href;

    const iconType = inferIconType(href);
    if (iconType) {
        link.type = iconType;
    } else {
        link.removeAttribute('type');
    }

    document.head.appendChild(link);

    matchingLinks.slice(1).forEach((duplicateLink) => duplicateLink.remove());
    return link;
}

function removeStaleDynamicIconLinks(activeLinks: HTMLLinkElement[]) {
    const activeLinkSet = new Set(activeLinks);
    document.querySelectorAll(DYNAMIC_ICON_LINK_SELECTOR).forEach((node) => {
        if (!activeLinkSet.has(node as HTMLLinkElement)) {
            node.remove();
        }
    });
}

function removeIconLinks() {
    document.querySelectorAll(DYNAMIC_ICON_LINK_SELECTOR).forEach((node) => {
        node.remove();
    });
}

function applyFaviconHref(href: string): HTMLLinkElement[] {
    const activeLinks = [upsertDynamicIconLink('icon', href), upsertDynamicIconLink('shortcut icon', href)];
    removeStaleDynamicIconLinks(activeLinks);
    return activeLinks;
}

function resolveSiteFavicon(
    envFavicons: Record<string, string> | undefined,
    siteId: string,
): string | undefined {
    const directFavicon = normalizeBrandAssetUrl(envFavicons?.[siteId]);
    if (directFavicon) {
        return directFavicon;
    }

    for (const alias of SITE_ID_ALIASES[siteId] ?? []) {
        const aliasFavicon = normalizeBrandAssetUrl(envFavicons?.[alias]);
        if (aliasFavicon) {
            return aliasFavicon;
        }
    }

    return undefined;
}

function canDecodeIcon(href: string): Promise<boolean> {
    if (!href) return Promise.resolve(false);
    if (href.startsWith('data:') || href.startsWith('blob:')) return Promise.resolve(true);

    return new Promise((resolve) => {
        const image = new Image();
        let resolved = false;
        const timeout = window.setTimeout(() => finish(false), 5000);

        const finish = (isDecodable: boolean) => {
            if (resolved) return;
            resolved = true;
            window.clearTimeout(timeout);
            resolve(isDecodable);
        };

        image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0);
        image.onerror = () => finish(false);
        image.src = href;
    });
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
            normalizeBrandAssetUrl(settings.faviconUrl);
        let cancelled = false;

        if (!currentFavicon) {
            removeIconLinks();
            return () => {
                cancelled = true;
            };
        }

        const requestedHref = withStableCacheKey(currentFavicon, faviconSite, settings.brandAssetsVersion);
        applyFaviconHref(requestedHref);

        canDecodeIcon(requestedHref).then((isDecodable) => {
            if (cancelled) return;
            if (!isDecodable) {
                removeIconLinks();
            }
        });

        return () => {
            cancelled = true;
        };
    }, [currentSite, pathname, settings.brandAssetsVersion, settings.envFavicons, settings.faviconUrl, siteData]);

    return null;
}
