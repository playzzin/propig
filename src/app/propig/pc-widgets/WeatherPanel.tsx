'use client';

import { useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import {
  Cloud, CloudFog, CloudHail, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun,
  Moon, RefreshCw, Sun, Wind, type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/firebase/config';
import { ClockFace } from './ClockCalendar';
import {
  describeForecast, forecastCacheKey, forecastCities, forecastHour, forecastIsFresh, koreanDate,
  loadForecast, readCachedForecast, startOfKoreanDay, type ForecastCity, type WeatherForecast, type WeatherIcon,
} from './forecast';
import clock from './ClockCalendar.module.css';
import styles from './WeatherPanel.module.css';

const preference = 'propig.pc-widgets.weather.station.v1';
const preferenceChanged = 'propig-weather-station';
const temporaryCities = new Map<string, ForecastCity>();
const serverCity = () => null;
function selectedCity(key: string) {
  const temporary = temporaryCities.get(key);
  if (temporary) return temporary;
  try {
    const station = window.localStorage.getItem(key);
    return forecastCities.find(city => city.station === station) ?? forecastCities[0];
  } catch { return forecastCities[0]; }
}
function storeCity(key: string, city: ForecastCity) {
  try {
    window.localStorage.setItem(key, city.station);
    temporaryCities.delete(key);
  } catch { temporaryCities.set(key, city); }
  window.dispatchEvent(new Event(preferenceChanged));
}
function subscribeCity(changed: () => void) {
  const stored = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(preference)) changed();
  };
  window.addEventListener('storage', stored);
  window.addEventListener(preferenceChanged, changed);
  return () => {
    window.removeEventListener('storage', stored);
    window.removeEventListener(preferenceChanged, changed);
  };
}

type Status = 'loading' | 'ready' | 'offline' | 'error';
type Reading = { forecast: WeatherForecast | null; now: number; status: Status };
const initialReading: Reading = { forecast: null, now: 0, status: 'loading' };

function useCityWeather(city: ForecastCity | null) {
  const [reading, setReading] = useState(initialReading);
  const [refreshCount, refresh] = useReducer((count: number) => count + 1, 0);
  useEffect(() => {
    if (!city) return;
    const station = city;
    let active = true;
    let running = false;
    let retry = false;
    let timer: number | undefined;
    async function update(manual = false) {
      window.clearTimeout(timer);
      if (!active || document.hidden || running) return;
      running = true;
      let forecast = readCachedForecast(station);
      let status: Status = 'ready';
      if (navigator.onLine === false) {
        status = 'offline';
      } else if (manual || retry || !forecast || !forecastIsFresh(forecast, Date.now())) {
        setReading({ forecast, now: Date.now(), status: 'loading' });
        try {
          forecast = await loadForecast(station, manual || retry);
          retry = false;
        } catch {
          retry = true;
          forecast = readCachedForecast(station);
          status = navigator.onLine ? 'error' : 'offline';
        }
      }
      running = false;
      if (!active) return;
      const now = Date.now();
      setReading({ forecast, now, status });
      if (document.hidden) return;
      const nextHour = (Math.floor(now / forecastHour) + 1) * forecastHour;
      const retryAt = status === 'ready' && forecast ? forecast.fetchedAt + forecastHour : now + 15 * 60_000;
      timer = window.setTimeout(recheck, Math.max(1_000, Math.min(nextHour, retryAt) - now));
    }
    function recheck() { void update(); }
    function stored(event: StorageEvent) {
      if (event.key === forecastCacheKey(station)) recheck();
    }
    queueMicrotask(() => { void update(refreshCount > 0); });
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('online', recheck);
    window.addEventListener('offline', recheck);
    window.addEventListener('storage', stored);
    return () => {
      active = false;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', recheck);
      window.removeEventListener('online', recheck);
      window.removeEventListener('offline', recheck);
      window.removeEventListener('storage', stored);
    };
  }, [city, refreshCount]);
  return { ...reading, refresh };
}

