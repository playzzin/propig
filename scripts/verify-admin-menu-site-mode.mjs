import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const serviceSource = read('src/services/menuService.ts');
const apiSource = read('src/app/api/admin/menu-sites/route.ts');
const hostingApiSource = read('functions/src/api/hostingCoreRoutes.ts');
const sidebarSource = read('src/components/Sidebar.tsx');
const menuContextSource = read('src/contexts/MenuContext.tsx');
const profileButtonSource = read('src/components/ProfileButton.tsx');
const erpHomeSource = read('src/components/erp/ErpHomePage.tsx');
const menuPagesSource = read('src/constants/menuPages.ts');
const siteHomeSource = read('src/constants/siteHome.ts');

const serviceVersion = serviceSource.match(/CURRENT_DATA_VERSION\s*=\s*(\d+)/)?.[1];
const apiVersion = apiSource.match(/MENU_SETTINGS_VERSION\s*=\s*(\d+)/)?.[1];
assert.ok(serviceVersion, 'menuService CURRENT_DATA_VERSION was not found');
assert.ok(apiVersion, 'menu-sites API MENU_SETTINGS_VERSION was not found');
assert.equal(apiVersion, serviceVersion, 'menuSettings API and client data versions must match');
assert.ok(
  hostingApiSource.includes(`version: ${serviceVersion}`),
  'Firebase Hosting menu API and client data versions must match',
);

assert.ok(
  menuContextSource.includes('getFirstAccessibleSiteId'),
  'MenuContext must restore currentSite through the shared site-access helper',
);
assert.ok(
  profileButtonSource.includes('canAccessSiteMode'),
  'ProfileButton site switcher must use the shared site-access helper',
);
assert.ok(
  erpHomeSource.includes('filterMenuItemsForAccess'),
  'ERP home must derive menu commands from the shared menu-access filter',
);
assert.ok(
  !sidebarSource.includes('siteData[currentEnv]?.menu'),
  'Sidebar must not bypass filteredMenu for shop/site mode rendering',
);
assert.ok(
  serviceSource.includes('siteHasMenuTarget(adminSite'),
  'Admin menu migrations must check menu and trash before seeding required routes',
);

const pageMakerCleanupStart = serviceSource.indexOf('private isAdminPageMakerMenuItem');
const pageMakerCleanupEnd = serviceSource.indexOf('private cleanupVideoStudioMenu');
assert.ok(pageMakerCleanupStart >= 0 && pageMakerCleanupEnd > pageMakerCleanupStart, 'admin page-maker cleanup block was not found');
const pageMakerCleanupSource = serviceSource.slice(pageMakerCleanupStart, pageMakerCleanupEnd);
assert.ok(
  !pageMakerCleanupSource.includes("item.id === 'admin-17'"),
  'admin-17 must not be removed by page-maker cleanup because it is the activity-log menu id',
);

const requiredAdminPaths = [
  '/admin/emoticon-studio',
  '/admin/menu',
  '/admin/photos',
  '/admin/storage',
  '/admin/users',
  '/admin/activity-logs',
];

for (const routePath of requiredAdminPaths) {
  assert.ok(menuPagesSource.includes(`path: '${routePath}'`), `${routePath} must be available in MENU_PAGE_OPTIONS`);
}

assert.ok(
  serviceSource.includes('applyAdminEmoticonStudioMenu'),
  'stored admin menus must be migrated with the AI emoticon studio route',
);
assert.ok(
  serviceSource.includes("id: 'admin-20'") && serviceSource.includes("path: '/admin/emoticon-studio'"),
  'the default admin sidebar must include the AI emoticon studio menu item',
);

assert.ok(
  !menuPagesSource.includes("path: '/admin/workspace-files'"),
  '/admin/workspace-files must not be available in MENU_PAGE_OPTIONS',
);
assert.ok(
  !serviceSource.includes('applyAdminWorkspaceFilesMenu'),
  'workspace-files menu must not be seeded during menu migrations',
);
assert.ok(
  serviceSource.includes('cleanupAdminWorkspaceFilesMenu'),
  'workspace-files menu entries must be removed from stored menu data',
);
assert.ok(siteHomeSource.includes("blog: '/blog'"), 'Blog mode must resolve to the blog dashboard route');
assert.ok(menuContextSource.includes("return 'blog'"), 'Blog routes must activate blog mode in MenuContext');
assert.ok(menuPagesSource.includes("path: '/blog'"), 'The blog dashboard must be available in menu page options');

const menuPagePaths = [...menuPagesSource.matchAll(/path:\s*'([^']+)'/g)].map((match) => match[1]);
const duplicatePaths = menuPagePaths.filter((routePath, index) => menuPagePaths.indexOf(routePath) !== index);
assert.deepEqual([...new Set(duplicatePaths)], [], 'MENU_PAGE_OPTIONS must not contain duplicate paths');

console.log(`admin menu site-mode invariants passed (${requiredAdminPaths.length} required admin routes, version ${serviceVersion})`);
