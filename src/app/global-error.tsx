'use client';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, background: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20 }}>
          <section role="alert" style={{ width: 'min(520px, 100%)', padding: 30, borderRadius: 20, background: '#fff', textAlign: 'center', boxShadow: '0 18px 48px rgba(16,24,40,.1)' }}>
            <h1 style={{ margin: '0 0 10px', color: '#101828' }}>서비스 화면을 복구할 수 없습니다</h1>
            <p style={{ margin: '0 0 20px', color: '#667085', lineHeight: 1.65 }}>일시적인 문제가 발생했습니다. 다시 시도해도 계속되면 잠시 후 접속해 주세요.</p>
            <button type="button" onClick={reset} style={{ minHeight: 44, padding: '0 18px', border: 0, borderRadius: 11, background: '#4f46e5', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>서비스 다시 불러오기</button>
          </section>
        </main>
      </body>
    </html>
  );
}
