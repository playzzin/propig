import { AgentError } from './errors';
import { AnalyzerAgent } from './AnalyzerAgent';
import { PlannerAgent } from './PlannerAgent';
import { CodeAgent } from './CodeAgent';
import { ReviewAgent } from './ReviewAgent';
import { FixAgent } from './FixAgent';
import { OrchestratorAgent } from './Orchestrator';
import type { AgentRole } from './types';
import type { BaseAgent } from './Agent';

const agentMap: Record<AgentRole, BaseAgent> = {
    analyzer: new AnalyzerAgent(),
    planner: new PlannerAgent(),
    code: new CodeAgent(),
    review: new ReviewAgent(),
    fix: new FixAgent(),
    orchestrator: new OrchestratorAgent(),
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
