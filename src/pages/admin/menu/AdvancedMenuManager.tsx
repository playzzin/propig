'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

// Keep old bookmarks working without mounting a second, auto-saving menu editor.
export default function LegacyMenuManagerRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (router.isReady) void router.replace('/admin/menu');
  }, [router]);

  return (
    <main style={{ padding: 24 }}>
      <p role="status">정식 통합 메뉴 관리 화면으로 이동합니다.</p>
      <Link href="/admin/menu">통합 메뉴 관리 열기</Link>
    </main>
  );
}
