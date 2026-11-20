"use client";

import { useRef } from "react";
import type {
  StoryboardAudioMixPreset,
  StoryboardVideoProduction,
  StoryboardVoiceProfile,
} from "@/schemas/imageStoryboard";
import { BufferedTextInput } from "@/components/image-generator/BufferedTextField";
import {
  AssemblyEditor,
  AssemblyEditorGrid,
  AssemblyEditorHeader,
} from "./StoryboardVideoProductionPanel.styles";

type AudioMixOption = {
  value: Exclude<StoryboardAudioMixPreset, "custom">;
  label: string;
  description: string;
};

export type StoryboardAssemblyEditorModel = {
  audioMixLabel: string;
  audioMixPreset: StoryboardAudioMixPreset;
  backgroundMusicName: string | null;
  backgroundMusicUrl: string | null;
  backgroundMusicVolume: number;
  dialogueSceneCount: number;
  isUploadingBackgroundMusic: boolean;
  mixOptions: AudioMixOption[];
  projectBusy: boolean;
  sceneAudioVolume: number;
  storyboardIdAvailable: boolean;
  voiceDirection: string;
  voiceProfiles: StoryboardVoiceProfile[];
};

type StoryboardAssemblyEditorProps = {
  editor: StoryboardAssemblyEditorModel;
  onAssemblyPatch: (patch: Partial<StoryboardVideoProduction>) => void;
  onAudioMixPreset: (
    preset: Exclude<StoryboardAudioMixPreset, "custom">,
  ) => void;
  onBackgroundMusicFile: (file: File) => void;
  onRemoveBackgroundMusic: () => void;
  onVoiceProfileAdd: () => void;
  onVoiceProfileChange: (
    profileId: string,
    patch: Partial<StoryboardVoiceProfile>,
  ) => void;
  onVoiceProfileRemove: (profileId: string) => void;
  onVoiceDirectionCommit: (voiceDirection: string) => void;
};

