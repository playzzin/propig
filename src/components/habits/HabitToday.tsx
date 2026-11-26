'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Download, LogIn } from 'lucide-react';
import { onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { auth, ensureFirestorePersistence } from '@/firebase/config';
import { toDateKey } from './habitTrackerDateUtils';
import { createHabitWorkspaceRef, saveHabitRecordPatch } from './habitWorkspaceStore';
import styles from './HabitToday.module.css';

interface TodayHabit {
  id: string;
  name: string;
  order?: number;
  mode?: string;
}

interface TodayWorkspace {
  habits: TodayHabit[];
  records: Record<string, Record<string, { checked?: boolean }>>;
  fromCache: boolean;
  pendingWrites: boolean;
}

const dateFormatter = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });

function useTodayKey() {
  const [dateKey, setDateKey] = useState('');
  useEffect(() => {
    const refresh = () => setDateKey(toDateKey(new Date()));
    refresh();
    const interval = window.setInterval(refresh, 30_000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  return dateKey;
}

function TodayChecklist({ uid, dateKey, onRetry }: { uid: string; dateKey: string; onRetry: () => void }) {
  const [workspace, setWorkspace] = useState<TodayWorkspace | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const fail = () => {
      if (!cancelled && auth.currentUser?.uid === uid) setLoadError(true);
    };
    void ensureFirestorePersistence().then(() => {
      if (cancelled || auth.currentUser?.uid !== uid) return;
      unsubscribe = onSnapshot(createHabitWorkspaceRef(uid), { includeMetadataChanges: true }, (snapshot) => {
        if (cancelled || auth.currentUser?.uid !== uid) return;
        const data = snapshot.data();
        if (!data && snapshot.metadata.fromCache) return;

        const habits: TodayHabit[] = Array.isArray(data?.habits) ? data.habits : [];
        setWorkspace({
          habits: habits
            .filter((habit) => typeof habit?.id === 'string' && typeof habit.name === 'string' && habit.mode === 'check')
            .sort((first, second) => (first.order ?? 0) - (second.order ?? 0)),
          records: data?.records ?? {},
          fromCache: snapshot.metadata.fromCache,
          pendingWrites: snapshot.metadata.hasPendingWrites,
        });
      }, fail);
    }).catch(fail);

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [uid]);

  const changeCheck = async (habitId: string, checked: boolean) => {
    setSaveError('');
    if (dateKey !== toDateKey(new Date())) {
      setSaveError('날짜가 바뀌었습니다. 오늘 목록에서 다시 체크해 주세요.');
      return;
    }
    try {
      await saveHabitRecordPatch(uid, dateKey, habitId, { checked });
    } catch {
      if (auth.currentUser?.uid === uid) setSaveError('기록을 저장하지 못했습니다. 다시 체크해 주세요.');
    }
  };

  if (loadError) {
    return (
      <div className={styles.notice}>
        <p role="alert">습관을 불러오지 못했습니다.</p>
        <button type="button" onClick={onRetry}>다시 불러오기</button>
      </div>
    );
  }
  if (!workspace || !dateKey) return <p role="status">오늘 습관을 불러오는 중…</p>;

  const records = workspace.records[dateKey] ?? {};
  const total = workspace.habits.length;
  const completed = workspace.habits.filter((habit) => records[habit.id]?.checked === true).length;

  return (
    <>
      <div className={styles.summary}>
        <strong>{completed} / {total} 완료</strong>
        <span role="status">
          {workspace.pendingWrites ? '동기화 대기 중' : workspace.fromCache ? '기기 저장본' : '동기화됨'}
        </span>
      </div>
      {total > 0 && <progress aria-label="오늘 체크 진행률" value={completed} max={total} />}
      {saveError && <p role="alert" className={styles.error}>{saveError}</p>}
      {total === 0 ? (
        <p className={styles.notice}>체크형 습관이 없습니다. <Link href="/habit-tracker/manage">습관 관리</Link>에서 추가할 수 있습니다.</p>
      ) : (
        <ul className={styles.list}>
          {workspace.habits.map((habit) => (
            <li key={habit.id}>
              <label>
                <input
                  type="checkbox"
                  checked={records[habit.id]?.checked === true}
                  onChange={(event) => void changeCheck(habit.id, event.currentTarget.checked)}
                />
                <span>{habit.name}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function HabitToday() {
  const { currentUser, loading, loginWithGoogle, isConfigured, logout } = useAuth();
  const dateKey = useTodayKey();
  const [retry, setRetry] = useState(0);
  const [authPending, setAuthPending] = useState(false);
  const [authError, setAuthError] = useState('');

  const handleAuth = async () => {
    setAuthPending(true);
    setAuthError('');
    try {
      if (currentUser) await logout();
      else await loginWithGoogle();
    } catch {
      setAuthError(currentUser ? '로그아웃하지 못했습니다.' : '로그인하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      setAuthPending(false);
    }
  };

  return (
    <main className={styles.page} id="content-area">
      <section className={styles.card} aria-labelledby="today-habit-title">
        <header className={styles.header}>
          <div>
            {dateKey && <time dateTime={dateKey}>{dateFormatter.format(new Date(dateKey + 'T00:00:00'))}</time>}
            <h1 id="today-habit-title">오늘 습관</h1>
          </div>
          <Link href="/habit-tracker" className={styles.action}>
            전체 보기 <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </header>
        {loading ? <p role="status">로그인을 확인하는 중…</p> : currentUser ? (
          <TodayChecklist
            key={currentUser.uid + ':' + retry}
            uid={currentUser.uid}
            dateKey={dateKey}
            onRetry={() => setRetry((count) => count + 1)}
          />
        ) : (
          <div className={styles.notice}>
            <p>ProPig 계정으로 로그인하면 기존 습관을 체크할 수 있습니다.</p>
            <button type="button" disabled={!isConfigured || authPending} onClick={() => void handleAuth()}>
              <LogIn size={16} aria-hidden="true" /> Google 로그인
            </button>
          </div>
        )}
        {authError && <p role="alert" className={styles.error}>{authError}</p>}
        <footer className={styles.footer}>
          <details className={styles.install}>
            <summary><Download size={15} aria-hidden="true" /> Windows 앱 설치</summary>
            <p>Microsoft Edge에서 이 페이지를 열고 <strong>… → 추가 도구 → 앱 → 이 사이트를 앱으로 설치</strong>를 선택하세요. 설치한 앱 창은 좁게 줄이고 작업 표시줄에 고정할 수 있습니다.</p>
          </details>
          {currentUser && (
            <button type="button" disabled={authPending} onClick={() => void handleAuth()}>로그아웃</button>
          )}
        </footer>
      </section>
    </main>
  );
}
