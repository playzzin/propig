import { https, logger } from 'firebase-functions/v2';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';

// 메타데이터 스키마
const MetadataSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  favicon: z.string().optional(),
  siteName: z.string().optional(),
  author: z.string().optional(),
  publishedDate: z.string().optional(),
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// URL에서 메타데이터 추출
export const extractMetadata = https.onCall(async (request) => {
  const { url } = request.data;

  if (!url || typeof url !== 'string') {
    throw new https.HttpsError('invalid-argument', 'URL is required');
  }

  try {
    // Gemini Pro 모델 초기화
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' });

    const prompt = `다음 URL의 웹페이지 내용을 분석하여 메타데이터를 추출해주세요:
URL: ${url}

추출할 정보:
- title: 페이지 제목
- description: 페이지 설명 (1-2문장 요약)
- tags: 관련 태그 (5개 이내, 콤마로 구분)
- favicon: 파비콘 URL (있는 경우)
- siteName: 사이트 이름
- author: 저자 (있는 경우)
- publishedDate: 발행일 (있는 경우)

다음 JSON 형식으로 응답해주세요:
{
  "title": "페이지 제목",
  "description": "페이지 설명",
  "tags": ["태그1", "태그2", "태그3"],
  "favicon": "파비콘 URL",
  "siteName": "사이트 이름",
  "author": "저자",
  "publishedDate": "YYYY-MM-DD"
}`;

    const result = await model.generateContent(prompt);

    const response = await result.response;
    const text = response.text();

    // JSON 파싱
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid response format');
    }

    const metadata = JSON.parse(jsonMatch[0]);

    // Zod로 검증
    const validatedMetadata = MetadataSchema.parse(metadata);

    logger.info(`Metadata extracted for URL: ${url}`);

    return validatedMetadata;

  } catch (error) {
    logger.error('Error extracting metadata:', error);

    if (error instanceof z.ZodError) {
      throw new https.HttpsError('internal', 'Invalid metadata format');
    }

    throw new https.HttpsError('internal', 'Failed to extract metadata');
  }
});

// 배치로 메타데이터 추출 (여러 URL)
export const extractBatchMetadata = https.onCall(async (request) => {
  const { urls } = request.data;

  if (!Array.isArray(urls) || urls.length === 0) {
    throw new https.HttpsError('invalid-argument', 'URLs array is required');
  }

  if (urls.length > 10) {
    throw new https.HttpsError('invalid-argument', 'Maximum 10 URLs per batch');
  }

  try {
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' });
    const results = [];

    for (const url of urls) {
      const prompt = `URL의 메타데이터를 JSON 형식으로 추출: ${url}`;

      const result = await model.generateContent(prompt);

      const response = await result.response;
      const text = response.text();

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const metadata = JSON.parse(jsonMatch[0]);
        const validatedMetadata = MetadataSchema.parse(metadata);
        results.push({ url, metadata: validatedMetadata });
      }
    }

    return results;

  } catch (error) {
    logger.error('Error in batch extraction:', error);
    throw new https.HttpsError('internal', 'Failed to extract batch metadata');
  }
});
