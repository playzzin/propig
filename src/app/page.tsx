'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PropigDashboard from '@/components/propig/PropigDashboard';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/propig');
  }, [router]);

  return <PropigDashboard />;
}
