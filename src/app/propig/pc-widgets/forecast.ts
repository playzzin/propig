export const forecastCities = [
  { station: '47108', name: '서울' }, { station: '47153', name: '부산' },
  { station: '47143', name: '대구' }, { station: '47133', name: '대전' },
  { station: '47156', name: '광주' }, { station: '47152', name: '울산' },
  { station: '47105', name: '강릉' }, { station: '47146', name: '전주' },
  { station: '47182', name: '제주' },
] as const;
export type ForecastCity = typeof forecastCities[number];

export const forecastHour = 3_600_000;
const day = 24 * forecastHour;
const koreaOffset = 9 * forecastHour;
export const startOfKoreanDay = (time: number) => Math.floor((time + koreaOffset) / day) * day - koreaOffset;
export const koreanDate = (time: number) => new Date(time + koreaOffset).toISOString().slice(0, 10);

const weatherIcons = [
  'clear-day', 'clear-night', 'partly-cloudy-day', 'partly-cloudy-night', 'cloudy', 'fog',
  'wind', 'rain', 'sleet', 'snow', 'hail', 'thunderstorm',
] as const;
export type WeatherIcon = typeof weatherIcons[number];
type Hour = { time: number; temperature: number | null; icon: WeatherIcon | null; rain: number | null };
export type WeatherForecast = { station: string; fetchedAt: number; hours: Hour[] };

const fields = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const numberIn = (value: unknown, low: number, high: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high ? value : null;
const percent = (value: unknown) => numberIn(value, 0, 100);
const largest = (a: number | null, b: number | null) => a === null ? b : b === null ? a : Math.max(a, b);

function readHour(time: unknown, temperature: unknown, icon: unknown, rain: unknown): Hour[] {
  const validTime = numberIn(time, Date.UTC(2000, 0), Date.UTC(2200, 0));
  if (validTime === null) return [];
  const degrees = numberIn(temperature, -100, 100);
  const symbol = weatherIcons.find(value => value === icon) ?? null;
  const probability = percent(rain);
  if (degrees === null && symbol === null && probability === null) return [];
  return [{ time: validTime, temperature: degrees, icon: symbol, rain: probability }];
}

export function forecastUrl(city: ForecastCity, now: number): URL {
  const url = new URL('https://api.brightsky.dev/weather');
  url.search = new URLSearchParams({
    wmo_station_id: city.station,
    date: koreanDate(now),
    last_date: koreanDate(now + 6 * day) + 'T23:00:00+09:00',
    tz: 'Asia/Seoul',
    units: 'dwd',
  }).toString();
  return url;
}

export function parseForecast(payload: unknown, city: ForecastCity, fetchedAt: number): WeatherForecast {
  const response = fields(payload);
  const sources = Array.isArray(response.sources) ? response.sources.map(fields) : [];
  const ids = new Set(sources.filter(source => source.wmo_station_id === city.station &&
    source.observation_type === 'forecast' && typeof source.id === 'number').map(source => source.id));
  const rows = Array.isArray(response.weather) ? response.weather.slice(0, 192) : [];
  const hours = rows.flatMap((item) => {
    const row = fields(item);
    if (!ids.has(row.source_id) || typeof row.timestamp !== 'string' || !/(?:Z|[+-]\d\d:\d\d)$/.test(row.timestamp)) return [];
    return readHour(Date.parse(row.timestamp), row.temperature, row.icon,
      largest(percent(row.precipitation_probability), percent(row.precipitation_probability_6h)));
  }).sort((a, b) => a.time - b.time);
  if (!hours.length || hours[hours.length - 1].time < fetchedAt - forecastHour) {
    throw new Error('해당 지역의 예보가 없습니다.');
  }
  return { station: city.station, fetchedAt, hours };
}

export function describeForecast(forecast: WeatherForecast, now: number) {
  const hours = forecast.hours;
  const current = hours.findLast(hour => hour.time <= now) ?? hours[0];
  const today = startOfKoreanDay(now);
  const archived = hours[hours.length - 1].time < today;
  const start = archived ? startOfKoreanDay(hours[0].time) : today;
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = start + index * day;
    const inDay = hours.filter(hour => hour.time >= date && hour.time < date + day);
    const temperatures = inDay.flatMap(hour => hour.temperature === null ? [] : [hour.temperature]);
    const noon = date + 12 * forecastHour;
    const typical = inDay.reduce<Hour | null>((best, hour) =>
      hour.icon && (!best || Math.abs(hour.time - noon) < Math.abs(best.time - noon)) ? hour : best, null);
    return {
      date, icon: typical?.icon ?? null, high: temperatures.length ? Math.max(...temperatures) : null,
      low: temperatures.length ? Math.min(...temperatures) : null,
      rain: inDay.reduce<number | null>((best, hour) => largest(best, hour.rain), null),
    };
  });
  return { current, archived, days };
}

