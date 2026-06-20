import { AgentErrorPayload, AgentRequest, AgentResponse } from './types';

export abstract class BaseAgent {
    /**
     * Main execution method.
     * Must be stateless and side-effect free (unless it's the specific role of the agent).
     */
    abstract execute(request: AgentRequest): Promise<AgentResponse>;

    protected createResponse(
        success: boolean,
        data: unknown,
        logs: string[] = [],
        error?: AgentErrorPayload,
    ): AgentResponse {
        return {
            success,
            data,
            logs,
            ...(error ? { error } : {}),
        };
    }
}
