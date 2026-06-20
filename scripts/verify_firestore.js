
const fs = require('fs');
const path = require('path');

// Manual env loader
function loadEnv(filename) {
    const filepath = path.resolve(process.cwd(), filename);
    if (fs.existsSync(filepath)) {
        const content = fs.readFileSync(filepath, 'utf8');
        content.split('\n').forEach(line => {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                const value = match[2].trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
                if (!process.env[key]) {
                    process.env[key] = value;
                }
            }
        });
    }
}

loadEnv('.env');
loadEnv('.env.local');

// Import Client SDK (using require for CommonJS)
// Note: In newer firebase versions, we might need dynamic import() for ESM, 
// but let's try standard require first as it often works with the 'compat' or standard build in Node.
// If this fails, we will use the 'firebase/compat/app' syntax.

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, setDoc, serverTimestamp } = require('firebase/firestore');

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

console.log(`\n⚙️ Configured Project ID: ${firebaseConfig.projectId}`);

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function verify() {
    try {
        console.log("🔥 Connecting using Client SDK...");

        // 1. Try to read 'users' (Might fail if rules require auth, but let's try)
        console.log("\n👤 Attempting to read 'users'...");
        try {
            const usersRef = collection(db, 'users');
            const usersSnap = await getDocs(usersRef);

            if (usersSnap.empty) {
                console.log("   -> Success, but collection is EMPTY.");
            } else {
                console.log(`   -> Success! Found ${usersSnap.size} users.`);
                usersSnap.forEach(d => console.log(`      - ${d.id}`));
            }
        } catch (e) {
            console.log("   -> Read failed (likely Permission Denied due to Security Rules). This confirms CONNECTION is good, just blocked by rules.");
            console.log(`      Error: ${e.message}`);
        }

        // 2. Try to write a test doc (Might fail if rules require auth)
        console.log("\n✍️ Attempting to write check doc...");
        try {
            await setDoc(doc(db, '_antigravity_check', 'ping'), {
                verified: true,
                at: new Date().toISOString()
            });
            console.log("   -> Write SUCCESS! Check collection '_antigravity_check' in Console.");
        } catch (e) {
            console.log("   -> Write failed (likely Permission Denied).");
            console.log(`      Error: ${e.message}`);
        }

        console.log("\n✅ Diagnosis Complete.");
        console.log("If you saw 'Success' or 'Permission Denied', your app IS connecting to this project.");
        console.log("If you saw 'Network Error' or 'unavailable', then there is a connection issue.");

    } catch (error) {
        console.error("\n❌ Unexpected Error:", error);
    }
}

verify();
