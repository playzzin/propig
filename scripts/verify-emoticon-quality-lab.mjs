import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  getEmoticonActionTemplate,
  meetsEmoticonMotionAcceptance,
  meetsEmoticonPoseAcceptance,
} = require('../functions/lib/emoticonStudio/qualityStandards.js');
const { scoreImageModelForEmoticons } = require('../functions/lib/emoticonStudio/imageGeneration.js');

const planFor = (action, emotion = '신남') => ({
  directorSummary: action,
  action: {
    title: action,
    action,
    emotion,
    videoPrompt: action,
  },
});

assert.equal(getEmoticonActionTemplate(planFor('달리기')).id, 'running');
assert.equal(getEmoticonActionTemplate(planFor('걸어가기')).id, 'walking');
assert.equal(getEmoticonActionTemplate(planFor('신나는 춤')).id, 'dancing');
assert.equal(getEmoticonActionTemplate(planFor('점프')).id, 'jumping');
assert.equal(getEmoticonActionTemplate(planFor('손 흔들며 인사')).id, 'waving');
assert.equal(getEmoticonActionTemplate(planFor('말하기')).id, 'speaking');
assert.equal(getEmoticonActionTemplate(planFor('윙크')).id, 'expression');

const cleanPose = {
  overall: 90,
  identity: 90,
  actionClarity: 90,
  styleConsistency: 90,
  backgroundClean: 95,
  singleCharacter: true,
  occlusionFree: 95,
  issues: [],
  correction: '',
};
assert.equal(meetsEmoticonPoseAcceptance(cleanPose), true);
assert.equal(meetsEmoticonPoseAcceptance({ ...cleanPose, backgroundClean: 60 }), false);
assert.equal(meetsEmoticonPoseAcceptance({ ...cleanPose, singleCharacter: false }), false);
assert.equal(meetsEmoticonPoseAcceptance({ ...cleanPose, occlusionFree: 60 }), false);

const cleanMotion = {
  ...cleanPose,
  limbPoseChange: 88,
  facialExpressionChange: 75,
  frameConsistency: 90,
  loopContinuity: 82,
  cameraOnly: false,
  problemFrameIndices: [],
};
assert.equal(meetsEmoticonMotionAcceptance(cleanMotion), true);
assert.equal(meetsEmoticonMotionAcceptance({ ...cleanMotion, cameraOnly: true }), false);
assert.equal(meetsEmoticonMotionAcceptance({ ...cleanMotion, backgroundClean: 70 }), false);
assert.equal(meetsEmoticonMotionAcceptance({ ...cleanMotion, occlusionFree: 70 }), false);

const fullCapabilityModel = {
  id: 'openai/gpt-image-1',
  architecture: { input_modalities: ['text', 'image'], output_modalities: ['image'] },
  supported_parameters: ['input_references', 'background', 'quality', 'seed', 'output_format', 'aspect_ratio'],
};
const basicModel = {
  id: 'example/basic-image',
  architecture: { input_modalities: ['text', 'image'], output_modalities: ['image'] },
  supported_parameters: ['input_references'],
};
assert.ok(scoreImageModelForEmoticons(fullCapabilityModel) > scoreImageModelForEmoticons(basicModel));
assert.ok(scoreImageModelForEmoticons(basicModel, 'example/basic-image') > scoreImageModelForEmoticons(fullCapabilityModel));

console.log('Emoticon quality lab checks passed.');
