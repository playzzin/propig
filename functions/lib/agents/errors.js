"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toAgentError = exports.isAgentError = exports.AgentError = void 0;
class AgentError extends Error {
    constructor(params) {
        var _a;
        super(params.message);
        this.name = 'AgentError';
        this.code = params.code;
        this.httpStatus = (_a = params.httpStatus) !== null && _a !== void 0 ? _a : 500;
        this.details = params.details;
    }
    toPayload() {
        return Object.assign({ code: this.code, message: this.message }, (this.details !== undefined ? { details: this.details } : {}));
    }
}
exports.AgentError = AgentError;
const isAgentError = (error) => error instanceof AgentError;
exports.isAgentError = isAgentError;
const toAgentError = (error) => {
    if ((0, exports.isAgentError)(error)) {
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
exports.toAgentError = toAgentError;
//# sourceMappingURL=errors.js.map