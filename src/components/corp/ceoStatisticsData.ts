export type CeoMetricId = 'skill' | 'weight' | 'time' | 'capital';
export type CeoScenarioId = 'start' | 'build' | 'focus' | 'overtime' | 'finish';

export const CEO_METRICS = [
  { id: 'skill', label: '기술력', english: 'SKILL LEVEL', color: '#77dfb4', ink: '#176044', unit: 'Lv.', caption: '10에서 99까지, 경험이 실력으로.' },
  { id: 'weight', label: '체중', english: 'BODY WEIGHT', color: '#ffb480', ink: '#944b21', unit: 'kg', caption: '100kg에서 150kg까지 우상향.' },
  { id: 'time', label: '작업시간', english: 'WORK HOURS', color: '#a8c8ff', ink: '#355faa', unit: 'h', caption: '12 · 16 · 20 · 40 · 48시간 누적.' },
  { id: 'capital', label: '잔고', english: 'CASH FLOW', color: '#e8c1fa', ink: '#825399', unit: '만원', caption: '1,000만원에서 −100만원까지.' },
] as const;

export interface CeoStatisticsScenario {
  id: CeoScenarioId;
  label: string;
  shortLabel: string;
  headline: string;
  description: string;
  quote: string;
  character: number;
  values: Record<CeoMetricId, number>;
  trend: Record<CeoMetricId, number[]>;
  skills: { label: string; value: number }[];
  cash: { label: string; value: number }[];
  insights: Record<CeoMetricId, { title: string; body: string; tag: string }>;
}

const stages = [
  { id: 'start', hours: 12, skill: 10, weight: 100, capital: 1000, expenses: [0, 0, 0, 0], headline: '시작은 가볍게. 잔고는 든든하게.', quote: '기술력 10, 잔고 1,000.\n일단 시작해 볼까요?', character: 1 },
  { id: 'build', hours: 16, skill: 30, weight: 112, capital: 760, expenses: [200, 20, 15, 5], headline: '기술도 식욕도 예열 완료.', quote: '실력은 쌓이고,\n영수증도 쌓이고.', character: 1 },
  { id: 'focus', hours: 20, skill: 55, weight: 125, capital: 480, expenses: [460, 30, 20, 10], headline: '경험치는 절반, 잔고도 절반.', quote: '배운 건 늘었는데,\n통장은 왜 가벼울까요?', character: 1 },
  { id: 'overtime', hours: 40, skill: 80, weight: 138, capital: 170, expenses: [750, 40, 25, 15], headline: '누적 40시간. 그래프의 방향이 갈립니다.', quote: '위로 가는 세 줄.\n아래로 가는 통장 한 줄.', character: 0 },
  { id: 'finish', hours: 48, skill: 99, weight: 150, capital: -100, expenses: [1000, 50, 30, 20], headline: '기술력 99. 체중 150. 잔고는 −100.', quote: '레벨업은 했습니다.\n잔고도 내려갔습니다.', character: 0 },
] as const;

export const CEO_TREND_LABELS = stages.map(stage => `${stage.hours}h`);
const trend: Record<CeoMetricId, number[]> = {
  skill: stages.map(stage => stage.skill),
  weight: stages.map(stage => stage.weight),
  time: stages.map(stage => stage.hours),
  capital: stages.map(stage => stage.capital),
};
const expenseLabels = ['식대', 'AI 토큰', '구독', '장비'];

export const CEO_SCENARIOS: CeoStatisticsScenario[] = stages.map(stage => {
  const spending = stage.expenses.reduce((sum: number, value) => sum + value, 0);
  const foodShare = spending ? Math.round(stage.expenses[0] / spending * 100) : 0;
  return {
    id: stage.id,
    label: `${stage.hours}시간`,
    shortLabel: `누적 ${stage.hours}h`,
    headline: stage.headline,
    description: `기술력 ${stage.skill} · 체중 ${stage.weight}kg · 누적 작업 ${stage.hours}h · 잔고 ${stage.capital.toLocaleString('ko-KR')}만원`,
    quote: stage.quote,
    character: stage.character,
    values: { skill: stage.skill, weight: stage.weight, time: stage.hours, capital: stage.capital },
    trend,
    skills: ['개발', '디자인', '자동화', '기획', '해결력'].map((label, index) => ({ label, value: stage.skill === 99 ? 99 : stage.skill + [3, -3, 2, -1, -1][index] })),
    cash: [{ label: '시작', value: 1000 }, ...expenseLabels.map((label, index) => ({ label, value: -stage.expenses[index] }))],
    insights: {
      skill: { title: '기술력은 10에서 99까지.', body: '작업 경험이 쌓일수록 초록색 곡선이 올라갑니다. 레이더의 다섯 가지 기술도 함께 넓어집니다.', tag: `현재 ${stage.skill} Lv. / 최대 99 Lv.` },
      weight: { title: '체중은 100kg에서 150kg까지.', body: '주황색 곡선과 체중계가 함께 올라갑니다. 줄어드는 잔고와 반대 방향으로 움직이는 캐릭터 설정입니다.', tag: `현재 ${stage.weight}kg / 최종 150kg` },
      time: { title: '12, 16, 20, 40, 48시간의 기록.', body: '시간은 여러 작업 구간을 합한 누적 시간입니다. 단계별 표에서 기술력·체중·잔고를 함께 비교할 수 있습니다.', tag: `누적 작업 ${stage.hours}h / 최종 48h` },
      capital: { title: spending ? '지출의 주인공은 식대입니다.' : '아직은 든든한 시작 자본.', body: spending ? `총지출 ${spending.toLocaleString('ko-KR')}만원 중 식대가 ${foodShare}%입니다. AI 토큰·구독·장비 비용은 작은 비중으로 표시합니다.` : '1,000만원에서 출발합니다. 재생하면 비용이 쌓이며 잔고가 내려가고, 마지막에는 −100만원에 도착합니다.', tag: `시작 1,000 − 지출 ${spending.toLocaleString('ko-KR')} = ${stage.capital.toLocaleString('ko-KR')}만원` },
    },
  };
});

