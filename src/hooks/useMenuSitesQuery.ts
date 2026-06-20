'use client';

import { useQuery } from '@tanstack/react-query';
import { menuService } from '@/services/menuService';

export const MENU_SITES_QUERY_KEY = ['menu-sites'] as const;

export function useMenuSitesQuery() {
  return useQuery({
    queryKey: MENU_SITES_QUERY_KEY,
    queryFn: () => menuService.loadAllSites(),
    staleTime: 5 * 60 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
}
