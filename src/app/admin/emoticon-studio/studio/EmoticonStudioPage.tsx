'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertTriangle, Check, History, Plus, ShieldAlert, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { EmoticonJob } from '@/schemas/emoticonStudio';
import {
  downloadEmoticonFile,
  hasEmoticonSubjectGenerationMismatch,
} from '@/services/emoticonStudioService';
import { AdvancedProjectTools } from './AdvancedProjectTools';
import type { ManualStartInput } from './StudioStartHub';
import { StudioUsageGuide } from './StudioUsageGuide';
import { useEmoticonStudio } from './useEmoticonStudio';
import * as S from './StudioShell.styles';

const StudioStartHub = dynamic(
  () => import('./StudioStartHub').then((module) => module.StudioStartHub),
  { loading: () => <DeferredPanel label="시작 화면을 준비하는 중입니다." /> },
);

const CharacterSetupStep = dynamic(
  () => import('./CharacterSetupStep').then((module) => module.CharacterSetupStep),
  { loading: () => <DeferredPanel label="캐릭터 준비 화면을 불러오는 중입니다." /> },
);

const CreationComposer = dynamic(
  () => import('./CreationComposer').then((module) => module.CreationComposer),
  { loading: () => <DeferredPanel label="제작 도구를 불러오는 중입니다." /> },
);

const CreationResultCard = dynamic(
  () => import('./CreationResultCard').then((module) => module.CreationResultCard),
  { loading: () => <DeferredPanel label="제작 결과를 복원하는 중입니다." compact /> },
);

const ManualAnimationWorkspace = dynamic(
  () => import('./ManualAnimationWorkspace').then((module) => module.ManualAnimationWorkspace),
  { loading: () => <DeferredPanel label="수동 프레임 작업공간을 불러오는 중입니다." /> },
);

const ProfessionalEditor = dynamic(
  () => import('./ProfessionalEditor').then((module) => module.ProfessionalEditor),
  {
    ssr: false,
    loading: () => <S.Notice $tone="info" style={{ position: 'fixed', zIndex: 1900, right: 20, bottom: 20 }}><S.Spinner /><span>전문 편집기를 여는 중입니다.</span></S.Notice>,
  },
);

const ResultHistoryComparePanel = dynamic(
  () => import('./ResultHistoryComparePanel'),
  { ssr: false },
);

const EmoticonJobHistoryPanel = dynamic(
  () => import('../EmoticonJobHistoryPanel').then((module) => module.EmoticonJobHistoryPanel),
  { ssr: false },
);

const STUDIO_PHASES = ['준비', '제작', '검토·내보내기'] as const;

const WORKING_JOB_STATUSES = new Set<EmoticonJob['status']>([
  'queued',
  'analyzing',
  'generating',
  'validating',
  'animating',
  'rendering',
]);

