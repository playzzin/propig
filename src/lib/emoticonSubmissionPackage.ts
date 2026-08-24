import type JSZip from 'jszip';
import {
  EMOTICON_FORMAT_OUTPUT_CONTRACTS,
  findEmoticonPlatformProfile,
} from './emoticonPlatformProfiles.ts';

export const EMOTICON_SUBMISSION_FORMATS = ['png', 'apng', 'webp', 'gif', 'mp4', 'webm', 'png_zip'] as const;

export type EmoticonSubmissionFormat = (typeof EMOTICON_SUBMISSION_FORMATS)[number];

export type EmoticonSubmissionProjectItemInput = {
  id: string;
  order: number;
  title: string;
  jobId: string | null;
  generationStatus?: string;
  motion: {
    fps: number;
    frameCount: number;
    durationMs: number;
  };
};

export type EmoticonSubmissionProjectInput = {
  title: string;
  platform?: string;
  emoticonType: 'static' | 'animated';
  spec: {
    canvasWidth: number;
    canvasHeight: number;
    transparentBackground: boolean;
  };
  items: EmoticonSubmissionProjectItemInput[];
};

export type EmoticonSubmissionOutputInspectionInput = {
  format: EmoticonSubmissionFormat;
  fileSizeBytes: number;
  width: number | null;
  height: number | null;
  frameCount: number;
  fps: number | null;
  durationMs: number | null;
  loop: boolean | null;
  hasAlpha: boolean;
  transparencyCoverage: number | null;
  alphaBoundsEvidence?: EmoticonSubmissionAlphaBoundsEvidence | null;
  codec: string | null;
  sha256: string;
  inspectedAt: string;
  inspectorVersion: string;
  passed: boolean;
  issues: string[];
};

export type EmoticonSubmissionAlphaBoundsFrameEvidence = {
  frameIndex: number;
  visiblePixelCount: number;
  bounds: { left: number; top: number; right: number; bottom: number } | null;
  transparentMargins: { left: number; top: number; right: number; bottom: number } | null;
  minimumTransparentMarginPx: number | null;
  touchesCanvasEdge: boolean;
  hasUsableTransparentMargin: boolean;
};

export type EmoticonSubmissionAlphaBoundsEvidence = {
  alphaThreshold: number;
  requiredTransparentMarginPx: number;
  checkedFrameCount: number;
  allFramesHaveVisibleContent: boolean;
  allFramesHaveUsableTransparentMargin: boolean;
  edgeTouchFrameIndices: number[];
  insufficientMarginFrameIndices: number[];
  frames: EmoticonSubmissionAlphaBoundsFrameEvidence[];
};

export type EmoticonSubmissionPlatformFormatPolicy = {
  role: 'platform-reference' | 'working-output' | 'distribution-output';
  verification: 'verified' | 'reference';
  submissionCandidate: false;
};

export type EmoticonSubmissionOutputInput = {
  format: string;
  url: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  inspection: EmoticonSubmissionOutputInspectionInput;
};

export type EmoticonSubmissionJobInput = {
  id?: string;
  status: string;
  outputs?: Partial<Record<EmoticonSubmissionFormat, EmoticonSubmissionOutputInput>>;
};

export type EmoticonSubmissionManifestFile = {
  path: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
};

export type EmoticonSubmissionManifestItem = {
  order: number;
  title: string;
  format: EmoticonSubmissionFormat;
  files: EmoticonSubmissionManifestFile[];
};

export type EmoticonSubmissionManifest = {
  schemaVersion: '1.0';
  kind: 'emoticon-submission-package';
  createdAt: string;
  submissionCandidate: false;
  manualReviewRequired: true;
  project: {
    title: string;
    platform: string | null;
    emoticonType: string | null;
  };
  preferredFormat: EmoticonSubmissionFormat;
  formatContract: {
    alphaCapability: 'supported' | 'unsupported';
    transparentSourceHandling: 'preserve-alpha' | 'flatten-to-opaque';
    deliveryRole: 'asset' | 'animated-asset' | 'distribution-copy' | 'working-package';
    submissionCandidate: false;
  };
  platformFormatPolicy: EmoticonSubmissionPlatformFormatPolicy | null;
  itemCount: number;
  assetCount: number;
  totalAssetBytes: number;
  items: EmoticonSubmissionManifestItem[];
};

export type EmoticonSubmissionAuditItem = {
  order: number;
  title: string;
  status: 'passed';
  sourceOutputBytes: number;
  packagedFileCount: number;
  inspection: EmoticonSubmissionOutputInspectionInput;
  checks: Array<{
    code:
      | 'job-completed'
      | 'output-present'
      | 'format-match'
      | 'format-capability'
      | 'server-inspection'
      | 'download-verified'
      | 'archive-flattened';
    pass: true;
  }>;
};

export type EmoticonSubmissionAuditReport = {
  schemaVersion: '1.0';
  kind: 'emoticon-submission-audit';
  createdAt: string;
  status: 'passed';
  submissionCandidate: false;
  preferredFormat: EmoticonSubmissionFormat;
  manualReviewRequired: true;
  platformFormatPolicy: EmoticonSubmissionPlatformFormatPolicy | null;
  summary: {
    expectedItems: number;
    packagedItems: number;
    packagedAssets: number;
    missingItems: 0;
    nestedArchives: 0;
    privacySafeMetadata: true;
  };
  items: EmoticonSubmissionAuditItem[];
  notes: string[];
};

export type BuildEmoticonSubmissionPackageInput = {
  project: EmoticonSubmissionProjectInput;
  preferredFormat: EmoticonSubmissionFormat;
  resolveJob: (
    item: EmoticonSubmissionProjectItemInput,
  ) => Promise<EmoticonSubmissionJobInput | null | undefined>;
  fetchImpl?: typeof fetch;
  createdAt?: string;
};

/**
 * Builds the exact selected-item view used by a selection ZIP. Callers must
 * pass a freshly fetched server project; missing, removed, or no-longer-
 * completed items intentionally abort instead of being silently omitted.
 */
export function filterCompletedEmoticonSubmissionProject(
  project: EmoticonSubmissionProjectInput,
  selectedItemIds: readonly string[],
): EmoticonSubmissionProjectInput {
  const uniqueIds = Array.from(new Set(selectedItemIds.filter((itemId) => itemId.trim())));
  if (!uniqueIds.length) {
    throw new EmoticonSubmissionPackageError(
      'INVALID_REQUEST',
      'ZIP에 포함할 완료 항목을 하나 이상 선택해 주세요.',
    );
  }

  const selectedIdSet = new Set(uniqueIds);
  const selectedItems = project.items.filter((item) => selectedIdSet.has(item.id));
  if (selectedItems.length !== uniqueIds.length) {
    const foundIds = new Set(selectedItems.map((item) => item.id));
    const missingIds = uniqueIds.filter((itemId) => !foundIds.has(itemId));
    throw new EmoticonSubmissionPackageError(
      'INVALID_REQUEST',
      '선택한 항목 구성이 서버에서 변경되었습니다. 최신 목록에서 다시 선택해 주세요.',
      missingIds.map((itemId) => `missing-item:${itemId}`),
    );
  }

  const incompleteItems = selectedItems.filter((item) => (
    item.generationStatus !== 'completed' || !item.jobId
  ));
  if (incompleteItems.length) {
    throw new EmoticonSubmissionPackageError(
      'MISSING_JOB',
      '선택한 항목 중 서버에서 완료 상태를 확인할 수 없는 항목이 있습니다. 최신 목록에서 다시 선택해 주세요.',
      incompleteItems.map((item) => `${item.order}번 ${item.title}`),
    );
  }

  return { ...project, items: selectedItems };
}

export type BuiltEmoticonSubmissionPackage = {
  arrayBuffer: ArrayBuffer;
  contentType: 'application/zip';
  fileName: string;
  sizeBytes: number;
  manifest: EmoticonSubmissionManifest;
  auditReport: EmoticonSubmissionAuditReport;
};

export type PreflightedEmoticonSubmissionPackage = Pick<
  BuiltEmoticonSubmissionPackage,
  'contentType' | 'fileName' | 'manifest' | 'auditReport'
> & {
  verifiedAssetBytes: number;
};

