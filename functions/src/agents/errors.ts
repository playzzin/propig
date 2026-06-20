import { AgentErrorPayload } from './types';

export class AgentError extends Error {
    public readonly code: string;
    public readonly httpStatus: number;
    public readonly details?: unknown;

    public constructor(params: {
        code: string;
        message: string;
        httpStatus?: number;
        details?: unknown;
    }) {
        super(params.message);
        this.name = 'AgentError';
        this.code = params.code;
        this.httpStatus = params.httpStatus ?? 500;
        this.details = params.details;
    }

    public toPayload(): AgentErrorPayload {
        return {
            code: this.code,
            message: this.message,
            ...(this.details !== undefined ? { details: this.details } : {}),
        };
    }
}

export const isAgentError = (error: unknown): error is AgentError => error instanceof AgentError;

export const toAgentError = (error: unknown): AgentError => {
    if (isAgentError(error)) {
        return error;
    }

    if (error instanceof Error) {
        return new AgentError({
            code: 'UNEXPECTED_ERROR',
            message: error.message,
            httpStatus: 500,
            details: {
                name: error.name,
                stack: error.stack,
            },
        });
    }

    return new AgentError({
        code: 'UNKNOWN_ERROR',
        message: '알 수 없는 오류가 발생했습니다.',
        httpStatus: 500,
        details: error,
    });
};
