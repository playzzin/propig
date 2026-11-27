import type { Metadata } from 'next';
import CpuUsageWidget from './CpuUsageWidget';

export const metadata: Metadata = {
  title: 'CPU 사용률 | ProPig',
};

export default function PropigCpuUsagePage() {
  return <CpuUsageWidget />;
}
