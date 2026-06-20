export type ImageStylePresetPreviewPattern =
    | 'base'
    | 'clean'
    | 'photo'
    | 'illustration'
    | 'minimal'
    | 'board'
    | 'product'
    | 'cinematic'
    | 'luxury'
    | 'isometric'
    | 'watercolor'
    | 'retro'
    | 'pixel'
    | 'anime'
    | 'line';

export type ImageStylePreset = {
    value: string;
    label: string;
    description: string;
    instruction: string;
    preview: {
        background: string;
        foreground: string;
        accent: string;
        pattern: ImageStylePresetPreviewPattern;
    };
};

export const IMAGE_STYLE_PRESETS = [
    {
        value: 'none',
        label: '기본',
        description: '프롬프트 중심',
        instruction: '',
        preview: {
            background: 'linear-gradient(135deg, #161b22 0%, #232a35 100%)',
            foreground: '#94a3b8',
            accent: '#10b981',
            pattern: 'base',
        },
    },
    {
        value: 'clean',
        label: '클린 UI',
        description: '선명한 여백과 정돈된 그래픽',
        instruction:
            'Style: clean modern digital design, precise spacing, crisp edges, refined UI-like composition, fresh neutral surfaces with subtle emerald accents, polished commercial quality, no random readable text.',
        preview: {
            background: 'linear-gradient(135deg, #f8fafc 0%, #dbeafe 100%)',
            foreground: '#0f172a',
            accent: '#10b981',
            pattern: 'clean',
        },
    },
    {
        value: 'realistic',
        label: '실사',
        description: '자연광과 실제 질감',
        instruction:
            'Style: photorealistic editorial image, natural lighting, believable lens perspective, detailed real-world materials, subtle depth of field, premium photography finish, no artificial plastic look.',
        preview: {
            background: 'linear-gradient(135deg, #334155 0%, #0f172a 58%, #f59e0b 100%)',
            foreground: '#f8fafc',
            accent: '#f59e0b',
            pattern: 'photo',
        },
    },
    {
        value: 'illustration',
        label: '브랜드 일러스트',
        description: '부드러운 형태와 명확한 색면',
        instruction:
            'Style: polished brand illustration, expressive vector shapes, clean silhouettes, balanced color blocking, friendly editorial composition, smooth gradients, no clutter.',
        preview: {
            background: 'linear-gradient(135deg, #fdf2f8 0%, #fde68a 52%, #99f6e4 100%)',
            foreground: '#831843',
            accent: '#06b6d4',
            pattern: 'illustration',
        },
    },
    {
        value: 'minimal',
        label: '미니멀',
        description: '적은 요소와 강한 초점',
        instruction:
            'Style: minimal composition, generous negative space, restrained color palette, one clear focal subject, quiet premium atmosphere, precise geometry, no decorative noise.',
        preview: {
            background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
            foreground: '#111827',
            accent: '#64748b',
            pattern: 'minimal',
        },
    },
    {
        value: 'project-board',
        label: '보드용',
        description: '업무 보드와 대시보드 무드',
        instruction:
            'Style: polished Korean corporate project board image, exact 16:9 detail-body hero composition, fills the whole frame edge-to-edge with no letterboxing or padding, premium operations dashboard mood, clean composition, realistic business workspace details, no readable text.',
        preview: {
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #0f766e 100%)',
            foreground: '#e2e8f0',
            accent: '#10b981',
            pattern: 'board',
        },
    },
    {
        value: 'product-shot',
        label: '제품 광고컷',
        description: '스튜디오 조명과 반사광',
        instruction:
            'Style: premium product advertising shot, controlled studio lighting, elegant reflections, clean backdrop, sharp material detail, centered commercial composition, high-end catalog finish.',
        preview: {
            background: 'linear-gradient(135deg, #111827 0%, #374151 52%, #f8fafc 100%)',
            foreground: '#f8fafc',
            accent: '#22d3ee',
            pattern: 'product',
        },
    },
    {
        value: 'cinematic',
        label: '시네마틱',
        description: '영화적 조명과 깊이감',
        instruction:
            'Style: cinematic frame, dramatic key lighting, atmospheric depth, strong foreground-background separation, film-grade color grading, immersive scene composition.',
        preview: {
            background: 'linear-gradient(135deg, #111827 0%, #7c2d12 58%, #fbbf24 100%)',
            foreground: '#fff7ed',
            accent: '#fb923c',
            pattern: 'cinematic',
        },
    },
    {
        value: 'luxury',
        label: '럭셔리',
        description: '매거진 톤의 고급 소재감',
        instruction:
            'Style: luxury magazine visual, refined materials, elegant contrast, controlled highlights, premium fashion or hospitality mood, sophisticated composition, restrained opulence.',
        preview: {
            background: 'linear-gradient(135deg, #020617 0%, #3f3f46 54%, #d4af37 100%)',
            foreground: '#f8fafc',
            accent: '#d4af37',
            pattern: 'luxury',
        },
    },
    {
        value: 'isometric',
        label: '아이소메트릭 3D',
        description: '입체 오브젝트와 균형 잡힌 각도',
        instruction:
            'Style: isometric 3D illustration, precise geometric objects, soft shadows, clean material shading, organized scene layout, playful but professional spatial depth.',
        preview: {
            background: 'linear-gradient(135deg, #ecfeff 0%, #dbeafe 52%, #e0e7ff 100%)',
            foreground: '#1e40af',
            accent: '#f97316',
            pattern: 'isometric',
        },
    },
    {
        value: 'watercolor',
        label: '수채화',
        description: '번짐과 종이 질감',
        instruction:
            'Style: watercolor illustration, soft pigment blooms, visible paper texture, gentle edges, airy natural color mixing, handcrafted artistic finish.',
        preview: {
            background: 'linear-gradient(135deg, #fff7ed 0%, #bfdbfe 52%, #bbf7d0 100%)',
            foreground: '#0369a1',
            accent: '#f472b6',
            pattern: 'watercolor',
        },
    },
    {
        value: 'retro-poster',
        label: '레트로 포스터',
        description: '빈티지 인쇄감과 강한 구도',
        instruction:
            'Style: retro poster artwork, vintage print texture, bold simplified shapes, warm muted inks, subtle halftone grain, strong poster composition, avoid unreadable fake text.',
        preview: {
            background: 'linear-gradient(135deg, #fef3c7 0%, #f97316 54%, #7f1d1d 100%)',
            foreground: '#7f1d1d',
            accent: '#0f766e',
            pattern: 'retro',
        },
    },
    {
        value: 'pixel-art',
        label: '픽셀 아트',
        description: '선명한 픽셀과 제한 팔레트',
        instruction:
            'Style: crisp pixel art, visible pixel grid discipline, limited but expressive color palette, clean sprite-like silhouettes, no blur, no anti-aliased painterly edges.',
        preview: {
            background: 'linear-gradient(135deg, #172554 0%, #0f172a 48%, #22c55e 100%)',
            foreground: '#f8fafc',
            accent: '#22c55e',
            pattern: 'pixel',
        },
    },
    {
        value: 'anime',
        label: '애니메이션',
        description: '선명한 셀 채색과 배경 연출',
        instruction:
            'Style: modern anime-inspired visual, clean linework, expressive cel shading, vivid environmental lighting, dynamic but readable composition, polished background art.',
        preview: {
            background: 'linear-gradient(135deg, #e0f2fe 0%, #a7f3d0 48%, #fbcfe8 100%)',
            foreground: '#0f172a',
            accent: '#2563eb',
            pattern: 'anime',
        },
    },
    {
        value: 'line-art',
        label: '라인아트',
        description: '잉크 선과 단색 포인트',
        instruction:
            'Style: refined line art, confident ink strokes, mostly monochrome composition with one accent color, clean contour detail, elegant editorial drawing.',
        preview: {
            background: 'linear-gradient(135deg, #fafafa 0%, #e5e7eb 100%)',
            foreground: '#111827',
            accent: '#ef4444',
            pattern: 'line',
        },
    },
] as const satisfies readonly ImageStylePreset[];

export const IMAGE_STYLE_PRESET_INSTRUCTIONS: Record<string, string> = IMAGE_STYLE_PRESETS.reduce(
    (acc, preset) => {
        acc[preset.value] = preset.instruction;
        return acc;
    },
    {} as Record<string, string>,
);
