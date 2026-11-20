export type CareerTrackId = 'product' | 'creative' | 'operations' | 'open';

export interface CareerTrack {
  id: CareerTrackId;
  eyebrow: string;
  label: string;
  title: string;
  summary: string;
  mission: string;
  accent: string;
  contributions: readonly string[];
  signals: readonly string[];
  notRequired: readonly string[];
}

export interface CareerProcessStep {
  step: string;
  title: string;
  description: string;
  candidatePromise: string;
}

export interface CareerFaq {
  question: string;
  answer: string;
}

export const CAREER_SUPPORT_EMAIL = 'support@propig.com';

export const CAREER_TRACKS: readonly CareerTrack[] = [
  {
    id: 'product',
    eyebrow: 'PRODUCT & ENGINEERING',
    label: '제품 만들기',
    title: '아이디어를 실제로 쓰이는 제품으로 바꾸는 일',
    summary: '기획, 디자인, 개발의 경계를 넘나들며 작은 문제를 끝까지 해결하는 분을 기다립니다.',
    mission: '사용자의 막힘을 발견하고, 가장 단순한 해결책을 빠르게 만들고, 실제 사용을 보며 다음 버전을 결정합니다.',
    accent: '#79d8bc',
    contributions: [
      '사용자 문제를 기능 목록이 아니라 해결해야 할 장면으로 정의합니다.',
      '작은 단위로 만들고 검증하며, 완성 기준과 위험을 문서로 남깁니다.',
      'AI가 만든 결과를 그대로 통과시키지 않고 사실·품질·안전을 사람이 검수합니다.',
      '기획·디자인·개발 사이의 빈틈을 발견하면 먼저 연결합니다.',
    ],
    signals: ['작게라도 직접 출시해 본 경험', '모르는 것을 빠르게 질문하는 태도', '결과와 과정 모두를 설명하는 기록 습관'],
    notRequired: ['화려한 학력이나 유명 회사 경력', '모든 기술을 이미 아는 완벽한 스펙', '야근과 즉답으로 증명하는 충성심'],
  },
  {
    id: 'creative',
    eyebrow: 'CREATIVE & CONTENT',
    label: '콘텐츠 만들기',
    title: '좋은 이야기를 끝까지 전달 가능한 결과물로 만드는 일',
    summary: '이미지, 영상, 글, 이모티콘처럼 사람에게 닿는 콘텐츠를 기획하고 다듬는 분을 기다립니다.',
    mission: '한 번 보고 지나가는 결과보다, 목적과 맥락이 분명하고 다시 사용할 수 있는 콘텐츠 제작 흐름을 만듭니다.',
    accent: '#8bbcff',
    contributions: [
      '브랜드와 사용 목적에 맞는 이야기·비주얼 방향을 제안합니다.',
      'AI 생성물을 초안으로 활용하되 표현·권리·품질을 직접 검수합니다.',
      '피드백을 취향 대결이 아니라 다음 버전의 기준으로 정리합니다.',
      '결과물뿐 아니라 반복 가능한 템플릿과 제작 과정을 함께 남깁니다.',
    ],
    signals: ['작업의 의도를 말로 설명하는 능력', '피드백을 반영해 결과를 개선한 경험', '저작권·초상권·출처를 존중하는 태도'],
    notRequired: ['특정 툴 하나의 완벽한 숙련도', '유행하는 스타일만 모은 포트폴리오', '모든 결과를 혼자 만드는 방식'],
  },
  {
    id: 'operations',
    eyebrow: 'OPERATIONS & GROWTH',
    label: '운영 연결하기',
    title: '흩어진 일과 사람을 지속 가능한 흐름으로 연결하는 일',
    summary: '고객의 목소리, 프로젝트의 진행, 반복 업무를 정리해 팀이 더 중요한 판단에 집중하도록 돕습니다.',
    mission: '누군가의 기억과 희생에 기대던 일을 명확한 기준, 자동화, 기록으로 바꾸고 고객이 결과를 얻는 순간까지 연결합니다.',
    accent: '#f1c977',
    contributions: [
      '문의와 피드백을 모아 반복되는 고객 문제를 제품 개선으로 연결합니다.',
      '일정·책임·완료 기준을 명확히 하고 위험을 늦기 전에 공유합니다.',
      '반복 업무를 자동화하되 예외 상황에서 사람이 판단할 지점을 남깁니다.',
      '숫자만 보고 결론내리지 않고 실제 사용 맥락과 함께 해석합니다.',
    ],
    signals: ['복잡한 일을 체크리스트로 정리한 경험', '고객과 내부 팀 사이를 조율한 경험', '작은 자동화로 반복 작업을 줄인 경험'],
    notRequired: ['항상 외향적이어야 한다는 조건', '모든 요청을 혼자 해결하는 습관', '실수를 감추는 완벽주의'],
  },
  {
    id: 'open',
    eyebrow: 'OPEN PROPOSAL',
    label: '새 역할 제안',
    title: '아직 이름 붙지 않은 역할을 함께 정의하는 일',
    summary: '현재 분류에 꼭 맞지 않아도 Propig과 함께 풀고 싶은 문제가 분명하다면 먼저 제안해 주세요.',
    mission: '멋진 직함보다 왜 필요한지, 어떤 작은 결과부터 만들 수 있는지, 서로 무엇을 확인해야 하는지를 함께 정의합니다.',
    accent: '#c8a5ff',
    contributions: [
      '해결하고 싶은 문제와 그 문제가 중요한 이유를 구체적으로 설명합니다.',
      '작게 검증할 첫 미션과 완료 기준을 제안합니다.',
      '필요한 시간·도구·비용·협업 상대를 숨기지 않고 함께 계산합니다.',
      '잘 맞지 않을 때도 배운 점과 결과물 권리를 명확히 정리합니다.',
    ],
    signals: ['스스로 역할을 정의해 본 경험', '새로운 분야를 빠르게 배우는 방식', '아이디어를 작은 실행으로 옮기는 태도'],
    notRequired: ['완성된 사업계획서', '처음부터 장기 합류를 약속하는 결단', '무급 전문 노동이나 과도한 선행 작업'],
  },
];