export type EmoticonSubmissionPackageErrorCode =
  | 'INVALID_REQUEST'
  | 'MISSING_JOB'
  | 'MISSING_OUTPUT'
  | 'MISSING_INSPECTION'
  | 'INSPECTION_FAILED'
  | 'FORMAT_MISMATCH'
  | 'METADATA_MISMATCH'
  | 'DIMENSION_MISMATCH'
  | 'FRAME_MISMATCH'
  | 'HASH_MISMATCH'
  | 'DOWNLOAD_FAILED'
  | 'INVALID_FILE_STRUCTURE'
  | 'INVALID_ARCHIVE'
  | 'SIZE_LIMIT_EXCEEDED'
  | 'PRIVACY_VIOLATION';

export class EmoticonSubmissionPackageError extends Error {
  readonly code: EmoticonSubmissionPackageErrorCode;
  readonly issues: string[];

  constructor(code: EmoticonSubmissionPackageErrorCode, message: string, issues: string[] = []) {
    super(message);
    this.name = 'EmoticonSubmissionPackageError';
    this.code = code;
    this.issues = issues;
  }
}

type VerifiedSubmissionOutput = EmoticonSubmissionOutputInput;

type ResolvedSubmissionItem = {
  item: EmoticonSubmissionProjectItemInput;
  output: VerifiedSubmissionOutput;
  baseName: string;
};

type PackagedSubmissionItem = {
  item: EmoticonSubmissionProjectItemInput;
  output: VerifiedSubmissionOutput;
  files: Array<EmoticonSubmissionManifestFile & { buffer: ArrayBuffer }>;
  archiveFlattened: boolean;
};

type PackageMemoryBudget = {
  packagedAssetBytes: number;
};

export const EMOTICON_SUBMISSION_FORMAT_CONTRACTS = EMOTICON_FORMAT_OUTPUT_CONTRACTS satisfies Record<EmoticonSubmissionFormat, {
  extension: string;
  contentType: string;
  alphaCapability: 'supported' | 'unsupported';
  transparentSourceHandling: 'preserve-alpha' | 'flatten-to-opaque';
  transparencyCoverageInspection: 'required' | 'optional' | 'not-applicable';
  loopMetadata: 'none' | 'embedded' | 'external' | 'manifest';
  expectedInspectionLoop: boolean;
  deliveryRole: 'asset' | 'animated-asset' | 'distribution-copy' | 'working-package';
  submissionCandidate: false;
}>;

const FORMAT_CONTRACT = EMOTICON_SUBMISSION_FORMAT_CONTRACTS;

const PRECOMPRESSED_SUBMISSION_EXTENSIONS = new Set([
  'gif',
  'mp4',
  'png',
  'webm',
  'webp',
  'zip',
]);

export function resolveSubmissionZipCompression(path: string): 'STORE' | 'DEFLATE' {
  const extension = path.split('.').at(-1)?.toLocaleLowerCase('en-US') || '';
  return PRECOMPRESSED_SUBMISSION_EXTENSIONS.has(extension) ? 'STORE' : 'DEFLATE';
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const MAX_PROJECT_ITEMS = 64;
// Browser ZIP generation temporarily holds verified inputs and the generated
// archive together. Kakao-scale assets are much smaller, so a conservative
// client cap prevents tab crashes while keeping generous editing headroom.
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const MAX_DECLARED_PACKAGE_BYTES = 64 * 1024 * 1024;
const MAX_EXTRACTED_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 512;
const MAX_BINARY_CONCURRENCY = 4;
const SUBMISSION_ALPHA_BOUNDS_THRESHOLD = 8;
const SUBMISSION_MINIMUM_TRANSPARENT_MARGIN_PX = 4;
const SUBMISSION_MINIMUM_TRANSPARENT_MARGIN_RATIO = 0.01;
const PUBLIC_METADATA_FORBIDDEN_PATTERN = /(?:https?:\/\/|firebasestorage|downloadurl|storagepath|\buserid\b|firebaseStorageDownloadTokens)/i;

let jsZipConstructorPromise: Promise<typeof JSZip> | null = null;

async function loadJSZip(): Promise<typeof JSZip> {
  jsZipConstructorPromise ||= import('jszip').then((module) => module.default);
  return jsZipConstructorPromise;
}

function normalizeContentType(value: string): string {
  return value.split(';', 1)[0].trim().toLowerCase();
}

function trimCodePoints(value: string, maximum: number): string {
  return Array.from(value).slice(0, maximum).join('');
}

function removeUrls(value: string): string {
  return value.replace(/https?:\/\/\S+/gi, '[link-removed]');
}

function sanitizePublicText(value: string, maximum: number): string {
  return trimCodePoints(
    removeUrls(value)
      .normalize('NFKC')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
    maximum,
  );
}

function sanitizeFilePart(value: string, fallback: string): string {
  const normalized = removeUrls(value)
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[. _]+|[. _]+$/g, '');
  const shortened = trimCodePoints(normalized, 60);
  const safe = shortened || fallback;
  return /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(safe) ? `_${safe}` : safe;
}

function sortProjectItems(
  items: EmoticonSubmissionProjectItemInput[],
): EmoticonSubmissionProjectItemInput[] {
  return [...items].sort((left, right) => (
    left.order - right.order
    || left.title.localeCompare(right.title, 'ko')
    || left.id.localeCompare(right.id)
  ));
}

function assignUniqueBaseNames(items: EmoticonSubmissionProjectItemInput[]): Map<string, string> {
  const used = new Set<string>();
  const names = new Map<string, string>();
  for (const item of items) {
    const prefix = String(item.order).padStart(3, '0');
    const stem = `${prefix}_${sanitizeFilePart(item.title, 'item')}`;
    let candidate = stem;
    let suffix = 2;
    while (used.has(candidate.toLocaleLowerCase('en-US'))) {
      candidate = `${stem}_${suffix}`;
      suffix += 1;
    }
    used.add(candidate.toLocaleLowerCase('en-US'));
    names.set(item.id, candidate);
  }
  return names;
}

function getPlatformFormatPolicy(
  project: EmoticonSubmissionProjectInput,
  format: EmoticonSubmissionFormat,
): EmoticonSubmissionPlatformFormatPolicy | null {
  const profile = findEmoticonPlatformProfile(project.platform, project.emoticonType);
  const policy = profile?.formatPolicies.find((candidate) => candidate.format === format);
  return policy
    ? {
      role: policy.role,
      verification: policy.verification,
      submissionCandidate: false,
    }
    : null;
}

