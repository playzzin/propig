import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, openSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { previewChannelId } from '../.github/scripts/hosting-preview.mjs';

const repository = 'playzzin/propig';
const previewPrefix = 'https://propig-63524--';
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

function isPreviewBranch(branch) {
  return typeof branch === 'string' && branch.length > 0 && branch !== 'main' && !branch.startsWith('dependabot/');
}

function readPull(number) {
  const pr = JSON.parse(gh(['api', 'repos/' + repository + '/pulls/' + number, '--jq',
    '{state, branch: .head.ref, sha: .head.sha, repo: .head.repo.full_name}']));
  if (pr.state !== 'open' || pr.repo !== repository || !isPreviewBranch(pr.branch)) {
    throw new Error('ProPig 저장소에서 미리보기를 배포하는 열린 작업 PR 번호를 입력하세요.');
  }
  return pr;
}

export function previewOrigin(artifacts, branch) {
  const channel = previewChannelId(branch);
  const prefix = 'preview-channel-' + channel + '-';
  const record = artifacts.filter(item => !item.expired && item.name.startsWith(prefix))
    .sort((a, b) => b.id - a.id)[0];
  const suffix = record?.name.slice(prefix.length);
  if (!suffix || !/^[a-z0-9]+$/.test(suffix)) {
    throw new Error('해당 브랜치의 유효한 공개 채널 기록이 없습니다. 최신 미리보기 배포를 확인하세요.');
  }
  return previewPrefix + channel + '-' + suffix + '.web.app';
}

function findPullPreview(number) {
  const pr = readPull(number);
  const [run] = JSON.parse(gh(['run', 'list', '--repo', repository, '--workflow', 'ci.yml',
    '--event', 'push', '--branch', pr.branch, '--commit', pr.sha, '--limit', '1',
    '--json', 'databaseId,status,conclusion,url']));
  if (!run || run.status !== 'completed' || run.conclusion !== 'success') {
    throw new Error('현재 PR 커밋의 브랜치 push CI가 성공한 뒤 다시 실행하세요. ' +
      (run?.url || 'https://github.com/' + repository + '/actions/workflows/ci.yml'));
  }
  const artifacts = JSON.parse(gh(['api', 'repos/' + repository + '/actions/runs/' + run.databaseId +
    '/artifacts?per_page=100', '--jq', '.artifacts | map({id, name, expired})']));
  return { ...pr, origin: previewOrigin(artifacts, pr.branch), ci: run.url };
}

export function deployedPreview(env, checkerCommit) {
  const { GITHUB_REF_NAME: branch, GITHUB_SHA: sha, PREVIEW_URL: url } = env;
  if ((env.GITHUB_REPOSITORY && env.GITHUB_REPOSITORY !== repository) ||
      (env.GITHUB_REF_TYPE && env.GITHUB_REF_TYPE !== 'branch')) {
    throw new Error('배포된 미리보기 검사는 ProPig 저장소의 브랜치에서 실행하세요.');
  }
  if (!isPreviewBranch(branch) || !/^[a-f0-9]{40}$/.test(sha) || sha !== checkerCommit) {
    throw new Error('미리보기 브랜치와 전체 커밋 SHA를 확인하세요. 검사 checkout은 배포한 커밋과 일치해야 합니다.');
  }
  const origin = url?.replace(/\/$/, '');
  const prefix = previewPrefix + previewChannelId(branch) + '-';
  if (!origin?.startsWith(prefix) || !/^[a-z0-9]+\.web\.app$/.test(origin.slice(prefix.length))) {
    throw new Error('PREVIEW_URL은 이 브랜치에 배포된 ProPig Firebase Hosting 미리보기 주소여야 합니다.');
  }
  const ci = /^[1-9]\d*$/.test(env.GITHUB_RUN_ID)
    ? 'https://github.com/' + repository + '/actions/runs/' + env.GITHUB_RUN_ID
    : null;
  return { branch, sha, origin, ci };
}

export async function verifyRevision(expected, current, origin, request = fetch) {
  if (expected.branch !== current.branch || expected.sha !== current.sha) {
    throw new Error('검사 중 PR이 변경됐습니다. 최신 미리보기에서 다시 실행하세요.');
  }
  const marker = new URL('/propig-preview-commit.txt', origin);
  marker.searchParams.set('check', randomUUID());
  const response = await request(marker, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15_000) });
  if (!response.ok || (await response.text()).trim() !== expected.sha) {
    throw new Error('게시된 커밋이 검사할 커밋과 다르거나 미리보기가 만료됐습니다. 최신 미리보기 배포를 확인하세요.');
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
  const [argument] = args;
  const deployed = argument === '--deployed';
  if (args.length !== 1 || (!deployed && !/^[1-9]\d*$/.test(argument))) {
    throw new Error('사용법: npm run qa:preview -- <PR 번호 또는 --deployed>');
  }
  if (!existsSync(path.join(runtime, 'node_modules', 'playwright-core', 'package.json'))) {
    throw new Error('이 작업 폴더에서 npm run qa:setup을 먼저 실행하세요.');
  }
  const checkerCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const target = deployed ? deployedPreview(process.env, checkerCommit) : findPullPreview(argument);
  const { branch, sha, origin, ci } = target;
  const verifyTarget = () => verifyRevision(target, deployed ? target : readPull(argument), origin);
  const label = deployed ? branch : 'PR #' + argument;
  const parent = path.join(root, 'output', 'preview-qa', deployed ? 'deployed' : 'pr-' + argument);
  await mkdir(parent, { recursive: true });
  const evidence = await mkdtemp(path.join(parent, sha.slice(0, 12) + '-'));
  const env = {
    ...process.env, BASE_URL: origin, PARTNERSHIP_URL: origin, PROPIG_TEST_RUNTIME: runtime,
    PROPIG_SCREENSHOTS: path.join(evidence, 'shell'), PARTNERSHIP_SCREENSHOT_DIR: path.join(evidence, 'catalog'),
  };
  const report = {
    pr: deployed ? null : Number(argument), branch, commit: sha, preview: origin, ci, checkerCommit,
    startedAt: new Date().toISOString(), checks: [], status: 'running',
  };
  const reportPath = path.join(evidence, 'report.json');
  const saveReport = () => writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(label + ' · ' + sha + '\n' + origin + '\n검사 기록 ' + evidence);
  await saveReport();
  try {
    await verifyTarget();
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
    await verifyTarget();
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
  console.log('PASS · ' + label + ' · ' + sha + '\n' + reportPath);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
