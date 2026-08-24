'use client';

import { useState } from 'react';
import { CharacterSetupStep } from '../CharacterSetupStep';
import { CreationComposer } from '../CreationComposer';
import { CreationResultCard } from '../CreationResultCard';
import { AdvancedProjectTools } from '../AdvancedProjectTools';
import { ProfessionalEditor } from '../ProfessionalEditor';
import { StudioStartHub } from '../StudioStartHub';
import { ManualAnimationWorkspace } from '../ManualAnimationWorkspace';
import { StudioUsageGuide } from '../StudioUsageGuide';
import * as S from '../StudioShell.styles';
import type { EmoticonProject, EmoticonProjectItem } from '@/schemas/emoticonProject';
import type { EmoticonCharacterAnalysis, EmoticonJob } from '@/schemas/emoticonStudio';
import type { EmoticonCreationTurn } from '@/schemas/emoticonStudioV2';

const previewImage = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="none"/>
  <circle cx="256" cy="135" r="74" fill="#F6C5A5" stroke="#3B241B" stroke-width="12"/>
  <path d="M185 128c10-76 132-101 151-9-35-29-93-33-151 9Z" fill="#3B241B"/>
  <circle cx="226" cy="139" r="10" fill="#35221B"/><circle cx="286" cy="139" r="10" fill="#35221B"/>
  <path d="M233 172q23 18 46 0" fill="none" stroke="#9B4B3E" stroke-width="7" stroke-linecap="round"/>
  <path d="M205 210h102l26 123H178Z" fill="#FFF1D6" stroke="#3B241B" stroke-width="12"/>
  <path d="M178 320h155l22 88H158Z" fill="#17395F" stroke="#3B241B" stroke-width="12"/>
  <path d="M208 405l-18 70M300 405l20 70" stroke="#F6C5A5" stroke-width="25" stroke-linecap="round"/>
  <path d="M168 478h48M296 478h48" stroke="#222" stroke-width="18" stroke-linecap="round"/>
</svg>`)}`;

const analysis: EmoticonCharacterAnalysis = {
  schemaVersion: 1,
  analysisRevision: 2,
  summary: '둥근 얼굴, 짧은 갈색 포니테일, 크림색 블라우스와 남색 주름치마가 핵심인 2.5등신 캐릭터',
  attributes: {
    face: '둥근 턱선과 옅은 볼 홍조', eyes: '크고 둥근 짙은 갈색 눈', hair: '갈색 옆가르마와 낮은 포니테일',
    bodyShape: '머리가 크고 팔다리가 짧은 체형', outfit: '크림색 블라우스와 남색 주름치마', accessories: [],
    distinctiveFeatures: ['낮은 포니테일', '남색 주름치마'], palette: ['#3B241B', '#FFF1D6', '#17395F'],
    lineArt: '짙은 갈색의 매끄러운 외곽선', shading: '부드러운 2단계 셀 채색', proportions: '2.5등신', limbStructure: '둥근 관절과 단순화된 팔다리',
  },
  immutableLock: ['둥근 얼굴', '갈색 포니테일', '크림색 블라우스', '남색 주름치마'],
  styleLock: ['2.5등신', '짙은 갈색 외곽선', '셀 채색'],
  negativeLock: ['머리색 변경', '의상 교체', '추가 팔다리', '배경 잔여물'],
  motionTraits: { hair: '달릴 때 뒤로 흔들림', clothing: '치마 주름이 후행', groundAnchor: '지지발 밑창이 바닥선에 닿음', centerAnchor: '몸통 중심을 이동 기준으로 유지', articulatedParts: ['포니테일', '앞머리', '팔꿈치', '무릎', '치마 주름'] },
  imageQuality: { score: 92, resolution: '512×512', backgroundIsolation: '경계가 선명함', cropping: '전신 포함', issues: [], usableForGeneration: true },
  confidenceNotes: ['치마 무늬는 추가 참고가 있으면 더 안정적입니다.'],
  confirmationRequired: ['치마 체크무늬를 모든 프레임에 유지할지 확인'],
  referenceCount: 1,
};

