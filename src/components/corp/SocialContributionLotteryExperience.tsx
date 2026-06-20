'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  ArrowUpRight,
  BadgeCheck,
  Gift,
  HeartHandshake,
  Settings,
  Leaf,
  Play,
  RotateCcw,
  Sparkles,
  Ticket,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import styled from 'styled-components';
import { getYouTubeEmbedUrl, YOUTUBE_EMBED_ALLOW } from '@/components/corp/corpMediaEmbed';
import { CORP_PAGE_SEED_BY_ID } from '@/constants/corpPageSeeds';
import type { CorpPage, CorpPageBlock } from '@/schemas/corpPageSchema';

type MediaShowcaseBlock = Extract<CorpPageBlock, { type: 'media-showcase' }>;
type SocialMediaItem = MediaShowcaseBlock['data']['media'][number];

type BallRole = 'main' | 'bonus';
type LottoStatus = 'idle' | 'drawing' | 'done';
type DrawPhase = 'ready' | 'mixing' | 'gate' | 'rolling' | 'captured' | 'complete';

type RollingBallState = {
  id: string;
  value: number;
  role: BallRole;
};

type LottoDrawResult = {
  id: string;
  numbers: number[];
  bonus: number;
  points: number;
};

type ScratchSymbol = {
  id: string;
  label: string;
  mark: string;
  points: number;
  accent: string;
};

type ScratchTile = {
  tileId: string;
  number: number;
  symbol: ScratchSymbol;
  prize: number;
  matchType: 'number' | 'symbol' | null;
};

type ScratchTicketState = {
  id: string;
  winningNumbers: number[];
  tiles: ScratchTile[];
  matchedSymbolId: string | null;
  matchedTileIds: string[];
  points: number;
  scratchPercent: number;
  settled: boolean;
};

type ActivityLogItem = {
  id: string;
  title: string;
  meta: string;
  points: number;
};

type CelebrationEvent = {
  id: string;
  title: string;
  points: number;
};

type ImpactMission = {
  id: string;
  title: string;
  caption: string;
  target: number;
  accent: string;
  icon: LucideIcon;
};

type IdleBall = {
  value: number;
  x: number;
  y: number;
  delay: number;
};

type SocialContributionTiming = {
  lottoWarmupMs: number;
  lottoStepIntervalMs: number;
  lottoRollDurationMs: number;
  scratchRevealThreshold: number;
};

export type SocialContributionLotteryConfig = {
  heroKicker: string;
  heroTitle: string;
  heroBody: string;
  heroActionLabel: string;
  heroActionHref: string;
  machineImageUrl: string;
  machineImageAlt: string;
  machineDescription: string;
  noticeText: string;
  lottoKicker: string;
  lottoTitle: string;
  lottoBody: string;
  lottoButtonLabel: string;
  scratchKicker: string;
  scratchTitle: string;
  scratchButtonLabel: string;
  activityKicker: string;
  activityTitle: string;
  activityBody: string;
  impactTitle: string;
  initialImpactPoints: number;
  scratchSymbols: ScratchSymbol[];
  activityLog: ActivityLogItem[];
  impactMissions: ImpactMission[];
  mediaItems: SocialMediaItem[];
  timing: SocialContributionTiming;
};

type SocialContributionEditorState = {
  selectedBlockId?: string | null;
  onSelectBlock?: (blockId: string | null) => void;
};

interface SocialContributionLotteryExperienceProps {
  config?: SocialContributionLotteryConfig;
  livePreview?: boolean;
  editor?: SocialContributionEditorState;
}

const idleBalls: IdleBall[] = [
  { value: 3, x: 34, y: 31, delay: 0 },
  { value: 8, x: 53, y: 25, delay: 0.6 },
  { value: 14, x: 64, y: 47, delay: 1.2 },
  { value: 21, x: 42, y: 58, delay: 1.8 },
  { value: 27, x: 25, y: 49, delay: 2.4 },
  { value: 35, x: 52, y: 67, delay: 3 },
  { value: 41, x: 69, y: 33, delay: 3.6 },
  { value: 45, x: 30, y: 68, delay: 4.2 },
];

const scratchSymbols: ScratchSymbol[] = [
  { id: 'donation', label: '아이콘 01', mark: '01', points: 50, accent: '#fb7185' },
  { id: 'volunteer', label: '아이콘 02', mark: '02', points: 40, accent: '#38bdf8' },
  { id: 'green', label: '아이콘 03', mark: '03', points: 35, accent: '#34d399' },
  { id: 'gift', label: '아이콘 04', mark: '04', points: 30, accent: '#f5c766' },
  { id: 'spark', label: '아이콘 05', mark: '05', points: 25, accent: '#a78bfa' },
];

const defaultActivityLog: ActivityLogItem[] = [
  { id: 'seed-1', title: '사회공헌 이벤트 대기', meta: '참여 기록', points: 0 },
  { id: 'seed-2', title: '기부 포인트 보드 준비', meta: '운영 기록', points: 0 },
];

const drawPhaseLabels: Record<DrawPhase, string> = {
  ready: 'READY',
  mixing: '드럼 믹싱',
  gate: '게이트 오픈',
  rolling: '볼 레일 이동',
  captured: '번호 캡처',
  complete: '라운드 완료',
};

const impactMissions: ImpactMission[] = [
  {
    id: 'meal',
    title: '지역 아동 식사',
    caption: '기부 포인트 120P',
    target: 120,
    accent: '#f5c766',
    icon: Gift,
  },
  {
    id: 'green',
    title: '환경 키트',
    caption: '미션 포인트 220P',
    target: 220,
    accent: '#34d399',
    icon: Leaf,
  },
  {
    id: 'volunteer',
    title: '참여 매칭데이',
    caption: '미션 포인트 360P',
    target: 360,
    accent: '#38bdf8',
    icon: BadgeCheck,
  },
];

const celebrationParticles = [
  { x: -118, y: -20, delay: 0 },
  { x: -78, y: -92, delay: 0.08 },
  { x: -34, y: -134, delay: 0.16 },
  { x: 28, y: -124, delay: 0.04 },
  { x: 76, y: -82, delay: 0.12 },
  { x: 118, y: -22, delay: 0.2 },
  { x: -92, y: 34, delay: 0.18 },
  { x: 96, y: 38, delay: 0.1 },
];

const LOTTO_MIX_WARMUP_MS = 700;
const LOTTO_STEP_INTERVAL_MS = 2050;
const LOTTO_ROLL_DURATION_MS = 1840;
const SCRATCH_REVEAL_THRESHOLD = 54;
const DEFAULT_MACHINE_IMAGE_URL = '/corp/social-lottery-draw-machine.png';
const DEFAULT_NOTICE_TEXT = '실제 구매/환급 없는 모의 이벤트';

const missionIconMap: Record<string, LucideIcon> = {
  BadgeCheck,
  Gift,
  HeartHandshake,
  Leaf,
  Sparkles,
  Ticket,
  Trophy,
};

function normalizeHexColor(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim() ?? '';
  return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(trimmed) ? trimmed : fallback;
}

