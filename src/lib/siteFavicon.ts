import { BRAND_ASSET_VERSION, DEFAULT_BRAND_FAVICON } from '@/constants/brandAssets';

const SITE_ALIASES: Record<string, string[]> = { shop: ['propig'], propig: ['shop'] };
// A decodable, neutral terminal fallback, even if hosting's default icon is unavailable.
const EMPTY_ICON = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="32" height="32"/%3E';
const ICON_REL = /(?:^|\s)icon(?:\s|$)/i;

export interface SiteFaviconOptions {
    siteId: string;
    envFavicons?: Record<string, string>;
    faviconUrl?: string;
    version?: number;
}

export function faviconHref(src: string | undefined, origin: string, siteId: string, version?: number): string {
    const original = src?.trim() ?? '';
    if (!original) return '';
    try {
        const url = new URL(original, origin);
        if (!['http:', 'https:', 'data:', 'blob:'].includes(url.protocol)) return '';
        // Signed storage URLs must retain their exact query, ordering and escaping.
        if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) return original;
        url.searchParams.set('favicon_site', siteId);
        url.searchParams.set('favicon_v', `${BRAND_ASSET_VERSION}-${version ?? 'current'}`);
        return url.href;
    } catch {
        return '';
    }
}

function canDecodeIcon(href: string, signal: AbortSignal): Promise<boolean> {
    return new Promise((resolve) => {
        const image = new Image();
        let settled = false;
        const finish = (ok: boolean) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            signal.removeEventListener('abort', abort);
            image.onload = null;
            image.onerror = null;
            image.removeAttribute('src');
            resolve(ok);
        };
        const abort = () => finish(false);
        const timer = window.setTimeout(() => finish(false), 5000);
        image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0);
        image.onerror = () => finish(false);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
        else image.src = href;
    });
}

/** Own tab icons only; leave apple-touch-icon, manifest and React-owned nodes intact. */
export function mountSiteFavicon({ siteId, envFavicons, faviconUrl, version }: SiteFaviconOptions): () => void {
    const abortController = new AbortController();
    const suppressed = new Map<HTMLLinkElement, string>();
    const link = document.createElement('link');
    link.dataset.dynamicFavicon = 'true';
    let activeHref = faviconHref(DEFAULT_BRAND_FAVICON, window.location.origin, siteId, version);

    const reconcile = () => {
        // Neutralize instead of deleting metadata nodes: Next/React may still own them.
        document.querySelectorAll<HTMLLinkElement>('link[rel]').forEach((other) => {
            if (other === link || !ICON_REL.test(other.rel)) return;
            suppressed.set(other, other.rel);
            other.removeAttribute('rel');
        });
        if (link.getAttribute('rel') !== 'icon') link.setAttribute('rel', 'icon');
        if (link.getAttribute('href') !== activeHref) link.setAttribute('href', activeHref);
        // No stale type/sizes/media hints that might exclude a newly selected image.
        for (const attribute of ['type', 'sizes', 'media']) {
            if (link.hasAttribute(attribute)) link.removeAttribute(attribute);
        }
        if (link.parentNode !== document.head) document.head.appendChild(link);
    };
    // Immediately replace the previous mode, before any asynchronous image validation.
    reconcile();
    const observer = new MutationObserver((mutations) => {
        // Body content changes are common; only metadata mutations need a document scan.
        const affectsIcons = mutations.some((mutation) => {
            if (mutation.type === 'attributes') return mutation.target instanceof HTMLLinkElement;
            return [...mutation.addedNodes, ...mutation.removedNodes].some((node) =>
                node instanceof Element && (node.matches('link') || !!node.querySelector('link')),
            );
        });
        if (affectsIcons || !link.isConnected) reconcile();
    });
    observer.observe(document.documentElement, {
        childList: true, subtree: true, attributes: true,
        attributeFilter: ['rel', 'href', 'type', 'sizes', 'media'],
    });

    const candidates = [
        envFavicons?.[siteId],
        ...(SITE_ALIASES[siteId] ?? []).map((alias) => envFavicons?.[alias]),
        faviconUrl,
        DEFAULT_BRAND_FAVICON,
    ].map((src) => faviconHref(src, window.location.origin, siteId, version)).filter(Boolean);

    void (async () => {
        for (const href of new Set(candidates)) {
            const valid = await canDecodeIcon(href, abortController.signal);
            if (abortController.signal.aborted) return;
            if (!valid) continue;
            activeHref = href;
            reconcile();
            return;
        }
        if (!abortController.signal.aborted) {
            activeHref = EMPTY_ICON;
            reconcile();
        }
    })();

    return () => {
        abortController.abort();
        observer.disconnect();
        link.remove();
        for (const [other, rel] of suppressed) {
            // Do not overwrite a newer non-icon relationship assigned by the framework.
            if (other.isConnected && !other.hasAttribute('rel')) other.setAttribute('rel', rel);
        }
        suppressed.clear();
    };
}
