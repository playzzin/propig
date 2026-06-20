'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconName } from '@fortawesome/fontawesome-svg-core';
import { DndContext } from '@dnd-kit/core';
import { MenuItem, SiteDataType, SiteId, EditHistory } from '@/types/menu';
import { menuService } from '@/services/menuService';
import { Toolbox } from '@/components/admin/menu/Toolbox';
import { Canvas } from '@/components/admin/menu/Canvas';
import { Inspector } from '@/components/admin/menu/Inspector';

const MAX_HISTORY = 50;

export default function AdvancedMenuManager() {
  const [sitesData, setSitesData] = useState<SiteDataType>({});
  const [currentSite, setCurrentSite] = useState<SiteId>('admin');
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [history, setHistory] = useState<EditHistory[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [autoSave, setAutoSave] = useState(true);

  const addToHistory = useCallback((state: SiteDataType) => {
    setHistory((prev) => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push({ state: JSON.parse(JSON.stringify(state)), timestamp: Date.now() });
      return newHistory.slice(-MAX_HISTORY);
    });
    setHistoryIndex((prev) => Math.min(prev + 1, MAX_HISTORY - 1));
  }, [historyIndex]);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const data = await menuService.loadAllSites();
        if (cancelled) return;
        setSitesData(data);
        addToHistory(data);
      } catch (error) {
        console.error('Failed to load menu data:', error);
      }
    };

    void loadData();

    return () => {
      cancelled = true;
    };
    // Initial load should run once; addToHistory mutates historyIndex and would retrigger the load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setSitesData(JSON.parse(JSON.stringify(history[newIndex].state)));
    }
  }, [historyIndex, history]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setSitesData(JSON.parse(JSON.stringify(history[newIndex].state)));
    }
  }, [historyIndex, history]);

  const handleReorder = useCallback((items: MenuItem[]) => {
    setSitesData((prev) => {
      const result = {
        ...prev,
        [currentSite]: {
          ...prev[currentSite],
          menu: items,
        },
      };
      addToHistory(result);
      return result;
    });
  }, [currentSite, addToHistory]);

  const handleToggle = useCallback((id: string) => {
    setSitesData((prev) => {
      const toggleInMenu = (items: MenuItem[]): MenuItem[] => {
        return items.map((item) => {
          if (item.id === id) {
            return { ...item, expanded: !item.expanded };
          }
          if (item.sub) {
            return {
              ...item,
              sub: item.sub.map((subItem) =>
                typeof subItem === 'string' ? subItem : toggleInMenu([subItem])[0]
              ),
            };
          }
          return item;
        });
      };

      return {
        ...prev,
        [currentSite]: {
          ...prev[currentSite],
          menu: toggleInMenu(prev[currentSite].menu),
        },
      };
    });
  }, [currentSite]);

  const handleAddItem = useCallback((item: MenuItem, parentId?: string) => {
    setSitesData((prev) => {
      const newMenu = [...prev[currentSite].menu];

      if (!parentId) {
        newMenu.push(item);
      } else {
        const addToParent = (items: MenuItem[]): MenuItem[] => {
          return items.map((menuItem) => {
            if (menuItem.id === parentId) {
              return {
                ...menuItem,
                sub: [...(menuItem.sub || []), item],
              };
            }
            if (menuItem.sub) {
              return {
                ...menuItem,
                sub: menuItem.sub.map((subItem) =>
                  typeof subItem === 'string' ? subItem : addToParent([subItem])[0]
                ),
              };
            }
            return menuItem;
          });
        };
        const updated = addToParent(newMenu);
        const result = {
          ...prev,
          [currentSite]: {
            ...prev[currentSite],
            menu: updated,
          },
        };
        addToHistory(result);
        return result;
      }

      const result = {
        ...prev,
        [currentSite]: {
          ...prev[currentSite],
          menu: newMenu,
        },
      };
      addToHistory(result);
      return result;
    });
  }, [currentSite, addToHistory]);

  const handleUpdateItem = useCallback((updatedItem: MenuItem) => {
    setSitesData((prev) => {
      const updateInMenu = (items: MenuItem[]): MenuItem[] => {
        return items.map((item) => {
          if (item.id === updatedItem.id) {
            return updatedItem;
          }
          if (item.sub) {
            return {
              ...item,
              sub: item.sub.map((subItem) =>
                typeof subItem === 'string' ? subItem : updateInMenu([subItem])[0]
              ),
            };
          }
          return item;
        });
      };

      const result = {
        ...prev,
        [currentSite]: {
          ...prev[currentSite],
          menu: updateInMenu(prev[currentSite].menu),
        },
      };

      return result;
    });
    setSelectedItem(updatedItem);
  }, [currentSite]);

  const handleDeleteById = useCallback((id: string) => {
    const itemToDelete = menuService.findMenuItem(sitesData[currentSite].menu, id);
    if (!itemToDelete) return;

    setSitesData((prev) => {
      const newMenu = menuService.removeMenuItem(prev[currentSite].menu, id);
      const result = {
        ...prev,
        [currentSite]: {
          ...prev[currentSite],
          menu: newMenu,
          trash: [...prev[currentSite].trash, itemToDelete],
        },
      };
      addToHistory(result);
      return result;
    });

    if (selectedItem?.id === id) {
      setSelectedItem(null);
    }
  }, [currentSite, sitesData, addToHistory, selectedItem]);

  const handleDeleteItem = useCallback(() => {
    if (!selectedItem) return;
    handleDeleteById(selectedItem.id);
  }, [selectedItem, handleDeleteById]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveMessage('');

    try {
      await menuService.saveAllSites(sitesData);
      setSaveMessage('저장 완료!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      setSaveMessage('저장 실패');
      console.error('Save failed:', error);
    } finally {
      setIsSaving(false);
    }
  }, [sitesData]);

  useEffect(() => {
    if (autoSave && sitesData && Object.keys(sitesData).length > 0) {
      const timeoutId = setTimeout(() => {
        void handleSave();
      }, 1000);

      return () => clearTimeout(timeoutId);
    }
  }, [sitesData, autoSave, handleSave]);

  const handleCreateItem = useCallback((type: 'folder' | 'link' | 'divider') => {
    const newItem: MenuItem = {
      id: menuService.generateId(),
      text: type === 'divider' ? '구분선' : '새 메뉴',
      type,
      icon: type === 'folder' ? 'folder' : type === 'link' ? 'link' : undefined,
      roles: ['admin'],
      sub: type === 'folder' ? [] : undefined,
    };
    handleAddItem(newItem);
  }, [handleAddItem]);

  const currentMenu = sitesData[currentSite]?.menu || [];
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const siteColors: Record<SiteId, string> = {
    admin: '#10b981',
    corp: '#6366f1',
    shop: '#22c55e',
  };

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-base)' }}>
      <header className="relative border-b" style={{
        backgroundColor: 'var(--bg-elevated)',
        borderColor: 'var(--border-medium)',
        height: 'var(--header-h)'
      }}>
        <div className="absolute inset-0 opacity-5" style={{
          background: `linear-gradient(135deg, ${siteColors[currentSite]}, transparent)`
        }} />

        <div className="relative h-full px-6 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center shadow-lg transition-transform hover:scale-105"
                style={{
                  background: `linear-gradient(135deg, ${siteColors[currentSite]}, ${siteColors[currentSite]}dd)`,
                  boxShadow: `0 4px 12px ${siteColors[currentSite]}40`
                }}
              >
                <FontAwesomeIcon icon={['fas', 'bars']} className="text-white text-lg" />
              </div>
              <div>
                <h1 className="text-xl font-bold" style={{ color: 'var(--text-bright)' }}>
                  통합 메뉴 관리 시스템
                </h1>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Advanced Menu Manager
                </p>
              </div>
            </div>

            <div className="flex gap-2 ml-4">
              {(['admin', 'corp', 'shop'] as SiteId[]).map((siteId) => {
                const site = sitesData[siteId];
                if (!site) return null;

                const isActive = currentSite === siteId;

                return (
                  <button
                    key={siteId}
                    onClick={() => setCurrentSite(siteId)}
                    className="relative flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all"
                    style={{
                      backgroundColor: isActive ? 'var(--bg-card)' : 'transparent',
                      color: isActive ? siteColors[siteId] : 'var(--text-muted)',
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      borderColor: isActive ? `${siteColors[siteId]}40` : 'transparent',
                    }}
                  >
                    <FontAwesomeIcon icon={['fas', site.icon as IconName]} />
                    <span className="text-sm">{site.name}</span>
                    {isActive && (
                      <div
                        className="absolute -bottom-px left-0 right-0 h-0.5 rounded-full"
                        style={{ backgroundColor: siteColors[siteId] }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg border" style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border-medium)',
            }}>
              <input 
                type="checkbox" 
                checked={autoSave}
                onChange={(e) => setAutoSave(e.target.checked)}
                className="w-4 h-4 rounded"
                style={{ accentColor: 'var(--primary)' }}
              />
              <span className="text-sm font-medium" style={{ color: 'var(--text-main)' }}>
                자동 저장
              </span>
            </label>

            <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: 'var(--bg-card)' }}>
              <button
                onClick={undo}
                disabled={!canUndo}
                className="p-2 rounded-md transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105"
                style={{
                  backgroundColor: canUndo ? 'var(--bg-elevated)' : 'transparent',
                  color: 'var(--text-main)'
                }}
                title="실행 취소 (Ctrl+Z)"
              >
                <FontAwesomeIcon icon={['fas', 'undo']} className="w-4 h-4" />
              </button>
              <button
                onClick={redo}
                disabled={!canRedo}
                className="p-2 rounded-md transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105"
                style={{
                  backgroundColor: canRedo ? 'var(--bg-elevated)' : 'transparent',
                  color: 'var(--text-main)'
                }}
                title="다시 실행 (Ctrl+Y)"
              >
                <FontAwesomeIcon icon={['fas', 'redo']} className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2 rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 shadow-lg"
              style={{
                background: `linear-gradient(135deg, var(--primary), var(--primary-dark))`,
                color: 'var(--text-bright)',
                boxShadow: '0 4px 12px var(--primary-glow)'
              }}
            >
              <FontAwesomeIcon
                icon={['fas', isSaving ? 'spinner' : 'save']}
                className={isSaving ? 'animate-spin' : ''}
              />
              <span>{isSaving ? '저장 중...' : '저장'}</span>
            </button>

            {saveMessage && (
              <div
                className="px-4 py-2 rounded-lg font-medium text-sm border"
                style={{
                  backgroundColor: saveMessage.includes('실패') ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                  color: saveMessage.includes('실패') ? '#ef4444' : 'var(--primary)',
                  borderColor: saveMessage.includes('실패') ? 'rgba(239, 68, 68, 0.3)' : 'var(--primary-glow)'
                }}
              >
                {saveMessage}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <DndContext>
          <Toolbox onCreateItem={handleCreateItem} />

          <Canvas
            menu={currentMenu}
            selectedItem={selectedItem}
            onSelect={setSelectedItem}
            onReorder={handleReorder}
            onToggle={handleToggle}
            onAddItem={handleAddItem}
            onDelete={handleDeleteById}
          />

          <Inspector
            selectedItem={selectedItem}
            onUpdate={handleUpdateItem}
            onDelete={handleDeleteItem}
          />
        </DndContext>
      </div>
    </div>
  );
}
