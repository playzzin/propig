import type { Metadata } from 'next';
import Dashboard2Experience from '@/components/dashboard/Dashboard2Experience';

export const metadata: Metadata = {
  title: '회사소개 | SIMPLYPIG',
  description: 'SIMPLYPIG의 AI 기술, 실행 역량, 제품과 성장 과정을 소개합니다.',
  alternates: { canonical: '/corp/company/introduction' },
};

export default function CompanyIntroductionPage() {
  return (
    <Dashboard2Experience
      key="company-introduction"
      variant="introduction"
      includeProductIntroduction
      includeCompanyHistory
      showIntroductionHero={false}
      showTechnologyOverview={false}
    />
  );
}
