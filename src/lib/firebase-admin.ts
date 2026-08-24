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
  canSignStorageUrls: boolean;
  credentialMode: FirebaseAdminCredentialMode;
  message: string | null;
};

let adminCredentialMode: FirebaseAdminCredentialMode = "unavailable";
let adminInitializationError: string | null = null;
let adminCredentialValidationError: string | null = null;
let hasResolvableApplicationDefaultCredentials = false;

const shouldDebugFirebaseAdmin =
  (process.env.FIREBASE_ADMIN_DEBUG ?? "").toLowerCase() === "true";

const normalizeServiceAccount = (value: unknown): admin.ServiceAccount | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const projectId =
    typeof record.projectId === "string"
      ? record.projectId
      : typeof record.project_id === "string"
        ? record.project_id
        : "";
  const clientEmail =
    typeof record.clientEmail === "string"
      ? record.clientEmail
      : typeof record.client_email === "string"
        ? record.client_email
        : "";
  const privateKey =
    typeof record.privateKey === "string"
      ? record.privateKey
      : typeof record.private_key === "string"
        ? record.private_key
        : "";

  if (!projectId.trim() || !clientEmail.trim() || !privateKey.trim()) {
    adminCredentialValidationError =
      "Firebase service-account credentials must include project_id, client_email, and private_key.";
    return null;
  }

  return {
    projectId: projectId.trim(),
    clientEmail: clientEmail.trim(),
    privateKey: privateKey.replace(/\\n/g, "\n"),
  };
};

const loadServiceAccountFromEnv = (): admin.ServiceAccount | null => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;

  try {
    return normalizeServiceAccount(JSON.parse(raw));
  } catch (error) {
    console.warn("FIREBASE_SERVICE_ACCOUNT_KEY parsing failed:", error);
    adminCredentialValidationError =
      "FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON.";
    return null;
  }
};

const loadServiceAccountFromSplitEnv = (): admin.ServiceAccount | null => {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) return null;

  return normalizeServiceAccount({
    projectId,
    clientEmail,
    privateKey,
  });
};

const loadServiceAccountFromPath = (): admin.ServiceAccount | null => {
  const explicitPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const serviceAccountPath =
    explicitPath ||
    (process.env.NODE_ENV === "development"
      ? join(/*turbopackIgnore: true*/ process.cwd(), "serviceAccountKey.json")
      : null);

  if (!serviceAccountPath) return null;

  try {
    const file = readFileSync(/*turbopackIgnore: true*/ serviceAccountPath, "utf8");
    return normalizeServiceAccount(JSON.parse(file));
  } catch {
    adminCredentialValidationError =
      "FIREBASE_SERVICE_ACCOUNT_PATH could not be read or parsed.";
    return null;
  }
};

const findApplicationDefaultCredentialsPath = (): string | null => {
  const explicitPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (explicitPath && existsSync(/*turbopackIgnore: true*/ explicitPath)) {
    return explicitPath;
  }

  const windowsAppData = process.env.APPDATA;
  const normalizedCwd = process.cwd().replace(/\\/g, "/");
  const wslWindowsProfile = normalizedCwd.match(
    /^\/mnt\/([a-z])\/Users\/([^/]+)/i,
  );
  const wslWindowsAppData = wslWindowsProfile
    ? `/mnt/${wslWindowsProfile[1]}/Users/${wslWindowsProfile[2]}/AppData/Roaming`
    : "";
  const candidates = [
    windowsAppData ? join(windowsAppData, "gcloud", "application_default_credentials.json") : "",
    wslWindowsAppData
      ? join(
          wslWindowsAppData,
          "gcloud",
          "application_default_credentials.json",
        )
      : "",
    join(homedir(), ".config", "gcloud", "application_default_credentials.json"),
  ].filter(Boolean);

  const resolvedPath = candidates.find((candidate) => existsSync(/*turbopackIgnore: true*/ candidate));
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

// Application Default Credentials can be created while the local Next server is
// already running. Re-check the filesystem when reporting persistence status so
// a dev-server restart is not required after `gcloud auth application-default login`.
const hasCurrentApplicationDefaultCredentials = (): boolean =>
  hasResolvableApplicationDefaultCredentials ||
  Boolean(findApplicationDefaultCredentialsPath()) ||
  isGoogleManagedRuntime();

const buildMissingCredentialsMessage = (): string =>
  adminCredentialValidationError ||
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

    const applicationDefaultCredentialsPath =
      findApplicationDefaultCredentialsPath();
    hasResolvableApplicationDefaultCredentials =
      Boolean(applicationDefaultCredentialsPath) || isGoogleManagedRuntime();

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
      if (
        applicationDefaultCredentialsPath &&
        !process.env.GOOGLE_APPLICATION_CREDENTIALS
      ) {
        process.env.GOOGLE_APPLICATION_CREDENTIALS =
          applicationDefaultCredentialsPath;
      }
      adminCredentialMode = "application_default";
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
        storageBucket: resolveStorageBucket(),
      });
    }

    if (shouldDebugFirebaseAdmin) {
      console.info("Firebase Admin initialized");
    }
  } catch (error) {
    adminCredentialMode = "unavailable";
    adminInitializationError = error instanceof Error ? error.message : String(error);
    console.warn("Firebase Admin initialization failed:", error);
  }
}

