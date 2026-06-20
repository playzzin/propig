import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { LLMAdapterFactory } from '@/agents/llm/LLMAdapter';
import { getGeminiRuntimeConfig } from '@/lib/server/gemini';
import { requireAdminOrPermissionAuth } from '@/lib/server/admin-auth';

const SectionSchema = z.enum(['current', 'plan', 'goal']);

const DraftTaskSchema = z.object({
  title: z.string().optional(),
  done: z.boolean().optional(),
});

const GenerateProjectBoardContentRequestSchema = z.object({
  mode: z.enum(['project', 'portfolio']),
  section: SectionSchema,
  title: z.string().optional(),
  categoryName: z.string().optional(),
  owner: z.string().optional(),
  dueDate: z.string().optional(),
  stageLabel: z.string().optional(),
  statusLabel: z.string().optional(),
  summary: z.string().optional(),
  currentBody: z.string().optional(),
  planBody: z.string().optional(),
  goalBody: z.string().optional(),
  tasks: z.array(DraftTaskSchema).optional(),
});

type GenerateProjectBoardContentRequest = z.infer<typeof GenerateProjectBoardContentRequestSchema>;

type GeneratedProjectBoardContent = {
  currentHtml?: string;
  planHtml?: string;
  goalHtml?: string;
};

const allowedHtmlTags = new Set([
  'article',
  'section',
  'header',
  'div',
  'h3',
  'h4',
  'p',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'strong',
  'em',
  'b',
  'i',
  'span',
  'small',
  'br',
]);

function cleanModelText(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function extractJsonObjectText(text: string): string {
  const cleaned = cleanModelText(text);
  const objectStart = cleaned.indexOf('{');
  const objectEnd = cleaned.lastIndexOf('}');

  if (objectStart === -1) {
    throw new Error('Gemini response does not contain a JSON object.');
  }

  if (objectEnd !== -1 && objectEnd > objectStart) {
    return cleaned.substring(objectStart, objectEnd + 1);
  }

  throw new Error('Gemini response contains incomplete JSON.');
}

function repairJsonObjectText(text: string): string {
  return text
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/}\s*(?={)/g, '},')
    .replace(/]\s*(?="(?:currentHtml|planHtml|goalHtml)")/g, '],')
    .replace(/"\s*(?="(?:currentHtml|planHtml|goalHtml)")/g, '",');
}

function parseGeneratedJson(text: string): unknown {
  const jsonText = extractJsonObjectText(text);
  const repairedText = repairJsonObjectText(jsonText);
  const attempts = [jsonText, repairedText].filter((value, index, values) => values.indexOf(value) === index);
  let lastError: unknown;

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt) as unknown;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Gemini response is not valid JSON.');
}

