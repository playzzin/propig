import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { fetchExternalHttpUrl, normalizeExternalHttpUrl } from '@/lib/server/http-safety';
import { requireUserAccessAuth } from '@/lib/server/admin-auth';
import { enforceUserRateLimit } from '@/lib/server/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const EXTERNAL_URL_ERROR_MESSAGES = new Map([
  ['Invalid URL', '올바른 외부 이미지 URL이 아닙니다.'],
  ['Only http and https URLs are allowed.', 'HTTP(S) 이미지 URL만 불러올 수 있습니다.'],
  ['URLs with credentials are not allowed.', '인증 정보가 포함된 이미지 URL은 불러올 수 없습니다.'],
  ['Local and private network URLs are not allowed.', '로컬 또는 사설 네트워크 이미지는 불러올 수 없습니다.'],
  ['The external URL host could not be resolved.', '이미지 원본 호스트를 확인할 수 없습니다.'],
]);

const FetchImageSchema = z.object({
  url: z.string().url().max(4096),
  fileName: z.string().max(240).optional(),
});

const IMAGE_ACCEPT_HEADER =
  'image/avif,image/webp,image/png,image/jpeg,image/gif,image/svg+xml,image/*;q=0.8,*/*;q=0.5';

class ImageTooLargeError extends Error {
  constructor() {
    super('이미지 크기가 25MB를 초과합니다.');
    this.name = 'ImageTooLargeError';
  }
}

function getNameExtension(name?: string) {
  return name?.toLowerCase().split('?')[0].match(/\.([a-z0-9]+)$/)?.[1] ?? '';
}

function getMimeFromExtension(extension: string) {
  switch (extension) {
    case 'avif':
      return 'image/avif';
    case 'gif':
      return 'image/gif';
    case 'ico':
      return 'image/x-icon';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'svg':
      return 'image/svg+xml';
    case 'webp':
      return 'image/webp';
    default:
      return '';
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
    if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) throw new ImageTooLargeError();
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
      await reader.cancel();
      throw new ImageTooLargeError();
    }

    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks);
}

function externalUrlError(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  return EXTERNAL_URL_ERROR_MESSAGES.get(error.message) ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUserAccessAuth(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    const rateLimit = await enforceUserRateLimit({
      namespace: 'fetch-image',
      uid: auth.uid,
      maxRequests: 30,
      windowMs: 60_000,
    });
    if ('retryAfterSeconds' in rateLimit) {
      return NextResponse.json(
        { error: `${rateLimit.retryAfterSeconds}초 후 다시 시도해 주세요.` },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
        },
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = FetchImageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: '이미지 원본 요청 형식이 올바르지 않습니다.', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    let sourceUrl: URL;
    try {
      sourceUrl = new URL(normalizeExternalHttpUrl(parsed.data.url));
    } catch (error) {
      return NextResponse.json({ error: externalUrlError(error) ?? '올바른 외부 이미지 URL이 아닙니다.' }, { status: 400 });
    }

    const sourceResponse = await fetchExternalHttpUrl(sourceUrl.toString(), {
      headers: { Accept: IMAGE_ACCEPT_HEADER },
    });

    if (!sourceResponse.ok) {
      return NextResponse.json(
        { error: `이미지 원본을 불러오지 못했습니다. (${sourceResponse.status})` },
        { status: 502 },
      );
    }

    const contentLength = Number(sourceResponse.headers.get('content-length') ?? 0);
    if (contentLength > MAX_IMAGE_BYTES) {
      await sourceResponse.body?.cancel();
      return NextResponse.json({ error: '이미지 크기가 25MB를 초과합니다.' }, { status: 413 });
    }

    const sourceContentType =
      sourceResponse.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
    if (!isAllowedImageType(sourceContentType, parsed.data.fileName || sourceUrl.pathname)) {
      await sourceResponse.body?.cancel();
      return NextResponse.json({ error: '이미지 파일만 불러올 수 있습니다.' }, { status: 415 });
    }

    const buffer = await readCappedResponse(sourceResponse);
    const fallbackContentType = getMimeFromExtension(
      getNameExtension(parsed.data.fileName || sourceUrl.pathname),
    );
    const contentType = sourceContentType.startsWith('image/')
      ? sourceContentType
      : fallbackContentType || 'application/octet-stream';

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('[fetch-image] Error:', error);

    if (error instanceof ImageTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }

    const urlError = externalUrlError(error);
    if (urlError) {
      return NextResponse.json({ error: urlError }, { status: 400 });
    }

    return NextResponse.json({ error: '이미지 원본을 불러오지 못했습니다.' }, { status: 502 });
  }
}