function assertValidRequest(input: BuildEmoticonSubmissionPackageInput): void {
  if (!EMOTICON_SUBMISSION_FORMATS.includes(input.preferredFormat)) {
    throw new EmoticonSubmissionPackageError(
      'INVALID_REQUEST',
      '지원하지 않는 제출 형식입니다.',
    );
  }
  if (!input.project.items.length) {
    throw new EmoticonSubmissionPackageError(
      'INVALID_REQUEST',
      '제출 패키지에 포함할 항목이 없습니다.',
    );
  }
  if (input.project.items.length > MAX_PROJECT_ITEMS) {
    throw new EmoticonSubmissionPackageError(
      'INVALID_REQUEST',
      `제출 패키지는 한 번에 최대 ${MAX_PROJECT_ITEMS}개 항목을 처리할 수 있습니다.`,
    );
  }
  if (
    !Number.isInteger(input.project.spec.canvasWidth)
    || input.project.spec.canvasWidth < 1
    || !Number.isInteger(input.project.spec.canvasHeight)
    || input.project.spec.canvasHeight < 1
  ) {
    throw new EmoticonSubmissionPackageError(
      'INVALID_REQUEST',
      '프로젝트 출력 캔버스 크기가 올바르지 않습니다.',
    );
  }
  const platformProfile = findEmoticonPlatformProfile(
    input.project.platform,
    input.project.emoticonType,
  );
  if (platformProfile) {
    const requestedPolicy = platformProfile.formatPolicies.find(
      (policy) => policy.format === input.preferredFormat,
    );
    const hasVerifiedFormatPolicy = platformProfile.formatPolicies.some(
      (policy) => policy.verification === 'verified',
    );
    if (hasVerifiedFormatPolicy && !requestedPolicy) {
      throw new EmoticonSubmissionPackageError(
        'FORMAT_MISMATCH',
        `${input.project.platform} ${input.project.emoticonType} 프로필에서 확인된 출력 형식이 아닙니다.`,
      );
    }
    if (
      platformProfile.constraintVerification.canvas === 'verified'
      && (
        input.project.spec.canvasWidth !== platformProfile.width
        || input.project.spec.canvasHeight !== platformProfile.height
      )
    ) {
      throw new EmoticonSubmissionPackageError(
        'DIMENSION_MISMATCH',
        `${input.project.platform} ${input.project.emoticonType}의 확인된 캔버스는 `
          + `${platformProfile.width}×${platformProfile.height}px입니다.`,
      );
    }
    if (
      platformProfile.constraintVerification.minFrameCount === 'verified'
      && input.project.items.some((item) => item.motion.frameCount < platformProfile.minFrameCount)
    ) {
      throw new EmoticonSubmissionPackageError(
        'FRAME_MISMATCH',
        `${input.project.platform} ${input.project.emoticonType}의 확인된 최소 프레임 수를 충족하지 않습니다.`,
      );
    }
    if (
      platformProfile.constraintVerification.maxFrameCount === 'verified'
      && input.project.items.some((item) => item.motion.frameCount > platformProfile.maxFrameCount)
    ) {
      throw new EmoticonSubmissionPackageError(
        'FRAME_MISMATCH',
        `${input.project.platform} ${input.project.emoticonType}의 확인된 최대 프레임 수 `
          + `${platformProfile.maxFrameCount}개를 초과했습니다.`,
      );
    }
  }
  if (input.project.emoticonType === 'static' && input.preferredFormat !== 'png') {
    throw new EmoticonSubmissionPackageError(
      'METADATA_MISMATCH',
      '정적 프로젝트의 제출 우선 형식은 PNG여야 합니다.',
    );
  }
  if (input.project.emoticonType === 'animated' && input.preferredFormat === 'png') {
    throw new EmoticonSubmissionPackageError(
      'METADATA_MISMATCH',
      '움직이는 프로젝트는 단일 PNG를 제출 우선 형식으로 사용할 수 없습니다.',
    );
  }
  const invalid = input.project.items.find((item) => (
    !item.id.trim()
    || !Number.isInteger(item.order)
    || item.order < 1
    || !item.title.trim()
    || !item.motion
    || !Number.isFinite(item.motion.fps)
    || item.motion.fps <= 0
    || !Number.isInteger(item.motion.frameCount)
    || item.motion.frameCount < 1
    || !Number.isFinite(item.motion.durationMs)
    || item.motion.durationMs < 0
    || (
      input.project.emoticonType === 'static'
      && (item.motion.frameCount !== 1 || item.motion.durationMs !== 0)
    )
    || (
      input.project.emoticonType === 'animated'
      && (item.motion.frameCount < 2 || item.motion.durationMs <= 0)
    )
  ));
  if (invalid) {
    throw new EmoticonSubmissionPackageError(
      'INVALID_REQUEST',
      '항목 ID, 순서 또는 제목이 올바르지 않습니다.',
    );
  }
  const uniqueIds = new Set(input.project.items.map((item) => item.id));
  if (uniqueIds.size !== input.project.items.length) {
    throw new EmoticonSubmissionPackageError(
      'INVALID_REQUEST',
      '중복된 프로젝트 항목 ID가 있습니다.',
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonnegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isValidAlphaBoundsEvidence(params: {
  value: unknown;
  width: number;
  height: number;
  expectedFrameCount: number;
}): boolean {
  const { value, width, height, expectedFrameCount } = params;
  if (!isRecord(value)) return false;
  const alphaThreshold = value.alphaThreshold;
  const requiredMargin = value.requiredTransparentMarginPx;
  const checkedFrameCount = value.checkedFrameCount;
  const frames = value.frames;
  const edgeIndices = value.edgeTouchFrameIndices;
  const insufficientIndices = value.insufficientMarginFrameIndices;
  if (
    !Number.isInteger(alphaThreshold)
    || Number(alphaThreshold) !== SUBMISSION_ALPHA_BOUNDS_THRESHOLD
    || !Number.isInteger(requiredMargin)
    || Number(requiredMargin) < Math.max(
      SUBMISSION_MINIMUM_TRANSPARENT_MARGIN_PX,
      Math.ceil(Math.min(width, height) * SUBMISSION_MINIMUM_TRANSPARENT_MARGIN_RATIO),
    )
    || Number(requiredMargin) > 256
    || checkedFrameCount !== expectedFrameCount
    || !Array.isArray(frames)
    || frames.length !== expectedFrameCount
    || !Array.isArray(edgeIndices)
    || !Array.isArray(insufficientIndices)
  ) return false;

  const derivedEdgeIndices: number[] = [];
  const derivedInsufficientIndices: number[] = [];
  let allFramesHaveVisibleContent = true;
  let allFramesHaveUsableTransparentMargin = true;
  for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
    const frame = frames[frameIndex];
    if (!isRecord(frame) || frame.frameIndex !== frameIndex) return false;
    const visiblePixelCount = frame.visiblePixelCount;
    const bounds = frame.bounds;
    const margins = frame.transparentMargins;
    const minimumMargin = frame.minimumTransparentMarginPx;
    if (
      !isNonnegativeInteger(visiblePixelCount)
      || Number(visiblePixelCount) > width * height
      || typeof frame.touchesCanvasEdge !== 'boolean'
      || typeof frame.hasUsableTransparentMargin !== 'boolean'
    ) return false;
    if (visiblePixelCount === 0) {
      if (
        bounds !== null
        || margins !== null
        || minimumMargin !== null
        || frame.touchesCanvasEdge
        || frame.hasUsableTransparentMargin
      ) return false;
      allFramesHaveVisibleContent = false;
      allFramesHaveUsableTransparentMargin = false;
      derivedInsufficientIndices.push(frameIndex);
      continue;
    }
    if (!isRecord(bounds) || !isRecord(margins) || !isNonnegativeInteger(minimumMargin)) return false;
    const left = bounds.left;
    const top = bounds.top;
    const right = bounds.right;
    const bottom = bounds.bottom;
    if (
      !isNonnegativeInteger(left)
      || !isNonnegativeInteger(top)
      || !isNonnegativeInteger(right)
      || !isNonnegativeInteger(bottom)
      || left > right
      || top > bottom
      || right >= width
      || bottom >= height
    ) return false;
    const expectedMargins = {
      left,
      top,
      right: width - 1 - right,
      bottom: height - 1 - bottom,
    };
    if (
      margins.left !== expectedMargins.left
      || margins.top !== expectedMargins.top
      || margins.right !== expectedMargins.right
      || margins.bottom !== expectedMargins.bottom
    ) return false;
    const derivedMinimumMargin = Math.min(
      expectedMargins.left,
      expectedMargins.top,
      expectedMargins.right,
      expectedMargins.bottom,
    );
    const touchesEdge = derivedMinimumMargin === 0;
    const hasUsableMargin = !touchesEdge && derivedMinimumMargin >= Number(requiredMargin);
    if (
      minimumMargin !== derivedMinimumMargin
      || frame.touchesCanvasEdge !== touchesEdge
      || frame.hasUsableTransparentMargin !== hasUsableMargin
    ) return false;
    if (touchesEdge) derivedEdgeIndices.push(frameIndex);
    if (!hasUsableMargin) {
      allFramesHaveUsableTransparentMargin = false;
      derivedInsufficientIndices.push(frameIndex);
    }
  }
  return value.allFramesHaveVisibleContent === allFramesHaveVisibleContent
    && value.allFramesHaveUsableTransparentMargin === allFramesHaveUsableTransparentMargin
    && edgeIndices.length === derivedEdgeIndices.length
    && edgeIndices.every((index, position) => index === derivedEdgeIndices[position])
    && insufficientIndices.length === derivedInsufficientIndices.length
    && insufficientIndices.every((index, position) => index === derivedInsufficientIndices[position]);
}

function validateOutputContract(
  output: EmoticonSubmissionOutputInput,
  preferredFormat: EmoticonSubmissionFormat,
  item: EmoticonSubmissionProjectItemInput,
): string | null {
  const contract = FORMAT_CONTRACT[preferredFormat];
  if (output.format !== preferredFormat) {
    return `${item.order}번 '${item.title}' 결과 형식이 요청한 ${preferredFormat}과 다릅니다.`;
  }
  if (normalizeContentType(output.contentType) !== contract.contentType) {
    return `${item.order}번 '${item.title}' 결과의 콘텐츠 형식이 ${contract.contentType}이 아닙니다.`;
  }
  if (!output.fileName.toLowerCase().endsWith(`.${contract.extension}`)) {
    return `${item.order}번 '${item.title}' 결과 파일 확장자가 ${contract.extension}이 아닙니다.`;
  }
  if (!Number.isInteger(output.sizeBytes) || output.sizeBytes <= 0 || output.sizeBytes > MAX_OUTPUT_BYTES) {
    return `${item.order}번 '${item.title}' 결과 파일 용량 정보가 올바르지 않습니다.`;
  }
  try {
    const url = new URL(output.url);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('unsupported protocol');
  } catch {
    return `${item.order}번 '${item.title}' 결과 다운로드 주소가 올바르지 않습니다.`;
  }
  return null;
}

function validateInspectionContract(params: {
  output: EmoticonSubmissionOutputInput;
  preferredFormat: EmoticonSubmissionFormat;
  item: EmoticonSubmissionProjectItemInput;
  project: EmoticonSubmissionProjectInput;
}): { code: EmoticonSubmissionPackageErrorCode; message: string } | null {
  const { output, preferredFormat, item, project } = params;
  const inspection = output.inspection;
  const label = `${item.order}번 '${item.title}'`;
  if (!inspection) {
    return {
      code: 'MISSING_INSPECTION',
      message: `${label} 결과에 서버 출력 검수 정보가 없습니다.`,
    };
  }
  if (
    inspection.format !== preferredFormat
    || !Number.isInteger(inspection.fileSizeBytes)
    || inspection.fileSizeBytes <= 0
    || (
      inspection.width !== null
      && (!Number.isInteger(inspection.width) || inspection.width < 1)
    )
    || (
      inspection.height !== null
      && (!Number.isInteger(inspection.height) || inspection.height < 1)
    )
    || typeof inspection.sha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(inspection.sha256)
    || !Number.isInteger(inspection.frameCount)
    || inspection.frameCount < 1
    || (
      inspection.fps !== null
      && (!Number.isFinite(inspection.fps) || inspection.fps < 0)
    )
    || (
      inspection.durationMs !== null
      && (!Number.isInteger(inspection.durationMs) || inspection.durationMs < 0)
    )
    || (inspection.loop !== null && typeof inspection.loop !== 'boolean')
    || typeof inspection.hasAlpha !== 'boolean'
    || (
      inspection.transparencyCoverage !== null
      && (
        !Number.isFinite(inspection.transparencyCoverage)
        || inspection.transparencyCoverage < 0
        || inspection.transparencyCoverage > 1
      )
    )
    || (
      inspection.codec !== null
      && (
        typeof inspection.codec !== 'string'
        || !inspection.codec.trim()
        || inspection.codec.length > 80
      )
    )
    || typeof inspection.passed !== 'boolean'
    || !Array.isArray(inspection.issues)
    || inspection.issues.length > 12
    || inspection.issues.some((issue) => (
      typeof issue !== 'string' || !issue.trim() || issue.length > 180
    ))
    || typeof inspection.inspectorVersion !== 'string'
    || !inspection.inspectorVersion.trim()
    || inspection.inspectorVersion.length > 40
    || typeof inspection.inspectedAt !== 'string'
    || Number.isNaN(new Date(inspection.inspectedAt).getTime())
  ) {
    return {
      code: 'INSPECTION_FAILED',
      message: `${label} 서버 출력 검수 정보의 형식이 올바르지 않습니다.`,
    };
  }
  if (
    inspection.alphaBoundsEvidence !== undefined
    && inspection.alphaBoundsEvidence !== null
    && (
      inspection.width === null
      || inspection.height === null
      || !isValidAlphaBoundsEvidence({
        value: inspection.alphaBoundsEvidence,
        width: inspection.width,
        height: inspection.height,
        expectedFrameCount: inspection.frameCount,
      })
    )
  ) {
    return {
      code: 'INSPECTION_FAILED',
      message: `${label} 프레임별 알파 경계 검사 증거가 올바르지 않습니다.`,
    };
  }
  if (!inspection.passed || inspection.issues.length > 0) {
    const reason = inspection.issues[0]?.trim();
    return {
      code: 'INSPECTION_FAILED',
      message: reason
        ? `${label} 서버 출력 검수를 통과하지 못했습니다: ${reason.slice(0, 180)}`
        : `${label} 서버 출력 검수를 통과하지 못했습니다.`,
    };
  }
  if (inspection.fileSizeBytes !== output.sizeBytes) {
    return {
      code: 'METADATA_MISMATCH',
      message: `${label} 서버 검수 용량과 출력 용량 정보가 다릅니다.`,
    };
  }
  if (
    inspection.width !== project.spec.canvasWidth
    || inspection.height !== project.spec.canvasHeight
  ) {
    return {
      code: 'DIMENSION_MISMATCH',
      message: `${label} 실제 캔버스 ${inspection.width ?? '?'}×${inspection.height ?? '?'}가 프로젝트 `
        + `${project.spec.canvasWidth}×${project.spec.canvasHeight}와 다릅니다.`,
    };
  }
  if (inspection.frameCount !== item.motion.frameCount) {
    return {
      code: 'FRAME_MISMATCH',
      message: `${label} 실제 프레임 수 ${inspection.frameCount}개가 항목 설정 `
        + `${item.motion.frameCount}개와 다릅니다.`,
    };
  }
  if (project.emoticonType === 'static') {
    if (
      inspection.frameCount !== 1
      || inspection.fps !== null
      || inspection.durationMs !== 0
      || inspection.loop !== false
    ) {
      return {
        code: inspection.frameCount !== 1 ? 'FRAME_MISMATCH' : 'METADATA_MISMATCH',
        message: `${label} 정적 PNG 검수값은 1프레임·재생시간 0·반복 없음이어야 합니다.`,
      };
    }
  } else {
    if (
      inspection.frameCount < 2
      || inspection.fps === null
      || !Number.isFinite(inspection.fps)
      || inspection.fps <= 0
      || Math.abs(inspection.fps - item.motion.fps) > 0.25
    ) {
      return {
        code: 'METADATA_MISMATCH',
        message: `${label} 실제 FPS가 항목 설정 ${item.motion.fps}와 다릅니다.`,
      };
    }
    const durationTolerance = Math.max(120, Math.ceil(1000 / Math.max(1, item.motion.fps)));
    if (
      inspection.durationMs === null
      || inspection.durationMs <= 0
      || Math.abs(inspection.durationMs - item.motion.durationMs) > durationTolerance
    ) {
      return {
        code: 'METADATA_MISMATCH',
        message: `${label} 실제 재생시간이 항목 설정 ${item.motion.durationMs}ms와 다릅니다.`,
      };
    }
    if (inspection.loop !== FORMAT_CONTRACT[preferredFormat].expectedInspectionLoop) {
      return {
        code: 'METADATA_MISMATCH',
        message: `${label} 실제 반복 설정이 ${preferredFormat} 출력 계약과 다릅니다.`,
      };
    }
  }
  const formatContract = FORMAT_CONTRACT[preferredFormat];
  if (formatContract.alphaCapability === 'unsupported') {
    if (inspection.hasAlpha || inspection.transparencyCoverage !== null) {
      return {
        code: 'METADATA_MISMATCH',
        message: `${label} 결과의 알파 검사값이 ${preferredFormat} 출력 계약과 다릅니다.`,
      };
    }
  } else if (project.spec.transparentBackground) {
    if (!inspection.hasAlpha) {
      return {
        code: 'METADATA_MISMATCH',
        message: `${label} 결과가 프로젝트의 투명 배경 요구를 충족하지 않습니다.`,
      };
    }
    if (
      formatContract.transparencyCoverageInspection === 'required'
      && (
        inspection.transparencyCoverage === null
        || !Number.isFinite(inspection.transparencyCoverage)
        || inspection.transparencyCoverage <= 0
        || inspection.transparencyCoverage > 1
      )
    ) {
      return {
        code: 'METADATA_MISMATCH',
        message: `${label} 결과의 실제 투명 영역 비율을 확인할 수 없습니다.`,
      };
    }
    if (formatContract.transparencyCoverageInspection === 'required') {
      const evidence = inspection.alphaBoundsEvidence;
      if (!evidence) {
        return {
          code: 'MISSING_INSPECTION',
          message: `${label} 결과에 프레임별 알파 경계·투명 여백 검사 증거가 없습니다.`,
        };
      }
      if (
        !evidence.allFramesHaveVisibleContent
        || !evidence.allFramesHaveUsableTransparentMargin
        || evidence.edgeTouchFrameIndices.length > 0
        || evidence.insufficientMarginFrameIndices.length > 0
      ) {
        return {
          code: 'INSPECTION_FAILED',
          message: `${label} 결과의 불투명 콘텐츠가 캔버스 가장자리에 닿았거나 투명 여백이 부족합니다.`,
        };
      }
    }
  }
  return null;
}

async function resolveAllItems(
  input: BuildEmoticonSubmissionPackageInput,
  sortedItems: EmoticonSubmissionProjectItemInput[],
): Promise<ResolvedSubmissionItem[]> {
  const baseNames = assignUniqueBaseNames(sortedItems);
  const settled = await Promise.allSettled(sortedItems.map(async (item) => {
    if (!item.jobId?.trim()) {
      throw new EmoticonSubmissionPackageError(
        'MISSING_JOB',
        `${item.order}번 '${item.title}' 항목에 생성 작업이 없습니다.`,
      );
    }
    if (item.generationStatus && item.generationStatus !== 'completed') {
      throw new EmoticonSubmissionPackageError(
        'MISSING_JOB',
        `${item.order}번 '${item.title}' 항목이 아직 완료되지 않았습니다.`,
      );
    }
    let job: EmoticonSubmissionJobInput | null | undefined;
    try {
      job = await input.resolveJob(item);
    } catch {
      throw new EmoticonSubmissionPackageError(
        'MISSING_JOB',
        `${item.order}번 '${item.title}' 생성 결과를 확인하지 못했습니다.`,
      );
    }
    if (!job) {
      throw new EmoticonSubmissionPackageError(
        'MISSING_JOB',
        `${item.order}번 '${item.title}' 생성 결과가 없습니다.`,
      );
    }
    if (job.status !== 'completed') {
      throw new EmoticonSubmissionPackageError(
        'MISSING_JOB',
        `${item.order}번 '${item.title}' 생성 작업이 완료 상태가 아닙니다.`,
      );
    }
    const output = job.outputs?.[input.preferredFormat];
    if (!output) {
      throw new EmoticonSubmissionPackageError(
        'MISSING_OUTPUT',
        `${item.order}번 '${item.title}' 항목에 ${input.preferredFormat} 결과가 없습니다.`,
      );
    }
    const contractIssue = validateOutputContract(output, input.preferredFormat, item);
    if (contractIssue) {
      throw new EmoticonSubmissionPackageError('FORMAT_MISMATCH', contractIssue);
    }
    const inspectionIssue = validateInspectionContract({
      output,
      preferredFormat: input.preferredFormat,
      item,
      project: input.project,
    });
    if (inspectionIssue) {
      throw new EmoticonSubmissionPackageError(inspectionIssue.code, inspectionIssue.message);
    }
    return {
      item,
      output: output as VerifiedSubmissionOutput,
      baseName: baseNames.get(item.id) || `${String(item.order).padStart(3, '0')}_item`,
    };
  }));

  const failures = settled.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (failures.length) {
    const errors = failures.map((failure) => (
      failure.reason instanceof EmoticonSubmissionPackageError
        ? failure.reason
        : new EmoticonSubmissionPackageError('MISSING_JOB', '생성 결과를 확인하지 못했습니다.')
    ));
    throw new EmoticonSubmissionPackageError(
      errors[0].code,
      `제출 패키지를 만들 수 없습니다: ${errors[0].message}`,
      errors.map((error) => error.message),
    );
  }

  const resolved = settled.map(
    (result) => (result as PromiseFulfilledResult<ResolvedSubmissionItem>).value,
  );
  const declaredTotalBytes = resolved.reduce((total, result) => total + result.output.sizeBytes, 0);
  if (declaredTotalBytes > MAX_DECLARED_PACKAGE_BYTES) {
    throw new EmoticonSubmissionPackageError(
      'SIZE_LIMIT_EXCEEDED',
      `선택한 결과의 총 용량이 패키지 안전 한도 ${Math.round(MAX_DECLARED_PACKAGE_BYTES / 1024 / 1024)}MB를 초과합니다.`,
    );
  }
  return resolved;
}

function startsWithBytes(buffer: ArrayBuffer, signature: readonly number[], offset = 0): boolean {
  const bytes = new Uint8Array(buffer);
  return signature.every((value, index) => bytes[offset + index] === value);
}

function hasExpectedSignature(buffer: ArrayBuffer, format: EmoticonSubmissionFormat): boolean {
  if (format === 'png') return startsWithBytes(buffer, PNG_SIGNATURE);
  if (format === 'webp') {
    return startsWithBytes(buffer, [0x52, 0x49, 0x46, 0x46])
      && startsWithBytes(buffer, [0x57, 0x45, 0x42, 0x50], 8);
  }
  if (format === 'gif') {
    const header = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(6, buffer.byteLength)));
    return header === 'GIF87a' || header === 'GIF89a';
  }
  if (format === 'mp4') return startsWithBytes(buffer, [0x66, 0x74, 0x79, 0x70], 4);
  if (format === 'webm') return startsWithBytes(buffer, [0x1a, 0x45, 0xdf, 0xa3]);
  return startsWithBytes(buffer, [0x50, 0x4b, 0x03, 0x04]);
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function inspectPngStructure(buffer: ArrayBuffer): {
  width: number;
  height: number;
} | null {
  if (buffer.byteLength < 45 || !startsWithBytes(buffer, PNG_SIGNATURE)) return null;
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let offset: number = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let sawHeader = false;
  let sawImageData = false;
  let sawEnd = false;
  while (offset + 12 <= bytes.byteLength) {
    const chunkLength = view.getUint32(offset, false);
    const type = asciiAt(bytes, offset + 4, 4);
    const chunkEnd = offset + 12 + chunkLength;
    if (chunkEnd > bytes.byteLength) return null;
    if (!sawHeader) {
      if (type !== 'IHDR' || chunkLength !== 13) return null;
      width = view.getUint32(offset + 8, false);
      height = view.getUint32(offset + 12, false);
      const bitDepth = bytes[offset + 16];
      const colorType = bytes[offset + 17];
      if (
        width < 1
        || height < 1
        || ![1, 2, 4, 8, 16].includes(bitDepth)
        || ![0, 2, 3, 4, 6].includes(colorType)
        || bytes[offset + 18] !== 0
        || bytes[offset + 19] !== 0
        || ![0, 1].includes(bytes[offset + 20])
      ) return null;
      sawHeader = true;
    } else if (type === 'IHDR') {
      return null;
    }
    if (type === 'IDAT' && chunkLength > 0) sawImageData = true;
    if (type === 'IEND') {
      if (chunkLength !== 0 || chunkEnd !== bytes.byteLength) return null;
      sawEnd = true;
      break;
    }
    offset = chunkEnd;
  }
  return sawHeader && sawImageData && sawEnd ? { width, height } : null;
}

function isSaneWebpContainer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 30 || !hasExpectedSignature(buffer, 'webp')) return false;
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  if (view.getUint32(4, true) + 8 !== bytes.byteLength) return false;
  let offset = 12;
  let sawImageChunk = false;
  while (offset + 8 <= bytes.byteLength) {
    const type = asciiAt(bytes, offset, 4);
    const chunkLength = view.getUint32(offset + 4, true);
    const paddedLength = chunkLength + (chunkLength % 2);
    const chunkEnd = offset + 8 + paddedLength;
    if (chunkLength < 1 || chunkEnd > bytes.byteLength) return false;
    if (type === 'VP8 ' || type === 'VP8L' || type === 'VP8X') sawImageChunk = true;
    offset = chunkEnd;
  }
  return offset === bytes.byteLength && sawImageChunk;
}

