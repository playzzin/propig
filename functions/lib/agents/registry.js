"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAgentByRole = getAgentByRole;
const errors_1 = require("./errors");
const AnalyzerAgent_1 = require("./AnalyzerAgent");
const PlannerAgent_1 = require("./PlannerAgent");
const CodeAgent_1 = require("./CodeAgent");
const ReviewAgent_1 = require("./ReviewAgent");
const FixAgent_1 = require("./FixAgent");
const Orchestrator_1 = require("./Orchestrator");
const SubAgentRouter_1 = require("./SubAgentRouter");
const AgentManager_1 = require("./AgentManager");
const BrowserAgent_1 = require("./BrowserAgent");
const DataAgent_1 = require("./DataAgent");
const GeneralAgent_1 = require("./GeneralAgent");
const agentMap = {
    analyzer: new AnalyzerAgent_1.AnalyzerAgent(),
    planner: new PlannerAgent_1.PlannerAgent(),
    code: new CodeAgent_1.CodeAgent(),
    review: new ReviewAgent_1.ReviewAgent(),
    fix: new FixAgent_1.FixAgent(),
    orchestrator: new Orchestrator_1.OrchestratorAgent(),
    router: new SubAgentRouter_1.SubAgentRouter(),
    manager: new AgentManager_1.AgentManager(),
    browser: new BrowserAgent_1.BrowserAgent(),
    data: new DataAgent_1.DataAgent(),
    general: new GeneralAgent_1.GeneralAgent(),
};
function getAgentByRole(role) {
    const agent = agentMap[role];
    if (!agent) {
        throw new errors_1.AgentError({
            code: 'AGENT_NOT_IMPLEMENTED',
            message: `role=${role} 에 대한 agent 구현이 없습니다.`,
            httpStatus: 400,
            details: { role },
        });
    }
    return agent;
}
//# sourceMappingURL=registry.js.map