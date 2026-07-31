"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import styled from "styled-components";
import { Activity, Clock3, Loader2, RefreshCw, Search, ShieldCheck, UserRound, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import type { ActivityLogRecord, ActivityLogsResponse } from "@/types/activityLog";

const ACTIVITY_LOGS_QUERY_KEY = ["admin-activity-logs"] as const;
const ACTIVITY_LOG_PAGE_LIMIT = 50;
const ERP_HOME_MODULE_ACTION = "erp_home.module_opened";
const ERP_HOME_COMMAND_ACTION = "erp_home.command_executed";
const ERP_HOME_ACTIONS = new Set([ERP_HOME_MODULE_ACTION, ERP_HOME_COMMAND_ACTION]);
const ACTIVITY_LOG_DENSITY_STORAGE_KEY = "admin-activity-logs:density:v1";
const ACTIVITY_LOG_VERIFY_FIXTURE_PARAM = "__adminActivityFixture";
const ACTIVITY_LOG_VERIFY_TOKEN = "admin-activity-fixture-token";
type ActivityScopeFilter = "all" | "erp-home" | "module-opened" | "command-executed";
type ActivityLogDensity = "comfortable" | "compact";
type ActivityLogServerFilters = {
  scope: ActivityScopeFilter;
  action: string;
  search: string;
  highlightedLogId: string | null;
};
type ActivityLogsCurrentUser = NonNullable<ReturnType<typeof useAuth>["currentUser"]>;
const DENSITY_OPTIONS: Array<{ value: ActivityLogDensity; label: string }> = [
  { value: "comfortable", label: "편안" },
  { value: "compact", label: "촘촘" },
];

async function fetchActivityLogs(
  currentUser: NonNullable<ReturnType<typeof useAuth>["currentUser"]>,
  cursor: string | null,
  filters: ActivityLogServerFilters,
) {
  const token = await currentUser.getIdToken();
  const params = new URLSearchParams({ limit: String(ACTIVITY_LOG_PAGE_LIMIT) });
  if (cursor) params.set("cursor", cursor);
  if (filters.scope !== "all") params.set("scope", filters.scope);
  if (filters.action !== "all") params.set("action", filters.action);
  if (filters.search) params.set("q", filters.search);
  if (filters.highlightedLogId) params.set("log", filters.highlightedLogId);

  const response = await fetch(`/api/admin/activity-logs?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || "작업 히스토리를 불러오지 못했습니다.");
  }

  return (await response.json()) as ActivityLogsResponse;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatTarget(log: ActivityLogRecord): string {
  return log.target.label || log.target.path || log.target.id || log.target.type;
}

function getActionLabel(action: string): string {
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

function readInitialActivitySearch(): string {
  if (typeof window === "undefined") return "";

  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("q") ?? params.get("search") ?? "";
  } catch {
    return "";
  }
}

function readInitialScopeFilter(): ActivityScopeFilter {
  if (typeof window === "undefined") return "all";

  try {
    const params = new URLSearchParams(window.location.search);
    const scope = params.get("scope");
    return scope === "erp-home" || scope === "module-opened" || scope === "command-executed" ? scope : "all";
  } catch {
    return "all";
  }
}

function readInitialActionFilter(): string {
  if (typeof window === "undefined") return "all";

  try {
    const params = new URLSearchParams(window.location.search);
    const action = params.get("action")?.trim();
    return action || "all";
  } catch {
    return "all";
  }
}

function readInitialHighlightedLogId(): string | null {
  if (typeof window === "undefined") return null;

  try {
    const params = new URLSearchParams(window.location.search);
    const logId = params.get("log")?.trim();
    return logId || null;
  } catch {
    return null;
  }
}

function readInitialDensity(): ActivityLogDensity {
  if (typeof window === "undefined") return "comfortable";

  try {
    const density = window.localStorage.getItem(ACTIVITY_LOG_DENSITY_STORAGE_KEY);
    return density === "compact" ? "compact" : "comfortable";
  } catch {
    return "comfortable";
  }
}

function writeDensityPreference(density: ActivityLogDensity): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(ACTIVITY_LOG_DENSITY_STORAGE_KEY, density);
  } catch {
    // Keep density usable even when browser storage is unavailable.
  }
}

function isActivityLogVerifyFixtureEnabled(): boolean {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return false;

  try {
    return new URLSearchParams(window.location.search).get(ACTIVITY_LOG_VERIFY_FIXTURE_PARAM) === "1";
  } catch {
    return false;
  }
}

function createActivityLogVerifyUser(): ActivityLogsCurrentUser {
  return {
    uid: "admin-activity-fixture-user",
    email: "admin-activity-fixture@example.com",
    displayName: "Admin Activity Fixture",
    getIdToken: async () => ACTIVITY_LOG_VERIFY_TOKEN,
    getIdTokenResult: async () =>
      ({
        claims: { admin: true, role: "admin" },
        token: ACTIVITY_LOG_VERIFY_TOKEN,
        authTime: "",
        issuedAtTime: "",
        expirationTime: "",
        signInProvider: null,
        signInSecondFactor: null,
      }) as Awaited<ReturnType<ActivityLogsCurrentUser["getIdTokenResult"]>>,
  } as ActivityLogsCurrentUser;
}

export default function ActivityLogsPage() {
  const { loginWithGoogle, isConfigured } = useAuth();
  const adminAccess = useAdminAccess();
  const [verificationUser, setVerificationUser] = useState<ActivityLogsCurrentUser | null>(null);
  const currentUser = verificationUser ?? adminAccess.currentUser;
  const isAdmin = verificationUser ? true : adminAccess.isAdmin;
  const isCheckingAdmin = verificationUser ? false : adminAccess.isCheckingAdmin;
  const [actionFilter, setActionFilter] = useState(readInitialActionFilter);
  const [scopeFilter, setScopeFilter] = useState<ActivityScopeFilter>(readInitialScopeFilter);
  const [searchTerm, setSearchTerm] = useState(readInitialActivitySearch);
  const [serverSearchTerm, setServerSearchTerm] = useState(readInitialActivitySearch);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCursors, setPageCursors] = useState<Array<string | null>>([null]);
  const [highlightedLogId, setHighlightedLogId] = useState(readInitialHighlightedLogId);
  const [density, setDensity] = useState<ActivityLogDensity>(readInitialDensity);
  const highlightedLogRef = useRef<HTMLElement | null>(null);
  const currentCursor = pageCursors[pageIndex] ?? null;

  useEffect(() => {
    if (!isActivityLogVerifyFixtureEnabled()) return undefined;

    const timer = window.setTimeout(() => {
      setVerificationUser(createActivityLogVerifyUser());
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const logsQuery = useQuery({
    queryKey: [
      ...ACTIVITY_LOGS_QUERY_KEY,
      currentUser?.uid ?? "anonymous",
      currentCursor,
      scopeFilter,
      actionFilter,
      serverSearchTerm,
      highlightedLogId ?? "",
    ],
    queryFn: () =>
      fetchActivityLogs(currentUser!, currentCursor, {
        scope: scopeFilter,
        action: actionFilter,
        search: serverSearchTerm,
        highlightedLogId,
      }),
    enabled: Boolean(currentUser && isAdmin),
    retry: false,
  });

  const logs = useMemo(() => logsQuery.data?.logs ?? [], [logsQuery.data?.logs]);
  const displayedLogs = logs;
  const actionOptions = useMemo(() => {
    const options = new Set(logs.map((log) => log.action));
    if (actionFilter !== "all") options.add(actionFilter);
    return Array.from(options).sort();
  }, [actionFilter, logs]);
  const scopeOptions = useMemo(
    () => [
      { value: "all" as const, label: "전체", count: logs.length },
      { value: "erp-home" as const, label: "ERP 홈", count: logs.filter((log) => ERP_HOME_ACTIONS.has(log.action)).length },
      { value: "module-opened" as const, label: "모듈 이동", count: logs.filter((log) => log.action === ERP_HOME_MODULE_ACTION).length },
      { value: "command-executed" as const, label: "명령 실행", count: logs.filter((log) => log.action === ERP_HOME_COMMAND_ACTION).length },
    ],
    [logs],
  );
  const highlightedLogVisible = Boolean(highlightedLogId && displayedLogs.some((log) => log.id === highlightedLogId));
  const serverScannedCount = logsQuery.data?.scannedCount ?? logs.length;
  const serverMatchedCount = logsQuery.data?.matchedCount ?? displayedLogs.length;
  const isSearchSyncing = searchTerm.trim() !== serverSearchTerm;
  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    const activeScopeLabel = scopeOptions.find((option) => option.value === scopeFilter)?.label;
    if (scopeFilter !== "all" && activeScopeLabel) labels.push(`범위: ${activeScopeLabel}`);
    if (actionFilter !== "all") labels.push(`작업: ${getActionLabel(actionFilter)}`);
    if (searchTerm.trim()) labels.push(`검색: ${searchTerm.trim()}`);
    if (highlightedLogId) labels.push("선택 기록");
    return labels;
  }, [actionFilter, highlightedLogId, scopeFilter, scopeOptions, searchTerm]);
  const hasActiveFilters = activeFilterLabels.length > 0;

  const resetFilters = () => {
    setScopeFilter("all");
    setActionFilter("all");
    setSearchTerm("");
    setServerSearchTerm("");
    setHighlightedLogId(null);
    setPageIndex(0);
    setPageCursors([null]);
  };

  const changeDensity = (nextDensity: ActivityLogDensity) => {
    setDensity(nextDensity);
    writeDensityPreference(nextDensity);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setServerSearchTerm(searchTerm.trim());
      setPageIndex(0);
      setPageCursors([null]);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const trimmedSearch = searchTerm.trim();

    if (trimmedSearch) {
      params.set("q", trimmedSearch);
      params.delete("search");
    } else {
      params.delete("q");
      params.delete("search");
    }

    if (scopeFilter === "all") params.delete("scope");
    else params.set("scope", scopeFilter);

    if (actionFilter === "all") params.delete("action");
    else params.set("action", actionFilter);

    if (highlightedLogId) params.set("log", highlightedLogId);
    else params.delete("log");

    const queryString = params.toString();
    const nextUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ""}`;
    window.history.replaceState(null, "", nextUrl);
  }, [actionFilter, highlightedLogId, scopeFilter, searchTerm]);

  useEffect(() => {
    if (!highlightedLogVisible) return;
    const scrollTimer = window.setTimeout(() => {
      highlightedLogRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 80);

    return () => window.clearTimeout(scrollTimer);
  }, [highlightedLogVisible, pageIndex]);

  const goToNextPage = () => {
    const nextCursor = logsQuery.data?.nextCursor;
    if (!nextCursor) return;

    setPageCursors((current) => {
      const next = current.slice(0, pageIndex + 1);
      next[pageIndex + 1] = nextCursor;
      return next;
    });
    setPageIndex((current) => current + 1);
  };

  const goToPreviousPage = () => {
    setPageIndex((current) => Math.max(0, current - 1));
  };

  if (isCheckingAdmin) {
    return (
      <PageShell>
        <AccessState>
          <span className="icon">
            <Spinner size={24} />
          </span>
          <h1>권한 확인 중</h1>
          <p>작업 히스토리 접근 권한을 확인하고 있습니다.</p>
        </AccessState>
      </PageShell>
    );
  }

  if (!verificationUser && (!isConfigured || !currentUser)) {
    return (
      <PageShell>
        <AccessState>
          <span className="icon">
            <UserRound size={24} />
          </span>
          <h1>로그인이 필요합니다</h1>
          <p>관리자 작업 히스토리는 로그인한 관리자만 확인할 수 있습니다.</p>
          <PrimaryButton type="button" onClick={() => void loginWithGoogle()} disabled={!isConfigured}>
            Google로 로그인
          </PrimaryButton>
        </AccessState>
      </PageShell>
    );
  }

  if (!isAdmin) {
    return (
      <PageShell>
        <AccessState>
          <span className="icon">
            <ShieldCheck size={24} />
          </span>
          <h1>관리자 권한이 필요합니다</h1>
          <p>작업 히스토리에는 사용자 권한, 메뉴, Storage 변경 기록이 포함됩니다.</p>
        </AccessState>
      </PageShell>
    );
  }

  return (
    <PageShell data-log-density={density}>
      <HeaderBand>
        <TitleBlock>
          <span>
            <Activity size={15} />
            Activity logs
          </span>
          <h1>작업 히스토리</h1>
          <p>관리자 변경, 메뉴 저장, Storage 작업을 시간순으로 확인합니다.</p>
        </TitleBlock>

        <Toolbar>
          <SearchBox>
            <Search size={16} />
            <input
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setPageIndex(0);
                setPageCursors([null]);
              }}
              placeholder="요약, 대상, 사용자 검색"
              aria-label="작업 히스토리 검색"
            />
            {searchTerm ? (
              <button
                type="button"
                aria-label="검색 지우기"
                onClick={() => {
                  setSearchTerm("");
                  setPageIndex(0);
                  setPageCursors([null]);
                }}
              >
                <X size={15} />
              </button>
            ) : null}
          </SearchBox>
          <select
            value={actionFilter}
            onChange={(event) => {
              setActionFilter(event.target.value);
              setPageIndex(0);
              setPageCursors([null]);
            }}
            aria-label="작업 필터"
          >
            <option value="all">전체 작업</option>
            {actionOptions.map((action) => (
              <option key={action} value={action}>
                {getActionLabel(action)}
              </option>
            ))}
          </select>
          <DensityControl aria-label="작업 히스토리 밀도">
            {DENSITY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={density === option.value}
                onClick={() => changeDensity(option.value)}
              >
                {option.label}
              </button>
            ))}
          </DensityControl>
          <IconButton
            type="button"
            aria-label="새로고침"
            title="새로고침"
            onClick={() => void logsQuery.refetch()}
            disabled={logsQuery.isFetching}
          >
            {logsQuery.isFetching ? <Spinner size={17} /> : <RefreshCw size={17} />}
          </IconButton>
        </Toolbar>
      </HeaderBand>

      <ScopeStrip aria-label="활동 로그 범위 필터">
        {scopeOptions.map((option) => (
          <ScopeButton
            key={option.value}
            type="button"
            aria-pressed={scopeFilter === option.value}
            onClick={() => {
              setScopeFilter(option.value);
              setActionFilter("all");
              setPageIndex(0);
              setPageCursors([null]);
            }}
          >
            <span>{option.label}</span>
            <em>{option.count.toLocaleString("ko-KR")}</em>
          </ScopeButton>
        ))}
      </ScopeStrip>

      {hasActiveFilters ? (
        <FilterStatusBar role="status" aria-live="polite">
          <FilterPillList aria-label="활성 서버 필터">
            {activeFilterLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </FilterPillList>
          <button type="button" onClick={resetFilters}>
            <X size={14} />
            필터 초기화
          </button>
        </FilterStatusBar>
      ) : null}

      <SummaryStrip>
        <SummaryItem>
          <strong>{logs.length.toLocaleString("ko-KR")}</strong>
          <span>현재 페이지 기록</span>
        </SummaryItem>
        <SummaryItem>
          <strong>{actionOptions.length.toLocaleString("ko-KR")}</strong>
          <span>작업 종류</span>
        </SummaryItem>
        <SummaryItem>
          <strong>{serverMatchedCount.toLocaleString("ko-KR")}</strong>
          <span>{isSearchSyncing ? "검색 적용 중" : "서버 필터 결과"}</span>
        </SummaryItem>
        <SummaryItem>
          <strong>{serverScannedCount.toLocaleString("ko-KR")}</strong>
          <span>{logsQuery.data?.scanLimitReached ? "스캔 후 다음 페이지" : "스캔한 원본 로그"}</span>
        </SummaryItem>
      </SummaryStrip>

      {highlightedLogId ? (
        <HighlightNotice $found={highlightedLogVisible}>
          <strong>
            {highlightedLogVisible
              ? "선택한 기록을 강조했습니다."
              : logsQuery.data?.selectedLogMatched === false
                ? "선택한 기록을 찾을 수 없습니다."
                : "선택한 기록이 현재 페이지에 없습니다."}
          </strong>
          <span>
            {highlightedLogVisible
              ? "ERP 홈에서 이동한 항목이 목록 안에서 강조 표시됩니다."
              : logsQuery.data?.selectedLogMatched === false
                ? "기록이 삭제되었거나 현재 검색/작업 필터와 일치하지 않습니다."
                : "다음 페이지를 넘기거나 검색 필터를 조정해 해당 기록을 찾을 수 있습니다."}
          </span>
        </HighlightNotice>
      ) : null}

      <LogPanel>
        {logsQuery.isLoading ? (
          <EmptyState>
            <Spinner size={24} />
            작업 히스토리를 불러오는 중입니다.
          </EmptyState>
        ) : logsQuery.error ? (
          <EmptyState>{logsQuery.error instanceof Error ? logsQuery.error.message : "조회에 실패했습니다."}</EmptyState>
        ) : displayedLogs.length === 0 ? (
          <EmptyState>{isSearchSyncing ? "검색 조건을 서버에 적용하는 중입니다." : "표시할 작업 기록이 없습니다."}</EmptyState>
        ) : (
          <LogList $density={density} data-density={density}>
            {displayedLogs.map((log) => {
              const highlighted = highlightedLogId === log.id;
              const target = formatTarget(log);

              return (
                <LogRow
                  key={log.id}
                  ref={highlighted ? highlightedLogRef : null}
                  $highlighted={highlighted}
                  $density={density}
                  aria-current={highlighted ? "true" : undefined}
                  data-log-id={log.id}
                  data-highlighted={highlighted ? "true" : undefined}
                >
                  <ActionBadge>{getActionLabel(log.action)}</ActionBadge>
                  <LogMain>
                    <strong>{log.summary || target}</strong>
                    <LogMetaGrid>
                      <span>
                        <em>사용자</em>
                        {log.actor.email || log.actor.uid}
                      </span>
                      <span>
                        <em>대상</em>
                        {target}
                      </span>
                      {log.route ? (
                        <span>
                          <em>경로</em>
                          {log.route}
                        </span>
                      ) : null}
                    </LogMetaGrid>
                  </LogMain>
                  <TimeBlock>
                    <Clock3 size={15} />
                    <time dateTime={log.createdAt ?? undefined}>{formatDate(log.createdAt)}</time>
                  </TimeBlock>
                </LogRow>
              );
            })}
          </LogList>
        )}
      </LogPanel>

      <PaginationBar aria-label="활동 로그 페이지 이동">
        <span>
          {pageIndex + 1}페이지 · {displayedLogs.length.toLocaleString("ko-KR")}개 표시 ·{" "}
          {serverScannedCount.toLocaleString("ko-KR")}개 스캔
        </span>
        <PaginationActions>
          <PageButton type="button" onClick={goToPreviousPage} disabled={pageIndex === 0 || logsQuery.isFetching}>
            이전
          </PageButton>
          <PageButton
            type="button"
            onClick={goToNextPage}
            disabled={!logsQuery.data?.nextCursor || logsQuery.isFetching}
          >
            다음
          </PageButton>
        </PaginationActions>
      </PaginationBar>
    </PageShell>
  );
}

