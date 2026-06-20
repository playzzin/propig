/**
 * Server-Sent Events (SSE) API for streaming agent responses
 * Provides real-time updates during long-running agent operations
 */

import { OrchestratorAgent } from '@/agents/Orchestrator';
import { AgentRequest } from '@/agents/types';

const orchestrator = new OrchestratorAgent();

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Stream agent responses using Server-Sent Events
 */
export async function POST(req: Request) {
    const { role, inputs } = await req.json();

    // Create a readable stream
    const stream = new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder();

            // Helper to send SSE messages
            const sendEvent = (event: string, data: unknown) => {
                const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
                controller.enqueue(encoder.encode(message));
            };

            try {
                sendEvent('start', { message: 'Agent execution started' });

                if (role !== 'orchestrator') {
                    sendEvent('error', {
                        code: 'INVALID_ROLE',
                        message: 'Only orchestrator endpoint is exposed',
                    });
                    controller.close();
                    return;
                }

                const request: AgentRequest = {
                    role: 'orchestrator',
                    inputs: inputs || {},
                };

                // Execute orchestrator with streaming logs
                const response = await orchestrator.execute(request);

                // Stream logs progressively
                if (response.logs && response.logs.length > 0) {
                    for (const log of response.logs) {
                        sendEvent('log', { message: log });
                        // Small delay to make streaming visible
                        await new Promise(resolve => setTimeout(resolve, 50));
                    }
                }

                // Send final result
                sendEvent('result', {
                    success: response.success,
                    data: response.data,
                    error: response.error,
                });

                sendEvent('done', { message: 'Execution completed' });

            } catch (error: unknown) {
                const e = error as Error;
                sendEvent('error', {
                    code: 'INTERNAL_ERROR',
                    message: e.message,
                });
            } finally {
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}
