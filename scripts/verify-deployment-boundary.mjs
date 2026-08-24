import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const requireStaticExportRuntime = process.argv.includes('--require-static-export-runtime');

async function readText(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

function sourceToRoutePath(source) {
  const segments = source.replace(/^\/+/, '').split('/');
  return path.join(root, 'src', 'app', ...segments, 'route.ts');
}

function manifestRouteToGatewayPattern(route) {
  return route.replace(/\[([^\]]+)\]/g, ':$1');
}

function routePathToSource(routePath) {
  const relative = path.relative(path.join(root, 'src', 'app', 'api'), routePath);
  const route = relative.replace(/[/\\]route\.ts$/, '').split(path.sep).join('/');
  return `/api/${route}`;
}

async function collectFiles(dir, predicate) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath, predicate));
      continue;
    }

    if (entry.isFile() && predicate(fullPath)) {
      files.push(fullPath);
    }
  }

  return files;
}

function comparePathSegments(routePattern, apiCall) {
  const routeSegments = routePattern.split('/').filter(Boolean);
  const callSegments = apiCall.split('/').filter(Boolean);
  if (routeSegments.length !== callSegments.length) return false;

  return routeSegments.every((segment, index) => {
    const callSegment = callSegments[index];
    return segment.startsWith('[') || callSegment === '*' || segment === callSegment;
  });
}

