import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const source = await readFile(path.join(process.cwd(), 'functions/src/analyzeYoutubeVideo.ts'), 'utf8');

assert.match(source, /if \(!request\.auth\)/, 'YouTube analysis must require Firebase Authentication.');
assert.match(source, /youtube_url:\s*z\.string\(\)\.trim\(\)\.min\(1\)\.max\(2048\)\.url\(\)/);
assert.match(source, /video_title:\s*z\.string\(\)\.max\(300\)/);
assert.match(source, /video_description:\s*z\.string\(\)\.max\(12000\)/);
assert.match(source, /transcript:\s*z\.string\(\)\.max\(90000\)/);
assert.match(source, /user_memo:\s*z\.string\(\)\.max\(2000\)/);
assert.match(source, /namespace:\s*'youtube-analysis-minute'[\s\S]*YOUTUBE_ANALYSIS_MINUTE_LIMIT/);
assert.match(source, /namespace:\s*'youtube-analysis-day'[\s\S]*YOUTUBE_ANALYSIS_DAILY_LIMIT/);
assert.match(source, /YOUTUBE_ANALYSIS_MINUTE_LIMIT = \{ maxRequests: 6, windowMs: 60_000 \}/);
assert.match(source, /YOUTUBE_ANALYSIS_DAILY_LIMIT = \{ maxRequests: 30, windowMs: 24 \* 60 \* 60 \* 1000 \}/);
assert.match(source, /throw new https\.HttpsError\('resource-exhausted'/);

console.log('YouTube analysis authentication, input and cost-rate boundaries passed.');
