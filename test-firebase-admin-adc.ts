import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

async function test() {
  console.log('Testing ADC Initialization...');
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault()
    });
    console.log('App initialized with ADC.');

    const dbId = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || 'pppp';
    const db = getFirestore(admin.app(), dbId);
    console.log('Firestore Database ID used:', dbId);
    
    // Test access
    const snap = await db.collection('system_settings').doc('gemini').get();
    console.log('Success! Exists?', snap.exists, 'Data:', snap.data());
  } catch (err) {
    console.error('Error occurred:', (err as Error).message);
  }
}

test();
