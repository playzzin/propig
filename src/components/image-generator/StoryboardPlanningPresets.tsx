"use client";

import { useEffect, useState } from "react";
import styled from "styled-components";
import type { ImageStoryboard } from "@/schemas/imageStoryboard";
import { IMAGE_STYLE_PRESETS } from "@/constants/imageStylePresets";
import {
  getStoryboardPresetChanges, getStoryboardPresetSettings, getStoryboardPresetStorageKey,
  isStoryboardPresetApplyBusy, readStoryboardPresets, STORYBOARD_PRESET_LABELS,
  upsertStoryboardPreset, writeStoryboardPresets,
  type StoryboardPlanningPreset, type StoryboardPresetSettings,
} from "@/lib/storyboard-planning-presets";

type Props = {
  userId: string;
  storyboard: ImageStoryboard;
  disabled: boolean;
  onApply: (settings: StoryboardPresetSettings) => boolean | void;
};

function displaySetting(key: keyof StoryboardPresetSettings, value: StoryboardPresetSettings[typeof key]): string {
  if (typeof value === "boolean") return value ? "사용" : "사용 안 함";
  if (key === "plannedSceneCount") return `${value}개`;
  if (key === "stylePreset") return IMAGE_STYLE_PRESETS.find((style) => style.value === value)?.label ?? String(value || "설정 없음");
  if (key === "format") return ({ "brand-film": "브랜드 필름", "product-launch": "제품 소개", "social-short": "소셜 숏폼", editorial: "에디토리얼" })[value as string] ?? String(value);
  return String(value || "설정 없음");
}

export default function StoryboardPlanningPresets(props: Props) {
  return <AccountPlanningPresets key={props.userId} {...props} />;
}

