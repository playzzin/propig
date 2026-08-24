import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const require = createRequire(import.meta.url);

const clientSchema = read('src/schemas/emoticonStudio.ts');
const functionsSchema = read('functions/src/emoticonStudio/schema.ts');
const projectSchema = read('src/schemas/emoticonProject.ts');
const director = read('functions/src/emoticonStudio/director.ts');
const trigger = read('functions/src/triggers/onEmoticonJobCreated.ts');
const identityFingerprint = read('functions/src/emoticonStudio/identityFingerprint.ts');
const service = read('src/services/emoticonStudioService.ts');
const projectService = read('src/services/emoticonProjectService.ts');
const studioHook = read('src/app/admin/emoticon-studio/studio/useEmoticonStudio.ts');
const characterSetup = read('src/app/admin/emoticon-studio/studio/CharacterSetupStep.tsx');
const rules = read('firestore.rules');

for (const schema of [clientSchema, functionsSchema]) {
  assert.match(schema, /'profile'/);
  assert.match(schema, /'sheet_plan'/);
  assert.match(schema, /emoticonCharacterAnalysisSchema/);
  assert.match(schema, /face:[\s\S]*?eyes:[\s\S]*?hair:[\s\S]*?bodyShape:[\s\S]*?outfit:/);
  assert.match(schema, /lineArt:[\s\S]*?shading:[\s\S]*?proportions:[\s\S]*?limbStructure:/);
  assert.match(schema, /immutableLock:[\s\S]*?styleLock:[\s\S]*?negativeLock:/);
  assert.match(schema, /analysisRevision:[\s\S]*?motionTraits:[\s\S]*?imageQuality:/);
  assert.match(schema, /confirmationRequired:/);
  assert.match(schema, /profileJobId:[\s\S]*?sheetRequest:[\s\S]*?sheetItemCount:/);
}

assert.match(projectSchema, /profile: emoticonCharacterAnalysisSchema\.optional\(\)/);
assert.match(projectSchema, /profileJobId:[\s\S]*?identityFingerprint:/);
assert.match(projectSchema, /EMOTICON_PROJECT_REFERENCE_ROLES = \['front', 'side', 'back', 'expression', 'other'\]/);
assert.match(projectSchema, /viewRole: emoticonProjectReferenceRoleSchema\.optional\(\)/);
assert.match(characterSetup, /REFERENCE_ROLE_LABELS/);
assert.match(characterSetup, /onReferenceRoleChange/);
assert.match(characterSetup, /참고 이미지가 바뀌면 다시 분석해야 합니다/);

