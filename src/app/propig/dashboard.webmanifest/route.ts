import siteManifest from '../../../../public/manifest.json';

export const dynamic = 'force-static';

export function GET() {
  return Response.json({
    ...siteManifest,
    id: '/propig',
    start_url: '/propig',
    name: '그뚠웹',
    short_name: '그뚠웹',
    description: '메모와 할 일, 습관, 날씨, PC 상태와 국내 증시를 모아 보는 대시보드',
  }, { headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' } });
}
