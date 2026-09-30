import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const callable = await read('functions/src/api/generateImage.ts');
const hosting = await read('functions/src/api/hostingGenerationRoutes.ts');
const next = await read('src/app/api/generate-image/route.ts');
const adminAuth = await read('src/lib/server/admin-auth.ts');
const client = await read('src/services/imageGenerationService.ts');
const cleanup = await read('functions/src/triggers/cleanupAiOperationResults.ts');
const functionsIndex = await read('functions/src/index.ts');

assert.match(callable, /if \(!request\.auth\)/, 'Retired callable must still require Firebase Authentication.');
assert.match(callable, /enforceAppCheck:\s*true/, 'Retired callable must fail closed when App Check is absent.');
assert.match(callable, /Retired callable surface[\s\S]*throw new HttpsError\([\s\S]*'failed-precondition'/, 'The unused callable surface must fail closed before provider access.');
assert.doesNotMatch(callable, /openrouter|recordOpenRouterUsage|openRouterApiKey/i, 'Retired callable must not retain a paid provider execution path.');

assert.match(hosting, /requireAccess\(req, 'photoManagement'\)/, 'The primary Hosting image route must enforce the same entitlement.');
assert.match(hosting, /namespace:\s*'generate-image-minute'[\s\S]*maxRequests:\s*12/, 'The primary Hosting image route must share the callable minute quota.');
assert.match(hosting, /namespace:\s*'generate-image-day'[\s\S]*maxRequests:\s*48/, 'The primary Hosting image route must share the callable daily quota.');
assert.match(hosting, /enforceSharedImageRateLimit[\s\S]*collection\('serverRateLimits'\)/, 'The Hosting image route must share the Next rate-limit collection.');
for (const [name, source] of [['Next', next], ['Hosting', hosting]]) {
  assert.match(source, /operationId:\s*z\.string\(\)\.uuid\(\)/, `${name} image requests must require an operationId.`);
  assert.match(source, /prompt:\s*z\.string\(\)\.trim\(\)\.min\(1\)\.max\(4000\)/, `${name} prompts must be capped.`);
  assert.match(source, /negativePrompt:\s*z\.string\(\)\.max\(1500\)/, `${name} negative prompts must be capped.`);
  assert.match(source, /stylePreset:\s*z\.string\(\)\.max\(100\)/, `${name} style presets must be capped.`);
  assert.match(source, /collection\('aiOperationReservations'\)/, `${name} image route must use the shared operation reservation collection.`);
  assert.match(source, /image-generation:\$\{operationId\}/, `${name} image route must use the shared operation key namespace.`);
  assert.match(source, /requestFingerprint/, `${name} image route must bind operationId to request content.`);
  assert.match(source, /resultChunks/, `${name} image route must durably chunk large completed results.`);
  assert.match(source, /IMAGE_DURABLE_CHUNKED_MAX_BYTES/, `${name} image route must bound chunked result storage.`);
  assert.match(source, /IMAGE_DURABLE_STORAGE_MAX_BYTES/, `${name} image route must bound Cloud Storage result recovery.`);
  assert.match(source, /resultStoragePath/, `${name} image route must persist a Cloud Storage result pointer.`);
  assert.match(source, /ai-operation-results\//, `${name} image route must isolate durable result objects under a dedicated prefix.`);
  assert.match(source, /resultSha256/, `${name} image route must verify durable result integrity.`);
  assert.match(source, /gunzipSync/, `${name} image route must decode compressed durable results.`);
  assert.match(source, /providerAttempted\s*\?\s*'uncertain'\s*:\s*'failed'/, `${name} image route must preserve uncertain provider outcomes.`);
  assert.match(source, /OPENROUTER_IMAGE_DAILY_BUDGET_USD/, `${name} image route must expose a bounded daily USD budget.`);
  assert.match(source, /collection\('aiDailyBudgets'\)/, `${name} image route must reserve cost in the shared daily budget ledger.`);
  assert.match(source, /const limitUsd = await readImageBudgetLimit\(transaction, (?:adminDb|db), uid, IMAGE_DAILY_BUDGET_USD\)/, `${name} must read the policy within the reservation transaction.`);
  assert.match(source, /spentUsd \+ pendingUsd \+ reservedUsd > limitUsd/, `${name} image route must enforce the resolved policy before exceeding the budget.`);
  assert.match(source, /budgetSettled:\s*true[\s\S]*chargedUsd/, `${name} image route must settle reservations exactly once.`);
  assert.match(source, /signal:\s*AbortSignal\.timeout\(OPENROUTER_DISCOVERY_TIMEOUT_MS\)/, `${name} model discovery must have an explicit timeout.`);
  assert.match(source, /signal:\s*AbortSignal\.timeout\(OPENROUTER_GENERATION_TIMEOUT_MS\)/, `${name} image generation must have an explicit timeout.`);
  assert.doesNotMatch(source, /details:\s*rawMessage|keySource:\s*runtime\.source/, `${name} responses must redact provider and credential details.`);
}
assert.match(next, /requireAdminOrPermissionAuth\(req, 'photoManagement'\)/, 'The Next image route must enforce the photo management entitlement.');
assert.match(next, /namespace:\s*'generate-image-minute'[\s\S]*maxRequests:\s*12/, 'The Next image route must share the callable minute namespace.');
assert.match(next, /namespace:\s*'generate-image-day'[\s\S]*maxRequests:\s*48/, 'The Next image route must share the callable daily namespace.');
assert.doesNotMatch(adminAuth, /Invalid auth token\. Detail:/, 'Permission authentication errors must not expose verifier internals.');
assert.match(adminAuth, /Admin Permission Auth Error[\s\S]*classifyFirebaseAuthVerificationError\(error\)/, 'Permission authentication errors must use the redacted classifier.');
assert.doesNotMatch(client, /httpsCallable|trying callable fallback|callableParams/, 'The client must not bypass the protected HTTP route through callable fallback.');
assert.match(client, /operationId:\s*bodyParams\.operationId \|\| crypto\.randomUUID\(\)/, 'Shared image clients must provide an idempotency operationId.');
assert.match(next, /expiresAt: new Date\(Date\.now\(\) \+ 7 \* 24 \* 60 \* 60 \* 1000\)/, 'Next chunk writes must carry an expiry timestamp.');
assert.match(hosting, /expiresAt: new Date\(Date\.now\(\) \+ 7 \* 24 \* 60 \* 60 \* 1000\)/, 'Hosting chunk writes must carry an expiry timestamp.');
assert.match(cleanup, /where\('resultExpiresAt', '<=', now\)/, 'Scheduled cleanup must select expired durable operations.');
assert.match(cleanup, /operation\.ref\.collection\('resultChunks'\)/, 'Scheduled cleanup must delete expired Firestore chunks.');
assert.match(cleanup, /storagePath\.startsWith\('ai-operation-results\/'\)/, 'Scheduled cleanup must constrain durable result object deletion to its prefix.');
assert.match(cleanup, /\.file\(storagePath\)\.delete\(\{ ignoreNotFound: true \}\)/, 'Scheduled cleanup must delete expired durable result objects.');
assert.match(functionsIndex, /cleanupAiOperationResults/, 'The cleanup schedule must be exported for deployment.');

console.log('Image generation security contract verified.');
