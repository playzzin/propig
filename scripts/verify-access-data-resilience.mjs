import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readSource = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const [
  accessHook,
  nextAdminCheck,
  functionsAdminCheck,
  stickyNotes,
  systemContext,
  systemSettingsPage,
  sidebar,
  generateVideo,
  generateProjectBoard,
] = await Promise.all([
  readSource('src/hooks/useCurrentUserAccess.ts'),
  readSource('src/app/api/admin/check/route.ts'),
  readSource('functions/src/api/adminCheck.ts'),
  readSource('src/hooks/useStickyNotes.ts'),
  readSource('src/contexts/SystemContext.tsx'),
  readSource('src/app/admin/system-settings/page.tsx'),
  readSource('src/components/Sidebar.tsx'),
  readSource('src/app/api/generate-video/route.ts'),
  readSource('src/app/api/generate-project-board-content/route.ts'),
]);

assert.match(
  accessHook,
  /const role = hasAdminAuthority\s*\? 'admin'\s*:\s*normalizeRole\(/,
  'Client access resolution must not let stale stored roles downgrade administrators.',
);
assert.match(nextAdminCheck, /const role = authResult\.role;/);
assert.match(nextAdminCheck, /const permissions = authResult\.permissions;/);
assert.match(nextAdminCheck, /canWriteFirestore: true/);
assert.match(functionsAdminCheck, /const role: ManagedUserRole = 'admin';/);
assert.match(functionsAdminCheck, /const permissions = allPermissions\(\);/);
assert.match(functionsAdminCheck, /canWriteFirestore: true/);
assert.doesNotMatch(functionsAdminCheck, /Invalid auth token\. Detail:/);

assert.doesNotMatch(stickyNotes, /withConverter\(stickyNoteConverter\)/);
assert.doesNotMatch(stickyNotes, /throw new Error\(["']Invalid Note Data["']\)/);
assert.match(stickyNotes, /parseFirestoreStickyNote[\s\S]*return null;/);
assert.match(stickyNotes, /StickyNotesLocalStateV1Schema\.safeParse\(JSON\.parse\(rawLocal\)\)/);
assert.match(stickyNotes, /if \(note\) next\.push\(note\);/);

assert.match(systemContext, /onSnapshot\([\s\S]*Subscription failed[\s\S]*setLoading\(false\)/);
assert.match(systemContext, /retry: \(\) => void/);
assert.match(systemSettingsPage, /useCurrentUserAccess\(\)/);
assert.match(systemSettingsPage, /if \(!currentUser\)/);
assert.match(systemSettingsPage, /if \(access\.role !== 'admin'\)/);
assert.match(systemSettingsPage, /<AccessCard role="status" aria-live="polite">/);
assert.match(
  sidebar,
  /\{hasSub && !usesCollapsedBehavior && isOpen && \(/,
  'Collapsed or closed submenu links must not remain in the keyboard tab order.',
);

for (const source of [generateVideo, generateProjectBoard]) {
  assert.match(source, /req\.json\(\)\.catch\(\(\) => null\)/);
}
assert.doesNotMatch(generateVideo, /details:\s*rawMessage/);
assert.doesNotMatch(
  generateProjectBoard,
  /error:\s*error instanceof Error \? error\.message/,
);

console.log('Access and data resilience contracts verified.');
