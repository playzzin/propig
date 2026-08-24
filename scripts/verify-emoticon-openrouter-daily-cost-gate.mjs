import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const require = createRequire(import.meta.url);
const usageRuntime = require(path.join(root, 'functions/lib/openrouterUsage.js'));
const rateRuntime = require(path.join(root, 'functions/lib/emoticonStudio/rateLimits.js'));
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const usage = read('functions/src/openrouterUsage.ts');
const rateLimits = read('functions/src/emoticonStudio/rateLimits.ts');
const trigger = read('functions/src/triggers/onEmoticonJobCreated.ts');
const reconciliationApi = read('functions/src/api/openRouterUsage.ts');

assert.equal(rateRuntime.EMOTICON_COST_CONTROL_VERSION, 4);
assert.equal(rateRuntime.LEGACY_EMOTICON_COST_CONTROL_VERSION, 3);
assert.deepEqual(rateRuntime.assessEmoticonRecoveryExecutionGate({
  mode: 'generate',
  nowMs: 1_000,
  job: {
    rateLimitExecuteAtMs: 900,
    openRouterAuthorizedCostUsd: 8,
    openRouterDailyCostLimitUsd: 25,
    costControlVersion: 4,
  },
}), { outcome: 'ready' });
assert.deepEqual(rateRuntime.assessEmoticonRecoveryExecutionGate({
  mode: 'generate',
  nowMs: 1_000,
  job: {
    rateLimitExecuteAtMs: 900,
    openRouterAuthorizedCostUsd: 8,
    costControlVersion: 4,
  },
}), { outcome: 'blocked', reason: 'missing-cost-authorization' });
assert.deepEqual(rateRuntime.assessEmoticonRecoveryExecutionGate({
  mode: 'generate',
  nowMs: 1_000,
  job: {
    rateLimitExecuteAtMs: 900,
    openRouterAuthorizedCostUsd: 8,
    openRouterCostReservationDayBucket: 10,
    costControlVersion: 3,
  },
}), { outcome: 'ready' }, 'Legacy v3 reservations must remain recoverable.');

assert.equal(usageRuntime.canReserveOpenRouterCost({
  authorizedCostUsd: 8,
  actualCostUsd: 4,
  inflightCostUsd: 3.5,
  estimatedCostUsd: 0.5,
}), true, 'The per-job authorization ceiling must remain inclusive.');
assert.equal(usageRuntime.canReserveOpenRouterCost({
  authorizedCostUsd: 8,
  actualCostUsd: 4,
  inflightCostUsd: 3.5,
  estimatedCostUsd: 0.5001,
}), false, 'The per-job authorization ceiling must remain fail-closed.');

assert.equal(usageRuntime.canReserveOpenRouterDailyCost({
  dailyCostLimitUsd: 25,
  actualCostUsd: 20,
  inflightCostUsd: 4.65,
  estimatedCostUsd: 0.35,
}), true, 'A request exactly at the Korea-day cap should be admitted.');
assert.equal(usageRuntime.canReserveOpenRouterDailyCost({
  dailyCostLimitUsd: 25,
  actualCostUsd: 20,
  inflightCostUsd: 4.65,
  estimatedCostUsd: 0.3501,
}), false, 'A request above the Korea-day actual + inflight cap must be blocked.');
assert.equal(usageRuntime.canReserveOpenRouterDailyCost({
  dailyCostLimitUsd: 0,
  actualCostUsd: 0,
  inflightCostUsd: 0,
  estimatedCostUsd: 0,
}), false, 'A missing or zero daily limit must fail closed.');

const reserved = usageRuntime.transitionOpenRouterDailyCostAggregate({
  aggregate: { actualCostUsd: 2, inflightCostUsd: 1 },
  inflightDeltaUsd: 0.35,
});
assert.deepEqual(reserved, { actualCostUsd: 2, inflightCostUsd: 1.35 });
const settled = usageRuntime.transitionOpenRouterDailyCostAggregate({
  aggregate: reserved,
  actualDeltaUsd: 0.28,
  inflightDeltaUsd: -0.35,
});
assert.ok(Math.abs(settled.actualCostUsd - 2.28) < 1e-9);
assert.equal(settled.inflightCostUsd, 1);
const uncertain = usageRuntime.transitionOpenRouterDailyCostAggregate({
  aggregate: reserved,
});
assert.deepEqual(uncertain, reserved, 'An uncertain response must retain its inflight hold.');
const definitelyFailed = usageRuntime.transitionOpenRouterDailyCostAggregate({
  aggregate: reserved,
  inflightDeltaUsd: -0.35,
});
assert.deepEqual(definitelyFailed, { actualCostUsd: 2, inflightCostUsd: 1 });
assert.throws(() => usageRuntime.transitionOpenRouterDailyCostAggregate({
  aggregate: { actualCostUsd: 0, inflightCostUsd: 0.1 },
  inflightDeltaUsd: -0.2,
}), /would become negative/, 'Corrupt or double-release transitions must fail closed.');

