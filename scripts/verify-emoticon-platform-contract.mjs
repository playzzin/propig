import assert from 'node:assert/strict';
import {
  EMOTICON_FORMAT_OUTPUT_CONTRACTS,
  KAKAO_AI_POLICY_NOTICE,
  findEmoticonPlatformProfile,
  getEmoticonFormatOutputContract,
  getEmoticonPlatformProfile,
  toEmoticonOutputProfile,
} from '../src/lib/emoticonPlatformProfiles.ts';
import { EMOTICON_SUBMISSION_FORMAT_CONTRACTS } from '../src/lib/emoticonSubmissionPackage.ts';

const platforms = ['kakao', 'line', 'telegram', 'sns', 'custom'];
const projectTypes = ['static', 'animated'];
const formats = ['png', 'apng', 'webp', 'gif', 'mp4', 'webm', 'png_zip'];

const kakaoAnimated = getEmoticonPlatformProfile('kakao', 'animated');
assert.deepEqual(findEmoticonPlatformProfile('kakao', 'animated'), kakaoAnimated);
assert.equal(findEmoticonPlatformProfile('unknown', 'animated'), null);
assert.equal(kakaoAnimated.width, 360);
assert.equal(kakaoAnimated.height, 360);
assert.equal(kakaoAnimated.maxFrameCount, 24);
assert.equal(kakaoAnimated.verification, 'verified');
assert.equal(kakaoAnimated.constraintVerification.canvas, 'verified');
assert.equal(kakaoAnimated.constraintVerification.minFrameCount, 'reference');
assert.equal(kakaoAnimated.constraintVerification.maxFrameCount, 'verified');
assert.equal(kakaoAnimated.constraintVerification.recommendedItemCount, 'reference');
assert.equal(kakaoAnimated.submissionCandidate, false);
assert.match(kakaoAnimated.sourceUrl, /^https:\/\/emoticonstudio\.kakao\.com\/webp-animator$/);
assert.match(KAKAO_AI_POLICY_NOTICE, /생성형 AI.*제한/);
assert.deepEqual(kakaoAnimated.formatPolicies, [
  {
    format: 'webp',
    verification: 'verified',
    role: 'platform-reference',
    submissionCandidate: false,
  },
  {
    format: 'png_zip',
    verification: 'reference',
    role: 'working-output',
    submissionCandidate: false,
  },
]);
assert.equal(
  kakaoAnimated.formatPolicies.find((policy) => policy.format === 'png_zip').role,
  'working-output',
);
assert.equal(
  kakaoAnimated.formatPolicies.find((policy) => policy.format === 'webp').role,
  'platform-reference',
);
assert.strictEqual(
  EMOTICON_SUBMISSION_FORMAT_CONTRACTS,
  EMOTICON_FORMAT_OUTPUT_CONTRACTS,
  'Submission packaging must consume the shared output-format contract object.',
);

for (const platform of platforms) {
  for (const projectType of projectTypes) {
    const profile = getEmoticonPlatformProfile(platform, projectType);
    assert.equal(profile.submissionCandidate, false);
    assert.equal(profile.allowedFormats.length, profile.formatPolicies.length);
    assert.deepEqual(
      profile.allowedFormats,
      profile.formatPolicies.map((policy) => policy.format),
    );
    assert.ok(profile.formatPolicies.every((policy) => policy.submissionCandidate === false));

    if (platform !== 'line') {
      for (const limit of Object.values(profile.platformLimits)) {
        assert.equal(limit.value, undefined);
        assert.equal(limit.verification, 'reference');
      }
    }

    if (platform !== 'kakao' && platform !== 'line') {
      assert.equal(profile.verification, 'reference');
      assert.ok(Object.values(profile.constraintVerification).every((value) => value === 'reference'));
      assert.ok(profile.formatPolicies.every((policy) => policy.verification === 'reference'));
    }
  }
}

for (const format of formats) {
  const contract = getEmoticonFormatOutputContract(format);
  assert.deepEqual(contract, EMOTICON_FORMAT_OUTPUT_CONTRACTS[format]);
  assert.deepEqual(contract, EMOTICON_SUBMISSION_FORMAT_CONTRACTS[format]);
  assert.equal(contract.submissionCandidate, false);
}

