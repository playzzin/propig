"use client";

import styled from "styled-components";
import { BufferedTextInput } from "@/components/image-generator/BufferedTextField";
import type { ImageStoryboardScene } from "@/schemas/imageStoryboard";

const Overlay = styled.div<{ $pageView: boolean }>`
  position: ${({ $pageView }) => ($pageView ? "relative" : "fixed")};
  inset: ${({ $pageView }) => ($pageView ? "auto" : "0")};
  z-index: ${({ $pageView }) => ($pageView ? "0" : "10000")};
  flex: ${({ $pageView }) => ($pageView ? "1" : "initial")};
  min-height: 0;
  display: flex;
  padding: ${({ $pageView }) => ($pageView ? "0" : "24px")};
  overflow: hidden;
  background: ${({ $pageView }) =>
    $pageView ? "var(--bg-base)" : "rgba(3, 7, 18, 0.76)"};
  backdrop-filter: ${({ $pageView }) => ($pageView ? "none" : "blur(10px)")};

  @media (max-width: 640px) {
    padding: 0;
  }
`;

const Workspace = styled.div<{ $pageView: boolean }>`
  width: ${({ $pageView }) => ($pageView ? "100%" : "min(1460px, 100%)")};
  height: ${({ $pageView }) => ($pageView ? "100%" : "min(920px, 100%)")};
  margin: ${({ $pageView }) => ($pageView ? "0 auto" : "auto")};
  display: flex;
  flex-direction: column;
  overflow: hidden;
  overscroll-behavior: contain;
  border: ${({ $pageView }) =>
    $pageView
      ? "0"
      : "1px solid color-mix(in srgb, var(--border-subtle) 85%, #22c55e 15%)"};
  border-radius: ${({ $pageView }) => ($pageView ? "0" : "18px")};
  background: var(--bg-base);
  box-shadow: ${({ $pageView }) =>
    $pageView ? "none" : "0 30px 90px rgba(0, 0, 0, 0.5)"};

  @media (max-width: 640px) {
    height: 100%;
    padding-bottom: env(safe-area-inset-bottom);
    border: 0;
    border-radius: 0;
  }
`;

const WorkspaceHeader = styled.header`
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-subtle);
  background: color-mix(in srgb, var(--bg-elevated, #161b22) 92%, #0f766e 8%);

  @media (max-width: 560px) {
    min-height: 56px;
    gap: 8px;
    padding: 8px 12px;

    &[data-page-view='true'][data-signed-out='true'] {
      display: none;
    }
  }
`;

const TitleGroup = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;

  h2 {
    margin: 1px 0 0;
    overflow: hidden;
    color: var(--text-main);
    font-size: 1.08rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 560px) {
    &[data-page-view='true'] { display: none; }
  }
`;

const HeaderIcon = styled.i`
  width: 38px;
  height: 38px;
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 11px;
  color: #6ee7b7;
  background: rgba(16, 185, 129, 0.14);

  @media (max-width: 560px) {
    display: none;
  }
`;

const Eyebrow = styled.div`
  color: var(--text-muted);
  font-size: 0.63rem;
  font-weight: 800;
  letter-spacing: 0.12em;

  @media (max-width: 560px) {
    display: none;
  }
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
  @media (max-width: 560px) {
    gap: 4px;
  }
`;

const HeaderToolGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 3px;

  @media (max-width: 560px) {
    gap: 1px;

    button {
      width: 34px;
      height: 34px;
    }
  }
`;

const HeaderToolButton = styled.button`
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 8px;
  color: var(--text-muted);
  background: transparent;
  cursor: pointer;

  &:hover:not(:disabled) {
    color: var(--text-main);
    background: rgba(255, 255, 255, 0.07);
  }
  &:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
  &:disabled {
    cursor: not-allowed;
    opacity: 0.32;
  }
`;

const SaveState = styled.span`
  color: var(--text-muted);
  font-size: 0.76rem;
  white-space: nowrap;

  @media (max-width: 560px) {
    max-width: 74px;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 0.66rem;
  }
  @media (max-width: 420px) {
    display: none;
  }
`;

const CloseButton = styled.button`
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border-subtle);
  border-radius: 9px;
  color: var(--text-muted);
  background: transparent;
  cursor: pointer;

  &:hover {
    color: var(--text-main);
    background: rgba(255, 255, 255, 0.08);
  }
  &:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
`;

const WorkspaceBody = styled.div<{
  $compactVideoMode: boolean;
  $dashboardMode: boolean;
}>`
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: ${({ $compactVideoMode, $dashboardMode }) =>
    $dashboardMode
      ? "minmax(0, 1fr)"
      : $compactVideoMode
        ? "218px minmax(0, 1fr)"
        : "218px minmax(500px, 1fr) minmax(260px, 294px)"};

  @media (max-width: 1360px) {
    grid-template-columns: ${({ $compactVideoMode, $dashboardMode }) =>
      $dashboardMode
        ? "minmax(0, 1fr)"
        : $compactVideoMode
          ? "180px minmax(0, 1fr)"
          : "180px minmax(0, 1fr) minmax(230px, 260px)"};
    grid-template-rows: minmax(0, 1fr);
  }

  @media (max-width: 1100px) {
    grid-template-columns: ${({ $dashboardMode }) =>
      $dashboardMode ? "minmax(0, 1fr)" : "180px minmax(0, 1fr)"};
    grid-template-rows: ${({ $compactVideoMode, $dashboardMode }) =>
      $dashboardMode || $compactVideoMode
        ? "minmax(0, 1fr)"
        : "minmax(0, 1fr) minmax(180px, 220px)"};
  }

  @media (max-width: 840px) {
    display: block;
    overflow-y: auto;
  }
`;

const ProjectSidebar = styled.aside`
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-subtle);
  background: var(--bg-overlay, rgba(255, 255, 255, 0.02));

  @media (max-width: 840px) {
    min-height: 114px;
    border-right: 0;
    border-bottom: 1px solid var(--border-subtle);
  }

  @media (max-width: 560px) {
    min-height: 64px;
    flex-direction: row;
    align-items: center;
    overflow: hidden;
  }
`;

const SidebarTop = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 14px 12px;

  @media (max-width: 560px) {
    flex: 0 0 auto;
    gap: 8px;
    padding: 0 9px 0 12px;
  }
`;

const SidebarDashboardButton = styled.button<{ $active: boolean }>`
  width: calc(100% - 16px);
  min-height: 54px;
  margin: 0 8px 8px;
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border: 1px solid
    ${({ $active }) =>
      $active ? "rgba(16, 185, 129, 0.46)" : "var(--border-subtle)"};
  border-radius: 10px;
  color: ${({ $active }) => ($active ? "#d1fae5" : "var(--text-main)")};
  background: ${({ $active }) =>
    $active ? "rgba(16, 185, 129, 0.12)" : "rgba(255,255,255,0.025)"};
  text-align: left;
  cursor: pointer;

  > i {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    color: ${({ $active }) => ($active ? "#6ee7b7" : "var(--text-muted)")};
    background: ${({ $active }) =>
      $active ? "rgba(16,185,129,0.16)" : "rgba(148,163,184,0.08)"};
  }
  strong,
  small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  strong {
    font-size: 0.7rem;
  }
  small {
    margin-top: 3px;
    color: var(--text-muted);
    font-size: 0.58rem;
  }
  &:hover {
    border-color: rgba(16, 185, 129, 0.38);
    background: rgba(16, 185, 129, 0.08);
  }
  &:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  @media (max-width: 840px) {
    width: 176px;
    min-width: 176px;
    margin-right: 0;
  }

  @media (max-width: 560px) {
    width: 44px;
    min-width: 44px;
    min-height: 44px;
    margin: 0 7px 0 0;
    padding: 0;
    grid-template-columns: 1fr;
    > span {
      display: none;
    }
    > i {
      width: 34px;
      height: 34px;
    }
  }
`;

const SidebarLabel = styled.div`
  color: var(--text-main);
  font-size: 0.76rem;
  font-weight: 800;
`;

const SidebarMeta = styled.div`
  margin-top: 3px;
  color: var(--text-muted);
  font-size: 0.7rem;

  @media (max-width: 560px) {
    display: none;
  }
`;

const AddProjectButton = styled.button`
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(16, 185, 129, 0.35);
  border-radius: 8px;
  color: #d1fae5;
  background: rgba(16, 185, 129, 0.15);
  cursor: pointer;

  &:hover {
    background: rgba(16, 185, 129, 0.25);
  }
  &:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
`;

const ProjectList = styled.div`
  overflow: auto;
  padding: 0 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;

  @media (max-width: 840px) {
    flex-direction: row;
    overflow-x: auto;
  }

  @media (max-width: 560px) {
    flex: 1 1 auto;
    min-width: 0;
    padding: 7px 9px 7px 0;
    scroll-snap-type: x proximity;
  }
`;

const ProjectRow = styled.div`
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 30px;
  align-items: stretch;
  gap: 2px;

  @media (max-width: 840px) {
    width: 180px;
    flex: 0 0 180px;
    grid-template-columns: minmax(0, 1fr);
  }
