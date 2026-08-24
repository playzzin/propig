import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nodeCommand = process.execPath;
const stripTypes = ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--experimental-strip-types'];

const steps = [
  [
    'Functions 단일 빌드',
    nodeCommand,
    ['functions/node_modules/typescript/bin/tsc', '-p', 'functions/tsconfig.json'],
  ],
  ['Cost/time resource mode', nodeCommand, ['scripts/verify-emoticon-resource-mode.mjs']],
  ['Network-free mock provider', nodeCommand, ['scripts/verify-emoticon-mock-provider.mjs']],
  ['OpenRouter image route cache', nodeCommand, ['scripts/verify-emoticon-image-route-cache.mjs']],
  ['Firestore 보안 경계', nodeCommand, ['scripts/verify-firestore-boundary.mjs']],
  ['프로젝트 v2', nodeCommand, ['scripts/verify-emoticon-project-v2.mjs']],
  ['통합 Studio UI', nodeCommand, ['scripts/verify-emoticon-studio-ui-contract.mjs']],
  ['Studio draft persistence', nodeCommand, ['scripts/verify-emoticon-studio-drafts.mjs']],
  ['공통 데이터 모델·편집형 플랫폼 정책', nodeCommand, [...stripTypes, 'scripts/verify-emoticon-data-model-platform-policies.mjs']],
  ['프로젝트 이미지 보관함', nodeCommand, [...stripTypes, 'scripts/verify-emoticon-asset-library.mjs']],
  ['V2 타임라인 Firestore 영속성', nodeCommand, [...stripTypes, 'scripts/verify-emoticon-timeline-persistence.mjs']],
  ['V2 Playwright user flow', nodeCommand, ['scripts/verify-emoticon-ui-playwright.mjs']],
  ['자연어 생성 의도 런타임', nodeCommand, ['scripts/verify-emoticon-creation-intent-runtime.mjs']],
  ['프로젝트 기획 작업 추적', nodeCommand, [...stripTypes, 'scripts/verify-emoticon-project-planning-tracking.mjs']],
  ['작업 복구', nodeCommand, [...stripTypes, 'scripts/verify-emoticon-job-recovery.mjs']],
  ['프레임 모션', nodeCommand, ['scripts/verify-emoticon-motion-integrity.mjs']],
  ['플랫폼 규격', nodeCommand, [...stripTypes, 'scripts/verify-emoticon-platform-contract.mjs']],
  ['제출 패키지', nodeCommand, [...stripTypes, 'scripts/verify-emoticon-submission-package.mjs']],
  ['내보내기 사전 검사', nodeCommand, [...stripTypes, 'scripts/verify-emoticon-export-preflight.mjs']],
  ['렌더러', nodeCommand, ['scripts/verify-emoticon-renderer-runtime.mjs']],
  ['이미지 편집', nodeCommand, ['scripts/verify-emoticon-image-editing.mjs']],
  ['프로젝트 삭제', nodeCommand, ['scripts/verify-emoticon-project-deletion.mjs']],
  ['원본 업로드 생명주기', nodeCommand, ['scripts/verify-emoticon-source-lifecycle.mjs']],
  ['배치 생명주기', nodeCommand, [...stripTypes, 'scripts/verify-emoticon-batch-lifecycle.mjs']],
  ['결과 이력', nodeCommand, [...stripTypes, 'scripts/verify-emoticon-result-history.mjs']],
  ['전체 작업 이력·삭제', nodeCommand, ['scripts/verify-emoticon-job-history-management.mjs']],
  ['캐릭터 프로필', nodeCommand, ['scripts/verify-emoticon-character-profile.mjs']],
  ['모바일 UX', nodeCommand, ['scripts/verify-emoticon-mobile-ux.mjs']],
  ['간편 생성', nodeCommand, ['scripts/verify-emoticon-simple-mode.mjs']],
  ['실제 원본 업로드', nodeCommand, ['scripts/verify-emoticon-live-upload.mjs']],
  ['수동 프레임', nodeCommand, ['scripts/verify-emoticon-manual-frame-import.mjs']],
  ['말풍선', nodeCommand, ['scripts/verify-emoticon-bubble-controls.mjs']],
  ['OpenRouter 생성 안전성', nodeCommand, ['scripts/verify-emoticon-openrouter-safety.mjs']],
  ['OpenRouter 일별 호출 비용 게이트', nodeCommand, ['scripts/verify-emoticon-openrouter-daily-cost-gate.mjs']],
  ['OpenRouter 불확실 비용 정산', nodeCommand, ['scripts/verify-openrouter-usage-reconciliation.mjs']],
  ['품질 검사실', nodeCommand, ['scripts/verify-emoticon-quality-lab.mjs']],
];

for (const [label, command, args] of steps) {
  console.log(`\n[Emoticon Studio] ${label}`);
  const maxAttempts = label === 'Functions 단일 빌드' ? 3 : 1;
  let passed = false;
  let exitStatus = 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = spawnSync(command, args, {
      cwd: root,
      env: process.env,
      stdio: 'inherit',
    });
    if (result.error) throw result.error;
    exitStatus = result.status ?? 1;
    if (result.status === 0) {
      passed = true;
      break;
    }
    if (attempt < maxAttempts) {
      console.warn(`[Emoticon Studio] ${label} 파일 잠금 가능성으로 재시도 (${attempt + 1}/${maxAttempts})…`);
    }
  }
  if (!passed) {
    console.error(`[Emoticon Studio] ${label} 검증 실패 (exit ${String(exitStatus)}).`);
    process.exit(exitStatus);
  }
}

console.log(`\nEmoticon Studio 전체 검증 통과 (${steps.length}단계, Functions 빌드 1회).`);
