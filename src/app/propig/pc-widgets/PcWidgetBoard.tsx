'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { collection, limit, onSnapshot, query } from 'firebase/firestore';
import { CalendarDays, ChartCandlestick, Clock3, Cpu, Gauge, Grid2X2, Monitor, PanelsTopLeft, Settings2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/firebase/config';
import { isWindowsDashboard } from '@/lib/desktopWorkspaceRoute';
import { CalendarPanel } from './ClockCalendar';
import { WeatherPanel } from './WeatherPanel';
import { UsageNotes } from './UsageNotes';
import { DockPanel, MiraBoxPanel, SystemPanel, UsagePanel } from './DevicePanels';
import { isPcPanel, pcPanels, readPcSnapshot, type PcPanel, type PcSnapshot } from './pcSnapshot';
import styles from './PcWidgetBoard.module.css';

type Device = { id: string; sample: PcSnapshot };
type Cloud = { uid: string; devices: Device[]; failed?: boolean };
type Native = { requestId: string; sample: PcSnapshot; sharing: boolean; removing: boolean; cloudStatus: string; result: string };
type Bridge = {
  postMessage: (data: object) => void;
  addEventListener: (type: 'message', callback: (e: MessageEvent) => void) => void;
  removeEventListener: (type: 'message', callback: (e: MessageEvent) => void) => void;
};
const MarketDashboard = dynamic(() => import('../market/MarketDashboard'));
const icons = { system: Cpu, clock: Clock3, calendar: CalendarDays, usage: Gauge, mirabox: Grid2X2, dock: PanelsTopLeft, market: ChartCandlestick };
const subscribeRoute = () => () => {};
const initialPanel = (): PcPanel => { const p = new URLSearchParams(window.location.search).get('panel'); return isPcPanel(p) ? p : 'system'; };
const serverPanel = (): PcPanel => 'system';
const bridge = () => (window as Window & {chrome?: {webview?: Bridge}}).chrome?.webview;

function useNativeWidget(requestId?: string) {
  const [state, setState] = useState<Native | null>(null);
  const [waiting, setWaiting] = useState(false);
  const send = useCallback((target?: string) => {
    if (!requestId) return;
    bridge()?.postMessage({ version: 1, requestId, type: target ? 'pc-widget-action' : 'pc-widget-read', ...(target && {target}) });
  }, [requestId]);
  useEffect(() => {
    const host = requestId && bridge();
    if (!host || !requestId) return;
    const receive = ({data}: MessageEvent) => {
      if (data?.version !== 1 || data.type !== 'pc-widget-state' || data.requestId !== requestId) return;
      const sample = readPcSnapshot(data.data?.sample);
      if (!sample) return;
      setState(previous => ({ requestId, sample, sharing: data.data.sharing === true, removing: data.data.removing === true,
        cloudStatus: typeof data.data.cloudStatus === 'string' ? data.data.cloudStatus : '',
        result: typeof data.result === 'string' ? data.result : previous?.requestId === requestId ? previous.result : '' }));
      if (typeof data.result === 'string') setWaiting(false);
    };
    host.addEventListener('message', receive);
    const read = () => { if (document.visibilityState !== 'hidden') send(); };
    read();
    const interval = window.setInterval(read, 4000);
    document.addEventListener('visibilitychange', read);
    return () => { host.removeEventListener('message', receive); clearInterval(interval); document.removeEventListener('visibilitychange', read); };
  }, [requestId, send]);
  const action = (id: string) => { setWaiting(true); send(id); };
  return { native: state?.requestId === requestId ? state : null, waiting, action };
}

function useCloudDevices(uid: string | undefined) {
  const [state, setState] = useState<Cloud | null>(null);
  useEffect(() => {
    if (!uid) return;
    let active = true;
    const source = query(collection(db, 'users', uid, 'pcWidgetDevices'), limit(50));
    const unsubscribe = onSnapshot(source, snapshot => {
      if (!active) return;
      const devices = snapshot.docs.flatMap(doc => {
        const value = doc.get('sample');
        const sample = typeof value === 'string' && value.length <= 32768 ? readPcSnapshot(value) : null;
        return sample && /^[a-f0-9]{32}$/.test(doc.id) ? [{ id: doc.id, sample }] : [];
      }).sort((a,b) => Number(b.sample.source === 'windows') - Number(a.sample.source === 'windows') || a.id.localeCompare(b.id));
      setState({uid, devices});
    }, () => { if (active) setState({uid, devices: [], failed: true}); });
    return () => { active = false; unsubscribe(); };
  }, [uid]);
  return uid && state?.uid === uid ? state : null;
}

export default function PcWidgetBoard({requestId}: { requestId?: string }) {
  const { currentUser, loading } = useAuth();
  const desktop = Boolean(requestId);
  const entry = useSyncExternalStore(subscribeRoute, initialPanel, serverPanel);
  const [selected, setPanel] = useState<PcPanel | null>(null);
  const panel = selected ?? entry;
  const localPanel = panel === 'clock' || panel === 'calendar' || panel === 'market';
  const [deviceId, chooseDevice] = useState('');
  const [settings, setSettings] = useState(false);
  const [now, setNow] = useState(0);
  const {native, waiting, action} = useNativeWidget(panel === 'market' ? undefined : requestId);
  const cloud = useCloudDevices(desktop || localPanel ? undefined : currentUser?.uid);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) setNow(Date.now()); });
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  const device = cloud?.devices.find(row => row.id === deviceId) ?? cloud?.devices[0];
  const sample = desktop ? native?.sample : device?.sample;
  const onPc = sample?.source === 'windows';
  const stamp = sample && new Date(sample.sampledAt).toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit', timeZone:'Asia/Seoul'});
  const status = sample ? ((now - sample.sampledAt > 180_000 ? '마지막 수신 ' : '측정 ') + stamp + ' · 한국 시각')
    : desktop ? '이 PC 측정 중' : loading ? '계정 확인 중' : !currentUser ? '로그인하면 공유한 PC가 표시됩니다.'
    : cloud?.failed ? 'PC 목록을 불러오지 못했습니다.' : !cloud ? '공유한 PC 확인 중' : '공유한 PC가 없습니다.';
  const launch = (id: string) => {
    if (desktop) action(id);
    else window.location.href = 'propig-widgets:dock/' + id;
  };
  const pressKey = (index: number, layoutId: number) => {
    if (desktop) action('key/' + layoutId + '/' + index);
    else if (device) window.location.href = 'propig-widgets:press/' + device.id + '/' + layoutId + '/' + index;
  };
  return <main className={styles.board} data-compact={desktop || undefined}>
    <header className={styles.heading}>
      <div className={styles.title}><Monitor size={22} aria-hidden="true"/><h1>PC 위젯</h1></div>
      {panel !== 'market' && (desktop ? <button type="button" className={styles.option} aria-expanded={settings} onClick={() => setSettings(!settings)}>
        <Settings2 size={16} aria-hidden="true"/> 연결 설정
      </button> : <a className={styles.option} href={'propig-widgets:' + panel}><Monitor size={15} aria-hidden="true"/>Windows 위젯 열기</a>)}
    </header>
    {!desktop && <nav className={styles.tabs} aria-label="PC 위젯 선택">
      {pcPanels.map(p => {const Icon = icons[p.id]; return <button type="button" key={p.id} aria-current={p.id === panel ? 'page' : undefined} onClick={() => setPanel(p.id)}>
        <Icon size={17} aria-hidden="true"/>{p.label}</button>;})}
    </nav>}
    {!localPanel && <div className={styles.status}>
      <span className={styles.dot} data-live={!!sample && now - sample.sampledAt <= 180_000 || undefined}/>{status}
      {cloud && cloud.devices.length > 1 && <select aria-label="표시할 PC" value={device?.id ?? ''} onChange={e => chooseDevice(e.target.value)}>
        {cloud.devices.map(row => <option key={row.id} value={row.id}>PC · {row.id.slice(-6).toUpperCase()}</option>)}
      </select>}
    </div>}
    {desktop && settings && panel !== 'market' && <section className={styles.settings} aria-label="PC 연결 설정">
      <h2>이 PC 연결</h2>
      <p>웹 공유를 켜면 이 앱이 PC 모델, 사용률과 온도, AI 사용량, MiraBox 키 종류를 약 1분마다 내 ProPig 계정에 보냅니다.</p>
      <button type="button" disabled={waiting || !native} onClick={() => action(native?.sharing ? 'share-off' : 'share-on')}>{native?.sharing ? '공유 중지 및 웹 측정값 삭제' : '이 PC를 내 웹에 공유'}</button>
      {(native?.removing || native?.cloudStatus) && <p role="status">{native.removing ? '웹에서 이 PC의 측정값을 지우는 중입니다.' : native.cloudStatus}</p>}
      {onPc && <>
        <h3>AI 사용량 연결</h3>
        <p>Codex는 로그인된 CLI에서 한도를 읽습니다. Claude Code와 Antigravity CLI는 연결 후 각 CLI를 사용할 때 상태줄에서 사용량을 받습니다.</p>
        {([['claude','Claude Code'], ['antigravity','Antigravity CLI']] as const).map(([id,name]) =>
          <div className={styles.actions} key={id}><button type="button" disabled={waiting} onClick={() => action('statusline/'+id+'/connect')}>{name} 연결</button>
            <button type="button" disabled={waiting} aria-label={name+' 연결 해제'} onClick={() => action('statusline/'+id+'/remove')}>연결 해제</button></div>)}
        <h3>바로가기 독</h3>
        <button type="button" disabled={waiting} onClick={() => action('choose-workspace')}>작업 폴더 선택</button>
      </>}
    </section>}
    {!localPanel && sample?.source === 'legacy' && <p className={styles.help}>이 PC는 이전 버전으로 연결되어 있습니다. 독립형 위젯을 사용하려면 ProPig Windows 앱을 업데이트해 주세요.</p>}
    {!localPanel && !desktop && !sample && !loading && <p className={styles.help}>Windows 앱의 <strong>위젯 → 시스템 정보 → 연결 설정</strong>에서 이 PC를 웹에 공유할 수 있습니다.</p>}
    <section className={styles.panel} aria-label={pcPanels.find(p => p.id === panel)?.label}>
      {panel === 'system' && <SystemPanel system={sample?.system ?? null} sensors={sample?.sensors ?? null}
        onSensorHelp={desktop || isWindowsDashboard ? () => launch('core-temp-info') : undefined}/>}
      {panel === 'clock' && <WeatherPanel externalLinks={!desktop}/>}
      {panel === 'calendar' && <CalendarPanel/>}
      {panel === 'usage' && <><UsagePanel usage={sample?.usage ?? null}/>
        {desktop && onPc && <UsageNotes key={requestId} action={action} waiting={waiting} usage={sample?.usage ?? null}/>}</>}
      {panel === 'mirabox' && <MiraBoxPanel mirabox={sample?.mirabox ?? null} onAction={onPc ? launch : undefined} onPress={onPc ? pressKey : undefined}/>}
      {panel === 'dock' && <DockPanel onAction={onPc ? launch : undefined} desktop={desktop}/>}
      {panel === 'market' && <MarketDashboard compact={desktop}/>}
    </section>
    {native?.result && <p className={styles.help} role="status">{native.result}</p>}
  </main>;
}
