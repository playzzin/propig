'use client';

import { DesktopSession } from '@/components/desktop/DesktopSession';
import PcWidgetBoard from '../../pc-widgets/PcWidgetBoard';

export default function DesktopPcWidgetsPage() {
  return <DesktopSession>{({requestId}) => <PcWidgetBoard requestId={requestId}/>}</DesktopSession>;
}
