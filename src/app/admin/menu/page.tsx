'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MenuItem, SiteDataType, SiteId } from '@/types/menu';
import { menuService } from '@/services/menuService';
import { MenuToolbox } from '@/components/admin/menu/MenuToolbox';
import { MenuCanvas } from '@/components/admin/menu/MenuCanvas';
import { MenuInspector } from '@/components/admin/menu/MenuInspector';
import {
  addMenuItemToParent,
  collectMenuParentOptions,
  moveMenuItem,
  type MenuMoveDirection,
} from '@/components/admin/menu/menuTreeUtils';
import { useMenuContext } from '@/contexts/MenuContext';
import { MENU_SITES_QUERY_KEY } from '@/hooks/useMenuSitesQuery';
import { ACCOUNT_MENU_SITE_ID, getSwitchableSiteIds, isAccountMenuSite } from '@/constants/accountMenu';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentUserAccess } from '@/hooks/useCurrentUserAccess';

type WorkspacePanel = 'tools' | 'menu' | 'details';
type SaveMode = 'manual' | 'auto';

interface SiteModeIconOption {
  icon: string;
  label: string;
}

const SITE_MODE_ICON_OPTIONS: SiteModeIconOption[] = [
  { icon: 'globe', label: '전체' },
  { icon: 'shield-halved', label: '관리' },
  { icon: 'building', label: '기업' },
  { icon: 'bullseye', label: '자기관리' },
  { icon: 'briefcase', label: '업무' },
  { icon: 'chart-line', label: '성장' },
  { icon: 'users', label: '팀' },
  { icon: 'user-tie', label: '임원' },
  { icon: 'house', label: '홈' },
  { icon: 'images', label: '사진' },
  { icon: 'bookmark', label: '북마크' },
  { icon: 'circle-play', label: '영상' },
  { icon: 'bullseye', label: '목표' },
  { icon: 'wand-magic-sparkles', label: 'AI' },
  { icon: 'calculator', label: '세무' },
  { icon: 'key', label: '설정' },
  { icon: 'gear', label: '시스템' },
  { icon: 'bars', label: '메뉴' },
];

const WORKSPACE_TABS: Array<{ id: WorkspacePanel; label: string; icon: string }> = [
  { id: 'tools', label: '도구', icon: 'toolbox' },
  { id: 'menu', label: '메뉴', icon: 'list' },
  { id: 'details', label: '상세', icon: 'sliders' },
];

function isWorkspacePanel(value: string | null): value is WorkspacePanel {
  return value === 'tools' || value === 'menu' || value === 'details';
}

function normalizeSiteId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');
}

function isCompactViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;
}

function collectRegisteredPaths(menu: MenuItem[]): string[] {
  const paths = new Set<string>();

  const visit = (items: MenuItem[]) => {
    items.forEach((item) => {
      if (item.path) paths.add(item.path);
      if (!item.sub) return;

      item.sub.forEach((subItem) => {
        if (typeof subItem !== 'string') visit([subItem]);
      });
    });
  };

  visit(menu);
  return Array.from(paths);
}

function formatSavedAt(value: Date | null): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

