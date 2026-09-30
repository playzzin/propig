import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the real menu service and its local dependencies without remote writes.
const modules = new Map();
const storage = new Map();
function load(relative) {
  const filename = path.resolve(relative);
  if (modules.has(filename)) return modules.get(filename);
  const exports = {};
  modules.set(filename, exports);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(output, {
    exports,
    console,
    setTimeout,
    clearTimeout,
    window: {
      localStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
      },
    },
    require(id) {
      if (id === 'firebase/firestore') return {};
      if (id === '@/firebase/config') return { auth: { currentUser: null }, db: {} };
      assert.ok(id.startsWith('@/'), `Unexpected dependency: ${id}`);
      return load(`src/${id.slice(2)}.ts`);
    },
  }, { filename });
  return exports;
}

const { menuService } = load('src/services/menuService.ts');
const { MENU_SETTINGS_VERSION } = load('src/constants/menuSettingsContract.ts');
const { CORP_PAGE_DEFINITIONS, getCorpPageBySlug } = load('src/constants/corpPages.ts');
const { MENU_PAGE_OPTIONS } = load('src/constants/menuPages.ts');
const copy = (value) => JSON.parse(JSON.stringify(value));
const retiredPaths = ['/corp/project', '/corp/portfolio'];
const retiredIds = ['corp-project', 'corp-project-1', 'corp-project-2'];
const flatten = (items) => items.flatMap((item) => typeof item === 'string' ? [] : [item, ...flatten(item.sub ?? [])]);
function assertRetiredAbsent(sites) {
  for (const site of Object.values(sites)) {
    for (const item of flatten([...site.menu, ...site.trash])) {
      assert.ok(!retiredIds.includes(item.id), `Retired ID survived: ${item.id}`);
      const pathname = item.path?.split(/[?#]/)[0].replace(/\/+$/, '');
      assert.ok(!retiredPaths.includes(pathname), `Retired path survived: ${item.path}`);
    }
  }
}

const defaults = copy(menuService.getDefaultSites());
assertRetiredAbsent(defaults);
for (const retiredPath of retiredPaths) {
  assert.equal(getCorpPageBySlug([retiredPath.split('/').at(-1)]), undefined);
  assert.ok(!CORP_PAGE_DEFINITIONS.some((page) => page.path === retiredPath));
  assert.ok(!MENU_PAGE_OPTIONS.some((page) => page.path === retiredPath));
}

const stale = copy(defaults);
stale.corp.menu.push({
  id: 'corp-project', text: '프로젝트', type: 'folder', sub: [
    { id: 'corp-project-1', text: '프로젝트', path: '/corp/project' },
    { id: 'corp-project-2', text: '포트폴리오', path: '/corp/portfolio' },
  ],
});
// Renamed/nested entries must also disappear, including across site modes and trash.
stale.blog.menu.push({
  id: 'custom-folder', text: '보존할 폴더', type: 'folder', sub: [
    '보존할 설명',
    { id: 'keep', text: '제품소개', path: '/corp/company/product-introduction' },
    { id: 'old-query', text: 'old', path: '/corp/project/?view=grid#cards' },
    { id: 'old-hash', text: 'old', path: '/corp/portfolio#programs' },
  ],
});
stale.corp.trash.push({ id: 'old-trash', text: 'old', path: '/corp/portfolio/' });

const cleaned = copy(menuService.cleanupRetiredMenuItems(stale).data);
assertRetiredAbsent(cleaned);
assert.deepEqual(cleaned.admin, defaults.admin);
assert.deepEqual(cleaned.shop, defaults.shop);
assert.deepEqual(cleaned.corp, defaults.corp);
assert.deepEqual(cleaned.blog.menu.at(-1).sub, [
  '보존할 설명', { id: 'keep', text: '제품소개', path: '/corp/company/product-introduction' },
]);
assert.equal(stale.corp.menu.at(-1).id, 'corp-project', 'Input must not be mutated');

// Current-version remote data must be cleaned; no version bump is required.
const remote = menuService.parseRemoteSnapshot({ sites: stale, version: MENU_SETTINGS_VERSION });
assert.ok(remote);
assertRetiredAbsent(remote);

storage.set('advanced_menu_manager_data', JSON.stringify(stale));
storage.set('advanced_menu_manager_data_version', String(MENU_SETTINGS_VERSION));
menuService.loadRemoteSitesWithTimeout = async () => null;
const fromCache = await menuService.loadAllSites();
assertRetiredAbsent(fromCache);
assertRetiredAbsent(JSON.parse(storage.get('advanced_menu_manager_data')));
assertRetiredAbsent(await menuService.loadAllSites());
console.log('PASS retired corporate pages: defaults, registry, nested links, trash, current-version remote/cache, preserved site modes');