const PageShell = styled.main`
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #f5f7fb;
  color: #172033;

  @media (max-width: 760px) {
    overflow-x: hidden;
    overflow-y: auto;
  }
`;

const HeaderBand = styled.header`
  flex: 0 0 auto;
  padding: 20px 28px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  background: #ffffff;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
    padding: 18px 16px;
  }
`;

const TitleBlock = styled.div`
  min-width: 0;

  span {
    color: #0f766e;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 0.76rem;
    font-weight: 900;
    text-transform: uppercase;
  }

  h1 {
    margin: 5px 0 0;
    color: #111827;
    font-size: clamp(1.42rem, 2.4vw, 2rem);
    line-height: 1.08;
    font-weight: 950;
    letter-spacing: 0;
  }

  p {
    margin: 7px 0 0;
    color: #64748b;
    line-height: 1.5;
  }
`;

const Toolbar = styled.div`
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;

  select {
    min-width: 150px;
    height: 38px;
    border-radius: 8px;
    border: 1px solid rgba(15, 23, 42, 0.12);
    background: #ffffff;
    color: #172033;
    padding: 0 10px;
    font-weight: 850;
  }

  @media (max-width: 760px) {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
`;

const SearchBox = styled.label`
  align-items: center;
  background: #f8fafc;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 8px;
  color: #64748b;
  display: grid;
  gap: 8px;
  grid-template-columns: 18px minmax(160px, 220px) auto;
  min-height: 38px;
  padding: 0 9px;

  &:focus-within {
    background: #ffffff;
    border-color: rgba(15, 118, 110, 0.42);
    box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.08);
  }

  input {
    background: transparent;
    border: 0;
    color: #172033;
    font: inherit;
    font-size: 0.82rem;
    font-weight: 800;
    min-width: 0;
    outline: 0;
  }

  button {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 8px;
    color: #94a3b8;
    cursor: pointer;
    display: inline-flex;
    height: 28px;
    justify-content: center;
    width: 28px;
  }

  button:hover {
    background: #e2e8f0;
    color: #334155;
  }

  @media (max-width: 760px) {
    grid-template-columns: 18px minmax(0, 1fr) auto;
    width: 100%;
  }
`;