`;

const ProjectItem = styled.button<{ $active: boolean }>`
  width: 100%;
  min-width: 0;
  padding: 11px 10px;
  border: 1px solid
    ${({ $active }) => ($active ? "rgba(16, 185, 129, 0.5)" : "transparent")};
  border-radius: 9px;
  color: var(--text-main);
  background: ${({ $active }) =>
    $active ? "rgba(16, 185, 129, 0.12)" : "transparent"};
  cursor: pointer;
  text-align: left;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
  }
  &:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  .project-title,
  .project-meta {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .project-title {
    font-size: 0.78rem;
    font-weight: 700;
  }
  .project-meta {
    margin-top: 4px;
    color: var(--text-muted);
    font-size: 0.68rem;
  }

  @media (max-width: 840px) {
    width: 100%;
    flex: 1 1 auto;
  }
  @media (max-width: 560px) {
    width: 100%;
    flex-basis: auto;
    padding: 7px 8px;
    scroll-snap-align: start;
    .project-title {
      font-size: 0.7rem;
    }
    .project-meta {
      margin-top: 2px;
      font-size: 0.6rem;
    }
  }
`;

const ProjectRowMenu = styled.details`
  position: relative;
  align-self: center;

  > summary {
    display: grid;
    place-items: center;
    width: 30px;
    height: 34px;
    border-radius: 8px;
    color: var(--text-muted);
    cursor: pointer;
    list-style: none;
  }
  > summary::-webkit-details-marker {
    display: none;
  }
  > summary:hover {
    color: var(--text-main);
    background: rgba(255, 255, 255, 0.08);
  }
  > summary:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  > div {
    position: absolute;
    z-index: 30;
    top: calc(100% + 4px);
    right: 0;
    display: grid;
    width: 166px;
    padding: 5px;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    background: var(--background-paper);
    box-shadow: 0 14px 32px rgba(0, 0, 0, 0.28);
  }
  button {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    padding: 0 9px;
    border: 0;
    border-radius: 7px;
    color: var(--text-secondary);
    background: transparent;
    font: inherit;
    font-size: 0.65rem;
    text-align: left;
    cursor: pointer;
  }
  button:hover {
    color: var(--text-main);
    background: var(--background-hover);
  }
  button.danger {
    color: var(--danger-color);
  }
  button:disabled {
    opacity: 0.5;
    cursor: wait;
  }

  @media (max-width: 840px) {
    display: none;
  }
`;

const ProjectStatusBadge = styled.span`
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 18px;
  margin-top: 6px;
  padding: 0 6px;
  border-radius: 999px;
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.07);
  font-size: 0.57rem;
  font-weight: 800;
  line-height: 1;
`;

const SidebarMessage = styled.p`
  margin: 14px;
  color: var(--text-muted);
  font-size: 0.74rem;
  line-height: 1.55;
`;

const BoardContent = styled.main`
  min-width: 0;
  overflow-y: auto;
  padding: 26px clamp(16px, 3vw, 38px) 48px;

  @media (max-width: 840px) {
    overflow: visible;
  }
  @media (max-width: 560px) {
    padding: 16px 12px 34px;
  }
`;

const WorkspaceAnchor = styled.div`
  scroll-margin-top: 18px;
`;

const ProjectDashboard = styled.main`
  grid-column: 1 / -1;
  min-width: 0;
  overflow-y: auto;
  padding: 32px clamp(20px, 3vw, 42px) 56px;
  container-name: storyboard-dashboard;
  container-type: inline-size;

  @media (max-width: 840px) {
    grid-column: 1;
    padding: 22px 14px 42px;
  }
`;

const DashboardHero = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 22px;
  margin-bottom: 22px;

  h3 {
    margin: 0;
    color: var(--text-main);
    font-size: clamp(1.45rem, 2.4vw, 2rem);
    line-height: 1.16;
    text-wrap: balance;
  }
  p {
    max-width: 620px;
    margin: 8px 0 0;
    color: var(--text-muted);
    font-size: 0.78rem;
    line-height: 1.6;
  }

  @media (max-width: 620px) {
    align-items: stretch;
    flex-direction: column;
  }
`;

const DashboardPrimaryButton = styled.button`
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 16px;
  border: 1px solid rgba(16, 185, 129, 0.56);
  border-radius: 10px;
  color: #052e24;
  background: #6ee7b7;
  font: inherit;
  font-size: 0.72rem;
  font-weight: 850;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    background: #a7f3d0;
  }
  &:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
`;

const DashboardKpiGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 18px;

  @media (max-width: 980px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  @media (max-width: 480px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  @container storyboard-dashboard (max-width: 980px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const DashboardKpi = styled.article<{ $tone?: "success" | "warning" }>`
  min-width: 0;
  padding: 15px 16px;
  border: 1px solid
    ${({ $tone }) =>
      $tone === "warning"
        ? "rgba(251,191,36,0.3)"
        : $tone === "success"
          ? "rgba(16,185,129,0.3)"
          : "var(--border-subtle)"};
  border-radius: 12px;
  background: ${({ $tone }) =>
    $tone === "warning"
      ? "rgba(245,158,11,0.065)"
      : $tone === "success"
        ? "rgba(16,185,129,0.065)"
        : "var(--bg-elevated)"};

  span,
  strong,
  small {
    display: block;
  }
  span {
    color: var(--text-muted);
    font-size: 0.64rem;
    font-weight: 750;
  }
  span i {
    width: 16px;
    color: ${({ $tone }) =>
      $tone === "warning"
        ? "#fbbf24"
        : $tone === "success"
          ? "#6ee7b7"
          : "var(--text-dim)"};
  }
  strong {
    margin-top: 10px;
    color: var(--text-main);
    font-size: 1.5rem;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  small {
    margin-top: 6px;
    color: var(--text-muted);
    font-size: 0.6rem;
  }

  @container storyboard-dashboard (max-width: 460px) {
    padding: 12px;

    strong {
      margin-top: 8px;
      font-size: 1.3rem;
    }
  }
`;

const ProjectControlBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;

  @media (max-width: 760px) {
    align-items: stretch;
    flex-direction: column;
  }

  @container storyboard-dashboard (max-width: 760px) {
    align-items: stretch;
    flex-direction: column;
  }
`;

const ProjectSearchField = styled.label`
  width: min(360px, 100%);
  min-height: 40px;
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  align-items: center;
  padding: 0 8px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: var(--bg-elevated);

  > i {
    color: var(--text-dim);
    text-align: center;
  }
  input {
    min-width: 0;
    height: 38px;
    border: 0;
    outline: 0;
    color: var(--text-main);
    background: transparent;
    font: inherit;
    font-size: 0.7rem;
  }
  input::placeholder {
    color: var(--text-dim);
  }
  &:focus-within {
    border-color: var(--primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 18%, transparent);
  }

  @container storyboard-dashboard (max-width: 760px) {
    width: 100%;
  }
`;

const ProjectFilterGroup = styled.div`
  display: flex;
  gap: 4px;
  padding: 3px;
  overflow-x: auto;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.02);

  button {
    min-height: 32px;
    padding: 0 10px;
    border: 0;
    border-radius: 7px;
    color: var(--text-muted);
    background: transparent;
    font: inherit;
    font-size: 0.64rem;
    font-weight: 750;
    cursor: pointer;
    white-space: nowrap;
  }
  button.active {
    color: #d1fae5;
    background: rgba(16, 185, 129, 0.14);
  }
  button:hover {
    color: var(--text-main);
    background: rgba(255, 255, 255, 0.05);
  }
  button:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
`;

const ProjectTable = styled.div`
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: 13px;
  background: var(--bg-elevated);
`;

const DashboardPagination = styled.nav`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  margin-top: 12px;

  span {
    color: var(--text-muted);
    font-size: 0.62rem;
    font-variant-numeric: tabular-nums;
  }
  button {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    color: var(--text-main);
    background: var(--bg-elevated);
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    border-color: rgba(16, 185, 129, 0.4);
    background: rgba(16, 185, 129, 0.08);
  }
  button:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const ProjectTableHeader = styled.div`
  display: grid;
  grid-template-columns:
    minmax(230px, 1.5fr) minmax(104px, 0.65fr) minmax(92px, 0.55fr)
    92px 122px 108px;
  gap: 14px;
  align-items: center;
  min-height: 38px;
  padding: 0 14px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-dim);
  background: rgba(255, 255, 255, 0.024);
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.04em;

  @media (max-width: 1080px) {
    display: none;
  }

  @container storyboard-dashboard (max-width: 1080px) {
    display: none;
  }
`;

const ProjectTableRow = styled.article`
  display: grid;
  grid-template-columns:
    minmax(230px, 1.5fr) minmax(104px, 0.65fr) minmax(92px, 0.55fr)
    92px 122px 108px;
  gap: 14px;
  align-items: center;
  min-height: 74px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-subtle);

  &:last-child {
    border-bottom: 0;
  }
  &:hover {
    background: rgba(255, 255, 255, 0.025);
  }

  @media (max-width: 1080px) {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px 14px;
    padding: 14px;
  }

  @container storyboard-dashboard (max-width: 1080px) {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px 14px;
    padding: 14px;
  }

  @container storyboard-dashboard (max-width: 420px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const ProjectIdentity = styled.div`
  min-width: 0;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  align-items: center;
  gap: 10px;

  > span {
    width: 42px;
    height: 32px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(16, 185, 129, 0.24);
    border-radius: 7px;
    color: #a7f3d0;
    background: rgba(16, 185, 129, 0.08);
    font-size: 0.58rem;
    font-weight: 800;
  }
  strong,
  small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  strong {
    color: var(--text-main);
    font-size: 0.72rem;
  }
  small {
    margin-top: 4px;
    color: var(--text-muted);
    font-size: 0.6rem;
  }
`;

const ProjectMetric = styled.div`
  min-width: 0;
  strong,
  small {
    display: block;
  }
  strong {
    color: var(--text-main);
    font-size: 0.68rem;
    font-variant-numeric: tabular-nums;
  }
  small {
    margin-top: 4px;
    color: var(--text-muted);
    font-size: 0.58rem;
  }
  > span {
    width: 100%;
    height: 3px;
    display: block;
    margin-top: 7px;
    overflow: hidden;
    border-radius: 99px;
    background: rgba(148, 163, 184, 0.18);
  }
  > span i {
    height: 100%;
    display: block;
    border-radius: inherit;
    background: #34d399;
  }

  @media (max-width: 1080px) {
    display: none;
  }

  @container storyboard-dashboard (max-width: 1080px) {
    display: none;
  }
`;

const ProjectStatus = styled.span<{
  $tone: "warning" | "success" | "info" | "neutral";
}>`
  width: fit-content;
  min-height: 25px;
  display: inline-flex;
  align-items: center;
  padding: 0 8px;
  border: 1px solid
    ${({ $tone }) =>
      $tone === "warning"
        ? "rgba(251,191,36,0.3)"
        : $tone === "success"
          ? "rgba(16,185,129,0.34)"
          : $tone === "info"
            ? "rgba(56,189,248,0.3)"
            : "var(--border-subtle)"};
  border-radius: 999px;
  color: ${({ $tone }) =>
    $tone === "warning"
      ? "#fde68a"
      : $tone === "success"
        ? "#a7f3d0"
        : $tone === "info"
          ? "#bae6fd"
          : "var(--text-muted)"};
  background: ${({ $tone }) =>
    $tone === "warning"
      ? "rgba(245,158,11,0.09)"
      : $tone === "success"
        ? "rgba(16,185,129,0.09)"
        : $tone === "info"
          ? "rgba(14,165,233,0.09)"
          : "rgba(148,163,184,0.06)"};
  font-size: 0.58rem;
  font-weight: 800;

  @media (max-width: 1080px) {
    grid-column: 1;
  }

  @container storyboard-dashboard (max-width: 1080px) {
    grid-column: 1;
  }
`;

const ProjectUpdated = styled.span`
  color: var(--text-muted);
  font-size: 0.58rem;
  line-height: 1.45;
  @media (max-width: 1080px) {
    display: none;
  }

  @container storyboard-dashboard (max-width: 1080px) {
    display: none;
  }
`;

const ProjectActionCell = styled.div`
  @media (max-width: 1080px) {
    grid-column: 2;
    grid-row: 1 / span 2;
  }

  @container storyboard-dashboard (max-width: 1080px) {
    grid-column: 2;
    grid-row: 1 / span 2;
  }

  @container storyboard-dashboard (max-width: 420px) {
    grid-column: 1;
    grid-row: auto;
  }
`;

const ProjectOpenButton = styled.button`
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 10px;
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 8px;
  color: #d1fae5;
  background: rgba(16, 185, 129, 0.09);
  font: inherit;
  font-size: 0.6rem;
  font-weight: 800;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    background: rgba(16, 185, 129, 0.17);
  }
  &:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  @container storyboard-dashboard (max-width: 420px) {
    width: 100%;
  }
`;

const DashboardEmpty = styled.div`
  min-height: 260px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  padding: 28px;
  border: 1px dashed var(--border-subtle);
  border-radius: 13px;
  color: var(--text-muted);
  text-align: center;

  > i {
    color: #6ee7b7;
    font-size: 1.5rem;
  }
  strong {
    color: var(--text-main);
    font-size: 0.82rem;
  }
  p {
    max-width: 460px;
    margin: 0;
    font-size: 0.68rem;
    line-height: 1.55;
  }
  button {
    min-height: 36px;
    margin-top: 6px;
    padding: 0 13px;
    border: 1px solid rgba(16, 185, 129, 0.42);
    border-radius: 8px;
    color: #d1fae5;
    background: rgba(16, 185, 129, 0.12);
    font: inherit;
    font-size: 0.66rem;
    font-weight: 800;
    cursor: pointer;
  }
`;

const ProductionAssistantRail = styled.aside`
  min-width: 0;
  overflow-y: auto;
  padding: 22px 14px 34px;
  border-left: 1px solid var(--border-subtle);
  background: color-mix(in srgb, var(--bg-overlay, #10131a) 95%, #10b981 5%);

  @media (max-width: 1360px) {
    grid-column: auto;
    max-height: none;
    padding: 18px 14px 26px;
    border-top: 0;
    border-left: 1px solid var(--border-subtle);
  }

  @media (max-width: 1100px) {
    grid-column: 1 / -1;
    max-height: 220px;
    padding: 14px 16px 20px;
    border-top: 1px solid var(--border-subtle);
    border-left: 0;
  }

  @media (max-width: 840px) {
    grid-column: 1;
    display: block;
    max-height: none;
    overflow: visible;
    padding: 18px 14px 34px;
  }
`;

const AssistantRailHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  span {
    display: block;
    color: #6ee7b7;
    font-size: 0.56rem;
    font-weight: 850;
    letter-spacing: 0.11em;
  }
  h3 {
    margin: 3px 0 0;
    color: var(--text-main);
    font-size: 0.86rem;
  }
`;

const QualityScore = styled.strong<{ $score: number }>`
  flex: 0 0 auto;
  min-width: 52px;
  color: ${({ $score }) =>
    $score >= 80 ? "#6ee7b7" : $score >= 50 ? "#fde68a" : "#fca5a5"};
  font-size: 1.35rem;
  line-height: 1;
  text-align: right;
  font-variant-numeric: tabular-nums;

  small {
    color: var(--text-muted);
    font-size: 0.55rem;
    font-weight: 700;
  }
`;

const QualityProgress = styled.div`
  width: 100%;
  height: 5px;
  margin-top: 12px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.17);

  span {
    height: 100%;
    display: block;
    border-radius: inherit;
    background: linear-gradient(90deg, #0ea5e9, #34d399);
    transition: width 260ms ease;
  }
  @media (prefers-reduced-motion: reduce) {
    span {
      transition: none;
    }
  }
`;

const AssistantSummary = styled.p`
  margin: 9px 0 13px;
  color: var(--text-muted);
  font-size: 0.62rem;
  line-height: 1.52;
`;

const QualityChecklist = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
`;

const QualityCheckItem = styled.div<{ $ready: boolean }>`
  min-width: 0;
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) auto;
  align-items: start;
  gap: 7px;
  padding: 8px;
  border: 1px solid
    ${({ $ready }) =>
      $ready ? "rgba(16,185,129,0.2)" : "rgba(251,191,36,0.22)"};
  border-radius: 8px;
  background: ${({ $ready }) =>
    $ready ? "rgba(16,185,129,0.04)" : "rgba(245,158,11,0.045)"};

  > i {
    margin-top: 2px;
    color: ${({ $ready }) => ($ready ? "#6ee7b7" : "#fbbf24")};
    font-size: 0.68rem;
  }
  strong,
  span {
    display: block;
  }
  strong {
    color: var(--text-main);
    font-size: 0.63rem;
  }
  span {
    margin-top: 3px;
    color: var(--text-muted);
    font-size: 0.56rem;
    line-height: 1.4;
  }
  button {
    min-height: 25px;
    padding: 0 7px;
    border: 1px solid rgba(251, 191, 36, 0.26);
    border-radius: 6px;
    color: #fde68a;
    background: rgba(245, 158, 11, 0.08);
    font: inherit;
    font-size: 0.54rem;
    font-weight: 800;
    cursor: pointer;
    white-space: nowrap;
  }
  button:hover {
    background: rgba(245, 158, 11, 0.15);
  }
  button:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
`;

const AssistantDivider = styled.hr`
  height: 1px;
  margin: 15px 0;
  border: 0;
  background: var(--border-subtle);
`;

const ActiveSceneAssistant = styled.section`
  min-width: 0;
`;

const AssistantSectionTitle = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 9px;

  span {
    color: var(--text-main);
    font-size: 0.68rem;
    font-weight: 850;
  }
  small {
    color: var(--text-muted);
    font-size: 0.56rem;
  }
`;

const ActiveScenePreview = styled.div`
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: 9px;
  background: #05070b;

  img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
  }
  span {
    position: absolute;
    right: 7px;
    bottom: 7px;
    min-height: 22px;
    display: inline-flex;
    align-items: center;
    padding: 0 7px;
    border: 1px solid rgba(251, 191, 36, 0.35);
    border-radius: 999px;
    color: #fde68a;
    background: rgba(120, 53, 15, 0.86);
    font-size: 0.52rem;
    font-weight: 800;
  }
`;

const ActiveScenePlaceholder = styled.div`
  min-height: 92px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 6px;
  padding: 14px;
  border: 1px dashed var(--border-subtle);
  border-radius: 9px;
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.018);
  font-size: 0.58rem;
  text-align: center;

  i {
    color: var(--text-dim);
    font-size: 1.05rem;
  }
`;

const ActiveSceneCopy = styled.div`
  margin-top: 9px;
  strong,
  span {
    display: block;
  }
  strong {
    color: var(--text-main);
    font-size: 0.68rem;
  }
  span {
    margin-top: 4px;
    display: -webkit-box;
    overflow: hidden;
    color: var(--text-muted);
    font-size: 0.58rem;
    line-height: 1.45;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
`;

const AssistantActionGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;
  margin-top: 10px;

  button {
    min-height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 0 6px;
    border: 1px solid var(--border-subtle);
    border-radius: 7px;
    color: var(--text-muted);
    background: rgba(255, 255, 255, 0.025);
    font: inherit;
    font-size: 0.57rem;
    font-weight: 750;
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    color: var(--text-main);
    border-color: rgba(16, 185, 129, 0.34);
    background: rgba(16, 185, 129, 0.07);
  }
  button:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ReviewAcceptButton = styled.button`
  width: 100%;
  min-height: 32px;
  margin-top: 6px;
  border: 1px solid rgba(16, 185, 129, 0.35);
  border-radius: 7px;
  color: #a7f3d0;
  background: rgba(16, 185, 129, 0.09);
  font: inherit;
  font-size: 0.58rem;
  font-weight: 800;
  cursor: pointer;
  &:hover {
    background: rgba(16, 185, 129, 0.16);
  }
  &:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
`;

const ProductionShortcuts = styled.section`
  min-width: 0;
`;

const ProductionShortcutButton = styled.button`
  width: 100%;
  min-height: 50px;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 12px;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  padding: 8px 9px;
  border: 1px solid var(--border-subtle);
  border-radius: 9px;
  color: var(--text-main);
  background: rgba(255, 255, 255, 0.025);
  text-align: left;
  cursor: pointer;

  > i:first-child {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: 7px;
    color: #6ee7b7;
    background: rgba(16, 185, 129, 0.1);
  }
  > i:last-child {
    color: var(--text-dim);
    font-size: 0.62rem;
  }
  strong,
  small {
    display: block;
  }
  strong {
    color: var(--text-main);
    font-size: 0.62rem;
  }
  small {
    margin-top: 3px;
    color: var(--text-muted);
    font-size: 0.53rem;
  }
  &:hover {
    border-color: rgba(16, 185, 129, 0.35);
    background: rgba(16, 185, 129, 0.06);
  }
  &:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
`;

const BoardHeader = styled.div`
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 20px;
`;

const ProjectActionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 7px;

  button,
  label {
    min-height: 28px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: 7px;
    color: var(--text-muted);
    background: transparent;
    font-size: 0.66rem;
    font-weight: 700;
    cursor: pointer;
  }
  button:hover,
  label:hover {
    color: var(--text-main);
    border-color: var(--border-subtle);
    background: rgba(255, 255, 255, 0.04);
  }
  button:focus-visible,
  label:focus-within {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
  button.danger:hover {
    color: #fecaca;
    border-color: rgba(248, 113, 113, 0.3);
  }
  input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
`;

const VersionPanel = styled.section`
  margin-bottom: 16px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--primary) 28%, var(--border-subtle));
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg-elevated) 94%, var(--primary) 6%);
`;

const VersionPanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;

  strong,
  span {
    display: block;
  }
  strong {
    color: var(--text-main);
    font-size: 0.78rem;
  }
  span {
    margin-top: 2px;
    color: var(--text-muted);
    font-size: 0.66rem;
  }
  button {
    min-height: 32px;
    padding: 0 10px;
    border: 1px solid rgba(16, 185, 129, 0.34);
    border-radius: 8px;
    color: #d1fae5;
    background: rgba(16, 185, 129, 0.12);
    font-size: 0.68rem;
    font-weight: 750;
    cursor: pointer;
  }
  button i {
    margin-right: 5px;
  }
`;

