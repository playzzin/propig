import type { CapacitorGlobal } from '@capacitor/core';
import { isWindowsDashboard } from '@/lib/desktopWorkspaceRoute';

export interface MobileWidgetSnapshot {
  date: string;
  habitDone: number;
  habitTotal: number;
  todoDone: number;
  todoTotal: number;
}

interface DashboardWidgetPlugin {
  setAccount(options: { uid: string | null }): Promise<void>;
  publish(options: MobileWidgetSnapshot & { uid: string }): Promise<void>;
  requestPin(): Promise<{ supported: boolean }>;
}

type DashboardPlatform = 'web' | 'android' | 'ios' | 'windows';

export function getDashboardPlatform(): DashboardPlatform {
  if (typeof window === 'undefined') return 'web';
  if (isWindowsDashboard) return 'windows';
  const { Capacitor } = window as Window & { Capacitor?: Pick<CapacitorGlobal, 'getPlatform'> };
  const platform = Capacitor?.getPlatform?.();
  return platform === 'ios' || platform === 'android' ? platform : 'web';
}

function isMobileDashboard() {
  const platform = getDashboardPlatform();
  return platform === 'ios' || platform === 'android';
}

let plugin: DashboardWidgetPlugin | undefined;
async function loadPlugin(): Promise<void> {
  if (plugin) return;
  const { Capacitor, registerPlugin } = await import('@capacitor/core');
  if (Capacitor.isPluginAvailable('DashboardWidget')) {
    // Capacitor proxies expose arbitrary method names, including "then". Keep the proxy out of Promise results.
    plugin ??= registerPlugin<DashboardWidgetPlugin>('DashboardWidget');
  }
}

let activeUid: string | null | undefined;
let revision = 0;
let confirmedRevision = -1;
let pending = Promise.resolve();

function enqueue(write: (widget: DashboardWidgetPlugin) => Promise<void>) {
  pending = pending.then(async () => {
    await loadPlugin();
    if (plugin) await write(plugin);
  }).catch(() => {
    // An older or interrupted native host must not block subsequent dashboard updates.
    confirmedRevision = -1;
  });
  return pending;
}

async function confirmAccount(widget: DashboardWidgetPlugin, uid: string | null, expected: number) {
  if (confirmedRevision === expected) return;
  await widget.setAccount({ uid });
  confirmedRevision = expected;
}

export function syncMobileWidgetAccount(uid: string | null): Promise<void> {
  if (!isMobileDashboard()) return Promise.resolve();
  if (uid !== activeUid) {
    activeUid = uid;
    revision++;
  }
  const expected = revision;
  return enqueue(async widget => {
    if (expected === revision) {
      await confirmAccount(widget, uid, expected);
    } else {
      // A sign-out and sign-in can both arrive before the bridge is ready.
      await widget.setAccount({ uid: null });
      confirmedRevision = -1;
    }
  });
}

export function publishMobileWidget(uid: string, snapshot: MobileWidgetSnapshot): Promise<void> {
  if (!isMobileDashboard() || !uid || uid !== activeUid) return Promise.resolve();
  const expected = revision;
  return enqueue(async widget => {
    if (expected !== revision) return;
    await confirmAccount(widget, uid, expected);
    if (expected === revision) await widget.publish({ ...snapshot, uid });
  });
}

export async function requestMobileWidgetPin(): Promise<boolean> {
  if (getDashboardPlatform() !== 'android') return false;
  try {
    await loadPlugin();
    return plugin ? (await plugin.requestPin()).supported : false;
  } catch {
    return false;
  }
}
