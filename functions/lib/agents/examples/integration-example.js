"use strict";
/**
 * Complete Integration Example
 * 모든 주요 기능을 통합한 실제 사용 예제
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.basicConversationExample = basicConversationExample;
exports.ragExample = ragExample;
exports.toolExecutionExample = toolExecutionExample;
exports.workflowExample = workflowExample;
exports.errorRecoveryExample = errorRecoveryExample;
exports.multimodalExample = multimodalExample;
exports.metricsExample = metricsExample;
exports.integratedScenario = integratedScenario;
exports.runAllExamples = runAllExamples;
const MemoryManager_1 = require("../memory/MemoryManager");
const VectorStore_1 = require("../rag/VectorStore");
const ToolRegistry_1 = require("../tools/ToolRegistry");
const MetricsCollector_1 = require("../monitoring/MetricsCollector");
const WorkflowEngine_1 = require("../workflow/WorkflowEngine");
const MultimodalProcessor_1 = require("../multimodal/MultimodalProcessor");
const ErrorHandler_1 = require("../resilience/ErrorHandler");
const Orchestrator_1 = require("../Orchestrator");
/**
 * Example 1: 기본 대화 흐름 (메모리 + 에이전트)
 */
async function basicConversationExample() {
    console.log('\n=== Example 1: Basic Conversation ===\n');
    // 1. 세션 생성
    const sessionId = await MemoryManager_1.memoryManager.createSession('user123', {
        platform: 'web',
        timestamp: Date.now(),
    });
    console.log('✓ Session created:', sessionId);
    // 2. 첫 번째 메시지
    await MemoryManager_1.memoryManager.addMessage(sessionId, 'user', 'Hello! My name is John.');
    console.log('✓ User message added');
    // 3. 에이전트 실행
    const orchestrator = new Orchestrator_1.OrchestratorAgent();
    const response1 = await orchestrator.execute({
        role: 'orchestrator',
        inputs: {
            command: 'generate',
            payload: { userInput: 'Create a greeting function' },
        },
    });
    console.log('✓ Agent response:', response1.data);
    // 4. AI 응답 저장
    await MemoryManager_1.memoryManager.addMessage(sessionId, 'assistant', JSON.stringify(response1.data));
    // 5. 두 번째 메시지 (컨텍스트 유지)
    await MemoryManager_1.memoryManager.addMessage(sessionId, 'user', 'What was my name again?');
    // 6. 컨텍스트 조회
    const context = await MemoryManager_1.memoryManager.getConversationContext(sessionId);
    console.log('✓ Conversation context:', context);
    return sessionId;
}
/**
 * Example 2: RAG 기반 질의응답
 */
async function ragExample() {
    console.log('\n=== Example 2: RAG System ===\n');
    // 1. 지식 베이스 구축
    const documents = [
        {
            content: 'Next.js is a React framework for building web applications with server-side rendering.',
            metadata: { source: 'docs', category: 'framework' },
        },
        {
            content: 'Firebase is a Backend-as-a-Service platform that provides authentication, database, and hosting.',
            metadata: { source: 'docs', category: 'backend' },
        },
        {
            content: 'TypeScript adds static typing to JavaScript, catching errors at compile time.',
            metadata: { source: 'docs', category: 'language' },
        },
    ];
    const docIds = await VectorStore_1.vectorStore.addDocuments(documents);
    console.log('✓ Indexed', docIds.length, 'documents');
    // 2. 검색 실행
    const query = 'What is Next.js?';
    const ragContext = await VectorStore_1.ragSystem.retrieveContext(query, 2);
    console.log('✓ Query:', query);
    console.log('✓ Retrieved documents:', ragContext.retrievedDocuments.length);
    console.log('✓ Augmented prompt:', ragContext.augmentedPrompt);
    // 3. 소스와 함께 답변 생성
    const answerWithSources = await VectorStore_1.ragSystem.getAnswerWithSources(query);
    console.log('✓ Sources:', answerWithSources.sources);
    return ragContext;
}
/**
 * Example 3: 툴 실행
 */
