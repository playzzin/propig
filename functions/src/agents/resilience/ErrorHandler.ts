/**
 * Advanced Error Handling and Recovery System
 * Implements retry logic, circuit breaker, and fallback strategies
 */

export class AgentError extends Error {
    constructor(
        message: string,
        public code: string,
        public retryable: boolean = false,
        public details?: unknown
    ) {
        super(message);
        this.name = 'AgentError';
    }
}

export interface RetryOptions {
    maxAttempts: number;
    delayMs: number;
    backoffMultiplier: number;
    maxDelayMs: number;
}

export interface CircuitBreakerState {
    failures: number;
    lastFailureTime: number;
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

/**
 * Retry with exponential backoff
 */
export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {
        maxAttempts: 3,
        delayMs: 1000,
        backoffMultiplier: 2,
        maxDelayMs: 10000,
    }
): Promise<T> {
    let lastError: Error;
    let delay = options.delayMs;

    for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error as Error;

            // Don't retry on non-retryable errors
            if (error instanceof AgentError && !error.retryable) {
                throw error;
            }

            // Last attempt - throw error
            if (attempt === options.maxAttempts) {
                throw new AgentError(
                    `Failed after ${options.maxAttempts} attempts: ${lastError.message}`,
                    'MAX_RETRIES_EXCEEDED',
                    false,
                    { originalError: lastError, attempts: attempt }
                );
            }

            // Wait before retry with exponential backoff
            await new Promise(resolve => setTimeout(resolve, delay));
            delay = Math.min(delay * options.backoffMultiplier, options.maxDelayMs);
        }
    }

    throw lastError!;
}

/**
 * Circuit Breaker Pattern
 * Prevents cascading failures by stopping requests when error rate is high
 */
export class CircuitBreaker {
    private state: CircuitBreakerState = {
        failures: 0,
        lastFailureTime: 0,
        state: 'CLOSED',
    };

    constructor(
        private failureThreshold: number = 5,
        private resetTimeoutMs: number = 60000,
        private halfOpenAttempts: number = 1
    ) {}

    async execute<T>(fn: () => Promise<T>): Promise<T> {
        // Check if circuit should be reset
        if (
            this.state.state === 'OPEN' &&
            Date.now() - this.state.lastFailureTime > this.resetTimeoutMs
        ) {
            this.state.state = 'HALF_OPEN';
            this.state.failures = 0;
        }

        // Circuit is open - fail fast
        if (this.state.state === 'OPEN') {
            throw new AgentError(
                'Circuit breaker is OPEN. Service temporarily unavailable.',
                'CIRCUIT_BREAKER_OPEN',
                false,
                { failureCount: this.state.failures }
            );
        }

        try {
            const result = await fn();

            // Success - reset circuit if half-open
            if (this.state.state === 'HALF_OPEN') {
                this.state.state = 'CLOSED';
                this.state.failures = 0;
            }

            return result;
        } catch (error) {
            this.state.failures++;
            this.state.lastFailureTime = Date.now();

            // Open circuit if threshold exceeded
            if (this.state.failures >= this.failureThreshold) {
                this.state.state = 'OPEN';
            }

            throw error;
        }
    }

    getState(): CircuitBreakerState {
        return { ...this.state };
    }

    reset(): void {
        this.state = {
            failures: 0,
            lastFailureTime: 0,
            state: 'CLOSED',
        };
    }
}

/**
 * Timeout with cleanup
 */
export async function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage = 'Operation timed out'
): Promise<T> {
    let timeoutHandle: NodeJS.Timeout;

    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
            reject(
                new AgentError(
                    timeoutMessage,
                    'TIMEOUT',
                    true,
                    { timeoutMs }
                )
            );
        }, timeoutMs);
    });

    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        clearTimeout(timeoutHandle!);
    }
}

/**
 * Fallback strategy
 */
export async function withFallback<T>(
    primary: () => Promise<T>,
    fallback: () => Promise<T>,
    fallbackCondition: (error: Error) => boolean = () => true
): Promise<T> {
    try {
        return await primary();
    } catch (error) {
        if (fallbackCondition(error as Error)) {
            return await fallback();
        }
        throw error;
    }
}

/**
 * Batch error aggregation
 */
export class ErrorAggregator {
    private errors: Array<{ error: Error; context: string; timestamp: number }> = [];

    add(error: Error, context: string): void {
        this.errors.push({
            error,
            context,
            timestamp: Date.now(),
        });
    }

    hasErrors(): boolean {
        return this.errors.length > 0;
    }

    getErrors(): typeof this.errors {
        return [...this.errors];
    }

    getReport(): string {
        if (this.errors.length === 0) {
            return 'No errors reported.';
        }

        return this.errors
            .map(
                ({ error, context, timestamp }) =>
                    `[${new Date(timestamp).toISOString()}] ${context}: ${error.message}`
            )
            .join('\n');
    }

    clear(): void {
        this.errors = [];
    }
}

/**
 * Global error handler with logging
 */
export class GlobalErrorHandler {
    private static instance: GlobalErrorHandler;
    private errorLog: Array<{ error: Error; timestamp: number; handled: boolean }> = [];

    static getInstance(): GlobalErrorHandler {
        if (!GlobalErrorHandler.instance) {
            GlobalErrorHandler.instance = new GlobalErrorHandler();
        }
        return GlobalErrorHandler.instance;
    }

    handle(error: Error, context?: string): void {
        this.errorLog.push({
            error,
            timestamp: Date.now(),
            handled: true,
        });

        console.error(`[GlobalErrorHandler] ${context || 'Unknown context'}:`, error);

        // In production, send to monitoring service
        // this.sendToMonitoring(error, context);
    }

    getRecentErrors(limit: number = 10): typeof this.errorLog {
        return this.errorLog.slice(-limit);
    }

    clearLog(): void {
        this.errorLog = [];
    }
}
