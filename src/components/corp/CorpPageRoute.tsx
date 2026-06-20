import { notFound } from 'next/navigation';
import { getCorpPageByPath } from '@/constants/corpPages';
import { CorpInfoPage } from '@/components/corp/CorpInfoPage';

interface CorpPageRouteProps {
  path: string;
}

export function CorpPageRoute({ path }: CorpPageRouteProps) {
  const page = getCorpPageByPath(path);

  if (!page) {
    notFound();
  }

  return <CorpInfoPage page={page} />;
}
