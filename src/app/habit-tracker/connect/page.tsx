'use client';

import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/firebase/config';
import { asiaNortheastFunctions } from '@/firebase/functions';

const proof = /^[A-Za-z0-9_-]{43}$/;
const createLogin = httpsCallable<{ challenge: string }, { code: string }>(
  asiaNortheastFunctions, 'createHabitDesktopLogin',
);

export default function ConnectWindowsHabits() {
  const { currentUser, loading, loginWithGoogle } = useAuth();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');

  const connect = async () => {
    const query = new URLSearchParams(window.location.search);
    const port = query.get('port') ?? '';
    const state = query.get('state') ?? '';
    const challenge = query.get('challenge') ?? '';
    if (!/^\d{4,5}$/.test(port) || Number(port) < 1024 || Number(port) > 65535 ||
      !proof.test(state) || !proof.test(challenge)) {
      setMessage('Windows 앱에서 로그인 연결을 다시 시작해 주세요.');
      return;
    }

    setWorking(true);
    setMessage('');
    try {
      if (!currentUser) {
        await loginWithGoogle();
        setMessage('로그인이 완료되었습니다. 아래에서 연결을 승인해 주세요.');
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
      setMessage('연결하지 못했습니다. Windows 앱에서 로그인 연결을 다시 시작해 주세요.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <main id="content-area" style={{ maxWidth: 520, padding: 24, margin: '32px auto' }}>
      <h1>Windows 습관 위젯 연결</h1>
      <p>현재 Windows 앱에서 로그인 연결을 시작했다면 이 기기의 앱에 ProPig 계정을 연결할 수 있습니다.</p>
      <button type="button" onClick={() => void connect()} disabled={loading || working}>
        {currentUser ? 'Windows 앱 연결 승인' : 'Google 로그인'}
      </button>
      {message && <p role="status">{message}</p>}
    </main>
  );
}
