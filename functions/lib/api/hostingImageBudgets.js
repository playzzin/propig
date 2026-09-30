"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleImageBudgets = handleImageBudgets;
const admin = require("firebase-admin");
const hostingCommon_1 = require("./hostingCommon");
const imageBudgetOperations_1 = require("./imageBudgetOperations");
function bodyOf(req) {
    const body = req.body;
    if (typeof body !== 'string' && !Buffer.isBuffer(body))
        return body;
    try {
        return JSON.parse(body.toString());
    }
    catch (_a) {
        throw new imageBudgetOperations_1.ImageBudgetError(400, '요청 데이터가 올바르지 않습니다.');
    }
}
async function handleImageBudgets(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    try {
        (0, hostingCommon_1.requireMethod)(req, ['GET', 'PATCH', 'POST']);
        const actor = await (0, hostingCommon_1.requireAccess)(req); // Full admin, not userManagement delegates.
        const service = (0, imageBudgetOperations_1.createImageBudgetService)({ db: hostingCommon_1.db, auth: admin.auth() });
        const result = req.method === 'GET' ? await service.get(actor, req.query)
            : req.method === 'PATCH' ? await service.patch(actor, bodyOf(req)) : await service.reconcile(actor, bodyOf(req));
        res.status(200).json(result);
    }
    catch (error) {
        if (error instanceof hostingCommon_1.ApiError) {
            res.status(error.status).json({ error: error.status === 403 ? '관리자 권한이 필요합니다.' : '요청 또는 인증을 확인할 수 없습니다.' });
            return;
        }
        const result = (0, imageBudgetOperations_1.imageBudgetErrorResponse)(error);
        res.status(result.status).json(result.body);
    }
}
//# sourceMappingURL=hostingImageBudgets.js.map