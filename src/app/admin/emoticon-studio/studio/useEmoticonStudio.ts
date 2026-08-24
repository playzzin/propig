'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import type {
  EmoticonProject,
  EmoticonProjectItem,
  EmoticonProjectPlatform,
  EmoticonProjectReferenceRole,
  EmoticonProjectType,
} from '@/schemas/emoticonProject';
import {
  EMOTICON_BUBBLE_APPEARANCE_DEFAULTS,
  type EmoticonExportFormat,
  type EmoticonJob,
  type EmoticonResourceMode,
} from '@/schemas/emoticonStudio';
import type {
  EmoticonCharacterAnalysisOverride,
  EmoticonAnimationTimeline,
  EmoticonCharacterIdentityLock,
  EmoticonCharacterProfileVersion,
  EmoticonCreationTurn,
  EmoticonCostSnapshot,
  EmoticonCreationIntent,
} from '@/schemas/emoticonStudioV2';
import {
  applyEmoticonCharacterProfile,
  createPortableEmoticonProject,
  createProjectItems,
  createEmoticonProject,
  getEmoticonProject,
  importEmoticonProject,
  linkCompletedEmoticonProjectJob,
  replaceEmoticonProjectItems,
  subscribeEmoticonProjectItems,
  subscribeEmoticonProjects,
  updateEmoticonProject,
  updateEmoticonProjectItem,
} from '@/services/emoticonProjectService';
import {
  createEmoticonCharacterProfileJob,
  getEmoticonJobFromServer,
  hasEmoticonSubjectGenerationMismatch,
  recoverStalledEmoticonJob,
  requestEmoticonJobCancellation,
  retryEmoticonJob,
  submitEmoticonJob,
  submitEmoticonFrameImportJob,
  subscribeEmoticonJobs,
  subscribeRecentEmoticonJobs,
  uploadEmoticonSource,
  validateEmoticonSourceFile,
} from '@/services/emoticonStudioService';
import {
  saveApprovedCharacterProfileVersion,
  createEmoticonCreationTurn,
  failCreationTurn,
  linkCreationTurnJobs,
  replaceCreationTurnVariantJob,
  saveEmoticonAnimationTimeline,
  settleCreationTurnFromJobs,
  subscribeEmoticonAnimationTimeline,
  subscribeCharacterProfileVersions,
  subscribeCreationTurns,
} from '@/services/emoticonStudioV2Service';
import { toEmoticonOutputProfile } from '@/lib/emoticonPlatformProfiles';
import { resolveEmoticonPlatformProfile } from '@/services/emoticonPlatformPolicyService';
import { normalizeEmoticonAnimationMotion } from '@/lib/emoticonCreationIntent';
import { isEmoticonJobStalled } from '@/lib/emoticonJobHealth';
import {
  deleteEmoticonProjectSafely,
  type EmoticonProjectDeletionMode,
} from '@/services/emoticonProjectDeletionService';
import { buildEmoticonSequenceFramePrompt } from '@/lib/emoticonSubjectPrompt';
import {
  buildEmoticonAnimationTimelineFromJob,
  getEmoticonAnimationTimelineContentSignature,
} from '@/lib/emoticonAnimationTimeline';
import type { StaticAnimationBuildRequest } from './StaticAnimationBuilder';
import type { ManualFrameImportSubmit } from '../ManualFrameImportPanel';

const ACTIVE_PROJECT_KEY = 'propig-emoticon-studio-v2-active-project';

function defaultReferenceRole(index: number): EmoticonProjectReferenceRole {
  return (['front', 'side', 'back', 'expression'] as const)[index] || 'other';
}

function createProjectTitle(platform: EmoticonProjectPlatform, type: EmoticonProjectType): string {
  const now = new Date();
  const date = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const platformLabel = platform === 'kakao' ? '카카오' : platform === 'line' ? 'LINE' : platform.toUpperCase();
  return `${platformLabel} ${type === 'animated' ? '움짤' : '정지'} · ${date} ${time}`;
}

function referencesMatch(project: EmoticonProject, job: EmoticonJob): boolean {
  const projectPaths = project.character.references.map((reference) => reference.sourceStoragePath);
  const jobPaths = [job.sourceStoragePath, ...job.referenceImages.map((reference) => reference.sourceStoragePath)];
  return projectPaths.length === jobPaths.length
    && projectPaths[0] === jobPaths[0]
    && [...projectPaths.slice(1)].sort().every((path, index) => path === [...jobPaths.slice(1)].sort()[index]);
}

function buildGenerationInstruction(request: string, identityGuide: string): string {
  const marker = '[사용자 확정 프레임 동작표]';
  const markerIndex = request.indexOf(marker);
  if (markerIndex < 0) {
    return `${request.slice(0, 400)}\n\n[확정 캐릭터 DNA]\n${identityGuide}`.slice(0, 800);
  }

  const subject = request.slice(0, markerIndex).trim().slice(0, 150);
  const rawLines = request.slice(markerIndex + marker.length).split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\d{2}\./.test(line));
  const perFrameBudget = Math.max(18, Math.floor(430 / Math.max(1, rawLines.length)));
  const compactStoryboard = rawLines
    .map((line) => line.slice(0, perFrameBudget))
    .join('\n');
  return [
    subject,
    marker,
    compactStoryboard,
    '번호 순서를 프레임에 그대로 적용한다.',
    '[확정 캐릭터 DNA]',
    identityGuide.slice(0, 170),
  ].filter(Boolean).join('\n').slice(0, 800);
}

