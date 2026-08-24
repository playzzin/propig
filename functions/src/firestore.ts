import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

if (!admin.apps.length) {
    admin.initializeApp();
}

export const EXPECTED_FIRESTORE_DATABASE_ID = 'pppp';
const configuredDatabaseId = process.env.FIRESTORE_DATABASE_ID?.trim()
    || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID?.trim();

if (configuredDatabaseId && configuredDatabaseId !== EXPECTED_FIRESTORE_DATABASE_ID) {
    throw new Error(
        `Firestore database must be "${EXPECTED_FIRESTORE_DATABASE_ID}", `
        + `but received "${configuredDatabaseId}".`,
    );
}

export const FIRESTORE_DATABASE_ID = EXPECTED_FIRESTORE_DATABASE_ID;

export const db = getFirestore(admin.app(), FIRESTORE_DATABASE_ID);
