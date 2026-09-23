'use client';

import { useEffect } from 'react';

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[route-error]', error);
  }, [error]);

  return (
    <main style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: '32px 16px' }}>
      <section role="alert" style={{ width: 'min(560px, 100%)', padding: 28, border: '1px solid #e4e7ec', borderRadius: 20, background: '#fff', boxShadow: '0 18px 48px rgba(16,24,40,.08)', textAlign: 'center' }}>
        <p style={{ margin: '0 0 8px', color: '#4f46e5', fontSize: 12, fontWeight: 800 }}>PROPIG</p>
        <h1 style={{ margin: '0 0 10px', color: '#101828', fontSize: 26 }}>화면을 불러오지 못했습니다</h1>
        <p style={{ margin: '0 0 20px', color: '#667085', lineHeight: 1.65 }}>잠시 후 다시 시도해 주세요. 작성 중인 내용이 있다면 페이지를 새로고침하기 전에 먼저 재시도하는 것이 안전합니다.</p>
        <button type="button" onClick={reset} style={{ minHeight: 44, padding: '0 18px', border: 0, borderRadius: 11, background: '#4f46e5', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>다시 시도</button>
        {error.digest ? <small style={{ display: 'block', marginTop: 14, color: '#98a2b3' }}>오류 참조: {error.digest}</small> : null}
      </section>
    </main>
  );
}
