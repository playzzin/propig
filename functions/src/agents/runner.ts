import { toAgentError } from './errors';
import { getAgentByRole } from './registry';
import { agentRequestSchema } from './schemas';
import type { AgentResponse } from './types';

export const runAgent = async (rawRequest: unknown): Promise<AgentResponse> => {
    const parsed = agentRequestSchema.safeParse(rawRequest);

    if (!parsed.success) {
        return {
            success: false,
            data: null,
            logs: [],
            error: {
                code: 'INVALID_REQUEST',
                message: 'AgentRequest 형식이 올바르지 않습니다.',
                details: parsed.error.flatten(),
            },
            httpStatus: 400,
        };
    }

    try {
        const agent = getAgentByRole(parsed.data.role);
        const result = await agent.execute(parsed.data);

        const httpStatus =
            result.httpStatus ?? (result.success ? 200 : result.error ? 400 : 500);

        return {
            ...result,
            httpStatus,
        };
    } catch (error) {
        const agentError = toAgentError(error);

        return {
            success: false,
            data: null,
            logs: [],
            error: agentError.toPayload(),
            httpStatus: agentError.httpStatus,
        };
    }
};
