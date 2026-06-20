/**
 * Performance Monitoring and Metrics Collection System
 * Tracks agent performance, usage patterns, and system health
 */

import admin from '@/lib/firebase-admin';

export interface AgentMetrics {
    agentRole: string;
    executionTimeMs: number;
    success: boolean;
    errorCode?: string;
    timestamp: number;
    userId?: string;
    sessionId?: string;
    metadata?: Record<string, unknown>;
}

export interface SystemMetrics {
    metric: string;
    value: number;
    unit: string;
    timestamp: number;
    tags?: Record<string, string>;
}

export interface PerformanceReport {
    period: 'hour' | 'day' | 'week' | 'month';
    totalRequests: number;
    successRate: number;
    averageExecutionTime: number;
    errorBreakdown: Record<string, number>;
    agentUsage: Record<string, number>;
}

/**
 * Metrics collection and analysis
 */
export class MetricsCollector {
    private db = admin.firestore();
    private metricsBuffer: AgentMetrics[] = [];
    private bufferSize = 100;
    private flushInterval = 60000; // 1 minute

    constructor() {
        // Auto-flush metrics periodically
        setInterval(() => this.flush(), this.flushInterval);
    }

    /**
     * Record agent execution metrics
     */
    async recordAgentExecution(metrics: AgentMetrics): Promise<void> {
        this.metricsBuffer.push(metrics);

        // Flush if buffer is full
        if (this.metricsBuffer.length >= this.bufferSize) {
            await this.flush();
        }
    }

    /**
     * Flush metrics buffer to Firestore
     */
    async flush(): Promise<void> {
        if (this.metricsBuffer.length === 0) {
            return;
        }

        const batch = this.db.batch();
        const metricsToFlush = [...this.metricsBuffer];
        this.metricsBuffer = [];

        for (const metric of metricsToFlush) {
            const docRef = this.db.collection('agentMetrics').doc();
            batch.set(docRef, metric);
        }

        await batch.commit();
    }

    /**
     * Record system-level metrics
     */
    async recordSystemMetric(metric: SystemMetrics): Promise<void> {
        await this.db.collection('systemMetrics').add(metric);
    }

    /**
     * Get performance report for a time period
     */
    async getPerformanceReport(
        period: 'hour' | 'day' | 'week' | 'month',
        userId?: string
    ): Promise<PerformanceReport> {
        const now = Date.now();
        const periodMs = {
            hour: 60 * 60 * 1000,
            day: 24 * 60 * 60 * 1000,
            week: 7 * 24 * 60 * 60 * 1000,
            month: 30 * 24 * 60 * 60 * 1000,
        };

        const startTime = now - periodMs[period];

        let query = this.db
            .collection('agentMetrics')
            .where('timestamp', '>=', startTime);

        if (userId) {
            query = query.where('userId', '==', userId);
        }

        const snapshot = await query.get();
        const metrics = snapshot.docs.map(doc => doc.data() as AgentMetrics);

        // Calculate statistics
        const totalRequests = metrics.length;
        const successfulRequests = metrics.filter(m => m.success).length;
        const successRate = totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0;

        const executionTimes = metrics.map(m => m.executionTimeMs);
        const averageExecutionTime =
            executionTimes.length > 0
                ? executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length
                : 0;

        // Error breakdown
        const errorBreakdown: Record<string, number> = {};
        metrics
            .filter(m => !m.success && m.errorCode)
            .forEach(m => {
                const code = m.errorCode!;
                errorBreakdown[code] = (errorBreakdown[code] || 0) + 1;
            });

        // Agent usage
        const agentUsage: Record<string, number> = {};
        metrics.forEach(m => {
            agentUsage[m.agentRole] = (agentUsage[m.agentRole] || 0) + 1;
        });

        return {
            period,
            totalRequests,
            successRate,
            averageExecutionTime,
            errorBreakdown,
            agentUsage,
        };
    }

