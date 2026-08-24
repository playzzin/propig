'use client';

import { Clock3, Film, Sparkles } from 'lucide-react';
import styled from 'styled-components';
import type { EmoticonFrameTransition } from '@/schemas/emoticonStudio';
import * as S from './StudioShell.styles';

const Wrap = styled.div`
  display: grid;
  gap: 12px;
`;

const Summary = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  div { padding: 9px; border: 1px solid #e4e7ec; border-radius: 10px; background: #f8fafc; text-align: center; }
  strong { display: block; color: #101828; font-size: 13px; }
  span { color: #667085; font-size: 9px; }
`;

const SectionLabel = styled.strong`
  display: block;
  margin-bottom: 6px;
  color: #344054;
  font-size: 10px;
`;

const Presets = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  button { min-height: 40px; border: 1px solid #d0d5dd; border-radius: 9px; background: #fff; color: #344054; font: inherit; font-size: 10px; cursor: pointer; }
  button:hover, button:focus-visible { border-color: #2952cc; outline: 2px solid rgba(41, 82, 204, .16); }
`;

const FrameList = styled.div`
  display: grid;
  gap: 7px;
  max-height: 280px;
  overflow: auto;
`;

const FrameRow = styled.div<{ $selected: boolean }>`
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 80px;
  align-items: center;
  gap: 8px;
  padding: 7px;
  border: 1px solid ${({ $selected }) => $selected ? '#2952cc' : '#e4e7ec'};
  border-radius: 10px;
  background: ${({ $selected }) => $selected ? '#f2f5ff' : '#fff'};

  img, button:first-child { width: 42px; height: 42px; }
  button:first-child { padding: 0; overflow: hidden; border: 0; border-radius: 8px; background: #eef2f6; cursor: pointer; }
  img { display: block; object-fit: contain; }
  label { display: grid; gap: 3px; color: #475467; font-size: 9px; }
  input, select { width: 100%; min-height: 36px; border: 1px solid #d0d5dd; border-radius: 8px; background: #fff; padding: 5px 7px; color: #101828; font: inherit; font-size: 10px; }
`;

const Strength = styled.label`
  display: grid;
  grid-template-columns: auto minmax(80px, 1fr) auto;
  align-items: center;
  gap: 8px;
  color: #475467;
  font-size: 10px;
  input { width: 100%; accent-color: #2952cc; }
`;

const TRANSITION_LABELS: Record<EmoticonFrameTransition['kind'], string> = {
  cut: '바로 전환',
  fade: '부드러운 페이드',
  slide_left: '왼쪽 슬라이드',
  slide_right: '오른쪽 슬라이드',
  zoom: '줌 전환',
};

export function AnimationTimingEditor(props: {
  frameUrls: string[];
  durations: number[];
  transitions: EmoticonFrameTransition[];
  selectedFrame: number;
  disabled?: boolean;
  onSelectFrame: (index: number) => void;
  onDurationsChange: (durations: number[]) => void;
  onTransitionsChange: (transitions: EmoticonFrameTransition[]) => void;
  onRender: () => void;
}) {
  const totalDuration = props.durations.reduce((sum, value) => sum + value, 0);
  const animatedTransitions = props.transitions.filter((transition) => transition.kind !== 'cut').length;
  const selectedTransition = props.transitions[props.selectedFrame] || { kind: 'cut' as const, strength: 0.55 };
  const setAllDurations = (duration: number) => props.onDurationsChange(props.durations.map(() => duration));

  return (
    <Wrap data-testid="animation-timing-editor">
      <S.Notice $tone="info"><Film size={16} /><span>각 사진의 노출 시간과 다음 사진으로 넘어갈 때의 효과를 정합니다. 1번 효과는 마지막 사진에서 1번으로 반복될 때 적용됩니다.</span></S.Notice>
      <Summary aria-label="애니메이션 요약">
        <div><strong>{props.durations.length}</strong><span>사진</span></div>
        <div><strong>{(totalDuration / 1000).toFixed(2)}초</strong><span>한 번 재생</span></div>
        <div><strong>{animatedTransitions}</strong><span>전환 효과</span></div>
      </Summary>
      <div>
        <SectionLabel>전체 속도</SectionLabel>
        <Presets aria-label="전체 프레임 시간 프리셋">
          <button type="button" disabled={props.disabled} onClick={() => setAllDurations(100)}>빠르게 · 100ms</button>
          <button type="button" disabled={props.disabled} onClick={() => setAllDurations(160)}>보통 · 160ms</button>
          <button type="button" disabled={props.disabled} onClick={() => setAllDurations(260)}>느리게 · 260ms</button>
        </Presets>
      </div>
      <FrameList aria-label="사진별 시간과 전환 효과">
        {props.frameUrls.map((url, index) => (
          <FrameRow key={`${url}-${index}`} $selected={props.selectedFrame === index}>
            <button type="button" aria-label={`${index + 1}번 사진 선택`} onClick={() => props.onSelectFrame(index)}><img src={url} alt="" /></button>
            <label>사진 {index + 1} 노출 시간
              <input
                data-testid={`frame-duration-${index}`}
                type="number"
                min={40}
                max={2000}
                step={10}
                inputMode="numeric"
                value={props.durations[index] || 160}
                disabled={props.disabled}
                aria-describedby={`frame-duration-help-${index}`}
                onFocus={() => props.onSelectFrame(index)}
                onChange={(event) => {
                  const next = [...props.durations];
                  next[index] = Math.min(2000, Math.max(40, Number(event.target.value) || 40));
                  props.onDurationsChange(next);
                }}
              />
              <span id={`frame-duration-help-${index}`}>40–2000ms</span>
            </label>
            <label>들어오는 효과
              <select
                data-testid={`frame-transition-${index}`}
                value={props.transitions[index]?.kind || 'cut'}
                disabled={props.disabled}
                onFocus={() => props.onSelectFrame(index)}
                onChange={(event) => {
                  const next = [...props.transitions];
                  next[index] = { ...next[index], kind: event.target.value as EmoticonFrameTransition['kind'] };
                  props.onTransitionsChange(next);
                }}
              >
                {Object.entries(TRANSITION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </FrameRow>
        ))}
      </FrameList>
      {selectedTransition.kind !== 'cut' ? (
        <Strength>전환 강도
          <input
            type="range"
            min={0.15}
            max={0.85}
            step={0.05}
            value={selectedTransition.strength}
            disabled={props.disabled}
            aria-label={`${props.selectedFrame + 1}번 사진 전환 강도`}
            onChange={(event) => {
              const next = [...props.transitions];
              next[props.selectedFrame] = { ...selectedTransition, strength: Number(event.target.value) };
              props.onTransitionsChange(next);
            }}
          />
          <output>{Math.round(selectedTransition.strength * 100)}%</output>
        </Strength>
      ) : null}
      <S.Button data-testid="render-animation-settings" type="button" disabled={props.disabled || props.frameUrls.length < 2} onClick={props.onRender}>
        <Sparkles size={15} /> 시간·전환 적용해 새 움짤 만들기
      </S.Button>
      <S.Notice $tone="success"><Clock3 size={15} /><span>GIF·APNG·WebP·동영상 파일에 동일한 프레임 시간과 전환 합성이 적용됩니다.</span></S.Notice>
    </Wrap>
  );
}
