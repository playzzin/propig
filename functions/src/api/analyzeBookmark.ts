
import { onRequest } from 'firebase-functions/v2/https';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import * as logger from 'firebase-functions/logger';
import { fetchExternalHttpUrl, normalizeExternalHttpUrl, requireAuthenticatedUser } from './security';
import { geminiApiKey } from '../secrets';

// Zod schema for the Gemini response
const AnalysisResponseSchema = z.object({
    title: z.string(),
    description: z.string(),
    category: z.enum(['업무', '학습', '개인', '참고']),
    tags: z.array(z.string()),
    keyTakeaways: z.array(z.string()).optional(),
});

/**
 * Extracts YouTube Video ID from various URL formats
 */
function extractYoutubeId(url: string): string | null {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

/**
 * Fetches YouTube Metadata via oEmbed
 */
async function fetchYoutubeOembed(videoId: string) {
    try {
        const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        const res = await fetch(oembedUrl);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        logger.warn('YouTube oEmbed fetch failed:', e);
        return null;
    }
}

export const analyzeBookmark = onRequest({ cors: true, secrets: [geminiApiKey] }, async (req, res) => {
    try {
        if (req.method === 'OPTIONS') {
            res.status(204).send('');
            return;
        }

        const authResult = await requireAuthenticatedUser(req);
        if (!authResult.ok) {
            res.status(authResult.status).json({ error: authResult.message });
            return;
        }

        const { url } = req.body;

        if (!url) {
            res.status(400).json({ error: 'URL is required' });
            return;
        }

        let safeUrl: string;
        try {
            safeUrl = normalizeExternalHttpUrl(String(url));
        } catch (error) {
            res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid URL' });
            return;
        }

        // 1. Fetch Metadata
        let htmlContext = '';
        let basicMetadata = { title: '', description: '', author: '' };

        const youtubeId = extractYoutubeId(safeUrl);

        if (youtubeId) {
            logger.info(`[API] Detected YouTube URL. ID: ${youtubeId}. Trying oEmbed...`);
            const oembedData = await fetchYoutubeOembed(youtubeId);
            if (oembedData) {
                basicMetadata = {
                    title: oembedData.title,
                    description: `YouTube video by ${oembedData.author_name}`,
                    author: oembedData.author_name
                };
                htmlContext = `Target is a YouTube Video.\nTitle: ${oembedData.title}\nChannel: ${oembedData.author_name}\nType: Video`;
            } else {
                logger.warn('[API] oEmbed failed, falling back to HTML fetch.');
            }
        }

        if (!htmlContext) {
            try {
                const response = await fetchExternalHttpUrl(safeUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    },
                });
                if (response.ok) {
                    const html = await response.text();
                    htmlContext = html.substring(0, 50000); // Truncate

                    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
                    const metaDescMatch = html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i);
                    basicMetadata.title = titleMatch?.[1] || '';
                    basicMetadata.description = metaDescMatch?.[1] || '';
                }
            } catch (fetchError) {
                logger.warn('Failed to fetch URL content directly:', fetchError);
                htmlContext = "Could not fetch HTML content. Analyze based on URL and known info.";
            }
        }

        // 2. Prepare Prompt
        const systemPrompt = `
      너는 지능형 북마크/콘텐츠 분석 비서야.
      제공된 웹사이트 콘텐츠(HTML) 또는 메타데이터를 분석해서 다음 정보를 추출해줘.
      
      **모든 응답은 반드시 '한국어(Korean)'로 작성해야 해.**

      1. **제목**: 명확하고 설명적인 제목. (YouTube라면 영상 제목 그대로)
      2. **설명**: 한 문장으로 요약된 설명.
      3. **카테고리**: ['업무', '학습', '개인', '참고'] 중 하나 선택.
      4. **태그**: 관련 키워드 3~5개.
      5. **핵심 요약 (Key Takeaways)**: 콘텐츠의 핵심 내용 3~5가지를 요약 (불렛 포인트).

      반드시 아래 JSON 스키마를 준수해서 답변해줘:
      {
        "title": "string",
        "description": "string",
        "category": "string",
        "tags": ["string", "string"],
        "keyTakeaways": ["string", "string"]
      }
    `;

        const userMessage = `
      URL: ${url}
      Basic Metadata: ${JSON.stringify(basicMetadata)}
      Content Context: 
      ${htmlContext}
    `;

        // 3. Call Gemini
        logger.info('[API] Initializing Gemini...');
        const apiKey = process.env.GEMINI_API_KEY || ''; // Cloud Functions access secrets via process.env if loaded, or we trust defineSecret?
        // In v2 onRequest with 'secrets' option, it is available in process.env

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' });

        logger.info('[API] Sending Request to Gemini...');
        const completion = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: systemPrompt + "\n\n" + userMessage }] }],
            generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 1500,
            }
        });

        const text = completion.response.text();
        const content = text.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '');
        logger.info('[API] Gemini Response:', content);

        let parsedData;
        try {
            parsedData = JSON.parse(content);
            parsedData = AnalysisResponseSchema.parse(parsedData);
        } catch (parseError) {
            logger.error('[API] Parse Error:', parseError);
            parsedData = {
                title: basicMetadata.title || url,
                description: basicMetadata.description || '내용을 분석할 수 없습니다.',
                category: '참고',
                tags: [],
                keyTakeaways: ["자동 분석 실패: 직접 내용을 확인하세요."]
            };
        }

        res.status(200).json(parsedData);

    } catch (error) {
        logger.error('[API] Unhandled Error:', error);
        res.status(500).json({ error: 'Failed to analyze bookmark', details: String(error) });
    }
});
