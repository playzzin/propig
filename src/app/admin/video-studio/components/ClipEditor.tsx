import React from 'react';
import type {
    VideoStudioAspectRatio,
    VideoStudioClip,
    VideoStudioClipMode,
    VideoStudioJob,
    VideoStudioProject,
} from '@/lib/video-studio';
import * as S from './VideoStudioStyles';
import { dateLabel, jobStatusLabel, modeLabel } from '../utils';

type QuickAction = 'generate' | 'continue' | 'edit';

interface ClipEditorProps {
    selectedProject: VideoStudioProject | null;
    selectedClip: VideoStudioClip | null;
    relatedTakeClips: VideoStudioClip[];
    latestProjectJob: VideoStudioJob | null;
    previewFallbackImage: string | null;
    referenceImage: string | null;
    setReferenceImage: (url: string | null) => void;
    setSelectedClipId: (id: string | null) => void;
    clipTitle: string;
    setClipTitle: (v: string) => void;
    prompt: string;
    setPrompt: (v: string) => void;
    duration: number;
    setDuration: (v: number) => void;
    projectAspectRatio: VideoStudioAspectRatio;
    repeatCount: number;
    setRepeatCount: (v: number) => void;
    autoMergeAfterLoop: boolean;
    setAutoMergeAfterLoop: (v: boolean) => void;
    subjectLock: string;
    setSubjectLock: (v: string) => void;
    cameraNotes: string;
    setCameraNotes: (v: string) => void;
    continuityNotes: string;
    setContinuityNotes: (v: string) => void;
    handleReferenceUpload: (file: File | null) => void;
    handleSaveContinuity: () => void;
    handleClipOperation: (mode: VideoStudioClipMode) => void;
    handleRefreshLastFrame: () => void;
    handleMerge: () => void;
    mergeClipsCount: number;
    working: boolean;
    status: string;
}

const QUICK_ACTION_COPY: Record<
    QuickAction,
    {
        title: string;
        body: string;
        button: string;
    }
> = {
    generate: {
        title: '새로 시작',
        body: '첫 컷을 만듭니다.',
        button: '첫 컷 만들기',
    },
    continue: {
        title: '다음으로 진행',
        body: '선택한 컷 다음 장면을 만듭니다.',
        button: '다음 컷 만들기',
    },
    edit: {
        title: '다시 만들기',
        body: '선택한 컷의 다른 버전을 만듭니다.',
        button: '다시 만들기',
    },
};

function clampRepeatCount(value: number) {
    return Math.max(1, Math.min(12, Math.round(value)));
}

