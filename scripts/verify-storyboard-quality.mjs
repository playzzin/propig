import assert from "node:assert/strict";
import { inspectStoryboardQuality } from "../src/lib/storyboard-quality.ts";

function scene(id, order, overrides = {}) {
  return {
    id,
    order,
    title: `장면 ${order}`,
    visualPrompt: `장면 ${order}의 명확한 시각적 설명`,
    imagePrompt: `A distinct cinematic composition for scene ${order} with a clear subject, foreground, lighting, material detail, and environment.`,
    negativePrompt: "blur, watermark, readable text",
    transition: order === 1 ? "첫 장면의 훅으로 시작" : "앞 장면의 빛과 시선을 이어 전환",
    dialogueOrCaption: "",
    video: {
      status: "brief",
      motionPrompt: "",
      audioMode: "silent",
    },
    ...overrides,
  };
}

const healthy = {
  artDirection: "차분한 시네마틱 광고",
  characterContinuity: "동일한 주인공과 의상",
  settingContinuity: "한 장소의 일관된 구조",
  colorAndLighting: "따뜻한 오후빛",
  videoProduction: { finalStatus: "idle", finalAssemblyManifest: null },
  scenes: [scene("one", 1), scene("two", 2)],
};

const healthyReport = inspectStoryboardQuality(healthy);
assert.equal(healthyReport.issues.length, 0, "A complete plan must have no quality blockers.");
assert.equal(healthyReport.score, 100, "A complete plan must receive a full quality score.");

const broken = {
  ...healthy,
  videoProduction: { finalStatus: "completed", finalAssemblyManifest: null },
  scenes: [
    scene("duplicate", 4, {
      title: "같은 장면",
      imagePrompt: "repeat prompt",
      negativePrompt: "",
      dialogueOrCaption: "이 장면의 대사",
      video: { status: "rendering", motionPrompt: "", audioMode: "silent" },
    }),
    scene("duplicate", 2, {
      title: "같은 장면",
      imagePrompt: "repeat prompt",
      transition: "",
    }),
    scene("unsafe", 3, {
      visualPrompt: "<script>alert(1)</script>",
    }),
  ],
};

const codes = new Set(inspectStoryboardQuality(broken).issues.map((item) => item.code));
for (const code of [
  "scene-order",
  "duplicate-scene-id",
  "duplicate-scene-title",
  "duplicate-image-prompt",
  "missing-negative-prompt",
  "missing-transition",
  "missing-motion-prompt",
  "dialogue-audio-mismatch",
  "final-manifest-missing",
  "unsafe-markup",
]) {
  assert.ok(codes.has(code), `Quality inspection must detect ${code}.`);
}

console.log("Storyboard quality inspection verified.");
