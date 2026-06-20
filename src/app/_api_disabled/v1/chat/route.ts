/**
 * Production-Ready Chat API Endpoint
 * Combines all advanced features: memory, RAG, tools, streaming, etc.
 */

import { NextRequest, NextResponse } from 'next/server';
import { OrchestratorAgent } from '@/agents/Orchestrator';
import { memoryManager } from '@/agents/memory/MemoryManager';
import { ragSystem } from '@/agents/rag/VectorStore';
import { toolRegistry } from '@/agents/tools/ToolRegistry';
import { metricsCollector } from '@/agents/monitoring/MetricsCollector';
import { defaultRateLimiters, InputValidator } from '@/agents/security/RateLimiter';
import { retryWithBackoff } from '@/agents/resilience/ErrorHandler';

const orchestrator = new OrchestratorAgent();

export async function POST(req: NextRequest) {
    const startTime = Date.now();
    let errorCode: string | undefined;

    try {
        // 1. Rate Limiting
        const clientIP = req.headers.get('x-forwarded-for') || 'unknown';
        const rateLimitInfo = await defaultRateLimiters.public.checkLimit(clientIP);

        if (rateLimitInfo.blocked) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'RATE_LIMIT_EXCEEDED',
                        message: 'Too many requests. Please try again later.',
                        resetAt: rateLimitInfo.resetAt,
                    },
                },
                { status: 429 }
            );
        }

        // 2. Parse and validate request
        const body = await req.json();
        const { message, sessionId, userId, useRAG, useTool } = body;

        if (!message || typeof message !== 'string') {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'INVALID_REQUEST',
                        message: 'Message is required and must be a string',
                    },
                },
                { status: 400 }
            );
        }

        // Sanitize input
        const sanitizedMessage = InputValidator.sanitize(message);

        // Validate length
        if (!InputValidator.validateLength(sanitizedMessage, 1, 5000)) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'INVALID_INPUT',
                        message: 'Message must be between 1 and 5000 characters',
                    },
                },
                { status: 400 }
            );
        }

        // Check for injection attacks
        if (InputValidator.hasSQLInjection(sanitizedMessage) || InputValidator.hasXSS(sanitizedMessage)) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'SECURITY_VIOLATION',
                        message: 'Message contains potentially malicious content',
                    },
                },
                { status: 400 }
            );
        }

        // 3. Manage session and memory
        let currentSessionId = sessionId;
        if (!currentSessionId) {
            currentSessionId = await memoryManager.createSession(userId);
        }

        // Add user message to context
        await memoryManager.addMessage(currentSessionId, 'user', sanitizedMessage);

        // 4. Optional: RAG-based context retrieval
        let ragContext = '';
        if (useRAG) {
            const ragResult = await ragSystem.retrieveContext(sanitizedMessage, 3);
            ragContext = ragResult.augmentedPrompt;
        }

        // 5. Optional: Tool execution
        let toolResult: unknown = undefined;
        if (useTool && body.toolName) {
            toolResult = await toolRegistry.executeTool(body.toolName, body.toolParams || {});
        }

        // 6. Execute agent with retry logic
        const response = await retryWithBackoff(
            async () => {
                return orchestrator.execute({
                    role: 'orchestrator',
                    inputs: {
                        command: 'generate',
                        payload: {
                            userInput: sanitizedMessage,
                            ragContext,
                            toolResult,
                            sessionContext: await memoryManager.getConversationContext(currentSessionId),
                        },
                    },
                });
            },
            {
                maxAttempts: 3,
                delayMs: 1000,
                backoffMultiplier: 2,
                maxDelayMs: 5000,
            }
        );

        // 7. Save assistant response to memory
        await memoryManager.addMessage(
            currentSessionId,
            'assistant',
            JSON.stringify(response.data)
        );

        // 8. Record metrics
        const executionTimeMs = Date.now() - startTime;
        await metricsCollector.recordAgentExecution({
            agentRole: 'orchestrator',
            executionTimeMs,
            success: response.success,
            errorCode: response.error?.code,
            timestamp: Date.now(),
            userId,
            sessionId: currentSessionId,
        });

        // 9. Return response
        return NextResponse.json(
            {
                success: response.success,
                data: response.data,
                sessionId: currentSessionId,
                logs: response.logs,
                metadata: {
                    executionTimeMs,
                    rateLimitRemaining: rateLimitInfo.remaining,
                    usedRAG: !!useRAG,
                    usedTool: !!useTool,
                },
            },
            { status: 200 }
        );

    } catch (error: unknown) {
        const e = error as Error;
        errorCode = 'INTERNAL_ERROR';

        // Record error metrics
        await metricsCollector.recordAgentExecution({
            agentRole: 'orchestrator',
            executionTimeMs: Date.now() - startTime,
            success: false,
            errorCode,
            timestamp: Date.now(),
        });

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: errorCode,
                    message: e.message,
                },
            },
            { status: 500 }
        );
    }
}

/**
 * Health check endpoint
 */
export async function GET() {
    try {
        const stats = await metricsCollector.getRealtimeStats();

        return NextResponse.json({
            status: 'healthy',
            timestamp: Date.now(),
            stats,
        });
    } catch (error) {
        return NextResponse.json(
            {
                status: 'unhealthy',
                error: (error as Error).message,
            },
            { status: 500 }
        );
    }
}