function SiteModeIconPicker({
  value,
  color,
  onChange,
}: {
  value: string;
  color: string;
  onChange: (icon: string) => void;
}) {
  const selectedIcon = value || 'globe';
  const selectedOption = SITE_MODE_ICON_OPTIONS.find((option) => option.icon === selectedIcon);

  return (
    <div className="site-mode-icon-picker">
      <div
        className="site-mode-icon-preview"
        style={{
          borderColor: `${color}55`,
          background: `${color}18`,
          color,
        }}
        title={`선택한 아이콘: ${selectedIcon}`}
      >
        <i className={`fa-solid fa-${selectedIcon}`} aria-hidden="true" />
        <span>{selectedOption?.label || selectedIcon}</span>
      </div>

      <div role="radiogroup" aria-label="사이트 모드 아이콘 선택" className="site-mode-icon-grid">
        {SITE_MODE_ICON_OPTIONS.map((option) => {
          const isSelected = selectedIcon === option.icon;

          return (
            <button
              key={option.icon}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`${option.label} 아이콘`}
              title={option.label}
              onClick={() => onChange(option.icon)}
              className={isSelected ? 'is-active' : ''}
              style={{
                borderColor: isSelected ? color : 'var(--border-medium)',
                background: isSelected ? `${color}20` : 'var(--bg-card)',
                color: isSelected ? color : 'var(--text-muted)',
              }}
            >
              <i className={`fa-solid fa-${option.icon}`} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function AdvancedMenuManagerPage() {
  const queryClient = useQueryClient();
  const { loginWithGoogle, isConfigured } = useAuth();
  const { currentUser, access, isLoading: isAccessLoading } = useCurrentUserAccess();
  const {
    currentSite: sidebarSite,
  } = useMenuContext();
  const [sitesData, setSitesData] = useState<SiteDataType>({});
  const [currentSite, setCurrentSite] = useState<SiteId>(sidebarSite);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [autoSave, setAutoSave] = useState(true);
  const [workspacePanel, setWorkspacePanel] = useState<WorkspacePanel>('menu');
  const [isSiteModeManagerOpen, setIsSiteModeManagerOpen] = useState(false);
  const [siteDraft, setSiteDraft] = useState({ id: '', name: '', icon: 'globe', color: '#3b82f6' });
  const [siteCreateDraft, setSiteCreateDraft] = useState({ id: '', name: '', icon: 'globe', color: '#3b82f6' });

  const menuSitesQuery = useQuery({
    queryKey: MENU_SITES_QUERY_KEY,
    queryFn: () => menuService.loadAllSites(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const saveMutation = useMutation({
    mutationFn: async (nextSitesData: SiteDataType) => {
      await menuService.saveAllSites(nextSitesData);
    },
    onSuccess: (_, nextSitesData) => {
      queryClient.setQueryData(MENU_SITES_QUERY_KEY, nextSitesData);
    },
    onError: (error) => {
      console.error('Save failed:', error);
    },
  });

  const persistSitesData = useCallback(
    async (nextSitesData: SiteDataType) => {
      await saveMutation.mutateAsync(nextSitesData);
    },
    [saveMutation],
  );

  const currentMenu = useMemo(() => sitesData[currentSite]?.menu || [], [currentSite, sitesData]);
  const currentSiteData = sitesData[currentSite];
  const currentSiteColor = currentSiteData?.color || '#3b82f6';
  const isAccountMenuTarget = isAccountMenuSite(currentSite);
  const registeredPaths = useMemo(() => collectRegisteredPaths(currentMenu), [currentMenu]);
  const isSaving = saveMutation.isPending;
  const isLoading = menuSitesQuery.isLoading && Object.keys(sitesData).length === 0;
  const menuParentOptions = useMemo(() => collectMenuParentOptions(currentMenu), [currentMenu]);

  const saveStatus = useMemo(() => {
    if (saveError) return saveError;
    if (isSaving) return '저장 중…';
    if (saveMessage) return saveMessage;
    if (hasUnsavedChanges) return autoSave ? '자동 저장 대기 중' : '저장 필요';
    if (lastSavedAt) return `저장됨 ${formatSavedAt(lastSavedAt)}`;
    return '변경 없음';
  }, [autoSave, hasUnsavedChanges, isSaving, lastSavedAt, saveError, saveMessage]);

  const markDirty = useCallback(() => {
    setHasUnsavedChanges(true);
    setSaveError('');
    setSaveMessage('');
  }, []);

  const runSave = useCallback(
    async (nextSitesData: SiteDataType, mode: SaveMode) => {
      setSaveError('');
      setSaveMessage(mode === 'auto' ? '자동 저장 중…' : '저장 중…');

      try {
        await persistSitesData(nextSitesData);
        setLastSavedAt(new Date());
        setHasUnsavedChanges(false);
        setSaveMessage(mode === 'auto' ? '자동 저장됨' : '저장됨');
        window.setTimeout(() => setSaveMessage(''), 1800);
      } catch (error) {
        setSaveError('저장 실패. 다시 시도해 주세요.');
        console.error('Save failed:', error);
      }
    },
    [persistSitesData],
  );

  useEffect(() => {
    if (!menuSitesQuery.data) return;
    queueMicrotask(() => {
      setSitesData(menuSitesQuery.data);
      setHasUnsavedChanges(false);
      setSaveError('');
      setSaveMessage('');
    });
  }, [menuSitesQuery.data]);

  useEffect(() => {
    if (!sitesData[currentSite]) {
      const firstSiteId = getSwitchableSiteIds(sitesData)[0] ?? Object.keys(sitesData)[0];
      if (firstSiteId) {
        queueMicrotask(() => setCurrentSite(firstSiteId));
      }
      return;
    }

    const current = sitesData[currentSite];
    queueMicrotask(() => {
      setSiteDraft({
        id: currentSite,
        name: current.name,
        icon: current.icon || 'globe',
        color: current.color || '#3b82f6',
      });
    });
  }, [currentSite, sitesData]);

  useEffect(() => {
    if (!menuSitesQuery.error) return;
    console.error('Failed to load menu data:', menuSitesQuery.error);
  }, [menuSitesQuery.error]);

  useEffect(() => {
    const openRequestedPanel = () => {
      const requestedPanel = window.sessionStorage.getItem('admin_menu_requested_panel');
      const requestedSite = window.sessionStorage.getItem('admin_menu_requested_site');

      if (isWorkspacePanel(requestedPanel)) {
        setWorkspacePanel(requestedPanel);
        window.sessionStorage.removeItem('admin_menu_requested_panel');
      }

      if (requestedSite && sitesData[requestedSite]) {
        setCurrentSite(requestedSite);
        setSelectedItem(null);
        window.sessionStorage.removeItem('admin_menu_requested_site');
      }
    };

    openRequestedPanel();
    window.addEventListener('admin-menu-open-panel', openRequestedPanel);
    return () => window.removeEventListener('admin-menu-open-panel', openRequestedPanel);
  }, [sitesData]);

  useEffect(() => {
    if (!autoSave || !hasUnsavedChanges) return;
    if (Object.keys(sitesData).length === 0) return;

    const timeoutId = window.setTimeout(() => {
      void runSave(sitesData, 'auto');
    }, 1200);

    return () => window.clearTimeout(timeoutId);
  }, [autoSave, hasUnsavedChanges, runSave, sitesData]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!selectedItem) return;

    const selectedItemId = selectedItem.id;
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;
      const currentSelectedItem = menuService.findMenuItem(currentMenu, selectedItemId);

      setSelectedItem((prev) => {
        if (!prev || prev.id !== selectedItemId) return prev;
        if (!currentSelectedItem) return null;
        return currentSelectedItem === prev ? prev : currentSelectedItem;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [currentMenu, selectedItem]);

  const handleUpdateMenu = useCallback(
    (newMenu: MenuItem[]) => {
      setSitesData((prev) => {
        const site = prev[currentSite];
        if (!site) return prev;
        return {
          ...prev,
          [currentSite]: {
            ...site,
            menu: newMenu,
          },
        };
      });
      markDirty();
    },
    [currentSite, markDirty],
  );

  const handleToggle = useCallback(
    (id: string) => {
      setSitesData((prev) => {
        const site = prev[currentSite];
        if (!site) return prev;

        const toggleInMenu = (items: MenuItem[]): MenuItem[] => {
          return items.map((item) => {
            if (item.id === id) {
              return { ...item, expanded: !item.expanded };
            }
            if (item.sub) {
              return {
                ...item,
                sub: item.sub.map((subItem) =>
                  typeof subItem === 'string' ? subItem : toggleInMenu([subItem])[0],
                ),
              };
            }
            return item;
          });
        };

        return {
          ...prev,
          [currentSite]: {
            ...site,
            menu: toggleInMenu(site.menu),
          },
        };
      });
      markDirty();
    },
    [currentSite, markDirty],
  );

  const handleAddItem = useCallback(
    (item: MenuItem, parentId?: string) => {
      setSitesData((prev) => {
        const site = prev[currentSite];
        if (!site) return prev;
        return {
          ...prev,
          [currentSite]: {
            ...site,
            menu: addMenuItemToParent(site.menu, item, parentId),
          },
        };
      });
      setSelectedItem(item);
      markDirty();
      setWorkspacePanel(isCompactViewport() && !item.path ? 'details' : 'menu');
    },
    [currentSite, markDirty],
  );

  const handleMoveItem = useCallback(
    (id: string, direction: MenuMoveDirection) => {
      setSitesData((prev) => {
        const site = prev[currentSite];
        if (!site) return prev;

        const result = moveMenuItem(site.menu, id, direction);
        if (!result.changed) return prev;

        return {
          ...prev,
          [currentSite]: {
            ...site,
            menu: result.items,
          },
        };
      });
      markDirty();
    },
    [currentSite, markDirty],
  );

  const handleAddChild = useCallback(
    (parentId: string) => {
      const parentItem = menuService.findMenuItem(currentMenu, parentId);
      const childItem: MenuItem = {
        id: menuService.generateId(),
        text: '새 하위 메뉴',
        type: 'link',
        icon: 'link',
        roles: parentItem?.roles ?? [],
      };

      handleAddItem(childItem, parentId);
    },
    [currentMenu, handleAddItem],
  );

  const handleSelectItem = useCallback((item: MenuItem) => {
    setSelectedItem(item);
    if (isCompactViewport()) setWorkspacePanel('details');
  }, []);

  const handleUpdateItem = useCallback(
    (updatedItem: MenuItem) => {
      setSitesData((prev) => {
        const site = prev[currentSite];
        if (!site) return prev;

        const updateInMenu = (items: MenuItem[]): MenuItem[] => {
          return items.map((item) => {
            if (item.id === updatedItem.id) {
              return updatedItem;
            }
            if (item.sub) {
              return {
                ...item,
                sub: item.sub.map((subItem) =>
                  typeof subItem === 'string' ? subItem : updateInMenu([subItem])[0],
                ),
              };
            }
            return item;
          });
        };

        return {
          ...prev,
          [currentSite]: {
            ...site,
            menu: updateInMenu(site.menu),
          },
        };
      });
      setSelectedItem(updatedItem);
      markDirty();
    },
    [currentSite, markDirty],
  );

  const handleDeleteById = useCallback(
    (id: string) => {
      const itemToDelete = menuService.findMenuItem(currentMenu, id);
      if (!itemToDelete) return;

      const confirmed = window.confirm(`'${itemToDelete.text || '선택한 메뉴'}' 메뉴를 삭제할까요? 삭제된 항목은 휴지통으로 이동합니다.`);
      if (!confirmed) return;

      setSitesData((prev) => {
        const site = prev[currentSite];
        if (!site) return prev;

        return {
          ...prev,
          [currentSite]: {
            ...site,
            menu: menuService.removeMenuItem(site.menu, id),
            trash: [...site.trash, itemToDelete],
          },
        };
      });

      if (selectedItem?.id === id) {
        setSelectedItem(null);
        setWorkspacePanel('menu');
      }
      markDirty();
    },
    [currentMenu, currentSite, markDirty, selectedItem],
  );

  const handleDeleteItem = useCallback(() => {
    if (!selectedItem) return;
    handleDeleteById(selectedItem.id);
  }, [selectedItem, handleDeleteById]);

  const handleSave = async () => {
    await runSave(sitesData, 'manual');
  };

  const handleUpdateCurrentSite = useCallback(() => {
    const trimmedName = siteDraft.name.trim();
    if (!trimmedName) {
      setSaveError('사이트 모드 이름을 입력해 주세요.');
      return;
    }

    setSitesData((prev) => {
      const current = prev[currentSite];
      if (!current) return prev;
      return {
        ...prev,
        [currentSite]: {
          ...current,
          name: trimmedName,
          icon: siteDraft.icon.trim() || 'globe',
          color: siteDraft.color.trim() || '#3b82f6',
        },
      };
    });

    markDirty();
    setSaveMessage('사이트 모드 정보가 반영됨');
  }, [currentSite, markDirty, siteDraft.color, siteDraft.icon, siteDraft.name]);

  const handleCreateSite = useCallback(() => {
    const normalizedId = normalizeSiteId(siteCreateDraft.id || siteCreateDraft.name);
    const trimmedName = siteCreateDraft.name.trim();

    if (!normalizedId) {
      setSaveError('사이트 모드 ID 또는 이름을 입력해 주세요.');
      return;
    }

    if (!trimmedName) {
      setSaveError('사이트 모드 이름을 입력해 주세요.');
      return;
    }

    if (sitesData[normalizedId]) {
      setSaveError('이미 존재하는 사이트 모드 ID입니다.');
      return;
    }

    if (normalizedId === ACCOUNT_MENU_SITE_ID) {
      setSaveError('예약된 메뉴 ID는 새 사이트 모드로 사용할 수 없습니다.');
      return;
    }

    setSitesData((prev) => ({
      ...prev,
      [normalizedId]: {
        name: trimmedName,
        icon: siteCreateDraft.icon.trim() || 'globe',
        color: siteCreateDraft.color.trim() || '#3b82f6',
        positions: ['ceo', 'manager', 'staff'],
        menu: [],
        trash: [],
      },
    }));

    setCurrentSite(normalizedId);
    setSiteCreateDraft({ id: '', name: '', icon: 'globe', color: '#3b82f6' });
    markDirty();
    setSaveMessage('사이트 모드가 추가됨');
  }, [markDirty, siteCreateDraft.color, siteCreateDraft.icon, siteCreateDraft.id, siteCreateDraft.name, sitesData]);

  const handleDeleteCurrentSite = useCallback(() => {
    if (isAccountMenuSite(currentSite)) {
      setSaveError('우측 메뉴는 삭제할 수 없습니다.');
      return;
    }

    const entries = getSwitchableSiteIds(sitesData);
    if (entries.length <= 1) {
      setSaveError('최소 1개의 사이트 모드는 유지해야 합니다.');
      return;
    }

    const targetName = sitesData[currentSite]?.name || currentSite;
    const confirmed = window.confirm(`'${targetName}' 사이트 모드를 삭제할까요? 이 모드의 메뉴와 휴지통도 함께 삭제됩니다.`);
    if (!confirmed) return;

    const nextEntries = entries.filter((siteId) => siteId !== currentSite);
    const nextSiteId = nextEntries[0];
    if (!nextSiteId) return;

    setSitesData((prev) => {
      const next = { ...prev };
      delete next[currentSite];
      return next;
    });

    setSelectedItem(null);
    setCurrentSite(nextSiteId);
    markDirty();
    setSaveMessage('사이트 모드가 삭제됨');
  }, [currentSite, markDirty, sitesData]);

  if (!currentUser && !isAccessLoading) {
    return (
      <div className="admin-menu-loading" role="status" aria-live="polite">
        <i className="fa fa-user-shield" aria-hidden="true" />
        <span>메뉴 관리를 위해 로그인이 필요합니다.</span>
        <button type="button" onClick={() => void loginWithGoogle()} disabled={!isConfigured}>
          Google로 로그인
        </button>
      </div>
    );
  }

  if (isAccessLoading) {
    return (
      <div className="admin-menu-loading" role="status" aria-live="polite">
        <i className="fa fa-spinner fa-spin" aria-hidden="true" />
        <span>메뉴 관리 권한을 확인하는 중입니다.</span>
      </div>
    );
  }

  if (access.role !== 'admin' && !access.permissions.menuManagement) {
    return (
      <div className="admin-menu-loading" role="status" aria-live="polite">
        <i className="fa fa-lock" aria-hidden="true" />
        <span>통합 메뉴 관리 권한이 없습니다.</span>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="admin-menu-loading" role="status" aria-live="polite">
        <i className="fa fa-spinner fa-spin" aria-hidden="true" />
        <span>메뉴 데이터를 불러오는 중…</span>
      </div>
    );
  }

  return (
    <div className="admin-menu-page content-section">
      <div className="admin-menu-topbar">
        <div className="admin-menu-sites" role="tablist" aria-label="사이트 모드">
          {Object.entries(sitesData).map(([siteId, site]) => {
            if (!site) return null;

            const isActive = currentSite === siteId;
            const siteColor = site.color || '#3b82f6';

            return (
              <button
                key={siteId}
                type="button"
                onClick={() => {
                  setCurrentSite(siteId);
                  setSelectedItem(null);
                  setWorkspacePanel('menu');
                }}
                className={`admin-menu-site-tab ${isActive ? 'is-active' : ''}`}
                role="tab"
                aria-selected={isActive}
                style={{
                  '--site-color': siteColor,
                } as React.CSSProperties}
              >
                <i className={`fa-solid fa-${site.icon || 'globe'}`} aria-hidden="true" />
                <span>{site.name}</span>
              </button>
            );
          })}
        </div>

        <div className="admin-menu-actions">
          <button
            type="button"
            onClick={() => setIsSiteModeManagerOpen((isOpen) => !isOpen)}
            className={`admin-menu-outline-btn ${isSiteModeManagerOpen ? 'is-active' : ''}`}
            aria-expanded={isSiteModeManagerOpen}
          >
            <i className={`fa-solid ${isSiteModeManagerOpen ? 'fa-xmark' : 'fa-pen-to-square'}`} aria-hidden="true" />
            <span>{isSiteModeManagerOpen ? '사이트모드 닫기' : '사이트모드 관리'}</span>
          </button>

          <label className="admin-menu-autosave">
            <input
              type="checkbox"
              name="autoSave"
              checked={autoSave}
              onChange={(event) => setAutoSave(event.target.checked)}
            />
            <span>자동 저장</span>
          </label>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="admin-menu-save-btn"
          >
            <i className={`fa ${isSaving ? 'fa-spinner fa-spin' : 'fa-save'}`} aria-hidden="true" />
            <span>{isSaving ? '저장 중…' : '저장'}</span>
          </button>

          <span className={`admin-menu-save-status ${saveError ? 'is-error' : hasUnsavedChanges ? 'is-dirty' : ''}`} aria-live="polite">
            {saveStatus}
          </span>
        </div>
      </div>

      {isSiteModeManagerOpen ? (
        <div className="site-mode-manager">
          <section className="site-mode-card">
            <div className="site-mode-summary">
              <span
                className="site-mode-avatar"
                style={{
                  borderColor: `${currentSiteColor}55`,
                  background: `${currentSiteColor}20`,
                  color: currentSiteColor,
                }}
                aria-hidden="true"
              >
                <i className={`fa-solid fa-${currentSiteData?.icon || 'globe'}`} />
              </span>
              <div>
                <h2>{currentSiteData?.name || currentSite}</h2>
                <p>ID: <code translate="no">{currentSite}</code></p>
              </div>
            </div>
            <p className="site-mode-copy">
              상단 사이트 모드를 선택하면 같은 편집 화면에서 다른 메뉴 세트를 관리할 수 있습니다.
            </p>
            <button
              type="button"
              className="admin-menu-danger full"
              onClick={handleDeleteCurrentSite}
              disabled={isAccountMenuTarget}
            >
              <i className="fa-solid fa-trash" aria-hidden="true" />
              <span>{isAccountMenuTarget ? '우측 메뉴는 삭제 불가' : '선택 사이트모드 삭제'}</span>
            </button>
          </section>

          <section className="site-mode-card">
            <h2>선택 사이트모드 수정</h2>
            <label className="admin-menu-field">
              <span>이름</span>
              <input
                name="siteModeName"
                value={siteDraft.name}
                onChange={(event) => setSiteDraft((prev) => ({ ...prev, name: event.target.value }))}
                autoComplete="off"
                placeholder="예: 통합 관리…"
              />
            </label>
            <SiteModeIconPicker
              value={siteDraft.icon}
              color={siteDraft.color}
              onChange={(icon) => setSiteDraft((prev) => ({ ...prev, icon }))}
            />
            <label className="site-mode-color">
              <span>대표 색상</span>
              <input
                type="color"
                name="siteModeColor"
                value={siteDraft.color}
                onChange={(event) => setSiteDraft((prev) => ({ ...prev, color: event.target.value }))}
              />
            </label>
            <button type="button" className="admin-menu-save-btn full" onClick={handleUpdateCurrentSite}>
              <i className="fa-solid fa-check" aria-hidden="true" />
              <span>변경 적용</span>
            </button>
          </section>

          <section className="site-mode-card">
            <h2>새 사이트모드 추가</h2>
            <div className="site-mode-two-fields">
              <label className="admin-menu-field">
                <span>ID</span>
                <input
                  name="newSiteModeId"
                  value={siteCreateDraft.id}
                  onChange={(event) => setSiteCreateDraft((prev) => ({ ...prev, id: event.target.value }))}
                  autoComplete="off"
                  placeholder="marketing…"
                />
              </label>
              <label className="admin-menu-field">
                <span>이름</span>
                <input
                  name="newSiteModeName"
                  value={siteCreateDraft.name}
                  onChange={(event) => setSiteCreateDraft((prev) => ({ ...prev, name: event.target.value }))}
                  autoComplete="off"
                  placeholder="마케팅…"
                />
              </label>
            </div>
            <SiteModeIconPicker
              value={siteCreateDraft.icon}
              color={siteCreateDraft.color}
              onChange={(icon) => setSiteCreateDraft((prev) => ({ ...prev, icon }))}
            />
            <label className="site-mode-color">
              <span>대표 색상</span>
              <input
                type="color"
                name="newSiteModeColor"
                value={siteCreateDraft.color}
                onChange={(event) => setSiteCreateDraft((prev) => ({ ...prev, color: event.target.value }))}
              />
            </label>
            <button type="button" className="admin-menu-save-btn full" onClick={handleCreateSite}>
              <i className="fa-solid fa-plus" aria-hidden="true" />
              <span>사이트모드 추가</span>
            </button>
          </section>
        </div>
      ) : null}

      <div className="admin-menu-mobile-tabs" role="tablist" aria-label="작업 영역">
        {WORKSPACE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={workspacePanel === tab.id}
            className={workspacePanel === tab.id ? 'is-active' : ''}
            onClick={() => setWorkspacePanel(tab.id)}
          >
            <i className={`fa fa-${tab.icon}`} aria-hidden="true" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="admin-menu-shell">
        <MenuToolbox
          className={workspacePanel === 'tools' ? 'is-active' : ''}
          onAddItem={handleAddItem}
          registeredPaths={registeredPaths}
          parentOptions={menuParentOptions}
        />

        <MenuCanvas
          className={workspacePanel === 'menu' ? 'is-active' : ''}
          menu={currentMenu}
          selectedItem={selectedItem}
          onSelect={handleSelectItem}
          onReorder={handleUpdateMenu}
          onToggle={handleToggle}
          onMoveItem={handleMoveItem}
          onAddChild={handleAddChild}
          onDelete={handleDeleteById}
        />

        <MenuInspector
          className={workspacePanel === 'details' ? 'is-active' : ''}
          selectedItem={selectedItem}
          onUpdate={handleUpdateItem}
          onDelete={handleDeleteItem}
        />
      </div>
    </div>
  );
}
