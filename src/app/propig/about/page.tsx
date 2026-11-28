import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BarChart3, CloudSun, Cpu, Grid3X3, NotebookPen } from 'lucide-react';
import styles from './About.module.css';

const description = '그뚠웹에서 대시보드를 꾸미고, 그뚠앱으로 Android와 iPhone 홈 화면에, 그뚠뎃으로 Windows 바탕화면에 위젯을 추가하세요.';

export const metadata: Metadata = {
  title: '그뚠웹·그뚠앱·그뚠뎃 | 위젯 사용 안내',
  description,
};

const features = [
  {
    icon: NotebookPen,
    title: '메모와 할 일',
    detail: '메모, 할 일, 습관 중 자주 쓰는 위젯을 고르고 순서를 바꿔 보세요.',
  },
  {
    icon: Cpu,
    title: '시스템 정보',
    detail: 'Windows PC의 CPU, 메모리, 디스크 사용량을 확인하고 같은 계정의 웹에서도 보세요.',
  },
  {
    icon: CloudSun,
    title: '시계와 날씨',
    detail: '한국 시간과 선택한 도시의 날씨를 웹과 바탕화면 위젯에서 확인하세요.',
  },
  {
    icon: BarChart3,
    title: '국내 증시',
    detail: '공공데이터포털 키를 연결해 코스피·코스닥 지수와 원하는 종목의 일별 시세를 보세요.',
  },
  {
    icon: Grid3X3,
    title: 'MiraBox 하드웨어 연동',
    detail: '연결된 Stream Dock XL의 프로필과 키를 확인하고, 지원되는 동작을 Windows에서 확인 후 실행하세요.',
  },
];

export default function GeuttunAboutPage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="geuttun-title">
        <h1 id="geuttun-title">나에게 맞는 위젯 대시보드</h1>
        <p className={styles.summary}>
          그뚠웹에서 메모와 할 일을 정리하고, 같은 계정으로 오늘의 기록을 이어가세요.
          그뚠앱은 휴대폰 홈 화면에, 그뚠뎃은 Windows 바탕화면에 필요한 정보를 띄워 줍니다.
        </p>
        <div className={styles.actions}>
          <Link className={styles.primary} href="/propig">
            그뚠웹 대시보드 열기 <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </section>
      <section className={styles.platforms} aria-labelledby="geuttun-platforms">
        <h2 id="geuttun-platforms">내 기기에 위젯 추가하기</h2>
        <ul>
          <li>
            <h3>웹 브라우저 · 그뚠웹</h3>
            <p><Link href="/propig/store">상점</Link>에서 사용할 앱을 등록한 뒤 대시보드에서 위젯을 끌어 순서를 정하세요.</p>
          </li>
          <li>
            <h3>Android · 그뚠앱</h3>
            <p>그뚠앱을 설치하고 홈 화면의 빈 곳을 길게 누르세요. ‘위젯’에서 그뚠앱의 ‘오늘 요약’을 추가하세요. ‘오늘 습관’을 고르면 홈 화면에서 습관을 바로 체크할 수 있습니다.</p>
          </li>
          <li>
            <h3>iPhone · 그뚠앱</h3>
            <p>그뚠앱에서 이메일로 로그인하세요. 홈 화면의 빈 곳을 길게 누른 뒤 위젯 추가 메뉴에서 ‘그뚠앱’을 검색하고 ‘오늘 요약’을 원하는 위치에 놓으세요.</p>
          </li>
          <li>
            <h3>Windows · 그뚠뎃</h3>
            <p>앱에서 계정을 연결하고 ‘위젯’ 메뉴에서 ‘메모 위젯 열기’ 등을 선택하세요. 바탕화면에서 창을 끌어 위치와 크기를 정할 수 있습니다.</p>
            <a className={styles.pcLink} href="https://apps.microsoft.com/detail/restricted/9P80XDSKT26X">
              Windows 테스터용 설치 <ArrowRight size={16} aria-hidden="true" />
            </a>
          </li>
        </ul>
        <p className={styles.mobileSummary}>
          휴대폰의 ‘오늘 요약’은 그뚠앱에서 마지막으로 확인한 할 일과 습관의 완료 개수, 갱신 시각을 보여 줍니다.
          위젯을 누르면 대시보드가 열립니다. Google Play와 App Store 공개 배포는 준비 중입니다.
        </p>
      </section>
      <section className={styles.features} aria-labelledby="geuttun-features">
        <h2 id="geuttun-features">위젯과 연결 기능</h2>
        <ul>
          {features.map(({ icon: Icon, title, detail }) => (
            <li key={title}>
              <Icon size={22} aria-hidden="true" />
              <div>
                <h3>{title}</h3>
                <p>{detail}</p>
              </div>
            </li>
          ))}
        </ul>
        <Link className={styles.pcLink} href="/propig/pc-widgets">
          PC 위젯 살펴보기 <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}
