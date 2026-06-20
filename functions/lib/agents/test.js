"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Orchestrator_1 = require("./Orchestrator");
async function runTest() {
    var _a;
    console.log('--- Anti-Gravity Agent System Self-Evaluation ---');
    const orchestrator = new Orchestrator_1.OrchestratorAgent();
    // Test 1: Direct Command (Echo)
    console.log('\n[Test 1] Direct Command (Echo)');
    const res1 = await orchestrator.execute({
        role: 'orchestrator',
        inputs: { command: 'echo', payload: { text: 'Hello Agent' } }
    });
    console.log('Result:', res1.success ? 'SUCCESS' : 'FAIL', res1.data);
    // Test 2: Workflow (Generate Code)
    console.log('\n[Test 2] Workflow (Generate Code)');
    const res2 = await orchestrator.execute({
        role: 'orchestrator',
        inputs: {
            command: 'generate',
            payload: { userInput: 'Create a distinct Counter class in TypeScript' }
        }
    });
    console.log('Logs:');
    res2.logs.forEach(l => console.log('  ' + l));
    console.log('Output Data:', JSON.stringify(res2.data, null, 2));
    console.log('Result:', res2.success && ((_a = res2.data) === null || _a === void 0 ? void 0 : _a.finalCode) ? 'SUCCESS' : 'FAIL');
}
runTest().catch(console.error);
//# sourceMappingURL=test.js.map