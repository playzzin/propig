'use client';

import { useState, useSyncExternalStore } from 'react';
import {
  ChevronLeft, ChevronRight, Cloud, CloudDrizzle, CloudFog, CloudHail, CloudLightning,
  CloudMoon, CloudRain, CloudSnow, CloudSun, ExternalLink, Moon, RefreshCw, Sun,
  type LucideIcon,
} from 'lucide-react';
import styles from './ClockCalendar.module.css';

export interface WidgetWeather {
  updatedAt: number;
  current: { temperature: number | null; code: number | null; day: boolean };
  days: {
    date: string;
    code: number | null;
    high: number | null;
    low: number | null;
    rain: number | null;
  }[];
}

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
const stampFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
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

const conditions: Record<number, [string, LucideIcon]> = {
  0: ['맑음', Sun], 1: ['대체로 맑음', Sun], 2: ['구름 조금', CloudSun], 3: ['흐림', Cloud],
  45: ['안개', CloudFog], 48: ['서리 안개', CloudFog],
  51: ['약한 이슬비', CloudDrizzle], 53: ['이슬비', CloudDrizzle], 55: ['강한 이슬비', CloudDrizzle],
  56: ['어는 이슬비', CloudDrizzle], 57: ['어는 이슬비', CloudDrizzle],
  61: ['약한 비', CloudRain], 63: ['비', CloudRain], 65: ['강한 비', CloudRain],
  66: ['어는 비', CloudRain], 67: ['어는 비', CloudRain],
  71: ['약한 눈', CloudSnow], 73: ['눈', CloudSnow], 75: ['강한 눈', CloudSnow], 77: ['싸락눈', CloudSnow],
  80: ['약한 소나기', CloudRain], 81: ['소나기', CloudRain], 82: ['강한 소나기', CloudRain],
  85: ['눈 소나기', CloudSnow], 86: ['강한 눈 소나기', CloudSnow],
  95: ['뇌우', CloudLightning], 96: ['뇌우와 우박', CloudHail], 99: ['강한 뇌우와 우박', CloudHail],
};

function Condition({ code, night = false }: { code?: number | null; night?: boolean }) {
  const condition = typeof code === 'number' ? conditions[code] : undefined;
  if (!condition) return <span className={styles.muted}>예보 없음</span>;
  const [label, dayIcon] = condition;
  const Icon = night && dayIcon === Sun ? Moon : night && dayIcon === CloudSun ? CloudMoon : dayIcon;
  return <span className={styles.condition}><Icon size={18} aria-hidden="true" />{label}</span>;
}

function degrees(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)}°` : '—';
}

export function ClockWeatherPanel({ weather, onRefresh, externalLinks = true }: {
  weather?: WidgetWeather | null;
  onRefresh?: () => void;
  externalLinks?: boolean;
}) {
  const now = useClock();
  const today = now !== null ? seoulDate(now) : null;
  const updatedAt = weather?.updatedAt;
  const hasStamp = typeof updatedAt === 'number' && updatedAt > 0 && updatedAt <= 8.64e15;
  const isStale = hasStamp && now !== null && now - updatedAt >= 30 * minute;
  const forecast = weather?.days ?? [];
  return (
    <section className={styles.panel} aria-label="시계와 날씨">
      <header className={styles.header}>
        <h2>시계 · 날씨</h2>
        {onRefresh && (
          <button type="button" className={styles.button} aria-label="날씨 새로고침" onClick={onRefresh}>
            <RefreshCw size={16} aria-hidden="true" />
          </button>
        )}
      </header>
      <div className={styles.now}>
        <div>
          <p className={styles.label}>한국 표준시</p>
          <time className={styles.time} dateTime={now === null ? undefined : new Date(now).toISOString()}>
            {now === null ? '––:––' : timeFormat.format(now)}
          </time>
          <div className={styles.date}>{now === null ? '날짜 확인 중' : dateFormat.format(now)}</div>
        </div>
        {weather && (
          <div className={styles.currentWeather}>
            <span className={styles.label}>{isStale ? '마지막 기온' : '현재 기온'}</span>
            <strong className={styles.temperature}>{degrees(weather.current.temperature)}</strong>
            <Condition code={weather.current.code} night={!weather.current.day} />
          </div>
        )}
      </div>
      {weather && hasStamp ? (
        <>
          <p className={styles.stamp}>{isStale ? '최근 수신' : '예보 갱신'} · {stampFormat.format(updatedAt)}</p>
          {today && (
            <table className={styles.forecast}>
              <caption>7일 예보</caption>
              <thead><tr><th scope="col">날짜</th><th scope="col">날씨</th><th scope="col">최고 / 최저</th><th scope="col">강수확률</th></tr></thead>
              <tbody>{Array.from({ length: 7 }, (_, index) => {
                const date = new Date(today.getTime() + index * dayLength);
                const key = date.toISOString().slice(0, 10);
                const entry = forecast.find((item) => item.date === key);
                const rain = entry?.rain;
                return (
                  <tr key={key}>
                    <th scope="row">
                      <time dateTime={key}>{index === 0 ? '오늘' : weekdays[date.getUTCDay()]}</time>
                      <span className={styles.smallDate}>{date.getUTCMonth() + 1}/{date.getUTCDate()}</span>
                    </th>
                    <td><Condition code={entry?.code} /></td>
                    <td>{degrees(entry?.high)} <span className={styles.muted}>/ {degrees(entry?.low)}</span></td>
                    <td>{typeof rain === 'number' && rain >= 0 && rain <= 100 ? `${Math.round(rain)}%` : '—'}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          )}
          <p className={styles.source}>
            {externalLinks
              ? <><a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>{' · '}<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a></>
              : 'Open-Meteo · CC BY 4.0'}
          </p>
        </>
      ) : (
        <div className={styles.emptyWeather}>
          <p>Windows에서 날씨 스킨을 연결하면 설정한 지역의 7일 예보가 표시됩니다.</p>
          {externalLinks && <a href="https://www.weather.go.kr/w/index.do" target="_blank" rel="noreferrer">기상청 예보 열기 <ExternalLink size={13} aria-hidden="true" /></a>}
        </div>
      )}
    </section>
  );
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
