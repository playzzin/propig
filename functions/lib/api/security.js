"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuthenticatedUser = requireAuthenticatedUser;
exports.isBlockedRemoteAddress = isBlockedRemoteAddress;
exports.resolvePublicHostAddresses = resolvePublicHostAddresses;
exports.assertHostResolvesToPublicAddresses = assertHostResolvesToPublicAddresses;
exports.normalizeExternalHttpUrl = normalizeExternalHttpUrl;
exports.fetchExternalHttpUrl = fetchExternalHttpUrl;
exports.readCappedTextResponse = readCappedTextResponse;
exports.enforceUserRateLimit = enforceUserRateLimit;
const admin = require("firebase-admin");
const promises_1 = require("node:dns/promises");
const node_http_1 = require("node:http");
const node_https_1 = require("node:https");
const node_net_1 = require("node:net");
const node_stream_1 = require("node:stream");
const firestore_1 = require("../firestore");
if (!admin.apps.length) {
    admin.initializeApp();
}
const EXTERNAL_REQUEST_TIMEOUT_MS = 12000;
const MAX_EXTERNAL_REDIRECTS = 3;
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
function isBlockedIpv4Address(address) {
    const match = address.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!match)
        return true;
    const [a, b, c, d] = match.slice(1).map(Number);
    if ([a, b, c, d].some((part) => !Number.isInteger(part) || part < 0 || part > 255))
        return true;
    return (a === 0 ||
        a === 10 ||
        (a === 100 && b >= 64 && b <= 127) ||
        a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 0 && (c === 0 || c === 2)) ||
        (a === 192 && b === 168) ||
        (a === 198 && (b === 18 || b === 19)) ||
        (a === 198 && b === 51 && c === 100) ||
        (a === 203 && b === 0 && c === 113) ||
        a >= 224);
}
function getIpv4FromWords(high, low) {
    return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}