const VersionList = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 6px;

  button {
    padding: 9px 10px;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    color: var(--text-main);
    background: rgba(255, 255, 255, 0.025);
    text-align: left;
    cursor: pointer;
  }
  button:hover {
    border-color: rgba(16, 185, 129, 0.4);
    background: rgba(16, 185, 129, 0.06);
  }
  button:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
  strong,
  span {
    display: block;
  }
  strong {
    font-size: 0.7rem;
  }
  span {
    margin-top: 3px;
    color: var(--text-muted);
    font-size: 0.62rem;
  }
`;

const VersionEmpty = styled.p`
  margin: 0;
  color: var(--text-muted);
  font-size: 0.7rem;
`;

const WorkspaceModeSwitch = styled.div`
  display: inline-grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  align-self: start;
  width: min(100%, 360px);
  padding: 4px;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  background: var(--bg-overlay, rgba(255, 255, 255, 0.025));

  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 38px;
    padding: 0 14px;
    border: 0;
    border-radius: 9px;
    color: var(--text-muted);
    background: transparent;
    font: inherit;
    font-size: 0.72rem;
    font-weight: 800;
    cursor: pointer;
  }
  button.active {
    color: var(--text-main);
    background: var(--bg-elevated);
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.06);
  }
  button:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  button span {
    display: grid;
    place-items: center;
    min-width: 19px;
    height: 19px;
    padding: 0 5px;
    border-radius: 999px;
    color: white;
    background: var(--primary);
    font-size: 0.58rem;
  }

  @media (max-width: 640px) {
    width: 100%;
  }
`;

const BoardKicker = styled.div`
  margin-bottom: 6px;
  color: #6ee7b7;
  font-size: 0.64rem;
  font-weight: 800;
  letter-spacing: 0.12em;
`;

const TitleInput = styled(BufferedTextInput)`
  width: min(650px, 100%);
  padding: 0;
  border: 0;
  border-bottom: 1px solid transparent;
  color: var(--text-main);
  background: transparent;
  font-size: clamp(1.35rem, 2.4vw, 1.8rem);
  font-weight: 800;

  &:hover {
    border-bottom-color: var(--border-subtle);
  }
  &:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 3px;
    border-bottom-color: var(--primary);
  }
`;

const ProgressSummary = styled.div`
  flex: 0 0 auto;
  min-width: 136px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 8px;
  padding: 9px 11px;
  border: 1px solid rgba(16, 185, 129, 0.28);
  border-radius: 9px;
  color: var(--text-muted);
  background: rgba(16, 185, 129, 0.055);
  font-size: 0.72rem;
  white-space: nowrap;

  span {
    color: var(--text-muted);
    font-size: 0.62rem;
    font-weight: 700;
  }
  strong {
    color: #6ee7b7;
    font-size: 0.86rem;
    line-height: 1;
  }
  small {
    grid-column: span 2;
    color: var(--text-muted);
    font-size: 0.62rem;
  }

  @media (max-width: 560px) {
    display: none;
  }
`;

const ProgressTrack = styled.span`
  grid-column: span 2;
  display: block;
  height: 3px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.2);
`;

const ProgressFill = styled.span<{ $progress: number }>`
  display: block;
  width: ${({ $progress }) => `${$progress}%`};
  height: 100%;
  border-radius: inherit;
  background: #34d399;
  transition: width 280ms ease;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const ProductionFlow = styled.ol`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 0 0 16px;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  list-style: none;
  background: rgba(255, 255, 255, 0.018);

  @media (max-width: 700px) {
    grid-template-columns: 1fr;
  }
`;

const WorkflowStep = styled.li<{ $complete: boolean; $active: boolean }>`
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-right: 1px solid var(--border-subtle);
  color: ${({ $complete }) => ($complete ? "#d1fae5" : "var(--text-main)")};
  background: ${({ $complete, $active }) =>
    $complete
      ? "rgba(16, 185, 129, 0.08)"
      : $active
        ? "rgba(14, 116, 144, 0.09)"
        : "transparent"};

  &:last-child {
    border-right: 0;
  }
  strong,
  span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  strong {
    font-size: 0.72rem;
  }
  span {
    margin-top: 3px;
    color: var(--text-muted);
    font-size: 0.64rem;
  }
  > i {
    color: ${({ $complete, $active }) =>
      $complete ? "#6ee7b7" : $active ? "#67e8f9" : "var(--text-dim)"};
    font-size: 0.8rem;
  }

  @media (max-width: 700px) {
    border-right: 0;
    border-bottom: 1px solid var(--border-subtle);
    &:last-child {
      border-bottom: 0;
    }
  }
`;

const WorkflowNumber = styled.span`
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 7px;
  color: var(--text-muted);
  background: rgba(15, 23, 42, 0.42);
  font-size: 0.62rem;
  font-weight: 800;
`;

const QuickPlanner = styled.section`
  margin-bottom: 16px;
  padding: 18px;
  border: 1px solid rgba(16, 185, 129, 0.32);
  border-radius: 13px;
  background: linear-gradient(
    135deg,
    rgba(16, 185, 129, 0.13),
    rgba(14, 116, 144, 0.07) 58%,
    rgba(255, 255, 255, 0.02)
  );
`;

const PlanReadiness = styled.section`
  margin-top: 14px;
  padding: 14px;
  border: 1px solid rgba(14, 165, 233, 0.25);
  border-radius: 12px;
  background: linear-gradient(
    135deg,
    rgba(14, 165, 233, 0.075),
    rgba(16, 185, 129, 0.045)
  );
`;

const PlanReadinessHeading = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 11px;

  span {
    display: block;
    color: #67e8f9;
    font-size: 0.6rem;
    font-weight: 800;
    letter-spacing: 0.1em;
  }
  h3 {
    margin: 3px 0 0;
    color: var(--text-main);
    font-size: 0.82rem;
  }
`;

const BulkStatus = styled.span`
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 9px;
  border: 1px solid rgba(110, 231, 183, 0.34);
  border-radius: 999px;
  color: #a7f3d0;
  background: rgba(16, 185, 129, 0.12);
  font-size: 0.66rem;
  font-weight: 700;

  @media (max-width: 520px) {
    display: none;
  }
`;

const ReadinessGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const ReadinessItem = styled.div<{ $ready: boolean }>`
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 9px;
  border: 1px solid
    ${({ $ready }) =>
      $ready ? "rgba(16, 185, 129, 0.3)" : "rgba(148, 163, 184, 0.19)"};
  border-radius: 9px;
  background: ${({ $ready }) =>
    $ready ? "rgba(16, 185, 129, 0.07)" : "rgba(15, 23, 42, 0.16)"};

  > i {
    flex: 0 0 auto;
    margin-top: 2px;
    color: ${({ $ready }) => ($ready ? "#6ee7b7" : "var(--text-dim)")};
    font-size: 0.78rem;
  }
  strong,
  span {
    display: block;
  }
  strong {
    color: var(--text-main);
    font-size: 0.68rem;
    line-height: 1.35;
  }
  span {
    margin-top: 3px;
    color: var(--text-muted);
    font-size: 0.62rem;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
`;

const QualityRepairButton = styled.button`
  min-height: 30px;
  flex: 0 0 auto;
  padding: 0 9px;
  border: 1px solid rgba(125, 211, 252, 0.38);
  border-radius: 7px;
  color: #bae6fd;
  background: rgba(14, 116, 144, 0.13);
  font-size: 0.66rem;
  font-weight: 750;
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: rgba(125, 211, 252, 0.75);
    background: rgba(14, 116, 144, 0.24);
  }
  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
  &:focus-visible {
    outline: 2px solid #7dd3fc;
    outline-offset: 2px;
  }