function readFirstNumber(value: string | null | undefined, fallback: number) {
  const match = value?.match(/\d+/);
  if (!match) return fallback;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readMissionIcon(value: string | null | undefined, fallback: LucideIcon) {
  const key = value?.trim() ?? '';
  return missionIconMap[key] ?? fallback;
}

function findPageBlock<T extends CorpPageBlock['type']>(page: CorpPage | null | undefined, type: T, id?: string) {
  const typedBlocks =
    page?.blocks.filter((block): block is Extract<CorpPageBlock, { type: T }> => block.type === type && block.enabled !== false) ?? [];
  return (id ? typedBlocks.find((block) => block.id === id) : typedBlocks[0]) ?? null;
}

function findPageBlockWithSeed<T extends CorpPageBlock['type']>(
  page: CorpPage | null | undefined,
  seedPage: CorpPage | undefined,
  type: T,
  id: string,
) {
  return findPageBlock(page, type, id) ?? findPageBlock(seedPage, type, id);
}

function parseActivityLogLine(value: string, index: number): ActivityLogItem {
  const [title = '사회공헌 이벤트 대기', meta = '참여 기록', pointsText = '0P'] = value.split('·').map((item) => item.trim());

  return {
    id: `cms-log-${index}`,
    title: title || '사회공헌 이벤트 대기',
    meta: meta || '참여 기록',
    points: readFirstNumber(pointsText, 0),
  };
}

export function buildSocialContributionLotteryConfig(page?: CorpPage | null): SocialContributionLotteryConfig {
  const seedPage = CORP_PAGE_SEED_BY_ID['social-contribution'];
  const heroBlock = findPageBlockWithSeed(page, seedPage, 'hero', 'social-hero');
  const mediaBlock = findPageBlockWithSeed(page, seedPage, 'media-showcase', 'social-media');
  const scratchBlock = findPageBlockWithSeed(page, seedPage, 'feature-grid', 'social-scratch');
  const impactBlock = findPageBlockWithSeed(page, seedPage, 'metric-grid', 'social-impact');
  const logBlock = findPageBlockWithSeed(page, seedPage, 'statement', 'social-log');
  const settings = page?.templateSettings?.socialContribution ?? {};
  const mediaItems = mediaBlock?.data.media ?? [];
  const machineMedia = mediaItems.find((media) => media.url.trim()) ?? null;

  const scratchSymbolSource =
    scratchBlock && scratchBlock.data.features.length > 0
      ? scratchBlock.data.features
      : scratchSymbols.map((symbol) => ({
          title: symbol.label,
          body: `${symbol.points}P 보상 숫자 아이콘입니다.`,
          meta: symbol.accent,
          icon: symbol.mark,
        }));

  const missionSource =
    impactBlock && impactBlock.data.metrics.length > 0
      ? impactBlock.data.metrics
      : impactMissions.map((mission) => ({
          label: mission.title,
          value: `${mission.target}P`,
          caption: mission.caption,
          icon: mission.id === 'meal' ? 'Gift' : mission.id === 'green' ? 'Leaf' : 'BadgeCheck',
        }));

  const parsedActivityLog =
    logBlock && logBlock.data.items.length > 0 ? logBlock.data.items.map(parseActivityLogLine) : defaultActivityLog;

  return {
    heroKicker: heroBlock?.data.kicker || 'SOCIAL IMPACT LOTTERY',
    heroTitle: heroBlock?.data.headline || '사회공헌 로또 스테이션',
    heroBody: heroBlock?.data.body || '추첨 공, 즉석복권, 기부 포인트를 한 화면에서 운영하는 사내 참여 이벤트입니다.',
    heroActionLabel: heroBlock?.data.primaryLabel || '참여 문의',
    heroActionHref: heroBlock?.data.primaryHref || '/corp/partnership/business',
    machineImageUrl: heroBlock?.data.mediaUrl || machineMedia?.url || DEFAULT_MACHINE_IMAGE_URL,
    machineImageAlt: machineMedia?.alt || heroBlock?.data.headline || '사회공헌 로또 추첨기',
    machineDescription: machineMedia?.description || machineMedia?.alt || '',
    noticeText: settings.noticeText?.trim() || DEFAULT_NOTICE_TEXT,
    lottoKicker: mediaBlock?.data.title || 'ROLLING DRAW',
    lottoTitle: machineMedia?.caption || '로또 추첨기',
    lottoBody: mediaBlock?.data.body || '',
    lottoButtonLabel: '로또 추첨',
    scratchKicker: 'INSTANT CARD',
    scratchTitle: scratchBlock?.data.title || '즉석복권',
    scratchButtonLabel: '복권 발급',
    activityKicker: logBlock?.data.eyebrow || 'IMPACT LOG',
    activityTitle: logBlock?.data.title || '참여 기록',
    activityBody: logBlock?.data.body || '',
    impactTitle: impactBlock?.data.title || '임팩트 미션',
    initialImpactPoints: settings.initialImpactPoints ?? 0,
    scratchSymbols: scratchSymbolSource.slice(0, 6).map((feature, index) => {
      const fallback = scratchSymbols[index] ?? scratchSymbols[0];
      const mark = feature.icon?.trim() || fallback.mark;

      return {
        id: `cms-symbol-${index}-${mark}`,
        label: feature.title || `아이콘 ${mark}`,
        mark,
        points: readFirstNumber(feature.body, fallback.points),
        accent: normalizeHexColor(feature.meta, fallback.accent),
      };
    }),
    activityLog: parsedActivityLog.length > 0 ? parsedActivityLog : defaultActivityLog,
    mediaItems,
    impactMissions: missionSource.slice(0, 6).map((metric, index) => {
      const fallback = impactMissions[index] ?? impactMissions[impactMissions.length - 1];

      return {
        id: `cms-mission-${index}`,
        title: metric.label || fallback.title,
        caption: metric.caption || fallback.caption,
        target: readFirstNumber(metric.value, fallback.target),
        accent: fallback.accent,
        icon: readMissionIcon(metric.icon, fallback.icon),
      };
    }),
    timing: {
      lottoWarmupMs: settings.lottoWarmupMs ?? LOTTO_MIX_WARMUP_MS,
      lottoStepIntervalMs: settings.lottoStepIntervalMs ?? LOTTO_STEP_INTERVAL_MS,
      lottoRollDurationMs: settings.lottoRollDurationMs ?? LOTTO_ROLL_DURATION_MS,
      scratchRevealThreshold: settings.scratchRevealThreshold ?? SCRATCH_REVEAL_THRESHOLD,
    },
  };
}

function shuffleItems<T>(values: T[]) {
  const copy = [...values];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

function createLottoDraw(): LottoDrawResult {
  const pool = shuffleItems(Array.from({ length: 45 }, (_, index) => index + 1));
  const numbers = pool.slice(0, 6).sort((a, b) => a - b);
  const bonus = pool[6];
  const evenCount = numbers.filter((value) => value % 2 === 0).length;
  const points = 45 + evenCount * 6 + Math.ceil(bonus / 5);

  return {
    id: `lotto-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    numbers,
    bonus,
    points,
  };
}

function createScratchTicket(symbols: ScratchSymbol[]): ScratchTicketState {
  const winningNumbers = shuffleItems(Array.from({ length: 45 }, (_, index) => index + 1)).slice(0, 3).sort((a, b) => a - b);
  const numberPool = shuffleItems(
    Array.from({ length: 45 }, (_, index) => index + 1).filter((number) => !winningNumbers.includes(number))
  );
  const isWinningTicket = Math.random() > 0.28;
  const symbolSeed = shuffleItems(symbols.map((_, index) => index));
  const winningSymbol = symbols[symbolSeed[0]];
  const baseSymbols = shuffleItems(
    isWinningTicket
      ? [
          winningSymbol,
          winningSymbol,
          winningSymbol,
          ...symbols.filter((symbol) => symbol.id !== winningSymbol.id),
          ...symbols.filter((symbol) => symbol.id !== winningSymbol.id),
        ]
      : symbols.flatMap((symbol) => [symbol, symbol])
  ).slice(0, 9);

  const numberMatchIndexes = isWinningTicket ? shuffleItems(Array.from({ length: 9 }, (_, index) => index)).slice(0, 2) : [];
  const prizes = [10, 15, 20, 25, 30, 35, 40, 45, 50];
  const tiles = shuffleItems(
    baseSymbols.map((symbol, index) => {
      const number = numberMatchIndexes.includes(index) ? winningNumbers[index % winningNumbers.length] : numberPool[index];
      const prize = shuffleItems(prizes)[index % prizes.length];

      return {
        tileId: `scratch-tile-${Date.now().toString(36)}-${index}`,
        number,
        symbol,
        prize,
        matchType: null,
      };
    })
  );
  const counts = tiles.reduce<Record<string, number>>((acc, tile) => {
    acc[tile.symbol.id] = (acc[tile.symbol.id] ?? 0) + 1;
    return acc;
  }, {});
  const matchedSymbolId = Object.entries(counts).find(([, count]) => count >= 3)?.[0] ?? null;
  const matchedSymbol = symbols.find((symbol) => symbol.id === matchedSymbolId) ?? null;
  const matchedTileIds = tiles
    .filter((tile) => winningNumbers.includes(tile.number) || tile.symbol.id === matchedSymbolId)
    .map((tile) => tile.tileId);
  const points =
    tiles
      .filter((tile) => winningNumbers.includes(tile.number))
      .reduce((sum, tile) => sum + tile.prize, 0) + (matchedSymbol?.points ?? 0);

  return {
    id: `scratch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    winningNumbers,
    tiles,
    matchedSymbolId,
    matchedTileIds,
    points,
    scratchPercent: 0,
    settled: false,
  };
}

function getBallTone(value: number) {
  if (value <= 10) return '#f5c766';
  if (value <= 20) return '#38bdf8';
  if (value <= 30) return '#fb7185';
  if (value <= 40) return '#94a3b8';
  return '#34d399';
}

function formatNumbers(numbers: number[]) {
  return numbers.map((number) => String(number).padStart(2, '0')).join(' - ');
}

function formatScratchSymbol(symbol: ScratchSymbol | null) {
  return symbol ? `아이콘 ${symbol.mark}` : '번호';
}

export default function SocialContributionLotteryExperience({ config, livePreview = false, editor }: SocialContributionLotteryExperienceProps = {}) {
  const activeConfig = useMemo(() => config ?? buildSocialContributionLotteryConfig(), [config]);
  const activeScratchSymbols = activeConfig.scratchSymbols.length > 0 ? activeConfig.scratchSymbols : scratchSymbols;
  const activeImpactMissions = activeConfig.impactMissions.length > 0 ? activeConfig.impactMissions : impactMissions;
  const activeActivityLog = activeConfig.activityLog.length > 0 ? activeConfig.activityLog : defaultActivityLog;
  const livePreviewSyncKey = useMemo(
    () =>
      JSON.stringify({
        activityLog: activeActivityLog,
        initialImpactPoints: activeConfig.initialImpactPoints,
        missions: activeImpactMissions.map((mission) => [mission.title, mission.target, mission.caption]),
        symbols: activeScratchSymbols.map((symbol) => [symbol.mark, symbol.points, symbol.accent]),
      }),
    [activeActivityLog, activeConfig.initialImpactPoints, activeImpactMissions, activeScratchSymbols],
  );
  const [lottoStatus, setLottoStatus] = useState<LottoStatus>('idle');
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([]);
  const [bonusNumber, setBonusNumber] = useState<number | null>(null);
  const [rollingBall, setRollingBall] = useState<RollingBallState | null>(null);
  const [drawPhase, setDrawPhase] = useState<DrawPhase>('ready');
  const [lastLottoResult, setLastLottoResult] = useState<LottoDrawResult | null>(null);
  const [scratchTicket, setScratchTicket] = useState<ScratchTicketState | null>(null);
  const [celebration, setCelebration] = useState<CelebrationEvent | null>(null);
  const [impactPoints, setImpactPoints] = useState(activeConfig.initialImpactPoints);
  const [activityLog, setActivityLog] = useState<ActivityLogItem[]>(activeActivityLog);
  const lottoTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const celebrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const celebrationCounter = useRef(0);
  const scratchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scratchAreaRef = useRef<HTMLDivElement | null>(null);
  const isScratchingRef = useRef(false);
  const scratchRecordedTicketId = useRef<string | null>(null);

  const scratchProgress = scratchTicket?.scratchPercent ?? 0;
  const allScratchRevealed = Boolean(scratchTicket?.settled);
  const matchedScratchSymbol = activeScratchSymbols.find((symbol) => symbol.id === scratchTicket?.matchedSymbolId) ?? null;
  const scratchTicketId = scratchTicket?.id;
  const isScratchTicketSettled = scratchTicket?.settled ?? false;
  const drawnSlots = useMemo(() => Array.from({ length: 6 }, (_, index) => drawnNumbers[index] ?? null), [drawnNumbers]);
  const drawProgress = Math.round(((drawnNumbers.length + (bonusNumber ? 1 : 0)) / 7) * 100);
  const activeMission = activeImpactMissions.find((mission) => impactPoints < mission.target) ?? activeImpactMissions[activeImpactMissions.length - 1];
  const activeMissionProgress = Math.min(100, Math.round((impactPoints / Math.max(1, activeMission.target)) * 100));
  const impactTier = impactPoints >= 360 ? 'Impact Gold' : impactPoints >= 220 ? 'Impact Silver' : impactPoints >= 120 ? 'Impact Bronze' : 'Seed';

  useEffect(() => {
    return () => {
      lottoTimers.current.forEach((timer) => clearTimeout(timer));
      if (celebrationTimer.current) {
        clearTimeout(celebrationTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!livePreview) return;
    lottoTimers.current.forEach((timer) => clearTimeout(timer));
    lottoTimers.current = [];
    scratchRecordedTicketId.current = null;

    let didCancel = false;
    queueMicrotask(() => {
      if (didCancel) return;
      setLottoStatus('idle');
      setDrawnNumbers([]);
      setBonusNumber(null);
      setRollingBall(null);
      setDrawPhase('ready');
      setLastLottoResult(null);
      setScratchTicket(null);
      setCelebration(null);
      setImpactPoints(activeConfig.initialImpactPoints);
      setActivityLog(activeActivityLog);
    });

    return () => {
      didCancel = true;
    };
  }, [activeActivityLog, activeConfig.initialImpactPoints, livePreview, livePreviewSyncKey]);

  const clearLottoTimers = () => {
    lottoTimers.current.forEach((timer) => clearTimeout(timer));
    lottoTimers.current = [];
  };

  const scheduleLottoStep = (callback: () => void, delay: number) => {
    const timer = setTimeout(callback, delay);
    lottoTimers.current.push(timer);
  };

  const triggerCelebration = (title: string, points: number) => {
    if (celebrationTimer.current) {
      clearTimeout(celebrationTimer.current);
    }

    celebrationCounter.current += 1;
    setCelebration({
      id: `celebration-${celebrationCounter.current}`,
      title,
      points,
    });

    celebrationTimer.current = setTimeout(() => {
      setCelebration(null);
    }, 2300);
  };

  function drawScratchFoil() {
    const canvas = scratchCanvasRef.current;
    const area = scratchAreaRef.current;
    if (!canvas || !area) return;

    const rect = area.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const gradient = context.createLinearGradient(0, 0, rect.width, rect.height);
    gradient.addColorStop(0, '#f8fafc');
    gradient.addColorStop(0.22, '#aab4be');
    gradient.addColorStop(0.48, '#f1f5f9');
    gradient.addColorStop(0.7, '#87919c');
    gradient.addColorStop(1, '#dbe2ea');
    context.fillStyle = gradient;
    context.fillRect(0, 0, rect.width, rect.height);

    context.globalAlpha = 0.34;
    context.strokeStyle = '#ffffff';
    context.lineWidth = 1;
    for (let line = -rect.height; line < rect.width; line += 12) {
      context.beginPath();
      context.moveTo(line, 0);
      context.lineTo(line + rect.height, rect.height);
      context.stroke();
    }

    context.globalAlpha = 1;
    context.fillStyle = 'rgba(15, 23, 42, 0.62)';
    context.font = '900 18px Pretendard, sans-serif';
    context.textAlign = 'center';
    context.fillText('긁어서 번호와 아이콘 확인', rect.width / 2, rect.height / 2 - 6);
    context.font = '800 12px Pretendard, sans-serif';
    context.fillText('SCRATCH TO REVEAL', rect.width / 2, rect.height / 2 + 18);
  }

  const getScratchPercent = () => {
    const canvas = scratchCanvasRef.current;
    if (!canvas) return 0;

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return 0;

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    let clearedPixels = 0;

    for (let index = 3; index < imageData.data.length; index += 4) {
      if (imageData.data[index] === 0) {
        clearedPixels += 1;
      }
    }

    return Math.round((clearedPixels / (imageData.data.length / 4)) * 100);
  };

  useEffect(() => {
    if (!scratchTicketId || isScratchTicketSettled) return;

    const frameId = window.requestAnimationFrame(() => {
      drawScratchFoil();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [scratchTicketId, isScratchTicketSettled]);

  const recordScratchTicket = (ticket: ScratchTicketState) => {
    const matchedSymbol = activeScratchSymbols.find((symbol) => symbol.id === ticket.matchedSymbolId) ?? null;
    if (scratchRecordedTicketId.current === ticket.id) return;

    scratchRecordedTicketId.current = ticket.id;
    setImpactPoints((current) => current + ticket.points);
    setActivityLog((current) => [
      {
        id: `log-${ticket.id}`,
        title: ticket.points > 0 ? `${formatScratchSymbol(matchedSymbol)} 스크래치복권 적립` : '스크래치복권 응모 완료',
        meta: ticket.points > 0 ? '번호/아이콘 매칭' : '복권 결과 기록',
        points: ticket.points,
      },
      ...current,
    ].slice(0, 5));

    if (ticket.points > 0) {
      triggerCelebration(`${formatScratchSymbol(matchedSymbol)} 스크래치 당첨`, ticket.points);
    }
  };

  const runLottoDraw = () => {
    if (lottoStatus === 'drawing') return;

    clearLottoTimers();
    const result = createLottoDraw();
    const drawSequence: Array<{ value: number; role: BallRole }> = [
      ...result.numbers.map((value) => ({ value, role: 'main' as const })),
      { value: result.bonus, role: 'bonus' },
    ];

    setLottoStatus('drawing');
    setDrawnNumbers([]);
    setBonusNumber(null);
    setRollingBall(null);
    setDrawPhase('mixing');
    setLastLottoResult(null);

    drawSequence.forEach((ball, index) => {
      const startDelay = activeConfig.timing.lottoWarmupMs + index * activeConfig.timing.lottoStepIntervalMs;

      scheduleLottoStep(() => {
        setDrawPhase('mixing');
      }, Math.max(0, startDelay - 700));

      scheduleLottoStep(() => {
        setDrawPhase('gate');
      }, Math.max(0, startDelay - 260));

      scheduleLottoStep(() => {
        setDrawPhase('rolling');
        setRollingBall({
          id: `${result.id}-${ball.role}-${ball.value}-${index}`,
          value: ball.value,
          role: ball.role,
        });
      }, startDelay);

      scheduleLottoStep(() => {
        setDrawPhase('captured');
        if (ball.role === 'bonus') {
          setBonusNumber(ball.value);
        } else {
          setDrawnNumbers((current) => [...current, ball.value]);
        }
        setRollingBall(null);
      }, startDelay + activeConfig.timing.lottoRollDurationMs);
    });

    scheduleLottoStep(() => {
      setLastLottoResult(result);
      setLottoStatus('done');
      setDrawPhase('complete');
      setImpactPoints((current) => current + result.points);
      setActivityLog((current) => [
        {
          id: `log-${result.id}`,
          title: `로또 ${formatNumbers(result.numbers)}`,
          meta: `보너스 ${String(result.bonus).padStart(2, '0')}`,
          points: result.points,
        },
        ...current,
      ].slice(0, 5));
      triggerCelebration('로또 추첨 완료', result.points);
    }, activeConfig.timing.lottoWarmupMs + drawSequence.length * activeConfig.timing.lottoStepIntervalMs + 420);
  };

  const resetLotto = () => {
    clearLottoTimers();
    setLottoStatus('idle');
    setDrawnNumbers([]);
    setBonusNumber(null);
    setRollingBall(null);
    setDrawPhase('ready');
    setLastLottoResult(null);
  };

  const issueScratchTicket = () => {
    scratchRecordedTicketId.current = null;
    setScratchTicket(createScratchTicket(activeScratchSymbols));
  };

  const settleScratchTicket = (percent: number) => {
    if (!scratchTicket || scratchTicket.settled) return;

    const nextTicket = {
      ...scratchTicket,
      scratchPercent: Math.max(percent, scratchTicket.scratchPercent),
      settled: true,
    };

    setScratchTicket(nextTicket);
    recordScratchTicket(nextTicket);
  };

  const revealAllScratchTiles = () => {
    if (!scratchTicket || scratchTicket.settled) return;

    const canvas = scratchCanvasRef.current;
    const context = canvas?.getContext('2d', { willReadFrequently: true });
    if (canvas && context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
    }

    const nextTicket = {
      ...scratchTicket,
      scratchPercent: 100,
      settled: true,
    };

    setScratchTicket(nextTicket);
    recordScratchTicket(nextTicket);
  };

  const scratchAt = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!scratchTicket || scratchTicket.settled) return;

    const canvas = scratchCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;

    const ratioX = canvas.width / rect.width;
    const ratioY = canvas.height / rect.height;
    const x = (event.clientX - rect.left) * ratioX;
    const y = (event.clientY - rect.top) * ratioY;
    const radius = 34 * Math.max(ratioX, ratioY);
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(x - radius, y - radius * 0.55, radius * 2, radius * 1.1);
    context.clearRect(x - radius * 0.55, y - radius, radius * 1.1, radius * 2);
    context.restore();

    const percent = getScratchPercent();
    setScratchTicket((current) => (current ? { ...current, scratchPercent: Math.max(current.scratchPercent, percent) } : current));

    if (percent >= activeConfig.timing.scratchRevealThreshold) {
      settleScratchTicket(percent);
    }
  };

  const startScratching = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    isScratchingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    scratchAt(event);
  };

  const moveScratching = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!isScratchingRef.current) return;
    scratchAt(event);
  };

  const stopScratching = () => {
    isScratchingRef.current = false;
  };

  return (
    <Page id="content-area" aria-labelledby="social-lottery-title">
      <HeaderBand $selected={editor?.selectedBlockId === 'social-hero'}>
        {editor ? (
          <EditHotspot type="button" onClick={() => editor.onSelectBlock?.('social-hero')}>
            <Settings size={14} />
            첫 화면 수정
          </EditHotspot>
        ) : null}
        <HeroCopy>
          <Kicker>
            <HeartHandshake size={17} strokeWidth={2.5} aria-hidden="true" />
            {activeConfig.heroKicker}
          </Kicker>
          <h1 id="social-lottery-title">{activeConfig.heroTitle}</h1>
          <p>{activeConfig.heroBody}</p>
          {activeConfig.heroActionLabel && activeConfig.heroActionHref ? (
            <HeroActionLink href={activeConfig.heroActionHref}>
              <ArrowUpRight size={17} strokeWidth={2.5} aria-hidden="true" />
              {activeConfig.heroActionLabel}
            </HeroActionLink>
          ) : null}
          <HeroSignalRow aria-label="사회공헌 이벤트 운영 상태">
            <HeroSignal>
              <span>ROUND</span>
              <strong>{lottoStatus === 'drawing' ? 'LIVE' : lottoStatus === 'done' ? 'DONE' : 'READY'}</strong>
            </HeroSignal>
            <HeroSignal>
              <span>TIER</span>
              <strong>{impactTier}</strong>
            </HeroSignal>
            <HeroSignal>
              <span>MODE</span>
              <strong>LOTTO + SCRATCH</strong>
            </HeroSignal>
          </HeroSignalRow>
        </HeroCopy>

        <ImpactBoard aria-label="사회공헌 포인트 현황">
          <ImpactMetric>
            <span>누적 포인트</span>
            <strong>{impactPoints.toLocaleString('ko-KR')}</strong>
          </ImpactMetric>
          <ImpactMetric>
            <span>최근 로또</span>
            <strong>{lastLottoResult ? `${lastLottoResult.points}P` : '대기'}</strong>
          </ImpactMetric>
          <ImpactMissionMeter>
            <MissionMeterTop>
              <span>다음 미션</span>
              <strong>{activeMission.title}</strong>
            </MissionMeterTop>
            <MeterTrack aria-label={`${activeMission.title} 진행률`}>
              <span style={{ width: `${activeMissionProgress}%` }} />
            </MeterTrack>
            <small>
              {impactPoints.toLocaleString('ko-KR')} / {activeMission.target.toLocaleString('ko-KR')}P
            </small>
          </ImpactMissionMeter>
          <NoticePill>{activeConfig.noticeText}</NoticePill>
        </ImpactBoard>
      </HeaderBand>

      <GameGrid>
        <LottoSection aria-labelledby="lotto-title" $selected={editor?.selectedBlockId === 'social-media'}>
          {editor ? (
            <EditHotspot type="button" onClick={() => editor.onSelectBlock?.('social-media')}>
              <Settings size={14} />
              추첨기 수정
            </EditHotspot>
          ) : null}
          <SectionTop>
            <div>
              <Kicker>
                <Ticket size={17} strokeWidth={2.5} aria-hidden="true" />
                {activeConfig.lottoKicker}
              </Kicker>
              <h2 id="lotto-title">{activeConfig.lottoTitle}</h2>
              {activeConfig.lottoBody ? <SectionDescription>{activeConfig.lottoBody}</SectionDescription> : null}
            </div>
            <ActionRow>
              <PrimaryButton type="button" onClick={runLottoDraw} disabled={lottoStatus === 'drawing'}>
                <Play size={18} strokeWidth={2.5} aria-hidden="true" />
                {lottoStatus === 'drawing' ? '추첨 중' : activeConfig.lottoButtonLabel}
              </PrimaryButton>
              <IconActionButton type="button" onClick={resetLotto} aria-label="로또 추첨 초기화">
                <RotateCcw size={18} strokeWidth={2.5} aria-hidden="true" />
              </IconActionButton>
            </ActionRow>
          </SectionTop>

          <MachinePanel>
            <MachineArena>
              <MachinePhotoFrame $active={lottoStatus === 'drawing'} aria-hidden="true">
                <MachinePhoto src={activeConfig.machineImageUrl} alt={activeConfig.machineImageAlt} />
              </MachinePhotoFrame>
              <MachineStatusBoard>
                <StatusLights aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </StatusLights>
                <span>{drawPhaseLabels[drawPhase]}</span>
                <strong>
                  {rollingBall
                    ? `${rollingBall.role === 'bonus' ? 'BONUS ' : 'NO. '}${String(rollingBall.value).padStart(2, '0')}`
                    : lastLottoResult
                      ? `${lastLottoResult.points}P 적립`
                      : '대기 중'}
                </strong>
                <MeterTrack aria-label="로또 추첨 진행률">
                  <span style={{ width: `${drawProgress}%` }} />
                </MeterTrack>
              </MachineStatusBoard>
              <MachineBallOverlay $active={lottoStatus === 'drawing'} aria-hidden="true">
                {idleBalls.map((ball) => (
                  <IdleBallItem
                    key={`${ball.value}-${ball.x}`}
                    $x={ball.x}
                    $y={ball.y}
                    $delay={ball.delay}
                    $tone={getBallTone(ball.value)}
                    $active={lottoStatus === 'drawing'}
                  >
                    {ball.value}
                  </IdleBallItem>
                ))}
              </MachineBallOverlay>
              <MachineExitPulse $active={lottoStatus === 'drawing'} aria-hidden="true" />
              {rollingBall && (
                <RollingBall key={rollingBall.id} $tone={getBallTone(rollingBall.value)} $bonus={rollingBall.role === 'bonus'}>
                  {rollingBall.value}
                </RollingBall>
              )}
            </MachineArena>
          </MachinePanel>

          {activeConfig.mediaItems.length > 0 ? (
            <SocialMediaInventory aria-label="사회공헌 미디어 목록">
              {activeConfig.mediaItems.map((item) => (
                <SocialMediaItemCard key={`${item.type}-${item.url}`}>
                  <SocialMediaThumb $image={item.type === 'image' ? item.url : ''}>
                    {renderSocialMediaPreview(item)}
                  </SocialMediaThumb>
                  <div>
                    <span>{item.type}</span>
                    <strong>{item.caption || item.alt}</strong>
                    <p>{item.description || activeConfig.machineDescription || item.alt}</p>
                    <small>{item.url}</small>
                  </div>
                </SocialMediaItemCard>
              ))}
            </SocialMediaInventory>
          ) : null}

          <DrawResultPanel>
            <DrawnBallRail aria-label="추첨 번호">
              {drawnSlots.map((number, index) => (
                <DrawnBallSlot key={`slot-${index}`} $filled={number !== null} $tone={number ? getBallTone(number) : '#314039'}>
                  {number ?? String(index + 1).padStart(2, '0')}
                </DrawnBallSlot>
              ))}
              <PlusMark>+</PlusMark>
              <DrawnBallSlot $filled={bonusNumber !== null} $tone={bonusNumber ? getBallTone(bonusNumber) : '#43382a'} $bonus>
                {bonusNumber ?? 'B'}
              </DrawnBallSlot>
            </DrawnBallRail>
            <DrawSummary>
              <span>{lottoStatus === 'done' ? '확정 포인트' : lottoStatus === 'drawing' ? '공 이동 중' : '추첨 대기'}</span>
              <strong>{lastLottoResult ? `${lastLottoResult.points}P` : drawnNumbers.length > 0 ? `${drawnNumbers.length}/6` : 'READY'}</strong>
            </DrawSummary>
            <DrawSequenceList aria-label="로또 추첨 단계">
              {['1', '2', '3', '4', '5', '6', 'B'].map((label, index) => {
                const isBonus = label === 'B';
                const isComplete = isBonus ? bonusNumber !== null : drawnNumbers.length > index;
                const isActive = lottoStatus === 'drawing' && (isBonus ? drawnNumbers.length >= 6 && bonusNumber === null : drawnNumbers.length === index);

                return (
                  <DrawSequenceItem key={label} $complete={isComplete} $active={isActive}>
                    {label}
                  </DrawSequenceItem>
                );
              })}
            </DrawSequenceList>
          </DrawResultPanel>
        </LottoSection>

        <ScratchSection aria-labelledby="scratch-title" $selected={editor?.selectedBlockId === 'social-scratch'}>
          {editor ? (
            <EditHotspot type="button" onClick={() => editor.onSelectBlock?.('social-scratch')}>
              <Settings size={14} />
              복권 아이콘 수정
            </EditHotspot>
          ) : null}
          <SectionTop>
            <div>
              <Kicker>
                <Gift size={17} strokeWidth={2.5} aria-hidden="true" />
                {activeConfig.scratchKicker}
              </Kicker>
              <h2 id="scratch-title">{activeConfig.scratchTitle}</h2>
            </div>
            <ActionRow>
              <PrimaryButton type="button" onClick={issueScratchTicket}>
                <Ticket size={18} strokeWidth={2.5} aria-hidden="true" />
                {activeConfig.scratchButtonLabel}
              </PrimaryButton>
              <IconActionButton
                type="button"
                onClick={revealAllScratchTiles}
                disabled={!scratchTicket || allScratchRevealed}
                aria-label="즉석복권 전체 긁기"
              >
                <Sparkles size={18} strokeWidth={2.5} aria-hidden="true" />
              </IconActionButton>
            </ActionRow>
          </SectionTop>

          <PayoutGuide aria-label="즉석복권 배당표">
            {activeScratchSymbols.map((symbol) => {
              return (
                <PayoutChip key={symbol.id} $accent={symbol.accent} aria-label={`${symbol.label} 아이콘 3개 ${symbol.points}포인트`}>
                  <ScratchNumberIcon $accent={symbol.accent}>{symbol.mark}</ScratchNumberIcon>
                  <strong>3개 {symbol.points}P</strong>
                </PayoutChip>
              );
            })}
          </PayoutGuide>

          <ScratchTicketPanel $active={Boolean(scratchTicket)}>
            <ScratchHeader>
              <ScratchCode>
                <span>SCRATCH CARD</span>
                <strong>{scratchTicket ? scratchTicket.id.slice(-7).toUpperCase() : 'READY'}</strong>
              </ScratchCode>
              <ScratchProgress aria-label="스크래치복권 긁은 비율">
                <span style={{ width: `${scratchProgress}%` }} />
              </ScratchProgress>
            </ScratchHeader>

            {scratchTicket ? (
              <ScratchTicketBody>
                <WinningNumberStrip aria-label="당첨번호">
                  <span>당첨번호</span>
                  <div>
                    {scratchTicket.winningNumbers.map((number) => (
                      <WinningNumberBall key={number} $tone={getBallTone(number)}>
                        {String(number).padStart(2, '0')}
                      </WinningNumberBall>
                    ))}
                  </div>
                </WinningNumberStrip>

                <ScratchPlayArea ref={scratchAreaRef} aria-label="긁는 스크래치 영역">
                  <ScratchGrid aria-label="내 번호와 아이콘">
                    {scratchTicket.tiles.map((tile) => {
                      const isMatched = scratchTicket.settled && scratchTicket.matchedTileIds.includes(tile.tileId);

                      return (
                        <ScratchTileCard key={tile.tileId} $accent={tile.symbol.accent} $matched={isMatched}>
                          <TileNumber>
                            <span>내 번호</span>
                            <strong>{String(tile.number).padStart(2, '0')}</strong>
                          </TileNumber>
                          <TilePicture>
                            <ScratchNumberIcon $accent={tile.symbol.accent} $small aria-label={`${tile.symbol.label} 아이콘`}>
                              {tile.symbol.mark}
                            </ScratchNumberIcon>
                          </TilePicture>
                          <TilePrize>{tile.prize}P</TilePrize>
                        </ScratchTileCard>
                      );
                    })}
                  </ScratchGrid>
                  {!scratchTicket.settled && (
                    <ScratchCanvas
                      ref={scratchCanvasRef}
                      aria-label="은박을 마우스나 손가락으로 긁어서 확인"
                      onPointerDown={startScratching}
                      onPointerMove={moveScratching}
                      onPointerUp={stopScratching}
                      onPointerCancel={stopScratching}
                      onPointerLeave={stopScratching}
                    />
                  )}
                </ScratchPlayArea>
              </ScratchTicketBody>
            ) : (
              <ScratchEmptyState>
                <Ticket size={28} strokeWidth={2.3} aria-hidden="true" />
                <strong>복권을 발급하면 은박 스크래치 영역이 나타납니다.</strong>
                <span>당첨번호와 내 번호가 맞거나 같은 아이콘 3개가 나오면 포인트가 적립됩니다.</span>
              </ScratchEmptyState>
            )}

            <ScratchOutcome $win={Boolean(allScratchRevealed && scratchTicket?.points)}>
              <span>{allScratchRevealed ? (scratchTicket?.points ? '당첨 포인트' : '응모 완료') : '긁은 비율'}</span>
              <strong>
                {allScratchRevealed
                  ? scratchTicket?.points
                    ? `${formatScratchSymbol(matchedScratchSymbol)} ${scratchTicket.points}P`
                    : 'NEXT'
                  : `${scratchProgress}%`}
              </strong>
            </ScratchOutcome>
          </ScratchTicketPanel>
        </ScratchSection>
      </GameGrid>

      <ActivityBand aria-labelledby="activity-title" $selected={editor?.selectedBlockId === 'social-log'}>
        {editor ? (
          <EditHotspot type="button" onClick={() => editor.onSelectBlock?.('social-log')}>
            <Settings size={14} />
            기록 수정
          </EditHotspot>
        ) : null}
        <ActivityHeader>
          <Kicker>
            <Trophy size={17} strokeWidth={2.5} aria-hidden="true" />
            {activeConfig.activityKicker}
          </Kicker>
          <h2 id="activity-title">{activeConfig.activityTitle}</h2>
          {activeConfig.activityBody ? <p>{activeConfig.activityBody}</p> : null}
        </ActivityHeader>
        <ActivityList>
          {activityLog.map((item) => (
            <ActivityItem key={item.id}>
              <ActivityIcon>
                <HeartHandshake size={19} strokeWidth={2.5} aria-hidden="true" />
              </ActivityIcon>
              <ActivityCopy>
                <strong>{item.title}</strong>
                <span>{item.meta}</span>
              </ActivityCopy>
              <ActivityPoints>{item.points > 0 ? `+${item.points}P` : '대기'}</ActivityPoints>
            </ActivityItem>
          ))}
        </ActivityList>
        <MissionRail aria-label="사회공헌 미션 진행률" $selected={editor?.selectedBlockId === 'social-impact'}>
          {editor ? (
            <EditHotspot type="button" onClick={() => editor.onSelectBlock?.('social-impact')}>
              <Settings size={14} />
              미션 그래프 수정
            </EditHotspot>
          ) : null}
          <MissionHeader>
            <Kicker>
              <BadgeCheck size={17} strokeWidth={2.5} aria-hidden="true" />
              Impact Missions
            </Kicker>
            <h2>{activeConfig.impactTitle}</h2>
          </MissionHeader>
          {activeImpactMissions.map((mission) => {
            const Icon = mission.icon;
            const progress = Math.min(100, Math.round((impactPoints / Math.max(1, mission.target)) * 100));

            return (
              <MissionCard key={mission.id} $accent={mission.accent} $complete={progress >= 100}>
                <MissionIcon $accent={mission.accent}>
                  <Icon size={20} strokeWidth={2.5} aria-hidden="true" />
                </MissionIcon>
                <div>
                  <span>{mission.caption}</span>
                  <strong>{mission.title}</strong>
                </div>
                <MissionProgress>
                  <span style={{ width: `${progress}%` }} />
                </MissionProgress>
              </MissionCard>
            );
          })}
        </MissionRail>
      </ActivityBand>

      {celebration && (
        <CelebrationToast key={celebration.id} role="status" aria-live="polite">
          {celebrationParticles.map((particle) => (
            <CelebrationSpark
              key={`${celebration.id}-${particle.x}-${particle.y}`}
              $x={particle.x}
              $y={particle.y}
              $delay={particle.delay}
              aria-hidden="true"
            />
          ))}
          <Sparkles size={22} strokeWidth={2.5} aria-hidden="true" />
          <span>{celebration.title}</span>
          <strong>+{celebration.points}P</strong>
        </CelebrationToast>
      )}
    </Page>
  );
}

function getSocialMediaTitle(item: SocialMediaItem) {
  return item.alt || item.caption || '사회공헌 미디어';
}

function renderSocialMediaPreview(item: SocialMediaItem) {
  const youtubeEmbedUrl = getYouTubeEmbedUrl(item.url);
  const title = getSocialMediaTitle(item);

  if (youtubeEmbedUrl) {
    return (
      <iframe
        src={youtubeEmbedUrl}
        title={title}
        loading="lazy"
        allow={YOUTUBE_EMBED_ALLOW}
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    );
  }

  if (item.type === 'video') {
    return <video src={item.url} muted playsInline preload="metadata" />;
  }

  if (item.type === 'embed') {
    return <iframe src={item.url} title={title} loading="lazy" />;
  }

  return item.type !== 'image' ? <Ticket size={18} strokeWidth={2.5} aria-hidden="true" /> : null;
}

const Page = styled.main`
  --social-bg: #07110f;
  --social-panel: rgba(7, 19, 17, 0.92);
  --social-panel-strong: rgba(12, 31, 28, 0.96);
  --social-border: rgba(218, 255, 242, 0.15);
  --social-border-strong: rgba(218, 255, 242, 0.26);
  --social-text: #f2fff9;
  --social-muted: #a8c4bc;
  --social-faint: #6f8f86;
  --social-mint: #5eead4;
  --social-amber: #f5c766;
  --social-rose: #fb7185;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 24px;
  color: var(--social-text);
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.038) 1px, transparent 1px),
    linear-gradient(0deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
    linear-gradient(135deg, rgba(94, 234, 212, 0.13), transparent 36%),
    linear-gradient(315deg, rgba(245, 199, 102, 0.12), transparent 34%),
    var(--social-bg);
  background-size: 54px 54px, 54px 54px, auto, auto, auto;

  @media (max-width: 760px) {
    padding: 14px;
  }
`;

const HeaderBand = styled.header<{ $selected?: boolean }>`
  width: min(1280px, 100%);
  margin: 0 auto 16px;
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 430px);
  gap: 16px;
  align-items: stretch;
  outline: ${(props) => (props.$selected ? '3px solid rgba(94, 234, 212, 0.6)' : '0 solid transparent')};
  outline-offset: 4px;
  border-radius: 8px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const HeroCopy = styled.div`
  min-width: 0;
  min-height: 210px;
  display: grid;
  align-content: center;
  gap: 14px;
  padding: 28px;
  border: 1px solid var(--social-border);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.09), rgba(255, 255, 255, 0.025)),
    rgba(7, 19, 17, 0.82);
  box-shadow: 0 24px 62px rgba(0, 0, 0, 0.26);

  h1 {
    margin: 0;
    color: #ffffff;
    font-size: 2.72rem;
    line-height: 1.08;
    font-weight: 950;
    letter-spacing: 0;
    word-break: keep-all;
    overflow-wrap: break-word;
  }

  p {
    max-width: 680px;
    margin: 0;
    color: var(--social-muted);
    font-size: 1rem;
    line-height: 1.74;
    font-weight: 700;
    word-break: keep-all;
  }

  @media (max-width: 760px) {
    min-height: 0;
    padding: 22px;

    h1 {
      font-size: 2.1rem;
    }
  }
