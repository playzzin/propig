
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

async function verify() {
    const apiKey = process.env.GEMINI_API_KEY;

    console.log('--- Debugging Gemini API Key ---');
    if (!apiKey) {
        console.error('❌ GEMINI_API_KEY is missing in .env.local');
        return;
    }

    console.log(`🔑 Key present. Length: ${apiKey.length}`);
    console.log(`🔑 Key prefix: ${apiKey.substring(0, 4)}...`);

    if (!apiKey.startsWith('AIza')) {
        console.warn('⚠️ Warning: Standard Google API Keys usually start with "AIza".');
    }

    const modelName = 'gemini-1.5-flash';
    console.log(`\nTesting model: ${modelName}`);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });

    try {
        const result = await model.generateContent('Hello world');
        const response = await result.response;
        console.log(`✅ Success! Response: ${response.text().substring(0, 50)}...`);
    } catch (error: any) {
        console.error('❌ Failed.');
        console.error('Error Name:', error.name);
        console.error('Error Message:', error.message);
        if (error.response) {
            console.error('Error Response:', JSON.stringify(error.response, null, 2));
        }
    }
}

verify();
