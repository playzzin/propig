import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { OrchestratorAgent } from '@/agents/Orchestrator';
import { RateLimiter } from '@/agents/security/RateLimiter';
import { MetricsCollector } from '@/agents/monitoring/MetricsCollector';

/**
 * Production Agent API Route
 *
 * Main endpoint for agent execution with:
 * - Rate limiting
 * - Performance monitoring
 * - Error handling
 * - Zod validation
 *
 * @route POST /api/agent
 *
 * @example
 * ```bash
 * curl -X POST http://localhost:3000/api/agent \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "command": "generate",
 *     "payload": { "userInput": "Create a React component" }
 *   }'
 * ```
 */

// ============================================
// Request/Response Schemas
// ============================================

const agentRequestBodySchema = z.object({
    command: z.string().min(1),
    payload: z.record(z.string(), z.unknown()).optional(),
    sessionId: z.string().optional(),
});

const agentResponseSchema = z.object({
    success: z.boolean(),
    data: z.unknown().nullable(),
    logs: z.array(z.string()),
    error: z
        .object({
            code: z.string(),
            message: z.string(),
            details: z.unknown().optional(),
        })
        .optional(),
    metrics: z
        .object({
            duration: z.number(),
            timestamp: z.string(),
        })
        .optional(),
});

// ============================================
// Singleton Instances
// ============================================

const rateLimiter = new RateLimiter({
    windowMs: 60000,
    maxRequests: 100,
    identifier: 'ip',
});
const metricsCollector = new MetricsCollector();
const orchestrator = new OrchestratorAgent();

// ============================================
// POST Handler
// ============================================

export async function POST(request: NextRequest) {
    const startTime = Date.now();
    let requestBody: z.infer<typeof agentRequestBodySchema> | null = null;

    try {
        // ============================================
        // 1. Parse and Validate Request
        // ============================================

        const body = await request.json();
        requestBody = agentRequestBodySchema.parse(body);

        const { command, payload, sessionId } = requestBody;

        // ============================================
        // 2. Rate Limiting
        // ============================================

        const clientId = sessionId || 'anonymous';

        const rateLimit = await rateLimiter.checkLimit(clientId);

        if (rateLimit.blocked) {
            return NextResponse.json(
                {
                    success: false,
                    data: null,
                    logs: ['[API] Rate limit exceeded'],
                    error: {
                        code: 'RATE_LIMIT_EXCEEDED',
                        message: 'Too many requests. Please try again later.',
                    },
                },
                {
                    status: 429,
                    headers: {
                        'X-RateLimit-Remaining': rateLimit.remaining.toString(),
                        'X-RateLimit-Reset': new Date(rateLimit.resetAt).toISOString(),
                    }
                }
            );
        }

        // ============================================
        // 3. Execute Agent
        // ============================================

        const agentResponse = await orchestrator.execute({
            role: 'orchestrator',
            inputs: { command, payload },
        });

        // ============================================
        // 4. Collect Metrics
        // ============================================

        const duration = Date.now() - startTime;

        await metricsCollector.recordAgentExecution({
            agentRole: 'orchestrator',
            executionTimeMs: duration,
            success: agentResponse.success,
            errorCode: agentResponse.error?.code,
            timestamp: Date.now(),
            sessionId: sessionId,
            metadata: { command },
        });

        // ============================================
        // 5. Build Response
        // ============================================

        const response = agentResponseSchema.parse({
            success: agentResponse.success,
            data: agentResponse.data,
            logs: agentResponse.logs,
            error: agentResponse.error,
            metrics: {
                duration,
                timestamp: new Date().toISOString(),
            },
        });

        const statusCode = agentResponse.success ? 200 : 500;

        return NextResponse.json(response, {
            status: statusCode,
            headers: {
                'X-Request-Duration': `${duration}ms`,
                'X-Agent-Command': command,
            },
        });
    } catch (error) {
        // ============================================
        // Error Handling
        // ============================================

        const duration = Date.now() - startTime;

        // Log error for monitoring
        console.error('[API Error]', {
            error: error instanceof Error ? error.message : String(error),
            request: requestBody,
            duration,
        });

        // Zod validation errors
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                {
                    success: false,
                    data: null,
                    logs: ['[API] Request validation failed'],
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'Invalid request format',
                        details: error.issues,
                    },
                },
                { status: 400 }
            );
        }

        // Generic error response
        return NextResponse.json(
            {
                success: false,
                data: null,
                logs: ['[API] Internal server error'],
                error: {
                    code: 'INTERNAL_ERROR',
                    message: error instanceof Error ? error.message : 'Unknown error occurred',
                },
                metrics: {
                    duration,
                    timestamp: new Date().toISOString(),
                },
            },
            { status: 500 }
        );
    }
}

// ============================================
// GET Handler (Health Check)
// ============================================

export async function GET() {
    try {
        const report = await metricsCollector.getPerformanceReport('hour');
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            metrics: report,
        };

        return NextResponse.json(health, { status: 200 });
    } catch (error) {
        return NextResponse.json(
            {
                status: 'unhealthy',
                error: error instanceof Error ? error.message : String(error),
            },
            { status: 503 }
        );
    }
}
