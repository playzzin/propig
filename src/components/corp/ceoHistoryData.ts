export type CeoHistoryIcon =
  | 'birth'
  | 'family'
  | 'school'
  | 'delivery'
  | 'train'
  | 'construction'
  | 'team'
  | 'code'
  | 'future';

export type CeoHistoryChapter = {
  id: string;
  startYear: number;
  endYear?: number;
  phase: string;
  title: string;
  body: string;
  quote: string;
  details: readonly string[];
  icon: CeoHistoryIcon;
  accent: string;
  accent2: string;
  planned?: boolean;
};

export const CEO_HISTORY_BIRTH_YEAR = 1983;
export const CEO_HISTORY_TITLE = '그뚠이 연혁';
export const CEO_HISTORY_DESCRIPTION =
  '종갓집 종손으로 태어나, 현장을 거쳐 키보드 앞에 앉기까지. 어설픈 선택, 무너진 날들, 다시 일하던 시간을 아홉 장면으로 담았습니다.';
export const CEO_HISTORY_NOTE =
  '연도는 세는나이로 나눈 시기이며, 개별 사건의 정확한 발생 연도와는 다를 수 있습니다. 2027년은 앞으로의 계획입니다.';

export const CEO_HISTORY_CHAPTERS: readonly CeoHistoryChapter[] = [
  {
    id: 'birth',
    startYear: 1983,
    endYear: 1991,
    phase: '탄생 · 유년기',
    title: '사랑을 한 몸에 받은 종갓집 종손',
    body: '경주 최씨 충렬공파 종갓집의 종손으로 태어났다. 온 집안의 사랑과 관심 속에서 시작한 인생. 아직 할 줄 아는 건 많지 않았지만, 집안 어른들의 시선 속에서 존재감만큼은 처음부터 작지 않았다.',
    quote: '태어나자마자 받은 첫 직함은 종손, 첫 복지는 온 집안의 사랑이었다.',
    details: ['경주 최씨 충렬공파', '종갓집 종손', '사랑과 관심 속의 시작'],
    icon: 'birth',
    accent: '#fb923c',
    accent2: '#fcd34d',
  },
  {
    id: 'teens-early',
    startYear: 1992,
    endYear: 1996,
    phase: '10대 초반',
    title: '집의 풍경이 바뀌고, 길을 잃다',
    body: '부모님의 이혼 뒤, 익숙했던 생활이 달라졌다. 사랑과 관심 속에서 자라던 아이에게 10대는 마음 둘 곳과 자신의 자리를 다시 찾아야 했던 시기였다. 이후 전학과 복학으로 이어질, 길고 복잡한 학교생활의 첫 장이 열렸다.',
    quote: '인생 시간표가 바뀌었는데, 새 시간표는 나만 못 받은 기분이었다.',
    details: ['부모님의 이혼', '달라진 가족의 일상', '흔들리기 시작한 학교생활'],
    icon: 'family',
    accent: '#22d3ee',
    accent2: '#67e8f9',
  },
  {
    id: 'teens-late',
    startYear: 1997,
    endYear: 2001,
    phase: '10대 후반',
    title: '학교는 다섯 번, 인생은 방향 탐색',
    body: '중학교만 다섯 번 전학했고, 복학도 했다. 10대 전체를 돌아보면 학교 이름보다 적응해야 할 낯선 교실이 더 오래 남는다. 결국 고교 진학을 포기하고 불량한 친구들과 어울리며, 갈 곳보다 돌아갈 길을 더 많이 만들었다.',
    quote: '전학은 여러 번 했는데, 정작 내 인생의 진로는 계속 미정이었다.',
    details: ['중학교 전학 다섯 번 · 복학', '고교 진학 포기', '친구들과 보낸 방황의 시간'],
    icon: 'school',
    accent: '#60a5fa',
    accent2: '#93c5fd',
  },
  {
    id: 'twenties-early',
    startYear: 2002,
    endYear: 2006,
    phase: '20대 초반',
    title: '배달부터 장사까지, 방향은 과속 중',
    body: '배달 일을 하다가 불법 사행성 게임장과 휴대폰 내구제 판매에도 발을 들였다. 이것저것 많이 했다는 말로 가볍게 넘길 수 없는 시절이다. 삶을 꾸려가는 일과 위험한 선택이 뒤섞였고, 바쁘게 움직인 만큼 방향을 살피지는 못했다.',
    quote: '몸은 늘 바빴지만, 인생 내비게이션은 경로를 다시 찾는 중이었다.',
    details: ['배달 일', '불법 사행성 게임장', '휴대폰 내구제 판매'],
    icon: 'delivery',
    accent: '#fbbf24',
    accent2: '#fde68a',
  },
  {
    id: 'twenties-late',
    startYear: 2007,
    endYear: 2011,
    phase: '20대 후반',
    title: '지하철은 정시 운행, 나는 탈선',
    body: '20대 후반에는 지하철에서 공익근무를 했다. 열차는 정해진 선로를 따라 움직였지만, 나는 노름에 빠져 삶의 방향을 놓쳤다. 도박이 남긴 것은 무너진 생활이었다. 다시 바닥에서 시작해야 했던 시기다.',
    quote: '열차에는 다음 역 안내가 있었지만, 내 선택에는 경고음이 늦었다.',
    details: ['지하철 공익근무', '도박에 빠진 시간', '다시 시작해야 했던 생활'],
    icon: 'train',
    accent: '#fb7185',
    accent2: '#fda4af',
  },
  {
    id: 'thirties-early',
    startYear: 2012,
    endYear: 2016,
    phase: '30대 초반',
    title: '삽을 잡고, 하루를 다시 쌓다',
    body: '30대에는 건설 현장에서 몸으로 일하며 생활을 다시 이어갔다. 넘어졌다고 하루가 대신 흘러주지는 않았고, 결국 내가 움직여야 했다. 현장에서 보내는 시간이 쌓이며, 이후 사람과 일을 연결하는 인력사무실로 이어질 다음 장도 조금씩 열렸다.',
    quote: '인생을 한 번에 뒤집는 법 대신, 오늘 할 일을 하나씩 해내는 법을 배웠다.',
    details: ['건설 현장 일', '몸으로 익힌 현장의 흐름', '하루씩 다시 이어간 생활'],
    icon: 'construction',
    accent: '#2dd4bf',
    accent2: '#5eead4',
  },
  {
    id: 'thirties-late',
    startYear: 2017,
    endYear: 2021,
    phase: '30대 후반',
    title: '현장의 일꾼에서, 사람을 잇는 소장으로',
    body: '건설 현장의 경험은 인력사무실 운영으로 이어졌다. 안산과 수원에서 시스템동바리와 시스템비계 인력을 공급하며, 직접 일하던 자리에서 사람과 현장을 연결하는 자리로 옮겨갔다. 몸으로만 뛰던 이야기의 범위가 운영으로 넓어졌다.',
    quote: '내 몸 하나 출근시키던 사람이, 이제는 사람과 현장의 일정을 맞췄다.',
    details: ['안산 · 수원 인력사무실', '시스템동바리 인력공급', '시스템비계 인력공급'],
    icon: 'team',
    accent: '#4ade80',
    accent2: '#86efac',
  },
  {
    id: 'forties-early',
    startYear: 2022,
    endYear: 2026,
    phase: '40대 초반',
    title: '다시 바닥, 이번엔 키보드를 잡다',
    body: '40대가 되던 해, 노름으로 다시 삶이 무너졌다. 배달과 대리운전, 건설 현장 일을 오가며 생활을 이어가다 개발을 시작했다. 수없이 바뀐 직업 끝에 도착한 키보드 앞. 이제는 직접 만들고 고치며 다음 일을 이어가고 있다.',
    quote: '핸들 잡고, 삽 잡고, 이제 키보드까지… 손은 좀처럼 쉴 틈이 없다.',
    details: ['다시 겪은 도박의 대가', '배달 · 대리운전 · 건설 현장', '개발을 시작하다'],
    icon: 'code',
    accent: '#38bdf8',
    accent2: '#7dd3fc',
  },
  {
    id: 'next',
    startYear: 2027,
    phase: '45세 · 다음 장',
    title: '마흔다섯, 다음 장은 직접 만들어가기',
    body: '2027년, 세는나이 마흔다섯에 닿을 다음 장을 그려본다. 지난 이야기를 지울 수는 없지만, 앞으로 무엇을 만들지는 다시 선택하고 싶다. 개발을 이어가며 작게라도 직접 완성하는 경험을 쌓는 것. 이 장면은 아직 쓰고 있는 계획이다.',
    quote: '이번 업데이트의 목표는 인생 역전보다, 어제보다 나은 한 줄이다.',
    details: ['2027년 · 세는나이 45세', '개발을 이어갈 계획', '아직 쓰고 있는 다음 장'],
    icon: 'future',
    accent: '#f472b6',
    accent2: '#f9a8d4',
    planned: true,
  },
];
