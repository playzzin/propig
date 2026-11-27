'use client';

import { useEffect, useRef, useState } from 'react';
import { Cpu } from 'lucide-react';
import Link from 'next/link';
import styled from 'styled-components';

const SAMPLE_INTERVAL_MS = 1000;
const REQUEST_TIMEOUT_MS = 3000;

type Connection = { port: number; key: string };
type Status = 'idle' | 'invalid' | 'connecting' | 'baseline' | 'live' | 'paused' | 'disconnected';
type Reading = { status: 'live'; usage: number } | { status: Exclude<Status, 'live'> };

const statusLabel: Record<Status, string> = {
  idle: 'Windows 앱 연결 대기 중',
  invalid: '연결 링크가 올바르지 않아요.',
  connecting: 'Windows 앱에 연결 중…',
  baseline: 'CPU 사용률을 측정하는 중…',
  live: '이 PC에서 실시간 측정 중',
  paused: '페이지가 숨겨져 측정을 일시 중지했어요.',
  disconnected: 'Windows 앱에 연결할 수 없어요.',
};

function readConnection(params: URLSearchParams): Connection | null {
  const port = params.get('port');
  const key = params.get('key');
  if (!port || !/^[1-9][0-9]{0,4}$/.test(port) || Number(port) > 65535 ||
      !key || !/^[a-f0-9]{64}$/.test(key) ||
      params.getAll('port').length !== 1 || params.getAll('key').length !== 1) {
    return null;
  }
  return { port: Number(port), key };
}

function readUsage(payload: unknown): number | null {
  if (payload && typeof payload === 'object' && 'usage' in payload) {
    const usage = payload.usage;
    if (usage === null || (typeof usage === 'number' && Number.isFinite(usage) && usage >= 0 && usage <= 100)) {
      return usage;
    }
  }
  throw new Error('Invalid CPU sample');
}

