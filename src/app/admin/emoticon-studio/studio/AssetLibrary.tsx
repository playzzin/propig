'use client';

import {
  ArchiveRestore,
  Heart,
  ImagePlus,
  Search,
  Trash2,
  Upload,
  ZoomIn,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { AccessibleImagePreviewDialog } from '../AccessibleImagePreviewDialog';
import {
  EMPTY_ASSET_LIBRARY_PREFERENCES,
  assetLibraryStorageKey,
  parseAssetLibraryPreferences,
  type AssetLibraryEntry,
  type AssetLibraryPreferences,
  type AssetLibraryReusableFrame,
} from './assetLibraryModel';

type LibraryTab = 'all' | 'favorites' | 'trash';

type AssetLibraryProps = {
  userId: string;
  projectId: string;
  assets: AssetLibraryEntry[];
  canAddToTimeline: boolean;
  disabled: boolean;
  onAddToTimeline: (frames: AssetLibraryReusableFrame[]) => void;
};

type StoredPreferences = {
  key: string;
  value: AssetLibraryPreferences;
};

const VERSION_LABELS: Record<AssetLibraryEntry['version'], string> = {
  source: '업로드 원본',
  original: '생성 원본',
  edited: '수정본',
};

const ASSET_DATE_FORMATTER = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'Asia/Seoul',
});

function recordedDate(milliseconds: number): string {
  if (milliseconds <= 0 || milliseconds > 8.64e15) return '날짜 기록 없음';
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? '날짜 기록 없음' : ASSET_DATE_FORMATTER.format(date);
}