function DeferredPanel({ label, compact = false }: { label: string; compact?: boolean }) {
  return (
    <S.Card
      role="status"
      aria-live="polite"
      style={{
        width: 'min(960px, 100%)',
        minHeight: compact ? 110 : 180,
        margin: '0 auto',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <S.Notice $tone="info"><S.Spinner /><span>{label}</span></S.Notice>
    </S.Card>
  );
}

function FullState({ title, message, action }: { title: string; message: string; action?: React.ReactNode }) {
  return (
    <S.StudioRoot>
      <S.Workspace>
        <S.Card style={{ maxWidth: 620, margin: '80px auto' }}>
          <S.Notice $tone="info"><Sparkles size={18} /><span><strong>{title}</strong><br />{message}</span></S.Notice>
          {action}
        </S.Card>
      </S.Workspace>
    </S.StudioRoot>
  );
}

export default function EmoticonStudioPage() {
  const studio = useEmoticonStudio();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [editorTarget, setEditorTarget] = useState<{ job: EmoticonJob; frameIndex?: number } | null>(null);
  const [draftPrompt] = useState('');
  const [showQuickStart, setShowQuickStart] = useState(false);
  const [isJobHistoryOpen, setIsJobHistoryOpen] = useState(false);
  const [isResultHistoryOpen, setIsResultHistoryOpen] = useState(false);
  const [manualSeed, setManualSeed] = useState<ManualStartInput | null>(null);

  const activeCompletedResultJobs = studio.activeTurnJobs.filter((job) => (
    job.status === 'completed'
    && !hasEmoticonSubjectGenerationMismatch(job)
    && Boolean(job.outputs && Object.keys(job.outputs).length)
  ));
  const hasSubjectGenerationMismatch = studio.activeTurnJobs.some(hasEmoticonSubjectGenerationMismatch);
  const hasWorkingCreation = studio.activeTurnJobs.some((job) => WORKING_JOB_STATUSES.has(job.status))
    || studio.activeTurn?.status === 'draft'
    || studio.activeTurn?.status === 'working';
  const needsCreationRetry = !hasWorkingCreation
    && activeCompletedResultJobs.length === 0
    && (
      hasSubjectGenerationMismatch
      || studio.activeTurn?.status === 'failed'
      || studio.activeTurn?.status === 'cancelled'
    );
  const isManualWorkflow = studio.project?.v2?.workflowMode === 'manual';
  const steps = STUDIO_PHASES;
  const currentStep = isManualWorkflow
    ? hasWorkingCreation ? 1 : activeCompletedResultJobs.length > 0 ? 2 : 1
    : !studio.approvedProfile ? 0 : hasWorkingCreation ? 1 : activeCompletedResultJobs.length > 0 ? 2 : 1;
  const stageStatus = isManualWorkflow
    ? currentStep === 2
      ? `검토 · 현재 요청 ${activeCompletedResultJobs.length}개 제작 완료`
      : hasWorkingCreation ? '제작 · 결과를 렌더링하고 있어요' : '제작 · 프레임을 구성하세요'
    : currentStep === 0
    ? '준비 · 캐릭터 특징을 확인하세요'
    : currentStep === 2
        ? `검토 · 현재 요청 ${activeCompletedResultJobs.length}개 제작 완료`
        : hasWorkingCreation
          ? '제작 · 만들고 있어요'
          : needsCreationRetry ? '제작 · 다시 시도 필요' : '제작 · 원하는 장면을 말해 주세요';
  const stageTone = currentStep === 2 ? 'success' : hasWorkingCreation ? 'working' : needsCreationRetry ? 'danger' : 'default';

  const effectiveSelectedJobId = selectedJobId || studio.activeJob?.id || null;
  const selectedJob = useMemo(() => studio.recentJobs.find((job) => job.id === effectiveSelectedJobId) || studio.activeJob, [effectiveSelectedJobId, studio.activeJob, studio.recentJobs]);
  const selectedItem = useMemo(() => selectedJob?.projectItemId
    ? studio.project?.items.find((item) => item.id === selectedJob.projectItemId) || null
    : null, [selectedJob, studio.project?.items]);
  if (studio.access.isCheckingAdmin) {
    return <FullState title="스튜디오를 준비하고 있어요" message="로그인과 관리자 권한을 안전하게 확인하는 중입니다." />;
  }
  if (!studio.access.currentUser) {
    return <FullState title="로그인이 필요합니다" message="이모티콘 프로젝트와 원본 이미지는 로그인한 사용자에게만 보입니다." />;
  }
  if (!studio.access.isAdmin) {
    return <FullState title="접근 권한이 없습니다" message="이 기능은 관리자 계정에서만 사용할 수 있습니다." action={<S.Button type="button" $variant="secondary" onClick={() => void studio.access.refetch()}>권한 다시 확인</S.Button>} />;
  }
  if (!studio.projectsReady) {
    return <FullState title="프로젝트를 불러오는 중이에요" message="저장된 캐릭터와 작업 기록을 복원하고 있습니다." />;
  }
  if (!studio.project && studio.error) {
    return <FullState title="프로젝트를 불러오지 못했어요" message={studio.error} action={<S.Button type="button" $variant="secondary" onClick={() => studio.setError(null)}>새 프로젝트 화면 열기</S.Button>} />;
  }
  if (!studio.project || showQuickStart) {
    return (
      <StudioStartHub
        pending={studio.pending}
        error={studio.error}
        onClearError={() => studio.setError(null)}
        hasProjects={studio.projects.length > 0}
        onOpenProjects={() => {
          if (studio.project) setShowQuickStart(false);
          else if (studio.projects[0]) studio.setActiveProjectId(studio.projects[0].id);
        }}
        onStartAi={async ({ files, title, platform, outputType, frameCount }) => {
          const created = await studio.createProject({
            files,
            title,
            analyze: true,
            platform,
            outputType,
            frameCount,
            workflowMode: 'ai',
          });
          if (created) setShowQuickStart(false);
          return created;
        }}
        onStartManual={async (seed) => {
          const source = seed.spriteSheet || seed.files[0];
          if (!source) return false;
          const created = await studio.createProject({
            files: [source],
            title: seed.title,
            analyze: false,
            platform: seed.platform,
            outputType: 'animated',
            frameCount: seed.files.length || 8,
            workflowMode: 'manual',
          });
          if (created) {
            setManualSeed(seed);
            setShowQuickStart(false);
          }
          return created;
        }}
      />
    );
  }

  return (
    <S.StudioRoot>
      <S.TopBar>
        <S.Brand>
          <span><Sparkles size={18} /></span>
          <div><strong>{studio.project.title}</strong><S.StageStatus aria-live="polite" $tone={stageTone}>{stageStatus}</S.StageStatus></div>
        </S.Brand>
        <S.StepNav aria-label="제작 단계">
          {steps.map((step, index) => <li key={step} aria-current={currentStep === index ? 'step' : undefined} data-active={currentStep === index} data-complete={currentStep > index}><span>{currentStep > index ? <Check size={12} /> : index + 1}</span>{step}</li>)}
        </S.StepNav>
        <S.TopActions>
          <S.ProjectSelect aria-label="프로젝트 선택" value={studio.project.id} onChange={(event) => studio.setActiveProjectId(event.target.value)}>
            {studio.projects.map((project, index, projects) => {
              const duplicateCount = projects.filter((candidate) => candidate.title === project.title).length;
              const duplicateOrder = projects.slice(0, index + 1).filter((candidate) => candidate.title === project.title).length;
              const platformLabel = project.platform === 'kakao' ? '카카오' : project.platform === 'line' ? 'LINE' : project.platform;
              const typeLabel = project.emoticonType === 'animated' ? '움짤' : '정지';
              return <option key={project.id} value={project.id}>{project.title}{duplicateCount > 1 ? ` (${duplicateOrder})` : ''} · {platformLabel} {typeLabel}</option>;
            })}
          </S.ProjectSelect>
          <S.Button type="button" $variant="quiet" disabled={studio.pending} onClick={() => setIsJobHistoryOpen(true)} aria-label="전체 작업 이력" title="전체 작업 이력"><History size={17} /></S.Button>
          <S.Button type="button" $variant="quiet" disabled={studio.pending} onClick={() => { studio.setError(null); setShowQuickStart(true); }} aria-label="새 프로젝트 시작" title="새 프로젝트 시작"><Plus size={17} /></S.Button>
        </S.TopActions>
        <S.MobileProgress role="progressbar" aria-label={`제작 단계 ${currentStep + 1}/3 · ${steps[currentStep]}`} aria-valuenow={currentStep + 1} aria-valuemin={1} aria-valuemax={3} style={{ '--step-progress': `${((currentStep + 1) / steps.length) * 100}%` } as React.CSSProperties}><span /></S.MobileProgress>
      </S.TopBar>

      {studio.error ? (
        <div style={{ width: 'min(1120px, calc(100% - 24px))', margin: '12px auto 0' }}>
          <S.Notice $tone="danger" role="alert"><AlertTriangle size={16} /><span style={{ flex: 1 }}>{studio.error}</span><S.Button type="button" $variant="quiet" onClick={() => studio.setError(null)}>닫기</S.Button></S.Notice>
        </div>
      ) : null}

      <StudioUsageGuide currentStep={currentStep} manual={isManualWorkflow} />

      {!studio.approvedProfile && !isManualWorkflow ? (
        <CharacterSetupStep
          key={`${studio.project.id}:${studio.analysisJob?.id || 'saved'}:${studio.analysisJob?.status || 'idle'}`}
          project={studio.project}
          analysisJob={studio.analysisJob}
          pending={studio.pending}
          resourceMode={studio.resourceMode}
          rightsAttested={studio.rightsAttested}
          onResourceModeChange={studio.setResourceMode}
          onRightsAttestedChange={studio.setRightsAttested}
          onAddReferences={studio.addReferences}
          onRemoveReference={studio.removeReference}
          onReferenceRoleChange={studio.updateReferenceRole}
          onAnalyze={studio.analyzeCharacter}
          onApprove={studio.approveCharacter}
        />
      ) : (
        <S.Workspace>
          {!studio.turns.length && !isManualWorkflow ? (
            <S.Intro>
              <span>제작 · 장면 요청</span>
              <h1>{studio.project.character.name}에게 어떤 동작을 시킬까요?</h1>
              <p>GPT에게 말하듯 적으세요. 행동, 프레임, 말풍선 순서를 해석하고 캐릭터 DNA와 플랫폼 규격을 자동으로 결합합니다.</p>
            </S.Intro>
          ) : null}
          {!isManualWorkflow ? (
            <CreationComposer
              key={studio.project.id}
              project={studio.project}
              pending={studio.pending}
              ready={studio.turnsReady}
              hasTurns={studio.turns.length > 0}
              canReconfigure={studio.canReconfigure}
              initialPrompt={draftPrompt}
              onSubmit={studio.startCreation}
            />
          ) : null}
          <div>
            {studio.turns.map((turn) => {
              const jobs = turn.variants.flatMap((variant) => {
                const job = studio.recentJobs.find((candidate) => candidate.id === variant.jobId);
                return job ? [job] : [];
              });
              return (
                <CreationResultCard
                  key={turn.id}
                  turn={turn}
                  jobs={jobs}
                  pending={studio.pending}
                  selectedJobId={effectiveSelectedJobId}
                  onSelectJob={(job) => { setSelectedJobId(job.id); studio.setActiveTurnId(turn.id); }}
                  onCancel={studio.cancelJob}
                  onRetry={studio.retryJob}
                  onBuildAnimation={studio.createAnimationFromStaticJobs}
                  onOpenEditor={(job, frameIndex) => { setSelectedJobId(job.id); setEditorTarget({ job, frameIndex }); }}
                  onOpenSettings={() => {
                    const prompt = document.getElementById('emoticon-v2-creation-prompt');
                    prompt?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
                    window.setTimeout(() => prompt?.focus({ preventScroll: true }), 180);
                  }}
                  onDownload={async (job, format) => {
                    const output = job.outputs?.[format];
                    if (output) await downloadEmoticonFile(output.url, output.fileName);
                  }}
                />
              );
            })}
          </div>
          {isManualWorkflow ? (
            <ManualAnimationWorkspace
              key={studio.project.id}
              project={studio.project}
              seed={manualSeed}
              pending={studio.pending}
              onSubmit={studio.startManualImport}
              onSeedConsumed={() => setManualSeed(null)}
            />
          ) : null}
          <AdvancedProjectTools
            project={studio.project}
            pending={studio.pending}
            onExport={studio.exportProject}
            onImport={studio.importProjectJson}
            onOpenHistory={() => selectedItem ? setIsResultHistoryOpen(true) : setIsJobHistoryOpen(true)}
            onDelete={studio.deleteProject}
          />
          <S.Notice $tone="info" style={{ width: 'min(860px, 100%)', margin: '14px auto 0' }}>
            <ShieldAlert size={16} /><span>카카오·LINE 기술 규격은 자동 검사하지만 플랫폼 심사 승인까지 보장하지는 않습니다. 카카오 AI 생성물은 제출 정책을 직접 확인하세요.</span>
          </S.Notice>
        </S.Workspace>
      )}

      {editorTarget && studio.project && studio.access.currentUser ? (
        <ProfessionalEditor
          userId={studio.access.currentUser.uid}
          project={studio.project}
          item={studio.project.items.find((item) => item.id === editorTarget.job.projectItemId) || selectedItem}
          job={editorTarget.job}
          initialFrameIndex={editorTarget.frameIndex}
          recentJobs={studio.recentJobs}
          pending={studio.pending}
          onClose={() => setEditorTarget(null)}
          onQueued={(jobId) => {
            setEditorTarget(null);
            setSelectedJobId(jobId);
            void studio.connectEditedJob(editorTarget.job.id, jobId);
            toast.success('편집본을 새 버전으로 만들고 있습니다.');
          }}
        />
      ) : null}
      {isResultHistoryOpen && studio.access.currentUser && studio.project && selectedItem ? (
        <ResultHistoryComparePanel
          userId={studio.access.currentUser.uid}
          projectId={studio.project.id}
          projectItemId={selectedItem.id}
          activeJobId={effectiveSelectedJobId}
          onClose={() => setIsResultHistoryOpen(false)}
          onSelect={(job) => setSelectedJobId(job.id)}
          onUseAsRepresentative={studio.setRepresentativeJob}
        />
      ) : null}
      {isJobHistoryOpen && studio.access.currentUser ? (
        <EmoticonJobHistoryPanel
          userId={studio.access.currentUser.uid}
          activeJobId={effectiveSelectedJobId}
          onClose={() => setIsJobHistoryOpen(false)}
          onSelect={(jobId) => {
            setSelectedJobId(jobId);
            setIsJobHistoryOpen(false);
          }}
          onDeleted={(jobId) => {
            if (jobId === effectiveSelectedJobId) setSelectedJobId(null);
          }}
        />
      ) : null}
    </S.StudioRoot>
  );
}
