import { SiteHomePage } from '@/components/site-home/SiteHomePage';
import { BLOG_HOME_CONTENT } from '@/constants/siteHomeContent';

export default function BlogHomePage() {
  return <SiteHomePage {...BLOG_HOME_CONTENT} />;
}
