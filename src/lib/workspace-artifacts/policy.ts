import type {
  WorkspaceArtifactCatalogItem,
  WorkspaceArtifactSkipReason,
} from '@/types/workspaceArtifact';

export const LOCAL_WORKSPACE_LIMITS = Object.freeze({
  maxPathLength: 240,
  maxFileBytes: 700 * 1024,
  maxFileCount: 800,
  maxTotalBytes: 25 * 1024 * 1024,
});

export const DEFAULT_LOCAL_WORKSPACE_PACKAGE_NAME = 'propig';

type WorkspaceArtifactFormat = WorkspaceArtifactCatalogItem['format'];
type WorkspaceArtifactKind = WorkspaceArtifactCatalogItem['kind'];
type WorkspaceArtifactScope = WorkspaceArtifactCatalogItem['scope'];

export type WorkspacePolicyOptions = {
  includeLocalInstructions?: boolean;
};

export type WorkspacePathBlock = {
  path: string;
  skipReason: WorkspaceArtifactSkipReason;
  reason: string;
};

export type WorkspacePathDecision =
  | {
      included: true;
      path: string;
      format: WorkspaceArtifactFormat;
      kind: WorkspaceArtifactKind;
      scope: WorkspaceArtifactScope;
    }
  | {
      included: false;
      path: string;
      reason: string;
      skipReason: WorkspaceArtifactSkipReason;
      report: boolean;
      skipPath: string;
    };

const FORMAT_BY_EXTENSION: Readonly<Record<string, WorkspaceArtifactFormat>> = Object.freeze({
  md: 'markdown',
  mdx: 'markdown',
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  txt: 'text',
});

const GENERATED_DIRECTORY_NAMES = new Set([
  '.firebase',
  '.next',
  '.next-qa',
  '.next-static-export',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
]);

const LOCAL_PRIVATE_DIRECTORY_NAMES = new Set([
  '.agent',
  '.claude',
  '.codex',
  '.codex-review',
  '.codex-server-logs',
  '.git',
  '.hg',
  '.idea',
  '.playwright-mcp',
  '.svn',
  '.vscode',
]);

const BLOCKED_PATH_PREFIXES: ReadonlyArray<{
  prefix: string;
  skipReason: WorkspaceArtifactSkipReason;
  reason: string;
}> = [
  {
    prefix: 'functions/lib',
    skipReason: 'generated-file',
    reason: '컴파일된 Functions 산출물이라 제외했습니다.',
  },
  {
    prefix: 'android/app/build',
    skipReason: 'generated-file',
    reason: 'Android 빌드 산출물이라 제외했습니다.',
  },
  {
    prefix: 'android/app/src/main/assets/public',
    skipReason: 'generated-file',
    reason: '정적 배포 파일의 Android 복제본이라 제외했습니다.',
  },
  {
    prefix: 'ios/app/app/public',
    skipReason: 'generated-file',
    reason: '정적 배포 파일의 iOS 복제본이라 제외했습니다.',
  },
];

const SENSITIVE_FILE_NAMES = new Set([
  '.netrc',
  '.npmrc',
  '.yarnrc',
  'credentials.json',
  'id_ed25519',
  'id_rsa',
  'service-account.json',
  'service-account-key.json',
  'serviceaccount.json',
  'serviceaccountkey.json',
]);

const SENSITIVE_FILE_EXTENSIONS = new Set([
  'cer',
  'crt',
  'jks',
  'key',
  'keystore',
  'p12',
  'pem',
  'pfx',
]);

function pathSegments(path: string): string[] {
  return path.split('/').filter(Boolean);
}

