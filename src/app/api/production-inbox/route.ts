import { NextRequest, NextResponse } from 'next/server';
import admin, { db } from '@/lib/firebase-admin';
import { requireUserAuth } from '@/lib/server/user-auth';
import { createProductionInboxService, ProductionInboxError, productionInboxErrorResponse } from '@/lib/server/production-inbox';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest) {
    try {
        const actor = await requireUserAuth(request);
        if (!actor.ok) {
            throw new ProductionInboxError(actor.status === 401 ? 401 : 503, 'Authentication unavailable');
        }
        // requireUserAuth verifies the token but does not load the current Auth record.
        // Do not permit deleted/disabled accounts even with a previously issued token.
        let user;
        try { user = await admin.auth().getUser(actor.uid); }
        catch (error) {
            const code = (error as { code?: unknown } | null)?.code;
            throw new ProductionInboxError(code === 'auth/user-not-found' || code === 'auth/user-disabled' ? 401 : 503, 'Account unavailable');
        }
        if (user.uid !== actor.uid || user.disabled) throw new ProductionInboxError(401, 'Account unavailable');
        const result = await createProductionInboxService({ db }).list({ uid: actor.uid }, request.nextUrl.searchParams);
        return NextResponse.json(result, { headers });
    } catch (error) {
        const result = productionInboxErrorResponse(error);
        return NextResponse.json(result.body, { status: result.status, headers });
    }
}

function methodNotAllowed() {
    return NextResponse.json({ error: 'GET 요청만 지원합니다.' }, { status: 405, headers: { ...headers, Allow: 'GET' } });
}
export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const HEAD = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
