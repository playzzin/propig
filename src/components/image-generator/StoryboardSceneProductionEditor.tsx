"use client";

import {
  normalizeStoryboardSpokenDialogue,
  type StoryboardDialogueTiming,
} from "@/lib/storyboard-video-audio";
import { createDownloadFileName } from "@/lib/client/media-download";
import type {
  ImageStoryboardScene,
  StoryboardVideoAudioMode,
  StoryboardVideoScene,
  StoryboardVoiceProfile,
} from "@/schemas/imageStoryboard";
import {
  IMAGE_REFERENCE_ROLE_LABELS,
  type ImageReferenceAsset,
} from "@/types/imageReference";
import { BufferedTextarea } from "@/components/image-generator/BufferedTextField";
import type { VideoStudioEstimate } from "@/services/videoStudioService";
import {
  SceneProductionRow,
  SceneMedia,
  EmptyFrame,
  SceneNumber,
  SceneBrief,
  SceneBriefHeader,
  SceneQualityBadge,
  StatusBadge,
  FieldLabel,
  MotionEditorActions,
  MotionChangeNotice,
  SceneControls,
  DurationControl,
  MotionControl,
  ReferenceSignal,
  AudioModeSection,
  AudioModeHeader,
  AudioModeSelector,
  DialogueComposer,
  DialogueTimingRow,
  DialogueTimingTrack,
  LipSyncHint,
  SceneAdvancedDetails,
  SceneReferencePicker,
  ReferencePickerHeader,
  ReferenceResetButton,
  ReferenceChoiceList,
  EndFrameToggle,
  EndFrameNote,
  ClipEditor,
  ClipEditorGrid,
  SceneQualityNote,
  RenderSignals,
  RecoveryNotice,
  RecoveryRegenerateButton,
  SceneError,
  PrivacyRecovery,
  PrivacyFallbackButton,
  SceneActionBar,
  SceneCost,
  ModelDecision,
  SceneMoreActions,
  DuplicateSceneButton,
  SceneDownloadButton,
  ReviewButton,
  GenerateButton,
} from "./StoryboardVideoProductionPanel.styles";

const MAX_VIDEO_REFERENCE_IMAGES = 2;

type SceneQuality = {
  label: string;
  note: string;
  score: number;
  tone: "ready" | "progress" | "needs";
};

type SceneRecovery = {
  actionLabel: string;
  canReuseProviderJob: boolean;
  description: string;
  title: string;
};

type MotionPreset = {
  instruction: string;
  label: string;
  value: StoryboardVideoScene["motionIntensity"];
};

type AudioModeOption = {
  description: string;
  icon: string;
  label: string;
  value: StoryboardVideoAudioMode;
};

function formatCatalogTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "방금 확인";
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function describeVisualInputPolicy(
  policy: VideoStudioEstimate["policy"]["visualInputState"],
): string {
  if (policy === "not_requested") {
    return "사진을 보내지 않는 텍스트 기반 장면입니다. 인물 사진 정책 검토 없이 제작됩니다.";
  }
  if (policy === "previously_rejected") {
    return "이 장면의 참조 사진은 이미 제공사 정책에서 제한되었습니다. 같은 사진을 다른 모델에 자동 재시도하지 않으며, 사진 없이 새 테이크 또는 대체 레퍼런스를 권장합니다.";
  }
  return "프레임·참조 입력은 기술적으로 지원됩니다. 다만 실사 인물 사진의 허용은 생성 요청 시 제공사 정책이 최종 판단합니다.";
}

export type StoryboardSceneProductionEditorModel = {
  actualCostLabel: string | null;
  audioModeOptions: AudioModeOption[];
  canDuplicateScene: boolean;
  dialogueTiming: StoryboardDialogueTiming;
  downloadingAssetUrl: string | null;
  durationOptions: readonly number[];
  generationBlockedReason: string | null;
  hasManualReferenceSelection: boolean;
  hasNextEndFrame: boolean;
  hasPendingVideoChanges: boolean;
  hasRepresentativeEstimate: boolean;
  modelPreflight: VideoStudioEstimate | null;
  hasStartFrame: boolean;
  isQueueing: boolean;
  isSceneBusy: boolean;
  isInputImagePrivacyBlocked: boolean;
  motionPresets: MotionPreset[];
  nextScene?: ImageStoryboardScene;
  projectBusy: boolean;
  referenceAssets: ImageReferenceAsset[];
  retryAdvice: string;
  scene: ImageStoryboardScene;
  sceneAudioMode: StoryboardVideoAudioMode;
  sceneAudioVerified: boolean;
  sceneEstimateLabel: string;
  sceneQuality: SceneQuality;
  sceneRecovery: SceneRecovery | null;
  selectedReferenceAssets: ImageReferenceAsset[];
  statusLabel: string;
  storyboardTitle: string;
  suggestedPrompt: string;
  voiceProfiles: StoryboardVoiceProfile[];
};

export type StoryboardSceneProductionEditorActions = {
  onApproval: () => void;
  onDialogueChange: (dialogue: string) => void;
  onDownload: (
    url: string,
    fileName: string,
    label: string,
  ) => void | Promise<void>;
  onDuplicate: () => void;
  onGenerate: () => void | Promise<void>;
  onRegenerate: () => void | Promise<void>;
  onGenerateWithoutVisualInputs: () => void | Promise<void>;
  onPatchVideo: (patch: Partial<StoryboardVideoScene>) => void;
  onVoiceProfileChange: (voiceProfileId: string | null) => void;
  onDurationChange: (duration: number) => void;
};

