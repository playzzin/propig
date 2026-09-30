import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { requireAdminOrPermissionAuth } from '@/lib/server/admin-auth';
import { db as adminDb } from '@/lib/firebase-admin';
import { writeActivityLogSafely } from '@/lib/server/activity-log';
import { validateAllSites } from '@/schemas/menuSchema';
import type { MenuItem, SiteDataType } from '@/types/menu';
import { MENU_SETTINGS_VERSION } from '@/constants/menuSettingsContract';

export const dynamic = 'force-dynamic';

const MenuSitesUpdateSchema = z.object({
  sites: z.unknown(),
});

const MENU_SETTINGS_COLLECTION = 'menuSettings';
const MENU_SETTINGS_DOC_ID = 'sites';
const countMenuItems = (items: MenuItem[] = []): number =>
  items.reduce((total, item) => {
    const childCount = (item.sub || []).reduce((childTotal, subItem) => {
      if (typeof subItem === 'string') return childTotal;
      return childTotal + countMenuItems([subItem]);
    }, 0);

    return total + 1 + childCount;
  }, 0);

const summarizeSites = (sites: SiteDataType) => ({
  siteCount: Object.keys(sites).length,
  siteIds: Object.keys(sites),
  menuItemCount: Object.values(sites).reduce((total, site) => total + countMenuItems(site.menu || []), 0),
});

export async function PUT(request: NextRequest) {
  const authResult = await requireAdminOrPermissionAuth(request, 'menuManagement');
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.message }, { status: authResult.status });
  }

  const payload = MenuSitesUpdateSchema.safeParse(await request.json().catch(() => ({})));
  if (!payload.success || !validateAllSites(payload.data.sites)) {
    return NextResponse.json({ error: '유효하지 않은 메뉴 데이터입니다.' }, { status: 400 });
  }

  const nextSites = payload.data.sites as SiteDataType;
  const currentSnapshot = await adminDb.collection(MENU_SETTINGS_COLLECTION).doc(MENU_SETTINGS_DOC_ID).get();
  const currentSites = currentSnapshot.exists ? (currentSnapshot.data()?.sites as SiteDataType | undefined) : undefined;

  await adminDb
    .collection(MENU_SETTINGS_COLLECTION)
    .doc(MENU_SETTINGS_DOC_ID)
    .set(
      {
        version: MENU_SETTINGS_VERSION,
        sites: nextSites,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: authResult.uid,
      },
      { mergeFields: ['version', 'sites', 'updatedAt', 'updatedBy'] },
    );

  await writeActivityLogSafely({
    auth: authResult,
    request,
    action: 'admin.menu.update',
    target: {
      type: MENU_SETTINGS_COLLECTION,
      id: MENU_SETTINGS_DOC_ID,
      label: '통합 메뉴',
    },
    summary: '관리자 API를 통해 통합 메뉴를 저장했습니다.',
    metadata: {
      before: currentSites ? summarizeSites(currentSites) : null,
      after: summarizeSites(nextSites),
    },
  });

  return NextResponse.json({ ok: true });
}
