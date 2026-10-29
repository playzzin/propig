"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.imageDailyBudgetKey = exports.imageBudgetPolicyKey = exports.ImageBudgetError = exports.ReconcileImageBudgetSchema = exports.PatchImageBudgetSchema = exports.ImageBudgetQuerySchema = exports.IMAGE_BUDGET_POLICIES = void 0;
exports.imageBudgetErrorResponse = imageBudgetErrorResponse;
exports.defaultImageBudgetLimit = defaultImageBudgetLimit;
exports.readImageBudgetLimit = readImageBudgetLimit;
exports.createImageBudgetService = createImageBudgetService;
const node_crypto_1 = require("node:crypto");
const zod_1 = require("zod");
// Keep this core byte-identical in Next and Functions. Image ledger only; no provider IO.
exports.IMAGE_BUDGET_POLICIES = 'aiBudgetPolicies';
const hash = (value) => (0, node_crypto_1.createHash)('sha256').update(value).digest('hex');
const uidSchema = zod_1.z.string().min(1).max(128).refine((uid) => uid.trim() === uid && !/[\u0000-\u001f\u007f]/.test(uid));
const revisionSchema = zod_1.z.string().regex(/^[a-f0-9]{64}$/);
const moneySchema = zod_1.z.number().finite().min(0).max(1000);
const daySchema = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((day) => {
    const time = Date.parse(`${day}T00:00:00.000Z`);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === day;
});
exports.ImageBudgetQuerySchema = zod_1.z.object({ uid: uidSchema, day: daySchema.optional() }).strict();
exports.PatchImageBudgetSchema = zod_1.z.object({ uid: uidSchema, expectedRevision64: revisionSchema, dailyLimitUsd: moneySchema.nullable() }).strict();
exports.ReconcileImageBudgetSchema = zod_1.z.object({
    uid: uidSchema,
    // This is the opaque reservation document ID returned as uncertain[].id, not a new generation UUID.
    operationId: revisionSchema,
    decision: zod_1.z.enum(['charged', 'not_charged']),
    actualCostUsd: moneySchema.optional(),
    note: zod_1.z.string().trim().min(10).max(1000),
}).strict().refine((body) => body.decision === 'charged' ? body.actualCostUsd !== undefined : body.actualCostUsd === undefined || body.actualCostUsd === 0);
class ImageBudgetError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
exports.ImageBudgetError = ImageBudgetError;
function imageBudgetErrorResponse(error) {
    return error instanceof ImageBudgetError
        ? { status: error.status, body: { error: error.message } }
        : { status: 503, body: { error: '이미지 예산 저장소를 확인할 수 없습니다. 새로고침 후 확인해 주세요.' } };
}
function conflict() { throw new ImageBudgetError(409, '이미지 비용 기록이 변경되었거나 확인이 필요합니다. 새로고침 후 확인해 주세요.'); }
function parse(schema, input) {
    const result = schema.safeParse(input);
    if (!result.success)
        throw new ImageBudgetError(400, '요청 데이터가 올바르지 않습니다.');
    return result.data;
}
function defaultImageBudgetLimit() {
    // Exactly the pre-policy generator environment fallback, including its original minimum.
    return Math.min(1000, Math.max(0.5, Number(process.env.OPENROUTER_IMAGE_DAILY_BUDGET_USD) || 10));
}
const imageBudgetPolicyKey = (uid) => hash(uid);
exports.imageBudgetPolicyKey = imageBudgetPolicyKey;
const imageDailyBudgetKey = (uid, day) => hash(`${uid}:image-generation-budget:${day}`);
exports.imageDailyBudgetKey = imageDailyBudgetKey;
function policyOf(snapshot, uid) {
    if (!snapshot.exists)
        return { dailyLimitUsd: null, revision: hash(`image-budget-policy:absent:${uid}`) };
    const data = snapshot.data();
    if (!data || data.uid !== uid || !moneySchema.nullable().safeParse(data.dailyLimitUsd).success
        || !revisionSchema.safeParse(data.revision).success || !uidSchema.safeParse(data.updatedBy).success
        || !dateValue(data.updatedAt))
        conflict();
    return { dailyLimitUsd: data.dailyLimitUsd, revision: data.revision };
}
/** Must be called inside the SAME actual reservation transaction, before any writes.
 * Reading this document makes concurrent admin policy updates participate in Firestore retries.
 */
