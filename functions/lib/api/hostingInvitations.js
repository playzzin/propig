"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAdminInvitations = handleAdminInvitations;
exports.handleAcceptInvitation = handleAcceptInvitation;
const admin = require("firebase-admin");
const hostingCommon_1 = require("./hostingCommon");
const onboardingInvitations_1 = require("./onboardingInvitations");
function bodyOf(req) {
    const body = req.body;
    if (typeof body !== 'string' && !Buffer.isBuffer(body))
        return body;
    try {
        return JSON.parse(body.toString());
    }
    catch (_a) {
        throw new onboardingInvitations_1.InvitationError(400, '요청 데이터가 올바르지 않습니다.');
    }
}
function failure(res, error) {
    if (error instanceof hostingCommon_1.ApiError) {
        res.status(error.status).json({ error: error.status === 403 ? '관리자 권한이 필요합니다.' : '요청 또는 인증을 확인할 수 없습니다.' });
        return;
    }
    const result = (0, onboardingInvitations_1.invitationErrorResponse)(error);
    res.status(result.status).json(result.body);
}
async function handleAdminInvitations(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    try {
        (0, hostingCommon_1.requireMethod)(req, ['GET', 'POST', 'PATCH']);
        const actor = await (0, hostingCommon_1.requireAccess)(req); // Full admin only, not userManagement delegates.
        const service = (0, onboardingInvitations_1.createInvitationService)({ db: hostingCommon_1.db, auth: admin.auth() });
        const result = req.method === 'GET' ? await service.list(actor, req.query)
            : req.method === 'POST' ? await service.create(actor, bodyOf(req)) : await service.patch(actor, bodyOf(req));
        res.status(200).json(result);
    }
    catch (error) {
        failure(res, error);
    }
}
async function handleAcceptInvitation(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    try {
        (0, hostingCommon_1.requireMethod)(req, 'POST');
        const actor = await (0, hostingCommon_1.requireUser)(req);
        const service = (0, onboardingInvitations_1.createInvitationService)({ db: hostingCommon_1.db, auth: admin.auth() });
        res.status(200).json(await service.accept(actor, req.header('authorization'), bodyOf(req)));
    }
    catch (error) {
        failure(res, error);
    }
}
//# sourceMappingURL=hostingInvitations.js.map