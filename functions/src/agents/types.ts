export const AGENT_ROLES = [
    'analyzer',
    'planner',
    'code',
    'review',
    'fix',
    'orchestrator',
    'router',
    'manager',
    'browser',  // 웹 스크래핑
    'data',     // 데이터 분석
    'general',  // 일반 작업
] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];

export interface AgentErrorPayload {
    code: string;
    message: string;
    details?: unknown;
}

export interface AgentRequest {
    role: AgentRole;
    inputs: Record<string, unknown>;
    context?: string;
    history?: string[]; // Log history for context propagation
    sessionId?: string; // Session ID for tracking
}

export interface AgentResponse {
    success: boolean;
    data: unknown;
    logs: string[];
    nextSuggestedRole?: AgentRole;
    error?: AgentErrorPayload;
    critique?: string; // For Reflexion loop
    httpStatus?: number;
}