`;

const HeroSignalRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 2px;
`;

const HeroActionLink = styled.a`
  width: fit-content;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 0 15px;
  border-radius: 8px;
  color: #06110f;
  background: linear-gradient(90deg, var(--social-mint), var(--social-amber));
  font-size: 0.9rem;
  font-weight: 950;
  text-decoration: none;
  box-shadow: 0 16px 34px rgba(45, 212, 191, 0.2);
`;

const HeroSignal = styled.div`
  min-height: 48px;
  min-width: 128px;
  display: grid;
  align-content: center;
  gap: 3px;
  padding: 8px 11px;
  border: 1px solid rgba(218, 255, 242, 0.14);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(94, 234, 212, 0.1), transparent 56%),
    rgba(255, 255, 255, 0.04);

  span {
    color: var(--social-faint);
    font-size: 0.66rem;
    font-weight: 950;
  }

  strong {
    color: #ffffff;
    font-size: 0.82rem;
    font-weight: 950;
    letter-spacing: 0;
    white-space: nowrap;
  }
`;

const Kicker = styled.span`
  width: fit-content;
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid rgba(94, 234, 212, 0.32);
  border-radius: 8px;
  color: var(--social-mint);
  background: rgba(45, 212, 191, 0.1);
  font-size: 0.76rem;
  font-weight: 950;
  letter-spacing: 0;
  text-transform: uppercase;
`;

