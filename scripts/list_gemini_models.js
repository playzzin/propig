
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

// Load .env.local manually since we are using node
try {
    const envPath = path.resolve(process.cwd(), '.env.local');
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            process.env[match[1]] = match[2].trim();
        }
    });
} catch (e) {
    console.log('Could not load .env.local');
}

async function listModels() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        console.error('No GEMINI_API_KEY found');
        return;
    }
    console.log(`Checking models for key: ${key.substring(0, 5)}...`);

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
        const res = await fetch(url);

        if (res.ok) {
            const data = await res.json();
            console.log('Available Models:');
            if (data.models) {
                data.models.forEach(m => {
                    console.log(`- ${m.name} (${m.supportedGenerationMethods.join(', ')})`);
                });
            } else {
                console.log('No models returned in list.');
            }
        } else {
            console.error(`Failed to list models: ${res.status}`);
            console.error(await res.text());
        }
    } catch (e) {
        console.error('Network error:', e);
    }
}

listModels();
