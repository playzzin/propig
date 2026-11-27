'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/firebase/config';
import { inMemoryPersistence, setPersistence, signInWithCustomToken, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import styles from './DesktopSession.module.css';

type WorkspaceMessageType =
  | 'workspace-ready'
  | 'workspace-connected'
  | 'workspace-sign-in-failed'
  | 'workspace-records-changed'
  | 'workspace-open';

export type DesktopTarget = 'memo' | 'todo' | 'habit' | 'bucket' | 'calculator';

type WebViewBridge = {
  postMessage: (message: { type: WorkspaceMessageType; version: 1; requestId: string; target?: DesktopTarget }) => void;
  addEventListener: (type: 'message', listener: (event: MessageEvent<unknown>) => void) => void;
  removeEventListener: (type: 'message', listener: (event: MessageEvent<unknown>) => void) => void;
};

type ApprovedConnection = {
  status: 'approved';
  uid: string;
  requestId: string;
  notify: (type: WorkspaceMessageType, target?: DesktopTarget) => boolean;
};

type Connection = { status: 'pending' | 'browser' | 'failed' } | ApprovedConnection;

function getBridge(): WebViewBridge | undefined {
  const chrome = (window as Window & { chrome?: { webview?: WebViewBridge } }).chrome;
  const bridge = chrome?.webview;
  return bridge
    && typeof bridge.postMessage === 'function'
    && typeof bridge.addEventListener === 'function'
    && typeof bridge.removeEventListener === 'function'
    ? bridge
    : undefined;
}

function readSession(data: unknown, requestId: string) {
  if (!data || typeof data !== 'object') return null;
  const message = data as Record<string, unknown>;
  if (
    message.type !== 'workspace-session'
    || message.version !== 1
    || message.requestId !== requestId
    || typeof message.uid !== 'string'
    || message.uid.length < 1
    || message.uid.length > 128
    || typeof message.customToken !== 'string'
    || message.customToken.length > 4096
    || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(message.customToken)
  ) {
    return null;
  }
  return { uid: message.uid, customToken: message.customToken };
}

function WorkspaceStatus({
  title,
  detail,
  pending = false,
}: {
  title: string;
  detail?: string;
  pending?: boolean;
}) {
  return (
    <main className={styles.statusScreen}>
      <section className={styles.statusPanel} role="status" aria-live="polite" aria-atomic="true">
        {pending ? <span className={styles.indicator} aria-hidden="true" /> : null}
        <h1 className={styles.statusTitle}>{title}</h1>
        {detail ? <p className={styles.statusDetail}>{detail}</p> : null}
      </section>
    </main>
  );
}

interface DesktopSessionActions {
  notifyHabitWrite: () => void;
  openTarget: (target: DesktopTarget) => void;
}

export function DesktopSession({ children }: { children: (actions: DesktopSessionActions) => ReactNode }) {
  const { currentUser, loading } = useAuth();
  const [connection, setConnection] = useState<Connection>({ status: 'pending' });
  const connectedRequest = useRef<string | null>(null);

  useEffect(() => {
    const bridge = getBridge();
    let active = true;
    if (!bridge) {
      queueMicrotask(() => {
        if (active) setConnection({ status: 'browser' });
      });
      return () => { active = false; };
    }

    let requestId: string | undefined;
    let receivedSession = false;
    let signedInUser: User | undefined;

    const notify = (type: WorkspaceMessageType, target?: DesktopTarget) => {
      if (!active || !requestId) return false;
      try {
        bridge.postMessage({ type, version: 1, requestId, ...(target && { target }) });
        return true;
      } catch {
        return false;
      }
    };

    const fail = () => {
      if (!active) return;
      setConnection({ status: 'failed' });
      notify('workspace-sign-in-failed');
    };

    const connect = async (session: NonNullable<ReturnType<typeof readSession>>, sessionRequestId: string) => {
      try {
        await setPersistence(auth, inMemoryPersistence);
        if (!active) return;
        const credential = await signInWithCustomToken(auth, session.customToken);
        signedInUser = credential.user;
        if (!active || signedInUser.uid !== session.uid || auth.currentUser?.uid !== session.uid) {
          if (auth.currentUser === signedInUser) await signOut(auth);
          fail();
          return;
        }
        setConnection({ status: 'approved', uid: session.uid, requestId: sessionRequestId, notify });
      } catch {
        fail();
      }
    };

    const handleMessage = (event: MessageEvent<unknown>) => {
      if (!active || !requestId || receivedSession) return;
      const session = readSession(event.data, requestId);
      if (!session) return;
      receivedSession = true;
      void connect(session, requestId);
    };

    bridge.addEventListener('message', handleMessage);
    queueMicrotask(() => {
      if (!active) return;
      try {
        requestId = window.crypto.randomUUID();
        if (!notify('workspace-ready')) fail();
      } catch {
        fail();
      }
    });

    return () => {
      active = false;
      bridge.removeEventListener('message', handleMessage);
      if (signedInUser && auth.currentUser === signedInUser) {
        void signOut(auth).catch(() => undefined);
      }
    };
  }, []);

  const canShowWorkspace = connection.status === 'approved' && !loading && currentUser?.uid === connection.uid;
  useEffect(() => {
    if (connection.status !== 'approved' || loading) return;
    if (canShowWorkspace && connectedRequest.current !== connection.requestId) {
      if (connection.notify('workspace-connected')) {
        connectedRequest.current = connection.requestId;
      }
    } else if (!canShowWorkspace && connectedRequest.current === connection.requestId) {
      connection.notify('workspace-sign-in-failed');
      connectedRequest.current = null;
    }
  }, [canShowWorkspace, connection, loading]);

  const notifyWorkspaceWrite = useCallback(() => {
    if (connection.status === 'approved' && auth.currentUser?.uid === connection.uid) {
      connection.notify('workspace-records-changed');
    }
  }, [connection]);

  const openTarget = useCallback((target: DesktopTarget) => {
    if (connection.status === 'approved' && auth.currentUser?.uid === connection.uid) {
      connection.notify('workspace-open', target);
    }
  }, [connection]);

  if (connection.status === 'browser') {
    return <WorkspaceStatus title="Windows 앱에서 열어 주세요" detail="이 화면은 ProPig Windows 앱에서 연결할 수 있습니다." />;
  }
  if (connection.status === 'failed') {
    return <WorkspaceStatus title="계정을 연결하지 못했습니다" detail="Windows 앱에서 다시 연결해 주세요." />;
  }

  return (
    <div className={styles.workspace}>
      {canShowWorkspace ? (
        children({ notifyHabitWrite: notifyWorkspaceWrite, openTarget })
      ) : (
        <WorkspaceStatus title="ProPig 계정을 확인하는 중" detail="Windows 앱에 연결된 계정의 기록을 준비합니다." pending />
      )}
    </div>
  );
}