function normalizeApiCall(raw) {
  const trimmed = raw.trim();
  // Only root-relative paths are guaranteed to be served by this app's Hosting
  // rewrites. A composed URL such as `${bridgeUrl}/api/pair` may target an
  // explicitly configured external runtime (for example, the local Codex
  // Observatory bridge) and must not be treated as a Firebase API call.
  if (!trimmed.startsWith('/api')) return null;

  const apiPath = trimmed
    .replace(/\$\{[^}]+\}/g, '*')
    .split(/[?#]/)[0]
    .replace(/\/+$/, '');

  return apiPath || null;
}

async function collectClientApiCalls() {
  const roots = ['src/app', 'src/components', 'src/services', 'src/hooks'].map((item) => path.join(root, item));
  const files = [];
  for (const dir of roots) {
    if (existsSync(dir)) {
      files.push(...await collectFiles(dir, (filePath) => /\.(ts|tsx)$/.test(filePath)));
    }
  }

  const calls = new Map();
  for (const filePath of files) {
    const source = await readFile(filePath, 'utf8');
    for (const match of source.matchAll(/fetch\(\s*(?:`([^`]+)`|'([^']+)'|"([^"]+)")/g)) {
      const raw = match[1] ?? match[2] ?? match[3] ?? '';
      const apiCall = normalizeApiCall(raw);
      if (!apiCall) continue;
      const relativeFile = path.relative(root, filePath);
      const locations = calls.get(apiCall) ?? [];
      locations.push(relativeFile);
      calls.set(apiCall, locations);
    }
  }

  return calls;
}

function parseNamedExportBlock(source) {
  const names = new Set();

  for (const match of source.matchAll(/export\s*\{([\s\S]*?)\};/g)) {
    const block = match[1] ?? '';
    for (const item of block.split(',')) {
      const cleaned = item.trim();
      if (!cleaned) continue;
      const aliasMatch = cleaned.match(/\bas\s+([A-Za-z_$][\w$]*)$/);
      const directMatch = cleaned.match(/^([A-Za-z_$][\w$]*)/);
      const name = aliasMatch?.[1] ?? directMatch?.[1];
      if (name) names.add(name);
    }
  }

  return names;
}

async function collectExportedFunctions() {
  const indexSource = await readText('functions/src/index.ts');
  const exported = parseNamedExportBlock(indexSource);

  for (const match of indexSource.matchAll(/export\s+\*\s+from\s+['"](.+?)['"]/g)) {
    const modulePath = match[1];
    if (!modulePath) continue;

    const sourcePath = path.join(root, 'functions', 'src', `${modulePath.replace(/^\.\//, '')}.ts`);
    assert.equal(existsSync(sourcePath), true, `Missing Functions barrel export source: ${modulePath}`);

    const moduleSource = await readFile(sourcePath, 'utf8');
    for (const exportMatch of moduleSource.matchAll(/export\s+(?:const|function)\s+([A-Za-z_$][\w$]*)/g)) {
      exported.add(exportMatch[1]);
    }
  }

  return exported;
}

const firebaseConfig = JSON.parse(await readText('firebase.json'));
const boundaryManifest = JSON.parse(await readText('docs/api-runtime-boundary.json'));
const classifiedRoutes = Object.keys(boundaryManifest.routes ?? {}).sort();
const classifiedClientOnlyCalls = Object.keys(boundaryManifest.clientOnlyCalls ?? {}).sort();
const hostingConfigs = Array.isArray(firebaseConfig.hosting)
  ? firebaseConfig.hosting
  : [firebaseConfig.hosting].filter(Boolean);
const rewrites = hostingConfigs.flatMap((hosting) => hosting.rewrites ?? []).filter((rewrite) => rewrite.function);
const wildcardRewrites = rewrites.filter((rewrite) => rewrite.source === '/api/**');

assert.ok(rewrites.length > 0, 'Firebase Hosting must declare at least one function rewrite.');
assert.ok(wildcardRewrites.length <= 1, 'Firebase Hosting may declare at most one /api/** gateway rewrite.');

const buildScript = await readText('scripts/build-static-export.mjs');
const staticDistMatch = buildScript.match(/const\s+staticDistDir\s*=\s*['"]([^'"]+)['"]/);
assert.ok(staticDistMatch, 'Static export build script must declare staticDistDir.');

for (const hosting of hostingConfigs) {
  assert.equal(
    hosting.public,
    staticDistMatch[1],
    `Firebase Hosting public directory must match build staticDistDir (${staticDistMatch[1]}).`,
  );
}

assert.match(
  buildScript,
  /disabledRouteSuffix\s*=\s*['"]\.static-export-disabled['"]/,
  'Static export build script must keep a reversible API route disable suffix.',
);
assert.match(
  buildScript,
  /collectRouteFiles\(apiDir\)/,
  'Static export build script must collect API route files before export.',
);

const exportedFunctions = await collectExportedFunctions();
const gatewaySource = await readText('functions/src/api/hostingApi.ts');
const gatewayRouteBlock = gatewaySource.match(
  /export\s+const\s+HOSTING_API_ROUTE_PATTERNS\s*=\s*\[([\s\S]*?)\]\s*as\s+const/,
);
assert.ok(gatewayRouteBlock, 'hostingApi must export a literal HOSTING_API_ROUTE_PATTERNS registry.');
const gatewayRoutePatterns = new Set(
  Array.from(gatewayRouteBlock[1].matchAll(/['"]([^'"]+)['"]/g), (match) => match[1]),
);
const appApiRoutes = (await collectFiles(path.join(root, 'src', 'app', 'api'), (filePath) => path.basename(filePath) === 'route.ts'))
  .map(routePathToSource)
  .sort();

assert.deepEqual(
  classifiedRoutes,
  appApiRoutes,
  'docs/api-runtime-boundary.json must classify every src/app/api route and avoid stale route entries.',
);

for (const rewrite of rewrites) {
  assert.equal(typeof rewrite.source, 'string', 'Hosting function rewrite source must be a string.');
  assert.equal(typeof rewrite.function, 'string', `Hosting rewrite ${rewrite.source} must target a named function.`);
  assert.match(rewrite.source, /^\/api\//, `Hosting rewrite ${rewrite.source} should stay under /api/.`);
  assert.equal(
    exportedFunctions.has(rewrite.function),
    true,
    `Hosting rewrite ${rewrite.source} targets missing Functions export ${rewrite.function}.`,
  );

  if (rewrite.source === '/api/**') {
    assert.equal(
      rewrite.function,
      'hostingApi',
      'The /api/** wildcard rewrite must target the explicit hostingApi gateway.',
    );
    continue;
  }

  assert.equal(
    existsSync(sourceToRoutePath(rewrite.source)),
    true,
    `Hosting rewrite ${rewrite.source} must have a matching Next API route contract file.`,
  );
  const routeBoundary = boundaryManifest.routes[rewrite.source];
  assert.equal(
    routeBoundary?.classification,
    'firebase-hosting-rewrite',
    `Hosting rewrite ${rewrite.source} must be classified as firebase-hosting-rewrite.`,
  );
  assert.equal(
    routeBoundary?.function,
    rewrite.function,
    `Hosting rewrite ${rewrite.source} function must match docs/api-runtime-boundary.json.`,
  );
}

for (const [route, boundary] of Object.entries(boundaryManifest.routes)) {
  if (boundary.classification !== 'firebase-hosting-rewrite') continue;

  const hasExactRewrite = rewrites.some(
    (rewrite) => rewrite.source === route && rewrite.function === boundary.function,
  );
  const hasGatewayRewrite =
    boundary.function === 'hostingApi' &&
    wildcardRewrites.some((rewrite) => rewrite.function === 'hostingApi') &&
    gatewayRoutePatterns.has(manifestRouteToGatewayPattern(route));

  assert.equal(
    hasExactRewrite || hasGatewayRewrite,
    true,
    `Route ${route} is classified as firebase-hosting-rewrite but is missing an exact rewrite or explicit hostingApi gateway handler.`,
  );
}

for (const gatewayPattern of gatewayRoutePatterns) {
  const matchingManifestRoute = Object.entries(boundaryManifest.routes).find(
    ([route, boundary]) =>
      boundary.classification === 'firebase-hosting-rewrite' &&
      boundary.function === 'hostingApi' &&
      manifestRouteToGatewayPattern(route) === gatewayPattern,
  );
  assert.ok(
    matchingManifestRoute,
    `hostingApi registry pattern ${gatewayPattern} is missing a matching firebase-hosting-rewrite manifest route.`,
  );
}

for (const hosting of hostingConfigs) {
  const wildcardIndex = (hosting.rewrites ?? []).findIndex((rewrite) => rewrite.source === '/api/**');
  if (wildcardIndex >= 0) {
    assert.equal(
      wildcardIndex,
      hosting.rewrites.length - 1,
      'The /api/** gateway rewrite must be last so exact function rewrites keep priority.',
    );
  }
}

const clientApiCalls = await collectClientApiCalls();
const knownApiPatterns = [...classifiedRoutes, ...classifiedClientOnlyCalls];

const findMatchingPattern = (patterns, apiCall) =>
  patterns.find((pattern) => comparePathSegments(pattern, apiCall)) ?? null;

const unresolvedStaticClientCalls = [];

for (const [apiCall, locations] of clientApiCalls) {
  const routePattern = findMatchingPattern(classifiedRoutes, apiCall);
  const routeBoundary = routePattern ? boundaryManifest.routes[routePattern] : null;
  const clientOnlyBoundary = routePattern ? null : boundaryManifest.clientOnlyCalls[findMatchingPattern(classifiedClientOnlyCalls, apiCall) ?? ''];

  assert.equal(
    knownApiPatterns.some((pattern) => comparePathSegments(pattern, apiCall)),
    true,
    `Client API call ${apiCall} is not classified in docs/api-runtime-boundary.json. Found in: ${locations.join(', ')}`,
  );

  if (routeBoundary?.classification !== 'firebase-hosting-rewrite') {
    unresolvedStaticClientCalls.push({
      apiCall,
      locations,
      classification: routeBoundary?.classification ?? clientOnlyBoundary?.classification ?? 'unclassified',
    });
  }
}

if (requireStaticExportRuntime && unresolvedStaticClientCalls.length > 0) {
  const details = unresolvedStaticClientCalls
    .map(({ apiCall, classification, locations }) => `- ${apiCall} (${classification}): ${locations.join(', ')}`)
    .join('\n');

  assert.fail(
    `Static export would ship client calls without a Firebase Hosting runtime. Port them to a Function/callable API, hide the feature for static hosting, or use a Next runtime:\n${details}`,
  );
}

console.log(
  `Deployment boundary verification passed (${rewrites.length} function rewrites, ${appApiRoutes.length} API routes, ${clientApiCalls.size} client API calls checked)`,
);
