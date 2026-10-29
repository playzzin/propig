import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
const runtime = process.env.PROPIG_TOOLS || path.join(homedir(), '.local/share/propig-tools');
const require = createRequire(path.join(runtime, 'package.json'));
const { chromium } = require('playwright-core');
const AxeBuilder = require('@axe-core/playwright').default;
const esbuild = require('esbuild');
assert.match(esbuild.transformSync('const value: number = 1;', { loader: 'ts' }).code, /const value = 1/);
const executablePath = process.env.CHROME_PATH || path.join(homedir(), '.cache/ms-playwright/chromium-1228/chrome-linux64/chrome');
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route('http://propig-tools.test/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><html lang="ko"><head><title>QA 도구 검사</title></head><body><main><h1>도구 검사</h1><button>저장</button></main></body></html>' }));
  await page.goto('http://propig-tools.test/');
  const good = await new AxeBuilder({ page }).withRules(['button-name']).analyze();
  assert.equal(good.violations.length, 0);
  await page.locator('button').evaluate(el => { el.textContent = ''; });
  const bad = await new AxeBuilder({ page }).withRules(['button-name']).analyze();
  assert.ok(bad.violations.some(v => v.id === 'button-name'));
  console.log(JSON.stringify({ browser: 'PASS', esbuild: 'PASS', axePositive: 'PASS', axeNegative: 'PASS', toolVersions: Object.fromEntries(['playwright-core','@axe-core/playwright','esbuild','react','react-test-renderer'].map(p => [p,JSON.parse(readFileSync(path.join(runtime,'node_modules',p,'package.json'),'utf8')).version])), note: 'Toolchain self-test only; not app accessibility certification' }, null, 2));
} finally { await browser.close(); }
