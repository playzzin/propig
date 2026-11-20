export type StatsPeriod = 'weekly' | 'monthly';
export type WeekendTone = 'weekday' | 'saturday' | 'sunday';

export const DATE_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

const WEEKEND_ACCENTS: Record<Exclude<WeekendTone, 'weekday'>, { text: string; border: string; background: string; solid: string }> = {
  saturday: {
    text: '#0ea5e9',
    border: 'rgba(2, 132, 199, 0.72)',
    background: 'rgba(2, 132, 199, 0.14)',
    solid: '#0284c7',
  },
  sunday: {
    text: '#f43f5e',
    border: 'rgba(225, 29, 72, 0.72)',
    background: 'rgba(225, 29, 72, 0.14)',
    solid: '#e11d48',
  },
};

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00`);
}

export function getWeekendTone(date: Date): WeekendTone {
  if (date.getDay() === 6) return 'saturday';
  if (date.getDay() === 0) return 'sunday';
  return 'weekday';
}

export function getWeekendAccent(
  tone: WeekendTone,
  key: keyof (typeof WEEKEND_ACCENTS)['saturday'],
  fallback: string,
): string {
  if (tone === 'weekday') return fallback;
  return WEEKEND_ACCENTS[tone][key];
}

export function getDateBandColor(tone: WeekendTone, active: boolean): string {
  if (tone === 'weekday') return active ? 'var(--habit-green)' : '#059669';
  return WEEKEND_ACCENTS[tone].solid;
}

export function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

export function addCalendarMonths(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(1);
  next.setMonth(next.getMonth() + amount);
  next.setDate(Math.min(date.getDate(), new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
  return next;
}

export function getStartOfWeek(date: Date): Date {
  const next = new Date(date);
  const offset = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - offset);
  return next;
}

export function getStartOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function formatMonthDay(dateKey: string): string {
  const date = parseDateKey(dateKey);
  return `${date.getMonth() + 1}.${date.getDate()}`;
}

export function formatYearMonth(date: Date): string {
  return `${String(date.getFullYear()).slice(2)}.${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function formatStatsRange(period: StatsPeriod, dateKey: string): string {
  const date = parseDateKey(dateKey);

  if (period === 'weekly') {
    const start = getStartOfWeek(date);
    const end = addDays(start, 6);
    return `${formatMonthDay(toDateKey(start))} - ${formatMonthDay(toDateKey(end))}`;
  }

  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

export function getDateKeysBetween(start: Date, end: Date): string[] {
  const keys: string[] = [];
  let current = new Date(start);

  while (current <= end) {
    keys.push(toDateKey(current));
    current = addDays(current, 1);
  }

  return keys;
}

export function getRangeDateKeys(baseDateKey: string, count: number): string[] {
  const baseDate = parseDateKey(baseDateKey);
  return Array.from({ length: count }, (_, index) => toDateKey(addDays(baseDate, index - count + 1)));
}

export function getPreviousDateKeys(dateKeys: string[]): string[] {
  if (dateKeys.length === 0) return [];
  const startDate = parseDateKey(dateKeys[0]);
  return Array.from({ length: dateKeys.length }, (_, index) => toDateKey(addDays(startDate, index - dateKeys.length)));
}