function isSaneGifContainer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 14 || !hasExpectedSignature(buffer, 'gif')) return false;
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  return view.getUint16(6, true) > 0
    && view.getUint16(8, true) > 0
    && bytes[bytes.byteLength - 1] === 0x3b;
}

function isSaneMp4Container(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 32 || !hasExpectedSignature(buffer, 'mp4')) return false;
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let offset = 0;
  let sawFtyp = false;
  let sawMediaData = false;
  let sawMovie = false;
  while (offset + 8 <= bytes.byteLength) {
    const declaredSize = view.getUint32(offset, false);
    const type = asciiAt(bytes, offset + 4, 4);
    if (declaredSize < 8 || offset + declaredSize > bytes.byteLength) return false;
    if (offset === 0 && type !== 'ftyp') return false;
    if (type === 'ftyp') sawFtyp = true;
    if (type === 'mdat') sawMediaData = true;
    if (type === 'moov') sawMovie = true;
    offset += declaredSize;
  }
  return offset === bytes.byteLength && sawFtyp && sawMediaData && sawMovie;
}

function readEbmlVariableLength(bytes: Uint8Array, offset: number): {
  byteLength: number;
  value: number;
} | null {
  const first = bytes[offset];
  if (!first) return null;
  let byteLength = 1;
  let marker = 0x80;
  while (byteLength <= 8 && (first & marker) === 0) {
    byteLength += 1;
    marker >>= 1;
  }
  if (byteLength > 8 || offset + byteLength > bytes.byteLength) return null;
  let value = first & (marker - 1);
  for (let index = 1; index < byteLength; index += 1) {
    value = value * 256 + bytes[offset + index];
  }
  return Number.isSafeInteger(value) ? { byteLength, value } : null;
}

