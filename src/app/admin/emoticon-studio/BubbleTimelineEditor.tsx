'use client';

import { useId, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  EMOTICON_BUBBLE_TIMELINE_MODES,
  type EmoticonBubble,
  type EmoticonBubbleAppearance,
  type EmoticonBubbleTimeline,
  type EmoticonBubbleTimelineMode,
} from '@/schemas/emoticonStudio';
import * as S from './EmoticonStudio.styles';

const MODE_LABELS: Record<EmoticonBubbleTimelineMode, string> = {
  full: '전체 프레임',
  intro: '처음에만',
  outro: '끝에만',
  range: '구간 지정',
  cues: '프레임별 문구',
};

function clampFrame(value: number, frameCount: number): number {
  return Math.min(Math.max(0, Math.round(value)), Math.max(0, frameCount - 1));
}

function timelineForMode(
  timeline: EmoticonBubbleTimeline,
  mode: EmoticonBubbleTimelineMode,
  frameCount: number,
): EmoticonBubbleTimeline {
  const lastFrame = Math.max(0, frameCount - 1);
  if (mode === 'full') return { mode, startFrame: 0, endFrame: null, cues: [] };
  if (mode === 'intro') {
    return { mode, startFrame: 0, endFrame: Math.max(0, Math.ceil(frameCount * 0.35) - 1), cues: [] };
  }
  if (mode === 'outro') {
    return { mode, startFrame: Math.min(lastFrame, Math.floor(frameCount * 0.65)), endFrame: lastFrame, cues: [] };
  }
  if (mode === 'range') {
    const startFrame = clampFrame(timeline.startFrame, frameCount);
    const endFrame = Math.max(startFrame, clampFrame(timeline.endFrame ?? lastFrame, frameCount));
    return { mode, startFrame, endFrame, cues: [] };
  }
  const cues = timeline.cues.length
    ? timeline.cues.map((cue) => ({
      ...cue,
      startFrame: clampFrame(cue.startFrame, frameCount),
      endFrame: Math.max(clampFrame(cue.startFrame, frameCount), clampFrame(cue.endFrame, frameCount)),
    }))
    : [{ id: crypto.randomUUID(), text: '문구를 입력하세요', startFrame: 0, endFrame: lastFrame }];
  return { mode, startFrame: 0, endFrame: lastFrame, cues };
}

type BubbleTimelineEditorProps = {
  timeline: EmoticonBubbleTimeline;
  frameCount: number;
  disabled?: boolean;
  appearance?: EmoticonBubbleAppearance;
  onAppearanceChange?: (appearance: EmoticonBubbleAppearance) => void;
  bubbleOptions?: Pick<EmoticonBubble, 'style' | 'position' | 'entrance' | 'font'>;
  onBubbleOptionsChange?: (options: Pick<EmoticonBubble, 'style' | 'position' | 'entrance' | 'font'>) => void;
  onChange: (timeline: EmoticonBubbleTimeline) => void;
};