    /**
     * Get real-time statistics
     */
    async getRealtimeStats(): Promise<{
        activeUsers: number;
        requestsPerMinute: number;
        averageResponseTime: number;
    }> {
        const oneMinuteAgo = Date.now() - 60000;

        const snapshot = await this.db
            .collection('agentMetrics')
            .where('timestamp', '>=', oneMinuteAgo)
            .get();

        const metrics = snapshot.docs.map(doc => doc.data() as AgentMetrics);

        const activeUsers = new Set(metrics.map(m => m.userId).filter(Boolean)).size;
        const requestsPerMinute = metrics.length;

        const executionTimes = metrics.map(m => m.executionTimeMs);
        const averageResponseTime =
            executionTimes.length > 0
                ? executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length
                : 0;

        return {
            activeUsers,
            requestsPerMinute,
            averageResponseTime,
        };
    }

    /**
     * Track slow queries (performance analysis)
     */
    async trackSlowQuery(
        agentRole: string,
        executionTimeMs: number,
        threshold: number = 5000
    ): Promise<void> {
        if (executionTimeMs > threshold) {
            await this.db.collection('slowQueries').add({
                agentRole,
                executionTimeMs,
                threshold,
                timestamp: Date.now(),
            });
        }
    }

    /**
     * Get error rate over time
     */
    async getErrorRate(hours: number = 24): Promise<Array<{ hour: number; errorRate: number }>> {
        const now = Date.now();
        const hourMs = 60 * 60 * 1000;
        const startTime = now - hours * hourMs;

        const snapshot = await this.db
            .collection('agentMetrics')
            .where('timestamp', '>=', startTime)
            .get();

        const metrics = snapshot.docs.map(doc => doc.data() as AgentMetrics);

        // Group by hour
        const hourlyData: Record<number, { total: number; errors: number }> = {};

        metrics.forEach(metric => {
            const hour = Math.floor((metric.timestamp - startTime) / hourMs);
            if (!hourlyData[hour]) {
                hourlyData[hour] = { total: 0, errors: 0 };
            }
            hourlyData[hour].total++;
            if (!metric.success) {
                hourlyData[hour].errors++;
            }
        });

        // Calculate error rate per hour
        return Object.entries(hourlyData).map(([hour, data]) => ({
            hour: parseInt(hour),
            errorRate: (data.errors / data.total) * 100,
        }));
    }

    /**
     * Get most popular agent roles
     */
    async getPopularAgents(limit: number = 10): Promise<Array<{ role: string; count: number }>> {
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

        const snapshot = await this.db
            .collection('agentMetrics')
            .where('timestamp', '>=', oneDayAgo)
            .get();

        const metrics = snapshot.docs.map(doc => doc.data() as AgentMetrics);

        const roleCounts: Record<string, number> = {};
        metrics.forEach(m => {
            roleCounts[m.agentRole] = (roleCounts[m.agentRole] || 0) + 1;
        });

        return Object.entries(roleCounts)
            .map(([role, count]) => ({ role, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    }

    /**
     * Clean up old metrics (data retention)
     */
    async cleanupOldMetrics(retentionDays: number = 30): Promise<number> {
        const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

        const snapshot = await this.db
            .collection('agentMetrics')
            .where('timestamp', '<', cutoffTime)
            .limit(500) // Batch delete
            .get();

        const batch = this.db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));

        await batch.commit();
        return snapshot.size;
    }
}

// Singleton instance
export const metricsCollector = new MetricsCollector();

/**
 * Performance tracking decorator
 */
export function trackPerformance(agentRole: string) {
    return function (
        target: unknown,
        propertyKey: string,
        descriptor: PropertyDescriptor
    ) {
        const originalMethod = descriptor.value;

        descriptor.value = async function (...args: unknown[]) {
            const startTime = Date.now();
            let success = true;
            let errorCode: string | undefined;

            try {
                return await originalMethod.apply(this, args);
            } catch (error) {
                success = false;
                errorCode = (error as { code?: string }).code || 'UNKNOWN_ERROR';
                throw error;
            } finally {
                const executionTimeMs = Date.now() - startTime;

                await metricsCollector.recordAgentExecution({
                    agentRole,
                    executionTimeMs,
                    success,
                    errorCode,
                    timestamp: Date.now(),
                });
            }
        };

        return descriptor;
    };
}
