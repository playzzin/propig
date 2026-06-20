"use strict";
/**
 * Security and Rate Limiting System
 * Protects API endpoints from abuse and ensures fair usage
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiKeyManager = exports.defaultRateLimiters = exports.securityHeaders = exports.corsConfig = exports.InputValidator = exports.APIKeyManager = exports.RateLimiter = void 0;
const firebase_admin_1 = require("@/lib/firebase-admin");
/**
 * Token bucket rate limiter
 */
class RateLimiter {
    constructor(config) {
        this.config = config;
        this.db = firebase_admin_1.default.firestore();
    }
    /**
     * Check if request is allowed
     */
    async checkLimit(identifier) {
        const bucketKey = `ratelimit:${this.config.identifier}:${identifier}`;
        const now = Date.now();
        const windowStart = now - this.config.windowMs;
        // Get or create rate limit bucket
        const bucketRef = this.db.collection('rateLimits').doc(bucketKey);
        const bucketDoc = await bucketRef.get();
        if (!bucketDoc.exists) {
            // Create new bucket
            await bucketRef.set({
                requests: [now],
                createdAt: now,
                updatedAt: now,
            });
            return {
                remaining: this.config.maxRequests - 1,
                resetAt: now + this.config.windowMs,
                blocked: false,
            };
        }
        const data = bucketDoc.data();
        let requests = data.requests || [];
        // Remove expired requests
        requests = requests.filter(timestamp => timestamp > windowStart);
        // Check if limit exceeded
        if (requests.length >= this.config.maxRequests) {
            const oldestRequest = Math.min(...requests);
            return {
                remaining: 0,
                resetAt: oldestRequest + this.config.windowMs,
                blocked: true,
            };
        }
        // Add current request
        requests.push(now);
        await bucketRef.update({
            requests,
            updatedAt: now,
        });
        const oldestRequest = Math.min(...requests);
        return {
            remaining: this.config.maxRequests - requests.length,
            resetAt: oldestRequest + this.config.windowMs,
            blocked: false,
        };
    }
    /**
     * Reset rate limit for an identifier
     */
    async reset(identifier) {
        const bucketKey = `ratelimit:${this.config.identifier}:${identifier}`;
        await this.db.collection('rateLimits').doc(bucketKey).delete();
    }
    /**
     * Clean up old rate limit records
     */
    async cleanup() {
        const cutoffTime = Date.now() - this.config.windowMs * 2;
        const snapshot = await this.db
            .collection('rateLimits')
            .where('updatedAt', '<', cutoffTime)
            .limit(500)
            .get();
        const batch = this.db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        return snapshot.size;
    }
}
exports.RateLimiter = RateLimiter;
/**
 * API Key validation and management
 */
class APIKeyManager {
    constructor() {
        this.db = firebase_admin_1.default.firestore();
    }
    /**
     * Generate a new API key
     */
    async generateAPIKey(userId, name) {
        const apiKey = `pk_${Date.now()}_${Math.random().toString(36).substr(2, 32)}`;
        await this.db.collection('apiKeys').doc(apiKey).set({
            userId,
            name,
            key: apiKey,
            createdAt: Date.now(),
            lastUsedAt: null,
            enabled: true,
            requestCount: 0,
        });
        return apiKey;
    }
    /**
     * Validate API key
     */
    async validateAPIKey(apiKey) {
        const doc = await this.db.collection('apiKeys').doc(apiKey).get();
        if (!doc.exists) {
            return { valid: false };
        }
        const data = doc.data();
        if (!data.enabled) {
            return { valid: false };
        }
        // Update last used timestamp
        await this.db.collection('apiKeys').doc(apiKey).update({
            lastUsedAt: Date.now(),
            requestCount: firebase_admin_1.default.firestore.FieldValue.increment(1),
        });
        return { valid: true, userId: data.userId };
    }
    /**
     * Revoke API key
     */
    async revokeAPIKey(apiKey) {
        await this.db.collection('apiKeys').doc(apiKey).update({
            enabled: false,
            revokedAt: Date.now(),
        });
    }
    /**
     * List user's API keys
     */
    async listAPIKeys(userId) {
        const snapshot = await this.db
            .collection('apiKeys')
            .where('userId', '==', userId)
            .get();
        return snapshot.docs.map(doc => doc.data());
    }
}
exports.APIKeyManager = APIKeyManager;
/**
 * Input validation and sanitization
 */
class InputValidator {
    /**
     * Sanitize user input to prevent injection attacks
     */
    static sanitize(input) {
        // Remove dangerous characters and patterns
        return input
            .replace(/<script[^>]*>.*?<\/script>/gi, '')
            .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+\s*=/gi, '')
            .trim();
    }
    /**
     * Validate input length
     */
    static validateLength(input, min, max) {
        return input.length >= min && input.length <= max;
    }
    /**
     * Validate email format
     */
    static validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
    /**
     * Validate URL format
     */
    static validateURL(url) {
        try {
            new URL(url);
            return true;
        }
        catch (_a) {
            return false;
        }
    }
    /**
     * Check for SQL injection patterns
     */
    static hasSQLInjection(input) {
        const sqlPatterns = [
            /(\bOR\b|\bAND\b).*=/i,
            /UNION.*SELECT/i,
            /DROP.*TABLE/i,
            /INSERT.*INTO/i,
            /DELETE.*FROM/i,
            /';.*--/i,
        ];
        return sqlPatterns.some(pattern => pattern.test(input));
    }
    /**
     * Check for XSS patterns
     */
    static hasXSS(input) {
        const xssPatterns = [
            /<script/i,
            /javascript:/i,
            /onerror=/i,
            /onclick=/i,
            /onload=/i,
        ];
        return xssPatterns.some(pattern => pattern.test(input));
    }
}
exports.InputValidator = InputValidator;
/**
 * CORS configuration
 */
exports.corsConfig = {
    allowedOrigins: [
        'http://localhost:3000',
        'http://localhost:6001',
        'https://propig.app', // Add your production domain
    ],
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials: true,
    maxAge: 86400, // 24 hours
};
/**
 * Security headers middleware configuration
 */
exports.securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
};
// Default rate limiters for different endpoints
exports.defaultRateLimiters = {
    // Strict limit for unauthenticated users
    public: new RateLimiter({
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 100,
        identifier: 'ip',
    }),
    // More generous for authenticated users
    authenticated: new RateLimiter({
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 1000,
        identifier: 'userId',
    }),
    // Very strict for expensive operations
    expensive: new RateLimiter({
        windowMs: 60 * 60 * 1000, // 1 hour
        maxRequests: 10,
        identifier: 'userId',
    }),
};
exports.apiKeyManager = new APIKeyManager();
//# sourceMappingURL=RateLimiter.js.map