assert.match(director, /export async function analyzeEmoticonCharacter/);
assert.match(director, /Do not propose actions, expressions, presets, sheets, frames, speech bubbles, or images\./);
assert.match(director, /maxTokens: resourceMode === 'efficient' \? 2200 : 3200/);
assert.match(director, /schemaName: 'emoticon_character_profile_v2'/);
assert.match(director, /if \(!parsed\.success\) \{[\s\S]*?payload = await requestAnalysis\(\)/);
assert.match(director, /export async function planEmoticonCharacterSheet/);
assert.match(director, /Every item is an independent single-character image/);
assert.match(director, /Return planning JSON only/);
assert.doesNotMatch(
  director.slice(
    director.indexOf('export async function planEmoticonCharacterSheet'),
    director.indexOf('export async function planEmoticonFrameSequence'),
  ),
  /suggestedPresets/,
  'The free-form character sheet planner must not use the legacy preset array.',
);

assert.match(trigger, /loadCharacterAnalysisCache[\s\S]*?characterAnalysis/);
assert.match(trigger, /expectedReferenceCount: number/);
assert.match(trigger, /analysis\.data\.referenceCount !== expectedReferenceCount/);
assert.match(trigger, /saveDedicatedCharacterAnalysisCache/);
assert.match(trigger, /requestedAnalysisMode[\s\S]*?analysisMeetsRequestedMode/);
assert.match(trigger, /identityFingerprintVersion: EMOTICON_IDENTITY_FINGERPRINT_VERSION/);
assert.match(trigger, /mode === 'profile' \|\| parsed\.data\.mode === 'sheet_plan'/);
assert.match(trigger, /profileJob\.identityFingerprint !== params\.identityFingerprint/);
assert.match(trigger, /profileJob\.projectId !== params\.request\.projectId/);
assert.match(trigger, /frameContinuation: \{ stage: 'analysis'/);
assert.match(trigger, /await assertJobActive\(params\.userId, params\.jobId\)/);
assert.match(identityFingerprint, /\.\.\.\[\.\.\.normalizedReferenceFingerprints\]\.sort\(\)/);
assert.doesNotMatch(
  identityFingerprint,
  /new Set\(normalizedReferenceFingerprints\)/,
  'Duplicate-content references must still change the identity fingerprint input count.',
);

assert.match(service, /export async function createEmoticonCharacterProfileJob/);
assert.match(service, /export function estimateEmoticonCharacterAnalysis/);
assert.match(service, /rightsAttested: input\.rightsAttested === true/);
assert.match(service, /assetProvenance:/);
assert.match(service, /export async function createEmoticonCharacterSheetPlanJob/);
assert.match(service, /assertCharacterPlanningProjectAvailable/);
assert.match(service, /snapshot\.data\(\)\.deletionLocked === true/);
assert.match(projectService, /export async function applyEmoticonCharacterProfile/);
assert.match(projectService, /job\.data\.mode !== 'profile'/);
assert.match(projectService, /projectReferencePaths[\s\S]*?jobReferencePaths/);
assert.match(projectService, /analysis\.referenceCount !== projectReferencePaths\.length/);
assert.match(projectService, /function detachCharacterProfile/);
assert.match(projectService, /characterReferenceSetSignature\(current\.character\.references\)/);
assert.match(projectService, /export async function createEmoticonProjectFromCharacterSheet/);
assert.match(projectService, /sourceProject\.revision !== params\.expectedSourceProjectRevision/);
assert.match(projectService, /hasMatchingCharacterReferencePaths\(sourceProject, sheetJob\.data\)/);
assert.match(projectService, /transaction\.set\(targetProjectRef/);
assert.match(projectService, /validatedItems\.forEach/);

assert.match(characterSetup, /OpenRouter \{estimate\.expectedRequestCountMin\}/);
assert.match(characterSetup, /캐릭터 자동 분석/);
assert.match(characterSetup, /분석 내용·고정 설정 수정/);
assert.match(characterSetup, /항목별 캐릭터 고정/);
assert.match(characterSetup, /identityLock/);
assert.match(characterSetup, /onApprove/);
assert.doesNotMatch(characterSetup, /suggestedPresets/);
assert.match(studioHook, /await createEmoticonCharacterProfileJob\(\{/);
assert.match(studioHook, /await applyEmoticonCharacterProfile\(\{/);
assert.match(studioHook, /await saveApprovedCharacterProfileVersion\(\{/);
assert.match(studioHook, /setRightsAttested\(false\)/);

assert.match(rules, /'profile', 'sheet_plan'/);
assert.match(rules, /function validEmoticonCharacterPlanningLink/);
assert.match(rules, /get\(profilePath\)\.data\.mode == 'profile'/);
assert.match(rules, /get\(profilePath\)\.data\.status == 'completed'/);
assert.match(rules, /get\(projectPath\)\.data\.get\('deletionLocked', false\) == false/);
assert.match(rules, /function writableEmoticonProject[\s\S]*?existsAfter\(projectPath\)[\s\S]*?getAfter\(projectPath\)/);

const { emoticonCharacterAnalysisSchema } = require('../functions/lib/emoticonStudio/schema.js');
const fixture = JSON.parse(read('scripts/fixtures/emoticon-character-analysis-v2.json'));
const parsedFixture = emoticonCharacterAnalysisSchema.safeParse(fixture);
assert.equal(parsedFixture.success, true, parsedFixture.success ? '' : parsedFixture.error.message);
assert.equal(parsedFixture.data.motionTraits.articulatedParts.includes('포니테일'), true);
assert.equal(parsedFixture.data.imageQuality.usableForGeneration, true);

console.log('Emoticon character profile and free-form sheet planning contracts verified.');
