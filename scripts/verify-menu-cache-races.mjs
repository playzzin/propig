import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = fs.readFileSync('src/services/menuService.ts', 'utf8');
const methods = ['readLocalStorage', 'persistLocal', 'loadAllSitesUncached', 'loadRemoteSitesWithTimeout'];
const blocks = methods.map(name => {
  const start = source.indexOf(`  private ${name}(`) >= 0 ? source.indexOf(`  private ${name}(`) : source.indexOf(`  private async ${name}(`);
  assert.ok(start >= 0, name);
  const end = source.indexOf('\n  }', start) + 4;
  return source.slice(start, end);
});
const js = ts.transpileModule(`class Subject { ${blocks.join('\n')} } globalThis.Subject = Subject;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const context = vm.createContext({ setTimeout, clearTimeout, console, window: { get localStorage() { throw Error('storage blocked'); } } });
vm.runInContext(js, context);
const make = () => Object.assign(new context.Subject(), {
  REMOTE_LOAD_TIMEOUT_MS: 1, liveSnapshotRevision: 0,
  serializeSites: d => JSON.parse(JSON.stringify(d)),
  persistLocal: () => {}, rememberSites(d) { this.allSitesCache = d; return d; },
  notifyAllSubscribers: () => {},
});
const storage = new context.Subject();
assert.equal(storage.readLocalStorage('test'), null);
assert.doesNotThrow(() => storage.persistLocal({}));
const bootstrap = make();
bootstrap.loadRemoteSitesWithTimeout = async () => { bootstrap.allSitesCache = { fresh: true }; return { stale: true }; };
assert.equal((await bootstrap.loadAllSitesUncached()).fresh, true);
for (const snapshotArrives of [false, true]) {
  const subject = make();
  let resolve;
  subject.loadRemoteSites = () => new Promise(r => { resolve = r; });
  assert.equal(await subject.loadRemoteSitesWithTimeout(), null);
  subject.allSitesCache = { localFallback: true };
  if (snapshotArrives) { subject.liveSnapshotRevision++; subject.allSitesCache = { fresh: true }; }
  resolve({ lateRemote: true });
  await new Promise(r => setTimeout(r, 5));
  assert.equal(snapshotArrives ? subject.allSitesCache.fresh : subject.allSitesCache.lateRemote, true);
}
console.log('PASS menu cache: blocked storage, snapshot/bootstrap race, late remote refresh, stale remote rejection');