const symbols: Record<WeatherIcon, [string, LucideIcon]> = {
  'clear-day': ['맑음', Sun], 'clear-night': ['맑음', Moon],
  'partly-cloudy-day': ['구름 조금', CloudSun], 'partly-cloudy-night': ['구름 조금', CloudMoon],
  cloudy: ['흐림', Cloud], fog: ['안개', CloudFog], wind: ['바람', Wind], rain: ['비', CloudRain],
  sleet: ['진눈깨비', CloudSnow], snow: ['눈', CloudSnow], hail: ['우박', CloudHail], thunderstorm: ['뇌우', CloudLightning],
};
function Sky({ code }: { code: WeatherIcon | null }) {
  if (!code) return <span className={clock.muted} aria-label="예보 없음">—</span>;
  const [label, Icon] = symbols[code];
  return <span className={clock.condition}><Icon size={16} aria-hidden="true" />{label}</span>;
}
const degrees = (value: number | null) => value === null ? '—' : Math.round(value) + '°';
const dateLabel = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' });
const dayLabel = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', weekday: 'short' });
const stamp = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function forecastStatus(status: Status, saved: boolean) {
  switch (status) {
    case 'loading': return '예보를 불러오는 중입니다.';
    case 'offline': return saved ? '오프라인 · 저장된 예보' : '오프라인입니다. 연결 후 예보를 확인해 주세요.';
    case 'error': return saved ? '갱신 실패 · 저장된 예보' : '예보를 불러오지 못했습니다. 새로고침으로 다시 시도해 주세요.';
    case 'ready': return '';
  }
}

function WeatherCard({ city, externalLinks, choose, syncMessage }: {
  city: ForecastCity | null; externalLinks: boolean; choose: (station: string) => void; syncMessage: string;
}) {
  const { forecast, now, status, refresh } = useCityWeather(city);
  const view = forecast && describeForecast(forecast, now);
  const current = view?.current;
  const message = forecastStatus(status, !!forecast);
  return (
    <section className={clock.panel} aria-label="시계와 날씨">
      <header className={clock.header}>
        <h2>시계 · 날씨</h2>
        <div className={styles.controls}>
          <select className={styles.city} aria-label="예보 지역" value={(city ?? forecastCities[0]).station}
            onChange={event => choose(event.target.value)}>
            {forecastCities.map(item => <option key={item.station} value={item.station}>{item.name}</option>)}
          </select>
          <button type="button" className={clock.button} disabled={status === 'loading'} onClick={refresh} aria-label="날씨 새로고침">
            <RefreshCw size={16} aria-hidden="true" />
          </button>
        </div>
      </header>
      {syncMessage && <p className={styles.status} role="status">{syncMessage}</p>}
      <div className={clock.now}>
        <ClockFace />
        {current && (
          <div className={clock.currentWeather}>
            <span className={clock.label}>
              {current.time > now ? '다음 예보' : now - current.time >= forecastHour ? '마지막 예보' : '현재 시각 예보'}
            </span>
            <strong className={clock.temperature}>{degrees(current.temperature)}</strong>
            <Sky code={current.icon} />
            <time className={styles.timeNote} dateTime={new Date(current.time).toISOString()}>{stamp.format(current.time)}</time>
          </div>
        )}
      </div>
      <p className={styles.status} role="status">
        {message}
        {forecast && <>{message && ' · '}예보 확인 <time dateTime={new Date(forecast.fetchedAt).toISOString()}>{stamp.format(forecast.fetchedAt)}</time> KST</>}
      </p>
      {view && (
        <>
          <table className={clock.forecast}>
            <caption>{view.archived ? '저장된 7일 예보' : '7일 예보'}</caption>
            <thead><tr><th scope="col">날짜</th><th scope="col">낮 예보</th><th scope="col">최고 / 최저</th><th scope="col">최대 강수확률</th></tr></thead>
            <tbody>{view.days.map(entry => (
              <tr key={entry.date}>
                <th scope="row">
                  <time dateTime={koreanDate(entry.date)}>{entry.date === startOfKoreanDay(now) ? '오늘' : dayLabel.format(entry.date)}</time>
                  <span className={clock.smallDate}>{dateLabel.format(entry.date)}</span>
                </th>
                <td><Sky code={entry.icon} /></td>
                <td>{degrees(entry.high)} <span className={clock.muted}>/ {degrees(entry.low)}</span></td>
                <td>{entry.rain === null ? '—' : Math.round(entry.rain) + '%'}</td>
              </tr>
            ))}</tbody>
          </table>
          <p className={styles.note}>낮 예보는 정오에 가장 가까운 시각 기준입니다. 최고·최저는 제공된 시간별 기온으로 계산했습니다. 강수확률은 1·6시간 예보 중 가장 높은 값입니다.</p>
        </>
      )}
      <p className={clock.source}>
        {externalLinks ? <>
          <a href="https://www.dwd.de/EN/service/legal_notice/legal_notice.html" target="_blank" rel="noreferrer">독일 기상청(DWD)</a>
          {' · '}<a href="https://brightsky.dev/" target="_blank" rel="noreferrer">Bright Sky</a>
          {' · '}<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>
        </> : '독일 기상청(DWD) · Bright Sky · CC BY 4.0 (creativecommons.org/licenses/by/4.0/)'}
      </p>
    </section>
  );
}