function sanitizeHtmlFragment(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;

  const cleaned = value
    .replace(/```(?:html)?/gi, '')
    .replace(/```/g, '')
    .replace(/<!doctype[^>]*>/gi, '')
    .replace(/<\/?(?:html|head|body)[^>]*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(
      /<(?:script|style|iframe|object|embed|form|input|button|link|meta|svg|math)\b[\s\S]*?<\/(?:script|style|iframe|object|embed|form|input|button|link|meta|svg|math)>/gi,
      '',
    )
    .replace(/<(?:script|style|iframe|object|embed|form|input|button|link|meta|svg|math)\b[^>]*\/?>/gi, '')
    .replace(/<\/?([a-z][a-z0-9-]*)([^>]*)>/gi, (match, tagName, attrs) => {
      const tag = String(tagName).toLowerCase();
      if (!allowedHtmlTags.has(tag)) return '';
      if (match.startsWith('</')) return `</${tag}>`;
      if (tag === 'br') return '<br>';

      const safeAttrs = Array.from(String(attrs).matchAll(/\s(rowspan|colspan)=["']?(\d{1,2})["']?/gi))
        .map(([, name, rawValue]) => {
          if (tag !== 'td' && tag !== 'th') return '';
          const valueNumber = Math.max(1, Math.min(8, Number(rawValue) || 1));
          return ` ${String(name).toLowerCase()}="${valueNumber}"`;
        })
        .join('');

      return `<${tag}${safeAttrs}>`;
    })
    .trim();

  return cleaned.length > 0 ? cleaned : undefined;
}

function normalizeGeneratedContent(
  raw: unknown,
  section: GenerateProjectBoardContentRequest['section'],
): GeneratedProjectBoardContent {
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const content: GeneratedProjectBoardContent = {};

  if (section === 'current') {
    content.currentHtml = sanitizeHtmlFragment(record.currentHtml);
  }

  if (section === 'plan') {
    content.planHtml = sanitizeHtmlFragment(record.planHtml);
  }

  if (section === 'goal') {
    content.goalHtml = sanitizeHtmlFragment(record.goalHtml);
  }

  return Object.fromEntries(Object.entries(content).filter(([, value]) => value !== undefined)) as GeneratedProjectBoardContent;
}

function buildResponseShape(section: GenerateProjectBoardContentRequest['section']): string {
  if (section === 'current') return '{"currentHtml":"<section>...</section>"}';
  if (section === 'plan') return '{"planHtml":"<section>...</section>"}';
  return '{"goalHtml":"<section>...</section>"}';
}

function getSourceBody(payload: GenerateProjectBoardContentRequest): string {
  if (payload.section === 'current') return payload.currentBody?.trim() ?? '';
  if (payload.section === 'plan') return payload.planBody?.trim() ?? '';
  return payload.goalBody?.trim() ?? '';
}

function buildProjectBoardSystemPrompt(payload: GenerateProjectBoardContentRequest): string {
  const pageType = payload.mode === 'portfolio' ? 'completed project portfolio' : 'active project planning board';

  return [
    'You are a Korean corporate HTML layout designer.',
    `Create a display-only HTML fragment for a ${pageType}.`,
    'Do not rewrite or replace the saved body text. Use the supplied body text as the source material and transform it into semantic HTML for presentation.',
    'Return exactly one valid JSON object. Do not include markdown, code fences, or explanatory text.',
    `Only write the requested section. The response shape must exactly match ${buildResponseShape(payload.section)}.`,
    'Use the exact English camelCase JSON key shown in the response shape.',
    'The HTML value must be a fragment, not a full document.',
    'Allowed tags: article, section, header, div, h3, h4, p, ul, ol, li, table, thead, tbody, tfoot, tr, th, td, strong, em, b, i, span, small, br.',
    'Do not use class, id, style, data attributes, event attributes, links, images, forms, scripts, buttons, iframes, SVG, or external resources.',
    'Use two to four compact sections. Use a table when it helps organize scope, criteria, schedule, risks, or responsibility.',
    'Preserve facts from the source text and project context. Do not invent metrics, dates, names, budgets, or promises.',
    'Keep Korean copy concise, professional, and suitable for a corporate project board.',
  ].join('\n');
}

function buildUserPrompt(payload: GenerateProjectBoardContentRequest): string {
  return JSON.stringify(
    {
      mode: payload.mode,
      section: payload.section,
      title: payload.title || '',
      categoryName: payload.categoryName || '',
      owner: payload.owner || '',
      dueDate: payload.dueDate || '',
      stageLabel: payload.stageLabel || '',
      statusLabel: payload.statusLabel || '',
      summary: payload.summary || '',
      sourceBody: getSourceBody(payload),
      relatedBodies: {
        currentBody: payload.currentBody || '',
        planBody: payload.planBody || '',
        goalBody: payload.goalBody || '',
      },
      tasks: payload.tasks || [],
    },
    null,
    2,
  );
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminOrPermissionAuth(req, 'projectBoardManagement');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const parsedPayload = GenerateProjectBoardContentRequestSchema.safeParse(await req.json());
    if (!parsedPayload.success) {
      return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
    }

    const payload = parsedPayload.data;
    const title = payload.title?.trim();
    const sourceBody = getSourceBody(payload);

    if (!title) {
      return NextResponse.json({ error: '프로젝트 제목을 먼저 입력하세요.' }, { status: 400 });
    }

    if (!sourceBody) {
      return NextResponse.json({ error: 'HTML로 꾸밀 본문을 먼저 입력하세요.' }, { status: 400 });
    }

    const runtimeConfig = await getGeminiRuntimeConfig();
    if (!runtimeConfig.apiKey) {
      return NextResponse.json({ error: 'Gemini API 키가 설정되어 있지 않습니다.' }, { status: 503 });
    }

    const adapter = LLMAdapterFactory.create('gemini', {
      gemini: {
        apiKey: runtimeConfig.apiKey,
        model: runtimeConfig.model,
      },
    });

    const result = await adapter.chat(
      [
        { role: 'system', content: buildProjectBoardSystemPrompt(payload) },
        { role: 'user', content: buildUserPrompt(payload) },
      ],
      {
        temperature: 0.28,
        maxTokens: 3600,
      },
    );

    const raw = parseGeneratedJson(result.content.trim());
    const content = normalizeGeneratedContent(raw, payload.section);

    if (Object.keys(content).length === 0) {
      return NextResponse.json({ error: 'Gemini가 사용할 수 있는 HTML 디자인을 반환하지 않았습니다.' }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      provider: 'gemini',
      model: runtimeConfig.model,
      content,
    });
  } catch (error) {
    console.error('[ProjectBoardContent] Gemini HTML generation failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Gemini HTML 디자인 생성 중 오류가 발생했습니다.',
      },
      { status: 500 },
    );
  }
}