function includesBytes(bytes: Uint8Array, signature: readonly number[], start: number): boolean {
  for (let offset = start; offset <= bytes.byteLength - signature.length; offset += 1) {
    if (signature.every((value, index) => bytes[offset + index] === value)) return true;
  }
  return false;
}

function isSaneWebmContainer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 32 || !hasExpectedSignature(buffer, 'webm')) return false;
  const bytes = new Uint8Array(buffer);
  const headerSize = readEbmlVariableLength(bytes, 4);
  if (!headerSize || 4 + headerSize.byteLength + headerSize.value > bytes.byteLength) return false;
  return includesBytes(bytes, [0x18, 0x53, 0x80, 0x67], 4 + headerSize.byteLength);
}

function validateDownloadedStructure(params: {
  buffer: ArrayBuffer;
  format: EmoticonSubmissionFormat;
  inspection: EmoticonSubmissionOutputInspectionInput;
}): {
  code: 'INVALID_FILE_STRUCTURE' | 'DIMENSION_MISMATCH';
  message: string;
} | null {
  if (params.format === 'png') {
    const png = inspectPngStructure(params.buffer);
    if (!png) {
      return {
        code: 'INVALID_FILE_STRUCTURE',
        message: 'PNG의 IHDR·IDAT·IEND 구조가 없거나 파일이 잘렸습니다.',
      };
    }
    if (png.width !== params.inspection.width || png.height !== params.inspection.height) {
      return {
        code: 'DIMENSION_MISMATCH',
        message: 'PNG IHDR 크기가 서버 출력 검수값과 다릅니다.',
      };
    }
    return null;
  }
  if (params.format === 'webp' && !isSaneWebpContainer(params.buffer)) {
    return {
      code: 'INVALID_FILE_STRUCTURE',
      message: 'WebP RIFF 선언 길이 또는 이미지 청크 구조가 올바르지 않습니다.',
    };
  }
  if (params.format === 'gif' && !isSaneGifContainer(params.buffer)) {
    return {
      code: 'INVALID_FILE_STRUCTURE',
      message: 'GIF 캔버스 또는 종료 블록이 없거나 파일이 잘렸습니다.',
    };
  }
  if (params.format === 'mp4' && !isSaneMp4Container(params.buffer)) {
    return {
      code: 'INVALID_FILE_STRUCTURE',
      message: 'MP4 박스 선언 길이 또는 ftyp·moov·mdat 구조가 올바르지 않습니다.',
    };
  }
  if (params.format === 'webm' && !isSaneWebmContainer(params.buffer)) {
    return {
      code: 'INVALID_FILE_STRUCTURE',
      message: 'WebM EBML 선언 길이 또는 Segment 구조가 올바르지 않습니다.',
    };
  }
  return null;
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new EmoticonSubmissionPackageError(
      'INVALID_REQUEST',
      '현재 실행 환경에서 패키지 무결성 해시를 만들 수 없습니다.',
    );
  }
  const digest = await subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function mapWithConcurrencySettled<T, Result>(
  values: T[],
  concurrency: number,
  task: (value: T, index: number) => Promise<Result>,
): Promise<Array<PromiseSettledResult<Result>>> {
  const results = new Array<PromiseSettledResult<Result>>(values.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = { status: 'fulfilled', value: await task(values[index], index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  );
  return results;
}

function reservePackagedAssetBytes(budget: PackageMemoryBudget, bytes: number): void {
  budget.packagedAssetBytes += bytes;
  if (budget.packagedAssetBytes > MAX_EXTRACTED_ARCHIVE_BYTES) {
    throw new EmoticonSubmissionPackageError(
      'SIZE_LIMIT_EXCEEDED',
      `압축 해제된 패키지 파일이 안전 한도 ${Math.round(MAX_EXTRACTED_ARCHIVE_BYTES / 1024 / 1024)}MB를 초과합니다.`,
    );
  }
}

function isSafeArchiveEntryName(value: string): boolean {
  if (!value || value.includes('\\') || value.startsWith('/') || /^[a-z]:/i.test(value)) return false;
  const segments = value.split('/');
  return segments.every((segment) => segment !== '..' && segment !== '.');
}

function getDeclaredUncompressedSize(entry: JSZip.JSZipObject): number | null {
  const internal = entry as unknown as { _data?: { uncompressedSize?: unknown } };
  const value = internal._data?.uncompressedSize;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

async function extractPngFrames(params: {
  buffer: ArrayBuffer;
  folderName: string;
  expectedWidth: number;
  expectedHeight: number;
  expectedFrameCount: number;
  budget: PackageMemoryBudget;
}): Promise<Array<EmoticonSubmissionManifestFile & { buffer: ArrayBuffer }>> {
  let sourceZip: JSZip;
  try {
    const JSZipConstructor = await loadJSZip();
    sourceZip = await JSZipConstructor.loadAsync(params.buffer, { checkCRC32: true });
  } catch {
    throw new EmoticonSubmissionPackageError(
      'INVALID_ARCHIVE',
      'PNG 프레임 묶음을 열 수 없거나 파일이 손상되었습니다.',
    );
  }
  const entries = Object.values(sourceZip.files);
  if (entries.length > MAX_ARCHIVE_ENTRIES) {
    throw new EmoticonSubmissionPackageError(
      'INVALID_ARCHIVE',
      'PNG 프레임 묶음의 파일 수가 안전 한도를 초과했습니다.',
    );
  }
  for (const entry of entries) {
    const originalName = (entry as unknown as { unsafeOriginalName?: string }).unsafeOriginalName
      || entry.name;
    if (!isSafeArchiveEntryName(originalName)) {
      throw new EmoticonSubmissionPackageError(
        'INVALID_ARCHIVE',
        'PNG 프레임 묶음에 안전하지 않은 경로가 있습니다.',
      );
    }
    if (!entry.dir && /\.zip$/i.test(entry.name)) {
      throw new EmoticonSubmissionPackageError(
        'INVALID_ARCHIVE',
        'PNG 프레임 묶음 안에 또 다른 ZIP 파일이 있습니다.',
      );
    }
  }

  const frameEntries = entries
    .filter((entry) => !entry.dir && /^frames\/frame-(\d+)\.png$/i.test(entry.name))
    .map((entry) => ({
      entry,
      index: Number(entry.name.match(/^frames\/frame-(\d+)\.png$/i)?.[1]),
    }))
    .sort((left, right) => left.index - right.index);
  if (!frameEntries.length) {
    throw new EmoticonSubmissionPackageError(
      'INVALID_ARCHIVE',
      'PNG 프레임 묶음에 frames/frame-001.png 형식의 프레임이 없습니다.',
    );
  }
  if (frameEntries.some(({ index }, position) => index !== position + 1)) {
    throw new EmoticonSubmissionPackageError(
      'INVALID_ARCHIVE',
      'PNG 프레임 번호가 1부터 연속되지 않거나 중복되었습니다.',
    );
  }
  if (frameEntries.length !== params.expectedFrameCount) {
    throw new EmoticonSubmissionPackageError(
      'FRAME_MISMATCH',
      `PNG 프레임 묶음의 실제 프레임 ${frameEntries.length}개가 프로젝트 설정 ${params.expectedFrameCount}개와 다릅니다.`,
    );
  }

  const declaredFrameBytes = frameEntries.reduce(
    (total, { entry }) => total + (getDeclaredUncompressedSize(entry) || 0),
    0,
  );
  if (declaredFrameBytes > 0) reservePackagedAssetBytes(params.budget, declaredFrameBytes);
  let extractedTotal = 0;
  const extractedSettled = await mapWithConcurrencySettled(
    frameEntries,
    MAX_BINARY_CONCURRENCY,
    async ({ entry, index }) => {
    const bytes = await entry.async('uint8array');
    extractedTotal += bytes.byteLength;
    const declaredSize = getDeclaredUncompressedSize(entry);
    if (declaredSize !== null && declaredSize !== bytes.byteLength) {
      throw new EmoticonSubmissionPackageError(
        'INVALID_ARCHIVE',
        `${index}번 PNG 프레임의 압축 해제 용량이 ZIP 선언값과 다릅니다.`,
      );
    }
    if (declaredSize === null) reservePackagedAssetBytes(params.budget, bytes.byteLength);
    if (extractedTotal > MAX_EXTRACTED_ARCHIVE_BYTES) {
      throw new EmoticonSubmissionPackageError(
        'SIZE_LIMIT_EXCEEDED',
        'PNG 프레임 묶음의 누적 압축 해제 용량이 안전 한도를 초과했습니다.',
      );
    }
    const frameBuffer = bytes.slice().buffer;
    const png = inspectPngStructure(frameBuffer);
    if (!png) {
      throw new EmoticonSubmissionPackageError(
        'INVALID_FILE_STRUCTURE',
        `${index}번 PNG 프레임의 IHDR·IDAT·IEND 구조가 없거나 파일이 잘렸습니다.`,
      );
    }
    if (png.width !== params.expectedWidth || png.height !== params.expectedHeight) {
      throw new EmoticonSubmissionPackageError(
        'DIMENSION_MISMATCH',
        `${index}번 PNG 프레임 크기 ${png.width}×${png.height}가 프로젝트 캔버스와 다릅니다.`,
      );
    }
    const path = `frames/${params.folderName}/frame-${String(index).padStart(3, '0')}.png`;
    return {
      path,
      contentType: 'image/png',
      sizeBytes: bytes.byteLength,
      sha256: await sha256(frameBuffer),
      buffer: frameBuffer,
    };
    },
  );
  const extractionFailure = extractedSettled.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (extractionFailure) throw extractionFailure.reason;
  if (extractedTotal > MAX_EXTRACTED_ARCHIVE_BYTES) {
    throw new EmoticonSubmissionPackageError(
      'INVALID_ARCHIVE',
      'PNG 프레임 묶음의 압축 해제 용량이 안전 한도를 초과했습니다.',
    );
  }
  return extractedSettled.map(
    (result) => (result as PromiseFulfilledResult<EmoticonSubmissionManifestFile & { buffer: ArrayBuffer }>).value,
  );
}

async function downloadAndPackageItem(params: {
  resolved: ResolvedSubmissionItem;
  preferredFormat: EmoticonSubmissionFormat;
  fetchImpl: typeof fetch;
  project: EmoticonSubmissionProjectInput;
  budget: PackageMemoryBudget;
  retainBuffers: boolean;
}): Promise<PackagedSubmissionItem> {
  const { item, output, baseName } = params.resolved;
  let response: Response;
  try {
    response = await params.fetchImpl(output.url);
  } catch {
    throw new EmoticonSubmissionPackageError(
      'DOWNLOAD_FAILED',
      `${item.order}번 '${item.title}' 결과 파일을 다운로드하지 못했습니다.`,
    );
  }
  if (!response.ok) {
    throw new EmoticonSubmissionPackageError(
      'DOWNLOAD_FAILED',
      `${item.order}번 '${item.title}' 결과 다운로드가 HTTP ${response.status}로 실패했습니다.`,
    );
  }
  const responseType = normalizeContentType(response.headers.get('content-type') || '');
  const expectedType = FORMAT_CONTRACT[params.preferredFormat].contentType;
  if (responseType && responseType !== 'application/octet-stream' && responseType !== expectedType) {
    throw new EmoticonSubmissionPackageError(
      'FORMAT_MISMATCH',
      `${item.order}번 '${item.title}' 다운로드 응답 형식이 ${expectedType}이 아닙니다.`,
    );
  }
  const responseLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(responseLength) && responseLength > 0 && responseLength !== output.sizeBytes) {
    throw new EmoticonSubmissionPackageError(
      'DOWNLOAD_FAILED',
      `${item.order}번 '${item.title}' 다운로드 응답 용량이 서버 출력 검수값과 다릅니다.`,
    );
  }
  const buffer = await response.arrayBuffer();
  if (!buffer.byteLength || buffer.byteLength !== output.sizeBytes) {
    throw new EmoticonSubmissionPackageError(
      'DOWNLOAD_FAILED',
      `${item.order}번 '${item.title}' 다운로드 파일 용량이 저장된 정보와 다릅니다.`,
    );
  }
  if (!hasExpectedSignature(buffer, params.preferredFormat)) {
    throw new EmoticonSubmissionPackageError(
      'FORMAT_MISMATCH',
      `${item.order}번 '${item.title}' 파일 내용이 ${params.preferredFormat} 형식이 아닙니다.`,
    );
  }
  const downloadedHash = await sha256(buffer);
  if (downloadedHash !== output.inspection.sha256) {
    throw new EmoticonSubmissionPackageError(
      'HASH_MISMATCH',
      `${item.order}번 '${item.title}' 다운로드 파일의 SHA-256이 서버 출력 검수값과 다릅니다.`,
    );
  }
  const structureIssue = validateDownloadedStructure({
    buffer,
    format: params.preferredFormat,
    inspection: output.inspection,
  });
  if (structureIssue) {
    throw new EmoticonSubmissionPackageError(
      structureIssue.code,
      `${item.order}번 '${item.title}' ${structureIssue.message}`,
    );
  }

  if (params.preferredFormat === 'png_zip') {
    const files = await extractPngFrames({
      buffer,
      folderName: baseName,
      expectedWidth: params.project.spec.canvasWidth,
      expectedHeight: params.project.spec.canvasHeight,
      expectedFrameCount: item.motion.frameCount,
      budget: params.budget,
    });
    return {
      item,
      output,
      files: params.retainBuffers
        ? files
        : files.map((file) => ({ ...file, buffer: new ArrayBuffer(0) })),
      archiveFlattened: true,
    };
  }
  reservePackagedAssetBytes(params.budget, buffer.byteLength);
  const extension = FORMAT_CONTRACT[params.preferredFormat].extension;
  return {
    item,
    output,
    files: [{
      path: `${baseName}.${extension}`,
      contentType: expectedType,
      sizeBytes: buffer.byteLength,
      sha256: downloadedHash,
      buffer: params.retainBuffers ? buffer : new ArrayBuffer(0),
    }],
    archiveFlattened: false,
  };
}

function assertPublicMetadataIsPrivateDataFree(value: unknown): void {
  const serialized = JSON.stringify(value);
  if (PUBLIC_METADATA_FORBIDDEN_PATTERN.test(serialized)) {
    throw new EmoticonSubmissionPackageError(
      'PRIVACY_VIOLATION',
      '제출 메타데이터에서 내부 주소 또는 사용자 식별 정보가 감지되었습니다.',
    );
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (
    bytes.buffer instanceof ArrayBuffer
    && bytes.byteOffset === 0
    && bytes.byteLength === bytes.buffer.byteLength
  ) return bytes.buffer;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

type PreparedEmoticonSubmissionPackage = {
  packagedItems: PackagedSubmissionItem[];
  fileName: string;
  manifest: EmoticonSubmissionManifest;
  auditReport: EmoticonSubmissionAuditReport;
};

async function prepareEmoticonSubmissionPackage(
  input: BuildEmoticonSubmissionPackageInput,
  retainBuffers: boolean,
): Promise<PreparedEmoticonSubmissionPackage> {
  assertValidRequest(input);
  const fetchImpl = input.fetchImpl || globalThis.fetch;
  if (!fetchImpl) {
    throw new EmoticonSubmissionPackageError(
      'INVALID_REQUEST',
      '현재 실행 환경에서 결과 파일을 다운로드할 수 없습니다.',
    );
  }
  const createdAtDate = input.createdAt ? new Date(input.createdAt) : new Date();
  if (Number.isNaN(createdAtDate.getTime())) {
    throw new EmoticonSubmissionPackageError(
      'INVALID_REQUEST',
      '패키지 생성 시각이 올바르지 않습니다.',
    );
  }
  const createdAt = createdAtDate.toISOString();
  const sortedItems = sortProjectItems(input.project.items);
  const resolvedItems = await resolveAllItems(input, sortedItems);
  const memoryBudget: PackageMemoryBudget = { packagedAssetBytes: 0 };

  const downloaded = await mapWithConcurrencySettled(
    resolvedItems,
    MAX_BINARY_CONCURRENCY,
    async (resolved) => downloadAndPackageItem({
      resolved,
      preferredFormat: input.preferredFormat,
      fetchImpl,
      project: input.project,
      budget: memoryBudget,
      retainBuffers,
    }),
  );
  const downloadFailures = downloaded.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (downloadFailures.length) {
    const errors = downloadFailures.map((failure) => (
      failure.reason instanceof EmoticonSubmissionPackageError
        ? failure.reason
        : new EmoticonSubmissionPackageError('DOWNLOAD_FAILED', '결과 파일 다운로드에 실패했습니다.')
    ));
    throw new EmoticonSubmissionPackageError(
      errors[0].code,
      `제출 패키지를 만들 수 없습니다: ${errors[0].message}`,
      errors.map((error) => error.message),
    );
  }
  const packagedItems = downloaded.map(
    (result) => (result as PromiseFulfilledResult<PackagedSubmissionItem>).value,
  );

  const manifestItems: EmoticonSubmissionManifestItem[] = packagedItems.map((packaged) => ({
    order: packaged.item.order,
    title: sanitizePublicText(packaged.item.title, 80) || `항목 ${packaged.item.order}`,
    format: input.preferredFormat,
    files: packaged.files.map(({ buffer: _buffer, ...file }) => file),
  }));
  const assetCount = manifestItems.reduce((total, item) => total + item.files.length, 0);
  const totalAssetBytes = manifestItems.reduce(
    (total, item) => total + item.files.reduce((sum, file) => sum + file.sizeBytes, 0),
    0,
  );
  const platformFormatPolicy = getPlatformFormatPolicy(input.project, input.preferredFormat);
  const platformProfile = findEmoticonPlatformProfile(
    input.project.platform,
    input.project.emoticonType,
  );
  const manifest: EmoticonSubmissionManifest = {
    schemaVersion: '1.0',
    kind: 'emoticon-submission-package',
    createdAt,
    submissionCandidate: false,
    manualReviewRequired: true,
    project: {
      title: sanitizePublicText(input.project.title, 100) || '이모티콘 프로젝트',
      platform: input.project.platform
        ? sanitizePublicText(input.project.platform, 40) || null
        : null,
      emoticonType: input.project.emoticonType
        ? sanitizePublicText(input.project.emoticonType, 40) || null
        : null,
    },
    preferredFormat: input.preferredFormat,
    formatContract: {
      alphaCapability: FORMAT_CONTRACT[input.preferredFormat].alphaCapability,
      transparentSourceHandling: FORMAT_CONTRACT[input.preferredFormat].transparentSourceHandling,
      deliveryRole: FORMAT_CONTRACT[input.preferredFormat].deliveryRole,
      submissionCandidate: false,
    },
    platformFormatPolicy,
    itemCount: manifestItems.length,
    assetCount,
    totalAssetBytes,
    items: manifestItems,
  };
  const auditReport: EmoticonSubmissionAuditReport = {
    schemaVersion: '1.0',
    kind: 'emoticon-submission-audit',
    createdAt,
    status: 'passed',
    submissionCandidate: false,
    preferredFormat: input.preferredFormat,
    manualReviewRequired: true,
    platformFormatPolicy,
    summary: {
      expectedItems: sortedItems.length,
      packagedItems: packagedItems.length,
      packagedAssets: assetCount,
      missingItems: 0,
      nestedArchives: 0,
      privacySafeMetadata: true,
    },
    items: packagedItems.map((packaged) => {
      return {
        order: packaged.item.order,
        title: sanitizePublicText(packaged.item.title, 80) || `항목 ${packaged.item.order}`,
        status: 'passed',
        sourceOutputBytes: packaged.output.sizeBytes,
        packagedFileCount: packaged.files.length,
        inspection: packaged.output.inspection,
        checks: [
          { code: 'job-completed' as const, pass: true as const },
          { code: 'output-present' as const, pass: true as const },
          { code: 'format-match' as const, pass: true as const },
          { code: 'format-capability' as const, pass: true as const },
          { code: 'server-inspection' as const, pass: true as const },
          { code: 'download-verified' as const, pass: true as const },
          ...(packaged.archiveFlattened
            ? [{ code: 'archive-flattened' as const, pass: true as const }]
            : []),
        ],
      };
    }),
    notes: [
      ...(platformFormatPolicy?.role === 'working-output'
        ? ['이 파일은 프레임 편집·검수용 working-output이며 플랫폼 제출 후보가 아닙니다.']
        : []),
      ...(platformFormatPolicy?.role === 'platform-reference'
        ? ['확인된 플랫폼 형식과 기술 규격을 검사했지만 승인 가능성을 보장하지 않으며 수동 검토가 필요합니다.']
        : []),
      ...(platformProfile?.platform === 'kakao'
        ? [sanitizePublicText(platformProfile.policyNotice, 240)]
        : []),
      '이 패키지는 기술 검토용이며 플랫폼 제출 후보로 판정하지 않습니다.',
      ...(FORMAT_CONTRACT[input.preferredFormat].transparentSourceHandling === 'flatten-to-opaque'
        ? ['MP4는 알파 채널을 지원하지 않아 투명 원본을 불투명 배경으로 평탄화한 배포용 복사본입니다.']
        : []),
      '파일 존재, 요청 형식, 다운로드 무결성, 패키지 구조와 공개 메타데이터를 검사했습니다.',
      '플랫폼 제출 전 최신 공식 가이드와 콘텐츠 심사를 별도로 확인해야 합니다.',
    ],
  };
  assertPublicMetadataIsPrivateDataFree(manifest);
  assertPublicMetadataIsPrivateDataFree(auditReport);

  const projectFilePart = sanitizeFilePart(input.project.title, 'emoticon-project');
  return {
    packagedItems,
    fileName: `${projectFilePart}_${input.preferredFormat}_submission.zip`,
    manifest,
    auditReport,
  };
}

/**
 * Performs the same fail-closed download, hash and structure checks as ZIP
 * creation, but discards each verified binary as soon as possible and does not
 * create the final ZIP. JSZip stays unloaded for direct formats; png_zip uses
 * it only to validate and flatten its source frames.
 */
export async function preflightEmoticonSubmissionPackage(
  input: BuildEmoticonSubmissionPackageInput,
): Promise<PreflightedEmoticonSubmissionPackage> {
  const prepared = await prepareEmoticonSubmissionPackage(input, false);
  return {
    contentType: 'application/zip',
    fileName: prepared.fileName,
    verifiedAssetBytes: prepared.manifest.totalAssetBytes,
    manifest: prepared.manifest,
    auditReport: prepared.auditReport,
  };
}

/**
 * Creates a fail-closed submission ZIP. Every project item must have the
 * explicitly requested format before any asset download begins. The returned
 * metadata intentionally excludes job IDs, user IDs, URLs, and Storage paths.
 */
export async function buildEmoticonSubmissionPackage(
  input: BuildEmoticonSubmissionPackageInput,
): Promise<BuiltEmoticonSubmissionPackage> {
  const prepared = await prepareEmoticonSubmissionPackage(input, true);
  const JSZipConstructor = await loadJSZip();
  const zip = new JSZipConstructor();
  for (const packaged of prepared.packagedItems) {
    for (const file of packaged.files) {
      zip.file(file.path, file.buffer, {
        compression: resolveSubmissionZipCompression(file.path),
        compressionOptions: { level: 6 },
      });
    }
  }
  zip.file('manifest.json', JSON.stringify(prepared.manifest, null, 2));
  zip.file('audit-report.json', JSON.stringify(prepared.auditReport, null, 2));
  const packageBytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    streamFiles: true,
  });
  const packageArrayBuffer = toArrayBuffer(packageBytes);
  return {
    arrayBuffer: packageArrayBuffer,
    contentType: 'application/zip',
    fileName: prepared.fileName,
    sizeBytes: packageArrayBuffer.byteLength,
    manifest: prepared.manifest,
    auditReport: prepared.auditReport,
  };
}