const EditHotspot = styled.button`
  position: absolute;
  right: 10px;
  top: 10px;
  z-index: 20;
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid rgba(94, 234, 212, 0.46);
  border-radius: 8px;
  padding: 0 10px;
  color: #06110f;
  background: linear-gradient(135deg, #5eead4, #f5c766);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.32);
  font-size: 0.74rem;
  font-weight: 950;
  cursor: pointer;
`;

const ImpactBoard = styled.aside`
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding: 18px;
  border: 1px solid var(--social-border);
  border-radius: 8px;
  background: var(--social-panel);
  box-shadow: 0 24px 62px rgba(0, 0, 0, 0.22);

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const ImpactMetric = styled.div`
  min-width: 0;
  min-height: 132px;
  display: grid;
  align-content: end;
  gap: 8px;
  padding: 16px;
  border: 1px solid rgba(218, 255, 242, 0.12);
  border-radius: 8px;
  background:
    linear-gradient(145deg, rgba(245, 199, 102, 0.12), transparent 58%),
    rgba(255, 255, 255, 0.045);

  span {
    color: var(--social-faint);
    font-size: 0.78rem;
    font-weight: 950;
  }

  strong {
    color: #ffffff;
    font-size: 2rem;
    line-height: 1;
    font-weight: 950;
    letter-spacing: 0;
    overflow-wrap: anywhere;
  }
