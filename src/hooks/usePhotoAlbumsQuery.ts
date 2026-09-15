import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { PHOTO_ALBUMS_UPDATED_EVENT, type PhotoAlbum, photoService } from '@/services/photoService';

export const PHOTO_ALBUMS_QUERY_KEY = ['photo-albums'] as const;

export function usePhotoAlbumsQuery(enabled = true) {
    const queryClient = useQueryClient();

    useEffect(() => {
        const invalidate = () => {
            void queryClient.invalidateQueries({ queryKey: PHOTO_ALBUMS_QUERY_KEY });
        };

        window.addEventListener(PHOTO_ALBUMS_UPDATED_EVENT, invalidate);
        return () => window.removeEventListener(PHOTO_ALBUMS_UPDATED_EVENT, invalidate);
    }, [queryClient]);

    return useQuery<PhotoAlbum[]>({
        queryKey: PHOTO_ALBUMS_QUERY_KEY,
        queryFn: () => photoService.getAlbums(),
        enabled,
        staleTime: 30 * 1000,
        refetchOnWindowFocus: true,
    });
}
