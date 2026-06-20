'use client';

import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  storageDriveService,
  type StorageDriveItem,
  type StorageDriveUploadProgress,
} from '@/services/storageDriveService';

export type StorageDriveScope = 'drive' | 'trash';
export type StorageDriveViewMode = 'grid' | 'list';
export type StorageDriveSortKey = 'name' | 'updated' | 'size' | 'type';
export type StorageDriveSortDirection = 'asc' | 'desc';

interface UseStorageDriveOptions {
  ownerId: string | null;
  parentId: string | null;
  scope: StorageDriveScope;
  searchTerm: string;
  sortKey: StorageDriveSortKey;
  sortDirection: StorageDriveSortDirection;
}

interface RenameInput {
  itemId: string;
  name: string;
}

const queryRootKey = 'storage-drive';

function getItemUpdatedValue(item: StorageDriveItem): number {
  const candidate = item.updatedAt;

  if (candidate instanceof Date) return candidate.getTime();

  if (candidate && typeof candidate === 'object' && 'toMillis' in candidate) {
    const toMillis = (candidate as { toMillis?: () => number }).toMillis;
    if (typeof toMillis === 'function') return toMillis();
  }

  return 0;
}

function sortItems(
  items: StorageDriveItem[],
  sortKey: StorageDriveSortKey,
  sortDirection: StorageDriveSortDirection,
): StorageDriveItem[] {
  const direction = sortDirection === 'asc' ? 1 : -1;

  return [...items].sort((a, b) => {
    if (a.type !== b.type && sortKey !== 'type') {
      return a.type === 'folder' ? -1 : 1;
    }

    let result = 0;

    if (sortKey === 'name') {
      result = a.normalizedName.localeCompare(b.normalizedName, 'ko-KR', {
        numeric: true,
        sensitivity: 'base',
      });
    }

    if (sortKey === 'updated') {
      result = getItemUpdatedValue(a) - getItemUpdatedValue(b);
    }

    if (sortKey === 'size') {
      result = (a.sizeBytes ?? 0) - (b.sizeBytes ?? 0);
    }

    if (sortKey === 'type') {
      result = a.type.localeCompare(b.type);
      if (result === 0) {
        result = a.normalizedName.localeCompare(b.normalizedName, 'ko-KR', {
          numeric: true,
          sensitivity: 'base',
        });
      }
    }

    return result * direction;
  });
}

function filterItems(items: StorageDriveItem[], searchTerm: string): StorageDriveItem[] {
  const keyword = searchTerm.trim().toLocaleLowerCase('ko-KR');
  if (!keyword) return items;

  return items.filter((item) => {
    const haystack = [
      item.name,
      item.normalizedName,
      item.extension ?? '',
      item.mimeType ?? '',
    ]
      .join(' ')
      .toLocaleLowerCase('ko-KR');

    return haystack.includes(keyword);
  });
}

