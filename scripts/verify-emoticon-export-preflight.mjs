import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  EmoticonSubmissionPackageError,
  filterCompletedEmoticonSubmissionProject,
  preflightEmoticonSubmissionPackage,
} from '../src/lib/emoticonSubmissionPackage.ts';

const [page, resultCard, projectService, submissionPackage] = await Promise.all([
  readFile(new URL('../src/app/admin/emoticon-studio/studio/EmoticonStudioPage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/admin/emoticon-studio/studio/CreationResultCard.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/emoticonProjectService.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/emoticonSubmissionPackage.ts', import.meta.url), 'utf8'),
]);

assert.match(projectService, /getDocFromServer\(projectRef\)/);
assert.match(projectService, /const itemSnapshot = await getDocsFromServer\(itemQuery\)/);
assert.match(projectService, /const confirmedItemSnapshot = await getDocsFromServer\(itemQuery\)/);
assert.match(projectService, /itemReadSignature\(itemSnapshot\) !== itemReadSignature\(confirmedItemSnapshot\)/);
assert.match(projectService, /for \(let attempt = 0; attempt < 3; attempt \+= 1\)/);
assert.match(projectService, /readSignature\(before\.data\(\)\)/);
assert.match(projectService, /readSignature\(after\.data\(\)\)/);
assert.match(projectService, /readSignature\(before\.data\(\)\) !== readSignature\(after\.data\(\)\)/);
assert.equal(typeof preflightEmoticonSubmissionPackage, 'function');
assert.match(submissionPackage, /import type JSZip from 'jszip'/);
assert.match(submissionPackage, /import\('jszip'\)/);
assert.match(submissionPackage, /retainBuffers: boolean/);
assert.match(submissionPackage, /streamFiles: true/);
assert.match(submissionPackage, /MAX_DECLARED_PACKAGE_BYTES = 64 \* 1024 \* 1024/);
assert.match(resultCard, /<span>제작 결과<\/span>/);
assert.match(resultCard, /<span>기술 규격<\/span>/);
assert.match(resultCard, /<span>플랫폼 제출<\/span>/);
assert.match(resultCard, /최신 공식 정책 확인 필요/);
assert.match(resultCard, /specReport\?\.technicalPass && selectedJob\.specReport\?\.allOutputsPass/);
assert.match(resultCard, /primaryFormat[\s\S]{0,220}?다운로드/);
assert.match(resultCard, /additionalFormats[\s\S]{0,260}?다른 형식/);
assert.match(page, /플랫폼 심사 승인까지 보장하지는 않습니다/);
assert.doesNotMatch(resultCard, />\s*제출 준비 완료\s*</);
assert.doesNotMatch(resultCard, />\s*승인 가능\s*</);
assert.doesNotMatch(resultCard, /type="checkbox"/, 'Manual policy review must not masquerade as persisted attestations.');

const project = {
  title: '선택 내보내기 계약',
  platform: 'kakao',
  emoticonType: 'animated',
  spec: {
    canvasWidth: 360,
    canvasHeight: 360,
    transparentBackground: true,
  },
  items: [
    {
      id: 'complete-a',
      order: 1,
      title: '완료 A',
      jobId: 'job-a',
      generationStatus: 'completed',
      motion: { fps: 8, frameCount: 8, durationMs: 1_000 },
    },
    {
      id: 'planned-b',
      order: 2,
      title: '기획 B',
      jobId: null,
      generationStatus: 'planned',
      motion: { fps: 8, frameCount: 8, durationMs: 1_000 },
    },
    {
      id: 'complete-c',
      order: 3,
      title: '완료 C',
      jobId: 'job-c',
      generationStatus: 'completed',
      motion: { fps: 8, frameCount: 8, durationMs: 1_000 },
    },
  ],
};

const selected = filterCompletedEmoticonSubmissionProject(project, ['complete-c', 'complete-a']);
assert.deepEqual(
  selected.items.map((item) => item.id),
  ['complete-a', 'complete-c'],
  'Selection packages must preserve the latest server project order.',
);
assert.equal(project.items.length, 3, 'Selection filtering must not mutate the latest project snapshot.');

assert.throws(
  () => filterCompletedEmoticonSubmissionProject(project, ['planned-b']),
  (error) => error instanceof EmoticonSubmissionPackageError && error.code === 'MISSING_JOB',
);
assert.throws(
  () => filterCompletedEmoticonSubmissionProject(project, ['removed-item']),
  (error) => error instanceof EmoticonSubmissionPackageError && error.code === 'INVALID_REQUEST',
);
assert.throws(
  () => filterCompletedEmoticonSubmissionProject(project, []),
  (error) => error instanceof EmoticonSubmissionPackageError && error.code === 'INVALID_REQUEST',
);

console.log('Emoticon export/preflight contract verification passed.');
