import * as admin from 'firebase-admin';
import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { ApiError, db, requireAccess, requireUser, requireMethod } from './hostingCommon';
import { createInvitationService, InvitationError, invitationErrorResponse } from './onboardingInvitations';

function bodyOf(req: Request): unknown {
    const body: unknown = req.body;
    if (typeof body !== 'string' && !Buffer.isBuffer(body)) return body;
    try { return JSON.parse(body.toString()); } catch { throw new InvitationError(400, '요청 데이터가 올바르지 않습니다.'); }
}
function failure(res: Response, error: unknown): void {
    if (error instanceof ApiError) {
        res.status(error.status).json({ error: error.status === 403 ? '관리자 권한이 필요합니다.' : '요청 또는 인증을 확인할 수 없습니다.' });
        return;
    }
    const result = invitationErrorResponse(error);
    res.status(result.status).json(result.body);
}
export async function handleAdminInvitations(req: Request, res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    try {
        requireMethod(req, ['GET', 'POST', 'PATCH']);
        const actor = await requireAccess(req); // Full admin only, not userManagement delegates.
        const service = createInvitationService({ db, auth: admin.auth() });
        const result = req.method === 'GET' ? await service.list(actor, req.query)
            : req.method === 'POST' ? await service.create(actor, bodyOf(req)) : await service.patch(actor, bodyOf(req));
        res.status(200).json(result);
    } catch (error) { failure(res, error); }
}
export async function handleAcceptInvitation(req: Request, res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    try {
        requireMethod(req, 'POST');
        const actor = await requireUser(req);
        const service = createInvitationService({ db, auth: admin.auth() });
        res.status(200).json(await service.accept(actor, req.header('authorization'), bodyOf(req)));
    } catch (error) { failure(res, error); }
}
