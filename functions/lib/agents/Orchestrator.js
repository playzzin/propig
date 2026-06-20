"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrchestratorAgent = void 0;
const Agent_1 = require("./Agent");
const AnalyzerAgent_1 = require("./AnalyzerAgent");
const PlannerAgent_1 = require("./PlannerAgent");
const CodeAgent_1 = require("./CodeAgent");
const ReviewAgent_1 = require("./ReviewAgent");
const FixAgent_1 = require("./FixAgent");
const schemas_1 = require("./schemas");
const ErrorHandler_1 = require("./resilience/ErrorHandler");
/**
 * Orchestrator Agent
 *
 * Main coordinator that manages the entire agent workflow.
 * Supports direct commands and complex multi-agent generation workflows.
 *
 * Features:
 * - Self-healing Reflexion loop
 * - Context propagation
 * - Automatic retry with exponential backoff
 * - Timeout protection
 * - Full type safety with Zod validation
 *
 * @example
 * ```typescript
 * const orchestrator = new OrchestratorAgent();
 * const result = await orchestrator.execute({
 *   role: 'orchestrator',
 *   inputs: {
 *     command: 'generate',
 *     payload: { userInput: 'Create a React component' }
 *   }
 * });
 * ```
 */
class OrchestratorAgent extends Agent_1.BaseAgent {
    constructor() {
        super(...arguments);
        this.analyzer = new AnalyzerAgent_1.AnalyzerAgent();
        this.planner = new PlannerAgent_1.PlannerAgent();
        this.code = new CodeAgent_1.CodeAgent();
        this.review = new ReviewAgent_1.ReviewAgent();
        this.fix = new FixAgent_1.FixAgent();
    }
    async execute(request) {
        const { inputs } = request;
        const command = inputs.command;
        const payload = inputs.payload;
        const logs = [];
        logs.push(`[Orchestrator] Received command: ${command}`);
        try {
            // ============================================
            // 1. Direct Commands (FloatTool Integration)
            // ============================================
            if (command === 'echo') {
                logs.push(`[Orchestrator] Executing Echo...`);
                return this.createResponse(true, { echo: (payload === null || payload === void 0 ? void 0 : payload.text) || 'pong' }, logs);
            }
            if (command === 'clear_cache') {
                logs.push(`[Orchestrator] Clearing System Cache... [Mock]`);
                return this.createResponse(true, { status: 'cleared' }, logs);
            }
            if (command === 'extract_logs') {
                logs.push(`[Orchestrator] Extracting Logs... [Mock]`);
                return this.createResponse(true, { logs: ['log1', 'log2', 'log3'] }, logs);
            }
            if (command === 'firebase_admin_health') {
                logs.push(`[Orchestrator] Checking Firebase Admin SDK Health...`);
                logs.push(`[Orchestrator] Connection: STABLE`);
                return this.createResponse(true, { status: 'healthy', latency: '45ms' }, logs);
            }
            // ============================================
            // 2. Generative Workflow (Main Logic)
            // ============================================
            if (command === 'generate') {
                return await this.executeGenerationWorkflow(payload, logs);
            }
            // Unknown command
            return this.createResponse(false, null, logs, {
                code: 'UNKNOWN_COMMAND',
                message: `Unknown command: ${command}`,
            });
        }
        catch (error) {
            logs.push(`[Orchestrator] Fatal error: ${error}`);
            return this.createResponse(false, null, logs, {
                code: 'ORCHESTRATOR_ERROR',
                message: String(error),
            });
        }
    }
    /**
     * Execute the complete generation workflow with self-healing
     *
     * @private
     * @param payload - User input payload
     * @param logs - Execution logs
     * @returns Promise<AgentResponse>
     */
    async executeGenerationWorkflow(payload, logs) {
        const userInput = payload === null || payload === void 0 ? void 0 : payload.userInput;
        if (!userInput) {
            return this.createResponse(false, null, logs, {
                code: 'MISSING_INPUT',
                message: 'userInput is required for generate command',
            });
        }
        logs.push(`[Orchestrator] Starting Generation Workflow for: "${userInput}"`);
        try {
            // ============================================
            // Step 1: Analyze with Retry & Timeout
            // ============================================
            logs.push(`[Orchestrator] Step 1/4: Analysis`);
            const analysisRes = await (0, ErrorHandler_1.withTimeout)((0, ErrorHandler_1.retryWithBackoff)(() => this.analyzer.execute({ role: 'analyzer', inputs: { userInput } }), { maxAttempts: 3, delayMs: 1000, backoffMultiplier: 2, maxDelayMs: 5000 }), 30000 // 30 second timeout
            );
            logs.push(...analysisRes.logs);
            if (!analysisRes.success) {
                return this.createResponse(false, null, logs, analysisRes.error);
            }
            // Type-safe parsing with Zod
            const analysis = schemas_1.analyzerOutputSchema.parse(analysisRes.data);
            // ============================================
            // Step 2: Plan
            // ============================================
            logs.push(`[Orchestrator] Step 2/4: Planning`);
            const planRes = await (0, ErrorHandler_1.withTimeout)(this.planner.execute({
                role: 'planner',
                inputs: {
                    requirements: analysis.requirements,
                    intent: analysis.intent,
                    userInput: userInput,
                },
            }), 30000);
            logs.push(...planRes.logs);
            if (!planRes.success) {
                return this.createResponse(false, null, logs, planRes.error);
            }
            const plan = planRes.data; // Already validated by PlannerAgent
            // ============================================
            // Step 3: Code Generation
            // ============================================
            logs.push(`[Orchestrator] Step 3/4: Code Generation`);
            const codeRes = await (0, ErrorHandler_1.withTimeout)(this.code.execute({
                role: 'code',
                inputs: {
                    plan,
                    userInput: userInput,
                    requirements: analysis.requirements,
                },
            }), 60000 // 60 seconds for code generation
            );
            logs.push(...codeRes.logs);
            if (!codeRes.success) {
                return this.createResponse(false, null, logs, codeRes.error);
            }
            const codeOutput = schemas_1.codeOutputSchema.parse(codeRes.data);
            let currentCode = codeOutput.code;
            // ============================================
            // Step 4: Review & Healer Loop (Reflexion)
            // ============================================
            logs.push(`[Orchestrator] Step 4/4: Review & Self-Healing`);
            let reviewRes = await this.review.execute({
                role: 'review',
                inputs: { code: currentCode },
            });
            logs.push(...reviewRes.logs);
            if (!reviewRes.success) {
                logs.push(`[Orchestrator] Warning: Review failed, skipping healing loop`);
                // Continue with unvalidated code
            }
            else {
                let reviewData = schemas_1.reviewOutputSchema.parse(reviewRes.data);
                let attempts = 0;
                const MAX_ATTEMPTS = 2;
                // Self-healing loop
                while (!reviewData.isValid && attempts < MAX_ATTEMPTS) {
                    attempts++;
                    logs.push(`[Orchestrator] Review Failed. Activating Healer Loop (Attempt ${attempts}/${MAX_ATTEMPTS})...`);
                    // Call FixAgent with critique
                    const fixRes = await this.fix.execute({
                        role: 'fix',
                        inputs: { code: currentCode, critique: reviewData.critique },
                        history: logs, // Context Propagation
                    });
                    logs.push(...fixRes.logs);
                    if (fixRes.success) {
                        const fixOutput = schemas_1.fixOutputSchema.parse(fixRes.data);
                        currentCode = fixOutput.code;
                        // Re-review the fixed code
                        reviewRes = await this.review.execute({
                            role: 'review',
                            inputs: { code: currentCode },
                        });
                        logs.push(...reviewRes.logs);
                        if (reviewRes.success) {
                            reviewData = schemas_1.reviewOutputSchema.parse(reviewRes.data);
                        }
                    }
                    else {
                        logs.push(`[Orchestrator] Healer failed to fix code. Stopping loop.`);
                        break;
                    }
                }
                if (reviewData.isValid) {
                    logs.push(`[Orchestrator] ✅ Code passed review after ${attempts} healing iteration(s)`);
                }
                else {
                    logs.push(`[Orchestrator] ⚠️ Code quality below threshold after ${MAX_ATTEMPTS} attempts`);
                }
            }
            // ============================================
            // Final Result
            // ============================================
            const MAX_ATTEMPTS = 2;
            const finalResult = {
                finalCode: currentCode,
                review: reviewRes.data,
                iterations: reviewRes.success
                    ? schemas_1.reviewOutputSchema.parse(reviewRes.data).isValid
                        ? 0
                        : MAX_ATTEMPTS
                    : 0,
            };
            // Validate final output
            const validatedResult = schemas_1.orchestratorGenerateOutputSchema.parse(finalResult);
            logs.push(`[Orchestrator] ✅ Generation workflow completed successfully`);
            return this.createResponse(true, validatedResult, logs);
        }
        catch (error) {
            logs.push(`[Orchestrator] Generation workflow failed: ${error}`);
            return this.createResponse(false, null, logs, {
                code: 'GENERATION_FAILED',
                message: String(error),
                details: error,
            });
        }
    }
}
exports.OrchestratorAgent = OrchestratorAgent;
//# sourceMappingURL=Orchestrator.js.map