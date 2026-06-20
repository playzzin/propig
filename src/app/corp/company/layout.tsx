import type { ReactNode } from 'react';
import { CompanyPageShell } from '@/components/corp/CompanyPageShell';

interface CompanyLayoutProps {
  children: ReactNode;
}

export default function CompanyLayout({ children }: CompanyLayoutProps) {
  return <CompanyPageShell>{children}</CompanyPageShell>;
}