const DensityControl = styled.div`
  align-items: center;
  background: #f8fafc;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 8px;
  display: inline-flex;
  height: 38px;
  padding: 3px;

  button {
    background: transparent;
    border: 0;
    border-radius: 6px;
    color: #64748b;
    cursor: pointer;
    font-size: 0.76rem;
    font-weight: 950;
    height: 30px;
    min-width: 44px;
    padding: 0 8px;
  }

  button[aria-pressed='true'] {
    background: #0f766e;
    box-shadow: 0 1px 4px rgba(15, 118, 110, 0.22);
    color: #ffffff;
  }

  button:focus-visible {
    outline: 2px solid #0f766e;
    outline-offset: 2px;
  }
`;

const IconButton = styled.button`
  width: 38px;
  height: 38px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 8px;
  background: #ffffff;
  color: #334155;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

const ScopeStrip = styled.nav`
  flex: 0 0 auto;
  padding: 12px 28px 0;
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(4, minmax(0, 1fr));

  @media (max-width: 860px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 520px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    padding: 12px 16px 0;
  }
`;

const ScopeButton = styled.button`
  align-items: center;
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.1);
  border-radius: 8px;
  color: #475569;
  cursor: pointer;
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(0, 1fr) auto;
  min-height: 42px;
  padding: 0 12px;
  text-align: left;

  span {
    font-size: 0.82rem;
    font-weight: 900;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  em {
    align-items: center;
    background: #f1f5f9;
    border-radius: 999px;
    color: #0f766e;
    display: inline-flex;
    font-size: 0.72rem;
    font-style: normal;
    font-weight: 950;
    justify-content: center;
    min-width: 28px;
    padding: 3px 8px;
  }

  &[aria-pressed='true'] {
    background: #ecfdf5;
    border-color: rgba(15, 118, 110, 0.42);
    color: #0f766e;
  }

  &:hover,
  &:focus-visible {
    border-color: rgba(15, 118, 110, 0.42);
  }

  &:focus-visible {
    outline: 2px solid #0f766e;
    outline-offset: 2px;
  }
`;

const FilterStatusBar = styled.div`
  align-items: center;
  background: #ffffff;
  border: 1px solid rgba(15, 118, 110, 0.16);
  border-radius: 8px;
  display: flex;
  gap: 12px;
  justify-content: space-between;
  margin: 12px 28px 0;
  min-height: 46px;
  padding: 8px 10px 8px 12px;

  button {
    align-items: center;
    background: #0f766e;
    border: 1px solid #0f766e;
    border-radius: 8px;
    color: #ffffff;
    cursor: pointer;
    display: inline-flex;
    flex: 0 0 auto;
    gap: 6px;
    font-size: 0.78rem;
    font-weight: 950;
    min-height: 32px;
    padding: 0 10px;
  }

  button:hover,
  button:focus-visible {
    background: #115e59;
    border-color: #115e59;
  }

  button:focus-visible {
    outline: 2px solid #0f766e;
    outline-offset: 2px;
  }

  @media (max-width: 760px) {
    align-items: stretch;
    flex-direction: column;
    margin: 12px 16px 0;
  }
`;

const FilterPillList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  min-width: 0;

  span {
    background: #ecfdf5;
    border: 1px solid rgba(15, 118, 110, 0.18);
    border-radius: 999px;
    color: #0f766e;
    font-size: 0.76rem;
    font-weight: 900;
    max-width: 260px;
    overflow: hidden;
    padding: 5px 9px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const SummaryStrip = styled.section`
  flex: 0 0 auto;
  padding: 14px 28px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 980px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 760px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    padding: 12px 16px;
  }
