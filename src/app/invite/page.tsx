'use client';

import { useEffect, useState } from 'react';
import InvitationAcceptance from '@/components/admin/InvitationAcceptance';

export default function InvitePage() {
  const [linkVersion, setLinkVersion] = useState(0);
  useEffect(() => {
    // Opening another original link in the same tab can be a hash-only navigation.
    // Remount to capture that secret and invalidate any old in-flight acceptance.
    const receiveLink = () => { if (window.location.hash) setLinkVersion(version => version + 1); };
    window.addEventListener('hashchange', receiveLink);
    return () => window.removeEventListener('hashchange', receiveLink);
  }, []);
  return <InvitationAcceptance key={linkVersion} />;
}
