import { notFound } from 'next/navigation';
import { getCorpPageBySlug, CORP_PAGE_DEFINITIONS } from '@/constants/corpPages';
import { CorpInfoPage } from '@/components/corp/CorpInfoPage';

const CATCH_ALL_CORP_PAGE_DEFINITIONS = CORP_PAGE_DEFINITIONS.filter(
  (page) => !page.path.startsWith('/corp/company/'),
);

// SSG를 위한 정적 경로 생성
export function generateStaticParams() {
  return CATCH_ALL_CORP_PAGE_DEFINITIONS.map((page) => ({
    slug: page.path.replace(/^\/corp\//, '').split('/'),
  }));
}

// Next.js 15+: params is a Promise
interface CorpDynamicPageProps {
  params: Promise<{
    slug: string[];
  }>;
}

export default async function CorpDynamicPage({ params }: CorpDynamicPageProps) {
  // Await the params
  const { slug } = await params;

  if (!slug || !Array.isArray(slug)) {
    notFound();
  }

  const page = getCorpPageBySlug(slug);
  const slugPath = slug.join('/');

  if (!page) {
    notFound();
  }

  if (slugPath === 'project') {
    const { ProjectBoardDirectPage } = await import('@/components/corp/ProjectBoardDirectPage');
    return <ProjectBoardDirectPage page={page} mode="project" />;
  }

  if (slugPath === 'portfolio') {
    const { PortfolioUnderConstructionPage } = await import(
      '@/components/corp/PortfolioUnderConstructionPage'
    );
    return <PortfolioUnderConstructionPage page={page} />;
  }

  return <CorpInfoPage page={page} />;
}
