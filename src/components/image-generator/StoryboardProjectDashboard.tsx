"use client";

import { useMemo, useState } from "react";
import { KOREAN_DATE_TIME_FORMAT } from "@/lib/date-formatters";
import type { SavedImageStoryboard } from "@/schemas/imageStoryboard";
import {
  getStoryboardProjectStatus,
  isStoryboardFinalCurrent,
  STORYBOARD_PROJECT_STATUS_LABELS,
} from "@/lib/storyboard-workflow";
import {
  BoardKicker,
  DashboardEmpty,
  DashboardHero,
  DashboardKpi,
  DashboardKpiGrid,
  DashboardPagination,
  DashboardPrimaryButton,
  ErrorNotice,
  ProjectActionCell,
  ProjectControlBar,
  ProjectDashboard,
  ProjectFilterGroup,
  ProjectIdentity,
  ProjectMetric,
  ProjectOpenButton,
  ProjectSearchField,
  ProjectStatus,
  ProjectTable,
  ProjectTableHeader,
  ProjectTableRow,
  ProjectUpdated,
} from "./StoryboardWorkspace.styles";

const PROJECT_PAGE_SIZE = 12;

type ProjectFilter = "active" | "completed" | "attention" | "archived";

type StoryboardProjectDashboardProps = {
  isLoading: boolean;
  loadError: string | null;
  onCreate: () => void;
  onOpen: (storyboard: SavedImageStoryboard) => void;
  storyboards: SavedImageStoryboard[];
};

function needsProjectAttention(storyboard: SavedImageStoryboard): boolean {
  const status = getStoryboardProjectStatus(storyboard);
  return (
    status === "attention" ||
    status === "cleanup-retry" ||
    status === "final-stale"
  );
}

