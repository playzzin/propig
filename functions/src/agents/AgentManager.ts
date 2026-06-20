import { AgentRequest, AgentResponse } from './types';
import { BaseAgent } from './Agent';
import { SubAgentRouter, SubAgentType, RouteDecision } from './SubAgentRouter';
import { SkillsLoader, getSkillsLoader, SkillMatch } from '../skills';
import { CodeAgent } from './CodeAgent';
import { BrowserAgent } from './BrowserAgent';
import { DataAgent } from './DataAgent';
import { GeneralAgent } from './GeneralAgent';

/**
 * AgentManager
 * 
 * 서브에이전트 시스템의 메인 진입점입니다.
 * 사용자 요청을 분석하고, 적절한 서브에이전트로 라우팅하며,
 * 필요한 스킬을 로드하여 작업을 수행합니다.
 * 
 * Architecture:
 * User Request → AgentManager → SubAgentRouter → SubAgent + Skills → Result
 */
export class AgentManager extends BaseAgent {
    private router: SubAgentRouter;
    private skillsLoader: SkillsLoader;
    private initialized = false;

    // Sub-agent instances
    private codeAgent: CodeAgent;
    private browserAgent: BrowserAgent;
    private dataAgent: DataAgent;
    private generalAgent: GeneralAgent;

    constructor() {
        super();
        this.router = new SubAgentRouter();
        this.skillsLoader = getSkillsLoader();

        // Initialize sub-agents
        this.codeAgent = new CodeAgent();
        this.browserAgent = new BrowserAgent();
        this.dataAgent = new DataAgent();
        this.generalAgent = new GeneralAgent();
    }

    /**
     * Initialize the agent manager (load skills)
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        await this.skillsLoader.loadAllSkills();
        this.initialized = true;
        console.log('[AgentManager] Initialized with skills:', this.skillsLoader.getAllSkills().map(s => s.name));
    }

    /**
     * Main execution entry point
     */
    async execute(request: AgentRequest): Promise<AgentResponse> {
        const { inputs, sessionId } = request;
        const userInput = inputs.userInput as string;
        const logs: string[] = [];

        logs.push(`[AgentManager] Session: ${sessionId || 'anonymous'}`);
        logs.push(`[AgentManager] Processing: "${userInput.substring(0, 80)}..."`);

        try {
            // Step 1: Initialize if needed
            await this.initialize();

            // Step 2: Route to appropriate sub-agent
            const routeResponse = await this.router.execute({
                role: 'router',
                inputs: { userInput },
            });
            logs.push(...routeResponse.logs);

            if (!routeResponse.success) {
                return this.createResponse(false, null, logs, routeResponse.error);
            }

            const routeDecision = routeResponse.data as RouteDecision;
            logs.push(`[AgentManager] Routed to: ${routeDecision.subAgentType}`);

            // Step 3: Find matching skills
            const matchingSkills = this.skillsLoader.findMatchingSkills(userInput, 3);
            logs.push(`[AgentManager] Matched skills: ${matchingSkills.map(m => m.skill.name).join(', ') || 'none'}`);

            // Step 4: Execute with sub-agent
            const subAgentResult = await this.executeSubAgent(
                routeDecision.subAgentType,
                userInput,
                matchingSkills,
                inputs,
                logs
            );

            return this.createResponse(true, {
                routeDecision,
                matchedSkills: matchingSkills.map(m => m.skill.name),
                result: subAgentResult,
            }, logs);

        } catch (error) {
            logs.push(`[AgentManager] Error: ${error}`);
            return this.createResponse(false, null, logs, {
                code: 'AGENT_MANAGER_ERROR',
                message: String(error),
            });
        }
    }

    /**
     * Execute work with the appropriate sub-agent
     */
    private async executeSubAgent(
        type: SubAgentType,
        userInput: string,
        skills: SkillMatch[],
        originalInputs: Record<string, unknown>,
        logs: string[]
    ): Promise<AgentResponse> {
        logs.push(`[AgentManager] Executing ${type} sub-agent...`);

        // Build skill instructions context
        const skillInstructions = skills
            .map(m => `### Skill: ${m.skill.name}\n${m.skill.instructions}`)
            .join('\n\n');

        // Common request structure
        const baseInputs = {
            ...originalInputs,
            userInput,
            skillInstructions: skillInstructions || undefined,
        };

        switch (type) {
            case 'code': {
                logs.push('[AgentManager] Delegating to CodeAgent');
                // CodeAgent expects plan, userInput, requirements
                const codeRequest: AgentRequest = {
                    role: 'code',
                    inputs: {
                        ...baseInputs,
                        plan: originalInputs.plan || ['Analyze requirements', 'Generate code'],
                        requirements: originalInputs.requirements || ['typescript', 'clean code'],
                    },
                };
                const result = await this.codeAgent.execute(codeRequest);
                logs.push(...result.logs);
                return result;
            }

            case 'browser': {
                logs.push('[AgentManager] Delegating to BrowserAgent');
                const browserRequest: AgentRequest = {
                    role: 'browser',
                    inputs: {
                        ...baseInputs,
                        url: originalInputs.url,
                    },
                };
                const result = await this.browserAgent.execute(browserRequest);
                logs.push(...result.logs);
                return result;
            }

            case 'data': {
                logs.push('[AgentManager] Delegating to DataAgent');
                const dataRequest: AgentRequest = {
                    role: 'data',
                    inputs: {
                        ...baseInputs,
                        data: originalInputs.data,
                    },
                };
                const result = await this.dataAgent.execute(dataRequest);
                logs.push(...result.logs);
                return result;
            }

            case 'file':
            case 'research':
            default: {
                // All other types fall back to GeneralAgent
                logs.push(`[AgentManager] Delegating to GeneralAgent (type: ${type})`);
                const generalRequest: AgentRequest = {
                    role: 'general',
                    inputs: {
                        ...baseInputs,
                        context: `Type: ${type}`,
                    },
                };
                const result = await this.generalAgent.execute(generalRequest);
                logs.push(...result.logs);
                return result;
            }
        }
    }
}