export default function StoryboardAssemblyEditorView({
  editor,
  onAssemblyPatch,
  onAudioMixPreset,
  onBackgroundMusicFile,
  onRemoveBackgroundMusic,
  onVoiceProfileAdd,
  onVoiceProfileChange,
  onVoiceProfileRemove,
  onVoiceDirectionCommit,
}: StoryboardAssemblyEditorProps) {
  const backgroundMusicInputRef = useRef<HTMLInputElement>(null);

  return (
    <AssemblyEditor aria-labelledby="storyboard-final-edit-title">
      <AssemblyEditorHeader>
        <div>
          <span>FINAL EDIT</span>
          <h4 id="storyboard-final-edit-title">완성본 편집</h4>
          <p>
            목소리와 음악의 기준을 한 번만 정하면 모든 장면과 최종 조립에
            적용됩니다.
          </p>
        </div>
        <strong>
          {editor.backgroundMusicName || "배경음악 없음"} ·{" "}
          {editor.audioMixLabel}
        </strong>
      </AssemblyEditorHeader>

      <AssemblyEditorGrid>
        <section className="voice-profiles wide" aria-labelledby="voice-profiles-title">
          <header>
            <div>
              <strong id="voice-profiles-title">캐릭터 목소리 프로필</strong>
              <small>
                캐릭터별 음색을 저장하고 대사 장면에 같은 프로필을 연결합니다.
              </small>
            </div>
            <button
              type="button"
              onClick={onVoiceProfileAdd}
              disabled={editor.projectBusy || editor.voiceProfiles.length >= 12}
            >
              <i className="fas fa-plus" aria-hidden="true" /> 프로필 추가
            </button>
          </header>

          {editor.voiceProfiles.length ? (
            <div className="voice-profile-list">
              {editor.voiceProfiles.map((profile, index) => (
                <article className="voice-profile-card" key={profile.id}>
                  <div className="voice-profile-heading">
                    <span className="voice-profile-number" aria-hidden="true">
                      {index + 1}
                    </span>
                    <label>
                      <span>캐릭터 이름</span>
                      <BufferedTextInput
                        name={`storyboardVoiceCharacter-${profile.id}`}
                        autoComplete="off"
                        value={profile.characterName}
                        onCommit={(characterName) =>
                          onVoiceProfileChange(profile.id, { characterName })
                        }
                        disabled={editor.projectBusy}
                        maxLength={80}
                        placeholder="예: 아빠"
                      />
                    </label>
                    <button
                      type="button"
                      className="voice-profile-remove"
                      onClick={() => onVoiceProfileRemove(profile.id)}
                      disabled={editor.projectBusy}
                      aria-label={`${profile.characterName} 목소리 프로필 삭제`}
                      title="프로필 삭제"
                    >
                      <i className="fas fa-trash-can" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="voice-profile-fields">
                    <label>
                      <span>고정할 음색</span>
                      <BufferedTextInput
                        name={`storyboardVoiceDescription-${profile.id}`}
                        autoComplete="off"
                        value={profile.voiceDescription}
                        onCommit={(voiceDescription) =>
                          onVoiceProfileChange(profile.id, { voiceDescription })
                        }
                        disabled={editor.projectBusy}
                        maxLength={240}
                        placeholder="예: 부드럽고 낮은 40대 한국어 남성 목소리"
                      />
                    </label>
                    <label>
                      <span>말투·호흡</span>
                      <BufferedTextInput
                        name={`storyboardVoiceStyle-${profile.id}`}
                        autoComplete="off"
                        value={profile.speakingStyle}
                        onCommit={(speakingStyle) =>
                          onVoiceProfileChange(profile.id, { speakingStyle })
                        }
                        disabled={editor.projectBusy}
                        maxLength={180}
                        placeholder="예: 차분한 속도, 문장 끝을 또렷하게"
                      />
                    </label>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="voice-profile-empty">
              <i className="fas fa-fingerprint" aria-hidden="true" />
              아직 프로필이 없습니다. 하나를 추가하면 모든 대사 장면에 자동으로
              적용되고, 두 개부터는 장면별 화자를 선택할 수 있습니다.
            </p>
          )}
        </section>

        <label className="wide">
          <span>프로필 미선택 장면의 기본 목소리</span>
          <BufferedTextInput
            name="storyboardVoiceDirection"
            autoComplete="off"
            value={editor.voiceDirection}
            onCommit={onVoiceDirectionCommit}
            disabled={editor.projectBusy}
            maxLength={240}
            placeholder="예: 따뜻하고 자신감 있는 30대 한국어 여성, 차분한 속도"
          />
          <small>
            기존 방식도 그대로 유지됩니다. 캐릭터 프로필이 없는 대화 장면을
            새로 만들거나 다시 만들 때 적용됩니다.
          </small>
        </label>

        <fieldset className="audio-mix-presets" disabled={editor.projectBusy}>
          <legend>대사와 배경음악 균형</legend>
          <div role="group" aria-label="대사와 배경음악 믹스 방식">
            {editor.mixOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onAudioMixPreset(option.value)}
                aria-pressed={editor.audioMixPreset === option.value}
              >
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </button>
            ))}
          </div>
          <p role="status">
            <i className="fas fa-microphone-lines" aria-hidden="true" />
            {editor.backgroundMusicUrl
              ? editor.dialogueSceneCount > 0
                ? `대사·립싱크 ${editor.dialogueSceneCount}개 장면에서는 배경음이 자동으로 낮아집니다.`
                : "장면 사운드가 들릴 때 배경음이 자동으로 낮아집니다."
              : "배경음을 첨부하면 장면 사운드와 함께 자동으로 믹스합니다."}
          </p>
        </fieldset>

        <label>
          <span>장면 소리</span>
          <input
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={editor.sceneAudioVolume}
            onChange={(event) =>
              onAssemblyPatch({
                audioMixPreset: "custom",
                sceneAudioVolume: Number(event.target.value),
              })
            }
            disabled={editor.projectBusy}
            aria-label={`장면 소리 ${Math.round(editor.sceneAudioVolume * 100)}%`}
          />
          <small>{Math.round(editor.sceneAudioVolume * 100)}%</small>
        </label>

        <label>
          <span>배경음악</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={editor.backgroundMusicVolume}
            onChange={(event) =>
              onAssemblyPatch({
                audioMixPreset: "custom",
                backgroundMusicVolume: Number(event.target.value),
              })
            }
            disabled={editor.projectBusy || !editor.backgroundMusicUrl}
            aria-label={`배경음악 ${Math.round(editor.backgroundMusicVolume * 100)}%`}
          />
          <small>{Math.round(editor.backgroundMusicVolume * 100)}%</small>
        </label>

        <div className="music-actions">
          <input
            ref={backgroundMusicInputRef}
            id="storyboard-background-music"
            name="storyboardBackgroundMusic"
            type="file"
            accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/ogg,audio/*"
            aria-label="배경음악 파일 첨부"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onBackgroundMusicFile(file);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => backgroundMusicInputRef.current?.click()}
            disabled={
              editor.projectBusy ||
              editor.isUploadingBackgroundMusic ||
              !editor.storyboardIdAvailable
            }
          >
            <i
              className={
                editor.isUploadingBackgroundMusic
                  ? "fas fa-spinner fa-spin"
                  : "fas fa-music"
              }
              aria-hidden="true"
            />
            {editor.isUploadingBackgroundMusic
              ? "음악 첨부 중…"
              : editor.backgroundMusicUrl
                ? "음악 바꾸기"
                : "배경음 첨부"}
          </button>
          {editor.backgroundMusicUrl ? (
            <button
              type="button"
              className="secondary"
              onClick={onRemoveBackgroundMusic}
              disabled={editor.projectBusy}
            >
              제거
            </button>
          ) : null}
          <span className="music-file-hint">
            MP3, WAV, M4A, OGG · 최대 30 MB
          </span>
        </div>

        {editor.backgroundMusicUrl ? (
          <div className="music-preview">
            <span>배경음악 미리듣기</span>
            <audio
              controls
              preload="metadata"
              src={editor.backgroundMusicUrl}
              aria-label={`${editor.backgroundMusicName || "배경음악"} 미리듣기`}
            />
          </div>
        ) : null}
      </AssemblyEditorGrid>
    </AssemblyEditor>
  );
}
