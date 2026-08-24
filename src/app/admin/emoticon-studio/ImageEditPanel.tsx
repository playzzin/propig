'use client';

import { useMemo, useState } from 'react';
import {
  AlignCenter,
  Eye,
  FlipHorizontal2,
  History,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import {
  createIdentityEmoticonImageEditRecipe,
  isIdentityEmoticonImageEditRecipe,
  type EmoticonImageEditRecipe,
  type EmoticonJob,
} from '@/schemas/emoticonStudio';
import type { EmoticonProjectItem } from '@/schemas/emoticonProject';
import * as S from './EmoticonStudio.styles';

type ImageEditPanelProps = {
  job: EmoticonJob;
  item: EmoticonProjectItem | null;
  isLocked: boolean;
  isCreating: boolean;
  canCreate: boolean;
  onCreate: (recipe: EmoticonImageEditRecipe) => Promise<void>;
};

type CropSide = keyof EmoticonImageEditRecipe['crop'];

const CROP_LABELS: Record<CropSide, string> = {
  left: '왼쪽',
  right: '오른쪽',
  top: '위',
  bottom: '아래',
};

function recipeComparable(recipe: EmoticonImageEditRecipe): string {
  return JSON.stringify({ ...recipe, revision: 0 });
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function signedPercent(value: number): string {
  const rounded = Math.round(value * 100);
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

export function ImageEditPanel({
  job,
  item,
  isLocked,
  isCreating,
  canCreate,
  onCreate,
}: ImageEditPanelProps) {
  const baseRecipe = job.editRecipe || createIdentityEmoticonImageEditRecipe();
  const [draft, setDraft] = useState<EmoticonImageEditRecipe>(() => baseRecipe);
  const [showOriginal, setShowOriginal] = useState(false);
  const previewSource = job.animationFrames?.[0]?.url
    || job.keyPoseUrl
    || job.outputs?.png?.url
    || job.sourceImageUrl;
  const dirty = recipeComparable(draft) !== recipeComparable(baseRecipe);
  const isResetDraft = isIdentityEmoticonImageEditRecipe(draft);
  const history = item?.editHistory || [];
  const previewScale = draft.scale * Math.max(0.4, 1 - draft.transparentPadding * 2);
  const previewStyle = useMemo(() => ({
    clipPath: `inset(${percent(draft.crop.top)} ${percent(draft.crop.right)} ${percent(draft.crop.bottom)} ${percent(draft.crop.left)})`,
    filter: [
      `brightness(${1 + (draft.brightness ?? 0)})`,
      `contrast(${1 + (draft.contrast ?? 0)})`,
      `saturate(${1 + (draft.saturation ?? 0)})`,
    ].join(' '),
    transform: [
      `translate(${percent(draft.offsetX)}, ${percent(draft.offsetY)})`,
      `rotate(${draft.rotationDeg}deg)`,
      `scale(${draft.flipHorizontal ? -previewScale : previewScale}, ${previewScale})`,
    ].join(' '),
  }), [draft, previewScale]);

  const updateCrop = (side: CropSide, rawValue: number) => {
    setDraft((current) => {
      const horizontal = side === 'left' || side === 'right';
      const counterpart = horizontal
        ? side === 'left' ? current.crop.right : current.crop.left
        : side === 'top' ? current.crop.bottom : current.crop.top;
      const value = Math.min(0.45, Math.max(0, Math.min(rawValue, 0.8 - counterpart)));
      return { ...current, crop: { ...current.crop, [side]: value } };
    });
  };

  const disabled = isLocked || isCreating || !canCreate || !dirty;

  return (
    <S.ImageEditPanel open>
      <summary>
        <span><SlidersHorizontal size={15} aria-hidden="true" /> 이미지 편집</span>
        <small>비파괴 · 원본 프레임 유지</small>
      </summary>
      <S.ImageEditBody>
        <S.ImageEditPreview aria-label="이미지 편집 미리보기">
          <img
            src={previewSource}
            width={360}
            height={360}
            alt={showOriginal ? '편집 전 원본 첫 프레임' : '편집 후 미리보기 첫 프레임'}
            style={showOriginal ? undefined : previewStyle}
          />
          <span>{showOriginal ? '편집 전 원본' : `${job.plan?.action.frameCount || 1}프레임 전체 적용`}</span>
        </S.ImageEditPreview>

        <S.ImageEditQuickActions aria-label="빠른 이미지 정렬">
          <button
            type="button"
            onClick={() => setDraft((current) => ({ ...current, offsetX: 0, offsetY: 0 }))}
          >
            <AlignCenter size={14} aria-hidden="true" /> 중앙 정렬
          </button>
          <button
            type="button"
            aria-pressed={draft.flipHorizontal}
            onClick={() => setDraft((current) => ({
              ...current,
              flipHorizontal: !current.flipHorizontal,
            }))}
          >
            <FlipHorizontal2 size={14} aria-hidden="true" /> 좌우 반전
          </button>
          <button
            type="button"
            onClick={() => setDraft(createIdentityEmoticonImageEditRecipe(baseRecipe.revision))}
          >
            <RotateCcw size={14} aria-hidden="true" /> 원본 복원
          </button>
          <button
            type="button"
            aria-pressed={showOriginal}
            onClick={() => setShowOriginal((current) => !current)}
          >
            <Eye size={14} aria-hidden="true" /> {showOriginal ? '편집본 보기' : '원본 비교'}
          </button>
        </S.ImageEditQuickActions>

        <S.ImageEditControlGrid>
          <label>
            <span>확대·축소 <output>{draft.scale.toFixed(2)}배</output></span>
            <input
              type="range"
              min="0.5"
              max="1.6"
              step="0.01"
              value={draft.scale}
              onChange={(event) => setDraft((current) => ({ ...current, scale: Number(event.target.value) }))}
            />
          </label>
          <label>
            <span>가로 위치 <output>{percent(draft.offsetX)}</output></span>
            <input
              type="range"
              min="-0.45"
              max="0.45"
              step="0.01"
              value={draft.offsetX}
              onChange={(event) => setDraft((current) => ({ ...current, offsetX: Number(event.target.value) }))}
            />
          </label>
          <label>
            <span>세로 위치 <output>{percent(draft.offsetY)}</output></span>
            <input
              type="range"
              min="-0.45"
              max="0.45"
              step="0.01"
              value={draft.offsetY}
              onChange={(event) => setDraft((current) => ({ ...current, offsetY: Number(event.target.value) }))}
            />
          </label>
          <label>
            <span>회전 <output>{draft.rotationDeg > 0 ? '+' : ''}{draft.rotationDeg}°</output></span>
            <input
              type="range"
              min="-45"
              max="45"
              step="1"
              value={draft.rotationDeg}
              onChange={(event) => setDraft((current) => ({ ...current, rotationDeg: Number(event.target.value) }))}
            />
          </label>
          <label>
            <span>투명 여백 <output>{percent(draft.transparentPadding)}</output></span>
            <input
              type="range"
              min="0"
              max="0.3"
              step="0.01"
              value={draft.transparentPadding}
              onChange={(event) => setDraft((current) => ({
                ...current,
                transparentPadding: Number(event.target.value),
              }))}
            />
          </label>
          <label>
            <span>밝기 <output>{signedPercent(draft.brightness ?? 0)}</output></span>
            <input
              type="range"
              min="-0.5"
              max="0.5"
              step="0.01"
              value={draft.brightness ?? 0}
              aria-label="밝기"
              aria-valuetext={signedPercent(draft.brightness ?? 0)}
              onChange={(event) => setDraft((current) => ({
                ...current,
                brightness: Number(event.target.value),
              }))}
            />
          </label>
          <label>
            <span>대비 <output>{signedPercent(draft.contrast ?? 0)}</output></span>
            <input
              type="range"
              min="-0.5"
              max="0.5"
              step="0.01"
              value={draft.contrast ?? 0}
              aria-label="대비"
              aria-valuetext={signedPercent(draft.contrast ?? 0)}
              onChange={(event) => setDraft((current) => ({
                ...current,
                contrast: Number(event.target.value),
              }))}
            />
          </label>
          <label>
            <span>채도 <output>{signedPercent(draft.saturation ?? 0)}</output></span>
            <input
              type="range"
              min="-0.5"
              max="0.5"
              step="0.01"
              value={draft.saturation ?? 0}
              aria-label="채도"
              aria-valuetext={signedPercent(draft.saturation ?? 0)}
              onChange={(event) => setDraft((current) => ({
                ...current,
                saturation: Number(event.target.value),
              }))}
            />
          </label>
        </S.ImageEditControlGrid>

        <S.ImageCropGroup>
          <header>
            <strong>가장자리 자르기</strong>
            <span>배경 잔재만 조금씩 정리하세요.</span>
          </header>
          <div>
            {(Object.keys(CROP_LABELS) as CropSide[]).map((side) => (
              <label key={side}>
                <span>{CROP_LABELS[side]} <output>{percent(draft.crop[side])}</output></span>
                <input
                  type="range"
                  min="0"
                  max="0.45"
                  step="0.01"
                  value={draft.crop[side]}
                  onChange={(event) => updateCrop(side, Number(event.target.value))}
                />
              </label>
            ))}
          </div>
        </S.ImageCropGroup>

        {history.length ? (
          <S.ImageEditHistory aria-label="이전 편집값">
            <span><History size={13} aria-hidden="true" /> 이전 편집</span>
            <div>
              {[...history].reverse().slice(0, 8).map((entry) => (
                <button
                  key={`${entry.resultJobId}-${entry.recipe.revision}`}
                  type="button"
                  onClick={() => setDraft(entry.recipe)}
                  title={`${entry.recipe.revision}번 편집값 불러오기`}
                >
                  r{entry.recipe.revision}
                </button>
              ))}
            </div>
          </S.ImageEditHistory>
        ) : null}

        <S.ImageEditNotice>
          원본 작업과 AI 프레임은 바꾸지 않습니다. 편집본은 새 작업으로 저장되고, 모든 프레임과 말풍선을 다시 조립한 뒤 파일 규격을 재검사합니다.
        </S.ImageEditNotice>
        <S.RerenderButton
          type="button"
          disabled={disabled}
          onClick={() => void onCreate(draft)}
        >
          {isCreating ? <S.InlineSpinner /> : <Sparkles size={14} aria-hidden="true" />}
          {!canCreate
            ? '검증된 원본 프레임 필요'
            : isCreating
              ? '편집본 만드는 중…'
              : !dirty
                ? '편집값을 조정해 주세요'
                : isResetDraft
                  ? '원본 복원본 만들기'
                  : '편집본 만들기'}
        </S.RerenderButton>
      </S.ImageEditBody>
    </S.ImageEditPanel>
  );
}
