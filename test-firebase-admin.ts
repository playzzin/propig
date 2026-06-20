import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { join } from 'path';

async function test() {
  console.log('Testing Initialization...');
  try {
    const serviceAccountPath = join(process.cwd(), "serviceAccountKey.json");
    const serviceAccountFile = readFileSync(serviceAccountPath, "utf8");
    const serviceAccount = JSON.parse(serviceAccountFile);
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('App initialized.');

    const dbId = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || 'pppp';
    console.log(`Getting Firestore for DB: ${dbId}`);
    
    const db = getFirestore(admin.app(), dbId);
    console.log('Firestore instance fetched. Testing get()...');
    
    await db.collection('system_settings').doc('gemini').get();
    console.log('Success!');
  } catch (err) {
    console.error('Error occurred:', err);
  }
}

test();
