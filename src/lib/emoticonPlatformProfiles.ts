import type {
  EmoticonExportFormat,
  EmoticonOutputProfile,
} from '@/schemas/emoticonStudio';
import type {
  EmoticonProjectPlatform,
  EmoticonProjectType,
} from '@/schemas/emoticonProject';
import type { PlatformPolicyPreset } from '@/schemas/emoticonStudioV2';

export type EmoticonContractVerification = 'reference' | 'verified';

export type EmoticonFormatAlphaCapability = 'supported' | 'unsupported';

export type EmoticonFormatOutputContract = {
  extension: string;
  contentType: string;
  alphaCapability: EmoticonFormatAlphaCapability;
  transparentSourceHandling: 'preserve-alpha' | 'flatten-to-opaque';
  transparencyCoverageInspection: 'required' | 'optional' | 'not-applicable';
  loopMetadata: 'none' | 'embedded' | 'external' | 'manifest';
  expectedInspectionLoop: boolean;
  deliveryRole: 'asset' | 'animated-asset' | 'distribution-copy' | 'working-package';
  submissionCandidate: false;
};

export const EMOTICON_FORMAT_OUTPUT_CONTRACTS = {
  png: {
    extension: 'png',
    contentType: 'image/png',
    alphaCapability: 'supported',
    transparentSourceHandling: 'preserve-alpha',
    transparencyCoverageInspection: 'required',
    loopMetadata: 'none',
    expectedInspectionLoop: false,
    deliveryRole: 'asset',
    submissionCandidate: false,
  },
  apng: {
    extension: 'apng.png',
    contentType: 'image/png',
    alphaCapability: 'supported',
    transparentSourceHandling: 'preserve-alpha',
    transparencyCoverageInspection: 'required',
    loopMetadata: 'embedded',
    expectedInspectionLoop: true,
    deliveryRole: 'animated-asset',
    submissionCandidate: false,
  },
  webp: {
    extension: 'webp',
    contentType: 'image/webp',
    alphaCapability: 'supported',
    transparentSourceHandling: 'preserve-alpha',
    transparencyCoverageInspection: 'required',
    loopMetadata: 'embedded',
    expectedInspectionLoop: true,
    deliveryRole: 'animated-asset',
    submissionCandidate: false,
  },
  gif: {
    extension: 'gif',
    contentType: 'image/gif',
    alphaCapability: 'supported',
    transparentSourceHandling: 'preserve-alpha',
    transparencyCoverageInspection: 'required',
    loopMetadata: 'embedded',
    expectedInspectionLoop: true,
    deliveryRole: 'animated-asset',
    submissionCandidate: false,
  },
  mp4: {
    extension: 'mp4',
    contentType: 'video/mp4',
    alphaCapability: 'unsupported',
    transparentSourceHandling: 'flatten-to-opaque',
    transparencyCoverageInspection: 'not-applicable',
    loopMetadata: 'external',
    expectedInspectionLoop: false,
    deliveryRole: 'distribution-copy',
    submissionCandidate: false,
  },
  webm: {
    extension: 'webm',
    contentType: 'video/webm',
    alphaCapability: 'supported',
    transparentSourceHandling: 'preserve-alpha',
    transparencyCoverageInspection: 'optional',
    loopMetadata: 'external',
    expectedInspectionLoop: false,
    deliveryRole: 'distribution-copy',
    submissionCandidate: false,
  },
  png_zip: {
    extension: 'zip',
    contentType: 'application/zip',
    alphaCapability: 'supported',
    transparentSourceHandling: 'preserve-alpha',
    transparencyCoverageInspection: 'required',
    loopMetadata: 'manifest',
    expectedInspectionLoop: true,
    deliveryRole: 'working-package',
    submissionCandidate: false,
  },
} as const satisfies Record<EmoticonExportFormat, EmoticonFormatOutputContract>;

export type EmoticonPlatformLimit = {
  value: number | undefined;
  verification: EmoticonContractVerification;
};

export type EmoticonPlatformLimits = {
  maxFileSizeBytes: EmoticonPlatformLimit;
  maxDurationMs: EmoticonPlatformLimit;
  maxLoopCount: EmoticonPlatformLimit;
};

