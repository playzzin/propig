'use client';

import { useState } from 'react';
import type { PcUsage } from './pcSnapshot';
import styles from './PcWidgetBoard.module.css';

type Props = { action: (target: string) => void; waiting: boolean; usage: PcUsage | null };

export function UsageNotes({ action, waiting, usage }: Props) {
  const saved = usage?.providers.find(p => p.id === 'antigravity' && p.status === 'MANUAL');
  const [short, setShort] = useState(String(saved?.short ?? ''));
  const [weekly, setWeekly] = useState(String(saved?.weekly ?? ''));
  const [balance, setBalance] = useState(String(usage?.flow?.balance ?? ''));
  const [reset, setReset] = useState(usage?.flow?.reset ?? '');
  return <details className={styles.settings}>
    <summary>사용량 직접 기록</summary>
    <p>Antigravity IDE에서 확인한 잔여량을 기록할 수 있습니다. CLI가 최신 한도를 알려주면 그 값을 표시합니다.</p>
    <form className={styles.note} onSubmit={e => { e.preventDefault(); action('note/antigravity/'+(short || '-')+'/'+(weekly || '-')); }}>
      <label>5시간 잔여 (%)<input type="number" min="0" max="100" step="any" value={short} onChange={e => setShort(e.target.value)}/></label>
      <label>주간 잔여 (%)<input type="number" min="0" max="100" step="any" value={weekly} onChange={e => setWeekly(e.target.value)}/></label>
      <button disabled={waiting || (!short && !weekly)}>잔여량 저장</button>
      <button type="button" disabled={waiting} onClick={() => { setShort(''); setWeekly(''); action('note/antigravity/-/-'); }}>기록 비우기</button>
    </form>
    <form className={styles.note} onSubmit={e => { e.preventDefault(); action('note/flow/'+balance+'/'+(reset || '-')); }}>
      <label>Flow 크레딧 잔액<input type="number" min="0" max="1000000000000" step="any" required value={balance} onChange={e => setBalance(e.target.value)}/></label>
      <label>리셋 날짜 (선택)<input type="date" value={reset} onChange={e => setReset(e.target.value)}/></label>
      <button disabled={waiting || !balance}>크레딧 저장</button>
      <button type="button" disabled={waiting} onClick={() => { setBalance(''); setReset(''); action('note/flow/-/-'); }}>잔액 비우기</button>
    </form>
  </details>;
}
