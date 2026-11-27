import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BarChart3, CloudSun, Cpu, Grid3X3, NotebookPen } from 'lucide-react';
import styles from './About.module.css';

const description = '메모, 할 일, PC 상태, 시계·날씨, 국내 증시와 MiraBox를 웹 대시보드와 Windows 바탕화면 위젯으로 확인하세요.';

export const metadata: Metadata = {
  title: '그뚠앱 | 나에게 맞는 대시보드',
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
        <h1 id="geuttun-title">그뚠앱</h1>
        <p className={styles.headline}>나에게 맞는 대시보드</p>
        <p className={styles.summary}>
          자주 쓰는 위젯을 골라 웹 대시보드를 구성하세요.
          Windows에서는 필요한 위젯을 바탕화면에 따로 띄울 수 있습니다.
        </p>
        <div className={styles.actions}>
          <Link className={styles.primary} href="/propig">
            대시보드 열기 <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <a className={styles.secondary} href="https://apps.microsoft.com/detail/restricted/9P80XDSKT26X">
            Windows 앱 설치 (테스터)
          </a>
        </div>
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