function AccountPlanningPresets({ userId, storyboard, disabled, onApply }: Props) {
  const [presets, setPresets] = useState<StoryboardPlanningPreset[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [retry, setRetry] = useState(0);
  const [pending, setPending] = useState<{ preset: StoryboardPlanningPreset; storyboard: ImageStoryboard } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const selected = presets.find((preset) => preset.id === selectedId);
  const duplicate = presets.find((preset) => preset.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase());
  const busy = disabled || isStoryboardPresetApplyBusy(storyboard);
  const changes = pending ? getStoryboardPresetChanges(storyboard, pending.preset.settings) : [];
  const previewStale = pending?.storyboard !== storyboard;

  useEffect(() => {
    let live = true;
    const load = () => {
      if (!live) return;
      try {
        setPresets(readStoryboardPresets(window.localStorage, userId));
        setReady(true); setError(""); setPending(null); setDeleteId(null);
      } catch {
        setReady(false); setError("프리셋을 읽지 못했습니다. 브라우저 저장 공간과 접근 권한을 확인한 뒤 다시 시도해 주세요. 기존 저장 내용은 유지됩니다.");
      }
    };
    void Promise.resolve().then(load);
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === getStoryboardPresetStorageKey(userId)) {
        load(); setMessage("다른 창의 변경 내용을 다시 불러왔습니다.");
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => { live = false; window.removeEventListener("storage", handleStorage); };
  }, [userId, retry]);

  const save = () => {
    setMessage(""); setError("");
    try {
      const latest = readStoryboardPresets(window.localStorage, userId);
      // A stale tab must not silently replace a newer preset with the same name.
      const target = latest.find((p) => p.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase());
      if (target && (!duplicate || JSON.stringify(target) !== JSON.stringify(duplicate))) {
        setPresets(latest); setPending(null);
        setError("같은 이름의 프리셋이 다른 창에서 변경되었습니다. 내용을 확인한 뒤 다시 저장해 주세요."); return;
      }
      const next = upsertStoryboardPreset(latest, name, getStoryboardPresetSettings(storyboard), Date.now(), crypto.randomUUID());
      writeStoryboardPresets(window.localStorage, userId, next);
      setPresets(next); setSelectedId(next.find((p) => p.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase())!.id);
      setPending(null); setDeleteId(null); setMessage(`‘${name.trim()}’ 프리셋을 저장했습니다.`);
    } catch {
      setError("프리셋을 저장하지 못했습니다. 이름과 저장 공간을 확인해 주세요. 프리셋은 최대 12개까지 저장할 수 있습니다.");
    }
  };

  const remove = () => {
    setMessage(""); setError("");
    try {
      const latest = readStoryboardPresets(window.localStorage, userId);
      const target = latest.find((p) => p.id === deleteId);
      if (target && JSON.stringify(target) !== JSON.stringify(selected)) {
        setPresets(latest); setDeleteId(null);
        setError("프리셋이 다른 창에서 변경되었습니다. 확인 후 다시 선택해 주세요."); return;
      }
      const next = latest.filter((p) => p.id !== deleteId);
      writeStoryboardPresets(window.localStorage, userId, next);
      setPresets(next); setDeleteId(null); setSelectedId(""); setPending(null); setMessage("프리셋을 삭제했습니다.");
    } catch { setError("프리셋을 삭제하지 못했습니다. 기존 저장 내용은 유지됩니다."); }
  };

  return <PresetDetails>
    <summary>내 기획 프리셋 <span>자주 쓰는 설정 재사용</span></summary>
    <p>영상 목적·화면 비율·스타일·연출 설정을 이 브라우저의 현재 계정에 저장합니다. 주제와 장면, 참조 파일은 포함하지 않습니다.</p>
    {!ready && !error ? <p role="status">프리셋을 불러오는 중입니다.</p> : null}
    {error ? <div role="alert"><p>{error}</p><button type="button" onClick={() => { setMessage(""); setRetry((value) => value + 1); }}>프리셋 다시 불러오기</button></div> : null}
    <fieldset disabled={!ready || busy}>
      <legend>현재 기획 설정 저장</legend>
      <div className="preset-controls">
        <label>프리셋 이름<input value={name} maxLength={40} placeholder="예: 브랜드 숏폼 기본 설정" onChange={(event) => { setName(event.target.value); setMessage(""); }} /></label>
        <button type="button" disabled={!name.trim() || (!duplicate && presets.length >= 12)} onClick={save}>{duplicate ? "같은 이름의 설정 덮어쓰기" : "현재 설정 저장"}</button>
      </div>
      <p>{presets.length}/12개 저장됨 · 다른 기기나 브라우저와 자동 동기화되지 않습니다.</p>
      <div className="preset-controls">
        <label>저장한 프리셋<select value={selected?.id ?? ""} onChange={(event) => { setSelectedId(event.target.value); setPending(null); setDeleteId(null); setMessage(""); }}>
          <option value="">{presets.length ? "프리셋 선택" : "아직 저장한 프리셋이 없습니다"}</option>
          {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
        </select></label>
        <button type="button" disabled={!selected} onClick={() => { if (selected) setPending({ preset: selected, storyboard }); setDeleteId(null); setMessage(""); }}>적용 내용 미리보기</button>
        <button type="button" disabled={!selected} onClick={() => { setDeleteId(selected?.id ?? null); setPending(null); setMessage(""); }}>프리셋 삭제</button>
      </div>
      {deleteId && selected ? <div className="preview">
        <p>‘{selected.name}’ 프리셋을 삭제할까요? 현재 프로젝트의 설정은 유지됩니다.</p>
        <div className="actions"><button type="button" onClick={remove}>프리셋 삭제 확인</button><button type="button" onClick={() => setDeleteId(null)}>취소</button></div>
      </div> : null}
      {pending ? <section className="preview" aria-label="프리셋 적용 미리보기">
        <h4>‘{pending.preset.name}’ · {changes.length}개 설정 변경</h4>
        {changes.length ? <ul>{changes.map((key) => <li key={key}><strong>{STORYBOARD_PRESET_LABELS[key]}</strong><span>{displaySetting(key, storyboard[key])} → {displaySetting(key, pending.preset.settings[key])}</span></li>)}</ul> : <p>현재 설정과 같습니다.</p>}
        <p>현재 {storyboard.scenes.length}개 장면과 기존 생성 파일은 유지됩니다. 스타일·연출 변경 시 기존 결과는 재검토 상태로 바뀝니다. 장면 수는 다음 AI 설계부터 적용됩니다. 적용만으로 생성 비용이 발생하지 않습니다.</p>
        {previewStale ? <p role="status">작업 내용이 바뀌었습니다. 미리보기를 다시 확인해 주세요.</p> : null}
        <div className="actions"><button type="button" disabled={!changes.length || previewStale} onClick={() => {
          if (busy || previewStale || !changes.length) return;
          if (onApply(pending.preset.settings) === false) { setMessage("작업 중에는 적용할 수 없습니다. 작업이 끝난 뒤 다시 시도해 주세요."); return; }
          setPending(null); setMessage(`‘${pending.preset.name}’ 기획 설정을 적용했습니다.`);
        }}>기획 설정 적용</button><button type="button" onClick={() => setPending(null)}>취소</button></div>
      </section> : null}
    </fieldset>
    {busy ? <p role="status">실행 중인 작업이 끝나면 프리셋을 저장하거나 적용할 수 있습니다.</p> : null}
    {message ? <p role="status">{message}</p> : null}
  </PresetDetails>;
}

const PresetDetails = styled.details`
  min-width: 0; border: 1px solid var(--border-subtle); border-radius: 12px; padding: 12px 16px;
  summary { min-height: 44px; cursor: pointer; font-size: 0.875rem; font-weight: 700; }
  summary span { margin-left: 8px; color: var(--text-muted); font-size: 0.75rem; font-weight: 400; }
  p { color: var(--text-muted); font-size: 0.875rem; line-height: 1.65; }
  fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
  legend, label { font-size: 0.875rem; } label { display: grid; gap: 6px; flex: 1 1 220px; min-width: 0; }
  .preset-controls, .actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: end; margin-top: 12px; }
  input, select, button { min-height: 44px; min-width: 0; max-width: 100%; border: 1px solid var(--border-subtle); border-radius: 8px; background: var(--bg-elevated); color: var(--text-main); padding: 8px 12px; font: inherit; font-size: 0.875rem; }
  button { cursor: pointer; } button:disabled { opacity: 0.5; cursor: not-allowed; }
  :is(summary, button, input, select):focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }
  .preview { margin-top: 16px; border-top: 1px solid var(--border-subtle); padding-top: 12px; }
  h4 { margin: 0; font-size: 0.875rem; } ul { padding-left: 20px; }
  li { font-size: 0.875rem; line-height: 1.6; margin-bottom: 8px; overflow-wrap: anywhere; }
  li span { display: block; color: var(--text-muted); white-space: pre-wrap; }
  @media (max-width: 640px) { .preset-controls { align-items: stretch; flex-direction: column; } label { flex-basis: auto; } }
`;
