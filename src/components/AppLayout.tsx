'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getCorpPageByPath } from '@/constants/corpPages';
import { isDashboardStyleCorpPath } from '@/constants/dashboardStyleCorpRoutes';
import { MENU_PAGE_OPTIONS } from '@/constants/menuPages';
import { useMenuContext } from '@/contexts/MenuContext';
import type { MenuItem } from '@/types/menu';
import DynamicFavicon from './DynamicFavicon';
import Header from './Header';
import Sidebar from './Sidebar';

interface AppLayoutProps {
  children: React.ReactNode;
}

interface ViewState {
  title: string;
  description: string;
}

const defaultViewState: ViewState = {
  title: 'ERP 운영 홈',
  description: '관리, 콘텐츠, 개인 업무, AI 운영을 한 화면에서 시작합니다.',
};

function findMenuTitle(items: MenuItem[], pathname: string | null): string | null {
  if (!pathname) return null;

  for (const item of items) {
    if (item.path === pathname && item.text.trim()) {
      return item.text.trim();
    }

    const childItems = item.sub?.filter((subItem): subItem is MenuItem => typeof subItem !== 'string') ?? [];
    const childTitle = findMenuTitle(childItems, pathname);
    if (childTitle) return childTitle;
  }

  return null;
}

function getRouteViewState(pathname: string | null, menuTitle: string | null): ViewState {
  if (!pathname) {
    return defaultViewState;
  }

  if (pathname !== '/' && menuTitle) {
    return {
      title: menuTitle,
      description: '',
    };
  }

  const pageOption = MENU_PAGE_OPTIONS.find((page) => page.path === pathname);
  if (pathname !== '/' && pageOption) {
    return {
      title: pageOption.label,
      description: '',
    };
  }

  if (pathname === '/corp/company/introduction' || pathname === '/corp/company/ceo-intro') {
    return {
      title: pathname === '/corp/company/introduction' ? '회사소개' : '대표소개',
      description: '',
    };
  }

  if (isDashboardStyleCorpPath(pathname)) {
    return defaultViewState;
  }

  if (pathname === '/corp') {
    return {
      title: '기업 사이트 홈',
      description: '회사소개, 프로젝트, 제휴, 채용 콘텐츠를 관리합니다.',
    };
  }

  if (pathname === '/blog' || pathname.startsWith('/blog/')) {
    return {
      title: '블로그 대시보드',
      description: '글감 수집부터 기획과 미디어 준비까지, 블로그 작업 흐름을 한곳에서 시작합니다.',
    };
  }

  if (pathname === '/propig' || pathname === '/shop') {
    return {
      title: '대시보드',
      description: '상점에서 등록한 프로그램의 위젯을 배치하고 오늘의 흐름을 관리합니다.',
    };
  }

  if (pathname === '/propig/store') {
    return {
      title: 'propig 상점',
      description: '개인별로 사용할 프로그램을 등록하고 위젯 대시보드에 연결합니다.',
    };
  }

  if (pathname === '/propig/memos') {
    return {
      title: 'propig 메모장',
      description: '생각, 할 일 보조 기록, 아이디어를 빠르게 적고 다시 찾습니다.',
    };
  }

  if (pathname.startsWith('/propig/') || pathname.startsWith('/shop/')) {
    return {
      title: 'propig 자기관리',
      description: '개인 성장 워크스페이스를 점검합니다.',
    };
  }

  if (pathname === '/corp/project') {
    return {
      title: '프로젝트',
      description: '계획, 과제, 목표를 사진형 보드로 관리합니다.',
    };
  }

  if (pathname === '/corp/portfolio') {
    return {
      title: '포트폴리오',
      description: '청연ENG ERP와 앱 자동화 프로그램의 운영 경험을 소개합니다.',
    };
  }

  const corpPage = getCorpPageByPath(pathname);
  if (corpPage) {
    return {
      title: corpPage.menuLabel,
      description: '',
    };
  }

  switch (pathname) {
    case '/':
      return {
        title: 'ERP 운영 홈',
        description: '오늘 확인할 운영 지표와 핵심 모듈을 빠르게 엽니다.',
      };
    case '/admin':
      return defaultViewState;
    case '/admin/system-settings':
      return {
        title: '시스템 설정',
        description: '',
      };
    case '/admin/video-studio':
      return {
        title: 'AI 비디오 스튜디오',
        description: '',
      };
    case '/dashboard2':
      return {
        title: '기업 대시보드',
        description: '',
      };
    case '/agent-test':
      return {
        title: 'AI 에이전트 테스트',
        description: '',
      };
    case '/agent-chat':
      return {
        title: 'AI 에이전트 채팅',
        description: '',
      };
    case '/sticky-notes':
      return {
        title: '스티커 메모',
        description: '스티커 메모를 통해 아이디어를 정리하고 공유합니다.',
      };
    case '/bookmarks':
      return {
        title: '스마트 북마크',
        description: '링크를 직접 입력해 등록하고 파비콘과 상세 정보를 정리합니다.',
      };
    case '/youtube-analyze':
      return {
        title: 'YouTube 분석',
        description: 'YouTube 영상을 분석하여 요약 및 인사이트를 제공합니다.',
      };
    case '/habit-tracker':
      return {
        title: '습관 트래커',
        description: '카테고리별 습관을 날짜별로 기록하고 다양한 방식으로 루틴을 관리합니다.',
      };
    case '/todo-list':
      return {
        title: '할일 일정표',
        description: '반복 일정과 특정 날짜 할일을 캘린더와 일정표로 관리합니다.',
      };
    case '/bucket-list':
      return {
        title: '버킷리스트',
        description: 'Cloud Firestore에 저장되는 개인 목표와 달성 기록을 관리합니다.',
      };
    case '/habit-tracker/stats':
      return {
        title: '습관 통계',
        description: '최근 달성률, 카테고리 균형, 연속 기록을 분석합니다.',
      };
    case '/habit-tracker/manage':
      return {
        title: '습관 관리',
        description: '카테고리, 기록 항목, 목표값과 고급 목표 설정을 관리합니다.',
      };
    case '/habit-tracker/manual':
      return {
        title: '습관 트래커 설명서',
        description: '기록, 통계, 관리, 카테고리와 고급 목표 설정 사용법을 안내합니다.',
      };
    case '/admin/storyboard':
      return {
        title: '스토리보드 영상 제작',
        description: '장면 설계부터 이미지·영상 생성, 완성본 편집과 파일 관리까지 한 곳에서 진행합니다.',
      };
    case '/admin/emoticon-studio':
      return {
        title: '반자동 이모티콘 스튜디오',
        description: 'ChatGPT용 프롬프트를 준비하고 생성 결과를 가져와 편집·검수·내보내기까지 진행합니다.',
      };
    case '/admin/openrouter-settings':
      return {
        title: 'OpenRouter 운영 센터',
        description: 'OpenRouter 기본 모델, 폴백, API 키와 적용 대상 페이지를 관리합니다.',
      };
    case '/admin/openrouter-usage':
      return {
        title: 'OpenRouter 사용량',
        description: 'OpenRouter 실제 비용과 토큰 사용량을 모델·기능별로 확인합니다.',
      };
    case '/admin/photos':
      return {
        title: '사진 관리',
        description: '사진첩, 사이트 브랜드 이미지, 이미지 변환 작업을 관리합니다.',
      };
    case '/admin/storage':
      return {
        title: 'Storage',
        description: 'Firebase Storage 버킷의 모든 폴더와 파일을 Drive형 구조로 확인합니다.',
      };
    case '/admin/users':
      return {
        title: '유저 관리',
        description: '여러 사이트 모드의 사용자 역할, 사이트 접근, 메뉴 관리 권한을 관리합니다.',
      };
    case '/admin/activity-logs':
      return {
        title: '작업 히스토리',
        description: '관리자 변경과 주요 작업 기록을 확인합니다.',
      };
    case '/admin/menu':
      return {
        title: '통합 메뉴 관리',
        description: '사이트의 메뉴 구조를 드래그 앤 드롭으로 설계하고 관리합니다.',
      };
    default:
      return defaultViewState;
  }
}

