import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const read = (relativePath) => readFile(resolve(root, relativePath), "utf8");

function assertContains(source, expected, label) {
  if (!source.includes(expected)) {
    throw new Error(`${label} is missing: ${expected}`);
  }
}

const [downloadUtility, workspace, videoPanel, sceneEditor, finalDelivery] =
  await Promise.all([
    read("src/lib/client/media-download.ts"),
    read("src/components/image-generator/StoryboardWorkspace.tsx"),
    read("src/components/image-generator/StoryboardVideoProductionPanel.tsx"),
    read("src/components/image-generator/StoryboardSceneProductionEditor.tsx"),
    read("src/components/image-generator/StoryboardFinalDelivery.tsx"),
  ]);
const videoSurface = [videoPanel, sceneEditor, finalDelivery].join("\n");

assertContains(downloadUtility, "downloadRemoteMedia", "Blob download helper");
assertContains(
  downloadUtility,
  "URL.createObjectURL",
  "Blob URL download flow",
);
assertContains(downloadUtility, "openRemoteMedia", "Download fallback");

assertContains(
  workspace,
  "handleDownloadSceneImage",
  "Storyboard image download action",
);
assertContains(
  workspace,
  "이미지 다운로드",
  "Storyboard image download button",
);

assertContains(
  videoPanel,
  "handleDownloadAsset",
  "Video asset download action",
);
assertContains(videoSurface, "사진 받기", "Scene image download button");
assertContains(videoSurface, "영상 받기", "Scene video download button");
assertContains(videoSurface, "완성 영상", "Final video download action");

console.log("Storyboard media download verification passed");
