import Link from 'next/link';

export default function NotFound() {
  return (
    <main style={{ minHeight: '65vh', display: 'grid', placeItems: 'center', padding: '32px 16px' }}>
      <section style={{ width: 'min(560px, 100%)', padding: 30, border: '1px solid #e4e7ec', borderRadius: 20, background: '#fff', textAlign: 'center', boxShadow: '0 18px 48px rgba(16,24,40,.08)' }}>
        <p style={{ margin: '0 0 8px', color: '#4f46e5', fontSize: 13, fontWeight: 900 }}>404</p>
        <h1 style={{ margin: '0 0 10px', color: '#101828', fontSize: 28 }}>요청한 페이지를 찾을 수 없습니다</h1>
        <p style={{ margin: '0 0 22px', color: '#667085', lineHeight: 1.65 }}>주소가 변경됐거나 접근할 수 없는 페이지입니다. 홈에서 필요한 메뉴를 다시 선택해 주세요.</p>
        <Link href="/" style={{ display: 'inline-flex', minHeight: 44, alignItems: 'center', padding: '0 18px', borderRadius: 11, background: '#4f46e5', color: '#fff', fontWeight: 800, textDecoration: 'none' }}>홈으로 이동</Link>
      </section>
    </main>
  );
}
