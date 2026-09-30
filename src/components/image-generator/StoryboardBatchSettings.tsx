"use client";

import { useState } from "react";
import styled from "styled-components";
import type { ImageStoryboard, StoryboardVideoScene } from "@/schemas/imageStoryboard";
import { applyStoryboardSceneBatch, canBatchEditStoryboardScene } from "@/lib/storyboard-scene-batch";
import { STORYBOARD_VIDEO_DURATION_OPTIONS } from "@/lib/storyboard-video-audio";

export default function StoryboardBatchSettings({ storyboard, disabled, onChange }: {
  storyboard: ImageStoryboard;
  disabled: boolean;
  onChange: (updater: (current: ImageStoryboard) => ImageStoryboard) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [duration, setDuration] = useState("");
  const [motion, setMotion] = useState("");
  const [message, setMessage] = useState("");
  const eligible = storyboard.scenes.filter(canBatchEditStoryboardScene);
  const selectedIds = selected.filter((id) => eligible.some((scene) => scene.id === id));
  const settings = {
    ...(duration ? { durationSeconds: Number(duration) } : {}),
    ...(motion ? { motionIntensity: motion as StoryboardVideoScene["motionIntensity"] } : {}),
  };
  const changedCount = eligible.filter((scene) => selectedIds.includes(scene.id) && (
    (settings.durationSeconds !== undefined && settings.durationSeconds !== scene.video.durationSeconds)
    || (settings.motionIntensity !== undefined && settings.motionIntensity !== scene.video.motionIntensity)
  )).length;

  return <BatchDetails>
    <summary>미제작 장면 한 번에 설정 <span>{eligible.length}개 설정 가능</span></summary>
    <p>선택한 장면의 길이와 움직임을 함께 설정합니다. 영상이 있거나 요청 기록이 있는 장면은 개별 편집에서 확인하세요.</p>
    <fieldset disabled={disabled}>
      <legend>설정할 장면</legend>
      <div className="batch-actions">
        <button type="button" onClick={() => { setSelected(eligible.map((scene) => scene.id)); setMessage(""); }}>미제작 장면 모두 선택</button>
        <button type="button" onClick={() => { setSelected([]); setMessage(""); }}>선택 해제</button>
      </div>
      <div className="batch-scenes">
        {eligible.map((scene) => <label key={scene.id}>
          <input type="checkbox" checked={selectedIds.includes(scene.id)} onChange={(event) => {
            setSelected((current) => event.target.checked ? [...current, scene.id] : current.filter((id) => id !== scene.id));
            setMessage("");
          }} /><span>{scene.order}번 · {scene.title}</span>
        </label>)}
      </div>
      {!eligible.length ? <p>일괄 설정할 미제작 장면이 없습니다.</p> : null}
      <div className="batch-fields">
        <label>장면 길이<select value={duration} onChange={(event) => { setDuration(event.target.value); setMessage(""); }}><option value="">현재 값 유지</option>{STORYBOARD_VIDEO_DURATION_OPTIONS.map((value) => <option key={value} value={value}>{value}초</option>)}</select></label>
        <label>움직임 강도<select value={motion} onChange={(event) => { setMotion(event.target.value); setMessage(""); }}><option value="">현재 값 유지</option><option value="subtle">정적인 고급감</option><option value="balanced">균형 잡힌 움직임</option><option value="dynamic">역동적인 전개</option></select></label>
      </div>
      <p>{selectedIds.length}개 선택 · {changedCount}개 변경 예정. 대사가 길면 제작 시 필요한 길이가 늘어날 수 있습니다. 설정 적용으로 생성 비용은 발생하지 않습니다.</p>
      <button type="button" className="apply" disabled={!changedCount} onClick={() => {
        onChange((current) => applyStoryboardSceneBatch(current, selectedIds, settings));
        setMessage(`${changedCount}개 장면에 설정을 적용했습니다. 생성 전에 예상 비용을 확인하세요.`);
      }}>{changedCount}개 장면에 설정 적용</button>
    </fieldset>
    {message ? <p role="status">{message}</p> : null}
  </BatchDetails>;
}

const BatchDetails = styled.details`
  border: 1px solid var(--border-subtle); border-radius: 12px; padding: 12px 16px; min-width: 0;
  summary { min-height: 44px; cursor: pointer; font-size: 0.875rem; font-weight: 700; }
  summary span { margin-left: 8px; font-size: 0.75rem; color: var(--text-muted); }
  p { color: var(--text-muted); font-size: 0.8rem; line-height: 1.6; }
  fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
  legend { font-size: 0.875rem; }
  button, select { min-height: 44px; border: 1px solid var(--border-subtle); border-radius: 8px; background: var(--bg-elevated); color: var(--text-main); padding: 8px 12px; font-size: 0.875rem; }
  button { cursor: pointer; } button:disabled { opacity: 0.5; cursor: not-allowed; }
  :is(button, select, input, summary):focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }
  .batch-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; }
  .batch-scenes { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap: 4px 12px; max-height: 240px; overflow-y: auto; }
  .batch-scenes label { display: flex; align-items: center; gap: 8px; min-height: 44px; font-size: 0.875rem; overflow-wrap: anywhere; }
  .batch-fields { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px; }
  .batch-fields label { display: grid; gap: 6px; flex: 1 1 180px; font-size: 0.875rem; }
  .apply { border-color: var(--primary); }
`;
