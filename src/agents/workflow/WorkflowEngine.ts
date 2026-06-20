/**
 * Workflow Engine for Complex Multi-Step Agent Orchestration
 * Enables prompt chaining, conditional logic, and parallel execution
 */

import { AgentRequest, AgentResponse, AgentRole } from '../types';
import { BaseAgent } from '../Agent';

export type WorkflowStepType = 'agent' | 'condition' | 'parallel' | 'loop' | 'custom';

export interface WorkflowStep {
    id: string;
    type: WorkflowStepType;
    config: Record<string, unknown>;
    next?: string | ((result: unknown) => string); // Next step ID or conditional function
    onError?: string; // Error handler step ID
}

export interface AgentWorkflowStep extends WorkflowStep {
    type: 'agent';
    config: {
        role: AgentRole;
        inputs: Record<string, unknown> | ((context: WorkflowContext) => Record<string, unknown>);
    };
}

export interface ConditionWorkflowStep extends WorkflowStep {
    type: 'condition';
    config: {
        condition: (context: WorkflowContext) => boolean;
        trueBranch: string;
        falseBranch: string;
    };
}

export interface ParallelWorkflowStep extends WorkflowStep {
    type: 'parallel';
    config: {
        steps: string[]; // IDs of steps to run in parallel
        waitForAll: boolean;
    };
}

export interface LoopWorkflowStep extends WorkflowStep {
    type: 'loop';
    config: {
        condition: (context: WorkflowContext) => boolean;
        bodyStep: string;
        maxIterations: number;
    };
}

export interface Workflow {
    id: string;
    name: string;
    description: string;
    steps: Map<string, WorkflowStep>;
    startStep: string;
    variables?: Record<string, unknown>;
}

export interface WorkflowContext {
    workflowId: string;
    variables: Record<string, unknown>;
    stepResults: Map<string, unknown>;
    currentStep: string;
    logs: string[];
    metadata: Record<string, unknown>;
}

export interface WorkflowExecutionResult {
    success: boolean;
    finalResult?: unknown;
    context: WorkflowContext;
    error?: Error;
}

/**
 * Workflow execution engine
 */
export class WorkflowEngine {
    private agents = new Map<AgentRole, BaseAgent>();
    private workflows = new Map<string, Workflow>();

    /**
     * Register an agent for use in workflows
     */
    registerAgent(role: AgentRole, agent: BaseAgent): void {
        this.agents.set(role, agent);
    }

    /**
     * Register a workflow
     */
    registerWorkflow(workflow: Workflow): void {
        this.workflows.set(workflow.id, workflow);
    }

    /**
     * Execute a workflow
     */
    async executeWorkflow(
        workflowId: string,
        initialVariables: Record<string, unknown> = {}
    ): Promise<WorkflowExecutionResult> {
        const workflow = this.workflows.get(workflowId);

        if (!workflow) {
            throw new Error(`Workflow ${workflowId} not found`);
        }

        const context: WorkflowContext = {
            workflowId,
            variables: { ...workflow.variables, ...initialVariables },
            stepResults: new Map(),
            currentStep: workflow.startStep,
            logs: [],
            metadata: {},
        };

        context.logs.push(`[Workflow] Starting workflow: ${workflow.name}`);

        try {
            let currentStepId: string | undefined = workflow.startStep;

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
                } else {
                    currentStepId = step.next;
                }
            }

            context.logs.push(`[Workflow] Workflow completed successfully`);

