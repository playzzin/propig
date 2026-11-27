'use client';

import { useSyncExternalStore } from 'react';
import {
  Activity, AppWindow, ArrowUpRight, Ban, Blocks, Bot, ChartNoAxesCombined, Cloud, Cpu,
  Download, ExternalLink, Folder, FolderOpen, GitBranch, Globe, Grid2X2, Keyboard, LayoutGrid,
  MessageCircle, Monitor, PanelBottom, PanelsTopLeft, Settings, Sparkles, SquareTerminal,
  type LucideIcon,
} from 'lucide-react';
import type { PcMiraBox, PcSensors, PcSystem, PcUsage } from './pcSnapshot';
import styles from './DevicePanels.module.css';

type ActionProps = { onAction?: (id: string) => void };
type Provider = PcUsage['providers'][number];

const dateFormat = new Intl.DateTimeFormat('ko-KR', {
  month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const compactNumber = new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 });
const numberFormat = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 });
const minute = 60_000;
const day = 24 * 60 * minute;

function subscribeClock(update: () => void) {
  const timer = window.setInterval(update, 10_000);
  return () => window.clearInterval(timer);
}

const getTime = () => Math.floor(Date.now() / 10_000) * 10_000;
const getServerTime = () => 0;

function timestamp(value: number | null | undefined) {
  if (!value || !Number.isFinite(value) || value < 0) return null;
  const ms = value < 1e11 ? value * 1000 : value;
  return ms <= 8.64e15 ? ms : null;
}

function Stamp({ value, now, staleAfter }: { value?: number; now: number; staleAfter: number }) {
  const at = timestamp(value);
  if (!at) return <span className={styles.stamp}>측정값 없음</span>;
  const stale = now - at > staleAfter;
  return (
    <span className={styles.stamp} data-stale={stale}>
      <span className={styles.dot} aria-hidden="true" />
      {stale ? '이전 측정' : '측정'} <time dateTime={new Date(at).toISOString()}>{dateFormat.format(at)}</time>
    </span>
  );
}

function PanelHeading({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <h2 className={styles.title}>
      <span className={styles.titleIcon}><Icon size={19} strokeWidth={1.8} aria-hidden="true" /></span>
      {title}
    </h2>
  );
}

