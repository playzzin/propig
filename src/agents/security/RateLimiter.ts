/**
 * Security and Rate Limiting System
 * Protects API endpoints from abuse and ensures fair usage
 */

import admin from '@/lib/firebase-admin';

export interface RateLimitConfig {
    windowMs: number;
    maxRequests: number;
    identifier: 'ip' | 'userId' | 'sessionId';
}

export interface RateLimitInfo {
    remaining: number;
    resetAt: number;
    blocked: boolean;
}

/**
 * Token bucket rate limiter
 */
export class RateLimiter {
    private db = admin.firestore();

    constructor(private config: RateLimitConfig) {}

    /**
     * Check if request is allowed
     */
    async checkLimit(identifier: string): Promise<RateLimitInfo> {
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

        const data = bucketDoc.data()!;
        let requests: number[] = data.requests || [];

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
    async reset(identifier: string): Promise<void> {
        const bucketKey = `ratelimit:${this.config.identifier}:${identifier}`;
        await this.db.collection('rateLimits').doc(bucketKey).delete();
    }

    /**
     * Clean up old rate limit records
     */
    async cleanup(): Promise<number> {
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

/**
 * API Key validation and management
 */
export class APIKeyManager {
    private db = admin.firestore();

    /**
     * Generate a new API key
     */
    async generateAPIKey(userId: string, name: string): Promise<string> {
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
    async validateAPIKey(apiKey: string): Promise<{ valid: boolean; userId?: string }> {
        const doc = await this.db.collection('apiKeys').doc(apiKey).get();

        if (!doc.exists) {
            return { valid: false };
        }

        const data = doc.data()!;

        if (!data.enabled) {
            return { valid: false };
        }

        // Update last used timestamp
        await this.db.collection('apiKeys').doc(apiKey).update({
            lastUsedAt: Date.now(),
            requestCount: admin.firestore.FieldValue.increment(1),
        });

        return { valid: true, userId: data.userId };
    }

    /**
     * Revoke API key
     */
    async revokeAPIKey(apiKey: string): Promise<void> {
        await this.db.collection('apiKeys').doc(apiKey).update({
            enabled: false,
            revokedAt: Date.now(),
        });
    }

    /**
     * List user's API keys
     */
    async listAPIKeys(userId: string): Promise<
        Array<{
            key: string;
            name: string;
            createdAt: number;
            lastUsedAt: number | null;
            enabled: boolean;
            requestCount: number;
        }>
    > {
        const snapshot = await this.db
            .collection('apiKeys')
            .where('userId', '==', userId)
            .get();

        return snapshot.docs.map(doc => doc.data() as {
            key: string;
            name: string;
            createdAt: number;
            lastUsedAt: number | null;
            enabled: boolean;
            requestCount: number;
        });
    }
}

/**
 * Input validation and sanitization
 */
export class InputValidator {
    /**
     * Sanitize user input to prevent injection attacks
     */
    static sanitize(input: string): string {
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
    static validateLength(input: string, min: number, max: number): boolean {
        return input.length >= min && input.length <= max;
    }

    /**
     * Validate email format
     */
    static validateEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Validate URL format
     */
    static validateURL(url: string): boolean {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Check for SQL injection patterns
     */
    static hasSQLInjection(input: string): boolean {
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
    static hasXSS(input: string): boolean {
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

/**
 * CORS configuration
 */
export const corsConfig = {
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
export const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
};

// Default rate limiters for different endpoints
export const defaultRateLimiters = {
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

export const apiKeyManager = new APIKeyManager();