`;

const QuickPlannerHeading = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 13px;

  span {
    display: block;
    color: #6ee7b7;
    font-size: 0.61rem;
    font-weight: 800;
    letter-spacing: 0.11em;
  }
  h3 {
    margin: 4px 0 0;
    color: var(--text-main);
    font-size: 0.98rem;
  }
`;

const PlannerState = styled.span<{ $ready: boolean }>`
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 9px;
  border: 1px solid
    ${({ $ready }) =>
      $ready ? "rgba(16, 185, 129, 0.35)" : "rgba(148, 163, 184, 0.26)"};
  border-radius: 999px;
  color: ${({ $ready }) => ($ready ? "#a7f3d0" : "var(--text-muted)")};
  background: ${({ $ready }) =>
    $ready ? "rgba(16, 185, 129, 0.09)" : "rgba(255,255,255,0.035)"};
  font-size: 0.66rem;
  font-weight: 700;

  i {
    font-size: 0.68rem;
  }

  @media (max-width: 620px) {
    display: none;
  }
`;

const QuickPlannerFields = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 132px 104px auto;
  align-items: end;
  gap: 10px;

  @media (max-width: 780px) {
    grid-template-columns: minmax(0, 1fr) 120px 96px;
  }
  @media (max-width: 620px) {
    grid-template-columns: minmax(0, 1fr) 96px;
  }
  @media (max-width: 420px) {
    grid-template-columns: 1fr;
  }
`;

const QuickStartRow = styled.div`
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 11px;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
  > span {
    flex: 0 0 auto;
    margin-right: 2px;
    color: var(--text-muted);
    font-size: 0.66rem;
    font-weight: 700;
  }
`;

const QuickStartButton = styled.button`
  flex: 0 0 auto;
  min-height: 30px;
  padding: 0 9px;
  border: 1px solid rgba(16, 185, 129, 0.24);
  border-radius: 999px;
  color: #d1fae5;
  background: rgba(5, 46, 22, 0.28);
  font-size: 0.66rem;
  font-weight: 700;
  cursor: pointer;

  i {
    margin-right: 5px;
    color: #6ee7b7;
  }
  &:hover:not(:disabled) {
    border-color: rgba(16, 185, 129, 0.54);
    background: rgba(16, 185, 129, 0.12);
  }
  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  &:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
`;

const QuickTopicField = styled.div`
  min-width: 0;

  label,
  textarea {
    display: block;
  }
  label {
    margin: 0 0 6px;
    color: var(--text-muted);
    font-size: 0.69rem;
    font-weight: 700;
  }
  textarea {
    box-sizing: border-box;
    width: 100%;
    min-height: 44px;
    padding: 10px;
    border: 1px solid rgba(16, 185, 129, 0.27);
    border-radius: 9px;
    color: var(--text-main);
    background: rgba(5, 46, 22, 0.22);
    font: inherit;
    font-size: 0.8rem;
    line-height: 1.35;
    resize: vertical;
  }
  textarea::placeholder {
    color: var(--text-dim);
  }
  textarea:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--primary) 70%, transparent);
    outline-offset: 1px;
    border-color: var(--primary);
  }
`;

const TopicHint = styled.p`
  min-height: 18px;
  margin: 5px 0 0;
  color: var(--text-muted);
  font-size: 0.66rem;
  line-height: 1.4;
`;

const QuickSelectField = styled.div`
  label,
  select {
    display: block;
  }
  label {
    margin: 0 0 6px;
    color: var(--text-muted);
    font-size: 0.69rem;
    font-weight: 700;
  }
  select {
    box-sizing: border-box;
    width: 100%;
    height: 44px;
    padding: 0 9px;
    border: 1px solid rgba(16, 185, 129, 0.27);
    border-radius: 9px;
    color: var(--text-main);
    background: rgba(5, 46, 22, 0.22);
    font: inherit;
    font-size: 0.78rem;
  }
  select:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--primary) 70%, transparent);
    outline-offset: 1px;
    border-color: var(--primary);
  }
`;

const PlanButton = styled.button`
  min-height: 44px;
  padding: 0 15px;
  border: 1px solid transparent;
  border-radius: 9px;
  color: #052e16;
  background: #6ee7b7;
  font-size: 0.78rem;
  font-weight: 800;
  white-space: nowrap;
  cursor: pointer;

  &:hover:not(:disabled) {
    filter: brightness(1.06);
  }
  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  &:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  @media (max-width: 780px) {
    grid-column: span 3;
  }
  @media (max-width: 620px) {
    grid-column: span 2;
  }
  @media (max-width: 420px) {
    grid-column: auto;
  }
`;

const PlanDisclosure = styled.p`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 10px 0 0;
  padding: 9px 10px;
  border: 1px solid rgba(125, 211, 252, 0.2);
  border-radius: 9px;
  color: var(--text-muted);
  background: rgba(14, 116, 144, 0.08);
  font-size: 0.67rem;
  line-height: 1.5;

  i {
    flex: 0 0 auto;
    margin-top: 3px;
    color: #7dd3fc;
  }
  strong { color: #bae6fd; }
`;

const PaidActionApproval = styled.section`
  display: grid;
  gap: 12px;
  margin-top: 12px;
  padding: 14px;
  border: 1px solid rgba(251, 191, 36, 0.38);
  border-radius: 12px;
  background: rgba(120, 53, 15, 0.12);

  .approval-heading {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }
  .approval-heading > i {
    margin-top: 3px;
    color: #fbbf24;
  }
  h4 { margin: 0; color: var(--text-main); font-size: 0.86rem; }
  p { margin: 4px 0 0; color: var(--text-muted); font-size: 0.72rem; line-height: 1.55; }
  ul {
    display: grid;
    gap: 5px;
    margin: 0;
    padding-left: 18px;
    color: var(--text-muted);
    font-size: 0.7rem;
    line-height: 1.45;
  }
  label {
    display: flex;
    align-items: center;
    gap: 9px;
    min-height: 44px;
    padding: 8px 10px;
    border-radius: 9px;
    color: var(--text-main);
    background: rgba(255, 255, 255, 0.04);
    font-size: 0.72rem;
    cursor: pointer;
  }
  input { width: 18px; height: 18px; accent-color: #6ee7b7; }
  .approval-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  button {
    min-height: 44px;
    padding: 0 14px;
    border: 1px solid var(--border-subtle);
    border-radius: 9px;
    color: var(--text-main);
    background: rgba(255, 255, 255, 0.04);
    font-weight: 800;
    cursor: pointer;
  }
  button:last-child {
    border-color: transparent;
    color: #052e16;
    background: #6ee7b7;
  }
  button:disabled { cursor: not-allowed; opacity: 0.48; }
  button:focus-visible,
  input:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

  @media (max-width: 520px) {
    .approval-actions { display: grid; grid-template-columns: 1fr 1fr; }
    button { width: 100%; }
  }
`;

const AdvancedDetails = styled.details`
  margin-top: 14px;
  border: 1px solid var(--border-subtle);
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.018);

  > summary {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 46px;
    padding: 0 14px;
    color: var(--text-main);
    cursor: pointer;
    list-style: none;
    font-size: 0.78rem;
    font-weight: 700;
  }
  > summary::-webkit-details-marker {
    display: none;
  }
  > summary span {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }
  > summary small {
    margin-left: auto;
    color: var(--text-muted);
    font-size: 0.68rem;
    font-weight: 500;
  }
  > summary > i {
    color: var(--text-muted);
    font-size: 0.7rem;
    transition: transform 0.16s ease;
  }
  &[open] > summary {
    border-bottom: 1px solid var(--border-subtle);
  }
  &[open] > summary > i {
    transform: rotate(180deg);
  }
  > summary:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: -3px;
  }

  @media (prefers-reduced-motion: reduce) {
    > summary > i {
      transition: none;
    }
  }
  @media (max-width: 560px) {
    > summary small {
      display: none;
    }
  }
`;

const AdvancedDetailsBody = styled.div`
  padding: 14px;
