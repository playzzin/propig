"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onSubAgentJobCreated = exports.onAgentJobCreated = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const Orchestrator_1 = require("./agents/Orchestrator");
const AgentManager_1 = require("./agents/AgentManager");
const isPlainRecord = (value) => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};
// Initialize Admin SDK if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}
/**
 * Legacy Agent Job Handler (uses OrchestratorAgent)
 * Collection: agent_jobs
 */
exports.onAgentJobCreated = (0, firestore_1.onDocumentCreated)({
    document: 'agent_jobs/{jobId}',
    // secrets: [geminiApiKey],
    timeoutSeconds: 540,
    memory: '1GiB',
    region: 'asia-northeast3',
}, async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
        console.log('No data associated with the event');
        return;
    }
    const jobData = snapshot.data();
    const jobId = event.params.jobId;
    if (jobData.status !== 'pending') {
        return;
    }
    console.log(`[AgentRunner] Starting job ${jobId}:`, jobData.prompt);
    await snapshot.ref.update({
        status: 'processing',
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    try {
        process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
        process.env.LLM_PROVIDER = 'gemini';
        process.env.GEMINI_MODEL = 'gemini-2.5-flash';
        const orchestrator = new Orchestrator_1.OrchestratorAgent();
        const response = await orchestrator.execute({
            role: 'orchestrator',
            inputs: {
                command: 'generate',
                payload: {
                    userInput: jobData.prompt,
                    context: jobData.context || {},
                },
            },
        });
        console.log(`[AgentRunner] Job ${jobId} completed. Success: ${response.success}`);
        await snapshot.ref.update({
            status: response.success ? 'completed' : 'failed',
            result: response.data,
            logs: response.logs,
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            error: response.error || null,
        });
    }
    catch (error) {
        console.error(`[AgentRunner] Job ${jobId} failed:`, error);
        await snapshot.ref.update({
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
});
/**
 * Sub-Agent Job Handler (uses AgentManager with routing & skills)
 * Collection: sub_agent_jobs
 */
exports.onSubAgentJobCreated = (0, firestore_1.onDocumentCreated)({
    document: 'sub_agent_jobs/{jobId}',
    // secrets: [geminiApiKey],
    timeoutSeconds: 540,
    memory: '1GiB',
    region: 'asia-northeast3',
}, async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
        console.log('[SubAgentRunner] No data associated with the event');
        return;
    }
    const jobData = snapshot.data();
    const jobId = event.params.jobId;
    if (jobData.status !== 'pending') {
        return;
    }
    console.log(`[SubAgentRunner] Starting job ${jobId}:`, jobData.prompt);
    const startedAtMs = Date.now();
    await snapshot.ref.update({
        status: 'processing',
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    try {
        process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
        process.env.LLM_PROVIDER = 'gemini';
        process.env.GEMINI_MODEL = 'gemini-2.5-flash';
        // Use AgentManager for sub-agent orchestration
        const agentManager = new AgentManager_1.AgentManager();
        const response = await agentManager.execute({
            role: 'manager',
            sessionId: jobId,
            inputs: {
                userInput: jobData.prompt,
                context: jobData.context || {},
                url: jobData.url,
            },
        });
        console.log(`[SubAgentRunner] Job ${jobId} completed. Success: ${response.success}`);
        const processingTimeMs = Date.now() - startedAtMs;
        const routedTo = (() => {
            const data = response.data;
            if (!isPlainRecord(data))
                return null;
            const routeDecision = data.routeDecision;
            if (!isPlainRecord(routeDecision))
                return null;
            const subAgentType = routeDecision.subAgentType;
            return typeof subAgentType === 'string' ? subAgentType : null;
        })();
        const skillsUsed = (() => {
            const data = response.data;
            if (!isPlainRecord(data))
                return [];
            const matchedSkills = data.matchedSkills;
            if (!Array.isArray(matchedSkills))
                return [];
            return matchedSkills.map((v) => String(v)).filter(Boolean);
        })();
        await snapshot.ref.update({
            status: response.success ? 'completed' : 'failed',
            result: response.data,
            logs: response.logs,
            routedTo,
            skillsUsed,
            processingTime: processingTimeMs,
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            error: response.error || null,
        });
    }
    catch (error) {
        console.error(`[SubAgentRunner] Job ${jobId} failed:`, error);
        await snapshot.ref.update({
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
});
//# sourceMappingURL=agentRunner.js.map