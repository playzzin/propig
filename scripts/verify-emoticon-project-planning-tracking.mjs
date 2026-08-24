import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hookSource = fs.readFileSync(
  path.join(root, 'src/app/admin/emoticon-studio/studio/useEmoticonStudio.ts'),
  'utf8',
);
const pageSource = fs.readFileSync(
  path.join(root, 'src/app/admin/emoticon-studio/studio/EmoticonStudioPage.tsx'),
  'utf8',
);

assert.match(
  hookSource,
  /const trackedJobIds = useMemo\(\(\) => Array\.from\(new Set\(\[[\s\S]{0,450}?turns\.flatMap[\s\S]{0,220}?variant\.jobId/,
  'Creation Turn variant jobs must remain in the tracked subscription set.',
);
assert.match(
  hookSource,
  /profileVersions\.map\(\(profile\) => profile\.sourceProfileJobId\)/,
  'Approved and historical character profile jobs must remain tracked.',
);
assert.match(
  hookSource,
  /activeProjectBase\?\.character\.profileJobId/,
  'The project profile job must remain tracked while its project is active.',
);
assert.match(
  hookSource,
  /subscribeEmoticonJobs\(\{[\s\S]{0,180}?jobIds: trackedJobIds[\s\S]{0,120}?onChange: setTrackedJobs/,
  'Tracked planning and creation jobs must use a bounded live subscription.',
);
assert.match(
  hookSource,
  /const recentJobs = useMemo[\s\S]{0,320}?recentJobFeed[\s\S]{0,160}?trackedJobs/,
  'The visible job feed must merge recent and explicitly tracked jobs.',
);
assert.match(
  pageSource,
  /studio\.turns\.map\(\(turn\) => \{[\s\S]{0,180}?turn\.variants\.flatMap[\s\S]{0,180}?studio\.recentJobs\.find[\s\S]{0,120}?variant\.jobId/,
  'The Studio result board must resolve jobs from persisted Turn variants.',
);

console.log('Emoticon project planning and Turn job tracking verification passed.');
