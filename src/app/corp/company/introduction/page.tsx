import Dashboard2Experience from '@/components/dashboard/Dashboard2Experience';

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