`;

const SummaryItem = styled.div`
  min-height: 72px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 8px;
  background: #ffffff;
  padding: 13px 14px;
  display: grid;
  gap: 6px;

  strong {
    color: #111827;
    font-size: 1.28rem;
    font-weight: 950;
  }

  span {
    color: #64748b;
    font-size: 0.8rem;
    font-weight: 850;
  }
`;

const HighlightNotice = styled.div<{ $found: boolean }>`
  flex: 0 0 auto;
  margin: 0 28px 12px;
  border: 1px solid ${({ $found }) => ($found ? "rgba(15, 118, 110, 0.34)" : "rgba(217, 119, 6, 0.34)")};
  border-radius: 8px;
  background: ${({ $found }) => ($found ? "#ecfdf5" : "#fffbeb")};
  color: ${({ $found }) => ($found ? "#0f766e" : "#92400e")};
  display: grid;
  gap: 4px;
  padding: 11px 14px;

  strong {
    font-size: 0.84rem;
    font-weight: 950;
  }

  span {
    color: #64748b;
    font-size: 0.78rem;
    font-weight: 780;
    line-height: 1.45;
  }

  @media (max-width: 760px) {
    margin: 0 16px 12px;
  }
`;

const LogPanel = styled.section`
  flex: 1;
  min-height: 0;
  margin: 0 28px 24px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 8px;
  background: #ffffff;
  overflow: hidden;

  @media (max-width: 760px) {
    flex: 0 0 auto;
    min-height: 320px;
    margin: 0 16px 20px;
  }