`;

const ImpactMissionMeter = styled.div`
  grid-column: 1 / -1;
  min-width: 0;
  display: grid;
  gap: 8px;
  padding: 14px;
  border: 1px solid rgba(218, 255, 242, 0.12);
  border-radius: 8px;
  background:
    linear-gradient(90deg, rgba(94, 234, 212, 0.1), rgba(245, 199, 102, 0.08)),
    rgba(255, 255, 255, 0.04);

  small {
    color: var(--social-muted);
    font-size: 0.76rem;
    font-weight: 850;
  }
`;

const MissionMeterTop = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  span {
    color: var(--social-faint);
    font-size: 0.74rem;
    font-weight: 950;
  }

  strong {
    color: #ffffff;
    font-size: 0.92rem;
    font-weight: 950;
    word-break: keep-all;
  }
`;

const MeterTrack = styled.div`
  height: 10px;
  overflow: hidden;
  border: 1px solid rgba(218, 255, 242, 0.12);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.055);

  span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #5eead4, #f5c766, #fb7185);
    box-shadow: 0 0 18px rgba(94, 234, 212, 0.22);
    transition: width 260ms ease;
  }
`;

const NoticePill = styled.div`
  grid-column: 1 / -1;
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  border: 1px solid rgba(251, 113, 133, 0.3);
  border-radius: 8px;
  color: #ffc4ce;
  background: rgba(251, 113, 133, 0.09);
  font-size: 0.84rem;
  font-weight: 900;
  text-align: center;
  word-break: keep-all;
`;