export default function StoryboardProjectDashboard({
  isLoading,
  loadError,
  onCreate,
  onOpen,
  storyboards,
}: StoryboardProjectDashboardProps) {
  const [projectSearch, setProjectSearch] = useState("");
  const [projectPage, setProjectPage] = useState(1);
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>(() => {
    if (typeof window === "undefined") return "active";
    const requestedFilter = new URLSearchParams(window.location.search).get(
      "projectStatus",
    );
    return requestedFilter === "completed" ||
      requestedFilter === "attention" ||
      requestedFilter === "archived"
      ? requestedFilter
      : "active";
  });

  const dashboardStats = useMemo(() => {
    const activeProjects = storyboards.filter(
      (storyboard) => !storyboard.archivedAt,
    );
    return {
      active: activeProjects.length,
      scenes: activeProjects.reduce(
        (sum, storyboard) => sum + storyboard.scenes.length,
        0,
      ),
      completed: activeProjects.filter(
        (storyboard) => isStoryboardFinalCurrent(storyboard),
      ).length,
      attention: activeProjects.filter(needsProjectAttention).length,
    };
  }, [storyboards]);

  const filteredStoryboards = useMemo(() => {
    const normalizedSearch = projectSearch.trim().toLocaleLowerCase("ko-KR");
    return storyboards.filter((storyboard) => {
      const matchesSearch =
        !normalizedSearch ||
        storyboard.title
          .toLocaleLowerCase("ko-KR")
          .includes(normalizedSearch) ||
        storyboard.topic.toLocaleLowerCase("ko-KR").includes(normalizedSearch);
      if (!matchesSearch) return false;
      if (projectFilter === "archived") return Boolean(storyboard.archivedAt);
      if (storyboard.archivedAt) return false;
      if (projectFilter === "completed") {
        return isStoryboardFinalCurrent(storyboard);
      }
      if (projectFilter === "attention")
        return needsProjectAttention(storyboard);
      return !isStoryboardFinalCurrent(storyboard);
    });
  }, [projectFilter, projectSearch, storyboards]);

  const projectPageCount = Math.max(
    1,
    Math.ceil(filteredStoryboards.length / PROJECT_PAGE_SIZE),
  );
  const visibleProjectPage = Math.min(projectPage, projectPageCount);
  const visibleStoryboards = useMemo(
    () =>
      filteredStoryboards.slice(
        (visibleProjectPage - 1) * PROJECT_PAGE_SIZE,
        visibleProjectPage * PROJECT_PAGE_SIZE,
      ),
    [filteredStoryboards, visibleProjectPage],
  );

  const handleProjectFilter = (filter: ProjectFilter) => {
    setProjectFilter(filter);
    setProjectPage(1);
    const url = new URL(window.location.href);
    if (filter === "active") url.searchParams.delete("projectStatus");
    else url.searchParams.set("projectStatus", filter);
    window.history.replaceState(window.history.state, "", url);
  };

  return (
    <ProjectDashboard aria-labelledby="storyboard-dashboard-title">
      <DashboardHero>
        <div>
          <BoardKicker>PRODUCTION CONTROL</BoardKicker>
          <h3 id="storyboard-dashboard-title">스토리보드 제작 현황</h3>
          <p>
            기획부터 최종 영상까지 진행 상태와 막힌 작업을 한 화면에서
            관리하세요.
          </p>
        </div>
        <DashboardPrimaryButton type="button" onClick={onCreate}>
          <i className="fas fa-plus" aria-hidden="true" />새 프로젝트
        </DashboardPrimaryButton>
      </DashboardHero>
      {loadError ? (
        <ErrorNotice role="alert">
          <span>{loadError}</span>
        </ErrorNotice>
      ) : null}

      <DashboardKpiGrid aria-label="프로젝트 핵심 지표">
        <DashboardKpi>
          <span>
            <i className="fas fa-folder-open" aria-hidden="true" /> 진행
            프로젝트
          </span>
          <strong>{dashboardStats.active}</strong>
          <small>보관 프로젝트 제외</small>
        </DashboardKpi>
        <DashboardKpi>
          <span>
            <i className="fas fa-clapperboard" aria-hidden="true" /> 전체 장면
          </span>
          <strong>{dashboardStats.scenes}</strong>
          <small>현재 제작 범위</small>
        </DashboardKpi>
        <DashboardKpi $tone="success">
          <span>
            <i className="fas fa-circle-check" aria-hidden="true" /> 완성본
          </span>
          <strong>{dashboardStats.completed}</strong>
          <small>최종 병합 완료</small>
        </DashboardKpi>
        <DashboardKpi $tone={dashboardStats.attention ? "warning" : "success"}>
          <span>
            <i className="fas fa-triangle-exclamation" aria-hidden="true" />{" "}
            확인 필요
          </span>
          <strong>{dashboardStats.attention}</strong>
          <small>
            {dashboardStats.attention
              ? "실패·재검토 항목 있음"
              : "모든 작업 정상"}
          </small>
        </DashboardKpi>
      </DashboardKpiGrid>

      <ProjectControlBar>
        <ProjectSearchField>
          <i className="fas fa-magnifying-glass" aria-hidden="true" />
          <input
            type="search"
            name="storyboardProjectSearch"
            value={projectSearch}
            onChange={(event) => {
              setProjectSearch(event.target.value);
              setProjectPage(1);
            }}
            placeholder="프로젝트 제목 또는 주제 검색"
            aria-label="프로젝트 검색"
            autoComplete="off"
          />
        </ProjectSearchField>
        <ProjectFilterGroup aria-label="프로젝트 상태 필터">
          {(
            [
              ["active", "진행 중"],
              ["completed", "완료"],
              ["attention", "확인 필요"],
              ["archived", "보관"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={projectFilter === value ? "active" : ""}
              onClick={() => handleProjectFilter(value)}
              aria-pressed={projectFilter === value}
            >
              {label}
            </button>
          ))}
        </ProjectFilterGroup>
      </ProjectControlBar>

      {isLoading ? (
        <DashboardEmpty role="status">
          <i className="fas fa-spinner fa-spin" aria-hidden="true" />
          <strong>프로젝트를 불러오는 중입니다</strong>
        </DashboardEmpty>
      ) : filteredStoryboards.length ? (
        <>
          <ProjectTable role="table" aria-label="스토리보드 프로젝트 현황">
            <ProjectTableHeader role="row">
              <span role="columnheader">프로젝트</span>
              <span role="columnheader">장면 제작</span>
              <span role="columnheader">영상 승인</span>
              <span role="columnheader">상태</span>
              <span role="columnheader">최근 수정</span>
              <span role="columnheader">작업</span>
            </ProjectTableHeader>
            {visibleStoryboards.map((storyboard) => {
              const projectGenerated = storyboard.scenes.filter(
                (scene) => scene.generatedImage,
              ).length;
              const projectApproved = storyboard.scenes.filter(
                (scene) =>
                  scene.video.status === "approved" &&
                  scene.video.clipId &&
                  scene.video.videoUrl,
              ).length;
              const projectProgress = storyboard.scenes.length
                ? Math.round(
                    (projectGenerated / storyboard.scenes.length) * 100,
                  )
                : 0;
              const needsAttention = needsProjectAttention(storyboard);
              const projectStatus = getStoryboardProjectStatus(storyboard);
              const isCompleted = projectStatus === "final-current";
              const isRunning = [
                "preparing",
                "running",
                "pausing",
                "merging",
              ].includes(storyboard.videoProduction.automationStatus);
              const statusLabel =
                STORYBOARD_PROJECT_STATUS_LABELS[projectStatus];
              return (
                <ProjectTableRow key={storyboard.id} role="row">
                  <ProjectIdentity role="cell">
                    <span>{storyboard.aspectRatio}</span>
                    <div>
                      <strong>{storyboard.title}</strong>
                      <small>
                        {storyboard.topic || "주제가 아직 입력되지 않았습니다."}
                      </small>
                    </div>
                  </ProjectIdentity>
                  <ProjectMetric role="cell">
                    <strong>
                      {projectGenerated}/{storyboard.scenes.length}
                    </strong>
                    <span>
                      <i style={{ width: `${projectProgress}%` }} />
                    </span>
                  </ProjectMetric>
                  <ProjectMetric role="cell">
                    <strong>
                      {projectApproved}/{storyboard.scenes.length}
                    </strong>
                    <small>완료 장면</small>
                  </ProjectMetric>
                  <ProjectStatus
                    role="cell"
                    $tone={
                      needsAttention
                        ? "warning"
                        : isCompleted
                          ? "success"
                          : isRunning
                            ? "info"
                            : "neutral"
                    }
                  >
                    {statusLabel}
                  </ProjectStatus>
                  <ProjectUpdated role="cell">
                    {storyboard.updatedAt
                      ? KOREAN_DATE_TIME_FORMAT.format(storyboard.updatedAt)
                      : "기록 없음"}
                  </ProjectUpdated>
                  <ProjectActionCell role="cell">
                    <ProjectOpenButton
                      type="button"
                      onClick={() => onOpen(storyboard)}
                    >
                      {isCompleted
                        ? "결과 보기"
                        : needsAttention
                          ? "문제 해결"
                          : "이어서 제작"}
                      <i className="fas fa-arrow-right" aria-hidden="true" />
                    </ProjectOpenButton>
                  </ProjectActionCell>
                </ProjectTableRow>
              );
            })}
          </ProjectTable>
          {projectPageCount > 1 ? (
            <DashboardPagination aria-label="프로젝트 목록 페이지">
              <button
                type="button"
                onClick={() =>
                  setProjectPage(Math.max(1, visibleProjectPage - 1))
                }
                disabled={visibleProjectPage === 1}
                aria-label="이전 프로젝트 페이지"
              >
                <i className="fas fa-chevron-left" aria-hidden="true" />
              </button>
              <span>
                {visibleProjectPage} / {projectPageCount}
              </span>
              <button
                type="button"
                onClick={() =>
                  setProjectPage(
                    Math.min(projectPageCount, visibleProjectPage + 1),
                  )
                }
                disabled={visibleProjectPage === projectPageCount}
                aria-label="다음 프로젝트 페이지"
              >
                <i className="fas fa-chevron-right" aria-hidden="true" />
              </button>
            </DashboardPagination>
          ) : null}
        </>
      ) : (
        <DashboardEmpty>
          <i className="fas fa-folder-open" aria-hidden="true" />
          <strong>
            {storyboards.length
              ? "조건에 맞는 프로젝트가 없습니다"
              : "첫 프로젝트를 만들어 보세요"}
          </strong>
          <p>
            {storyboards.length
              ? "검색어나 상태 필터를 바꾸면 다른 프로젝트를 확인할 수 있습니다."
              : "주제 한 줄과 참조 사진만으로 장면 설계를 시작할 수 있습니다."}
          </p>
          {!storyboards.length ? (
            <button type="button" onClick={onCreate}>
              새 프로젝트 만들기
            </button>
          ) : null}
        </DashboardEmpty>
      )}
    </ProjectDashboard>
  );
}
