'use client';

import { useEffect, useState } from 'react';
import styled from 'styled-components';
import BasicMemoAccordion from '@/components/BasicMemoAccordion';
import StickyNotesBoard from '@/components/StickyNotesBoard';
import DoodlePad from '@/components/propig/DoodlePad';

type MemoViewMode = 'list' | 'sticker' | 'doodle';

const MEMO_DEFAULT_VIEW_STORAGE_KEY = 'propig-memos:default-view';
const MOBILE_MEMO_VIEW_FALLBACK: MemoViewMode = 'sticker';
const MEMO_MOBILE_MEDIA_QUERY = '(max-width: 720px)';

function isMemoViewMode(value: string | null): value is MemoViewMode {
  return value === 'list' || value === 'sticker' || value === 'doodle';
}

function getStoredMemoDefaultView(): MemoViewMode {
  if (typeof window === 'undefined') return 'list';
  const stored = window.localStorage.getItem(MEMO_DEFAULT_VIEW_STORAGE_KEY);
  return isMemoViewMode(stored) ? stored : 'list';
}

export default function PropigMemosPage() {
  const [viewMode, setViewMode] = useState<MemoViewMode>('list');
  const [defaultViewMode, setDefaultViewMode] = useState<MemoViewMode>('list');
  const [isMobileMemoViewport, setIsMobileMemoViewport] = useState(false);
  const [isManageOpen, setIsManageOpen] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const storedView = getStoredMemoDefaultView();
      setViewMode(storedView);
      setDefaultViewMode(storedView);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia(MEMO_MOBILE_MEDIA_QUERY);
    const syncMobileViewport = () => {
      const isMobile = mediaQuery.matches;
      setIsMobileMemoViewport(isMobile);
      if (isMobile) {
        setViewMode((current) => (current === 'list' ? MOBILE_MEMO_VIEW_FALLBACK : current));
      }
    };

    syncMobileViewport();
    mediaQuery.addEventListener('change', syncMobileViewport);
    return () => mediaQuery.removeEventListener('change', syncMobileViewport);
  }, []);

  const effectiveViewMode = isMobileMemoViewport && viewMode === 'list' ? MOBILE_MEMO_VIEW_FALLBACK : viewMode;
  const effectiveDefaultViewMode = isMobileMemoViewport && defaultViewMode === 'list' ? MOBILE_MEMO_VIEW_FALLBACK : defaultViewMode;

  const changeViewMode = (nextMode: MemoViewMode) => {
    if (isMobileMemoViewport && nextMode === 'list') {
      setViewMode(MOBILE_MEMO_VIEW_FALLBACK);
      return;
    }
    setViewMode(nextMode);
  };

  const changeDefaultViewMode = (nextMode: MemoViewMode) => {
    setDefaultViewMode(nextMode);
    setViewMode(nextMode);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(MEMO_DEFAULT_VIEW_STORAGE_KEY, nextMode);
    }
  };

  return (
    <main id="content-area" className="sticky-notes-page propig-memos-page">
      <div className="sticky-notes-board-shell">
        <MemoPageShell>
          <MemoToolbar>
            <ModeBar aria-label="메모 보기 방식">
              {!isMobileMemoViewport ? (
                <ModeButton
                  type="button"
                  $active={effectiveViewMode === 'list'}
                  onClick={() => changeViewMode('list')}
                  aria-pressed={effectiveViewMode === 'list'}
                  title="목록 모드"
                >
                  <i className="fa-solid fa-list-ul" aria-hidden="true" />
                  <span>목록</span>
                </ModeButton>
              ) : null}
              <ModeButton
                type="button"
                $active={effectiveViewMode === 'sticker'}
                onClick={() => changeViewMode('sticker')}
                aria-pressed={effectiveViewMode === 'sticker'}
                title="스티커 모드"
              >
                <i className="fa-solid fa-note-sticky" aria-hidden="true" />
                <span>스티커</span>
              </ModeButton>
              <ModeButton
                type="button"
                $active={effectiveViewMode === 'doodle'}
                onClick={() => changeViewMode('doodle')}
                aria-pressed={effectiveViewMode === 'doodle'}
                title="낙서장 모드"
              >
                <i className="fa-solid fa-pen" aria-hidden="true" />
                <span>낙서장</span>
              </ModeButton>
            </ModeBar>

            <ManageButton
              type="button"
              $active={isManageOpen}
              onClick={() => setIsManageOpen((prev) => !prev)}
              aria-expanded={isManageOpen}
              aria-controls="memo-default-management"
            >
              <i className="fa-solid fa-sliders" aria-hidden="true" />
              <span>관리</span>
            </ManageButton>
          </MemoToolbar>

          {isManageOpen ? (
            <MemoManagementPanel id="memo-default-management" aria-label="메모장 기본 보기 관리">
              <ManagementCopy>
                <strong>기본 화면 선택</strong>
                <span>다음에 메모장을 열 때 먼저 보여줄 화면을 정합니다.</span>
              </ManagementCopy>
              <DefaultModeGrid>
                {!isMobileMemoViewport ? (
                  <DefaultModeButton
                    type="button"
                    $active={effectiveDefaultViewMode === 'list'}
                    onClick={() => changeDefaultViewMode('list')}
                    aria-pressed={effectiveDefaultViewMode === 'list'}
                  >
                    <i className="fa-solid fa-list-ul" aria-hidden="true" />
                    <span>목록</span>
                  </DefaultModeButton>
                ) : null}
                <DefaultModeButton
                  type="button"
                  $active={effectiveDefaultViewMode === 'sticker'}
                  onClick={() => changeDefaultViewMode('sticker')}
                  aria-pressed={effectiveDefaultViewMode === 'sticker'}
                >
                  <i className="fa-solid fa-note-sticky" aria-hidden="true" />
                  <span>스티커</span>
                </DefaultModeButton>
                <DefaultModeButton
                  type="button"
                  $active={effectiveDefaultViewMode === 'doodle'}
                  onClick={() => changeDefaultViewMode('doodle')}
                  aria-pressed={effectiveDefaultViewMode === 'doodle'}
                >
                  <i className="fa-solid fa-pen" aria-hidden="true" />
                  <span>낙서장</span>
                </DefaultModeButton>
              </DefaultModeGrid>
            </MemoManagementPanel>
          ) : null}

          <MemoModeBody>
            {effectiveViewMode === 'list' ? <BasicMemoAccordion /> : null}
            {effectiveViewMode === 'sticker' ? <StickyNotesBoard /> : null}
            {effectiveViewMode === 'doodle' ? <DoodlePad /> : null}
          </MemoModeBody>
        </MemoPageShell>
      </div>
    </main>
  );
}

