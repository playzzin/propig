import type {
  EmoticonBubbleFont,
  EmoticonExportFormat,
  EmoticonMotionPreference,
} from '@/schemas/emoticonStudio';
import type {
  EmoticonProjectPlatform,
  EmoticonProjectType,
} from '@/schemas/emoticonProject';

export const FORMAT_LABELS: Record<EmoticonExportFormat, string> = {
  png: 'PNG',
  apng: 'APNG',
  webp: 'WebP',
  gif: 'GIF',
  mp4: 'MP4',
  webm: 'WebM',
  png_zip: 'PNG 묶음',
};

export const MOTION_LABELS: Record<EmoticonMotionPreference, string> = {
  auto: 'AI 자동',
  stable: '안정 우선',
  dynamic: '동작·표정 변화',
};

export const BUBBLE_FONT_LABELS: Record<EmoticonBubbleFont, string> = {
  clean: '깔끔한 고딕',
  round: '동글 굵게',
  handwriting: '손글씨',
  bold: '강조 고딕',
  serif: '명조 감성',
};

export const PLATFORM_LABELS: Record<EmoticonProjectPlatform, string> = {
  kakao: '카카오톡',
  line: 'LINE',
  telegram: 'Telegram',
  sns: 'SNS',
  custom: '사용자 지정',
};

export const PROJECT_TYPE_LABELS: Record<EmoticonProjectType, string> = {
  static: '정지형',
  animated: '움직이는 이모티콘',
};
