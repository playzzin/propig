
import { onRequest } from 'firebase-functions/v2/https';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import * as logger from 'firebase-functions/logger';
import { requireAuthenticatedUser } from './security';
import { geminiApiKey } from '../secrets';

// Zod schema
const MandalartGenerationSchema = z.object({
    subGoals: z.array(z.string()).length(8),
});

export const generateMandalart = onRequest({ cors: true, secrets: [geminiApiKey] }, async (req, res) => {
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

        const { goal } = req.body;

        if (!goal || typeof goal !== 'string') {
            res.status(400).json({ error: 'Valid goal string is required' });
            return;
        }

        const systemPrompt = `
      너는 '만다라트 계획표(Mandalart Chart)' 전문가야.
      사용자가 제시한 [핵심 목표]를 달성하기 위한 구체적이고 실천 가능한 8가지 [세부 목표]를 생성해줘.

      **조건:**
      1. 핵심 목표: "${goal}"
      2. 세부 목표 개수: 정확히 8개
      3. 언어: 한국어 (Korean)
      4. 성격: 구체적이고, 실행 가능하며, 서로 중복되지 않게 다양하게 구성.
      5. 길이: 각 세부 목표는 10글자 내외로 간결하게 (예: "매일 30분 독서", "체지방 10% 달성")

      **응답 형식:**
      반드시 아래 JSON 포맷을 지켜서 배열 형태로 반환해.
      {
        "subGoals": [
          "세부목표1", "세부목표2", "세부목표3", "세부목표4", 
          "세부목표5", "세부목표6", "세부목표7", "세부목표8"
        ]
      }
    `;

        logger.info(`[API] Generating Mandalart sub-goals for: "${goal}"`);

        const apiKey = process.env.GEMINI_API_KEY || '';
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' });

        const completion = await model.generateContent({
            contents: [{ role: 'model', parts: [{ text: systemPrompt }] }, { role: 'user', parts: [{ text: `핵심 목표: ${goal}` }] }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 500,
            }
        });

        const text = completion.response.text();
        const content = text.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '');
        logger.info('[API] Generated Content:', content);

        let parsedData;
        try {
            parsedData = JSON.parse(content);
            parsedData = MandalartGenerationSchema.parse(parsedData);
            res.status(200).json(parsedData);
        } catch (parseError) {
            logger.error('[API] Parse Error:', parseError);
            res.status(500).json({
                error: 'Failed to parse AI response',
                raw: content
            });
        }

    } catch (error) {
        logger.error('[API] Unhandled Error:', error);
        res.status(500).json({ error: 'Internal Server Error', details: String(error) });
    }
});
