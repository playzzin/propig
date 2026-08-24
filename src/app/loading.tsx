export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="페이지를 불러오는 중"
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
      <div style={{ display: 'grid', justifyItems: 'center', gap: 12 }}>
        <span
          aria-hidden="true"
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            border: '3px solid rgba(148, 163, 184, 0.24)',
            borderTopColor: 'var(--accent, #6ee7b7)',
            animation: 'propig-route-loading-spin 700ms linear infinite',
          }}
        />
        <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-muted, #94a3b8)' }}>
          페이지를 준비하고 있습니다
        </span>
        <style>{`@keyframes propig-route-loading-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