const item: EmoticonProjectItem = {
  id: 'preview-item', revision: 0, order: 1, title: '달리며 외치기', emotion: '다급함', action: '오른쪽으로 달리기',
  motion: { control: 'custom', fps: 8, frameCount: 8, durationMs: 1000 },
  bubble: { enabled: true, text: '거기서!!', position: 'top', style: 'shout', font: 'clean', entrance: 'pop', size: 1, fillColor: '#FFFFFF', textColor: '#111111', outlineColor: '#111111', outlineWidth: 3, shadowOpacity: 0.2, offsetX: 0, offsetY: 0, timeline: { mode: 'cues', startFrame: 0, endFrame: 7, cues: [{ id: 'cue-1', text: '거기서!!', startFrame: 0, endFrame: 3 }, { id: 'cue-2', text: '서란 말이야', startFrame: 4, endFrame: 7 }] } },
  bubbleLayers: [],
  editRecipe: { schemaVersion: 1, revision: 0, crop: { left: 0, right: 0, top: 0, bottom: 0 }, scale: 1, offsetX: 0, offsetY: 0, flipHorizontal: false, rotationDeg: 0, transparentPadding: 0, brightness: 0, contrast: 0, saturation: 0 },
  editHistory: [], instruction: '오른쪽으로 달리면서 순서대로 외치기', negativePrompt: '', jobId: 'preview-job', generationStatus: 'completed', validationErrors: [],
};

const project = {
  schemaVersion: 2, revision: 2, id: 'preview-project', userId: 'preview-user', title: '달리는 캐릭터', description: '', platform: 'line', emoticonType: 'animated', itemCount: 1,
  character: { name: '하니', description: analysis.summary, visualStyle: analysis.styleLock.join('; '), references: [{ sourceImageUrl: previewImage, sourceStoragePath: 'preview/character.png' }], identityPrompt: analysis.immutableLock.join('; '), negativePrompt: analysis.negativeLock.join('; '), profile: analysis, profileJobId: 'preview-profile', identityFingerprint: 'a'.repeat(64) },
  generationSettings: { motionPreference: 'auto', resourceMode: 'efficient', formats: ['apng', 'webp', 'gif', 'png_zip'], preferredFormat: 'apng' },
  spec: { canvasWidth: 320, canvasHeight: 270, transparentBackground: true, recommendedItemCount: 8, profileVersion: 'line-animated-apng-2026-08-05', profileVerification: 'verified' },
  items: [item], status: 'completed', deletionLocked: false,
} as EmoticonProject;
const manualProject = {
  ...project,
  id: 'preview-manual-project',
  title: '내 사진 움짤',
  status: 'draft',
  v2: { experienceVersion: 2, workflowMode: 'manual', approvedCharacterProfileVersionId: null, latestCreationTurnId: null, latestTimelineId: null },
} as EmoticonProject;