function parseIpv6Words(address) {
    const normalized = address.toLowerCase();
    if (normalized.includes('.'))
        return null;
    const sections = normalized.split('::');
    if (sections.length > 2)
        return null;
    const before = sections[0] ? sections[0].split(':') : [];
    const after = sections.length === 2 && sections[1] ? sections[1].split(':') : [];
    const uncompressedLength = before.length + after.length;
    if ((sections.length === 1 && uncompressedLength !== 8) || uncompressedLength > 8)
        return null;
    const parts = [
        ...before,
        ...Array(Math.max(0, 8 - uncompressedLength)).fill('0'),
        ...after,
    ];
    if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part)))
        return null;
    return parts.map((part) => Number.parseInt(part, 16));
}
function isBlockedIpv6Address(address) {
    var _a;
    const host = address.toLowerCase().replace(/^\[|\]$/g, '');
    if (host === '::' ||
        host === '::1' ||
        host.startsWith('fc') ||
        host.startsWith('fd') ||
        /^fe[89ab]/.test(host) ||
        host.startsWith('ff') ||
        host.startsWith('2001:db8:')) {
        return true;
    }
    const dottedIpv4Tail = (_a = host.match(/(\d{1,3}(?:\.\d{1,3}){3})$/)) === null || _a === void 0 ? void 0 : _a[1];
    if (dottedIpv4Tail)
        return isBlockedIpv4Address(dottedIpv4Tail);
    const words = parseIpv6Words(host);
    if (!words)
        return true;
    const hasIpv4CompatiblePrefix = words.slice(0, 6).every((word) => word === 0);
    const hasIpv4MappedPrefix = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
    if (hasIpv4CompatiblePrefix || hasIpv4MappedPrefix) {
        return isBlockedIpv4Address(getIpv4FromWords(words[6], words[7]));
    }
    if (words[0] === 0x2002) {
        return isBlockedIpv4Address(getIpv4FromWords(words[1], words[2]));
    }
    return false;
}
function isBlockedRemoteAddress(address) {
    const normalized = address.replace(/^\[|\]$/g, '');
    const family = (0, node_net_1.isIP)(normalized);
    if (family === 4)
        return isBlockedIpv4Address(normalized);
    if (family === 6)
        return isBlockedIpv6Address(normalized);
    return true;
}
function isBlockedHostname(hostname) {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const family = (0, node_net_1.isIP)(host);
    return (host === 'localhost' ||
        host.endsWith('.localhost') ||
        host.endsWith('.local') ||
        (family !== 0 && isBlockedRemoteAddress(host)));
}
const resolveHostAddresses = async (hostname) => (0, promises_1.lookup)(hostname, { all: true, verbatim: true });
async function resolvePublicHostAddresses(hostname, resolveHost = resolveHostAddresses) {
    let addresses;
    try {
        addresses = await resolveHost(hostname);
    }
    catch (_a) {
        throw new Error('The external URL host could not be resolved.');
    }
    if (addresses.length === 0 || addresses.some(({ address }) => isBlockedRemoteAddress(address))) {
        throw new Error('Local and private network URLs are not allowed.');
    }
    return addresses;
}
async function assertHostResolvesToPublicAddresses(hostname, resolveHost = resolveHostAddresses) {
    await resolvePublicHostAddresses(hostname, resolveHost);
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
    if (isBlockedHostname(parsed.hostname)) {
        throw new Error('Local and private network URLs are not allowed.');
    }
    return parsed.toString();
}
function toResponse(response) {
    var _a;
    const headers = new Headers();
    for (const [name, value] of Object.entries(response.headers)) {
        if (typeof value === 'string') {
            headers.set(name, value);
        }
        else if (Array.isArray(value)) {
            for (const item of value)
                headers.append(name, item);
        }
    }
    return new Response(node_stream_1.Readable.toWeb(response), {
        status: (_a = response.statusCode) !== null && _a !== void 0 ? _a : 502,
        headers,
    });
}
async function requestPinnedExternalUrl(parsedUrl, address, init) {
    var _a;
    if (init.body != null) {
        throw new Error('External URL requests with a body are not supported.');
    }
    if ((_a = init.signal) === null || _a === void 0 ? void 0 : _a.aborted) {
        throw new Error('External URL request was aborted.');
    }
    const headers = new Headers(init.headers);
    headers.set('host', parsedUrl.host);
    const hostname = parsedUrl.hostname.replace(/^\[|\]$/g, '');
    const request = parsedUrl.protocol === 'https:' ? node_https_1.request : node_http_1.request;
    return new Promise((resolve, reject) => {
        var _a, _b;
        const requestHandle = request(Object.assign({ protocol: parsedUrl.protocol, hostname: address.address, port: parsedUrl.port || undefined, path: `${parsedUrl.pathname}${parsedUrl.search}`, method: (_a = init.method) !== null && _a !== void 0 ? _a : 'GET', headers: Object.fromEntries(headers.entries()), agent: false }, (parsedUrl.protocol === 'https:' && (0, node_net_1.isIP)(hostname) === 0 ? { servername: hostname } : {})), (response) => resolve(toResponse(response)));
        const abortRequest = () => requestHandle.destroy(new Error('External URL request was aborted.'));
        const timeout = setTimeout(() => requestHandle.destroy(new Error('External URL request timed out.')), EXTERNAL_REQUEST_TIMEOUT_MS);
        const cleanup = () => {
            var _a;
            clearTimeout(timeout);
            (_a = init.signal) === null || _a === void 0 ? void 0 : _a.removeEventListener('abort', abortRequest);
        };
        (_b = init.signal) === null || _b === void 0 ? void 0 : _b.addEventListener('abort', abortRequest, { once: true });
        requestHandle.on('close', cleanup);
        requestHandle.on('error', (error) => {
            cleanup();
            reject(new Error(error.message === 'External URL request timed out.' ? error.message : 'Failed to fetch external URL.'));
        });
        requestHandle.end();
    });
}
async function fetchExternalHttpUrl(rawUrl, init = {}, redirects = 0) {
    var _a;
    const safeUrl = normalizeExternalHttpUrl(rawUrl);
    const parsedUrl = new URL(safeUrl);
    const addresses = await resolvePublicHostAddresses(parsedUrl.hostname);
    let response = null;
    let lastError;
    for (const address of addresses) {
        try {
            response = await requestPinnedExternalUrl(parsedUrl, address, init);
            break;
        }
        catch (error) {
            lastError = error;
        }
    }
    if (!response) {
        throw lastError instanceof Error ? lastError : new Error('Failed to fetch external URL.');
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (redirects >= MAX_EXTERNAL_REDIRECTS) {
            throw new Error('Too many redirects.');
        }
        const location = response.headers.get('location');
        if (!location) {
            throw new Error('Redirect response is missing a Location header.');
        }
        await ((_a = response.body) === null || _a === void 0 ? void 0 : _a.cancel());
        return fetchExternalHttpUrl(new URL(location, safeUrl).toString(), init, redirects + 1);
    }
    return response;
}
async function readCappedTextResponse(response, maxBytes) {
    var _a, _b;
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
        throw new Error('A positive response size limit is required.');
    }
    const declaredLength = Number((_a = response.headers.get('content-length')) !== null && _a !== void 0 ? _a : 0);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        await ((_b = response.body) === null || _b === void 0 ? void 0 : _b.cancel());
        throw new Error('External response exceeds the allowed size.');
    }
    if (!response.body) {
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.byteLength > maxBytes) {
            throw new Error('External response exceeds the allowed size.');
        }
        return buffer.toString('utf8');
    }
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            total += value.byteLength;
            if (total > maxBytes) {
                await reader.cancel();
                throw new Error('External response exceeds the allowed size.');
            }
            chunks.push(Buffer.from(value));
        }
    }
    finally {
        reader.releaseLock();
    }
    return Buffer.concat(chunks).toString('utf8');
}
function getTimestampMillis(value) {
    if (!value || typeof value !== 'object' || !('toMillis' in value))
        return null;
    const toMillis = value.toMillis;
    if (typeof toMillis !== 'function')
        return null;
    const timestamp = toMillis.call(value);
    return typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : null;
}
async function enforceUserRateLimit(input) {
    const { namespace, uid, maxRequests, windowMs } = input;
    if (!namespace || !uid || !Number.isSafeInteger(maxRequests) || maxRequests < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1) {
        throw new Error('Invalid rate limit configuration.');
    }
    const key = Buffer.from(`${namespace}:${uid}`).toString('base64url');
    const reference = firestore_1.db.collection('rateLimits').doc(key);
    const now = Date.now();
    return firestore_1.db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reference);
        const data = snapshot.data();
        const storedWindowStart = getTimestampMillis(data === null || data === void 0 ? void 0 : data.windowStartedAt);
        const windowStartedAt = storedWindowStart !== null && now - storedWindowStart < windowMs ? storedWindowStart : now;
        const storedCount = typeof (data === null || data === void 0 ? void 0 : data.count) === 'number' && Number.isSafeInteger(data.count) && data.count >= 0
            ? data.count
            : 0;
        const nextCount = windowStartedAt === storedWindowStart ? storedCount + 1 : 1;
        if (nextCount > maxRequests) {
            return {
                allowed: false,
                retryAfterSeconds: Math.max(1, Math.ceil((windowStartedAt + windowMs - now) / 1000)),
            };
        }
        transaction.set(reference, {
            namespace,
            uid,
            count: nextCount,
            windowStartedAt: admin.firestore.Timestamp.fromMillis(windowStartedAt),
            updatedAt: admin.firestore.Timestamp.fromMillis(now),
            expiresAt: admin.firestore.Timestamp.fromMillis(windowStartedAt + windowMs),
        }, { merge: true });
        return { allowed: true };
    });
}
//# sourceMappingURL=security.js.map