import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relativePath) => fs.readFileSync(path.join(rootDirectory, relativePath), 'utf8');

const director = readSource('functions/src/emoticonStudio/director.ts');
const imageGeneration = readSource('functions/src/emoticonStudio/imageGeneration.ts');
const qualityStandards = readSource('functions/src/emoticonStudio/qualityStandards.ts');
const renderer = readSource('functions/src/emoticonStudio/renderer.ts');
const trigger = readSource('functions/src/triggers/onEmoticonJobCreated.ts');
const page = readSource('src/app/admin/emoticon-studio/page.tsx');
const service = readSource('src/services/emoticonStudioService.ts');

assert.match(director, /requiresTrueBodyMotion/);
assert.match(director, /applyEmoticonMotionPolicy/);
assert.match(director, /motionPreference === 'stable'/);
assert.match(director, /normal and dynamic requests/);
assert.match(director, /planEmoticonFrameSequence/);
assert.match(director, /Return exactly \$\{frameCount\} chronological frames/);
assert.match(director, /Frame 0 and the final frame must connect smoothly/);
assert.match(director, /evaluateEmoticonMotion/);
assert.match(director, /limbPoseChange/);
assert.match(director, /facialExpressionChange/);
assert.match(director, /frameConsistency/);
assert.match(director, /loopContinuity/);
assert.match(director, /backgroundClean/);
assert.match(director, /singleCharacter/);
assert.match(director, /occlusionFree/);
assert.match(director, /problemFrameIndices/);
assert.match(director, /Inspect every supplied frame/);
assert.match(director, /cameraOnly/);
assert.match(director, /correction: 'Recreate one isolated full character/);

assert.match(qualityStandards, /EMOTICON_MOTION_ACCEPTANCE/);
assert.match(qualityStandards, /limbOrExpressionChange: 68/);
assert.match(qualityStandards, /frameConsistency: 72/);
assert.match(qualityStandards, /backgroundClean: 88/);
assert.match(qualityStandards, /singleCharacter/);
assert.match(qualityStandards, /occlusionFree: 85/);
assert.match(qualityStandards, /getEmoticonActionTemplate/);
assert.match(qualityStandards, /eight-step running cycle/);

assert.match(imageGeneration, /generateEmoticonAnimationFrame/);
assert.match(imageGeneration, /additionalReferenceUrls/);
assert.match(imageGeneration, /Change the character itself from the previous frame/);
assert.match(imageGeneration, /Exact body pose/);
assert.match(imageGeneration, /Exact facial expression/);
assert.match(imageGeneration, /Exactly one isolated character only/);
assert.match(imageGeneration, /detached prop, duplicated limb, second face, second body/);
assert.match(imageGeneration, /Action-specific animation rule/);
assert.match(imageGeneration, /accepts\('seed'\)/);

assert.match(renderer, /renderImageSequenceEmoticon/);
assert.match(renderer, /normalizeCharacterSequence/);
assert.match(renderer, /const union = bounds\.reduce/);
assert.match(renderer, /removeDistantResidualComponents/);
assert.match(renderer, /tiny, disconnected artifacts/);
assert.match(renderer, /evaluateEmoticonFrameVariation/);
assert.match(renderer, /FRAME_DUPLICATE_THRESHOLD/);
assert.match(renderer, /applyMotion: false/);

assert.match(trigger, /isVerifiedBodyMotion/);
assert.match(trigger, /meetsEmoticonMotionAcceptance/);
assert.match(trigger, /meetsEmoticonPoseAcceptance/);
assert.match(trigger, /rejecting the unverified pose/);
assert.match(trigger, /correction: quality\.correction\.trim\(\)/);
assert.match(trigger, /generateEmoticonAnimationFrame/);
assert.match(trigger, /renderImageSequenceEmoticon/);
assert.match(trigger, /evaluateEmoticonFrameVariation/);
assert.match(trigger, /downloadStoredAnimationFrames/);
assert.match(trigger, /reused-ai-frame-/);
assert.match(trigger, /animationFrames/);
assert.match(trigger, /Only a completed, verified animation can be reused/);
assert.match(trigger, /planEmoticonFrameSequence/);
assert.match(trigger, /startIndex: 0, pass: 1/);
assert.match(trigger, /repairPasses: 1/);
assert.match(trigger, /problemFrameIndices/);
assert.match(trigger, /frameIndex < frameCount/);
assert.doesNotMatch(trigger, /falling back to keyframe motion/);
assert.doesNotMatch(trigger, /generateOpenRouterVideo/);
assert.doesNotMatch(trigger, /renderVideoEmoticon/);

assert.match(page, /canReuseEmoticonAnimationFrames/);
assert.match(page, /canRerenderActiveAnimation/);
assert.match(service, /canReuseEmoticonAnimationFrames/);
assert.match(service, /job\.status === 'completed'/);

console.log('Emoticon true-motion integrity checks passed.');
