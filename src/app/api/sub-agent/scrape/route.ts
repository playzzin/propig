import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';

const RequestSchema = z
  .object({
    prompt: z.string().min(1),
    url: z.string().optional(),
  })
  .strict();

type ScrapeResult =
  | {
      type: 'naver_news_ranking';
      source: string;
      count: number;
      url: string;
      articles: Array<{ rank: number; title: string }>;
      scrapedAt: string;
    }
  | {
      type: 'generic_page';
      url: string;
      title: string;
      description: string;
      meta: Record<string, string>;
      textPreview: string;
      scrapedAt: string;
    };

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

const clampText = (value: string, max: number): string => {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
};

const extractUrl = (text: string): string | null => {
  const match = text.match(/https?:\/\/[^\s]+/);
  return match?.[0] ?? null;
};

const isPrivateIpLiteral = (hostname: string): boolean => {
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;

  const parts = ipv4.slice(1).map((v) => Number(v));
  if (parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return true;

  const [a, b] = parts;

  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
};

const normalizeAndValidateUrl = (raw: string): { ok: true; url: string } | { ok: false; error: string } => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: '유효하지 않은 URL입니다.' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'http/https URL만 허용됩니다.' };
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return { ok: false, error: 'localhost 접근은 차단됩니다.' };
  }

  if (isPrivateIpLiteral(hostname)) {
    return { ok: false, error: '사설 IP 대역 접근은 차단됩니다.' };
  }

  return { ok: true, url: url.toString() };
};

const normalizeCharsetLabel = (charset: string): string => {
  const lower = charset.trim().toLowerCase();
  if (!lower) return 'utf-8';
  if (lower === 'euckr' || lower === 'euc_kr' || lower === 'euc-kr') return 'euc-kr';
  if (lower === 'utf8') return 'utf-8';
  return lower;
};

const decodeHtmlResponse = async (response: Response): Promise<string> => {
  const contentType = response.headers.get('content-type') || '';
  const match = contentType.match(/charset\s*=\s*([^;]+)/i);
  const charsetRaw = match?.[1] ?? 'utf-8';
  const charset = normalizeCharsetLabel(charsetRaw);

  const buffer = Buffer.from(await response.arrayBuffer());

  try {
    const decoder = new TextDecoder(charset);
    return decoder.decode(buffer);
  } catch {
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(buffer);
  }
};

const inferUrl = (prompt: string): string | null => {
  const lower = prompt.toLowerCase();

  if (lower.includes('네이버 뉴스') || lower.includes('네이버뉴스')) {
    return 'https://news.naver.com/main/ranking/popularDay.naver';
  }
  if (lower.includes('다음 뉴스') || lower.includes('다음뉴스')) {
    return 'https://news.daum.net/ranking/popular';
  }
  if (lower.includes('구글 뉴스') || lower.includes('google news')) {
    return 'https://news.google.com/home?hl=ko&gl=KR&ceid=KR:ko';
  }

  return null;
};

const extractTitleFromHtml = (html: string): string => {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match?.[1]) return '';
  return match[1].replace(/\s+/g, ' ').trim();
};

