'use client';

import { useEffect } from 'react';

const stylesheets = [
  {
    id: 'fontawesome-cdn',
    href: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  },
  {
    id: 'pretendard-cdn',
    href: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css',
    crossOrigin: 'anonymous',
  },
];

export default function ExternalStylesheets() {
  useEffect(() => {
    for (const stylesheet of stylesheets) {
      if (document.getElementById(stylesheet.id)) continue;

      const link = document.createElement('link');
      link.id = stylesheet.id;
      link.rel = 'stylesheet';
      link.href = stylesheet.href;

      if (stylesheet.crossOrigin) {
        link.crossOrigin = stylesheet.crossOrigin;
      }

      document.head.appendChild(link);
    }
  }, []);

  return null;
}
