import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');
const [
  page,
  studioStyles,
  editor,
  comparePanel,
  manualFrames,
  imagePreview,
  timeline,
  characterSetup,
  advancedTools,
  appLayout,
  header,
  sidebar,
  globalStyles,
] = await Promise.all([
  read('src/app/admin/emoticon-studio/studio/EmoticonStudioPage.tsx'),
  read('src/app/admin/emoticon-studio/studio/StudioShell.styles.ts'),
  read('src/app/admin/emoticon-studio/studio/ProfessionalEditor.tsx'),
  read('src/app/admin/emoticon-studio/studio/ResultHistoryComparePanel.tsx'),
  read('src/app/admin/emoticon-studio/ManualFrameImportPanel.tsx'),
  read('src/app/admin/emoticon-studio/AccessibleImagePreviewDialog.tsx'),
  read('src/app/admin/emoticon-studio/FrameTimelinePanel.tsx'),
  read('src/app/admin/emoticon-studio/studio/CharacterSetupStep.tsx'),
  read('src/app/admin/emoticon-studio/studio/AdvancedProjectTools.tsx'),
  read('src/components/AppLayout.tsx'),
  read('src/components/Header.tsx'),
  read('src/components/Sidebar.tsx'),
  read('src/app/globals.css'),
]);

const requires = (source, pattern, message) => assert.match(source, pattern, message);

requires(header, /aria-controls="sidebar"[\s\S]{0,100}?aria-expanded=\{isMobileSidebarOpen\}/, '모바일 메뉴 상태가 접근성 트리에 노출되어야 합니다.');
requires(sidebar, /aria-hidden=\{isMobileViewport && !isMobileOpen \? true : undefined\}/, '닫힌 모바일 사이드바는 접근성 트리에서 제외되어야 합니다.');
requires(sidebar, /inert=\{isMobileViewport && !isMobileOpen \? true : undefined\}/, '닫힌 모바일 사이드바는 키보드 타깃을 가져서는 안 됩니다.');
requires(sidebar, /role=\{isMobileViewport \? 'dialog' : undefined\}/, '모바일 사이드바는 dialog 의미를 가져야 합니다.');
requires(appLayout, /event\.key === 'Escape'[\s\S]{0,180}?setIsMobileSidebarOpen\(false\)/, 'Escape로 모바일 메뉴를 닫을 수 있어야 합니다.');
requires(appLayout, /event\.key !== 'Tab'/, '모바일 메뉴는 Tab 포커스를 가둬야 합니다.');
requires(appLayout, /inert=\{isMobileViewport && isMobileSidebarOpen \? true : undefined\}/, '메뉴가 열리면 배경을 inert로 만들어야 합니다.');
requires(appLayout, /opener\?\.isConnected[\s\S]{0,100}?opener\.focus/, '메뉴를 닫으면 포커스를 복원해야 합니다.');
requires(globalStyles, /\.sidebar-brand:focus-visible/, '메뉴 닫기 컨트롤에 포커스 표시가 필요합니다.');

requires(studioStyles, /overflow-x:\s*hidden/, 'Studio 루트의 가로 넘침을 차단해야 합니다.');
requires(studioStyles, /min-height:\s*0;[\s\S]{0,80}?overflow-x:\s*hidden;[\s\S]{0,80}?overflow-y:\s*auto/, '관리자 flex shell 안에서 Studio가 안전하게 축소·스크롤되어야 합니다.');
requires(studioStyles, /@media \(max-width:\s*760px\)/, '모바일 breakpoint가 필요합니다.');
requires(studioStyles, /@media \(max-width:\s*560px\)/, '390px 근처의 좁은 화면 레이아웃이 필요합니다.');
requires(studioStyles, /min-height:\s*44px/, '터치 컨트롤은 최소 44px 높이를 가져야 합니다.');
requires(studioStyles, /env\(safe-area-inset-bottom\)/, 'Studio는 모바일 safe area를 존중해야 합니다.');
requires(studioStyles, /prefers-reduced-motion:\s*reduce/, '진행 애니메이션은 reduced motion을 존중해야 합니다.');
assert.doesNotMatch(studioStyles, /transition:\s*all\b/, 'Studio에서 transition: all을 사용하면 안 됩니다.');

requires(page, /aria-label="제작 단계"/, '데스크톱 단계 내비게이션에 이름이 필요합니다.');
requires(page, /<S\.MobileProgress role="progressbar"/, '모바일 제작 단계에 progressbar 의미가 필요합니다.');
requires(page, /aria-label="전체 작업 이력"/, '아이콘만 있는 작업 이력 버튼에 이름이 필요합니다.');
requires(page, /aria-label="새 프로젝트 시작"/, '아이콘만 있는 새 프로젝트 버튼에 이름이 필요합니다.');
requires(page, /<ResultHistoryComparePanel/, '모바일에서도 완성본 비교에 접근할 수 있어야 합니다.');
requires(page, /<ProfessionalEditor/, '정식 Studio가 전문 편집기를 사용해야 합니다.');

