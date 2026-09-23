import { NextResponse, type NextRequest } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { db as adminDb } from '@/lib/firebase-admin';
import { requireUserAuth } from '@/lib/server/user-auth';

export const dynamic = 'force-dynamic';

const MAX_PINNED_MODULES = 6;
const USER_COLLECTION = 'users';
const PREFERENCES_COLLECTION = 'preferences';
const ERP_HOME_PREFERENCES_DOC = 'erpHome';

const ModuleHrefSchema = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .regex(/^\/[A-Za-z0-9/_?=&.#~-]*$/);

const UpdatePreferencesSchema = z.object({
  pinnedModuleHrefs: z.array(ModuleHrefSchema).max(MAX_PINNED_MODULES).default([]),
});

type ErpHomePreferencesDoc = {
  pinnedModuleHrefs?: unknown;
  updatedAt?: unknown;
};

function normalizePinnedModuleHrefs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const hrefs: string[] = [];

  for (const item of value) {
    const result = ModuleHrefSchema.safeParse(item);
    if (!result.success || seen.has(result.data)) continue;
    seen.add(result.data);
    hrefs.push(result.data);
    if (hrefs.length >= MAX_PINNED_MODULES) break;
  }

  return hrefs;
}

function formatTimestamp(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === 'string') return value;
  return null;
}

function getPreferencesDoc(uid: string) {
  return adminDb.collection(USER_COLLECTION).doc(uid).collection(PREFERENCES_COLLECTION).doc(ERP_HOME_PREFERENCES_DOC);
}

export async function GET(request: NextRequest) {
  const authResult = await requireUserAuth(request);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.message }, { status: authResult.status });
  }

  const snapshot = await getPreferencesDoc(authResult.uid).get();
  const data = snapshot.exists ? (snapshot.data() as ErpHomePreferencesDoc) : null;

  return NextResponse.json({
    pinnedModuleHrefs: normalizePinnedModuleHrefs(data?.pinnedModuleHrefs),
    updatedAt: formatTimestamp(data?.updatedAt),
  });
}

export async function PUT(request: NextRequest) {
  const authResult = await requireUserAuth(request);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.message }, { status: authResult.status });
  }

  const payload = await request.json().catch(() => null);
  const parsed = UpdatePreferencesSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid ERP home preferences payload.' }, { status: 400 });
  }

  const pinnedModuleHrefs = normalizePinnedModuleHrefs(parsed.data.pinnedModuleHrefs);

  await getPreferencesDoc(authResult.uid).set(
    {
      pinnedModuleHrefs,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: {
        uid: authResult.uid,
        email: authResult.email ?? null,
      },
    },
    { merge: true },
  );

  return NextResponse.json({
    pinnedModuleHrefs,
    updatedAt: new Date().toISOString(),
  });
}