async function toolExecutionExample() {
    console.log('\n=== Example 3: Tool Execution ===\n');
    // 1. 계산기 툴
    const calcResult = await ToolRegistry_1.toolRegistry.executeTool('calculator', {
        expression: '(100 + 50) * 2',
    });
    console.log('✓ Calculator:', calcResult.data);
    // 2. 시간 조회 툴
    const timeResult = await ToolRegistry_1.toolRegistry.executeTool('get_current_time', {
        timezone: 'Asia/Seoul',
    });
    console.log('✓ Current time:', timeResult.data);
    // 3. JSON 파싱 툴
    const jsonResult = await ToolRegistry_1.toolRegistry.executeTool('parse_json', {
        json_string: '{"name": "John", "age": 30}',
    });
    console.log('✓ Parsed JSON:', jsonResult.data);
    // 4. 웹 검색 툴 (목업)
    const searchResult = await ToolRegistry_1.toolRegistry.executeTool('web_search', {
        query: 'AI agents',
        maxResults: 3,
    });
    console.log('✓ Search results:', searchResult.data);
    return { calcResult, timeResult, jsonResult, searchResult };
}
/**
 * Example 4: 워크플로우 실행
 */
async function workflowExample() {
    console.log('\n=== Example 4: Workflow Execution ===\n');
    // 1. 워크플로우 생성 및 등록
    const workflow = (0, WorkflowEngine_1.createCodeReviewWorkflow)();
    WorkflowEngine_1.workflowEngine.registerWorkflow(workflow);
    console.log('✓ Workflow registered:', workflow.name);
    // 2. 워크플로우 실행
    const result = await WorkflowEngine_1.workflowEngine.executeWorkflow('code_review', {
        code: `
function greet(name) {
    console.log('Hello, ' + name);
}
        `.trim(),
    });
    console.log('✓ Workflow success:', result.success);
    console.log('✓ Final result:', result.finalResult);
    console.log('✓ Execution logs:', result.context.logs);
    return result;
}
/**
 * Example 5: 에러 복구 및 재시도
 */
async function errorRecoveryExample() {
    console.log('\n=== Example 5: Error Recovery ===\n');
    let attempts = 0;
    // 불안정한 함수 시뮬레이션
    const unstableFunction = async () => {
        attempts++;
        if (attempts < 3) {
            throw new Error(`Attempt ${attempts} failed`);
        }
        return { success: true, attempts };
    };
    // Retry with backoff
    const result = await (0, ErrorHandler_1.retryWithBackoff)(unstableFunction, {
        maxAttempts: 5,
        delayMs: 100,
        backoffMultiplier: 2,
        maxDelayMs: 1000,
    });
    console.log('✓ Succeeded after', result.attempts, 'attempts');
    console.log('✓ Result:', result);
    return result;
}
/**
 * Example 6: 멀티모달 처리 (모의)
 */
async function multimodalExample() {
    console.log('\n=== Example 6: Multimodal Processing ===\n');
    // 파일 업로드 시뮬레이션
    const mockImageBuffer = Buffer.from('mock image data');
    const fileMetadata = await MultimodalProcessor_1.multimodalProcessor.uploadFile(mockImageBuffer, 'test-image.png', 'image/png', 'user123', 'session_abc');
    console.log('✓ File uploaded:', fileMetadata.fileId);
    console.log('✓ File name:', fileMetadata.fileName);
    console.log('✓ File size:', fileMetadata.fileSize, 'bytes');
    // 세션 파일 조회
    const sessionFiles = await MultimodalProcessor_1.multimodalProcessor.getSessionFiles('session_abc');
    console.log('✓ Session files:', sessionFiles.length);
    return fileMetadata;
}
/**
 * Example 7: 메트릭 수집 및 분석
 */
