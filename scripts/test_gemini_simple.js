const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local') });

async function run() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('❌ No GEMINI_API_KEY found in .env.local');
        return;
    }
    console.log('🔑 API Key found:', apiKey.substring(0, 5) + '...');

    const genAI = new GoogleGenerativeAI(apiKey);
    // Test common models + the suspicious one found in code
    const models = ['gemini-1.5-flash', 'gemini-2.0-flash-exp', 'gemini-2.5-flash'];

    for (const m of models) {
        try {
            console.log(`Testing model: ${m}...`);
            const model = genAI.getGenerativeModel({ model: m });
            const result = await model.generateContent('Hello, are you working?');
            const response = await result.response;
            console.log(`✅ Success with ${m}:`, response.text().substring(0, 50).replace(/\n/g, ' '));
        } catch (e) {
            console.error(`❌ Failed with ${m}:`, e.message.split('\n')[0]);
        }
    }
}

run();