`;

const BriefGrid = styled.div`
  display: grid;
  grid-template-columns:
    minmax(0, 1fr) minmax(170px, 0.55fr) minmax(140px, 0.36fr)
    minmax(140px, 0.36fr);
  gap: 12px;

  @media (max-width: 920px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const BriefField = styled.div<{ $wide?: boolean }>`
  min-width: 0;
  grid-column: ${({ $wide }) => ($wide ? "span 2" : "auto")};

  label {
    display: block;
    margin: 0 0 6px;
    color: var(--text-muted);
    font-size: 0.69rem;
    font-weight: 700;
  }

  input,
  select,
  textarea {
    box-sizing: border-box;
    width: 100%;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    color: var(--text-main);
    background: rgba(255, 255, 255, 0.035);
    font: inherit;
    font-size: 0.78rem;
    line-height: 1.45;
  }

  input,
  select {
    height: 36px;
    padding: 0 10px;
  }
  textarea {
    min-height: 70px;
    padding: 9px 10px;
    resize: vertical;
  }
  input::placeholder,
  textarea::placeholder {
    color: var(--text-dim);
  }
  input:focus-visible,
  select:focus-visible,
  textarea:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--primary) 70%, transparent);
    outline-offset: 1px;
    border-color: var(--primary);
  }

  @media (max-width: 520px) {
    grid-column: span 1;
  }
`;

const ContinuitySection = styled.section`
  margin-top: 28px;
  padding: 18px;
  border: 1px solid rgba(16, 185, 129, 0.22);
  border-radius: 13px;
  background: linear-gradient(
    135deg,
    rgba(16, 185, 129, 0.08),
    rgba(255, 255, 255, 0.015) 45%
  );
`;

const SceneSummary = styled.div`
  margin-bottom: 12px;
  padding: 10px 12px;
  border-left: 2px solid rgba(16, 185, 129, 0.58);
  border-radius: 0 8px 8px 0;
  background: rgba(16, 185, 129, 0.06);

  p {
    margin: 0;
    color: var(--text-main);
    font-size: 0.78rem;
    line-height: 1.52;
  }
  span {
    display: block;
    margin-top: 6px;
    color: var(--text-muted);
    font-size: 0.69rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const ResultReviewNotice = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 8px 0;
  padding: 8px 10px;
  border: 1px solid rgba(245, 158, 11, 0.28);
  border-radius: 8px;
  color: #fde68a;
  background: rgba(120, 53, 15, 0.16);
  font-size: 0.68rem;
  line-height: 1.45;

  i {
    margin-top: 2px;
  }
  span {
    min-width: 0;
    flex: 1;
  }
  strong {
    display: block;
    margin-bottom: 1px;
    color: #fef3c7;
  }
  button {
    min-height: 30px;
    flex: 0 0 auto;
    padding: 0 9px;
    border: 1px solid rgba(253, 230, 138, 0.35);
    border-radius: 7px;
    color: #fff7d6;
    background: rgba(245, 158, 11, 0.14);
    font-size: 0.64rem;
    font-weight: 800;
    cursor: pointer;
    white-space: nowrap;
  }
  button:hover {
    background: rgba(245, 158, 11, 0.24);
  }
  button:focus-visible {
    outline: 2px solid #fde68a;
    outline-offset: 2px;
  }

  @media (max-width: 520px) {
    flex-wrap: wrap;
    button {
      width: 100%;
      min-height: 36px;
    }
  }
`;

const MissingSceneImageNotice = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 8px 0;
  padding: 8px 10px;
  border: 1px solid rgba(251, 191, 36, 0.28);
  border-radius: 8px;
  color: #fde68a;
  background: rgba(120, 53, 15, 0.12);
  font-size: 0.68rem;
  line-height: 1.48;

  i {
    margin-top: 2px;
    color: #fbbf24;
  }
  span {
    min-width: 0;
  }
  strong {
    margin-right: 4px;
    color: #fef3c7;
  }
`;

const SceneProductionNotes = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: -2px 0 12px;

  span {
    min-width: 0;
    display: flex;
    gap: 6px;
    align-items: flex-start;
    color: var(--text-muted);
    font-size: 0.69rem;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  b {
    flex: 0 0 auto;
    padding: 2px 5px;
    border-radius: 4px;
    color: #a7f3d0;
    background: rgba(16, 185, 129, 0.13);
    font-size: 0.6rem;
  }

  @media (max-width: 620px) {
    grid-template-columns: 1fr;
  }
`;

const SceneRedesignPanel = styled.section`
  margin: 13px 0;
  padding: 14px;
  border: 1px solid rgba(56, 189, 248, 0.34);
  border-radius: 10px;
  background: linear-gradient(
    135deg,
    rgba(14, 116, 144, 0.14),
    rgba(15, 23, 42, 0.32)
  );
`;

const SceneRedesignHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;

  span {
    display: block;
    color: #7dd3fc;
    font-size: 0.61rem;
    font-weight: 800;
    letter-spacing: 0.08em;
  }

  strong {
    display: block;
    margin-top: 3px;
    color: var(--text-main);
    font-size: 0.82rem;
  }
  p {
    max-width: 680px;
    margin: 5px 0 0;
    color: var(--text-muted);
    font-size: 0.7rem;
    line-height: 1.5;
  }

  > button {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    border: 0;
    border-radius: 7px;
    color: var(--text-muted);
    background: transparent;
    cursor: pointer;
    &:hover:not(:disabled) {
      color: var(--text-main);
      background: rgba(255, 255, 255, 0.09);
    }
    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    &:focus-visible {
      outline: 2px solid #7dd3fc;
      outline-offset: 2px;
    }
  }
`;

const SceneRedesignScope = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin-top: 11px;

  button {
    display: inline-flex;
    min-width: 0;
    min-height: 36px;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 8px;
    border: 1px solid rgba(125, 211, 252, 0.25);
    border-radius: 8px;
    color: var(--text-muted);
    background: rgba(15, 23, 42, 0.32);
    font-size: 0.64rem;
    font-weight: 750;
    line-height: 1.3;
    text-align: center;
    cursor: pointer;
    transition:
      border-color 160ms ease,
      background 160ms ease,
      color 160ms ease;
  }
  button[aria-pressed="true"] {
    border-color: rgba(125, 211, 252, 0.8);
    color: #e0f2fe;
    background: rgba(14, 116, 144, 0.3);
  }
  button:hover:not(:disabled) {
    border-color: rgba(125, 211, 252, 0.7);
    color: var(--text-main);
  }
  button:focus-visible {
    outline: 2px solid #7dd3fc;
    outline-offset: 2px;
  }
  button:disabled {
    opacity: 0.48;
    cursor: not-allowed;
  }
  i {
    color: #7dd3fc;
  }
  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
`;

const SceneRedesignQuickActions = styled.div`
  display: flex;
  gap: 6px;
  margin-top: 11px;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }

  button {
    flex: 0 0 auto;
    min-height: 27px;
    padding: 0 8px;
    border: 1px solid rgba(125, 211, 252, 0.24);
    border-radius: 999px;
    color: #dbeafe;
    background: rgba(14, 116, 144, 0.12);
    font-size: 0.64rem;
    font-weight: 700;
    cursor: pointer;
    &:hover:not(:disabled) {
      border-color: rgba(125, 211, 252, 0.65);
      background: rgba(14, 116, 144, 0.25);
    }
    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    &:focus-visible {
      outline: 2px solid #7dd3fc;
      outline-offset: 2px;
    }
  }
`;

const SceneRedesignField = styled.div`
  margin-top: 11px;

  label {
    display: flex;
    align-items: baseline;
    gap: 5px;
    margin-bottom: 6px;
    color: var(--text-main);
    font-size: 0.68rem;
    font-weight: 750;
  }
  label span {
    color: var(--text-muted);
    font-size: 0.62rem;
    font-weight: 500;
  }
  textarea {
    width: 100%;
    min-height: 74px;
    resize: vertical;
    padding: 9px 10px;
    border: 1px solid rgba(148, 163, 184, 0.3);
    border-radius: 8px;
    color: var(--text-main);
    background: rgba(15, 23, 42, 0.52);
    font: inherit;
    font-size: 0.72rem;
    line-height: 1.5;
    &:focus-visible {
      outline: 2px solid #7dd3fc;
      outline-offset: 2px;
      border-color: transparent;
    }
    &:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
  }
`;

const SceneRedesignContext = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  margin-top: 10px;
  color: var(--text-muted);
  font-size: 0.63rem;
  line-height: 1.4;

  span {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    gap: 5px;
    overflow-wrap: anywhere;
  }
  i {
    color: #7dd3fc;
  }
`;

const SceneRedesignActions = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(148, 163, 184, 0.18);

  > span {
    color: var(--text-muted);
    font-size: 0.63rem;
    line-height: 1.4;
  }
  @media (max-width: 520px) {
    align-items: stretch;
    flex-direction: column;
  }
`;

const SceneRedesignSubmit = styled.button`
  min-height: 34px;
  flex: 0 0 auto;
  padding: 0 12px;
  border: 1px solid rgba(125, 211, 252, 0.72);
  border-radius: 8px;
  color: #082f49;
  background: #bae6fd;
  font-size: 0.71rem;
  font-weight: 800;
  cursor: pointer;
  &:hover:not(:disabled) {
    filter: brightness(1.04);
  }
  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  &:focus-visible {
    outline: 2px solid #7dd3fc;
    outline-offset: 2px;
  }
`;

const SceneDetails = styled.details`
  margin-bottom: 14px;

  > summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 30px;
    color: var(--text-muted);
    cursor: pointer;
    list-style: none;
    font-size: 0.7rem;
    font-weight: 700;
  }
  > summary::-webkit-details-marker {
    display: none;
  }
  > summary > i {
    font-size: 0.64rem;
    transition: transform 0.16s ease;
  }
  &[open] > summary {
    margin-bottom: 10px;
    color: var(--text-main);
  }
  &[open] > summary > i {
    transform: rotate(180deg);
  }
  > summary:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
    border-radius: 4px;
  }

  @media (prefers-reduced-motion: reduce) {
    > summary > i {
      transition: none;
    }
  }
`;

const SectionHeading = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;

  span {
    display: block;
    color: #6ee7b7;
    font-size: 0.61rem;
    font-weight: 800;
    letter-spacing: 0.1em;
  }
  h3 {
    margin: 3px 0 0;
    color: var(--text-main);
    font-size: 0.95rem;
  }
  p {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.72rem;
    text-align: right;
  }

  @media (max-width: 560px) {
    align-items: flex-start;
    p {
      display: none;
    }
  }
`;

const ContinuityGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  @media (max-width: 620px) {
    grid-template-columns: 1fr;
  }
`;

const ReferenceToggle = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid rgba(16, 185, 129, 0.2);

  input {
    width: 16px;
    height: 16px;
    flex: 0 0 auto;
    margin: 2px 0 0;
    accent-color: #34d399;
  }

  input:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  label {
    cursor: pointer;
  }
  strong {
    display: block;
    color: var(--text-main);
    font-size: 0.75rem;
  }
  span {
    display: block;
    margin-top: 3px;
    color: var(--text-muted);
    font-size: 0.7rem;
    line-height: 1.45;
  }
`;

const SceneSection = styled.section`
  margin-top: 30px;
`;

const SceneHeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;

  @media (max-width: 560px) {
    gap: 7px;
  }
`;

const MissingImageFinder = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  margin: -2px 0 14px;
  padding: 10px 12px;
  border: 1px solid rgba(251, 191, 36, 0.38);
  border-radius: 10px;
  color: #fde68a;
  background: rgba(120, 53, 15, 0.16);

  > i {
    color: #fbbf24;
    font-size: 0.92rem;
  }
  strong,
  span {
    display: block;
  }
  strong {
    color: #fef3c7;
    font-size: 0.72rem;
  }
  span {
    margin-top: 2px;
    color: #fcd34d;
    font-size: 0.62rem;
    line-height: 1.42;
  }

  @media (max-width: 620px) {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
  }
`;

const MissingImageActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;

  button {
    min-height: 30px;
    padding: 0 9px;
    border: 1px solid rgba(253, 230, 138, 0.38);
    border-radius: 7px;
    color: #fff7d6;
    background: rgba(245, 158, 11, 0.13);
    font-size: 0.64rem;
    font-weight: 800;
    cursor: pointer;
    white-space: nowrap;
  }
  button:hover {
    background: rgba(245, 158, 11, 0.25);
  }
  button:focus-visible {
    outline: 2px solid #fde68a;
    outline-offset: 2px;
  }
  small {
    align-self: center;
    color: #fcd34d;
    font-size: 0.64rem;
    font-weight: 800;
  }

  @media (max-width: 620px) {
    grid-column: 1 / -1;
    justify-content: flex-start;
  }
`;

const SceneCount = styled.span`
  color: var(--text-muted);
  font-size: 0.68rem;
  font-weight: 700;
  white-space: nowrap;

  @media (max-width: 560px) {
    display: none;
  }
`;

const AddSceneButton = styled.button`
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  color: var(--text-main);
  background: rgba(255, 255, 255, 0.04);
  font-size: 0.74rem;
  font-weight: 700;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.08);
  }
  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  &:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
`;

const BulkGenerateButton = styled.button`
  height: 34px;
  padding: 0 11px;
  border: 1px solid rgba(16, 185, 129, 0.34);
  border-radius: 8px;
  color: #052e16;
  background: #6ee7b7;
  font-size: 0.71rem;
  font-weight: 800;
  white-space: nowrap;
  cursor: pointer;

  i {
    margin-right: 5px;
  }
  &:hover:not(:disabled) {
    filter: brightness(1.05);
  }
  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  &:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  @media (max-width: 460px) {
    padding: 0 9px;
  }
`;

const SceneNavigator = styled.nav`
  display: flex;
  gap: 7px;
  margin: -3px 0 14px;
  padding: 1px 0 5px;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const SceneNavigatorButton = styled.button<{
  $status: ImageStoryboardScene["status"];
  $active: boolean;
  $missingImage: boolean;
}>`
  flex: 0 0 126px;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 37px;
  padding: 0 9px;
  overflow: hidden;
  border: 1px solid
    ${({ $status, $active, $missingImage }) =>
      $active
        ? "#6ee7b7"
        : $missingImage
          ? "rgba(251, 191, 36, 0.58)"
          : $status === "generated"
            ? "rgba(16, 185, 129, 0.42)"
            : $status === "ready"
              ? "rgba(251, 191, 36, 0.34)"
              : "var(--border-subtle)"};
  border-radius: 8px;
  color: var(--text-main);
  background: ${({ $status, $active, $missingImage }) =>
    $active
      ? "rgba(16, 185, 129, 0.16)"
      : $missingImage
        ? "rgba(245, 158, 11, 0.10)"
        : $status === "generated"
          ? "rgba(16, 185, 129, 0.08)"
          : $status === "ready"
            ? "rgba(251, 191, 36, 0.06)"
            : "rgba(255, 255, 255, 0.02)"};
  cursor: pointer;
  scroll-snap-align: start;
  text-align: left;
  touch-action: manipulation;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
  }
  &:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  span {
    flex: 0 0 auto;
    color: ${({ $status, $missingImage }) =>
      $missingImage
        ? "#fcd34d"
        : $status === "generated"
          ? "#6ee7b7"
          : $status === "ready"
            ? "#fcd34d"
            : "var(--text-muted)"};
    font-size: 0.64rem;
    font-weight: 800;
  }
  strong {
    min-width: 0;
    overflow: hidden;
    font-size: 0.68rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const SceneList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const SceneCard = styled.article<{ $active: boolean; $missingImage: boolean }>`
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  content-visibility: auto;
  contain-intrinsic-size: auto 460px;
  overflow: hidden;
  border: 1px solid
    ${({ $active, $missingImage }) =>
      $active
        ? "rgba(110, 231, 183, 0.66)"
        : $missingImage
          ? "rgba(251, 191, 36, 0.48)"
          : "var(--border-subtle)"};
  border-radius: 12px;
  background: var(--bg-elevated, rgba(255, 255, 255, 0.025));
  scroll-margin-block: 26px;
  box-shadow: ${({ $active, $missingImage }) =>
    $active
      ? "0 0 0 3px rgba(16, 185, 129, 0.07)"
      : $missingImage
        ? "0 0 0 3px rgba(245, 158, 11, 0.045)"
        : "none"};
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease;

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const SceneRail = styled.div`
  padding: 17px 8px;
  border-right: 1px solid var(--border-subtle);
  background: rgba(255, 255, 255, 0.025);
  text-align: center;

  @media (max-width: 560px) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 9px 14px;
    border-right: 0;
    border-bottom: 1px solid var(--border-subtle);
  }
