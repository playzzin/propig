"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuthenticatedUser = requireAuthenticatedUser;
exports.normalizeExternalHttpUrl = normalizeExternalHttpUrl;
exports.fetchExternalHttpUrl = fetchExternalHttpUrl;
const admin = require("firebase-admin");
if (!admin.apps.length) {
    admin.initializeApp();
}
async function requireAuthenticatedUser(req) {
    const authHeader = req.header('authorization') || req.header('Authorization');
    if (!authHeader) {
        return { ok: false, status: 401, message: 'Authorization Bearer token is required.' };
    }
    const [scheme, token] = authHeader.split(' ');
    if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
        return { ok: false, status: 401, message: 'Authorization Bearer token is required.' };
    }
    try {
        const decoded = await admin.auth().verifyIdToken(token.trim());
        return { ok: true, uid: decoded.uid };
    }
    catch (_a) {
        return { ok: false, status: 401, message: 'Invalid auth token.' };
    }
}
function isPrivateIpLiteral(hostname) {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (host === 'localhost' ||
        host.endsWith('.localhost') ||
        host === '::' ||
        host === '::1' ||
        host.startsWith('fe80:') ||
        host.startsWith('fc') ||
        host.startsWith('fd')) {
        return true;
    }
    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!ipv4)
        return false;
    const parts = ipv4.slice(1).map((value) => Number(value));
    if (parts.some((part) => !Number.isFinite(part) || part < 0 || part > 255))
        return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127)
        return true;
    if (a === 100 && b >= 64 && b <= 127)
        return true;
    if (a === 169 && b === 254)
        return true;
    if (a === 172 && b >= 16 && b <= 31)
        return true;
    if (a === 192 && b === 168)
        return true;
    if (a === 198 && (b === 18 || b === 19))
        return true;
    if (a >= 224)
        return true;
    return false;
}
function normalizeExternalHttpUrl(rawUrl) {
    let parsed;
    try {
        parsed = new URL(rawUrl);
    }
    catch (_a) {
        throw new Error('Invalid URL');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Only http and https URLs are allowed.');
    }
    if (parsed.username || parsed.password) {
        throw new Error('URLs with credentials are not allowed.');
    }
    if (isPrivateIpLiteral(parsed.hostname)) {
        throw new Error('Local and private network URLs are not allowed.');
    }
    return parsed.toString();
}
async function fetchExternalHttpUrl(rawUrl, init = {}, redirects = 0) {
    const safeUrl = normalizeExternalHttpUrl(rawUrl);
    const response = await fetch(safeUrl, Object.assign(Object.assign({}, init), { redirect: 'manual' }));
    if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (redirects >= 3) {
            throw new Error('Too many redirects.');
        }
        const location = response.headers.get('location');
        if (!location) {
            throw new Error('Redirect response is missing a Location header.');
        }
        const nextUrl = new URL(location, safeUrl).toString();
        return fetchExternalHttpUrl(nextUrl, init, redirects + 1);
    }
    return response;
}
//# sourceMappingURL=security.js.map