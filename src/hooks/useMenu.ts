'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { MenuItem, Role, Position, SiteDataType } from '@/types/menu';
import { menuService } from '@/services/menuService';
import type { ManagedUserMenuAccess, ManagedUserPermissions } from '@/types/userAccess';
import { filterMenuItemsForAccess } from '@/utils/menuAccess';

interface UseMenuOptions {
  siteId: string;
  userRole: Role;
  position: Position;
  permissions?: ManagedUserPermissions;
  menuAccess?: ManagedUserMenuAccess;
}

interface UseMenuReturn {
  filteredMenu: MenuItem[];
  siteData: SiteDataType;
  isLoading: boolean;
  error: Error | null;
  activePath: string;
  expandedItems: Set<string>;
  toggleExpand: (id: string) => void;
  setExpandAll: (expanded: boolean) => void;
}

export function useMenu({ siteId, userRole, position, permissions, menuAccess }: UseMenuOptions): UseMenuReturn {
  const pathname = usePathname();
  const [siteData, setSiteData] = useState<SiteDataType>(() => menuService.getCachedSites() ?? menuService.getDefaultSites());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Live snapshots received during bootstrap are newer than its one-shot response.
  const liveSites = useRef(new Set<string>());
  useEffect(() => {
    let disposed = false;
    
    const loadData = async () => {
      try {
        const data = await menuService.loadAllSites();
        if (disposed) return;
        setSiteData((prev) => {
          const merged = { ...data };
          liveSites.current.forEach((id) => {
            if (prev[id]) merged[id] = prev[id];
          });
          return merged;
        });
        setError(null);
      } catch (err) {
        if (disposed) return;
        setError(err instanceof Error ? err : new Error('Failed to load menu'));
      } finally {
        if (disposed) return;
        setIsLoading(false);
      }
    };

    void loadData();
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    let disposed = false;

    const unsubscribe = menuService.subscribeToMenuChanges(siteId, (data) => {
      if (disposed) return;
      liveSites.current.add(siteId);
      setSiteData((prev) => ({
        ...prev,
        [siteId]: data,
      }));
      setError(null);
      setIsLoading(false);
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [siteId]);

  const filterMenuByPermissions = useCallback(
    (items: MenuItem[]): MenuItem[] =>
      filterMenuItemsForAccess(items, {
        siteId,
        role: userRole,
        position,
        permissions,
        menuAccess,
      }),
    [menuAccess, permissions, position, siteId, userRole],
  );

  const filteredMenu = useMemo(() => {
    if (!siteData[siteId]) return [];
    
    const menu = siteData[siteId].menu;
    return filterMenuByPermissions(menu);
  }, [siteData, siteId, filterMenuByPermissions]);

  useEffect(() => {
    if (!pathname) return;
    
    const findParentPaths = (items: MenuItem[], targetPath: string, parents: string[] = []): string[] | null => {
      for (const item of items) {
        if (item.sub && Array.isArray(item.sub)) {
          const subItems = item.sub.filter((s) => typeof s !== 'string') as MenuItem[];
          if (item.path === targetPath) {
            return subItems.length > 0 ? [...parents, item.id] : parents;
          }

          const found = findParentPaths(subItems, targetPath, [...parents, item.id]);
          if (found) return found;
        } else if (item.path === targetPath) {
          return parents;
        }
      }
      
      return null;
    };
    
    const parentIds = findParentPaths(filteredMenu, pathname);
    if (parentIds) {
      setExpandedItems((prev) => {
        const hasSameItems = prev.size === parentIds.length && parentIds.every((id) => prev.has(id));
        return hasSameItems ? prev : new Set(parentIds);
      });
    }
  }, [pathname, filteredMenu]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const setExpandAll = useCallback((expanded: boolean) => {
    if (expanded) {
      const allIds = new Set<string>();
      const collectIds = (items: MenuItem[]) => {
        items.forEach((item) => {
          if (item.sub) {
            allIds.add(item.id);
            const subItems = item.sub.filter((s) => typeof s !== 'string') as MenuItem[];
            collectIds(subItems);
          }
        });
      };
      collectIds(filteredMenu);
      setExpandedItems(allIds);
    } else {
      setExpandedItems(new Set());
    }
  }, [filteredMenu]);

  return {
    filteredMenu,
    siteData,
    isLoading,
    error,
    activePath: pathname || '',
    expandedItems,
    toggleExpand,
    setExpandAll,
  };
}
