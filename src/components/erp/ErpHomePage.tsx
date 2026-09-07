'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import {
  Activity,
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  CalendarCheck,
  ChevronRight,
  CheckCircle2,
  Cloud,
  CloudOff,
  Command,
  Clock3,
  Database,
  FileText,
  Gauge,
  HardDrive,
  History,
  Images,
  MenuSquare,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  UsersRound,
  WandSparkles,
  X,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import styled, { keyframes } from 'styled-components';
import { getSwitchableSiteEntries } from '@/constants/accountMenu';
import { CORP_PAGE_DEFINITIONS } from '@/constants/corpPages';
import { PROPIG_AVAILABLE_STORE_APPS, PROPIG_STORE_APPS } from '@/constants/propigStore';
import { useAuth } from '@/contexts/AuthContext';
import { useMenuContext } from '@/contexts/MenuContext';
import { usePropigAppRegistry } from '@/hooks/usePropigAppRegistry';
import { recordActivityLog } from '@/services/activityLogService';
import type { ActivityLogRecord, ActivityLogsResponse } from '@/types/activityLog';
import type { MenuItem, SiteData } from '@/types/menu';
import type { AdminStorageFile, AdminStorageListResponse } from '@/types/storageBrowser';
import type { AdminUsersResponse, ManagedUserRecord } from '@/types/userAccess';
import { canAccessSiteMode, filterMenuItemsForAccess } from '@/utils/menuAccess';
import {
  ERP_RECENT_COMMANDS_STORAGE_KEY,
  RECENT_COMMAND_LIMIT,
  moveHrefToFront,
  readStoredHrefList,
  useErpHomePersonalization,
  writeStoredHrefList,
  type ModuleDomain,
  type PreferenceSyncState,
} from './useErpHomePersonalization';

type Tone = 'blue' | 'green' | 'amber' | 'rose' | 'violet' | 'teal';
type CurrentUser = NonNullable<ReturnType<typeof useAuth>['currentUser']>;
type ActivityReadinessState = 'restricted' | 'loading' | 'error' | 'empty' | 'ready';

interface MetricItem {
  label: string;
  value: string;
  detail: string;
  tone: Tone;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
}

interface ModuleItem {
  title: string;
  summary: string;
  href: string;
  status: string;
  domain: ModuleDomain;
  tone: Tone;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
}

interface WorkQueueItem {
  label: string;
  owner: string;
  due: string;
  tone: Tone;
}

interface UsageInsightItem {
  key: string;
  label: string;
  detail: string;
  href: string | null;
  action: string;
  count: number;
  tone: Tone;
}

interface SignalItemData {
  label: string;
  value: string;
  tone: Tone;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
}

interface AccessState {
  title: string;
  detail: string;
  tone: Tone;
}

type CommandGroup = 'admin' | 'content' | 'workflow' | 'records';
type CommandFilter = 'all' | CommandGroup;

interface CommandItem {
  id: string;
  title: string;
  description: string;
  href: string;
  source: string;
  group: CommandGroup;
  keywords: string[];
  tone: Tone;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  priority: number;
}

interface RecordSearchData {
  users: ManagedUserRecord[];
  files: AdminStorageFile[];
  logs: ActivityLogRecord[];
}

interface RecordSearchState extends RecordSearchData {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
}

interface LauncherRecordSearchParams {
  currentUser: CurrentUser;
  canSearchUsers: boolean;
  canSearchStorage: boolean;
  canSearchLogs: boolean;
  signal: AbortSignal;
}

const EMPTY_RECORD_SEARCH_DATA: RecordSearchData = {
  users: [],
  files: [],
  logs: [],
};
const EMPTY_ACTIVITY_LOGS: ActivityLogRecord[] = [];

const HOME_ACTIVITY_LOG_LIMIT = 30;
const HOME_RECENT_ACTIVITY_DISPLAY_LIMIT = 5;
const HOME_ACTIVITY_LOGS_QUERY_KEY = 'erp-home-activity-logs';

const INITIAL_RECORD_SEARCH_STATE: RecordSearchState = {
  ...EMPTY_RECORD_SEARCH_DATA,
  status: 'idle',
  error: null,
};

function getPreferenceSyncTone(state: PreferenceSyncState): Tone {
  if (state === 'synced') return 'green';
  if (state === 'checking' || state === 'syncing') return 'amber';
  if (state === 'error') return 'rose';
  return 'teal';
}

function PreferenceSyncStatusIcon({ state }: { state: PreferenceSyncState }) {
  if (state === 'synced') return <Cloud size={13} />;
  if (state === 'error') return <CloudOff size={13} />;
  if (state === 'checking' || state === 'syncing') return <Clock3 size={13} />;
  return <HardDrive size={13} />;
}

const coreModules: ModuleItem[] = [
  {
    title: '통합 메뉴 관리',
    summary: '사이트별 메뉴, 권한, 노출 상태를 한 화면에서 정리합니다.',
    href: '/admin/menu',
    status: '권한/IA',
    domain: 'admin',
    tone: 'blue',
    icon: MenuSquare,
  },
  {
    title: '사용자 관리',
    summary: '역할, 직책, 메뉴 접근 권한을 운영 정책에 맞게 조정합니다.',
    href: '/admin/users',
    status: '계정',
    domain: 'admin',
    tone: 'green',
    icon: UsersRound,
  },
  {
    title: '작업 히스토리',
    summary: '관리자 변경과 주요 운영 이벤트를 감사 로그로 확인합니다.',
    href: '/admin/activity-logs',
    status: '감사',
    domain: 'admin',
    tone: 'violet',
    icon: Clock3,
  },
  {
    title: 'Storage',
    summary: 'Firebase Storage 파일과 폴더를 업무 드라이브처럼 탐색합니다.',
    href: '/admin/storage',
    status: '파일',
    domain: 'admin',
    tone: 'teal',
    icon: HardDrive,
  },
  {
    title: '사진 관리',
    summary: '브랜드 이미지, 앨범, 변환 작업을 콘텐츠 운영 기준으로 묶습니다.',
    href: '/admin/photos',
    status: '미디어',
    domain: 'admin',
    tone: 'rose',
    icon: Images,
  },
  {
    title: 'AI 설정',
    summary: 'AI 모델, API 키, 적용 대상 페이지를 운영 정책에 맞게 조정합니다.',
    href: '/admin/openrouter-settings',
    status: 'AI 설정',
    domain: 'ai',
    tone: 'violet',
    icon: Sparkles,
  },
  {
    title: 'AI 비디오 스튜디오',
    summary: '영상 생성 작업, 클립, 프로젝트 타임라인을 운영 단위로 관리합니다.',
    href: '/admin/video-studio',
    status: 'AI 영상',
    domain: 'ai',
    tone: 'teal',
    icon: WandSparkles,
  },
  {
    title: 'AI 스토리보드',
    summary: '장면 구상부터 이미지·영상 제작 흐름까지 하나의 보드에서 관리합니다.',
    href: '/admin/storyboard',
    status: 'AI 제작',
    domain: 'ai',
    tone: 'blue',
    icon: WandSparkles,
  },
];

const businessModules: ModuleItem[] = [
  {
    title: '기업 사이트',
    summary: '회사소개, 기술, 사업 영역, 구성원 소개 콘텐츠를 검토합니다.',
    href: '/corp',
    status: '브랜드',
    domain: 'corporate',
    tone: 'blue',
    icon: Building2,
  },
  {
    title: '프로젝트 보드',
    summary: '진행 중인 과제, 목표, 실행 계획을 프로젝트 카드로 관리합니다.',
    href: '/corp/project',
    status: 'PM',
    domain: 'corporate',
    tone: 'green',
    icon: BriefcaseBusiness,
  },
  {
    title: 'propig 대시보드',
    summary: '메모, 습관, 버킷리스트, 할 일을 개인 업무 흐름으로 연결합니다.',
    href: '/propig',
    status: '업무',
    domain: 'workflow',
    tone: 'amber',
    icon: Target,
  },
  {
    title: '할일 일정표',
    summary: '반복 일정과 오늘 처리할 업무를 캘린더 중심으로 정리합니다.',
    href: '/todo-list',
    status: '일정',
    domain: 'workflow',
    tone: 'rose',
    icon: CalendarCheck,
  },
];

const MODULE_DOMAIN_FILTERS: Array<{
  value: ModuleDomain;
  label: string;
  summary: string;
  tone: Tone;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
}> = [
  {
    value: 'admin',
    label: 'Admin',
    summary: '권한, 메뉴, 파일, 감사 기록을 먼저 정리합니다.',
    tone: 'blue',
    icon: ShieldCheck,
  },
  {
    value: 'corporate',
    label: 'Corporate',
    summary: '기업 콘텐츠와 프로젝트 흐름을 검토합니다.',
    tone: 'green',
    icon: Building2,
  },
  {
    value: 'workflow',
    label: 'Personal Workflow',
    summary: '개인 업무 도구와 반복 실행 루틴을 엽니다.',
    tone: 'amber',
    icon: Target,
  },
  {
    value: 'ai',
    label: 'AI Operations',
    summary: '생성형 AI 설정과 이미지/영상 제작 흐름을 관리합니다.',
    tone: 'violet',
    icon: Sparkles,
  },
];

function countModulesByDomain(modules: ModuleItem[]): Record<ModuleDomain, number> {
  return modules.reduce<Record<ModuleDomain, number>>(
    (counts, module) => {
      counts[module.domain] += 1;
      return counts;
    },
    {
      admin: 0,
      corporate: 0,
      workflow: 0,
      ai: 0,
    },
  );
}

const EMPTY_MODULE_DOMAIN_COUNTS: Record<ModuleDomain, number> = {
    admin: 0,
    corporate: 0,
    workflow: 0,
    ai: 0,
};

const COMMAND_FILTERS: Array<{ value: CommandFilter; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'admin', label: '관리' },
  { value: 'content', label: '콘텐츠' },
  { value: 'workflow', label: '업무' },
  { value: 'records', label: '기록' },
];

const OPERATING_COMMANDS: CommandItem[] = [
  {
    id: 'records-users',
    title: '사용자/권한 검색',
    description: '사용자 역할, 직책, 사이트 접근 권한을 확인합니다.',
    href: '/admin/users',
    source: 'Users',
    group: 'records',
    keywords: ['user', 'users', '계정', '권한', '역할', '직책', 'access'],
    tone: 'green',
    icon: UsersRound,
    priority: 4,
  },
  {
    id: 'records-files',
    title: '파일/스토리지 검색',
    description: 'Firebase Storage 폴더와 파일 운영 화면으로 이동합니다.',
    href: '/admin/storage',
    source: 'Files',
    group: 'records',
    keywords: ['file', 'files', 'storage', '스토리지', '폴더', '버킷', '이미지'],
    tone: 'teal',
    icon: HardDrive,
    priority: 5,
  },
  {
    id: 'records-activity',
    title: '최근 작업 히스토리',
    description: '관리자 변경과 주요 운영 이벤트를 확인합니다.',
    href: '/admin/activity-logs',
    source: 'Recent Work',
    group: 'records',
    keywords: ['activity', 'logs', 'history', '최근', '작업', '감사', '로그'],
    tone: 'violet',
    icon: Clock3,
    priority: 6,
  },
];

const CORP_CONTENT_GROUP_COUNT = new Set(CORP_PAGE_DEFINITIONS.map((page) => page.category)).size;

function toneStyle(tone: Tone): CSSProperties {
  const palette: Record<Tone, CSSProperties> = {
    blue: { '--tone': '#5ba7ff', '--tone-soft': 'rgba(91, 167, 255, 0.15)' } as CSSProperties,
    green: { '--tone': '#47d18c', '--tone-soft': 'rgba(71, 209, 140, 0.15)' } as CSSProperties,
    amber: { '--tone': '#f5b84b', '--tone-soft': 'rgba(245, 184, 75, 0.16)' } as CSSProperties,
    rose: { '--tone': '#f87171', '--tone-soft': 'rgba(248, 113, 113, 0.14)' } as CSSProperties,
    violet: { '--tone': '#a78bfa', '--tone-soft': 'rgba(167, 139, 250, 0.15)' } as CSSProperties,
    teal: { '--tone': '#2dd4bf', '--tone-soft': 'rgba(45, 212, 191, 0.15)' } as CSSProperties,
  };

  return palette[tone];
}