function startsWithPath(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function fileExtension(path: string): string {
  const name = pathSegments(path).at(-1) ?? '';
  const dotIndex = name.lastIndexOf('.');
  return dotIndex > 0 ? name.slice(dotIndex + 1).toLocaleLowerCase('en-US') : '';
}

function isSensitiveFile(path: string): boolean {
  const name = pathSegments(path).at(-1)?.toLocaleLowerCase('en-US') ?? '';
  if (!name) return false;
  if (name === '.env' || name.startsWith('.env.')) return true;
  if (SENSITIVE_FILE_NAMES.has(name)) return true;
  if (SENSITIVE_FILE_EXTENSIONS.has(fileExtension(name))) return true;
  return /(?:^|[-_.])(credentials?|private[-_.]?key|secrets?|service[-_.]?account)(?:[-_.]|$)/i.test(name);
}

export function normalizeWorkspaceRelativePath(input: string): string {
  const normalizedSlashes = input.replace(/\\/g, '/');

  if (!normalizedSlashes || normalizedSlashes.includes('\0')) {
    throw new Error('비어 있거나 잘못된 프로젝트 경로입니다.');
  }
  if (/^(?:[a-zA-Z]:|\/)/.test(normalizedSlashes)) {
    throw new Error('프로젝트 내부의 상대 경로만 사용할 수 있습니다.');
  }

  const segments = normalizedSlashes.split('/').filter((segment) => segment && segment !== '.');
  if (segments.length === 0 || segments.some((segment) => segment === '..')) {
    throw new Error('상위 폴더로 이동하는 경로는 사용할 수 없습니다.');
  }
  if (segments.some((segment) => /[\u0000-\u001f]/.test(segment))) {
    throw new Error('제어 문자가 포함된 프로젝트 경로는 사용할 수 없습니다.');
  }

  return segments.join('/');
}

export function getWorkspaceArtifactFormat(path: string): WorkspaceArtifactFormat | null {
  return FORMAT_BY_EXTENSION[fileExtension(path)] ?? null;
}

export function getBlockedWorkspacePath(path: string): WorkspacePathBlock | null {
  const normalizedPath = normalizeWorkspaceRelativePath(path);
  const lowerPath = normalizedPath.toLocaleLowerCase('en-US');
  const segments = pathSegments(lowerPath);

  for (const blocked of BLOCKED_PATH_PREFIXES) {
    if (startsWithPath(lowerPath, blocked.prefix)) {
      return { path: blocked.prefix, skipReason: blocked.skipReason, reason: blocked.reason };
    }
  }

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const blockedPath = segments.slice(0, index + 1).join('/');

    if (segment.startsWith('.tmp-')) {
      return {
        path: blockedPath,
        skipReason: 'generated-file',
        reason: '임시 검증 폴더라 제외했습니다.',
      };
    }
    if (GENERATED_DIRECTORY_NAMES.has(segment)) {
      return {
        path: blockedPath,
        skipReason: 'generated-file',
        reason: '빌드 또는 생성 산출물 폴더라 제외했습니다.',
      };
    }
    if (LOCAL_PRIVATE_DIRECTORY_NAMES.has(segment)) {
      return {
        path: blockedPath,
        skipReason: segment === '.agent' || segment === '.git' ? 'ignored-path' : 'sensitive-file',
        reason:
          segment === '.agent'
            ? '.agents를 가리킬 수 있는 junction 폴더라 제외했습니다.'
            : '민감한 로컬 도구 설정 폴더라 제외했습니다.',
      };
    }
  }

  if (isSensitiveFile(lowerPath)) {
    return {
      path: normalizedPath,
      skipReason: 'sensitive-file',
      reason: '비밀키 또는 로컬 인증정보일 수 있어 제외했습니다.',
    };
  }

  return null;
}

export function isLocalInstructionPath(path: string): boolean {
  const lowerPath = normalizeWorkspaceRelativePath(path).toLocaleLowerCase('en-US');
  return startsWithPath(lowerPath, '.agents');
}

export function isWorkspacePackageManifest(path: string): boolean {
  return normalizeWorkspaceRelativePath(path).toLocaleLowerCase('en-US') === 'package.json';
}

function isDefaultWorkspaceFile(path: string, format: WorkspaceArtifactFormat): boolean {
  const lowerPath = path.toLocaleLowerCase('en-US');
  const segments = pathSegments(lowerPath);

  if (segments.length === 1) return format === 'markdown';
  if (startsWithPath(lowerPath, 'docs')) return format === 'markdown';
  if (startsWithPath(lowerPath, 'src/agents')) return true;
  if (startsWithPath(lowerPath, 'functions/src/agents')) return true;
  if (lowerPath === 'functions/src/agentrunner.ts') return true;
  return startsWithPath(lowerPath, 'functions/src/skills');
}

export function classifyWorkspaceArtifactScope(path: string): WorkspaceArtifactScope {
  const lowerPath = normalizeWorkspaceRelativePath(path).toLocaleLowerCase('en-US');
  if (startsWithPath(lowerPath, '.agents')) return 'local-tooling';
  if (startsWithPath(lowerPath, 'functions/src')) return 'cloud-runtime';
  if (startsWithPath(lowerPath, 'src/agents')) return 'web-library';
  return 'project-doc';
}

