import { NextRequest, NextResponse } from 'next/server';
import admin, { db } from '@/lib/firebase-admin';
import { requireAdminAuth } from '@/lib/server/admin-auth';
import { createImageBudgetService, ImageBudgetError, imageBudgetErrorResponse } from '@/lib/server/image-budget-operations';

export const runtime = 'nodejs';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
async function handle(request: NextRequest) {
    try {
        const actor = await requireAdminAuth(request);
        if (!actor.ok) return json({ error: actor.status === 403 ? '관리자 권한이 필요합니다.' : '인증을 확인할 수 없습니다.' }, actor.status);
        const service = createImageBudgetService({ db, auth: admin.auth() });
        if (request.method === 'GET') {
            const entries = [...request.nextUrl.searchParams.entries()];
            if (new Set(entries.map(([key]) => key)).size !== entries.length) throw new ImageBudgetError(400, '조회 조건이 올바르지 않습니다.');
            return json(await service.get(actor, Object.fromEntries(entries)));
        }
        let body: unknown;
        try { body = await request.json(); } catch { throw new ImageBudgetError(400, '요청 데이터가 올바르지 않습니다.'); }
        return json(request.method === 'PATCH' ? await service.patch(actor, body) : await service.reconcile(actor, body));
    } catch (error) {
        const result = imageBudgetErrorResponse(error);
        return json(result.body, result.status);
    }
}
export const GET = handle;
export const PATCH = handle;
export const POST = handle;