// Next.js Fast Refresh can preserve the Firebase Admin singleton while
// re-evaluating this module. In that case, recover the credential mode from the
// current runtime instead of treating the already initialized app as unusable.
if (admin.apps.length > 0 && adminCredentialMode === "unavailable" && !adminInitializationError) {
  const hasEnvServiceAccount = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  const hasSplitEnvServiceAccount = Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY,
  );
  const explicitServiceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const developmentServiceAccountPath =
    process.env.NODE_ENV === "development"
      ? join(/*turbopackIgnore: true*/ process.cwd(), "serviceAccountKey.json")
      : null;
  const hasServiceAccountPath = Boolean(
    (explicitServiceAccountPath &&
      existsSync(/*turbopackIgnore: true*/ explicitServiceAccountPath)) ||
      (developmentServiceAccountPath &&
        existsSync(/*turbopackIgnore: true*/ developmentServiceAccountPath)),
  );

  hasResolvableApplicationDefaultCredentials =
    Boolean(findApplicationDefaultCredentialsPath()) || isGoogleManagedRuntime();

  if (hasEnvServiceAccount) {
    adminCredentialMode = "service_account_env";
  } else if (hasSplitEnvServiceAccount) {
    adminCredentialMode = "service_account_split_env";
  } else if (hasServiceAccountPath) {
    adminCredentialMode = "service_account_path";
  } else if (hasResolvableApplicationDefaultCredentials) {
    adminCredentialMode = "application_default";
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
      (adminCredentialMode === "application_default" && hasCurrentApplicationDefaultCredentials()));

  if (!initialized) {
    return {
      initialized,
      canPersistToFirestore: false,
      canSignStorageUrls: false,
      credentialMode: adminCredentialMode,
      message: adminInitializationError || buildMissingCredentialsMessage(),
    };
  }

  if (!canPersistToFirestore) {
    return {
      initialized,
      canPersistToFirestore: false,
      canSignStorageUrls: false,
      credentialMode: adminCredentialMode,
      message: buildMissingCredentialsMessage(),
    };
  }

  return {
    initialized,
    canPersistToFirestore: true,
    canSignStorageUrls:
      adminCredentialMode === "service_account_env" ||
      adminCredentialMode === "service_account_split_env" ||
      adminCredentialMode === "service_account_path",
    credentialMode: adminCredentialMode,
    message: null,
  };
};

export type FirebaseAdminRuntimeProbe = {
  status: FirebaseAdminStatus;
  firestore: {
    ok: boolean;
    message: string;
  };
  storage: {
    ok: boolean;
    message: string;
  };
  storageSigning: {
    ok: boolean;
    message: string;
  };
  storageDelivery: {
    ok: boolean;
    mode: "firebase_download_token";
    message: string;
  };
};

export async function probeFirebaseAdminRuntime(): Promise<FirebaseAdminRuntimeProbe> {
  const status = getFirebaseAdminStatus();
  if (!status.canPersistToFirestore) {
    const message = status.message || "Firebase Admin credentials are unavailable.";
    return {
      status,
      firestore: { ok: false, message },
      storage: { ok: false, message },
      storageSigning: { ok: false, message },
      storageDelivery: {
        ok: false,
        mode: "firebase_download_token",
        message,
      },
    };
  }

  const firestore = await db
    .collection("video_studio_jobs")
    .limit(1)
    .get()
    .then(() => ({
      ok: true,
      message: "Firestore Admin read access is available.",
    }))
    .catch((error: unknown) => ({
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Firestore Admin read access failed.",
    }));

  const bucket = admin.storage().bucket();
  const [storage, storageSigning] = await Promise.all([
    bucket
    .getMetadata()
    .then(() => ({
      ok: true,
      message: "Firebase Storage Admin access is available.",
    }))
    .catch((error: unknown) => ({
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Firebase Storage Admin access failed.",
    })),
    bucket
      .file("__readiness__/signing-probe.txt")
      .getSignedUrl({
        action: "read",
        expires: Date.now() + 60 * 1000,
      })
      .then(() => ({
        ok: true,
        message: "Firebase Storage URL signing is available.",
      }))
      .catch((error: unknown) => ({
        ok: false,
        message: error instanceof Error && /client[_ ]?email|cannot sign data/i.test(error.message)
          ? "Signed URLs are unavailable with local application-default credentials. Storyboard media continues to use Firebase download-token URLs."
          : error instanceof Error
            ? error.message
            : "Firebase Storage URL signing is unavailable.",
      })),
  ]);

  return {
    status: {
      ...status,
      canSignStorageUrls: storageSigning.ok,
      // URL signing is optional for Storyboard. Generated media is saved with
      // a Firebase download token, so an ADC credential without client_email
      // must not make the otherwise healthy Admin runtime look unavailable.
      message: status.message,
    },
    firestore,
    storage,
    storageSigning,
    storageDelivery: {
      ok: storage.ok,
      mode: "firebase_download_token",
      message: storage.ok
        ? "Storyboard media is delivered with Firebase download-token URLs and does not require service-account URL signing."
        : storage.message,
    },
  };
}

export { db };
export default admin;