type StoryboardSceneProductionEditorProps = {
  actions: StoryboardSceneProductionEditorActions;
  model: StoryboardSceneProductionEditorModel;
};

export default function StoryboardSceneProductionEditor({
  actions: {
    onApproval,
    onDialogueChange,
    onDownload,
    onDuplicate,
    onGenerate,
    onRegenerate,
    onGenerateWithoutVisualInputs,
    onPatchVideo,
    onVoiceProfileChange,
    onDurationChange,
  },
  model: {
    actualCostLabel,
    audioModeOptions,
    canDuplicateScene,
    dialogueTiming,
    downloadingAssetUrl,
    durationOptions,
    generationBlockedReason,
    hasManualReferenceSelection,
    hasNextEndFrame,
    hasPendingVideoChanges,
    hasRepresentativeEstimate,
    modelPreflight,
    hasStartFrame,
    isQueueing,
    isSceneBusy,
    isInputImagePrivacyBlocked,
    motionPresets,
    nextScene,
    projectBusy,
    referenceAssets,
    retryAdvice,
    scene,
    sceneAudioMode,
    sceneAudioVerified,
    sceneEstimateLabel,
    sceneQuality,
    sceneRecovery,
    selectedReferenceAssets,
    statusLabel,
    storyboardTitle,
    suggestedPrompt,
    voiceProfiles,
  },
}: StoryboardSceneProductionEditorProps) {
  const spokenDialogue = normalizeStoryboardSpokenDialogue(
    scene.dialogueOrCaption,
  );
  const dialogueWasNormalized =
    Boolean(spokenDialogue) &&
    spokenDialogue !== scene.dialogueOrCaption.trim();
  const dialogueBlocksGeneration =
    sceneAudioMode === "dialogue" &&
    (!scene.dialogueOrCaption.trim() || !dialogueTiming.fitsSupportedDuration);
  const selectedVoiceProfileId = voiceProfiles.some(
    (profile) => profile.id === scene.video.voiceProfileId,
  )
    ? scene.video.voiceProfileId || ""
    : voiceProfiles.length === 1
      ? voiceProfiles[0].id
      : "";
  const selectedVoiceProfile = voiceProfiles.find(
    (profile) => profile.id === selectedVoiceProfileId,
  );
  const voiceSelectionBlocksGeneration =
    sceneAudioMode === "dialogue" &&
    voiceProfiles.length > 1 &&
    !selectedVoiceProfile;
  const commonGenerationBlocked =
    projectBusy || isSceneBusy || Boolean(generationBlockedReason);
  const newProviderRequestDisabled =
    commonGenerationBlocked ||
    !hasStartFrame ||
    dialogueBlocksGeneration ||
    voiceSelectionBlocksGeneration ||
    modelPreflight?.canSubmit === false;
  const primaryGenerationDisabled =
    commonGenerationBlocked ||
    (!sceneRecovery?.canReuseProviderJob &&
      (!hasStartFrame ||
        dialogueBlocksGeneration ||
        voiceSelectionBlocksGeneration ||
        modelPreflight?.canSubmit === false));
  const showApprovalAsPrimary = Boolean(
    scene.video.videoUrl &&
    !scene.video.errorMessage &&
    (scene.video.status === "review" || scene.video.status === "approved") &&
    !hasPendingVideoChanges &&
    !sceneRecovery?.canReuseProviderJob,
  );

  return (
    <SceneProductionRow
      id={`storyboard-video-scene-${scene.id}`}
      $status={scene.video.status}
      tabIndex={-1}
      aria-labelledby={`storyboard-video-scene-title-${scene.id}`}
    >
      <SceneMedia>
        {scene.video.videoUrl ? (
          <video
            src={scene.video.videoUrl}
            poster={scene.generatedImage?.url}
            controls
            preload="metadata"
            aria-label={`${scene.order}번 장면 영상 결과`}
          />
        ) : scene.generatedImage?.url ? (
          <img
            src={scene.generatedImage.url}
            alt={`${scene.title} 시작 프레임`}
            width={320}
            height={180}
            loading="lazy"
          />
        ) : (
          <EmptyFrame>
            <i className="fas fa-image" aria-hidden="true" />
            <span>대표 이미지를 먼저 생성하세요</span>
          </EmptyFrame>
        )}
        <SceneNumber>{String(scene.order).padStart(2, "0")}</SceneNumber>
      </SceneMedia>

      <SceneBrief>
        <SceneBriefHeader>
          <div>
            <span>
              {scene.duration} · {scene.shotSize}
            </span>
            <h4 id={`storyboard-video-scene-title-${scene.id}`}>
              {scene.title}
            </h4>
            <SceneQualityBadge $tone={sceneQuality.tone}>
              {sceneQuality.label} {sceneQuality.score}점
            </SceneQualityBadge>
          </div>
          <StatusBadge $status={scene.video.status}>
            {isSceneBusy ? (
              <i className="fas fa-spinner fa-spin" aria-hidden="true" />
            ) : null}
            {statusLabel}
          </StatusBadge>
        </SceneBriefHeader>
        <FieldLabel as="span">
          영상 움직임
          <span>원하는 느낌만 선택하면 자동 기획이 적용됩니다.</span>
        </FieldLabel>
        <SceneControls>
          <MotionControl role="group" aria-label={`${scene.order}번 장면 움직임 강도`}>
            {motionPresets.map((preset) => (
              <button
                key={preset.value}
                type="button"
                className={
                  scene.video.motionIntensity === preset.value ? "active" : ""
                }
                onClick={() =>
                  onPatchVideo({
                    motionIntensity: preset.value,
                    status: scene.video.videoUrl ? "brief" : scene.video.status,
                    approvedAt: null,
                  })
                }
                disabled={projectBusy || isSceneBusy}
                aria-pressed={scene.video.motionIntensity === preset.value}
              >
                {preset.label}
              </button>
            ))}
          </MotionControl>
          <ReferenceSignal $ready={selectedReferenceAssets.length > 0}>
            <i
              className={
                selectedReferenceAssets.length > 0
                  ? "fas fa-images"
                  : "fas fa-image"
              }
              aria-hidden="true"
            />
            {selectedReferenceAssets.length > 0
              ? `참조 ${selectedReferenceAssets.length}장 · ${hasManualReferenceSelection ? "직접" : "자동"}`
              : "공통 참조 없음"}
          </ReferenceSignal>
        </SceneControls>
        <SceneAdvancedDetails>
          <summary>
            <span>
              <i className="fas fa-sliders" aria-hidden="true" /> 장면
              기획·대사·세부 편집
            </span>
            <small>움직임 · 대사 · 참조 사진 · 연결</small>
            <i className="fas fa-chevron-down" aria-hidden="true" />
          </summary>
          <FieldLabel htmlFor={`video-motion-${scene.id}`}>
            세부 움직임 지시
            <span>
              자동 흐름을 불러와 수정한 뒤 새 시안으로 확인할 수 있습니다.
            </span>
          </FieldLabel>
          <BufferedTextarea
            id={`video-motion-${scene.id}`}
            value={scene.video.motionPrompt}
            onCommit={(motionPrompt) =>
              onPatchVideo({
                motionPrompt,
                status: scene.video.videoUrl ? "brief" : scene.video.status,
                approvedAt: null,
              })
            }
            placeholder={suggestedPrompt}
            maxLength={1800}
            name={`videoMotion-${scene.id}`}
            autoComplete="off"
            disabled={projectBusy || isSceneBusy}
          />
          <MotionEditorActions>
            <span aria-live="polite">
              {scene.video.motionPrompt.trim()
                ? "직접 수정한 움직임 지시가 다음 제작에 적용됩니다."
                : "장면 기획·카메라·연속성 기준으로 자동 움직임을 사용합니다."}
            </span>
            <div>
              <button
                type="button"
                onClick={() =>
                  onPatchVideo({
                    motionPrompt: suggestedPrompt,
                    status: scene.video.videoUrl ? "brief" : scene.video.status,
                    approvedAt: null,
                  })
                }
                disabled={projectBusy || isSceneBusy}
              >
                <i className="fas fa-wand-magic-sparkles" aria-hidden="true" />
                자동 움직임 불러오기
              </button>
              {scene.video.motionPrompt.trim() ? (
                <button
                  type="button"
                  onClick={() =>
                    onPatchVideo({
                      motionPrompt: "",
                      status: scene.video.videoUrl
                        ? "brief"
                        : scene.video.status,
                      approvedAt: null,
                    })
                  }
                  disabled={projectBusy || isSceneBusy}
                >
                  자동 기획으로 되돌리기
                </button>
              ) : null}
            </div>
          </MotionEditorActions>
          {hasPendingVideoChanges ? (
            <MotionChangeNotice role="status">
              <i className="fas fa-pen-to-square" aria-hidden="true" />
              <span>
                <strong>수정 내용이 아직 영상에 반영되지 않았습니다.</strong>{" "}
                기존 영상은 새 제작을 시작하기 전까지 그대로 유지됩니다. 아래
                “수정 내용으로 다시 제작”을 누르면 이 장면만 새 시안으로
                만듭니다.
              </span>
            </MotionChangeNotice>
          ) : null}
          <SceneControls>
            <DurationControl>
              <label htmlFor={`video-duration-${scene.id}`}>길이</label>
              <select
                id={`video-duration-${scene.id}`}
                value={scene.video.durationSeconds}
                name={`videoDuration-${scene.id}`}
                onChange={(event) =>
                  onDurationChange(Number(event.target.value))
                }
                disabled={projectBusy || isSceneBusy}
              >
                {durationOptions.map((duration) => (
                  <option key={duration} value={duration}>
                    {duration}초
                  </option>
                ))}
              </select>
            </DurationControl>
          </SceneControls>
          <AudioModeSection>
            <AudioModeHeader>
              <div>
                <strong>오디오</strong>
                <small>
                  모델은 선택한 방식에 맞춰 OpenRouter가 자동으로 결정합니다.
                </small>
              </div>
              <span>
                {sceneAudioMode === "dialogue"
                  ? "립싱크 모델 우선"
                  : sceneAudioMode === "ambient"
                    ? "오디오 지원 모델"
                    : "영상 품질 우선"}
              </span>
            </AudioModeHeader>
            <AudioModeSelector
              role="group"
              aria-label={`${scene.order}번 장면 오디오 방식`}
            >
              {audioModeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={sceneAudioMode === option.value ? "active" : ""}
                  onClick={() =>
                    onPatchVideo({
                      audioMode: option.value,
                      generateAudio: option.value !== "silent",
                      audioApplied: false,
                      status: scene.video.videoUrl
                        ? "brief"
                        : scene.video.status,
                      approvedAt: null,
                    })
                  }
                  disabled={projectBusy || isSceneBusy}
                  aria-pressed={sceneAudioMode === option.value}
                >
                  <i className={option.icon} aria-hidden="true" />
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                </button>
              ))}
            </AudioModeSelector>
            {sceneAudioMode === "dialogue" ? (
              <DialogueComposer $tone={dialogueTiming.tone}>
                <div className="voice-profile-selector">
                  <label htmlFor={`video-voice-profile-${scene.id}`}>
                    말하는 캐릭터
                  </label>
                  <select
                    id={`video-voice-profile-${scene.id}`}
                    name={`videoVoiceProfile-${scene.id}`}
                    value={selectedVoiceProfileId}
                    onChange={(event) =>
                      onVoiceProfileChange(event.target.value || null)
                    }
                    disabled={projectBusy || isSceneBusy}
                    aria-describedby={`video-voice-profile-help-${scene.id}`}
                  >
                    <option value="">
                      {voiceProfiles.length > 1
                        ? "캐릭터를 선택해 주세요"
                        : "프로젝트 기본 목소리"}
                    </option>
                    {voiceProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.characterName}
                      </option>
                    ))}
                  </select>
                  <small id={`video-voice-profile-help-${scene.id}`}>
                    {selectedVoiceProfile
                      ? `${selectedVoiceProfile.characterName}의 고정 음색과 말투를 이번 장면에 적용합니다.`
                      : voiceProfiles.length > 1
                        ? "목소리가 서로 섞이지 않도록 실제로 말하는 캐릭터를 선택해 주세요."
                        : voiceProfiles.length === 0
                          ? "완성본 편집의 기본 목소리 기준을 적용합니다."
                          : "등록된 캐릭터 프로필을 자동 적용합니다."}
                  </small>
                </div>
                <label htmlFor={`video-dialogue-${scene.id}`}>
                  말할 대사
                  <span>{scene.dialogueOrCaption.length}/240</span>
                </label>
                <BufferedTextarea
                  id={`video-dialogue-${scene.id}`}
                  value={scene.dialogueOrCaption}
                  onCommit={(dialogueOrCaption) =>
                    onDialogueChange(dialogueOrCaption)
                  }
                  placeholder="예: 오늘, 우리가 상상한 공간이 현실이 됩니다…"
                  maxLength={240}
                  rows={2}
                  name={`videoDialogue-${scene.id}`}
                  autoComplete="off"
                  disabled={projectBusy || isSceneBusy}
                  aria-describedby={`video-dialogue-help-${scene.id}`}
                />
                <small
                  id={`video-dialogue-help-${scene.id}`}
                  aria-live="polite"
                >
                  {dialogueWasNormalized
                    ? `행동 설명과 따옴표는 자동 제외합니다. 실제 발화: “${spokenDialogue}”`
                    : "입력한 문장을 그대로 말하도록 요청하며, 화면 자막은 생성하지 않습니다."}
                </small>
                <DialogueTimingRow $tone={dialogueTiming.tone}>
                  <div>
                    <i
                      className={
                        dialogueTiming.tone === "ready"
                          ? "fas fa-circle-check"
                          : dialogueTiming.tone === "tight"
                            ? "fas fa-gauge-high"
                            : dialogueTiming.tone === "over"
                              ? "fas fa-clock-rotate-left"
                              : "fas fa-circle-exclamation"
                      }
                      aria-hidden="true"
                    />
                    <span>
                      <strong>
                        {dialogueTiming.tone === "ready"
                          ? "현재 길이에 적합"
                          : dialogueTiming.tone === "tight"
                            ? "빠른 말투 가능성"
                            : dialogueTiming.tone === "over"
                              ? dialogueTiming.fitsSupportedDuration
                                ? `${dialogueTiming.recommendedDurationSeconds}초 권장`
                                : "대사를 줄여 주세요"
                              : "대사 입력 필요"}
                      </strong>
                      <small>
                        {dialogueTiming.tone === "empty"
                          ? "실제로 말할 문장을 입력하면 장면 길이를 자동으로 점검합니다."
                          : dialogueTiming.tone === "over"
                            ? dialogueTiming.fitsSupportedDuration
                              ? `약 ${dialogueTiming.estimatedSeconds.toFixed(1)}초 분량 · 생성 시 장면 길이를 자동으로 맞춥니다.`
                              : `약 ${dialogueTiming.estimatedSeconds.toFixed(1)}초 분량 · 15초 최대 길이에 맞게 문장을 나눠 주세요.`
                            : `약 ${dialogueTiming.estimatedSeconds.toFixed(1)}초 분량 · 앞뒤 호흡을 포함해 판단했습니다.`}
                      </small>
                    </span>
                  </div>
                  {dialogueTiming.tone === "over" &&
                  dialogueTiming.fitsSupportedDuration ? (
                    <button
                      type="button"
                      onClick={() =>
                        onDurationChange(
                          dialogueTiming.recommendedDurationSeconds,
                        )
                      }
                      disabled={projectBusy || isSceneBusy}
                    >
                      {dialogueTiming.recommendedDurationSeconds}초로 맞춤
                    </button>
                  ) : null}
                </DialogueTimingRow>
                <DialogueTimingTrack
                  $tone={dialogueTiming.tone}
                  role="progressbar"
                  aria-live="polite"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.min(
                    100,
                    Math.round(dialogueTiming.loadRatio * 100),
                  )}
                  aria-label={`대사 길이 사용률 ${Math.round(dialogueTiming.loadRatio * 100)}%`}
                >
                  <span
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(
                          dialogueTiming.tone === "empty" ? 0 : 4,
                          dialogueTiming.loadRatio * 100,
                        ),
                      )}%`,
                    }}
                  />
                </DialogueTimingTrack>
                <LipSyncHint>
                  <i className="fas fa-face-smile" aria-hidden="true" />
                  말하는 동안 얼굴을 정면 또는 3/4 클로즈업으로 유지하고 입을
                  가리지 않도록 자동 연출합니다.
                </LipSyncHint>
              </DialogueComposer>
            ) : null}
          </AudioModeSection>
          <div>
            <SceneReferencePicker
              aria-label={`${scene.order}번 장면 영상 참조 사진`}
            >
              <ReferencePickerHeader>
                <div>
                  <strong>장면 참조 사진</strong>
                  <small>
                    {referenceAssets.length
                      ? hasManualReferenceSelection
                        ? "이 장면에 직접 선택한 사진만 영상 요청에 사용합니다."
                        : "선택하지 않으면 역할 우선순위로 최대 2장을 자동 사용합니다."
                      : "이미지 생성기에서 참조 사진을 추가하면 이 장면에도 사용할 수 있습니다."}
                  </small>
                </div>
                {hasManualReferenceSelection ? (
                  <ReferenceResetButton
                    type="button"
                    onClick={() =>
                      onPatchVideo({
                        referenceAssetIds: [],
                        status: scene.video.videoUrl
                          ? "brief"
                          : scene.video.status,
                        approvedAt: null,
                      })
                    }
                    disabled={projectBusy || isSceneBusy}
                  >
                    자동 선택
                  </ReferenceResetButton>
                ) : null}
              </ReferencePickerHeader>
              {referenceAssets.length ? (
                <ReferenceChoiceList>
                  {referenceAssets.map((asset) => {
                    const isSelected = selectedReferenceAssets.some(
                      (item) => item.id === asset.id,
                    );
                    const isDisabled =
                      !isSelected &&
                      hasManualReferenceSelection &&
                      selectedReferenceAssets.length >=
                        MAX_VIDEO_REFERENCE_IMAGES;
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        className={isSelected ? "active" : ""}
                        onClick={() => {
                          const nextIds = !hasManualReferenceSelection
                            ? [asset.id]
                            : isSelected
                              ? scene.video.referenceAssetIds.filter(
                                  (assetId) => assetId !== asset.id,
                                )
                              : [
                                  ...scene.video.referenceAssetIds,
                                  asset.id,
                                ].slice(0, MAX_VIDEO_REFERENCE_IMAGES);
                          onPatchVideo({
                            referenceAssetIds: nextIds,
                            status: scene.video.videoUrl
                              ? "brief"
                              : scene.video.status,
                            approvedAt: null,
                          });
                        }}
                        disabled={projectBusy || isSceneBusy || isDisabled}
                        aria-pressed={isSelected}
                        title={`${IMAGE_REFERENCE_ROLE_LABELS[asset.role]} · ${asset.name}`}
                      >
                        <i
                          className={
                            isSelected ? "fas fa-check" : "fas fa-image"
                          }
                          aria-hidden="true"
                        />
                        <span>{IMAGE_REFERENCE_ROLE_LABELS[asset.role]}</span>
                        <small>{asset.name}</small>
                      </button>
                    );
                  })}
                </ReferenceChoiceList>
              ) : null}
            </SceneReferencePicker>
            {nextScene ? (
              <EndFrameToggle $active={hasNextEndFrame}>
                <input
                  id={`video-end-frame-${scene.id}`}
                  type="checkbox"
                  checked={scene.video.useNextSceneAsEndFrame}
                  name={`videoEndFrame-${scene.id}`}
                  onChange={(event) =>
                    onPatchVideo({
                      useNextSceneAsEndFrame: event.target.checked,
                      status: scene.video.videoUrl
                        ? "brief"
                        : scene.video.status,
                      approvedAt: null,
                    })
                  }
                  disabled={
                    projectBusy || isSceneBusy || !nextScene.generatedImage?.url
                  }
                />
                <label htmlFor={`video-end-frame-${scene.id}`}>
                  다음 장면 키프레임으로 연결
                  <small>
                    {hasNextEndFrame
                      ? `${nextScene.order}번 장면의 시작 구도로 자연스럽게 도착합니다.`
                      : nextScene.generatedImage?.url
                        ? "연결을 켜면 장면 전환의 인물·제품·배경을 더 안정적으로 유지합니다."
                        : `${nextScene.order}번 장면의 키프레임을 먼저 생성해 주세요.`}
                  </small>
                </label>
              </EndFrameToggle>
            ) : (
              <EndFrameNote>
                마지막 장면은 엔딩 구도와 전환 지시를 기준으로 마무리됩니다.
              </EndFrameNote>
            )}
            <ClipEditor>
              <summary>
                <span>
                  <i className="fas fa-scissors" aria-hidden="true" /> 클립
                  다듬기
                </span>
                <small>앞뒤 자르기 · 속도 · 소리 · 전환</small>
                <i className="fas fa-chevron-down" aria-hidden="true" />
              </summary>
              <ClipEditorGrid>
                <label>
                  <span>앞 자르기</span>
                  <input
                    type="number"
                    min="0"
                    max={Math.max(0, scene.video.durationSeconds - 0.5)}
                    step="0.1"
                    value={scene.video.trimStartSeconds}
                    onChange={(event) =>
                      onPatchVideo({
                        trimStartSeconds: Number(event.target.value),
                      })
                    }
                    disabled={projectBusy || isSceneBusy}
                  />
                  <small>초</small>
                </label>
                <label>
                  <span>뒤 자르기</span>
                  <input
                    type="number"
                    min="0"
                    max={Math.max(0, scene.video.durationSeconds - 0.5)}
                    step="0.1"
                    value={scene.video.trimEndSeconds}
                    onChange={(event) =>
                      onPatchVideo({
                        trimEndSeconds: Number(event.target.value),
                      })
                    }
                    disabled={projectBusy || isSceneBusy}
                  />
                  <small>초</small>
                </label>
                <label>
                  <span>재생 속도</span>
                  <select
                    value={scene.video.playbackRate}
                    onChange={(event) =>
                      onPatchVideo({ playbackRate: Number(event.target.value) })
                    }
                    disabled={projectBusy || isSceneBusy}
                  >
                    {[0.75, 0.9, 1, 1.1, 1.25, 1.5].map((rate) => (
                      <option key={rate} value={rate}>
                        {rate}×
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>장면 소리</span>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.05"
                    value={scene.video.audioVolume}
                    onChange={(event) =>
                      onPatchVideo({ audioVolume: Number(event.target.value) })
                    }
                    disabled={projectBusy || isSceneBusy}
                  />
                  <small>{Math.round(scene.video.audioVolume * 100)}%</small>
                </label>
                <label>
                  <span>다음 전환</span>
                  <select
                    value={scene.video.transitionStyle}
                    onChange={(event) => {
                      const transitionStyle = event.target
                        .value as ImageStoryboardScene["video"]["transitionStyle"];
                      onPatchVideo({
                        transitionStyle,
                        transitionSeconds:
                          transitionStyle !== "cut"
                            ? Math.max(0.25, scene.video.transitionSeconds)
                            : 0,
                      });
                    }}
                    disabled={projectBusy || isSceneBusy || !nextScene}
                  >
                    <option value="cut">바로 전환</option>
                    <option value="crossfade">자연스럽게 이어짐</option>
                    <option value="match-cut">움직임 맞춰 이어짐</option>
                    <option value="bridge">여유 있게 연결</option>
                  </select>
                </label>
                <label>
                  <span>전환 길이</span>
                  <select
                    value={scene.video.transitionSeconds}
                    onChange={(event) =>
                      onPatchVideo({
                        transitionSeconds: Number(event.target.value),
                      })
                    }
                    disabled={
                      projectBusy ||
                      isSceneBusy ||
                      !nextScene ||
                      scene.video.transitionStyle === "cut"
                    }
                  >
                    {[0.25, 0.5, 0.75, 1].map((seconds) => (
                      <option key={seconds} value={seconds}>
                        {seconds}초
                      </option>
                    ))}
                  </select>
                </label>
              </ClipEditorGrid>
            </ClipEditor>
          </div>
        </SceneAdvancedDetails>
        <SceneQualityNote $tone={sceneQuality.tone}>
          {sceneQuality.note}
        </SceneQualityNote>
        {scene.video.videoUrl ? (
          <RenderSignals aria-live="polite">
            {scene.video.visualReferencesApplied > 0 ? (
              <span>
                <i className="fas fa-images" aria-hidden="true" /> 참조 사진{" "}
                {scene.video.visualReferencesApplied}장 적용
              </span>
            ) : null}
            {scene.video.firstFrameApplied ? (
              <span>
                <i className="fas fa-image" aria-hidden="true" /> 시작 프레임
                적용
              </span>
            ) : null}
            {scene.video.endFrameApplied ? (
              <span>
                <i className="fas fa-right-to-bracket" aria-hidden="true" />{" "}
                도착 프레임 적용
              </span>
            ) : null}
            {scene.video.audioApplied ? (
              <span>
                <i
                  className={
                    sceneAudioMode === "dialogue"
                      ? "fas fa-microphone-lines"
                      : "fas fa-volume-high"
                  }
                  aria-hidden="true"
                />
                {sceneAudioMode === "dialogue"
                  ? "대사·립싱크 요청 적용"
                  : "현장음 적용"}
                {sceneAudioVerified ? " · 실제 음량 확인" : ""}
              </span>
            ) : null}
            {!scene.video.visualReferencesApplied &&
            !scene.video.firstFrameApplied &&
            !scene.video.endFrameApplied &&
            !scene.video.audioApplied ? (
              <span>
                <i className="fas fa-circle-info" aria-hidden="true" /> 선택
                모델의 지원 항목으로 생성됨
              </span>
            ) : null}
          </RenderSignals>
        ) : null}
        {scene.video.errorMessage && sceneRecovery ? (
          isInputImagePrivacyBlocked ? (
            <PrivacyRecovery role="alert">
              <i className="fas fa-user-shield" aria-hidden="true" />
              <div>
                <strong>참조 사진 사용이 제한됐습니다</strong>
                <p>
                  실제 인물이 포함되었거나 그렇게 감지된 사진은 이 모델에 전달할
                  수 없습니다. 원본 사진과 장면 설계는 그대로 보존됩니다.
                </p>
              </div>
              <PrivacyFallbackButton
                type="button"
                onClick={() => void onGenerateWithoutVisualInputs()}
                disabled={
                  projectBusy ||
                  isSceneBusy ||
                  Boolean(generationBlockedReason) ||
                  modelPreflight?.canSubmit === false
                }
                title={generationBlockedReason || undefined}
                aria-busy={isQueueing}
              >
                <i className="fas fa-wand-magic-sparkles" aria-hidden="true" />{" "}
                사진 없이 다시 만들기
              </PrivacyFallbackButton>
            </PrivacyRecovery>
          ) : sceneRecovery.canReuseProviderJob ? (
            <RecoveryNotice role="status" aria-live="polite" $safe>
              <i className="fas fa-shield-heart" aria-hidden="true" />
              <div>
                <strong>{sceneRecovery.title}</strong>
                <p>{sceneRecovery.description}</p>
                <p>
                  이 복구는 기존 생성 결과를 사용합니다. 지금 수정한
                  움직임·길이·대사를 새로 반영하려면 “추가 작업 &gt; 새
                  영상으로 다시 제작 · 새 비용”을 선택하세요.
                </p>
                <details>
                  <summary>기술 정보</summary>
                  <code>{scene.video.errorMessage}</code>
                </details>
              </div>
            </RecoveryNotice>
          ) : (
            <RecoveryNotice role="alert" $safe={false}>
              <i className="fas fa-triangle-exclamation" aria-hidden="true" />
              <div>
                <strong>{sceneRecovery.title}</strong>
                <p>{sceneRecovery.description}</p>
                {retryAdvice ? <p>{retryAdvice}</p> : null}
                <details>
                  <summary>기술 정보</summary>
                  <code>{scene.video.errorMessage}</code>
                </details>
              </div>
            </RecoveryNotice>
          )
        ) : null}
        {generationBlockedReason ? (
          <SceneError role="alert">{generationBlockedReason}</SceneError>
        ) : null}
        <SceneActionBar>
          <SceneCost>
            <span>사전 견적 {sceneEstimateLabel}</span>
            {hasRepresentativeEstimate ? (
              <small>
                선택 모델·오디오 방식·지원 길이 기준이며 실제 결제액은 생성
                결과로 확정됩니다.
              </small>
            ) : null}
            {scene.video.costUsd !== null ? (
              <small>실제 {actualCostLabel}</small>
            ) : null}
            {scene.video.modelUsed ? (
              <small>OpenRouter 자동 · {scene.video.modelUsed}</small>
            ) : null}
            {modelPreflight ? (
              <ModelDecision
                $attention={
                  modelPreflight.policy.visualInputState ===
                    "previously_rejected" || modelPreflight.canSubmit === false
                }
              >
                <summary>
                  <i
                    className={
                      modelPreflight.canSubmit === false
                        ? "fas fa-wallet"
                        : modelPreflight.policy.visualInputState ===
                            "previously_rejected"
                          ? "fas fa-user-shield"
                          : "fas fa-circle-check"
                    }
                    aria-hidden="true"
                  />
                  <strong>모델 판단 · {modelPreflight.modelName}</strong>
                  <small>
                    {modelPreflight.catalog.source === "live"
                      ? "실시간 확인"
                      : "최근 확인"}
                    {" · "}
                    {formatCatalogTime(modelPreflight.catalog.fetchedAt)}
                  </small>
                </summary>
                <div>
                  <p>
                    {modelPreflight.catalogModelCount}개 최신 모델 중 조건에
                    맞는 {modelPreflight.compatibleModelCount}개를 비교했습니다.{" "}
                    대기열에 저장할 때 모델·길이·해상도·최대 예상 비용을
                    고정합니다.{" "}
                    {describeVisualInputPolicy(
                      modelPreflight.policy.visualInputState,
                    )}
                  </p>
                  <ul>
                    {modelPreflight.requestedInputs.firstFrame ? (
                      <li>시작 프레임</li>
                    ) : null}
                    {modelPreflight.requestedInputs.lastFrame ? (
                      <li>도착 프레임</li>
                    ) : null}
                    {modelPreflight.requestedInputs.visualReferences ? (
                      <li>일관성 참조</li>
                    ) : null}
                    {modelPreflight.requestedInputs.audioMode !== "silent" ? (
                      <li>
                        {modelPreflight.requestedInputs.audioMode === "dialogue"
                          ? "대사·립싱크"
                          : "현장음"}
                      </li>
                    ) : null}
                    <li>
                      {modelPreflight.resolvedResolution} ·{" "}
                      {modelPreflight.resolvedDuration}초
                    </li>
                    {modelPreflight.policy.automaticRetryAllowed ? null : (
                      <li>같은 사진 자동 재시도 안 함</li>
                    )}
                    {modelPreflight.credit.isSufficient === false ? (
                      <li>
                        <a
                          href="https://openrouter.ai/settings/credits"
                          target="_blank"
                          rel="noreferrer"
                        >
                          잔액 부족 · OpenRouter 충전
                        </a>
                      </li>
                    ) : null}
                  </ul>
                </div>
              </ModelDecision>
            ) : null}
          </SceneCost>
          <div>
            <SceneMoreActions>
              <summary>
                <i className="fas fa-ellipsis" aria-hidden="true" />
                추가 작업
              </summary>
              <div>
                <DuplicateSceneButton
                  type="button"
                  onClick={() => onDuplicate()}
                  disabled={projectBusy || !canDuplicateScene}
                  aria-label={`${scene.order}번 장면을 영상 설정과 함께 복제`}
                >
                  <i className="fas fa-copy" aria-hidden="true" /> 장면 복제
                </DuplicateSceneButton>
                {scene.generatedImage?.url ? (
                  <SceneDownloadButton
                    type="button"
                    onClick={() =>
                      void onDownload(
                        scene.generatedImage!.url,
                        createDownloadFileName(
                          `${storyboardTitle}-scene-${String(scene.order).padStart(2, "0")}`,
                          "png",
                          `storyboard-scene-${scene.order}`,
                        ),
                        `${scene.order}번 장면 이미지`,
                      )
                    }
                    disabled={Boolean(downloadingAssetUrl)}
                    aria-busy={downloadingAssetUrl === scene.generatedImage.url}
                  >
                    <i
                      className={
                        downloadingAssetUrl === scene.generatedImage.url
                          ? "fas fa-spinner fa-spin"
                          : "fas fa-image"
                      }
                      aria-hidden="true"
                    />
                    사진 받기
                  </SceneDownloadButton>
                ) : null}
                {scene.video.videoUrl ? (
                  <SceneDownloadButton
                    type="button"
                    onClick={() =>
                      void onDownload(
                        scene.video.videoUrl!,
                        createDownloadFileName(
                          `${storyboardTitle}-scene-${String(scene.order).padStart(2, "0")}`,
                          "mp4",
                          `storyboard-scene-${scene.order}`,
                        ),
                        `${scene.order}번 장면 영상`,
                      )
                    }
                    disabled={Boolean(downloadingAssetUrl)}
                    aria-busy={downloadingAssetUrl === scene.video.videoUrl}
                  >
                    <i
                      className={
                        downloadingAssetUrl === scene.video.videoUrl
                          ? "fas fa-spinner fa-spin"
                          : "fas fa-download"
                      }
                      aria-hidden="true"
                    />
                    영상 받기
                  </SceneDownloadButton>
                ) : null}
                {showApprovalAsPrimary && scene.video.status === "approved" ? (
                  <DuplicateSceneButton
                    type="button"
                    onClick={() => onApproval()}
                    disabled={projectBusy || isSceneBusy}
                  >
                    <i className="fas fa-rotate-left" aria-hidden="true" /> 승인
                    취소
                  </DuplicateSceneButton>
                ) : null}
                {showApprovalAsPrimary || sceneRecovery?.canReuseProviderJob ? (
                  <RecoveryRegenerateButton
                    type="button"
                    onClick={() => void onRegenerate()}
                    disabled={newProviderRequestDisabled}
                    aria-busy={isQueueing}
                    title={
                      generationBlockedReason ||
                      (modelPreflight?.canSubmit === false
                        ? "새 영상 제작에는 OpenRouter 잔액이 필요합니다."
                        : "현재 편집 내용을 반영한 새 유료 영상 요청을 시작합니다.")
                    }
                  >
                    <i className="fas fa-rotate" aria-hidden="true" />{" "}
                    {"새 영상으로 다시 제작 · 새 비용"}
                  </RecoveryRegenerateButton>
                ) : null}
              </div>
            </SceneMoreActions>
            {showApprovalAsPrimary ? (
              <ReviewButton
                type="button"
                $approved={scene.video.status === "approved"}
                onClick={() => onApproval()}
                disabled={
                  projectBusy ||
                  isSceneBusy ||
                  scene.video.status === "approved"
                }
                aria-pressed={scene.video.status === "approved"}
              >
                <i
                  className={
                    scene.video.status === "approved"
                      ? "fas fa-check"
                      : "fas fa-clipboard-check"
                  }
                  aria-hidden="true"
                />
                {scene.video.status === "approved" ? "승인됨" : "장면 승인"}
              </ReviewButton>
            ) : null}
            {!showApprovalAsPrimary ? (
              <GenerateButton
                type="button"
                onClick={() => void onGenerate()}
                disabled={primaryGenerationDisabled}
                aria-busy={isQueueing}
                title={
                  generationBlockedReason ||
                  (!sceneRecovery?.canReuseProviderJob &&
                  modelPreflight?.canSubmit === false
                    ? "OpenRouter 잔액을 충전한 뒤 다시 제작할 수 있습니다."
                    : undefined)
                }
              >
                {isSceneBusy ? (
                  <>
                    <i className="fas fa-spinner fa-spin" aria-hidden="true" />{" "}
                    제작 중
                  </>
                ) : (
                  <>
                    <i className="fas fa-film" aria-hidden="true" />{" "}
                    {sceneRecovery
                      ? sceneRecovery.actionLabel
                      : hasPendingVideoChanges
                        ? "수정 내용으로 다시 제작"
                        : scene.video.videoUrl
                          ? "현재 설정으로 다시 제작"
                          : "영상 시안 생성"}
                  </>
                )}
              </GenerateButton>
            ) : null}
          </div>
        </SceneActionBar>
      </SceneBrief>
    </SceneProductionRow>
  );
}