function collectMenuItems(items: MenuItem[]): MenuItem[] {
  const result: MenuItem[] = [];

  for (const item of items) {
    if (item.hidden) continue;
    result.push(item);

    if (Array.isArray(item.sub)) {
      result.push(...collectMenuItems(item.sub.filter((subItem): subItem is MenuItem => typeof subItem !== 'string')));
    }
  }

  return result;
}

function countVisibleMenuLinks(items: MenuItem[]): number {
  return collectMenuItems(items).filter((item) => item.type !== 'divider' && Boolean(item.path)).length;
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase('ko-KR');
}

function createQueryHref(path: string, params: Record<string, string | null | undefined>): string {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    const trimmedValue = value?.trim();
    if (trimmedValue) searchParams.set(key, trimmedValue);
  });

  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

function formatCommandBytes(bytes: number | null | undefined): string {
  if (!Number.isFinite(bytes ?? 0) || !bytes || bytes <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const fractionDigits = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`;
}

function formatCommandDate(value: string | null | undefined): string {
  if (!value) return '날짜 없음';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '날짜 없음';

  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getActivityTargetLabel(log: ActivityLogRecord): string {
  return log.target.label || log.target.path || log.target.id || log.target.type;
}

function getActivityActionLabel(action: string): string {
  const labels: Record<string, string> = {
    'feedback.open': '피드백',
    'menu.save': '메뉴 저장',
    'admin.menu.update': '메뉴 업데이트',
    'admin.user.update': '사용자 권한 변경',
    'admin.storage.folder.create': 'Storage 폴더 생성',
    'admin.storage.file.upload': 'Storage 업로드',
    'erp_home.module_opened': 'ERP 홈 모듈 이동',
    'erp_home.command_executed': 'ERP 홈 명령 실행',
  };

  return labels[action] ?? action;
}

function getActivityScopeQuery(action: string): string | null {
  if (action === 'erp_home.module_opened') return 'module-opened';
  if (action === 'erp_home.command_executed') return 'command-executed';
  return null;
}

function readLogMetadataString(log: ActivityLogRecord, key: string): string | null {
  const value = log.metadata?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function createUsageInsights(logs: ActivityLogRecord[]): UsageInsightItem[] {
  const insights = new Map<string, UsageInsightItem>();

  for (const log of logs) {
    if (log.action !== 'erp_home.module_opened' && log.action !== 'erp_home.command_executed') continue;

    const href = log.target.path && log.target.path.startsWith('/') ? log.target.path : null;
    const id = log.target.id || href || log.target.label || log.action;
    const key = `${log.action}:${id}`;
    const existing = insights.get(key);

    if (existing) {
      existing.count += 1;
      continue;
    }

    const isCommand = log.action === 'erp_home.command_executed';
    const group = readLogMetadataString(log, isCommand ? 'group' : 'domain');
    insights.set(key, {
      key,
      label: log.target.label || id,
      detail: isCommand ? `${group ?? 'command'} · 명령 실행` : `${group ?? 'module'} · 모듈 이동`,
      href,
      action: log.action,
      count: 1,
      tone: isCommand ? 'violet' : 'teal',
    });
  }

  return [...insights.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko-KR')).slice(0, 3);
}

function getRecordSearchText(command: CommandItem): string {
  return [command.title, command.description, command.href, command.source, ...command.keywords].join(' ');
}

function getSiteCommandGroup(siteId: string): CommandGroup {
  if (siteId === 'admin') return 'admin';
  if (siteId === 'corp') return 'content';
  return 'workflow';
}

function getQueueCommandHref(owner: string): string {
  if (owner === 'Access') return '/admin/users';
  if (owner === 'Admin' || owner === 'UX') return '/admin/menu';
  if (owner === 'Product' || owner === 'Workflow') return '/propig/store';
  if (owner === 'Platform') return '/admin/activity-logs';
  return '/';
}

function createModuleCommandItems(modules: ModuleItem[], group: CommandGroup, priorityOffset: number): CommandItem[] {
  return modules.map((module, index) => ({
    id: `module-${group}-${module.href}`,
    title: module.title,
    description: module.summary,
    href: module.href,
    source: module.status,
    group,
    keywords: [module.title, module.summary, module.status, module.href],
    tone: module.tone,
    icon: module.icon,
    priority: priorityOffset + index,
  }));
}

function createMenuCommandItems(siteEntries: Array<[string, SiteData]>): CommandItem[] {
  const commands: CommandItem[] = [];

  for (const [siteId, site] of siteEntries) {
    for (const item of collectMenuItems(site.menu)) {
      if (!item.path || item.type === 'divider') continue;

      commands.push({
        id: `menu-${siteId}-${item.id}`,
        title: item.text,
        description: `${site.name} 메뉴 · ${item.path}`,
        href: item.path,
        source: site.name,
        group: getSiteCommandGroup(siteId),
        keywords: [siteId, site.name, item.text, item.path, String(item.badge ?? ''), item.icon ?? ''],
        tone: getSiteCommandGroup(siteId) === 'admin' ? 'blue' : getSiteCommandGroup(siteId) === 'content' ? 'rose' : 'amber',
        icon: getSiteCommandGroup(siteId) === 'admin' ? MenuSquare : getSiteCommandGroup(siteId) === 'content' ? Building2 : Target,
        priority: 20,
      });
    }
  }

  return commands;
}

function createCorpCommandItems(): CommandItem[] {
  return CORP_PAGE_DEFINITIONS.map((page, index) => ({
    id: `corp-${page.path}`,
    title: page.menuLabel,
    description: page.description,
    href: page.path,
    source: page.category,
    group: 'content',
    keywords: [page.category, page.menuLabel, page.title, page.description, page.path, ...page.checkpoints],
    tone: 'rose',
    icon: FileText,
    priority: 30 + index,
  }));
}

function createStoreCommandItems(): CommandItem[] {
  return PROPIG_STORE_APPS.map((app, index) => ({
    id: `store-${app.id}`,
    title: app.title,
    description: app.summary,
    href: app.path ?? '/propig/store',
    source: app.status === 'available' ? 'propig 앱' : '출시 예정',
    group: 'workflow',
    keywords: [app.id, app.title, app.shortTitle, app.summary, app.description, app.badge, app.path ?? ''],
    tone: app.status === 'available' ? 'amber' : 'teal',
    icon: Sparkles,
    priority: 40 + index,
  }));
}

function createQueueCommandItems(workQueue: WorkQueueItem[]): CommandItem[] {
  return workQueue.map((item, index) => ({
    id: `queue-${index}-${item.owner}`,
    title: item.label,
    description: `${item.owner} · ${item.due}`,
    href: getQueueCommandHref(item.owner),
    source: 'Priority Queue',
    group: item.owner === 'Workflow' || item.owner === 'Product' ? 'workflow' : 'records',
    keywords: [item.label, item.owner, item.due],
    tone: item.tone,
    icon: Clock3,
    priority: 10 + index,
  }));
}

function createUserRecordCommandItems(users: ManagedUserRecord[]): CommandItem[] {
  return users.map((user, index) => {
    const title = user.displayName || user.email || user.uid;
    const searchLabel = user.email || user.displayName || user.uid;

    return {
      id: `record-user-${user.uid}`,
      title,
      description: `${user.email ?? '이메일 없음'} · ${user.role} · ${user.position}${user.disabled ? ' · 비활성' : ''}`,
      href: createQueryHref('/admin/users', { q: searchLabel, uid: user.uid }),
      source: 'User record',
      group: 'records',
      keywords: [
        user.uid,
        user.email ?? '',
        user.displayName ?? '',
        user.role,
        user.position,
        user.providerIds.join(' '),
        user.emailVerified ? 'emailVerified' : '',
      ],
      tone: user.disabled ? 'rose' : user.role === 'admin' ? 'green' : 'blue',
      icon: UsersRound,
      priority: 1 + index,
    };
  });
}

function createStorageRecordCommandItems(files: AdminStorageFile[]): CommandItem[] {
  return files
    .filter((file) => !file.path.endsWith('/'))
    .map((file, index) => ({
      id: `record-storage-${file.path}`,
      title: file.name || file.path,
      description: `${formatCommandBytes(file.sizeBytes)} · ${file.contentType ?? '파일'} · ${file.path}`,
      href: createQueryHref('/admin/storage', { q: file.path }),
      source: file.bucket,
      group: 'records',
      keywords: [file.name, file.path, file.bucket, file.contentType ?? '', file.md5Hash ?? '', file.generation ?? ''],
      tone: 'teal',
      icon: HardDrive,
      priority: 2 + index,
    }));
}

function createActivityRecordCommandItems(logs: ActivityLogRecord[]): CommandItem[] {
  return logs.map((log, index) => {
    const targetLabel = getActivityTargetLabel(log);
    const title = log.summary || targetLabel || log.action;

    return {
      id: `record-activity-${log.id}`,
      title,
      description: `${log.action} · ${log.actor.email || log.actor.uid} · ${formatCommandDate(log.createdAt)}`,
      href: createQueryHref('/admin/activity-logs', {
        scope: getActivityScopeQuery(log.action),
        action: log.action,
        q: title,
        log: log.id,
      }),
      source: 'Activity log',
      group: 'records',
      keywords: [
        log.id,
        log.action,
        log.actor.uid,
        log.actor.email ?? '',
        log.route ?? '',
        targetLabel,
        log.summary ?? '',
      ],
      tone: 'violet',
      icon: Clock3,
      priority: 3 + index,
    };
  });
}

function createRecordCommandItems(records: RecordSearchData): CommandItem[] {
  return [
    ...createUserRecordCommandItems(records.users),
    ...createStorageRecordCommandItems(records.files),
    ...createActivityRecordCommandItems(records.logs),
  ];
}

function dedupeCommands(commands: CommandItem[]): CommandItem[] {
  const seen = new Set<string>();

  return commands.filter((command) => {
    const key = `${command.href}::${normalizeSearchValue(command.title)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getCommandScore(command: CommandItem, query: string): number | null {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return 1000 - command.priority;

  const text = normalizeSearchValue(getRecordSearchText(command));
  const title = normalizeSearchValue(command.title);
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);

  if (!tokens.every((token) => text.includes(token))) return null;
  if (title === normalizedQuery) return 3000 - command.priority;
  if (title.startsWith(normalizedQuery)) return 2600 - command.priority;
  if (text.includes(normalizedQuery)) return 2200 - command.priority;
  return 1600 - command.priority;
}

function getCommandOptionId(commandId: string): string {
  return `erp-command-option-${commandId.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selectors = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  return Array.from(container.querySelectorAll<HTMLElement>(selectors)).filter((element) => {
    const style = window.getComputedStyle(element);
    return element.tabIndex >= 0 && style.display !== 'none' && style.visibility !== 'hidden';
  });
}

function isErrorPayload(value: unknown): value is { error: string } {
  return value !== null && typeof value === 'object' && 'error' in value && typeof (value as { error?: unknown }).error === 'string';
}

async function fetchLauncherJson<T>({
  url,
  token,
  signal,
  fallbackMessage,
}: {
  url: string;
  token: string;
  signal?: AbortSignal;
  fallbackMessage: string;
}): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal,
  });
  const payload = (await response.json().catch(() => ({}))) as unknown;

  if (!response.ok) {
    throw new Error(isErrorPayload(payload) ? payload.error : fallbackMessage);
  }

  return payload as T;
}

async function fetchHomeActivityLogs(currentUser: CurrentUser, signal?: AbortSignal): Promise<ActivityLogsResponse> {
  const token = await currentUser.getIdToken();
  return fetchLauncherJson<ActivityLogsResponse>({
    url: `/api/admin/activity-logs?limit=${HOME_ACTIVITY_LOG_LIMIT}`,
    token,
    signal,
    fallbackMessage: '작업 히스토리를 불러오지 못했습니다.',
  });
}

async function loadLauncherRecordSearchData({
  currentUser,
  canSearchUsers,
  canSearchStorage,
  canSearchLogs,
  signal,
}: LauncherRecordSearchParams): Promise<RecordSearchData> {
  const token = await currentUser.getIdToken();
  if (signal.aborted) return EMPTY_RECORD_SEARCH_DATA;

  const [usersResult, storageResult, logsResult] = await Promise.allSettled([
    canSearchUsers
      ? fetchLauncherJson<AdminUsersResponse>({
          url: '/api/admin/users',
          token,
          signal,
          fallbackMessage: '사용자 목록을 불러오지 못했습니다.',
        })
      : Promise.resolve<AdminUsersResponse | null>(null),
    canSearchStorage
      ? fetchLauncherJson<AdminStorageListResponse>({
          url: '/api/admin/storage?limit=3000',
          token,
          signal,
          fallbackMessage: 'Storage 목록을 불러오지 못했습니다.',
        })
      : Promise.resolve<AdminStorageListResponse | null>(null),
    canSearchLogs
      ? fetchLauncherJson<ActivityLogsResponse>({
          url: '/api/admin/activity-logs?limit=80',
          token,
          signal,
          fallbackMessage: '작업 히스토리를 불러오지 못했습니다.',
        })
      : Promise.resolve<ActivityLogsResponse | null>(null),
  ]);

  return {
    users: usersResult.status === 'fulfilled' ? usersResult.value?.users ?? [] : [],
    files: storageResult.status === 'fulfilled' ? storageResult.value?.files ?? [] : [],
    logs: logsResult.status === 'fulfilled' ? logsResult.value?.logs ?? [] : [],
  };
}

function createWorkQueue(params: {
  isSignedIn: boolean;
  isMenuLoading: boolean;
  registryError: string | null;
  installedAppCount: number;
  availableAppCount: number;
  hasPersonalModules: boolean;
  preferenceSyncState: PreferenceSyncState;
  activityStatus: ActivityReadinessState;
}): WorkQueueItem[] {
  const queue: WorkQueueItem[] = [];

  if (!params.isSignedIn) {
    queue.push({ label: '로그인 후 관리자 지표와 개인 앱 등록 상태를 동기화하세요.', owner: 'Access', due: '필요', tone: 'blue' });
  }

  if (params.preferenceSyncState === 'error') {
    queue.push({ label: '개인 작업 바로가기 동기화 상태를 확인하세요.', owner: 'Platform', due: '확인', tone: 'rose' });
  }

  if (params.isMenuLoading) {
    queue.push({ label: '메뉴 설정을 불러오는 중입니다. 로딩 후 권한별 노출 상태를 확인하세요.', owner: 'Admin', due: '진행 중', tone: 'teal' });
  }

  if (params.registryError) {
    queue.push({ label: 'propig 앱 레지스트리 연결 상태를 점검하세요.', owner: 'Product', due: '오늘', tone: 'rose' });
  }

  if (params.activityStatus === 'error') {
    queue.push({ label: '작업 히스토리 연결 오류를 확인해 운영 감사 흐름을 복구하세요.', owner: 'Platform', due: '오늘', tone: 'rose' });
  } else if (params.activityStatus === 'loading') {
    queue.push({ label: '최근 작업 히스토리를 불러온 뒤 운영 변경 이력을 검토하세요.', owner: 'Platform', due: '진행 중', tone: 'teal' });
  } else if (params.activityStatus === 'empty') {
    queue.push({ label: '모듈 이동이나 통합 검색을 실행해 ERP 홈 사용 인사이트를 활성화하세요.', owner: 'Platform', due: '초기 설정', tone: 'violet' });
  } else if (params.activityStatus === 'restricted' && params.isSignedIn) {
    queue.push({ label: '관리자 권한으로 활동 로그 접근 가능 여부를 확인하세요.', owner: 'Access', due: '권한', tone: 'blue' });
  }

  if (params.isSignedIn && !params.hasPersonalModules) {
    queue.push({ label: '자주 쓰는 운영 모듈을 고정해 개인 작업 바로가기를 구성하세요.', owner: 'Workflow', due: '오늘', tone: 'amber' });
  }

  if (params.installedAppCount < params.availableAppCount) {
    queue.push({ label: 'propig 스토어에서 필요한 업무 앱을 추가해 개인 대시보드를 완성하세요.', owner: 'Workflow', due: '이번 주', tone: 'amber' });
  }

  if (queue.length === 0) {
    queue.push({ label: '운영 홈의 메뉴, 앱, 활동 로그 흐름이 정상입니다. 오늘 변경 이력만 검토하세요.', owner: 'Platform', due: '일일 점검', tone: 'green' });
  }

  return queue.slice(0, 4);
}

export default function ErpHomePage() {
  const { currentUser, loading: authLoading } = useAuth();
  const {
    siteData,
    isLoading: isMenuLoading,
    userRole,
    currentSite,
    currentPosition,
    siteAccess,
    menuAccess,
    permissions,
  } = useMenuContext();
  const appRegistry = usePropigAppRegistry();
  const siteEntries = useMemo<Array<[string, SiteData]>>(
    () =>
      getSwitchableSiteEntries(siteData)
        .filter(([siteId]) =>
          canAccessSiteMode(siteId, siteData, {
            role: userRole,
            siteAccess,
            permissions,
          }),
        )
        .map(([siteId, site]) => [
          siteId,
          {
            ...site,
            menu: filterMenuItemsForAccess(site.menu, {
              siteId,
              role: userRole,
              position: currentPosition,
              permissions,
              menuAccess,
            }),
          },
        ]),
    [currentPosition, menuAccess, permissions, siteAccess, siteData, userRole],
  );
  const adminMenuPathSet = useMemo(() => {
    const adminSite = siteEntries.find(([siteId]) => siteId === 'admin')?.[1];
    return new Set(
      collectMenuItems(adminSite?.menu ?? [])
        .map((item) => item.path)
        .filter((path): path is string => Boolean(path)),
    );
  }, [siteEntries]);
  const accessibleCoreModules = useMemo(
    () => coreModules.filter((module) => !module.href.startsWith('/admin') || adminMenuPathSet.has(module.href)),
    [adminMenuPathSet],
  );
  const accessibleSiteIdSet = useMemo(() => new Set(siteEntries.map(([siteId]) => siteId)), [siteEntries]);
  const accessibleBusinessModules = useMemo(
    () =>
      businessModules.filter((module) => {
        if (module.href.startsWith('/corp')) return accessibleSiteIdSet.has('corp');
        if (module.href.startsWith('/propig') || module.href.startsWith('/shop')) {
          return accessibleSiteIdSet.has('shop');
        }
        return true;
      }),
    [accessibleSiteIdSet],
  );
  const focusModules = useMemo(
    () => [...accessibleCoreModules, ...accessibleBusinessModules],
    [accessibleBusinessModules, accessibleCoreModules],
  );
  const primaryAdminModule = useMemo(
    () => accessibleCoreModules.find((module) => module.href === '/admin/menu') ?? accessibleCoreModules[0] ?? null,
    [accessibleCoreModules],
  );
  const primaryWorkflowModule = useMemo(
    () => accessibleBusinessModules.find((module) => module.href === '/propig') ?? accessibleBusinessModules[0] ?? null,
    [accessibleBusinessModules],
  );
  const modulesByHref = useMemo(() => new Map(focusModules.map((module) => [module.href, module])), [focusModules]);
  const moduleDomainCounts = useMemo(() => countModulesByDomain(focusModules), [focusModules]);
  const totalMenuLinks = useMemo(
    () => siteEntries.reduce((total, [, site]) => total + countVisibleMenuLinks(site.menu), 0),
    [siteEntries],
  );
  const adminMenuLinks = useMemo(
    () => countVisibleMenuLinks(siteEntries.find(([siteId]) => siteId === 'admin')?.[1].menu ?? []),
    [siteEntries],
  );
  const installedAppCount = appRegistry.installedAppIds.length;
  const availableAppCount = PROPIG_AVAILABLE_STORE_APPS.length;
  const isSignedIn = Boolean(currentUser);
  const canViewAdminActivity = Boolean(currentUser && userRole === 'admin');
  const {
    activeModuleDomain,
    preferenceSyncStatus,
    pinnedModuleHrefSet,
    pinnedModules,
    recentModules,
    hasPersonalModules,
    togglePinnedModule,
    rememberRecentModule,
    resetPersonalWorkspace,
    selectModuleDomain,
  } = useErpHomePersonalization<ModuleItem>({
    currentUser,
    modulesByHref,
  });
  const preferenceSyncTone = getPreferenceSyncTone(preferenceSyncStatus.state);

  const handleModuleVisit = useCallback((href: string) => {
    rememberRecentModule(href);

    const moduleItem = modulesByHref.get(href);
    void recordActivityLog(currentUser, {
      action: 'erp_home.module_opened',
      target: {
        type: 'module',
        id: href,
        path: href,
        label: moduleItem?.title ?? href,
      },
      summary: moduleItem ? `${moduleItem.title} opened from ERP home` : `${href} opened from ERP home`,
      metadata: {
        domain: moduleItem?.domain ?? null,
        pinned: pinnedModuleHrefSet.has(href),
        source: 'module-card',
      },
      route: '/',
    });
  }, [currentUser, modulesByHref, pinnedModuleHrefSet, rememberRecentModule]);

  const metrics = useMemo<MetricItem[]>(
    () => [
      {
        label: '운영 모듈',
        value: isMenuLoading ? '확인 중' : String(totalMenuLinks),
        detail: `${siteEntries.length || 0}개 사이트 메뉴 기준`,
        tone: 'blue',
        icon: Gauge,
      },
      {
        label: '관리 기능',
        value: isMenuLoading ? '확인 중' : String(adminMenuLinks),
        detail: 'Admin 메뉴와 운영 도구',
        tone: 'green',
        icon: ShieldCheck,
      },
      {
        label: '업무 흐름',
        value: appRegistry.isLoading ? '확인 중' : `${installedAppCount}/${availableAppCount}`,
        detail: 'propig 등록 앱 상태',
        tone: 'amber',
        icon: Activity,
      },
      {
        label: '콘텐츠 채널',
        value: String(CORP_PAGE_DEFINITIONS.length),
        detail: `${CORP_CONTENT_GROUP_COUNT}개 기업 콘텐츠 그룹`,
        tone: 'rose',
        icon: Building2,
      },
    ],
    [adminMenuLinks, appRegistry.isLoading, availableAppCount, installedAppCount, isMenuLoading, siteEntries.length, totalMenuLinks],
  );

  const systemSignals = useMemo<SignalItemData[]>(
    () => [
      {
        label: '인증',
        value: authLoading ? '확인 중' : currentUser ? '로그인' : '게스트',
        tone: currentUser ? 'green' : 'amber',
        icon: CheckCircle2,
      },
      {
        label: '메뉴',
        value: isMenuLoading ? '동기화 중' : `${totalMenuLinks}개`,
        tone: isMenuLoading ? 'amber' : 'teal',
        icon: Database,
      },
      {
        label: 'propig 앱',
        value: appRegistry.isLoading ? '확인 중' : `${installedAppCount}/${availableAppCount}`,
        tone: appRegistry.error ? 'rose' : 'blue',
        icon: Sparkles,
      },
      {
        label: '현재 모드',
        value: `${currentSite} · ${userRole}`,
        tone: 'violet',
        icon: FileText,
      },
    ],
    [appRegistry.error, appRegistry.isLoading, authLoading, availableAppCount, currentSite, currentUser, installedAppCount, isMenuLoading, totalMenuLinks, userRole],
  );

  const accessState = useMemo<AccessState>(() => {
    if (authLoading) {
      return {
        title: '권한 확인 중',
        detail: '로그인 상태와 Firebase 인증 정보를 확인하고 있습니다.',
        tone: 'amber',
      };
    }

    if (!currentUser) {
      return {
        title: '게스트 미리보기',
        detail: '공개 기업 메뉴와 로컬 propig 앱 상태만 먼저 보여줍니다. 로그인하면 관리자 지표와 개인 등록 정보가 동기화됩니다.',
        tone: 'blue',
      };
    }

    return {
      title: currentUser.email ?? currentUser.displayName ?? '로그인 사용자',
      detail: `${userRole} 권한으로 ${currentSite} 사이트 흐름을 보고 있습니다.`,
      tone: 'green',
    };
  }, [authLoading, currentSite, currentUser, userRole]);

  const activityLogsQuery = useQuery<ActivityLogsResponse, Error>({
    queryKey: [HOME_ACTIVITY_LOGS_QUERY_KEY, currentUser?.uid ?? 'anonymous'],
    queryFn: ({ signal }) => fetchHomeActivityLogs(currentUser!, signal),
    enabled: canViewAdminActivity,
    retry: false,
    staleTime: 30_000,
  });
  const activityLogs = activityLogsQuery.data?.logs ?? EMPTY_ACTIVITY_LOGS;
  const recentActivityLogs = activityLogs.slice(0, HOME_RECENT_ACTIVITY_DISPLAY_LIMIT);
  const usageInsights = useMemo(() => createUsageInsights(activityLogs), [activityLogs]);
  const activityStatus = useMemo<ActivityReadinessState>(() => {
    if (!canViewAdminActivity) return 'restricted';
    if (activityLogsQuery.isLoading) return 'loading';
    if (activityLogsQuery.error) return 'error';
    if (activityLogs.length === 0) return 'empty';
    return 'ready';
  }, [activityLogs.length, activityLogsQuery.error, activityLogsQuery.isLoading, canViewAdminActivity]);
  const workQueue = useMemo(
    () =>
      createWorkQueue({
        isSignedIn,
        isMenuLoading,
        registryError: appRegistry.error,
        installedAppCount,
        availableAppCount,
        hasPersonalModules,
        preferenceSyncState: preferenceSyncStatus.state,
        activityStatus,
      }),
    [
      activityStatus,
      appRegistry.error,
      availableAppCount,
      hasPersonalModules,
      installedAppCount,
      isMenuLoading,
      isSignedIn,
      preferenceSyncStatus.state,
    ],
  );
  const activeModuleDomainMeta =
    MODULE_DOMAIN_FILTERS.find((filter) => filter.value === activeModuleDomain) ?? MODULE_DOMAIN_FILTERS[0];
  const filteredFocusModules = useMemo(
    () => focusModules.filter((module) => module.domain === activeModuleDomain),
    [activeModuleDomain, focusModules],
  );

  return (
    <Shell id="content-area">
      <HeroSection aria-labelledby="erp-home-title">
        <HeroCopy>
          <Kicker>
            <Gauge size={16} />
            ERP CONTROL CENTER
          </Kicker>
          <HeroTitle id="erp-home-title">운영 현황을 한 화면에서 판단하는 ERP 홈</HeroTitle>
          <HeroDescription>
            관리자 기능, 기업 콘텐츠, 개인 업무 도구, AI 운영 기능을 분리하지 않고 현재 처리해야 할
            일과 핵심 진입점을 먼저 보여줍니다.
          </HeroDescription>
          <HeroActions>
            {primaryAdminModule ? (
              <PrimaryLink href={primaryAdminModule.href}>
                <MenuSquare size={17} />
                {primaryAdminModule.title}
              </PrimaryLink>
            ) : null}
            {primaryWorkflowModule ? (
              <SecondaryLink href={primaryWorkflowModule.href}>
                <Target size={17} />
                {primaryWorkflowModule.title}
              </SecondaryLink>
            ) : null}
            <ErpCommandLauncher
              siteEntries={siteEntries}
              workQueue={workQueue}
              isMenuLoading={isMenuLoading}
              adminModules={accessibleCoreModules}
              workflowModules={accessibleBusinessModules}
            />
          </HeroActions>
        </HeroCopy>

        <OperationsPanel aria-label="운영 요약">
          <PanelHeader>
            <span>Today</span>
            <strong>운영 체크</strong>
          </PanelHeader>
          <SignalGrid>
            {systemSignals.map((signal) => {
              const Icon = signal.icon;
              return (
                <SignalItem key={signal.label} style={toneStyle(signal.tone)}>
                  <Icon size={16} />
                  <span>{signal.label}</span>
                  <strong>{signal.value}</strong>
                </SignalItem>
              );
            })}
          </SignalGrid>
          <AccessNotice style={toneStyle(accessState.tone)}>
            <strong>{accessState.title}</strong>
            <span>{accessState.detail}</span>
          </AccessNotice>
        </OperationsPanel>
      </HeroSection>

      <MetricGrid aria-label="ERP 핵심 지표">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <MetricCard key={metric.label} style={toneStyle(metric.tone)}>
              <MetricIcon>
                <Icon size={18} />
              </MetricIcon>
              <MetricBody>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <em>{metric.detail}</em>
              </MetricBody>
            </MetricCard>
          );
        })}
      </MetricGrid>

      {hasPersonalModules && (
        <PersonalWorkspace aria-labelledby="personal-workspace-title" style={toneStyle('violet')}>
          <SectionHeader>
            <div>
              <SectionKicker>My Workspace</SectionKicker>
              <SectionTitle id="personal-workspace-title">나의 작업 바로가기</SectionTitle>
            </div>
            <PersonalHeaderTools>
              <SectionHint>{pinnedModules.length.toLocaleString('ko-KR')}개 고정</SectionHint>
              <PreferenceSyncBadge
                style={toneStyle(preferenceSyncTone)}
                data-erp-preference-sync={preferenceSyncStatus.state}
                title={preferenceSyncStatus.detail}
                aria-live="polite"
              >
                <PreferenceSyncStatusIcon state={preferenceSyncStatus.state} />
                <span>{preferenceSyncStatus.label}</span>
              </PreferenceSyncBadge>
              <PersonalResetButton
                type="button"
                aria-label="나의 작업 바로가기 초기화"
                data-erp-personal-reset="true"
                title="초기화"
                onClick={resetPersonalWorkspace}
              >
                <RotateCcw size={14} />
              </PersonalResetButton>
            </PersonalHeaderTools>
          </SectionHeader>

          <PersonalGroups>
            {pinnedModules.length > 0 && (
              <PersonalGroup>
                <PersonalGroupHeader>
                  <Star size={15} />
                  <strong>고정 모듈</strong>
                </PersonalGroupHeader>
                <ModuleGrid>
                  {pinnedModules.map((module) => (
                    <ModuleCard
                      key={module.href}
                      module={module}
                      compact
                      isPinned={pinnedModuleHrefSet.has(module.href)}
                      onTogglePinned={togglePinnedModule}
                      onVisit={handleModuleVisit}
                    />
                  ))}
                </ModuleGrid>
              </PersonalGroup>
            )}

            {recentModules.length > 0 && (
              <PersonalGroup>
                <PersonalGroupHeader>
                  <History size={15} />
                  <strong>최근 이동</strong>
                </PersonalGroupHeader>
                <ModuleGrid>
                  {recentModules.map((module) => (
                    <ModuleCard
                      key={module.href}
                      module={module}
                      compact
                      isPinned={pinnedModuleHrefSet.has(module.href)}
                      onTogglePinned={togglePinnedModule}
                      onVisit={handleModuleVisit}
                    />
                  ))}
                </ModuleGrid>
              </PersonalGroup>
            )}
          </PersonalGroups>
        </PersonalWorkspace>
      )}

      <MainGrid>
        <Section aria-labelledby="focus-modules-title">
          <SectionHeader>
            <div>
              <SectionKicker>Quick Filters</SectionKicker>
              <SectionTitle id="focus-modules-title">운영 포커스 모듈</SectionTitle>
            </div>
            <SectionHint>{activeModuleDomainMeta.label}</SectionHint>
          </SectionHeader>

          <DomainFilterBar aria-label="운영 도메인 필터">
            {MODULE_DOMAIN_FILTERS.map((filter) => {
              const Icon = filter.icon;

              return (
                <DomainFilterButton
                  key={filter.value}
                  type="button"
                  aria-pressed={activeModuleDomain === filter.value}
                  style={toneStyle(filter.tone)}
                  onClick={() => selectModuleDomain(filter.value)}
                >
                  <Icon size={16} />
                  <span>{filter.label}</span>
                  <em>{moduleDomainCounts[filter.value] ?? EMPTY_MODULE_DOMAIN_COUNTS[filter.value]}</em>
                </DomainFilterButton>
              );
            })}
          </DomainFilterBar>

          <DomainSummary style={toneStyle(activeModuleDomainMeta.tone)}>
            <strong>{activeModuleDomainMeta.summary}</strong>
            <span>{filteredFocusModules.length}개 모듈을 표시 중입니다.</span>
          </DomainSummary>

          <ModuleGrid>
            {filteredFocusModules.map((module) => (
              <ModuleCard
                key={module.href}
                module={module}
                isPinned={pinnedModuleHrefSet.has(module.href)}
                onTogglePinned={togglePinnedModule}
                onVisit={handleModuleVisit}
              />
            ))}
          </ModuleGrid>
          {filteredFocusModules.length === 0 ? (
            <ActivityState role="status" data-erp-empty-domain="true">
              이 도메인에서 현재 열 수 있는 모듈이 없습니다. 위 필터에서 항목이 있는 도메인을 선택해 주세요.
            </ActivityState>
          ) : null}
        </Section>

        <SideStack>
          <AdminPulsePanel
            workQueue={workQueue}
            recentLogs={recentActivityLogs}
            usageInsights={usageInsights}
            canViewActivity={canViewAdminActivity}
            isActivityLoading={activityLogsQuery.isLoading || activityLogsQuery.isFetching}
            activityError={activityLogsQuery.error}
          />

          <Section aria-labelledby="business-modules-title">
            <SectionHeader>
              <div>
                <SectionKicker>Business Flow</SectionKicker>
                <SectionTitle id="business-modules-title">업무/콘텐츠 흐름</SectionTitle>
              </div>
            </SectionHeader>
            <CompactList>
              {accessibleBusinessModules.map((module) => (
                <ModuleCard
                  key={module.href}
                  module={module}
                  compact
                  isPinned={pinnedModuleHrefSet.has(module.href)}
                  onTogglePinned={togglePinnedModule}
                  onVisit={handleModuleVisit}
                />
              ))}
            </CompactList>
          </Section>
        </SideStack>
      </MainGrid>
    </Shell>
  );
}

interface ModuleCardProps {
  module: ModuleItem;
  compact?: boolean;
  isPinned?: boolean;
  onTogglePinned?: (href: string) => void;
  onVisit?: (href: string) => void;
}

function ModuleCard({ module, compact = false, isPinned = false, onTogglePinned, onVisit }: ModuleCardProps) {
  const Icon = module.icon;

  return (
    <ModuleCardShell style={toneStyle(module.tone)}>
      <ModuleLink
        href={module.href}
        data-erp-module-link={module.href}
        $compact={compact}
        $hasAction={Boolean(onTogglePinned)}
        onClick={() => onVisit?.(module.href)}
      >
        <ModuleIcon>
          <Icon size={19} />
        </ModuleIcon>
        <ModuleCopy>
          <ModuleMeta>{module.status}</ModuleMeta>
          <strong>{module.title}</strong>
          <span>{module.summary}</span>
        </ModuleCopy>
        <ModuleArrow aria-hidden="true">
          <ArrowUpRight size={16} />
        </ModuleArrow>
      </ModuleLink>
      {onTogglePinned && (
        <ModulePinButton
          type="button"
          aria-label={isPinned ? `${module.title} 고정 해제` : `${module.title} 고정`}
          aria-pressed={isPinned}
          data-erp-module-pin={module.href}
          title={isPinned ? '고정 해제' : '고정'}
          onClick={() => onTogglePinned(module.href)}
        >
          <Star size={15} fill={isPinned ? 'currentColor' : 'none'} />
        </ModulePinButton>
      )}
    </ModuleCardShell>
  );
}

function AdminPulsePanel({
  workQueue,
  recentLogs,
  usageInsights,
  canViewActivity,
  isActivityLoading,
  activityError,
}: {
  workQueue: WorkQueueItem[];
  recentLogs: ActivityLogRecord[];
  usageInsights: UsageInsightItem[];
  canViewActivity: boolean;
  isActivityLoading: boolean;
  activityError: Error | null;
}) {
  return (
    <Section aria-labelledby="admin-pulse-title">
      <SectionHeader>
        <div>
          <SectionKicker>Admin Pulse</SectionKicker>
          <SectionTitle id="admin-pulse-title">운영 우선순위</SectionTitle>
        </div>
        <SectionHint>{workQueue.length}개 대기 업무</SectionHint>
      </SectionHeader>

      <PulseLayout>
        <PulseBlock>
          <PulseBlockHead>
            <strong>Pending Actions</strong>
            <PulseBadge>{workQueue.length}</PulseBadge>
          </PulseBlockHead>
          <QueueList>
            {workQueue.map((item) => (
              <QueueItem key={item.label} href={getQueueCommandHref(item.owner)} style={toneStyle(item.tone)}>
                <span />
                <QueueCopy>
                  <strong>{item.label}</strong>
                  <em>
                    {item.owner} · {item.due}
                  </em>
                </QueueCopy>
              </QueueItem>
            ))}
          </QueueList>
        </PulseBlock>

        <PulseBlock>
          <PulseBlockHead>
            <strong>Recent Activity</strong>
            <PulseBadge>{canViewActivity ? recentLogs.length : '권한'}</PulseBadge>
          </PulseBlockHead>

          {!canViewActivity ? (
            <ActivityState aria-live="polite">관리자 권한으로 로그인하면 최근 변경 기록을 이 자리에서 바로 확인합니다.</ActivityState>
          ) : isActivityLoading ? (
            <ActivityState aria-live="polite">최근 작업 히스토리를 불러오는 중입니다.</ActivityState>
          ) : activityError ? (
            <ActivityState aria-live="polite">{activityError.message}</ActivityState>
          ) : recentLogs.length === 0 ? (
            <ActivityState aria-live="polite">표시할 최근 작업 기록이 없습니다.</ActivityState>
          ) : (
            <ActivityList>
              {recentLogs.map((log) => {
                const summary = log.summary || getActivityTargetLabel(log) || log.action;
                return (
                  <ActivityLogLink
                    key={log.id}
                    href={createQueryHref('/admin/activity-logs', {
                      scope: getActivityScopeQuery(log.action),
                      action: log.action,
                      q: summary,
                      log: log.id,
                    })}
                    style={toneStyle('violet')}
                  >
                    <strong>{summary}</strong>
                    <ActivityMeta>
                      <span>{getActivityActionLabel(log.action)}</span>
                      <span>{log.actor.email || log.actor.uid}</span>
                      <span>{formatCommandDate(log.createdAt)}</span>
                    </ActivityMeta>
                  </ActivityLogLink>
                );
              })}
            </ActivityList>
          )}
        </PulseBlock>

        {canViewActivity && !isActivityLoading && !activityError ? (
          <PulseBlock>
            <PulseBlockHead>
              <strong>Usage Insights</strong>
              <PulseBadge>{usageInsights.length}</PulseBadge>
            </PulseBlockHead>
            {usageInsights.length > 0 ? (
              <UsageInsightList>
                {usageInsights.map((insight) => (
                  <UsageInsightLink
                    key={insight.key}
                    href={
                      insight.href ??
                      createQueryHref('/admin/activity-logs', {
                        scope: getActivityScopeQuery(insight.action),
                        action: insight.action,
                        q: insight.label,
                      })
                    }
                    style={toneStyle(insight.tone)}
                  >
                    <span>{insight.count.toLocaleString('ko-KR')}</span>
                    <QueueCopy>
                      <strong>{insight.label}</strong>
                      <em>{insight.detail}</em>
                    </QueueCopy>
                  </UsageInsightLink>
                ))}
              </UsageInsightList>
            ) : (
              <UsageInsightEmpty>
                <strong>아직 ERP 홈 사용 데이터가 없습니다.</strong>
                <span>모듈 카드나 통합 검색을 실행하면 이 영역에 자주 쓰는 진입점이 자동으로 쌓입니다.</span>
              </UsageInsightEmpty>
            )}
          </PulseBlock>
        ) : null}
      </PulseLayout>
    </Section>
  );
}

function ErpCommandLauncher({
  siteEntries,
  workQueue,
  isMenuLoading,
  adminModules,
  workflowModules,
}: {
  siteEntries: Array<[string, SiteData]>;
  workQueue: WorkQueueItem[];
  isMenuLoading: boolean;
  adminModules: ModuleItem[];
  workflowModules: ModuleItem[];
}) {
  const router = useRouter();
  const { currentUser } = useAuth();
  const { userRole, permissions } = useMenuContext();
  const commandButtonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recordAbortRef = useRef<AbortController | null>(null);
  const recordRequestSignatureRef = useRef<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<CommandFilter>('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const [recordSearch, setRecordSearch] = useState<RecordSearchState>(INITIAL_RECORD_SEARCH_STATE);
  const [recentCommandIds, setRecentCommandIds] = useState<string[]>([]);
  const canSearchUsers = Boolean(currentUser && (userRole === 'admin' || permissions.userManagement));
  const canSearchStorage = Boolean(currentUser && (userRole === 'admin' || permissions.storageManagement));
  const canSearchLogs = Boolean(currentUser && userRole === 'admin');
  const canSearchAnyRecord = canSearchUsers || canSearchStorage || canSearchLogs;
  const recordSearchAccessKey = `${currentUser?.uid ?? 'guest'}:${canSearchUsers ? 'users' : '-'}:${canSearchStorage ? 'storage' : '-'}:${canSearchLogs ? 'logs' : '-'}`;
  const normalizedQuery = normalizeSearchValue(query);
  const shouldShowRecordSearchState =
    normalizedQuery.length >= 2 && (activeFilter === 'all' || activeFilter === 'records');

  const ensureRecordSearch = useCallback(
    (nextQuery: string, nextFilter: CommandFilter = activeFilter) => {
      const shouldLoad =
        normalizeSearchValue(nextQuery).length >= 2 &&
        (nextFilter === 'all' || nextFilter === 'records') &&
        Boolean(currentUser) &&
        canSearchAnyRecord &&
        recordRequestSignatureRef.current !== recordSearchAccessKey;

      if (!shouldLoad || !currentUser) return;

      recordRequestSignatureRef.current = recordSearchAccessKey;
      recordAbortRef.current?.abort();
      const controller = new AbortController();
      recordAbortRef.current = controller;
      setRecordSearch({ ...EMPTY_RECORD_SEARCH_DATA, status: 'loading', error: null });

      void loadLauncherRecordSearchData({
        currentUser,
        canSearchUsers,
        canSearchStorage,
        canSearchLogs,
        signal: controller.signal,
      })
        .then((records) => {
          if (controller.signal.aborted) return;
          setRecordSearch({ ...records, status: 'ready', error: null });
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          recordRequestSignatureRef.current = null;
          setRecordSearch({
            ...EMPTY_RECORD_SEARCH_DATA,
            status: 'error',
            error: error instanceof Error ? error.message : '레코드 검색 데이터를 불러오지 못했습니다.',
          });
        });
    },
    [activeFilter, canSearchAnyRecord, canSearchLogs, canSearchStorage, canSearchUsers, currentUser, recordSearchAccessKey],
  );

  useEffect(() => {
    return () => {
      recordAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    recordAbortRef.current?.abort();
    recordRequestSignatureRef.current = null;

    const resetTimer = window.setTimeout(() => {
      setRecordSearch(INITIAL_RECORD_SEARCH_STATE);
    }, 0);

    return () => window.clearTimeout(resetTimer);
  }, [recordSearchAccessKey]);

  const recordCommands = useMemo(() => createRecordCommandItems(recordSearch), [recordSearch]);
  const siteIdSet = useMemo(() => new Set(siteEntries.map(([siteId]) => siteId)), [siteEntries]);
  const operatingCommands = useMemo(
    () =>
      OPERATING_COMMANDS.filter((command) => {
        if (command.href === '/admin/users') return canSearchUsers;
        if (command.href === '/admin/storage') return canSearchStorage;
        if (command.href === '/admin/activity-logs') return canSearchLogs;
        return true;
      }),
    [canSearchLogs, canSearchStorage, canSearchUsers],
  );

  const commands = useMemo(
    () =>
      dedupeCommands([
        ...recordCommands,
        ...operatingCommands,
        ...createQueueCommandItems(workQueue),
        ...createModuleCommandItems(adminModules, 'admin', 50),
        ...createModuleCommandItems(workflowModules, 'workflow', 70),
        ...createMenuCommandItems(siteEntries),
        ...(siteIdSet.has('corp') ? createCorpCommandItems() : []),
        ...(siteIdSet.has('shop') ? createStoreCommandItems() : []),
      ]),
    [adminModules, operatingCommands, recordCommands, siteEntries, siteIdSet, workQueue, workflowModules],
  );
  const recentCommands = useMemo(() => {
    const commandsById = new Map(commands.map((command) => [command.id, command]));
    return recentCommandIds
      .map((id) => commandsById.get(id))
      .filter((command): command is CommandItem => Boolean(command))
      .filter((command) => command.group !== 'records')
      .slice(0, RECENT_COMMAND_LIMIT);
  }, [commands, recentCommandIds]);

  const filteredCommands = useMemo(() => {
    return commands
      .filter((command) => activeFilter === 'all' || command.group === activeFilter)
      .map((command) => ({ command, score: getCommandScore(command, query) }))
      .filter((entry): entry is { command: CommandItem; score: number } => entry.score !== null)
      .sort((a, b) => b.score - a.score || a.command.title.localeCompare(b.command.title, 'ko-KR'))
      .slice(0, 9)
      .map((entry) => entry.command);
  }, [activeFilter, commands, query]);
  const selectedIndex = filteredCommands.length > 0 ? Math.min(activeIndex, filteredCommands.length - 1) : 0;
  const selectedCommand = filteredCommands[selectedIndex];
  const selectedOptionId = selectedCommand ? getCommandOptionId(selectedCommand.id) : undefined;

  const openLauncher = useCallback(() => {
    setIsOpen(true);
    ensureRecordSearch(query);
  }, [ensureRecordSearch, query]);

  const closeLauncher = useCallback((options: { restoreFocus?: boolean } = {}) => {
    setIsOpen(false);
    setQuery('');
    setActiveFilter('all');
    setActiveIndex(0);

    if (options.restoreFocus !== false) {
      window.setTimeout(() => commandButtonRef.current?.focus(), 0);
    }
  }, []);

  useEffect(() => {
    const storageTimer = window.setTimeout(() => {
      setRecentCommandIds(readStoredHrefList(ERP_RECENT_COMMANDS_STORAGE_KEY).slice(0, RECENT_COMMAND_LIMIT));
    }, 0);

    return () => window.clearTimeout(storageTimer);
  }, []);

  const executeCommand = useCallback(
    (command: CommandItem) => {
      if (command.group !== 'records') {
        setRecentCommandIds((current) => {
          const next = moveHrefToFront(current, command.id, RECENT_COMMAND_LIMIT);
          writeStoredHrefList(ERP_RECENT_COMMANDS_STORAGE_KEY, next);
          return next;
        });
      }

      void recordActivityLog(currentUser, {
        action: 'erp_home.command_executed',
        target: {
          type: 'command',
          id: command.id,
          path: command.href,
          label: command.title,
        },
        summary: `${command.title} command executed from ERP home`,
        metadata: {
          filter: activeFilter,
          group: command.group,
          query: query.trim(),
          source: command.source,
        },
        route: '/',
      });
      closeLauncher({ restoreFocus: false });
      router.push(command.href);
    },
    [activeFilter, closeLauncher, currentUser, query, router],
  );

  useEffect(() => {
    if (!isOpen) return;
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      const isCommandKey = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
      if (isCommandKey) {
        event.preventDefault();
        openLauncher();
        return;
      }

      if (event.key === 'Escape' && isOpen) {
        closeLauncher();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeLauncher, isOpen, openLauncher]);

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') {
      const focusableElements = getFocusableElements(event.currentTarget);
      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
        return;
      }

      if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }

      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, Math.max(filteredCommands.length - 1, 0)));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === 'Enter') {
      const activeCommand = filteredCommands[selectedIndex];
      if (!activeCommand) return;
      event.preventDefault();
      executeCommand(activeCommand);
    }
  };

  return (
    <>
      <CommandButton
        ref={commandButtonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-keyshortcuts="Control+K Meta+K"
        onClick={openLauncher}
      >
        <Search size={17} />
        통합 검색
      </CommandButton>

      {isOpen ? (
        <LauncherOverlay
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeLauncher();
          }}
        >
          <LauncherDialog
            role="dialog"
            aria-modal="true"
            aria-labelledby="erp-command-launcher-title"
            onKeyDown={handleDialogKeyDown}
          >
            <LauncherHeading>
              <span>
                <Command size={18} />
              </span>
              <div>
                <strong id="erp-command-launcher-title">ERP Command</strong>
                <em>
                  {commands.length}개 진입점
                  {recordSearch.status === 'ready'
                    ? ` · 레코드 ${recordCommands.length.toLocaleString('ko-KR')}개`
                    : ''}
                </em>
              </div>
              <button type="button" aria-label="검색 닫기" onClick={() => closeLauncher()}>
                <X size={18} />
              </button>
            </LauncherHeading>

            <LauncherSearchBox>
              <Search size={18} />
              <input
                ref={inputRef}
                type="search"
                name="erp-command-search"
                value={query}
                placeholder="메뉴, 파일, 사용자, 최근 작업 검색…"
                autoComplete="off"
                spellCheck={false}
                aria-label="ERP 통합 검색어"
                aria-controls="erp-command-results"
                aria-activedescendant={selectedOptionId}
                onChange={(event) => {
                  const nextQuery = event.target.value;
                  setQuery(nextQuery);
                  setActiveIndex(0);
                  ensureRecordSearch(nextQuery);
                }}
              />
            </LauncherSearchBox>

            {recentCommands.length > 0 ? (
              <RecentCommandStrip aria-label="최근 실행 명령">
                <strong>최근 실행</strong>
                <div>
                  {recentCommands.map((command) => (
                    <RecentCommandButton
                      key={command.id}
                      type="button"
                      style={toneStyle(command.tone)}
                      onClick={() => executeCommand(command)}
                    >
                      <span>{command.title}</span>
                    </RecentCommandButton>
                  ))}
                </div>
                <RecentCommandClearButton
                  type="button"
                  aria-label="최근 실행 명령 지우기"
                  title="최근 실행 명령 지우기"
                  onClick={() => {
                    setRecentCommandIds([]);
                    writeStoredHrefList(ERP_RECENT_COMMANDS_STORAGE_KEY, []);
                  }}
                >
                  <X size={13} />
                </RecentCommandClearButton>
              </RecentCommandStrip>
            ) : null}

            <LauncherFilters aria-label="검색 범위">
              {COMMAND_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  aria-pressed={activeFilter === filter.value}
                  onClick={() => {
                    setActiveFilter(filter.value);
                    setActiveIndex(0);
                    ensureRecordSearch(query, filter.value);
                  }}
                >
                  {filter.label}
                </button>
              ))}
            </LauncherFilters>

            <LauncherResults id="erp-command-results" role="listbox" aria-label="ERP 검색 결과">
              {isMenuLoading ? <LauncherState aria-live="polite">메뉴 동기화 중에도 고정 운영 명령은 바로 실행할 수 있습니다.</LauncherState> : null}
              {shouldShowRecordSearchState && !currentUser ? (
                <LauncherState aria-live="polite">로그인하면 사용자, 파일, 최근 작업 레코드까지 함께 검색합니다.</LauncherState>
              ) : null}
              {shouldShowRecordSearchState && currentUser && !canSearchAnyRecord ? (
                <LauncherState aria-live="polite">레코드 검색에는 사용자 관리 권한 또는 관리자 권한이 필요합니다.</LauncherState>
              ) : null}
              {shouldShowRecordSearchState && recordSearch.status === 'loading' ? (
                <LauncherState aria-live="polite">사용자, Storage, 작업 히스토리 인덱스를 불러오는 중입니다.</LauncherState>
              ) : null}
              {shouldShowRecordSearchState && recordSearch.status === 'error' ? (
                <LauncherState aria-live="polite">{recordSearch.error}</LauncherState>
              ) : null}
              {filteredCommands.length > 0 ? (
                filteredCommands.map((command, index) => {
                  const Icon = command.icon;

                  return (
                    <LauncherResult
                      key={command.id}
                      id={getCommandOptionId(command.id)}
                      href={command.href}
                      role="option"
                      aria-selected={selectedIndex === index}
                      $active={selectedIndex === index}
                      style={toneStyle(command.tone)}
                      onClick={(event) => {
                        event.preventDefault();
                        executeCommand(command);
                      }}
                      onMouseEnter={() => setActiveIndex(index)}
                    >
                      <ResultIcon>
                        <Icon size={18} />
                      </ResultIcon>
                      <ResultCopy>
                        <strong>{command.title}</strong>
                        <span>{command.description}</span>
                      </ResultCopy>
                      <ResultMeta>
                        <span>{command.source}</span>
                        <ChevronRight size={16} />
                      </ResultMeta>
                    </LauncherResult>
                  );
                })
              ) : (
                <LauncherEmpty>
                  <strong>검색 결과 없음</strong>
                  <span>다른 메뉴명, 업무명, 파일/사용자 관련 키워드로 다시 찾으세요.</span>
                </LauncherEmpty>
              )}
            </LauncherResults>
          </LauncherDialog>
        </LauncherOverlay>
      ) : null}
    </>
  );
}

const riseIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const Shell = styled.main`
  --erp-bg: #0b0f14;
  --erp-surface: #121820;
  --erp-surface-soft: #171f29;
  --erp-line: rgba(217, 226, 236, 0.1);
  --erp-line-strong: rgba(217, 226, 236, 0.18);
  --erp-text: #edf4f7;
  --erp-muted: #aab8c4;
  --erp-faint: #72808d;

  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px),
    linear-gradient(180deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px),
    radial-gradient(circle at 18% 8%, rgba(91, 167, 255, 0.2), transparent 30%),
    linear-gradient(135deg, #0b0f14 0%, #101820 52%, #11140f 100%);
  background-size: 56px 56px, 56px 56px, auto, auto;
  color: var(--erp-text);
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  padding: clamp(16px, 2.8vw, 32px);

  a,
  button {
    -webkit-tap-highlight-color: rgba(125, 211, 252, 0.18);
    touch-action: manipulation;
  }

  @media (forced-colors: active) {
    --erp-bg: Canvas;
    --erp-surface: Canvas;
    --erp-surface-soft: Canvas;
    --erp-line: CanvasText;
    --erp-line-strong: CanvasText;
    --erp-text: CanvasText;
    --erp-muted: CanvasText;
    --erp-faint: GrayText;

    background: Canvas;

    & * {
      box-shadow: none;
      text-shadow: none;
    }
  }
`;

const HeroSection = styled.section`
  animation: ${riseIn} 0.32s ease both;
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(0, 1.45fr) minmax(280px, 0.55fr);
  margin: 0 auto;
  max-width: 1480px;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`;

const HeroCopy = styled.div`
  border: 1px solid var(--erp-line);
  border-radius: 8px;
  display: grid;
  min-height: 250px;
  overflow: hidden;
  padding: clamp(22px, 4vw, 42px);
  position: relative;

  &::before {
    background:
      linear-gradient(135deg, rgba(45, 212, 191, 0.16), transparent 44%),
      linear-gradient(315deg, rgba(245, 184, 75, 0.12), transparent 36%);
    content: '';
    inset: 0;
    pointer-events: none;
    position: absolute;
  }

  > * {
    position: relative;
  }

  @media (max-width: 560px) {
    min-height: 0;
    padding: 20px;
  }

  @media (forced-colors: active) {
    background: Canvas;

    &::before {
      display: none;
    }
  }
`;

const Kicker = styled.p`
  align-items: center;
  color: #7dd3fc;
  display: inline-flex;
  font-size: 0.76rem;
  font-weight: 950;
  gap: 8px;
  letter-spacing: 0;
  margin: 0 0 16px;
`;

const HeroTitle = styled.h1`
  color: var(--erp-text);
  font-size: clamp(2rem, 3.45vw, 3.55rem);
  font-weight: 950;
  letter-spacing: 0;
  line-height: 1.04;
  margin: 0;
  max-width: 920px;
  text-wrap: balance;

  @media (max-width: 560px) {
    font-size: 1.68rem;
    line-height: 1.08;
  }
`;

const HeroDescription = styled.p`
  color: var(--erp-muted);
  font-size: clamp(0.96rem, 1.25vw, 1.08rem);
  font-weight: 700;
  line-height: 1.65;
  margin: 18px 0 0;
  max-width: 760px;
  text-wrap: pretty;
`;

const HeroActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 26px;

  @media (max-width: 560px) {
    margin-top: 22px;

    > * {
      flex: 1 1 136px;
      justify-content: center;
    }
  }

  @media (max-width: 420px) {
    > * {
      flex-basis: 100%;
    }
  }
`;

const actionBase = `
  align-items: center;
  border-radius: 8px;
  display: inline-flex;
  font-size: 0.9rem;
  font-weight: 900;
  gap: 8px;
  min-height: 42px;
  padding: 0 14px;
  text-decoration: none;
`;

const PrimaryLink = styled(Link)`
  ${actionBase}
  background: #edf4f7;
  border: 1px solid #edf4f7;
  color: #0b0f14;

  @media (forced-colors: active) {
    background: ButtonFace;
    border-color: ButtonText;
    color: ButtonText;
  }
`;

const SecondaryLink = styled(Link)`
  ${actionBase}
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--erp-line-strong);
  color: var(--erp-text);

  @media (forced-colors: active) {
    background: ButtonFace;
    border-color: ButtonText;
    color: ButtonText;
  }
`;

const CommandButton = styled.button`
  ${actionBase}
  background: rgba(45, 212, 191, 0.1);
  border: 1px solid rgba(45, 212, 191, 0.34);
  color: var(--erp-text);
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid #2dd4bf;
    outline-offset: 2px;
  }

  @media (forced-colors: active) {
    background: ButtonFace;
    border-color: ButtonText;
    color: ButtonText;

    &:focus-visible {
      outline-color: Highlight;
    }
  }
`;

const OperationsPanel = styled.aside`
  animation: ${riseIn} 0.36s ease 0.04s both;
  background: rgba(18, 24, 32, 0.86);
  border: 1px solid var(--erp-line);
  border-radius: 8px;
  display: grid;
  gap: 18px;
  min-height: 250px;
  padding: 20px;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }

  @media (forced-colors: active) {
    background: Canvas;
    border-color: CanvasText;
  }
`;

const PanelHeader = styled.div`
  align-content: start;
  border-bottom: 1px solid var(--erp-line);
  display: grid;
  gap: 5px;
  padding-bottom: 16px;

  span {
    color: var(--erp-faint);
    font-size: 0.78rem;
    font-weight: 950;
    text-transform: uppercase;
  }

  strong {
    color: var(--erp-text);
    font-size: 1.12rem;
    font-weight: 950;
  }
`;

const SignalGrid = styled.div`
  display: grid;
  gap: 10px;
`;

const SignalItem = styled.div`
  align-items: center;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--erp-line);
  border-radius: 8px;
  display: grid;
  gap: 10px;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  min-height: 46px;
  padding: 0 12px;

  svg {
    color: var(--tone);
  }

  span {
    color: var(--erp-muted);
    font-size: 0.82rem;
    font-weight: 850;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    color: var(--erp-text);
    font-size: 0.8rem;
    font-weight: 950;
    white-space: nowrap;
  }
`;

const AccessNotice = styled.div`
  background: var(--tone-soft);
  border: 1px solid color-mix(in srgb, var(--tone) 42%, transparent);
  border-radius: 8px;
  display: grid;
  gap: 6px;
  padding: 13px;

  strong {
    color: var(--erp-text);
    font-size: 0.88rem;
    font-weight: 950;
    line-height: 1.25;
  }

  span {
    color: var(--erp-muted);
    font-size: 0.78rem;
    font-weight: 760;
    line-height: 1.45;
  }
`;

const MetricGrid = styled.section`
  animation: ${riseIn} 0.34s ease 0.07s both;
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 18px auto 0;
  max-width: 1480px;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }

  @media (max-width: 1060px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`;

const MetricCard = styled.div`
  align-items: center;
  background: linear-gradient(180deg, rgba(18, 24, 32, 0.94), rgba(18, 24, 32, 0.78));
  border: 1px solid var(--erp-line);
  border-radius: 8px;
  display: grid;
  gap: 12px;
  grid-template-columns: 42px minmax(0, 1fr);
  min-height: 96px;
  padding: 15px;
`;

const MetricIcon = styled.span`
  align-items: center;
  background: var(--tone-soft);
  border: 1px solid color-mix(in srgb, var(--tone) 42%, transparent);
  border-radius: 8px;
  color: var(--tone);
  display: inline-flex;
  height: 42px;
  justify-content: center;
  width: 42px;
`;

const MetricBody = styled.div`
  min-width: 0;

  span,
  em {
    color: var(--erp-muted);
    display: block;
    font-style: normal;
    line-height: 1.35;
  }

  span {
    font-size: 0.75rem;
    font-weight: 950;
  }

  strong {
    color: var(--erp-text);
    display: block;
    font-size: 1.75rem;
    font-weight: 950;
    line-height: 1.1;
    margin: 5px 0;
  }

  em {
    font-size: 0.78rem;
    font-weight: 750;
  }
`;

const MainGrid = styled.div`
  align-items: start;
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.65fr);
  margin: 18px auto 0;
  max-width: 1480px;

  @media (max-width: 1160px) {
    grid-template-columns: 1fr;
  }
`;

const Section = styled.section`
  animation: ${riseIn} 0.36s ease 0.1s both;
  background: rgba(18, 24, 32, 0.78);
  border: 1px solid var(--erp-line);
  border-radius: 8px;
  padding: 16px;
  scroll-margin-top: 76px;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const SectionHeader = styled.div`
  align-items: end;
  display: flex;
  gap: 12px;
  justify-content: space-between;
  margin-bottom: 14px;
  min-width: 0;

  @media (max-width: 640px) {
    align-items: start;
    flex-direction: column;
  }
`;

const SectionKicker = styled.span`
  color: var(--erp-faint);
  display: block;
  font-size: 0.72rem;
  font-weight: 950;
  letter-spacing: 0;
  margin-bottom: 5px;
  text-transform: uppercase;
`;

const SectionTitle = styled.h2`
  color: var(--erp-text);
  font-size: 1.05rem;
  font-weight: 950;
  letter-spacing: 0;
  line-height: 1.2;
  margin: 0;
  text-wrap: balance;
`;

const SectionHint = styled.span`
  color: var(--erp-muted);
  font-size: 0.78rem;
  font-weight: 800;
`;

const PersonalWorkspace = styled(Section)`
  margin: 18px auto 0;
  max-width: 1480px;
`;

const PersonalGroups = styled.div`
  display: grid;
  gap: 14px;
`;

const PersonalGroup = styled.div`
  display: grid;
  gap: 9px;
`;

const PersonalGroupHeader = styled.div`
  align-items: center;
  color: var(--erp-muted);
  display: inline-flex;
  gap: 7px;
  font-size: 0.78rem;
  font-weight: 950;

  svg {
    color: var(--tone, #8b5cf6);
  }
`;

const PersonalHeaderTools = styled.div`
  align-items: center;
  display: inline-flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
`;

const PreferenceSyncBadge = styled.span`
  align-items: center;
  background: var(--tone-soft);
  border: 1px solid color-mix(in srgb, var(--tone) 42%, transparent);
  border-radius: 999px;
  color: var(--tone);
  display: inline-flex;
  gap: 5px;
  min-height: 28px;
  max-width: 190px;
  padding: 0 10px;

  span {
    font-size: 0.72rem;
    font-weight: 950;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 520px) {
    max-width: 160px;
  }

  @media (forced-colors: active) {
    background: ButtonFace;
    border-color: ButtonText;
    color: ButtonText;
  }
`;

const PersonalResetButton = styled.button`
  align-items: center;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid var(--erp-line);
  border-radius: 8px;
  color: var(--erp-muted);
  cursor: pointer;
  display: inline-flex;
  height: 30px;
  justify-content: center;
  width: 30px;

  &:hover,
  &:focus-visible {
    background: var(--tone-soft);
    border-color: color-mix(in srgb, var(--tone) 42%, transparent);
    color: var(--tone);
  }

  &:focus-visible {
    outline: 2px solid var(--tone);
    outline-offset: 2px;
  }

  @media (forced-colors: active) {
    background: ButtonFace;
    border-color: ButtonText;
    color: ButtonText;

    &:focus-visible {
      outline-color: Highlight;
    }
  }
`;

const DomainFilterBar = styled.div`
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-bottom: 10px;

  @media (max-width: 900px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const DomainFilterButton = styled.button`
  align-items: center;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid var(--erp-line);
  border-radius: 8px;
  color: var(--erp-muted);
  cursor: pointer;
  display: grid;
  gap: 8px;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  min-height: 42px;
  padding: 0 10px;
  text-align: left;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease;

  svg {
    color: var(--tone);
  }

  span {
    font-size: 0.78rem;
    font-weight: 930;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  em {
    align-items: center;
    background: var(--tone-soft);
    border-radius: 999px;
    color: var(--tone);
    display: inline-flex;
    font-size: 0.7rem;
    font-style: normal;
    font-weight: 950;
    justify-content: center;
    min-width: 24px;
    padding: 2px 7px;
  }

  &[aria-pressed='true'] {
    background: var(--tone-soft);
    border-color: color-mix(in srgb, var(--tone) 46%, transparent);
    color: var(--erp-text);
  }

  &:hover,
  &:focus-visible {
    border-color: color-mix(in srgb, var(--tone) 42%, transparent);
  }

  &:focus-visible {
    outline: 2px solid var(--tone);
    outline-offset: 2px;
  }

  @media (forced-colors: active) {
    background: ButtonFace;
    border-color: ButtonText;
    color: ButtonText;

    &[aria-pressed='true'] {
      background: Highlight;
      border-color: Highlight;
      color: HighlightText;
    }

    &:focus-visible {
      outline-color: Highlight;
    }
  }
`;

const DomainSummary = styled.div`
  background: var(--tone-soft);
  border: 1px solid color-mix(in srgb, var(--tone) 36%, transparent);
  border-radius: 8px;
  display: grid;
  gap: 4px;
  margin-bottom: 10px;
  min-height: 58px;
  padding: 11px 12px;

  strong {
    color: var(--erp-text);
    font-size: 0.86rem;
    font-weight: 930;
    line-height: 1.35;
  }

  span {
    color: var(--erp-muted);
    font-size: 0.74rem;
    font-weight: 800;
  }
`;

const ModuleGrid = styled.div`
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const ModuleCardShell = styled.div`
  position: relative;
`;

const ModuleLink = styled(Link)<{ $compact: boolean; $hasAction: boolean }>`
  align-items: start;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid var(--erp-line);
  border-left: 3px solid var(--tone);
  border-radius: 8px;
  color: var(--erp-text);
  display: grid;
  gap: 12px;
  grid-template-columns: 40px minmax(0, 1fr) 24px;
  min-height: ${({ $compact }) => ($compact ? '82px' : '132px')};
  padding: ${({ $compact, $hasAction }) =>
    $hasAction ? ($compact ? '12px 44px 12px 12px' : '13px 44px 13px 13px') : '13px'};
  text-decoration: none;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    transform 0.18s ease;

  &:hover,
  &:focus-visible {
    background: var(--tone-soft);
    border-color: color-mix(in srgb, var(--tone) 45%, transparent);
    transform: translateY(-2px);
  }

  &:focus-visible {
    outline: 2px solid var(--tone);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: background-color 0.18s ease, border-color 0.18s ease;

    &:hover,
    &:focus-visible {
      transform: none;
    }
  }

  @media (forced-colors: active) {
    background: Canvas;
    border-color: CanvasText;
    border-left-color: Highlight;
    color: CanvasText;

    &:hover,
    &:focus-visible {
      background: Canvas;
      border-color: Highlight;
      transform: none;
    }

    &:focus-visible {
      outline-color: Highlight;
    }
  }
`;

const ModulePinButton = styled.button`
  align-items: center;
  background: rgba(255, 255, 255, 0.055);
  border: 1px solid var(--erp-line);
  border-radius: 8px;
  color: var(--erp-faint);
  cursor: pointer;
  display: inline-flex;
  height: 30px;
  justify-content: center;
  position: absolute;
  right: 10px;
  top: 10px;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;
  width: 30px;
  z-index: 2;

  &[aria-pressed='true'] {
    background: var(--tone-soft);
    border-color: color-mix(in srgb, var(--tone) 48%, transparent);
    color: var(--tone);
  }

  &:hover,
  &:focus-visible {
    background: var(--tone-soft);
    border-color: color-mix(in srgb, var(--tone) 44%, transparent);
    color: var(--tone);
  }

  &:focus-visible {
    outline: 2px solid var(--tone);
    outline-offset: 2px;
  }

  @media (forced-colors: active) {
    background: ButtonFace;
    border-color: ButtonText;
    color: ButtonText;

    &[aria-pressed='true'] {
      background: Highlight;
      border-color: Highlight;
      color: HighlightText;
    }

    &:focus-visible {
      outline-color: Highlight;
    }
  }
`;

const ModuleIcon = styled.span`
  align-items: center;
  background: var(--tone-soft);
  border-radius: 8px;
  color: var(--tone);
  display: inline-flex;
  height: 40px;
  justify-content: center;
  width: 40px;
`;

const ModuleCopy = styled.span`
  display: grid;
  gap: 5px;
  min-width: 0;

  strong {
    color: var(--erp-text);
    font-size: 0.95rem;
    font-weight: 950;
    line-height: 1.25;
  }

  span {
    color: var(--erp-muted);
    display: -webkit-box;
    font-size: 0.8rem;
    font-weight: 760;
    line-height: 1.45;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
`;

const ModuleMeta = styled.em`
  color: var(--tone);
  font-size: 0.68rem;
  font-style: normal;
  font-weight: 950;
  letter-spacing: 0;
  text-transform: uppercase;
`;

const ModuleArrow = styled.span`
  color: var(--erp-faint);
  display: inline-flex;
  justify-content: flex-end;
`;

const SideStack = styled.div`
  display: grid;
  gap: 18px;
`;

const PulseLayout = styled.div`
  display: grid;
  gap: 12px;
`;

const PulseBlock = styled.div`
  display: grid;
  gap: 9px;
`;

const PulseBlockHead = styled.div`
  align-items: center;
  display: flex;
  gap: 10px;
  justify-content: space-between;

  strong {
    color: var(--erp-text);
    font-size: 0.82rem;
    font-weight: 950;
  }
`;

const PulseBadge = styled.span`
  align-items: center;
  background: rgba(255, 255, 255, 0.055);
  border: 1px solid var(--erp-line);
  border-radius: 999px;
  color: var(--erp-muted);
  display: inline-flex;
  font-size: 0.72rem;
  font-weight: 950;
  min-height: 24px;
  padding: 0 9px;
`;

const QueueList = styled.div`
  display: grid;
  gap: 8px;
`;

const QueueItem = styled(Link)`
  align-items: start;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid var(--erp-line);
  border-radius: 8px;
  color: inherit;
  display: grid;
  gap: 10px;
  grid-template-columns: 10px minmax(0, 1fr);
  min-height: 64px;
  padding: 11px 12px;
  text-decoration: none;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease;

  > span {
    background: var(--tone);
    border-radius: 999px;
    box-shadow: 0 0 0 5px var(--tone-soft);
    height: 8px;
    margin-top: 7px;
    width: 8px;
  }

  &:hover,
  &:focus-visible {
    background: var(--tone-soft);
    border-color: color-mix(in srgb, var(--tone) 42%, transparent);
  }

  &:focus-visible {
    outline: 2px solid var(--tone);
    outline-offset: 2px;
  }
`;

const QueueCopy = styled.div`
  display: grid;
  gap: 4px;
  min-width: 0;

  strong {
    color: var(--erp-text);
    font-size: 0.86rem;
    font-weight: 920;
    line-height: 1.35;
  }

  em {
    color: var(--erp-muted);
    font-size: 0.74rem;
    font-style: normal;
    font-weight: 820;
  }
`;

const UsageInsightList = styled.div`
  display: grid;
  gap: 8px;
`;

const UsageInsightLink = styled(Link)`
  align-items: center;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid var(--erp-line);
  border-radius: 8px;
  color: inherit;
  display: grid;
  gap: 10px;
  grid-template-columns: 34px minmax(0, 1fr);
  min-height: 62px;
  padding: 10px 12px;
  text-decoration: none;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease;

  > span {
    align-items: center;
    background: var(--tone-soft);
    border: 1px solid color-mix(in srgb, var(--tone) 44%, transparent);
    border-radius: 8px;
    color: var(--tone);
    display: inline-flex;
    font-size: 0.78rem;
    font-weight: 950;
    height: 34px;
    justify-content: center;
    min-width: 34px;
  }

  &:hover,
  &:focus-visible {
    background: var(--tone-soft);
    border-color: color-mix(in srgb, var(--tone) 42%, transparent);
  }

  &:focus-visible {
    outline: 2px solid var(--tone);
    outline-offset: 2px;
  }

  @media (forced-colors: active) {
    background: Canvas;
    border-color: CanvasText;
    color: CanvasText;

    > span {
      background: ButtonFace;
      border-color: ButtonText;
      color: ButtonText;
    }

    &:hover,
    &:focus-visible {
      background: Canvas;
      border-color: Highlight;
    }

    &:focus-visible {
      outline-color: Highlight;
    }
  }
`;

const UsageInsightEmpty = styled.div`
  background: rgba(255, 255, 255, 0.035);
  border: 1px dashed color-mix(in srgb, var(--erp-muted) 35%, transparent);
  border-radius: 8px;
  display: grid;
  gap: 6px;
  min-height: 74px;
  padding: 12px;

  strong {
    color: var(--erp-text);
    font-size: 0.84rem;
    font-weight: 930;
    line-height: 1.35;
  }

  span {
    color: var(--erp-muted);
    font-size: 0.76rem;
    font-weight: 780;
    line-height: 1.45;
  }

  @media (forced-colors: active) {
    background: Canvas;
    border-color: CanvasText;
    color: CanvasText;
  }
`;

const ActivityList = styled.div`
  display: grid;
  gap: 8px;
`;

const ActivityLogLink = styled(Link)`
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid var(--erp-line);
  border-left: 3px solid var(--tone);
  border-radius: 8px;
  color: inherit;
  display: grid;
  gap: 6px;
  min-height: 64px;
  padding: 10px 11px;
  text-decoration: none;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease;

  strong {
    color: var(--erp-text);
    display: -webkit-box;
    font-size: 0.84rem;
    font-weight: 920;
    line-height: 1.35;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  &:hover,
  &:focus-visible {
    background: var(--tone-soft);
    border-color: color-mix(in srgb, var(--tone) 42%, transparent);
  }

  &:focus-visible {
    outline: 2px solid var(--tone);
    outline-offset: 2px;
  }
`;

const ActivityMeta = styled.span`
  align-items: center;
  color: var(--erp-muted);
  display: flex;
  flex-wrap: wrap;
  gap: 5px 8px;
  min-width: 0;

  span {
    font-size: 0.71rem;
    font-weight: 820;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const ActivityState = styled.div`
  background: rgba(255, 255, 255, 0.035);
  border: 1px dashed var(--erp-line-strong);
  border-radius: 8px;
  color: var(--erp-muted);
  font-size: 0.78rem;
  font-weight: 800;
  line-height: 1.5;
  min-height: 78px;
  padding: 13px;
`;

const CompactList = styled.div`
  display: grid;
  gap: 9px;
`;

const LauncherOverlay = styled.div`
  align-items: start;
  background: rgba(5, 8, 12, 0.64);
  display: flex;
  inset: 0;
  justify-content: center;
  padding: clamp(20px, 8vh, 76px) 16px 20px;
  position: fixed;
  overscroll-behavior: contain;
  z-index: 80;

  @media (forced-colors: active) {
    background: Canvas;
  }
`;

const LauncherDialog = styled.div`
  animation: ${riseIn} 0.2s ease both;
  background: rgba(14, 19, 25, 0.98);
  border: 1px solid rgba(217, 226, 236, 0.18);
  border-radius: 8px;
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.45);
  color: var(--erp-text);
  display: grid;
  gap: 12px;
  max-height: min(720px, calc(100vh - 40px));
  max-width: 760px;
  overflow: hidden;
  overscroll-behavior: contain;
  padding: 14px;
  width: min(760px, calc(100vw - 32px));

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }

  @media (forced-colors: active) {
    background: Canvas;
    border-color: CanvasText;
    color: CanvasText;
  }
`;

const LauncherHeading = styled.div`
  align-items: center;
  display: grid;
  gap: 12px;
  grid-template-columns: 38px minmax(0, 1fr) 34px;

  > span {
    align-items: center;
    background: rgba(91, 167, 255, 0.14);
    border: 1px solid rgba(91, 167, 255, 0.32);
    border-radius: 8px;
    color: #7dd3fc;
    display: inline-flex;
    height: 38px;
    justify-content: center;
    width: 38px;
  }

  div {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  strong {
    color: var(--erp-text);
    font-size: 0.98rem;
    font-weight: 950;
  }

  em {
    color: var(--erp-muted);
    font-size: 0.76rem;
    font-style: normal;
    font-weight: 800;
  }

  button {
    align-items: center;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--erp-line);
    border-radius: 8px;
    color: var(--erp-muted);
    cursor: pointer;
    display: inline-flex;
    height: 34px;
    justify-content: center;
    width: 34px;
  }

  button:focus-visible {
    outline: 2px solid #7dd3fc;
    outline-offset: 2px;
  }
`;

const LauncherSearchBox = styled.label`
  align-items: center;
  background: rgba(255, 255, 255, 0.055);
  border: 1px solid rgba(217, 226, 236, 0.2);
  border-radius: 8px;
  color: #7dd3fc;
  display: grid;
  gap: 10px;
  grid-template-columns: 22px minmax(0, 1fr);
  min-height: 52px;
  padding: 0 13px;

  &:focus-within {
    border-color: rgba(125, 211, 252, 0.56);
    box-shadow: 0 0 0 3px rgba(125, 211, 252, 0.1);
  }

  input {
    background: transparent;
    border: 0;
    color: var(--erp-text);
    font: inherit;
    font-size: 0.98rem;
    font-weight: 850;
    min-width: 0;
    outline: 0;
  }

  input::placeholder {
    color: var(--erp-faint);
  }
`;

const RecentCommandStrip = styled.div`
  align-items: center;
  display: grid;
  gap: 8px;
  grid-template-columns: auto minmax(0, 1fr) 30px;
  min-width: 0;

  > strong {
    color: var(--erp-faint);
    font-size: 0.72rem;
    font-weight: 950;
    letter-spacing: 0;
    text-transform: uppercase;
    white-space: nowrap;
  }

  > div {
    display: flex;
    gap: 7px;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  @media (max-width: 560px) {
    grid-template-columns: minmax(0, 1fr) 30px;

    > strong {
      grid-column: 1 / -1;
    }
  }
`;

const RecentCommandButton = styled.button`
  align-items: center;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid var(--erp-line);
  border-radius: 999px;
  color: var(--erp-muted);
  cursor: pointer;
  display: inline-flex;
  flex: 0 0 auto;
  gap: 6px;
  max-width: 190px;
  min-height: 30px;
  padding: 0 11px;

  span {
    font-size: 0.76rem;
    font-weight: 900;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &:hover,
  &:focus-visible {
    background: var(--tone-soft);
    border-color: color-mix(in srgb, var(--tone) 42%, transparent);
    color: var(--tone);
  }

  &:focus-visible {
    outline: 2px solid var(--tone);
    outline-offset: 2px;
  }

  @media (forced-colors: active) {
    background: ButtonFace;
    border-color: ButtonText;
    color: ButtonText;

    &:focus-visible {
      outline-color: Highlight;
    }
  }
`;

const RecentCommandClearButton = styled.button`
  align-items: center;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid var(--erp-line);
  border-radius: 999px;
  color: var(--erp-faint);
  cursor: pointer;
  display: inline-flex;
  height: 30px;
  justify-content: center;
  width: 30px;

  &:hover,
  &:focus-visible {
    background: rgba(244, 63, 94, 0.12);
    border-color: rgba(244, 63, 94, 0.36);
    color: #fb7185;
  }

  &:focus-visible {
    outline: 2px solid #fb7185;
    outline-offset: 2px;
  }

  @media (forced-colors: active) {
    background: ButtonFace;
    border-color: ButtonText;
    color: ButtonText;

    &:focus-visible {
      outline-color: Highlight;
    }
  }
`;

const LauncherFilters = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 7px;

  button {
    background: rgba(255, 255, 255, 0.045);
    border: 1px solid var(--erp-line);
    border-radius: 999px;
    color: var(--erp-muted);
    cursor: pointer;
    font-size: 0.76rem;
    font-weight: 900;
    min-height: 30px;
    padding: 0 11px;
  }

  button[aria-pressed='true'] {
    background: rgba(237, 244, 247, 0.96);
    border-color: rgba(237, 244, 247, 0.96);
    color: #0b0f14;
  }

  button:focus-visible {
    outline: 2px solid #7dd3fc;
    outline-offset: 2px;
  }
`;

const LauncherResults = styled.div`
  display: grid;
  gap: 8px;
  max-height: min(470px, 58vh);
  overflow-y: auto;
  padding-right: 2px;
`;

const LauncherResult = styled(Link)<{ $active: boolean }>`
  align-items: center;
  background: ${({ $active }) => ($active ? 'var(--tone-soft)' : 'rgba(255, 255, 255, 0.035)')};
  border: 1px solid ${({ $active }) => ($active ? 'color-mix(in srgb, var(--tone) 45%, transparent)' : 'var(--erp-line)')};
  border-left: 3px solid var(--tone);
  border-radius: 8px;
  color: var(--erp-text);
  display: grid;
  gap: 11px;
  grid-template-columns: 38px minmax(0, 1fr) minmax(84px, auto);
  min-height: 68px;
  padding: 10px 12px;
  text-decoration: none;

  &:focus-visible {
    outline: 2px solid var(--tone);
    outline-offset: 2px;
  }

  @media (max-width: 560px) {
    grid-template-columns: 36px minmax(0, 1fr);
  }

  @media (forced-colors: active) {
    background: ${({ $active }) => ($active ? 'Highlight' : 'Canvas')};
    border-color: ${({ $active }) => ($active ? 'Highlight' : 'CanvasText')};
    border-left-color: Highlight;
    color: ${({ $active }) => ($active ? 'HighlightText' : 'CanvasText')};

    &:focus-visible {
      outline-color: Highlight;
    }
  }
`;

const ResultIcon = styled.span`
  align-items: center;
  background: var(--tone-soft);
  border: 1px solid color-mix(in srgb, var(--tone) 36%, transparent);
  border-radius: 8px;
  color: var(--tone);
  display: inline-flex;
  height: 38px;
  justify-content: center;
  width: 38px;
`;

const ResultCopy = styled.span`
  display: grid;
  gap: 3px;
  min-width: 0;

  strong {
    color: var(--erp-text);
    font-size: 0.9rem;
    font-weight: 950;
    line-height: 1.25;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    color: var(--erp-muted);
    display: -webkit-box;
    font-size: 0.76rem;
    font-weight: 760;
    line-height: 1.35;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
`;

const ResultMeta = styled.span`
  align-items: center;
  color: var(--erp-faint);
  display: inline-flex;
  font-size: 0.72rem;
  font-weight: 900;
  gap: 5px;
  justify-content: flex-end;
  min-width: 0;

  span {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 560px) {
    display: none;
  }
`;

const LauncherState = styled.p`
  background: rgba(245, 184, 75, 0.12);
  border: 1px solid rgba(245, 184, 75, 0.28);
  border-radius: 8px;
  color: var(--erp-muted);
  font-size: 0.78rem;
  font-weight: 800;
  line-height: 1.45;
  margin: 0;
  padding: 10px 12px;
`;

const LauncherEmpty = styled.div`
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid var(--erp-line);
  border-radius: 8px;
  display: grid;
  gap: 4px;
  min-height: 90px;
  place-content: center;
  text-align: center;

  strong {
    color: var(--erp-text);
    font-size: 0.9rem;
    font-weight: 950;
  }

  span {
    color: var(--erp-muted);
    font-size: 0.76rem;
    font-weight: 760;
  }
`;
