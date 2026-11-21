import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const repository = 'playzzin/propig';
const previewSite = 'propig-63524';

export function previewChannelId(branch) {
  const hash = createHash('sha256').update(branch, 'utf8').digest('hex');
  return `branch-${hash.slice(0, 16)}`;
}

function remoteBranchHead(branch) {
  const ref = `refs/heads/${branch}`;
  const result = spawnSync(
    'git',
    ['ls-remote', '--exit-code', '--refs', `https://github.com/${repository}.git`, ref],
    { encoding: 'utf8', timeout: 30_000 },
  );

  if (result.status === 2) return null;
  if (result.status !== 0) throw new Error('Unable to verify the branch on GitHub.');

  const [head, matchedRef] = result.stdout.trim().split('\t');
  if (matchedRef !== ref || !/^[a-f0-9]{40}$/.test(head)) {
    throw new Error('GitHub returned an unexpected branch ref.');
  }
  return head;
}

export function previewForPush(branch, revision, readHead = remoteBranchHead) {
  return readHead(branch) === revision ? previewChannelId(branch) : null;
}

function accessToken() {
  if (!process.env.CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE) {
    throw new Error('Firebase Hosting credentials were not configured.');
  }

  const result = spawnSync(
    'gcloud',
    ['auth', 'print-access-token', '--quiet'],
    { encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const token = result.stdout?.trim();
  if (result.status !== 0 || !token) {
    throw new Error('Unable to obtain a Firebase Hosting access token.');
  }
  return token;
}

export async function cleanupDeletedBranch(
  event,
  { site, readHead = remoteBranchHead, getToken = accessToken, request = fetch },
) {
  const branch = event.ref;
  if (
    event.repository?.full_name !== repository ||
    event.ref_type !== 'branch' ||
    typeof branch !== 'string' ||
    !branch.startsWith('codex/') ||
    branch === 'codex/'
  ) {
    return 'Skipped: the event does not identify a ProPig Codex branch.';
  }
  if (site !== previewSite) throw new Error('The configured site does not match ProPig Hosting.');

  if (readHead(branch) !== null) return 'Skipped: the GitHub branch still exists.';
  const token = getToken();
  // Authentication may take time. Recheck the ref just before touching Hosting.
  if (readHead(branch) !== null) return 'Skipped: the GitHub branch was recreated.';

  const channel = previewChannelId(branch);
  const response = await request(
    `https://firebasehosting.googleapis.com/v1beta1/sites/${site}/channels/${channel}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    },
  );

  if (response.status === 404) return `Preview channel ${channel} was already absent.`;
  if (!response.ok) throw new Error(`Firebase Hosting returned HTTP ${response.status} for ${channel}.`);
  return `Deleted preview channel ${channel}.`;
}

async function run(command, env) {
  if (command === 'prepare-deploy') {
    const channel = previewForPush(env.GITHUB_REF_NAME, env.GITHUB_SHA);
    if (channel === null) {
      console.log('Skipped: the pushed commit is no longer the GitHub branch head.');
      return;
    }
    appendFileSync(env.GITHUB_OUTPUT, `channel=${channel}\n`);
    return;
  }
  if (command === 'cleanup' && env.GITHUB_EVENT_NAME === 'delete') {
    const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
    console.log(await cleanupDeletedBranch(event, { site: env.FIREBASE_PROJECT_ID }));
    return;
  }
  throw new Error('Expected prepare-deploy or a GitHub delete event.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await run(process.argv[2], process.env);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
