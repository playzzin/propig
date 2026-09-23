"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hostingApi = exports.HOSTING_API_ROUTE_PATTERNS = void 0;
const https_1 = require("firebase-functions/v2/https");
const secrets_1 = require("../secrets");
const hostingAdminUsers_1 = require("./hostingAdminUsers");
const hostingInvitations_1 = require("./hostingInvitations");
const hostingProductionInbox_1 = require("./hostingProductionInbox");
const hostingImageBudgets_1 = require("./hostingImageBudgets");
const hostingAiConfigRoutes_1 = require("./hostingAiConfigRoutes");
const hostingCoreRoutes_1 = require("./hostingCoreRoutes");
const hostingGenerationRoutes_1 = require("./hostingGenerationRoutes");
const hostingImageConversion_1 = require("./hostingImageConversion");
const hostingEmoticonStudioRoutes_1 = require("./hostingEmoticonStudioRoutes");
const hostingVideoStudioRoutes_1 = require("./hostingVideoStudioRoutes");
const hostingStoryboardRoutes_1 = require("./hostingStoryboardRoutes");
const hostingCommon_1 = require("./hostingCommon");
exports.HOSTING_API_ROUTE_PATTERNS = [
    '/api/activity-logs',
    '/api/admin/activity-logs',
    '/api/admin/menu-sites',
    '/api/admin/users',
    '/api/admin/invitations',
    '/api/invitations/accept',
    '/api/production-inbox',
    '/api/admin/image-budgets',
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
];
const exactRoutes = new Map([
    ['/api/activity-logs', hostingCoreRoutes_1.handleActivityLogs],
    ['/api/admin/activity-logs', hostingCoreRoutes_1.handleAdminActivityLogs],
    ['/api/admin/menu-sites', hostingCoreRoutes_1.handleAdminMenuSites],
    ['/api/admin/users', hostingAdminUsers_1.handleAdminUsers],
    ['/api/admin/invitations', hostingInvitations_1.handleAdminInvitations],
    ['/api/invitations/accept', hostingInvitations_1.handleAcceptInvitation],
    ['/api/production-inbox', hostingProductionInbox_1.handleProductionInbox],
    ['/api/admin/image-budgets', hostingImageBudgets_1.handleImageBudgets],
    ['/api/ai-config', hostingAiConfigRoutes_1.handleAiConfig],
    ['/api/ai-config/test', hostingAiConfigRoutes_1.handleAiConfigTest],
    ['/api/convert-image', hostingImageConversion_1.handleConvertImage],
    ['/api/emoticon-studio/plan', hostingEmoticonStudioRoutes_1.handleEmoticonAnimationPlan],
    ['/api/fetch-image', hostingCoreRoutes_1.handleFetchImage],
    ['/api/generate-image', hostingGenerationRoutes_1.handleGenerateImage],
    ['/api/generate-image-storyboard', hostingGenerationRoutes_1.handleGenerateImageStoryboard],
    ['/api/generate-image-storyboard/flow', hostingGenerationRoutes_1.handleRedesignImageStoryboardFlow],
    ['/api/generate-image-storyboard/scene', hostingGenerationRoutes_1.handleRedesignImageStoryboardScene],
    ['/api/generate-project-board-content', hostingGenerationRoutes_1.handleGenerateProjectBoardContent],
    ['/api/generate-video', hostingGenerationRoutes_1.handleGenerateVideo],
    ['/api/user/erp-home-preferences', hostingCoreRoutes_1.handleErpHomePreferences],
    ['/api/video-studio/status', hostingVideoStudioRoutes_1.handleVideoStudioStatus],
    ['/api/video-studio/readiness', hostingVideoStudioRoutes_1.handleVideoStudioReadiness],
    ['/api/video-studio/estimate', hostingVideoStudioRoutes_1.handleVideoStudioEstimate],
    ['/api/video-studio/clips', hostingVideoStudioRoutes_1.handleVideoStudioClips],
    ['/api/video-studio/jobs', hostingVideoStudioRoutes_1.handleVideoStudioJobs],
    ['/api/video-studio/jobs/process', hostingVideoStudioRoutes_1.handleVideoStudioJobProcess],
    ['/api/video-studio/jobs/run', hostingVideoStudioRoutes_1.handleVideoStudioJobRun],
]);
function requestPath(req) {
    const path = new URL(req.originalUrl || req.url, 'http://firebase.local').pathname;
    const apiIndex = path.indexOf('/api/');
    return apiIndex >= 0 ? path.slice(apiIndex).replace(/\/+$/, '') : path.replace(/\/+$/, '');
}
async function dispatchDynamicRoute(path, req, res) {
    const clipMatch = path.match(/^\/api\/video-studio\/clips\/([^/]+)$/);
    if (clipMatch) {
        await (0, hostingVideoStudioRoutes_1.handleVideoStudioClipById)(req, res, decodeURIComponent(clipMatch[1]));
        return true;
    }
    const storyboardMatch = path.match(/^\/api\/storyboards\/([^/]+)$/);
    if (storyboardMatch) {
        await (0, hostingStoryboardRoutes_1.handleStoryboardById)(req, res, decodeURIComponent(storyboardMatch[1]));
        return true;
    }
    const jobMatch = path.match(/^\/api\/video-studio\/jobs\/([^/]+)$/);
    if (jobMatch) {
        await (0, hostingVideoStudioRoutes_1.handleVideoStudioJobById)(req, res, decodeURIComponent(jobMatch[1]));
        return true;
    }
    const timelineMatch = path.match(/^\/api\/video-studio\/projects\/([^/]+)\/timeline$/);
    if (timelineMatch) {
        await (0, hostingVideoStudioRoutes_1.handleVideoStudioTimeline)(req, res, decodeURIComponent(timelineMatch[1]));
        return true;
    }
    const storageMatch = path.match(/^\/api\/video-studio\/projects\/([^/]+)\/storage$/);
    if (storageMatch) {
        await (0, hostingVideoStudioRoutes_1.handleVideoStudioProjectStorage)(req, res, decodeURIComponent(storageMatch[1]));
        return true;
    }
    return false;
}
async function dispatch(req, res) {
    const declaredLength = Number(req.header('content-length') || 0);
    if (Number.isFinite(declaredLength) && declaredLength > 32 * 1024 * 1024) {
        throw new hostingCommon_1.ApiError(413, 'Request body exceeds the 32 MB limit.');
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
    if (await dispatchDynamicRoute(path, req, res))
        return;
    throw new hostingCommon_1.ApiError(404, 'API route not found.');
}
exports.hostingApi = (0, https_1.onRequest)({
    cors: false,
    timeoutSeconds: 540,
    memory: '2GiB',
    concurrency: 10,
    maxInstances: 20,
    secrets: [secrets_1.openRouterApiKey],
}, async (req, res) => {
    try {
        await dispatch(req, res);
    }
    catch (error) {
        if (!res.headersSent)
            (0, hostingCommon_1.sendError)(res, error);
        else
            console.error('[hostingApi] Error after response headers were sent:', error);
    }
});
//# sourceMappingURL=hostingApi.js.map