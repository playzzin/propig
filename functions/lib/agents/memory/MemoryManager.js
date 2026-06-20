"use strict";
/**
 * Memory Management System for AI Agents
 * Handles conversation context, user preferences, and session state
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoryManager = exports.MemoryManager = void 0;
const firebase_admin_1 = require("@/lib/firebase-admin");
class MemoryManager {
    constructor() {
        this.db = firebase_admin_1.db;
        this.maxContextLength = 50; // Maximum messages to keep in context
        this.sessionCache = new Map();
    }
    /**
     * Initialize a new session
     */
    async createSession(userId, metadata = {}) {
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const session = {
            sessionId,
            userId,
            messages: [],
            metadata,
            createdAt: Date.now(),
            lastAccessedAt: Date.now(),
        };
        this.sessionCache.set(sessionId, session);
        // Persist to Firestore
        await this.db.collection('sessions').doc(sessionId).set(session);
        return sessionId;
    }
    /**
     * Add a message to session context
     */
    async addMessage(sessionId, role, content, metadata) {
        const message = {
            role,
            content,
            timestamp: Date.now(),
            metadata,
        };
        let session = this.sessionCache.get(sessionId);
        if (!session) {
            // Load from Firestore
            const doc = await this.db.collection('sessions').doc(sessionId).get();
            if (!doc.exists) {
                throw new Error(`Session ${sessionId} not found`);
            }
            session = doc.data();
            this.sessionCache.set(sessionId, session);
        }
        session.messages.push(message);
        session.lastAccessedAt = Date.now();
        // Implement sliding window to prevent context overflow
        if (session.messages.length > this.maxContextLength) {
            // Keep system messages and recent messages
            const systemMessages = session.messages.filter(m => m.role === 'system');
            const recentMessages = session.messages.slice(-this.maxContextLength);
            session.messages = [...systemMessages, ...recentMessages];
        }
        // Update Firestore
        await this.db.collection('sessions').doc(sessionId).update({
            messages: session.messages,
            lastAccessedAt: session.lastAccessedAt,
        });
    }
    /**
     * Get session context
     */
    async getSession(sessionId) {
        // Check cache first
        let session = this.sessionCache.get(sessionId);
        if (!session) {
            // Load from Firestore
            const doc = await this.db.collection('sessions').doc(sessionId).get();
            if (!doc.exists) {
                return null;
            }
            session = doc.data();
            this.sessionCache.set(sessionId, session);
        }
        session.lastAccessedAt = Date.now();
        return session;
    }
    /**
     * Get conversation context for AI (formatted for prompts)
     */
    async getConversationContext(sessionId, maxMessages = 20) {
        const session = await this.getSession(sessionId);
        if (!session) {
            return '';
        }
        const recentMessages = session.messages.slice(-maxMessages);
        return recentMessages
            .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
            .join('\n\n');
    }
    /**
     * Save user preferences
     */
    async saveUserPreferences(preferences) {
        preferences.updatedAt = Date.now();
        await this.db.collection('userPreferences').doc(preferences.userId).set(preferences, { merge: true });
    }
    /**
     * Get user preferences
     */
    async getUserPreferences(userId) {
        const doc = await this.db.collection('userPreferences').doc(userId).get();
        if (!doc.exists) {
            return null;
        }
        return doc.data();
    }
    /**
     * Search conversation history
     */
    async searchHistory(sessionId, query) {
        const session = await this.getSession(sessionId);
        if (!session) {
            return [];
        }
        const lowerQuery = query.toLowerCase();
        return session.messages.filter(msg => msg.content.toLowerCase().includes(lowerQuery));
    }
    /**
     * Clear session (but keep in Firestore for analytics)
     */
    async clearSession(sessionId) {
        this.sessionCache.delete(sessionId);
        await this.db.collection('sessions').doc(sessionId).update({
            messages: [],
            lastAccessedAt: Date.now(),
        });
    }
    /**
     * Get summary of long conversations
     */
    async getSummary(sessionId) {
        const session = await this.getSession(sessionId);
        if (!session || session.messages.length === 0) {
            return 'No conversation history.';
        }
        const messageCount = session.messages.length;
        const duration = session.lastAccessedAt - session.createdAt;
        const durationMinutes = Math.floor(duration / 60000);
        return `Session: ${messageCount} messages over ${durationMinutes} minutes`;
    }
    /**
     * Clean up old sessions (garbage collection)
     */
    async cleanupOldSessions(maxAgeMs = 24 * 60 * 60 * 1000) {
        const cutoffTime = Date.now() - maxAgeMs;
        const snapshot = await this.db
            .collection('sessions')
            .where('lastAccessedAt', '<', cutoffTime)
            .get();
        const batch = this.db.batch();
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
            this.sessionCache.delete(doc.id);
        });
        await batch.commit();
        return snapshot.size;
    }
}
exports.MemoryManager = MemoryManager;
// Singleton instance
exports.memoryManager = new MemoryManager();
//# sourceMappingURL=MemoryManager.js.map