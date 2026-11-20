'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export default function Loading() {
  const pathname = usePathname();
  return <RouteLoading key={pathname} />;
}

function RouteLoading() {
  const [isDelayed, setIsDelayed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsDelayed(true), 15_000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={isDelayed ? '페이지 로딩 지연' : '페이지를 불러오는 중'}
      data-route-loading="true"
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: 'var(--bg-primary, #090d13)',
        color: 'var(--text-main, #e8edf5)',
      }}
    >
      <div style={{ display: 'grid', justifyItems: 'center', gap: 12, maxWidth: 420, textAlign: 'center' }}>
        <span
          className="propig-route-loading-spinner"
          aria-hidden="true"
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            border: '3px solid rgba(148, 163, 184, 0.24)',
            borderTopColor: 'var(--accent, #6ee7b7)',
            animation: isDelayed ? 'none' : 'propig-route-loading-spin 700ms linear infinite',
          }}
        />
        <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-muted, #94a3b8)' }}>
          {isDelayed ? '페이지를 불러오는 데 시간이 걸리고 있습니다' : '페이지를 준비하고 있습니다'}
        </span>
        {isDelayed ? (
          <>
            <p style={{ margin: 0, fontSize: '0.82rem', lineHeight: 1.6 }}>
              연결이 느리거나 페이지 전환이 멈췄을 수 있습니다.
              잠시 더 기다리거나 새로고침해 다시 열어 주세요.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 16px', borderRadius: 8,
                border: '1px solid var(--text-muted, #94a3b8)',
                background: 'var(--bg-primary, #090d13)',
                color: 'inherit', font: 'inherit', cursor: 'pointer',
              }}
            >
              페이지 새로고침
            </button>
          </>
        ) : null}
        <style>{`
          @keyframes propig-route-loading-spin { to { transform: rotate(360deg); } }
          @media (prefers-reduced-motion: reduce) {
            .propig-route-loading-spinner { animation: none !important; }
          }
        `}</style>
      </div>
    </div>
  );
}
