import { notFound } from 'next/navigation';
import { CareersApplyExperience } from '@/components/corp/CareersApplyExperience';
import { getCorpPageByPath } from '@/constants/corpPages';

export default function CareersApplyPage() {
  const page = getCorpPageByPath('/corp/careers/apply');
  if (!page) notFound();

  return <CareersApplyExperience page={page} />;
}
