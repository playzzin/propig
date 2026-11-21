import type { ProductId } from './productCatalogData';

export const WEB_STORY_MS = 12_000;
export const WEB_STORY_CUTS = [0, 3000, 6000, 9000] as const;

type WebStoryShot = { label: string; line: string; alt: string };
export type WebStory = {
  id: 'pc-web' | 'mobile-web' | 'global-web';
  label: string;
  productId: ProductId<'web-app'>;
  feature: string;
  title: string;
  premise: string;
  image: string;
  video: string;
  shots: readonly [WebStoryShot, WebStoryShot, WebStoryShot, WebStoryShot];
};

const directory = '/images/corp/products/web-stories';

export const WEB_STORIES = [
  {
    id: 'pc-web', label: '그뚠웹', title: '이마에 붙은 할 일',
    productId: 'web-product-starter', feature: '업무 보드',
    premise: '사라진 업무 메모 한 장. 그뚠이가 찾아서 PC 업무 보드에 붙이면 휴대폰에도 도착합니다.',
    image: `${directory}/desk.webp`, video: '/videos/corp/web-desk.mp4',
    shots: [
      { label: '메모 찾기', line: '분명 여기 붙여 뒀는데…', alt: '메모가 가득한 책상 앞에서 그뚠이가 눈을 치켜뜬다. 찾던 노란 메모는 자기 이마에 붙어 있다.' },
      { label: '범인 발견', line: '아, 내가 게시판이었네.', alt: '그뚠이가 이마에서 노란 메모를 떼어 손가락 사이에 들고 바라본다.' },
      { label: '보드 정리', line: '이번엔 진짜 보드에!', alt: '그뚠이가 모니터의 업무 보드에 체크 표시가 있는 메모를 옮긴다.' },
      { label: '폰에 도착', line: '좋아. 이제 들고 나가자.', alt: '정리를 마친 그뚠이가 책상 위 휴대폰을 본다. 같은 노란 업무 카드가 화면에 도착했다.' },
    ],
  },
  {
    id: 'mobile-web', label: '그뚠앱', title: '출근길의 한 손 캐치',
    productId: 'web-product-starter', feature: '현장 확인',
    premise: 'PC에서 보낸 업무 카드가 지하철에 도착합니다. 그뚠이가 흔들리는 전동차에서 확인을 누를 수 있을까요?',
    image: `${directory}/phone.webp`, video: '/videos/corp/web-phone.mp4',
    shots: [
      { label: '알림 도착', line: '책상 두고 왔어도 일은 왔네.', alt: '지하철에서 그뚠이가 휴대폰을 들어 PC에서 받은 노란 업무 카드를 확인한다.' },
      { label: '폰이 붕', line: '잠깐, 너는 내릴 역이 아니야!', alt: '전동차가 흔들리자 휴대폰이 그뚠이의 펼친 손 위로 떠오른다.' },
      { label: '잡고 확인', line: '잡았다. 확인까지 딱!', alt: '그뚠이가 두 손으로 휴대폰을 받아 내고 엄지로 노란 카드의 확인 표시를 누른다.' },
      { label: '팀에 전송', line: '팀에는 비행기로 보내자.', alt: '그뚠이가 카드를 보내자 노란 종이비행기가 휴대폰에서 날아오른다.' },
    ],
  },
  {
    id: 'global-web', label: '글로벌 연결', title: '메모의 세계 일주',
    productId: 'web-customer-portal', feature: '다국어 협업',
    premise: '업무 카드가 종이비행기가 되어 서울을 떠납니다. 도시마다 불이 켜지고 마지막 답장이 돌아옵니다.',
    image: `${directory}/world.webp`, video: '/videos/corp/web-world.mp4',
    shots: [
      { label: '서울 출발', line: '서울에서 보냅니다!', alt: '저녁 작업실에서 그뚠이가 지구본 위로 노란 종이비행기를 날린다.' },
      { label: '도시 비행', line: '도쿄 지나, 런던으로.', alt: '작은 도쿄 타워와 런던 시계탑 사이를 노란 종이비행기가 지난다.' },
      { label: '뉴욕 도착', line: '뉴욕 팀도 받았군.', alt: '그뚠이가 세계 모형 위에 몸을 기울인다. 뉴욕의 건물 주변에 도착을 알리는 불빛이 켜진다.' },
      { label: '답장 착륙', line: '답장은… 제 코에 도착했습니다.', alt: '돌아온 노란 종이비행기가 그뚠이의 코끝에 내려앉고 그뚠이가 눈을 모아 바라본다.' },
    ],
  },
] as const satisfies readonly WebStory[];
