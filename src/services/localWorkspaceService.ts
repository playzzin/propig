import {
  DEFAULT_LOCAL_WORKSPACE_PACKAGE_NAME,
  LOCAL_WORKSPACE_LIMITS,
  evaluateWorkspaceArtifactPath,
  getBlockedWorkspacePath,
  normalizeWorkspaceRelativePath,
  shouldTraverseWorkspaceDirectory,
  type WorkspacePathDecision,
} from '@/lib/workspace-artifacts/policy';
import { MANAGED_ARTIFACT_WORKSPACE_ID_PATTERN } from '@/schemas/managedArtifactSchema';
import type {
  WorkspaceArtifactCatalog,
  WorkspaceArtifactCatalogItem,
  WorkspaceArtifactSkipReason,
} from '@/types/workspaceArtifact';

const HANDLE_DATABASE_NAME = 'propig-local-workspace';
const HANDLE_DATABASE_VERSION = 1;
const HANDLE_STORE_NAME = 'directory-handles';
const PRIMARY_HANDLE_KEY_PREFIX = 'primary-workspace:';
const WORKSPACE_MARKER_FILE_NAME = '.propig-workspace.json';
const HASH_CONCURRENCY = 6;
const MAX_VISITED_DIRECTORIES = 2_000;
const MAX_FALLBACK_FILE_LIST_ENTRIES = 50_000;

type ReadPermissionDescriptor = { mode: 'read' };

type PermissionCapableDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission?: (descriptor?: ReadPermissionDescriptor) => Promise<PermissionState>;
  requestPermission?: (descriptor?: ReadPermissionDescriptor) => Promise<PermissionState>;
};

type IterableDirectoryHandle = FileSystemDirectoryHandle & {
  entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
};

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: 'read' | 'readwrite';
    startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
  }) => Promise<FileSystemDirectoryHandle>;
};

type IncludedPathDecision = Extract<WorkspacePathDecision, { included: true }>;

type CandidateFile = {
  path: string;
  file: File;
  decision: IncludedPathDecision;
};

type SkippedEntry = WorkspaceArtifactCatalog['skipped'][number];

export type LocalWorkspaceScanOptions = {
  includeLocalInstructions?: boolean;
  expectedPackageName?: string | null;
  requestPermission?: boolean;
};

export type LocalWorkspacePickerOptions = {
  persist?: boolean;
  pickerId?: string;
  ownerKey?: string;
};

export type LocalWorkspaceSource = FileSystemDirectoryHandle | FileList | readonly File[];

export type LocalWorkspaceErrorCode =
  | 'UNSUPPORTED_BROWSER'
  | 'HANDLE_STORAGE_FAILED'
  | 'HANDLE_RESTORE_FAILED'
  | 'PERMISSION_REQUIRED'
  | 'PERMISSION_DENIED'
  | 'PICKER_CANCELLED'
  | 'PACKAGE_NOT_FOUND'
  | 'INVALID_PACKAGE'
  | 'WORKSPACE_ID_NOT_FOUND'
  | 'INVALID_WORKSPACE_ID'
  | 'WRONG_PROJECT'
  | 'TOO_MANY_FILES'
  | 'TOTAL_SIZE_EXCEEDED'
  | 'HASH_UNAVAILABLE'
  | 'SCAN_FAILED';

export class LocalWorkspaceError extends Error {
  readonly code: LocalWorkspaceErrorCode;
  readonly cause?: unknown;

