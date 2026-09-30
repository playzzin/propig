import type { Metadata } from 'next';
import InvitationManager from '@/components/admin/InvitationManager';

export const metadata: Metadata = {
  title: '온보딩 초대 관리 | ProPig',
  robots: { index: false, follow: false },
};

export default function AdminInvitationsPage() {
  return <InvitationManager />;
}
