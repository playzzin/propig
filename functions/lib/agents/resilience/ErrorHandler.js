"use strict";
/**
 * Advanced Error Handling and Recovery System
 * Implements retry logic, circuit breaker, and fallback strategies
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlobalErrorHandler = exports.ErrorAggregator = exports.CircuitBreaker = exports.AgentError = void 0;
exports.retryWithBackoff = retryWithBackoff;
exports.withTimeout = withTimeout;
exports.withFallback = withFallback;
class AgentError extends Error {
    constructor(message, code, retryable = false, details) {
        super(message);
        this.code = code;
        this.retryable = retryable;
        this.details = details;
        this.name = 'AgentError';
    }
}
exports.AgentError = AgentError;
/**
 * Retry with exponential backoff
 */
async function retryWithBackoff(fn, options = {
    maxAttempts: 3,
    delayMs: 1000,
    backoffMultiplier: 2,
    maxDelayMs: 10000,
}) {
    let lastError;
    let delay = options.delayMs;
    for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error;
            // Don't retry on non-retryable errors
            if (error instanceof AgentError && !error.retryable) {
                throw error;
            }
            // Last attempt - throw error
            if (attempt === options.maxAttempts) {
                throw new AgentError(`Failed after ${options.maxAttempts} attempts: ${lastError.message}`, 'MAX_RETRIES_EXCEEDED', false, { originalError: lastError, attempts: attempt });
            }
            // Wait before retry with exponential backoff
            await new Promise(resolve => setTimeout(resolve, delay));
            delay = Math.min(delay * options.backoffMultiplier, options.maxDelayMs);
        }
    }
    throw lastError;
}
/**
 * Circuit Breaker Pattern
 * Prevents cascading failures by stopping requests when error rate is high
 */
class CircuitBreaker {
    constructor(failureThreshold = 5, resetTimeoutMs = 60000, halfOpenAttempts = 1) {
        this.failureThreshold = failureThreshold;
        this.resetTimeoutMs = resetTimeoutMs;
        this.halfOpenAttempts = halfOpenAttempts;
        this.state = {
            failures: 0,
            lastFailureTime: 0,
            state: 'CLOSED',
        };
    }
    async execute(fn) {
        // Check if circuit should be reset
        if (this.state.state === 'OPEN' &&
            Date.now() - this.state.lastFailureTime > this.resetTimeoutMs) {
            this.state.state = 'HALF_OPEN';
            this.state.failures = 0;
        }
        // Circuit is open - fail fast
        if (this.state.state === 'OPEN') {
            throw new AgentError('Circuit breaker is OPEN. Service temporarily unavailable.', 'CIRCUIT_BREAKER_OPEN', false, { failureCount: this.state.failures });
        }
        try {
            const result = await fn();
            // Success - reset circuit if half-open
            if (this.state.state === 'HALF_OPEN') {
                this.state.state = 'CLOSED';
                this.state.failures = 0;
            }
            return result;
        }
        catch (error) {
            this.state.failures++;
            this.state.lastFailureTime = Date.now();
            // Open circuit if threshold exceeded
            if (this.state.failures >= this.failureThreshold) {
                this.state.state = 'OPEN';
            }
            throw error;
        }
    }
    getState() {
        return Object.assign({}, this.state);
    }
    reset() {
        this.state = {
            failures: 0,
            lastFailureTime: 0,
            state: 'CLOSED',
        };
    }
}
exports.CircuitBreaker = CircuitBreaker;
/**
 * Timeout with cleanup
 */
async function withTimeout(promise, timeoutMs, timeoutMessage = 'Operation timed out') {
    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
            reject(new AgentError(timeoutMessage, 'TIMEOUT', true, { timeoutMs }));
        }, timeoutMs);
    });
    try {
        return await Promise.race([promise, timeoutPromise]);
    }
    finally {
        clearTimeout(timeoutHandle);
    }
}
/**
 * Fallback strategy
 */
async function withFallback(primary, fallback, fallbackCondition = () => true) {
    try {
        return await primary();
    }
    catch (error) {
        if (fallbackCondition(error)) {
            return await fallback();
        }
        throw error;
    }
}
/**
 * Batch error aggregation
 */
class ErrorAggregator {
    constructor() {
        this.errors = [];
    }
    add(error, context) {
        this.errors.push({
            error,
            context,
            timestamp: Date.now(),
        });
    }
    hasErrors() {
        return this.errors.length > 0;
    }
    getErrors() {
        return [...this.errors];
    }
    getReport() {
        if (this.errors.length === 0) {
            return 'No errors reported.';
        }
        return this.errors
            .map(({ error, context, timestamp }) => `[${new Date(timestamp).toISOString()}] ${context}: ${error.message}`)
            .join('\n');
    }
    clear() {
        this.errors = [];
    }
}
exports.ErrorAggregator = ErrorAggregator;
/**
 * Global error handler with logging
 */
class GlobalErrorHandler {
    constructor() {
        this.errorLog = [];
    }
    static getInstance() {
        if (!GlobalErrorHandler.instance) {
            GlobalErrorHandler.instance = new GlobalErrorHandler();
        }
        return GlobalErrorHandler.instance;
    }
    handle(error, context) {
        this.errorLog.push({
            error,
            timestamp: Date.now(),
            handled: true,
        });
        console.error(`[GlobalErrorHandler] ${context || 'Unknown context'}:`, error);
        // In production, send to monitoring service
        // this.sendToMonitoring(error, context);
    }
    getRecentErrors(limit = 10) {
        return this.errorLog.slice(-limit);
    }
    clearLog() {
        this.errorLog = [];
    }
}
exports.GlobalErrorHandler = GlobalErrorHandler;
//# sourceMappingURL=ErrorHandler.js.map