const GameGrid = styled.div`
  width: min(1280px, 100%);
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(360px, 0.9fr);
  gap: 16px;
  align-items: stretch;

  @media (max-width: 1100px) {
    grid-template-columns: 1fr;
  }
`;

const LottoSection = styled.section<{ $selected?: boolean }>`
  min-width: 0;
  position: relative;
  display: grid;
  gap: 12px;
  outline: ${(props) => (props.$selected ? '3px solid rgba(245, 199, 102, 0.62)' : '0 solid transparent')};
  outline-offset: 4px;
  border-radius: 8px;
`;

const ScratchSection = styled.section<{ $selected?: boolean }>`
  min-width: 0;
  position: relative;
  display: grid;
  gap: 12px;
  outline: ${(props) => (props.$selected ? '3px solid rgba(251, 113, 133, 0.58)' : '0 solid transparent')};
  outline-offset: 4px;
  border-radius: 8px;
`;

const SectionTop = styled.div`
  min-width: 0;
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 14px;
  padding: 18px;
  border: 1px solid var(--social-border);
  border-radius: 8px;
  background: var(--social-panel);

  h2 {
    margin: 10px 0 0;
    color: #ffffff;
    font-size: 1.55rem;
    line-height: 1.18;
    font-weight: 950;
    letter-spacing: 0;
    word-break: keep-all;
  }

  p {
    max-width: 620px;
    margin: 8px 0 0;
    color: var(--social-muted);
    font-size: 0.86rem;
    font-weight: 700;
    line-height: 1.55;
    word-break: keep-all;
  }

  @media (max-width: 620px) {
    align-items: flex-start;
    flex-direction: column;
  }
`;

const SectionDescription = styled.p``;

const ActionRow = styled.div`
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;

  @media (max-width: 420px) {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 44px;
  }
`;

const PrimaryButton = styled.button`
  min-width: 128px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 14px;
  border: 1px solid rgba(94, 234, 212, 0.48);
  border-radius: 8px;
  color: #06110f;
  background: linear-gradient(135deg, #5eead4, #f5c766);
  font-size: 0.9rem;
  font-weight: 950;
  letter-spacing: 0;
  cursor: pointer;
  transition: transform 160ms ease, filter 160ms ease, opacity 160ms ease;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    filter: brightness(1.04);
  }

  &:focus-visible {
    outline: 3px solid rgba(94, 234, 212, 0.32);
    outline-offset: 3px;
  }

  &:disabled {
    opacity: 0.66;
    cursor: not-allowed;
  }
`;

const IconActionButton = styled.button`
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--social-border-strong);
  border-radius: 8px;
  color: var(--social-text);
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: border-color 160ms ease, background 160ms ease, color 160ms ease;

  &:hover:not(:disabled) {
    border-color: rgba(245, 199, 102, 0.52);
    color: #ffe6a3;
    background: rgba(245, 199, 102, 0.12);
  }

  &:focus-visible {
    outline: 3px solid rgba(245, 199, 102, 0.28);
    outline-offset: 3px;
  }

  &:disabled {
    opacity: 0.42;
    cursor: not-allowed;
  }
`;

const MachinePanel = styled.div`
  min-width: 0;
  border: 1px solid var(--social-border);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.05), transparent 34%),
    var(--social-panel-strong);
  overflow: hidden;
`;

const SocialMediaInventory = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 620px) {
    grid-template-columns: 1fr;
  }
`;

const SocialMediaItemCard = styled.article`
  min-width: 0;
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  padding: 10px;
  border: 1px solid rgba(218, 255, 242, 0.12);
  border-radius: 8px;
  background: var(--social-panel);

  span {
    color: var(--social-mint);
    font-size: 0.68rem;
    font-weight: 950;
    text-transform: uppercase;
  }

  strong {
    display: block;
    margin-top: 4px;
    color: #ffffff;
    font-size: 0.92rem;
    font-weight: 950;
    line-height: 1.24;
    word-break: keep-all;
  }

  p,
  small {
    display: block;
    margin: 5px 0 0;
    color: var(--social-muted);
    font-size: 0.74rem;
    font-weight: 700;
    line-height: 1.38;
  }

  small {
    color: rgba(218, 255, 242, 0.48);
    word-break: break-all;
  }
`;

const SocialMediaThumb = styled.div<{ $image: string }>`
  width: 88px;
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  border: 1px solid rgba(218, 255, 242, 0.14);
  border-radius: 8px;
  color: var(--social-mint);
  background:
    linear-gradient(180deg, rgba(7, 19, 17, 0.08), rgba(7, 19, 17, 0.68)),
    ${(props) => (props.$image ? `url(${props.$image}) center / cover` : 'rgba(255, 255, 255, 0.055)')};
  overflow: hidden;

  video,
  iframe {
    width: 100%;
    height: 100%;
    display: block;
    border: 0;
    object-fit: cover;
    background: #071311;
  }
`;

const MachineArena = styled.div`
  min-height: 386px;
  position: relative;
  overflow: hidden;
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
    linear-gradient(0deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
    linear-gradient(180deg, rgba(5, 14, 13, 0.24), rgba(5, 14, 13, 0.78));
  background-size: 38px 38px, 38px 38px, auto;

  &::before {
    content: '';
    position: absolute;
    left: 6%;
    right: 6%;
    bottom: 26px;
    height: 18px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.22);
    filter: blur(10px);
  }

  @media (max-width: 760px) {
    min-height: 330px;
  }
`;

const MachinePhotoFrame = styled.div<{ $active: boolean }>`
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow: hidden;
  background: rgba(5, 14, 13, 0.78);

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background:
      linear-gradient(90deg, rgba(5, 14, 13, 0.74), transparent 28%, transparent 66%, rgba(5, 14, 13, 0.72)),
      radial-gradient(circle at 42% 44%, rgba(94, 234, 212, ${(props) => (props.$active ? '0.13' : '0.04')}), transparent 28%),
      linear-gradient(180deg, rgba(5, 14, 13, 0.14), transparent 52%, rgba(5, 14, 13, 0.72));
    pointer-events: none;
    transition: background 220ms ease;
  }
`;

const MachinePhoto = styled.img`
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  object-position: center center;
  filter: saturate(1.08) contrast(1.04);
`;

const MachineBallOverlay = styled.div<{ $active: boolean }>`
  position: absolute;
  left: 27%;
  top: 8%;
  z-index: 2;
  width: min(346px, 46%);
  aspect-ratio: 1;
  border-radius: 50%;
  pointer-events: none;
  opacity: ${(props) => (props.$active ? 0.92 : 0.78)};
  transform-origin: 50% 50%;
  animation: ${(props) => (props.$active ? 'drumMixSpin 880ms linear infinite' : 'none')};

  &::before {
    content: '';
    position: absolute;
    inset: 7%;
    border-radius: inherit;
    border: 1px solid rgba(218, 255, 242, ${(props) => (props.$active ? '0.24' : '0.1')});
    background:
      conic-gradient(
        from 18deg,
        transparent 0 10deg,
        rgba(255, 255, 255, ${(props) => (props.$active ? '0.18' : '0.06')}) 11deg 14deg,
        transparent 15deg 68deg,
        rgba(245, 199, 102, ${(props) => (props.$active ? '0.14' : '0.04')}) 69deg 72deg,
        transparent 73deg 120deg
      );
    box-shadow: inset 0 0 26px rgba(255, 255, 255, 0.06);
  }

  &::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: 34%;
    height: 34%;
    border-radius: inherit;
    border: 1px solid rgba(255, 255, 255, 0.14);
    transform: translate(-50%, -50%);
  }

  @keyframes drumMixSpin {
    0% {
      transform: rotate(0deg);
    }

    100% {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 760px) {
    left: 11%;
    top: 15%;
    width: min(260px, 68%);
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const MachineExitPulse = styled.div<{ $active: boolean }>`
  position: absolute;
  left: 42%;
  top: 72%;
  z-index: 3;
  width: 34%;
  height: 24px;
  border-radius: 999px;
  opacity: ${(props) => (props.$active ? 1 : 0)};
  background:
    linear-gradient(90deg, rgba(245, 199, 102, 0), rgba(245, 199, 102, 0.2), rgba(94, 234, 212, 0)),
    rgba(255, 255, 255, 0.03);
  filter: blur(1px);
  transform: rotate(-6deg);
  transform-origin: left center;
  animation: ${(props) => (props.$active ? 'exitRailPulse 960ms ease-in-out infinite' : 'none')};
  pointer-events: none;

  @keyframes exitRailPulse {
    0%,
    100% {
      opacity: 0.36;
      transform: rotate(-6deg) translateX(-4px);
    }

    50% {
      opacity: 1;
      transform: rotate(-6deg) translateX(8px);
    }
  }

  @media (max-width: 760px) {
    left: 36%;
    top: 76%;
    width: 48%;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const MachineStatusBoard = styled.div`
  position: absolute;
  top: 18px;
  right: 18px;
  z-index: 4;
  width: min(230px, 38%);
  min-height: 112px;
  display: grid;
  align-content: center;
  gap: 7px;
  padding: 13px;
  border: 1px solid rgba(218, 255, 242, 0.16);
  border-radius: 8px;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.035)),
    rgba(4, 13, 12, 0.78);
  backdrop-filter: blur(12px);
  box-shadow: 0 18px 36px rgba(0, 0, 0, 0.28);

  > span {
    color: var(--social-mint);
    font-size: 0.74rem;
    font-weight: 950;
    letter-spacing: 0;
  }

  strong {
    color: #ffffff;
    font-size: 1.15rem;
    line-height: 1;
    font-weight: 950;
    letter-spacing: 0;
  }

  @media (max-width: 760px) {
    top: 14px;
    right: 14px;
    width: 146px;
    min-height: 98px;
    padding: 11px;

    strong {
      font-size: 0.96rem;
    }
  }
