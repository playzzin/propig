// Fault-injection tests: real wrapper, explicitly FAKE Next and boundary gate.
// No real build, install, server, network, or repository output mutation.
import assert from 'node:assert/strict';
import {
  copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const root = process.cwd();
const base = mkdtempSync(path.join(tmpdir(), 'propig-export-recovery-'));
let count = 0;
const write = (dir, name, text) => {
  mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
  writeFileSync(path.join(dir, name), text);
};
const text = (dir, name) => readFileSync(path.join(dir, name), 'utf8');
const common = `
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = process.env.PROPIG_FIXTURE_ROOT;
const put = (name, text) => { fs.mkdirSync(path.dirname(name), {recursive:true}); fs.writeFileSync(name,text); };
assert.notEqual(process.cwd(),root);
assert.equal(process.env.CI,'true');
assert.equal(process.env.NEXT_EXPORT,'true');
assert.equal(process.env.NEXT_STATIC_EXPORT,'true');
assert.equal(process.env.NEXT_DIST_DIR,'.next-static-export');
assert.ok(!fs.existsSync('src/app/api'));
assert.ok(!fs.existsSync('src/api'));
assert.equal(fs.readFileSync(path.join(root,'src/app/api/a/route.ts'),'utf8'),'original-a');
assert.equal(fs.readFileSync('src/app/page.tsx','utf8'),'dirty-page');
for (const name of ['.env','.env.local','.env.production','.env.production.local']) assert.ok(fs.existsSync(name));
for (const name of ['.env.development','.env.example','personal.txt','.git','functions','old-build']) assert.ok(!fs.existsSync(name));
`;
const success = `put('.next-static-export/export/index.html','new-index');
put('.next-static-export/export/nested/__next.foo/bar.txt','rsc-payload');`;
function setup(name, body = success) {
  const dir = path.join(base, name);
  mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  copyFileSync(path.join(root, 'scripts/build-static-export.mjs'), path.join(dir, 'scripts/build-static-export.mjs'));
  write(dir, 'scripts/verify-deployment-boundary.mjs', `
    import assert from 'node:assert/strict'; import {appendFileSync} from 'node:fs';
    assert.equal(process.cwd(),process.env.PROPIG_FIXTURE_ROOT);
    assert.ok(process.argv.includes('--require-static-export-runtime'));
    appendFileSync('gate-calls','gate\\n');
  `);
  for (const name of ['a', 'z']) write(dir, `src/app/api/${name}/route.ts`, `original-${name}`);
  write(dir, 'src/api/private.ts', 'server-only');
  write(dir, 'src/app/page.tsx', 'dirty-page');
  for (const name of ['next.config.ts', 'tsconfig.json', 'tsconfig.typecheck.json', 'tsconfig.static-export.json', 'next-env.d.ts', 'postcss.config.mjs', 'package.json', 'package-lock.json', 'types/custom.d.ts', 'public/asset.txt']) write(dir, name, 'original-config');
  write(dir, 'package.json', JSON.stringify({ private: true }));
  // Synthetic env contents only. Never read or print the real repository env.
  for (const name of ['.env', '.env.local', '.env.production', '.env.production.local', '.env.development', '.env.example']) write(dir, name, 'FIXTURE_ONLY=synthetic-never-print');
  write(dir, 'personal.txt', 'user-personal');
  write(dir, '.git/private', 'user-git');
  write(dir, 'functions/private', 'user-functions');
  write(dir, 'old-build/private', 'old');
  write(dir, 'out/user.txt', 'user-out');
  write(dir, '.next-static-export/index.html', 'last-good');
  write(dir, 'node_modules/next/dist/bin/next', common + body);
  write(dir, 'node_modules/user-install-sentinel', 'installed');
  return dir;
}
function options(dir, extra = {}) {
  return { cwd: dir, encoding: 'utf8', timeout: 30000, env: { ...process.env, PROPIG_FIXTURE_ROOT: dir, ...extra } };
}
function run(dir, extra) {
  return spawnSync(process.execPath, ['scripts/build-static-export.mjs'], options(dir, extra));
}
function unchanged(dir) {
  assert.equal(text(dir, 'src/app/api/a/route.ts'), 'original-a');
  assert.equal(text(dir, 'src/app/api/z/route.ts'), 'original-z');
  assert.equal(text(dir, 'src/api/private.ts'), 'server-only');
  assert.equal(text(dir, 'src/app/page.tsx'), 'dirty-page');
  assert.equal(text(dir, 'next-env.d.ts'), 'original-config');
  assert.equal(text(dir, 'tsconfig.json'), 'original-config');
  assert.equal(text(dir, '.env.local'), 'FIXTURE_ONLY=synthetic-never-print');
  assert.equal(text(dir, 'personal.txt'), 'user-personal');
  assert.equal(text(dir, 'out/user.txt'), 'user-out');
  assert.equal(text(dir, 'node_modules/user-install-sentinel'), 'installed');
}
function oldOutput(dir) { assert.equal(text(dir, '.next-static-export/index.html'), 'last-good'); }
function clean(dir) {
  assert.ok(!existsSync(path.join(dir, '.static-export.lock')));
  assert.equal(readdirSync(base).filter((name) => name.startsWith('.propig-static-export-')).length, 0);
}
function checked(name, fn) { fn(); count++; console.log(`PASS fixture: ${name}`); }
function injector(dir, mode) {
  // Patch Node's actual rename primitive in the isolated wrapper process. No
  // fault-injection switches are present in the production wrapper itself.
  write(dir, 'fault.cjs', `
    const fs = require('node:fs'), path = require('node:path');
    const rename = fs.renameSync;
    const output = path.join(process.env.PROPIG_FIXTURE_ROOT,'.next-static-export');
    fs.renameSync = (from,to) => {
      if(to === output && ['.next-static-export','export','out'].includes(path.basename(from))) {
        ${mode === 'kill' ? "process.kill(process.pid,'SIGKILL');" : ''}
        ${mode === 'collision' ? "fs.mkdirSync(output); fs.writeFileSync(path.join(output,'user.txt'),'new-user-output');" : ''}
        throw new Error('FIXTURE publish rename failed');
      }
      ${mode === 'restore-failure' ? "if(to === output && path.basename(from) === 'previous-output') throw new Error('FIXTURE restore rename failed');" : ''}
      return rename(from,to);
    };
    require('node:module').syncBuiltinESMExports();
  `);
  return { NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require ${JSON.stringify(path.join(dir, 'fault.cjs'))}` };
}

try {
  checked('nested export, dirty snapshot, config/env isolation, root gates, cleanup', () => {
    const dir = setup('success', success + `
      put('next-env.d.ts','generated'); put('tsconfig.json','generated');
      put('src/app/page.tsx','staging-only');
      put(path.join(root,'user-created-during-build.txt'),'new-user-file');
      put('.env.local','staging-env-only');
      put('.next-static-export/server/private.js','compiler-not-public');
    `);
    const result = run(dir);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(text(dir, '.next-static-export/nested/__next.foo.bar.txt'), 'rsc-payload');
    assert.equal(text(dir, '.next-static-export/index.html'), 'new-index');
    assert.equal(text(dir, 'user-created-during-build.txt'), 'new-user-file');
    assert.ok(!existsSync(path.join(dir,'.next-static-export/server/private.js')));
    assert.ok(!existsSync(path.join(dir,'.next-static-export/export')));
    assert.equal(text(dir, 'gate-calls'), 'gate\ngate\n');
    assert.ok(!result.stdout.includes('synthetic-never-print'));
    unchanged(dir); clean(dir);
  });
  checked('Next custom distDir public root is preserved without extra nesting', () => {
    const dir = setup('direct-layout', `put('.next-static-export/index.html','direct-index');`);
    const result=run(dir);assert.equal(result.status,0,result.stderr);assert.equal(text(dir,'.next-static-export/index.html'),'direct-index');unchanged(dir);clean(dir);
  });
  checked('Next out layout normalized without touching original out', () => {
    const dir = setup('out-layout', `put('out/index.html','out-index');`);
    const result = run(dir); assert.equal(result.status, 0, result.stderr);
    assert.equal(text(dir, '.next-static-export/index.html'), 'out-index');
    unchanged(dir); clean(dir);
  });
  checked('partial build failure leaves last-good and source untouched', () => {
    const dir = setup('failed', `put('.next-static-export/partial','partial'); process.exit(7);`);
    assert.equal(run(dir).status, 7);
    oldOutput(dir); unchanged(dir); clean(dir);
    assert.ok(!existsSync(path.join(dir, '.next-static-export/partial')));
  });
  checked('successful exit without artifact cannot publish', () => {
    const dir = setup('missing-artifact', ''); assert.equal(run(dir).status, 1);
    oldOutput(dir); unchanged(dir); clean(dir);
  });
  checked('nested export rejects concurrent wrapper at original root', () => {
    const dir = setup('overlap', `
      const result = require('node:child_process').spawnSync(process.execPath,[path.join(root,'scripts/build-static-export.mjs')],{cwd:root,encoding:'utf8'});
      assert.equal(result.status,1); assert.match(result.stderr,/lock exists/);
    ` + success);
    const result = run(dir); assert.equal(result.status, 0, result.stderr); unchanged(dir); clean(dir);
  });
  checked('legacy disabled source fails closed without restoring or deleting', () => {
    const dir = setup('legacy');
    write(dir, 'src/app/api/a/route.ts.static-export-disabled', 'legacy-backup');
    const result = run(dir); assert.equal(result.status, 1); assert.match(result.stderr, /restore it manually/);
    assert.equal(text(dir, 'src/app/api/a/route.ts.static-export-disabled'), 'legacy-backup');
    oldOutput(dir); unchanged(dir); clean(dir);
  });
  checked('stale lock retained without touching any source or output', () => {
    const dir = setup('stale'); write(dir, '.static-export.lock', 'user-lock');
    assert.equal(run(dir).status, 1); assert.equal(text(dir, '.static-export.lock'), 'user-lock');
    oldOutput(dir); unchanged(dir);
  });
  checked('boundary failure before build and after build preserves output', () => {
    for (const phase of ['before', 'after']) {
      const dir = setup('boundary-' + phase, success + (phase === 'after' ? `put(path.join(root,'deny'),'deny');` : ''));
      write(dir, 'scripts/verify-deployment-boundary.mjs', `import {existsSync} from 'node:fs'; process.exit(${phase === 'before' ? '3' : "existsSync('deny') ? 3 : 0"});`);
      assert.equal(run(dir).status, 1); oldOutput(dir); unchanged(dir); clean(dir);
    }
  });
  checked('source link escape and public private file fail closed', () => {
    const dir = setup('link'); const privateDir = path.join(base, 'outside-private');
    write(privateDir, 'personal.txt', 'private-not-for-export');
    symlinkSync(privateDir, path.join(dir, 'public', 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    const result = run(dir); assert.equal(result.status, 1); assert.match(result.stderr, /link or special file/);
    assert.equal(text(privateDir, 'personal.txt'), 'private-not-for-export'); oldOutput(dir); clean(dir);
    const dir2 = setup('private-file'); write(dir2, 'public/private.key', 'synthetic-private-key');
    assert.equal(run(dir2).status, 1); oldOutput(dir2); clean(dir2);
  });
  checked('partial publish failure restores previous output', () => {
    const dir = setup('publish-failure'); const result = run(dir, injector(dir, 'failure'));
    assert.equal(result.status, 1); assert.match(result.stderr, /FIXTURE publish/);
    oldOutput(dir); unchanged(dir); clean(dir);
  });
  checked('user edits during failed build are never restored over', () => {
    const dir = setup('user-edits', `
      put(path.join(root,'src/app/api/z/route.ts'),'user-edited-route');
      put(path.join(root,'next-env.d.ts'),'user-edited-types');
      put('src/app/api/z/route.ts','staging-only-route'); process.exit(8);
    `);
    assert.equal(run(dir).status, 8); oldOutput(dir); clean(dir);
    assert.equal(text(dir, 'src/app/api/z/route.ts'), 'user-edited-route');
    assert.equal(text(dir, 'next-env.d.ts'), 'user-edited-types');
    assert.ok(!existsSync(path.join(dir, 'src/app/api/z/route.ts.static-export-disabled')));
  });
  checked('private generated artifact and directory-shaped env cannot publish', () => {
    const dir = setup('private-artifact', success + `put('.next-static-export/export/.env.local','fixture-only');`);
    assert.equal(run(dir).status, 1); oldOutput(dir); clean(dir);
    const dir2 = setup('env-directory'); rmSync(path.join(dir2, '.env.local'));
    write(dir2, '.env.local/private.txt', 'fixture-only');
    assert.equal(run(dir2).status, 1); oldOutput(dir2); clean(dir2);
  });
  checked('kill in portable two-rename gap retains recoverable last-good backup', () => {
    const dir = setup('publish-kill'); const result = run(dir, injector(dir, 'kill'));
    assert.notEqual(result.status, 0);
    const { stage, backup } = text(dir, '.static-export.lock').trim().split('\n').map(JSON.parse).at(-1);
    assert.equal(text(backup, 'index.html'), 'last-good');
    // Explicitly document the portable limitation: the canonical path is absent
    // in this gap, not crash-atomically available. Lock prevents unsafe retries.
    assert.ok(!existsSync(path.join(dir, '.next-static-export')));
    assert.equal(run(dir).status, 1); unchanged(dir);
    rmSync(stage, { recursive: true, force: true });
  });
  checked('publish collision / restore failure preserve all user data and recovery journal', () => {
    for (const mode of ['collision', 'restore-failure']) {
      const dir = setup(mode); const result = run(dir, injector(dir, mode));
      assert.equal(result.status, 1, result.stderr);
      const records = text(dir, '.static-export.lock').trim().split('\n').map(JSON.parse);
      const { stage, backup } = records.at(-1);
      assert.equal(text(backup, 'index.html'), 'last-good');
      if (mode === 'collision') assert.equal(text(dir, '.next-static-export/user.txt'), 'new-user-output');
      unchanged(dir);
      // Test-owned fixture only; production intentionally never auto-recovers.
      rmSync(stage, { recursive: true, force: true });
    }
  });
  // Kill while fake Next is active. A killed wrapper cannot finally-clean;
  // verify old output/source and journal, then explicitly reap the fake child.
  {
    const dir = setup('killed', `
      put(path.join(root,'fake-next-ready.json'),JSON.stringify({pid:process.pid,cwd:process.cwd()}));
      setInterval(()=>{},1000);
    `);
    const child = spawn(process.execPath, ['scripts/build-static-export.mjs'], { ...options(dir), stdio: 'ignore' });
    const exited = new Promise((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); });
    let fake;
    try {
      const deadline = Date.now() + 15000;
      while (!existsSync(path.join(dir, 'fake-next-ready.json'))) {
        assert.ok(Date.now() < deadline, 'fake Next readiness timeout');
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      fake = JSON.parse(text(dir, 'fake-next-ready.json'));
      child.kill('SIGKILL'); await exited;
      oldOutput(dir); unchanged(dir);
      assert.ok(existsSync(path.join(dir, '.static-export.lock')));
      assert.equal(run(dir).status, 1);
      assert.ok(existsSync(fake.cwd));
      count++; console.log('PASS fixture: forced build termination preserves original output/source and fails closed');
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      if (fake) { try { process.kill(fake.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
    }
  }
  console.log(`PASS export recovery: ${count} isolated FAKE-Next fixture groups (${process.platform}); no real build executed.`);
} finally {
  rmSync(base, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
