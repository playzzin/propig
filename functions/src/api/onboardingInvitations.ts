import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import { z } from 'zod';

// Keep this core byte-identical in Next and Functions. No Auth/access mutations.
export const INVITATIONS_COLLECTION = 'onboardingInvitations';
const DAY = 86_400_000;
const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const emailSchema = z.string().max(254).trim().toLowerCase().pipe(z.email().max(254));
export const CreateInvitationSchema = z.object({
    email: emailSchema,
    intendedRole: z.enum(['user', 'partner', 'guest']),
    expiresInDays: z.number().int().min(1).max(30).default(7),
}).strict();
export const PatchInvitationSchema = z.object({ id: idSchema, action: z.enum(['cancel', 'reissue']) }).strict();
export const AcceptInvitationSchema = z.object({ id: idSchema, token: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const InvitationQuerySchema = z.object({ cursor: idSchema.optional() }).strict();
const storedSchema = z.object({
    email: emailSchema, intendedRole: z.enum(['user', 'partner', 'guest']),
    status: z.enum(['pending', 'accepted', 'cancelled']),
    createdAt: z.number().int().nonnegative(), expiresAt: z.number().int().nonnegative(),
    createdBy: z.string().min(1).max(128), acceptedBy: z.string().nullable(),
    acceptedAt: z.number().int().nonnegative().nullable(),
    tokenHash: z.string().regex(/^[a-f0-9]{64}$/), expiresInDays: z.number().int().min(1).max(30),
});
type StoredInvitation = z.infer<typeof storedSchema>;
export type InvitationDependencies = {
    db: Pick<Firestore, 'collection' | 'runTransaction'>;
    auth: Pick<Auth, 'verifyIdToken' | 'getUser'>;
    now?: () => number;
};
export type InvitationActor = { uid: string; isAdmin?: boolean };
export class InvitationError extends Error {
    constructor(public readonly status: number, message: string) { super(message); }
}
const rejected = () => new InvitationError(400, '초대를 수락할 수 없습니다. 계정과 초대 링크를 확인해 주세요.');
export function invitationErrorResponse(error: unknown) {
    return error instanceof InvitationError
        ? { status: error.status, body: { error: error.message } }
        : { status: 503, body: { error: '초대 저장소에 연결할 수 없습니다. 새로고침 후 확인해 주세요.' } };
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new InvitationError(400, '요청 데이터가 올바르지 않습니다.');
    return parsed.data;
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function publicInvitation(id: string, value: StoredInvitation, now: number) {
    return {
        id, email: value.email, intendedRole: value.intendedRole,
        status: value.status === 'pending' && value.expiresAt <= now ? 'expired' as const : value.status,
        createdAt: new Date(value.createdAt).toISOString(), expiresAt: new Date(value.expiresAt).toISOString(),
        createdBy: value.createdBy, acceptedBy: value.acceptedBy,
        acceptedAt: value.acceptedAt === null ? null : new Date(value.acceptedAt).toISOString(),
    };
}
export type OnboardingInvitation = ReturnType<typeof publicInvitation>;
export function createInvitationService({ db, auth, now = Date.now }: InvitationDependencies) {
    const collection = db.collection(INVITATIONS_COLLECTION);
    const requireAdmin = (actor: InvitationActor) => {
        if (actor.isAdmin !== true || !actor.uid) throw new InvitationError(403, '관리자 권한이 필요합니다.');
    };
    // One fixed document per actor/operation, shared across entrypoints; failures consume quota too.
    async function rateLimit(uid: string, operation: 'create' | 'reissue' | 'accept') {
        if (!uid || uid.length > 128) throw new InvitationError(401, '로그인이 필요합니다.');
        const ref = db.collection('serverRateLimits').doc(`onboarding_${operation}_${hash(uid)}`);
        await db.runTransaction(async (tx) => {
            const snapshot = await tx.get(ref);
            const time = now();
            const data = snapshot.data();
            const start = typeof data?.windowStart === 'number' ? data.windowStart : 0;
            const active = time >= start && time - start < 60_000;
            const count = active && typeof data?.count === 'number' ? data.count : 0;
            if (count >= (operation === 'accept' ? 20 : 10)) throw new InvitationError(429, '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
            tx.set(ref, { windowStart: active ? start : time, count: count + 1 });
        });
    }
    return {
        async list(actor: InvitationActor, query: unknown) {
            requireAdmin(actor);
            const { cursor } = parse(InvitationQuerySchema, query);
            let page = collection.orderBy(FieldPath.documentId()).limit(50);
            if (cursor) page = page.startAfter(cursor);
            const snapshot = await page.get();
            const time = now();
            return {
                invitations: snapshot.docs.map((doc) => publicInvitation(doc.id, storedSchema.parse(doc.data()), time)),
                nextCursor: snapshot.docs.length === 50 ? snapshot.docs[49].id : null,
            };
        },
        async create(actor: InvitationActor, body: unknown) {
            requireAdmin(actor);
            const input = parse(CreateInvitationSchema, body);
            await rateLimit(actor.uid, 'create');
            const token = randomBytes(32).toString('hex');
            const ref = collection.doc();
            const time = now();
            const value: StoredInvitation = { ...input, status: 'pending', createdAt: time,
                expiresAt: time + input.expiresInDays * DAY, createdBy: actor.uid,
                acceptedBy: null, acceptedAt: null, tokenHash: hash(token) };
            await ref.create(value);
            return { invitation: publicInvitation(ref.id, value, time), token };
        },
        async patch(actor: InvitationActor, body: unknown) {
            requireAdmin(actor);
            const input = parse(PatchInvitationSchema, body);
            if (input.action === 'reissue') await rateLimit(actor.uid, 'reissue');
            const ref = collection.doc(input.id);
            const before = await ref.get();
            if (!before.exists) throw new InvitationError(404, '초대를 찾을 수 없습니다.');
            const expected = storedSchema.parse(before.data());
            const token = input.action === 'reissue' ? randomBytes(32).toString('hex') : undefined;
            return db.runTransaction(async (tx) => {
                const snapshot = await tx.get(ref);
                if (!snapshot.exists) throw new InvitationError(404, '초대를 찾을 수 없습니다.');
                const current = storedSchema.parse(snapshot.data());
                // Retry never overwrites a concurrent acceptance, cancellation or rotation.
                if (current.status !== 'pending' || current.tokenHash !== expected.tokenHash) {
                    throw new InvitationError(409, '초대 상태가 변경되었습니다. 새로고침 후 확인해 주세요.');
                }
                const time = now();
                const value: StoredInvitation = token
                    ? { ...current, tokenHash: hash(token), expiresAt: time + current.expiresInDays * DAY }
                    : { ...current, status: 'cancelled' };
                tx.set(ref, value);
                return { invitation: publicInvitation(ref.id, value, time), ...(token ? { token } : {}) };
            });
        },
        async accept(actor: InvitationActor, bearer: string | null | undefined, body: unknown) {
            await rateLimit(actor.uid, 'accept');
            const parsed = AcceptInvitationSchema.safeParse(body);
            if (!parsed.success) throw rejected();
            const input = parsed.data;
            const match = /^Bearer ([^\s]+)$/i.exec(bearer ?? '');
            if (!match) throw rejected();
            let decoded;
            try { decoded = await auth.verifyIdToken(match[1], true); } catch { throw rejected(); }
            if (decoded.uid !== actor.uid || decoded.email_verified !== true) throw rejected();
            const tokenEmail = emailSchema.safeParse(decoded.email);
            if (!tokenEmail.success) throw rejected();
            const ref = collection.doc(input.id);
            return db.runTransaction(async (tx) => {
                // Fresh Auth read on every retry, never trusting stale profile or claims email alone.
                const user = await auth.getUser(actor.uid).catch(() => null);
                const canonical = emailSchema.safeParse(user?.email);
                if (!user || user.uid !== actor.uid || user.disabled || !user.emailVerified ||
                    !canonical.success || canonical.data !== tokenEmail.data) throw rejected();
                const snapshot = await tx.get(ref);
                if (!snapshot.exists) throw rejected();
                const current = storedSchema.parse(snapshot.data());
                if (current.email !== canonical.data || !timingSafeEqual(Buffer.from(current.tokenHash, 'hex'), Buffer.from(hash(input.token), 'hex'))) throw rejected();
                if (current.status === 'accepted' && current.acceptedBy === actor.uid) {
                    return { ok: true as const, invitation: publicInvitation(ref.id, current, now()), accessReviewRequired: true as const };
                }
                const time = now();
                if (current.status !== 'pending' || current.expiresAt <= time) throw rejected();
                const value: StoredInvitation = { ...current, status: 'accepted', acceptedBy: actor.uid, acceptedAt: time };
                tx.set(ref, value);
                return { ok: true as const, invitation: publicInvitation(ref.id, value, time), accessReviewRequired: true as const };
            });
        },
    };
}
