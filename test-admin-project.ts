import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

async function checkAdminInit() {
  try {
    const serviceAccountPath = join(process.cwd(), "serviceAccountKey.json");
    console.log('File exists?', existsSync(serviceAccountPath));
    if (existsSync(serviceAccountPath)) {
      const serviceAccountFile = readFileSync(serviceAccountPath, "utf8");
      const serviceAccount = JSON.parse(serviceAccountFile);
      console.log('Project ID from JSON:', serviceAccount.project_id);
    }
    
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      console.log('Project ID from ENV:', JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY).project_id);
    } else {
      console.log('ENV FIREBASE_SERVICE_ACCOUNT_KEY not set.');
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

checkAdminInit();
