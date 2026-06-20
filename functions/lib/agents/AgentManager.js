"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentManager = void 0;
const Agent_1 = require("./Agent");
const SubAgentRouter_1 = require("./SubAgentRouter");
const skills_1 = require("../skills");
const CodeAgent_1 = require("./CodeAgent");
const BrowserAgent_1 = require("./BrowserAgent");
const DataAgent_1 = require("./DataAgent");
const GeneralAgent_1 = require("./GeneralAgent");
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
class AgentManager extends Agent_1.BaseAgent {
    constructor() {
        super();
        this.initialized = false;
        this.router = new SubAgentRouter_1.SubAgentRouter();
        this.skillsLoader = (0, skills_1.getSkillsLoader)();
        // Initialize sub-agents
        this.codeAgent = new CodeAgent_1.CodeAgent();
        this.browserAgent = new BrowserAgent_1.BrowserAgent();
        this.dataAgent = new DataAgent_1.DataAgent();
        this.generalAgent = new GeneralAgent_1.GeneralAgent();
    }
    /**
     * Initialize the agent manager (load skills)
     */
    async initialize() {
        if (this.initialized)
            return;
        await this.skillsLoader.loadAllSkills();
        this.initialized = true;
        console.log('[AgentManager] Initialized with skills:', this.skillsLoader.getAllSkills().map(s => s.name));
    }
    /**
     * Main execution entry point
     */
    async execute(request) {
        const { inputs, sessionId } = request;
        const userInput = inputs.userInput;
        const logs = [];
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
            const routeDecision = routeResponse.data;
            logs.push(`[AgentManager] Routed to: ${routeDecision.subAgentType}`);
            // Step 3: Find matching skills
            const matchingSkills = this.skillsLoader.findMatchingSkills(userInput, 3);
            logs.push(`[AgentManager] Matched skills: ${matchingSkills.map(m => m.skill.name).join(', ') || 'none'}`);
            // Step 4: Execute with sub-agent
            const subAgentResult = await this.executeSubAgent(routeDecision.subAgentType, userInput, matchingSkills, inputs, logs);
            return this.createResponse(true, {
                routeDecision,
                matchedSkills: matchingSkills.map(m => m.skill.name),
                result: subAgentResult,
            }, logs);
        }
        catch (error) {
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
    async executeSubAgent(type, userInput, skills, originalInputs, logs) {
        logs.push(`[AgentManager] Executing ${type} sub-agent...`);
        // Build skill instructions context
        const skillInstructions = skills
            .map(m => `### Skill: ${m.skill.name}\n${m.skill.instructions}`)
            .join('\n\n');
        // Common request structure
        const baseInputs = Object.assign(Object.assign({}, originalInputs), { userInput, skillInstructions: skillInstructions || undefined });
        switch (type) {
            case 'code': {
                logs.push('[AgentManager] Delegating to CodeAgent');
                // CodeAgent expects plan, userInput, requirements
                const codeRequest = {
                    role: 'code',
                    inputs: Object.assign(Object.assign({}, baseInputs), { plan: originalInputs.plan || ['Analyze requirements', 'Generate code'], requirements: originalInputs.requirements || ['typescript', 'clean code'] }),
                };
                const result = await this.codeAgent.execute(codeRequest);
                logs.push(...result.logs);
                return result;
            }
            case 'browser': {
                logs.push('[AgentManager] Delegating to BrowserAgent');
                const browserRequest = {
                    role: 'browser',
                    inputs: Object.assign(Object.assign({}, baseInputs), { url: originalInputs.url }),
                };
                const result = await this.browserAgent.execute(browserRequest);
                logs.push(...result.logs);
                return result;
            }
            case 'data': {
                logs.push('[AgentManager] Delegating to DataAgent');
                const dataRequest = {
                    role: 'data',
                    inputs: Object.assign(Object.assign({}, baseInputs), { data: originalInputs.data }),
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
                const generalRequest = {
                    role: 'general',
                    inputs: Object.assign(Object.assign({}, baseInputs), { context: `Type: ${type}` }),
                };
                const result = await this.generalAgent.execute(generalRequest);
                logs.push(...result.logs);
                return result;
            }
        }
    }
}
exports.AgentManager = AgentManager;
//# sourceMappingURL=AgentManager.js.map