import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const repository = 'playzzin/propig';
const qaJobName = 'Cloud preview QA';

function githubJson(args) {
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', timeout: 30_000 }));
}

function findPush({ branch, sha }) {
  const [run] = githubJson(['run', 'list', '--repo', repository, '--workflow', 'ci.yml',
    '--event', 'push', '--branch', branch, '--commit', sha, '--limit', '1',
    '--json', 'databaseId,headBranch,headSha,event,status,conclusion,url']);
  return run;
}

function findJobs(runId) {
  return githubJson(['api', `repos/${repository}/actions/runs/${runId}/jobs?filter=latest&per_page=100`,
    '--jq', '.jobs | map({name, status, conclusion, html_url})']);
}

export async function requirePreviewQA(source, {
  readPush = findPush, readJobs = findJobs, sleep = delay, now = Date.now,
  timeoutMs = 45 * 60_000,
} = {}) {
  const { repo, branch, sha } = source;
  if (repo !== repository || !branch || branch === 'main' || branch.startsWith('dependabot/') ||
      !/^[a-f0-9]{40}$/.test(sha)) {
    throw new Error('A published ProPig branch preview is required. Review external changes on a repository branch before merging.');
  }

  const deadline = now() + timeoutMs;
  let run;
  do {
    run = readPush(source);
    if (run) {
      if (run.event !== 'push' || run.headBranch !== branch || run.headSha !== sha) {
        throw new Error('The push run does not match the requested branch and commit.');
      }
      if (run.status === 'completed') {
        if (run.conclusion !== 'success') throw new Error(`Branch CI finished with ${run.conclusion}: ${run.url}`);
        const jobs = readJobs(run.databaseId).filter(job => job.name === qaJobName);
        if (jobs.length !== 1 || jobs[0].status !== 'completed' || jobs[0].conclusion !== 'success') {
          throw new Error(`No successful ${qaJobName} job for ${sha}: ${run.url}`);
        }
        return { run: run.url, job: jobs[0].html_url };
      }
    }
    const remaining = deadline - now();
    if (remaining <= 0) break;
    await sleep(Math.min(30_000, remaining));
  } while (now() <= deadline);
  throw new Error(`Timed out waiting for preview QA for ${sha}: ${run?.url ?? 'https://github.com/' + repository + '/actions/workflows/ci.yml'}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { QA_HEAD_REPO: repo, QA_HEAD_BRANCH: branch, QA_HEAD_SHA: sha } = process.env;
  console.log(`Checking the branch push for ${sha}.`);
  try {
    const result = await requirePreviewQA({ repo, branch, sha });
    const message = `Cloud preview QA passed for \`${sha}\`. [Browser checks](${result.job}) · [Report and screenshots](${result.run})`;
    console.log(message);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, message + '\n');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
