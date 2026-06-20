import { NextResponse } from 'next/server';
import { OrchestratorAgent } from '../../../agents/Orchestrator';
import { AgentRequest } from '../../../agents/types';

// Singleton instance (stateless, but class instance implies structure)
const orchestrator = new OrchestratorAgent();

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { role, inputs } = body;

        if (role !== 'orchestrator') {
            return NextResponse.json({
                success: false,
                logs: [],
                error: { code: 'INVALID_ROLE', message: 'Only orchestrator endpoint is exposed' }
            }, { status: 400 });
        }

        const request: AgentRequest = {
            role: 'orchestrator',
            inputs: inputs || {}
        };

        const response = await orchestrator.execute(request);

        return NextResponse.json(response);

    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        return NextResponse.json({
            success: false,
            logs: [],
            error: { code: 'INTERNAL_ERROR', message }
        }, { status: 500 });
    }
}
