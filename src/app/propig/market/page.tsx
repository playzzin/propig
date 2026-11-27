import type { Metadata } from 'next';
import Link from 'next/link';
import MarketDashboard from '@/app/propig/market/MarketDashboard';
import styles from './MarketPage.module.css';

export const metadata: Metadata = {
  title: '국내 증시 | ProPig',
  description: '코스피·코스닥 지수와 국내 상장 종목의 시세 차트를 확인합니다.',
};

export default function MarketPage() {
  return (
    <main id="content-area" className={styles.page} aria-labelledby="market-title" tabIndex={-1}>
      <div className={styles.content}>
        <header className={styles.header}>
          <h1 id="market-title">국내 증시</h1>
          <Link className={styles.backLink} href="/propig">대시보드로</Link>
        </header>
        <MarketDashboard />
      </div>
    </main>
  );
}
