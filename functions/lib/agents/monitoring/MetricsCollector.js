"use strict";
/**
 * Performance Monitoring and Metrics Collection System
 * Tracks agent performance, usage patterns, and system health
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.metricsCollector = exports.MetricsCollector = void 0;
exports.trackPerformance = trackPerformance;
const firebase_admin_1 = require("@/lib/firebase-admin");
/**
 * Metrics collection and analysis
 */
class MetricsCollector {
    constructor() {
        this.db = firebase_admin_1.default.firestore();
        this.metricsBuffer = [];
        this.bufferSize = 100;
        this.flushInterval = 60000; // 1 minute
        // Auto-flush metrics periodically
        setInterval(() => this.flush(), this.flushInterval);
    }
    /**
     * Record agent execution metrics
     */
    async recordAgentExecution(metrics) {
        this.metricsBuffer.push(metrics);
        // Flush if buffer is full
        if (this.metricsBuffer.length >= this.bufferSize) {
            await this.flush();
        }
    }
    /**
     * Flush metrics buffer to Firestore
     */
    async flush() {
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
    async recordSystemMetric(metric) {
        await this.db.collection('systemMetrics').add(metric);
    }
    /**
     * Get performance report for a time period
     */
    async getPerformanceReport(period, userId) {
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
        const metrics = snapshot.docs.map(doc => doc.data());
        // Calculate statistics
        const totalRequests = metrics.length;
        const successfulRequests = metrics.filter(m => m.success).length;
        const successRate = totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0;
        const executionTimes = metrics.map(m => m.executionTimeMs);
        const averageExecutionTime = executionTimes.length > 0
            ? executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length
            : 0;
        // Error breakdown
        const errorBreakdown = {};
        metrics
            .filter(m => !m.success && m.errorCode)
            .forEach(m => {
            const code = m.errorCode;
            errorBreakdown[code] = (errorBreakdown[code] || 0) + 1;
        });
        // Agent usage
        const agentUsage = {};
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
    async getRealtimeStats() {
        const oneMinuteAgo = Date.now() - 60000;
        const snapshot = await this.db
            .collection('agentMetrics')
            .where('timestamp', '>=', oneMinuteAgo)
            .get();
        const metrics = snapshot.docs.map(doc => doc.data());
        const activeUsers = new Set(metrics.map(m => m.userId).filter(Boolean)).size;
        const requestsPerMinute = metrics.length;
        const executionTimes = metrics.map(m => m.executionTimeMs);
        const averageResponseTime = executionTimes.length > 0
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
    async trackSlowQuery(agentRole, executionTimeMs, threshold = 5000) {
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
    async getErrorRate(hours = 24) {
        const now = Date.now();
        const hourMs = 60 * 60 * 1000;
        const startTime = now - hours * hourMs;
        const snapshot = await this.db
            .collection('agentMetrics')
            .where('timestamp', '>=', startTime)
            .get();
        const metrics = snapshot.docs.map(doc => doc.data());
        // Group by hour
        const hourlyData = {};
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
    async getPopularAgents(limit = 10) {
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        const snapshot = await this.db
            .collection('agentMetrics')
            .where('timestamp', '>=', oneDayAgo)
            .get();
        const metrics = snapshot.docs.map(doc => doc.data());
        const roleCounts = {};
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
    async cleanupOldMetrics(retentionDays = 30) {
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
exports.MetricsCollector = MetricsCollector;
// Singleton instance
exports.metricsCollector = new MetricsCollector();
/**
 * Performance tracking decorator
 */
function trackPerformance(agentRole) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        descriptor.value = async function (...args) {
            const startTime = Date.now();
            let success = true;
            let errorCode;
            try {
                return await originalMethod.apply(this, args);
            }
            catch (error) {
                success = false;
                errorCode = error.code || 'UNKNOWN_ERROR';
                throw error;
            }
            finally {
                const executionTimeMs = Date.now() - startTime;
                await exports.metricsCollector.recordAgentExecution({
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
//# sourceMappingURL=MetricsCollector.js.map