            return {
                success: true,
                finalResult: context.stepResults.get(context.currentStep),
                context,
            };
        } catch (error) {
            context.logs.push(`[Workflow] Error: ${(error as Error).message}`);

            return {
                success: false,
                context,
                error: error as Error,
            };
        }
    }

    /**
     * Execute a single workflow step
     */
    private async executeStep(step: WorkflowStep, context: WorkflowContext): Promise<unknown> {
        switch (step.type) {
            case 'agent':
                return this.executeAgentStep(step as AgentWorkflowStep, context);

            case 'condition':
                return this.executeConditionStep(step as ConditionWorkflowStep, context);

            case 'parallel':
                return this.executeParallelStep(step as ParallelWorkflowStep, context);

            case 'loop':
                return this.executeLoopStep(step as LoopWorkflowStep, context);

            case 'custom':
                return this.executeCustomStep(step, context);

            default:
                throw new Error(`Unknown step type: ${step.type}`);
        }
    }

    /**
     * Execute an agent step
     */
    private async executeAgentStep(
        step: AgentWorkflowStep,
        context: WorkflowContext
    ): Promise<AgentResponse> {
        const { role, inputs } = step.config;
        const agent = this.agents.get(role);

        if (!agent) {
            throw new Error(`Agent ${role} not registered`);
        }

        const resolvedInputs =
            typeof inputs === 'function' ? inputs(context) : inputs;

        const request: AgentRequest = {
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
    private async executeConditionStep(
        step: ConditionWorkflowStep,
        context: WorkflowContext
    ): Promise<string> {
        const { condition, trueBranch, falseBranch } = step.config;
        const result = condition(context);

        context.logs.push(`[Condition] Result: ${result}`);

        // Return the next step ID
        return result ? trueBranch : falseBranch;
    }

    /**
     * Execute parallel steps
     */
    private async executeParallelStep(
        step: ParallelWorkflowStep,
        context: WorkflowContext
    ): Promise<unknown[]> {
        const { steps, waitForAll } = step.config;

        context.logs.push(`[Parallel] Executing ${steps.length} steps`);

        const promises = steps.map(async stepId => {
            const parallelStep = context.stepResults.get(stepId);
            if (parallelStep) {
                return this.executeStep(parallelStep as WorkflowStep, context);
            }
            throw new Error(`Parallel step ${stepId} not found`);
        });

        if (waitForAll) {
            return Promise.all(promises);
        } else {
            // Return first completed
            return [await Promise.race(promises)];
        }
    }

    /**
     * Execute a loop step
     */
    private async executeLoopStep(
        step: LoopWorkflowStep,
        context: WorkflowContext
    ): Promise<unknown[]> {
        const { condition, bodyStep, maxIterations } = step.config;
        const results: unknown[] = [];
        let iterations = 0;

        while (condition(context) && iterations < maxIterations) {
            const bodyStepObj = context.stepResults.get(bodyStep) as WorkflowStep;
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
    private async executeCustomStep(
        step: WorkflowStep,
        context: WorkflowContext
    ): Promise<unknown> {
        const customFn = step.config.execute as (context: WorkflowContext) => Promise<unknown>;

        if (!customFn) {
            throw new Error('Custom step missing execute function');
        }

        return customFn(context);
    }

    /**
     * Get workflow by ID
     */
    getWorkflow(workflowId: string): Workflow | undefined {
        return this.workflows.get(workflowId);
    }

    /**
     * List all workflows
     */
    listWorkflows(): Workflow[] {
        return Array.from(this.workflows.values());
    }
}

// Singleton instance
export const workflowEngine = new WorkflowEngine();

/**
 * Example: Create a complex workflow
 */
export function createCodeReviewWorkflow(): Workflow {
    const steps = new Map<string, WorkflowStep>();

    steps.set('analyze', {
        id: 'analyze',
        type: 'agent',
        config: {
            role: 'analyzer',
            inputs: (context: WorkflowContext) => ({
                userInput: context.variables.code,
            }),
        },
        next: 'check_complexity',
    } as AgentWorkflowStep);

    steps.set('check_complexity', {
        id: 'check_complexity',
        type: 'condition',
        config: {
            condition: (context: WorkflowContext) => {
                const analysisResult = context.stepResults.get('analyze') as { data: { complexity: string } };
                return analysisResult?.data?.complexity === 'high';
            },
            trueBranch: 'detailed_review',
            falseBranch: 'quick_review',
        },
    } as ConditionWorkflowStep);

    steps.set('detailed_review', {
        id: 'detailed_review',
        type: 'agent',
        config: {
            role: 'review',
            inputs: (context: WorkflowContext) => ({
                code: context.variables.code,
                detailed: true,
            }),
        },
        next: 'generate_report',
    } as AgentWorkflowStep);

    steps.set('quick_review', {
        id: 'quick_review',
        type: 'agent',
        config: {
            role: 'review',
            inputs: (context: WorkflowContext) => ({
                code: context.variables.code,
                detailed: false,
            }),
        },
        next: 'generate_report',
    } as AgentWorkflowStep);

    steps.set('generate_report', {
        id: 'generate_report',
        type: 'custom',
        config: {
            execute: async (context: WorkflowContext) => {
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