const mp4Contract = getEmoticonFormatOutputContract('mp4');
assert.equal(mp4Contract.alphaCapability, 'unsupported');
assert.equal(mp4Contract.transparentSourceHandling, 'flatten-to-opaque');
assert.equal(mp4Contract.transparencyCoverageInspection, 'not-applicable');
assert.equal(mp4Contract.deliveryRole, 'distribution-copy');
assert.equal(mp4Contract.expectedInspectionLoop, false);

const apngContract = getEmoticonFormatOutputContract('apng');
assert.equal(apngContract.extension, 'apng.png');
assert.equal(apngContract.contentType, 'image/png');
assert.equal(apngContract.deliveryRole, 'animated-asset');
assert.equal(apngContract.expectedInspectionLoop, true);

for (const format of formats.filter((format) => format !== 'mp4')) {
  assert.equal(getEmoticonFormatOutputContract(format).alphaCapability, 'supported');
}

const outputProfile = toEmoticonOutputProfile(kakaoAnimated);
assert.deepEqual(outputProfile.allowedFormats, ['webp', 'png_zip']);
assert.equal(outputProfile.minFrameCount, 2);
assert.equal(outputProfile.maxFrameCount, 24);
assert.equal(outputProfile.submissionCandidate, false);
assert.deepEqual(outputProfile.formatCapabilities, {
  webp: { alpha: 'supported' },
  png_zip: { alpha: 'supported' },
});
assert.equal('maxFileSizeBytes' in outputProfile, false);
assert.equal('maxDurationMs' in outputProfile, false);
assert.equal('loopCount' in outputProfile, false);

const customAnimated = getEmoticonPlatformProfile('custom', 'animated');
const customOutputProfile = toEmoticonOutputProfile(customAnimated);
assert.deepEqual(customOutputProfile.formatCapabilities.mp4, { alpha: 'unsupported' });

const lineAnimated = getEmoticonPlatformProfile('line', 'animated');
assert.equal(lineAnimated.verification, 'verified');
assert.equal(lineAnimated.width, 320);
assert.equal(lineAnimated.height, 270);
assert.equal(lineAnimated.minFrameCount, 5);
assert.equal(lineAnimated.maxFrameCount, 20);
assert.equal(lineAnimated.preferredFormat, 'apng');
assert.deepEqual(lineAnimated.allowedFormats, ['apng', 'gif', 'webp', 'png_zip']);
assert.equal(lineAnimated.platformLimits.maxFileSizeBytes.value, 1024 * 1024);
assert.equal(lineAnimated.platformLimits.maxDurationMs.value, 4_000);
assert.equal(lineAnimated.platformLimits.maxLoopCount.value, 4);
assert.equal(lineAnimated.defaultLoopCount, 1);
assert.match(lineAnimated.sourceUrl, /^https:\/\/creator\.line\.me\/en\/guideline\/animationsticker\/$/);
const lineOutputProfile = toEmoticonOutputProfile(lineAnimated);
assert.equal(lineOutputProfile.loopCount, 1);
assert.equal(lineOutputProfile.maxDurationMs, 4_000);
assert.equal(lineOutputProfile.maxFileSizeBytes, 1024 * 1024);

const lineStatic = getEmoticonPlatformProfile('line', 'static');
assert.equal(lineStatic.verification, 'verified');
assert.equal(lineStatic.width, 370);
assert.equal(lineStatic.height, 320);
assert.deepEqual(lineStatic.allowedFormats, ['png']);

kakaoAnimated.allowedFormats.push('gif');
kakaoAnimated.formatPolicies[0].verification = 'reference';
kakaoAnimated.platformLimits.maxFileSizeBytes.value = 1;
const unchangedKakaoAnimated = getEmoticonPlatformProfile('kakao', 'animated');
assert.deepEqual(unchangedKakaoAnimated.allowedFormats, ['webp', 'png_zip']);
assert.equal(unchangedKakaoAnimated.formatPolicies[0].verification, 'verified');
assert.equal(unchangedKakaoAnimated.platformLimits.maxFileSizeBytes.value, undefined);

console.log('Emoticon platform output contract checks passed.');
