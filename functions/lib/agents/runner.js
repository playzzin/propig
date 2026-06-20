"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAgent = void 0;
const errors_1 = require("./errors");
const registry_1 = require("./registry");
const schemas_1 = require("./schemas");
const runAgent = async (rawRequest) => {
    var _a;
    const parsed = schemas_1.agentRequestSchema.safeParse(rawRequest);
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
        const agent = (0, registry_1.getAgentByRole)(parsed.data.role);
        const result = await agent.execute(parsed.data);
        const httpStatus = (_a = result.httpStatus) !== null && _a !== void 0 ? _a : (result.success ? 200 : result.error ? 400 : 500);
        return Object.assign(Object.assign({}, result), { httpStatus });
    }
    catch (error) {
        const agentError = (0, errors_1.toAgentError)(error);
        return {
            success: false,
            data: null,
            logs: [],
            error: agentError.toPayload(),
            httpStatus: agentError.httpStatus,
        };
    }
};
exports.runAgent = runAgent;
//# sourceMappingURL=runner.js.map