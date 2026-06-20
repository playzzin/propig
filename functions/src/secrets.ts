import { defineSecret } from 'firebase-functions/params';

export const geminiApiKey = defineSecret('GEMINI_API_KEY');
export const grokApiKey = defineSecret('GROK_API_KEY');