const memory = new Map<string, WeatherForecast>();
const pending = new Map<string, Promise<WeatherForecast>>();
export const forecastCacheKey = (city: ForecastCity) => 'propig.pc-widgets.forecast.dwd.v1.' + city.station;
export const forecastIsFresh = (forecast: WeatherForecast, now: number) => now >= forecast.fetchedAt &&
  now - forecast.fetchedAt < forecastHour && startOfKoreanDay(now) === startOfKoreanDay(forecast.fetchedAt);

export function readCachedForecast(city: ForecastCity): WeatherForecast | null {
  const previous = memory.get(city.station) ?? null;
  try {
    const text = window.localStorage.getItem(forecastCacheKey(city));
    if (!text || text.length > 50_000) return previous;
    const saved = fields(JSON.parse(text));
    const fetchedAt = numberIn(saved.fetchedAt, Date.UTC(2000, 0), Date.now() + 60_000);
    if (saved.station !== city.station || fetchedAt === null || (previous && previous.fetchedAt >= fetchedAt) ||
      !Array.isArray(saved.hours) || saved.hours.length > 192) return previous;
    const hours = saved.hours.flatMap(item => {
      const row = fields(item);
      return readHour(row.time, row.temperature, row.icon, row.rain);
    }).sort((a, b) => a.time - b.time);
    if (!hours.length) return previous;
    const forecast = { station: city.station, fetchedAt, hours };
    memory.set(city.station, forecast);
    return forecast;
  } catch {
    return previous;
  }
}

// A shared origin lock prevents two visible tabs from fetching the same station at startup.
export function loadForecast(city: ForecastCity, manual = false): Promise<WeatherForecast> {
  const running = pending.get(city.station);
  if (running) return running;
  const previous = readCachedForecast(city);
  if (!manual && previous && forecastIsFresh(previous, Date.now())) return Promise.resolve(previous);
  const key = forecastCacheKey(city);
  function reusable() {
    const saved = readCachedForecast(city);
    return saved && ((!manual && forecastIsFresh(saved, Date.now())) || saved.fetchedAt > (previous?.fetchedAt ?? 0)) ? saved : null;
  }
  async function request() {
    const saved = reusable();
    if (saved) return saved;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(forecastUrl(city, Date.now()), {
        credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal,
      });
      if (!response.ok) throw new Error('예보 응답 오류');
      const forecast = parseForecast(await response.json(), city, Date.now());
      memory.set(city.station, forecast);
      try { window.localStorage.setItem(key, JSON.stringify(forecast)); } catch { /* The open widget keeps its in-memory copy. */ }
      return forecast;
    } finally {
      window.clearTimeout(timer);
    }
  }
  async function withLock(): Promise<WeatherForecast> {
    const locks = navigator.locks;
    if (!locks) return request();
    const immediate = await locks.request(key, { ifAvailable: true }, lock => lock ? request() : null);
    if (immediate) return immediate;
    return await locks.request(key, async () => {
      // Chromium can release another tab's lock just before dispatching its storage update.
      if (!reusable()) await new Promise<void>(resolve => {
        function finish() {
          window.removeEventListener('storage', stored);
          window.clearTimeout(timer);
          resolve();
        }
        function stored(event: StorageEvent) { if (event.key === key) finish(); }
        const timer = window.setTimeout(finish, 1_000);
        window.addEventListener('storage', stored);
      });
      return request();
    });
  }
  const promise = withLock().finally(() => pending.delete(city.station));
  pending.set(city.station, promise);
  return promise;
}
