import { OrchestratorAgent } from './Orchestrator';

async function runTest() {
    console.log('--- Anti-Gravity Agent System Self-Evaluation ---');
    const orchestrator = new OrchestratorAgent();

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
    const hasFinalCode =
        !!res2.data &&
        typeof res2.data === 'object' &&
        'finalCode' in res2.data;
    console.log('Result:', res2.success && hasFinalCode ? 'SUCCESS' : 'FAIL');
}

runTest().catch(console.error);
