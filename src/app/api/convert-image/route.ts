import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { requireUserAuth } from '@/lib/server/user-auth';
import { enforceUserRateLimit } from '@/lib/server/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SUPPORTED_FORMATS = ['avif', 'gif', 'jpeg', 'png', 'webp'] as const;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_DIMENSION = 4096;
const MAX_INPUT_PIXELS = 24 * 1024 * 1024;
const MAX_OUTPUT_PIXELS = 16 * 1024 * 1024;
const MAX_ANIMATED_PAGES = 120;
const MAX_OUTPUT_BYTES = 24 * 1024 * 1024;
const IMAGE_CONVERSION_RATE_LIMIT = {
  maxRequests: 12,
  windowMs: 60_000,
} as const;

type OutputFormat = (typeof SUPPORTED_FORMATS)[number];

class ImageConversionInputError extends Error {
  constructor(message: string, readonly status: 400 | 413 = 400) {
    super(message);
    this.name = 'ImageConversionInputError';
  }
}

function isOutputFormat(value: string): value is OutputFormat {
  return (SUPPORTED_FORMATS as readonly string[]).includes(value);
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseInteger(value: FormDataEntryValue | null, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return clampNumber(parsed, min, max);
}

function parseFloatValue(value: FormDataEntryValue | null, fallback: number, min: number, max: number) {
  const parsed = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return clampNumber(parsed, min, max);
}

function parseBoolean(value: FormDataEntryValue | null, fallback: boolean) {
  if (value == null) {
    return fallback;
  }

  return String(value) === 'true';
}

function parseBackground(value: FormDataEntryValue | null) {
  const candidate = String(value ?? '').trim();
  return /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(candidate) ? candidate : '#ffffff';
}

function getCropPosition(focalX: number, focalY: number) {
  const horizontal = focalX < 34 ? 'left' : focalX > 66 ? 'right' : 'centre';
  const vertical = focalY < 34 ? 'top' : focalY > 66 ? 'bottom' : 'centre';
  if (horizontal === 'centre' && vertical === 'centre') return 'centre';
  if (horizontal === 'centre') return vertical;
  if (vertical === 'centre') return horizontal;
  return `${horizontal} ${vertical}`;
}

function clampOutputDimensions(width: number, height: number): { width: number; height: number } {
  let nextWidth = Math.max(1, Math.min(Math.round(width), MAX_DIMENSION));
  let nextHeight = Math.max(1, Math.min(Math.round(height), MAX_DIMENSION));
  const pixels = nextWidth * nextHeight;

  if (pixels > MAX_OUTPUT_PIXELS) {
    const scale = Math.sqrt(MAX_OUTPUT_PIXELS / pixels);
    nextWidth = Math.max(1, Math.floor(nextWidth * scale));
    nextHeight = Math.max(1, Math.floor(nextHeight * scale));
  }

  return { width: nextWidth, height: nextHeight };
}

function getBoundedOutputDimensions(inputWidth: number | undefined, inputHeight: number | undefined, maxWidth: number, maxHeight: number) {
  const fallbackWidth = Math.min(inputWidth || 1024, MAX_DIMENSION);
  const fallbackHeight = Math.min(inputHeight || 1024, MAX_DIMENSION);
  return clampOutputDimensions(maxWidth || fallbackWidth, maxHeight || fallbackHeight);
}

function isAnimationCapableInput(file: File) {
  const lowerName = file.name.toLowerCase();
  return (
    file.type === 'image/gif' ||
    file.type === 'image/webp' ||
    lowerName.endsWith('.gif') ||
    lowerName.endsWith('.webp')
  );
}

function getMimeType(format: OutputFormat) {
  switch (format) {
    case 'avif':
      return 'image/avif';
    case 'gif':
      return 'image/gif';
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireUserAuth(req);
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.message }, { status: authResult.status });
    }

    let rateLimit;
    try {
      rateLimit = await enforceUserRateLimit({
        namespace: 'image-conversion',
        uid: authResult.uid,
        ...IMAGE_CONVERSION_RATE_LIMIT,
      });
    } catch (error) {
      console.error('[convert-image] Rate limit check failed:', error);
      return NextResponse.json({ error: 'Image conversion is temporarily unavailable. Please try again shortly.' }, { status: 503 });
    }

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many image conversion requests. Please try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
      );
    }

    const formData = await req.formData();
    const file = formData.get('file');
    const format = String(formData.get('format') ?? '');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '변환할 파일이 없습니다.' }, { status: 400 });
    }

    if (!isOutputFormat(format)) {
      return NextResponse.json(
        { error: `지원하지 않는 출력 포맷입니다. 지원 포맷: ${SUPPORTED_FORMATS.join(', ')}` },
        { status: 400 }
      );
    }

    if (file.size <= 0) {
      return NextResponse.json({ error: '빈 파일은 변환할 수 없습니다.' }, { status: 400 });
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: '파일 크기는 20MB를 초과할 수 없습니다.' }, { status: 413 });
    }

    const quality = parseInteger(formData.get('quality'), 82, 1, 100);
    const maxWidth = parseInteger(formData.get('maxWidth'), 0, 0, MAX_DIMENSION);
    const maxHeight = parseInteger(formData.get('maxHeight'), 0, 0, MAX_DIMENSION);
    const stripMeta = parseBoolean(formData.get('stripMeta'), true);
    const flatten = parseBoolean(formData.get('flatten'), format === 'jpeg');
    const preserveAnimation = parseBoolean(formData.get('preserveAnimation'), true);
    const background = parseBackground(formData.get('background'));
    const gifColors = parseInteger(formData.get('gifColors'), 256, 2, 256);
    const gifDither = parseFloatValue(formData.get('gifDither'), 1, 0, 1);
    const squareCrop = parseBoolean(formData.get('squareCrop'), false);
    const focalX = parseInteger(formData.get('focalX'), 50, 0, 100);
    const focalY = parseInteger(formData.get('focalY'), 50, 0, 100);

    const shouldUseAnimatedPipeline =
      preserveAnimation && (format === 'gif' || format === 'webp') && isAnimationCapableInput(file);

    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const sharpOptions = shouldUseAnimatedPipeline
      ? { animated: true, pages: -1, limitInputPixels: MAX_INPUT_PIXELS }
      : { limitInputPixels: MAX_INPUT_PIXELS };

    const inputMetadata = await sharp(inputBuffer, sharpOptions).metadata();
    const inputWidth = inputMetadata.width ?? 0;
    const inputHeight = inputMetadata.height ?? 0;
    const inputPixels = inputWidth * inputHeight;
    const inputPages = inputMetadata.pages ?? 1;

    if (inputPixels > MAX_INPUT_PIXELS) {
      throw new ImageConversionInputError('The image resolution exceeds the allowed limit.', 413);
    }
    if (inputPages > MAX_ANIMATED_PAGES) {
      throw new ImageConversionInputError('The animation frame count exceeds the allowed limit.', 413);
    }

    let pipeline = sharp(inputBuffer, sharpOptions).rotate();

    if (!stripMeta) {
      pipeline = pipeline.keepMetadata();
    }

    if (squareCrop) {
      const fallbackSize = inputWidth > 0 && inputHeight > 0 ? Math.min(inputWidth, inputHeight) : 1024;
      const requestedSize = maxWidth > 0 && maxHeight > 0 ? Math.min(maxWidth, maxHeight) : maxWidth || maxHeight || fallbackSize;
      const targetSize = clampOutputDimensions(requestedSize, requestedSize).width;
      pipeline = pipeline.resize({
        width: targetSize,
        height: targetSize,
        fit: 'cover',
        position: getCropPosition(focalX, focalY),
        withoutEnlargement: true,
      });
    } else {
      const outputDimensions = getBoundedOutputDimensions(inputWidth, inputHeight, maxWidth, maxHeight);
      pipeline = pipeline.resize({
        width: outputDimensions.width,
        height: outputDimensions.height,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    if (flatten || format === 'jpeg') {
      pipeline = pipeline.flatten({ background });
    }

    switch (format) {
      case 'avif':
        pipeline = pipeline.avif({
          quality,
          effort: 6,
          chromaSubsampling: quality >= 88 ? '4:4:4' : '4:2:0',
        });
        break;
      case 'gif':
        pipeline = pipeline.gif({
          colors: gifColors,
          effort: 8,
          dither: gifDither,
          reuse: true,
        });
        break;
      case 'jpeg':
        pipeline = pipeline.jpeg({
          quality,
          progressive: true,
          mozjpeg: true,
          chromaSubsampling: quality >= 88 ? '4:4:4' : '4:2:0',
        });
        break;
      case 'png':
        pipeline = pipeline.png(
          quality < 96
            ? {
                palette: true,
                quality,
                effort: 10,
                compressionLevel: 9,
                adaptiveFiltering: true,
              }
            : {
                compressionLevel: 9,
                adaptiveFiltering: true,
              }
        );
        break;
      case 'webp':
        pipeline = pipeline.webp({
          quality,
          alphaQuality: Math.max(quality, 80),
          effort: 6,
          smartSubsample: true,
          preset: 'photo',
        });
        break;
    }

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    if (data.byteLength > MAX_OUTPUT_BYTES) {
      throw new ImageConversionInputError('The converted image exceeds the allowed output size.', 413);
    }
    const isAnimatedOutput = Boolean(info.pages && info.pages > 1);
    const pageHeight =
      typeof (info as { pageHeight?: number }).pageHeight === 'number'
        ? (info as { pageHeight?: number }).pageHeight
        : undefined;

    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        'Content-Type': getMimeType(format),
        'Content-Length': String(data.length),
        'Cache-Control': 'no-store',
        'X-Image-Width': String(info.width ?? inputMetadata.width ?? 0),
        'X-Image-Height': String(pageHeight ?? info.height ?? inputMetadata.height ?? 0),
        'X-Image-Pages': String(info.pages ?? inputMetadata.pages ?? 1),
        'X-Image-Animated': String(isAnimatedOutput),
      },
    });
  } catch (error) {
    console.error('[convert-image] Error:', error);

    if (error instanceof ImageConversionInputError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && /pixel limit|input image exceeds/i.test(error.message)) {
      return NextResponse.json({ error: '이미지 해상도가 허용 범위를 초과했습니다.' }, { status: 413 });
    }

    return NextResponse.json({ error: '이미지 변환 중 오류가 발생했습니다. 다시 시도해 주세요.' }, { status: 500 });
  }
}
