'use client';

import { useState, useSyncExternalStore } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import styles from './ClockCalendar.module.css';

const minute = 60_000;
const dayLength = 24 * 60 * minute;
const koreaOffset = 9 * 60 * minute;
const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
const timeFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const dateFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
});
// Only tick when the displayed minute changes. A suspended widget catches up when it becomes visible.
function subscribeClock(onChange: () => void) {
  let timer: number;
  function schedule() {
    window.clearTimeout(timer);
    if (document.hidden) return;
    onChange();
    timer = window.setTimeout(schedule, minute - Date.now() % minute);
  }
  schedule();
  document.addEventListener('visibilitychange', schedule);
  return () => {
    window.clearTimeout(timer);
    document.removeEventListener('visibilitychange', schedule);
  };
}

const readMinute = () => Math.floor(Date.now() / minute) * minute;
const serverMinute = () => null;
function useClock() {
  return useSyncExternalStore<number | null>(subscribeClock, readMinute, serverMinute);
}

// This UTC midnight represents the Seoul calendar date, independent of the browser's time zone.
function seoulDate(timestamp: number) {
  return new Date(Math.floor((timestamp + koreaOffset) / dayLength) * dayLength);
}

export function ClockFace() {
  const now = useClock();
  return <div>
    <p className={styles.label}>한국 표준시</p>
    <time className={styles.time} dateTime={now === null ? undefined : new Date(now).toISOString()}>
      {now === null ? '––:––' : timeFormat.format(now)}
    </time>
    <div className={styles.date}>{now === null ? '날짜 확인 중' : dateFormat.format(now)}</div>
  </div>;
}

export function CalendarPanel() {
  const now = useClock();
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const today = now === null ? null : seoulDate(now);
  const currentMonth = today ? Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1) : null;
  const shown = selectedMonth ?? currentMonth;
  const first = shown === null ? null : new Date(shown);
  const title = first ? `${first.getUTCFullYear()}년 ${first.getUTCMonth() + 1}월` : '달력';

  function moveMonth(delta: number) {
    if (currentMonth === null) return;
    setSelectedMonth((previous) => {
      const target = new Date(previous ?? currentMonth);
      target.setUTCMonth(target.getUTCMonth() + delta);
      return target.getTime() === currentMonth ? null : target.getTime();
    });
  }

  return (
    <section className={styles.panel} aria-label="달력">
      <header className={styles.header}>
        <h2 aria-live="polite">{title}</h2>
        <div className={styles.controls}>
          <button type="button" className={styles.button} disabled={!first} aria-label="이전 달" onClick={() => moveMonth(-1)}><ChevronLeft size={16} aria-hidden="true" /></button>
          <button type="button" className={styles.button} disabled={shown === currentMonth} onClick={() => setSelectedMonth(null)}>오늘</button>
          <button type="button" className={styles.button} disabled={!first} aria-label="다음 달" onClick={() => moveMonth(1)}><ChevronRight size={16} aria-hidden="true" /></button>
        </div>
      </header>
      {first && today ? (
        <table className={styles.calendar} aria-label={title}>
          <thead><tr>{weekdays.map((weekday) => <th key={weekday} scope="col" abbr={weekday + '요일'}>{weekday}</th>)}</tr></thead>
          <tbody>{Array.from({ length: 6 }, (_, week) => (
            <tr key={week}>{weekdays.map((weekday, column) => {
              const slot = week * 7 + column - first.getUTCDay();
              const date = new Date(first.getTime() + slot * dayLength);
              const isToday = date.getTime() === today.getTime();
              return (
                <td key={weekday} data-outside={date.getUTCMonth() !== first.getUTCMonth() || undefined}>
                  <time dateTime={date.toISOString().slice(0, 10)} aria-current={isToday ? 'date' : undefined}>
                    {date.getUTCDate()}
                  </time>
                </td>
              );
            })}</tr>
          ))}</tbody>
        </table>
      ) : <p className={styles.muted}>날짜 확인 중</p>}
    </section>
  );
}