export function classifyWorkspaceArtifactKind(
  path: string,
  format = getWorkspaceArtifactFormat(path),
): WorkspaceArtifactKind {
  const lowerPath = normalizeWorkspaceRelativePath(path).toLocaleLowerCase('en-US');
  const name = pathSegments(lowerPath).at(-1) ?? lowerPath;

  if (
    lowerPath.includes('orchestrator') ||
    lowerPath.includes('agentmanager') ||
    lowerPath.includes('subagentrouter') ||
    lowerPath === 'functions/src/agentrunner.ts'
  ) {
    return 'orchestrator';
  }
  if (lowerPath.includes('workflowengine') || startsWithPath(lowerPath, 'src/agents/workflow')) {
    return 'workflow';
  }
  if (lowerPath.includes('/prompts/') || name.includes('prompt')) return 'prompt';
  if (
    startsWithPath(lowerPath, '.agents/skills') ||
    startsWithPath(lowerPath, 'functions/src/skills') ||
    name === 'skill.md'
  ) {
    return 'skill';
  }
  if (
    name === 'agent.md' ||
    name === 'agents.md' ||
    name.includes('agent-documentation') ||
    name.includes('readme-agents')
  ) {
    return 'guideline';
  }
  if (
    startsWithPath(lowerPath, '.agents') ||
    startsWithPath(lowerPath, 'src/agents') ||
    startsWithPath(lowerPath, 'functions/src/agents') ||
    startsWithPath(lowerPath, 'functions/src/skills')
  ) {
    return 'agent';
  }
  if (format === 'json' || format === 'yaml' || format === 'toml') return 'config';
  if (format === 'markdown') return 'markdown';
  return 'other';
}

export function evaluateWorkspaceArtifactPath(
  path: string,
  options: WorkspacePolicyOptions = {},
): WorkspacePathDecision {
  let normalizedPath: string;
  try {
    normalizedPath = normalizeWorkspaceRelativePath(path);
  } catch (error) {
    const reason = error instanceof Error ? error.message : '잘못된 프로젝트 경로라 제외했습니다.';
    return {
      included: false,
      path,
      reason,
      skipReason: 'invalid-path',
      report: true,
      skipPath: path || '(빈 경로)',
    };
  }

  const blocked = getBlockedWorkspacePath(normalizedPath);
  if (blocked) {
    return {
      included: false,
      path: normalizedPath,
      reason: blocked.reason,
      skipReason: blocked.skipReason,
      report: true,
      skipPath: blocked.path,
    };
  }

  const localInstructions = isLocalInstructionPath(normalizedPath);
  if (localInstructions && !options.includeLocalInstructions) {
    return {
      included: false,
      path: normalizedPath,
      reason: '로컬 .agents 지침 포함 옵션이 꺼져 있어 제외했습니다.',
      skipReason: 'ignored-path',
      report: true,
      skipPath: '.agents',
    };
  }

  const format = getWorkspaceArtifactFormat(normalizedPath);
  const inManagedScope = localInstructions || (format !== null && isDefaultWorkspaceFile(normalizedPath, format));
  if (!inManagedScope) {
    const lowerPath = normalizedPath.toLocaleLowerCase('en-US');
    const potentiallyManaged =
      localInstructions ||
      startsWithPath(lowerPath, 'src/agents') ||
      startsWithPath(lowerPath, 'functions/src/agents') ||
      startsWithPath(lowerPath, 'functions/src/skills');
    return {
      included: false,
      path: normalizedPath,
      reason: format ? '기본 관리 범위 밖의 파일입니다.' : '지원하지 않는 텍스트 형식입니다.',
      skipReason: format ? 'ignored-path' : 'unsupported-format',
      report: potentiallyManaged,
      skipPath: normalizedPath,
    };
  }

  if (!format) {
    return {
      included: false,
      path: normalizedPath,
      reason: '지원하지 않는 텍스트 형식입니다.',
      skipReason: 'unsupported-format',
      report: true,
      skipPath: normalizedPath,
    };
  }

  return {
    included: true,
    path: normalizedPath,
    format,
    kind: classifyWorkspaceArtifactKind(normalizedPath, format),
    scope: classifyWorkspaceArtifactScope(normalizedPath),
  };
}

export function shouldTraverseWorkspaceDirectory(
  path: string,
  options: WorkspacePolicyOptions = {},
): boolean {
  const normalizedPath = normalizeWorkspaceRelativePath(path);
  if (getBlockedWorkspacePath(normalizedPath)) return false;

  const lowerPath = normalizedPath.toLocaleLowerCase('en-US');
  if (startsWithPath(lowerPath, '.agents')) return Boolean(options.includeLocalInstructions);
  if (lowerPath === 'docs' || startsWithPath(lowerPath, 'docs')) return true;
  if (lowerPath === 'src' || lowerPath === 'src/agents' || startsWithPath(lowerPath, 'src/agents')) return true;
  if (lowerPath === 'functions' || lowerPath === 'functions/src') return true;
  if (
    lowerPath === 'functions/src/agents' ||
    startsWithPath(lowerPath, 'functions/src/agents') ||
    lowerPath === 'functions/src/skills' ||
    startsWithPath(lowerPath, 'functions/src/skills')
  ) {
    return true;
  }
  return false;
}