export function useEmoticonStudio() {
  const access = useAdminAccess();
  const { currentUser, isAdmin } = access;
  const [projects, setProjects] = useState<EmoticonProject[]>([]);
  const [projectsReady, setProjectsReady] = useState(false);
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(null);
  const [itemsState, setItemsState] = useState<{ projectId: string | null; value: EmoticonProjectItem[] }>({ projectId: null, value: [] });
  const [recentJobFeed, setRecentJobFeed] = useState<EmoticonJob[]>([]);
  const [trackedJobs, setTrackedJobs] = useState<EmoticonJob[]>([]);
  const [profileVersionsState, setProfileVersionsState] = useState<{ projectId: string | null; value: EmoticonCharacterProfileVersion[] }>({ projectId: null, value: [] });
  const [turnsState, setTurnsState] = useState<{ projectId: string | null; value: EmoticonCreationTurn[] }>({ projectId: null, value: [] });
  const [timelineState, setTimelineState] = useState<{
    projectId: string | null;
    timelineId: string | null;
    value: EmoticonAnimationTimeline | null;
    ready: boolean;
  }>({ projectId: null, timelineId: null, value: null, ready: false });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resourceMode, setResourceMode] = useState<EmoticonResourceMode>('efficient');
  const [rightsAttested, setRightsAttested] = useState(false);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const settledJobsRef = useRef(new Set<string>());
  const linkedJobsRef = useRef(new Set<string>());
  const timelineSyncKeysRef = useRef(new Map<string, string>());
  const recoveryAttemptsRef = useRef(new Set<string>());

  const setActiveProjectId = useCallback((projectId: string | null) => {
    setActiveProjectIdState(projectId);
    if (typeof window === 'undefined') return;
    if (projectId) window.localStorage.setItem(ACTIVE_PROJECT_KEY, projectId);
    else window.localStorage.removeItem(ACTIVE_PROJECT_KEY);
  }, []);

  useEffect(() => {
    if (!currentUser || !isAdmin) {
      setProjects([]);
      setProjectsReady(false);
      return;
    }
    setProjectsReady(false);
    return subscribeEmoticonProjects({
      userId: currentUser.uid,
      onChange: (nextProjects) => {
        setProjects(nextProjects);
        setProjectsReady(true);
        setActiveProjectIdState((current) => {
          const stored = typeof window === 'undefined' ? null : window.localStorage.getItem(ACTIVE_PROJECT_KEY);
          const selected = [current, stored].find((id) => id && nextProjects.some((project) => project.id === id))
            || nextProjects[0]?.id
            || null;
          if (selected && typeof window !== 'undefined') window.localStorage.setItem(ACTIVE_PROJECT_KEY, selected);
          return selected;
        });
      },
      onError: (cause) => {
        setProjectsReady(true);
        setError(cause.message);
      },
    });
  }, [currentUser, isAdmin]);

  const activeProjectBase = projects.find((project) => project.id === activeProjectId) || null;
  const activeProjectBaseId = activeProjectBase?.id || null;
  const items = useMemo(() => activeProjectBase && itemsState.projectId === activeProjectBase.id
    ? itemsState.value
    : [], [activeProjectBase, itemsState]);
  const profileVersions = useMemo(() => activeProjectBase && profileVersionsState.projectId === activeProjectBase.id
    ? profileVersionsState.value
    : [], [activeProjectBase, profileVersionsState]);
  const turns = useMemo(() => activeProjectBase && turnsState.projectId === activeProjectBase.id
    ? turnsState.value
    : [], [activeProjectBase, turnsState]);
  const turnsReady = Boolean(activeProjectBase && turnsState.projectId === activeProjectBase.id);
  const canReconfigure = useMemo(() => turns.every((turn) => (
    turn.status === 'failed' || turn.status === 'cancelled'
  )), [turns]);

  useEffect(() => {
    setItemsState({ projectId: null, value: [] });
    setProfileVersionsState({ projectId: null, value: [] });
    setTurnsState({ projectId: null, value: [] });
    setTimelineState({ projectId: null, timelineId: null, value: null, ready: false });
    setActiveTurnId(null);
    setRightsAttested(false);
    settledJobsRef.current.clear();
    linkedJobsRef.current.clear();
    timelineSyncKeysRef.current.clear();
  }, [activeProjectBase?.id]);

  useEffect(() => {
    if (!currentUser || !activeProjectBase) {
      setItemsState({ projectId: null, value: [] });
      return;
    }
    const projectId = activeProjectBase.id;
    return subscribeEmoticonProjectItems({
      userId: currentUser.uid,
      projectId,
      emoticonType: activeProjectBase.emoticonType,
      legacyItems: activeProjectBase.items,
      projectRevision: activeProjectBase.revision,
      onChange: (nextItems) => setItemsState({ projectId, value: nextItems }),
      onError: (cause) => setError(cause.message),
    });
  }, [activeProjectBase, currentUser]);

  useEffect(() => {
    const projectId = activeProjectBase?.id;
    const timelineId = activeProjectBase?.v2?.latestTimelineId || null;
    if (!currentUser || !projectId || !timelineId) {
      setTimelineState({
        projectId: projectId || null,
        timelineId,
        value: null,
        ready: Boolean(projectId),
      });
      return;
    }
    setTimelineState({ projectId, timelineId, value: null, ready: false });
    return subscribeEmoticonAnimationTimeline({
      userId: currentUser.uid,
      projectId,
      timelineId,
      onChange: (timeline) => setTimelineState({
        projectId,
        timelineId,
        value: timeline,
        ready: true,
      }),
      onError: (cause) => {
        setTimelineState({ projectId, timelineId, value: null, ready: true });
        setError(cause.message);
      },
    });
  }, [activeProjectBase?.id, activeProjectBase?.v2?.latestTimelineId, currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    return subscribeRecentEmoticonJobs({
      userId: currentUser.uid,
      maxResults: 60,
      onChange: setRecentJobFeed,
      onError: (cause) => setError(cause.message),
    });
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || !activeProjectBaseId) {
      setProfileVersionsState({ projectId: null, value: [] });
      setTurnsState({ projectId: null, value: [] });
      return;
    }
    const projectId = activeProjectBaseId;
    const unsubscribeProfiles = subscribeCharacterProfileVersions({
      userId: currentUser.uid,
      projectId,
      onChange: (nextProfiles) => setProfileVersionsState({ projectId, value: nextProfiles }),
      onError: (cause) => setError(cause.message),
    });
    const unsubscribeTurns = subscribeCreationTurns({
      userId: currentUser.uid,
      projectId,
      onChange: (nextTurns) => setTurnsState({ projectId, value: nextTurns }),
      onError: (cause) => setError(cause.message),
    });
    return () => {
      unsubscribeProfiles();
      unsubscribeTurns();
    };
  }, [activeProjectBaseId, currentUser]);

  const trackedJobIds = useMemo(() => Array.from(new Set([
    ...turns.flatMap((turn) => turn.variants.map((variant) => variant.jobId)),
    ...profileVersions.map((profile) => profile.sourceProfileJobId),
    ...(activeProjectBase?.character.profileJobId ? [activeProjectBase.character.profileJobId] : []),
  ])), [activeProjectBase?.character.profileJobId, profileVersions, turns]);

  useEffect(() => {
    if (!currentUser || !trackedJobIds.length) {
      setTrackedJobs([]);
      return;
    }
    return subscribeEmoticonJobs({
      userId: currentUser.uid,
      jobIds: trackedJobIds,
      onChange: setTrackedJobs,
      onError: (cause) => setError(cause.message),
    });
  }, [currentUser, trackedJobIds]);

  useEffect(() => {
    if (!currentUser || !trackedJobIds.length) return;
    let disposed = false;
    let running = false;

    const reconcileTrackedJobs = async () => {
      if (running) return;
      running = true;
      try {
        const refreshed = (await Promise.all(trackedJobIds.map((jobId) => (
          getEmoticonJobFromServer({ userId: currentUser.uid, jobId })
        )))).filter((job): job is EmoticonJob => Boolean(job));
        if (disposed) return;
        setTrackedJobs((current) => {
          const merged = new Map(current.map((job) => [job.id, job]));
          refreshed.forEach((job) => merged.set(job.id, job));
          return Array.from(merged.values());
        });

        for (const job of refreshed) {
          if (!isEmoticonJobStalled(job)) {
            recoveryAttemptsRef.current.delete(job.id);
            continue;
          }
          if (recoveryAttemptsRef.current.has(job.id)) continue;
          recoveryAttemptsRef.current.add(job.id);
          void recoverStalledEmoticonJob({ jobId: job.id })
            .then(() => {
              if (!disposed) toast.info('중단된 생성 작업을 저장된 단계부터 자동 복구하고 있어요.');
            })
            .catch((cause) => {
              recoveryAttemptsRef.current.delete(job.id);
              if (!disposed) {
                setError(cause instanceof Error
                  ? cause.message
                  : '중단된 작업의 자동 복구를 시작하지 못했습니다.');
              }
            });
        }
      } catch (cause) {
        if (!disposed) {
          setError(cause instanceof Error
            ? cause.message
            : '생성 작업의 최신 상태를 다시 확인하지 못했습니다.');
        }
      } finally {
        running = false;
      }
    };

    void reconcileTrackedJobs();
    const timer = window.setInterval(() => void reconcileTrackedJobs(), 30_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [currentUser, trackedJobIds]);

  const recentJobs = useMemo(() => {
    const merged = new Map<string, EmoticonJob>();
    recentJobFeed.forEach((job) => merged.set(job.id, job));
    trackedJobs.forEach((job) => merged.set(job.id, job));
    return Array.from(merged.values());
  }, [recentJobFeed, trackedJobs]);

  const project = useMemo(() => activeProjectBase ? { ...activeProjectBase, items } : null, [activeProjectBase, items]);
  const analysisJob = useMemo(() => {
    if (!project) return null;
    return recentJobs.find((job) => (
      job.projectId === project.id
      && job.mode === 'profile'
      && referencesMatch(project, job)
    )) || null;
  }, [project, recentJobs]);
  const approvedProfile = useMemo(() => profileVersions.find((profile) => profile.status === 'approved') || null, [profileVersions]);
  const activeTurn = useMemo(() => (
    turns.find((turn) => turn.id === activeTurnId) || turns[turns.length - 1] || null
  ), [activeTurnId, turns]);
  const activeTurnJobs = useMemo(() => activeTurn
    ? activeTurn.variants.flatMap((variant) => {
      const job = recentJobs.find((candidate) => candidate.id === variant.jobId);
      return job ? [job] : [];
    })
    : [], [activeTurn, recentJobs]);
  const activeJob = activeTurnJobs[activeTurnJobs.length - 1] || null;
  const latestTimeline = activeProjectBase
    && timelineState.projectId === activeProjectBase.id
    && timelineState.timelineId === (activeProjectBase.v2?.latestTimelineId || null)
    ? timelineState.value
    : null;
  const timelineReady = Boolean(
    activeProjectBase
    && timelineState.projectId === activeProjectBase.id
    && timelineState.timelineId === (activeProjectBase.v2?.latestTimelineId || null)
    && timelineState.ready,
  );

  const exportProject = useCallback(() => {
    if (!project) return null;
    const portable = createPortableEmoticonProject(project);
    const safeTitle = project.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 70) || 'emoticon-project';
    return {
      fileName: `${safeTitle}.portable-v1.json`,
      text: JSON.stringify(portable, null, 2),
    };
  }, [project]);

  const importProjectJson = useCallback(async (value: unknown) => {
    if (!currentUser || !isAdmin || pending) return false;
    setPending(true);
    setError(null);
    try {
      const projectId = await importEmoticonProject({ userId: currentUser.uid, value });
      setActiveProjectId(projectId);
      toast.success('프로젝트를 새 사본으로 불러왔습니다. 원본 프로젝트는 그대로 유지됩니다.');
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '프로젝트 JSON을 불러오지 못했습니다.';
      setError(message);
      toast.error(message);
      return false;
    } finally {
      setPending(false);
    }
  }, [currentUser, isAdmin, pending, setActiveProjectId]);

  useEffect(() => {
    if (!currentUser) return;
    turns.forEach((turn) => {
      const unsettledJobs = turn.variants.flatMap((variant) => {
        const job = recentJobs.find((candidate) => candidate.id === variant.jobId);
        if (!job || !['completed', 'failed', 'cancelled'].includes(job.status) || settledJobsRef.current.has(job.id)) return [];
        settledJobsRef.current.add(job.id);
        return [job];
      });
      if (!unsettledJobs.length) return;
      void settleCreationTurnFromJobs({
        userId: currentUser.uid,
        turnId: turn.id,
        jobs: unsettledJobs,
      }).catch(() => {
        unsettledJobs.forEach((job) => settledJobsRef.current.delete(job.id));
        setError('완성 기록 저장이 잠시 지연됐습니다. 결과는 보존되며 자동으로 다시 맞춥니다.');
      });
    });
  }, [currentUser, recentJobs, turns]);

  useEffect(() => {
    if (!currentUser || !project) return;
    recentJobs.forEach((job) => {
      if (
        job.projectId !== project.id
        || !job.projectItemId
        || job.status !== 'completed'
        || job.specReport?.technicalPass !== true
        || job.specReport?.allOutputsPass !== true
        || linkedJobsRef.current.has(job.id)
      ) return;
      linkedJobsRef.current.add(job.id);
      void linkCompletedEmoticonProjectJob({
        userId: currentUser.uid,
        projectId: project.id,
        itemId: job.projectItemId,
        jobId: job.id,
      }).catch((cause) => {
        linkedJobsRef.current.delete(job.id);
        setError(cause instanceof Error ? cause.message : '완성 결과를 프로젝트에 연결하지 못했습니다.');
      });
    });
  }, [currentUser, project, recentJobs]);

  useEffect(() => {
    if (!currentUser || !project) return;
    turns.forEach((turn) => {
      const completedVariantJobIds = turn.variants
        .filter((variant) => variant.status === 'completed')
        .map((variant) => variant.jobId);
      const turnIsTerminal = ['completed', 'failed', 'cancelled'].includes(turn.status);
      turn.variants.forEach((variant) => {
        const job = recentJobs.find((candidate) => candidate.id === variant.jobId);
        if (
          !job
          || job.projectId !== project.id
          || !job.projectItemId
          || job.status !== 'completed'
          || job.outputProfile?.type === 'static'
          || job.specReport?.technicalPass !== true
          || job.specReport?.allOutputsPass !== true
        ) return;
        const timeline = buildEmoticonAnimationTimelineFromJob({
          projectId: project.id,
          itemId: job.projectItemId,
          job,
          loopMode: turn.intent.loopMode,
        });
        if (!timeline) return;
        const shouldAttemptProjectLink = Boolean(
          turnIsTerminal
          && completedVariantJobIds.at(-1) === job.id
          && project.v2?.latestCreationTurnId === turn.id
          && project.status !== 'generating',
        );
        const syncKey = `${getEmoticonAnimationTimelineContentSignature(timeline)}\u0000${shouldAttemptProjectLink ? 'link' : 'store'}`;
        if (timelineSyncKeysRef.current.get(job.id) === syncKey) return;
        timelineSyncKeysRef.current.set(job.id, syncKey);
        void saveEmoticonAnimationTimeline({
          userId: currentUser.uid,
          projectId: project.id,
          itemId: job.projectItemId,
          jobId: job.id,
          turnId: turn.id,
        }).catch((cause) => {
          if (timelineSyncKeysRef.current.get(job.id) === syncKey) {
            timelineSyncKeysRef.current.delete(job.id);
          }
          setError(cause instanceof Error ? cause.message : '완성 결과 타임라인을 저장하지 못했습니다.');
        });
      });
    });
  }, [currentUser, project, recentJobs, turns]);

  const createProject = useCallback(async (options?: {
    files?: File[];
    title?: string;
    analyze?: boolean;
    platform?: EmoticonProjectPlatform;
    outputType?: EmoticonProjectType;
    frameCount?: number;
    workflowMode?: 'ai' | 'manual';
  }) => {
    if (!currentUser || !isAdmin || pending) return false;
    const files = (options?.files || []).slice(0, 4);
    const invalid = files.map(validateEmoticonSourceFile).find(Boolean);
    if (invalid) {
      setError(invalid);
      toast.error(invalid);
      return false;
    }
    setPending(true);
    setError(null);
    try {
      const platform = options?.platform || 'kakao';
      const outputType = options?.outputType || 'animated';
      const projectId = await createEmoticonProject({
        userId: currentUser.uid,
        title: options?.title?.trim().slice(0, 100) || createProjectTitle(platform, outputType),
        platform,
        emoticonType: outputType,
        itemCount: outputType === 'static' ? 8 : 1,
        frameCount: options?.frameCount,
        workflowMode: options?.workflowMode,
      });
      setActiveProjectId(projectId);
      if (files.length) {
        const uploaded = [];
        for (const [index, file] of files.entries()) {
          uploaded.push({
            ...await uploadEmoticonSource(currentUser.uid, file),
            viewRole: defaultReferenceRole(index),
          });
        }
        await updateEmoticonProject({
          userId: currentUser.uid,
          projectId,
          update: { character: { references: uploaded } },
        });
        setRightsAttested(true);
        if (options?.analyze) {
          const [primary, ...referenceImages] = uploaded;
          await createEmoticonCharacterProfileJob({
            userId: currentUser.uid,
            projectId,
            source: primary,
            referenceImages,
            resourceMode,
            rightsAttested: true,
          });
          toast.success('이미지를 올렸습니다. 캐릭터 특징을 분석하고 있어요.');
        } else {
          toast.success('새 이모티콘 프로젝트와 참고 이미지를 만들었습니다.');
        }
      } else {
        toast.success('새 이모티콘 프로젝트를 만들었습니다.');
      }
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '프로젝트를 만들지 못했습니다.';
      setError(message);
      toast.error(message);
      return false;
    } finally {
      setPending(false);
    }
  }, [currentUser, isAdmin, pending, resourceMode, setActiveProjectId]);

  const addReferences = useCallback(async (files: File[]) => {
    if (!currentUser || !project || pending) return;
    const available = Math.max(0, 4 - project.character.references.length);
    const candidates = files.slice(0, available);
    const invalid = candidates.map(validateEmoticonSourceFile).find(Boolean);
    if (invalid) {
      setError(invalid);
      toast.error(invalid);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const uploaded = [];
      for (const [index, file] of candidates.entries()) {
        uploaded.push({
          ...await uploadEmoticonSource(currentUser.uid, file),
          viewRole: defaultReferenceRole(project.character.references.length + index),
        });
      }
      const references = [...project.character.references, ...uploaded].filter((reference, referenceIndex, all) => (
        all.findIndex((candidate) => candidate.sourceStoragePath === reference.sourceStoragePath) === referenceIndex
      ));
      await updateEmoticonProject({
        userId: currentUser.uid,
        projectId: project.id,
        expectedProjectRevision: project.revision,
        update: { character: { references } },
      });
      setRightsAttested(false);
      const addedCount = references.length - project.character.references.length;
      toast.success(addedCount > 0
        ? `${addedCount}장의 참고 이미지를 추가했습니다.`
        : '이미 등록된 같은 원본이라 중복으로 추가하지 않았습니다.');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '이미지를 추가하지 못했습니다.';
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }, [currentUser, pending, project]);

  const removeReference = useCallback(async (index: number) => {
    if (!currentUser || !project || pending) return;
    const references = project.character.references.filter((_, referenceIndex) => referenceIndex !== index);
    setPending(true);
    try {
      await updateEmoticonProject({
        userId: currentUser.uid,
        projectId: project.id,
        expectedProjectRevision: project.revision,
        update: { character: { references } },
      });
      setRightsAttested(false);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '참고 이미지를 제거하지 못했습니다.';
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }, [currentUser, pending, project]);

  const updateReferenceRole = useCallback(async (index: number, role: EmoticonProjectReferenceRole) => {
    if (!currentUser || !project || pending || index < 0 || index >= project.character.references.length) return;
    const references = project.character.references.map((reference, referenceIndex) => (
      referenceIndex === index ? { ...reference, viewRole: role } : reference
    ));
    setPending(true);
    setError(null);
    try {
      await updateEmoticonProject({
        userId: currentUser.uid,
        projectId: project.id,
        expectedProjectRevision: project.revision,
        update: { character: { references } },
      });
      setRightsAttested(false);
      toast.success('참고 이미지 방향을 저장했습니다. 변경된 구성을 다시 확인해 주세요.');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '참고 이미지 방향을 저장하지 못했습니다.';
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }, [currentUser, pending, project]);

  const analyzeCharacter = useCallback(async () => {
    if (!currentUser || !project || !project.character.references.length || pending) return;
    if (!rightsAttested) {
      toast.error('이미지 사용 권리를 먼저 확인해 주세요.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const [primary, ...references] = project.character.references;
      await createEmoticonCharacterProfileJob({
        userId: currentUser.uid,
        projectId: project.id,
        source: primary,
        referenceImages: references,
        resourceMode,
        rightsAttested: true,
      });
      toast.success('캐릭터 분석을 시작했습니다. 이 화면에서 진행 상태를 확인할 수 있어요.');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '캐릭터 분석을 시작하지 못했습니다.';
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }, [currentUser, pending, project, resourceMode, rightsAttested]);

  const approveCharacter = useCallback(async (input: {
    characterName: string;
    overrides: EmoticonCharacterAnalysisOverride;
    identityLock: EmoticonCharacterIdentityLock;
  }) => {
    if (!currentUser || !project || !analysisJob || pending) return;
    setPending(true);
    setError(null);
    try {
      const analysis = await applyEmoticonCharacterProfile({
        userId: currentUser.uid,
        projectId: project.id,
        profileJobId: analysisJob.id,
      });
      const version = await saveApprovedCharacterProfileVersion({
        userId: currentUser.uid,
        projectId: project.id,
        job: analysisJob,
        version: (profileVersions[0]?.version || 0) + 1,
        analysisMode: analysisJob.analysisMode || resourceMode,
        userOverrides: input.overrides,
        identityLock: input.identityLock,
        rightsAttested,
      });
      const immutableLock = input.overrides.immutableLock || analysis.immutableLock;
      const negativeLock = input.overrides.negativeLock || analysis.negativeLock;
      const lockPrefix = input.identityLock.strength === 'strict'
        ? '캐릭터 동일성을 엄격하게 고정'
        : input.identityLock.strength === 'natural'
          ? '행동에 맞는 자연스러운 변형 허용'
          : '동일성과 자연스러운 동작의 균형 유지';
      await updateEmoticonProject({
        userId: currentUser.uid,
        projectId: project.id,
        update: {
          character: {
            name: input.characterName.trim(),
            description: (input.overrides.summary || analysis.summary).slice(0, 800),
            visualStyle: analysis.styleLock.join('; ').slice(0, 160),
            identityPrompt: [lockPrefix, ...immutableLock].join('; ').slice(0, 1200),
            negativePrompt: negativeLock.join('; ').slice(0, 1200),
          },
          generationSettings: { resourceMode },
          v2: {
            experienceVersion: 2,
            workflowMode: 'ai',
            approvedCharacterProfileVersionId: version.id,
            latestCreationTurnId: project.v2?.latestCreationTurnId || null,
            latestTimelineId: project.v2?.latestTimelineId || null,
          },
        },
      });
      toast.success('캐릭터 DNA를 확정했습니다. 이제 원하는 행동을 말해 주세요.');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '캐릭터를 확정하지 못했습니다.';
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }, [analysisJob, currentUser, pending, profileVersions, project, resourceMode, rightsAttested]);

  const startCreation = useCallback(async (input: {
    prompt: string;
    intent: EmoticonCreationIntent;
    formats: EmoticonExportFormat[];
    cost: EmoticonCostSnapshot;
    parentTurnId?: string;
    referenceFiles?: File[];
  }) => {
    if (!currentUser || !project || !approvedProfile || !turnsReady || pending) return false;
    setPending(true);
    setError(null);
    let createdTurn: EmoticonCreationTurn | null = null;
    const createdJobIds: string[] = [];
    let creationFormats: EmoticonExportFormat[] = [];
    try {
      const platformProfile = await resolveEmoticonPlatformProfile({
        platform: input.intent.targetPlatform,
        type: input.intent.outputType,
      });
      const platformFrameCount = input.intent.outputType === 'animated'
        ? Math.max(Math.max(4, platformProfile.minFrameCount), Math.min(platformProfile.maxFrameCount, input.intent.frameCount))
        : input.intent.frameCount;
      const normalizedMotion = input.intent.outputType === 'animated'
        ? normalizeEmoticonAnimationMotion(platformFrameCount, input.intent.durationMs)
        : null;
      const normalizedIntent: EmoticonCreationIntent = normalizedMotion
        ? { ...input.intent, ...normalizedMotion }
        : input.intent;
      const outputProfile = toEmoticonOutputProfile(platformProfile);
      const formats: EmoticonExportFormat[] = normalizedIntent.outputType === 'static'
        ? ['png']
        : Array.from(new Set(input.formats.filter((format) => platformProfile.allowedFormats.includes(format))));
      if (!formats.length) formats.push(platformProfile.preferredFormat);
      creationFormats = formats;

      let generationItems = project.items;
      const requestedItemCount = normalizedIntent.outputType === 'static'
        ? normalizedIntent.quantity
        : Math.max(1, project.itemCount);
      const needsFormatReconfiguration = canReconfigure && (
        project.emoticonType !== normalizedIntent.outputType
        || project.platform !== normalizedIntent.targetPlatform
      );
      const needsMoreStaticItems = normalizedIntent.outputType === 'static'
        && project.emoticonType === 'static'
        && project.platform === normalizedIntent.targetPlatform
        && generationItems.length < requestedItemCount;
      if (needsFormatReconfiguration || needsMoreStaticItems) {
        const missingCount = Math.max(0, requestedItemCount - generationItems.length);
        generationItems = needsFormatReconfiguration
          ? createProjectItems(requestedItemCount, normalizedIntent.outputType)
          : [
            ...generationItems,
            ...createProjectItems(missingCount, 'static'),
          ];
        await replaceEmoticonProjectItems({
          userId: currentUser.uid,
          projectId: project.id,
          expectedProjectRevision: project.revision,
          items: generationItems,
          projectUpdate: {
            platform: normalizedIntent.targetPlatform,
            emoticonType: normalizedIntent.outputType,
            generationSettings: {
              resourceMode: normalizedIntent.qualityMode,
              formats,
              preferredFormat: platformProfile.preferredFormat,
              motionPreference: normalizedIntent.outputType === 'static' ? 'stable' : 'auto',
            },
            spec: {
              canvasWidth: platformProfile.width,
              canvasHeight: platformProfile.height,
              transparentBackground: true,
              recommendedItemCount: platformProfile.recommendedItemCount,
              profileVersion: platformProfile.profileVersion,
              profileVerification: platformProfile.verification,
              ...(platformProfile.sourceUrl ? { sourceUrl: platformProfile.sourceUrl } : {}),
              ...(platformProfile.checkedAt ? { checkedAt: platformProfile.checkedAt } : {}),
            },
          },
        });
      }
      const itemCount = Math.min(normalizedIntent.quantity, generationItems.length);
      const selectedItems = generationItems.slice(0, itemCount);
      if (!selectedItems.length) throw new Error('생성 결과를 연결할 프로젝트 항목이 없습니다.');

      const additionalReferences = [];
      for (const file of (input.referenceFiles || []).slice(0, 2)) {
        const validationError = validateEmoticonSourceFile(file);
        if (validationError) throw new Error(validationError);
        additionalReferences.push(await uploadEmoticonSource(currentUser.uid, file));
      }
      const additionalReferenceAssetIds = additionalReferences.flatMap((reference) => {
        const match = reference.sourceStoragePath.match(/source-([a-f0-9]{64})\.png$/);
        return match?.[1] ? [match[1]] : [];
      });
      const intent = {
        ...normalizedIntent,
        additionalReferenceAssetIds,
      };

      const turn = await createEmoticonCreationTurn({
        userId: currentUser.uid,
        projectId: project.id,
        prompt: input.prompt,
        intent,
        profileVersionId: approvedProfile.id,
        cost: input.cost,
        ...(input.parentTurnId ? { parentTurnId: input.parentTurnId } : {}),
      });
      createdTurn = turn;
      setActiveTurnId(turn.id);
      const primary = project.character.references[0];
      if (!primary) throw new Error('확정된 캐릭터 대표 이미지가 없습니다.');
      const identityReferences = project.character.references.slice(1);
      const identitySlots = Math.max(0, 3 - additionalReferences.length);
      const references = [
        ...identityReferences.slice(0, identitySlots),
        ...additionalReferences,
      ].slice(0, 3);
      const fps = normalizedMotion?.fps || 1;
      const bubble = normalizedIntent.textCues.length ? {
        text: normalizedIntent.textCues[0]?.text || '',
        style: 'shout' as const,
        position: 'top' as const,
        entrance: 'pop' as const,
        font: 'clean' as const,
        ...EMOTICON_BUBBLE_APPEARANCE_DEFAULTS,
        timeline: {
          mode: 'cues' as const,
          startFrame: 0,
          endFrame: normalizedIntent.frameCount - 1,
          cues: normalizedIntent.textCues,
        },
      } : undefined;

      const dnaAnalysis = approvedProfile.aiAnalysis;
      const dnaOverrides = approvedProfile.userOverrides;
      const dnaAttributes = { ...dnaAnalysis.attributes, ...(dnaOverrides.attributes || {}) };
      const dnaLock = approvedProfile.identityLock;
      const lockedAttributes = [
        dnaLock.face ? `얼굴 ${dnaAttributes.face}; 눈 ${dnaAttributes.eyes}` : '',
        dnaLock.hair ? `머리 ${dnaAttributes.hair}` : '',
        dnaLock.outfit ? `의상 ${dnaAttributes.outfit}` : '',
        dnaLock.palette ? `색상 ${dnaAttributes.palette.join(', ')}` : '',
        dnaLock.proportions ? `비율 ${dnaAttributes.proportions}; 체형 ${dnaAttributes.bodyShape}` : '',
        dnaLock.accessories ? `액세서리 ${dnaAttributes.accessories.join(', ') || '없음'}` : '',
      ].filter(Boolean);
      const identityGuide = [
        `고정 강도 ${dnaLock.strength}`,
        (dnaOverrides.summary || dnaAnalysis.summary).slice(0, 140),
        ...lockedAttributes,
        ...(dnaOverrides.immutableLock || dnaAnalysis.immutableLock),
        ...(dnaOverrides.styleLock || dnaAnalysis.styleLock),
        `금지: ${(dnaOverrides.negativeLock || dnaAnalysis.negativeLock).join('; ')}`,
      ].filter(Boolean).join(' · ').slice(0, 360);

      for (const [index, item] of selectedItems.entries()) {
        const request = selectedItems.length > 1
          ? buildEmoticonSequenceFramePrompt({
            subject: input.prompt,
            frameNumber: index + 1,
            frameCount: selectedItems.length,
            maxLength: 400,
          })
          : input.prompt;
        const instruction = buildGenerationInstruction(request, identityGuide);
        await updateEmoticonProjectItem({
          userId: currentUser.uid,
          projectId: project.id,
          itemId: item.id,
          update: {
            title: normalizedIntent.action.slice(0, 80),
            emotion: normalizedIntent.emotion || '자연스러운 감정',
            action: normalizedIntent.action.slice(0, 160),
            instruction: instruction.slice(0, 800),
            motion: normalizedIntent.outputType === 'static'
              ? { control: 'custom', fps: 1, frameCount: 1, durationMs: 0 }
              : { control: 'custom', fps, frameCount: normalizedIntent.frameCount, durationMs: normalizedIntent.durationMs },
            ...(bubble ? { bubble: { enabled: true, text: bubble.text, position: bubble.position, style: bubble.style, font: bubble.font, entrance: bubble.entrance, size: bubble.size, fillColor: bubble.fillColor, textColor: bubble.textColor, outlineColor: bubble.outlineColor, outlineWidth: bubble.outlineWidth, shadowOpacity: bubble.shadowOpacity, offsetX: bubble.offsetX, offsetY: bubble.offsetY, timeline: bubble.timeline } } : {}),
          },
        });
        const result = await submitEmoticonJob({
          userId: currentUser.uid,
          source: primary,
          referenceImages: references,
          instruction,
          motionPreference: normalizedIntent.outputType === 'static' ? 'stable' : 'auto',
          resourceMode: normalizedIntent.qualityMode,
          formats,
          ...(bubble ? { bubbleOverride: bubble } : {}),
          ...(normalizedIntent.outputType === 'animated' ? {
            motionOverride: {
              fps,
              frameCount: normalizedIntent.frameCount,
              durationMs: normalizedIntent.durationMs,
            },
          } : {}),
          outputProfile,
          projectId: project.id,
          projectItemId: item.id,
        });
        createdJobIds.push(result.jobId);
      }
      await linkCreationTurnJobs({ userId: currentUser.uid, turn, jobIds: createdJobIds, formats });
      await updateEmoticonProject({
        userId: currentUser.uid,
        projectId: project.id,
        update: {
          v2: {
            experienceVersion: 2,
            workflowMode: 'ai',
            approvedCharacterProfileVersionId: approvedProfile.id,
            latestCreationTurnId: turn.id,
            latestTimelineId: project.v2?.latestTimelineId || null,
          },
        },
      });
      toast.success(`${createdJobIds.length}개의 생성 작업을 시작했습니다.`);
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '생성 작업을 시작하지 못했습니다.';
      if (createdTurn) {
        try {
          if (createdJobIds.length) {
            await linkCreationTurnJobs({
              userId: currentUser.uid,
              turn: createdTurn,
              jobIds: createdJobIds,
              formats: creationFormats,
            });
          } else {
            await failCreationTurn({
              userId: currentUser.uid,
              turnId: createdTurn.id,
              errorMessage: message,
            });
          }
        } catch {
          // The original error is more useful to the user. The subscription can recover the record later.
        }
      }
      setError(message);
      toast.error(createdJobIds.length ? `${message} 시작된 ${createdJobIds.length}개 작업은 계속 진행됩니다.` : message);
      return false;
    } finally {
      setPending(false);
    }
  }, [approvedProfile, canReconfigure, currentUser, pending, project, turnsReady]);

  const startManualImport = useCallback(async (input: ManualFrameImportSubmit) => {
    if (!currentUser || !project || !turnsReady || pending) return false;
    const item = project.items[0];
    if (!item) {
      setError('사진을 연결할 프로젝트 항목이 없습니다.');
      return false;
    }
    setPending(true);
    setError(null);
    let createdTurn: EmoticonCreationTurn | null = null;
    try {
      const frameCount = input.frames.length;
      const durationMs = input.timing.mode === 'per_frame'
        ? input.timing.frameDurationsMs.reduce((sum, value) => sum + value, 0)
        : Math.round((frameCount / input.timing.fps) * 1_000);
      const fps = input.timing.mode === 'fps'
        ? input.timing.fps
        : Math.max(1, Math.min(30, Math.round(frameCount / Math.max(0.04, durationMs / 1_000))));
      const platformProfile = await resolveEmoticonPlatformProfile({
        platform: project.platform,
        type: 'animated',
      });
      const formats = Array.from(new Set(
        input.formats.filter((format) => platformProfile.allowedFormats.includes(format)),
      ));
      if (!formats.length) formats.push(platformProfile.preferredFormat);
      const outputProfile = {
        ...toEmoticonOutputProfile(platformProfile),
        frameCount,
        fps,
        durationMs,
        loopCount: platformProfile.defaultLoopCount ?? 0,
      };
      const intent: EmoticonCreationIntent = {
        action: `내 사진 ${frameCount}장으로 움짤 만들기`,
        direction: 'unspecified',
        emotion: '',
        expression: '',
        outputType: 'animated',
        quantity: 1,
        frameCount,
        durationMs,
        loopMode: 'loop',
        targetPlatform: project.platform,
        qualityMode: project.generationSettings.resourceMode,
        additionalReferenceAssetIds: [],
        textCues: [],
      };
      createdTurn = await createEmoticonCreationTurn({
        userId: currentUser.uid,
        projectId: project.id,
        prompt: `내 사진 ${frameCount}장을 순서대로 이어 자연스럽게 반복되는 움짤로 만들기`,
        intent,
        profileVersionId: 'manual-import',
        cost: {
          currency: 'USD', estimatedMinUsd: 0, estimatedMaxUsd: 0, actualUsd: 0,
          estimatedCallsMin: 0, estimatedCallsMax: 0, actualCalls: 0,
        },
      });
      setActiveTurnId(createdTurn.id);
      const result = await submitEmoticonFrameImportJob({
        userId: currentUser.uid,
        projectId: project.id,
        projectItemId: item.id,
        expectedProjectRevision: project.revision,
        expectedProjectItemRevision: item.revision,
        frames: input.frames,
        timing: input.timing,
        formats,
        outputProfile,
      });
      await linkCreationTurnJobs({
        userId: currentUser.uid,
        turn: createdTurn,
        jobIds: [result.jobId],
        formats,
      });
      await updateEmoticonProject({
        userId: currentUser.uid,
        projectId: project.id,
        update: {
          status: 'generating',
          v2: {
            experienceVersion: 2,
            workflowMode: 'manual',
            approvedCharacterProfileVersionId: null,
            latestCreationTurnId: createdTurn.id,
            latestTimelineId: project.v2?.latestTimelineId || null,
          },
        },
      });
      toast.success(`${frameCount}개 프레임의 움짤 제작을 시작했습니다.`);
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '사진으로 움짤을 만들지 못했습니다.';
      if (createdTurn) {
        await failCreationTurn({
          userId: currentUser.uid,
          turnId: createdTurn.id,
          errorMessage: message,
        }).catch(() => undefined);
      }
      setError(message);
      toast.error(message);
      return false;
    } finally {
      setPending(false);
    }
  }, [currentUser, pending, project, turnsReady]);

  const cancelJob = useCallback(async (job: EmoticonJob) => {
    if (!currentUser || pending) return;
    setPending(true);
    try {
      await requestEmoticonJobCancellation({ userId: currentUser.uid, jobId: job.id });
      toast.success('작업 취소를 요청했습니다. 현재 단계가 안전하게 끝나면 중단됩니다.');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '취소 요청에 실패했습니다.';
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }, [currentUser, pending]);

  const retryJob = useCallback(async (job: EmoticonJob) => {
    if (!currentUser || pending) return;
    setPending(true);
    try {
      const result = await retryEmoticonJob({ userId: currentUser.uid, job });
      const turn = turns.find((candidate) => candidate.variants.some((variant) => variant.jobId === job.id));
      if (turn) {
        await replaceCreationTurnVariantJob({
          userId: currentUser.uid,
          turnId: turn.id,
          previousJobId: job.id,
          nextJobId: result.jobId,
        });
        settledJobsRef.current.delete(job.id);
        settledJobsRef.current.delete(result.jobId);
      }
      toast.success(result.reusedPose ? '완성된 포즈를 재사용해 실패 단계부터 다시 시작합니다.' : '작업을 다시 시작했습니다.');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '재시도하지 못했습니다.';
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }, [currentUser, pending, turns]);

  const connectEditedJob = useCallback(async (previousJobId: string, nextJobId: string) => {
    if (!currentUser) return false;
    const turn = turns.find((candidate) => candidate.variants.some((variant) => variant.jobId === previousJobId));
    if (!turn) {
      setError('편집 전 결과가 대화 기록에 없어 새 버전을 연결하지 못했습니다.');
      return false;
    }
    try {
      await replaceCreationTurnVariantJob({
        userId: currentUser.uid,
        turnId: turn.id,
        previousJobId,
        nextJobId,
      });
      settledJobsRef.current.delete(previousJobId);
      settledJobsRef.current.delete(nextJobId);
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '편집 결과를 대화에 연결하지 못했습니다.';
      setError(message);
      toast.error(message);
      return false;
    }
  }, [currentUser, turns]);

  const createAnimationFromStaticJobs = useCallback(async (request: StaticAnimationBuildRequest) => {
    if (!currentUser || !project || !approvedProfile || pending) return false;
    const platformProfile = await resolveEmoticonPlatformProfile({
      platform: project.platform,
      type: 'animated',
    });
    const requestedJobIds = request.jobIds;
    if (
      requestedJobIds.length < platformProfile.minFrameCount
      || requestedJobIds.length > platformProfile.maxFrameCount
    ) {
      setError(`${project.platform === 'line' ? 'LINE' : '선택한 플랫폼'} 움짤은 ${platformProfile.minFrameCount}~${platformProfile.maxFrameCount}프레임으로 만들어야 합니다.`);
      return false;
    }
    if (
      request.frameDurationsMs.length !== requestedJobIds.length
      || request.frameDurationsMs.some((durationMs) => !Number.isInteger(durationMs) || durationMs < 40 || durationMs > 2000)
    ) {
      setError('사진별 표시 시간은 40~2000ms 범위에서 설정해 주세요.');
      return false;
    }
    const recentJobMap = new Map(recentJobs.map((job) => [job.id, job]));
    const selectedJobs = requestedJobIds.flatMap((jobId) => {
      const job = recentJobMap.get(jobId);
      return job
        && job.projectId === project.id
        && job.status === 'completed'
        && !hasEmoticonSubjectGenerationMismatch(job)
        && job.outputProfile?.type === 'static'
        && job.specReport?.technicalPass === true
        && job.specReport?.allOutputsPass === true
        ? [job]
        : [];
    });
    if (selectedJobs.length !== requestedJobIds.length) {
      setError('선택한 정지 결과 중 기술 검사를 통과하지 않았거나 현재 프로젝트에 속하지 않은 항목이 있습니다.');
      return false;
    }
    const profileJob = recentJobs.find((job) => job.id === approvedProfile.sourceProfileJobId) || analysisJob;
    if (!profileJob?.characterAnalysis || !profileJob.identityFingerprint) {
      setError('캐릭터 DNA 원본 분석을 찾지 못했습니다. 현재 이미지로 다시 분석한 뒤 시도해 주세요.');
      return false;
    }

    setPending(true);
    setError(null);
    let turn: EmoticonCreationTurn | null = null;
    try {
      const outputProfile = toEmoticonOutputProfile(platformProfile);
      const formats = Array.from(new Set<EmoticonExportFormat>([
        platformProfile.preferredFormat,
        'gif',
        'png_zip',
      ])).filter((format) => platformProfile.allowedFormats.includes(format));
      const uniqueFrameCount = new Set(requestedJobIds).size;
      const playbackLabel = request.playbackMode === 'reverse' ? '역방향'
        : request.playbackMode === 'ping_pong' ? '왕복'
          : '정방향';
      const newProjectId = await createEmoticonProject({
        userId: currentUser.uid,
        title: `${project.character.name || '캐릭터'} 움짤 · ${uniqueFrameCount}장 ${playbackLabel}`,
        platform: project.platform,
        emoticonType: 'animated',
        itemCount: 1,
      });

      await updateEmoticonProject({
        userId: currentUser.uid,
        projectId: newProjectId,
        expectedProjectRevision: 0,
        update: {
          character: {
            name: project.character.name,
            description: project.character.description,
            visualStyle: project.character.visualStyle,
            references: project.character.references,
            identityPrompt: project.character.identityPrompt,
            negativePrompt: project.character.negativePrompt,
          },
          generationSettings: {
            motionPreference: 'stable',
            resourceMode: project.generationSettings.resourceMode,
            formats,
            preferredFormat: platformProfile.preferredFormat,
          },
        },
      });
      const copiedProfile = await saveApprovedCharacterProfileVersion({
        userId: currentUser.uid,
        projectId: newProjectId,
        job: profileJob,
        version: 1,
        analysisMode: approvedProfile.analysisMode,
        userOverrides: approvedProfile.userOverrides,
        identityLock: approvedProfile.identityLock,
        rightsAttested: true,
      });
      await updateEmoticonProject({
        userId: currentUser.uid,
        projectId: newProjectId,
        expectedProjectRevision: 1,
        update: {
          character: {
            profile: profileJob.characterAnalysis,
            profileJobId: profileJob.id,
            identityFingerprint: profileJob.identityFingerprint,
          },
          v2: {
            experienceVersion: 2,
            workflowMode: 'ai',
            approvedCharacterProfileVersionId: copiedProfile.id,
            latestCreationTurnId: null,
            latestTimelineId: null,
          },
        },
      });
      const newProject = await getEmoticonProject({ userId: currentUser.uid, projectId: newProjectId });
      const item = newProject?.items[0];
      if (!newProject || !item) throw new Error('움짤 프로젝트의 첫 타임라인을 준비하지 못했습니다.');

      const durationMs = request.frameDurationsMs.reduce((sum, durationMs) => sum + durationMs, 0);
      const intent: EmoticonCreationIntent = {
        action: `선택한 정지 이미지로 ${playbackLabel} 움짤 만들기`,
        direction: 'unspecified',
        emotion: '',
        expression: '',
        outputType: 'animated',
        quantity: 1,
        frameCount: selectedJobs.length,
        durationMs,
        loopMode: request.playbackMode === 'ping_pong' ? 'ping_pong' : 'loop',
        targetPlatform: project.platform,
        qualityMode: project.generationSettings.resourceMode,
        additionalReferenceAssetIds: [],
        textCues: [],
      };
      turn = await createEmoticonCreationTurn({
        userId: currentUser.uid,
        projectId: newProjectId,
        prompt: `선택한 정지 이미지 ${uniqueFrameCount}장을 ${playbackLabel}으로 이어서 자연스럽게 반복되는 움짤로 만들어줘`,
        intent,
        profileVersionId: copiedProfile.id,
        cost: {
          currency: 'USD',
          estimatedMinUsd: 0,
          estimatedMaxUsd: 0,
          actualUsd: 0,
          estimatedCallsMin: 0,
          estimatedCallsMax: 0,
          actualCalls: 0,
        },
      });
      const result = await submitEmoticonFrameImportJob({
        userId: currentUser.uid,
        projectId: newProjectId,
        projectItemId: item.id,
        expectedProjectRevision: newProject.revision,
        expectedProjectItemRevision: item.revision,
        frames: selectedJobs.map((job, index) => ({
          kind: 'completed-static' as const,
          uploadRequestId: crypto.randomUUID(),
          durationMs: request.frameDurationsMs[index],
          sourceJobId: job.id,
        })),
        timing: { mode: 'per_frame', frameDurationsMs: request.frameDurationsMs },
        formats,
        outputProfile,
      });
      await linkCreationTurnJobs({
        userId: currentUser.uid,
        turn,
        jobIds: [result.jobId],
        formats,
      });
      await updateEmoticonProject({
        userId: currentUser.uid,
        projectId: newProjectId,
        update: {
          v2: {
            experienceVersion: 2,
            workflowMode: 'ai',
            approvedCharacterProfileVersionId: copiedProfile.id,
            latestCreationTurnId: turn.id,
            latestTimelineId: null,
          },
        },
      });
      setActiveProjectId(newProjectId);
      toast.success(`${uniqueFrameCount}장의 정지 결과를 ${requestedJobIds.length}프레임 ${playbackLabel} 움짤로 옮겼습니다.`);
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '선택한 이미지로 움짤을 만들지 못했습니다.';
      if (turn) {
        await failCreationTurn({
          userId: currentUser.uid,
          turnId: turn.id,
          errorMessage: message,
        }).catch(() => undefined);
      }
      setError(message);
      toast.error(message);
      return false;
    } finally {
      setPending(false);
    }
  }, [analysisJob, approvedProfile, currentUser, pending, project, recentJobs, setActiveProjectId]);

  const setRepresentativeJob = useCallback(async (job: EmoticonJob) => {
    if (!currentUser || !project || !job.projectItemId || job.status !== 'completed' || pending) return false;
    if (!project.items.some((item) => item.id === job.projectItemId)) {
      setError('이 결과가 연결된 프로젝트 항목을 찾지 못했습니다.');
      return false;
    }
    setPending(true);
    setError(null);
    try {
      await linkCompletedEmoticonProjectJob({
        userId: currentUser.uid,
        projectId: project.id,
        itemId: job.projectItemId,
        jobId: job.id,
      });
      toast.success('선택한 완성본을 프로젝트 대표 결과로 저장했습니다.');
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '대표 결과를 변경하지 못했습니다.';
      setError(message);
      toast.error(message);
      return false;
    } finally {
      setPending(false);
    }
  }, [currentUser, pending, project]);

  const deleteProject = useCallback(async (mode: EmoticonProjectDeletionMode) => {
    if (!currentUser || !isAdmin || !project || pending) return false;
    const hasWorkingJob = recentJobs.some((job) => (
      job.projectId === project.id
      && ['queued', 'analyzing', 'generating', 'validating', 'animating', 'rendering'].includes(job.status)
    ));
    if (hasWorkingJob) {
      setError('진행 중인 생성 작업이 끝나거나 취소된 뒤 프로젝트를 삭제해 주세요.');
      return false;
    }

    setPending(true);
    setError(null);
    try {
      const result = await deleteEmoticonProjectSafely({ projectId: project.id, mode });
      if (result.status === 'completed') {
        const nextProject = projects.find((candidate) => candidate.id !== project.id) || null;
        setActiveProjectId(nextProject?.id || null);
        toast.success('프로젝트 삭제를 완료했습니다.');
      } else {
        toast.info('프로젝트 삭제를 안전하게 계속 처리하고 있습니다. 완료 후 목록에서 자동으로 사라집니다.');
      }
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '프로젝트를 삭제하지 못했습니다.';
      setError(message);
      toast.error(message);
      return false;
    } finally {
      setPending(false);
    }
  }, [currentUser, isAdmin, pending, project, projects, recentJobs, setActiveProjectId]);

  return {
    access,
    projects,
    projectsReady,
    project,
    activeProjectId,
    setActiveProjectId,
    recentJobs,
    analysisJob,
    profileVersions,
    approvedProfile,
    turns,
    turnsReady,
    canReconfigure,
    activeTurn,
    activeTurnId,
    setActiveTurnId,
    activeTurnJobs,
    activeJob,
    latestTimeline,
    timelineReady,
    pending,
    error,
    setError,
    resourceMode,
    setResourceMode,
    rightsAttested,
    setRightsAttested,
    createProject,
    addReferences,
    removeReference,
    updateReferenceRole,
    analyzeCharacter,
    approveCharacter,
    startCreation,
    startManualImport,
    cancelJob,
    retryJob,
    connectEditedJob,
    createAnimationFromStaticJobs,
    exportProject,
    importProjectJson,
    setRepresentativeJob,
    deleteProject,
  };
}