const extractMetaFromHtml = (html: string): Record<string, string> => {
  const keys = [
    'description',
    'og:title',
    'og:description',
    'og:image',
    'og:url',
    'twitter:title',
    'twitter:description',
    'twitter:image',
  ] as const;

  const meta: Record<string, string> = {};

  const getContent = (key: string): string => {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`,
      'i',
    );
    const match = html.match(pattern);
    return match?.[1]?.trim() ?? '';
  };

  for (const k of keys) {
    const v = getContent(k);
    if (v) meta[k] = v;
  }

  const canonicalMatch = html.match(
    /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i,
  );
  if (canonicalMatch?.[1]) meta.canonical = canonicalMatch[1].trim();

  return meta;
};

const extractTextFromHtml = (html: string): string => {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
};

const parseNaverNewsRanking = (html: string): Array<{ rank: number; title: string }> => {
  const articles: Array<{ rank: number; title: string }> = [];

  const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (jsonLdMatch?.[1]) {
    try {
      const jsonData = JSON.parse(jsonLdMatch[1]) as unknown;
      if (typeof jsonData === 'object' && jsonData !== null && 'itemListElement' in jsonData) {
        const list = (jsonData as { itemListElement?: unknown }).itemListElement;
        if (Array.isArray(list)) {
          for (const item of list.slice(0, 10)) {
            if (typeof item !== 'object' || item === null) continue;
            const record = item as Record<string, unknown>;
            const position = record.position;
            const name = record.name;
            const itemObj = record.item;
            const nestedName =
              typeof itemObj === 'object' && itemObj !== null && 'name' in itemObj
                ? (itemObj as { name?: unknown }).name
                : undefined;

            articles.push({
              rank: typeof position === 'number' ? position : articles.length + 1,
              title: String((typeof name === 'string' && name) || (typeof nestedName === 'string' && nestedName) || 'Unknown'),
            });
          }
        }
      }
    } catch {
      // ignore
    }
  }

  if (articles.length === 0) {
    const titleMatches = html.matchAll(
      /<a[^>]*class="[^"]*(?:list_content|list_title|rankingnews_list)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi,
    );

    let rank = 1;
    for (const match of titleMatches) {
      if (rank > 10) break;
      const raw = match[1] ?? '';
      const title = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (!title) continue;
      articles.push({ rank, title });
      rank += 1;
    }
  }

  return articles.slice(0, 10);
};

export async function POST(req: NextRequest) {
  const startedAtMs = Date.now();

  try {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }

    const body = await req.json();
    const input = RequestSchema.parse(body);

    const targetUrl = input.url?.trim() || extractUrl(input.prompt) || inferUrl(input.prompt) || '';
    if (!targetUrl) {
      return NextResponse.json(
        {
          ok: false,
          error: '스크래핑할 URL을 찾지 못했습니다. 프롬프트에 URL을 포함하거나 대상 사이트를 명시하세요.',
        },
        { status: 400 },
      );
    }

    const normalized = normalizeAndValidateUrl(targetUrl);
    if (!normalized.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: normalized.error,
          url: targetUrl,
        },
        { status: 400 },
      );
    }

    const response = await fetch(normalized.url, {
      redirect: 'follow',
      headers: DEFAULT_HEADERS,
    });

    if (!response.ok) {
      const processingTime = Date.now() - startedAtMs;
      return NextResponse.json(
        {
          ok: false,
          error: `Fetch failed: ${response.status}`,
          url: targetUrl,
          processingTime,
        },
        { status: 502 },
      );
    }

    const finalUrl = response.url || targetUrl;
    const rawHtml = await decodeHtmlResponse(response);
    const html = clampText(rawHtml, 250_000);

    let result: ScrapeResult;

    if (finalUrl.includes('news.naver.com/main/ranking')) {
      const articles = parseNaverNewsRanking(html);
      result = {
        type: 'naver_news_ranking',
        source: 'news.naver.com',
        url: finalUrl,
        count: articles.length,
        articles,
        scrapedAt: new Date().toISOString(),
      };
    } else {
      const title = extractTitleFromHtml(html);
      const meta = extractMetaFromHtml(html);
      const description = meta['og:description'] || meta.description || '';
      const text = extractTextFromHtml(html);
      const textPreview = clampText(text, 1200);

      result = {
        type: 'generic_page',
        url: finalUrl,
        title: meta['og:title'] || title,
        description,
        meta,
        textPreview,
        scrapedAt: new Date().toISOString(),
      };
    }

    const processingTime = Date.now() - startedAtMs;

    return NextResponse.json({ ok: true, url: finalUrl, result, processingTime });
  } catch (error) {
    const processingTime = Date.now() - startedAtMs;

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid request body',
          details: error.issues,
          processingTime,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        processingTime,
      },
      { status: 500 },
    );
  }
}
