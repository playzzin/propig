"use client";

import { useState } from "react";
import styled from "styled-components";
import type { ImageStoryboardScene } from "@/schemas/imageStoryboard";

const statusLabels: Record<ImageStoryboardScene["video"]["status"], string> = {
  brief: "영상 미제작", queued: "제작 대기", rendering: "제작 중", review: "검토 필요", approved: "승인됨", failed: "제작 실패",
};
const motionLabels = { subtle: "정적인 고급감", balanced: "균형 잡힌 움직임", dynamic: "역동적인 전개" };

export default function StoryboardSceneComparison({ scenes, activeSceneId, onSelectScene }: {
  scenes: ImageStoryboardScene[];
  activeSceneId: string | null;
  onSelectScene: (sceneId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [leftId, setLeftId] = useState<string | null>(activeSceneId ?? scenes[0]?.id ?? null);
  const [rightId, setRightId] = useState<string | null>(null);
  const left = scenes.find((scene) => scene.id === leftId)
    ?? scenes.find((scene) => scene.id === activeSceneId) ?? scenes[0];
  const right = scenes.find((scene) => scene.id === rightId && scene.id !== left?.id)
    ?? scenes.find((scene) => scene.id !== left?.id);

  return <ComparisonDetails open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>장면 나란히 비교 <span>화면·대사·움직임 검수</span></summary>
    {open ? <>
      <p>두 장면의 캐릭터, 색감, 대사와 움직임이 자연스럽게 이어지는지 확인하세요. 영상은 재생 버튼을 눌러 확인할 수 있습니다.</p>
      {!scenes.length ? <p role="status">장면을 설계하면 비교할 수 있습니다.</p> : !right ? <p role="status">비교하려면 장면이 2개 이상 필요합니다.</p> : null}
      <div className="comparison-grid">
        {[left, right].map((scene, index) => scene ? <article key={`${index}-${scene.id}`}>
          <label>{index === 0 ? "비교할 첫 번째 장면" : "비교할 두 번째 장면"}
            <select value={scene.id} onChange={(event) => index === 0 ? setLeftId(event.target.value) : setRightId(event.target.value)}>
              {scenes.filter((option) => index === 0 || option.id !== left?.id).map((option) => <option key={option.id} value={option.id}>{option.order}번 · {option.title}</option>)}
            </select>
          </label>
          <h4>{scene.order}번 · {scene.title}</h4>
          <p className="status">{statusLabels[scene.video.status]}{scene.assetFreshness === "review" ? " · 기획 변경 후 재검토 필요" : ""}</p>
          <div className="comparison-media">
            {scene.video.videoUrl ? <video controls preload="none" playsInline poster={scene.generatedImage?.url} src={scene.video.videoUrl} aria-label={`${scene.order}번 장면 영상`} />
              : scene.generatedImage?.url ? <img src={scene.generatedImage.url} alt={`${scene.order}번 장면 이미지: ${scene.title}`} width={640} height={360} loading="lazy" />
                : <p>아직 생성한 이미지·영상이 없습니다.</p>}
          </div>
          <dl>
            <div><dt>장면 길이</dt><dd>{scene.video.durationSeconds}초</dd></div>
            <div><dt>대사·자막</dt><dd>{scene.dialogueOrCaption || "대사·자막 없음"}</dd></div>
            <div><dt>움직임</dt><dd>{motionLabels[scene.video.motionIntensity]}</dd></div>
            <div><dt>영상 소리</dt><dd>{{ silent: "무음", ambient: "현장음·효과음", dialogue: "대사 포함" }[scene.video.audioMode]}</dd></div>
            <div><dt>카메라 연출</dt><dd>{scene.cameraDirection || "아직 설정하지 않았습니다"}</dd></div>
            <div><dt>장면 연결</dt><dd>{scene.transition || "아직 설정하지 않았습니다"}</dd></div>
          </dl>
          {scene.video.motionPrompt ? <details className="motion-detail"><summary>움직임 연출 자세히 보기</summary><p>{scene.video.motionPrompt}</p></details> : null}
          <button type="button" onClick={() => onSelectScene(scene.id)}>{scene.order}번 장면 편집하기</button>
        </article> : null)}
      </div>
    </> : null}
  </ComparisonDetails>;
}

const ComparisonDetails = styled.details`
  border: 1px solid var(--border-subtle); border-radius: 12px; padding: 12px 16px; min-width: 0;
  summary { min-height: 44px; cursor: pointer; font-size: 0.875rem; font-weight: 700; }
  summary span { margin-left: 8px; color: var(--text-muted); font-size: 0.75rem; font-weight: 400; }
  p { color: var(--text-muted); font-size: 0.875rem; line-height: 1.6; }
  .comparison-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  article { min-width: 0; border: 1px solid var(--border-subtle); border-radius: 10px; padding: 12px; }
  label { display: grid; gap: 6px; font-size: 0.875rem; }
  select, button { min-height: 44px; width: 100%; min-width: 0; border: 1px solid var(--border-subtle); border-radius: 8px; background: var(--bg-elevated); color: var(--text-main); padding: 8px 12px; font-size: 0.875rem; }
  button { cursor: pointer; } h4 { font-size: 0.875rem; margin: 16px 0 4px; overflow-wrap: anywhere; }
  .status { margin: 0 0 12px; }
  .comparison-media { aspect-ratio: 16 / 9; display: grid; place-items: center; background: var(--bg-elevated); border-radius: 8px; overflow: hidden; }
  .comparison-media :is(img, video) { width: 100%; height: 100%; max-height: 360px; object-fit: contain; }
  .comparison-media p { padding: 16px; text-align: center; }
  dl { font-size: 0.875rem; line-height: 1.6; } dl > div { margin-bottom: 12px; }
  dt { color: var(--text-muted); } dd { margin: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
  .motion-detail { margin-bottom: 12px; } .motion-detail p { white-space: pre-wrap; overflow-wrap: anywhere; }
  :is(summary, select, button):focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }
  @media (max-width: 700px) { .comparison-grid { grid-template-columns: minmax(0, 1fr); } }
`;
