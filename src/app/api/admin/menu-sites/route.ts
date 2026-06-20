import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { requireAdminOrPermissionAuth } from '@/lib/server/admin-auth';
import { db as adminDb } from '@/lib/firebase-admin';
import { validateAllSites } from '@/schemas/menuSchema';
import type { SiteDataType } from '@/types/menu';

export const dynamic = 'force-dynamic';

const MenuSitesUpdateSchema = z.object({
  sites: z.unknown(),
});

const MENU_SETTINGS_COLLECTION = 'menuSettings';
const MENU_SETTINGS_DOC_ID = 'sites';
const MENU_SETTINGS_VERSION = 18;

export async function PUT(request: NextRequest) {
  const authResult = await requireAdminOrPermissionAuth(request, 'menuManagement');
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.message }, { status: authResult.status });
  }

  const payload = MenuSitesUpdateSchema.safeParse(await request.json().catch(() => ({})));
  if (!payload.success || !validateAllSites(payload.data.sites)) {
    return NextResponse.json({ error: '유효하지 않은 메뉴 데이터입니다.' }, { status: 400 });
  }

  await adminDb
    .collection(MENU_SETTINGS_COLLECTION)
    .doc(MENU_SETTINGS_DOC_ID)
    .set(
      {
        version: MENU_SETTINGS_VERSION,
        sites: payload.data.sites as SiteDataType,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: authResult.uid,
      },
      { merge: true },
    );

  return NextResponse.json({ ok: true });
}
