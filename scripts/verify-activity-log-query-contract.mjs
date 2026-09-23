import assert from 'node:assert/strict';
import {
  activityLogMatchesFilters,
  createActivityLogContractPage,
  parseActivityLogFilters,
} from '../src/lib/server/activity-log-query.ts';

function createLog(id, action, overrides = {}) {
  return {
    id,
    action,
    actor: {
      uid: overrides.uid ?? 'admin-1',
      email: overrides.email ?? 'admin@example.com',
      role: 'admin',
      isAdmin: true,
    },
    target: {
      type: overrides.targetType ?? 'command',
      id: overrides.targetId ?? id,
      path: overrides.path ?? '/admin/menu',
      label: overrides.label ?? '통합 메뉴 관리',
    },
    summary: overrides.summary ?? `${overrides.label ?? '통합 메뉴 관리'} ERP 명령 실행`,
    metadata: overrides.metadata ?? { group: 'admin', source: 'contract' },
    route: overrides.route ?? '/',
    userAgent: 'contract-test',
    createdAt: overrides.createdAt ?? '2026-06-30T00:00:00.000Z',
  };
}

const commandA = createLog('cmd-a', 'erp_home.command_executed', {
  label: '통합 메뉴 관리',
  summary: '통합 메뉴 관리 ERP 명령 실행',
});
const commandB = createLog('cmd-b', 'erp_home.command_executed', {
  label: '사용자 관리',
  summary: '사용자 관리 ERP 명령 실행',
});
const moduleA = createLog('module-a', 'erp_home.module_opened', {
  targetType: 'module',
  path: '/propig',
  label: 'propig 대시보드',
  summary: 'propig 대시보드 ERP 모듈 이동',
  metadata: { domain: 'workflow' },
});
const selectedCommand = createLog('selected-command', 'erp_home.command_executed', {
  label: '최근 작업 히스토리',
  summary: '최근 작업 히스토리 ERP 명령 실행',
});
const commandC = createLog('cmd-c', 'erp_home.command_executed', {
  label: 'Storage',
  summary: 'Storage ERP 명령 실행',
});
const uploadLog = createLog('upload-a', 'admin.storage.file.upload', {
  targetType: 'file',
  path: '/brand/hero.png',
  label: 'hero.png',
  summary: 'Storage 업로드 완료',
  metadata: { bucket: 'assets' },
});

const orderedLogs = [commandA, commandB, moduleA, selectedCommand, commandC, uploadLog];

const commandFilters = parseActivityLogFilters(
  new URLSearchParams({
    scope: 'command-executed',
    action: 'erp_home.command_executed',
    q: 'ERP 명령',
    log: selectedCommand.id,
    scanLimit: '20',
  }),
);

assert.equal(commandFilters.scope, 'command-executed', 'scope filter should parse from query params');
assert.equal(commandFilters.action, 'erp_home.command_executed', 'action filter should parse from query params');
assert.equal(commandFilters.search, 'ERP 명령', 'search query should parse from q param');
assert.equal(commandFilters.selectedLogId, selectedCommand.id, 'highlighted log id should parse from query params');
assert.equal(commandFilters.scanLimit, 20, 'scan limit should parse from query params');

assert.equal(activityLogMatchesFilters(commandA, commandFilters), true, 'command log should match command/action/search filters');
assert.equal(activityLogMatchesFilters(moduleA, commandFilters), false, 'module log should not match command-executed scope');
assert.equal(activityLogMatchesFilters(uploadLog, commandFilters), false, 'non-ERP action should not match command action filter');

const firstPage = createActivityLogContractPage({
  logs: orderedLogs,
  selectedLog: selectedCommand,
  filters: commandFilters,
  limit: 2,
});

assert.deepEqual(
  firstPage.logs.map((log) => log.id),
  [selectedCommand.id, commandA.id],
  'highlighted matching log should be inserted at the top while reserving a result slot',
);
assert.equal(firstPage.nextCursor, commandA.id, 'first page cursor should point at the last scanned raw log');
assert.equal(firstPage.selectedLogMatched, true, 'selected log should be marked as matching active filters');
assert.equal(firstPage.matchedCount, 2, 'matched count should reflect returned logs');

const secondPage = createActivityLogContractPage({
  logs: orderedLogs,
  selectedLog: selectedCommand,
  filters: commandFilters,
  limit: 2,
  cursor: firstPage.nextCursor,
});

assert.deepEqual(
  secondPage.logs.map((log) => log.id),
  [commandB.id, commandC.id],
  'cursor after highlighted insertion should not skip the next matching command log',
);

const moduleFilters = parseActivityLogFilters(
  new URLSearchParams({
    scope: 'module-opened',
    action: 'erp_home.module_opened',
    q: '모듈',
    log: selectedCommand.id,
  }),
);
const modulePage = createActivityLogContractPage({
  logs: orderedLogs,
  selectedLog: selectedCommand,
  filters: moduleFilters,
  limit: 3,
});

assert.deepEqual(modulePage.logs.map((log) => log.id), [moduleA.id], 'module filters should return only module-open events');
assert.equal(modulePage.selectedLogMatched, false, 'selected command log should be rejected by module filters');

const scanLimitedPage = createActivityLogContractPage({
  logs: orderedLogs,
  filters: parseActivityLogFilters(new URLSearchParams({ q: 'not-present', scanLimit: '2' })),
  limit: 5,
});

assert.equal(scanLimitedPage.logs.length, 0, 'unmatched search should return no logs');
assert.equal(scanLimitedPage.scannedCount, 2, 'scan limit should cap raw log scanning');
assert.equal(scanLimitedPage.nextCursor, commandB.id, 'scan-limited page should expose a cursor for continuing the scan');
assert.equal(scanLimitedPage.scanLimitReached, true, 'scan-limited page should mark continuation state');

console.log('Activity-log query contract verification passed');