`;

const SceneNumber = styled.div`
  color: var(--text-main);
  font-size: 1rem;
  font-weight: 800;
`;

const SceneStatus = styled.div<{
  $status: ImageStoryboardScene["status"];
  $missingImage: boolean;
}>`
  margin-top: 7px;
  color: ${({ $status, $missingImage }) =>
    $missingImage
      ? "#fbbf24"
      : $status === "generated"
        ? "#6ee7b7"
        : $status === "ready"
          ? "#fcd34d"
          : "var(--text-muted)"};
  font-size: 0.61rem;
  font-weight: 700;
  @media (max-width: 560px) {
    margin-top: 0;
  }
`;

const SceneBody = styled.div`
  min-width: 0;
  padding: 16px;
`;

const SceneTopLine = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;

  > input {
    min-width: 0;
    flex: 1;
    border: 0;
    border-bottom: 1px solid transparent;
    color: var(--text-main);
    background: transparent;
    font-size: 0.98rem;
    font-weight: 800;
    &:hover {
      border-bottom-color: var(--border-subtle);
    }
    &:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 3px;
      border-bottom-color: var(--primary);
    }
  }
`;

const SceneCommands = styled.div`
  display: flex;
  gap: 4px;
`;

const CommandButton = styled.button<{ $danger?: boolean }>`
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 6px;
  color: ${({ $danger }) => ($danger ? "#fca5a5" : "var(--text-muted)")};
  background: transparent;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: ${({ $danger }) =>
      $danger ? "rgba(239, 68, 68, 0.16)" : "rgba(255,255,255,0.08)"};
  }
  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  &:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
`;

const SceneGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 12px;
  @media (max-width: 650px) {
    grid-template-columns: 1fr;
  }
`;

const SceneFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;

  @media (max-width: 650px) {
    align-items: stretch;
    flex-direction: column;
  }
`;

const PromptHint = styled.span`
  color: var(--text-muted);
  font-size: 0.68rem;
`;

const SceneActionGroup = styled.div`
  display: flex;
  gap: 8px;
  @media (max-width: 430px) {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
`;

const RedesignSceneButton = styled.button`
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid rgba(125, 211, 252, 0.44);
  border-radius: 8px;
  color: #bae6fd;
  background: rgba(14, 116, 144, 0.11);
  font-size: 0.72rem;
  font-weight: 750;
  cursor: pointer;
  &:hover:not(:disabled) {
    border-color: rgba(125, 211, 252, 0.8);
    background: rgba(14, 116, 144, 0.22);
  }
  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  &:focus-visible {
    outline: 2px solid #7dd3fc;
    outline-offset: 2px;
  }
`;

const GenerateSceneButton = styled.button`
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: #052e16;
  background: #6ee7b7;
  font-size: 0.72rem;
  font-weight: 800;
  cursor: pointer;

  &:hover:not(:disabled) {
    filter: brightness(1.06);
  }
  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  &:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
`;

const GeneratedResult = styled.div`
  position: relative;
  width: min(210px, 100%);
  margin-top: 14px;
  overflow: hidden;
  border: 1px solid rgba(16, 185, 129, 0.38);
  border-radius: 8px;
  background: #0f172a;

  img {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
  }
  span {
    display: block;
    padding: 6px 8px;
    color: #d1fae5;
    font-size: 0.65rem;
    font-weight: 700;
  }
  button {
    position: absolute;
    top: 7px;
    right: 7px;
    display: grid;
    width: 30px;
    height: 30px;
    place-items: center;
    border: 1px solid rgba(255, 255, 255, 0.34);
    border-radius: 7px;
    color: #fff;
    background: rgba(2, 6, 23, 0.72);
    cursor: pointer;
    touch-action: manipulation;
  }
  button:hover:not(:disabled) {
    background: rgba(5, 150, 105, 0.86);
  }
  button:disabled {
    opacity: 0.65;
    cursor: wait;
  }
  button:focus-visible {
    outline: 2px solid #6ee7b7;
    outline-offset: 2px;
  }
`;

