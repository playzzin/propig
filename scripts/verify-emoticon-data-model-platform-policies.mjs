import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EMOTICON_EDITABLE_POLICY_TARGETS,
  getFallbackEmoticonPlatformPolicyPresets,
  toEmoticonPlatformProfileFromPolicyPreset,
} from '../src/lib/emoticonPlatformProfiles.ts';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relativePath) => fs.readFileSync(path.join(rootDirectory, relativePath), 'utf8');

const sharedSchema = readSource('src/schemas/emoticonStudioV2.ts');
assert.match(sharedSchema, /sourceAssetSchema = emoticonAssetSchema/);
assert.match(sharedSchema, /generationRequestSchema = emoticonCreationTurnSchema/);
assert.match(sharedSchema, /generationResultSchema = emoticonGeneratedVariantSchema/);
assert.match(sharedSchema, /costEstimateSchema = emoticonCostSnapshotSchema/);
for (const typeName of ['SourceAsset', 'FrameLayer', 'GenerationRequest', 'GenerationResult', 'ExportPreset', 'PlatformPolicyPreset', 'CostEstimate']) {
  assert.match(sharedSchema, new RegExp(`export type ${typeName}\\b`));
}
assert.match(sharedSchema, /frameLayerSchema = z\.object\([\s\S]*?kind: z\.enum\(EMOTICON_FRAME_LAYER_KINDS\)[\s\S]*?opacity:[\s\S]*?blendMode:[\s\S]*?transform:/);
assert.match(sharedSchema, /\['source', 'prop', 'mask'\]\.includes\(layer\.kind\)[\s\S]*?!layer\.assetId/);
assert.match(sharedSchema, /exportPresetSchema = z\.object\([\s\S]*?outputProfile: emoticonOutputProfileSchema[\s\S]*?preferredFormat/);
assert.match(sharedSchema, /platformPolicyPresetSchema = z\.object\([\s\S]*?revision:[\s\S]*?profile: emoticonPlatformPolicyProfileSchema/);
assert.match(sharedSchema, /EMOTICON_EDITABLE_POLICY_PLATFORMS = \['kakao', 'line', 'custom'\]/);

const fallbacks = getFallbackEmoticonPlatformPolicyPresets();
assert.equal(fallbacks.length, EMOTICON_EDITABLE_POLICY_TARGETS.length);
assert.deepEqual(
  fallbacks.map(({ id }) => id),
  ['kakao-static', 'kakao-animated', 'line-static', 'line-animated', 'custom-static', 'custom-animated'],
);
for (const fallback of fallbacks) {
  assert.equal(fallback.revision, 0);
  assert.equal(fallback.updatedBy, 'fallback');
  assert.equal(fallback.profile.submissionCandidate, false);
  assert.equal(fallback.profile.transparentBackground, true);
  const resolved = toEmoticonPlatformProfileFromPolicyPreset(fallback);
  assert.equal(resolved.platform, fallback.platform);
  assert.equal(resolved.type, fallback.type);
  assert.deepEqual(resolved.allowedFormats, fallback.profile.allowedFormats);
}

const policyService = readSource('src/services/emoticonPlatformPolicyService.ts');
const studioService = readSource('src/services/emoticonStudioService.ts');
const v2Controller = readSource('src/app/admin/emoticon-studio/studio/useEmoticonStudio.ts');
const serverPolicy = readSource('functions/src/emoticonStudio/platformPolicy.ts');
const serverTrigger = readSource('functions/src/triggers/onEmoticonJobCreated.ts');
const rules = readSource('firestore.rules');
assert.match(policyService, /EMOTICON_PLATFORM_POLICY_COLLECTION = 'emoticonStudioPlatformPolicies'/);
assert.match(policyService, /subscribeEmoticonPlatformPolicies[\s\S]*?onSnapshot/);
assert.match(policyService, /storedPreset[\s\S]*?source: usesStoredPolicy \? 'firestore' : 'fallback'/);
assert.match(policyService, /saveEmoticonPlatformPolicyPreset[\s\S]*?expectedRevision[\s\S]*?runTransaction/);
assert.match(policyService, /revision: params\.expectedRevision \+ 1/);
assert.match(policyService, /createdAt: snapshot\.exists\(\) \? snapshot\.data\(\)\.createdAt : serverTimestamp\(\)/);
assert.match(policyService, /resolveEmoticonPlatformProfile[\s\S]*?getDoc\(doc\(db, EMOTICON_PLATFORM_POLICY_COLLECTION, policyId\)\)/);
assert.match(policyService, /!parsed\.success \|\| !parsed\.data\.enabled[\s\S]*?return fallback/);
assert.match(policyService, /catch \{[\s\S]*?return fallback/);
assert.match(studioService, /resolveGenerationOutputPolicy[\s\S]*?resolveEmoticonPlatformProfile/);
assert.match(studioService, /submitEmoticonFrameImportJob[\s\S]*?const resolvedPolicy = await resolveGenerationOutputPolicy/);
assert.match(studioService, /submitEmoticonJob[\s\S]*?await resolveGenerationOutputPolicy/);
assert.match(v2Controller, /await resolveEmoticonPlatformProfile\(\{[\s\S]*?platform: input\.intent\.targetPlatform/);
assert.match(v2Controller, /const startManualImport[\s\S]*?await resolveEmoticonPlatformProfile\(\{[\s\S]*?platform: project\.platform[\s\S]*?submitEmoticonFrameImportJob/);
assert.match(serverPolicy, /resolveEmoticonGenerationPolicy[\s\S]*?db\.collection\(POLICY_COLLECTION\)\.doc\(policyId\)\.get\(\)/);
assert.match(serverPolicy, /value\.enabled !== true[\s\S]*?return null/);
assert.match(serverPolicy, /catch \{[\s\S]*?return fallback/);
assert.match(serverTrigger, /await resolveEmoticonGenerationPolicy[\s\S]*?parsed\.data\.outputProfile = resolvedPlatformPolicy\.outputProfile/);
assert.match(serverTrigger, /platformPolicyResolution:[\s\S]*?revision: resolvedPlatformPolicy\.revision/);
assert.match(rules, /match \/emoticonStudioPlatformPolicies\/\{policyId\}/);
assert.match(rules, /allow read: if signedIn\(\)/);
assert.match(rules, /allow create: if isAdmin\(\)[\s\S]*?validEmoticonPlatformPolicyPreset/);
assert.match(rules, /allow update: if isAdmin\(\)[\s\S]*?resource\.data\.revision \+ 1/);
assert.match(rules, /allow delete: if false/);
assert.match(rules, /collection != 'emoticonStudioPlatformPolicies'/);

console.log('Emoticon shared data-model and editable platform-policy contracts passed.');