async function metricsExample() {
    console.log('\n=== Example 7: Metrics Collection ===\n');
    // 1. 메트릭 기록
    await MetricsCollector_1.metricsCollector.recordAgentExecution({
        agentRole: 'analyzer',
        executionTimeMs: 1250,
        success: true,
        timestamp: Date.now(),
        userId: 'user123',
    });
    await MetricsCollector_1.metricsCollector.recordAgentExecution({
        agentRole: 'code',
        executionTimeMs: 2100,
        success: true,
        timestamp: Date.now(),
        userId: 'user123',
    });
    console.log('✓ Metrics recorded');
    // 2. 성능 리포트
    const report = await MetricsCollector_1.metricsCollector.getPerformanceReport('day');
    console.log('✓ Total requests:', report.totalRequests);
    console.log('✓ Success rate:', report.successRate + '%');
    console.log('✓ Avg execution time:', report.averageExecutionTime + 'ms');
    // 3. 실시간 통계
    const stats = await MetricsCollector_1.metricsCollector.getRealtimeStats();
    console.log('✓ Active users:', stats.activeUsers);
    console.log('✓ Requests/min:', stats.requestsPerMinute);
    return { report, stats };
}
/**
 * Example 8: 통합 시나리오
 * 모든 기능을 결합한 복잡한 사용 사례
 */
async function integratedScenario() {
    console.log('\n=== Example 8: Integrated Scenario ===\n');
    console.log('시나리오: 사용자가 코드 작성을 요청하고, RAG로 컨텍스트를 찾고, 워크플로우로 처리');
    // 1. 세션 시작
    const sessionId = await MemoryManager_1.memoryManager.createSession('user456');
    console.log('✓ Step 1: Session created');
    // 2. 사용자 질문
    const userQuery = 'Create a React component with TypeScript';
    await MemoryManager_1.memoryManager.addMessage(sessionId, 'user', userQuery);
    console.log('✓ Step 2: User message added');
    // 3. RAG로 관련 문서 검색
    const ragContext = await VectorStore_1.ragSystem.retrieveContext(userQuery, 2);
    console.log('✓ Step 3: RAG context retrieved');
    // 4. 툴 실행 (현재 시간 조회)
    const timeResult = await ToolRegistry_1.toolRegistry.executeTool('get_current_time', {});
    console.log('✓ Step 4: Tool executed');
    // 5. 오케스트레이터로 코드 생성
    const orchestrator = new Orchestrator_1.OrchestratorAgent();
    const response = await orchestrator.execute({
        role: 'orchestrator',
        inputs: {
            command: 'generate',
            payload: {
                userInput: userQuery,
                ragContext: ragContext.augmentedPrompt,
                additionalInfo: timeResult.data,
            },
        },
    });
    console.log('✓ Step 5: Code generated');
    // 6. 응답 저장
    await MemoryManager_1.memoryManager.addMessage(sessionId, 'assistant', JSON.stringify(response.data));
    console.log('✓ Step 6: Response saved to memory');
    // 7. 메트릭 기록
    await MetricsCollector_1.metricsCollector.recordAgentExecution({
        agentRole: 'orchestrator',
        executionTimeMs: 3500,
        success: response.success,
        timestamp: Date.now(),
        sessionId,
        userId: 'user456',
    });
    console.log('✓ Step 7: Metrics recorded');
    // 8. 최종 컨텍스트 조회
    const finalContext = await MemoryManager_1.memoryManager.getConversationContext(sessionId);
    console.log('✓ Step 8: Final context:', finalContext.length, 'characters');
    return {
        sessionId,
        response: response.data,
        context: finalContext,
    };
}
/**
 * 모든 예제 실행
 */
async function runAllExamples() {
    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║  AI Agent System - Integration Examples  ║');
    console.log('╚══════════════════════════════════════════╝\n');
    try {
        await basicConversationExample();
        await ragExample();
        await toolExecutionExample();
        await workflowExample();
        await errorRecoveryExample();
        await multimodalExample();
        await metricsExample();
        await integratedScenario();
        console.log('\n✅ All examples completed successfully!\n');
    }
    catch (error) {
        console.error('\n❌ Error running examples:', error);
    }
}
// CLI에서 직접 실행 가능
if (require.main === module) {
    runAllExamples().catch(console.error);
}
//# sourceMappingURL=integration-example.js.map