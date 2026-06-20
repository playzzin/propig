import { useQuery } from '@tanstack/react-query';
import { type PhotoAlbum, photoService } from '@/services/photoService';

export const PHOTO_ALBUMS_QUERY_KEY = ['photo-albums'] as const;

export function usePhotoAlbumsQuery(enabled = true) {
    return useQuery<PhotoAlbum[]>({
        queryKey: PHOTO_ALBUMS_QUERY_KEY,
        queryFn: () => photoService.getAlbums(),
        enabled,
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
    });
}
