import { onRequest, type Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { openRouterApiKey } from '../secrets';
import { handleAdminUsers } from './hostingAdminUsers';
import { handleAiConfig, handleAiConfigTest } from './hostingAiConfigRoutes';
import {
    handleActivityLogs,
    handleAdminActivityLogs,
    handleAdminMenuSites,
    handleErpHomePreferences,
    handleFetchImage,
} from './hostingCoreRoutes';
import {
    handleGenerateImage,
    handleGenerateImageStoryboard,
    handleGenerateProjectBoardContent,
    handleGenerateVideo,
    handleRedesignImageStoryboardFlow,
    handleRedesignImageStoryboardScene,
} from './hostingGenerationRoutes';
import { handleConvertImage } from './hostingImageConversion';
import { handleEmoticonAnimationPlan } from './hostingEmoticonStudioRoutes';
import {
    handleVideoStudioClipById,
    handleVideoStudioClips,
    handleVideoStudioEstimate,
    handleVideoStudioJobById,
    handleVideoStudioJobProcess,
    handleVideoStudioJobRun,
    handleVideoStudioJobs,
    handleVideoStudioProjectStorage,
    handleVideoStudioReadiness,
    handleVideoStudioStatus,
    handleVideoStudioTimeline,
} from './hostingVideoStudioRoutes';
import { handleStoryboardById } from './hostingStoryboardRoutes';
import { ApiError, sendError } from './hostingCommon';

export const HOSTING_API_ROUTE_PATTERNS = [
    '/api/activity-logs',
    '/api/admin/activity-logs',
    '/api/admin/menu-sites',
    '/api/admin/users',
    '/api/ai-config',
    '/api/ai-config/test',
    '/api/convert-image',
    '/api/emoticon-studio/plan',
    '/api/fetch-image',
    '/api/generate-image',
    '/api/generate-image-storyboard',
    '/api/generate-image-storyboard/flow',
    '/api/generate-image-storyboard/scene',
    '/api/generate-project-board-content',
    '/api/generate-video',
    '/api/storyboards/:storyboardId',
    '/api/user/erp-home-preferences',
    '/api/video-studio/status',
    '/api/video-studio/readiness',
    '/api/video-studio/estimate',
    '/api/video-studio/clips',
    '/api/video-studio/clips/:clipId',
    '/api/video-studio/jobs',
    '/api/video-studio/jobs/process',
    '/api/video-studio/jobs/run',
    '/api/video-studio/jobs/:jobId',
    '/api/video-studio/projects/:projectId/storage',
    '/api/video-studio/projects/:projectId/timeline',
] as const;

type RouteHandler = (req: Request, res: Response) => Promise<void>;

const exactRoutes = new Map<string, RouteHandler>([
    ['/api/activity-logs', handleActivityLogs],
    ['/api/admin/activity-logs', handleAdminActivityLogs],
    ['/api/admin/menu-sites', handleAdminMenuSites],
    ['/api/admin/users', handleAdminUsers],
    ['/api/ai-config', handleAiConfig],
    ['/api/ai-config/test', handleAiConfigTest],
    ['/api/convert-image', handleConvertImage],
    ['/api/emoticon-studio/plan', handleEmoticonAnimationPlan],
    ['/api/fetch-image', handleFetchImage],
    ['/api/generate-image', handleGenerateImage],
    ['/api/generate-image-storyboard', handleGenerateImageStoryboard],
    ['/api/generate-image-storyboard/flow', handleRedesignImageStoryboardFlow],
    ['/api/generate-image-storyboard/scene', handleRedesignImageStoryboardScene],
    ['/api/generate-project-board-content', handleGenerateProjectBoardContent],
    ['/api/generate-video', handleGenerateVideo],
    ['/api/user/erp-home-preferences', handleErpHomePreferences],
    ['/api/video-studio/status', handleVideoStudioStatus],
    ['/api/video-studio/readiness', handleVideoStudioReadiness],
    ['/api/video-studio/estimate', handleVideoStudioEstimate],
    ['/api/video-studio/clips', handleVideoStudioClips],
    ['/api/video-studio/jobs', handleVideoStudioJobs],
    ['/api/video-studio/jobs/process', handleVideoStudioJobProcess],
    ['/api/video-studio/jobs/run', handleVideoStudioJobRun],
]);

function requestPath(req: Request): string {
    const path = new URL(req.originalUrl || req.url, 'http://firebase.local').pathname;
    const apiIndex = path.indexOf('/api/');
    return apiIndex >= 0 ? path.slice(apiIndex).replace(/\/+$/, '') : path.replace(/\/+$/, '');
}

async function dispatchDynamicRoute(
    path: string,
    req: Request,
    res: Response,
): Promise<boolean> {
    const clipMatch = path.match(/^\/api\/video-studio\/clips\/([^/]+)$/);
    if (clipMatch) {
        await handleVideoStudioClipById(req, res, decodeURIComponent(clipMatch[1]));
        return true;
    }
    const storyboardMatch = path.match(/^\/api\/storyboards\/([^/]+)$/);
    if (storyboardMatch) {
        await handleStoryboardById(req, res, decodeURIComponent(storyboardMatch[1]));
        return true;
    }
    const jobMatch = path.match(/^\/api\/video-studio\/jobs\/([^/]+)$/);
    if (jobMatch) {
        await handleVideoStudioJobById(req, res, decodeURIComponent(jobMatch[1]));
        return true;
    }
    const timelineMatch = path.match(/^\/api\/video-studio\/projects\/([^/]+)\/timeline$/);
    if (timelineMatch) {
        await handleVideoStudioTimeline(req, res, decodeURIComponent(timelineMatch[1]));
        return true;
    }
    const storageMatch = path.match(/^\/api\/video-studio\/projects\/([^/]+)\/storage$/);
    if (storageMatch) {
        await handleVideoStudioProjectStorage(req, res, decodeURIComponent(storageMatch[1]));
        return true;
    }
    return false;
}

async function dispatch(req: Request, res: Response): Promise<void> {
    const declaredLength = Number(req.header('content-length') || 0);
    if (Number.isFinite(declaredLength) && declaredLength > 32 * 1024 * 1024) {
        throw new ApiError(413, 'Request body exceeds the 32 MB limit.');
    }
    res.set({
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'same-origin',
    });
    const path = requestPath(req);
    const exact = exactRoutes.get(path);
    if (exact) {
        await exact(req, res);
        return;
    }
    if (await dispatchDynamicRoute(path, req, res)) return;
    throw new ApiError(404, 'API route not found.');
}

export const hostingApi = onRequest(
    {
        cors: false,
        timeoutSeconds: 540,
        memory: '2GiB',
        concurrency: 10,
        maxInstances: 20,
        secrets: [openRouterApiKey],
    },
    async (req, res) => {
        try {
            await dispatch(req, res);
        } catch (error) {
            if (!res.headersSent) sendError(res, error);
            else console.error('[hostingApi] Error after response headers were sent:', error);
        }
    },
);