export function useStorageDrive({
  ownerId,
  parentId,
  scope,
  searchTerm,
  sortKey,
  sortDirection,
}: UseStorageDriveOptions) {
  const queryClient = useQueryClient();
  const [uploadProgress, setUploadProgress] = useState<Record<string, StorageDriveUploadProgress>>({});

  const itemsQuery = useQuery({
    queryKey: [queryRootKey, ownerId, 'items', scope, parentId],
    enabled: Boolean(ownerId),
    queryFn: async () => {
      if (!ownerId) return [];

      if (scope === 'trash') {
        return storageDriveService.listByStatus(ownerId, 'trash');
      }

      return storageDriveService.listChildren(ownerId, parentId, 'active');
    },
  });

  const breadcrumbsQuery = useQuery({
    queryKey: [queryRootKey, ownerId, 'breadcrumbs', parentId],
    enabled: Boolean(ownerId) && scope === 'drive',
    queryFn: async () => {
      if (!ownerId) return [];
      return storageDriveService.getBreadcrumbs(ownerId, parentId);
    },
  });

  const visibleItems = useMemo(() => {
    const filtered = filterItems(itemsQuery.data ?? [], searchTerm);
    return sortItems(filtered, sortKey, sortDirection);
  }, [itemsQuery.data, searchTerm, sortDirection, sortKey]);

  const invalidateDrive = useCallback(async () => {
    if (!ownerId) return;
    await queryClient.invalidateQueries({ queryKey: [queryRootKey, ownerId] });
  }, [ownerId, queryClient]);

  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!ownerId) throw new Error('로그인이 필요합니다.');
      return storageDriveService.createFolder({ ownerId, parentId, name });
    },
    onSuccess: invalidateDrive,
  });

  const renameMutation = useMutation({
    mutationFn: async ({ itemId, name }: RenameInput) => {
      if (!ownerId) throw new Error('로그인이 필요합니다.');
      await storageDriveService.renameItem(ownerId, itemId, name);
    },
    onSuccess: invalidateDrive,
  });

  const trashMutation = useMutation({
    mutationFn: async (items: StorageDriveItem[]) => {
      if (!ownerId) throw new Error('로그인이 필요합니다.');
      await storageDriveService.moveToTrash(ownerId, items);
    },
    onSuccess: invalidateDrive,
  });

  const restoreMutation = useMutation({
    mutationFn: async (items: StorageDriveItem[]) => {
      if (!ownerId) throw new Error('로그인이 필요합니다.');
      await storageDriveService.restoreItems(ownerId, items);
    },
    onSuccess: invalidateDrive,
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: async (items: StorageDriveItem[]) => {
      if (!ownerId) throw new Error('로그인이 필요합니다.');
      await storageDriveService.permanentlyDeleteItems(ownerId, items);
    },
    onSuccess: invalidateDrive,
  });

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!ownerId) throw new Error('로그인이 필요합니다.');

      try {
        const uploaded = await storageDriveService.uploadFiles({
          ownerId,
          parentId,
          files,
          onProgress: (progress) => {
            setUploadProgress((prev) => ({
              ...prev,
              [progress.id]: progress,
            }));
          },
        });

        await invalidateDrive();
        window.setTimeout(() => {
          setUploadProgress((prev) => {
            const next = { ...prev };
            uploaded.forEach((item) => {
              delete next[item.id];
            });
            return next;
          });
        }, 1800);

        return uploaded;
      } catch (error) {
        await invalidateDrive();
        throw error;
      }
    },
    [invalidateDrive, ownerId, parentId],
  );

  const clearCompletedUploads = useCallback(() => {
    setUploadProgress((prev) => {
      const next = { ...prev };
      Object.entries(next).forEach(([id, progress]) => {
        if (progress.status === 'complete' || progress.status === 'error') {
          delete next[id];
        }
      });
      return next;
    });
  }, []);

  return {
    items: visibleItems,
    rawItems: itemsQuery.data ?? [],
    breadcrumbs: breadcrumbsQuery.data ?? [],
    uploadProgress: Object.values(uploadProgress),
    isLoading: itemsQuery.isLoading || breadcrumbsQuery.isLoading,
    isFetching: itemsQuery.isFetching || breadcrumbsQuery.isFetching,
    error: itemsQuery.error ?? breadcrumbsQuery.error,
    createFolder: createFolderMutation.mutateAsync,
    renameItem: renameMutation.mutateAsync,
    moveToTrash: trashMutation.mutateAsync,
    restoreItems: restoreMutation.mutateAsync,
    permanentlyDeleteItems: permanentDeleteMutation.mutateAsync,
    uploadFiles,
    clearCompletedUploads,
    refetch: invalidateDrive,
    isMutating:
      createFolderMutation.isPending ||
      renameMutation.isPending ||
      trashMutation.isPending ||
      restoreMutation.isPending ||
      permanentDeleteMutation.isPending,
  };
}
