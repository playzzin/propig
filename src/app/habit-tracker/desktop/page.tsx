'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { DesktopSession } from '@/components/desktop/DesktopSession';
import type { HabitView } from '@/components/habits/HabitTrackerApp';

const HabitTrackerApp = dynamic(() => import('@/components/habits/HabitTrackerApp'), {
  ssr: false,
  loading: () => <p role="status">습관 트래커를 불러오는 중</p>,
});

export default function HabitDesktopWorkspace() {
  const [view, setView] = useState<HabitView>('daily');

  return (
    <DesktopSession>
      {({ notifyHabitWrite }) => (
        <HabitTrackerApp initialView={view} onViewChange={setView} onWorkspaceWrite={notifyHabitWrite} />
      )}
    </DesktopSession>
  );
}
