import { useMemo } from 'react';

export interface HabitRecordMetricPoint {
  value?: number;
  progress: number;
  movingAverage?: number;
}

export interface HabitRecordPoint {
  dateKey: string;
  dateLabel: string;
  score: number;
  value?: number;
  touched: boolean;
  completed: boolean;
  metricText: string;
  metrics: Record<string, HabitRecordMetricPoint>;
  movingAverage?: number;
}

export interface InsightCoachMessage {
  id: string;
  type: 'success' | 'warning' | 'info';
  title: string;
  content: string;
}

export interface HabitStatsInsightResult {
  bestDayLabel: string;
  bestDayScore: number;
  worstDayLabel: string;
  worstDayScore: number;
  trendStatus: 'improving' | 'stable' | 'struggling';
  trendLabel: string;
  trendColor: string;
  coachingMessages: InsightCoachMessage[];
  totalRecordsCount: number;
  touchedRecordsCount: number;
}

const WEEKDAY_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

export function useHabitStatsInsight(
  habitName: string,
  recordData: HabitRecordPoint[],
  streak: number
): HabitStatsInsightResult {
  return useMemo(() => {
    const defaultResult: HabitStatsInsightResult = {
      bestDayLabel: '데이터 없음',
      bestDayScore: 0,
      worstDayLabel: '데이터 없음',
      worstDayScore: 0,
      trendStatus: 'stable',
      trendLabel: '유지세',
      trendColor: '#f8c64e',
      coachingMessages: [
        {
          id: 'msg-welcome',
          type: 'info',
          title: '스마트 분석 시작',
          content: '기록이 누적되면 요일별 실천 패턴과 흐름 분석 보고서가 이곳에 실시간 업데이트됩니다.',
        },
      ],
      totalRecordsCount: recordData.length,
      touchedRecordsCount: recordData.filter((r) => r.touched).length,
    };

    if (recordData.length === 0) return defaultResult;

    // 1. 실제로 입력된 기록 필터링
    const activeRecords = recordData.filter((r) => r.touched);
    const touchedCount = activeRecords.length;

    if (touchedCount === 0) {
      return defaultResult;
    }

    // 2. 요일별 집계
    const dayStats = Array.from({ length: 7 }, () => ({ sum: 0, count: 0 }));
    activeRecords.forEach((record) => {
      // parse YYYY-MM-DD
      const date = new Date(`${record.dateKey}T00:00:00`);
      if (!Number.isNaN(date.getTime())) {
        const dayOfWeek = date.getDay();
        dayStats[dayOfWeek].sum += record.score;
        dayStats[dayOfWeek].count += 1;
      }
    });

    const dayAverages = dayStats.map((stat, index) => ({
      dayIndex: index,
      label: WEEKDAY_NAMES[index],
      average: stat.count > 0 ? Math.round(stat.sum / stat.count) : null,
    }));

    const validAverages = dayAverages.filter((item): item is { dayIndex: number; label: string; average: number } => item.average !== null);

    let bestDay = validAverages[0];
    let worstDay = validAverages[0];

    validAverages.forEach((item) => {
      if (bestDay === undefined || item.average > bestDay.average) {
        bestDay = item;
      }
      if (worstDay === undefined || item.average < worstDay.average) {
        worstDay = item;
      }
    });

    // 3. 트렌드 기조 판단 (최근 3일 vs 이전 4일)
    // 기록이 Touch된 순서대로 정렬하여 분석
    const sortedTouchedRecords = [...activeRecords].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
    let trendStatus: 'improving' | 'stable' | 'struggling' = 'stable';
    let trendLabel = '유지세';
    let trendColor = '#f8c64e';

    if (sortedTouchedRecords.length >= 4) {
      const recentCount = Math.min(3, Math.floor(sortedTouchedRecords.length / 2));
      const previousCount = sortedTouchedRecords.length - recentCount;

      const recentRecords = sortedTouchedRecords.slice(-recentCount);
      const previousRecords = sortedTouchedRecords.slice(0, previousCount);

      const recentAvg = recentRecords.reduce((sum, r) => sum + r.score, 0) / recentCount;
      const previousAvg = previousRecords.reduce((sum, r) => sum + r.score, 0) / previousCount;

      const diff = recentAvg - previousAvg;
      if (diff >= 10) {
        trendStatus = 'improving';
        trendLabel = '상승세';
        trendColor = '#42d392';
      } else if (diff <= -10) {
        trendStatus = 'struggling';
        trendLabel = '정체기';
        trendColor = '#ff7a59';
      }
    }

    // 4. 지능형 코칭 메시지 리스트
    const coachingMessages: InsightCoachMessage[] = [];

    // Streak 메시지
    if (streak >= 3) {
      coachingMessages.push({
        id: 'msg-streak',
        type: 'success',
        title: `🔥 대단한 실천력! ${streak}일 연속 질주 중`,
        content: `현재 '${habitName}' 습관을 ${streak}일 동안 쉬지 않고 달성하고 있습니다. 습관이 뇌에 완전히 각인되기 직전입니다! 오늘 실천도 완수하여 흐름을 유지하세요.`,
      });
    } else if (streak > 0) {
      coachingMessages.push({
        id: 'msg-streak-start',
        type: 'success',
        title: `🌱 좋은 시작! ${streak}일 연속 행동`,
        content: `습관 형성을 위한 멋진 첫 단계를 밟았습니다! 연속 기록을 유지하며 더 강력한 가속도를 느껴보세요.`,
      });
    }

    // 요일 패턴 메시지
    if (bestDay && worstDay && validAverages.length >= 2) {
      if (bestDay.dayIndex !== worstDay.dayIndex && bestDay.average > worstDay.average) {
        coachingMessages.push({
          id: 'msg-best-day',
          type: 'success',
          title: `📅 요일 시너지 발견: ${bestDay.label}`,
          content: `데이터 분석 결과, 주로 '${bestDay.label}'에 가장 높은 실천 스코어(${bestDay.average}%)를 보였습니다! 이 날의 기분 좋은 기조와 환경적 성공 요인을 분석해서 다른 요일에도 적용해 보세요.`,
        });

        coachingMessages.push({
          id: 'msg-worst-day',
          type: 'warning',
          title: `⚠️ 요일 슬럼프 주의: ${worstDay.label}`,
          content: `상대적으로 '${worstDay.label}'에 가장 저조한 평균 달성률(${worstDay.average}%)을 기록했습니다. 이 날은 바쁘거나 피곤할 가능성이 큽니다! 이 날만큼은 목표치를 절반으로 낮추거나 아침에 먼저 가볍게 수행해 보길 강력 권장합니다.`,
        });
      }
    }

    // 트렌드 상태별 피드백 메시지
    if (trendStatus === 'improving') {
      coachingMessages.push({
        id: 'msg-trend-improving',
        type: 'success',
        title: '📈 실천 흐름 상승 곡선!',
        content: `최근의 실행률이 이전 대비 눈에 띄게 좋아졌습니다! 모멘텀이 붙었을 때 몰아치는 것이 최고의 습관 공략법입니다. 페이스를 유지하며 한 걸음 더 나아가세요.`,
      });
    } else if (trendStatus === 'struggling') {
      coachingMessages.push({
        id: 'msg-trend-struggling',
        type: 'warning',
        title: '📉 집중 보강이 필요한 정체기',
        content: `최근 실천 에너지가 다소 침체되고 정체된 국면입니다. 자책할 필요 전혀 없이, 단 1분이라도 가볍게 기록하는 '초미니 목표'로 뇌의 거부감을 줄여 행동을 재개해보세요.`,
      });
    } else if (touchedCount >= 5) {
      coachingMessages.push({
        id: 'msg-trend-stable',
        type: 'info',
        title: '⚖️ 견고한 평형 상태 유지',
        content: `꾸준하게 안정된 템포를 지켜내고 계십니다. 일상에 습관이 매우 단단하고 고르게 녹아들었음을 의미합니다! 훌륭한 균형 감각입니다.`,
      });
    }

    // 백업 웰컴 코멘트
    if (coachingMessages.length === 0) {
      coachingMessages.push({
        id: 'msg-generic',
        type: 'info',
        title: '💡 꾸준함의 미학',
        content: `지금처럼 정성스레 매일 기록을 남겨보세요. 더 많은 기록이 쌓일수록 나의 행동 성향을 꿰뚫는 강력한 맞춤 처방 분석 결과가 해금됩니다.`,
      });
    }

    return {
      bestDayLabel: bestDay ? bestDay.label : '데이터 부족',
      bestDayScore: bestDay ? bestDay.average : 0,
      worstDayLabel: worstDay ? worstDay.label : '데이터 부족',
      worstDayScore: worstDay ? worstDay.average : 0,
      trendStatus,
      trendLabel,
      trendColor,
      coachingMessages: coachingMessages.slice(0, 3), // 최대 3개 노출로 제한
      totalRecordsCount: recordData.length,
      touchedRecordsCount: touchedCount,
    };
  }, [habitName, recordData, streak]);
}
