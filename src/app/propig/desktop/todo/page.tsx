'use client';

import { DesktopSession } from '@/components/desktop/DesktopSession';
import DesktopTodoWidget from '../_components/DesktopTodoWidget';

export default function PropigDesktopTodoPage() {
  return <DesktopSession>{() => <DesktopTodoWidget />}</DesktopSession>;
}
