import * as fs from 'fs';
import * as path from 'path';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Manual env loader
function loadEnv(filename: string) {
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

// Initialize Firebase Admin (Inline)
if (getApps().length === 0) {
    try {
        let serviceAccount;
        if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
            serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
        } else {
            const serviceAccountPath = path.join(process.cwd(), "serviceAccountKey.json");
            if (fs.existsSync(serviceAccountPath)) {
                const serviceAccountFile = fs.readFileSync(serviceAccountPath, "utf8");
                serviceAccount = JSON.parse(serviceAccountFile);
            } else {
                console.error("No service account found in env or file.");
                process.exit(1);
            }
        }

        initializeApp({
            credential: cert(serviceAccount),
        });
        console.log("Firebase Admin initialized successfully.");
    } catch (error) {
        console.error("Firebase Admin initialization failed:", error);
        process.exit(1);
    }
}

async function diagnose() {
    try {
        console.log("Checking Firestore 'users' collection...");
        const db = getFirestore();
        const usersSnap = await db.collection('users').get();

        if (usersSnap.empty) {
            console.log("No users found in 'users' collection.");
        } else {
            console.log(`Found ${usersSnap.size} user(s).`);

            for (const userDoc of usersSnap.docs) {
                const userData = userDoc.data();
                console.log(`\nUser: ${userDoc.id} (${userData.email || 'No Email'})`);

                // Check stickyNotes subcollection
                const notesSnap = await userDoc.ref.collection('stickyNotes').get();
                if (notesSnap.empty) {
                    console.log("  -> No 'stickyNotes' (memos) found for this user.");
                } else {
                    console.log(`  -> Found ${notesSnap.size} memo(s) in 'stickyNotes'.`);
                    notesSnap.docs.forEach((note, index) => {
                        if (index < 3) {
                            const content = note.data().content || '';
                            console.log(`     - [${note.id}] ${content.substring(0, 30)}${content.length > 30 ? '...' : ''}`);
                        }
                    });
                    if (notesSnap.size > 3) console.log(`     - ... and ${notesSnap.size - 3} more.`);
                }
            }
        }

        // Check for root 'memos' or 'sticky_notes'
        const rootCheck = ['memos', 'memo', 'sticky_notes', 'stickyNotes'];
        for (const name of rootCheck) {
            const snap = await db.collection(name).get();
            if (!snap.empty) {
                console.log(`\nWARNING: Found ${snap.size} docs in top-level '${name}' collection.`);
            } else {
                console.log(`\nChecked top-level '${name}': Empty (Correct).`);
            }
        }

    } catch (error) {
        console.error("Diagnosis failed:", error);
    }
}

diagnose();
