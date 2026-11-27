'use client';

import { useId, useState, type PointerEvent } from 'react';
import type { PriceBar } from './marketData';
import styles from './MarketDashboard.module.css';

export type ChartMode = 'line' | 'candle';

const numberFormat = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 });
export const priceText = (value: number) => numberFormat.format(value);

const chart = { width: 760, height: 246, top: 8, bottom: 238 };

export default function MarketChart({ bars, mode, name, unit }: {
  bars: PriceBar[];
  mode: ChartMode;
  name: string;
  unit: 'p' | '원';
}) {
  const [focus, setFocus] = useState<number | null>(null);
  const fillId = useId();
  const lastIndex = bars.length - 1;
  const selectedIndex = Math.min(focus ?? lastIndex, lastIndex);
  const selected = bars[selectedIndex];
  const values = bars.flatMap(bar => mode === 'candle'
    ? [bar.low ?? bar.close, bar.high ?? bar.close, bar.close]
    : [bar.close]);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const padding = Math.max((maximum - minimum) * 0.07, Math.abs(maximum) * 0.001);
  const lower = minimum - padding;
  const upper = maximum + padding;
  const stride = chart.width / bars.length;
  const x = (index: number) => stride * (index + 0.5);
  const y = (price: number) => chart.bottom - ((price - lower) / (upper - lower)) * (chart.bottom - chart.top);
  const coordinates = bars.map((bar, index) => [x(index), y(bar.close)]);
  const line = coordinates.map(point => point.join(',')).join(' ');
  const area = x(0) + ',' + chart.bottom + ' ' + line + ' ' + x(lastIndex) + ',' + chart.bottom;
  const ticks = [1, 0.75, 0.5, 0.25, 0].map(value => lower + (upper - lower) * value);
  const barWidth = Math.max(1, Math.min(14, stride * 0.65));

  function move(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientX - rect.left) / rect.width;
    setFocus(Math.max(0, Math.min(lastIndex, Math.floor(fraction * bars.length))));
  }

  return (
    <div className={styles.chart}>
      <div className={styles.chartReadout}>
        <time dateTime={selected.date}>{selected.date}</time>
        <span>시가 <b>{selected.open === null ? '—' : priceText(selected.open)}</b></span>
        <span>고가 <b>{selected.high === null ? '—' : priceText(selected.high)}</b></span>
        <span>저가 <b>{selected.low === null ? '—' : priceText(selected.low)}</b></span>
        <span>종가 <b>{priceText(selected.close)} {unit}</b></span>
      </div>
      <div className={styles.chartGrid}>
        <div className={styles.plot} onPointerMove={move} onPointerDown={move} onPointerLeave={() => setFocus(null)}>
          <svg viewBox={'0 0 ' + chart.width + ' ' + chart.height} preserveAspectRatio="none" role="img"
            aria-label={name + ' 일별 ' + (mode === 'line' ? '종가선' : '캔들') + ' 차트'}>
            <defs>
              <linearGradient id={fillId} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="var(--market-line)" stopOpacity=".27" />
                <stop offset="100%" stopColor="var(--market-line)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {ticks.map(value => (
              <line key={value} x1="0" x2={chart.width} y1={y(value)} y2={y(value)}
                stroke="var(--market-border)" vectorEffect="non-scaling-stroke" />
            ))}
            {mode === 'line' ? (
              <>
                <polygon points={area} fill={'url(#' + fillId + ')'} />
                <polyline points={line} stroke="var(--market-line)" fill="none" strokeWidth="2"
                  strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              </>
            ) : bars.map((bar, index) => {
              const center = x(index);
              if (bar.open === null || bar.high === null || bar.low === null) {
                return <line key={bar.date} x1={center - barWidth / 2} x2={center + barWidth / 2}
                  y1={y(bar.close)} y2={y(bar.close)} stroke="var(--market-muted)"
                  strokeWidth="2" vectorEffect="non-scaling-stroke" />;
              }
              const color = bar.close >= bar.open ? 'var(--market-up)' : 'var(--market-down)';
              const open = y(bar.open);
              const close = y(bar.close);
              return (
                <g key={bar.date} fill={color} stroke={color}>
                  <line x1={center} x2={center} y1={y(bar.high)} y2={y(bar.low)} vectorEffect="non-scaling-stroke" />
                  <rect x={center - barWidth / 2} y={Math.min(open, close)} width={barWidth}
                    height={Math.max(1, Math.abs(open - close))} stroke="none" />
                </g>
              );
            })}
            <line x1={x(selectedIndex)} x2={x(selectedIndex)} y1={chart.top} y2={chart.bottom}
              stroke="var(--market-muted)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            <line x1={x(selectedIndex) - 4} x2={x(selectedIndex) + 4}
              y1={y(selected.close)} y2={y(selected.close)} stroke="var(--market-text)" strokeWidth="2"
              vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
        <div className={styles.priceAxis} aria-hidden="true">
          {ticks.map(value => <span key={value}>{priceText(value)}</span>)}
        </div>
      </div>
      <div className={styles.chartDates}>
        <span>{bars[0].date}</span>
        <span>{bars[lastIndex].date}</span>
      </div>
      {lastIndex > 0 && (
        <input className={styles.dateScrubber} type="range" min="0" max={lastIndex} value={selectedIndex}
          aria-label="차트 거래일" aria-valuetext={selected.date + ' 종가 ' + priceText(selected.close) + ' ' + unit}
          onChange={event => setFocus(Number(event.target.value))} />
      )}
    </div>
  );
}
