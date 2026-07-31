"use client";

import {
  FinalCheckList,
  FinalDeliveryActions,
  FinalDeliveryCard,
  FinalDeliveryGrid,
  FinalDeliveryHeader,
  FinalFreshnessNotice,
  FinalDownloadButton,
  SecondaryFinalAction,
} from "./StoryboardVideoProductionPanel.styles";

export type StoryboardFinalDeliveryModel = {
  audioMixLabel: string;
  backgroundMusicName: string | null;
  backgroundMusicUrl: string | null;
  dialogueAdjustedSceneCount: number;
  dialogueSceneCount: number;
  editedTotalDuration: number;
  finalVideoUrl: string;
  isDownloading: boolean;
  isCurrent: boolean;
  posterUrl?: string;
  readySceneCount: number;
  remergeDisabled: boolean;
  sceneAudioVolume: number;
  sceneCount: number;
};

type StoryboardFinalDeliveryProps = {
  delivery: StoryboardFinalDeliveryModel;
  onDownload: () => void;
  onRemerge: () => void;
};

export default function StoryboardFinalDelivery({
  delivery,
  onDownload,
  onRemerge,
}: StoryboardFinalDeliveryProps) {
  return (
    <FinalDeliveryCard aria-labelledby="storyboard-final-delivery-title">
      <FinalDeliveryHeader>
        <div>
          <span>DELIVERY REVIEW</span>
          <h4 id="storyboard-final-delivery-title">완성본 검수</h4>
          <p>
            재생하면서 장면 연결, 음량, 자막과 제품 형태를 확인한 뒤 파일을
            받으세요.
          </p>
        </div>
        <FinalDeliveryActions>
          <SecondaryFinalAction
            type="button"
            onClick={onRemerge}
            disabled={delivery.remergeDisabled}
            data-testid="storyboard-final-remerge-action"
          >
            <i className="fas fa-arrows-rotate" aria-hidden="true" />
            순서대로 다시 병합
          </SecondaryFinalAction>
          <FinalDownloadButton
            type="button"
            onClick={onDownload}
            disabled={delivery.isDownloading}
            aria-busy={delivery.isDownloading}
          >
            <i
              className={
                delivery.isDownloading
                  ? "fas fa-spinner fa-spin"
                  : "fas fa-download"
              }
              aria-hidden="true"
            />
            완성본 받기
          </FinalDownloadButton>
        </FinalDeliveryActions>
      </FinalDeliveryHeader>
      {!delivery.isCurrent ? (
        <FinalFreshnessNotice role="status">
          <i className="fas fa-triangle-exclamation" aria-hidden="true" />
          <span>
            <strong>이전 완성본입니다</strong>
            장면이나 사운드 설정이 바뀌었습니다. 현재 파일은 안전하게 유지되며
            “순서대로 다시 병합”하면 최신 상태로 갱신됩니다.
          </span>
        </FinalFreshnessNotice>
      ) : null}

      <FinalDeliveryGrid>
        <video
          controls
          preload="metadata"
          poster={delivery.posterUrl}
          aria-label="최종 완성본 미리보기"
        >
          <source src={delivery.finalVideoUrl} />이 브라우저에서는 영상
          미리보기를 지원하지 않습니다. 완성본 받기 버튼을 이용해 주세요.
        </video>
        <FinalCheckList>
          <li>
            <i className="fas fa-circle-check" aria-hidden="true" />
            <span>
              <strong>장면 순서와 승인 상태</strong>
              <small>
                {delivery.readySceneCount}/{delivery.sceneCount} 장면이 재생
                가능한 승인 영상으로 조립되었습니다.
              </small>
            </span>
          </li>
          <li>
            <i className="fas fa-clock" aria-hidden="true" />
            <span>
              <strong>최종 편집 길이</strong>
              <small>
                {delivery.editedTotalDuration}초 · {delivery.sceneCount}개 장면
                {delivery.dialogueAdjustedSceneCount > 0
                  ? ` · 대사 길이 자동 보정 ${delivery.dialogueAdjustedSceneCount}개`
                  : ""}
              </small>
            </span>
          </li>
          <li>
            <i
              className={
                delivery.backgroundMusicUrl
                  ? "fas fa-music"
                  : "fas fa-volume-high"
              }
              aria-hidden="true"
            />
            <span>
              <strong>
                {delivery.backgroundMusicUrl
                  ? "배경음악·대사 믹스 적용"
                  : "장면 사운드 적용"}
              </strong>
              <small>
                {delivery.backgroundMusicUrl
                  ? `${delivery.backgroundMusicName || "등록한 배경음악"} · ${delivery.audioMixLabel}${delivery.dialogueSceneCount > 0 ? ` · 대사 ${delivery.dialogueSceneCount}개 장면 자동 보호` : ""}`
                  : `장면 사운드 ${Math.round(delivery.sceneAudioVolume * 100)}%`}
              </small>
            </span>
          </li>
          <li>
            <i className="fas fa-pen-ruler" aria-hidden="true" />
            <span>
              <strong>수정이 필요하면</strong>
              <small>
                수정할 장면만 다시 만들고, 승인한 나머지 장면은 그대로 재사용할
                수 있습니다.
              </small>
            </span>
          </li>
        </FinalCheckList>
      </FinalDeliveryGrid>
    </FinalDeliveryCard>
  );
}
