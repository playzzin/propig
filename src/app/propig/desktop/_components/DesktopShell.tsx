'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { ArrowRight, ExternalLink, House, LayoutTemplate, ShoppingBag } from 'lucide-react';
import type { HabitView } from '@/components/habits/HabitTrackerApp';
import {
  getPropigStoreAppById,
  type PropigStoreApp,
  type PropigStoreAppId,
} from '@/constants/propigStore';
import { usePropigAppRegistry } from '@/hooks/usePropigAppRegistry';
import styles from './DesktopShell.module.css';

const LoadingScreen = () => <div className={styles.loading} role="status">화면을 여는 중…</div>;
const PropigStore = dynamic(() => import('@/components/propig/PropigStore'), { loading: LoadingScreen });
const HabitTrackerApp = dynamic(() => import('@/components/habits/HabitTrackerApp'), { loading: LoadingScreen });
const TodoListApp = dynamic(() => import('@/components/todo-list/TodoListApp'), { loading: LoadingScreen });
const SmartMemoWorkspace = dynamic(() => import('@/components/propig/memos/SmartMemoWorkspace'), { loading: LoadingScreen });
const StickyNotesBoard = dynamic(() => import('@/components/StickyNotesBoard'), { loading: LoadingScreen });

type DesktopApp = 'habit' | 'memos' | 'todo';
type WebApp = 'bucket' | 'calculator' | 'pc-widgets';
type DesktopWidget = 'habit' | 'memo' | 'todo' | 'market';
type View = 'home' | 'store' | DesktopApp;

interface DesktopShellProps {
  onHabitWrite: () => void;
  onOpenWidget: (widget: DesktopWidget) => void;
  onOpenWebApp: (app: WebApp) => void;
}

const WIDGET_LABELS: Record<DesktopWidget, string> = {
  habit: '습관 위젯',
  memo: '메모 위젯',
  todo: '할일 위젯',
  market: '국내 증시 위젯',
};

function isWebApp(appId: PropigStoreAppId): appId is WebApp {
  return appId === 'bucket' || appId === 'calculator' || appId === 'pc-widgets';
}

function desktopWidgetFor(app: PropigStoreApp | undefined): DesktopWidget | undefined {
  const widget = app?.widgetId;
  if (widget === 'memo' || widget === 'todo' || widget === 'habit') return widget;
  return undefined;
}

function AppIcon({ app }: { app: PropigStoreApp }) {
  return <i className={`fa-solid fa-${app.icon}`} style={{ color: app.color }} aria-hidden="true" />;
}

