import type { Metadata } from 'next';
import MarketDashboard from '@/app/propig/market/MarketDashboard';
import styles from '../../market/MarketPage.module.css';

export const metadata: Metadata = {
  title: '국내 증시 위젯 | ProPig',
};

export default function DesktopMarketPage() {
  return (
    <main className={styles.desktop} aria-label="국내 증시 위젯">
      <MarketDashboard compact />
    </main>
  );
}
