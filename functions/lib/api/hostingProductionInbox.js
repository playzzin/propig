"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleProductionInbox = handleProductionInbox;
const admin = require("firebase-admin");
const hostingCommon_1 = require("./hostingCommon");
const productionInbox_1 = require("./productionInbox");
async function handleProductionInbox(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        res.status(405).json({ error: 'GET 요청만 지원합니다.' });
        return;
    }
    try {
        const actor = await (0, hostingCommon_1.requireUser)(req);
        // requireUser alone does not reject a disabled/deleted current Auth record.
        let user;
        try {
            user = await admin.auth().getUser(actor.uid);
        }
        catch (error) {
            const code = error === null || error === void 0 ? void 0 : error.code;
            throw new productionInbox_1.ProductionInboxError(code === 'auth/user-not-found' || code === 'auth/user-disabled' ? 401 : 503, 'Account unavailable');
        }
        if (user.uid !== actor.uid || user.disabled)
            throw new productionInbox_1.ProductionInboxError(401, 'Account unavailable');
        // Parsed Express arrays/objects (including duplicate source/cursor) fail the strict core schema.
        const result = await (0, productionInbox_1.createProductionInboxService)({ db: hostingCommon_1.db }).list({ uid: actor.uid }, req.query);
        res.status(200).json(result);
    }
    catch (error) {
        const result = (0, productionInbox_1.productionInboxErrorResponse)(error instanceof hostingCommon_1.ApiError
            ? new productionInbox_1.ProductionInboxError(error.status === 401 || error.status === 403 ? 401 : 503, 'Authentication unavailable') : error);
        res.status(result.status).json(result.body);
    }
}
//# sourceMappingURL=hostingProductionInbox.js.map