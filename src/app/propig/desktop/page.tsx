'use client';

import { DesktopSession } from '@/components/desktop/DesktopSession';
import { DesktopShell } from './_components/DesktopShell';

export default function PropigDesktopPage() {
  return (
    <DesktopSession>
      {({ notifyHabitWrite, openTarget }) => (
        <DesktopShell onHabitWrite={notifyHabitWrite} onOpenWidget={openTarget} onOpenWebApp={openTarget} />
      )}
    </DesktopSession>
  );
}