export function ClipEditor({
    selectedProject,
    selectedClip,
    relatedTakeClips,
    latestProjectJob,
    previewFallbackImage,
    referenceImage,
    setReferenceImage,
    setSelectedClipId,
    clipTitle,
    setClipTitle,
    prompt,
    setPrompt,
    duration,
    setDuration,
    projectAspectRatio,
    repeatCount,
    setRepeatCount,
    autoMergeAfterLoop,
    setAutoMergeAfterLoop,
    subjectLock,
    setSubjectLock,
    cameraNotes,
    setCameraNotes,
    continuityNotes,
    setContinuityNotes,
    handleReferenceUpload,
    handleSaveContinuity,
    handleClipOperation,
    handleRefreshLastFrame,
    handleMerge,
    mergeClipsCount,
    working,
    status,
}: ClipEditorProps) {
    const [quickAction, setQuickAction] = React.useState<QuickAction>('generate');

    React.useEffect(() => {
        if (!selectedClip && quickAction !== 'generate') {
            setQuickAction('generate');
        }
    }, [quickAction, selectedClip]);

    const actionConfig = QUICK_ACTION_COPY[quickAction];
    const loopLocked = quickAction === 'edit';
    const selectedTakeRootId = selectedClip?.takeGroupId || selectedClip?.id || null;
    const selectedTakeNumber = selectedClip
        ? selectedClip.id === selectedTakeRootId
            ? 1
            : selectedClip.takeIndex ?? null
        : null;
    const sourcePreview =
        quickAction === 'generate'
            ? referenceImage || selectedProject?.starterImageUrl || previewFallbackImage
            : selectedClip?.lastFrameUrl || previewFallbackImage;
    const actionDisabled =
        !selectedProject ||
        working ||
        ((quickAction === 'continue' || quickAction === 'edit') && !selectedClip);

    return (
        <S.Center>
            <S.Card>
                <S.Preview>
                    {selectedClip ? (
                        <video key={selectedClip.id} src={selectedClip.videoUrl} controls autoPlay loop />
                    ) : sourcePreview ? (
                        <img src={sourcePreview} alt="기준 화면" />
                    ) : (
                        <div style={{ textAlign: 'center', color: 'rgba(226,232,240,0.7)' }}>
                            <div style={{ fontSize: '1rem', color: '#f8fafc', marginBottom: 8 }}>
                                {selectedProject ? '기준 화면 없음' : '프로젝트를 먼저 만드세요'}
                            </div>
                            <div>{selectedProject ? '왼쪽에서 사진을 고르면 바로 시작할 수 있습니다.' : '프로젝트를 만든 뒤 진행하세요.'}</div>
                        </div>
                    )}
                </S.Preview>
                <S.CardBody>
                    <S.Title style={{ fontSize: '1.12rem' }}>
                        {selectedProject?.title || '미리보기'}
                    </S.Title>
                    {selectedProject?.synopsis ? <S.Copy>{selectedProject.synopsis}</S.Copy> : null}
                    <S.BadgeRow>
                        <S.Badge>{working ? status : '준비'}</S.Badge>
                        {latestProjectJob ? <S.Badge>{jobStatusLabel(latestProjectJob.status)}</S.Badge> : null}
                        {selectedClip ? <S.Badge>{modeLabel(selectedClip.mode)}</S.Badge> : null}
                        {selectedClip?.duration ? <S.Badge>{`${selectedClip.duration}s`}</S.Badge> : null}
                        {selectedClip?.lastFrameUrl ? <S.Badge>마지막 프레임</S.Badge> : null}
                        {selectedTakeNumber ? (
                            <S.Badge>{selectedTakeNumber === 1 ? '기본안' : `대체안 ${selectedTakeNumber}`}</S.Badge>
                        ) : null}
                        {selectedProject ? <S.Badge>{selectedProject.aspectRatio}</S.Badge> : null}
                        {selectedClip ? <S.Badge>{dateLabel(selectedClip.createdAt)}</S.Badge> : null}
                    </S.BadgeRow>
                </S.CardBody>
            </S.Card>

            <S.Card>
                <S.CardBody>
                    <S.Title style={{ fontSize: '1.08rem' }}>2. 만들기</S.Title>
                    <S.ActionRail>
                        <S.ActionToggle
                            type="button"
                            $active={quickAction === 'generate'}
                            onClick={() => setQuickAction('generate')}
                        >
                            <strong>{QUICK_ACTION_COPY.generate.title}</strong>
                            <span style={{ fontSize: '0.75rem', color: 'rgba(226,232,240,0.76)', lineHeight: 1.55 }}>
                                {QUICK_ACTION_COPY.generate.body}
                            </span>
                        </S.ActionToggle>
                        <S.ActionToggle
                            type="button"
                            $active={quickAction === 'continue'}
                            onClick={() => setQuickAction('continue')}
                            disabled={!selectedClip}
                        >
                            <strong>{QUICK_ACTION_COPY.continue.title}</strong>
                            <span style={{ fontSize: '0.75rem', color: 'rgba(226,232,240,0.76)', lineHeight: 1.55 }}>
                                {selectedClip ? QUICK_ACTION_COPY.continue.body : '컷을 먼저 선택하세요.'}
                            </span>
                        </S.ActionToggle>
                        <S.ActionToggle
                            type="button"
                            $active={quickAction === 'edit'}
                            onClick={() => setQuickAction('edit')}
                            disabled={!selectedClip}
                        >
                            <strong>{QUICK_ACTION_COPY.edit.title}</strong>
                            <span style={{ fontSize: '0.75rem', color: 'rgba(226,232,240,0.76)', lineHeight: 1.55 }}>
                                {selectedClip ? QUICK_ACTION_COPY.edit.body : '컷을 먼저 선택하세요.'}
                            </span>
                        </S.ActionToggle>
                    </S.ActionRail>

                    <S.StepGrid>
                        <S.StepCard>
                            <S.StepHeader>
                                <S.StepNumber>1</S.StepNumber>
                                <S.StepTitle>기준 화면</S.StepTitle>
                            </S.StepHeader>
                            {sourcePreview ? (
                                <S.StarterPreview>
                                    <img src={sourcePreview} alt="기준 화면" loading="lazy" width={92} height={92} />
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontWeight: 700, marginBottom: 6 }}>
                                            {quickAction === 'generate'
                                                ? referenceImage
                                                    ? '임시 사진 사용'
                                                    : selectedProject?.starterImageUrl
                                                        ? '시작 사진 사용'
                                                        : '현재 사진'
                                                : selectedClip
                                                    ? selectedClip.title
                                                    : '선택 필요'}
                                        </div>
                                        <S.Copy style={{ margin: 0 }}>
                                            {quickAction === 'generate'
                                                ? '이 화면으로 시작합니다.'
                                                : quickAction === 'continue'
                                                    ? '이 화면 다음 장면을 만듭니다.'
                                                    : '이 화면의 다른 버전을 만듭니다.'}
                                        </S.Copy>
                                    </div>
                                </S.StarterPreview>
                            ) : (
                                <S.Panel>
                                    <S.Copy style={{ margin: 0 }}>기준 화면이 없습니다.</S.Copy>
                                </S.Panel>
                            )}
                        </S.StepCard>

                        <S.StepCard>
                            <S.StepHeader>
                                <S.StepNumber>2</S.StepNumber>
                                <S.StepTitle>입력</S.StepTitle>
                            </S.StepHeader>
                            <S.FieldGroup>
                                <S.FieldLabel htmlFor="video-studio-clip-title">컷 이름</S.FieldLabel>
                                <S.Input
                                    id="video-studio-clip-title"
                                    name="clipTitle"
                                    autoComplete="off"
                                    value={clipTitle}
                                    onChange={(event) => setClipTitle(event.target.value)}
                                    placeholder="이름 입력"
                                />
                            </S.FieldGroup>
                            <S.FieldGroup>
                                <S.FieldLabel htmlFor="video-studio-prompt">장면 설명</S.FieldLabel>
                                <S.Textarea
                                    id="video-studio-prompt"
                                    name="prompt"
                                    value={prompt}
                                    onChange={(event) => setPrompt(event.target.value)}
                                    placeholder="장면 설명 입력"
                                    style={{ minHeight: 120 }}
                                />
                            </S.FieldGroup>
                        </S.StepCard>

                        <S.StepCard>
                            <S.StepHeader>
                                <S.StepNumber>3</S.StepNumber>
                                <S.StepTitle>옵션</S.StepTitle>
                            </S.StepHeader>
                            <S.Row>
                                <S.FieldGroup>
                                    <S.FieldLabel htmlFor="video-studio-clip-duration">길이(초)</S.FieldLabel>
                                    <S.Input
                                        id="video-studio-clip-duration"
                                        name="duration"
                                        type="number"
                                        min={1}
                                        max={15}
                                        inputMode="numeric"
                                        value={duration}
                                        onChange={(event) => setDuration(Number(event.target.value) || 6)}
                                    />
                                </S.FieldGroup>
                                <S.FieldGroup>
                                    <S.FieldLabel htmlFor="video-studio-repeat-count">반복</S.FieldLabel>
                                    <S.Input
                                        id="video-studio-repeat-count"
                                        name="repeatCount"
                                        type="number"
                                        min={1}
                                        max={12}
                                        inputMode="numeric"
                                        value={loopLocked ? 1 : repeatCount}
                                        disabled={loopLocked}
                                        onChange={(event) => {
                                            const nextValue = Number(event.target.value);
                                            if (!Number.isFinite(nextValue)) {
                                                setRepeatCount(1);
                                                setAutoMergeAfterLoop(false);
                                                return;
                                            }

                                            const normalizedValue = clampRepeatCount(nextValue);
                                            setRepeatCount(normalizedValue);
                                            if (normalizedValue <= 1) {
                                                setAutoMergeAfterLoop(false);
                                            }
                                        }}
                                    />
                                </S.FieldGroup>
                            </S.Row>
                            <S.BadgeRow>
                                <S.Badge>{selectedProject?.aspectRatio || projectAspectRatio}</S.Badge>
                                <S.Badge>{selectedProject?.resolution || '720p'}</S.Badge>
                                <S.Badge>{loopLocked ? '1컷 생성' : `${repeatCount}단계`}</S.Badge>
                            </S.BadgeRow>
                            <label
                                htmlFor="video-studio-auto-merge"
                                style={{
                                    display: 'flex',
                                    gap: 10,
                                    alignItems: 'center',
                                    color: 'rgba(248,250,252,0.88)',
                                    fontSize: '0.88rem',
                                    fontWeight: 600,
                                }}
                            >
                                <input
                                    id="video-studio-auto-merge"
                                    name="autoMergeAfterLoop"
                                    type="checkbox"
                                    checked={!loopLocked && autoMergeAfterLoop}
                                    onChange={(event) => setAutoMergeAfterLoop(event.target.checked)}
                                    disabled={loopLocked || repeatCount <= 1}
                                />
                                완료 후 자동 합치기
                            </label>
                        </S.StepCard>

                        <S.StepCard>
                            <S.StepHeader>
                                <S.StepNumber>4</S.StepNumber>
                                <S.StepTitle>실행</S.StepTitle>
                            </S.StepHeader>
                            <S.Copy style={{ margin: 0 }}>{actionConfig.body}</S.Copy>
                            <S.Button
                                type="button"
                                onClick={() => handleClipOperation(quickAction)}
                                disabled={actionDisabled}
                            >
                                {actionConfig.button}
                            </S.Button>
                            <S.BadgeRow>
                                <S.Badge>{selectedClip ? `선택: ${selectedClip.title}` : '첫 컷 준비'}</S.Badge>
                                {latestProjectJob ? <S.Badge>{latestProjectJob.title}</S.Badge> : null}
                            </S.BadgeRow>
                        </S.StepCard>
                    </S.StepGrid>

                    <S.Disclosure>
                        <S.DisclosureSummary>추가 설정</S.DisclosureSummary>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
                            <S.Panel>
                                <S.SectionLabel>사진</S.SectionLabel>
                                {quickAction === 'generate' ? (
                                    !referenceImage ? (
                                        <S.Upload>
                                            기준 사진 업로드
                                            <input
                                                type="file"
                                                hidden
                                                name="referenceImage"
                                                aria-label="생성 기준 이미지 업로드"
                                                accept="image/*"
                                                onChange={(event) => handleReferenceUpload(event.target.files?.[0] || null)}
                                            />
                                        </S.Upload>
                                    ) : (
                                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                            <img
                                                src={referenceImage}
                                                alt="임시 기준 이미지"
                                                loading="lazy"
                                                width={84}
                                                height={84}
                                                style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 14 }}
                                            />
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 700, marginBottom: 6 }}>기준 사진 적용됨</div>
                                            </div>
                                            <S.Button type="button" $ghost onClick={() => setReferenceImage(null)}>
                                                지우기
                                            </S.Button>
                                        </div>
                                    )
                                ) : (
                                    <S.Copy style={{ margin: 0 }}>현재 선택한 컷의 마지막 프레임을 사용합니다.</S.Copy>
                                )}
                            </S.Panel>

                            <S.Panel>
                                <S.SectionLabel>연결 메모</S.SectionLabel>
                                <S.FieldGroup>
                                    <S.FieldLabel htmlFor="video-studio-subject-lock">대상</S.FieldLabel>
                                    <S.Input
                                        id="video-studio-subject-lock"
                                        name="subjectLock"
                                        autoComplete="off"
                                        value={subjectLock}
                                        onChange={(event) => setSubjectLock(event.target.value)}
                                        placeholder="선택 사항"
                                    />
                                </S.FieldGroup>
                                <S.FieldGroup>
                                    <S.FieldLabel htmlFor="video-studio-camera-notes">카메라</S.FieldLabel>
                                    <S.Textarea
                                        id="video-studio-camera-notes"
                                        name="cameraNotes"
                                        value={cameraNotes}
                                        onChange={(event) => setCameraNotes(event.target.value)}
                                        placeholder="선택 사항"
                                        style={{ minHeight: 72 }}
                                    />
                                </S.FieldGroup>
                                <S.FieldGroup>
                                    <S.FieldLabel htmlFor="video-studio-continuity-notes">연속성</S.FieldLabel>
                                    <S.Textarea
                                        id="video-studio-continuity-notes"
                                        name="continuityNotes"
                                        value={continuityNotes}
                                        onChange={(event) => setContinuityNotes(event.target.value)}
                                        placeholder="선택 사항"
                                        style={{ minHeight: 84 }}
                                    />
                                </S.FieldGroup>
                                <S.Row>
                                    <S.Button type="button" $ghost onClick={handleSaveContinuity} disabled={!selectedClip || working}>
                                        저장
                                    </S.Button>
                                    <S.Button
                                        type="button"
                                        $ghost
                                        onClick={() => {
                                            setContinuityNotes(selectedClip?.continuityNotes || '');
                                            setCameraNotes(selectedClip?.cameraNotes || '');
                                            setSubjectLock(selectedClip?.subjectLock || '');
                                        }}
                                        disabled={!selectedClip || working}
                                    >
                                        불러오기
                                    </S.Button>
                                </S.Row>
                            </S.Panel>

                            {selectedClip ? (
                                <S.Panel>
                                    <S.SectionLabel>대체안</S.SectionLabel>
                                    <S.RecipeGrid>
                                        {relatedTakeClips.map((clip) => {
                                            const isRootTake = clip.id === selectedTakeRootId;
                                            const takeNumber = isRootTake ? 1 : clip.takeIndex ?? null;

                                            return (
                                                <S.RecipeCard
                                                    key={clip.id}
                                                    type="button"
                                                    onClick={() => setSelectedClipId(clip.id)}
                                                >
                                                    <S.RecipeMeta>
                                                        <S.MiniBadge>
                                                            {isRootTake ? '기본' : `대체안 ${takeNumber ?? '?'}`}
                                                        </S.MiniBadge>
                                                        {clip.id === selectedClip.id ? <S.MiniBadge>선택됨</S.MiniBadge> : null}
                                                        <S.MiniBadge>{modeLabel(clip.mode)}</S.MiniBadge>
                                                    </S.RecipeMeta>
                                                    <S.RecipeTitle>{clip.title}</S.RecipeTitle>
                                                    <S.RecipeBody>{clip.prompt}</S.RecipeBody>
                                                </S.RecipeCard>
                                            );
                                        })}
                                    </S.RecipeGrid>
                                </S.Panel>
                            ) : null}

                            <S.Panel>
                                <S.SectionLabel>도구</S.SectionLabel>
                                <S.ActionGrid>
                                    <S.ActionCard>
                                        <S.ActionTitle>컷 늘리기</S.ActionTitle>
                                        <S.Button
                                            type="button"
                                            $ghost
                                            onClick={() => handleClipOperation('extend')}
                                            disabled={!selectedClip || working}
                                        >
                                            실행
                                        </S.Button>
                                    </S.ActionCard>
                                    <S.ActionCard>
                                        <S.ActionTitle>프레임과 병합</S.ActionTitle>
                                        <S.Row>
                                            <S.Button
                                                type="button"
                                                $ghost
                                                onClick={handleRefreshLastFrame}
                                                disabled={!selectedClip || working}
                                            >
                                                프레임 저장
                                            </S.Button>
                                            <S.Button
                                                type="button"
                                                $warn
                                                onClick={handleMerge}
                                                disabled={mergeClipsCount === 0 || working}
                                            >
                                                합치기
                                            </S.Button>
                                        </S.Row>
                                    </S.ActionCard>
                                </S.ActionGrid>
                            </S.Panel>
                        </div>
                    </S.Disclosure>
                </S.CardBody>
            </S.Card>
        </S.Center>
    );
}