export default function CpuUsageWidget() {
  const [reading, setReading] = useState<Reading>({ status: 'idle' });
  const reconnect = useRef<(() => void) | null>(null);

  useEffect(() => {
    let connection: Connection | null = null;
    let request: AbortController | undefined;
    let nextPoll: number | undefined;

    function stopPolling() {
      window.clearTimeout(nextPoll);
      request?.abort();
      request = undefined;
    }

    function pause() {
      stopPolling();
      if (connection) setReading({ status: 'paused' });
    }

    async function poll(activeConnection: Connection) {
      const pending = new AbortController();
      request = pending;
      const startedAt = performance.now();
      const deadline = window.setTimeout(() => pending.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(`http://127.0.0.1:${activeConnection.port}/v1/cpu`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${activeConnection.key}` },
          credentials: 'omit',
          cache: 'no-store',
          mode: 'cors',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
          signal: pending.signal,
        });
        if (!response.ok) throw new Error('CPU measurement unavailable');
        const usage = readUsage(await response.json());
        if (request !== pending) return;

        setReading(usage === null ? { status: 'baseline' } : { status: 'live', usage });
        const delay = Math.max(0, SAMPLE_INTERVAL_MS - (performance.now() - startedAt));
        nextPoll = window.setTimeout(() => void poll(activeConnection), delay);
      } catch {
        if (request === pending) setReading({ status: 'disconnected' });
      } finally {
        window.clearTimeout(deadline);
        if (request === pending) request = undefined;
      }
    }

    function startPolling() {
      if (!connection) return;
      if (document.hidden) {
        pause();
        return;
      }
      stopPolling();
      setReading({ status: 'connecting' });
      void poll(connection);
    }

    function consumeHash() {
      const { hash, pathname, search } = window.location;
      const params = new URLSearchParams(hash.slice(1));
      if (!params.has('port') && !params.has('key')) return;

      window.history.replaceState(window.history.state, '', pathname + search);
      connection = readConnection(params);
      if (connection) {
        startPolling();
      } else {
        stopPolling();
        setReading({ status: 'invalid' });
      }
    }

    function resumeOnRestore(event: PageTransitionEvent) {
      if (event.persisted) startPolling();
    }

    reconnect.current = startPolling;
    const startup = window.setTimeout(consumeHash, 0);
    window.addEventListener('hashchange', consumeHash);
    window.addEventListener('pagehide', pause);
    window.addEventListener('pageshow', resumeOnRestore);
    document.addEventListener('visibilitychange', startPolling);
    return () => {
      window.clearTimeout(startup);
      window.removeEventListener('hashchange', consumeHash);
      window.removeEventListener('pagehide', pause);
      window.removeEventListener('pageshow', resumeOnRestore);
      document.removeEventListener('visibilitychange', startPolling);
      reconnect.current = null;
      stopPolling();
    };
  }, []);

  const usage = reading.status === 'live' ? Math.round(reading.usage) : null;

  return (
    <main id="content-area" aria-labelledby="cpu-title">
      <WidgetPage>
        <DashboardLink href="/propig">위젯 대시보드</DashboardLink>
        <WidgetCard>
          <Heading>
            <Cpu aria-hidden="true" size={22} />
            <h1 id="cpu-title">CPU 사용률</h1>
          </Heading>
          <UsageValue>{usage === null ? '—' : `${usage}%`}</UsageValue>
          <UsageMeter aria-label="CPU 사용률" aria-hidden={usage === null} min={0} max={100} value={usage ?? 0} />
          <StatusText role="status">{statusLabel[reading.status]}</StatusText>
          {reading.status === 'idle' || reading.status === 'invalid' || reading.status === 'disconnected' ? (
            <ConnectionHelp>
              <p>이 PC의 ProPig Windows 앱에서 <strong>CPU 위젯 → 웹에서 보기</strong>를 누르세요.</p>
              <p>브라우저에서 로컬 네트워크 액세스 권한을 요청하면 허용하세요.</p>
              {reading.status === 'disconnected' ? (
                <>
                  <p>권한을 차단했다면 이 사이트의 권한을 바꾼 뒤 다시 연결하세요.</p>
                  <RetryButton type="button" onClick={() => reconnect.current?.()}>
                    다시 연결
                  </RetryButton>
                </>
              ) : null}
            </ConnectionHelp>
          ) : null}
        </WidgetCard>
      </WidgetPage>
    </main>
  );
}

const WidgetPage = styled.div`
  width: min(100%, 650px);
  margin-inline: auto;
  padding: clamp(16px, 4vw, 36px);
  color: var(--text-main);
`;

const DashboardLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  margin-bottom: 8px;
  color: var(--text-muted);
  text-decoration: underline;
  text-underline-offset: 3px;

  &:hover { color: var(--text-main); }
  &:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }
`;

const WidgetCard = styled.div`
  padding: clamp(18px, 5vw, 34px);
  background: var(--bg-card);
  border: 1px solid var(--border-medium);
  border-radius: 20px;
`;

const Heading = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;

  svg { flex: none; color: var(--primary); }
  h1 { margin: 0; font-size: clamp(1.2rem, 4vw, 1.5rem); font-weight: 750; }
`;

const UsageValue = styled.p`
  margin: 14px 0 8px;
  font-size: clamp(2rem, 10vw, 4rem);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1.12;
`;

const UsageMeter = styled.meter`
  display: block;
  width: 100%;
  height: 10px;
  appearance: none;
  border: 0;
  border-radius: 999px;
  background: var(--bg-elevated);

  &::-webkit-meter-bar {
    border: 0;
    border-radius: 999px;
    background: var(--bg-elevated);
  }
  &::-webkit-meter-optimum-value { border-radius: 999px; background: var(--primary); }
  &::-moz-meter-bar { border-radius: 999px; background: var(--primary); }
`;

const StatusText = styled.p`
  margin: 14px 0 0;
  color: var(--text-muted);
  font-size: 0.875rem;
  line-height: 1.5;
`;

const ConnectionHelp = styled.div`
  display: grid;
  gap: 8px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
  color: var(--text-muted);
  font-size: 0.875rem;
  line-height: 1.6;

  p { margin: 0; }
  strong { color: var(--text-main); }
`;

const RetryButton = styled.button`
  justify-self: start;
  min-height: 44px;
  margin-top: 4px;
  padding-inline: 14px;
  border: 1px solid var(--border-medium);
  border-radius: 9px;
  background: var(--bg-elevated);
  color: var(--text-main);
  font-weight: 700;
  cursor: pointer;

  &:hover { border-color: var(--primary); }
  &:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }
`;
