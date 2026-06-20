import { SiteHomePage } from '@/components/site-home/SiteHomePage';
import { ADMIN_HOME_CONTENT } from '@/constants/siteHomeContent';

export default function AdminHomePage() {
  return <SiteHomePage {...ADMIN_HOME_CONTENT} />;
}
