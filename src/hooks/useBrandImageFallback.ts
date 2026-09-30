'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { normalizeBrandAssetUrl } from '@/constants/brandAssets';

function canDecodeImageSource(src: string): Promise<boolean> {
  if (!src) return Promise.resolve(false);
  if (src.startsWith('data:') || src.startsWith('blob:')) return Promise.resolve(true);

  return new Promise((resolve) => {
    const image = new Image();
    let resolved = false;
    const timeout = window.setTimeout(() => finish(false), 3000);

    const finish = (isDecodable: boolean) => {
      if (resolved) return;
      resolved = true;
      window.clearTimeout(timeout);
      resolve(isDecodable);
    };

    image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0);
    image.onerror = () => finish(false);
    image.src = src;
  });
}

export function useBrandImageFallback(primarySrc: string | null | undefined) {
  const [brokenSources, setBrokenSources] = useState<string[]>([]);
  const normalizedPrimarySrc = normalizeBrandAssetUrl(primarySrc);
  const displaySrc = useMemo(() => {
    if (normalizedPrimarySrc && !brokenSources.includes(normalizedPrimarySrc)) {
      return normalizedPrimarySrc;
    }

    return '';
  }, [brokenSources, normalizedPrimarySrc]);
  const canRenderImage = Boolean(displaySrc);

  const markBroken = useCallback(() => {
    if (!displaySrc) return;
    setBrokenSources((currentSources) =>
      currentSources.includes(displaySrc) ? currentSources : [...currentSources, displaySrc],
    );
  }, [displaySrc]);

  useEffect(() => {
    if (
      !normalizedPrimarySrc ||
      brokenSources.includes(normalizedPrimarySrc)
    ) {
      return undefined;
    }

    let cancelled = false;

    canDecodeImageSource(normalizedPrimarySrc).then((isDecodable) => {
      if (cancelled) return;

      if (isDecodable) {
        return;
      }

      setBrokenSources((currentSources) =>
        currentSources.includes(normalizedPrimarySrc) ? currentSources : [...currentSources, normalizedPrimarySrc],
      );
    });

    return () => {
      cancelled = true;
    };
  }, [brokenSources, normalizedPrimarySrc]);

  return {
    canRenderImage,
    displaySrc,
    isUsingFallback: false,
    markBroken,
  };
}