async function readImageBudgetLimit(transaction, db, uid, fallback) {
    if (!moneySchema.safeParse(fallback).success || !uidSchema.safeParse(uid).success)
        conflict();
    const policy = policyOf(await transaction.get(db.collection(exports.IMAGE_BUDGET_POLICIES).doc((0, exports.imageBudgetPolicyKey)(uid))), uid);
    return policy.dailyLimitUsd === null ? fallback : policy.dailyLimitUsd;
}
function nonnegative(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
function dateValue(value) {
    let date = null;
    if (value instanceof Date)
        date = value;
    else if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function')
        date = value.toDate();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function budgetOf(snapshot, uid, day, required = false) {
    if (!snapshot.exists) {
        if (required)
            conflict();
        return { spentUsd: 0, reservedUsd: 0 };
    }
    const data = snapshot.data();
    if (!data || data.uid !== uid || data.date !== day || !nonnegative(data.spentUsd) || !nonnegative(data.reservedUsd))
        conflict();
    return { spentUsd: data.spentUsd, reservedUsd: data.reservedUsd };
}
const text = (value, max = 200) => typeof value === 'string' && value.length > 0 && value.length <= max ? value : null;
function createImageBudgetService({ db, auth, now = Date.now, defaultLimitUsd = defaultImageBudgetLimit() }) {
    function requireAdmin(actor) {
        if (actor.isAdmin !== true || !uidSchema.safeParse(actor.uid).success)
            throw new ImageBudgetError(403, '관리자 권한이 필요합니다.');
    }
    async function rateLimit(actor) {
        const ref = db.collection('serverRateLimits').doc(`image_budget_admin_${hash(actor.uid)}`);
        await db.runTransaction(async (tx) => {
            const data = (await tx.get(ref)).data();
            const time = now();
            const active = data && typeof data.windowStart === 'number' && time >= data.windowStart && time - data.windowStart < 60000;
            const count = active && Number.isSafeInteger(data.count) && data.count >= 0 ? data.count : 0;
            if (count >= 30)
                throw new ImageBudgetError(429, '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
            tx.set(ref, { windowStart: active ? data.windowStart : time, count: count + 1 });
        });
    }
    return {
        async get(actor, query) {
            var _a, _b;
            requireAdmin(actor);
            const input = parse(exports.ImageBudgetQuerySchema, query);
            const { uid } = input;
            const day = (_a = input.day) !== null && _a !== void 0 ? _a : new Date(now()).toISOString().slice(0, 10);
            const [state, operations] = await Promise.all([
                db.runTransaction(async (tx) => {
                    const policy = policyOf(await tx.get(db.collection(exports.IMAGE_BUDGET_POLICIES).doc((0, exports.imageBudgetPolicyKey)(uid))), uid);
                    const snapshot = await tx.get(db.collection('aiDailyBudgets').doc((0, exports.imageDailyBudgetKey)(uid, day)));
                    return { policy, budget: budgetOf(snapshot, uid, day), exists: snapshot.exists };
                }),
                db.collection('aiOperationReservations').where('uid', '==', uid).where('operation', '==', 'image-generation').where('status', '==', 'uncertain')
                    .select('uid', 'operation', 'status', 'model', 'estimatedCostUsd', 'reservedUsd', 'budgetDate', 'createdAt', 'updatedAt', 'stage', 'requestId', 'provider').limit(101).get(),
            ]);
            const uncertain = operations.docs.slice(0, 100).map((doc) => {
                const data = doc.data();
                if (data.uid !== uid || data.operation !== 'image-generation' || data.status !== 'uncertain')
                    conflict();
                return { id: doc.id, operation: 'image', model: text(data.model),
                    estimatedCostUsd: nonnegative(data.estimatedCostUsd) ? data.estimatedCostUsd : null,
                    reservedCostUsd: nonnegative(data.reservedUsd) ? data.reservedUsd : null,
                    day: daySchema.safeParse(data.budgetDate).success ? data.budgetDate : null,
                    reservedAt: dateValue(data.createdAt), updatedAt: dateValue(data.updatedAt),
                    jobId: null, projectId: null, stage: text(data.stage), requestId: text(data.requestId), provider: text(data.provider) };
            });
            if (!moneySchema.safeParse(defaultLimitUsd).success)
                conflict();
            const limitUsd = (_b = state.policy.dailyLimitUsd) !== null && _b !== void 0 ? _b : defaultLimitUsd;
            const total = state.budget.spentUsd + state.budget.reservedUsd;
            const uncertainReservedUsd = uncertain.reduce((sum, item) => { var _a; return sum + ((_a = item.reservedCostUsd) !== null && _a !== void 0 ? _a : 0); }, 0);
            if (!Number.isFinite(total) || !Number.isFinite(uncertainReservedUsd))
                conflict();
            return { uid, day, timeZone: 'UTC', policy: state.policy,
                budget: { limitUsd, accountedUsd: state.budget.spentUsd, reservedUsd: state.budget.reservedUsd, remainingUsd: Math.max(0, limitUsd - total) },
                uncertain, uncertainSummary: { count: uncertain.length, reservedCostUsd: uncertainReservedUsd },
                uncertainTruncated: operations.docs.length > 100,
                notes: [
                    '이미지 생성만 관리합니다. 텍스트·영상·팀 전체 예산이 아닙니다.',
                    '일일 예산은 UTC 기준이며 기존 사용량 보고서의 Asia/Seoul 날짜와 다를 수 있습니다.',
                    'accountedUsd는 보수적 추정 차감 및 수동 정산을 포함한 장부 값이며 공급자 청구서의 확정 실제 비용이 아닙니다. reservedUsd는 별도의 진행 중 예약입니다.',
                    '불확실 목록은 이 사용자의 모든 날짜 중 최대 100건입니다. 건수·예약 합계는 표시된 범위만 포함하며 누락 비용은 합계에서 제외합니다. 목록과 예산은 서로 다른 조회 시점일 수 있습니다.',
                    '누락된 모델·예상 비용은 추정하지 않습니다. 한도 인하는 이미 진행 중인 예약을 해제하지 않습니다.',
                    ...(!state.exists ? ['선택한 UTC 날짜의 예산 기록이 없어 장부와 예약을 0으로 표시합니다. 계정 존재 또는 전체 사용 이력을 보장하지 않습니다.'] : []),
                ] };
        },
        async patch(actor, body) {
            requireAdmin(actor);
            const input = parse(exports.PatchImageBudgetSchema, body);
            await rateLimit(actor);
            let target;
            try {
                target = await auth.getUser(input.uid);
            }
            catch (error) {
                if (error && typeof error === 'object' && 'code' in error && error.code === 'auth/user-not-found')
                    throw new ImageBudgetError(404, '대상 계정을 확인할 수 없습니다.');
                throw new ImageBudgetError(503, '대상 계정을 확인할 수 없습니다.');
            }
            if (target.uid !== input.uid || target.disabled)
                throw new ImageBudgetError(409, '활성 대상 계정을 확인해 주세요.');
            const ref = db.collection(exports.IMAGE_BUDGET_POLICIES).doc((0, exports.imageBudgetPolicyKey)(input.uid));
            const revision = hash((0, node_crypto_1.randomUUID)());
            return db.runTransaction(async (tx) => {
                const previous = policyOf(await tx.get(ref), input.uid);
                if (previous.revision !== input.expectedRevision64)
                    conflict();
                const at = new Date(now());
                const policy = { dailyLimitUsd: input.dailyLimitUsd, revision };
                const audit = { operation: 'image-budget-policy-update', uid: input.uid, actor: actor.uid, at,
                    previousRevision: previous.revision, previousDailyLimitUsd: previous.dailyLimitUsd, dailyLimitUsd: input.dailyLimitUsd, revision };
                tx.set(ref, Object.assign(Object.assign({ uid: input.uid }, policy), { updatedAt: at, updatedBy: actor.uid }));
                tx.create(ref.collection('audit').doc(revision), audit);
                return { ok: true, policy };
            });
        },
        async reconcile(actor, body) {
            requireAdmin(actor);
            const input = parse(exports.ReconcileImageBudgetSchema, body);
            await rateLimit(actor);
            const actualCostUsd = input.decision === 'charged' ? input.actualCostUsd : 0;
            const ref = db.collection('aiOperationReservations').doc(input.operationId);
            return db.runTransaction(async (tx) => {
                const data = (await tx.get(ref)).data();
                if (!data || data.uid !== input.uid || data.operation !== 'image-generation' || data.budgetSettled !== true)
                    conflict();
                const result = { ok: true, id: input.operationId, status: 'reconciled', decision: input.decision, actualCostUsd };
                if (data.status === 'reconciled') {
                    const previous = data.costReconciliation;
                    if (!previous || previous.decision !== input.decision || previous.actualCostUsd !== actualCostUsd || data.chargedUsd !== actualCostUsd)
                        conflict();
                    return result;
                }
                if (data.status !== 'uncertain' || data.costReconciliation !== undefined || !daySchema.safeParse(data.budgetDate).success || !nonnegative(data.chargedUsd))
                    conflict();
                // Both actual finishers persist chargedUsd even for estimated uncertain settlement.
                // Missing chargedUsd has no verified legacy accounting contract: never guess from a hold.
                const previousAccounted = data.chargedUsd;
                const budgetRef = db.collection('aiDailyBudgets').doc((0, exports.imageDailyBudgetKey)(input.uid, data.budgetDate));
                const budget = budgetOf(await tx.get(budgetRef), input.uid, data.budgetDate, true);
                if (budget.spentUsd < previousAccounted)
                    conflict();
                const spentUsd = budget.spentUsd + (actualCostUsd - previousAccounted);
                if (!nonnegative(spentUsd))
                    conflict();
                const at = new Date(now());
                tx.update(budgetRef, { spentUsd, updatedAt: at }); // Never release in-flight holds or clamp inconsistent debits.
                tx.update(ref, { chargedUsd: actualCostUsd, budgetSettled: true, status: 'reconciled', updatedAt: at,
                    costReconciliation: { operation: 'image-cost-reconciliation', decision: input.decision, note: input.note,
                        actor: actor.uid, at, previousAccounted, actualCostUsd, evidence: 'manual-admin-review' } });
                return result;
            });
        },
    };
}
//# sourceMappingURL=imageBudgetOperations.js.map