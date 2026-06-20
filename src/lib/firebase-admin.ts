import admin from "firebase-admin";
import { existsSync, readFileSync } from "fs";
import { getFirestore } from "firebase-admin/firestore";
import { homedir } from "os";
import { join } from "path";

export type FirebaseAdminCredentialMode =
  | "service_account_env"
  | "service_account_split_env"
  | "service_account_path"
  | "application_default"
  | "unavailable";

export type FirebaseAdminStatus = {
  initialized: boolean;
  canPersistToFirestore: boolean;
  credentialMode: FirebaseAdminCredentialMode;
  message: string | null;
};

let adminCredentialMode: FirebaseAdminCredentialMode = "unavailable";
let adminInitializationError: string | null = null;
let hasResolvableApplicationDefaultCredentials = false;

const loadServiceAccountFromEnv = (): admin.ServiceAccount | null => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return parsed as admin.ServiceAccount;
  } catch (error) {
    console.warn("FIREBASE_SERVICE_ACCOUNT_KEY parsing failed:", error);
    return null;
  }
};

const loadServiceAccountFromSplitEnv = (): admin.ServiceAccount | null => {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) return null;

  return {
    projectId,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, "\n"),
  };
};

const loadServiceAccountFromPath = (): admin.ServiceAccount | null => {
  const explicitPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const serviceAccountPath = explicitPath || join(process.cwd(), "serviceAccountKey.json");

  try {
    const file = readFileSync(serviceAccountPath, "utf8");
    return JSON.parse(file) as admin.ServiceAccount;
  } catch {
    return null;
  }
};

const findApplicationDefaultCredentialsPath = (): string | null => {
  const explicitPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (explicitPath && existsSync(explicitPath)) {
    return explicitPath;
  }

  const windowsAppData = process.env.APPDATA;
  const candidates = [
    windowsAppData ? join(windowsAppData, "gcloud", "application_default_credentials.json") : "",
    join(homedir(), ".config", "gcloud", "application_default_credentials.json"),
  ].filter(Boolean);

  const resolvedPath = candidates.find((candidate) => existsSync(candidate));
  return resolvedPath || null;
};

const isGoogleManagedRuntime = (): boolean =>
  Boolean(
    process.env.K_SERVICE ||
      process.env.CLOUD_RUN_JOB ||
      process.env.FUNCTION_TARGET ||
      process.env.FUNCTION_NAME ||
      process.env.GAE_ENV,
  );

const buildMissingCredentialsMessage = (): string =>
  "Firebase Admin credentials are not configured for Firestore writes. Set FIREBASE_SERVICE_ACCOUNT_KEY, FIREBASE_SERVICE_ACCOUNT_PATH, FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY, or run `gcloud auth application-default login`.";

const resolveStorageBucket = (): string | undefined => {
  return (
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    undefined
  );
};

if (!admin.apps.length) {
  try {
    const envServiceAccount = loadServiceAccountFromEnv();
    const splitEnvServiceAccount = envServiceAccount ? null : loadServiceAccountFromSplitEnv();
    const pathServiceAccount =
      envServiceAccount || splitEnvServiceAccount ? null : loadServiceAccountFromPath();

    hasResolvableApplicationDefaultCredentials =
      Boolean(findApplicationDefaultCredentialsPath()) || isGoogleManagedRuntime();

    if (envServiceAccount) {
      adminCredentialMode = "service_account_env";
      admin.initializeApp({
        credential: admin.credential.cert(envServiceAccount),
        storageBucket: resolveStorageBucket(),
      });
    } else if (splitEnvServiceAccount) {
      adminCredentialMode = "service_account_split_env";
      admin.initializeApp({
        credential: admin.credential.cert(splitEnvServiceAccount),
        storageBucket: resolveStorageBucket(),
      });
    } else if (pathServiceAccount) {
      adminCredentialMode = "service_account_path";
      admin.initializeApp({
        credential: admin.credential.cert(pathServiceAccount),
        storageBucket: resolveStorageBucket(),
      });
    } else {
      adminCredentialMode = "application_default";
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
        storageBucket: resolveStorageBucket(),
      });
    }

    console.log("Firebase Admin initialized");
  } catch (error) {
    adminCredentialMode = "unavailable";
    adminInitializationError = error instanceof Error ? error.message : String(error);
    console.warn("Firebase Admin initialization failed:", error);
  }
}

let db: FirebaseFirestore.Firestore;

if (admin.apps.length > 0) {
  db = getFirestore(admin.app(), process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || "(default)");
} else {
  db = new Proxy({} as FirebaseFirestore.Firestore, {
    get: () => {
      throw new Error(
        "Firebase Admin initialization failed. Check serviceAccountKey.json or Firebase Admin environment variables.",
      );
    },
  });
}

export const getFirebaseAdminStatus = (): FirebaseAdminStatus => {
  const initialized = admin.apps.length > 0;
  const canPersistToFirestore =
    initialized &&
    (adminCredentialMode === "service_account_env" ||
      adminCredentialMode === "service_account_split_env" ||
      adminCredentialMode === "service_account_path" ||
      (adminCredentialMode === "application_default" && hasResolvableApplicationDefaultCredentials));

  if (!initialized) {
    return {
      initialized,
      canPersistToFirestore: false,
      credentialMode: adminCredentialMode,
      message: adminInitializationError || buildMissingCredentialsMessage(),
    };
  }

  if (!canPersistToFirestore) {
    return {
      initialized,
      canPersistToFirestore: false,
      credentialMode: adminCredentialMode,
      message: buildMissingCredentialsMessage(),
    };
  }

  return {
    initialized,
    canPersistToFirestore: true,
    credentialMode: adminCredentialMode,
    message: null,
  };
};

export { db };
export default admin;
