"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseAgent = void 0;
class BaseAgent {
    createResponse(success, data, logs = [], error) {
        return Object.assign({ success,
            data,
            logs }, (error ? { error } : {}));
    }
}
exports.BaseAgent = BaseAgent;
//# sourceMappingURL=Agent.js.map