export function DesktopShell({ onHabitWrite, onOpenWidget, onOpenWebApp }: DesktopShellProps) {
  const registry = usePropigAppRegistry();
  const [view, setView] = useState<View>('home');
  const [habitView, setHabitView] = useState<HabitView>('daily');
  const [memoView, setMemoView] = useState<'list' | 'sticker'>('list');
  const installedApps = registry.installedAppIds
    .map(getPropigStoreAppById)
    .filter((app): app is PropigStoreApp => app?.status === 'available');
  const habitShortcut = registry.isInstalled('habit') ? undefined : getPropigStoreAppById('habit');
  const homeApps = habitShortcut ? [...installedApps, habitShortcut] : installedApps;
  const activeApp = view === 'home' || view === 'store' ? undefined : getPropigStoreAppById(view);
  const activeWidget = view === 'habit' || (activeApp && registry.isInstalled(activeApp.id))
    ? desktopWidgetFor(activeApp)
    : undefined;

  function openApp(appId: PropigStoreAppId) {
    if (appId === 'market') onOpenWidget('market');
    if (isWebApp(appId)) onOpenWebApp(appId);
    if (appId === 'habit' || appId === 'memos' || appId === 'todo') setView(appId);
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.rail}>
        <div className={styles.brand}>ProPig</div>
        <nav className={styles.navigation} aria-label="ProPig 앱">
          <button type="button" className={styles.navButton} aria-current={view === 'home' ? 'page' : undefined} onClick={() => setView('home')}>
            <House size={17} aria-hidden="true" />
            <span>홈</span>
          </button>
          <button type="button" className={styles.navButton} aria-current={view === 'store' ? 'page' : undefined} onClick={() => setView('store')}>
            <ShoppingBag size={17} aria-hidden="true" />
            <span>상점</span>
          </button>
          {installedApps.map((app) => (
            <button
              key={app.id}
              type="button"
              className={styles.navButton}
              aria-current={view === app.id ? 'page' : undefined}
              onClick={() => openApp(app.id)}
            >
              <AppIcon app={app} />
              <span>{app.title}</span>
              {isWebApp(app.id) ? <ExternalLink className={styles.external} size={13} aria-label="브라우저에서 열기" /> : null}
            </button>
          ))}
          {habitShortcut ? (
            <button
              type="button"
              className={`${styles.navButton} ${styles.habitShortcut}`}
              aria-current={view === 'habit' ? 'page' : undefined}
              onClick={() => openApp(habitShortcut.id)}
            >
              <AppIcon app={habitShortcut} />
              <span>{habitShortcut.title}</span>
            </button>
          ) : null}
        </nav>
      </aside>

      <div className={styles.content}>
        {view === 'home' ? (
          <main className={styles.home}>
            <div className={styles.homeInner}>
              <header className={styles.homeHeader}>
                <h1>내 작업 공간</h1>
                <button type="button" className={styles.primaryButton} onClick={() => setView('store')}>
                  <ShoppingBag size={17} aria-hidden="true" />
                  상점 열기
                </button>
              </header>
              {registry.isLoading ? <p className={styles.status} role="status">등록한 앱을 불러오는 중…</p> : null}
              {registry.error ? (
                <div className={styles.status} role="status">
                  {registry.error}
                  {registry.canRetryLoad ? <button type="button" className={styles.actionButton} onClick={registry.retryLoad}>다시 불러오기</button> : null}
                </div>
              ) : null}
              <div className={styles.cards}>
                {homeApps.map((app) => {
                  const widget = desktopWidgetFor(app);
                  return (
                    <article className={styles.card} key={app.id}>
                      <div className={styles.cardIcon}><AppIcon app={app} /></div>
                      <h2>{app.title}</h2>
                      <p>{app.summary}</p>
                      <div className={styles.cardActions}>
                        <button type="button" className={styles.actionButton} aria-label={`${app.title} ${isWebApp(app.id) ? '웹에서 열기' : '열기'}`} onClick={() => openApp(app.id)}>
                          {isWebApp(app.id) ? '웹에서 열기' : '열기'}
                          {isWebApp(app.id) ? <ExternalLink size={14} aria-hidden="true" /> : <ArrowRight size={14} aria-hidden="true" />}
                        </button>
                        {widget ? (
                          <button type="button" className={styles.actionButton} aria-label={`${WIDGET_LABELS[widget]} 열기`} onClick={() => onOpenWidget(widget)}>
                            <LayoutTemplate size={15} aria-hidden="true" />
                            위젯 열기
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </main>
        ) : null}

        {view === 'store' ? <PropigStore onOpenDashboard={() => setView('home')} onOpenApp={openApp} /> : null}

        {activeWidget || view === 'memos' ? (
          <div className={styles.toolbar}>
            {view === 'memos' ? (
              <div className={styles.memoViews} role="group" aria-label="메모 보기 방식">
                <button type="button" className={styles.actionButton} aria-pressed={memoView === 'list'} onClick={() => setMemoView('list')}>목록</button>
                <button type="button" className={styles.actionButton} aria-pressed={memoView === 'sticker'} onClick={() => setMemoView('sticker')}>스티커</button>
              </div>
            ) : null}
            {activeWidget ? (
              <button type="button" className={styles.actionButton} onClick={() => onOpenWidget(activeWidget)}>
                <LayoutTemplate size={16} aria-hidden="true" />
                {WIDGET_LABELS[activeWidget]} 열기
              </button>
            ) : null}
          </div>
        ) : null}

        {view === 'memos' ? (
          <main className={styles.memoSurface} aria-label="메모장">
            {memoView === 'list' ? <SmartMemoWorkspace /> : <StickyNotesBoard />}
          </main>
        ) : null}
        {view === 'todo' ? <TodoListApp /> : null}
        {view === 'habit' ? <HabitTrackerApp initialView={habitView} onViewChange={setHabitView} onWorkspaceWrite={onHabitWrite} /> : null}
      </div>
    </div>
  );
}
