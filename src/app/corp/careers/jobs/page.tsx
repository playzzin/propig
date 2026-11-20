import { notFound } from 'next/navigation';
import { CareersJobsExperience } from '@/components/corp/CareersJobsExperience';
import { getCorpPageByPath } from '@/constants/corpPages';

export default function CareersJobsPage() {
  const page = getCorpPageByPath('/corp/careers/jobs');
  if (!page) notFound();

  return <CareersJobsExperience page={page} />;
}
