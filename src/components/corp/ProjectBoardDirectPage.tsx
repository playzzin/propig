'use client';

import ProjectBoardPage from '@/components/corp/ProjectBoardPage';
import type { CorpPageDefinition } from '@/constants/corpPages';
import { useAdminAccess } from '@/hooks/useAdminAccess';

type ProjectBoardDirectPageProps = {
  page: CorpPageDefinition;
  mode: 'project' | 'portfolio';
};

export function ProjectBoardDirectPage({ page, mode }: ProjectBoardDirectPageProps) {
  const { currentUser, canWriteFirestore } = useAdminAccess();
  const canManage = Boolean(currentUser && canWriteFirestore);

  return <ProjectBoardPage page={page} mode={mode} canManage={canManage} />;
}
