
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');

const logFile = path.resolve(__dirname, 'verify_log.txt');
try {
    fs.writeFileSync(logFile, '', 'utf8');
} catch (e) {
    console.error("Could not write to log file initially", e);
}

function log(msg) {
    console.log(msg);
    try {
        fs.appendFileSync(logFile, msg + '\r\n', 'utf8');
    } catch (e) {
        console.error("Could not append to log file", e);
    }
}

// Manually read .env.local to avoid dotenv parsing issues if any
const envPath = path.resolve(__dirname, '../.env.local');
let apiKey = '';

try {
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        // Look for GEMINI_API_KEY=...
        // Handle potential carriage returns or specific encoding artifacts if readable as utf8
        const lines = envContent.split(/\r?\n/);
        for (const line of lines) {
            if (line.trim().startsWith('GEMINI_API_KEY=')) {
                apiKey = line.split('=')[1].trim();
                break;
            }
        }
    } else {
        log('❌ .env.local file not found at ' + envPath);
    }
} catch (e) {
    log(`Error reading .env.local: ${e.message}`);
}

async function testGemini() {
    log('Testing Gemini API Connection with Multiple Models...');

    if (!apiKey) {
        log('❌ Error: GEMINI_API_KEY not found in .env.local');
        return;
    }

    log(`🔑 API Key found (Length: ${apiKey.length})`);

    const modelsToTest = [
        "gemini-1.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-pro",
        "gemini-2.0-pro-exp-0205" // Latest experimental pro
    ];

    const genAI = new GoogleGenerativeAI(apiKey);

    for (const modelName of modelsToTest) {
        log(`\n--- Testing Model: ${modelName} ---`);
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const prompt = "Hello, reply with 'working' and your model name.";
            log(`📤 Sending request to ${modelName}...`);

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            log(`✅ Success! Response: ${text.trim()}`);
        } catch (error) {
            log(`❌ ${modelName} Error: ${error.message}`);
        }
    }
}

testGemini();
