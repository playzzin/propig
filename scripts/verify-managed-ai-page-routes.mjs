import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [clientConfig, runtimeConfig, menuService] = await Promise.all([
  readFile(new URL('../src/lib/ai-config.ts', import.meta.url), 'utf8'),
  readFile(new URL('../functions/src/api/hostingAiRuntime.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/menuService.ts', import.meta.url), 'utf8'),
]);

for (const source of [clientConfig, runtimeConfig]) {
  assert.match(source, /id:\s*['"]image-generate['"][\s\S]*?name:\s*['"]스토리보드 이미지 생성['"][\s\S]*?pagePath:\s*['"]\/admin\/storyboard['"]/);
}

assert.match(menuService, /RETIRED_MENU_PATHS[\s\S]*?['"]\/admin\/image-generator['"]/);
assert.match(runtimeConfig, /RETIRED_MANAGED_PAGE_TARGETS[\s\S]*?['"]\/admin\/image-generator['"]/);
assert.doesNotMatch(
  runtimeConfig.replace(/RETIRED_MANAGED_PAGE_TARGETS[\s\S]*?\]\);/, ''),
  /pagePath:\s*['"]\/admin\/image-generator['"]|name:\s*['"]AI 이미지 생성기['"]/,
);

console.log('Managed AI page route contracts passed.');