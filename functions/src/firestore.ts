import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

if (!admin.apps.length) {
    admin.initializeApp();
}

export const FIRESTORE_DATABASE_ID =
    process.env.FIRESTORE_DATABASE_ID?.trim()
    || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID?.trim()
    || 'pppp';

export const db = getFirestore(admin.app(), FIRESTORE_DATABASE_ID);