function CityPreference({ uid, externalLinks }: { uid?: string; externalLinks: boolean }) {
  const key = uid ? preference + '.user.' + encodeURIComponent(uid) : preference;
  const city = useSyncExternalStore<ForecastCity | null>(subscribeCity, () => selectedCity(key), serverCity);
  const pending = useRef<{ city: ForecastCity; previous: ForecastCity; failed: boolean } | null>(null);
  const [syncMessage, setSyncMessage] = useState('');

  useEffect(() => {
    if (!uid) return;
    let active = true;
    const ref = doc(db, 'users', uid, 'pcWidgetSettings', 'weather');
    const unsubscribe = onSnapshot(ref, snapshot => {
      if (!active) return;
      const station = snapshot.get('station');
      const remote = forecastCities.find(item => item.station === station);
      if (!remote) return;
      const intent = pending.current;
      if (intent && !intent.failed) {
        if (remote !== intent.city) intent.previous = remote;
        return;
      }
      // Firestore can emit the previous value when a write fails. Keep the local choice
      // in that case, but still accept a subsequent change made on another device.
      if (intent && remote === intent.previous) return;
      pending.current = null;
      storeCity(key, remote);
      setSyncMessage('');
    }, () => {
      if (active) setSyncMessage('계정의 예보 지역을 불러오지 못했습니다. 이 기기의 설정을 사용합니다.');
    });
    return () => {
      active = false;
      pending.current = null;
      unsubscribe();
    };
  }, [uid, key]);

  function choose(station: string) {
    const choice = forecastCities.find(item => item.station === station);
    if (!choice) return;
    const previous = selectedCity(key);
    storeCity(key, choice);
    if (!uid) return;
    setSyncMessage('');
    const intent = { city: choice, previous, failed: false };
    pending.current = intent;
    const ref = doc(db, 'users', uid, 'pcWidgetSettings', 'weather');
    void setDoc(ref, { station }, { merge: true }).then(() => {
      if (pending.current === intent) pending.current = null;
    }).catch(() => {
      if (pending.current === intent) {
        intent.failed = true;
        setSyncMessage('계정에 예보 지역을 저장하지 못했습니다. 이 기기에서는 선택한 지역을 사용합니다.');
      }
    });
  }
  return <WeatherCard key={city?.station ?? 'initial'} city={city} externalLinks={externalLinks} choose={choose} syncMessage={syncMessage} />;
}

export function WeatherPanel({ externalLinks = true }: { externalLinks?: boolean }) {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid;
  return <CityPreference key={uid ? 'user.' + uid : 'guest'} uid={uid} externalLinks={externalLinks} />;
}
