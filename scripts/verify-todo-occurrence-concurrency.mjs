import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

// Run from repository root. No Firebase connection: execute actual transpiled
// service with only the Firestore transport/config replaced by an in-memory fixture.
const root = path.resolve(process.argv[2] || process.cwd());
const runtime = process.env.PROPIG_TEST_RUNTIME || root;
const require = createRequire(path.join(runtime, 'package.json'));
const ts = require('typescript');
const source = fs.readFileSync(path.join(root, 'src/services/todoListService.ts'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'src/components/todo-list/TodoListApp.tsx'), 'utf8');
const timestamp = { kind: 'serverTimestamp' };
const pending = [];
const documents = new Map();
const ref = (...parts) => ({ path: parts.slice(1).join('/'), withConverter() { return this; } });
const firestore = {
  doc: ref,
  arrayUnion: (...values) => ({ kind: 'union', values }),
  arrayRemove: (...values) => ({ kind: 'remove', values }),
  serverTimestamp: () => timestamp,
  updateDoc: (reference, patch) => new Promise((resolve, reject) => pending.push({ reference, patch, resolve, reject })),
};
const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const exports = {};
vm.runInNewContext(output, {
  exports,
  require: (id) => {
    if (id === 'firebase/firestore') return firestore;
    if (id === '@/firebase/config') return { db: {} };
    if (id === 'zod') return require('zod');
    throw new Error(`Unexpected import: ${id}`);
  },
});
const service = exports.todoListService;
const documentPath = 'users/fixture-user/todoListTasks/task';
const reset = (dates = []) => documents.set(documentPath, { completedDates: [...dates], title: 'untouched', updatedAt: 'old' });
const dates = () => Array.from(documents.get(documentPath).completedDates).sort();
function flush(reverse = false, failure = false) {
  const writes = pending.splice(0);
  if (reverse) writes.reverse();
  for (const write of writes) {
    assert.equal(write.reference.path, documentPath, 'UID-scoped task document');
    if (failure) { write.reject(new Error('permission-denied')); continue; }
    assert.equal(write.patch.updatedAt, timestamp, 'server update timestamp preserved');
    assert.deepEqual(Object.keys(write.patch).sort(), ['completedDates', 'updatedAt']);
    const record = documents.get(documentPath);
    const transform = write.patch.completedDates;
    if (Array.isArray(transform)) record.completedDates = [...transform];
    else if (transform.kind === 'union') record.completedDates = [...new Set([...record.completedDates, ...transform.values])];
    else if (transform.kind === 'remove') record.completedDates = record.completedDates.filter((key) => !transform.values.includes(key));
    else assert.fail('Unexpected completion transform');
    record.updatedAt = write.patch.updatedAt;
    assert.equal(record.title, 'untouched');
    write.resolve();
  }
}
const set = (key, completed) => service.setOccurrenceCompleted('fixture-user', 'task', key, completed);
const a = '2026-09-08', b = '2026-09-09', c = '2026-09-10';
let checks = 0;
// Negative control: actual old service demonstrates stale-array lost update.
reset();
let results = [service.setCompletedDates('fixture-user', 'task', [a]), service.setCompletedDates('fixture-user', 'task', [b])];
flush(); await Promise.all(results);
assert.deepEqual(dates(), [b]); checks++;
for (const reverse of [false, true]) {
  reset([c]); results = [set(a, true), set(b, true)];
  flush(reverse); await Promise.all(results);
  assert.deepEqual(dates(), [a, b, c]); checks++;
  reset([a, b, c]); results = [set(a, false), set(b, false)];
  flush(reverse); await Promise.all(results);
  assert.deepEqual(dates(), [c]); checks++;
  reset([a, c]); results = [set(a, false), set(b, true)];
  flush(reverse); await Promise.all(results);
  assert.deepEqual(dates(), [b, c]); checks++;
}
// Non-recurring once and unscheduled completion keys retain their contract.
for (const key of [a, exports.TODO_ANYTIME_COMPLETION_KEY]) {
  reset(); results = [set(key, true), set(key, true)];
  flush(); await Promise.all(results); assert.deepEqual(dates(), [key]); checks++;
  results = [set(key, false), set(key, false)];
  flush(); await Promise.all(results); assert.deepEqual(dates(), []); checks++;
}
await assert.rejects(set('bad-key', true), /올바른 완료 날짜/);
assert.equal(pending.length, 0); checks++;
reset([c]); const denied = set(a, true);
const rejected = assert.rejects(denied, /permission-denied/);
flush(false, true); await rejected; assert.deepEqual(dates(), [c]); checks++;
// Execute the actual UI toggle callback: signed-in, guest, missing task, errors.
const callback = ui.match(/const toggleOccurrence = async \(taskId: string, dateKey: string\) => \{[\s\S]*?\n  \};/);
assert.ok(callback);
assert.ok(!callback[0].includes('setCompletedDates'));
assert.match(ui, /todoListService\.subscribeTasks/);
const uiJs = ts.transpileModule(`${callback[0]}\nglobalThis.toggle = toggleOccurrence;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const context = { currentUser: { uid: 'fixture-user' }, tasks: [{ id: 'task', completedDates: [c] }], todoListService: service, toast: { error: () => { context.errors++; } }, errors: 0 };
vm.createContext(context); vm.runInContext(uiJs, context);
reset([c]); results = [context.toggle('task', a), context.toggle('task', b)];
flush(); await Promise.all(results); assert.deepEqual(dates(), [a, b, c]); checks++;
context.currentUser = null; await context.toggle('task', a); assert.equal(pending.length, 0); checks++;
context.currentUser = { uid: 'fixture-user' }; await context.toggle('missing', a); assert.equal(pending.length, 0); checks++;
const uiFailure = context.toggle('task', a); flush(false, true); await uiFailure;
assert.equal(context.errors, 1); checks++;
const dashboard = fs.readFileSync(path.join(root, 'src/components/propig/PropigDashboard.tsx'), 'utf8');
assert.ok(!dashboard.includes('todoListService.setCompletedDates('));
const dashboardCallback = dashboard.match(/const toggleTask = useCallback\(\s*(async \(task: TodoTask, completionKey: string\) => \{[\s\S]*?\n    \}),/);
assert.ok(dashboardCallback);
const dashboardContext = { uid: 'fixture-user', ownerUid: 'fixture-user', state: 'ready', auth: { currentUser: { uid: 'fixture-user' } }, todoListService: service };
vm.createContext(dashboardContext);
vm.runInContext(ts.transpileModule(`globalThis.toggle = ${dashboardCallback[1]};`, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText, dashboardContext);
for (const reverse of [false, true]) {
  reset([c]);
  results = [dashboardContext.toggle({id:'task', completedDates:[c]}, a), dashboardContext.toggle({id:'task', completedDates:[c]}, b)];
  flush(reverse); await Promise.all(results); assert.deepEqual(dates(), [a,b,c]); checks++;
  reset([a,b,c]);
  results = [dashboardContext.toggle({id:'task', completedDates:[a,b,c]}, a), dashboardContext.toggle({id:'task', completedDates:[a,b,c]}, b)];
  flush(reverse); await Promise.all(results); assert.deepEqual(dates(), [c]); checks++;
}
dashboardContext.uid = null;
await dashboardContext.toggle({id:'task', completedDates:[]}, a);
assert.equal(pending.length,0); checks++;
console.log(`PASS: ${checks} checks; dashboard and full todo UI; old-service lost-update reproduced; atomic add/remove/mixed both orders, once/anytime/idempotence, UID path, serverTimestamp, auth guard and failure handling.`);
console.log('Fixture only: no live Firestore, browser, network, paid calls, or full build.');
