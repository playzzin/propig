import type { Metadata } from 'next';
import HabitToday from '@/components/habits/HabitToday';

export const metadata: Metadata = {
  title: '오늘 습관 · ProPig',
  manifest: '/habit-today.webmanifest',
};

export default function HabitTodayPage() {
  return <HabitToday />;
}
