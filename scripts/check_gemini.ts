
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function checkModels() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('❌ GEMINI_API_KEY is missing in .env.local');
        return;
    }

    console.log(`🔑 API Key found (starts with: ${apiKey.substring(0, 4)}...)`);

    // We can't list models easily with this SDK version directly on the helper, 
    // but we can try to instantiate common models and run a dummy prompt to see which one works.

    const candidates = [
        'gemini-1.5-flash',
        'gemini-1.5-flash-001',
        'gemini-1.5-flash-latest',
        'gemini-1.5-pro',
        'gemini-1.5-pro-001',
        'gemini-1.0-pro',
        'gemini-pro',
        'gemini-pro-vision'
    ];

    console.log('🔍 Testing models...');

    for (const modelName of candidates) {
        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: modelName });

            console.log(`Testing ${modelName}...`);
            const result = await model.generateContent('Hi');
            const response = await result.response;
            console.log(`✅ ${modelName} is AVAILABLE. Response: ${response.text()}`);

            // If we find one, we can stop or list all working ones
        } catch (error: any) {
            if (error.message.includes('404') || error.message.includes('not found')) {
                console.log(`❌ ${modelName} is NOT FOUND (404)`);
            } else {
                console.log(`⚠️ ${modelName} ERROR: ${error.message.split('\n')[0]}`);
            }
        }
    }
}

checkModels();
