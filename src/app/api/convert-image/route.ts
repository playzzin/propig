import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { requireAdminOrPermissionAuth } from '@/lib/server/admin-auth';
import { enforceUserRateLimit } from '@/lib/server/rate-limit';

export const runtime = 'nodejs';

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_INPUT_PIXELS = 24 * 1024 * 1024;
const MAX_ANIMATED_PAGES = 120;
const MAX_OUTPUT_BYTES = 24 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const auth = await requireAdminOrPermissionAuth(request, 'photoManagement');
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const rateLimit = await enforceUserRateLimit({ namespace: 'image-conversion', uid: auth.uid, maxRequests: 12, windowMs: 60_000 });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many image conversion requests.' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } });
  }
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const format = String(formData.get('format') || '');
    const preserveAnimation = String(formData.get('preserveAnimation') ?? 'true') === 'true';
    const quality = Math.min(100, Math.max(1, Number.parseInt(String(formData.get('quality') || '90'), 10) || 90));
    if (!(file instanceof File)) return NextResponse.json({ error: '변환할 파일이 없습니다.' }, { status: 400 });
    if (format !== 'webp') return NextResponse.json({ error: '이 Studio 경로는 WebP 출력만 지원합니다.' }, { status: 400 });
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) return NextResponse.json({ error: '파일 크기는 20MB 이하여야 합니다.' }, { status: 413 });
    const input = Buffer.from(await file.arrayBuffer());
    const options = { animated: preserveAnimation, pages: preserveAnimation ? -1 : 1, limitInputPixels: MAX_INPUT_PIXELS };
    const metadata = await sharp(input, options).metadata();
    if (metadata.format !== 'gif' && metadata.format !== 'webp') return NextResponse.json({ error: 'GIF 또는 WebP 애니메이션만 변환할 수 있습니다.' }, { status: 415 });
    if ((metadata.pages || 1) > MAX_ANIMATED_PAGES) return NextResponse.json({ error: '애니메이션은 120프레임 이하여야 합니다.' }, { status: 413 });
    const data = await sharp(input, options).rotate().webp({ quality, alphaQuality: Math.max(quality, 80), effort: 6, smartSubsample: true, preset: 'photo' }).toBuffer();
    if (data.length > MAX_OUTPUT_BYTES) return NextResponse.json({ error: '변환 결과가 24MB를 초과했습니다.' }, { status: 413 });
    const decoded = await sharp(data, { animated: true, pages: -1, limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    const decodedPages = decoded.pages || 1;
    const inputPages = metadata.pages || 1;
    if (decoded.format !== 'webp' || decodedPages !== inputPages || !decoded.width || !decoded.height) {
      return NextResponse.json({ error: '완성된 WebP의 디코딩 검증에 실패했습니다.' }, { status: 422 });
    }
    const pageHeight = decoded.pageHeight || Math.floor(decoded.height / decodedPages);
    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        'Content-Type': 'image/webp',
        'Content-Length': String(data.length),
        'Cache-Control': 'no-store',
        'X-Image-Width': String(decoded.width),
        'X-Image-Height': String(pageHeight),
        'X-Image-Pages': String(decodedPages),
        'X-Image-Animated': String(decodedPages > 1),
        'X-Image-Loop': String(decoded.loop ?? 0),
        'X-Image-Alpha': String(Boolean(decoded.hasAlpha)),
        'X-Image-Delays': (decoded.delay || []).join(','),
      },
    });
  } catch (error) {
    console.error('[convert-image] conversion failed', error);
    return NextResponse.json({ error: '이미지 변환에 실패했습니다.' }, { status: 500 });
  }
}
