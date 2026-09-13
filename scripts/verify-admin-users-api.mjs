import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const requirePackage = createRequire(path.join(root, 'package.json'));
const clone = value => JSON.parse(JSON.stringify(value));
const keys = ['menuManagement', 'userManagement', 'projectBoardManagement', 'photoManagement', 'storageManagement'];
const noPermissions = Object.fromEntries(keys.map(k => [k, false]));
const allPermissions = () => Object.fromEntries(keys.map(k => [k, true]));
const baseline = process.env.ADMIN_USERS_SERVER_BASELINE === '1';
class ApiError extends Error { constructor(status, message, details) { super(message); this.status = status; this.details = details; } }
class Timestamp { toDate() { return new Date('2026-09-09T00:00:00.000Z'); } }
let state;
const testEnv={};
function reset() {
  delete testEnv.ADMIN_UIDS;
  state = {
    identity: { ok: true, uid: 'operator', isAdmin: true, role: 'admin', permissions: allPermissions() },
    target: { uid: 'target', email: 'target@example.invalid', displayName: '격리 회원', photoURL: null, disabled: false, emailVerified: true, customClaims: { unrelated: 'preserved' }, providerData: [{ providerId: 'password' }], metadata: { creationTime: '2026-01-01T00:00:00.000Z', lastSignInTime: null } },
    access: { uid: 'target', role: 'user', position: 'staff', siteAccess: { obsolete: true }, menuAccess: { 'corp:obsolete': true }, permissions: { ...noPermissions }, unrelated: 'preserved' },
    actor: { uid: 'operator', disabled: false, customClaims: { admin: true } }, actorAccess: null, actorAdminDoc: null,
    guards: {}, audit: [], adminDoc: null, authWrites: [], dbWrites: [], listCalls: [], fail: null,
  };
}
const docValue = (name, id) => name === 'admins' ? (id === 'operator' ? state.actorAdminDoc : state.adminDoc) : name === 'userAccess' ? (id === 'operator' ? state.actorAccess : state.access) : state.guards[name + '/' + id];
const snapshot = (name, id) => ({ id, exists: Boolean(docValue(name, id)), data: () => docValue(name, id) ? clone(docValue(name, id)) : undefined });
let transactionQueue = Promise.resolve();
const db = {
  collection(name) { return { doc(id) { return { name, id, path: name + '/' + id, get: async () => { if (state.fail === 'read') throw Error('PRIVATE_DATABASE_DETAIL'); return snapshot(name, id); } }; } }; },
  getAll: async (...refs) => { if (state.fail === 'read') throw Error('PRIVATE_DATABASE_DETAIL'); return refs.map(ref => snapshot(ref.name, ref.id)); },
  async runTransaction(callback) {
    const previous = transactionQueue; let release; transactionQueue = new Promise(resolve => { release = resolve; }); await previous;
    const ops = [];
    try {
      const value = await callback({ get: async ref => snapshot(ref.name, ref.id),
        create(ref,data) {if(docValue(ref.name,ref.id))throw Error('exists');ops.push({ref,data});},
        set(ref,data,options) {ops.push({ref,data,options});},
        update(ref,data) {ops.push({ref,data,options:{merge:true}});},
        delete(ref) {ops.push({ref,remove:true});} });
      for (const op of ops) {const k=op.ref.path;if(op.remove)delete state.guards[k];else state.guards[k]=op.options?.merge?{...state.guards[k],...clone(op.data)}:clone(op.data);}
      return value;
    } finally {release();}
  },
  batch() {
    const ops = [];
    return {
      set(ref, data, options) { ops.push({ kind: 'set', ref, data, options }); },
      delete(ref) { ops.push({ kind: 'delete', ref }); },
      async commit() {
        if (state.fail === 'commit') throw Error('PRIVATE_DATABASE_DETAIL');
        for (const op of ops) {
          state.dbWrites.push(op);
          if (op.kind === 'delete') { state.adminDoc = null; continue; }
          const field = op.ref.name === 'admins' ? 'adminDoc' : 'access';
          const prior = state[field] || {};
          if (op.options?.mergeFields) {
            const next = { ...prior };
            for (const k of op.options.mergeFields) next[k] = clone(op.data[k]);
            state[field] = next;
          } else if (op.options?.merge === true) {
            state[field] = { ...prior, ...clone(op.data) };
            for (const k of ['siteAccess', 'menuAccess', 'permissions']) if (op.data[k]) state[field][k] = { ...prior[k], ...clone(op.data[k]) };
          } else state[field] = clone(op.data);
        }
      },
    };
  },
};
const auth = {
  async listUsers(size, token) { state.listCalls.push({ size, token }); return { users: [clone(state.target)], pageToken: token ? undefined : 'next-token' }; },
  async getUser(uid) { if (uid === 'operator') { if (!state.actor) throw Object.assign(Error('PRIVATE_ACTOR'), { code: 'auth/user-not-found' }); return clone(state.actor); } if (state.fail === 'missing') throw Object.assign(Error('PRIVATE_USER_DETAIL'), { code: 'auth/user-not-found' }); return { ...clone(state.target), uid }; },
  async updateUser(uid, patch) { state.authWrites.push({ kind: 'disabled', uid, patch }); if (state.fail === 'update') throw Error('PRIVATE_AUTH_DETAIL'); Object.assign(state.target, patch); return clone(state.target); },
  async setCustomUserClaims(uid, claims) { state.authWrites.push({ kind: 'claims', uid }); if (Buffer.byteLength(JSON.stringify(claims)) > 1000) throw Object.assign(Error('PRIVATE_CLAIMS_DETAIL'), { code: 'auth/claims-too-large' }); if (state.fail === 'claims') throw Error('PRIVATE_AUTH_DETAIL'); state.target.customClaims = clone(claims); },
};
const admin = { auth: () => auth, firestore: { FieldValue: { serverTimestamp: () => '2026-09-09T00:00:00.000Z' } } };
const common = {
  ApiError, USER_PERMISSION_KEYS: keys, allPermissions, db,
  isRecord: value => Boolean(value) && typeof value === 'object' && !Array.isArray(value),
  formatTimestamp: value => typeof value === 'string' ? value : null,
  parseJson: req => { try { return typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { throw new ApiError(400, '잘못된 JSON'); } },
  requireMethod: (req, methods) => { if (!methods.includes(req.method)) throw new ApiError(405, 'Method not allowed'); },
  requireAccess: async () => { if (!state.identity.ok) throw new ApiError(state.identity.status, '권한 없음'); return state.identity; },
  writeActivityLogSafely: async entry => { state.audit.push(entry); },
};
const stubs = {
  'firebase-admin': admin,
  'firebase-admin/firestore': { FieldValue: admin.firestore.FieldValue, Timestamp },
  '@/lib/firebase-admin': { __esModule: true, default: admin, db, getFirebaseAdminStatus: () => ({ canPersistToFirestore: true, credentialMode: 'fixture', message: null }) },
  '@/lib/server/admin-auth': { requireAdminOrPermissionAuth: async () => state.identity },
  '@/lib/server/activity-log': { writeActivityLogSafely: async entry => { state.audit.push(entry); } },
  './hostingCommon': common,
};
function load(filename) {
  const source = fs.readFileSync(filename, 'utf8'); const module = { exports: {} };
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(compiled, {
    require: name => {
      if (name in stubs) return stubs[name];
      if (name.startsWith('@/')) return load(path.join(root, 'src', name.slice(2) + '.ts'));
      if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), name + '.ts'));
      if (name.startsWith('firebase')) throw Error('Unstubbed Firebase access: ' + name);
      return requirePackage(name);
    },
    module, exports: module.exports, console: { log() {}, error() {}, warn() {} }, Buffer, URL, URLSearchParams, Headers, Request, Response, Date, TextEncoder,
    process: { env: testEnv }, setTimeout, clearTimeout, AbortController, structuredClone,
  }, { filename });
  return module.exports;
}
const next = load(baseline ? '/tmp/propig-users-before-route.ts' : path.join(root, 'src/app/api/admin/users/route.ts'));
const hosting = load(baseline ? '/tmp/propig-users-before-hosting.ts' : path.join(root, 'functions/src/api/hostingAdminUsers.ts'));
async function invoke(kind, method, body, query = '') {
  if (!baseline && method === 'PATCH' && body?.expectedRevision === 'AUTO') {
    const current = await invoke(kind, 'GET');
    body = {...body, expectedRevision: current.data?.users?.[0]?.revision ?? '0'.repeat(64)};
  }
  const url = new URL('https://fixture.invalid/api/admin/users' + query);
  if (kind === 'next') {
    const response = await next[method]({ url: url.href, nextUrl: url, headers: new Headers(), json: async () => typeof body === 'string' ? JSON.parse(body) : body });
    return { status: response.status, data: await response.json(), cache: response.headers.get('cache-control') };
  }
  const req = { method, body, url: url.pathname + url.search, originalUrl: url.pathname + url.search, query: Object.fromEntries(url.searchParams), headers: {}, header: () => undefined, get: () => undefined };
  const headers = {}; const result = { status: 200, data: undefined, cache: null };
  const res = { setHeader: (k, v) => { headers[k.toLowerCase()] = v; }, set: (k, v) => { if (typeof k === 'object') Object.assign(headers, k); else headers[k.toLowerCase()] = v; return res; }, status: s => { result.status = s; return res; }, json: data => { result.data = clone(data); return res; } };
  try { await hosting.handleAdminUsers(req, res); } catch (error) { result.status = error.status || 500; result.data = { error: error.message, ...(error.details || {}) }; }
  result.cache = headers['cache-control']; return result;
}
const payload = (overrides = {}) => ({ ...(!baseline ? {expectedRevision:'AUTO'} : {}), uid: 'target', role: 'user', position: 'staff', siteAccess: {}, menuAccess: {}, permissions: { ...noPermissions }, disabled: false, ...overrides });
let tests = 0;
for (const kind of ['next', 'hosting']) {
  const check = async (name, run) => { reset(); await run(); tests++; console.log(`${baseline ? 'REPRODUCED' : 'PASS'} ${kind}: ${name}`); };
  if (baseline) {
    await check('removed nested access keys survive merge', async () => { const r = await invoke(kind, 'PATCH', payload()); assert.equal(r.status, 200); assert.equal(state.access.menuAccess['corp:obsolete'], true); });
    await check('revoked direct permission claim stays true', async () => { state.target.customClaims.photoManagement = true; const r = await invoke(kind, 'PATCH', payload()); assert.equal(r.status, 200); assert.equal(state.target.customClaims.photoManagement, true); });
    await check('oversized claims fails after account disabled write', async () => { state.target.customClaims.padding = 'x'.repeat(1100); const r = await invoke(kind, 'PATCH', payload({ disabled: true })); assert(r.status >= 400); assert.equal(state.target.disabled, true); });
    continue;
  }
  for (const status of [401, 403]) await check(`authorization ${status} has no side effects`, async () => { state.identity = { ok: false, status, message: '권한 없음' }; const r = await invoke(kind, 'PATCH', payload()); assert.equal(r.status, status); assert.equal(state.authWrites.length, 0); });
  if (!baseline) {
    await check('invitation review resolves exact uid without scanning pages', async () => { const r = await invoke(kind, 'GET', undefined, '?uid=invited-member'); assert.equal(r.status, 200); assert.equal(r.data.users.length, 1); assert.equal(r.data.users[0].uid, 'invited-member'); assert.equal(r.data.nextPageToken, null); assert.equal(state.listCalls.length, 0); });
    await check('missing invitation review user reports404', async () => { state.fail='missing'; const r=await invoke(kind,'GET',undefined,'?uid=missing-member'); assert.equal(r.status,404); assert(!JSON.stringify(r.data).includes('PRIVATE_')); });
    await check('uid cannot be combined with pagination or document paths', async () => { for(const query of ['?uid=member&pageToken=next-token','?uid=bad%2Fpath']){ const r=await invoke(kind,'GET',undefined,query); assert.equal(r.status,400); } assert.equal(state.listCalls.length,0); });
  }
  await check('bounded first page and explicit cursor', async () => { const r = await invoke(kind, 'GET'); assert.equal(r.status, 200); assert.equal(state.listCalls.length, 1); assert.equal(state.listCalls[0].size, 100); assert.equal(r.data.nextPageToken, 'next-token'); assert.match(r.cache, /no-store/); });
  await check('continuation token reaches Auth', async () => { const r = await invoke(kind, 'GET', undefined, '?pageToken=next-token'); assert.equal(r.status, 200); assert.equal(state.listCalls[0].token, 'next-token'); assert.equal(r.data.nextPageToken, null); });
  await check('bad cursor rejected before reads', async () => { const r = await invoke(kind, 'GET', undefined, '?pageToken=' + 'x'.repeat(2050)); assert.equal(r.status, 400); assert.equal(state.listCalls.length, 0); });
  await check('incomplete Firestore read fails closed', async () => { state.fail = 'read'; const r = await invoke(kind, 'GET'); assert.equal(r.status, 503); assert(!r.data.users); assert(!JSON.stringify(r.data).includes('PRIVATE_')); });
  await check('effective admin authority takes precedence', async () => { state.target.customClaims.admin = true; const r = await invoke(kind, 'GET'); assert.equal(r.data.users[0].role, 'admin'); });
  for (const [name, p] of [['invalid JSON', '{'], ['invalid UID', payload({ uid: 'bad/path' })], ['unexpected property', { ...payload(), secret: 'no' }], ['prototype key', payload({ siteAccess: JSON.parse('{"__proto__":true}') })]]) {
    await check(name, async () => { const r = await invoke(kind, 'PATCH', p); assert.equal(r.status, 400); assert.equal(state.authWrites.length, 0); });
  }
  await check('self admin lockout blocked', async () => { const r = await invoke(kind, 'PATCH', payload({ uid: 'operator' })); assert.equal(r.status, 400); assert.equal(state.authWrites.length, 0); });
  await check('delegated manager cannot promote', async () => { state.identity.isAdmin = false; const r = await invoke(kind, 'PATCH', payload({ role: 'admin' })); assert.equal(r.status, 403); assert.equal(state.authWrites.length, 0); });
  await check('delegated manager cannot edit existing admin', async () => { state.identity.isAdmin = false; state.adminDoc = { role: 'admin' }; const r = await invoke(kind, 'PATCH', payload()); assert.equal(r.status, 403); assert.equal(state.authWrites.length, 0); });
  await check('oversized claims preflight before disable', async () => { state.target.customClaims.padding = 'x'.repeat(1100); const r = await invoke(kind, 'PATCH', payload({ disabled: true })); assert.equal(r.status, 400); assert.equal(state.authWrites.length, 0); assert.equal(state.target.disabled, false); });
  await check('permission aliases cleared and maps replaced', async () => { state.target.customClaims.photoManagement = true; state.target.customClaims.photoManager = true; const r = await invoke(kind, 'PATCH', payload()); assert.equal(r.status, 200); assert.equal(r.data.ok, true); assert.equal(state.target.customClaims.photoManagement, false); assert.equal(state.target.customClaims.photoManager, false); assert.deepEqual(state.access.siteAccess, {}); assert.deepEqual(state.access.menuAccess, {}); assert.equal(state.access.unrelated, 'preserved'); assert.equal(state.target.customClaims.unrelated, 'preserved'); });
  for (const failure of ['update', 'claims', 'commit']) await check(`${failure} failure reports uncertain mutation`, async () => { state.fail = failure; const r = await invoke(kind, 'PATCH', payload({ disabled: true })); assert.equal(r.status, 503); assert.equal(r.data.code, 'USER_UPDATE_UNCERTAIN'); assert(!JSON.stringify(r.data).includes('PRIVATE_')); });
  await check('missing and stale revisions cause no Auth writes', async () => {
    const missing = payload(); delete missing.expectedRevision;
    const absent = await invoke(kind,'PATCH',missing); assert.equal(absent.status,409);
    const r = await invoke(kind,'PATCH',payload({expectedRevision:'f'.repeat(64)}));
    assert.equal(r.status,409); assert.equal(r.data.code,'USER_UPDATE_CONFLICT'); assert.equal(state.authWrites.length,0);
  });
  await check('mixed Next/Hosting simultaneous save has a single winner', async () => {
    const before = await invoke(kind,'GET');const revision=before.data.users[0].revision;assert.match(revision,/^[a-f0-9]{64}$/);
    const both = await Promise.all([invoke('next','PATCH',payload({expectedRevision:revision,position:'manager'})),invoke('hosting','PATCH',payload({expectedRevision:revision,position:'intern'}))]);
    assert.deepEqual(both.map(x=>x.status).sort(),[200,409]);assert.equal(state.authWrites.filter(x=>x.kind==='claims').length,1);
    const stale=await invoke(kind,'PATCH',payload({expectedRevision:revision}));assert.equal(stale.status,409);assert.equal(state.authWrites.filter(x=>x.kind==='claims').length,1);
    assert.equal(Object.keys(state.guards).length,0,'success releases owned guard');
  });
  for (const actorState of ['deleted','disabled','demoted']) await check(`fresh actor ${actorState} blocks stale token before writes`, async () => {
    if(actorState==='deleted')state.actor=null;
    else if(actorState==='disabled')state.actor.disabled=true;
    else state.actor.customClaims={};
    const result=await invoke(kind,'PATCH',payload());assert.equal(result.status,403);assert.equal(result.data.code,'USER_UPDATE_ACTOR_UNSAFE');assert.equal(state.authWrites.length,0);assert.equal(Object.keys(state.guards).length,0);assert(!JSON.stringify(result.data).includes('PRIVATE_'));
  });
  await check('server UID allowlist remains valid but disabled actor cannot use it', async () => {
    state.actor.customClaims={};testEnv.ADMIN_UIDS=' other, operator ';let result=await invoke(kind,'PATCH',payload());assert.equal(result.status,200);state.actor.disabled=true;result=await invoke(kind,'PATCH',payload());assert.equal(result.status,403);assert.equal(result.data.code,'USER_UPDATE_ACTOR_UNSAFE');
  });
  for (const authority of ['access','adminDoc']) await check(`fresh ${authority} actor authority is respected`, async () => {
    state.actor.customClaims={};if(authority==='access')state.actorAccess={role:'admin'};else state.actorAdminDoc={role:'admin'};
    const result=await invoke(kind,'PATCH',payload());assert.equal(result.status,200);assert.equal(Object.keys(state.guards).length,0);
  });
  await check('uncertain save retains guard and rejects fresh retry', async () => {
    state.fail='claims';const r=await invoke(kind,'PATCH',payload());assert.equal(r.data.code,'USER_UPDATE_UNCERTAIN');
    const writes=state.authWrites.length;state.fail=null;
    const retry=await invoke(kind,'PATCH',payload());assert.equal(retry.status,503);assert.equal(retry.data.code,'USER_UPDATE_UNCERTAIN');assert.equal(state.authWrites.length,writes);
  });
  await check('missing user is safe 404 before writes', async () => { state.fail = 'missing'; const r = await invoke(kind, 'PATCH', payload()); assert.equal(r.status, 404); assert.equal(state.authWrites.length, 0); assert(!JSON.stringify(r.data).includes('PRIVATE_')); });
}
console.log(`${baseline ? 'REPRODUCED' : 'PASS'} ${tests} actual Next/Hosting user handler cases; real Zod, identity/Admin SDK/Firestore/audit IO mocked; no live users touched`);
