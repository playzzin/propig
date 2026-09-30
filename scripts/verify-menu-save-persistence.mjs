import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
const root = process.cwd();
const requirePackage = createRequire(path.join(root, 'package.json'));
const clone = value => JSON.parse(JSON.stringify(value));
const site = name => ({ name, icon: 'globe', menu: [], trash: [] });
const local = new Map();
const auth = { currentUser: { getIdToken: async () => 'isolated-fixture-token' } };
let requestCount = 0;
let accelerateDeadline = false;
let responder = async () => ({ ok: true, json: async () => ({ ok: true }) });
let tokenRole = 'admin';
let stored = { sites: { corp: site('before'), obsolete: site('remove') }, unrelated: 'preserved' };
let writeCount = 0;
let failWrite = false;
const logs = [];
const firestore = {
  collection(name) {
    return { doc() {
      if (name !== 'menuSettings') return { get: async () => ({ exists: false }) };
      return {
        get: async () => ({ exists: true, data: () => clone(stored) }),
        set: async (data, options) => {
          if (failWrite) throw Error('isolated write failure');
          assert.deepEqual(Array.from(options.mergeFields), ['version', 'sites', 'updatedAt', 'updatedBy']);
          for (const key of options.mergeFields) stored[key] = clone(data[key]);
          writeCount++;
        },
      };
    } };
  },
};
const admin = {
  apps: [{}],
  auth: () => ({ verifyIdToken: async token => {
    assert.equal(token, 'isolated-fixture-token');
    if (tokenRole === 'invalid') throw Object.assign(Error('fixture invalid token'), { code: 'auth/id-token-expired' });
    return { uid: 'isolated-fixture-user', role: tokenRole === 'menu-manager' ? 'user' : tokenRole,
      ...(tokenRole === 'menu-manager' ? { permissions: { menuManagement: true } } : {}) };
  } }),
};
const stubs = {
  'firebase/firestore': { doc: () => ({}), getDoc: async () => ({ exists: () => false }), onSnapshot: () => () => {} },
  '@/firebase/config': { auth, db: {} },
  '@/lib/firebase-admin': { __esModule: true, default: admin, db: firestore },
  'firebase-admin/firestore': { FieldValue: { serverTimestamp: () => 'isolated-time' } },
  '@/lib/server/activity-log': { writeActivityLogSafely: async event => logs.push(event) },
};
const modules = new Map();
function load(filename) {
  if (modules.has(filename)) return modules.get(filename).exports;
  const source = fs.readFileSync(filename, 'utf8');
  const module = { exports: {} }; modules.set(filename, module);
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const localRequire = name => {
    if (name in stubs) return stubs[name];
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : path.resolve(path.dirname(filename), name);
      const next = [base, base + '.ts', path.join(base, 'index.ts')].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
      if (!next) throw Error('Missing fixture module: ' + name);
      return load(next);
    }
    if (name.startsWith('firebase')) throw Error('Unstubbed Firebase access: ' + name);
    return requirePackage(name);
  };
  vm.runInNewContext(compiled, {
    require: localRequire, module, exports: module.exports,
    console: { ...console, error() {}, warn() {} }, process: { env: {} },
    setTimeout: (fn, ms) => setTimeout(fn, accelerateDeadline && ms === 15000 ? 5 : ms), clearTimeout, queueMicrotask, AbortController,
    window: { localStorage: { getItem: key => local.get(key) ?? null, setItem: (key, value) => local.set(key, value) } },
    fetch: async (url, options) => { assert.equal(url, '/api/admin/menu-sites'); requestCount++; return responder(options); },
  }, { filename });
  return module.exports;
}
const service = load(path.join(root, 'src/services/menuService.ts')).menuService;
const baseline = service.getDefaultSites();
service.allSitesCache = clone(baseline);
const candidate = clone(baseline); candidate.corp.name = 'isolated edited corp';
let release;
responder = () => new Promise(resolve => { release = resolve; });
const pending = service.saveAllSites(candidate);
await new Promise(resolve => setImmediate(resolve));
assert.notEqual(service.getCachedSites().corp.name, candidate.corp.name, 'no cache commit before ACK');
assert.equal(local.size, 0, 'no local commit before ACK');
release({ ok: true, json: async () => ({ ok: true }) }); await pending;
assert.equal(service.getCachedSites().corp.name, candidate.corp.name);
const confirmed = JSON.stringify(service.getCachedSites());
const localConfirmed = Array.from(local.entries());
for (const failure of [
  async () => { throw Error('offline'); },
  async () => ({ ok: false, json: async () => ({ error: 'denied' }) }),
  async () => ({ ok: true, json: async () => ({}) }),
  async () => ({ ok: true, json: async () => { throw Error('invalid JSON'); } }),
]) {
  responder = failure;
  await assert.rejects(service.saveAllSites(baseline));
  assert.equal(JSON.stringify(service.getCachedSites()), confirmed);
  assert.deepEqual(Array.from(local.entries()), localConfirmed);
  await assert.rejects(service.saveSite('corp', site('must not publish')));
}
accelerateDeadline = true;
responder = () => new Promise(() => {});
await assert.rejects(service.saveAllSites(baseline));
assert.equal(JSON.stringify(service.getCachedSites()), confirmed);
const originalUser = auth.currentUser;
let releaseToken;
auth.currentUser = { getIdToken: () => new Promise(resolve => { releaseToken = resolve; }) };
const beforeLateToken = requestCount;
await assert.rejects(service.saveAllSites(baseline));
releaseToken('isolated-fixture-token');
await new Promise(resolve => setImmediate(resolve));
assert.equal(requestCount, beforeLateToken, 'expired token wait cannot dispatch a late write');
accelerateDeadline = false;
auth.currentUser = null;
const beforeGuest = requestCount;
await assert.rejects(service.saveAllSites(candidate)); assert.equal(requestCount, beforeGuest);
auth.currentUser = originalUser;
responder = async () => ({ ok: true, json: async () => ({ ok: true }) });
await service.saveAllSites(baseline);
assert.equal(service.getCachedSites().corp.name, baseline.corp.name, 'retry commits');