const MemoPageShell = styled.section`
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;

  body[data-propig-design='codeit'] & {
    gap: 14px;
  }
`;

const MemoToolbar = styled.div`
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;

  body[data-propig-design='codeit'] & {
    padding: 12px;
    border: 1px solid var(--codeit-border);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.9);
    box-shadow: 0 18px 44px rgba(30, 41, 59, 0.08);
    backdrop-filter: blur(16px);
    animation: memosCodeitRise 0.54s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }

  @keyframes memosCodeitRise {
    from {
      opacity: 0;
      transform: translateY(14px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

const ModeBar = styled.div`
  flex: 0 0 auto;
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.035);

  body[data-propig-design='codeit'] & {
    background: var(--codeit-surface-soft);
    border-color: var(--codeit-border);
  }
`;

const ModeButton = styled.button<{ $active?: boolean }>`
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid ${({ $active }) => ($active ? 'rgba(16, 185, 129, 0.42)' : 'transparent')};
  border-radius: 9px;
  background: ${({ $active }) => ($active ? 'rgba(16, 185, 129, 0.16)' : 'transparent')};
  color: ${({ $active }) => ($active ? 'var(--primary-light)' : 'var(--text-muted)')};
  font-weight: 850;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;

  &:hover {
    color: var(--text-main);
    background: rgba(255, 255, 255, 0.055);
  }

  body[data-propig-design='codeit'] & {
    border-color: ${({ $active }) => ($active ? 'transparent' : 'transparent')};
    background: ${({ $active }) => ($active ? 'var(--codeit-primary)' : 'transparent')};
    color: ${({ $active }) => ($active ? '#ffffff' : 'var(--codeit-muted)')};
    box-shadow: ${({ $active }) => ($active ? '0 8px 18px rgba(52, 81, 209, 0.18)' : 'none')};
  }

  body[data-propig-design='codeit'] &:hover {
    color: ${({ $active }) => ($active ? '#ffffff' : 'var(--codeit-text)')};
    background: ${({ $active }) => ($active ? 'var(--codeit-primary-hover)' : 'var(--codeit-primary-soft)')};
  }

  @media (max-width: 720px) {
    height: 34px;
    padding: 0 10px;
  }
`;

const ManageButton = styled(ModeButton)`
  border-color: ${({ $active }) => ($active ? 'rgba(96, 165, 250, 0.46)' : 'var(--border-subtle)')};
  background: ${({ $active }) => ($active ? 'rgba(96, 165, 250, 0.16)' : 'rgba(255, 255, 255, 0.035)')};
  color: ${({ $active }) => ($active ? '#bfdbfe' : 'var(--text-muted)')};
`;

const MemoManagementPanel = styled.section`
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: minmax(180px, 0.82fr) minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  padding: 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);

  body[data-propig-design='codeit'] & {
    background: rgba(255, 255, 255, 0.92);
    border-color: var(--codeit-border);
    box-shadow: 0 18px 44px rgba(30, 41, 59, 0.08);
  }

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const ManagementCopy = styled.div`
  display: grid;
  gap: 4px;

  strong {
    color: var(--text-main);
    font-size: 0.86rem;
    font-weight: 900;
  }

  span {
    color: var(--text-muted);
    font-size: 0.76rem;
    line-height: 1.45;
  }
`;

const DefaultModeGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
`;

const DefaultModeButton = styled.button<{ $active?: boolean }>`
  min-width: 0;
  min-height: 42px;
  border: 1px solid ${({ $active }) => ($active ? 'rgba(16, 185, 129, 0.5)' : 'var(--border-subtle)')};
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: ${({ $active }) => ($active ? 'rgba(16, 185, 129, 0.16)' : 'rgba(255, 255, 255, 0.035)')};
  color: ${({ $active }) => ($active ? 'var(--primary-light)' : 'var(--text-muted)')};
  font-size: 0.82rem;
  font-weight: 900;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;

  &:hover {
    color: var(--text-main);
    border-color: rgba(16, 185, 129, 0.38);
    background: rgba(255, 255, 255, 0.055);
  }

  body[data-propig-design='codeit'] & {
    border-color: ${({ $active }) => ($active ? 'var(--codeit-primary-border)' : 'var(--codeit-border)')};
    background: ${({ $active }) => ($active ? 'var(--codeit-primary-soft)' : '#ffffff')};
    color: ${({ $active }) => ($active ? 'var(--codeit-primary)' : 'var(--codeit-muted)')};
  }

  body[data-propig-design='codeit'] &:hover {
    color: var(--codeit-text);
    border-color: var(--codeit-primary-border);
    background: var(--codeit-primary-soft);
  }
`;

const MemoModeBody = styled.div`
  flex: 1;
  min-height: 0;
`;
