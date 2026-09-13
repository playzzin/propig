import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
const root = process.env.PROPIG_ROOT || process.cwd();
const require = createRequire(import.meta.url);
const ts = require(require.resolve('typescript', { paths: [process.env.PROPIG_TEST_RUNTIME || root, root] }));
const files = ['src/app/api/generate-image/route.ts', 'functions/src/api/hostingGenerationRoutes.ts'];
let failures = 0, passed = 0;
for (const file of files) {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true);
  const names = new Set(['imageOperationKey', 'imageBudgetDate', 'imageBudgetKey', 'imageRequestFingerprint', 'readTimestampMillis', 'reserveImageOperation', 'finishImageOperation']);
  const nodes = source.statements.filter(node =>
    (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) ||
    (ts.isClassDeclaration(node) && ['ImageOperationConflictError', 'ImageBudgetExceededError'].includes(node.name?.text)) ||
    (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => /^(IMAGE_(OPERATION|RESULT|DURABLE|DAILY|RESERVED)_|completedImageResults$)/.test(d.name.getText(source)))));
  assert(nodes.some(n => n.name?.text === 'reserveImageOperation'));
  const js = ts.transpileModule(nodes.map(n => n.getText(source)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const budgetFile = file.startsWith('src/') ? 'src/lib/server/image-budget-operations.ts' : 'functions/src/api/imageBudgetOperations.ts';
  const budgetModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, budgetFile), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, { module: budgetModule, exports: budgetModule.exports, require, Date, Buffer, process: { env: {} } });
  function fixture() {
    const docs = new Map(), blobs = new Map();
    const stats = { writes: 0, providerAdmissions: 0 };
    const ref = key => ({ key, collection: name => collection(`${key}/${name}`), get: async () => ({ data: () => docs.get(key) }) });
    const collection = name => ({ doc: id => ref(`${name}/${id}`) });
    const db = { collection, runTransaction: async callback => {
      const staged = [];
      const result = await callback({ get: async r => ({ exists: docs.has(r.key), data: () => docs.get(r.key) }), set: (r, data, opts) => staged.push([r.key, data, opts]) });
      for (const [key, data, opts] of staged) { docs.set(key, opts?.merge ? { ...docs.get(key), ...data } : data); stats.writes++; }
      return result;
    }, batch: () => { const staged = []; return { set: (r, data) => staged.push([r.key, data]), commit: async () => { for (const [key, data] of staged) { docs.set(key, data); stats.writes++; } } }; } };
    const admin = { storage: () => ({ bucket: () => ({ file: p => ({ save: async b => blobs.set(p, b), download: async () => { assert(blobs.has(p)); return [blobs.get(p)]; } }) }) }) };
    class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
    const context = vm.createContext({ readImageBudgetLimit: budgetModule.exports.readImageBudgetLimit, createHash, gzipSync, gunzipSync, Buffer, Date, process: { env: {} }, db, adminDb: db, admin, firebaseAdmin: admin, ApiError });
    vm.runInContext(js + '\nglobalThis.api = { reserveImageOperation, finishImageOperation, imageOperationKey, imageRequestFingerprint, imageBudgetDate, imageBudgetKey, completedImageResults };', context);
    const api = context.api, uid = 'fixture-user';
    const payload = { operationId: '11111111-1111-4111-8111-111111111111', prompt: 'A', numberOfImages: 1 };
    const key = api.imageOperationKey(uid, payload.operationId);
    const opPath = `aiOperationReservations/${key}`, budgetPath = `aiDailyBudgets/${api.imageBudgetKey(uid, api.imageBudgetDate())}`;
    const seed = (status, extra = {}) => {
      docs.set(opPath, { uid, requestFingerprint: api.imageRequestFingerprint(payload), status, updatedAt: new Date(Date.now() - 301000), budgetDate: api.imageBudgetDate(), reservedUsd: 1, budgetSettled: false, ...extra });
      docs.set(budgetPath, { uid, date: api.imageBudgetDate(), reservedUsd: 1, spentUsd: 0 });
    };
    const reserve = async (p = payload) => { const result = await api.reserveImageOperation(uid, p); if (!result.cached) stats.providerAdmissions++; return result; };
    const conflict = async (p = payload) => {
      const before = JSON.stringify([...docs]); const writes = stats.writes, admissions = stats.providerAdmissions;
      await assert.rejects(() => reserve(p), error => file.startsWith('src/') ? error.constructor.name === 'ImageOperationConflictError' : error.status === 409);
      assert.equal(JSON.stringify([...docs]), before); assert.equal(stats.writes, writes); assert.equal(stats.providerAdmissions, admissions);
    };
    const policy = dailyLimitUsd => docs.set(`aiBudgetPolicies/${budgetModule.exports.imageBudgetPolicyKey(uid)}`, { uid, dailyLimitUsd, revision: 'a'.repeat(64), updatedAt: new Date(), updatedBy: 'fixture-admin' });
    return { ...api, docs, stats, payload, key, opPath, budgetPath, seed, reserve, conflict, policy };
  }
  const cases = [
    ['zero policy blocks paid admission', async f => { f.policy(0); await assert.rejects(f.reserve); assert.equal(f.stats.writes, 0); assert.equal(f.stats.providerAdmissions, 0); }],
    ['custom policy below reservation blocks admission', async f => { f.policy(0.5); await assert.rejects(f.reserve); assert.equal(f.stats.writes, 0); assert.equal(f.stats.providerAdmissions, 0); }],
    ['malformed policy fails closed', async f => { f.policy('bad'); await assert.rejects(f.reserve); assert.equal(f.stats.writes, 0); assert.equal(f.stats.providerAdmissions, 0); }],
    ['null policy retains prior server default', async f => { f.policy(null); await f.reserve(); assert.equal(f.stats.providerAdmissions, 1); }],
    ['manual reconciled status blocks paid replay', async f => { f.seed('reconciled', { budgetSettled: true, chargedUsd: 0 }); await f.conflict(); }],
    ['reconciliation marker cannot reopen failed replay', async f => { f.seed('failed', { budgetSettled: true, costReconciliation: { decision: 'not_charged' } }); await f.conflict(); }],
    ['late actual finisher preserves manual terminal fence', async f => { f.seed('reconciled', { budgetSettled: true, chargedUsd: 0 }); await f.finishImageOperation(f.key, 'completed', { success: true }); assert.equal(f.docs.get(f.opPath).status, 'reconciled'); assert.equal(f.stats.writes, 0); await f.conflict(); }],
    ...[['fresh pending', 'pending', new Date()], ['stale pending', 'pending', new Date(Date.now() - 301000)], ['prior-day pending', 'pending', new Date(Date.now() - 172800000)], ['missing timestamp pending', 'pending', undefined], ['uncertain', 'uncertain', new Date(0)]].map(([name, status, updatedAt]) => [name, async f => { f.seed(status, { updatedAt }); await f.conflict(); }]),
    ['new reservation', async f => { assert.equal((await f.reserve()).cached, null); assert.equal(f.stats.writes, 2); assert.equal(f.stats.providerAdmissions, 1); }],
    ['failed retry', async f => { f.seed('failed', { budgetSettled: true }); f.docs.set(f.budgetPath, { ...f.docs.get(f.budgetPath), reservedUsd: 0, spentUsd: 0 }); assert.equal((await f.reserve()).cached, null); assert.equal(f.docs.get(f.budgetPath).reservedUsd, 1); assert.equal(f.stats.writes, 2); }],
    ['failed different payload conflict', async f => { f.seed('failed'); await f.conflict({ ...f.payload, prompt: 'B' }); }],
    ['completed cold replay', async f => { f.seed('completed', { result: { success: true } }); assert.equal((await f.reserve()).cached.success, true); assert.equal(f.stats.writes, 0); }],
    ['completed cold mismatch', async f => { f.seed('completed', { result: { success: true } }); await f.conflict({ ...f.payload, prompt: 'B' }); }],
    ['completed warm mismatch after real finish', async f => { await f.reserve(); await f.finishImageOperation(f.key, 'completed', { success: true }); await f.conflict({ ...f.payload, prompt: 'B' }); }],
    ['completed warm replay after real finish', async f => { await f.reserve(); await f.finishImageOperation(f.key, 'completed', { success: true }); const writes = f.stats.writes; assert.equal((await f.reserve()).cached.success, true); assert.equal(f.stats.writes, writes); assert.equal(f.stats.providerAdmissions, 1); }],
    ['cache cannot bypass pending', async f => { f.seed('pending'); f.completedImageResults.set(f.key, { expiresAt: Date.now() + 60000, response: { success: true } }); await f.conflict(); }],
    ['completed missing result blocks', async f => { f.seed('completed'); await f.conflict(); }],
    ['chunk replay after real finish', async f => { await f.reserve(); const response = { image: 'a'.repeat(750000) }; await f.finishImageOperation(f.key, 'completed', response); f.completedImageResults.clear(); assert.equal((await f.reserve()).cached.image, response.image); assert.equal(f.stats.providerAdmissions, 1); }],
    ['storage replay after real finish', async f => { await f.reserve(); const response = { image: 'b'.repeat(8500000) }; await f.finishImageOperation(f.key, 'completed', response); f.completedImageResults.clear(); assert.equal((await f.reserve()).cached.image, response.image); assert.equal(f.stats.providerAdmissions, 1); }],
    ['failed settlement then retry', async f => { await f.reserve(); await f.finishImageOperation(f.key, 'failed'); assert.equal(f.docs.get(f.budgetPath).spentUsd, 0); assert.equal((await f.reserve()).cached, null); assert.equal(f.docs.get(f.budgetPath).reservedUsd, 1); }],
    ['uncertain settlement never retries', async f => { await f.reserve(); await f.finishImageOperation(f.key, 'uncertain'); assert.equal(f.docs.get(f.budgetPath).spentUsd, 1); await f.conflict(); }],
  ];
  for (const [name, test] of cases) {
    try { await test(fixture()); passed++; console.log(`PASS ${file}: ${name}`); }
    catch (error) { failures++; console.error(`FAIL ${file}: ${name}: ${error.message}`); }
  }
}
console.log(JSON.stringify({ passed, failures, mode: 'actual-source AST + memory DB/storage; provider admissions simulated; no network' }));
process.exitCode = failures ? 1 : 0;
