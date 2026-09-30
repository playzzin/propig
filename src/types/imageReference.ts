export const IMAGE_REFERENCE_ROLES = ['building', 'product', 'character', 'background', 'style'] as const;

export type ImageReferenceRole = (typeof IMAGE_REFERENCE_ROLES)[number];

export type ImageReferenceInput = {
    image: string;
    role: ImageReferenceRole;
};

export type ImageReferenceAsset = ImageReferenceInput & {
    id: string;
    name: string;
    storagePath?: string | null;
    createdAt?: number;
};

export type ImageReferenceDraft = Omit<ImageReferenceAsset, 'id'>;

export const IMAGE_REFERENCE_ROLE_LABELS: Record<ImageReferenceRole, string> = {
    building: '건물 · 공간',
    product: '제품 · 오브젝트',
    character: '캐릭터 · 인물',
    background: '배경 · 장면',
    style: '스타일 · 분위기',
};

export const MAX_IMAGE_REFERENCE_ASSETS = 4;
export const MAX_IMAGE_REFERENCE_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGE_REFERENCE_REQUESTS = 5;

export const SUPPORTED_REFERENCE_IMAGE_MIME_TYPES = [
    'image/avif',
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/webp',
] as const;