function percent(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

function Meter({ label, value, detail }: { label: string; value: number | null | undefined; detail?: string }) {
  const amount = percent(value);
  return (
    <div className={styles.metric}>
      <div className={styles.metricLine}>
        <span>{label}</span>
        <strong>{amount === null ? '—' : `${numberFormat.format(amount)}%`}</strong>
      </div>
      {amount === null
        ? <span className={styles.emptyMeter} role="img" aria-label={`${label} 측정값 없음`} />
        : <progress className={styles.meter} max={100} value={amount} aria-label={label} />}
      {detail && <small>{detail}</small>}
    </div>
  );
}

export function SystemPanel({ system, sensors }: { system: PcSystem | null; sensors: PcSensors | null }) {
  const now = useSyncExternalStore(subscribeClock, getTime, getServerTime);
  const chips = [
    { title: 'CPU', name: system?.cpuName, load: system?.cpu, temp: sensors?.cpuTemp },
    { title: 'GPU', name: system?.gpuName, load: sensors?.gpu, temp: sensors?.gpuTemp },
  ];
  return (
    <section className={styles.panel} aria-label="시스템 정보">
      <div className={styles.headingRow}><PanelHeading icon={Cpu} title="시스템 정보" /></div>
      <div className={styles.chips}>
        {chips.map(({ title, name, load, temp }) => (
          <div className={styles.chip} key={title}>
            <div className={styles.chipHeading}>
              <h3>{title}</h3>
              <span>{temp == null ? '온도 —' : <><span className={styles.srOnly}>{title} 온도 </span>{numberFormat.format(temp)} °C</>}</span>
            </div>
            {name && <p className={styles.model}>{name}</p>}
            <Meter label={`${title} 사용률`} value={load} />
          </div>
        ))}
      </div>
      <div className={styles.resourceMeters}>
        <Meter label="메모리" value={system?.ram} />
        <Meter label="커밋 메모리" value={system?.swap} />
        <Meter label="시스템 드라이브" value={system?.disk} />
      </div>
      <dl className={styles.sources}>
        <div><dt>Windows 리소스</dt><dd><Stamp value={system?.updatedAt} now={now} staleAfter={2 * minute} /></dd></div>
        <div><dt>하드웨어 센서</dt><dd><Stamp value={sensors?.updatedAt} now={now} staleAfter={30_000} /></dd></div>
      </dl>
    </section>
  );
}

const providers = [
  { id: 'codex', name: 'Codex', note: '계정 한도' },
  { id: 'claude', name: 'Claude', note: 'Claude Code 한도' },
  { id: 'antigravity', name: 'Antigravity', note: 'Gemini 모델 그룹' },
] as const;

const providerStates = new Map([
  ['OK', '조회 완료'], ['WAIT', '조회 중'], ['BUSY', '조회 제한'], ['LOGIN', '로그인 필요'],
  ['INSTALL', 'CLI 연결 필요'], ['IDE', 'IDE 연결 필요'], ['NONE', '한도 미제공'], ['ERROR', '조회 실패'],
]);

function resetText(reset: number | null | undefined, now: number) {
  const at = timestamp(reset);
  if (!at) return undefined;
  const when = dateFormat.format(at);
  if (!now) return `${when} 리셋`;
  const remaining = Math.ceil((at - now) / minute);
  if (remaining <= 0) return `${when} 리셋 시각 지남`;
  const until = remaining >= 24 * 60 ? `${Math.floor(remaining / (24 * 60))}일 ${Math.floor(remaining / 60) % 24}시간`
    : remaining >= 60 ? `${Math.floor(remaining / 60)}시간 ${remaining % 60}분` : `${remaining}분`;
  return `${when} 리셋 · ${until} 후`;
}

function codexPace(provider: Provider, sampledAt: number, now: number) {
  const reset = timestamp(provider.weeklyReset);
  const sample = timestamp(sampledAt);
  const amount = percent(provider.weekly);
  if (!reset || !sample || amount === null || reset <= sample || reset <= now) return null;
  const window = reset - sample;
  const pace = numberFormat.format(amount * Math.min(1, day / window));
  return window < day ? `리셋까지 사용 가능 ${pace}%p` : `측정 시점 기준 하루 약 ${pace}%p 사용 가능`;
}

function TokenHistory({ daily }: { daily: PcUsage['daily'] }) {
  const days = daily.slice(-7);
  const values = days.flatMap(({ tokens }) => tokens === null ? [] : [tokens]);
  const peak = Math.max(1, ...values);
  const average = values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
  return (
    <div className={styles.block}>
      <div className={styles.blockHeading}>
        <h3>Codex 최근 7일 토큰</h3>
        {average !== null && <span>집계일 평균 {compactNumber.format(average)}</span>}
      </div>
      {days.length === 0 ? <p className={styles.notice}>일별 집계 기록이 없습니다.</p> : (
        <ol className={styles.chart} aria-label="날짜별 Codex 토큰 사용량">
          {days.map(({ date, tokens }) => (
            <li key={date} title={`${date} · ${tokens === null ? '집계 없음' : `${numberFormat.format(tokens)} 토큰`}`}>
              <span className={styles.srOnly}>{date}, {tokens === null ? '집계 없음' : `${numberFormat.format(tokens)} 토큰`}</span>
              <span className={styles.chartValue} aria-hidden="true">{tokens === null ? '—' : compactNumber.format(tokens)}</span>
              <span className={styles.barArea} aria-hidden="true">
                {tokens !== null && tokens > 0 && <span style={{ height: `${Math.max(3, tokens / peak * 100)}%` }} />}
              </span>
              <span className={styles.chartDate} aria-hidden="true">{date.slice(5).replace('-', '/')}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function UsagePanel({ usage }: { usage: PcUsage | null }) {
  const now = useSyncExternalStore(subscribeClock, getTime, getServerTime);
  return (
    <section className={styles.panel} aria-label="AI 사용량">
      <div className={styles.headingRow}>
        <PanelHeading icon={ChartNoAxesCombined} title="AI 사용량" />
        <Stamp value={usage?.updatedAt} now={now} staleAfter={15 * minute} />
      </div>
      <div className={styles.providerList}>
        {providers.map(({ id, name, note }) => {
          const provider = usage?.providers.find(item => item.id === id);
          const available = provider?.status === 'OK';
          const pace = available && usage && id === 'codex' ? codexPace(provider, usage.updatedAt, now) : null;
          return (
            <div className={styles.provider} key={id} data-provider={id}>
              <div className={styles.providerHeader}>
                <h3>{name}<small>{note}</small></h3>
                <span className={styles.providerState}>{provider ? (providerStates.get(provider.status) ?? '상태 미확인') : '수집 전'}</span>
              </div>
              {available && (
                <div className={styles.quotaGrid}>
                  {(id !== 'codex' || provider.short !== null) &&
                    <Meter label="5시간 잔여" value={provider.short} detail={resetText(provider.shortReset, now)} />}
                  <Meter label="주간 잔여" value={provider.weekly} detail={resetText(provider.weeklyReset, now)} />
                </div>
              )}
              {pace && <p className={styles.pace}>{pace}</p>}
            </div>
          );
        })}
      </div>
      <TokenHistory daily={usage?.daily ?? []} />
      <details className={styles.credits}>
        <summary>Codex 초기화권 <span>{usage?.resets.length ? `지급 내역 ${usage.resets.length}건` : '내역 없음'}</span></summary>
        {usage?.resets.length ? (
          <ul>{usage.resets.map(({ granted, expires }, index) => (
            <li key={`${granted}-${index}`}><span>지급 {granted}</span><span>{expires ? `만료 ${expires}` : '만료일 표시 없음'}</span></li>
          ))}</ul>
        ) : <p className={styles.notice}>수집된 초기화권 내역이 없습니다.</p>}
      </details>
      <div className={styles.flow}>
        <div className={styles.blockHeading}><h3>Flow 크레딧</h3><span>수동 기록</span></div>
        <strong>{usage?.flow?.balance != null ? `${numberFormat.format(usage.flow.balance)} 크레딧` : '잔액 기록 없음'}</strong>
        {usage?.flow?.recorded && <span>기록 {usage.flow.recorded}</span>}
        {usage?.flow?.reset && <span>리셋 {usage.flow.reset}</span>}
      </div>
    </section>
  );
}

const slotLabels = new Map([
  ['App', '앱'], ['앱', '앱'], ['Website', '웹'], ['웹', '웹'],
  ['Codex', 'Codex'], ['GitHub', 'GitHub'], ['Unavailable', '비활성'], ['비활성', '비활성'],
]);
const slotIcons: Record<string, LucideIcon> = {
  '앱': AppWindow, '웹': Globe, Codex: SquareTerminal, GitHub: GitBranch, '비활성': Ban, '등록 키': Keyboard,
};
const runnableSlots = new Set(['앱', '웹', 'Codex', 'GitHub']);

type MiraBoxProps = ActionProps & {
  mirabox: PcMiraBox | null;
  onPress?: (index: number, layoutId: number) => void;
};

export function MiraBoxPanel({ mirabox, onAction, onPress }: MiraBoxProps) {
  const now = useSyncExternalStore(subscribeClock, getTime, getServerTime);
  const slots = new Map(mirabox?.slots.map(({ index, label }) => [index, slotLabels.get(label) ?? '등록 키']));
  const revision = mirabox?.layoutId;
  const layoutId = typeof revision === 'number' && Number.isSafeInteger(revision) && revision > 0 ? revision : null;
  const canPress = onPress && layoutId !== null && Array.from(slots.values()).some(label => runnableSlots.has(label));
  const measuredAt = timestamp(mirabox?.updatedAt);
  const old = measuredAt !== null && now - measuredAt > 2 * minute;
  const connection = mirabox?.online == null || !measuredAt || !now ? '기기 연결 미확인'
    : mirabox.online ? (old ? '마지막 측정 시 연결됨' : '기기 연결됨') : '측정 시 기기 오프라인';
  return (
    <section className={styles.panel} aria-label="MiraBox">
      <div className={styles.headingRow}>
        <PanelHeading icon={Keyboard} title="MiraBox" />
        <span className={styles.connection} data-live={mirabox?.online === true && !!measuredAt && !!now && !old}>{connection}</span>
      </div>
      <dl className={styles.counts}>
        <div><dt>프로필</dt><dd>{mirabox?.profiles ?? '—'}</dd></div>
        <div><dt>페이지</dt><dd>{mirabox?.pages ?? '—'}</dd></div>
        <div><dt>등록 키</dt><dd>{mirabox?.keys ?? '—'}</dd></div>
      </dl>
      {slots.size > 0 ? (
        <div className={styles.block}>
          <div className={styles.blockHeading}><h3>현재 페이지 키 배치</h3><span>{slots.size} / 32</span></div>
          <ol className={styles.slots}>
            {Array.from({ length: 32 }, (_, index) => {
              const label = slots.get(index);
              const Icon = label && slotIcons[label];
              const description = `${index + 1}번 키, ${label ?? '비어 있음'}`;
              const press = onPress && layoutId !== null && label && runnableSlots.has(label) ? () => onPress(index, layoutId) : null;
              const face = <>
                <span className={styles.slotNumber}>{index + 1}</span><strong className={styles.slotLabel}>{label ?? '—'}</strong>
                {Icon && <Icon size={13} className={styles.slotIcon} aria-hidden="true" />}
              </>;
              return (
                <li key={index} data-filled={!!label} title={description}>
                  {press ? (
                    <button type="button" className={styles.keyFace} onClick={press} aria-label={`${description} 실행 확인`}>{face}</button>
                  ) : (
                    <span className={styles.keyFace}><span className={styles.srOnly}>{description}</span><span className={styles.readOnlyFace} aria-hidden="true">{face}</span></span>
                  )}
                </li>
              );
            })}
          </ol>
          <div className={styles.slotLegend} aria-hidden="true">
            {Array.from(new Set(slots.values()), label => {
              const Icon = slotIcons[label];
              return <span key={label}><Icon size={12} />{label}</span>;
            })}
          </div>
          {canPress && <p className={styles.notice}>키를 선택하면 ProPig Windows 앱에서 실행 여부를 확인합니다.</p>}
        </div>
      ) : <p className={styles.notice}>{mirabox ? '현재 페이지에 표시할 키가 없습니다.' : 'PC에서 키 배치를 수집하면 여기에 표시됩니다.'}</p>}
      <div className={styles.controls}>
        <button type="button" className={styles.primaryButton} disabled={!onAction} onClick={() => onAction?.('mira-controls')}>
          <PanelsTopLeft size={16} aria-hidden="true" /> PC에서 MiraBox 컨트롤 열기
        </button>
        <Stamp value={mirabox?.updatedAt} now={now} staleAfter={2 * minute} />
      </div>
      <p className={styles.notice}>PC 컨트롤에서 장면과 모니터를 선택하고 키를 실행할 수 있습니다.</p>
    </section>
  );
}

type Shortcut = { id: string; label: string; icon: LucideIcon; url?: string };
const drive: Shortcut = { id: 'drive', label: 'Google Drive', icon: Cloud, url: 'https://drive.google.com/drive/my-drive' };
const webShortcuts: Shortcut[] = [
  { id: 'chatgpt', label: 'ChatGPT', icon: Bot, url: 'https://chatgpt.com/' },
  { id: 'gemini', label: 'Gemini', icon: Sparkles, url: 'https://gemini.google.com/' },
];
const appShortcuts: Shortcut[] = [
  { id: 'chrome', label: 'Chrome', icon: Globe },
  { id: 'codex', label: 'Codex', icon: SquareTerminal },
  { id: 'claude', label: 'Claude', icon: MessageCircle },
  { id: 'antigravity', label: 'Antigravity', icon: Blocks },
  { id: 'kakaotalk', label: '카카오톡', icon: MessageCircle },
];
const pcShortcuts: Shortcut[] = [
  { id: 'explorer', label: '파일 탐색기', icon: Folder },
  { id: 'workspace', label: '작업 폴더', icon: FolderOpen },
  { id: 'downloads', label: '다운로드', icon: Download },
  { id: 'ai-panel', label: 'AI 사용량 패널', icon: ChartNoAxesCombined },
  { id: 'task-manager', label: '작업 관리자', icon: Activity },
  { id: 'windows-settings', label: 'Windows 설정', icon: Settings },
  { id: 'taskbar', label: '작업 표시줄 전환', icon: PanelBottom },
  { id: 'taskbar-all', label: '모든 작업 표시줄 표시', icon: Monitor },
  { id: 'mira-controls', label: 'MiraBox 컨트롤', icon: Keyboard },
];

function ShortcutGrid({ items, onAction, desktop = false }: { items: Shortcut[]; desktop?: boolean } & ActionProps) {
  return (
    <div className={styles.shortcutGrid}>
      {items.map(({ id, label, icon: Icon, url }) => {
        const content = <><Icon size={17} aria-hidden="true" /><span>{label}</span></>;
        return url && !desktop ? (
          <a key={id} className={styles.shortcut} href={url} target="_blank" rel="noopener noreferrer" aria-label={`${label} 새 창에서 열기`}>
            {content}<ExternalLink className={styles.external} size={12} aria-hidden="true" />
          </a>
        ) : (
          <button key={id} type="button" className={styles.shortcut} disabled={!onAction} onClick={() => onAction?.(id)}>{content}</button>
        );
      })}
    </div>
  );
}

export function DockPanel({ onAction, desktop = false }: ActionProps & { desktop?: boolean }) {
  return (
    <section className={styles.panel} aria-label="바로가기">
      <div className={styles.headingRow}>
        <PanelHeading icon={LayoutGrid} title="바로가기" />
        <button type="button" className={styles.textButton} disabled={!onAction} onClick={() => onAction?.('dock-controls')}>
          PC 도크 열기 <ArrowUpRight size={14} aria-hidden="true" />
        </button>
      </div>
      <div className={styles.block}>
        <div className={styles.blockHeading}><h3>웹 서비스</h3></div>
        <ShortcutGrid items={desktop ? webShortcuts : [...webShortcuts, drive]} onAction={onAction} desktop={desktop} />
      </div>
      <div className={styles.block}>
        <div className={styles.blockHeading}><h3><AppWindow size={15} aria-hidden="true" /> Windows 앱</h3></div>
        {!desktop && <p className={styles.notice}>PC 바로가기는 설치한 ProPig Windows 앱에서 실행 여부를 확인합니다.</p>}
        <ShortcutGrid items={appShortcuts} onAction={onAction} />
      </div>
      <div className={styles.block}>
        <div className={styles.blockHeading}><h3><Grid2X2 size={15} aria-hidden="true" /> 폴더와 도구</h3></div>
        <ShortcutGrid items={desktop ? [drive, ...pcShortcuts] : pcShortcuts} onAction={onAction} desktop={desktop} />
      </div>
    </section>
  );
}
