import { z } from 'zod';

import { AGENT_ROLES } from './types';
import type { AgentRole } from './types';

const agentRolesForZod = AGENT_ROLES as unknown as [AgentRole, ...AgentRole[]];
export const agentRoleSchema = z.enum(agentRolesForZod);

export const agentRequestSchema = z.object({
    role: agentRoleSchema,
    inputs: z.record(z.string(), z.unknown()),
    context: z.string().optional(),
    history: z.array(z.string()).optional(),
});

export type AgentRequestSchemaInput = z.infer<typeof agentRequestSchema>;

const orchestratorCommands = [
    'clear_cache',
    'extract_logs',
    'firebase_admin_health',
    'echo',
    'generate',
] as const;
export const orchestratorCommandSchema = z.enum(
    orchestratorCommands as unknown as [
        (typeof orchestratorCommands)[number],
        ...(typeof orchestratorCommands)[number][],
    ],
);

export const orchestratorInputsSchema = z.object({
    command: orchestratorCommandSchema,
    payload: z.record(z.string(), z.unknown()).optional(),
});

export type OrchestratorInputs = z.infer<typeof orchestratorInputsSchema>;

// ============================================
// Agent Output Schemas (Type Safety)
// ============================================

/**
 * Analyzer Agent Output Schema
 */
export const analyzerOutputSchema = z.object({
    intent: z.string(),
    requirements: z.array(z.string()),
    complexity: z.enum(['low', 'medium', 'high']),
});
export type AnalyzerOutput = z.infer<typeof analyzerOutputSchema>;

/**
 * Planner Agent Output Schema
 */
export const plannerOutputSchema = z.array(z.string());
export type PlannerOutput = z.infer<typeof plannerOutputSchema>;

/**
 * Code Agent Output Schema
 */
export const codeOutputSchema = z.object({
    code: z.string(),
    language: z.string().default('typescript'),
    metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CodeOutput = z.infer<typeof codeOutputSchema>;

/**
 * Review Agent Output Schema
 */
export const reviewOutputSchema = z.object({
    isValid: z.boolean(),
    score: z.number().min(0).max(100),
    critique: z.string().optional(),
    issues: z.array(z.string()).optional(),
});
export type ReviewOutput = z.infer<typeof reviewOutputSchema>;

/**
 * Fix Agent Output Schema
 */
export const fixOutputSchema = z.object({
    code: z.string(),
    fixesApplied: z.array(z.string()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});
export type FixOutput = z.infer<typeof fixOutputSchema>;

/**
 * Orchestrator Generate Output Schema
 */
export const orchestratorGenerateOutputSchema = z.object({
    finalCode: z.string(),
    review: reviewOutputSchema,
    iterations: z.number(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});
export type OrchestratorGenerateOutput = z.infer<typeof orchestratorGenerateOutputSchema>;
