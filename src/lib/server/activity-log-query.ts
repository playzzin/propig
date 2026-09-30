import type { ActivityLogRecord, ActivityLogsResponse } from "../../types/activityLog";

export const DEFAULT_ACTIVITY_LOG_LIMIT = 50;
export const MAX_ACTIVITY_LOG_LIMIT = 100;
export const DEFAULT_ACTIVITY_LOG_SCAN_LIMIT = 500;
export const MAX_ACTIVITY_LOG_SCAN_LIMIT = 1000;
export const ERP_HOME_MODULE_ACTION = "erp_home.module_opened";
export const ERP_HOME_COMMAND_ACTION = "erp_home.command_executed";
export const ERP_HOME_ACTIVITY_ACTIONS = new Set([ERP_HOME_MODULE_ACTION, ERP_HOME_COMMAND_ACTION]);

export type ActivityScopeFilter = "all" | "erp-home" | "module-opened" | "command-executed";

export type ActivityLogFilters = {
  scope: ActivityScopeFilter;
  action: string | null;
  search: string;
  selectedLogId: string | null;
  scanLimit: number;
};

export type ActivityLogContractPageInput = {
  logs: ActivityLogRecord[];
  selectedLog?: ActivityLogRecord | null;
  filters: ActivityLogFilters;
  limit: number;
  cursor?: string | null;
  scanLimit?: number;
};

export function parseActivityLogLimit(value: string | null): number {
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit <= 0) return DEFAULT_ACTIVITY_LOG_LIMIT;
  return Math.min(Math.floor(limit), MAX_ACTIVITY_LOG_LIMIT);
}

export function parseActivityLogScanLimit(value: string | null): number {
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit <= 0) return DEFAULT_ACTIVITY_LOG_SCAN_LIMIT;
  return Math.min(Math.floor(limit), MAX_ACTIVITY_LOG_SCAN_LIMIT);
}

export function normalizeActivityLogParam(value: string | null, maxLength = 240): string | null {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

export function parseActivityLogScope(value: string | null): ActivityScopeFilter {
  return value === "erp-home" || value === "module-opened" || value === "command-executed" ? value : "all";
}

export function parseActivityLogFilters(searchParams: URLSearchParams): ActivityLogFilters {
  const action = normalizeActivityLogParam(searchParams.get("action"), 120);

  return {
    scope: parseActivityLogScope(searchParams.get("scope")),
    action: action === "all" ? null : action,
    search: normalizeActivityLogParam(searchParams.get("q") ?? searchParams.get("search"), 120) ?? "",
    selectedLogId: normalizeActivityLogParam(searchParams.get("log"), 240),
    scanLimit: parseActivityLogScanLimit(searchParams.get("scanLimit")),
  };
}

export function formatActivityLogTarget(log: ActivityLogRecord): string {
  return log.target.label || log.target.path || log.target.id || log.target.type;
}

export function getActivityLogActionLabel(action: string): string {
  const labels: Record<string, string> = {
    "feedback.open": "피드백",
    "menu.save": "메뉴 저장",
    "admin.menu.update": "메뉴 업데이트",
    "admin.user.update": "사용자 권한 변경",
    "admin.storage.folder.create": "Storage 폴더 생성",
    "admin.storage.file.upload": "Storage 업로드",
    "erp_home.module_opened": "ERP 홈 모듈 이동",
    "erp_home.command_executed": "ERP 홈 명령 실행",
  };

  return labels[action] ?? action;
}

export function activityLogMatchesScope(log: ActivityLogRecord, scope: ActivityScopeFilter): boolean {
  if (scope === "all") return true;
  if (scope === "erp-home") return ERP_HOME_ACTIVITY_ACTIONS.has(log.action);
  if (scope === "module-opened") return log.action === ERP_HOME_MODULE_ACTION;
  return log.action === ERP_HOME_COMMAND_ACTION;
}

export function activityLogMatchesSearch(log: ActivityLogRecord, search: string): boolean {
  const normalizedSearch = search.trim().toLocaleLowerCase("ko-KR");
  if (!normalizedSearch) return true;

  const metadataText = Object.values(log.metadata ?? {})
    .filter((value) => ["string", "number", "boolean"].includes(typeof value))
    .join(" ");
  const haystack = [
    log.id,
    log.action,
    getActivityLogActionLabel(log.action),
    log.summary ?? "",
    formatActivityLogTarget(log),
    metadataText,
    log.actor.uid,
    log.actor.email ?? "",
    log.route ?? "",
  ]
    .join(" ")
    .toLocaleLowerCase("ko-KR");

  return normalizedSearch
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

export function activityLogMatchesFilters(log: ActivityLogRecord, filters: ActivityLogFilters): boolean {
  if (filters.action && log.action !== filters.action) return false;
  return activityLogMatchesScope(log, filters.scope) && activityLogMatchesSearch(log, filters.search);
}

export function getActivityLogResultLimit(limit: number, selectedLogMatched: boolean, hasCursor: boolean): number {
  return selectedLogMatched && !hasCursor ? Math.max(limit - 1, 1) : limit;
}

export function createActivityLogContractPage({
  logs,
  selectedLog = null,
  filters,
  limit,
  cursor = null,
  scanLimit = filters.scanLimit,
}: ActivityLogContractPageInput): ActivityLogsResponse {
  const selectedLogMatched = selectedLog ? activityLogMatchesFilters(selectedLog, filters) : filters.selectedLogId ? false : null;
  const resultLimit = getActivityLogResultLimit(limit, Boolean(selectedLog && selectedLogMatched), Boolean(cursor));
  const pageLogs: ActivityLogRecord[] = [];
  const startIndex = cursor ? Math.max(logs.findIndex((log) => log.id === cursor) + 1, 0) : 0;
  const boundedScanLimit = Math.max(0, scanLimit);
  let scannedCount = 0;
  let nextCursor: string | null = null;
  let lastScannedLog: ActivityLogRecord | null = null;
  let hasMoreRawLogs = false;

  for (let index = startIndex; index < logs.length && scannedCount < boundedScanLimit; index += 1) {
    const log = logs[index];
    lastScannedLog = log;
    scannedCount += 1;

    if (!activityLogMatchesFilters(log, filters)) {
      hasMoreRawLogs = index < logs.length - 1;
      continue;
    }

    if (log.id !== selectedLog?.id && pageLogs.length < resultLimit) {
      pageLogs.push(log);
    }

    if (pageLogs.length >= resultLimit) {
      hasMoreRawLogs = index < logs.length - 1;
      break;
    }

    hasMoreRawLogs = index < logs.length - 1;
  }

  if (scannedCount >= boundedScanLimit && startIndex + scannedCount < logs.length) {
    hasMoreRawLogs = true;
  }

  if (selectedLog && selectedLogMatched && !cursor && !pageLogs.some((log) => log.id === selectedLog.id)) {
    pageLogs.unshift(selectedLog);
  }

  if (hasMoreRawLogs && lastScannedLog) {
    nextCursor = lastScannedLog.id;
  }

  return {
    logs: pageLogs,
    nextCursor,
    matchedCount: pageLogs.length,
    scannedCount,
    scanLimitReached: Boolean(nextCursor),
    selectedLogMatched,
  };
}
