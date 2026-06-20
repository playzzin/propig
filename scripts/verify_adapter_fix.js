
const fs = require('fs');
const path = require('path');
const https = require('https');

// 1. Read API Key
const envPath = path.resolve(__dirname, '../.env.local');
let apiKey = '';
try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/GEMINI_API_KEY=(.*)/);
    if (match) apiKey = match[1].trim();
} catch (e) {
    console.error('Error reading .env.local');
    process.exit(1);
}

if (!apiKey) {
    console.error('No API Key found');
    process.exit(1);
}

// 2. Simulate GeminiAdapter Payload
const requestBody = {
    contents: [{
        role: 'user',
        parts: [{ text: 'Hello, are you working?' }]
    }],
    generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 100
    },
    // This is the field that failed on v1
    systemInstruction: {
        parts: [{ text: 'You are a helpful assistant.' }]
    }
};

// 3. Send Request to v1beta (The Fix)
const data = JSON.stringify(requestBody);
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

console.log('Test URL:', url.replace(apiKey, 'HIDDEN'));
console.log('Sending request with systemInstruction...');

const req = https.request(url, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
}, (res) => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => {
        console.log(`Status Code: ${res.statusCode}`);
        if (res.statusCode === 200) {
            console.log('✅ Success! v1beta accepted systemInstruction.');
            console.log('Response snippet:', body.substring(0, 100));
        } else {
            console.error('❌ Failed:', body);
        }
    });
});

req.on('error', (e) => {
    console.error('Request Error:', e);
});

req.write(data);
req.end();