const frames = Array.from({ length: 8 }, (_, index) => ({ index, url: previewImage, storagePath: `preview/sprite-sheet-frame-${index}.png`, durationMs: 125 }));
const previewBubble = {
  text: item.bubble.text,
  style: item.bubble.style,
  position: item.bubble.position,
  entrance: item.bubble.entrance,
  font: item.bubble.font,
  size: item.bubble.size,
  fillColor: item.bubble.fillColor,
  textColor: item.bubble.textColor,
  outlineColor: item.bubble.outlineColor,
  outlineWidth: item.bubble.outlineWidth,
  shadowOpacity: item.bubble.shadowOpacity,
  offsetX: item.bubble.offsetX,
  offsetY: item.bubble.offsetY,
  timeline: item.bubble.timeline,
};
const job = {
  id: 'preview-job', userId: 'preview-user', sourceImageUrl: previewImage, sourceStoragePath: 'preview/character.png', referenceImages: [], instruction: item.instruction, mode: 'generate', motionPreference: 'auto', resourceMode: 'efficient', aiGenerationProfile: 'gpt-light-v1', formats: ['apng', 'webp', 'gif', 'png_zip'], status: 'completed', progress: 100, statusMessage: '완성됐어요', projectId: project.id, projectItemId: item.id,
  outputProfile: { platform: 'line', type: 'animated', width: 320, height: 270, frameCount: 8, fps: 8, durationMs: 1000, loopCount: 1, transparentBackground: true, profileVersion: 'line-animated-apng-2026-08-05', profileVerification: 'verified', preferredFormat: 'apng', allowedFormats: ['apng', 'gif', 'webp', 'png_zip'], maxFileSizeBytes: 1048576 },
  plan: { directorSummary: '오른쪽으로 달리며 두 문구를 순서대로 외칩니다.', characterProfile: { summary: analysis.summary, immutableTraits: analysis.immutableLock, palette: analysis.attributes.palette, styleRules: analysis.styleLock, negativeRules: analysis.negativeLock }, action: { title: '달리며 외치기', emotion: '다급함', action: '오른쪽 달리기', intensity: 'normal', motionType: 'dynamic', renderMode: 'dynamic', durationMs: 1000, frameCount: 8, fps: 8, loopDescription: '자연스럽게 반복', imagePrompt: 'same character running right', videoPrompt: 'run cycle', negativePrompt: 'identity drift', authorizedProps: [], motionAccents: [] }, bubble: previewBubble, suggestedPresets: [] },
  spriteSheetGeneration: { strategy: 'sprite-sheet-v1', state: 'extracted', columns: 4, rows: 2, frameCount: 8, storagePath: 'preview/generated-sprite-sheet.png', url: previewImage, model: 'openai/gpt-image-1-mini', requestId: 'preview-sheet-request' },
  animationFrames: frames, compositedFrames: frames,
  outputs: { apng: { format: 'apng', url: previewImage, storagePath: 'preview/result.apng.png', fileName: 'line-animation.png', contentType: 'image/png', sizeBytes: 320000 }, webp: { format: 'webp', url: previewImage, storagePath: 'preview/result.webp', fileName: 'preview.webp', contentType: 'image/webp', sizeBytes: 280000 }, gif: { format: 'gif', url: previewImage, storagePath: 'preview/result.gif', fileName: 'preview.gif', contentType: 'image/gif', sizeBytes: 420000 }, png_zip: { format: 'png_zip', url: previewImage, storagePath: 'preview/frames.zip', fileName: 'frames.zip', contentType: 'application/zip', sizeBytes: 700000 } },
  specReport: { width: 320, height: 270, frameCount: 8, fps: 8, durationMs: 1000, loop: true, kakaoCanvasPass: true, kakaoFramePass: true, technicalPass: true, allOutputsPass: true },
  quality: { overall: 94, identity: 96, actionClarity: 93, styleConsistency: 95, backgroundClean: 100, singleCharacter: true, occlusionFree: 96, issues: [], correction: '' },
  openRouterActualCostUsd: 1.284, openRouterAuthorizedCostUsd: 4.3, openRouterUsageRequestCount: 13,
} as unknown as EmoticonJob;

const profileJob = { ...job, id: 'preview-profile', mode: 'profile', characterAnalysis: analysis, analysisMode: 'efficient', identityFingerprint: 'a'.repeat(64), status: 'completed' } as unknown as EmoticonJob;
const turn = { schemaVersion: 1, id: 'preview-turn', userId: 'preview-user', projectId: project.id, revisionReason: 'create', prompt: '오른쪽으로 달리면서 처음 4프레임은 “거기서!!”, 다음 4프레임은 “서란 말이야”라고 외치게 해줘.', intent: { action: '오른쪽으로 달리면서 외치기', direction: 'right', emotion: '다급함', expression: '입을 벌리고 외치는 표정', outputType: 'animated', quantity: 1, frameCount: 8, durationMs: 1000, loopMode: 'loop', targetPlatform: 'line', qualityMode: 'efficient', additionalReferenceAssetIds: [], textCues: item.bubble.timeline.cues }, characterProfileVersionId: 'preview-version', status: 'completed', cost: { currency: 'USD', estimatedMinUsd: 0.25, estimatedMaxUsd: 4.3, actualUsd: 1.284, estimatedCallsMin: 13, estimatedCallsMax: 18, actualCalls: 13 }, variants: [{ id: 'preview-variant', jobId: job.id, outputFormats: job.formats, status: 'completed', qualityScore: 94 }], errorCode: null, errorMessage: null } as EmoticonCreationTurn;

