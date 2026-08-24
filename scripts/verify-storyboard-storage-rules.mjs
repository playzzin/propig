import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const rules = await readFile(new URL("../storage.rules", import.meta.url), "utf8");

assert.match(
  rules,
  /match \/users\/\{userId\}\/emoticon-studio\/sources\/\{fileName\}[\s\S]*allow read: if isOwner\(userId\) \|\| isAdmin\(\);[\s\S]*allow write: if false;/,
  "Emoticon source uploads must be server-owned and read-only to browser clients.",
);
assert.match(
  rules,
  /match \/users\/\{userId\}\/emoticon-studio\/jobs\/\{fileName=\*\*\}[\s\S]*allow read:[\s\S]*allow write: if false;/,
  "Rendered emoticon frames and outputs must be client read-only.",
);

const sourceUpload = await readFile(
  new URL('../functions/src/emoticonStudio/uploadSource.ts', import.meta.url),
  'utf8',
);
const sourceService = await readFile(
  new URL('../src/services/emoticonStudioService.ts', import.meta.url),
  'utf8',
);
assert.match(sourceUpload, /requireStudioAdmin\(uid/);
assert.match(sourceUpload, /detectContentType\(source\)/);
assert.match(sourceUpload, /normalizeEmoticonSourceImage\(source\)/);
assert.match(
  sourceUpload,
  /return db\.runTransaction\(async \(transaction\) => \{[\s\S]*transaction\.get\(assetRef\)[\s\S]*transaction\.get\(quotaRef\)[\s\S]*count \+ 1 > countLimit \|\| bytes \+ params\.byteLength > byteLimit[\s\S]*transaction\.set\(quotaRef,[\s\S]*transaction\.set\(assetRef,/,
  "Source asset reservation and daily quota accounting must stay in one transaction.",
);
assert.match(
  sourceUpload,
  /const sha256 = createHash\('sha256'\)\.update\(normalized\)\.digest\('hex'\);[\s\S]*const assetId = sha256;[\s\S]*reserveSourceAsset\(\{[\s\S]*byteLength: source\.byteLength,/,
  "Normalized source uploads must use a content-addressed, quota-accounted reservation.",
);
assert.match(
  sourceUpload,
  /users\/\$\{params\.uid\}\/emoticon-studio\/sources\/source-\$\{params\.assetId\}\.png/,
);
assert.match(sourceUpload, /preconditionOpts: \{ ifGenerationMatch: 0 \}/);
assert.doesNotMatch(sourceService, /uploadBytes\(/);
assert.match(sourceService, /httpsCallable<[\s\S]*'uploadEmoticonSource'/);
assert.match(
  rules,
  /match \/users\/\{userId\}\/\{fileName=\*\*\}[\s\S]*!isEmoticonStudioPath\(fileName\)/,
  "The broad user Storage rule must exclude the protected emoticon studio namespace.",
);
assert.match(
  rules,
  /match \/\{fileName=\*\*\}[\s\S]*allow read: if !fileName\.matches\('\(users\|drive\|ai_generations\|video_studio\)\/\.\*'\);[\s\S]*!fileName\.matches\('\(users\/\[\^\/\]\+\/emoticon-studio\|video_studio\)\/\.\*'\);/,
  "The global Storage fallback must not reopen private user files or protected emoticon-studio writes.",
);
assert.match(
  rules,
  /match \/video_studio\/\{userId\}\/\{projectId\}\/\{fileName=\*\*\}[\s\S]*allow read: if isOwner\(userId\) \|\| isAdmin\(\);[\s\S]*allow write: if false;/,
  "Video Studio artifacts must be readable only by their owner or an admin and writable only by the server.",
);
assert.doesNotMatch(
  rules,
  /allow read: if !fileName\.matches\('\(users\|drive\|ai_generations\)\/\.\*'\);/,
  "The public fallback must never reopen the Video Studio namespace.",
);

assert.ok(rules.includes("isStoryboardReferencePath(fileName)"));
assert.ok(rules.includes("request.resource.size <= 8 * 1024 * 1024"));
assert.ok(rules.includes("image/(avif|gif|jpeg|png|webp)"));
assert.ok(
  rules.includes("allow create, update: if (isOwner(userId) || isAdmin())"),
  "Storyboard reference write validation must apply to both owners and admins.",
);
assert.ok(
  rules.includes("allow delete: if (isOwner(userId) || isAdmin()) && !isEmoticonStudioPath(fileName);"),
  "Failed or replaced reference files must still be removable by their owner.",
);

console.log("Storyboard Storage rules verified.");
