// Pages Router documents do not have App Router RSC/prefetch artifacts.
const documentRoutes = new Set([
  '/admin/tax/purchase-sales/full-inquiry',
  '/admin/menu/AdvancedMenuManager',
]);

export function isDocumentMenuRoute(href: string | undefined): boolean {
  if (!href?.startsWith('/') || href.startsWith('//')) return false;
  return documentRoutes.has(href.split(/[?#]/, 1)[0].replace(/\/+$/, ''));
}
