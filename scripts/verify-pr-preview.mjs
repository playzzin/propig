import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, openSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { previewChannelId } from '../.github/scripts/hosting-preview.mjs';

const repository = 'playzzin/propig';
const root = fileURLToPath(new URL('../', import.meta.url));
const runtime = path.join(root, '.codex', 'preview-qa');

function gh(args) {
  try {
    return execFileSync('gh', args, {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 90_000,
    }).trim();
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('GitHub CLI를 설치하고 gh auth login을 실행하세요.');
    throw new Error(error.stderr?.trim() || error.message);
  }
}

function readPull(number) {
  const pr = JSON.parse(gh(['api', 'repos/' + repository + '/pulls/' + number, '--jq',
    '{state, branch: .head.ref, sha: .head.sha, repo: .head.repo.full_name}']));
  if (pr.state !== 'open' || pr.repo !== repository || pr.branch === 'main' || pr.branch.startsWith('dependabot/')) {
    throw new Error('ProPig 저장소에서 미리보기를 배포하는 열린 작업 PR 번호를 입력하세요.');
  }
  return pr;
}

export function previewOrigin(text, branch) {
  const url = new URL(text.trim());
  const host = new RegExp('^propig-63524--' + previewChannelId(branch) + '-[a-z0-9]+\\.web\\.app$');
  if (url.protocol !== 'https:' || !host.test(url.hostname) || url.port || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Actions 링크가 해당 브랜치의 ProPig 미리보기 주소와 일치하지 않습니다.');
  }
  return url.origin;
}

async function findPreview(pr) {
  const [run] = JSON.parse(gh(['run', 'list', '--repo', repository, '--workflow', 'ci.yml',
    '--event', 'push', '--branch', pr.branch, '--commit', pr.sha, '--limit', '1',
    '--json', 'databaseId,status,conclusion,url']));
  if (!run || run.status !== 'completed' || run.conclusion !== 'success') {
    throw new Error('현재 PR 커밋의 브랜치 push CI가 성공한 뒤 다시 실행하세요. ' +
      (run?.url || 'https://github.com/' + repository + '/actions/workflows/ci.yml'));
  }
  const dir = await mkdtemp(path.join(tmpdir(), 'propig-preview-link-'));
  try {
    gh(['run', 'download', String(run.databaseId), '--repo', repository, '--name', 'preview-link-' + pr.sha, '--dir', dir]);
    return { origin: previewOrigin(await readFile(path.join(dir, 'preview-url.txt'), 'utf8'), pr.branch), ci: run.url };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function verifyRevision(expected, current, origin, request = fetch) {
  if (expected.branch !== current.branch || expected.sha !== current.sha) {
    throw new Error('검사 중 PR이 변경됐습니다. 최신 미리보기에서 다시 실행하세요.');
  }
  const marker = new URL('/propig-preview-commit.txt', origin);
  marker.searchParams.set('check', randomUUID());
  const response = await request(marker, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15_000) });
  if (!response.ok || (await response.text()).trim() !== expected.sha) {
    throw new Error('게시된 커밋이 PR과 다르거나 미리보기가 만료됐습니다. 최신 미리보기 배포를 확인하세요.');
  }
}

function browserCheck(file, env, log) {
  const fd = openSync(log, 'w');
  try {
    execFileSync(process.execPath, [path.join(root, 'scripts', file)], { cwd: root, env, stdio: ['ignore', fd, fd] });
  } finally {
    closeSync(fd);
  }
}

async function main(args) {
  const [number] = args;
  if (args.length !== 1 || !/^[1-9]\d*$/.test(number)) {
    throw new Error('사용법: npm run qa:preview -- <PR 번호>');
  }
  if (!existsSync(path.join(runtime, 'node_modules', 'playwright-core', 'package.json'))) {
    throw new Error('이 작업 폴더에서 npm run qa:setup을 먼저 실행하세요.');
  }
  const pr = readPull(number);
  const { origin, ci } = await findPreview(pr);
  const parent = path.join(root, 'output', 'preview-qa', 'pr-' + number);
  await mkdir(parent, { recursive: true });
  const evidence = await mkdtemp(path.join(parent, pr.sha.slice(0, 12) + '-'));
  const env = {
    ...process.env, BASE_URL: origin, PARTNERSHIP_URL: origin, PROPIG_TEST_RUNTIME: runtime,
    PROPIG_SCREENSHOTS: path.join(evidence, 'shell'), PARTNERSHIP_SCREENSHOT_DIR: path.join(evidence, 'catalog'),
  };
  const report = {
    pr: Number(number), branch: pr.branch, commit: pr.sha, preview: origin, ci,
    checkerCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    startedAt: new Date().toISOString(), checks: [], status: 'running',
  };
  const reportPath = path.join(evidence, 'report.json');
  const saveReport = () => writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log('PR #' + number + ' · ' + pr.sha + '\n' + origin + '\n검사 기록 ' + evidence);
  await saveReport();
  try {
    await verifyRevision(pr, readPull(number), origin);
    for (const [name, file] of [['공개 홈 4종', 'verify-public-shell-integrity.mjs'], ['제품별 상담 연결', 'verify-partnership-inquiry.mjs']]) {
      console.log(name + ' 검사 중 (1440px, 390px)');
      const check = { name, log: file + '.log', status: 'passed' };
      try {
        browserCheck(file, env, path.join(evidence, check.log));
      } catch {
        check.status = 'failed';
        console.error(name + ' 검사 실패 · ' + path.join(evidence, check.log));
      }
      report.checks.push(check);
    }
    await verifyRevision(pr, readPull(number), origin);
    if (report.checks.some(check => check.status === 'failed')) {
      throw new Error('실패한 검사와 화면 기록을 확인하세요. ' + evidence);
    }
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.error = error.message;
    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
    await saveReport();
  }
  console.log('PASS · PR #' + number + ' · ' + pr.sha + '\n' + reportPath);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