export type EmoticonPlatformFormatPolicy = {
  format: EmoticonExportFormat;
  verification: EmoticonContractVerification;
  role: 'platform-reference' | 'working-output' | 'distribution-output';
  submissionCandidate: false;
};

export type EmoticonPlatformProfile = EmoticonOutputProfile & {
  recommendedItemCount: number;
  allowedFormats: EmoticonExportFormat[];
  formatPolicies: EmoticonPlatformFormatPolicy[];
  preferredFormat: EmoticonExportFormat;
  minFrameCount: number;
  maxFrameCount: number;
  transparencyRequired: boolean;
  submissionCandidate: false;
  constraintVerification: {
    canvas: EmoticonContractVerification;
    minFrameCount: EmoticonContractVerification;
    maxFrameCount: EmoticonContractVerification;
    recommendedItemCount: EmoticonContractVerification;
  };
  platformLimits: EmoticonPlatformLimits;
  defaultLoopCount?: number;
  policyNotice: string;
};

export type EmoticonPlatformOutputProfile = EmoticonOutputProfile & {
  allowedFormats: EmoticonExportFormat[];
  minFrameCount: number;
  maxFrameCount: number;
  maxFileSizeBytes?: number;
  maxDurationMs?: number;
  loopCount?: number;
  formatCapabilities: Partial<Record<EmoticonExportFormat, {
    alpha: EmoticonFormatAlphaCapability;
  }>>;
  submissionCandidate: false;
};

export type EditableEmoticonPolicyPlatform = PlatformPolicyPreset['platform'];

export const EMOTICON_EDITABLE_POLICY_TARGETS = [
  { platform: 'kakao', type: 'static' },
  { platform: 'kakao', type: 'animated' },
  { platform: 'line', type: 'static' },
  { platform: 'line', type: 'animated' },
  { platform: 'custom', type: 'static' },
  { platform: 'custom', type: 'animated' },
] as const satisfies ReadonlyArray<{
  platform: EditableEmoticonPolicyPlatform;
  type: EmoticonProjectType;
}>;

const KAKAO_GUIDE_URL = 'https://emoticonstudio.kakao.com/webp-animator';
export const KAKAO_POLICY_URL = 'https://emoticonstudio.kakao.com/guideline';
const LINE_STATIC_GUIDE_URL = 'https://creator.line.me/en/guideline/sticker/';
const LINE_ANIMATED_GUIDE_URL = 'https://creator.line.me/en/guideline/animationsticker/';
const PROFILE_CHECKED_AT = '2026-08-05T00:00:00.000Z';

const REFERENCE_NOTICE = '참고 규격입니다. 내보내기 전 해당 플랫폼의 최신 공식 가이드를 확인하세요.';
export const KAKAO_AI_POLICY_NOTICE = '카카오 운영 정책은 현재 생성형 AI로 제작한 이모티콘 제안을 제한합니다. 이 도구의 결과는 개인 제작·검토용이며 제출 가능성을 보장하지 않습니다.';

function unknownPlatformLimits(): EmoticonPlatformLimits {
  return {
    maxFileSizeBytes: { value: undefined, verification: 'reference' },
    maxDurationMs: { value: undefined, verification: 'reference' },
    maxLoopCount: { value: undefined, verification: 'reference' },
  };
}

function formatPolicy(
  format: EmoticonExportFormat,
  verification: EmoticonContractVerification,
  role: EmoticonPlatformFormatPolicy['role'],
): EmoticonPlatformFormatPolicy {
  return { format, verification, role, submissionCandidate: false };
}

