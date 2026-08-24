import assert from 'node:assert/strict';
import { isCorpWorkspacePath, isPublicCorpPath, needsWorkspaceShell } from '../src/lib/routeShell.ts';

const publicCorpPaths = [
  '/corp',
  '/corp/careers/jobs',
  '/corp/careers/apply',
  '/corp/company/introduction',
  '/corp/company/ceo-intro',
  '/corp/partnership/business',
];

const corpWorkspacePaths = [
  '/corp/project',
  '/corp/project/active',
];

const otherWorkspacePaths = [
  '/',
  '/admin',
  '/admin/emoticon-studio',
  '/propig',
  '/blog',
];

for (const pathname of publicCorpPaths) {
  assert.equal(isPublicCorpPath(pathname), true, `${pathname} should be a public corp path`);
  assert.equal(isCorpWorkspacePath(pathname), false, `${pathname} should not be a corp workspace path`);
  assert.equal(needsWorkspaceShell(pathname), true, `${pathname} must preserve the site shell and mode switcher`);
}

for (const pathname of corpWorkspacePaths) {
  assert.equal(isPublicCorpPath(pathname), false, `${pathname} should not be a public corp path`);
  assert.equal(isCorpWorkspacePath(pathname), true, `${pathname} should remain in the corp workspace`);
  assert.equal(needsWorkspaceShell(pathname), true, `${pathname} should use the workspace shell`);
}

for (const pathname of otherWorkspacePaths) {
  assert.equal(isPublicCorpPath(pathname), false, `${pathname} should not be a public corp path`);
  assert.equal(isCorpWorkspacePath(pathname), false, `${pathname} should not be a corp project path`);
  assert.equal(needsWorkspaceShell(pathname), true, `${pathname} should use the workspace shell`);
}

assert.equal(needsWorkspaceShell(null), true, 'unknown paths must fail closed into the workspace shell');
console.log('Route shell classification contracts passed.');
