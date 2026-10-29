import assert from "node:assert/strict";
import {
  detectReferenceImageMimeType,
  validateReferenceImageSignature,
} from "../src/lib/reference-image-validation.ts";

assert.equal(
  detectReferenceImageMimeType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/png",
);
assert.equal(
  detectReferenceImageMimeType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])),
  "image/jpeg",
);
assert.equal(
  detectReferenceImageMimeType(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])),
  "image/gif",
);
assert.equal(
  detectReferenceImageMimeType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])),
  "image/webp",
);

const spoofed = new File(["not an image"], "spoofed.png", { type: "image/png" });
await assert.rejects(
  () => validateReferenceImageSignature(spoofed),
  /일치하지 않습니다/,
  "A MIME-spoofed file must be rejected before it reaches Storage.",
);

console.log("Storyboard reference upload signature checks verified.");
