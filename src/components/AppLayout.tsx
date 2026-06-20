'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getCorpPageByPath } from '@/constants/corpPages';
import { useMenuContext } from '@/contexts/MenuContext';
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
  title: '관리 사이트 홈',
  description: '운영 도구, 콘텐츠 관리, AI 설정을 한 곳에서 시작합니다.',
};

function getRouteViewState(pathname: string | null): ViewState {
  if (!pathname) {
    return defaultViewState;
  }

  if (pathname === '/corp') {
    return {
      title: '기업 사이트 홈',
      description: '회사소개, 프로젝트, 제휴, 채용 콘텐츠를 관리합니다.',
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
      description: '완료된 프로젝트의 성과와 목표 달성을 정리합니다.',
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
    case '/admin':
      return defaultViewState;
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
    case '/mandalart':
      return {
        title: '만다라트',
        description: '메인 목표와 8개의 서브 목표를 구조화해 실행 계획을 만듭니다.',
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
    case '/admin/image-generator':
      return {
        title: 'AI 이미지 생성기',
        description: 'AI를 활용하여 이미지를 생성합니다.',
      };
    case '/admin/gemini-settings':
      return {
        title: 'Gemini 설정 센터',
        description: 'Gemini API 키, 모델, 적용 대상 페이지를 관리하고 검증합니다.',
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
  const { currentSite } = useMenuContext();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const viewState = React.useMemo(() => getRouteViewState(pathname), [pathname]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 720px)');
    const syncMobileSidebar = () => {
      if (!mediaQuery.matches) {
        setIsMobileSidebarOpen(false);
      }
    };

    syncMobileSidebar();
    mediaQuery.addEventListener('change', syncMobileSidebar);
    return () => mediaQuery.removeEventListener('change', syncMobileSidebar);
  }, []);

  const isMobileViewport = () =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches;

  const toggleSidebar = () => {
    if (isMobileViewport()) {
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

      <button
        type="button"
        className={`mobile-sidebar-backdrop ${isMobileSidebarOpen ? 'active' : ''}`}
        aria-label="메뉴 닫기"
        onClick={closeMobileSidebar}
      />

      <Sidebar
        currentEnv={currentSite}
        isCollapsed={isSidebarCollapsed}
        isMobileOpen={isMobileSidebarOpen}
        closeMobileSidebar={closeMobileSidebar}
        setViewTitle={() => undefined}
        toggleSidebar={toggleSidebar}
      />

      <div
        className="main-view"
        style={{
          flex: 1,
          minWidth: 0,
          width: '100%',
          maxWidth: '100vw',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <Header
          isMobileSidebarOpen={isMobileSidebarOpen}
          toggleMobileSidebar={toggleMobileSidebar}
          title={viewState.title}
          description={viewState.description}
          hideMobileTitle={pathname === '/admin/photos'}
        />

        {children}
      </div>
    </div>
  );
}
