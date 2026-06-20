"use strict";
/**
 * Workflow Engine for Complex Multi-Step Agent Orchestration
 * Enables prompt chaining, conditional logic, and parallel execution
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.workflowEngine = exports.WorkflowEngine = void 0;
exports.createCodeReviewWorkflow = createCodeReviewWorkflow;
/**
 * Workflow execution engine
 */
class WorkflowEngine {
    constructor() {
        this.agents = new Map();
        this.workflows = new Map();
    }
    /**
     * Register an agent for use in workflows
     */
    registerAgent(role, agent) {
        this.agents.set(role, agent);
    }
    /**
     * Register a workflow
     */
    registerWorkflow(workflow) {
        this.workflows.set(workflow.id, workflow);
    }
    /**
     * Execute a workflow
     */
    async executeWorkflow(workflowId, initialVariables = {}) {
        const workflow = this.workflows.get(workflowId);
        if (!workflow) {
            throw new Error(`Workflow ${workflowId} not found`);
        }
        const context = {
            workflowId,
            variables: Object.assign(Object.assign({}, workflow.variables), initialVariables),
            stepResults: new Map(),
            currentStep: workflow.startStep,
            logs: [],
            metadata: {},
        };
        context.logs.push(`[Workflow] Starting workflow: ${workflow.name}`);
        try {
            let currentStepId = workflow.startStep;
            while (currentStepId) {
                const step = workflow.steps.get(currentStepId);
                if (!step) {
                    throw new Error(`Step ${currentStepId} not found in workflow`);
                }
                context.currentStep = currentStepId;
                context.logs.push(`[Workflow] Executing step: ${currentStepId}`);
                // Execute step based on type
                const result = await this.executeStep(step, context);
                context.stepResults.set(currentStepId, result);
                // Determine next step
                if (typeof step.next === 'function') {
                    currentStepId = step.next(result);
                }
                else {
                    currentStepId = step.next;
                }
            }
            context.logs.push(`[Workflow] Workflow completed successfully`);
            return {
                success: true,
                finalResult: context.stepResults.get(context.currentStep),
                context,
            };
        }
        catch (error) {
            context.logs.push(`[Workflow] Error: ${error.message}`);
            return {
                success: false,
                context,
                error: error,
            };
        }
    }
    /**
     * Execute a single workflow step
     */
    async executeStep(step, context) {
        switch (step.type) {
            case 'agent':
                return this.executeAgentStep(step, context);
            case 'condition':
                return this.executeConditionStep(step, context);
            case 'parallel':
                return this.executeParallelStep(step, context);
            case 'loop':
                return this.executeLoopStep(step, context);
            case 'custom':
                return this.executeCustomStep(step, context);
            default:
                throw new Error(`Unknown step type: ${step.type}`);
        }
    }
    /**
     * Execute an agent step
     */
    async executeAgentStep(step, context) {
        const { role, inputs } = step.config;
        const agent = this.agents.get(role);
        if (!agent) {
            throw new Error(`Agent ${role} not registered`);
        }
        const resolvedInputs = typeof inputs === 'function' ? inputs(context) : inputs;
        const request = {
            role,
            inputs: resolvedInputs,
            context: JSON.stringify(context.variables),
            history: context.logs,
        };
        const response = await agent.execute(request);
        context.logs.push(...response.logs);
        return response;
    }
    /**
     * Execute a condition step
     */
    async executeConditionStep(step, context) {
        const { condition, trueBranch, falseBranch } = step.config;
        const result = condition(context);
        context.logs.push(`[Condition] Result: ${result}`);
        // Return the next step ID
        return result ? trueBranch : falseBranch;
    }
    /**
     * Execute parallel steps
     */
    async executeParallelStep(step, context) {
        const { steps, waitForAll } = step.config;
        context.logs.push(`[Parallel] Executing ${steps.length} steps`);
        const promises = steps.map(async (stepId) => {
            const parallelStep = context.stepResults.get(stepId);
            if (parallelStep) {
                return this.executeStep(parallelStep, context);
            }
            throw new Error(`Parallel step ${stepId} not found`);
        });
        if (waitForAll) {
            return Promise.all(promises);
        }
        else {
            // Return first completed
            return [await Promise.race(promises)];
        }
    }
    /**
     * Execute a loop step
     */
    async executeLoopStep(step, context) {
        const { condition, bodyStep, maxIterations } = step.config;
        const results = [];
        let iterations = 0;
        while (condition(context) && iterations < maxIterations) {
            const bodyStepObj = context.stepResults.get(bodyStep);
            if (!bodyStepObj) {
                throw new Error(`Loop body step ${bodyStep} not found`);
            }
            const result = await this.executeStep(bodyStepObj, context);
            results.push(result);
            iterations++;
            context.logs.push(`[Loop] Iteration ${iterations} completed`);
        }
        return results;
    }
    /**
     * Execute custom step (placeholder for user-defined logic)
     */
    async executeCustomStep(step, context) {
        const customFn = step.config.execute;
        if (!customFn) {
            throw new Error('Custom step missing execute function');
        }
        return customFn(context);
    }
    /**
     * Get workflow by ID
     */
    getWorkflow(workflowId) {
        return this.workflows.get(workflowId);
    }
    /**
     * List all workflows
     */
    listWorkflows() {
        return Array.from(this.workflows.values());
    }
}
exports.WorkflowEngine = WorkflowEngine;
// Singleton instance
exports.workflowEngine = new WorkflowEngine();
/**
 * Example: Create a complex workflow
 */
function createCodeReviewWorkflow() {
    const steps = new Map();
    steps.set('analyze', {
        id: 'analyze',
        type: 'agent',
        config: {
            role: 'analyzer',
            inputs: (context) => ({
                userInput: context.variables.code,
            }),
        },
        next: 'check_complexity',
    });
    steps.set('check_complexity', {
        id: 'check_complexity',
        type: 'condition',
        config: {
            condition: (context) => {
                var _a;
                const analysisResult = context.stepResults.get('analyze');
                return ((_a = analysisResult === null || analysisResult === void 0 ? void 0 : analysisResult.data) === null || _a === void 0 ? void 0 : _a.complexity) === 'high';
            },
            trueBranch: 'detailed_review',
            falseBranch: 'quick_review',
        },
    });
    steps.set('detailed_review', {
        id: 'detailed_review',
        type: 'agent',
        config: {
            role: 'review',
            inputs: (context) => ({
                code: context.variables.code,
                detailed: true,
            }),
        },
        next: 'generate_report',
    });
    steps.set('quick_review', {
        id: 'quick_review',
        type: 'agent',
        config: {
            role: 'review',
            inputs: (context) => ({
                code: context.variables.code,
                detailed: false,
            }),
        },
        next: 'generate_report',
    });
    steps.set('generate_report', {
        id: 'generate_report',
        type: 'custom',
        config: {
            execute: async (context) => {
                const reviewResult = context.stepResults.get(context.currentStep);
                return {
                    report: 'Code review completed',
                    result: reviewResult,
                };
            },
        },
    });
    return {
        id: 'code_review',
        name: 'Code Review Workflow',
        description: 'Analyzes and reviews code with conditional complexity handling',
        steps,
        startStep: 'analyze',
    };
}
//# sourceMappingURL=WorkflowEngine.js.map