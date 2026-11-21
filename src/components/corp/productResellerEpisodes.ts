export const RESELLER_EPISODE_MS = 12_000;
export const RESELLER_CUTS = [0, 3000, 6000, 8000] as const;

type Shot = { label: string; line: string; alt: string };
type Episode = {
  id: string;
  label: string;
  item: string;
  description: string;
  image: string;
  focus: string;
  jolt: readonly [number, number, number];
  sound: string;
  shots: readonly [Shot, Shot, Shot, Shot];
};

const directory = '/images/corp/products/commerce';

export const RESELLER_EPISODES = [
  {
    id: 'naver', label: '네이버스토어', item: '원목 의자',
    description: '그뚠이의 의자 사용 후기를 스토어 상품 링크로 연결하는 브랜드 시연입니다.',
    image: `${directory}/reel-chair.webp`, focus: '53% 69%', jolt: [0, 2, -.35], sound: '우지끈!',
    shots: [
      { label: '의자 소개', line: '자, 앉아 보겠습니다.', alt: '그뚠이가 한 손을 펴서 청록색 방석이 달린 원목 의자를 소개한다.' },
      { label: '삐걱', line: '…방금 누구 한숨 쉬었어요?', alt: '그뚠이가 앉자 무게를 받은 의자 앞다리 둘이 활처럼 휜다.' },
      { label: '주저앉기', line: '어어, 높이 조절이…!', alt: '의자 다리가 양옆으로 부러지고 그뚠이가 방석째 바닥으로 떨어진다.' },
      { label: '사용 후기', line: '오늘부터 좌식입니다.', alt: '그뚠이가 납작해진 방석에 앉아 부러진 의자 다리를 마이크처럼 쥔다. 뒤에는 산호색 셔츠가 걸려 있다.' },
    ],
  },
  {
    id: 'coupang', label: '쿠팡파트너스', item: '버튼 셔츠',
    description: '단추가 튀는 셔츠 광고에서 제휴 상품 링크로 이어지는 브랜드 시연입니다.',
    image: `${directory}/reel-shirt.webp`, focus: '56% 49%', jolt: [-1.4, .25, .45], sound: '찌이익!',
    shots: [
      { label: '옷 입기', line: '다음 방송은 좀 차려입고.', alt: '그뚠이가 거울 앞에서 흰 러닝셔츠 위로 산호색 셔츠의 두 번째 소매를 끼운다.' },
      { label: '숨 참기', line: '마지막 단추 하나만…', alt: '배 위로 셔츠가 팽팽해지자 그뚠이가 숨을 참고 양쪽 옷깃을 당긴다.' },
      { label: '단추 탈출', line: '잠깐, 어디 가!', alt: '셔츠 옆솔기가 길게 찢어져 흰 속옷이 보이고 단추 하나가 오른쪽으로 튕겨 나간다.' },
      { label: '단추 회수', line: '리모컨 옆에서 잡았습니다.', alt: '그뚠이가 찢어진 자락을 들고 손바닥 위 단추를 내려다본다. 탁자 위에는 TV 리모컨이 있다.' },
    ],
  },
  {
    id: 'aliexpress', label: '알리익스프레스', item: 'TV',
    description: '리모컨 소동을 짧은 광고로 만들어 글로벌 상품 링크에 연결하는 브랜드 시연입니다.',
    image: `${directory}/reel-television.webp`, focus: '68% 40%', jolt: [1.6, -.5, -.75], sound: '펑!',
    shots: [
      { label: '전원 켜기', line: '이번 단추는 전원입니다.', alt: '그뚠이가 검게 꺼진 TV를 향해 리모컨 전원 버튼을 누른다.' },
      { label: '무응답', line: '분명 눌렀는데.', alt: '화면이 그대로이자 그뚠이가 TV 코앞에서 리모컨을 다시 누른다.' },
      { label: '툭, 펑!', line: '딱 한 번 톡 쳤는데…', alt: '그뚠이가 손바닥으로 TV 옆을 한 대 치자 노란 별과 보랏빛 연기가 펑 터지고 TV가 기운다.' },
      { label: '연기 한 줄', line: '…반응은 빠르네요.', alt: 'TV에서 연기 한 줄이 오르고 머리가 삐친 그뚠이는 리모컨을 본다. 발치로 로봇청소기가 들어온다.' },
    ],
  },
  {
    id: 'temu', label: '테무', item: '로봇청소기',
    description: '청소기와 뒤엉킨 마지막 편에서 상품 링크로 이어지는 브랜드 시연입니다.',
    image: `${directory}/reel-vacuum.webp`, focus: '53% 76%', jolt: [.35, 2.2, .55], sound: '와작!',
    shots: [
      { label: '청소 시작', line: '뒷정리는 얘가 맡습니다.', alt: '걸레를 든 그뚠이의 운동화 앞으로 둥근 청록색 로봇청소기가 다가온다.' },
      { label: '발이 걸려', line: '내 발은 먼지가 아…', alt: '뒤꿈치가 청소기에 걸린 그뚠이가 두 팔을 벌리며 뒤로 넘어진다.' },
      { label: '엉덩방아', line: '아이쿠!', alt: '그뚠이가 청소기 위에 털썩 주저앉자 뚜껑이 갈라지고 바퀴가 튕겨 나간다.' },
      { label: '방송 끝', line: '바퀴야, 퇴근은 같이 해야지.', alt: '납작해진 청소기에 앉은 그뚠이가 떨어진 센서를 들어 보인다. 바퀴 하나가 옆으로 굴러간다.' },
    ],
  },
] as const satisfies readonly Episode[];

export type ResellerEpisode = (typeof RESELLER_EPISODES)[number];
