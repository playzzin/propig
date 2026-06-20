import { SiteHomePage } from '@/components/site-home/SiteHomePage';
import { CORP_HOME_CONTENT } from '@/constants/siteHomeContent';

export default function CorpHomePage() {
  return <SiteHomePage {...CORP_HOME_CONTENT} />;
}
