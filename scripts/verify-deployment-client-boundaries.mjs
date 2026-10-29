// Run the real gate against synthetic projects. No production API or app data.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const fixture = mkdtempSync(path.join(tmpdir(), 'propig-client-boundary-'));
const write = (name, text) => {
  const target = path.join(fixture, name);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, text);
};
const standalone = {
  directory: 'src/components/admin/office',
  entryPoint: 'src/components/admin/office/main.tsx',
  buildScript: 'scripts/office/build.mjs',
};
const manifest = { routes: { '/api/health': { classification: 'firebase-hosting-rewrite', function: 'health' } } };
const putManifest = definitions => write('docs/api-runtime-boundary.json', JSON.stringify({ ...manifest, ...(definitions ? { standaloneClients: definitions } : {}) }));
let cases = 0;
function check(name, pattern) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/verify-deployment-boundary.mjs'), '--require-static-export-runtime'], { cwd: fixture, encoding: 'utf8', timeout: 30000 });
  if (result.error) throw result.error;
  const output = result.stdout + result.stderr;
  if (pattern) { assert.notEqual(result.status, 0, name); assert.match(output, pattern, name); }
  else assert.equal(result.status, 0, output);
  assert.doesNotMatch(output, /TypeError: Cannot read properties/, name);
  console.log(`PASS ${name}`);
  cases++;
}

try {
  write('firebase.json', JSON.stringify({ hosting: { public: '.next-static-export', rewrites: [{ source: '/api/health', function: 'health' }] } }));
  write('scripts/build-static-export.mjs', readFileSync(path.join(root, 'scripts/build-static-export.mjs'), 'utf8'));
  write('functions/src/index.ts', 'const health = {}; export { health };');
  write('functions/src/api/hostingApi.ts', 'export const HOSTING_API_ROUTE_PATTERNS = [] as const;');
  write('src/app/api/health/route.ts', 'export function GET() {}');
  write('src/app/page.tsx', "fetch('/api/health');");
  write('tsconfig.json', JSON.stringify({ compilerOptions: { moduleResolution: 'bundler', baseUrl: '.', paths: { '@/*': ['src/*'], 'office-entry': ['src/components/admin/office/main.tsx'] } } }));
  putManifest();
  check('optional clientOnlyCalls omitted with a known website API');
  write('src/app/page.tsx', "fetch('/api/history');");
  check('unregistered website API retains a clear blocking error', /Client API call \/api\/history is not classified/);

  write('src/app/page.tsx', "fetch('/api/health');");
  putManifest([standalone]);
  check('a wholly absent independent app excludes no website source');
  write('src/app/page.tsx', "fetch('/api/history');");
  check('an absent independent app cannot allow unknown website APIs', /Client API call \/api\/history is not classified/);
  write('src/app/page.tsx', "fetch('/api/health');");
  write(standalone.buildScript, `build({entryPoints: [${JSON.stringify(standalone.entryPoint)}]});`);
  check('an orphan independent build cannot bypass entry validation', /entry point must exist inside/);
  write(standalone.entryPoint, "import './AuditLog'; export const office = true;");
  write('src/components/admin/office/AuditLog.tsx', "fetch('/api/history');");
  write(standalone.buildScript, `build({entryPoints: [${JSON.stringify(standalone.entryPoint)}]});`);
  putManifest([standalone]);
  check('separate app with an explicit entry and no website imports');

  const imports = [
    ['relative import', "import '../components/admin/office/main';"],
    ['alias import', "import '@/components/admin/office/main';"],
    ['configured alias', "import 'office-entry';"],
    ['re-export', "export * from '@/components/admin/office/main';"],
    ['dynamic import', "import('@/components/admin/office/main');"],
    ['require', "require('@/components/admin/office/main');"],
    ['import type', "type Office = typeof import('@/components/admin/office/main');"],
  ];
  for (const [name, source] of imports) {
    write('src/app/page.tsx', source);
    check(`website cannot include standalone code via ${name}`, /Standalone client imported by website source/);
  }
  write('src/app/page.tsx', "const target = '@/components/admin/office/main'; import(target);");
  check('computed import cannot silently bypass standalone isolation', /Cannot prove standalone separation/);
  write('src/app/page.tsx', "fetch('/api/health');");
  write('src/lib/shared.js', "export * from '@/components/admin/office/main';");
  check('a shared JavaScript intermediary cannot include standalone code', /Standalone client imported by website source/);
  write('src/lib/shared.js', 'export const shared = true;');
  write('src/app/page.tsx', "fetch('/api/history');");
  check('same API in the website is still blocked despite standalone use', /Client API call \/api\/history is not classified/);
  write('src/app/page.tsx', "fetch('/api/health');");
  putManifest([{ ...standalone, directory: 'src/app' }]);
  check('website route directories cannot be excluded', /dedicated component directory/);
  putManifest([{ ...standalone, entryPoint: 'src/app/page.tsx' }]);
  check('standalone entry cannot escape its directory', /entry point must exist inside/);
  putManifest([{ ...standalone, entryPoint: 'src/components/admin/office/missing.tsx' }]);
  check('missing entry cannot hide API callers', /entry point must exist inside/);
  putManifest([standalone]);
  write(standalone.buildScript, 'build({entryPoints: []});');
  check('build must register the independent entry', /must explicitly register/);
  console.log(`Deployment client boundary fixtures passed (${cases} cases).`);
} finally {
  assert.equal(path.dirname(fixture), path.resolve(tmpdir()));
  assert.ok(path.basename(fixture).startsWith('propig-client-boundary-'));
  rmSync(fixture, { recursive: true, force: true });
}