`;

const LogList = styled.div<{ $density: ActivityLogDensity }>`
  height: 100%;
  overflow-y: auto;
  display: grid;
  align-content: start;
  grid-auto-rows: minmax(${({ $density }) => ($density === "compact" ? "58px" : "76px")}, auto);
`;

const LogRow = styled.article<{ $highlighted?: boolean; $density: ActivityLogDensity }>`
  min-height: ${({ $density }) => ($density === "compact" ? "58px" : "76px")};
  padding: ${({ $density }) => ($density === "compact" ? "9px 14px" : "13px 16px")};
  border-bottom: 1px solid rgba(15, 23, 42, 0.07);
  border-left: 4px solid ${({ $highlighted }) => ($highlighted ? "#0f766e" : "transparent")};
  background: ${({ $highlighted }) => ($highlighted ? "linear-gradient(90deg, rgba(15, 118, 110, 0.11), #ffffff 42%)" : "#ffffff")};
  display: grid;
  grid-template-columns: ${({ $density }) => ($density === "compact" ? "132px minmax(0, 1fr) 166px" : "148px minmax(0, 1fr) 190px")};
  gap: ${({ $density }) => ($density === "compact" ? "10px" : "14px")};
  align-items: center;
  scroll-margin-block: 120px;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
    gap: ${({ $density }) => ($density === "compact" ? "6px" : "8px")};
  }
