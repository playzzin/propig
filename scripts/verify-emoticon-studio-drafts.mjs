import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { z } = require('zod');
const source = fs.readFileSync(path.join(root, 'src/lib/emoticonStudioDraft.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
  fileName: 'emoticonStudioDraft.ts',
}).outputText;

const module = { exports: {} };
vm.runInNewContext(compiled, {
  module,
  exports: module.exports,
  require: (id) => {
    if (id === 'zod') return { z };
    if (id === '@/schemas/emoticonStudio') {
      return {
        emoticonExportFormatSchema: z.enum(['png', 'apng', 'webp', 'gif', 'mp4', 'webm', 'png_zip']),
        emoticonResourceModeSchema: z.enum(['efficient', 'balanced', 'premium']),
      };
    }
    if (id === '@/schemas/emoticonProject') {
      return {
        emoticonProjectPlatformSchema: z.enum(['kakao', 'line', 'telegram', 'sns', 'custom']),
        emoticonProjectTypeSchema: z.enum(['static', 'animated']),
      };
    }
    throw new Error(`Unexpected runtime import: ${id}`);
  },
}, { filename: 'emoticonStudioDraft.js' });

const {
  clearCreationComposerDraft,
  clearQuickStartDraft,
  EMOTICON_STUDIO_DRAFT_DEBOUNCE_MS,
  EMOTICON_STUDIO_DRAFT_VERSION,
  EMOTICON_STUDIO_QUICK_START_DRAFT_KEY,
  readCreationComposerDraft,
  readQuickStartDraft,
  saveCreationComposerDraft,
  saveQuickStartDraft,
} = module.exports;

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, value);
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

const jsonClone = (value) => JSON.parse(JSON.stringify(value));
const quickDraft = {
  projectName: '새 움직이는 이모티콘',
  prompt: '네 프레임 동안 손을 흔들어 줘',
  platform: 'kakao',
  outputType: 'animated',
  frameCount: 12,
};
const creationDraft = {
  prompt: '네 프레임 동안 손을 흔들어 줘',
  outputType: 'animated',
  quantity: 1,
  frameCount: 4,
  durationMs: 1000,
  platform: 'kakao',
  qualityMode: 'balanced',
  formats: ['gif', 'png_zip'],
  storyboardSource: '4␟네 프레임 동안 손을 흔들어 줘',
  storyboard: [
    { frameIndex: 0, phase: 'setup', direction: '손을 들기 전 준비 자세' },
    { frameIndex: 1, phase: 'anticipation', direction: '손을 어깨 높이까지 든다' },
    { frameIndex: 2, phase: 'action', direction: '손을 크게 흔든다' },
    { frameIndex: 3, phase: 'loop', direction: '첫 자세로 자연스럽게 돌아간다' },
  ],
};

assert.equal(EMOTICON_STUDIO_DRAFT_VERSION, 1);
assert.ok(EMOTICON_STUDIO_DRAFT_DEBOUNCE_MS >= 300 && EMOTICON_STUDIO_DRAFT_DEBOUNCE_MS <= 500);
assert.equal(readQuickStartDraft(), null, 'SSR에서는 window 없이 안전하게 종료해야 합니다.');

const storage = new MemoryStorage();
assert.equal(saveQuickStartDraft(quickDraft, storage), true);
const quickEnvelope = JSON.parse(storage.getItem(EMOTICON_STUDIO_QUICK_START_DRAFT_KEY));
assert.equal(quickEnvelope.version, 1);
assert.deepEqual(quickEnvelope.data, quickDraft);
assert.equal(typeof quickEnvelope.savedAt, 'number');
assert.deepEqual(jsonClone(readQuickStartDraft(storage)), quickDraft);

storage.setItem(EMOTICON_STUDIO_QUICK_START_DRAFT_KEY, '{broken json');
assert.equal(readQuickStartDraft(storage), null);
assert.equal(storage.getItem(EMOTICON_STUDIO_QUICK_START_DRAFT_KEY), null);

storage.setItem(EMOTICON_STUDIO_QUICK_START_DRAFT_KEY, JSON.stringify({
  version: 0,
  savedAt: Date.now(),
  data: quickDraft,
}));
assert.equal(readQuickStartDraft(storage), null, '구버전 초안은 복원하지 않아야 합니다.');
assert.equal(storage.getItem(EMOTICON_STUDIO_QUICK_START_DRAFT_KEY), null);

