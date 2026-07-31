'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  ChevronDown,
  Download,
  ImagePlus,
  Layers3,
  Play,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Upload,
  WandSparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  canReuseEmoticonAnimationFrames,
  downloadEmoticonFile,
  getEmoticonJobStallState,
  rerenderEmoticonJob,
  retryEmoticonJob,
  submitEmoticonJob,
  subscribeEmoticonJob,
  subscribeRecentEmoticonJobs,
  validateEmoticonSourceFile,
  type EmoticonSource,
} from '@/services/emoticonStudioService';
import {
  EMOTICON_EXPORT_FORMATS,
  type EmoticonBubble,
  type EmoticonExportFormat,
  type EmoticonJob,
  type EmoticonMotionPreference,
  type EmoticonOutput,
} from '@/schemas/emoticonStudio';
import * as S from './EmoticonStudio.styles';

const PROMPT_CHIPS = [
  '활짝 웃으며 “최고!”',
  '고개 숙여 “감사합니다”',
  '신나게 춤추며 “좋아!”',
  '눈물 흘리며 “미안해”',
];

const FORMAT_LABELS: Record<EmoticonExportFormat, string> = {
  webp: 'WebP',
  gif: 'GIF',
  mp4: 'MP4',
  webm: 'WebM',
  png_zip: 'PNG 묶음',
};

const MOTION_LABELS: Record<EmoticonMotionPreference, string> = {
  auto: 'AI 자동',
  stable: '안정 우선',
  dynamic: '동작·표정 변화',
};

const WORKING_STATUSES = new Set([
  'queued',
  'analyzing',
  'generating',
  'validating',
  'animating',
  'rendering',
]);

function listOutputs(job: EmoticonJob | null): EmoticonOutput[] {
  if (!job?.outputs) return [];
  return EMOTICON_EXPORT_FORMATS
    .map((format) => job.outputs?.[format])
    .filter((output): output is EmoticonOutput => Boolean(output));
}

function previewOutput(job: EmoticonJob | null): EmoticonOutput | null {
  if (!job?.outputs) return null;
  return job.outputs.webp
    || job.outputs.gif
    || job.outputs.webm
    || job.outputs.mp4
    || null;
}

function jobDate(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const toDate = (value as { toDate?: () => Date }).toDate;
  if (typeof toDate !== 'function') return '';
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(toDate.call(value));
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024 * 1024) {
    return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(sizeBytes / 1024)}KB`;
  }
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(sizeBytes / 1024 / 1024)}MB`;
}