const BUBBLE_PRESETS: Array<{
  label: string;
  style: EmoticonBubble['style'];
  font: EmoticonBubble['font'];
  entrance: EmoticonBubble['entrance'];
  appearance: Partial<EmoticonBubbleAppearance>;
}> = [
  { label: '기본', style: 'rounded', font: 'clean', entrance: 'pop', appearance: { fillColor: '#FFFFFF', textColor: '#20242D', outlineColor: '#222733', outlineWidth: 4, shadowOpacity: 0.15 } },
  { label: '귀여움', style: 'rounded', font: 'round', entrance: 'pop', appearance: { fillColor: '#FFF1F6', textColor: '#9D174D', outlineColor: '#FB7185', outlineWidth: 3, shadowOpacity: 0.12 } },
  { label: '외침', style: 'shout', font: 'bold', entrance: 'shake', appearance: { fillColor: '#FFF7CC', textColor: '#9A3412', outlineColor: '#F97316', outlineWidth: 6, shadowOpacity: 0.25 } },
  { label: '생각', style: 'thought', font: 'round', entrance: 'fade', appearance: { fillColor: '#F8FAFC', textColor: '#334155', outlineColor: '#94A3B8', outlineWidth: 3, shadowOpacity: 0.08 } },
  { label: '속삭임', style: 'whisper', font: 'handwriting', entrance: 'fade', appearance: { fillColor: '#F5F3FF', textColor: '#5B21B6', outlineColor: '#A78BFA', outlineWidth: 2, shadowOpacity: 0.05 } },
  { label: '다크', style: 'rounded', font: 'bold', entrance: 'pop', appearance: { fillColor: '#111827', textColor: '#FFFFFF', outlineColor: '#000000', outlineWidth: 3, shadowOpacity: 0.45 } },
  { label: '민트', style: 'rounded', font: 'clean', entrance: 'fade', appearance: { fillColor: '#ECFDF5', textColor: '#065F46', outlineColor: '#34D399', outlineWidth: 3, shadowOpacity: 0.1 } },
  { label: '만화책', style: 'shout', font: 'serif', entrance: 'shake', appearance: { fillColor: '#FFFFFF', textColor: '#111827', outlineColor: '#111827', outlineWidth: 7, shadowOpacity: 0.35 } },
];

type BubbleColorFieldProps = {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
};

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

function BubbleColorField({ label, value, disabled, onChange }: BubbleColorFieldProps) {
  const id = useId().replace(/:/g, '');
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');

  const commit = () => {
    const normalized = draft.trim().toUpperCase();
    if (!HEX_COLOR_PATTERN.test(normalized)) {
      setError('#RRGGBB 형식으로 입력해 주세요.');
      return;
    }
    setError('');
    setDraft(normalized);
    onChange(normalized);
  };

  return (
    <S.BubbleColorField>
      <label htmlFor={`${id}-hex`}>{label}</label>
      <div>
        <input
          aria-label={`${label} 색상 선택`}
          type="color"
          value={value}
          disabled={disabled}
          onChange={(event) => {
            const next = event.target.value.toUpperCase();
            setDraft(next);
            setError('');
            onChange(next);
          }}
        />
        <input
          id={`${id}-hex`}
          type="text"
          value={draft}
          maxLength={7}
          pattern="#[0-9A-Fa-f]{6}"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
            }
          }}
        />
      </div>
      {error ? <small id={`${id}-error`} role="alert">{error}</small> : null}
    </S.BubbleColorField>
  );
}