export function AssetLibrary({
  userId,
  projectId,
  assets,
  canAddToTimeline,
  disabled,
  onAddToTimeline,
}: AssetLibraryProps) {
  const storageKey = useMemo(() => assetLibraryStorageKey(userId, projectId), [projectId, userId]);
  const [storedPreferences, setStoredPreferences] = useState<StoredPreferences>({
    key: '',
    value: EMPTY_ASSET_LIBRARY_PREFERENCES,
  });
  const [storageHealthy, setStorageHealthy] = useState(true);
  const [tab, setTab] = useState<LibraryTab>('all');
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewAsset, setPreviewAsset] = useState<AssetLibraryEntry | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [lastTrashAction, setLastTrashAction] = useState<string[]>([]);
  const preferences = storedPreferences.key === storageKey
    ? storedPreferences.value
    : EMPTY_ASSET_LIBRARY_PREFERENCES;
  const favoriteIds = useMemo(() => new Set(preferences.favoriteIds), [preferences.favoriteIds]);
  const deletedIds = useMemo(() => new Set(preferences.deletedIds), [preferences.deletedIds]);

  useEffect(() => {
    let cancelled = false;
    let next = EMPTY_ASSET_LIBRARY_PREFERENCES;
    let healthy = true;
    try {
      const raw = window.localStorage.getItem(storageKey);
      next = raw ? parseAssetLibraryPreferences(JSON.parse(raw)) : EMPTY_ASSET_LIBRARY_PREFERENCES;
    } catch {
      healthy = false;
    }
    queueMicrotask(() => {
      if (cancelled) return;
      setStorageHealthy(healthy);
      setStoredPreferences({ key: storageKey, value: next });
      setSelectedIds([]);
      setTab('all');
      setQuery('');
    });
    return () => { cancelled = true; };
  }, [storageKey]);

  useEffect(() => {
    if (storedPreferences.key !== storageKey) return;
    let cancelled = false;
    let healthy = true;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(storedPreferences.value));
    } catch {
      healthy = false;
    }
    queueMicrotask(() => {
      if (!cancelled) setStorageHealthy(healthy);
    });
    return () => { cancelled = true; };
  }, [storageKey, storedPreferences]);

  useEffect(() => {
    const syncStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      try {
        setStoredPreferences({
          key: storageKey,
          value: event.newValue
            ? parseAssetLibraryPreferences(JSON.parse(event.newValue))
            : EMPTY_ASSET_LIBRARY_PREFERENCES,
        });
        setStorageHealthy(true);
      } catch {
        setStorageHealthy(false);
      }
    };
    window.addEventListener('storage', syncStorage);
    return () => window.removeEventListener('storage', syncStorage);
  }, [storageKey]);

  const updatePreferences = (update: (current: AssetLibraryPreferences) => AssetLibraryPreferences) => {
    setStoredPreferences((current) => ({
      key: storageKey,
      value: update(current.key === storageKey ? current.value : EMPTY_ASSET_LIBRARY_PREFERENCES),
    }));
  };

  const counts = useMemo(() => ({
    all: assets.filter((asset) => !deletedIds.has(asset.id)).length,
    favorites: assets.filter((asset) => favoriteIds.has(asset.id) && !deletedIds.has(asset.id)).length,
    trash: assets.filter((asset) => deletedIds.has(asset.id)).length,
  }), [assets, deletedIds, favoriteIds]);

  const visibleAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return assets.filter((asset) => {
      const isDeleted = deletedIds.has(asset.id);
      if (tab === 'trash' ? !isDeleted : isDeleted) return false;
      if (tab === 'favorites' && !favoriteIds.has(asset.id)) return false;
      if (!normalizedQuery) return true;
      return [asset.title, asset.prompt, asset.model || '', asset.provider || '']
        .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
    });
  }, [assets, deletedIds, favoriteIds, query, tab]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedAssets = useMemo(
    () => visibleAssets.filter((asset) => selectedIdSet.has(asset.id)),
    [selectedIdSet, visibleAssets],
  );
  const selectedReusableFrames = useMemo(
    () => selectedAssets.flatMap((asset) => asset.reusableFrame ? [asset.reusableFrame] : []),
    [selectedAssets],
  );
  const allVisibleSelected = visibleAssets.length > 0 && visibleAssets.every((asset) => selectedIdSet.has(asset.id));

  const toggleSelection = (id: string) => {
    setSelectedIds((current) => current.includes(id)
      ? current.filter((candidate) => candidate !== id)
      : [...current, id]);
  };

  const toggleFavorite = (id: string) => {
    const favorited = !favoriteIds.has(id);
    updatePreferences((current) => {
      const next = new Set(current.favoriteIds);
      if (favorited) next.add(id);
      else next.delete(id);
      return { ...current, favoriteIds: Array.from(next) };
    });
    setAnnouncement(favorited ? '즐겨찾기에 추가했습니다.' : '즐겨찾기에서 제외했습니다.');
  };

  const changeTab = (nextTab: LibraryTab) => {
    setTab(nextTab);
    setSelectedIds([]);
  };

  const moveToTrash = (ids: string[]) => {
    if (!ids.length) return;
    updatePreferences((current) => ({
      ...current,
      deletedIds: Array.from(new Set([...current.deletedIds, ...ids])),
    }));
    setSelectedIds([]);
    setLastTrashAction(ids);
    setAnnouncement(`${ids.length}개 이미지를 휴지통으로 옮겼습니다. 언제든 복구할 수 있습니다.`);
  };

  const restore = (ids: string[]) => {
    if (!ids.length) return;
    const restored = new Set(ids);
    updatePreferences((current) => ({
      ...current,
      deletedIds: current.deletedIds.filter((id) => !restored.has(id)),
    }));
    setSelectedIds([]);
    setLastTrashAction((current) => current.filter((id) => !restored.has(id)));
    setAnnouncement(`${ids.length}개 이미지를 보관함으로 복구했습니다.`);
  };

  const addFrames = (frames: AssetLibraryReusableFrame[]) => {
    if (!frames.length || disabled || !canAddToTimeline) return;
    onAddToTimeline(frames);
    setAnnouncement(`${frames.length}개 이미지를 프레임 조립 목록으로 보냈습니다.`);
  };

  return (
    <Library aria-labelledby="asset-library-title">
      <LibraryHeader>
        <div>
          <Eyebrow>프로젝트 이미지 보관함</Eyebrow>
          <h2 id="asset-library-title">원본과 생성 버전을 한곳에서 관리하세요</h2>
          <p>즐겨찾기와 휴지통은 이 브라우저에 사용자·프로젝트별로 저장됩니다. 휴지통 이동은 서버 원본을 삭제하지 않습니다.</p>
        </div>
        <TotalCount aria-label={`전체 ${assets.length}개`}>{assets.length}</TotalCount>
      </LibraryHeader>

      <LibraryControls>
        <Tabs aria-label="보관함 보기">
          <TabButton type="button" $active={tab === 'all'} aria-pressed={tab === 'all'} onClick={() => changeTab('all')}>전체 <span>{counts.all}</span></TabButton>
          <TabButton type="button" $active={tab === 'favorites'} aria-pressed={tab === 'favorites'} onClick={() => changeTab('favorites')}><Heart size={14} aria-hidden="true" /> 즐겨찾기 <span>{counts.favorites}</span></TabButton>
          <TabButton type="button" $active={tab === 'trash'} aria-pressed={tab === 'trash'} onClick={() => changeTab('trash')}><Trash2 size={14} aria-hidden="true" /> 휴지통 <span>{counts.trash}</span></TabButton>
        </Tabs>
        <SearchField>
          <Search size={15} aria-hidden="true" />
          <input name="assetLibrarySearch" type="search" value={query} placeholder="제목, 프롬프트, 모델 검색…" aria-label="이미지 보관함 검색" autoComplete="off" onChange={(event) => { setQuery(event.target.value); setSelectedIds([]); }} />
        </SearchField>
      </LibraryControls>

      <SelectionBar $visible={selectedAssets.length > 0}>
        <SelectAllLabel>
          <input
            type="checkbox"
            checked={allVisibleSelected}
            disabled={!visibleAssets.length}
            aria-label="현재 보이는 이미지 전체 선택"
            onChange={() => setSelectedIds(allVisibleSelected ? [] : visibleAssets.map((asset) => asset.id))}
          />
          <span>{selectedAssets.length ? `${selectedAssets.length}개 선택` : '전체 선택'}</span>
        </SelectAllLabel>
        <BulkActions>
          {tab === 'trash' ? (
            <ActionButton type="button" disabled={!selectedAssets.length} onClick={() => restore(selectedAssets.map((asset) => asset.id))}><ArchiveRestore size={15} aria-hidden="true" /> 선택 복구</ActionButton>
          ) : (
            <>
              {canAddToTimeline ? <PrimaryAction type="button" disabled={disabled || !selectedReusableFrames.length} onClick={() => addFrames(selectedReusableFrames)}><ImagePlus size={15} aria-hidden="true" /> 프레임에 추가 {selectedReusableFrames.length ? `(${selectedReusableFrames.length})` : ''}</PrimaryAction> : null}
              <ActionButton type="button" disabled={!selectedAssets.length} onClick={() => moveToTrash(selectedAssets.map((asset) => asset.id))}><Trash2 size={15} aria-hidden="true" /> 휴지통</ActionButton>
            </>
          )}
        </BulkActions>
      </SelectionBar>

      {!storageHealthy ? <StorageNotice role="status">브라우저 저장소를 사용할 수 없어 즐겨찾기와 휴지통 상태가 현재 화면에서만 유지됩니다.</StorageNotice> : null}
      {lastTrashAction.length ? (
        <UndoNotice role="status" aria-live="polite">
          <span>{lastTrashAction.length}개 이미지를 휴지통으로 옮겼습니다.</span>
          <button type="button" onClick={() => restore(lastTrashAction)}>실행 취소</button>
        </UndoNotice>
      ) : null}
      <LiveStatus role="status" aria-live="polite">{announcement}</LiveStatus>

      {visibleAssets.length ? (
        <AssetGrid aria-label={`${tab === 'trash' ? '휴지통' : tab === 'favorites' ? '즐겨찾기' : '전체'} 이미지`}>
          {visibleAssets.map((asset) => {
            const selected = selectedIdSet.has(asset.id);
            const favorited = favoriteIds.has(asset.id);
            return (
              <AssetCard key={asset.id} $selected={selected}>
                <Preview>
                  <img src={asset.imageUrl} width={320} height={320} loading="lazy" alt={`${asset.title} 미리보기`} />
                  <SelectionLabel>
                    <input type="checkbox" checked={selected} aria-label={`${asset.title} 선택`} onChange={() => toggleSelection(asset.id)} />
                  </SelectionLabel>
                  <PreviewButton type="button" onClick={() => setPreviewAsset(asset)} aria-label={`${asset.title} 크게 보기`}><ZoomIn size={16} aria-hidden="true" /></PreviewButton>
                  <Badges>
                    <VersionBadge $version={asset.version}>{VERSION_LABELS[asset.version]}</VersionBadge>
                    {asset.reusableFrame ? <ReusableBadge>프레임 가능</ReusableBadge> : null}
                  </Badges>
                </Preview>
                <CardBody>
                  <CardTitle title={asset.title}>{asset.title}</CardTitle>
                  <Prompt title={asset.prompt}><span>프롬프트</span>{asset.prompt}</Prompt>
                  <Metadata>
                    <div><dt>모델</dt><dd title={asset.model || undefined}>{asset.kind === 'source' ? '직접 업로드' : asset.model || '기록 없음'}</dd></div>
                    <div><dt>제공자</dt><dd title={asset.provider || undefined}>{asset.kind === 'source' ? '사용자' : asset.provider || '기록 없음'}</dd></div>
                    <div><dt>규격</dt><dd>{asset.dimensions || '원본 크기'}</dd></div>
                    <div><dt>날짜</dt><dd>{recordedDate(asset.createdAtMs)}</dd></div>
                  </Metadata>
                </CardBody>
                <CardActions>
                  <IconButton type="button" $active={favorited} aria-pressed={favorited} onClick={() => toggleFavorite(asset.id)} aria-label={favorited ? `${asset.title} 즐겨찾기 해제` : `${asset.title} 즐겨찾기`}><Heart size={16} fill={favorited ? 'currentColor' : 'none'} aria-hidden="true" /></IconButton>
                  {tab === 'trash' ? (
                    <TextAction type="button" onClick={() => restore([asset.id])}><ArchiveRestore size={14} aria-hidden="true" /> 복구</TextAction>
                  ) : (
                    <>
                      {canAddToTimeline && asset.reusableFrame ? <TextAction type="button" disabled={disabled} onClick={() => addFrames([asset.reusableFrame as AssetLibraryReusableFrame])}><ImagePlus size={14} aria-hidden="true" /> 프레임</TextAction> : null}
                      <IconButton type="button" onClick={() => moveToTrash([asset.id])} aria-label={`${asset.title} 휴지통으로 이동`}><Trash2 size={15} aria-hidden="true" /></IconButton>
                    </>
                  )}
                </CardActions>
              </AssetCard>
            );
          })}
        </AssetGrid>
      ) : (
        <EmptyState>
          {tab === 'trash' ? <ArchiveRestore size={24} aria-hidden="true" /> : tab === 'favorites' ? <Heart size={24} aria-hidden="true" /> : <Upload size={24} aria-hidden="true" />}
          <strong>{query ? '검색 결과가 없습니다' : tab === 'trash' ? '휴지통이 비어 있습니다' : tab === 'favorites' ? '즐겨찾기가 없습니다' : '아직 저장된 이미지가 없습니다'}</strong>
          <span>{query ? '다른 검색어를 입력해 보세요.' : tab === 'all' ? '이 프로젝트에서 이미지를 업로드하거나 생성하면 여기에 모입니다.' : '보관함에서 이미지를 선택해 상태를 바꿀 수 있습니다.'}</span>
        </EmptyState>
      )}

      {previewAsset ? (
        <AccessibleImagePreviewDialog
          src={previewAsset.imageUrl}
          title={previewAsset.title}
          alt={`${previewAsset.title} 전체 크기 미리보기`}
          detail={`${VERSION_LABELS[previewAsset.version]} · ${previewAsset.model || (previewAsset.kind === 'source' ? '직접 업로드' : '모델 기록 없음')}`}
          onClose={() => setPreviewAsset(null)}
        />
      ) : null}
    </Library>
  );
}