requires(editor, /@media \(max-width:\s*600px\)[\s\S]{0,100}?height:\s*100dvh/, '모바일 전문 편집기는 전체 화면을 사용해야 합니다.');
requires(editor, /@media \(max-width:\s*720px\)/, '전문 편집기의 모바일 도구 배치가 필요합니다.');
requires(editor, /env\(safe-area-inset-bottom\)/, '전문 편집기 하단 도구는 safe area를 존중해야 합니다.');
requires(editor, /button \{ min-height:\s*44px; \}/, '전문 편집기 버튼은 44px 터치 높이가 필요합니다.');
requires(editor, /role="dialog" aria-modal="true"/, '전문 편집기는 modal dialog여야 합니다.');
requires(editor, /event\.key === 'Escape'/, 'Escape로 전문 편집기를 닫을 수 있어야 합니다.');
requires(editor, /event\.key !== 'Tab'/, '전문 편집기는 Tab 포커스를 가둬야 합니다.');
requires(editor, /document\.body\.style\.overflow = 'hidden'/, '편집기 배경 스크롤을 잠가야 합니다.');
requires(editor, /previousFocus\?\.isConnected[\s\S]{0,100}?previousFocus\.focus/, '편집기를 닫으면 포커스를 복원해야 합니다.');

requires(comparePanel, /role="dialog" aria-modal="true"/, 'A/B 비교는 modal dialog여야 합니다.');
requires(comparePanel, /@media \(max-width:\s*680px\)[\s\S]{0,60}?grid-template-columns:\s*1fr/, 'A/B 비교 카드는 모바일에서 한 열로 쌓여야 합니다.');
requires(comparePanel, /max-height:\s*calc\(100dvh - 16px\)/, '비교 패널은 모바일 viewport를 넘지 않아야 합니다.');
requires(comparePanel, /min-width:\s*0/, '비교 콘텐츠가 가로로 넘치지 않아야 합니다.');

requires(manualFrames, /draggable=\{!disabled && !isSubmitting && frames\.length > 1\}/, '프레임 drag-and-drop에 잠금 조건이 필요합니다.');
requires(manualFrames, /aria-live="polite"/, '프레임 순서 변경을 스크린리더에 알려야 합니다.');
requires(manualFrames, /moveFrame\(index, -1\)/, '모바일용 위로 이동 대체 동작이 필요합니다.');
requires(manualFrames, /moveFrame\(index, 1\)/, '모바일용 아래로 이동 대체 동작이 필요합니다.');
requires(manualFrames, /URL\.revokeObjectURL/, '프레임 object URL을 해제해야 합니다.');
requires(manualFrames, /window\.addEventListener\('beforeunload', warnBeforeUnload\)/, '저장되지 않은 수동 프레임을 보호해야 합니다.');
requires(manualFrames, /<AccessibleImagePreviewDialog/, '모바일에서도 프레임 확대 미리보기가 가능해야 합니다.');

requires(imagePreview, /role="dialog"/, '이미지 확대는 dialog여야 합니다.');
requires(imagePreview, /aria-modal="true"/, '이미지 확대는 modal이어야 합니다.');
requires(imagePreview, /event\.key === 'Escape'/, 'Escape로 이미지 확대를 닫을 수 있어야 합니다.');
requires(imagePreview, /event\.key !== 'Tab'/, '이미지 확대는 Tab 포커스를 가둬야 합니다.');
requires(imagePreview, /overscroll-behavior:\s*contain/, '확대 화면 overscroll을 격리해야 합니다.');
requires(imagePreview, /prefers-reduced-motion:\s*reduce/, '확대 화면은 reduced motion을 존중해야 합니다.');

requires(timeline, /job\?\.compositedFrames\?\.length[\s\S]{0,100}?job\.compositedFrames[\s\S]{0,100}?job\?\.animationFrames/, '타임라인은 합성 완료 프레임을 우선해야 합니다.');
requires(characterSetup, /참고 이미지가 바뀌면 다시 분석해야 합니다/, '모바일 캐릭터 설정에서 재분석 필요를 안내해야 합니다.');
requires(characterSetup, /aria-label="캐릭터 참고 이미지"/, '참고 이미지 목록에 접근성 이름이 필요합니다.');
requires(advancedTools, /project-deletion-confirmation/, '모바일 고급 도구에서도 안전한 삭제 확인이 가능해야 합니다.');

console.log('Emoticon Studio unified mobile UX contract passed.');
