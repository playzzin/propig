"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserUpdateSafetyError = void 0;
exports.managedUserRevision = managedUserRevision;
exports.reserveUserUpdate = reserveUserUpdate;
exports.finishUserUpdate = finishUserUpdate;
exports.markUserUpdateUncertain = markUserUpdateUncertain;
exports.userAccessAudit = userAccessAudit;
const node_crypto_1 = require("node:crypto");
// Keep this module byte-identical to functions/src/api/adminUserUpdateSafety.ts.
class UserUpdateSafetyError extends Error {
    constructor(code) {
        super(code === 'USER_UPDATE_ACTOR_UNSAFE'
            ? '현재 관리자 계정의 활성 상태와 권한을 확인할 수 없습니다. 다시 로그인하거나 다른 관리자에게 문의해 주세요.'
            : code === 'USER_UPDATE_CONFLICT'
                ? '사용자 정보가 변경되었거나 저장 버전이 없습니다. 새로고침 후 다시 확인해 주세요.'
                : code === 'USER_UPDATE_IN_PROGRESS'
                    ? '이 계정의 변경이 진행 중입니다. 잠시 후 새로고침해 주세요.'
                    : '변경이 일부 반영되었을 수 있습니다. 관리자 확인 및 복구가 필요합니다.');
        this.code = code;
    }
    get status() {
        return this.code === 'USER_UPDATE_ACTOR_UNSAFE' ? 403 : this.code === 'USER_UPDATE_UNCERTAIN' ? 503 : 409;
    }
}
exports.UserUpdateSafetyError = UserUpdateSafetyError;
function canonical(value) {
    if (value === undefined || value === null)
        return 'null';
    if (Array.isArray(value))
        return `[${value.map(canonical).join(',')}]`;
    if (typeof value === 'object') {
        return `{${Object.entries(value)
            .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
            .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
    }
    return JSON.stringify(value);
}
// Hash raw authority, not only the normalized UI projection: masked claims and
// aliases still matter when replacing all custom claims. No claims leave this hash.
// Sign-in timestamps are deliberately excluded (signing in is not an access edit).
function managedUserRevision(user, access, hasAdminDoc) {
    var _a;
    return (0, node_crypto_1.createHash)('sha256').update(canonical({
        schema: 1, uid: user.uid, disabled: user.disabled,
        claims: (_a = user.customClaims) !== null && _a !== void 0 ? _a : {}, access, hasAdminDoc,
    })).digest('hex');
}
const guardRef = (db, uid) => db.collection('serverRateLimits').doc(`admin-user-update-${(0, node_crypto_1.createHash)('sha256').update(uid).digest('hex')}`);
const guardRefs = (guard) => { var _a; return [...new Map([guard.ref, ...((_a = guard.refs) !== null && _a !== void 0 ? _a : [])].map(ref => [ref.path, ref])).values()]; };
async function assertSafeActor(db, transaction, actor) {
    var _a, _b, _c;
    let user;
    try {
        user = await actor.readCurrentUser();
    }
    catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'auth/user-not-found') {
            throw new UserUpdateSafetyError('USER_UPDATE_ACTOR_UNSAFE');
        }
        throw error; // Storage/Auth outage stays fail-closed, not a false authority verdict.
    }
    const [access, admin] = await Promise.all([
        transaction.get(db.collection('userAccess').doc(actor.uid)),
        transaction.get(db.collection('admins').doc(actor.uid)),
    ]);
    // Match current persisted admin sources, not the request's potentially stale claims.
    // Preserve the existing server-configured UID authority, never stale token claims.
    const allowedByUid = ((_a = process.env.ADMIN_UIDS) !== null && _a !== void 0 ? _a : '').split(',').map(uid => uid.trim()).includes(actor.uid);
    const claims = (_b = user.customClaims) !== null && _b !== void 0 ? _b : {};
    if (user.uid !== actor.uid || user.disabled ||
        !(allowedByUid || claims.admin === true || claims.role === 'admin' || ((_c = access.data()) === null || _c === void 0 ? void 0 : _c.role) === 'admin' || admin.exists)) {
        throw new UserUpdateSafetyError('USER_UPDATE_ACTOR_UNSAFE');
    }
}
/**
 * Both entrypoints use the SAME serverRateLimits document namespace. A new
 * adminUserUpdateGuards collection would be client-writable under current Rules'
 * admin catch-all! serverRateLimits explicitly denies all client writes (admins
 * can read it); store only operational state, never payloads/claims/credentials.
 *
 * No lease/TTL/automatic takeover: Auth IO has no fencing token and can complete
 * after an HTTP timeout. Even abandoned `running` locks require operator recovery:
 * quiesce ALL writers/in-flight requests, reconcile Auth + userAccess + admins,
 * then remove the entire correlated guard set using a trusted server tool. Age
 * alone is NOT proof of safety. A failed uncertain marker leaves guards closed.
 *
 * Full-admin writers reserve actor + target atomically in the SAME UID namespace.
 * The fresh, enabled actor is the surviving-admin witness; route self-revoke guards
 * must remain in place. Cross-demotion and same-actor requests cannot overlap.
 * Scope: cooperating Next/Hosting updates only. Console, Admin SDK scripts, existing
 * tokens elsewhere and current Rules' direct writes cannot be fenced. This is NOT
 * a global last-admin count/invariant. Delegated writers retain their existing
 * gates and target-only guard; their actor permission freshness is not added here.
 */
async function reserveUserUpdate(db, uid, expectedRevision, preparedRevision, readCurrentRevision, actor) {
    const owner = (0, node_crypto_1.randomUUID)();
    const ref = guardRef(db, uid);
    const refs = guardRefs({ ref, owner, refs: actor ? [guardRef(db, actor.uid)] : [] });
    await db.runTransaction(async (transaction) => {
        const locks = await Promise.all(refs.map(entry => transaction.get(entry)));
        // Prefer uncertain if either participant needs recovery.
        if (locks.some(lock => { var _a; return lock.exists && ((_a = lock.data()) === null || _a === void 0 ? void 0 : _a.state) !== 'running'; })) {
            throw new UserUpdateSafetyError('USER_UPDATE_UNCERTAIN');
        }
        if (locks.some(lock => lock.exists)) {
            throw new UserUpdateSafetyError('USER_UPDATE_IN_PROGRESS');
        }
        // All reads precede writes, and every retry refreshes BOTH actor and target.
        if (actor)
            await assertSafeActor(db, transaction, actor);
        // Read-only callback may run repeatedly on transaction contention. NEVER Auth writes.
        const current = await readCurrentRevision(transaction);
        if (current !== expectedRevision || current !== preparedRevision) {
            throw new UserUpdateSafetyError('USER_UPDATE_CONFLICT');
        }
        const metadata = { owner, state: 'running', startedAt: new Date().toISOString(),
            // Hash-only paths + shared owner correlate recovery without exposing UID/payload.
            lockPaths: refs.map(entry => entry.path) };
        refs.forEach(entry => transaction.create(entry, metadata));
    });
    // A rejected/ambiguous reservation never authorizes Auth IO; a possibly committed
    // lock remains closed for recovery. Return only after definitive commit success.
    return { ref, owner, refs };
}
async function finishUserUpdate(db, guard) {
    await db.runTransaction(async (transaction) => {
        const refs = guardRefs(guard);
        const locks = await Promise.all(refs.map(ref => transaction.get(ref)));
        // Validate the ENTIRE set before deleting anything; never release only the actor.
        if (locks.some(lock => { var _a, _b; return !lock.exists || ((_a = lock.data()) === null || _a === void 0 ? void 0 : _a.owner) !== guard.owner || ((_b = lock.data()) === null || _b === void 0 ? void 0 : _b.state) !== 'running'; })) {
            throw new UserUpdateSafetyError('USER_UPDATE_UNCERTAIN');
        }
        refs.forEach(ref => transaction.delete(ref));
    });
}
async function markUserUpdateUncertain(db, guard) {
    try {
        await db.runTransaction(async (transaction) => {
            const refs = guardRefs(guard);
            const locks = await Promise.all(refs.map(ref => transaction.get(ref)));
            // Never overwrite another operation, nor recreate a successfully released lock.
            // Mark every still-owned member even if another member needs manual reconciliation.
            locks.forEach((lock, index) => {
                var _a;
                if (lock.exists && ((_a = lock.data()) === null || _a === void 0 ? void 0 : _a.owner) === guard.owner) {
                    transaction.update(refs[index], { state: 'uncertain' });
                }
            });
        });
    }
    catch (_a) {
        // Do not expose claims/errors. The existing non-expiring guard is still closed.
        console.error('[Admin Users] Could not mark update guard uncertain; manual recovery required.');
    }
}
// Chunk into bounded objects, not arrays: activity sanitizers cap arrays at 40,
// objects at 60 keys and depth at 4. Boolean leaves in these chunks remain intact.
function userAccessAudit(user) {
    const chunks = (map) => {
        const entries = Object.entries(map).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
        return Object.fromEntries(Array.from({ length: Math.ceil(entries.length / 50) }, (_, index) => [String(index), Object.fromEntries(entries.slice(index * 50, (index + 1) * 50))]));
    };
    return { role: user.role, position: user.position, disabled: user.disabled,
        permissions: user.permissions, siteAccess: chunks(user.siteAccess), menuAccess: chunks(user.menuAccess),
        hasAdminDoc: user.isAdminDocLinked };
}
//# sourceMappingURL=adminUserUpdateSafety.js.map