const Library = styled.section`
  display: grid;
  gap: 14px;
  min-width: 0;
  padding: 16px;
  border: 1px solid #dfe4ea;
  border-radius: 14px;
  color: #1d2939;
  background: #fff;
  button { touch-action: manipulation; }
`;

const LibraryHeader = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  h2 { margin: 3px 0 4px; font-size: clamp(16px, 2vw, 20px); line-height: 1.25; }
  p { max-width: 680px; margin: 0; color: #667085; font-size: 11px; line-height: 1.55; }
`;

const Eyebrow = styled.span`
  color: #2952cc;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .08em;
  text-transform: uppercase;
`;

const TotalCount = styled.span`
  display: grid;
  min-width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 12px;
  color: #fff;
  background: #1d2939;
  font-size: 13px;
  font-weight: 800;
`;

const LibraryControls = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  @media (max-width: 680px) { align-items: stretch; flex-direction: column; }
`;

const Tabs = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px;
  overflow-x: auto;
  border-radius: 10px;
  background: #f2f4f7;
`;

const TabButton = styled.button<{ $active: boolean }>`
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 7px 10px;
  border: 0;
  border-radius: 8px;
  color: ${({ $active }) => $active ? '#1d2939' : '#667085'};
  background: ${({ $active }) => $active ? '#fff' : 'transparent'};
  box-shadow: ${({ $active }) => $active ? '0 1px 3px rgba(16, 24, 40, .1)' : 'none'};
  font: inherit;
  font-size: 11px;
  font-weight: 750;
  white-space: nowrap;
  cursor: pointer;
  &:hover { color: #1d2939; background: ${({ $active }) => $active ? '#fff' : '#e4e7ec'}; }
  span { color: #98a2b3; font-size: 10px; }
  &:focus-visible { outline: 2px solid #668cff; outline-offset: 2px; }
`;

const SearchField = styled.label`
  display: flex;
  width: min(280px, 100%);
  min-height: 44px;
  align-items: center;
  gap: 8px;
  padding: 0 11px;
  border: 1px solid #d0d5dd;
  border-radius: 10px;
  color: #667085;
  background: #fff;
  &:focus-within { border-color: #668cff; box-shadow: 0 0 0 3px rgba(41, 82, 204, .12); }
  input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: #1d2939; font: inherit; font-size: 11px; }
`;

const SelectionBar = styled.div<{ $visible: boolean }>`
  display: flex;
  min-height: 46px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 9px;
  border: 1px solid ${({ $visible }) => $visible ? '#b2c4ff' : '#eaecf0'};
  border-radius: 10px;
  background: ${({ $visible }) => $visible ? '#f5f7ff' : '#fcfcfd'};
  @media (max-width: 680px) { align-items: stretch; flex-direction: column; }
`;

const SelectAllLabel = styled.label`
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  gap: 7px;
  color: #344054;
  font-size: 11px;
  font-weight: 750;
  cursor: pointer;
  input { width: 18px; height: 18px; accent-color: #2952cc; }
`;

const BulkActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
`;

const ActionButton = styled.button`
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 7px 10px;
  border: 1px solid #d0d5dd;
  border-radius: 8px;
  color: #344054;
  background: #fff;
  font: inherit;
  font-size: 10px;
  font-weight: 750;
  cursor: pointer;
  &:not(:disabled):hover { border-color: #98a2b3; background: #f9fafb; }
  &:disabled { cursor: not-allowed; opacity: .45; }
  &:focus-visible { outline: 2px solid #668cff; outline-offset: 2px; }
`;

const PrimaryAction = styled(ActionButton)`
  border-color: #2952cc;
  color: #fff;
  background: #2952cc;
  &:not(:disabled):hover { border-color: #1f43ad; color: #fff; background: #1f43ad; }
`;

const StorageNotice = styled.p`
  margin: 0;
  padding: 8px 10px;
  border: 1px solid #fdb022;
  border-radius: 8px;
  color: #7a2e0e;
  background: #fffaeb;
  font-size: 10px;
`;

const UndoNotice = styled.div`
  display: flex;
  min-height: 42px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid #b2c4ff;
  border-radius: 9px;
  color: #344054;
  background: #f5f7ff;
  font-size: 10px;
  button {
    min-height: 32px;
    padding: 5px 9px;
    border: 1px solid #2952cc;
    border-radius: 7px;
    color: #2952cc;
    background: #fff;
    font: inherit;
    font-weight: 800;
    cursor: pointer;
  }
  button:hover { color: #fff; background: #2952cc; }
  button:focus-visible { outline: 2px solid #668cff; outline-offset: 2px; }
`;

const LiveStatus = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  clip-path: inset(50%);
`;

const AssetGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px;
  min-width: 0;
  @media (max-width: 520px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 380px) { grid-template-columns: 1fr; }
`;

const AssetCard = styled.article<{ $selected: boolean }>`
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-width: 0;
  overflow: hidden;
  border: 1px solid ${({ $selected }) => $selected ? '#668cff' : '#dfe4ea'};
  border-radius: 12px;
  background: #fff;
  box-shadow: ${({ $selected }) => $selected ? '0 0 0 3px rgba(41, 82, 204, .12)' : '0 2px 8px rgba(16, 24, 40, .04)'};
  content-visibility: auto;
  contain-intrinsic-size: 360px;
`;

const Preview = styled.div`
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  border-bottom: 1px solid #eaecf0;
  background-color: #f8fafc;
  background-image: linear-gradient(45deg, #e8ebef 25%, transparent 25%), linear-gradient(-45deg, #e8ebef 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e8ebef 75%), linear-gradient(-45deg, transparent 75%, #e8ebef 75%);
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
  background-size: 16px 16px;
  > img { width: 100%; height: 100%; object-fit: contain; }
`;

const SelectionLabel = styled.label`
  position: absolute;
  z-index: 2;
  top: 8px;
  left: 8px;
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, .8);
  border-radius: 9px;
  background: rgba(255, 255, 255, .92);
  box-shadow: 0 2px 7px rgba(16, 24, 40, .16);
  cursor: pointer;
  input { width: 18px; height: 18px; accent-color: #2952cc; }
`;

const PreviewButton = styled.button`
  position: absolute;
  z-index: 2;
  top: 8px;
  right: 8px;
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, .8);
  border-radius: 9px;
  color: #344054;
  background: rgba(255, 255, 255, .92);
  box-shadow: 0 2px 7px rgba(16, 24, 40, .16);
  cursor: pointer;
  &:hover { color: #1d2939; background: #f9fafb; }
  &:focus-visible { outline: 2px solid #668cff; outline-offset: 2px; }
`;

const Badges = styled.div`
  position: absolute;
  z-index: 2;
  right: 7px;
  bottom: 7px;
  left: 7px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 5px;
`;

const VersionBadge = styled.span<{ $version: AssetLibraryEntry['version'] }>`
  padding: 4px 6px;
  border-radius: 999px;
  color: ${({ $version }) => $version === 'edited' ? '#5925dc' : $version === 'source' ? '#175cd3' : '#027a48'};
  background: ${({ $version }) => $version === 'edited' ? '#f4f3ff' : $version === 'source' ? '#eff8ff' : '#ecfdf3'};
  box-shadow: 0 1px 3px rgba(16, 24, 40, .12);
  font-size: 9px;
  font-weight: 800;
`;

const ReusableBadge = styled.span`
  padding: 4px 6px;
  border-radius: 999px;
  color: #fff;
  background: rgba(29, 41, 57, .88);
  font-size: 9px;
  font-weight: 750;
`;

const CardBody = styled.div`
  display: grid;
  align-content: start;
  gap: 7px;
  padding: 10px;
`;

const CardTitle = styled.strong`
  display: -webkit-box;
  overflow: hidden;
  color: #1d2939;
  font-size: 12px;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
`;

const Prompt = styled.p`
  display: -webkit-box;
  overflow: hidden;
  margin: 0;
  color: #667085;
  font-size: 9px;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  span { display: block; margin-bottom: 2px; color: #344054; font-weight: 800; }
`;

const Metadata = styled.dl`
  display: grid;
  gap: 3px;
  margin: 0;
  div { display: grid; grid-template-columns: 42px minmax(0, 1fr); gap: 5px; }
  dt { color: #98a2b3; font-size: 9px; }
  dd { overflow: hidden; margin: 0; color: #475467; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
`;

const CardActions = styled.div`
  display: flex;
  min-height: 45px;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
  padding: 6px 8px;
  border-top: 1px solid #eaecf0;
  background: #fcfcfd;
`;

const IconButton = styled.button<{ $active?: boolean }>`
  display: grid;
  width: 34px;
  min-width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid ${({ $active }) => $active ? '#fdb022' : '#d0d5dd'};
  border-radius: 8px;
  color: ${({ $active }) => $active ? '#dc6803' : '#475467'};
  background: ${({ $active }) => $active ? '#fffaeb' : '#fff'};
  cursor: pointer;
  &:hover { border-color: #98a2b3; background: #f9fafb; }
  &:focus-visible { outline: 2px solid #668cff; outline-offset: 2px; }
`;

const TextAction = styled(ActionButton)`
  min-height: 34px;
  padding: 5px 8px;
`;

const EmptyState = styled.div`
  display: grid;
  min-height: 220px;
  place-items: center;
  align-content: center;
  gap: 6px;
  padding: 24px;
  border: 1px dashed #d0d5dd;
  border-radius: 12px;
  color: #98a2b3;
  background: #fcfcfd;
  text-align: center;
  strong { color: #344054; font-size: 13px; }
  span { max-width: 360px; font-size: 10px; line-height: 1.5; }
`;
