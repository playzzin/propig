'use client';

export default function AgentChat() {
    return (
        <section
            aria-labelledby="agent-development-only-title"
            style={{
                maxWidth: 760,
                margin: '40px auto',
                padding: 32,
                borderRadius: 20,
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-card)',
                color: 'var(--text-main)',
            }}
        >
            <p style={{ margin: '0 0 8px', color: 'var(--primary-light)', fontWeight: 700 }}>
                DEVELOPMENT ONLY
            </p>
            <h1 id="agent-development-only-title" style={{ margin: '0 0 12px', fontSize: '1.6rem' }}>
                Agent 테스트 기능은 운영 환경에서 비활성화됩니다
            </h1>
            <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                이 화면은 로컬 개발용 진단 도구입니다. 정적 Firebase Hosting에서는 관리자 작업 API를
                노출하지 않으며, OpenRouter 기반 사용자 기능은 각 전용 화면에서 이용할 수 있습니다.
            </p>
        </section>
    );
}
