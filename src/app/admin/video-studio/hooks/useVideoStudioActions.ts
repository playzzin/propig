import { useState } from 'react';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { storage } from '@/firebase/config';
import { useAuth } from '@/contexts/AuthContext';
import { videoStudioService } from '@/services/videoStudioService';
import type { 
    VideoStudioJobKind, 
    VideoStudioAspectRatio, 
    VideoStudioResolution, 
    VideoStudioProjectStarterSource,
    VideoStudioProject,
    VideoStudioClip,
} from '@/lib/video-studio';

export function useVideoStudioActions(
    setSubmittedJobIds: React.Dispatch<React.SetStateAction<string[]>>
) {
    const { currentUser } = useAuth();
    const [working, setWorking] = useState(false);
    const [status, setStatus] = useState('대기 중');
    const [starterUploading, setStarterUploading] = useState(false);

    const setBusy = (nextStatus: string) => {
        setStatus(nextStatus);
        setWorking(true);
    };

    const clearBusy = () => {
        setWorking(false);
        setStatus('대기 중');
    };

    const queueStudioJob = async (params: {
        operation: VideoStudioJobKind;
        projectId: string;
        clipTitle?: string;
        prompt?: string;
        duration?: number;
        referenceImage?: string;
        continuityNotes?: string;
        cameraNotes?: string;
        subjectLock?: string;
        sourceClipId?: string;
        mergeClipIds?: string[];
    }) => {
        if (!currentUser) throw new Error('로그인이 필요합니다.');

        const authToken = await currentUser.getIdToken();
        const queued = await videoStudioService.submitStudioJob({
            authToken,
            ...params,
        });
        
        setSubmittedJobIds((prev) => (prev.includes(queued.jobId) ? prev : [...prev, queued.jobId]));

        return queued;
    };

    const kickoffQueuedJob = async (jobId: string) => {
        if (!currentUser) throw new Error('로그인이 필요합니다.');

        const authToken = await currentUser.getIdToken();
        setSubmittedJobIds((prev) => (prev.includes(jobId) ? prev : [...prev, jobId]));
        
        return videoStudioService.processStudioJob({
            authToken,
            jobId,
        });
    };

    const updateQueuedJob = async (params: { jobId: string; action: 'requeue' | 'cancel' }) => {
        if (!currentUser) throw new Error('로그인이 필요합니다.');

        const authToken = await currentUser.getIdToken();
        const result = await videoStudioService.updateStudioJob({
            authToken,
            jobId: params.jobId,
            action: params.action,
        });

        if (params.action === 'requeue') {
            setSubmittedJobIds((prev) => (prev.includes(result.jobId) ? prev : [...prev, result.jobId]));
        }

        return result;
    };

    const createProject = async (params: {
        title: string;
        synopsis: string;
        aspectRatio: VideoStudioAspectRatio;
        resolution: VideoStudioResolution;
        starterImageUrl?: string | null;
        starterImageSource?: VideoStudioProjectStarterSource | null;
        starterAlbumId?: string | null;
        starterPhotoId?: string | null;
        starterStoragePath?: string | null;
    }) => {
        if (!currentUser) throw new Error('로그인이 필요합니다.');

        setBusy('프로젝트를 만드는 중');
        try {
            const projectId = await videoStudioService.createProject({
                userId: currentUser.uid,
                ...params,
            });
            return projectId;
        } finally {
            clearBusy();
        }
    };

    const uploadStarterImage = async (file: File) => {
        if (!currentUser) throw new Error('로그인이 필요합니다.');

        setStarterUploading(true);
        try {
            const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
            const fileRef = storageRef(storage, `ai_generations/${currentUser.uid}/video-studio-starters/${safeName}`);
            await uploadBytes(fileRef, file, { contentType: file.type || 'image/jpeg' });
            const url = await getDownloadURL(fileRef);
            
            return {
                url,
                source: 'upload' as VideoStudioProjectStarterSource,
                storagePath: fileRef.fullPath,
                label: file.name,
            };
        } finally {
            setStarterUploading(false);
        }
    };

    const updateProjectInfo = async (projectId: string, payload: Partial<VideoStudioProject>) => {
        setBusy('프로젝트 업데이트 중');
        try {
            await videoStudioService.updateProject(projectId, payload);
        } finally {
            clearBusy();
        }
    };

    const saveContinuity = async (clipId: string, payload: Partial<VideoStudioClip>) => {
        setBusy('연속성 메모를 저장하는 중');
        try {
            await videoStudioService.updateClip(clipId, payload);
        } finally {
            clearBusy();
        }
    };

    const resequenceClips = async (projectId: string, clipIds: string[]) => {
        if (!currentUser) throw new Error('로그인이 필요합니다.');
        
        setBusy('타임라인 순서를 바꾸는 중');
        try {
            const authToken = await currentUser.getIdToken();
            await videoStudioService.resequenceClips({
                authToken,
                projectId,
                clipIds,
            });
        } finally {
            clearBusy();
        }
    };

    return {
        working,
        status,
        setBusy,
        clearBusy,
        starterUploading,
        queueStudioJob,
        kickoffQueuedJob,
        updateQueuedJob,
        createProject,
        uploadStarterImage,
        updateProjectInfo,
        saveContinuity,
        resequenceClips,
    };
}
