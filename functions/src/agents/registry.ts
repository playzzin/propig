import { AgentError } from './errors';
import { AnalyzerAgent } from './AnalyzerAgent';
import { PlannerAgent } from './PlannerAgent';
import { CodeAgent } from './CodeAgent';
import { ReviewAgent } from './ReviewAgent';
import { FixAgent } from './FixAgent';
import { OrchestratorAgent } from './Orchestrator';
import { SubAgentRouter } from './SubAgentRouter';
import { AgentManager } from './AgentManager';
import { BrowserAgent } from './BrowserAgent';
import { DataAgent } from './DataAgent';
import { GeneralAgent } from './GeneralAgent';
import type { AgentRole } from './types';
import type { BaseAgent } from './Agent';

const agentMap: Record<AgentRole, BaseAgent> = {
    analyzer: new AnalyzerAgent(),
    planner: new PlannerAgent(),
    code: new CodeAgent(),
    review: new ReviewAgent(),
    fix: new FixAgent(),
    orchestrator: new OrchestratorAgent(),
    router: new SubAgentRouter(),
    manager: new AgentManager(),
    browser: new BrowserAgent(),
    data: new DataAgent(),
    general: new GeneralAgent(),
};

export function getAgentByRole(role: AgentRole): BaseAgent {
    const agent = agentMap[role];
    if (!agent) {
        throw new AgentError({
            code: 'AGENT_NOT_IMPLEMENTED',
            message: `role=${role} 에 대한 agent 구현이 없습니다.`,
            httpStatus: 400,
            details: { role },
        });
    }
    return agent;
}