const PROFILES: Record<EmoticonProjectPlatform, Record<EmoticonProjectType, EmoticonPlatformProfile>> = {
  kakao: {
    animated: {
      platform: 'kakao',
      type: 'animated',
      width: 360,
      height: 360,
      profileVersion: 'kakao-standard-animated-webp-2026-08-01',
      verification: 'verified',
      sourceUrl: KAKAO_GUIDE_URL,
      checkedAt: PROFILE_CHECKED_AT,
      recommendedItemCount: 24,
      allowedFormats: ['webp', 'png_zip'],
      formatPolicies: [
        formatPolicy('webp', 'verified', 'platform-reference'),
        formatPolicy('png_zip', 'reference', 'working-output'),
      ],
      preferredFormat: 'webp',
      minFrameCount: 2,
      maxFrameCount: 24,
      transparencyRequired: true,
      submissionCandidate: false,
      constraintVerification: {
        canvas: 'verified',
        minFrameCount: 'reference',
        maxFrameCount: 'verified',
        recommendedItemCount: 'reference',
      },
      platformLimits: unknownPlatformLimits(),
      policyNotice: KAKAO_AI_POLICY_NOTICE,
    },
    static: {
      platform: 'kakao',
      type: 'static',
      width: 360,
      height: 360,
      profileVersion: 'kakao-static-reference-2026-08-01',
      verification: 'reference',
      sourceUrl: KAKAO_POLICY_URL,
      checkedAt: PROFILE_CHECKED_AT,
      recommendedItemCount: 32,
      allowedFormats: ['png'],
      formatPolicies: [formatPolicy('png', 'reference', 'platform-reference')],
      preferredFormat: 'png',
      minFrameCount: 1,
      maxFrameCount: 1,
      transparencyRequired: true,
      submissionCandidate: false,
      constraintVerification: {
        canvas: 'reference',
        minFrameCount: 'reference',
        maxFrameCount: 'reference',
        recommendedItemCount: 'reference',
      },
      platformLimits: unknownPlatformLimits(),
      policyNotice: KAKAO_AI_POLICY_NOTICE,
    },
  },
  line: {
    animated: {
      platform: 'line',
      type: 'animated',
      width: 320,
      height: 270,
      profileVersion: 'line-animated-apng-2026-08-05',
      verification: 'verified',
      sourceUrl: LINE_ANIMATED_GUIDE_URL,
      checkedAt: PROFILE_CHECKED_AT,
      recommendedItemCount: 8,
      allowedFormats: ['apng', 'gif', 'webp', 'png_zip'],
      formatPolicies: [
        formatPolicy('apng', 'verified', 'platform-reference'),
        formatPolicy('gif', 'reference', 'distribution-output'),
        formatPolicy('webp', 'reference', 'distribution-output'),
        formatPolicy('png_zip', 'reference', 'working-output'),
      ],
      preferredFormat: 'apng',
      minFrameCount: 5,
      maxFrameCount: 20,
      transparencyRequired: true,
      submissionCandidate: false,
      constraintVerification: {
        canvas: 'verified',
        minFrameCount: 'verified',
        maxFrameCount: 'verified',
        recommendedItemCount: 'verified',
      },
      platformLimits: {
        maxFileSizeBytes: { value: 1024 * 1024, verification: 'verified' },
        maxDurationMs: { value: 4_000, verification: 'verified' },
        maxLoopCount: { value: 4, verification: 'verified' },
      },
      defaultLoopCount: 1,
      policyNotice: 'LINE 움직이는 스티커 제출 형식은 APNG(.png)입니다. 첫 프레임은 스토어의 대표 정지 이미지로도 사용되며 기술 검사는 심사 승인을 보장하지 않습니다.',
    },
    static: {
      platform: 'line',
      type: 'static',
      width: 370,
      height: 320,
      profileVersion: 'line-static-png-2026-08-05',
      verification: 'verified',
      sourceUrl: LINE_STATIC_GUIDE_URL,
      checkedAt: PROFILE_CHECKED_AT,
      recommendedItemCount: 8,
      allowedFormats: ['png'],
      formatPolicies: [formatPolicy('png', 'verified', 'platform-reference')],
      preferredFormat: 'png',
      minFrameCount: 1,
      maxFrameCount: 1,
      transparencyRequired: true,
      submissionCandidate: false,
      constraintVerification: {
        canvas: 'verified',
        minFrameCount: 'verified',
        maxFrameCount: 'verified',
        recommendedItemCount: 'verified',
      },
      platformLimits: {
        maxFileSizeBytes: { value: 1024 * 1024, verification: 'verified' },
        maxDurationMs: { value: undefined, verification: 'verified' },
        maxLoopCount: { value: undefined, verification: 'verified' },
      },
      policyNotice: 'LINE 정지 스티커는 투명 PNG로 내보냅니다. 기술 검사는 심사 승인이나 권리 검토를 대신하지 않습니다.',
    },
  },
  telegram: {
    animated: referenceProfile('telegram', 'animated', 512, 512, 16, ['webm', 'webp', 'png_zip']),
    static: referenceProfile('telegram', 'static', 512, 512, 16, ['png']),
  },
  sns: {
    animated: referenceProfile('sns', 'animated', 512, 512, 8, ['webp', 'gif', 'mp4', 'webm', 'png_zip']),
    static: referenceProfile('sns', 'static', 512, 512, 8, ['png']),
  },
  custom: {
    animated: referenceProfile('custom', 'animated', 512, 512, 8, ['webp', 'gif', 'mp4', 'webm', 'png_zip']),
    static: referenceProfile('custom', 'static', 512, 512, 8, ['png']),
  },
};