assert.equal(saveQuickStartDraft({ ...quickDraft, files: [{ name: 'character.png' }] }, storage), false);
assert.equal(storage.getItem(EMOTICON_STUDIO_QUICK_START_DRAFT_KEY), null, '파일 메타데이터도 저장 계약에 들어가면 안 됩니다.');

assert.equal(saveCreationComposerDraft('project/a', creationDraft, storage), true);
assert.deepEqual(jsonClone(readCreationComposerDraft('project/a', storage)), creationDraft);
assert.equal(readCreationComposerDraft('project-b', storage), null, '프로젝트별 초안 키는 격리되어야 합니다.');

const creationKey = [...storage.values.keys()].find((key) => key.includes('creation:'));
assert.ok(creationKey?.endsWith('project%2Fa'));
const creationEnvelope = JSON.parse(storage.getItem(creationKey));
assert.equal(creationEnvelope.version, 1);
assert.equal(creationEnvelope.data.qualityMode, 'balanced');
assert.equal(creationEnvelope.data.frameCount, 4);
assert.equal(creationEnvelope.data.storyboard.length, 4);
assert.equal(creationEnvelope.data.storyboard[2].phase, 'action');
assert.equal('referenceFiles' in creationEnvelope.data, false);

assert.equal(saveCreationComposerDraft('project-empty-formats', {
  ...creationDraft,
  formats: [],
}, storage), true, '제출 전의 빈 출력 형식 선택도 초안으로 복원할 수 있어야 합니다.');
assert.deepEqual(jsonClone(readCreationComposerDraft('project-empty-formats', storage)?.formats), []);

assert.equal(saveCreationComposerDraft('project-with-file', {
  ...creationDraft,
  referenceFiles: [{ name: 'reference.webp', blob: {} }],
}, storage), false, 'Blob/File 계열 값은 엄격한 저장 계약에서 거부해야 합니다.');
assert.equal(readCreationComposerDraft('', storage), null);
assert.equal(saveCreationComposerDraft('', creationDraft, storage), false);
assert.equal(readCreationComposerDraft('\uD800', storage), null);
assert.equal(saveCreationComposerDraft('\uD800', creationDraft, storage), false);

const blockedStorage = {
  getItem() { throw new Error('storage disabled'); },
  setItem() { throw new Error('storage disabled'); },
  removeItem() { throw new Error('storage disabled'); },
};
assert.equal(readQuickStartDraft(blockedStorage), null);
assert.equal(saveQuickStartDraft(quickDraft, blockedStorage), false);
assert.equal(clearQuickStartDraft(blockedStorage), false);
assert.equal(readCreationComposerDraft('project-a', blockedStorage), null);
assert.equal(saveCreationComposerDraft('project-a', creationDraft, blockedStorage), false);
assert.equal(clearCreationComposerDraft('project-a', blockedStorage), false);

assert.equal(clearCreationComposerDraft('project/a', storage), true);
assert.equal(readCreationComposerDraft('project/a', storage), null);
assert.equal(saveQuickStartDraft(quickDraft, storage), true);
assert.equal(clearQuickStartDraft(storage), true);
assert.equal(readQuickStartDraft(storage), null);

const creationPath = 'src/app/admin/emoticon-studio/studio/CreationComposer.tsx';
const componentSource = fs.readFileSync(path.join(root, creationPath), 'utf8');
assert.match(componentSource, /EMOTICON_STUDIO_DRAFT_DEBOUNCE_MS/);
assert.match(componentSource, /window\.setTimeout/);

const creationSource = componentSource;
const creationSaveBody = creationSource.match(/saveCreationComposerDraft\(project\.id, \{([\s\S]*?)\}\);/)?.[1] ?? '';
assert.doesNotMatch(creationSaveBody, /referenceFiles|references|blob/i);
assert.ok(creationSource.indexOf('if (result === false) return;') < creationSource.indexOf('clearCreationComposerDraft(project.id);'));

console.log('Emoticon Studio draft persistence verified.');
