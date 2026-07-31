import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { CareersApplyExperience, CareersApplyQueryExperience } from '@/components/corp/CareersApplyExperience';
import { getCorpPageByPath } from '@/constants/corpPages';

export default function CareersApplyPage() {
  const page = getCorpPageByPath('/corp/careers/apply');
  if (!page) notFound();

  return (
    <Suspense fallback={<CareersApplyExperience page={page} />}>
      <CareersApplyQueryExperience page={page} />
    </Suspense>
  );
}
