import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const service = read('src/services/emoticonResultHistoryService.ts');
const hook = read('src/hooks/useEmoticonResultHistory.ts');
const panel = read('src/app/admin/emoticon-studio/studio/ResultHistoryComparePanel.tsx');
const studioPage = read('src/app/admin/emoticon-studio/studio/EmoticonStudioPage.tsx');
const timeline = read('src/app/admin/emoticon-studio/FrameTimelinePanel.tsx');
const editor = read('src/app/admin/emoticon-studio/studio/ProfessionalEditor.tsx');
const frameDownload = read('src/lib/emoticonFrameDownload.ts');
const indexes = JSON.parse(read('firestore.indexes.json'));
const { buildEmoticonFrameFileName } = await import('../src/lib/emoticonFrameDownload.ts');

assert.match(service, /where\('projectId',\s*'==',\s*input\.projectId\)/);
assert.match(service, /where\('projectItemId',\s*'==',\s*input\.projectItemId\)/);
assert.match(service, /where\('status',\s*'==',\s*'completed'\)/);
assert.match(service, /orderBy\('completedAt',\s*'desc'\)/);
assert.match(service, /if \(params\.cursor\) constraints\.push\(startAfter\(params\.cursor\)\)/);
assert.match(service, /limit\(input\.pageSize \+ 1\)/);
assert.match(service, /pageSize: z\.number\(\)\.int\(\)\.min\(1\)\.max\(EMOTICON_RESULT_HISTORY_MAX_PAGE_SIZE\)/);
assert.match(service, /emoticonJobSchema\.safeParse/);

assert.match(hook, /requestVersionRef/);
assert.match(hook, /mergeUniqueJobs/);
assert.match(hook, /loadMore: \(\) => Promise<void>/);
assert.match(hook, /setError\('/);

assert.match(panel, /A\/B 선택은 비교 화면만 바꾸며/);
assert.match(panel, /aria-pressed=\{job\.id === selectedAId\}/);
assert.match(panel, /aria-pressed=\{job\.id === selectedBId\}/);
assert.match(panel, /job\.quality\?\.identity/);
assert.match(panel, /job\.quality\?\.overall/);
assert.match(panel, /job\.specReport\?\.technicalPass/);
assert.match(panel, /job\.specReport\?\.allOutputsPass/);
assert.match(panel, /openRouterActualCostUsd/);
assert.match(panel, /openRouterUsageRequestCount/);
assert.match(panel, /실제 비용/);
assert.match(panel, /Provider 호출/);
assert.match(panel, /primaryOutput\(job\)/);
assert.match(panel, /이 결과를 대표로 사용/);
assert.match(panel, /history\.loadMore\(\)/);
assert.match(panel, /role="dialog"[\s\S]{0,80}?aria-modal="true"/);

assert.match(studioPage, /<ResultHistoryComparePanel/);
assert.match(studioPage, /onUseAsRepresentative=\{studio\.setRepresentativeJob\}/);
assert.match(studioPage, /selectedItem \? setIsResultHistoryOpen\(true\)/);
assert.match(timeline, /onDownloadFrame\?: \(job: EmoticonJob, frameIndex: number\)/);
assert.match(timeline, /onDownloadFrame\(job, frameIndex\)/);
assert.match(timeline, /PNG 받기/);
assert.match(frameDownload, /String\(frameIndex \+ 1\)\.padStart\(3, '0'\)/);
assert.match(frameDownload, /normalize\('NFKC'\)/);
assert.match(editor, /buildEmoticonFrameFileName\(props\.item\?\.title \|\| 'frame', frameIndex\)/);
assert.match(editor, /downloadEmoticonFile\(frame\.url/);
assert.equal(buildEmoticonFrameFileName('달리기 / 성공!', 0), '001_달리기_성공.png');
assert.equal(buildEmoticonFrameFileName('../../unsafe', 23), '024_unsafe.png');
assert.throws(() => buildEmoticonFrameFileName('frame', 24));

const resultHistoryIndex = indexes.indexes.find((index) => (
  index.collectionGroup === 'emoticonJobs'
  && index.queryScope === 'COLLECTION'
  && JSON.stringify(index.fields) === JSON.stringify([
    { fieldPath: 'projectId', order: 'ASCENDING' },
    { fieldPath: 'projectItemId', order: 'ASCENDING' },
    { fieldPath: 'status', order: 'ASCENDING' },
    { fieldPath: 'completedAt', order: 'DESCENDING' },
  ])
));
assert.ok(resultHistoryIndex, '완료 결과 페이지네이션 쿼리용 Firestore 복합 인덱스가 필요합니다.');

console.log('Emoticon result history contract verified.');