function clampAppearanceNumber(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

export function BubbleTimelineEditor({
  timeline,
  frameCount,
  disabled = false,
  appearance,
  onAppearanceChange,
  bubbleOptions,
  onBubbleOptionsChange,
  onChange,
}: BubbleTimelineEditorProps) {
  const generatedId = useId().replace(/:/g, '');
  const safeFrameCount = Math.max(1, frameCount);
  const lastFrame = safeFrameCount - 1;
  const isStatic = safeFrameCount === 1;
  const overlappingCueCount = timeline.mode === 'cues'
    ? timeline.cues.filter((cue, index, cues) => cues.some((candidate, candidateIndex) => (
      candidateIndex !== index
      && cue.startFrame <= candidate.endFrame
      && candidate.startFrame <= cue.endFrame
    ))).length
    : 0;
  const lastCueEnd = timeline.cues.reduce((maximum, cue) => Math.max(maximum, cue.endFrame), -1);
  const nextCueStart = Math.min(lastFrame, lastCueEnd + 1);
  const nextCueEnd = Math.min(lastFrame, nextCueStart + Math.max(0, Math.floor(safeFrameCount / 4) - 1));
  const canAddCue = timeline.cues.length < Math.min(6, safeFrameCount) && lastCueEnd < lastFrame;
  const updateAppearance = <Key extends keyof EmoticonBubbleAppearance>(
    key: Key,
    value: EmoticonBubbleAppearance[Key],
  ) => {
    if (!appearance || !onAppearanceChange) return;
    onAppearanceChange({ ...appearance, [key]: value });
  };

  const updateRange = (field: 'startFrame' | 'endFrame', value: number) => {
    const nextValue = clampFrame(value, safeFrameCount);
    const currentEnd = timeline.endFrame ?? lastFrame;
    onChange(field === 'startFrame'
      ? {
        ...timeline,
        startFrame: nextValue,
        endFrame: Math.max(nextValue, currentEnd),
      }
      : {
        ...timeline,
        startFrame: Math.min(timeline.startFrame, nextValue),
        endFrame: nextValue,
      });
  };

  const updateCue = (
    cueId: string,
    update: Partial<EmoticonBubbleTimeline['cues'][number]>,
  ) => {
    onChange({
      ...timeline,
      cues: timeline.cues.map((cue) => {
        if (cue.id !== cueId) return cue;
        const next = { ...cue, ...update };
        const startFrame = clampFrame(next.startFrame, safeFrameCount);
        const endFrame = Math.max(startFrame, clampFrame(next.endFrame, safeFrameCount));
        return { ...next, startFrame, endFrame };
      }),
    });
  };

  return (
    <S.BubbleTimelinePanel aria-label="말풍선 노출 구간">
      {appearance && onAppearanceChange ? (
        <S.BubbleAppearancePanel>
          <S.BubbleAppearanceHeader>
            <strong>말풍선 꾸미기</strong>
            <span>스타일 프리셋을 고른 뒤 색상·크기·위치를 정밀 조절합니다.</span>
          </S.BubbleAppearanceHeader>
          {bubbleOptions && onBubbleOptionsChange ? (
            <>
              <S.BubblePresetGrid aria-label="말풍선 스타일 프리셋">
                {BUBBLE_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    disabled={disabled}
                    aria-label={`${preset.label} 말풍선 스타일 적용`}
                    onClick={() => {
                      onAppearanceChange({ ...appearance, ...preset.appearance });
                      onBubbleOptionsChange({
                        ...bubbleOptions,
                        style: preset.style,
                        font: preset.font,
                        entrance: preset.entrance,
                      });
                    }}
                  >
                    <i aria-hidden="true" style={{
                      color: preset.appearance.outlineColor,
                      background: preset.appearance.fillColor,
                      borderRadius: preset.style === 'rounded' ? 10 : preset.style === 'thought' ? '50%' : 2,
                    }} />
                    {preset.label}
                  </button>
                ))}
              </S.BubblePresetGrid>
              <S.BubbleOptionsGrid>
                <label>모양<select value={bubbleOptions.style} disabled={disabled} onChange={(event) => onBubbleOptionsChange({ ...bubbleOptions, style: event.target.value as EmoticonBubble['style'] })}>
                  <option value="rounded">둥근 말풍선</option><option value="shout">외침</option><option value="thought">생각</option><option value="whisper">속삭임</option><option value="none">말풍선 없음</option>
                </select></label>
                <label>위치<select value={bubbleOptions.position} disabled={disabled} onChange={(event) => onBubbleOptionsChange({ ...bubbleOptions, position: event.target.value as EmoticonBubble['position'] })}>
                  <option value="top">위</option><option value="bottom">아래</option><option value="left">왼쪽</option><option value="right">오른쪽</option>
                </select></label>
                <label>등장 효과<select value={bubbleOptions.entrance} disabled={disabled} onChange={(event) => onBubbleOptionsChange({ ...bubbleOptions, entrance: event.target.value as EmoticonBubble['entrance'] })}>
                  <option value="pop">통통 튀기</option><option value="fade">부드럽게</option><option value="shake">흔들기</option><option value="none">효과 없음</option>
                </select></label>
                <label>글꼴<select value={bubbleOptions.font} disabled={disabled} onChange={(event) => onBubbleOptionsChange({ ...bubbleOptions, font: event.target.value as EmoticonBubble['font'] })}>
                  <option value="clean">깔끔한 글씨</option><option value="round">둥근 글씨</option><option value="handwriting">손글씨</option><option value="bold">굵은 글씨</option><option value="serif">만화책 글씨</option>
                </select></label>
              </S.BubbleOptionsGrid>
            </>
          ) : null}
          <S.BubbleAppearanceGrid>
            <BubbleColorField
              key={`fill-${appearance.fillColor}`}
              label="채우기"
              value={appearance.fillColor}
              disabled={disabled}
              onChange={(value) => updateAppearance('fillColor', value)}
            />
            <BubbleColorField
              key={`text-${appearance.textColor}`}
              label="글자"
              value={appearance.textColor}
              disabled={disabled}
              onChange={(value) => updateAppearance('textColor', value)}
            />
            <BubbleColorField
              key={`outline-${appearance.outlineColor}`}
              label="테두리"
              value={appearance.outlineColor}
              disabled={disabled}
              onChange={(value) => updateAppearance('outlineColor', value)}
            />
            <S.BubbleRangeField>
              <label htmlFor={`${generatedId}-size`}>
                크기 <output>{Math.round(appearance.size * 100)}%</output>
              </label>
              <input
                id={`${generatedId}-size`}
                type="range"
                min={75}
                max={120}
                step={1}
                value={Math.round(appearance.size * 100)}
                disabled={disabled}
                onChange={(event) => updateAppearance('size', Number(event.target.value) / 100)}
              />
            </S.BubbleRangeField>
            <S.BubbleRangeField>
              <label htmlFor={`${generatedId}-outline-width`}>
                테두리 두께 <output>{appearance.outlineWidth.toFixed(1)}px</output>
              </label>
              <input
                id={`${generatedId}-outline-width`}
                type="range"
                min={0}
                max={10}
                step={0.5}
                value={appearance.outlineWidth}
                disabled={disabled}
                onChange={(event) => updateAppearance('outlineWidth', Number(event.target.value))}
              />
            </S.BubbleRangeField>
            <S.BubbleRangeField>
              <label htmlFor={`${generatedId}-shadow-opacity`}>
                그림자 <output>{appearance.shadowOpacity === 0 ? '꺼짐' : `${Math.round(appearance.shadowOpacity * 100)}%`}</output>
              </label>
              <input
                id={`${generatedId}-shadow-opacity`}
                type="range"
                min={0}
                max={75}
                step={5}
                value={Math.round(appearance.shadowOpacity * 100)}
                disabled={disabled}
                onChange={(event) => updateAppearance('shadowOpacity', Number(event.target.value) / 100)}
              />
            </S.BubbleRangeField>
            <S.BubbleOffsetGrid>
              <S.ProjectField>
                <label htmlFor={`${generatedId}-offset-x`}>가로 미세 이동 (px)</label>
                <input
                  id={`${generatedId}-offset-x`}
                  type="number"
                  inputMode="numeric"
                  min={-48}
                  max={48}
                  step={1}
                  value={appearance.offsetX}
                  disabled={disabled}
                  onChange={(event) => updateAppearance(
                    'offsetX',
                    Math.round(clampAppearanceNumber(Number(event.target.value), -48, 48)),
                  )}
                />
              </S.ProjectField>
              <S.ProjectField>
                <label htmlFor={`${generatedId}-offset-y`}>세로 미세 이동 (px)</label>
                <input
                  id={`${generatedId}-offset-y`}
                  type="number"
                  inputMode="numeric"
                  min={-48}
                  max={48}
                  step={1}
                  value={appearance.offsetY}
                  disabled={disabled}
                  onChange={(event) => updateAppearance(
                    'offsetY',
                    Math.round(clampAppearanceNumber(Number(event.target.value), -48, 48)),
                  )}
                />
              </S.ProjectField>
            </S.BubbleOffsetGrid>
          </S.BubbleAppearanceGrid>
        </S.BubbleAppearancePanel>
      ) : null}
      <S.ProjectField>
        <label htmlFor={`${generatedId}-mode`}>노출 구간</label>
        <select
          id={`${generatedId}-mode`}
          name={`${generatedId}BubbleTimelineMode`}
          value={isStatic ? 'full' : timeline.mode}
          disabled={disabled || isStatic}
          onChange={(event) => onChange(timelineForMode(
            timeline,
            event.target.value as EmoticonBubbleTimelineMode,
            safeFrameCount,
          ))}
        >
          {EMOTICON_BUBBLE_TIMELINE_MODES.map((mode) => (
            <option key={mode} value={mode}>{MODE_LABELS[mode]}</option>
          ))}
        </select>
        <small>
          {isStatic
            ? '정지형은 1개 이미지 전체에 표시됩니다.'
            : '캐릭터 프레임과 독립적으로 문구가 보이는 시점을 정합니다.'}
        </small>
      </S.ProjectField>

      {!isStatic && timeline.mode === 'range' ? (
        <S.TimelineRangeGrid>
          <S.ProjectField>
            <label htmlFor={`${generatedId}-start`}>시작 프레임</label>
            <input
              id={`${generatedId}-start`}
              name={`${generatedId}BubbleStartFrame`}
              type="number"
              inputMode="numeric"
              min={1}
              max={safeFrameCount}
              value={timeline.startFrame + 1}
              disabled={disabled}
              onChange={(event) => updateRange('startFrame', Number(event.target.value) - 1)}
            />
          </S.ProjectField>
          <S.ProjectField>
            <label htmlFor={`${generatedId}-end`}>종료 프레임</label>
            <input
              id={`${generatedId}-end`}
              name={`${generatedId}BubbleEndFrame`}
              type="number"
              inputMode="numeric"
              min={1}
              max={safeFrameCount}
              value={(timeline.endFrame ?? lastFrame) + 1}
              disabled={disabled}
              onChange={(event) => updateRange('endFrame', Number(event.target.value) - 1)}
            />
          </S.ProjectField>
        </S.TimelineRangeGrid>
      ) : null}

      {!isStatic && timeline.mode === 'cues' ? (
        <S.BubbleCueList>
          {overlappingCueCount ? <p role="alert" style={{ margin: 0, color: '#fda29b', fontSize: 11 }}>문구 구간이 겹쳤습니다. 각 프레임에는 한 문구만 오도록 시작·종료 값을 조정하세요.</p> : null}
          {timeline.cues.map((cue, index) => (
            <S.BubbleCueRow key={cue.id}>
              <label htmlFor={`${generatedId}-cue-${cue.id}`}>
                문구 {index + 1}
                <input
                  id={`${generatedId}-cue-${cue.id}`}
                  name={`${generatedId}BubbleCueText${index + 1}`}
                  value={cue.text}
                  maxLength={36}
                  autoComplete="off"
                  disabled={disabled}
                  onChange={(event) => updateCue(cue.id, { text: event.target.value })}
                />
              </label>
              <label>
                시작
                <input
                  aria-label={`문구 ${index + 1} 시작 프레임`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={safeFrameCount}
                  value={cue.startFrame + 1}
                  disabled={disabled}
                  onChange={(event) => updateCue(cue.id, { startFrame: Number(event.target.value) - 1 })}
                />
              </label>
              <label>
                종료
                <input
                  aria-label={`문구 ${index + 1} 종료 프레임`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={safeFrameCount}
                  value={cue.endFrame + 1}
                  disabled={disabled}
                  onChange={(event) => updateCue(cue.id, { endFrame: Number(event.target.value) - 1 })}
                />
              </label>
              <button
                type="button"
                aria-label={`문구 ${index + 1} 삭제`}
                disabled={disabled || timeline.cues.length <= 1}
                onClick={() => onChange({
                  ...timeline,
                  cues: timeline.cues.filter((candidate) => candidate.id !== cue.id),
                })}
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            </S.BubbleCueRow>
          ))}
          <button
            type="button"
            disabled={disabled || !canAddCue}
            onClick={() => onChange({
              ...timeline,
              cues: [
                ...timeline.cues,
                {
                  id: crypto.randomUUID(),
                  text: '새 문구',
                  startFrame: nextCueStart,
                  endFrame: nextCueEnd,
                },
              ],
            })}
          >
            <Plus size={13} aria-hidden="true" /> 문구 구간 추가
          </button>
        </S.BubbleCueList>
      ) : null}
    </S.BubbleTimelinePanel>
  );
}
