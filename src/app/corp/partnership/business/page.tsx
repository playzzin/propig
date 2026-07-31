import { notFound } from 'next/navigation';
import { BusinessPartnershipExperience } from '@/components/corp/BusinessPartnershipExperience';
import { getCorpPageByPath } from '@/constants/corpPages';

export default function BusinessPartnershipPage() {
  const page = getCorpPageByPath('/corp/partnership/business');
  if (!page) notFound();

  return <BusinessPartnershipExperience page={page} />;
}
