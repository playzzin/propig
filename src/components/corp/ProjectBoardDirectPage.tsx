'use client';

import dynamic from 'next/dynamic';
import type { CorpPageDefinition } from '@/constants/corpPages';
import { useAdminAccess } from '@/hooks/useAdminAccess';

type ProjectBoardDirectPageProps = {
  page: CorpPageDefinition;
  mode: 'project' | 'portfolio';
};

const ProjectBoardPage = dynamic(() => import('@/components/corp/ProjectBoardPage'), {
  ssr: false,
  loading: () => <ProjectBoardLoading />,
});

export function ProjectBoardDirectPage({ page, mode }: ProjectBoardDirectPageProps) {
  const { currentUser, canWriteFirestore } = useAdminAccess();
  const canManage = Boolean(currentUser && canWriteFirestore);

  return <ProjectBoardPage page={page} mode={mode} management={canManage} canManage={canManage} />;
}

function ProjectBoardLoading() {
  return (
    <main
      id="content-area"
      aria-label="프로젝트 보드 로딩"
      style={{
        minHeight: '100%',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        color: '#e2e8f0',
        background: 'linear-gradient(135deg, #07111f 0%, #0f172a 52%, #111827 100%)',
      }}
    >
      <div
        style={{
          width: 'min(520px, 100%)',
          display: 'grid',
          gap: 12,
          padding: 24,
          border: '1px solid rgba(148, 163, 184, 0.24)',
          borderRadius: 8,
          background: 'rgba(15, 23, 42, 0.72)',
        }}
      >
        <strong style={{ fontSize: '1rem', fontWeight: 900 }}>프로젝트 보드를 준비하는 중입니다</strong>
        <span style={{ color: '#94a3b8', fontSize: '0.86rem', fontWeight: 700 }}>
          사진과 프로젝트 데이터를 불러오는 동안 화면 전환을 먼저 완료합니다.
        </span>
      </div>
    </main>
  );
}
