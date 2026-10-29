"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvitationError = exports.InvitationQuerySchema = exports.AcceptInvitationSchema = exports.PatchInvitationSchema = exports.CreateInvitationSchema = exports.INVITATIONS_COLLECTION = void 0;
exports.invitationErrorResponse = invitationErrorResponse;
exports.createInvitationService = createInvitationService;
const node_crypto_1 = require("node:crypto");
const firestore_1 = require("firebase-admin/firestore");
const zod_1 = require("zod");
// Keep this core byte-identical in Next and Functions. No Auth/access mutations.
exports.INVITATIONS_COLLECTION = 'onboardingInvitations';
const DAY = 86400000;
const idSchema = zod_1.z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const emailSchema = zod_1.z.string().max(254).trim().toLowerCase().pipe(zod_1.z.email().max(254));
exports.CreateInvitationSchema = zod_1.z.object({
    email: emailSchema,
    intendedRole: zod_1.z.enum(['user', 'partner', 'guest']),
    expiresInDays: zod_1.z.number().int().min(1).max(30).default(7),
}).strict();
exports.PatchInvitationSchema = zod_1.z.object({ id: idSchema, action: zod_1.z.enum(['cancel', 'reissue']) }).strict();
exports.AcceptInvitationSchema = zod_1.z.object({ id: idSchema, token: zod_1.z.string().regex(/^[a-f0-9]{64}$/) }).strict();
exports.InvitationQuerySchema = zod_1.z.object({ cursor: idSchema.optional() }).strict();
const storedSchema = zod_1.z.object({
    email: emailSchema, intendedRole: zod_1.z.enum(['user', 'partner', 'guest']),
    status: zod_1.z.enum(['pending', 'accepted', 'cancelled']),
    createdAt: zod_1.z.number().int().nonnegative(), expiresAt: zod_1.z.number().int().nonnegative(),
    createdBy: zod_1.z.string().min(1).max(128), acceptedBy: zod_1.z.string().nullable(),
    acceptedAt: zod_1.z.number().int().nonnegative().nullable(),
    tokenHash: zod_1.z.string().regex(/^[a-f0-9]{64}$/), expiresInDays: zod_1.z.number().int().min(1).max(30),
});
class InvitationError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
exports.InvitationError = InvitationError;
const rejected = () => new InvitationError(400, '초대를 수락할 수 없습니다. 계정과 초대 링크를 확인해 주세요.');
function invitationErrorResponse(error) {
    return error instanceof InvitationError
        ? { status: error.status, body: { error: error.message } }
        : { status: 503, body: { error: '초대 저장소에 연결할 수 없습니다. 새로고침 후 확인해 주세요.' } };
}
function parse(schema, value) {
    const parsed = schema.safeParse(value);
    if (!parsed.success)
        throw new InvitationError(400, '요청 데이터가 올바르지 않습니다.');
    return parsed.data;
}
const hash = (value) => (0, node_crypto_1.createHash)('sha256').update(value).digest('hex');
function publicInvitation(id, value, now) {
    return {
        id, email: value.email, intendedRole: value.intendedRole,
        status: value.status === 'pending' && value.expiresAt <= now ? 'expired' : value.status,
        createdAt: new Date(value.createdAt).toISOString(), expiresAt: new Date(value.expiresAt).toISOString(),
        createdBy: value.createdBy, acceptedBy: value.acceptedBy,
        acceptedAt: value.acceptedAt === null ? null : new Date(value.acceptedAt).toISOString(),
    };
}
function createInvitationService({ db, auth, now = Date.now }) {
    const collection = db.collection(exports.INVITATIONS_COLLECTION);
    const requireAdmin = (actor) => {
        if (actor.isAdmin !== true || !actor.uid)
            throw new InvitationError(403, '관리자 권한이 필요합니다.');
    };
    // One fixed document per actor/operation, shared across entrypoints; failures consume quota too.
    async function rateLimit(uid, operation) {
        if (!uid || uid.length > 128)
            throw new InvitationError(401, '로그인이 필요합니다.');
        const ref = db.collection('serverRateLimits').doc(`onboarding_${operation}_${hash(uid)}`);
        await db.runTransaction(async (tx) => {
            const snapshot = await tx.get(ref);
            const time = now();
            const data = snapshot.data();
            const start = typeof (data === null || data === void 0 ? void 0 : data.windowStart) === 'number' ? data.windowStart : 0;
            const active = time >= start && time - start < 60000;
            const count = active && typeof (data === null || data === void 0 ? void 0 : data.count) === 'number' ? data.count : 0;
            if (count >= (operation === 'accept' ? 20 : 10))
                throw new InvitationError(429, '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
            tx.set(ref, { windowStart: active ? start : time, count: count + 1 });
        });
    }
    return {
        async list(actor, query) {
            requireAdmin(actor);
            const { cursor } = parse(exports.InvitationQuerySchema, query);
            let page = collection.orderBy(firestore_1.FieldPath.documentId()).limit(50);
            if (cursor)
                page = page.startAfter(cursor);
            const snapshot = await page.get();
            const time = now();
            return {
                invitations: snapshot.docs.map((doc) => publicInvitation(doc.id, storedSchema.parse(doc.data()), time)),
                nextCursor: snapshot.docs.length === 50 ? snapshot.docs[49].id : null,
            };
        },
        async create(actor, body) {
            requireAdmin(actor);
            const input = parse(exports.CreateInvitationSchema, body);
            await rateLimit(actor.uid, 'create');
            const token = (0, node_crypto_1.randomBytes)(32).toString('hex');
            const ref = collection.doc();
            const time = now();
            const value = Object.assign(Object.assign({}, input), { status: 'pending', createdAt: time, expiresAt: time + input.expiresInDays * DAY, createdBy: actor.uid, acceptedBy: null, acceptedAt: null, tokenHash: hash(token) });
            await ref.create(value);
            return { invitation: publicInvitation(ref.id, value, time), token };
        },
        async patch(actor, body) {
            requireAdmin(actor);
            const input = parse(exports.PatchInvitationSchema, body);
            if (input.action === 'reissue')
                await rateLimit(actor.uid, 'reissue');
            const ref = collection.doc(input.id);
            const before = await ref.get();
            if (!before.exists)
                throw new InvitationError(404, '초대를 찾을 수 없습니다.');
            const expected = storedSchema.parse(before.data());
            const token = input.action === 'reissue' ? (0, node_crypto_1.randomBytes)(32).toString('hex') : undefined;
            return db.runTransaction(async (tx) => {
                const snapshot = await tx.get(ref);
                if (!snapshot.exists)
                    throw new InvitationError(404, '초대를 찾을 수 없습니다.');
                const current = storedSchema.parse(snapshot.data());
                // Retry never overwrites a concurrent acceptance, cancellation or rotation.
                if (current.status !== 'pending' || current.tokenHash !== expected.tokenHash) {
                    throw new InvitationError(409, '초대 상태가 변경되었습니다. 새로고침 후 확인해 주세요.');
                }
                const time = now();
                const value = token
                    ? Object.assign(Object.assign({}, current), { tokenHash: hash(token), expiresAt: time + current.expiresInDays * DAY }) : Object.assign(Object.assign({}, current), { status: 'cancelled' });
                tx.set(ref, value);
                return Object.assign({ invitation: publicInvitation(ref.id, value, time) }, (token ? { token } : {}));
            });
        },
        async accept(actor, bearer, body) {
            await rateLimit(actor.uid, 'accept');
            const parsed = exports.AcceptInvitationSchema.safeParse(body);
            if (!parsed.success)
                throw rejected();
            const input = parsed.data;
            const match = /^Bearer ([^\s]+)$/i.exec(bearer !== null && bearer !== void 0 ? bearer : '');
            if (!match)
                throw rejected();
            let decoded;
            try {
                decoded = await auth.verifyIdToken(match[1], true);
            }
            catch (_a) {
                throw rejected();
            }
            if (decoded.uid !== actor.uid || decoded.email_verified !== true)
                throw rejected();
            const tokenEmail = emailSchema.safeParse(decoded.email);
            if (!tokenEmail.success)
                throw rejected();
            const ref = collection.doc(input.id);
            return db.runTransaction(async (tx) => {
                // Fresh Auth read on every retry, never trusting stale profile or claims email alone.
                const user = await auth.getUser(actor.uid).catch(() => null);
                const canonical = emailSchema.safeParse(user === null || user === void 0 ? void 0 : user.email);
                if (!user || user.uid !== actor.uid || user.disabled || !user.emailVerified ||
                    !canonical.success || canonical.data !== tokenEmail.data)
                    throw rejected();
                const snapshot = await tx.get(ref);
                if (!snapshot.exists)
                    throw rejected();
                const current = storedSchema.parse(snapshot.data());
                if (current.email !== canonical.data || !(0, node_crypto_1.timingSafeEqual)(Buffer.from(current.tokenHash, 'hex'), Buffer.from(hash(input.token), 'hex')))
                    throw rejected();
                if (current.status === 'accepted' && current.acceptedBy === actor.uid) {
                    return { ok: true, invitation: publicInvitation(ref.id, current, now()), accessReviewRequired: true };
                }
                const time = now();
                if (current.status !== 'pending' || current.expiresAt <= time)
                    throw rejected();
                const value = Object.assign(Object.assign({}, current), { status: 'accepted', acceptedBy: actor.uid, acceptedAt: time });
                tx.set(ref, value);
                return { ok: true, invitation: publicInvitation(ref.id, value, time), accessReviewRequired: true };
            });
        },
    };
}
//# sourceMappingURL=onboardingInvitations.js.map