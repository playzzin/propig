'use client';

import { DesktopSession } from '@/components/desktop/DesktopSession';
import DesktopMemoWidget from '../_components/DesktopMemoWidget';

export default function PropigDesktopMemoPage() {
  return <DesktopSession>{() => <DesktopMemoWidget />}</DesktopSession>;
}
