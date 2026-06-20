'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { MenuItem, Role, Position, SiteDataType } from '@/types/menu';
import { menuService } from '@/services/menuService';
import type { ManagedUserMenuAccess, ManagedUserPermissions } from '@/types/userAccess';

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

function getMenuAccessKey(siteId: string, item: MenuItem): string {
  return `${siteId}:${item.id}`;
}

export function useMenu({ siteId, userRole, position, permissions, menuAccess }: UseMenuOptions): UseMenuReturn {
  const pathname = usePathname();
  const [siteData, setSiteData] = useState<SiteDataType>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    setIsLoading(true);
    
    const loadData = async () => {
      try {
        const data = await menuService.loadAllSites();
        setSiteData(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load menu'));
      } finally {
        setIsLoading(false);
      }
    };

    loadData();

    const unsubscribe = menuService.subscribeToMenuChanges(siteId, (data) => {
      setSiteData((prev) => ({
        ...prev,
        [siteId]: data,
      }));
    });

    return () => unsubscribe();
  }, [siteId]);

  const filterMenuByPermissions = useCallback((items: MenuItem[]): MenuItem[] => {
    const hasItemAccess = (item: MenuItem): boolean => {
      if (item.hidden) return false;
      if (item.type === 'divider') return true;
      if (userRole === 'admin') return true;

      const requiredPermissions = item.permissions || [];
      if (requiredPermissions.length > 0) {
        return requiredPermissions.some((permission) => permissions?.[permission] === true);
      }

      const explicitMenuAccess = menuAccess?.[getMenuAccessKey(siteId, item)];
      if (explicitMenuAccess === false) return false;
      if (explicitMenuAccess === true) return true;

      const hasRoleAccess =
        !item.roles ||
        item.roles.length === 0 ||
        item.roles.includes(userRole);
      if (!hasRoleAccess) return false;

      const hasPositionAccess =
        !item.position ||
        item.position.length === 0 ||
        item.position.includes(position);
      return hasPositionAccess;
    };

    return items.reduce<MenuItem[]>((acc, item) => {
      if (item.hidden) return acc;

      const filteredSub = item.sub && Array.isArray(item.sub)
        ? item.sub
            .map((subItem) => {
              if (typeof subItem === 'string') return subItem;
              return filterMenuByPermissions([subItem])[0];
            })
            .filter(Boolean)
        : undefined;
      const hasVisibleChildren = Boolean(filteredSub?.some((subItem) => typeof subItem !== 'string'));
      const canShowItem = hasItemAccess(item) || hasVisibleChildren;

      if (!canShowItem) return acc;

      acc.push(filteredSub ? { ...item, sub: filteredSub } : item);
      return acc;
    }, []);
  }, [menuAccess, permissions, position, siteId, userRole]);

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
