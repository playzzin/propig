import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const rules = await readFile(new URL("../storage.rules", import.meta.url), "utf8");

assert.match(
  rules,
  /match \/\{fileName=\*\*\}[\s\S]*allow read: if false;/,
  "The global Storage fallback must fail closed for reads so undeclared namespaces are never public.",
);
assert.match(
  rules,
  /match \/\{fileName=\*\*\}[\s\S]*allow create, update: if isAdmin\(\) &&[\s\S]*!isRetiredStoragePath\(fileName\) &&[\s\S]*request\.resource\.size <= 100 \* 1024 \* 1024;[\s\S]*allow delete: if isAdmin\(\) && !isRetiredStoragePath\(fileName\);/,
  "Legacy admin Storage management must stay authenticated and size-capped without opening reads.",
);
assert.match(
  rules,
  /match \/video_studio\/\{userId\}\/\{projectId\}\/\{fileName=\*\*\}[\s\S]*allow read: if isOwner\(userId\) \|\| isAdmin\(\);[\s\S]*allow write: if false;/,
  "Video Studio artifacts must be readable only by their owner or an admin and writable only by the server.",
);
assert.doesNotMatch(
  rules,
  /match \/\{fileName=\*\*\}[\s\S]*allow read: if !fileName\.matches/,
  "The global fallback must never grant reads by excluding a growing blocklist.",
);
assert.match(
  rules,
  /match \/images\/albums\/\{albumId\}\/\{fileName=\*\*\}[\s\S]*allow read: if true;[\s\S]*allow write: if isAdmin\(\);/,
  "The intentionally public album namespace must remain explicitly declared.",
);
assert.match(
  rules,
  /match \/corp\/\{fileName=\*\*\}[\s\S]*allow read: if true;[\s\S]*allow write: if isAdmin\(\);/,
  "Legacy corporate assets must remain explicitly public and admin-managed.",
);

assert.ok(rules.includes("isStoryboardReferencePath(fileName)"));
assert.ok(rules.includes("request.resource.size <= 8 * 1024 * 1024"));
assert.ok(rules.includes("image/(avif|gif|jpeg|png|webp)"));
assert.ok(
  rules.includes("allow create, update: if (isOwner(userId) || isAdmin())"),
  "Storyboard reference write validation must apply to both owners and admins.",
);
assert.ok(
  rules.includes("allow delete: if (isOwner(userId) || isAdmin()) && !isRetiredUserProgramPath(fileName);"),
  "Failed or replaced reference files must still be removable by their owner.",
);
assert.match(
  rules,
  /function isRetiredUserProgramPath\(fileName\)[\s\S]*!isRetiredUserProgramPath\(fileName\)/,
  "Retired user program assets must not fall through to broad owner access.",
);
assert.match(
  rules,
  /function isRetiredStoragePath\(fileName\)[\s\S]*!isRetiredStoragePath\(fileName\)/,
  "Retired program assets must not fall through to broad admin writes.",
);

console.log("Storyboard Storage rules verified.");
