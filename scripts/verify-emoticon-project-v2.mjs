import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relativePath) => fs.readFileSync(path.join(rootDirectory, relativePath), 'utf8');

const projectService = readSource('src/services/emoticonProjectService.ts');
const projectSchema = readSource('src/schemas/emoticonProject.ts');
const studioV2Schema = readSource('src/schemas/emoticonStudioV2.ts');
const platformProfiles = readSource('src/lib/emoticonPlatformProfiles.ts');
const studioService = readSource('src/services/emoticonStudioService.ts');
const studioSchema = readSource('src/schemas/emoticonStudio.ts');
const functionsSchema = readSource('functions/src/emoticonStudio/schema.ts');
const studioRoute = readSource('src/app/admin/emoticon-studio/page.tsx');
const studioPage = readSource('src/app/admin/emoticon-studio/studio/EmoticonStudioPage.tsx');
const studioHook = readSource('src/app/admin/emoticon-studio/studio/useEmoticonStudio.ts');
const advancedProjectTools = readSource('src/app/admin/emoticon-studio/studio/AdvancedProjectTools.tsx');
const projectDeletionClient = readSource('src/services/emoticonProjectDeletionService.ts');
const projectDeletionBackend = readSource('functions/src/emoticonStudio/deleteProject.ts');
const jobTrigger = readSource('functions/src/triggers/onEmoticonJobCreated.ts');
const firestoreRules = readSource('firestore.rules');

const passed = [];
const failures = [];

function contract(name, condition, failureMessage) {
  if (condition) {
    passed.push(name);
  } else {
    failures.push(`[${name}] ${failureMessage}`);
  }
}

function contains(name, source, pattern, failureMessage) {
  contract(name, pattern.test(source), failureMessage);
}

function excludes(name, source, pattern, failureMessage) {
  contract(name, !pattern.test(source), failureMessage);
}

function sourceSection(source, startMarker, endMarker, name) {
  const startIndex = source.indexOf(startMarker);
  if (startIndex < 0) {
    failures.push(`[${name}] 시작 표식 '${startMarker}'을 찾지 못했습니다.`);
    return '';
  }
  const endIndex = source.indexOf(endMarker, startIndex + startMarker.length);
  if (endIndex < 0) {
    failures.push(`[${name}] 종료 표식 '${endMarker}'을 찾지 못했습니다.`);
    return source.slice(startIndex);
  }
  return source.slice(startIndex, endIndex);
}

const createProject = sourceSection(
  projectService,
  'export async function createEmoticonProject(',
  'type ProjectUpdate',
  '프로젝트 생성 함수',
);
const createProjectDocumentWrite = sourceSection(
  createProject,
  'batch.set(projectDocument',
  'items.forEach',
  '프로젝트 문서 생성 쓰기',
);
const projectUpdateType = sourceSection(
  projectService,
  'type ProjectUpdate',
  'export async function updateEmoticonProject(',
  '프로젝트 부분 수정 타입',
);
const updateProject = sourceSection(
  projectService,
  'export async function updateEmoticonProject(',
  'export type EmoticonProjectItemUpdate',
  '프로젝트 부분 수정 함수',
);
const itemUpdateType = sourceSection(
  projectService,
  'export type EmoticonProjectItemUpdate',
  'export async function updateEmoticonProjectItem(',
  '항목 부분 수정 타입',
);
const updateItem = sourceSection(
  projectService,
  'export async function updateEmoticonProjectItem(',
  'export async function replaceEmoticonProjectItems(',
  '항목 부분 수정 함수',
);
const replaceItems = sourceSection(
  projectService,
  'export async function replaceEmoticonProjectItems(',
  'export async function reconfigureEmoticonProject(',
  '항목 전체 교체 함수',
);
const replaceExistingItemUpdate = sourceSection(
  replaceItems,
  'transaction.update(itemRef, {',
  '});',
  '기존 항목 순서 수정 데이터',
);
const reconfigureProject = sourceSection(
  projectService,
  'export async function reconfigureEmoticonProject(',
  'async function migrateLegacyProjectItems(',
  '프로젝트 규격 재설정 함수',
);
const linkCompletedProjectJob = sourceSection(
  projectService,
  'export async function linkCompletedEmoticonProjectJob(',
  'async function migrateLegacyProjectItems(',
  '완성 작업 대표 연결 함수',
);
const migrateLegacy = sourceSection(
  projectService,
  'async function migrateLegacyProjectItems(',
  'export function subscribeEmoticonProjectItems(',
  '레거시 항목 마이그레이션 함수',
);
const subscribeItems = sourceSection(
  projectService,
  'export function subscribeEmoticonProjectItems(',
  'export async function duplicateEmoticonProject(',
  '항목 구독 함수',
);
const duplicateProject = sourceSection(
  projectService,
  'export async function duplicateEmoticonProject(',
  'export function subscribeEmoticonProjects(',
  '프로젝트 복제 함수',
);
const duplicateProjectDocument = sourceSection(
  duplicateProject,
  'const projectWithoutItems =',
  'const batch = writeBatch(db)',
  '복제 프로젝트 문서 데이터',
);
const importProject = sourceSection(
  projectService,
  'export async function importEmoticonProject(',
  'export function subscribeEmoticonProjects(',
  '프로젝트 JSON 불러오기 함수',
);
const portableProjectMapper = sourceSection(
  projectService,
  'export function createPortableEmoticonProject(',
  'function parsePortableOrLegacyProject(',
  '휴대형 프로젝트 변환 함수',
);
const portableOrLegacyParser = sourceSection(
  projectService,
  'function parsePortableOrLegacyProject(',
  '/**\n * Imports portable v1 JSON',
  '휴대형·레거시 프로젝트 파서',
);
const portableProjectSchema = sourceSection(
  projectSchema,
  'export const emoticonProjectPortableSchema =',
  'export type EmoticonProject =',
  '휴대형 프로젝트 스키마',
);
const normalizeProject = sourceSection(
  projectService,
  'function normalizeProjectValue(',
  'function parseProject(',
  '레거시 프로젝트 정규화 함수',
);