function referenceProfile(
  platform: EmoticonProjectPlatform,
  type: EmoticonProjectType,
  width: number,
  height: number,
  recommendedItemCount: number,
  allowedFormats: EmoticonExportFormat[],
): EmoticonPlatformProfile {
  const preferredFormat = allowedFormats[0];
  return {
    platform,
    type,
    width,
    height,
    profileVersion: `${platform}-${type}-reference-v2`,
    verification: 'reference',
    recommendedItemCount,
    allowedFormats,
    formatPolicies: allowedFormats.map((format) => formatPolicy(
      format,
      'reference',
      EMOTICON_FORMAT_OUTPUT_CONTRACTS[format].deliveryRole === 'distribution-copy'
        ? 'distribution-output'
        : 'working-output',
    )),
    preferredFormat,
    minFrameCount: type === 'static' ? 1 : 2,
    maxFrameCount: type === 'static' ? 1 : 24,
    transparencyRequired: true,
    submissionCandidate: false,
    constraintVerification: {
      canvas: 'reference',
      minFrameCount: 'reference',
      maxFrameCount: 'reference',
      recommendedItemCount: 'reference',
    },
    platformLimits: unknownPlatformLimits(),
    policyNotice: REFERENCE_NOTICE,
  };
}

export function getEmoticonFormatOutputContract(
  format: EmoticonExportFormat,
): EmoticonFormatOutputContract {
  return { ...EMOTICON_FORMAT_OUTPUT_CONTRACTS[format] };
}

export function getEmoticonPlatformProfile(
  platform: EmoticonProjectPlatform,
  type: EmoticonProjectType,
): EmoticonPlatformProfile {
  const profile = PROFILES[platform][type];
  return {
    ...profile,
    allowedFormats: [...profile.allowedFormats],
    formatPolicies: profile.formatPolicies.map((policy) => ({ ...policy })),
    constraintVerification: { ...profile.constraintVerification },
    platformLimits: {
      maxFileSizeBytes: { ...profile.platformLimits.maxFileSizeBytes },
      maxDurationMs: { ...profile.platformLimits.maxDurationMs },
      maxLoopCount: { ...profile.platformLimits.maxLoopCount },
    },
  };
}

export function getFallbackEmoticonPlatformPolicyPreset(
  platform: EditableEmoticonPolicyPlatform,
  type: EmoticonProjectType,
): PlatformPolicyPreset {
  const profile = getEmoticonPlatformProfile(platform, type);
  return {
    schemaVersion: 1,
    id: `${platform}-${type}`,
    platform,
    type,
    revision: 0,
    enabled: true,
    updatedBy: 'fallback',
    profile: {
      platform,
      type,
      width: profile.width,
      height: profile.height,
      profileVersion: profile.profileVersion,
      verification: profile.verification,
      sourceUrl: profile.sourceUrl ?? null,
      checkedAt: profile.checkedAt ?? null,
      recommendedItemCount: profile.recommendedItemCount,
      allowedFormats: [...profile.allowedFormats],
      formatPolicies: profile.formatPolicies.map((policy) => ({ ...policy })),
      preferredFormat: profile.preferredFormat,
      minFrameCount: profile.minFrameCount,
      maxFrameCount: profile.maxFrameCount,
      transparencyRequired: profile.transparencyRequired,
      transparentBackground: true,
      constraintVerification: { ...profile.constraintVerification },
      platformLimits: {
        maxFileSizeBytes: {
          value: profile.platformLimits.maxFileSizeBytes.value ?? null,
          verification: profile.platformLimits.maxFileSizeBytes.verification,
        },
        maxDurationMs: {
          value: profile.platformLimits.maxDurationMs.value ?? null,
          verification: profile.platformLimits.maxDurationMs.verification,
        },
        maxLoopCount: {
          value: profile.platformLimits.maxLoopCount.value ?? null,
          verification: profile.platformLimits.maxLoopCount.verification,
        },
      },
      defaultLoopCount: profile.defaultLoopCount ?? null,
      policyNotice: profile.policyNotice,
      submissionCandidate: false,
    },
  };
}