export function AppLayout({ children }: AppLayoutProps) {
  const pathname = usePathname();
  const { currentSite, filteredMenu } = useMenuContext();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const menuTitle = React.useMemo(() => findMenuTitle(filteredMenu, pathname), [filteredMenu, pathname]);
  const viewState = React.useMemo(() => getRouteViewState(pathname, menuTitle), [menuTitle, pathname]);
  const isCorpRoute = Boolean(pathname?.startsWith('/corp'));
  const shouldUseCorpChrome = isCorpRoute && !isDashboardStyleCorpPath(pathname);
  const isImmersiveStudio = pathname === '/admin/emoticon-studio';

  useEffect(() => {
    const root = document.documentElement;

    if (shouldUseCorpChrome) {
      root.setAttribute('data-corp-route', 'true');
      return;
    }

    root.removeAttribute('data-corp-route');
  }, [shouldUseCorpChrome]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 820px)');
    const syncMobileSidebar = () => {
      setIsMobileViewport(mediaQuery.matches);
      setIsMobileSidebarOpen(false);
    };

    syncMobileSidebar();
    mediaQuery.addEventListener('change', syncMobileSidebar);
    return () => mediaQuery.removeEventListener('change', syncMobileSidebar);
  }, []);

  useEffect(() => {
    if (!isMobileViewport || !isMobileSidebarOpen) return;
    const sidebar = document.getElementById('sidebar');
    const opener = document.getElementById('mobile-menu-toggle');
    if (!sidebar) return;
    const focusableSelector = [
      'button:not(:disabled)',
      'a[href]',
      'input:not(:disabled)',
      'select:not(:disabled)',
      'textarea:not(:disabled)',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');
    const focusFrame = window.requestAnimationFrame(() => {
      sidebar.querySelector<HTMLElement>(focusableSelector)?.focus({ preventScroll: true });
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsMobileSidebarOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...sidebar.querySelectorAll<HTMLElement>(focusableSelector)];
      if (!focusable.length) {
        event.preventDefault();
        sidebar.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!sidebar.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown, true);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [isMobileSidebarOpen, isMobileViewport]);

  const matchesMobileViewport = () =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches;

  const toggleSidebar = () => {
    if (matchesMobileViewport()) {
      setIsMobileSidebarOpen((isOpen) => !isOpen);
      return;
    }

    setIsSidebarCollapsed((isCollapsed) => !isCollapsed);
  };

  const toggleMobileSidebar = () => setIsMobileSidebarOpen((isOpen) => !isOpen);
  const closeMobileSidebar = () => setIsMobileSidebarOpen(false);

  return (
    <div className="app-wrapper" style={{ display: 'flex', width: '100vw', height: '100vh' }}>
      <DynamicFavicon />

      {!isImmersiveStudio && isMobileSidebarOpen ? (
        <button
          type="button"
          className="mobile-sidebar-backdrop active"
          aria-label="메뉴 닫기"
          onClick={closeMobileSidebar}
        />
      ) : null}

      {!isImmersiveStudio ? <Sidebar
        currentEnv={currentSite}
        isCollapsed={isSidebarCollapsed}
        isMobileOpen={isMobileSidebarOpen}
        isMobileViewport={isMobileViewport}
        closeMobileSidebar={closeMobileSidebar}
        setViewTitle={() => undefined}
        toggleSidebar={toggleSidebar}
      /> : null}

      <div
        className="main-view"
        aria-hidden={isMobileViewport && isMobileSidebarOpen ? true : undefined}
        inert={isMobileViewport && isMobileSidebarOpen ? true : undefined}
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          width: '100%',
          maxWidth: '100vw',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {!isImmersiveStudio ? <Header
          isMobileSidebarOpen={isMobileSidebarOpen}
          toggleMobileSidebar={toggleMobileSidebar}
          title={viewState.title}
          description={viewState.description}
        /> : null}

        {children}
      </div>
    </div>
  );
}
