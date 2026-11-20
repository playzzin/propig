import releases from '../../../public/downloads/android/manifest.json';

type Mode = keyof typeof releases;

/** The preview deliberately matches the compiled APK icon, not a later remote branding change. */
export function SiteAppDownload({ siteId }: { siteId: Mode }) {
  const app = releases[siteId];
  return (
    <aside aria-label={`${app.label} Android 앱`} style={{ margin: '16px 0', padding: 14, border: '1px solid var(--border-medium)', borderRadius: 14, background: 'var(--bg-card)', color: 'var(--text-main)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <picture style={{ display: 'flex', flexShrink: 0 }}>
            <source srcSet={`/downloads/android/${siteId}-preview.webp`} type="image/webp" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/downloads/android/${siteId}.png`} alt="" width={44} height={44} style={{ borderRadius: 11, flexShrink: 0 }} />
          </picture>
          <div>
            <strong style={{ fontSize: 14 }}>{app.label} 앱</strong>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>홈 화면 아이콘으로 이 모드에 바로 접속</p>
          </div>
        </div>
        <a href={`/downloads/android/${app.file}`} download={app.file} aria-label={`${app.label} APK 다운로드`} style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border-medium)', background: 'var(--bg-elevated)', color: 'var(--text-main)', fontSize: 13, fontWeight: 700 }}>
          APK 다운로드
        </a>
      </div>
      <details style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
        <summary style={{ cursor: 'pointer', minHeight: 44, display: 'list-item', alignContent: 'center' }}>Android 설치 안내 · v{app.version}</summary>
        <p>Android {app.minAndroid} 이상 전용입니다. 다운로드한 APK를 열어 설치하세요. 신뢰하는 이 파일을 설치할 때만 해당 브라우저의 ‘이 출처 허용’을 켜고, 설치 후 다시 꺼주세요. iPhone에는 설치할 수 없습니다.</p>
        <p>아이콘을 누르면 기본 브라우저에서 해당 모드 홈을 엽니다. 인터넷 연결이 필요하며 기존 로그인·관리 권한이 그대로 적용됩니다. 독립 WebView 앱이나 오프라인 앱이 아닙니다.</p>
        <p>아이콘은 APK 제작 시점의 모드 파비콘입니다. 파비콘 설정을 바꾸더라도 설치된 앱 아이콘은 자동으로 바뀌지 않습니다.</p>
        <p style={{ overflowWrap: 'anywhere' }}>파일 무결성 SHA-256: <code>{app.sha256}</code></p>
      </details>
    </aside>
  );
}
