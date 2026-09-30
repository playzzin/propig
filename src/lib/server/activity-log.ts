import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";
import { db as adminDb } from "@/lib/firebase-admin";
import type { ActivityLogActor, ActivityLogRecord, ActivityLogTarget } from "@/types/activityLog";

type ActivityLogAuth = {
  uid: string;
  email?: string;
  role?: string;
  isAdmin?: boolean;
};

type WriteActivityLogInput = {
  auth: ActivityLogAuth;
  request?: NextRequest;
  action: string;
  target: ActivityLogTarget;
  summary?: string;
  metadata?: Record<string, unknown>;
  route?: string | null;
};

const ACTIVITY_LOGS_COLLECTION = "activityLogs";
const MAX_STRING_LENGTH = 700;
const MAX_ARRAY_LENGTH = 40;
const MAX_OBJECT_KEYS = 60;
const MAX_DEPTH = 4;

const truncateString = (value: string): string =>
  value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...` : value;

const sanitizeValue = (value: unknown, depth = 0): unknown => {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === "string") return truncateString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (depth >= MAX_DEPTH) return "[truncated]";

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LENGTH).map((item) => sanitizeValue(item, depth + 1));
  }

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .slice(0, MAX_OBJECT_KEYS)
      .reduce<Record<string, unknown>>((acc, [key, entry]) => {
        if (!key.trim()) return acc;
        acc[truncateString(key)] = sanitizeValue(entry, depth + 1);
        return acc;
      }, {});
  }

  return String(value);
};

const readRouteFromRequest = (request?: NextRequest): string | null => {
  if (!request) return null;

  const referer = request.headers.get("referer");
  if (!referer) return request.nextUrl.pathname;

  try {
    const url = new URL(referer);
    return `${url.pathname}${url.search}`;
  } catch {
    return request.nextUrl.pathname;
  }
};

const sanitizeTarget = (target: ActivityLogTarget): ActivityLogTarget => ({
  type: truncateString(target.type.trim()),
  id: target.id ? truncateString(target.id) : null,
  path: target.path ? truncateString(target.path) : null,
  label: target.label ? truncateString(target.label) : null,
});

export async function writeActivityLog({
  auth,
  request,
  action,
  target,
  summary,
  metadata,
  route,
}: WriteActivityLogInput): Promise<string> {
  const actor: ActivityLogActor = {
    uid: auth.uid,
    email: auth.email ?? null,
    role: auth.role ?? null,
    isAdmin: auth.isAdmin === true,
  };

  const docRef = await adminDb.collection(ACTIVITY_LOGS_COLLECTION).add({
    action: truncateString(action.trim()),
    actor,
    target: sanitizeTarget(target),
    summary: summary ? truncateString(summary) : null,
    metadata: sanitizeValue(metadata ?? {}),
    route: route ? truncateString(route) : readRouteFromRequest(request),
    userAgent: request?.headers.get("user-agent") ? truncateString(request.headers.get("user-agent") || "") : null,
    createdAt: FieldValue.serverTimestamp(),
  });

  return docRef.id;
}

export async function writeActivityLogSafely(input: WriteActivityLogInput): Promise<void> {
  try {
    await writeActivityLog(input);
  } catch (error) {
    console.warn("[ActivityLog] Failed to write activity log:", error);
  }
}

export function mapActivityLogSnapshot(snapshot: FirebaseFirestore.DocumentSnapshot): ActivityLogRecord {
  const data = snapshot.data() ?? {};
  const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : null;

  return {
    id: snapshot.id,
    action: typeof data.action === "string" ? data.action : "unknown",
    actor: {
      uid: typeof data.actor?.uid === "string" ? data.actor.uid : "unknown",
      email: typeof data.actor?.email === "string" ? data.actor.email : null,
      role: typeof data.actor?.role === "string" ? data.actor.role : null,
      isAdmin: data.actor?.isAdmin === true,
    },
    target: {
      type: typeof data.target?.type === "string" ? data.target.type : "unknown",
      id: typeof data.target?.id === "string" ? data.target.id : null,
      path: typeof data.target?.path === "string" ? data.target.path : null,
      label: typeof data.target?.label === "string" ? data.target.label : null,
    },
    summary: typeof data.summary === "string" ? data.summary : null,
    metadata:
      data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
        ? (data.metadata as Record<string, unknown>)
        : {},
    route: typeof data.route === "string" ? data.route : null,
    userAgent: typeof data.userAgent === "string" ? data.userAgent : null,
    createdAt,
  };
}
