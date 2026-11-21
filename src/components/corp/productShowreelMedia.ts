const products = '/images/corp/products';

export const SHOWREEL_MEDIA = {
  screens: {
    desktop: `${products}/global/desktop-workspace.svg`,
    mobile: `${products}/global/mobile-workspace.svg`,
  },
  mascots: {
    work: `${products}/global/ddunddun-work.webp`,
    point: `${products}/global/ddunddun-point.webp`,
    success: `${products}/global/ddunddun-success.webp`,
  },
  automation: {
    pc: `${products}/automation/geudduni-pc.webp`,
    phone: `${products}/automation/geudduni-phone.webp`,
    voice: `${products}/automation/geudduni-voice.webp`,
  },
  commerce: {
    lamp: `${products}/commerce/geudduni-lamp.webp`,
    headphones: `${products}/commerce/geudduni-headphones.webp`,
    camera: `${products}/commerce/geudduni-camera.webp`,
    clock: `${products}/commerce/geudduni-clock.webp`,
  },
  webtoon: '/images/corp/founder-story/episode-1.webp',
  productFilmPoster: '/videos/corp/product-story-youtube.jpg',
} as const;