`;

const StatusLights = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 5px;

  i {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: rgba(148, 163, 184, 0.42);

    &:nth-child(1) {
      background: #5eead4;
      box-shadow: 0 0 12px rgba(94, 234, 212, 0.8);
    }

    &:nth-child(2) {
      background: #f5c766;
      box-shadow: 0 0 10px rgba(245, 199, 102, 0.62);
    }
  }
`;

const IdleBallItem = styled.span<{ $x: number; $y: number; $delay: number; $tone: string; $active: boolean }>`
  position: absolute;
  left: ${(props) => props.$x}%;
  top: ${(props) => props.$y}%;
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 2px solid rgba(255, 255, 255, 0.52);
  border-radius: 50%;
  color: #06110f;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.82), transparent 42%),
    ${(props) => props.$tone};
  font-size: 0.86rem;
  font-weight: 950;
  transform: translate(-50%, -50%);
  animation: ${(props) => (props.$active ? 'insideDrumTumble 620ms ease-in-out infinite' : 'idleBallFloat 4.8s ease-in-out infinite')};
  animation-delay: ${(props) => (props.$active ? `${props.$delay * -0.14}s` : `${props.$delay}s`)};
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.22);

  @keyframes idleBallFloat {
    0%,
    100% {
      transform: translate(-50%, -50%) rotate(0deg);
    }

    45% {
      transform: translate(-45%, -58%) rotate(18deg);
    }

    72% {
      transform: translate(-58%, -44%) rotate(-22deg);
    }
  }

  @keyframes insideDrumTumble {
    0%,
    100% {
      transform: translate(-50%, -50%) scale(0.94) rotate(0deg);
    }

    34% {
      transform: translate(-40%, -62%) scale(1.06) rotate(150deg);
    }

    68% {
      transform: translate(-62%, -40%) scale(0.98) rotate(310deg);
    }
  }

  @media (max-width: 760px) {
    width: 34px;
    height: 34px;
    font-size: 0.74rem;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const RollingBall = styled.div<{ $tone: string; $bonus: boolean }>`
  position: absolute;
  z-index: 3;
  left: 0;
  top: 0;
  width: ${(props) => (props.$bonus ? '58px' : '54px')};
  height: ${(props) => (props.$bonus ? '58px' : '54px')};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 3px solid ${(props) => (props.$bonus ? '#fff0b3' : 'rgba(255, 255, 255, 0.72)')};
  border-radius: 50%;
  color: #06110f;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.86), transparent 42%),
    ${(props) => props.$tone};
  font-size: 1.08rem;
  font-weight: 950;
  box-shadow:
    0 14px 26px rgba(0, 0, 0, 0.34),
    0 0 0 ${(props) => (props.$bonus ? '5px' : '0')} rgba(245, 199, 102, 0.18);
  animation: rollOut ${LOTTO_ROLL_DURATION_MS}ms cubic-bezier(0.16, 0.78, 0.18, 1) both;

  @keyframes rollOut {
    0% {
      left: 43%;
      top: 43%;
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.68) rotate(0deg);
    }

    7% {
      opacity: 1;
    }

    16% {
      left: 38%;
      top: 34%;
      transform: translate(-50%, -50%) scale(0.82) rotate(160deg);
    }

    32% {
      left: 50%;
      top: 48%;
      transform: translate(-50%, -50%) scale(0.96) rotate(390deg);
    }

    48% {
      left: 41%;
      top: 60%;
      transform: translate(-50%, -50%) scale(1.02) rotate(620deg);
    }

    60% {
      left: 48%;
      top: 70%;
      transform: translate(-50%, -50%) scale(1) rotate(780deg);
    }

    75% {
      left: 63%;
      top: 77%;
      transform: translate(-50%, -50%) scale(1) rotate(1020deg);
    }

    90% {
      left: 78%;
      top: 79%;
      opacity: 1;
      transform: translate(-50%, -50%) scale(0.98) rotate(1260deg);
    }

    100% {
      left: 86%;
      top: 79%;
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.78) rotate(1420deg);
    }
  }

  @media (max-width: 760px) {
    width: ${(props) => (props.$bonus ? '48px' : '46px')};
    height: ${(props) => (props.$bonus ? '48px' : '46px')};
    font-size: 0.94rem;
  }

  @media (prefers-reduced-motion: reduce) {
    animation-duration: 1ms;
  }
`;

const DrawResultPanel = styled.div`
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(160px, 210px);
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--social-border);
  border-radius: 8px;
  background: var(--social-panel);

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const DrawnBallRail = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
`;

const DrawnBallSlot = styled.div<{ $filled: boolean; $tone: string; $bonus?: boolean }>`
  flex: 0 0 auto;
  width: ${(props) => (props.$bonus ? '54px' : '50px')};
  height: ${(props) => (props.$bonus ? '54px' : '50px')};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 2px solid ${(props) => (props.$filled ? 'rgba(255, 255, 255, 0.62)' : 'rgba(218, 255, 242, 0.14)')};
  border-radius: 50%;
  color: ${(props) => (props.$filled ? '#06110f' : 'rgba(218, 255, 242, 0.35)')};
  background: ${(props) =>
    props.$filled
      ? `linear-gradient(145deg, rgba(255, 255, 255, 0.82), transparent 42%), ${props.$tone}`
      : 'rgba(255, 255, 255, 0.035)'};
  font-size: 0.94rem;
  font-weight: 950;
  box-shadow: ${(props) => (props.$filled ? '0 10px 22px rgba(0, 0, 0, 0.24)' : 'none')};
`;

const PlusMark = styled.span`
  flex: 0 0 auto;
  color: var(--social-amber);
  font-size: 1.2rem;
  font-weight: 950;
`;

const DrawSummary = styled.div`
  min-height: 86px;
  display: grid;
  align-content: center;
  justify-items: end;
  gap: 6px;
  padding: 12px;
  border: 1px solid rgba(218, 255, 242, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);

  span {
    color: var(--social-faint);
    font-size: 0.76rem;
    font-weight: 950;
  }

  strong {
    color: #ffffff;
    font-size: 1.55rem;
    line-height: 1;
    font-weight: 950;
    letter-spacing: 0;
  }

  @media (max-width: 760px) {
    justify-items: start;
  }
`;

const DrawSequenceList = styled.div`
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
`;

const DrawSequenceItem = styled.span<{ $complete: boolean; $active: boolean }>`
  min-width: 0;
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid
    ${(props) =>
      props.$complete
        ? 'rgba(94, 234, 212, 0.5)'
        : props.$active
          ? 'rgba(245, 199, 102, 0.58)'
          : 'rgba(218, 255, 242, 0.12)'};
  border-radius: 8px;
  color: ${(props) => (props.$complete ? '#06110f' : props.$active ? '#ffe6a3' : 'var(--social-faint)')};
  background: ${(props) =>
    props.$complete
      ? 'linear-gradient(135deg, #5eead4, #f5c766)'
      : props.$active
        ? 'rgba(245, 199, 102, 0.12)'
        : 'rgba(255, 255, 255, 0.035)'};
  font-size: 0.78rem;
  font-weight: 950;
  transition: border-color 180ms ease, background 180ms ease, color 180ms ease;
`;

const PayoutGuide = styled.div`
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 7px;
  padding: 10px;
  border: 1px solid var(--social-border);
  border-radius: 8px;
  background: var(--social-panel);

  @media (max-width: 560px) {
    grid-template-columns: repeat(5, minmax(74px, 1fr));
    overflow-x: auto;
  }
`;

const PayoutChip = styled.div<{ $accent: string }>`
  min-width: 0;
  min-height: 74px;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 4px;
  padding: 9px 6px;
  border: 1px solid ${(props) => `${props.$accent}55`};
  border-radius: 8px;
  color: ${(props) => props.$accent};
  background:
    linear-gradient(145deg, ${(props) => `${props.$accent}24`}, transparent 62%),
    rgba(255, 255, 255, 0.035);

  strong {
    color: ${(props) => props.$accent};
    font-size: 0.78rem;
    font-weight: 950;
  }
`;

const ScratchNumberIcon = styled.span<{ $accent: string; $small?: boolean }>`
  width: ${(props) => (props.$small ? '46px' : '38px')};
  height: ${(props) => (props.$small ? '46px' : '38px')};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 2px solid rgba(255, 255, 255, 0.62);
  border-radius: 999px;
  color: #06110f;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.84), transparent 42%),
    ${(props) => props.$accent};
  font-size: ${(props) => (props.$small ? '0.95rem' : '0.8rem')};
  font-weight: 950;
  letter-spacing: 0;
  box-shadow:
    inset 0 -6px 10px rgba(0, 0, 0, 0.12),
    0 10px 22px rgba(0, 0, 0, 0.22);
`;

const ScratchTicketPanel = styled.div<{ $active: boolean }>`
  min-width: 0;
  display: grid;
  gap: 14px;
  padding: 18px;
  border: 1px solid ${(props) => (props.$active ? 'rgba(245, 199, 102, 0.32)' : 'var(--social-border)')};
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(245, 199, 102, ${(props) => (props.$active ? '0.14' : '0.07')}), transparent 50%),
    var(--social-panel);
`;

const ScratchHeader = styled.div`
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(100px, 160px);
  gap: 12px;
  align-items: center;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const ScratchCode = styled.div`
  min-width: 0;
  display: grid;
  gap: 4px;

  span {
    color: var(--social-faint);
    font-size: 0.72rem;
    font-weight: 950;
  }

  strong {
    color: #ffffff;
    font-size: 1rem;
    font-weight: 950;
    letter-spacing: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const ScratchProgress = styled.div`
  height: 10px;
  border: 1px solid rgba(218, 255, 242, 0.12);
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.05);

  span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--social-mint), var(--social-amber), var(--social-rose));
    transition: width 220ms ease;
  }
`;

const ScratchTicketBody = styled.div`
  display: grid;
  gap: 12px;
