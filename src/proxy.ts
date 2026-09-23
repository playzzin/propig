import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { CORP_PAGE_DEFINITIONS } from '@/constants/corpPages';

const COMPANY_ROUTE_PREFIX = '/corp/company/';
const KNOWN_COMPANY_PATHS = new Set([
  ...CORP_PAGE_DEFINITIONS
    .map((page) => page.path)
    .filter((path) => path.startsWith(COMPANY_ROUTE_PREFIX)),
  '/corp/company/business-area',
]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith(COMPANY_ROUTE_PREFIX) && !KNOWN_COMPANY_PATHS.has(pathname)) {
    const notFoundUrl = request.nextUrl.clone();
    notFoundUrl.pathname = '/_not-found';
    return NextResponse.rewrite(notFoundUrl, { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/corp/company/:path*'],
};
