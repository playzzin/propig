'use client';

import { useState } from 'react';
import { SiteAppDownload } from '@/components/site-home/SiteAppDownload';
import Link from 'next/link';
import { SiteHomePage } from '@/components/site-home/SiteHomePage';
import { ADMIN_HOME_CONTENT } from '@/constants/siteHomeContent';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentUserAccess } from '@/hooks/useCurrentUserAccess';
import { hasAdminSiteAccess } from '@/utils/menuAccess';

export default function AdminHomePage() {
  const { loginWithGoogle, isConfigured } = useAuth();
  const { currentUser, access, isLoading } = useCurrentUserAccess();
  const [signingIn, setSigningIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  if (isLoading) {
    return <section id="content-area" style={{ padding: 28 }} role="status">관리자 접근 권한을 확인하고 있습니다.</section>;
  }

  if (currentUser && hasAdminSiteAccess(access)) {
    return <SiteHomePage {...ADMIN_HOME_CONTENT} appSiteId="admin" />;
  }

  const signIn = async () => {
    setSigningIn(true);
    setLoginError('');
    try {
      await loginWithGoogle();
    } catch {
      setLoginError('로그인을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <section id="content-area" style={{ padding: 28, overflowY: 'auto', flex: 1, minHeight: 0 }}>
      <div style={{ maxWidth: 640, margin: '32px auto', padding: 28, borderRadius: 20, background: 'var(--bg-card)', border: '1px solid var(--border-medium)', color: 'var(--text-main)' }}>
        <SiteAppDownload siteId="admin" />
        <p style={{ color: 'var(--text-muted)' }}>관리자 접근 안내</p>
        <h1>{currentUser ? '관리 권한이 필요합니다' : '로그인이 필요합니다'}</h1>
        <p style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>
          {currentUser
            ? '이 계정에는 관리 사이트 접근 권한이 없습니다. 필요한 업무 권한을 관리자에게 요청해주세요.'
            : '관리 도구는 로그인 후 부여된 권한에 따라 사용할 수 있습니다. 공개 사이트는 로그인 없이 계속 이용할 수 있습니다.'}
        </p>
        {!currentUser && (
          <button type="button" onClick={() => void signIn()} disabled={!isConfigured || signingIn} style={{ minHeight: 44, padding: '10px 18px', marginBottom: 16, borderRadius: 10, cursor: 'pointer', color: 'var(--text-main)', background: 'var(--bg-elevated)', border: '1px solid var(--border-medium)' }}>
            {signingIn ? '로그인 중…' : 'Google로 로그인'}
          </button>
        )}
        {!currentUser && !isConfigured && <p role="status">현재 로그인 연결을 사용할 수 없습니다. 공개 사이트를 이용해주세요.</p>}
        {loginError && <p role="alert">{loginError}</p>}
        <nav aria-label="공개 사이트로 이동" style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          <Link href="/corp" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>기업 사이트</Link>
          <Link href="/blog" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>블로그</Link>
          <Link href="/propig" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>propig 홈</Link>
        </nav>
      </div>
    </section>
  );
}
