'use client';

import dynamic from 'next/dynamic';
import type { HabitView } from './HabitTrackerApp';
import styles from './HabitTrackerRoute.module.css';

const HabitTrackerApp = dynamic(() => import('./HabitTrackerApp'), {
  ssr: false,
  loading: () => <HabitTrackerRouteFallback />,
});

interface HabitTrackerRouteProps {
  initialView: HabitView;
}

function HabitTrackerRouteFallback() {
  return (
    <div className={styles.fallback} role="status" aria-live="polite">
      <div className={styles.panel}>
        <p className={styles.eyebrow}>Habit Tracker</p>
        <h1 className={styles.title}>습관 데이터를 불러오는 중</h1>
        <p className={styles.meta}>차트와 기록 도구를 준비하고 있습니다.</p>
        <div className={styles.bar} aria-hidden="true" />
      </div>
    </div>
  );
}

export default function HabitTrackerRoute({ initialView }: HabitTrackerRouteProps) {
  return (
    <main className={styles.shell}>
      <HabitTrackerApp initialView={initialView} />
    </main>
  );
}
