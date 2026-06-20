"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orchestratorGenerateOutputSchema = exports.fixOutputSchema = exports.reviewOutputSchema = exports.codeOutputSchema = exports.plannerOutputSchema = exports.analyzerOutputSchema = exports.orchestratorInputsSchema = exports.orchestratorCommandSchema = exports.agentRequestSchema = exports.agentRoleSchema = void 0;
const zod_1 = require("zod");
const types_1 = require("./types");
const agentRolesForZod = types_1.AGENT_ROLES;
exports.agentRoleSchema = zod_1.z.enum(agentRolesForZod);
exports.agentRequestSchema = zod_1.z.object({
    role: exports.agentRoleSchema,
    inputs: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
    context: zod_1.z.string().optional(),
    history: zod_1.z.array(zod_1.z.string()).optional(),
});
const orchestratorCommands = [
    'clear_cache',
    'extract_logs',
    'firebase_admin_health',
    'echo',
    'generate',
];
exports.orchestratorCommandSchema = zod_1.z.enum(orchestratorCommands);
exports.orchestratorInputsSchema = zod_1.z.object({
    command: exports.orchestratorCommandSchema,
    payload: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
// ============================================
// Agent Output Schemas (Type Safety)
// ============================================
/**
 * Analyzer Agent Output Schema
 */
exports.analyzerOutputSchema = zod_1.z.object({
    intent: zod_1.z.string(),
    requirements: zod_1.z.array(zod_1.z.string()),
    complexity: zod_1.z.enum(['low', 'medium', 'high']),
});
/**
 * Planner Agent Output Schema
 */
exports.plannerOutputSchema = zod_1.z.array(zod_1.z.string());
/**
 * Code Agent Output Schema
 */
exports.codeOutputSchema = zod_1.z.object({
    code: zod_1.z.string(),
    language: zod_1.z.string().default('typescript'),
    metadata: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
/**
 * Review Agent Output Schema
 */
exports.reviewOutputSchema = zod_1.z.object({
    isValid: zod_1.z.boolean(),
    score: zod_1.z.number().min(0).max(100),
    critique: zod_1.z.string().optional(),
    issues: zod_1.z.array(zod_1.z.string()).optional(),
});
/**
 * Fix Agent Output Schema
 */
exports.fixOutputSchema = zod_1.z.object({
    code: zod_1.z.string(),
    fixesApplied: zod_1.z.array(zod_1.z.string()).optional(),
    metadata: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
/**
 * Orchestrator Generate Output Schema
 */
exports.orchestratorGenerateOutputSchema = zod_1.z.object({
    finalCode: zod_1.z.string(),
    review: exports.reviewOutputSchema,
    iterations: zod_1.z.number(),
    metadata: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
//# sourceMappingURL=schemas.js.map