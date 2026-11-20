import { NextRequest, NextResponse } from 'next/server';
import admin, { db } from '@/lib/firebase-admin';
import { requireUserAuth } from '@/lib/server/user-auth';
import { createInvitationService, InvitationError, invitationErrorResponse } from '@/lib/server/onboarding-invitations';

export const runtime = 'nodejs';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function POST(request: NextRequest) {
    try {
        const actor = await requireUserAuth(request);
        if (!actor.ok) return json({ error: '인증을 확인할 수 없습니다.' }, actor.status);
        let body: unknown;
        try { body = await request.json(); } catch { throw new InvitationError(400, '요청 데이터가 올바르지 않습니다.'); }
        const service = createInvitationService({ db, auth: admin.auth() });
        return json(await service.accept(actor, request.headers.get('authorization'), body));
    } catch (error) {
        const result = invitationErrorResponse(error);
        return json(result.body, result.status);
    }
}
