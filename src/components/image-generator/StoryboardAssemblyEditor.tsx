"use client";

import { useRef } from "react";
import type {
  StoryboardAudioMixPreset,
  StoryboardVideoProduction,
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
};

type StoryboardAssemblyEditorProps = {
  editor: StoryboardAssemblyEditorModel;
  onAssemblyPatch: (patch: Partial<StoryboardVideoProduction>) => void;
  onAudioMixPreset: (
    preset: Exclude<StoryboardAudioMixPreset, "custom">,
  ) => void;
  onBackgroundMusicFile: (file: File) => void;
  onRemoveBackgroundMusic: () => void;
  onVoiceDirectionCommit: (voiceDirection: string) => void;
};

export default function StoryboardAssemblyEditorView({
  editor,
  onAssemblyPatch,
  onAudioMixPreset,
  onBackgroundMusicFile,
  onRemoveBackgroundMusic,
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
        <label className="wide">
          <span>목소리 일관성</span>
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
            대화 장면을 새로 만들거나 다시 만들 때 적용됩니다. 기존 영상의
            목소리는 바뀌지 않습니다.
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