  constructor(code: LocalWorkspaceErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'LocalWorkspaceError';
    this.code = code;
    this.cause = cause;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDirectoryHandle(value: unknown): value is FileSystemDirectoryHandle {
  return (
    isRecord(value) &&
    value.kind === 'directory' &&
    typeof value.name === 'string' &&
    typeof value.getFileHandle === 'function' &&
    typeof value.getDirectoryHandle === 'function'
  );
}

function fileNameFromPath(path: string): string {
  return path.split('/').filter(Boolean).at(-1) ?? path;
}

function safeModifiedAt(lastModified: number): string | null {
  if (!Number.isFinite(lastModified) || lastModified <= 0) return null;
  const date = new Date(lastModified);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function humanizeFileName(path: string): string {
  const segments = path.split('/').filter(Boolean);
  const fileName = segments.at(-1) ?? path;
  const withoutExtension = fileName.replace(/\.[^.]+$/, '');
  const titleSource = withoutExtension.toLocaleLowerCase('en-US') === 'skill'
    ? segments.at(-2) ?? withoutExtension
    : withoutExtension;

  return titleSource
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim() || fileName;
}

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function deriveArtifactTitle(
  path: string,
  content: string,
  format: WorkspaceArtifactCatalogItem['format'],
): string {
  if (format === 'markdown') {
    const frontmatter = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    const metadataTitle = frontmatter?.[1].match(/^\s*(?:title|name)\s*:\s*(.+?)\s*$/im)?.[1];
    if (metadataTitle) {
      const normalized = stripWrappingQuotes(metadataTitle).replace(/\s+#.*$/, '').trim();
      if (normalized) return normalized.slice(0, 160);
    }

    const heading = content.match(/^#{1,2}\s+(.+?)\s*#*\s*$/m)?.[1]?.trim();
    if (heading) return heading.slice(0, 160);
  }

  if (format === 'typescript' || format === 'javascript') {
    const className = content.match(/\b(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/)?.[1];
    if (className) return className.slice(0, 160);
  }

  return humanizeFileName(path).slice(0, 160);
}

function normalizeExpectedPackageName(value: string | null | undefined): string | null {
  if (value === null) return null;
  const normalized = (value ?? DEFAULT_LOCAL_WORKSPACE_PACKAGE_NAME).trim();
  return normalized || DEFAULT_LOCAL_WORKSPACE_PACKAGE_NAME;
}

function parseAndValidatePackageJson(
  content: string,
  expectedPackageName: string | null,
): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new LocalWorkspaceError(
      'INVALID_PACKAGE',
      '선택한 폴더의 package.json을 읽을 수 없습니다. 올바른 JSON 파일인지 확인해 주세요.',
      error,
    );
  }

  const packageName = isRecord(parsed) && typeof parsed.name === 'string' ? parsed.name.trim() : '';
  if (!packageName) {
    throw new LocalWorkspaceError(
      'INVALID_PACKAGE',
      '선택한 package.json에 유효한 name 항목이 없습니다.',
    );
  }
  if (expectedPackageName && packageName !== expectedPackageName) {
    throw new LocalWorkspaceError(
      'WRONG_PROJECT',
      `선택한 폴더는 ${expectedPackageName} 프로젝트가 아닙니다. package.json의 name은 "${packageName}"입니다.`,
    );
  }

  return packageName;
}

function parseAndValidateWorkspaceMarker(content: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new LocalWorkspaceError(
      'INVALID_WORKSPACE_ID',
      `${WORKSPACE_MARKER_FILE_NAME} 파일이 올바른 JSON이 아닙니다.`,
      error,
    );
  }

  const workspaceId = isRecord(parsed) && typeof parsed.workspaceId === 'string'
    ? parsed.workspaceId.trim().toLocaleLowerCase('en-US')
    : '';
  if (!MANAGED_ARTIFACT_WORKSPACE_ID_PATTERN.test(workspaceId)) {
    throw new LocalWorkspaceError(
      'INVALID_WORKSPACE_ID',
      `${WORKSPACE_MARKER_FILE_NAME}의 workspaceId가 올바른 UUID가 아닙니다.`,
    );
  }
  return workspaceId;
}

function ensureBrowserFile(file: unknown): asserts file is File {
  if (
    !isRecord(file) ||
    typeof file.name !== 'string' ||
    typeof file.size !== 'number' ||
    typeof file.arrayBuffer !== 'function'
  ) {
    throw new LocalWorkspaceError('SCAN_FAILED', '브라우저에서 선택한 파일 목록을 읽을 수 없습니다.');
  }
}

function isPlaceholderSecret(value: string): boolean {
  const normalized = value.trim().replace(/^['"`]|['"`]$/g, '').trim();
  return (
    !normalized ||
    /^(?:<[^>]+>|\$\{[^}]+\}|(?:process\.)?env[.[_]|your[-_]|example[-_]|sample[-_]|replace[-_]|change[-_]?me|todo|none|null|undefined|x{3,}|\*{3,}|\.{3,})/i.test(normalized)
  );
}

function detectSensitiveContent(path: string, content: string): string | null {
  if (/-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/.test(content)) {
    return '개인키 본문이 감지되어 제외했습니다.';
  }

  if (
    /["']type["']\s*:\s*["']service_account["']/i.test(content) &&
    /["']private_key["']\s*:/i.test(content)
  ) {
    return '서비스 계정 인증정보가 감지되어 제외했습니다.';
  }

  const tokenPatterns: ReadonlyArray<[RegExp, string]> = [
    [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/, 'AWS 액세스 키'],
    [/\b(?:github_pat_[A-Za-z0-9_]{50,255}|gh[pousr]_[A-Za-z0-9]{30,255})\b/, 'GitHub 토큰'],
    [/\bxox[baprs]-[A-Za-z0-9-]{20,}\b/, 'Slack 토큰'],
    [/\bsk-(?:proj-|live-)?[A-Za-z0-9_-]{20,}\b/, 'API 비밀키'],
    [/\bAIza[0-9A-Za-z_-]{30,}\b/, 'Google API 키'],
  ];
  for (const [pattern, label] of tokenPatterns) {
    if (pattern.test(content)) return `${label}가 감지되어 제외했습니다.`;
  }

  const assignmentPattern = /(?:^|[,{\n\r])\s*["']?(?:api[-_]?key|access[-_]?token|auth[-_]?token|client[-_]?secret|private[-_]?key|password|secret|token)["']?\s*[:=]\s*(["'`]?[^\s,}\]\r\n]+["'`]?)/gim;
  for (const match of content.matchAll(assignmentPattern)) {
    const value = match[1] ?? '';
    const normalized = value.replace(/^['"`]|['"`]$/g, '');
    if (!isPlaceholderSecret(value) && normalized.length >= 16) {
      return `${path} 본문에서 실제 비밀값으로 보이는 설정을 감지해 제외했습니다.`;
    }
  }

  return null;
}

function addSkipped(
  skipped: SkippedEntry[],
  skippedKeys: Set<string>,
  path: string,
  reason: WorkspaceArtifactSkipReason,
  detail: string,
  sizeBytes?: number,
): void {
  const safePath = path || '(알 수 없는 경로)';
  const key = `${safePath.toLocaleLowerCase('en-US')}\u0000${reason}`;
  if (skippedKeys.has(key)) return;
  skippedKeys.add(key);
  skipped.push({ path: safePath, reason, detail, ...(sizeBytes === undefined ? {} : { sizeBytes }) });
}

function assertCandidateLimits(candidates: CandidateFile[]): void {
  if (candidates.length > LOCAL_WORKSPACE_LIMITS.maxFileCount) {
    throw new LocalWorkspaceError(
      'TOO_MANY_FILES',
      `관리 대상 파일은 최대 ${LOCAL_WORKSPACE_LIMITS.maxFileCount.toLocaleString('ko-KR')}개까지 스캔할 수 있습니다. 범위를 줄여 다시 시도해 주세요.`,
    );
  }

  const totalBytes = candidates.reduce((sum, candidate) => sum + candidate.file.size, 0);
  if (totalBytes > LOCAL_WORKSPACE_LIMITS.maxTotalBytes) {
    throw new LocalWorkspaceError(
      'TOTAL_SIZE_EXCEEDED',
      '관리 대상 파일의 전체 크기는 25MiB 이하여야 합니다. 큰 파일이나 로컬 지침 범위를 제외해 주세요.',
    );
  }
}

function collectCandidate(
  path: string,
  file: File,
  options: LocalWorkspaceScanOptions,
  candidates: CandidateFile[],
  candidatePaths: Set<string>,
  skipped: SkippedEntry[],
  skippedKeys: Set<string>,
): void {
  const decision = evaluateWorkspaceArtifactPath(path, options);
  if (!decision.included) {
    if (decision.report) {
      addSkipped(skipped, skippedKeys, decision.skipPath, decision.skipReason, decision.reason);
    }
    return;
  }

  if (decision.path.length > LOCAL_WORKSPACE_LIMITS.maxPathLength) {
    addSkipped(
      skipped,
      skippedKeys,
      decision.path,
      'invalid-path',
      `관리 경로는 ${LOCAL_WORKSPACE_LIMITS.maxPathLength}자 이하여야 합니다.`,
    );
    return;
  }

  if (file.size > LOCAL_WORKSPACE_LIMITS.maxFileBytes) {
    addSkipped(
      skipped,
      skippedKeys,
      decision.path,
      'too-large',
      '파일 크기가 700KiB를 초과해 제외했습니다.',
      file.size,
    );
    return;
  }

  const pathKey = decision.path.toLocaleLowerCase('en-US');
  if (candidatePaths.has(pathKey)) {
    addSkipped(
      skipped,
      skippedKeys,
      decision.path,
      'duplicate-path',
      '동일한 경로가 중복되어 한 번만 가져옵니다.',
    );
    return;
  }

  candidatePaths.add(pathKey);
  candidates.push({ path: decision.path, file, decision });

  if (candidates.length > LOCAL_WORKSPACE_LIMITS.maxFileCount) assertCandidateLimits(candidates);
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new LocalWorkspaceError(
      'HASH_UNAVAILABLE',
      '이 브라우저에서는 파일 변경 확인에 필요한 SHA-256을 사용할 수 없습니다.',
    );
  }

  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

async function readCandidate(
  candidate: CandidateFile,
): Promise<
  | { item: WorkspaceArtifactCatalogItem }
  | { skipReason: WorkspaceArtifactSkipReason; detail: string }
> {
  try {
    const bytes = await candidate.file.arrayBuffer();
    if (bytes.byteLength > LOCAL_WORKSPACE_LIMITS.maxFileBytes) {
      return { skipReason: 'too-large', detail: '파일 크기가 700KiB를 초과해 제외했습니다.' };
    }

    let content: string;
    try {
      content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return { skipReason: 'unsupported-format', detail: 'UTF-8 텍스트 파일이 아니어서 제외했습니다.' };
    }
    if (content.includes('\0')) {
      return { skipReason: 'unsupported-format', detail: '바이너리 데이터가 포함되어 제외했습니다.' };
    }
    const sensitiveContentReason = detectSensitiveContent(candidate.path, content);
    if (sensitiveContentReason) {
      return { skipReason: 'sensitive-file', detail: sensitiveContentReason };
    }

    return {
      item: {
        path: candidate.path,
        name: fileNameFromPath(candidate.path),
        title: deriveArtifactTitle(candidate.path, content, candidate.decision.format),
        kind: candidate.decision.kind,
        format: candidate.decision.format,
        scope: candidate.decision.scope,
        sizeBytes: bytes.byteLength,
        modifiedAt: safeModifiedAt(candidate.file.lastModified),
        sha256: await sha256Hex(bytes),
        content,
      },
    };
  } catch (error) {
    if (error instanceof LocalWorkspaceError) throw error;
    return {
      skipReason: 'unreadable',
      detail: error instanceof Error ? `파일을 읽지 못했습니다: ${error.message}` : '파일을 읽지 못해 제외했습니다.',
    };
  }
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index]);
    }
  };

  const workerCount = Math.min(Math.max(1, concurrency), Math.max(1, values.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function buildCatalogItems(
  candidates: CandidateFile[],
  skipped: SkippedEntry[],
  skippedKeys: Set<string>,
): Promise<WorkspaceArtifactCatalogItem[]> {
  assertCandidateLimits(candidates);
  const results = await mapWithConcurrency(candidates, HASH_CONCURRENCY, readCandidate);
  const items: WorkspaceArtifactCatalogItem[] = [];

  results.forEach((result, index) => {
    if ('item' in result) {
      items.push(result.item);
      return;
    }
    addSkipped(
      skipped,
      skippedKeys,
      candidates[index].path,
      result.skipReason,
      result.detail,
      candidates[index].file.size,
    );
  });

  return items.sort((left, right) => left.path.localeCompare(right.path, 'en-US'));
}

function transactionCompleted(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function openHandleDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    throw new LocalWorkspaceError(
      'UNSUPPORTED_BROWSER',
      '이 브라우저에서는 프로젝트 폴더 연결 정보를 저장할 수 없습니다.',
    );
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DATABASE_NAME, HANDLE_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(HANDLE_STORE_NAME)) {
        database.createObjectStore(HANDLE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB를 열 수 없습니다.'));
    request.onblocked = () => reject(new Error('다른 탭에서 IndexedDB 갱신을 막고 있습니다.'));
  });
}

function ownerHandleKey(ownerKey: string): string {
  const normalized = ownerKey.trim();
  if (!normalized || normalized.length > 128 || /[\u0000-\u001f]/.test(normalized)) {
    throw new LocalWorkspaceError('HANDLE_STORAGE_FAILED', '프로젝트 연결 소유자 정보가 올바르지 않습니다.');
  }
  return `${PRIMARY_HANDLE_KEY_PREFIX}${normalized}`;
}

export function supportsFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && typeof (window as DirectoryPickerWindow).showDirectoryPicker === 'function';
}

export async function saveLocalWorkspaceHandle(
  handle: FileSystemDirectoryHandle,
  ownerKey: string,
): Promise<void> {
  if (!isDirectoryHandle(handle)) {
    throw new LocalWorkspaceError('HANDLE_STORAGE_FAILED', '저장할 프로젝트 폴더 연결 정보가 올바르지 않습니다.');
  }

  let database: IDBDatabase | null = null;
  try {
    database = await openHandleDatabase();
    const transaction = database.transaction(HANDLE_STORE_NAME, 'readwrite');
    const completed = transactionCompleted(transaction);
    transaction.objectStore(HANDLE_STORE_NAME).put(handle, ownerHandleKey(ownerKey));
    await completed;
  } catch (error) {
    if (error instanceof LocalWorkspaceError) throw error;
    throw new LocalWorkspaceError(
      'HANDLE_STORAGE_FAILED',
      '프로젝트 폴더 연결 정보를 브라우저에 저장하지 못했습니다.',
      error,
    );
  } finally {
    database?.close();
  }
}

export async function restoreLocalWorkspaceHandle(ownerKey: string): Promise<FileSystemDirectoryHandle | null> {
  let database: IDBDatabase | null = null;
  try {
    database = await openHandleDatabase();
    const transaction = database.transaction(HANDLE_STORE_NAME, 'readonly');
    const value = await requestResult(transaction.objectStore(HANDLE_STORE_NAME).get(ownerHandleKey(ownerKey)));
    return isDirectoryHandle(value) ? value : null;
  } catch (error) {
    if (error instanceof LocalWorkspaceError && error.code === 'UNSUPPORTED_BROWSER') return null;
    throw new LocalWorkspaceError(
      'HANDLE_RESTORE_FAILED',
      '저장된 프로젝트 폴더 연결 정보를 복구하지 못했습니다.',
      error,
    );
  } finally {
    database?.close();
  }
}

export async function clearLocalWorkspaceHandle(ownerKey: string): Promise<void> {
  let database: IDBDatabase | null = null;
  try {
    database = await openHandleDatabase();
    const transaction = database.transaction(HANDLE_STORE_NAME, 'readwrite');
    const completed = transactionCompleted(transaction);
    transaction.objectStore(HANDLE_STORE_NAME).delete(ownerHandleKey(ownerKey));
    await completed;
  } catch (error) {
    if (error instanceof LocalWorkspaceError && error.code === 'UNSUPPORTED_BROWSER') return;
    throw new LocalWorkspaceError(
      'HANDLE_STORAGE_FAILED',
      '저장된 프로젝트 폴더 연결 정보를 삭제하지 못했습니다.',
      error,
    );
  } finally {
    database?.close();
  }
}

export async function queryLocalWorkspacePermission(
  handle: FileSystemDirectoryHandle,
): Promise<PermissionState> {
  const queryPermission = (handle as PermissionCapableDirectoryHandle).queryPermission;
  if (!queryPermission) return 'granted';
  try {
    return await queryPermission.call(handle, { mode: 'read' });
  } catch {
    return 'prompt';
  }
}

export async function requestLocalWorkspacePermission(
  handle: FileSystemDirectoryHandle,
): Promise<PermissionState> {
  const currentPermission = await queryLocalWorkspacePermission(handle);
  if (currentPermission === 'granted') return currentPermission;

  const requestPermission = (handle as PermissionCapableDirectoryHandle).requestPermission;
  if (!requestPermission) return currentPermission;
  try {
    return await requestPermission.call(handle, { mode: 'read' });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'SecurityError') {
      throw new LocalWorkspaceError(
        'PERMISSION_REQUIRED',
        '프로젝트 폴더 권한은 버튼 클릭 직후 다시 요청해야 합니다.',
        error,
      );
    }
    throw new LocalWorkspaceError('PERMISSION_DENIED', '프로젝트 폴더 읽기 권한을 받지 못했습니다.', error);
  }
}

async function ensureLocalWorkspacePermission(
  handle: FileSystemDirectoryHandle,
  shouldRequest: boolean,
): Promise<void> {
  const permission = shouldRequest
    ? await requestLocalWorkspacePermission(handle)
    : await queryLocalWorkspacePermission(handle);

  if (permission === 'granted') return;
  if (permission === 'prompt') {
    throw new LocalWorkspaceError(
      'PERMISSION_REQUIRED',
      '프로젝트 폴더를 다시 연결하려면 읽기 권한을 허용해 주세요.',
    );
  }
  throw new LocalWorkspaceError('PERMISSION_DENIED', '프로젝트 폴더 읽기 권한이 거부되었습니다.');
}

export async function pickLocalWorkspaceDirectory(
  options: LocalWorkspacePickerOptions = {},
): Promise<FileSystemDirectoryHandle> {
  if (!supportsFileSystemAccess()) {
    throw new LocalWorkspaceError(
      'UNSUPPORTED_BROWSER',
      '이 브라우저는 폴더 연결을 지원하지 않습니다. 폴더 업로드 방식을 사용해 주세요.',
    );
  }

  try {
    const handle = await (window as DirectoryPickerWindow).showDirectoryPicker?.({
      id: options.pickerId ?? 'propig-workspace',
      mode: 'read',
    });
    if (!handle || !isDirectoryHandle(handle)) {
      throw new LocalWorkspaceError('SCAN_FAILED', '선택한 프로젝트 폴더를 열 수 없습니다.');
    }
    if (options.persist !== false) {
      if (!options.ownerKey) {
        throw new LocalWorkspaceError('HANDLE_STORAGE_FAILED', '프로젝트 연결을 저장할 관리자 정보가 없습니다.');
      }
      await saveLocalWorkspaceHandle(handle, options.ownerKey);
    }
    return handle;
  } catch (error) {
    if (error instanceof LocalWorkspaceError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new LocalWorkspaceError('PICKER_CANCELLED', '프로젝트 폴더 선택을 취소했습니다.', error);
    }
    throw new LocalWorkspaceError('SCAN_FAILED', '프로젝트 폴더를 선택하지 못했습니다.', error);
  }
}

async function validateDirectoryIdentity(
  handle: FileSystemDirectoryHandle,
  expectedPackageName: string | null,
): Promise<{ packageName: string; workspaceId: string }> {
  let packageFile: File;
  try {
    const packageHandle = await handle.getFileHandle('package.json');
    packageFile = await packageHandle.getFile();
  } catch (error) {
    throw new LocalWorkspaceError(
      'PACKAGE_NOT_FOUND',
      '선택한 폴더 루트에서 package.json을 찾지 못했습니다. Propig 프로젝트 루트를 선택해 주세요.',
      error,
    );
  }

  if (packageFile.size > LOCAL_WORKSPACE_LIMITS.maxFileBytes) {
    throw new LocalWorkspaceError('INVALID_PACKAGE', 'package.json 파일이 비정상적으로 큽니다.');
  }
  const packageName = parseAndValidatePackageJson(await packageFile.text(), expectedPackageName);
  let markerFile: File;
  try {
    const markerHandle = await handle.getFileHandle(WORKSPACE_MARKER_FILE_NAME);
    markerFile = await markerHandle.getFile();
  } catch (error) {
    throw new LocalWorkspaceError(
      'WORKSPACE_ID_NOT_FOUND',
      `프로젝트 루트에서 ${WORKSPACE_MARKER_FILE_NAME}을 찾지 못했습니다. 올바른 Propig 프로젝트를 선택해 주세요.`,
      error,
    );
  }
  if (markerFile.size > 4 * 1024) {
    throw new LocalWorkspaceError('INVALID_WORKSPACE_ID', `${WORKSPACE_MARKER_FILE_NAME} 파일이 비정상적으로 큽니다.`);
  }
  return { packageName, workspaceId: parseAndValidateWorkspaceMarker(await markerFile.text()) };
}

async function directoryEntries(
  handle: FileSystemDirectoryHandle,
): Promise<Array<[string, FileSystemHandle]>> {
  const entries = (handle as Partial<IterableDirectoryHandle>).entries;
  if (typeof entries !== 'function') {
    throw new LocalWorkspaceError(
      'UNSUPPORTED_BROWSER',
      '이 브라우저에서는 연결된 폴더의 파일 목록을 읽을 수 없습니다.',
    );
  }

  const values: Array<[string, FileSystemHandle]> = [];
  for await (const entry of entries.call(handle)) values.push(entry);
  return values.sort(([left], [right]) => left.localeCompare(right, 'en-US'));
}

async function isVisitedDirectory(
  candidate: FileSystemDirectoryHandle,
  visited: FileSystemDirectoryHandle[],
): Promise<boolean> {
  for (const previous of visited) {
    try {
      if (await candidate.isSameEntry(previous)) return true;
    } catch {
      // Some browsers expose directory handles without a working identity check.
    }
  }
  return false;
}

export async function scanLocalWorkspaceDirectory(
  handle: FileSystemDirectoryHandle,
  options: LocalWorkspaceScanOptions = {},
): Promise<WorkspaceArtifactCatalog> {
  if (!isDirectoryHandle(handle)) {
    throw new LocalWorkspaceError('SCAN_FAILED', '스캔할 프로젝트 폴더 정보가 올바르지 않습니다.');
  }

  await ensureLocalWorkspacePermission(handle, options.requestPermission !== false);
  const expectedPackageName = normalizeExpectedPackageName(options.expectedPackageName);
  const { packageName, workspaceId } = await validateDirectoryIdentity(handle, expectedPackageName);
  const candidates: CandidateFile[] = [];
  const candidatePaths = new Set<string>();
  const skipped: SkippedEntry[] = [];
  const skippedKeys = new Set<string>();
  const visitedDirectories: FileSystemDirectoryHandle[] = [handle];

  const walk = async (directory: FileSystemDirectoryHandle, parentPath: string): Promise<void> => {
    let entries: Array<[string, FileSystemHandle]>;
    try {
      entries = await directoryEntries(directory);
    } catch (error) {
      if (error instanceof LocalWorkspaceError) throw error;
      addSkipped(
        skipped,
        skippedKeys,
        parentPath || handle.name,
        'unreadable',
        '폴더 내용을 읽지 못해 제외했습니다.',
      );
      return;
    }

    for (const [entryName, entryHandle] of entries) {
      const rawPath = parentPath ? `${parentPath}/${entryName}` : entryName;
      let path: string;
      try {
        path = normalizeWorkspaceRelativePath(rawPath);
      } catch (error) {
        addSkipped(
          skipped,
          skippedKeys,
          rawPath,
          'invalid-path',
          error instanceof Error ? error.message : '잘못된 경로라 제외했습니다.',
        );
        continue;
      }

      if (entryHandle.kind === 'directory') {
        const blocked = getBlockedWorkspacePath(path);
        if (blocked) {
          addSkipped(skipped, skippedKeys, blocked.path, blocked.skipReason, blocked.reason);
          continue;
        }
        if (path.toLocaleLowerCase('en-US') === '.agents' && !options.includeLocalInstructions) {
          addSkipped(
            skipped,
            skippedKeys,
            '.agents',
            'ignored-path',
            '로컬 .agents 지침 포함 옵션이 꺼져 있어 제외했습니다.',
          );
          continue;
        }
        if (!shouldTraverseWorkspaceDirectory(path, options)) continue;

        const childDirectory = entryHandle as FileSystemDirectoryHandle;
        if (await isVisitedDirectory(childDirectory, visitedDirectories)) {
          addSkipped(
            skipped,
            skippedKeys,
            path,
            'ignored-path',
            'junction 또는 순환 참조 폴더라 제외했습니다.',
          );
          continue;
        }
        if (visitedDirectories.length >= MAX_VISITED_DIRECTORIES) {
          throw new LocalWorkspaceError(
            'SCAN_FAILED',
            '프로젝트 폴더 구조가 너무 복잡합니다. junction 또는 생성 폴더가 포함되어 있는지 확인해 주세요.',
          );
        }
        visitedDirectories.push(childDirectory);
        await walk(childDirectory, path);
        continue;
      }

      const decision = evaluateWorkspaceArtifactPath(path, options);
      if (!decision.included) {
        if (decision.report) {
          addSkipped(skipped, skippedKeys, decision.skipPath, decision.skipReason, decision.reason);
        }
        continue;
      }

      try {
        const file = await (entryHandle as FileSystemFileHandle).getFile();
        collectCandidate(
          decision.path,
          file,
          options,
          candidates,
          candidatePaths,
          skipped,
          skippedKeys,
        );
      } catch {
        addSkipped(
          skipped,
          skippedKeys,
          decision.path,
          'unreadable',
          '파일 읽기 권한이 없어 제외했습니다.',
        );
      }
    }
  };

  await walk(handle, '');
  const items = await buildCatalogItems(candidates, skipped, skippedKeys);
  return {
    workspaceId,
    rootName: handle.name || packageName,
    packageName,
    scannedAt: new Date().toISOString(),
    includeLocalInstructions: Boolean(options.includeLocalInstructions),
    items,
    skipped: skipped.sort((left, right) => left.path.localeCompare(right.path, 'en-US')),
  };
}

type FileListLayout = {
  packageFile: File;
  markerFile: File;
  rootName: string;
  files: Array<{ path: string; file: File }>;
};

function pickerPath(file: File): string {
  const relativePath = file.webkitRelativePath || file.name;
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized || /(?:^|\/)\.\.(?:\/|$)/.test(normalized)) {
    throw new LocalWorkspaceError('SCAN_FAILED', '선택한 파일 목록에 잘못된 상대 경로가 포함되어 있습니다.');
  }
  return normalized.split('/').filter(Boolean).join('/');
}

function resolveFileListLayout(source: FileList | readonly File[]): FileListLayout {
  if (source.length > MAX_FALLBACK_FILE_LIST_ENTRIES) {
    throw new LocalWorkspaceError(
      'TOO_MANY_FILES',
      `폴더 선택 대안은 전체 ${MAX_FALLBACK_FILE_LIST_ENTRIES.toLocaleString('ko-KR')}개 파일까지 확인할 수 있습니다. Chromium 브라우저의 ‘프로젝트 폴더 연결’을 사용해 주세요.`,
    );
  }
  const files = Array.from(source);
  if (files.length === 0) {
    throw new LocalWorkspaceError('PACKAGE_NOT_FOUND', '선택한 프로젝트 폴더에 파일이 없습니다.');
  }
  files.forEach(ensureBrowserFile);

  const withPickerPaths = files.map((file) => ({ file, pickerPath: pickerPath(file) }));
  const packageCandidates = withPickerPaths
    .filter(({ pickerPath: path }) => fileNameFromPath(path).toLocaleLowerCase('en-US') === 'package.json')
    .sort((left, right) => left.pickerPath.split('/').length - right.pickerPath.split('/').length);
  const rootPackage = packageCandidates[0];
  if (!rootPackage) {
    throw new LocalWorkspaceError(
      'PACKAGE_NOT_FOUND',
      '선택한 폴더 루트에서 package.json을 찾지 못했습니다. Propig 프로젝트 루트를 선택해 주세요.',
    );
  }

  const packageSegments = rootPackage.pickerPath.split('/');
  const rootSegments = packageSegments.slice(0, -1);
  const rootPrefix = rootSegments.join('/');
  const rootName = rootSegments.at(-1) ?? '';
  const normalizedFiles: Array<{ path: string; file: File }> = [];

  for (const entry of withPickerPaths) {
    let relativePath = entry.pickerPath;
    if (rootPrefix) {
      if (relativePath === rootPrefix || !relativePath.startsWith(`${rootPrefix}/`)) continue;
      relativePath = relativePath.slice(rootPrefix.length + 1);
    }
    if (!relativePath) continue;
    normalizedFiles.push({ path: normalizeWorkspaceRelativePath(relativePath), file: entry.file });
  }

  const markerFile = normalizedFiles.find(
    (entry) => entry.path.toLocaleLowerCase('en-US') === WORKSPACE_MARKER_FILE_NAME,
  )?.file;
  if (!markerFile) {
    throw new LocalWorkspaceError(
      'WORKSPACE_ID_NOT_FOUND',
      `선택한 폴더 루트에서 ${WORKSPACE_MARKER_FILE_NAME}을 찾지 못했습니다.`,
    );
  }

  return { packageFile: rootPackage.file, markerFile, rootName, files: normalizedFiles };
}

export async function scanLocalWorkspaceFileList(
  source: FileList | readonly File[],
  options: LocalWorkspaceScanOptions = {},
): Promise<WorkspaceArtifactCatalog> {
  const layout = resolveFileListLayout(source);
  if (layout.packageFile.size > LOCAL_WORKSPACE_LIMITS.maxFileBytes) {
    throw new LocalWorkspaceError('INVALID_PACKAGE', 'package.json 파일이 비정상적으로 큽니다.');
  }

  const expectedPackageName = normalizeExpectedPackageName(options.expectedPackageName);
  const packageName = parseAndValidatePackageJson(await layout.packageFile.text(), expectedPackageName);
  const workspaceId = parseAndValidateWorkspaceMarker(await layout.markerFile.text());
  const candidates: CandidateFile[] = [];
  const candidatePaths = new Set<string>();
  const skipped: SkippedEntry[] = [];
  const skippedKeys = new Set<string>();

  for (const entry of layout.files.sort((left, right) => left.path.localeCompare(right.path, 'en-US'))) {
    if (
      entry.path.toLocaleLowerCase('en-US') === 'package.json' ||
      entry.path.toLocaleLowerCase('en-US') === WORKSPACE_MARKER_FILE_NAME
    ) continue;
    collectCandidate(
      entry.path,
      entry.file,
      options,
      candidates,
      candidatePaths,
      skipped,
      skippedKeys,
    );
  }

  const items = await buildCatalogItems(candidates, skipped, skippedKeys);
  return {
    workspaceId,
    rootName: layout.rootName || packageName,
    packageName,
    scannedAt: new Date().toISOString(),
    includeLocalInstructions: Boolean(options.includeLocalInstructions),
    items,
    skipped: skipped.sort((left, right) => left.path.localeCompare(right.path, 'en-US')),
  };
}

export async function scanLocalWorkspace(
  source: LocalWorkspaceSource,
  options: LocalWorkspaceScanOptions = {},
): Promise<WorkspaceArtifactCatalog> {
  if (isDirectoryHandle(source)) return scanLocalWorkspaceDirectory(source, options);
  if (source && typeof source.length === 'number') return scanLocalWorkspaceFileList(source, options);
  throw new LocalWorkspaceError('SCAN_FAILED', '스캔할 프로젝트 폴더 또는 파일 목록이 올바르지 않습니다.');
}

export async function selectAndScanLocalWorkspace(
  scanOptions: LocalWorkspaceScanOptions = {},
  pickerOptions: LocalWorkspacePickerOptions = {},
): Promise<{ handle: FileSystemDirectoryHandle; catalog: WorkspaceArtifactCatalog }> {
  const handle = await pickLocalWorkspaceDirectory({ ...pickerOptions, persist: false });
  const catalog = await scanLocalWorkspaceDirectory(handle, scanOptions);
  if (pickerOptions.persist !== false) {
    if (!pickerOptions.ownerKey) {
      throw new LocalWorkspaceError('HANDLE_STORAGE_FAILED', '프로젝트 연결을 저장할 관리자 정보가 없습니다.');
    }
    await saveLocalWorkspaceHandle(handle, pickerOptions.ownerKey);
  }
  return { handle, catalog };
}