assert.equal(usageRuntime.resolveOpenRouterDailyCostLimitUsd({
  job: { openRouterDailyCostLimitUsd: 25 },
  aggregate: { dailyCostLimitUsd: 20 },
  environment: { EMOTICON_STUDIO_DAILY_COST_USD: '30' },
}), 20, 'A same-day lower stored limit must never be silently expanded.');
assert.equal(usageRuntime.resolveOpenRouterDailyCostLimitUsd({
  job: { openRouterDailyCostLimitUsd: 25 },
  aggregate: { dailyCostLimitUsd: 25 },
  environment: { EMOTICON_STUDIO_DAILY_COST_USD: '15' },
}), 15, 'A lowered configured cap must take effect immediately.');

const userIdHash = createHash('sha256').update('daily-gate-user').digest('hex');
const identity = usageRuntime.buildOpenRouterDailyCostAggregateIdentity(userIdHash, '2026-08-03');
assert.ok(identity);
assert.match(identity.documentId, /^emoticon_[a-f0-9]{64}$/);
assert.deepEqual(
  usageRuntime.resolveOpenRouterDailyCostAggregateIdentity({
    userIdHash,
    day: '2026-08-03',
    dailyCostAggregateId: identity.documentId,
  }),
  identity,
);
assert.equal(usageRuntime.resolveOpenRouterDailyCostAggregateIdentity({
  userIdHash,
  day: '2026-08-03',
  dailyCostAggregateId: 'emoticon_tampered',
}), null, 'A tampered aggregate pointer must fail closed.');
assert.equal(
  usageRuntime.toKoreaDateKey(new Date('2026-08-02T15:00:00.000Z')),
  '2026-08-03',
);
assert.equal(
  usageRuntime.nextKoreaDayStartMs(Date.parse('2026-08-03T14:59:59.000Z')),
  Date.parse('2026-08-03T15:00:00.000Z'),
);

assert.match(usage, /OPENROUTER_DAILY_COST_COLLECTION\s*=\s*['"]openrouter_daily_costs['"]/);
assert.match(usage, /transaction\.get\(dailyCostRef\)/);
assert.match(usage, /canReserveOpenRouterDailyCost\(\{/);
assert.match(usage, /actualCostUsd:\s*nextDailyCost\.actualCostUsd/);
assert.match(usage, /inflightCostUsd:\s*nextDailyCost\.inflightCostUsd/);
assert.match(usage, /existingState === 'inflight'.*existingState === 'uncertain'.*existingState === 'settled'/s);
assert.match(usage, /const inflightDeltaUsd = params\.ambiguous/);
assert.match(usage, /dailyCostInflightAccounted:\s*params\.ambiguous/);
assert.match(usage, /dailyCostInflightAccounted:\s*true/);
assert.match(usage, /dailyCostAggregateId:\s*dailyCostIdentity\.documentId/);
assert.match(usage, /logicalOperationHash:\s*logicalOperationId/);

const reserveRateStart = trigger.indexOf('async function reserveRateLimitSlot');
const terminalSettlementStart = trigger.indexOf('async function settleTerminalJobCostReservation');
assert.ok(reserveRateStart >= 0 && terminalSettlementStart > reserveRateStart);
const reserveRateSource = trigger.slice(reserveRateStart, terminalSettlementStart);
assert.match(reserveRateSource, /allocateEmoticonRateSlot\(/);
assert.doesNotMatch(
  reserveRateSource,
  /allocateEmoticonCostReservation\(/,
  'New jobs must not reserve a future-day worst-case monetary ceiling.',
);
assert.doesNotMatch(reserveRateSource, /costAllocation\.executeAtMs/);
assert.match(reserveRateSource, /openRouterDailyCostLimitUsd:\s*EMOTICON_COST_LIMITS\.dailyUsd/);
assert.match(reserveRateSource, /costControlVersion:\s*EMOTICON_COST_CONTROL_VERSION/);
assert.match(trigger, /job\.costControlVersion === LEGACY_EMOTICON_COST_CONTROL_VERSION/);
assert.match(trigger, /allocateEmoticonCostReservation\(\{/);
assert.match(trigger, /Version 4 never re-reserves a future-day worst-case ceiling/);
assert.match(trigger, /error instanceof OpenRouterDailyCostLimitError/);

assert.match(rateLimits, /costControlVersion === EMOTICON_COST_CONTROL_VERSION && validV4DailyLimit/);
assert.match(rateLimits, /validLegacyReservation/);

assert.match(reconciliationApi, /resolveOpenRouterDailyCostAggregateIdentity\(usage\)/);
assert.match(reconciliationApi, /transitionOpenRouterDailyCostAggregate\(\{/);
assert.match(reconciliationApi, /reconciliationCount:\s*admin\.firestore\.FieldValue\.increment\(1\)/);
assert.match(reconciliationApi, /const aggregateBackfillOnly = transition\.outcome === 'idempotent'/);
assert.match(reconciliationApi, /dailyCostBackfilledAt:\s*serverTimestamp/);
const idempotentIndex = reconciliationApi.indexOf("transition.outcome === 'idempotent'");
const reconciliationAggregateWriteIndex = reconciliationApi.indexOf('transaction.set(dailyCostRef');
assert.ok(
  idempotentIndex >= 0 && reconciliationAggregateWriteIndex > idempotentIndex,
  'Idempotent admin reconciliation must return before aggregate accounting is applied again.',
);

console.log('Emoticon OpenRouter per-request Korea-day cost gate verified.');
