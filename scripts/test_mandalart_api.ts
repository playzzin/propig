
async function testMandalart() {
    console.log('Testing Mandalart API...');
    try {
        const res = await fetch('http://localhost:6001/api/generate-mandalart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ goal: '테스트 목표' }),
        });

        console.log(`Status: ${res.status}`);
        const text = await res.text();
        console.log(`Body: ${text}`);

    } catch (e) {
        console.error('Fetch failed:', e);
    }
}

testMandalart();
