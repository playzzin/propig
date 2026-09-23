import { NextRequest, NextResponse } from 'next/server';
import admin, { db } from '@/lib/firebase-admin';
import { requireAdminAuth } from '@/lib/server/admin-auth';
import { createInvitationService, InvitationError, invitationErrorResponse } from '@/lib/server/onboarding-invitations';

export const runtime = 'nodejs';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
async function handle(request: NextRequest) {
    try {
        const actor = await requireAdminAuth(request);
        if (!actor.ok) return json({ error: actor.status === 403 ? '관리자 권한이 필요합니다.' : '인증을 확인할 수 없습니다.' }, actor.status);
        const service = createInvitationService({ db, auth: admin.auth() });
        if (request.method === 'GET') {
            const entries = [...request.nextUrl.searchParams.entries()];
            if (entries.length > 1) throw new InvitationError(400, '목록 조회 조건이 올바르지 않습니다.');
            return json(await service.list(actor, Object.fromEntries(entries)));
        }
        let body: unknown;
        try { body = await request.json(); } catch { throw new InvitationError(400, '요청 데이터가 올바르지 않습니다.'); }
        return json(request.method === 'POST' ? await service.create(actor, body) : await service.patch(actor, body));
    } catch (error) {
        const result = invitationErrorResponse(error);
        return json(result.body, result.status);
    }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