contains(
  'v2 스키마',
  projectSchema,
  /schemaVersion:\s*z\.literal\(2\)/,
  '프로젝트 스키마가 schemaVersion 2를 강제해야 합니다.',
);
contains(
  'V2 프로젝트 메타데이터 연결',
  projectSchema,
  /v2:\s*emoticonStudioV2ProjectMetadataSchema\.optional\(\)/,
  '기존 프로젝트가 optional V2 메타데이터를 읽을 수 있어야 합니다.',
);
for (const [name, pattern] of [
  ['캐릭터 프로필 버전', /emoticonCharacterProfileVersionSchema/],
  ['캐릭터 잠금', /emoticonCharacterIdentityLockSchema/],
  ['자산 출처', /emoticonAssetProvenanceSchema/],
  ['제작 대화 턴', /emoticonCreationTurnSchema/],
  ['생성 variant', /emoticonGeneratedVariantSchema/],
  ['애니메이션 타임라인', /emoticonAnimationTimelineSchema/],
  ['텍스트 cue 트랙', /emoticonTextCueTrackSchema/],
  ['비용 snapshot', /emoticonCostSnapshotSchema/],
  ['품질 검증 보고서', /emoticonValidationReportSchema/],
  ['정책 snapshot', /emoticonPolicySnapshotSchema/],
]) {
  contains(
    `V2 ${name}`,
    studioV2Schema,
    pattern,
    `V2 계약에 ${name} 모델이 필요합니다.`,
  );
}
contains(
  'V2 기존 프로젝트 기본값 adapter',
  studioV2Schema,
  /resolveEmoticonStudioV2ProjectMetadata[\s\S]*?createDefaultEmoticonStudioV2ProjectMetadata/,
  'V2 필드가 없는 기존 프로젝트를 위한 안전한 기본값 adapter가 필요합니다.',
);
contract(
  '클라이언트·Functions APNG 형식 일치',
  /EMOTICON_EXPORT_FORMATS\s*=\s*\[[^\]]*'apng'/.test(studioSchema)
    && /EMOTICON_EXPORT_FORMATS\s*=\s*\[[^\]]*'apng'/.test(functionsSchema),
  '클라이언트와 Functions 출력 형식에 모두 APNG가 포함되어야 합니다.',
);
contains(
  '프로젝트 revision',
  projectSchema,
  /revision:\s*z\.number\(\)\.int\(\)\.nonnegative\(\)/,
  '프로젝트 스키마에 음수가 아닌 revision이 필요합니다.',
);
contains(
  '항목 revision',
  projectSchema,
  /emoticonProjectItemSchema[\s\S]*?revision:\s*z\.number\(\)\.int\(\)\.nonnegative\(\)/,
  '프로젝트 항목 스키마에 음수가 아닌 revision이 필요합니다.',
);

