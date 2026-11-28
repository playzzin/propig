import type { Metadata } from 'next';
import DesktopMarketContent from './DesktopMarketContent';
import styles from '../../market/MarketPage.module.css';

export const metadata: Metadata = {
  title: '국내 증시 위젯 | 그뚠뎃',
};

export default function DesktopMarketPage() {
  return (
    <main className={styles.desktop} aria-label="국내 증시 위젯">
      <DesktopMarketContent />
    </main>
  );
}