`;

const ActionBadge = styled.span`
  width: fit-content;
  max-width: 100%;
  min-height: 28px;
  border-radius: 8px;
  background: #ecfdf5;
  color: #0f766e;
  padding: 6px 9px;
  font-size: 0.76rem;
  font-weight: 950;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const LogMain = styled.div`
  min-width: 0;
  display: grid;
  gap: 4px;

  strong {
    color: #111827;
    font-size: 0.92rem;
    font-weight: 950;
    overflow-wrap: anywhere;
  }

  small {
    color: #64748b;
    font-size: 0.78rem;
    font-weight: 780;
    overflow-wrap: anywhere;
  }

  small {
    color: #94a3b8;
  }
`;

const LogMetaGrid = styled.div`
  color: #64748b;
  display: grid;
  gap: 4px 10px;
  grid-template-columns: minmax(120px, 0.62fr) minmax(140px, 0.9fr) minmax(100px, 1fr);
  min-width: 0;

  span {
    align-items: center;
    display: inline-flex;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  em {
    color: #94a3b8;
    flex: 0 0 auto;
    font-size: 0.68rem;
    font-style: normal;
    font-weight: 950;
  }

  @media (max-width: 1080px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 620px) {
    grid-template-columns: 1fr;
  }
`;

const TimeBlock = styled.div`
  color: #475569;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
  font-size: 0.78rem;
  font-weight: 850;

  time {
    white-space: nowrap;
  }

  @media (max-width: 860px) {
    justify-content: flex-start;
  }
`;

