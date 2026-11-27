'use client';

import { DesktopSession } from '@/components/desktop/DesktopSession';
import { useSyncExternalStore } from 'react';
import PcWidgetBoard from '../../pc-widgets/PcWidgetBoard';
import { CalendarPanel } from '../../pc-widgets/ClockCalendar';
import { WeatherPanel } from '../../pc-widgets/WeatherPanel';
import styles from '../../pc-widgets/PcWidgetBoard.module.css';

const subscribe = () => () => {};
const readPanel = () => new URLSearchParams(window.location.search).get('public') ?? '';
const hydrating = () => null;

export default function DesktopPcWidgetsPage() {
  const panel = useSyncExternalStore<string | null>(subscribe, readPanel, hydrating);
  if (panel === null) return null;
  if (panel === 'clock' || panel === 'calendar')
    return <main className={styles.board} data-compact>{panel === 'clock' ? <WeatherPanel externalLinks={false}/> : <CalendarPanel/>}</main>;
  return <DesktopSession>{({requestId}) => <PcWidgetBoard requestId={requestId}/>}</DesktopSession>;
}
