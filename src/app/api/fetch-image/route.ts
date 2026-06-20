import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_IMAGE_BYTES = 100 * 1024 * 1024;

const FetchImageSchema = z.object({
  url: z.string().url().max(4096),
  fileName: z.string().max(240).optional(),
});

const IMAGE_ACCEPT_HEADER = 'image/avif,image/webp,image/png,image/jpeg,image/gif,image/svg+xml,image/*;q=0.8,*/*;q=0.5';

function isBlockedHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '0.0.0.0' || host === '::1') return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;

  const private172 = host.match(/^172\.(\d+)\./);
  if (private172) {
    const second = Number(private172[1]);
    if (second >= 16 && second <= 31) return true;
  }

  return false;
}

function validateSourceUrl(sourceUrl: URL) {
  if (sourceUrl.protocol !== 'https:' && sourceUrl.protocol !== 'http:') {
    return 'HTTP(S) 이미지 URL만 불러올 수 있습니다.';
  }

  if (isBlockedHost(sourceUrl.hostname)) {
    return '로컬 또는 사설 네트워크 이미지는 불러올 수 없습니다.';
  }

  return null;
}

function getNameExtension(name?: string) {
  return name?.toLowerCase().split('?')[0].match(/\.([a-z0-9]+)$/)?.[1] ?? '';
}

function getMimeFromExtension(extension: string) {
  switch (extension) {
    case 'avif': return 'image/avif';
    case 'gif': return 'image/gif';
    case 'ico': return 'image/x-icon';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'svg': return 'image/svg+xml';
    case 'webp': return 'image/webp';
    default: return '';
  }
}

function isAllowedImageType(contentType: string, fileName?: string) {
  if (contentType.startsWith('image/')) return true;
  const extensionMime = getMimeFromExtension(getNameExtension(fileName));
  return Boolean(extensionMime) && (contentType === '' || contentType === 'application/octet-stream');
}

async function readCappedResponse(response: Response) {
  if (!response.body) {
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
      throw new Error('이미지 크기가 100MB를 초과합니다.');
    }
    return Buffer.from(arrayBuffer);
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_IMAGE_BYTES) {
      throw new Error('이미지 크기가 100MB를 초과합니다.');
    }
    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks);
}

async function fetchImageSource(sourceUrl: URL, redirects = 0): Promise<Response> {
  const response = await fetch(sourceUrl, {
    redirect: 'manual',
    headers: {
      Accept: IMAGE_ACCEPT_HEADER,
    },
  });

  if ([301, 302, 303, 307, 308].includes(response.status)) {
    if (redirects >= 3) {
      throw new Error('이미지 원본 리다이렉트가 너무 많습니다.');
    }

    const location = response.headers.get('location');
    if (!location) {
      throw new Error('이미지 원본 리다이렉트 위치가 없습니다.');
    }

    const nextUrl = new URL(location, sourceUrl);
    const validationError = validateSourceUrl(nextUrl);
    if (validationError) {
      throw new Error(validationError);
    }

    return fetchImageSource(nextUrl, redirects + 1);
  }

  return response;
}

export async function POST(req: NextRequest) {
  try {
    const parsed = FetchImageSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: '이미지 원본 요청 형식이 올바르지 않습니다.', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const sourceUrl = new URL(parsed.data.url);
    const validationError = validateSourceUrl(sourceUrl);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const sourceResponse = await fetchImageSource(sourceUrl);

    if (!sourceResponse.ok) {
      return NextResponse.json(
        { error: `이미지 원본을 불러오지 못했습니다. (${sourceResponse.status})` },
        { status: 502 }
      );
    }

    const contentLength = Number(sourceResponse.headers.get('content-length') ?? 0);
    if (contentLength > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: '이미지 크기가 100MB를 초과합니다.' }, { status: 413 });
    }

    const sourceContentType = sourceResponse.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
    if (!isAllowedImageType(sourceContentType, parsed.data.fileName || sourceUrl.pathname)) {
      return NextResponse.json({ error: '이미지 파일만 불러올 수 있습니다.' }, { status: 415 });
    }

    const buffer = await readCappedResponse(sourceResponse);
    const fallbackContentType = getMimeFromExtension(getNameExtension(parsed.data.fileName || sourceUrl.pathname));
    const contentType = sourceContentType.startsWith('image/') ? sourceContentType : fallbackContentType || 'application/octet-stream';

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[fetch-image] Error:', error);
    const message = error instanceof Error ? error.message : '이미지 원본을 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