// Execute actual Next route and actual auth resolver; only token verification,
// Firestore IO and audit sink are isolated. No production credentials or writes.
const { PUT } = load(path.join(root, 'src/app/api/admin/menu-sites/route.ts'));
const { NextRequest } = requirePackage('next/server');
const request = (body, signedIn = true) => new NextRequest('http://localhost/api/admin/menu-sites', {
  method: 'PUT', headers: signedIn ? { authorization: 'Bearer isolated-fixture-token', 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
assert.equal((await PUT(request({ sites: candidate }, false))).status, 401);
tokenRole = 'user'; assert.equal((await PUT(request({ sites: candidate }))).status, 403);
tokenRole = 'invalid'; assert.equal((await PUT(request({ sites: candidate }))).status, 401);
assert.equal(writeCount, 0);
tokenRole = 'admin'; assert.equal((await PUT(request({ sites: { broken: 4 } }))).status, 400);
const saved = await PUT(request({ sites: candidate }));
assert.equal(saved.status, 200); assert.equal((await saved.json()).ok, true);
assert.equal(stored.sites.obsolete, undefined, 'deleted modes do not revive via recursive merge');
assert.equal(stored.unrelated, 'preserved'); assert.equal(stored.updatedBy, 'isolated-fixture-user');
assert.equal(logs.length, 1);
tokenRole = 'menu-manager';
assert.equal((await PUT(request({ sites: baseline }))).status, 200, 'delegated menu permission remains supported');
assert.equal(logs.length, 2);
failWrite = true; await assert.rejects(PUT(request({ sites: baseline }))); assert.equal(writeCount, 2);
const hosting = fs.readFileSync('functions/src/api/hostingCoreRoutes.ts', 'utf8');
const hostingHandler = hosting.slice(hosting.indexOf('export async function handleAdminMenuSites'), hosting.indexOf('const ModuleHrefSchema'));
assert.ok(hostingHandler.includes("mergeFields: ['version', 'sites', 'updatedAt', 'updatedBy']"));
console.log('PASS real menu service + Next handler/auth with isolated IO: ACK-only commit, failure/guest/invalid ACK/retry, 401/403/400, replacement persistence, audit attribution, Hosting parity');
