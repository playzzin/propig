"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storagePathFromVideoStudioUrl = storagePathFromVideoStudioUrl;
/**
 * Resolves video-studio object paths from both current Firebase download URLs
 * and legacy Google Cloud Storage URL shapes. Only paths inside the caller's
 * exact project prefix are returned, so cleanup can fail closed.
 */
function storagePathFromVideoStudioUrl(value, prefix) {
    if (typeof value !== 'string' || !value.trim() || !prefix)
        return null;
    try {
        const url = new URL(value);
        const marker = '/o/';
        const markerIndex = url.pathname.indexOf(marker);
        const supportsObjectApiPath = url.hostname === 'firebasestorage.googleapis.com'
            || url.hostname === 'storage.googleapis.com';
        if (markerIndex >= 0 && supportsObjectApiPath) {
            const decodedPath = decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
            return decodedPath.startsWith(prefix) ? decodedPath : null;
        }
        const decodedPathname = decodeURIComponent(url.pathname).replace(/^\/+/, '');
        const legacyStoragePath = url.hostname === 'storage.googleapis.com'
            ? decodedPathname.replace(/^[^/]+\//, '')
            : url.hostname.endsWith('.storage.googleapis.com')
                ? decodedPathname
                : null;
        return (legacyStoragePath === null || legacyStoragePath === void 0 ? void 0 : legacyStoragePath.startsWith(prefix)) ? legacyStoragePath : null;
    }
    catch (_a) {
        return null;
    }
}
//# sourceMappingURL=storagePath.js.map