contains(
  '생성 원자 배치',
  createProject,
  /const batch = writeBatch\(db\)[\s\S]*?await batch\.commit\(\)/,
  '프로젝트 문서와 초기 항목은 하나의 writeBatch로 생성해야 합니다.',
);
contains(
  '생성 항목 하위 컬렉션',
  createProject,
  /items\.forEach[\s\S]*?batch\.set\(projectItemDocument\(/,
  '초기 항목을 프로젝트 items 하위 컬렉션에 batch.set 해야 합니다.',
);
contains(
  '생성 프로젝트 문서',
  createProjectDocumentWrite,
  /schemaVersion:\s*2[\s\S]*?revision:\s*0/,
  '새 프로젝트 문서에 schemaVersion 2와 revision 0을 저장해야 합니다.',
);
excludes(
  '프로젝트 문서 embedded items 금지',
  createProjectDocumentWrite,
  /(?:^|[,\n]\s*)items\s*:/m,
  '새 프로젝트 문서에 전체 items 배열을 저장하면 안 됩니다.',
);
contains(
  '프로젝트 수정 items 제외',
  projectUpdateType,
  /\|\s*'items'/,
  '프로젝트 부분 수정 타입에서 embedded items 필드를 제외해야 합니다.',
);
contains(
  '프로젝트 부분 수정 transaction',
  updateProject,
  /runTransaction\(db,[\s\S]*?transaction\.get\(ref\)[\s\S]*?transaction\.update\(ref/,
  '프로젝트 부분 수정은 현재 문서를 읽는 transaction이어야 합니다.',
);
contains(
  '프로젝트 중첩 필드 병합',
  updateProject,
  /current\.character[\s\S]*?current\.generationSettings[\s\S]*?current\.spec/,
  'character, generationSettings, spec 부분 수정 시 기존 중첩 값을 보존해야 합니다.',
);
contains(
  '프로젝트 revision 증가',
  updateProject,
  /revision:\s*current\.revision\s*\+\s*1/,
  '프로젝트 transaction 수정마다 revision을 1 증가시켜야 합니다.',
);

contains(
  '항목 수정 불변 필드 제외',
  itemUpdateType,
  /\|\s*'id'[\s\S]*?\|\s*'revision'[\s\S]*?\|\s*'order'/,
  '항목 부분 수정 타입에서 id, revision, order를 직접 수정하지 못하게 해야 합니다.',
);
contains(
  '항목 수정 서버 상태 필드 제외',
  itemUpdateType,
  /\|\s*'jobId'[\s\S]*?\|\s*'generationStatus'[\s\S]*?\|\s*'validationErrors'/,
  '일반 항목 편집 타입에서 서버 소유 jobId, generationStatus, validationErrors를 직접 수정하지 못하게 해야 합니다.',
);
contains(
  '항목 부분 수정 transaction',
  updateItem,
  /runTransaction\(db,[\s\S]*?transaction\.get\(ref\)[\s\S]*?transaction\.set\(ref,[\s\S]*?merge:\s*true/,
  '항목 부분 수정은 현재 항목을 읽고 merge하는 transaction이어야 합니다.',
);
contains(
  '항목 motion·bubble·timeline 병합',
  updateItem,
  /(?=[\s\S]*current\.motion)(?=[\s\S]*current\.bubble)(?=[\s\S]*current\.bubble\.timeline)/,
  '항목 부분 수정은 motion, bubble, bubble.timeline의 기존 값을 보존해야 합니다.',
);
contains(
  '항목 revision 증가',
  updateItem,
  /revision:\s*current\.revision\s*\+\s*1/,
  '항목 transaction 수정마다 revision을 1 증가시켜야 합니다.',
);
contains(
  '항목 저장 전 스키마 검증',
  updateItem,
  /emoticonProjectItemSchema\.safeParse\(candidate\)/,
  'transaction.set 전에 수정된 항목을 Zod 스키마로 검증해야 합니다.',
);

contains(
  '레거시 embedded items 읽기',
  normalizeProject,
  /Array\.isArray\(value\.items\)[\s\S]*?normalizeLegacyItem/,
  '기존 프로젝트 문서의 embedded items를 마이그레이션 입력으로 읽어야 합니다.',
);
contains(
  '레거시 항목 하위 컬렉션 이관',
  migrateLegacy,
  /runTransaction\(db,[\s\S]*?transaction\.get\(projectRef\)[\s\S]*?transaction\.set\(itemRefs\[index\]/,
  '레거시 항목을 기존 항목 존재 여부를 확인하는 transaction으로 이관해야 합니다.',
);
contains(
  '레거시 embedded items 삭제',
  migrateLegacy,
  /items:\s*deleteField\(\)/,
  '하위 컬렉션 이관과 같은 batch에서 프로젝트 문서의 items 필드를 deleteField 해야 합니다.',
);
contains(
  '레거시 revision 증가',
  migrateLegacy,
  /currentRevision[\s\S]*?transaction\.update\(projectRef,[\s\S]*?revision:\s*currentRevision\s*\+\s*1/,
  '레거시 마이그레이션은 transaction에서 최신 프로젝트 revision을 증가시켜야 합니다.',
);
contains(
  '레거시 자동 마이그레이션 연결',
  subscribeItems,
  /snapshot\.empty\s*&&\s*params\.legacyItems\?\.length[\s\S]*?migrateLegacyProjectItems\(/,
  '하위 컬렉션이 비어 있고 legacyItems가 있으면 마이그레이션을 한 번 시작해야 합니다.',
);

contains(
  '항목 교체 하위 컬렉션 조회',
  replaceItems,
  /getDocs\(projectItemsCollection\(/,
  '항목 교체는 기존 items 하위 컬렉션을 조회해야 합니다.',
);
contains(
  '항목 교체 transaction',
  replaceItems,
  /runTransaction\(db,[\s\S]*?transaction\.get\(projectRef\)[\s\S]*?transaction\.get\(snapshot\.ref\)/,
  '항목 교체는 프로젝트와 기존 항목을 함께 읽는 transaction이어야 합니다.',
);
contains(
  '항목 교체 삭제·신규 생성',
  replaceItems,
  /transaction\.delete\(snapshot\.ref\)[\s\S]*?if \(!snapshot\)[\s\S]*?transaction\.set\(itemRef/,
  '항목 교체는 제거된 문서를 삭제하고 새 항목만 새 문서로 만들어야 합니다.',
);
contains(
  '항목 교체 revision 충돌 방지',
  replaceItems,
  /expectedProjectRevision\?:\s*number[\s\S]*?currentProjectRevision[\s\S]*?params\.expectedProjectRevision[\s\S]*?throw new Error/,
  '여러 화면의 구조 변경이 겹치지 않도록 예상 프로젝트 revision을 transaction에서 검사해야 합니다.',
);
contains(
  '항목 교체 기존 필드 최소 수정',
  replaceExistingItemUpdate,
  /order:\s*item\.order[\s\S]*?revision:\s*currentRevision\s*\+\s*1/,
  '기존 항목은 순서와 revision만 수정해야 합니다.',
);
excludes(
  '항목 교체 편집·작업 상태 보존',
  replaceExistingItemUpdate,
  /\b(?:title|emotion|action|motion|bubble|instruction|negativePrompt|jobId|generationStatus|validationErrors)\s*:/,
  '구조 변경이 기존 편집 내용이나 서버 소유 작업 상태를 덮어쓰면 안 됩니다.',
);
contains(
  '항목 교체 프로젝트 요약 갱신',
  replaceItems,
  /transaction\.update\(projectRef,[\s\S]*?itemCount:\s*parsedItems\.length[\s\S]*?revision:\s*currentProjectRevision\s*\+\s*1/,
  '항목 교체 transaction에서 프로젝트 itemCount와 revision을 함께 갱신해야 합니다.',
);
contains(
  '항목 교체 생성 중 삭제 차단',
  replaceItems,
  /status === 'queued' \|\| status === 'generating'[\s\S]*?throw new Error/,
  '생성 중인 항목을 구조 변경으로 삭제하지 못하게 해야 합니다.',
);
contains(
  '규격 변경 작업 연결 해제',
  reconfigureProject,
  /jobId:\s*null[\s\S]*?generationStatus:\s*'planned'[\s\S]*?validationErrors:\s*\[\]/,
  '플랫폼·종류·출력 규격 변경 시 항목의 이전 작업 연결을 원자적으로 해제해야 합니다.',
);
excludes(
  '규격 변경 서버 요약 필드 보호',
  reconfigureProject,
  /\b(?:lastItemJobId|lastItemStatus)\s*:/,
  '클라이언트 규격 변경이 서버 소유 프로젝트 작업 요약 필드를 덮어쓰면 안 됩니다.',
);
contains(
  '규격 변경 생성 중 차단',
  reconfigureProject,
  /status === 'queued' \|\| status === 'generating'[\s\S]*?throw new Error/,
  '생성 중인 항목이 있으면 규격 변경 transaction을 중단해야 합니다.',
);
contains(
  '프로젝트 삭제 서버 전용 경계',
  projectDeletionClient,
  /httpsCallable<[\s\S]*?deleteEmoticonProjectSafely/,
  '프로젝트 삭제는 클라이언트 직접 문서 삭제가 아니라 서버 callable을 사용해야 합니다.',
);
contains(
  '프로젝트 삭제 생성 중 차단',
  projectDeletionBackend,
  /hasWorkingItem \|\| hasWorkingJob[\s\S]*?failed-precondition/,
  '서버 삭제 경계가 생성 중 항목과 작업을 모두 확인해야 합니다.',
);
contains(
  '프로젝트 삭제 범위 명시 선택',
  advancedProjectTools,
  /project_only[\s\S]*?project_and_assets[\s\S]*?project-deletion-confirmation/,
  '삭제 UI에서 프로젝트만/전용 생성 파일 포함 범위를 구분하고 프로젝트 이름 확인을 받아야 합니다.',
);
excludes(
  '클라이언트 직접 프로젝트 삭제 제거',
  projectService,
  /export async function deleteEmoticonProject\(/,
  '프로젝트 서비스에 클라이언트 직접 삭제 함수가 남아 있으면 안 됩니다.',
);
contains(
  '프로젝트 복제 항목 초기화',
  duplicateProject,
  /sourceItems\.map[\s\S]*?id:\s*crypto\.randomUUID\(\)[\s\S]*?revision:\s*0[\s\S]*?jobId:\s*null[\s\S]*?generationStatus:\s*'planned'/,
  '복제 항목은 새 ID, revision 0, jobId null, planned 상태로 초기화해야 합니다.',
);
excludes(
  '복제 프로젝트 embedded items 금지',
  duplicateProjectDocument,
  /(?:^|[,\n]\s*)items\s*:/m,
  '복제 프로젝트 문서 데이터에 전체 items 배열을 포함하면 안 됩니다.',
);
contains(
  '프로젝트 복제 하위 컬렉션 batch',
  duplicateProject,
  /batch\.set\(projectDocument[\s\S]*?items\.forEach[\s\S]*?batch\.set\(projectItemDocument[\s\S]*?await batch\.commit\(\)/,
  '복제 프로젝트 문서와 복제 항목 하위 컬렉션을 같은 batch로 저장해야 합니다.',
);
contains(
  '휴대형 JSON 버전 계약',
  portableProjectSchema,
  /format:\s*z\.literal\(EMOTICON_PROJECT_PORTABLE_FORMAT\)[\s\S]*?version:\s*z\.literal\(EMOTICON_PROJECT_PORTABLE_VERSION\)/,
  '휴대형 JSON은 식별 가능한 format과 version을 강제해야 합니다.',
);
contains(
  '휴대형 JSON 참조 이미지 제외',
  portableProjectSchema,
  /character:\s*emoticonProjectCharacterSchema\.omit\(\{[\s\S]{0,220}?references:\s*true[\s\S]{0,220}?\}\)/,
  '휴대형 JSON 스키마는 소유권을 검증할 수 없는 참조 이미지를 제외해야 합니다.',
);
excludes(
  '휴대형 JSON 내부 상태 제외',
  portableProjectMapper,
  /\b(?:userId|schemaVersion|revision|createdAt|updatedAt|jobId|generationStatus|validationErrors|sourceImageUrl|sourceStoragePath|downloadUrl|storagePath)\s*:/,
  '휴대형 JSON 변환 결과에 소유자, 내부 ID/revision, 작업 상태, 오류, URL 또는 Storage 경로가 포함되면 안 됩니다.',
);
contains(
  'JSON 불러오기 휴대형·레거시 검증',
  portableOrLegacyParser,
  /emoticonProjectPortableSchema\.safeParse\(value\)[\s\S]*?emoticonProjectSchema\.safeParse\(value\)/,
  '업로드된 JSON은 휴대형 v1을 우선 검증하고 이전 전체 프로젝트 형식도 안전하게 변환해야 합니다.',
);
contains(
  'JSON 내보내기 휴대형 DTO 사용',
  studioHook,
  /const portable = createPortableEmoticonProject\(project\)[\s\S]*?JSON\.stringify\(portable/,
  '통합 Studio는 검증된 휴대형 DTO를 JSON으로 직렬화해야 합니다.',
);
contains(
  '단일 정식 Studio 라우트',
  studioRoute,
  /return <EmoticonStudioPage\s*\/>/,
  '정식 라우트는 통합 Studio만 렌더링해야 합니다.',
);
excludes(
  '레거시 Studio 라우트 제거',
  studioRoute,
  /LegacyEmoticonStudioPage|ProjectItemBoard|ProjectSettingsSidebar|legacy=1/,
  '정식 라우트에 구형 Studio 분기가 남아 있으면 안 됩니다.',
);
contains(
  '관리자 접근 훅 사용',
  studioHook,
  /const access = useAdminAccess\(\)[\s\S]*?currentUser, isAdmin/,
  '통합 Studio는 로그인 여부뿐 아니라 관리자 권한을 확인해야 합니다.',
);
contains(
  '관리자 접근 3상태 렌더',
  studioPage,
  /isCheckingAdmin[\s\S]*?!studio\.access\.currentUser[\s\S]*?!studio\.access\.isAdmin/,
  '권한 확인 중, 로그인 필요, 관리자 거부 상태를 분리해야 합니다.',
);
contains(
  '프로젝트 구독 관리자 게이트',
  studioHook,
  /if \(!currentUser \|\| !isAdmin\)[\s\S]{0,700}?subscribeEmoticonProjects\(/,
  '관리자 확인 전에는 프로젝트 구독을 시작하면 안 됩니다.',
);
contains(
  '최근 작업 구독 사용자 게이트',
  studioHook,
  /if \(!currentUser\) return;[\s\S]{0,160}?subscribeRecentEmoticonJobs\(/,
  '로그인 확인 전에는 최근 작업 구독을 시작하면 안 됩니다.',
);
contains(
  '항목 구독 프로젝트 게이트',
  studioHook,
  /if \(!currentUser \|\| !activeProjectBase\)[\s\S]{0,320}?subscribeEmoticonProjectItems\(/,
  '사용자와 활성 프로젝트가 준비되기 전에는 항목 구독을 시작하면 안 됩니다.',
);
contains(
  '추적 작업 bounded 구독',
  studioHook,
  /subscribeEmoticonJobs\(\{[\s\S]{0,180}?jobIds:\s*trackedJobIds[\s\S]{0,120}?onChange:\s*setTrackedJobs/,
  'Turn과 프로필에 연결된 작업만 bounded 구독해야 합니다.',
);
contains(
  '생성 중 UI 잠금 전달',
  studioPage,
  /<CreationComposer[\s\S]{0,220}?pending=\{studio\.pending\}[\s\S]*?<AdvancedProjectTools[\s\S]{0,180}?pending=\{studio\.pending\}/,
  '생성·저장 중에는 Composer와 고급 프로젝트 도구가 같은 잠금 상태를 사용해야 합니다.',
);
contains(
  '프로젝트 삭제 생성 중 클라이언트 차단',
  studioHook,
  /const hasWorkingJob = recentJobs\.some[\s\S]{0,420}?진행 중인 생성 작업이 끝나거나 취소된 뒤/,
  '진행 중 작업이 있으면 삭제 callable을 시작하기 전에 차단해야 합니다.',
);
contains(
  '프로젝트 삭제 안전 callable 사용',
  studioHook,
  /deleteEmoticonProjectSafely\(\{ projectId: project\.id, mode \}\)/,
  '새 Studio 삭제 UI는 서버의 멱등 안전 삭제 callable만 사용해야 합니다.',
);
contains(
  '업로드 관리자 게이트',
  studioHook,
  /const createProject = useCallback[\s\S]{0,300}?if \(!currentUser \|\| !isAdmin \|\| pending\) return false;[\s\S]{0,1600}?uploadEmoticonSource\(/,
  '파일 업로드는 관리자 확인 후에만 실행해야 합니다.',
);
excludes(
  '클라이언트 작업 상태 미러 금지',
  studioHook,
  /update:\s*\{\s*generationStatus:\s*nextStatus,\s*validationErrors:\s*nextErrors\s*\}/,
  '완료·실패 작업 상태를 클라이언트 effect가 미러링하면 안 됩니다.',
);
contains(
  '대표 결과 서비스 원자 검증',
  linkCompletedProjectJob,
  /runTransaction\(db,[\s\S]*?transaction\.get\(itemRef\)[\s\S]*?transaction\.get\(jobRef\)[\s\S]*?job\.data\.userId !== params\.userId[\s\S]*?job\.data\.status !== 'completed'[\s\S]*?job\.data\.projectId !== params\.projectId[\s\S]*?job\.data\.projectItemId !== params\.itemId[\s\S]*?transaction\.update\(itemRef/,
  '대표 결과 연결은 같은 소유자·프로젝트·항목의 완료 작업인지 transaction에서 검증해야 합니다.',
);
contains(
  '대표 결과 서비스 사용',
  studioHook,
  /linkCompletedEmoticonProjectJob\(\{[\s\S]{0,180}?jobId:\s*job\.id/,
  '통합 Studio는 완료 작업을 대표 결과 전용 서비스로 연결해야 합니다.',
);
contains(
  'JSON 불러오기 소유권 초기화',
  importProject,
  /id:\s*projectId[\s\S]*?userId:\s*params\.userId[\s\S]*?revision:\s*0/,
  '불러온 프로젝트는 새 ID, 현재 사용자, revision 0으로 초기화해야 합니다.',
);
contains(
  'JSON 불러오기 Storage 참조 제거',
  importProject,
  /character:\s*\{[\s\S]*?references:\s*\[\]/,
  '소유권을 검증할 수 없는 캐릭터 Storage 참조를 제거해야 합니다.',
);
contains(
  'JSON 불러오기 작업 상태 제거',
  importProject,
  /jobId:\s*null[\s\S]*?generationStatus:\s*'planned'[\s\S]*?validationErrors:\s*\[\]/,
  '불러온 항목의 jobId, 생성 상태, 검증 오류를 신뢰하지 말고 초기화해야 합니다.',
);
contains(
  'JSON 불러오기 새 문서 충돌 방지',
  importProject,
  /runTransaction\(db,[\s\S]*?transaction\.get\(ref\)[\s\S]*?existing\.exists\(\)[\s\S]*?transaction\.set\(ref/,
  '새 프로젝트 문서가 이미 있으면 덮어쓰지 않는 transaction이어야 합니다.',
);

const kakaoProfiles = sourceSection(
  platformProfiles,
  'kakao: {',
  'line: {',
  '카카오 플랫폼 프로필',
);
const kakaoAnimated = sourceSection(
  kakaoProfiles,
  'animated: {',
  'static: {',
  '카카오 움직이는 프로필',
);
const kakaoStatic = sourceSection(
  kakaoProfiles,
  'static: {',
  '},\n  },',
  '카카오 정적 프로필',
);
contains(
  '공용 플랫폼 프로필 사용',
  projectService,
  /import\s*\{\s*getEmoticonPlatformProfile\s*\}\s*from\s*'@\/lib\/emoticonPlatformProfiles'/,
  '프로젝트 서비스가 공용 플랫폼 프로필 모듈을 사용해야 합니다.',
);
contains(
  '정적 PNG 우선 형식',
  kakaoStatic,
  /allowedFormats:\s*\['png'\][\s\S]*?preferredFormat:\s*'png'/,
  '카카오 정적 프로필의 허용·우선 형식은 PNG여야 합니다.',
);
contains(
  '움직이는 WebP 우선 형식',
  kakaoAnimated,
  /allowedFormats:\s*\[[^\]]*'webp'[^\]]*\][\s\S]*?preferredFormat:\s*'webp'/,
  '카카오 움직이는 프로필은 WebP를 허용하고 우선 형식으로 사용해야 합니다.',
);
contains(
  '카카오 움직이는 캔버스',
  kakaoAnimated,
  /width:\s*360[\s\S]*?height:\s*360/,
  '카카오 움직이는 프로필의 캔버스 계약은 360×360이어야 합니다.',
);
contains(
  '카카오 움직이는 최대 프레임',
  kakaoAnimated,
  /maxFrameCount:\s*24/,
  '카카오 움직이는 프로필의 maxFrameCount 계약은 24여야 합니다.',
);
contains(
  '프로젝트 생성 프로필 우선 형식',
  createProject,
  /generationSettings:\s*\{[\s\S]*?\bformats\s*,[\s\S]*?preferredFormat:\s*profile\.preferredFormat/,
  '프로젝트 생성 시 공용 프로필의 allowedFormats와 preferredFormat을 저장해야 합니다.',
);

const kakaoGuideMatch = platformProfiles.match(/const KAKAO_GUIDE_URL\s*=\s*'([^']+)'/);
let officialGuideUrl = null;
if (kakaoGuideMatch) {
  try {
    officialGuideUrl = new URL(kakaoGuideMatch[1]);
  } catch {
    officialGuideUrl = null;
  }
}
contract(
  '카카오 공식 URL',
  officialGuideUrl?.protocol === 'https:' && officialGuideUrl.hostname === 'emoticonstudio.kakao.com',
  'KAKAO_GUIDE_URL은 https://emoticonstudio.kakao.com 공식 도메인이어야 합니다.',
);
contains(
  '움직이는 프로필 공식 URL 연결',
  kakaoAnimated,
  /sourceUrl:\s*KAKAO_GUIDE_URL/,
  '카카오 움직이는 프로필이 공식 가이드 URL을 sourceUrl로 기록해야 합니다.',
);
const aiPolicyMatch = platformProfiles.match(/KAKAO_AI_POLICY_NOTICE\s*=\s*'([^']+)'/);
const aiPolicyNotice = aiPolicyMatch?.[1] || '';
contract(
  '카카오 AI 정책 고지',
  aiPolicyNotice.includes('AI')
    && /생성형/.test(aiPolicyNotice)
    && /제한/.test(aiPolicyNotice)
    && /보장하지/.test(aiPolicyNotice),
  'KAKAO_AI_POLICY_NOTICE에 생성형 AI 제한과 제출 가능 비보장 고지가 명시되어야 합니다.',
);
contains(
  '움직이는 프로필 AI 정책 연결',
  kakaoAnimated,
  /policyNotice:\s*KAKAO_AI_POLICY_NOTICE/,
  '카카오 움직이는 프로필이 공용 AI 정책 고지를 노출해야 합니다.',
);

const submitInput = sourceSection(
  studioService,
  'export type SubmitEmoticonJobInput =',
  'export type CreateEmoticonTemplatePlanInput =',
  '클라이언트 작업 요청 타입',
);
const submitJob = sourceSection(
  studioService,
  'export async function submitEmoticonJob(',
  'export async function createEmoticonTemplatePlan(',
  '클라이언트 작업 제출 함수',
);
const retryJob = sourceSection(
  studioService,
  'export async function retryEmoticonJob(',
  'export async function rerenderEmoticonJob(',
  '클라이언트 작업 재시도 함수',
);
const rerenderJob = sourceSection(
  studioService,
  'export async function rerenderEmoticonJob(',
  'export function subscribeEmoticonJob(',
  '클라이언트 재렌더 함수',
);

contains(
  '제출 타입 motionOverride',
  submitInput,
  /motionOverride\?:\s*EmoticonMotionOverride/,
  'SubmitEmoticonJobInput이 motionOverride를 받아야 합니다.',
);
contains(
  '제출 타입 outputProfile',
  submitInput,
  /outputProfile\?:\s*EmoticonOutputProfile/,
  'SubmitEmoticonJobInput이 outputProfile을 받아야 합니다.',
);
contains(
  '신규 제출 motionOverride 저장',
  submitJob,
  /input\.motionOverride\s*\?\s*\{\s*motionOverride:\s*input\.motionOverride\s*\}/,
  '새 작업 문서에 전달된 motionOverride를 보존해야 합니다.',
);
contains(
  '신규 제출 outputProfile 저장',
  submitJob,
  /const outputProfile = resolvedPolicy\?\.outputProfile[\s\S]*?outputProfile\s*\?\s*\{\s*outputProfile\s*\}/,
  '새 작업 문서에 전달된 outputProfile을 보존해야 합니다.',
);
contains(
  '재시도 신규 생성 override 보존',
  retryJob,
  /submitEmoticonJob\([\s\S]*?motionOverride:\s*params\.job\.motionOverride[\s\S]*?outputProfile:\s*params\.job\.outputProfile/,
  '재시도가 새 생성으로 이어질 때 motionOverride와 outputProfile을 다시 전달해야 합니다.',
);
contains(
  '재시도 재렌더 원본 작업 전달',
  retryJob,
  /rerenderEmoticonJob\([\s\S]*?parentJob:\s*params\.job/,
  '포즈 재사용 재시도는 원본 작업을 rerenderEmoticonJob에 전달해야 합니다.',
);
contains(
  '재렌더 motionOverride 보존',
  rerenderJob,
  /parentJob\.motionOverride\s*\?\s*\{\s*motionOverride:\s*params\.parentJob\.motionOverride\s*\}/,
  '재렌더 작업 문서에 원본 motionOverride를 보존해야 합니다.',
);
contains(
  '재렌더 outputProfile 보존',
  rerenderJob,
  /parentJob\.outputProfile\s*\?\s*\{\s*outputProfile:\s*params\.parentJob\.outputProfile\s*\}/,
  '재렌더 작업 문서에 원본 outputProfile을 보존해야 합니다.',
);
contains(
  '클라이언트 작업 스키마 override',
  studioSchema,
  /motionOverride:\s*emoticonMotionOverrideSchema\.optional\(\)[\s\S]*?outputProfile:\s*emoticonOutputProfileSchema\.optional\(\)/,
  '클라이언트 EmoticonJob 스키마가 motionOverride와 outputProfile을 파싱해야 합니다.',
);
contains(
  'Functions 요청 스키마 override',
  functionsSchema,
  /motionOverride:\s*emoticonMotionOverrideSchema\.optional\(\)[\s\S]*?outputProfile:\s*emoticonOutputProfileSchema\.optional\(\)/,
  'Functions 요청 스키마가 motionOverride와 outputProfile을 받아야 합니다.',
);

if (failures.length) {
  throw new Error(
    `Emoticon project v2 contract checks failed (${failures.length}/${passed.length + failures.length}).\n`
    + failures.map((failure) => `- ${failure}`).join('\n'),
  );
}

console.log(`Emoticon project v2 contract checks passed (${passed.length} checks).`);
