const products = '/images/corp/products';

export const YOUTUBE_SHORT = {
  title: '오리 감독의 첫 촬영',
  description: '슬레이트를 든 그뚠이와 빨간 녹화 버튼을 노리는 고무오리. 오늘 촬영장의 감독은 누구일까요?',
  src: '/videos/corp/youtube-duck-director.mp4',
  poster: '/videos/corp/youtube-duck-director.webp',
  captions: '/videos/corp/youtube-duck-director.vtt',
  durationMs: 20_000,
} as const;

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
  webtoon: '/images/corp/founder-story/episode-1.webp',
  productFilmPoster: '/videos/corp/product-story-youtube.jpg',
} as const;
