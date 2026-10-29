import * as admin from 'firebase-admin';
import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { ApiError, db, requireAccess, requireMethod } from './hostingCommon';
import { createImageBudgetService, ImageBudgetError, imageBudgetErrorResponse } from './imageBudgetOperations';

function bodyOf(req: Request): unknown {
    const body: unknown = req.body;
    if (typeof body !== 'string' && !Buffer.isBuffer(body)) return body;
    try { return JSON.parse(body.toString()); } catch { throw new ImageBudgetError(400, '요청 데이터가 올바르지 않습니다.'); }
}
export async function handleImageBudgets(req: Request, res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    try {
        requireMethod(req, ['GET', 'PATCH', 'POST']);
        const actor = await requireAccess(req); // Full admin, not userManagement delegates.
        const service = createImageBudgetService({ db, auth: admin.auth() });
        const result = req.method === 'GET' ? await service.get(actor, req.query)
            : req.method === 'PATCH' ? await service.patch(actor, bodyOf(req)) : await service.reconcile(actor, bodyOf(req));
        res.status(200).json(result);
    } catch (error) {
        if (error instanceof ApiError) {
            res.status(error.status).json({ error: error.status === 403 ? '관리자 권한이 필요합니다.' : '요청 또는 인증을 확인할 수 없습니다.' });
            return;
        }
        const result = imageBudgetErrorResponse(error);
        res.status(result.status).json(result.body);
    }
}