const PaginationBar = styled.nav`
  flex: 0 0 auto;
  align-items: center;
  border-top: 1px solid rgba(15, 23, 42, 0.08);
  background: #ffffff;
  display: flex;
  gap: 12px;
  justify-content: space-between;
  min-height: 58px;
  padding: 0 28px;

  > span {
    color: #64748b;
    font-size: 0.82rem;
    font-weight: 850;
  }

  @media (max-width: 760px) {
    align-items: stretch;
    flex-direction: column;
    padding: 12px 16px;
  }
`;

const PaginationActions = styled.div`
  display: inline-flex;
  gap: 8px;
`;

const PageButton = styled.button`
  min-height: 36px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 8px;
  background: #ffffff;
  color: #172033;
  cursor: pointer;
  font-weight: 900;
  padding: 0 14px;

  &:hover,
  &:focus-visible {
    border-color: rgba(15, 118, 110, 0.42);
    color: #0f766e;
  }

  &:focus-visible {
    outline: 2px solid #0f766e;
    outline-offset: 2px;
  }

  &:disabled {
    background: #f8fafc;
    color: #94a3b8;
    cursor: not-allowed;
  }
`;

const EmptyState = styled.div`
  min-height: 280px;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  text-align: center;
  font-size: 0.9rem;
  font-weight: 850;
`;

const AccessState = styled.section`
  width: min(520px, calc(100% - 32px));
  margin: auto;
  border: 1px solid rgba(15, 23, 42, 0.1);
  border-radius: 8px;
  background: #ffffff;
  padding: 28px;
  display: grid;
  justify-items: center;
  gap: 12px;
  text-align: center;
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.1);

  .icon {
    width: 52px;
    height: 52px;
    border-radius: 8px;
    background: #eff6ff;
    color: #2563eb;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  h1 {
    margin: 0;
    color: #111827;
    font-size: 1.18rem;
    font-weight: 950;
  }

  p {
    margin: 0;
    color: #64748b;
    line-height: 1.55;
  }
`;

const PrimaryButton = styled.button`
  min-height: 40px;
  border: 0;
  border-radius: 8px;
  background: #0f766e;
  color: #ffffff;
  padding: 0 14px;
  font-weight: 900;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const Spinner = styled(Loader2)`
  animation: spin 0.9s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;
