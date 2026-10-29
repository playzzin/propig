import assert from 'node:assert/strict';
import { isDocumentMenuRoute } from '../src/lib/menu-navigation.ts';

for (const href of ['/admin/tax/purchase-sales/full-inquiry', '/admin/tax/purchase-sales/full-inquiry/?year=2026#summary', '/admin/menu/AdvancedMenuManager']) {
  assert.equal(isDocumentMenuRoute(href), true, href);
}
for (const href of [undefined, '/admin/storyboard', '/corp', '/admin/tax/purchase-sales/full-inquiry-other', '//example.com/admin/menu/AdvancedMenuManager', 'https://example.com/admin/menu/AdvancedMenuManager']) {
  assert.equal(isDocumentMenuRoute(href), false, String(href));
}
console.log('PASS document-menu routes: legacy pages use full navigation; App Router and external URLs stay separate.');
