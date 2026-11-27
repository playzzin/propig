'use client';

import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/firebase/config';
import { asiaNortheastFunctions } from '@/firebase/functions';
import styles from './connect.module.css';

const proof = /^[A-Za-z0-9_-]{43}$/;
const createLogin = httpsCallable<{ challenge: string }, { code: string }>(
  asiaNortheastFunctions, 'createHabitDesktopLogin',
);

export default function ConnectWindowsHabits() {
  const { currentUser, loading, loginWithGoogle } = useAuth();
  const [action, setAction] = useState<'signing-in' | 'approving' | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);

  const email = currentUser?.email;
  const accountName = currentUser?.displayName?.trim() || email || 'ProPig 계정';
  const buttonLabel = loading ? '계정 확인 중…'
    : action === 'signing-in' ? 'Google 로그인 중…'
    : action === 'approving' ? 'Windows 앱에 승인 전달 중…'
    : currentUser ? 'Windows 앱 연결 승인' : 'Google 로그인';

  const connect = async () => {
    if (loading || action) return;

    const query = new URLSearchParams(window.location.search);
    const port = query.get('port') ?? '';
    const state = query.get('state') ?? '';
    const challenge = query.get('challenge') ?? '';
    if (!/^\d{4,5}$/.test(port) || Number(port) < 1024 || Number(port) > 65535 ||
      !proof.test(state) || !proof.test(challenge)) {
      setMessage({ text: 'Windows 앱에서 로그인 연결을 다시 시작해 주세요.', tone: 'error' });
      return;
    }

    setAction(currentUser ? 'approving' : 'signing-in');
    setMessage(null);
    try {
      if (!currentUser) {
        await loginWithGoogle();
        setMessage({ text: 'Google 로그인에 성공했어요. 이제 Windows 앱 연결을 승인해 주세요.', tone: 'info' });
        setAction(null);
        return;
      }

      const { data } = await createLogin({ challenge });
      if (!proof.test(data.code) || auth.currentUser?.uid !== currentUser.uid) {
        throw new Error('The connection is no longer valid.');
      }
      const callback = new URL(`http://127.0.0.1:${port}/complete`);
      callback.search = new URLSearchParams({ code: data.code, state }).toString();
      window.location.replace(callback.toString());
    } catch {
      setMessage({
        text: currentUser
          ? '연결하지 못했습니다. Windows 앱에서 로그인 연결을 다시 시작해 주세요.'
          : 'Google 로그인에 실패했습니다. 다시 시도해 주세요.',
        tone: 'error',
      });
      setAction(null);
    }
  };

  return (
    <main id="content-area" className={styles.page} aria-labelledby="windows-habit-connect-title" tabIndex={-1}>
      <section className={styles.card}>
        <span className={styles.deviceIcon} aria-hidden="true">✓</span>
        <h1 id="windows-habit-connect-title" className={styles.heading}>Windows 습관 위젯 연결</h1>
        <p className={styles.description}>
          ProPig 계정을 이 PC에 연결하면 Windows 위젯에서도 오늘의 습관을 확인하고 체크할 수 있어요.
        </p>

        <div className={styles.account}>
          <p className={styles.accountLabel}>{currentUser ? '연결할 계정' : 'ProPig 계정'}</p>
          <p className={styles.accountName}>
            {loading ? '계정을 확인하고 있어요.' : currentUser ? accountName : 'Google 계정으로 로그인해 주세요.'}
          </p>
          {currentUser && email && email !== accountName && <p className={styles.accountEmail}>{email}</p>}
        </div>

        <button
          type="button"
          className={styles.approveButton}
          onClick={() => void connect()}
          disabled={loading || action !== null}
        >
          <span>{buttonLabel}</span>
          {!loading && !action && <span className={styles.arrow} aria-hidden="true">→</span>}
        </button>
        <p role="status" className={styles.message} data-tone={message?.tone}>{message?.text}</p>
        <p className={styles.hint}>이 PC의 Windows 앱에서 시작한 연결 요청인지 확인해 주세요.</p>
      </section>
    </main>
  );
}
