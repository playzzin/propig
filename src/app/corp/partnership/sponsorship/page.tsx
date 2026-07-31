import { notFound } from 'next/navigation';
import { SponsorshipExperience } from '@/components/corp/SponsorshipExperience';
import { getCorpPageByPath } from '@/constants/corpPages';

export default function SponsorshipPage() {
  const page = getCorpPageByPath('/corp/partnership/sponsorship');
  if (!page) notFound();

  return <SponsorshipExperience page={page} />;
}
