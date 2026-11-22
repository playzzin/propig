import { execFileSync } from 'node:child_process';
import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const tools = path.join(root, 'ops', 'hermes');
const runtime = path.join(root, '.codex', 'preview-qa');

async function setup() {
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error('프로젝트 폴더에서 npm run qa:setup을 실행하세요.');

  await mkdir(runtime, { recursive: true });
  for (const file of ['package.json', 'package-lock.json']) {
    await copyFile(path.join(tools, `toolchain-${file}`), path.join(runtime, file));
  }
  // Invoke npm's JavaScript entry point directly so paths with spaces also work on Windows.
  const options = { cwd: runtime, stdio: 'inherit' };
  execFileSync(process.execPath, [npm, 'ci', '--prefix', runtime, '--ignore-scripts', '--no-audit', '--no-fund'], options);

  const customBrowser = process.env.CHROME_PATH || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (!customBrowser) {
    const cli = path.join(runtime, 'node_modules', 'playwright-core', 'cli.js');
    execFileSync(process.execPath, [cli, 'install', '--no-shell', 'chromium'], options);
  }
  const require = createRequire(path.join(runtime, 'package.json'));
  const { chromium } = require('playwright-core');
  const browser = await chromium.launch({ executablePath: customBrowser || chromium.executablePath() });
  try {
    console.log(`미리보기 검사 준비 완료 · Chromium ${browser.version()}`);
  } finally {
    await browser.close();
  }
}

setup().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
