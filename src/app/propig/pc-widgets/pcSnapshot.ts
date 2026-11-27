export const pcPanels = [
  { id: 'system', label: '시스템 정보' }, { id: 'clock', label: '시계·날씨' },
  { id: 'calendar', label: '달력' }, { id: 'usage', label: 'AI 사용량' },
  { id: 'mirabox', label: 'MiraBox' }, { id: 'dock', label: '바로가기 독' },
] as const;
export type PcPanel = typeof pcPanels[number]['id'];
export const isPcPanel = (value: unknown): value is PcPanel => pcPanels.some(panel => panel.id === value);
export type PcSystem = { updatedAt: number; cpu: number | null; ram: number | null; swap: number | null; disk: number | null; cpuName: string | null; gpuName: string | null };
export type PcSensors = { updatedAt: number; cpuTemp: number | null; gpuTemp: number | null; gpu: number | null };
type ProviderId = 'codex' | 'claude' | 'antigravity';
export type PcUsage = {
  updatedAt: number;
  providers: { id: ProviderId; status: string; short: number | null; weekly: number | null; shortReset: number | null; weeklyReset: number | null; measuredAt: number | null }[];
  daily: { date: string; tokens: number | null }[];
  resets: { granted: string; expires: string | null }[];
  flow: { balance: number | null; reset: string | null; recorded: string | null } | null;
};
export type PcMiraBox = { updatedAt: number; profiles: number; pages: number; keys: number; slots: { index: number; label: string; runnable: boolean }[]; online: boolean | null; layoutId?: number | null };
export type PcSnapshot = { version: 1; source: 'windows' | 'legacy'; sampledAt: number; system: PcSystem; sensors: PcSensors | null; usage: PcUsage | null; mirabox: PcMiraBox | null };

type Fields = Record<string, unknown>;
const fields = (value: unknown): Fields => value && typeof value === 'object' && !Array.isArray(value) ? value as Fields : {};
const rows = (value: unknown, max: number): Fields[] => Array.isArray(value) ? value.slice(0, max).map(fields) : [];
const num = (value: unknown, low: number, high: number) => typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high ? value : null;
const pct = (value: unknown) => num(value, 0, 100);
const count = (value: unknown, max: number) => typeof value === 'number' && Number.isInteger(value) ? num(value, 0, max) : null;
const slotLabels = new Set(['Codex', 'Claude', 'Antigravity', 'GitHub', 'Gemini', '앱', '웹', '폴더', '프로필', '페이지', '동작', '단축키', '비활성', 'App', 'Website', 'Unavailable']);
const epoch = (value: unknown) => num(value, 1_000_000_000_000, 4_102_444_800_000);
const model = (value: unknown) => typeof value === 'string' && value.length <= 100 ? value : null;
const day = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const dateLabel = (value: unknown) => typeof value === 'string' && /^(?:\d{4}-\d{2}-\d{2}|\d{2}\/\d{2})(?: \d{2}:\d{2})?$/.test(value) ? value : null;
const isProvider = (value: unknown): value is ProviderId => value === 'codex' || value === 'claude' || value === 'antigravity';

function readUsage(value: unknown): PcUsage | null {
  const u = fields(value), updatedAt = epoch(u.updatedAt);
  if (!updatedAt) return null;
  const flow = fields(u.flow);
  return { updatedAt, providers: rows(u.providers, 3).flatMap(p => isProvider(p.id) ? [{
    id: p.id, status: typeof p.status === 'string' && /^(OK|WAIT|LOGIN|INSTALL|IDE|NONE|BUSY|ERROR|MANUAL|STALE|SETUP)$/.test(p.status) ? p.status : 'ERROR',
    short: pct(p.short), weekly: pct(p.weekly), shortReset: epoch(p.shortReset), weeklyReset: epoch(p.weeklyReset), measuredAt: epoch(p.measuredAt),
  }] : []), daily: rows(u.daily, 7).flatMap(d => day(d.date) ? [{date: d.date, tokens: num(d.tokens, 0, Number.MAX_SAFE_INTEGER)}] : []),
  resets: rows(u.resets, 16).flatMap(r => { const granted = dateLabel(r.granted); return granted ? [{ granted, expires: dateLabel(r.expires) }] : []; }),
  flow: u.flow && typeof u.flow === 'object' ? { balance: num(flow.balance, 0, 1e12), reset: dateLabel(flow.reset), recorded: dateLabel(flow.recorded) } : null };
}

export function readPcSnapshot(input: unknown): PcSnapshot | null {
  if (typeof input === 'string') {
    if (input.length > 32768) return null;
    try { input = JSON.parse(input); } catch { return null; }
  }
  const s = fields(input), sys = fields(s.system), sensors = fields(s.sensors), m = fields(s.mirabox);
  const sampledAt = epoch(s.sampledAt), systemAt = epoch(sys.updatedAt), sensorAt = epoch(sensors.updatedAt), miraAt = epoch(m.updatedAt);
  const profiles = count(m.profiles, 4096), pages = count(m.pages, 4096), keys = count(m.keys, 65536);
  if (s.version !== 1 || !sampledAt || !systemAt) return null;
  const standalone = s.source === 'windows';
  return { version: 1, source: standalone ? 'windows' : 'legacy', sampledAt, system: { updatedAt: systemAt, cpu: pct(sys.cpu), ram: pct(sys.ram),
    disk: pct(sys.disk), swap: pct(sys.swap), cpuName: model(sys.cpuName), gpuName: model(sys.gpuName) },
    sensors: standalone && sensorAt ? { updatedAt: sensorAt, cpuTemp: num(sensors.cpuTemp, -50, 180), gpuTemp: num(sensors.gpuTemp, -50, 180), gpu: pct(sensors.gpu) } : null,
    mirabox: standalone && miraAt && profiles !== null && pages !== null && keys !== null ? { updatedAt: miraAt, online: typeof m.online === 'boolean' ? m.online : null, profiles, pages, keys,
      layoutId: count(m.layoutId, Number.MAX_SAFE_INTEGER) || null,
      slots: rows(m.slots, 32).flatMap(r => typeof r.index === 'number' && Number.isInteger(r.index) && r.index >= 0 && r.index < 32
        ? [{ index: r.index, label: typeof r.label === 'string' && slotLabels.has(r.label) ? r.label : '키 ' + (r.index + 1), runnable: r.runnable === true && typeof r.label === 'string' && slotLabels.has(r.label) }] : []) } : null,
    usage: standalone ? readUsage(s.usage) : null };
}