export default function EmoticonStudioPreviewFixture() {
  const [view, setView] = useState<'start' | 'dna' | 'manual' | 'chat' | 'editor'>('start');
  const [draftPrompt] = useState('');
  const [editorFrameIndex, setEditorFrameIndex] = useState<number | undefined>();
  const [advancedNotice, setAdvancedNotice] = useState('');
  return (
    <S.StudioRoot>
      <S.TopBar>
        <S.Brand><span>TEST</span><div><strong>Studio 개발 검증</strong><small>데이터를 저장하지 않습니다</small></div></S.Brand>
        <S.StepNav aria-label="Studio 상위 단계"><li data-complete="true">1 준비</li><li data-active="true">2 제작</li><li>3 검토·내보내기</li></S.StepNav>
        <S.TopActions data-preview-actions>{(['start', 'dna', 'manual', 'chat', 'editor'] as const).map((name) => <S.Button key={name} data-testid={`preview-${name}`} type="button" $variant={view === name ? 'primary' : 'secondary'} onClick={() => { if (name === 'editor') setEditorFrameIndex(undefined); setView(name); }}>{name === 'start' ? '시작' : name === 'dna' ? 'DNA' : name === 'manual' ? '사진 작업' : name === 'chat' ? '결과' : '편집'}</S.Button>)}</S.TopActions>
      </S.TopBar>
      {view !== 'start' && view !== 'editor' ? <StudioUsageGuide currentStep={view === 'dna' ? 0 : view === 'chat' ? 2 : 1} manual={view === 'manual'} /> : null}
      {view === 'start' ? <StudioStartHub pending={false} hasProjects onOpenProjects={() => setView('chat')} onStartAi={async () => { setView('dna'); return true; }} onStartManual={async () => { setView('manual'); return true; }} /> : null}
      {view === 'dna' ? <CharacterSetupStep project={project} analysisJob={profileJob} pending={false} resourceMode="efficient" rightsAttested onResourceModeChange={() => undefined} onRightsAttestedChange={() => undefined} onAddReferences={async () => undefined} onRemoveReference={async () => undefined} onReferenceRoleChange={async () => undefined} onAnalyze={async () => undefined} onApprove={async () => undefined} /> : null}
      {view === 'manual' ? <S.Workspace><ManualAnimationWorkspace project={manualProject} seed={null} pending={false} onSubmit={async () => true} onSeedConsumed={() => undefined} /></S.Workspace> : null}
      {view === 'chat' ? (
        <S.Workspace>
          <CreationComposer project={project} pending={false} ready hasTurns forceApproval initialPrompt={draftPrompt} onSubmit={async () => undefined} />
          <CreationResultCard
            turn={turn}
            jobs={[job]}
            pending={false}
            selectedJobId={job.id}
            onSelectJob={() => undefined}
            onCancel={async () => undefined}
            onRetry={async () => undefined}
            onDownload={async () => undefined}
            onOpenEditor={(_, frameIndex) => { setEditorFrameIndex(frameIndex); setView('editor'); }}
          />
          <AdvancedProjectTools
            project={project}
            pending={false}
            onExport={() => ({ fileName: 'preview-project.json', text: '{}' })}
            onImport={async () => {
              setAdvancedNotice('미리보기에서는 프로젝트를 저장하지 않습니다.');
              return true;
            }}
            onOpenHistory={() => setAdvancedNotice('미리보기에서는 작업 이력을 열지 않습니다.')}
            onDelete={async () => {
              setAdvancedNotice('개발 검증 화면에서는 프로젝트를 삭제하지 않습니다.');
              return false;
            }}
          />
          {advancedNotice ? <S.Notice $tone="info" role="status"><span>{advancedNotice}</span></S.Notice> : null}
        </S.Workspace>
      ) : null}
      {view === 'editor' ? <ProfessionalEditor userId="preview-user" project={project} item={item} job={job} initialFrameIndex={editorFrameIndex} recentJobs={[job]} pending={false} readOnly allowLocalImportPreview onClose={() => setView('chat')} onQueued={() => setView('chat')} /> : null}
    </S.StudioRoot>
  );
}
