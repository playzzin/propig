'use client';

import { useEffect } from 'react';
import { useSystem } from '@/contexts/SystemContext';
import { useMenuContext } from '@/contexts/MenuContext';
import { mountSiteFavicon } from '@/lib/siteFavicon';

export default function DynamicFavicon() {
    const { settings } = useSystem();
    const { currentSite } = useMenuContext();

    useEffect(() => mountSiteFavicon({
        siteId: currentSite,
        envFavicons: settings.envFavicons,
        faviconUrl: settings.faviconUrl,
        version: settings.brandAssetsVersion,
    }), [currentSite, settings.brandAssetsVersion, settings.envFavicons, settings.faviconUrl]);

    return null;
}
