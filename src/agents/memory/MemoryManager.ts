/**
 * Memory Management System for AI Agents
 * Handles conversation context, user preferences, and session state
 */

import { db } from '@/lib/firebase-admin';

export interface ConversationMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    metadata?: Record<string, unknown>;
}

export interface UserPreferences {
    userId: string;
    language?: string;
    codeStyle?: string;
    responseFormat?: string;
    customInstructions?: string;
    updatedAt: number;
}

export interface SessionContext {
    sessionId: string;
    userId?: string;
    messages: ConversationMessage[];
    metadata: Record<string, unknown>;
    createdAt: number;
    lastAccessedAt: number;
}

export class MemoryManager {
    private db = db;
    private maxContextLength = 50; // Maximum messages to keep in context
    private sessionCache = new Map<string, SessionContext>();

    /**
     * Initialize a new session
     */
    async createSession(userId?: string, metadata: Record<string, unknown> = {}): Promise<string> {
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const session: SessionContext = {
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
    async addMessage(
        sessionId: string,
        role: 'user' | 'assistant' | 'system',
        content: string,
        metadata?: Record<string, unknown>
    ): Promise<void> {
        const message: ConversationMessage = {
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
            session = doc.data() as SessionContext;
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
    async getSession(sessionId: string): Promise<SessionContext | null> {
        // Check cache first
        let session = this.sessionCache.get(sessionId);

        if (!session) {
            // Load from Firestore
            const doc = await this.db.collection('sessions').doc(sessionId).get();
            if (!doc.exists) {
                return null;
            }
            session = doc.data() as SessionContext;
            this.sessionCache.set(sessionId, session);
        }

        session.lastAccessedAt = Date.now();
        return session;
    }

    /**
     * Get conversation context for AI (formatted for prompts)
     */
    async getConversationContext(sessionId: string, maxMessages: number = 20): Promise<string> {
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
    async saveUserPreferences(preferences: UserPreferences): Promise<void> {
        preferences.updatedAt = Date.now();
        await this.db.collection('userPreferences').doc(preferences.userId).set(preferences, { merge: true });
    }

    /**
     * Get user preferences
     */
    async getUserPreferences(userId: string): Promise<UserPreferences | null> {
        const doc = await this.db.collection('userPreferences').doc(userId).get();
        if (!doc.exists) {
            return null;
        }
        return doc.data() as UserPreferences;
    }

    /**
     * Search conversation history
     */
    async searchHistory(sessionId: string, query: string): Promise<ConversationMessage[]> {
        const session = await this.getSession(sessionId);
        if (!session) {
            return [];
        }

        const lowerQuery = query.toLowerCase();
        return session.messages.filter(msg =>
            msg.content.toLowerCase().includes(lowerQuery)
        );
    }

    /**
     * Clear session (but keep in Firestore for analytics)
     */
    async clearSession(sessionId: string): Promise<void> {
        this.sessionCache.delete(sessionId);
        await this.db.collection('sessions').doc(sessionId).update({
            messages: [],
            lastAccessedAt: Date.now(),
        });
    }

    /**
     * Get summary of long conversations
     */
    async getSummary(sessionId: string): Promise<string> {
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
    async cleanupOldSessions(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
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

// Singleton instance
export const memoryManager = new MemoryManager();