export default function EmoticonStudioPage() {
  const { currentUser, loading: authLoading } = useAuth();
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [source, setSource] = useState<EmoticonSource | null>(null);
  const [sourcePreview, setSourcePreview] = useState('');
  const [instruction, setInstruction] = useState('');
  const [motionPreference, setMotionPreference] = useState<EmoticonMotionPreference>('auto');
  const [formats, setFormats] = useState<EmoticonExportFormat[]>(['webp']);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<EmoticonJob | null>(null);
  const [recentJobs, setRecentJobs] = useState<EmoticonJob[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBatchSubmitting, setIsBatchSubmitting] = useState(false);
  const [isRerendering, setIsRerendering] = useState(false);
  const [bubbleText, setBubbleText] = useState('');
  const [bubbleStyle, setBubbleStyle] = useState<EmoticonBubble['style']>('rounded');
  const [bubblePosition, setBubblePosition] = useState<EmoticonBubble['position']>('top');
  const [bubbleEntrance, setBubbleEntrance] = useState<EmoticonBubble['entrance']>('pop');
  const [isDragging, setIsDragging] = useState(false);
  const [formError, setFormError] = useState('');
  const [isDevelopmentPreview, setIsDevelopmentPreview] = useState(false);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const instructionRef = useRef<HTMLTextAreaElement>(null);
  const observedJobId = activeJob?.id;
  const observedJobStatus = activeJob?.status;
  const completedBubble = activeJob?.status === 'completed' ? activeJob.plan?.bubble : undefined;

  const selectJob = useCallback((jobId: string | null) => {
    setActiveJobId(jobId);
    const url = new URL(window.location.href);
    if (jobId) url.searchParams.set('job', jobId);
    else url.searchParams.delete('job');
    window.history.replaceState(null, '', url);
  }, []);

  useEffect(() => {
    const jobId = new URL(window.location.href).searchParams.get('job');
    if (jobId) setActiveJobId(jobId);
    if (
      process.env.NODE_ENV === 'development'
      && new URL(window.location.href).searchParams.get('preview') === '1'
    ) {
      setIsDevelopmentPreview(true);
    }
  }, []);

  useEffect(() => {
    if (!sourceFile) return;
    const url = URL.createObjectURL(sourceFile);
    setSourcePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [sourceFile]);

  useEffect(() => {
    if (!currentUser) {
      setRecentJobs([]);
      return;
    }
    return subscribeRecentEmoticonJobs({
      userId: currentUser.uid,
      onChange: (jobs) => {
        setRecentJobs(jobs);
      },
      onError: () => toast.error('최근 작업을 불러오지 못했습니다.'),
    });
  }, [currentUser]);

  useEffect(() => {
    if (!activeJobId && recentJobs[0]) selectJob(recentJobs[0].id);
  }, [activeJobId, recentJobs, selectJob]);

  useEffect(() => {
    if (!currentUser || !activeJobId) {
      setActiveJob(null);
      return;
    }
    return subscribeEmoticonJob({
      userId: currentUser.uid,
      jobId: activeJobId,
      onChange: (job) => {
        setActiveJob(job);
        if (job) {
          setSource({
            sourceImageUrl: job.sourceImageUrl,
            sourceStoragePath: job.sourceStoragePath,
          });
        }
      },
      onError: () => toast.error('현재 작업 상태를 불러오지 못했습니다.'),
    });
  }, [activeJobId, currentUser]);

  useEffect(() => {
    if (!completedBubble) return;
    setBubbleText(completedBubble.text);
    setBubbleStyle(completedBubble.style);
    setBubblePosition(completedBubble.position);
    setBubbleEntrance(completedBubble.entrance);
  }, [completedBubble, observedJobId, observedJobStatus]);

  useEffect(() => {
    if (!observedJobStatus || !WORKING_STATUSES.has(observedJobStatus)) return;
    setClockMs(Date.now());
    const interval = window.setInterval(() => setClockMs(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, [observedJobId, observedJobStatus]);

  const acceptSource = useCallback((file: File | undefined) => {
    if (!file) return;
    const validationError = validateEmoticonSourceFile(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setSourceFile(file);
    setSource(null);
    setFormError('');
  }, []);

  const handleSourceChange = (event: ChangeEvent<HTMLInputElement>) => {
    acceptSource(event.target.files?.[0]);
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    acceptSource(event.dataTransfer.files?.[0]);
  };

  const toggleFormat = (format: EmoticonExportFormat) => {
    setFormats((current) => {
      if (current.includes(format)) {
        return current.length === 1 ? current : current.filter((item) => item !== format);
      }
      return [...current, format];
    });
  };

  const createJob = useCallback(async (nextInstruction: string, reuseSource?: EmoticonSource) => {
    if (!currentUser) throw new Error('로그인이 필요합니다.');
    const result = await submitEmoticonJob({
      userId: currentUser.uid,
      instruction: nextInstruction,
      motionPreference,
      formats,
      sourceFile: reuseSource ? undefined : sourceFile || undefined,
      source: reuseSource || source || undefined,
    });
    setSource(result.source);
    setSourceFile(null);
    setSourcePreview(result.source.sourceImageUrl);
    selectJob(result.jobId);
    return result;
  }, [currentUser, formats, motionPreference, selectJob, source, sourceFile]);

  const handleCreate = async () => {
    if (!sourceFile && !source) {
      setFormError('캐릭터 원본 이미지를 먼저 넣어 주세요.');
      sourceInputRef.current?.focus();
      return;
    }
    if (instruction.trim().length < 2) {
      setFormError('만들고 싶은 표정이나 행동을 한 문장으로 적어 주세요.');
      instructionRef.current?.focus();
      return;
    }
    setFormError('');
    setIsSubmitting(true);
    try {
      await createJob(instruction);
      toast.success('AI 이모티콘 작업을 시작했습니다.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '작업을 시작하지 못했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetry = async () => {
    if (!currentUser || !activeJob || activeJob.mode === 'rerender') return;
    setIsSubmitting(true);
    try {
      const result = await retryEmoticonJob({
        userId: currentUser.uid,
        job: activeJob,
      });
      selectJob(result.jobId);
      toast.success(
        result.reusedPose
          ? '남아 있는 키 포즈를 재사용해 저장 단계부터 복구하고 있어요.'
          : '같은 설정으로 다시 만들기를 시작했어요.',
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '다시 만들기를 시작하지 못했어요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBubbleRerender = async () => {
    if (!currentUser || !activeJob?.plan || activeJob.status !== 'completed') return;
    if (
      activeJob.plan.action.renderMode === 'dynamic'
      && !canReuseEmoticonAnimationFrames(activeJob)
    ) {
      toast.error('기존 동작 프레임이 없어 말풍선만 수정할 수 없어요. 새 작업으로 만들어 주세요.');
      return;
    }
    const normalizedText = bubbleText.trim();
    const bubble: EmoticonBubble = {
      text: normalizedText,
      style: normalizedText ? (bubbleStyle === 'none' ? 'rounded' : bubbleStyle) : 'none',
      position: bubblePosition,
      entrance: normalizedText ? bubbleEntrance : 'none',
    };
    setIsRerendering(true);
    try {
      const result = await rerenderEmoticonJob({
        userId: currentUser.uid,
        parentJob: activeJob,
        bubble,
        formats,
      });
      selectJob(result.jobId);
      toast.success('AI를 다시 호출하지 않고 말풍선 수정본을 만들고 있어요.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '말풍선 수정본을 만들지 못했어요.');
    } finally {
      setIsRerendering(false);
    }
  };

  const createFromPreset = async (nextInstruction: string) => {
    const reusableSource = activeJob
      ? {
        sourceImageUrl: activeJob.sourceImageUrl,
        sourceStoragePath: activeJob.sourceStoragePath,
      }
      : source;
    if (!reusableSource) {
      toast.error('먼저 캐릭터 원본으로 하나를 만들어 주세요.');
      return;
    }
    setInstruction(nextInstruction);
    setIsSubmitting(true);
    try {
      await createJob(nextInstruction, reusableSource);
      toast.success('같은 캐릭터로 새 작업을 시작했습니다.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '작업을 시작하지 못했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const createRecommendedSet = async () => {
    const presets = activeJob?.plan?.suggestedPresets.slice(0, 6) || [];
    if (!presets.length || !activeJob || !currentUser) return;
    const confirmed = window.confirm(
      `추천 이모티콘 ${presets.length}개를 한꺼번에 만듭니다. 각 항목마다 OpenRouter 사용 비용이 발생할 수 있습니다. 계속할까요?`,
    );
    if (!confirmed) return;
    const reusableSource = {
      sourceImageUrl: activeJob.sourceImageUrl,
      sourceStoragePath: activeJob.sourceStoragePath,
    };
    setIsBatchSubmitting(true);
    let createdCount = 0;
    try {
      let lastJobId = '';
      for (const preset of presets) {
        const result = await submitEmoticonJob({
          userId: currentUser.uid,
          instruction: preset.instruction,
          motionPreference,
          formats,
          source: reusableSource,
        });
        lastJobId = result.jobId;
        createdCount += 1;
      }
      if (lastJobId) selectJob(lastJobId);
      toast.success(`추천 이모티콘 ${presets.length}개 작업을 시작했습니다.`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : '추천 세트를 시작하지 못했습니다.';
      toast.error(
        createdCount
          ? `${createdCount}개는 시작됐지만 나머지는 만들지 못했어요. ${reason}`
          : reason,
      );
    } finally {
      setIsBatchSubmitting(false);
    }
  };

  const output = previewOutput(activeJob);
  const outputs = useMemo(() => listOutputs(activeJob), [activeJob]);
  const stallState = activeJob
    ? getEmoticonJobStallState(activeJob, clockMs)
    : null;
  const isQueueStalled = stallState === 'queue_not_started';
  const isStalled = stallState !== null;
  const isWorking = Boolean(activeJob && WORKING_STATUSES.has(activeJob.status) && !isStalled);
  const previewSource = sourcePreview || source?.sourceImageUrl || activeJob?.sourceImageUrl || '';
  const canRerenderActiveAnimation = activeJob
    ? canReuseEmoticonAnimationFrames(activeJob)
    : false;
  const toolbarState = activeJob?.status === 'completed'
    ? 'done'
    : activeJob?.status === 'failed' || isStalled
      ? 'failed'
      : isWorking
        ? 'working'
        : 'idle';

  if (authLoading && !isDevelopmentPreview) {
    return <S.Page><S.CenterMessage>로그인 정보를 확인하고 있어요…</S.CenterMessage></S.Page>;
  }

  if (!currentUser && !isDevelopmentPreview) {
    return (
      <S.Page>
        <S.CenterMessage>
          <div>
            이모티콘 작업을 안전하게 저장하려면 로그인이 필요합니다.<br />
            <Link href="/login">로그인하러 가기</Link>
          </div>
        </S.CenterMessage>
      </S.Page>
    );
  }

  return (
    <S.Page>
      <S.Shell>
        <S.Header>
          <div>
            <S.Eyebrow><Sparkles size={14} aria-hidden="true" /> AI Emoticon Studio</S.Eyebrow>
            <S.Title>캐릭터 한 장으로, 움직이는 이모티콘 완성</S.Title>
            <S.Subtitle>
              원본을 넣고 원하는 표정·행동·말을 한 문장으로 적으세요.
              AI가 캐릭터 일관성을 확인하고 프레임과 말풍선까지 자동으로 만듭니다.
            </S.Subtitle>
          </div>
          <S.HeaderNote><ShieldCheck size={16} aria-hidden="true" /> 원본 이미지는 내 작업 공간에 보관</S.HeaderNote>
        </S.Header>

        <S.Workbench>
          <S.InputPanel aria-label="이모티콘 만들기 설정">
            <S.FieldHeader>
              <S.SectionNumber>1</S.SectionNumber>
              <label htmlFor="emoticon-source">캐릭터 원본 넣기</label>
            </S.FieldHeader>
            <S.DropZone
              $dragging={isDragging}
              $hasImage={Boolean(previewSource)}
              onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <S.HiddenInput
                ref={sourceInputRef}
                id="emoticon-source"
                name="emoticonSource"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleSourceChange}
              />
              {previewSource ? (
                <>
                  <S.SourcePreview src={previewSource} width={360} height={174} alt="선택한 캐릭터 원본" />
                  <S.ReplaceHint>눌러서 교체</S.ReplaceHint>
                </>
              ) : (
                <S.DropPrompt>
                  <Upload size={24} aria-hidden="true" />
                  <strong>이미지를 놓거나 눌러서 선택</strong>
                  <span>PNG · JPG · WebP · 최대 25MB / 정면 전신 또는 상반신 권장</span>
                </S.DropPrompt>
              )}
            </S.DropZone>

            <S.FieldGroup>
              <S.FieldHeader>
                <S.SectionNumber>2</S.SectionNumber>
                <label htmlFor="emoticon-instruction">어떻게 만들까요?</label>
              </S.FieldHeader>
              <S.PromptBox
                ref={instructionRef}
                id="emoticon-instruction"
                name="emoticonInstruction"
                value={instruction}
                maxLength={800}
                autoComplete="off"
                onChange={(event) => {
                  setInstruction(event.target.value);
                  setFormError('');
                }}
                placeholder={'예: 두 손을 흔들며 활짝 웃고 “안녕!”이라고 말해…'}
              />
              <S.Chips aria-label="빠른 예시">
                {PROMPT_CHIPS.map((chip) => (
                  <S.Chip key={chip} type="button" onClick={() => setInstruction(chip)}>
                    {chip}
                  </S.Chip>
                ))}
              </S.Chips>
            </S.FieldGroup>

            <S.Advanced>
              <S.AdvancedSummary>
                <Settings2 size={15} aria-hidden="true" />
                고급 설정
                <ChevronDown size={15} aria-hidden="true" />
              </S.AdvancedSummary>
              <S.AdvancedBody>
                <div>
                  <S.OptionLabel>움직임 방식</S.OptionLabel>
                  <S.Segmented>
                    {(['auto', 'stable', 'dynamic'] as const).map((motion) => (
                      <S.Segment
                        key={motion}
                        type="button"
                        $active={motionPreference === motion}
                        onClick={() => setMotionPreference(motion)}
                        aria-pressed={motionPreference === motion}
                      >
                        {MOTION_LABELS[motion]}
                      </S.Segment>
                    ))}
                  </S.Segmented>
                  <S.MotionHint>
                    AI 자동과 동작·표정 변화는 프레임마다 캐릭터를 새로 만들어 실제 움직임을 만듭니다.
                    안정 우선은 원본 일관성을 위한 가벼운 움직임이에요.
                  </S.MotionHint>
                </div>
                <div>
                  <S.OptionLabel>저장 파일</S.OptionLabel>
                  <S.FormatGrid>
                    {EMOTICON_EXPORT_FORMATS.map((format) => (
                      <S.FormatOption key={format} $active={formats.includes(format)}>
                        <input
                          name="emoticonFormats"
                          type="checkbox"
                          checked={formats.includes(format)}
                          onChange={() => toggleFormat(format)}
                        />
                        {FORMAT_LABELS[format]}
                      </S.FormatOption>
                    ))}
                  </S.FormatGrid>
                </div>
              </S.AdvancedBody>
            </S.Advanced>

            <S.CreateButton
              type="button"
              disabled={isSubmitting || isBatchSubmitting || isRerendering}
              onClick={handleCreate}
            >
              {isSubmitting ? <S.InlineSpinner /> : <WandSparkles size={18} aria-hidden="true" />}
              {isSubmitting ? '작업 준비 중…' : '이모티콘 만들기'}
            </S.CreateButton>
            <S.CostNote>
              AI 분석과 프레임별 이미지 생성 비용이 발생합니다. 같은 원본은 캐릭터 분석을 재사용합니다.
            </S.CostNote>
            {formError ? <S.InlineError role="alert">{formError}</S.InlineError> : null}
          </S.InputPanel>

          <S.ResultPanel aria-label="이모티콘 결과">
            <S.ResultToolbar>
              <S.ResultStatus>
                <S.StatusDot $state={toolbarState} />
                <div>
                  <strong>{activeJob?.plan?.action.title || activeJob?.instruction || '새 작업 대기'}</strong>
                  <span>{activeJob?.statusMessage || '왼쪽에서 캐릭터와 행동을 입력해 주세요'}</span>
                </div>
              </S.ResultStatus>
              {activeJob?.quality ? (
                <S.QualityBadge
                  $tone={activeJob.quality.identity >= 80
                    ? 'good'
                    : activeJob.quality.identity >= 70
                      ? 'warning'
                      : 'danger'}
                >
                  <CheckCircle2 size={13} aria-hidden="true" />
                  일관성 {Math.round(activeJob.quality.identity)}점
                </S.QualityBadge>
              ) : null}
            </S.ResultToolbar>

            <S.ResultBody>
              <S.PreviewColumn>
                {isStalled && activeJob ? (
                  <S.ErrorPreview role="alert">
                    <strong>
                      {isQueueStalled
                        ? '작업 처리가 시작되지 않았어요'
                        : '작업이 예상보다 오래 멈춰 있어요'}
                    </strong>
                    <p>
                      {isQueueStalled
                        ? '요청은 대기열에 저장됐지만 90초 동안 처리 시작 신호를 받지 못했어요. 같은 현상이 반복되면 이모티콘 작업 서버 상태를 확인해 주세요.'
                        : '기존 작업은 그대로 두고, 남아 있는 키 포즈가 있으면 저장 단계부터 안전하게 복구할 수 있어요.'}
                    </p>
                    {activeJob.mode !== 'rerender' ? (
                      <S.ErrorAction type="button" disabled={isSubmitting} onClick={handleRetry}>
                        {isSubmitting ? <S.InlineSpinner /> : <RefreshCw size={14} aria-hidden="true" />}
                        {isQueueStalled ? '같은 설정으로 새 작업 만들기' : '멈춘 작업 복구하기'}
                      </S.ErrorAction>
                    ) : null}
                  </S.ErrorPreview>
                ) : isWorking && activeJob ? (
                  <S.ProgressWrap role="status" aria-live="polite">
                    <S.WorkingOrb><Sparkles aria-hidden="true" /></S.WorkingOrb>
                    <S.ProgressText>
                      <strong>{activeJob.statusMessage}</strong>
                      <span>
                        {activeJob.status === 'queued'
                          ? '90초 안에 작업이 시작되지 않으면 복구 방법을 안내합니다.'
                          : '화면을 닫아도 작업은 계속됩니다.'}
                      </span>
                    </S.ProgressText>
                    <S.ProgressTrack aria-label={`진행률 ${activeJob.progress}%`}>
                      <S.ProgressFill $progress={activeJob.progress} />
                    </S.ProgressTrack>
                  </S.ProgressWrap>
                ) : activeJob?.status === 'failed' ? (
                  <S.ErrorPreview role="alert">
                    <strong>이번 작업을 마치지 못했어요</strong>
                    <p>{activeJob.error || '잠시 후 같은 설정으로 다시 시도해 주세요.'}</p>
                    {activeJob.mode !== 'rerender' ? (
                      <S.ErrorAction type="button" disabled={isSubmitting} onClick={handleRetry}>
                        {isSubmitting ? <S.InlineSpinner /> : <RefreshCw size={14} aria-hidden="true" />}
                        같은 설정으로 다시 만들기
                      </S.ErrorAction>
                    ) : null}
                  </S.ErrorPreview>
                ) : output ? (
                  <>
                    <S.Checkerboard>
                      {output.contentType.startsWith('video/') ? (
                        <video
                          src={output.url}
                          width={360}
                          height={360}
                          autoPlay
                          loop
                          muted
                          playsInline
                          controls
                          aria-label="완성된 움직이는 이모티콘"
                        />
                      ) : (
                        <img src={output.url} width={360} height={360} alt="완성된 움직이는 이모티콘" />
                      )}
                    </S.Checkerboard>
                    <S.OutputActions>
                      {outputs.map((item) => (
                        <S.OutputButton
                          key={item.format}
                          type="button"
                          onClick={() => downloadEmoticonFile(item.url, item.fileName)}
                        >
                          <Download size={14} aria-hidden="true" />
                          {FORMAT_LABELS[item.format]} 받기 · {formatFileSize(item.sizeBytes)}
                        </S.OutputButton>
                      ))}
                    </S.OutputActions>
                    {activeJob?.specReport ? (
                      <S.SpecLine>
                        360×360 · {activeJob.specReport.frameCount}프레임 ·{' '}
                        {(activeJob.specReport.durationMs / 1000).toFixed(1)}초 · 반복 재생
                      </S.SpecLine>
                    ) : null}
                  </>
                ) : (
                  <S.EmptyPreview>
                    <ImagePlus aria-hidden="true" />
                    <strong>완성된 이모티콘이 여기에 보여요</strong>
                    <p>
                      표정부터 춤·달리기까지 AI가 프레임마다 캐릭터를 바꾸고, 배경·겹침·루프 연결을 확인합니다.
                    </p>
                  </S.EmptyPreview>
                )}
              </S.PreviewColumn>

              <S.Inspector>
                <S.InspectorTitle>이 캐릭터의 다음 표정</S.InspectorTitle>
                <S.InspectorDesc>
                  첫 결과가 완성되면 AI가 캐릭터에 어울리는 프리셋을 제안합니다.
                </S.InspectorDesc>
                {activeJob?.quality ? (
                  <S.QualityPanel>
                    <header>
                      <strong>AI 품질 검사</strong>
                      <span>{Math.round(activeJob.quality.overall)}점</span>
                    </header>
                    <S.QualityMetrics>
                      <span>원본 일치 <strong>{Math.round(activeJob.quality.identity)}</strong></span>
                      <span>행동 전달 <strong>{Math.round(activeJob.quality.actionClarity)}</strong></span>
                      <span>스타일 <strong>{Math.round(activeJob.quality.styleConsistency)}</strong></span>
                    </S.QualityMetrics>
                    {activeJob.quality.issues.length ? (
                      <ul>
                        {activeJob.quality.issues.slice(0, 2).map((issue, index) => (
                          <li key={`${index}-${issue}`}>{issue}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>눈에 띄는 일관성 문제를 찾지 못했어요.</p>
                    )}
                  </S.QualityPanel>
                ) : null}
                <S.PresetList>
                  {activeJob?.plan?.suggestedPresets.slice(0, 8).map((preset) => (
                    <S.PresetButton
                      key={`${preset.title}-${preset.instruction}`}
                      type="button"
                      disabled={isSubmitting || isBatchSubmitting}
                      onClick={() => createFromPreset(preset.instruction)}
                    >
                      <strong>{preset.title}</strong>
                      <span>{preset.instruction}</span>
                      <Play size={14} fill="currentColor" aria-hidden="true" />
                    </S.PresetButton>
                  )) || (
                    <>
                      {['반가워!', '고마워요', '잠시만요', '좋아요'].map((title) => (
                        <S.PresetButton key={title} type="button" disabled>
                          <strong>{title}</strong>
                          <span>첫 결과 후 자동 추천</span>
                          <Play size={14} aria-hidden="true" />
                        </S.PresetButton>
                      ))}
                    </>
                  )}
                </S.PresetList>
                {activeJob?.plan?.suggestedPresets.length ? (
                  <S.BatchButton
                    type="button"
                    disabled={isSubmitting || isBatchSubmitting}
                    onClick={createRecommendedSet}
                  >
                    {isBatchSubmitting ? <S.InlineSpinner /> : <Layers3 size={15} aria-hidden="true" />}
                    추천 6종 한꺼번에 만들기
                  </S.BatchButton>
                ) : null}
                {activeJob?.status === 'completed' && activeJob.plan ? (
                  <S.BubbleEditor>
                    <summary>
                      말풍선만 간편 수정
                      <ChevronDown size={14} aria-hidden="true" />
                    </summary>
                    <S.BubbleEditorBody>
                      <label>
                        문구
                        <input
                          value={bubbleText}
                          name="bubbleText"
                          maxLength={36}
                          autoComplete="off"
                          placeholder="예: 고마워! …"
                          onChange={(event) => setBubbleText(event.target.value)}
                        />
                      </label>
                      <S.BubbleFieldGrid>
                        <label>
                          모양
                          <select
                            value={bubbleStyle === 'none' ? 'rounded' : bubbleStyle}
                            name="bubbleStyle"
                            onChange={(event) => setBubbleStyle(event.target.value as EmoticonBubble['style'])}
                          >
                            <option value="rounded">둥근 말풍선</option>
                            <option value="shout">외치는 모양</option>
                            <option value="thought">생각 구름</option>
                            <option value="whisper">속삭임</option>
                          </select>
                        </label>
                        <label>
                          위치
                          <select
                            value={bubblePosition}
                            name="bubblePosition"
                            onChange={(event) => setBubblePosition(event.target.value as EmoticonBubble['position'])}
                          >
                            <option value="top">위</option>
                            <option value="bottom">아래</option>
                            <option value="left">왼쪽</option>
                            <option value="right">오른쪽</option>
                          </select>
                        </label>
                        <label>
                          등장 효과
                          <select
                            value={bubbleEntrance}
                            name="bubbleEntrance"
                            onChange={(event) => setBubbleEntrance(event.target.value as EmoticonBubble['entrance'])}
                          >
                            <option value="pop">톡 튀기</option>
                            <option value="fade">서서히</option>
                            <option value="shake">흔들기</option>
                            <option value="none">효과 없음</option>
                          </select>
                        </label>
                      </S.BubbleFieldGrid>
                      <S.RerenderButton
                        type="button"
                        disabled={isRerendering || (
                          activeJob.plan.action.renderMode === 'dynamic'
                          && !canRerenderActiveAnimation
                        )}
                        onClick={handleBubbleRerender}
                      >
                        {isRerendering ? <S.InlineSpinner /> : <RefreshCw size={14} aria-hidden="true" />}
                        {activeJob.plan.action.renderMode === 'dynamic' && !canRerenderActiveAnimation
                          ? '기존 동작 프레임이 없어 새 작업 필요'
                          : 'AI 비용 없이 말풍선만 수정'}
                      </S.RerenderButton>
                    </S.BubbleEditorBody>
                  </S.BubbleEditor>
                ) : null}
                {activeJob?.analysisReused ? (
                  <S.ReuseNotice>검증된 캐릭터 분석을 재사용해 분석 비용을 줄인 작업입니다.</S.ReuseNotice>
                ) : null}
                {activeJob?.motionFallbackReason ? (
                  <S.FallbackNotice>
                    동적 포즈 변화가 약해 재시도 중입니다. 정지 그림을 움직인 결과로 대신 저장하지 않습니다.
                  </S.FallbackNotice>
                ) : null}
              </S.Inspector>
            </S.ResultBody>
          </S.ResultPanel>
        </S.Workbench>

        <S.History>
          <S.HistoryHeader>
            <h2>최근 작업</h2>
            <span>{recentJobs.length ? `${recentJobs.length}개 저장됨` : '아직 작업이 없습니다'}</span>
          </S.HistoryHeader>
          <S.HistoryRail aria-label="최근 이모티콘 작업">
            {recentJobs.map((job) => (
              <S.HistoryItem
                key={job.id}
                type="button"
                $active={job.id === activeJobId}
                onClick={() => selectJob(job.id)}
                aria-pressed={job.id === activeJobId}
              >
                <S.HistoryThumb>
                  {job.keyPoseUrl || job.sourceImageUrl ? (
                    <img
                      src={job.keyPoseUrl || job.sourceImageUrl}
                      width={52}
                      height={52}
                      loading="lazy"
                      alt=""
                    />
                  ) : (
                    <ImagePlus size={20} aria-hidden="true" />
                  )}
                </S.HistoryThumb>
                <S.HistoryMeta>
                  <strong>{job.plan?.action.title || job.instruction}</strong>
                  <span>
                    {job.status === 'completed' ? '완성' : job.statusMessage}
                    {jobDate(job.createdAt) ? ` · ${jobDate(job.createdAt)}` : ''}
                  </span>
                </S.HistoryMeta>
              </S.HistoryItem>
            ))}
          </S.HistoryRail>
        </S.History>
      </S.Shell>
    </S.Page>
  );
}
