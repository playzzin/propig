import { https, logger } from 'firebase-functions/v2';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { geminiApiKey } from './secrets';

const MandalartTaskSchema = z.string().max(50);

const MandalartRecommendationSchema = z.object({
  mainGoal: z.string().max(50).optional(),
  subGoals: z
    .array(
      z.object({
        title: z.string().max(50),
        tasks: z.array(MandalartTaskSchema).length(8),
      }),
    )
    .length(8),
});

type MandalartRecommendation = z.infer<typeof MandalartRecommendationSchema>;

type MandalartTemplate = 'custom' | 'okr' | 'achievement';

const RecommendMandalartRequestSchema = z.object({
  mainGoal: z.string().min(1).max(50),
  template: z.enum(['custom', 'okr', 'achievement']).optional(),
});

type RecommendMandalartRequest = z.infer<typeof RecommendMandalartRequestSchema>;

const getEnv = () => {
  return {
    geminiApiKey: process.env.GEMINI_API_KEY ?? '',
    geminiModel: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
  };
};

const extractJsonFromText = (text: string): string => {
  const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('Gemini 응답에서 JSON 객체를 찾지 못했습니다.');
  }
  return match[0];
};

const buildSystemPrompt = (template: MandalartTemplate): string => {
  if (template === 'okr') {
    return `당신은 OKR 기반 만다라트 설계 전문가입니다.\n\n사용자가 입력한 메인 목표를 기반으로, 8개의 서브 목표(Objectives)와 각 서브 목표에 대응되는 8개의 실행(Key Results/Activities)을 생성하세요.\n\n반드시 아래 JSON 스키마를 정확히 지켜서 응답하세요. 다른 텍스트는 절대 포함하지 마세요.\n- subGoals는 항상 8개\n- tasks는 각 서브 목표당 항상 8개\n- 각 title/tasks 항목은 50자 이내\n\n응답 JSON 스키마:\n{\n  \"mainGoal\": \"string (optional)\",\n  \"subGoals\": [\n    {\n      \"title\": \"string\",\n      \"tasks\": [\"string\", \"string\", \"string\", \"string\", \"string\", \"string\", \"string\", \"string\"]\n    }\n  ]\n}`;
  }

  if (template === 'achievement') {
    return `당신은 성취 목표 설계를 돕는 만다라트 코치입니다.\n\n사용자가 입력한 메인 목표를 기반으로, 목표 달성에 필요한 8개의 핵심 영역(서브 목표)과 각 영역별 실행 과제 8개를 생성하세요.\n\n반드시 아래 JSON 스키마를 정확히 지켜서 응답하세요. 다른 텍스트는 절대 포함하지 마세요.\n- subGoals는 항상 8개\n- tasks는 각 서브 목표당 항상 8개\n- 각 title/tasks 항목은 50자 이내\n\n응답 JSON 스키마:\n{\n  \"mainGoal\": \"string (optional)\",\n  \"subGoals\": [\n    {\n      \"title\": \"string\",\n      \"tasks\": [\"string\", \"string\", \"string\", \"string\", \"string\", \"string\", \"string\", \"string\"]\n    }\n  ]\n}`;
  }

  return `당신은 만다라트 설계 전문가입니다.\n\n사용자가 입력한 메인 목표를 기반으로, 8개의 서브 목표와 각 서브 목표에 대한 실행 과제 8개를 생성하세요.\n\n반드시 아래 JSON 스키마를 정확히 지켜서 응답하세요. 다른 텍스트는 절대 포함하지 마세요.\n- subGoals는 항상 8개\n- tasks는 각 서브 목표당 항상 8개\n- 각 title/tasks 항목은 50자 이내\n\n응답 JSON 스키마:\n{\n  \"mainGoal\": \"string (optional)\",\n  \"subGoals\": [\n    {\n      \"title\": \"string\",\n      \"tasks\": [\"string\", \"string\", \"string\", \"string\", \"string\", \"string\", \"string\", \"string\"]\n    }\n  ]\n}`;
};

const buildUserPrompt = (req: RecommendMandalartRequest): string => {
  return `메인 목표: ${req.mainGoal}\n\n요구사항:\n- 서브 목표는 서로 중복되지 않는 영역으로 구성\n- 실행 과제는 '측정 가능한 행동' 형태로 작성 (예: \"주 3회 30분 유산소\")\n- 너무 추상적인 표현(예: 열심히, 잘하기) 금지\n- 한국어로 작성`;
};

export const recommendMandalart = https.onCall({ secrets: [geminiApiKey] }, async (request) => {
  if (!request.auth) {
    throw new https.HttpsError('unauthenticated', '로그인이 필요합니다.');
  }

  const env = getEnv();
  if (!env.geminiApiKey) {
    throw new https.HttpsError('failed-precondition', 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다.');
  }

  const parsed = RecommendMandalartRequestSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new https.HttpsError('invalid-argument', '요청 형식이 올바르지 않습니다.', {
      issues: parsed.error.issues,
    });
  }

  const input = parsed.data;
  const template: MandalartTemplate = input.template ?? 'custom';

  try {
    const genAI = new GoogleGenerativeAI(env.geminiApiKey);
    const model = genAI.getGenerativeModel({ model: env.geminiModel });

    const systemPrompt = buildSystemPrompt(template);
    const userPrompt = buildUserPrompt(input);

    const prompt = `${systemPrompt}\n\n${userPrompt}`;
    const result = await model.generateContent(prompt);

    const text = result.response.text();
    const jsonText = extractJsonFromText(text);
    const json = JSON.parse(jsonText) as unknown;

    const recommendation: MandalartRecommendation = MandalartRecommendationSchema.parse(json);

    logger.info('Mandalart recommendation generated', {
      uid: request.auth.uid,
      mainGoal: input.mainGoal,
      template,
    });

    return recommendation;
  } catch (error) {
    logger.error('Failed to generate mandalart recommendation', error);

    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new https.HttpsError('internal', `만다라트 추천 생성에 실패했습니다: ${message}`);
  }
});