export function getFallbackEmoticonPlatformPolicyPresets(): PlatformPolicyPreset[] {
  return EMOTICON_EDITABLE_POLICY_TARGETS.map(({ platform, type }) => (
    getFallbackEmoticonPlatformPolicyPreset(platform, type)
  ));
}

export function toEmoticonPlatformProfileFromPolicyPreset(
  preset: PlatformPolicyPreset,
): EmoticonPlatformProfile {
  const profile = preset.profile;
  return {
    platform: profile.platform,
    type: profile.type,
    width: profile.width,
    height: profile.height,
    profileVersion: profile.profileVersion,
    verification: profile.verification,
    recommendedItemCount: profile.recommendedItemCount,
    allowedFormats: [...profile.allowedFormats],
    formatPolicies: profile.formatPolicies.map((policy) => ({ ...policy })),
    preferredFormat: profile.preferredFormat,
    minFrameCount: profile.minFrameCount,
    maxFrameCount: profile.maxFrameCount,
    transparencyRequired: profile.transparencyRequired,
    submissionCandidate: false,
    constraintVerification: { ...profile.constraintVerification },
    platformLimits: {
      maxFileSizeBytes: {
        value: profile.platformLimits.maxFileSizeBytes.value ?? undefined,
        verification: profile.platformLimits.maxFileSizeBytes.verification,
      },
      maxDurationMs: {
        value: profile.platformLimits.maxDurationMs.value ?? undefined,
        verification: profile.platformLimits.maxDurationMs.verification,
      },
      maxLoopCount: {
        value: profile.platformLimits.maxLoopCount.value ?? undefined,
        verification: profile.platformLimits.maxLoopCount.verification,
      },
    },
    ...(profile.defaultLoopCount !== null ? { defaultLoopCount: profile.defaultLoopCount } : {}),
    policyNotice: profile.policyNotice,
    ...(profile.sourceUrl ? { sourceUrl: profile.sourceUrl } : {}),
    ...(profile.checkedAt ? { checkedAt: profile.checkedAt } : {}),
  };
}

export function findEmoticonPlatformProfile(
  platform: string | null | undefined,
  type: string | null | undefined,
): EmoticonPlatformProfile | null {
  if (!platform || (type !== 'static' && type !== 'animated')) return null;
  if (!Object.prototype.hasOwnProperty.call(PROFILES, platform)) return null;
  return getEmoticonPlatformProfile(
    platform as EmoticonProjectPlatform,
    type,
  );
}

export function toEmoticonOutputProfile(
  profile: EmoticonPlatformProfile,
): EmoticonPlatformOutputProfile {
  const formatCapabilities = Object.fromEntries(profile.allowedFormats.map((format) => [
    format,
    { alpha: EMOTICON_FORMAT_OUTPUT_CONTRACTS[format].alphaCapability },
  ])) as EmoticonPlatformOutputProfile['formatCapabilities'];
  return {
    platform: profile.platform,
    type: profile.type,
    width: profile.width,
    height: profile.height,
    profileVersion: profile.profileVersion,
    verification: profile.verification,
    allowedFormats: [...profile.allowedFormats],
    minFrameCount: profile.minFrameCount,
    maxFrameCount: profile.maxFrameCount,
    ...(profile.platformLimits.maxFileSizeBytes.value !== undefined
      ? { maxFileSizeBytes: profile.platformLimits.maxFileSizeBytes.value }
      : {}),
    ...(profile.platformLimits.maxDurationMs.value !== undefined
      ? { maxDurationMs: profile.platformLimits.maxDurationMs.value }
      : {}),
    ...(profile.defaultLoopCount !== undefined
      ? { loopCount: profile.defaultLoopCount }
      : {}),
    formatCapabilities,
    submissionCandidate: false,
    ...(profile.sourceUrl ? { sourceUrl: profile.sourceUrl } : {}),
    ...(profile.checkedAt ? { checkedAt: profile.checkedAt } : {}),
  };
}
