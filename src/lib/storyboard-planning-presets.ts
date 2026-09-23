import { z } from "zod";
import { ImageStoryboardSchema, type ImageStoryboard } from "@/schemas/imageStoryboard";
import { resetStoryboardVideoProduction } from "@/lib/storyboard-video-production";

const SettingsSchema = ImageStoryboardSchema.pick({
  format: true, plannedSceneCount: true, aspectRatio: true, stylePreset: true,
  audience: true, artDirection: true, characterContinuity: true, settingContinuity: true,
  colorAndLighting: true, usePreviousSceneAsReference: true,
}).strict();

export type StoryboardPresetSettings = z.infer<typeof SettingsSchema>;
export const STORYBOARD_PRESET_LABELS: Record<keyof StoryboardPresetSettings, string> = {
  format: "영상 목적", plannedSceneCount: "다음 설계의 장면 수", aspectRatio: "화면 비율",
  stylePreset: "이미지 스타일", audience: "대상 시청자", artDirection: "연출 방향",
  characterContinuity: "캐릭터 일관성", settingContinuity: "배경 일관성",
  colorAndLighting: "색감과 조명", usePreviousSceneAsReference: "이전 장면 참조",
};
const keys = Object.keys(STORYBOARD_PRESET_LABELS) as (keyof StoryboardPresetSettings)[];
const PresetSchema = z.object({
  id: z.string().min(1).max(80), name: z.string().trim().min(1).max(40),
  settings: SettingsSchema, createdAt: z.number().int().positive(), updatedAt: z.number().int().positive(),
}).strict();
const PresetsSchema = z.array(PresetSchema).max(12).superRefine((presets, ctx) => {
  if (new Set(presets.map((p) => p.id)).size !== presets.length
    || new Set(presets.map((p) => p.name.toLocaleLowerCase())).size !== presets.length) {
    ctx.addIssue({ code: "custom", message: "중복된 프리셋입니다." });
  }
});
const EnvelopeSchema = z.object({ version: z.literal(1), presets: PresetsSchema }).strict();
export type StoryboardPlanningPreset = z.infer<typeof PresetSchema>;
type PresetStorage = Pick<Storage, "getItem" | "setItem">;

export function getStoryboardPresetStorageKey(userId: string): string {
  if (!userId.trim() || userId.length > 128) throw new Error("계정을 확인해 주세요.");
  return `propig:storyboard-planning-presets:v1:${encodeURIComponent(userId)}`;
}

export function getStoryboardPresetSettings(storyboard: ImageStoryboard): StoryboardPresetSettings {
  return SettingsSchema.parse(Object.fromEntries(keys.map((key) => [key, storyboard[key]])));
}

export function readStoryboardPresets(storage: PresetStorage, userId: string): StoryboardPlanningPreset[] {
  const raw = storage.getItem(getStoryboardPresetStorageKey(userId));
  if (raw === null) return [];
  if (raw.length > 100_000) throw new Error("프리셋 데이터가 너무 큽니다.");
  return EnvelopeSchema.parse(JSON.parse(raw)).presets;
}

export function writeStoryboardPresets(storage: PresetStorage, userId: string, presets: StoryboardPlanningPreset[]): void {
  const validated = EnvelopeSchema.parse({ version: 1, presets });
  storage.setItem(getStoryboardPresetStorageKey(userId), JSON.stringify(validated));
}

export function upsertStoryboardPreset(
  presets: StoryboardPlanningPreset[], name: string, settings: StoryboardPresetSettings, now: number, id: string,
): StoryboardPlanningPreset[] {
  const normalized = name.trim();
  const previous = presets.find((p) => p.name.toLocaleLowerCase() === normalized.toLocaleLowerCase());
  const preset = PresetSchema.parse({ id: previous?.id ?? id, name: normalized, settings,
    createdAt: previous?.createdAt ?? now, updatedAt: now });
  return PresetsSchema.parse(previous ? presets.map((p) => p.id === previous.id ? preset : p) : [...presets, preset]);
}

export function isStoryboardPresetApplyBusy(storyboard: ImageStoryboard): boolean {
  return ["preparing", "running", "pausing", "merging"].includes(storyboard.videoProduction.automationStatus)
    || ["queued", "rendering"].includes(storyboard.videoProduction.finalStatus)
    || storyboard.scenes.some((scene) => ["queued", "rendering"].includes(scene.video.status));
}

export function getStoryboardPresetChanges(storyboard: ImageStoryboard, settings: StoryboardPresetSettings) {
  return keys.filter((key) => storyboard[key] !== settings[key]);
}

export function applyStoryboardPlanningPreset(storyboard: ImageStoryboard, settings: StoryboardPresetSettings): ImageStoryboard {
  const parsed = SettingsSchema.safeParse(settings);
  if (!parsed.success || isStoryboardPresetApplyBusy(storyboard)) return storyboard;
  const changes = getStoryboardPresetChanges(storyboard, parsed.data);
  if (!changes.length) return storyboard;
  const next = { ...storyboard, ...parsed.data };
  // Planning a different count never adds or removes existing scenes.
  if (changes.every((key) => key === "format" || key === "plannedSceneCount")) return next;
  return {
    ...next,
    transitionLinks: storyboard.transitionLinks.map((link) => ({ ...link, needsReview: true })),
    videoProduction: resetStoryboardVideoProduction(storyboard.videoProduction),
    scenes: storyboard.scenes.map((scene) => {
      const hasResult = Boolean(scene.generatedImage || scene.video.videoUrl || scene.video.clipId);
      return {
        ...scene, imageDesignRevision: scene.imageDesignRevision + 1, videoDesignRevision: scene.videoDesignRevision + 1,
        approvedImageArtifactId: null, approvedVideoArtifactId: null,
        assetFreshness: hasResult ? "review" : "current",
        staleReason: hasResult ? "기획 프리셋이 변경되었습니다. 기존 결과와 새 설정을 비교해 주세요." : null,
        video: { ...scene.video, approvedAt: null,
          status: scene.video.videoUrl || scene.video.clipId ? "review" : scene.video.status },
      };
    }),
  };
}