export const CAREER_PROCESS: readonly CareerProcessStep[] = [
  {
    step: '01',
    title: '지원 내용을 읽습니다',
    description: '이력의 화려함보다 어떤 문제를 어떻게 풀었는지, Propig에서 무엇을 함께 만들고 싶은지 살펴봅니다.',
    candidatePromise: '역할이 열리지 않은 인재풀 문의라면 그 사실을 채용 확정처럼 포장하지 않습니다.',
  },
  {
    step: '02',
    title: '서로의 질문을 나눕니다',
    description: '회사가 지원자를 평가하는 시간만이 아니라 지원자도 역할, 책임, 협업 방식을 확인하는 대화로 진행합니다.',
    candidatePromise: '급여·계약·근무 조건이 확정된 역할은 긴 절차 전에 먼저 안내합니다.',
  },
  {
    step: '03',
    title: '필요할 때 작은 실무를 확인합니다',
    description: '말만으로 확인하기 어려운 역할에 한해 범위와 예상 시간을 먼저 합의한 작은 과제나 작업 대화를 진행할 수 있습니다.',
    candidatePromise: '실제 사업에 사용하는 무급 결과물이나 과도하게 긴 과제를 요구하지 않습니다.',
  },
  {
    step: '04',
    title: '조건과 다음 행동을 서면으로 맞춥니다',
    description: '역할, 계약 형태, 보상, 시작 시점, 근무 방식과 첫 목표를 서로 이해할 수 있는 문장으로 확인합니다.',
    candidatePromise: '합류 여부와 관계없이 제출 자료와 대화 내용을 필요한 범위에서만 다룹니다.',
  },
];