const SignInState = styled.div`
  display: grid;
  flex: 1;
  place-content: center;
  padding: clamp(20px, 4vw, 48px);

  .signin-card {
    display: grid;
    width: min(780px, calc(100vw - 40px));
    gap: 18px;
    padding: clamp(22px, 4vw, 38px);
    border: 1px solid rgba(110, 231, 183, 0.2);
    border-radius: 24px;
    background: linear-gradient(145deg, rgba(15, 118, 110, 0.16), rgba(22, 27, 34, 0.96) 44%);
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.24);
  }
  .signin-loading {
    width: min(520px, calc(100vw - 40px));
    justify-items: center;
    text-align: center;
  }
  .signin-intro {
    display: grid;
    justify-items: center;
    text-align: center;
  }
  .signin-icon {
    display: grid;
    width: 48px;
    height: 48px;
    margin-bottom: 12px;
    place-items: center;
    border: 1px solid rgba(110, 231, 183, 0.28);
    border-radius: 15px;
    color: #6ee7b7;
    background: rgba(16, 185, 129, 0.12);
    font-size: 1.25rem;
  }
  .signin-eyebrow {
    margin-bottom: 7px;
    color: #6ee7b7;
    font-size: 0.68rem;
    font-weight: 850;
    letter-spacing: 0.12em;
  }
  h3 {
    margin: 0;
    color: var(--text-main);
    font-size: clamp(1.25rem, 2.4vw, 1.72rem);
    letter-spacing: -0.025em;
  }
  p {
    max-width: 580px;
    margin: 9px 0 0;
    color: var(--text-muted);
    font-size: 0.84rem;
    line-height: 1.65;
  }
  .signin-journey {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 9px;
    margin: 0;
    padding: 0;
    list-style: none;
    text-align: left;
  }
  .signin-journey li {
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr);
    gap: 9px;
    align-items: center;
    min-width: 0;
    padding: 11px;
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 12px;
    background: rgba(15, 23, 42, 0.42);
  }
  .signin-journey li > span {
    display: grid;
    width: 30px;
    height: 30px;
    place-items: center;
    border-radius: 9px;
    color: #052e24;
    background: #6ee7b7;
    font-size: 0.72rem;
    font-weight: 900;
  }
  .signin-journey strong,
  .signin-journey small {
    display: block;
  }
  .signin-journey strong {
    color: var(--text-main);
    font-size: 0.76rem;
  }
  .signin-journey small {
    margin-top: 3px;
    color: var(--text-muted);
    font-size: 0.67rem;
    line-height: 1.4;
  }
  .signin-trust {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .signin-trust li {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    color: var(--text-muted);
    font-size: 0.72rem;
    line-height: 1.5;
  }
  .signin-trust i {
    margin-top: 3px;
    color: #6ee7b7;
  }
  button {
    min-height: 48px;
    margin: 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    padding: 0 22px;
    border: 1px solid rgba(16, 185, 129, 0.48);
    border-radius: 12px;
    color: #052e24;
    background: #6ee7b7;
    font: inherit;
    font-size: 0.82rem;
    font-weight: 850;
    cursor: pointer;
  }
  button:hover:not(:disabled) { background: #a7f3d0; }
  button:focus-visible { outline: 3px solid rgba(110, 231, 183, 0.3); outline-offset: 3px; }
  button:disabled { cursor: not-allowed; opacity: 0.55; }
  .signin-footnote {
    margin: -7px auto 0;
    color: var(--text-muted);
    font-size: 0.67rem;
    text-align: center;
  }
  .signin-warning {
    max-width: none;
    margin: 0;
    padding: 10px 12px;
    border: 1px solid rgba(248, 113, 113, 0.35);
    border-radius: 10px;
    color: #fecaca;
    background: rgba(127, 29, 29, 0.2);
    text-align: center;
  }

  @media (max-width: 640px) {
    align-content: start;
    padding: 18px 12px 28px;
    .signin-card { width: 100%; gap: 15px; padding: 20px 15px; border-radius: 18px; }
    .signin-journey { grid-template-columns: 1fr; }
    .signin-journey li { min-height: 58px; }
    .signin-trust { grid-template-columns: 1fr; }
    button { width: 100%; }
  }
`;

const EmptyBoardState = styled.div`
  display: grid;
  place-content: center;
  justify-items: center;
  min-height: 320px;
  padding: 24px;
  text-align: center;

  > i {
    margin-bottom: 14px;
    color: #6ee7b7;
    font-size: 2rem;
  }
  h3 {
    margin: 0;
    color: var(--text-main);
  }
  p {
    max-width: 380px;
    margin: 9px 0 16px;
    color: var(--text-muted);
    font-size: 0.82rem;
    line-height: 1.6;
  }
  button {
    min-height: 36px;
    padding: 0 13px;
    border: 0;
    border-radius: 8px;
    color: #052e16;
    background: #6ee7b7;
    font-weight: 800;
    cursor: pointer;
  }
`;

const ErrorNotice = styled.div`
  margin: 0 0 14px;
  padding: 10px 12px;
  border: 1px solid rgba(248, 113, 113, 0.35);
  border-radius: 8px;
  color: #fecaca;
  background: rgba(127, 29, 29, 0.2);
  font-size: 0.75rem;

  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  button {
    min-height: 30px;
    flex: 0 0 auto;
    padding: 0 9px;
    border: 1px solid rgba(254, 202, 202, 0.3);
    border-radius: 7px;
    color: #fff;
    background: rgba(248, 113, 113, 0.16);
    font-size: 0.68rem;
    font-weight: 750;
    cursor: pointer;
  }

  .conflict-actions {
    display: flex;
    flex: 0 0 auto;
    gap: 6px;
  }

  button:focus-visible {
    outline: 2px solid #fecaca;
    outline-offset: 2px;
  }

  @media (max-width: 620px) {
    align-items: stretch;
    flex-direction: column;
    .conflict-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    button {
      min-height: 36px;
    }
  }
`;

export {
  Overlay,
  Workspace,
  WorkspaceHeader,
  TitleGroup,
  HeaderIcon,
  Eyebrow,
  HeaderActions,
  HeaderToolGroup,
  HeaderToolButton,
  SaveState,
  CloseButton,
  WorkspaceBody,
  ProjectSidebar,
  SidebarTop,
  SidebarDashboardButton,
  SidebarLabel,
  SidebarMeta,
  AddProjectButton,
  ProjectList,
  ProjectRow,
  ProjectItem,
  ProjectStatusBadge,
  ProjectRowMenu,
  SidebarMessage,
  BoardContent,
  WorkspaceAnchor,
  ProjectDashboard,
  DashboardHero,
  DashboardPrimaryButton,
  DashboardKpiGrid,
  DashboardKpi,
  ProjectControlBar,
  ProjectSearchField,
  ProjectFilterGroup,
  ProjectTable,
  DashboardPagination,
  ProjectTableHeader,
  ProjectTableRow,
  ProjectIdentity,
  ProjectMetric,
  ProjectStatus,
  ProjectUpdated,
  ProjectActionCell,
  ProjectOpenButton,
  DashboardEmpty,
  ProductionAssistantRail,
  AssistantRailHeader,
  QualityScore,
  QualityProgress,
  AssistantSummary,
  QualityChecklist,
  QualityCheckItem,
  AssistantDivider,
  ActiveSceneAssistant,
  AssistantSectionTitle,
  ActiveScenePreview,
  ActiveScenePlaceholder,
  ActiveSceneCopy,
  AssistantActionGrid,
  ReviewAcceptButton,
  ProductionShortcuts,
  ProductionShortcutButton,
  BoardHeader,
  ProjectActionRow,
  VersionPanel,
  VersionPanelHeader,
  VersionList,
  VersionEmpty,
  WorkspaceModeSwitch,
  BoardKicker,
  TitleInput,
  ProgressSummary,
  ProgressTrack,
  ProgressFill,
  ProductionFlow,
  WorkflowStep,
  WorkflowNumber,
  QuickPlanner,
  PlanReadiness,
  PlanReadinessHeading,
  BulkStatus,
  ReadinessGrid,
  ReadinessItem,
  QualityRepairButton,
  QuickPlannerHeading,
  PlannerState,
  QuickPlannerFields,
  QuickStartRow,
  QuickStartButton,
  QuickTopicField,
  TopicHint,
  QuickSelectField,
  PlanButton,
  PlanDisclosure,
  PaidActionApproval,
  AdvancedDetails,
  AdvancedDetailsBody,
  BriefGrid,
  BriefField,
  ContinuitySection,
  SceneSummary,
  ResultReviewNotice,
  MissingSceneImageNotice,
  SceneProductionNotes,
  SceneRedesignPanel,
  SceneRedesignHeader,
  SceneRedesignScope,
  SceneRedesignQuickActions,
  SceneRedesignField,
  SceneRedesignContext,
  SceneRedesignActions,
  SceneRedesignSubmit,
  SceneDetails,
  SectionHeading,
  ContinuityGrid,
  ReferenceToggle,
  SceneSection,
  SceneHeaderActions,
  MissingImageFinder,
  MissingImageActions,
  SceneCount,
  AddSceneButton,
  BulkGenerateButton,
  SceneNavigator,
  SceneNavigatorButton,
  SceneList,
  SceneCard,
  SceneRail,
  SceneNumber,
  SceneStatus,
  SceneBody,
  SceneTopLine,
  SceneCommands,
  CommandButton,
  SceneGrid,
  SceneFooter,
  PromptHint,
  SceneActionGroup,
  RedesignSceneButton,
  GenerateSceneButton,
  GeneratedResult,
  SignInState,
  EmptyBoardState,
  ErrorNotice,
};
