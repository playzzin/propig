
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars from root .env.local or .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    console.error('Error: GEMINI_API_KEY not found in environment variables.');
    process.exit(1);
}

const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return String(error);
};

async function listModels(requiredApiKey: string) {
    const genAI = new GoogleGenerativeAI(requiredApiKey);
    // For listing models, we can't use the client directly to list models in the Node SDK easily 
    // without using the ModelService if exposed, but usually we try to infer or just test a model.
    // Actually, the SDK doesn't always expose listModels directly on the main instance in earlier versions,
    // but let's check if we can simply try a few known models.

    // Correction: The SDK references usually just let you get a model. 
    // There isn't a simple "listModels" method on GoogleGenerativeAI class in the JS SDK v0.1.0+ typically.
    // We have to use the REST API or just try to generate content.

    const modelsToTest = [
        'gemini-1.5-flash',
        'gemini-1.5-flash-latest',
        'gemini-1.5-pro',
        'gemini-1.5-pro-latest',
        'gemini-1.0-pro',
        'gemini-pro',
        'gemini-2.0-flash-exp'
    ];

    console.log('Testing models with API Key...');

    for (const modelName of modelsToTest) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent('Hello, are you there?');
            const response = await result.response;
            console.log(`[PASS] ${modelName} is available.`);
        } catch (error: unknown) {
            // console.error(`[FAIL] ${modelName}:`, error.message);
            const message = getErrorMessage(error);
            console.log(`[FAIL] ${modelName} - ${message.split(']')[1] || message}`);
        }
    }
}

listModels(apiKey);