export const CAREER_FAQS: readonly CareerFaq[] = [
  {
    question: '현재 바로 채용 중인 포지션이 있나요?',
    answer: '현재 페이지에는 확정된 인원·마감일이 있는 공개 포지션 대신 인재풀과 협업 제안 접수 경로를 안내합니다. 실제 역할이 열리면 책임 범위, 계약 형태, 근무 방식과 확인 가능한 조건을 공고에 별도로 표시합니다.',
  },
  {
    question: '신입이나 경력 전환자도 지원할 수 있나요?',
    answer: '가능합니다. 연차보다 문제를 이해하고 끝까지 해결한 경험을 봅니다. 포트폴리오가 없다면 직접 개선한 일의 전후와 본인이 맡은 역할을 짧은 문서나 링크로 보내도 충분합니다.',
  },
  {
    question: '포트폴리오에 회사나 고객 정보가 포함돼 있어요.',
    answer: '비밀정보를 보내지 마세요. 회사명, 고객명, 수치와 화면을 가리고 문제·역할·판단·배운 점만 설명해도 됩니다. 공개할 권한이 없는 파일은 첨부하지 않는 것이 가장 좋습니다.',
  },
  {
    question: '지원 후 언제 답변을 받을 수 있나요?',
    answer: '확정된 채용 일정이 없는 인재풀 문의는 즉시 전형으로 이어지지 않을 수 있습니다. 실제 역할과 연결되는 경우 제공한 연락 방법으로 다음 대화를 제안합니다. 응답 기한을 확정할 수 있을 때는 공고에 명시합니다.',
  },
  {
    question: '급여와 근무 조건은 언제 확인할 수 있나요?',
    answer: '실제 역할이 열리면 긴 과제나 여러 차례 대화 전에 책임 범위와 함께 안내하는 것을 원칙으로 합니다. 현재 확정되지 않은 숫자나 복지를 페이지에서 약속하지 않습니다.',
  },
  {
    question: '지원 내용을 수정하거나 삭제하고 싶어요.',
    answer: `지원 페이지의 초안은 브라우저에만 저장되므로 직접 초기화할 수 있습니다. 이메일을 보낸 뒤 정정이나 삭제가 필요하면 ${CAREER_SUPPORT_EMAIL}으로 요청해 주세요.`,
  },
];

const LEGACY_TRACK_MAP: Record<string, CareerTrackId> = {
  staff: 'product',
  friends: 'operations',
  girlfriend: 'creative',
  other: 'open',
};

export function getCareerTrack(value: string | null | undefined): CareerTrack {
  const normalized = value ? (LEGACY_TRACK_MAP[value] ?? value) : 'product';
  return CAREER_TRACKS.find((track) => track.id === normalized) ?? CAREER_TRACKS[0];
}

export interface CareerApplicationDraft {
  trackId: CareerTrackId;
  name: string;
  email: string;
  phone: string;
  portfolio: string;
  introduction: string;
  motivation: string;
  availability: string;
  questions: string;
}

export function getCareerApplicationMailto(draft: CareerApplicationDraft): string {
  const track = getCareerTrack(draft.trackId);
  const subject = `[PRO PIG 인재풀] ${track.label} · ${draft.name.trim()}`;
  const body = [
    'PRO PIG 인재풀 및 협업 제안으로 연락드립니다.',
    '',
    `관심 분야: ${track.label}`,
    `이름: ${draft.name.trim()}`,
    `이메일: ${draft.email.trim()}`,
    `연락처: ${draft.phone.trim() || '미기재'}`,
    `포트폴리오·작업 링크: ${draft.portfolio.trim() || '미기재'}`,
    '',
    '[나와 경험 소개]',
    draft.introduction.trim(),
    '',
    '[Propig과 함께하고 싶은 이유]',
    draft.motivation.trim(),
    '',
    '[가능한 시점·협업 형태]',
    draft.availability.trim() || '대화 후 협의',
    '',
    '[먼저 확인하고 싶은 질문]',
    draft.questions.trim() || '없음',
    '',
    '※ 이메일 앱에서 내용을 다시 확인하고 필요한 이력서 또는 포트폴리오 파일을 직접 첨부한 뒤 전송해 주세요.',
  ].join('\n');

  return `mailto:${CAREER_SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
