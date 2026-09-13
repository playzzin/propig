import * as admin from 'firebase-admin';
import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { ApiError, db, requireUser } from './hostingCommon';
import { createProductionInboxService, ProductionInboxError, productionInboxErrorResponse } from './productionInbox';

export async function handleProductionInbox(req: Request, res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        res.status(405).json({ error: 'GET 요청만 지원합니다.' });
        return;
    }
    try {
        const actor = await requireUser(req);
        // requireUser alone does not reject a disabled/deleted current Auth record.
        let user;
        try { user = await admin.auth().getUser(actor.uid); }
        catch (error) {
            const code = (error as { code?: unknown } | null)?.code;
            throw new ProductionInboxError(code === 'auth/user-not-found' || code === 'auth/user-disabled' ? 401 : 503, 'Account unavailable');
        }
        if (user.uid !== actor.uid || user.disabled) throw new ProductionInboxError(401, 'Account unavailable');
        // Parsed Express arrays/objects (including duplicate source/cursor) fail the strict core schema.
        const result = await createProductionInboxService({ db }).list({ uid: actor.uid }, req.query);
        res.status(200).json(result);
    } catch (error) {
        const result = productionInboxErrorResponse(error instanceof ApiError
            ? new ProductionInboxError(error.status === 401 || error.status === 403 ? 401 : 503, 'Authentication unavailable') : error);
        res.status(result.status).json(result.body);
    }
}