`;

const WinningNumberStrip = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border: 1px solid rgba(245, 199, 102, 0.22);
  border-radius: 8px;
  background:
    linear-gradient(90deg, rgba(245, 199, 102, 0.14), rgba(94, 234, 212, 0.08)),
    rgba(255, 255, 255, 0.04);

  > span {
    color: #ffe6a3;
    font-size: 0.82rem;
    font-weight: 950;
    white-space: nowrap;
  }

  > div {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }

  @media (max-width: 520px) {
    align-items: flex-start;
    flex-direction: column;
  }
`;

const WinningNumberBall = styled.span<{ $tone: string }>`
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 2px solid rgba(255, 255, 255, 0.62);
  border-radius: 999px;
  color: #06110f;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.84), transparent 42%),
    ${(props) => props.$tone};
  font-size: 0.82rem;
  font-weight: 950;
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.22);
`;

const ScratchPlayArea = styled.div`
  min-width: 0;
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(218, 255, 242, 0.14);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.07), transparent 42%),
    rgba(4, 13, 12, 0.72);
`;

const ScratchGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding: 10px;
`;

const ScratchTileCard = styled.div<{ $accent: string; $matched: boolean }>`
  min-width: 0;
  min-height: 124px;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 8px;
  padding: 10px;
  border: 1px solid ${(props) => (props.$matched ? props.$accent : 'rgba(218, 255, 242, 0.16)')};
  border-radius: 8px;
  background:
    linear-gradient(145deg, ${(props) => `${props.$accent}${props.$matched ? '3a' : '22'}`}, transparent 62%),
    rgba(8, 21, 19, 0.92);
  box-shadow: ${(props) => (props.$matched ? `0 0 0 1px ${props.$accent}22, 0 14px 30px ${props.$accent}18` : 'none')};

  @media (max-width: 520px) {
    min-height: 106px;
    padding: 8px;
  }
`;

const TileNumber = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;

  span {
    color: var(--social-faint);
    font-size: 0.62rem;
    font-weight: 950;
  }

  strong {
    color: #ffffff;
    font-size: 1.15rem;
    line-height: 1;
    font-weight: 950;
    letter-spacing: 0;
  }
`;

const TilePicture = styled.div`
  min-height: 48px;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 0;
`;

const TilePrize = styled.div`
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(245, 199, 102, 0.25);
  border-radius: 8px;
  color: #ffe6a3;
  background: rgba(245, 199, 102, 0.09);
  font-size: 0.78rem;
  font-weight: 950;
`;

const ScratchCanvas = styled.canvas`
  position: absolute;
  inset: 0;
  z-index: 3;
  width: 100%;
  height: 100%;
  cursor: grab;
  touch-action: none;

  &:active {
    cursor: grabbing;
  }
`;

const ScratchEmptyState = styled.div`
  min-height: 290px;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 10px;
  padding: 24px;
  border: 1px dashed rgba(218, 255, 242, 0.18);
  border-radius: 8px;
  color: var(--social-amber);
  background:
    linear-gradient(115deg, transparent 0 32%, rgba(255, 255, 255, 0.09) 42%, transparent 52%),
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0 1px, transparent 1px 10px),
    rgba(255, 255, 255, 0.035);

  strong {
    max-width: 290px;
    color: #ffffff;
    font-size: 1rem;
    line-height: 1.45;
    font-weight: 950;
    text-align: center;
    word-break: keep-all;
  }

  span {
    max-width: 310px;
    color: var(--social-muted);
    font-size: 0.82rem;
    line-height: 1.55;
    font-weight: 750;
    text-align: center;
    word-break: keep-all;
  }
`;

const ScratchOutcome = styled.div<{ $win: boolean }>`
  min-height: 86px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px;
  border: 1px solid ${(props) => (props.$win ? 'rgba(245, 199, 102, 0.38)' : 'rgba(218, 255, 242, 0.13)')};
  border-radius: 8px;
  background: ${(props) => (props.$win ? 'rgba(245, 199, 102, 0.1)' : 'rgba(255, 255, 255, 0.04)')};

  span {
    color: var(--social-faint);
    font-size: 0.78rem;
    font-weight: 950;
  }

  strong {
    color: ${(props) => (props.$win ? '#ffe6a3' : '#ffffff')};
    font-size: 1.34rem;
    line-height: 1.15;
    font-weight: 950;
    letter-spacing: 0;
    text-align: right;
    word-break: keep-all;
  }

  @media (max-width: 520px) {
    align-items: flex-start;
    flex-direction: column;

    strong {
      text-align: left;
    }
  }
`;

const ActivityBand = styled.section<{ $selected?: boolean }>`
  width: min(1280px, 100%);
  margin: 16px auto 0;
  position: relative;
  display: grid;
  grid-template-columns: minmax(200px, 280px) minmax(0, 1fr);
  gap: 16px;
  padding: 18px;
  border: 1px solid var(--social-border);
  border-radius: 8px;
  background: var(--social-panel);
  outline: ${(props) => (props.$selected ? '3px solid rgba(94, 234, 212, 0.52)' : '0 solid transparent')};
  outline-offset: 4px;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`;

const ActivityHeader = styled.div`
  min-width: 0;

  h2 {
    margin: 10px 0 0;
    color: #ffffff;
    font-size: 1.4rem;
    font-weight: 950;
    letter-spacing: 0;
  }

  p {
    margin: 10px 0 0;
    color: var(--social-muted);
    font-size: 0.88rem;
    font-weight: 700;
    line-height: 1.58;
    word-break: keep-all;
  }
`;

const ActivityList = styled.div`
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 700px) {
    grid-template-columns: 1fr;
  }
`;

const ActivityItem = styled.article`
  min-width: 0;
  min-height: 76px;
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px solid rgba(218, 255, 242, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.045);

  @media (max-width: 480px) {
    grid-template-columns: 40px minmax(0, 1fr);
  }
`;

const ActivityIcon = styled.div`
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(94, 234, 212, 0.28);
  border-radius: 8px;
  color: var(--social-mint);
  background: rgba(45, 212, 191, 0.1);
`;

const ActivityCopy = styled.div`
  min-width: 0;
  display: grid;
  gap: 4px;

  strong,
  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    color: #ffffff;
    font-size: 0.92rem;
    font-weight: 950;
    letter-spacing: 0;
  }

  span {
    color: var(--social-faint);
    font-size: 0.76rem;
    font-weight: 850;
  }
`;

const ActivityPoints = styled.strong`
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  border: 1px solid rgba(245, 199, 102, 0.32);
  border-radius: 8px;
  color: #ffe6a3;
  background: rgba(245, 199, 102, 0.1);
  font-size: 0.82rem;
  font-weight: 950;
  white-space: nowrap;

  @media (max-width: 480px) {
    grid-column: 1 / -1;
    justify-content: flex-start;
  }
`;

const MissionRail = styled.div<{ $selected?: boolean }>`
  grid-column: 1 / -1;
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  outline: ${(props) => (props.$selected ? '3px solid rgba(245, 199, 102, 0.52)' : '0 solid transparent')};
  outline-offset: 4px;
  border-radius: 8px;

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
  }
`;

const MissionHeader = styled.header`
  grid-column: 1 / -1;
  min-width: 0;
  padding: 14px;
  border: 1px solid rgba(218, 255, 242, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);

  h2 {
    margin: 10px 0 0;
    color: #ffffff;
    font-size: 1.28rem;
    font-weight: 950;
    line-height: 1.2;
    word-break: keep-all;
  }
`;

const MissionCard = styled.article<{ $accent: string; $complete: boolean }>`
  min-width: 0;
  min-height: 104px;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  padding: 14px;
  border: 1px solid ${(props) => (props.$complete ? props.$accent : 'rgba(218, 255, 242, 0.12)')};
  border-radius: 8px;
  background:
    linear-gradient(145deg, ${(props) => `${props.$accent}${props.$complete ? '2e' : '18'}`}, transparent 62%),
    rgba(255, 255, 255, 0.042);

  span {
    display: block;
    color: var(--social-faint);
    font-size: 0.74rem;
    font-weight: 950;
  }

  strong {
    display: block;
    margin-top: 5px;
    color: #ffffff;
    font-size: 0.98rem;
    line-height: 1.25;
    font-weight: 950;
    word-break: keep-all;
  }
`;

const MissionIcon = styled.div<{ $accent: string }>`
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid ${(props) => `${props.$accent}55`};
  border-radius: 8px;
  color: ${(props) => props.$accent};
  background: ${(props) => `${props.$accent}18`};
`;

const MissionProgress = styled.div`
  grid-column: 1 / -1;
  height: 7px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.07);

  span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #5eead4, #f5c766);
    transition: width 260ms ease;
  }
`;

const CelebrationToast = styled.div`
  position: fixed;
  left: 50%;
  bottom: 28px;
  z-index: 2200;
  min-width: min(360px, calc(100vw - 32px));
  min-height: 68px;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid rgba(245, 199, 102, 0.42);
  border-radius: 8px;
  color: #fff7d6;
  background:
    linear-gradient(135deg, rgba(94, 234, 212, 0.22), rgba(245, 199, 102, 0.18), rgba(251, 113, 133, 0.12)),
    rgba(6, 17, 15, 0.96);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.46);
  transform: translateX(-50%);
  animation: toastRise 2.3s cubic-bezier(0.2, 0.72, 0.16, 1) both;

  svg {
    color: #f5c766;
  }

  span {
    min-width: 0;
    color: #ffffff;
    font-size: 0.92rem;
    font-weight: 950;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    color: #5eead4;
    font-size: 1.2rem;
    font-weight: 950;
    letter-spacing: 0;
    white-space: nowrap;
  }

  @keyframes toastRise {
    0% {
      opacity: 0;
      transform: translate(-50%, 18px) scale(0.96);
    }

    12%,
    82% {
      opacity: 1;
      transform: translate(-50%, 0) scale(1);
    }

    100% {
      opacity: 0;
      transform: translate(-50%, -8px) scale(0.98);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const CelebrationSpark = styled.i<{ $x: number; $y: number; $delay: number }>`
  position: absolute;
  left: 50%;
  top: 50%;
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #f5c766;
  box-shadow: 0 0 12px rgba(245, 199, 102, 0.82);
  transform: translate(-50%, -50%);
  animation: sparkBurst 780ms ease-out both;
  animation-delay: ${(props) => props.$delay}s;

  @keyframes sparkBurst {
    0% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.2);
    }

    28% {
      opacity: 1;
    }

    100% {
      opacity: 0;
      transform: translate(calc(-50% + ${(props) => props.$x}px), calc(-50% + ${(props) => props.$y}px)) scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    display: none;
  }
`;
