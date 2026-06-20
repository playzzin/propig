'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/firebase/config';
import { doc, getDoc } from 'firebase/firestore';

type AdminAccessState = {
  isAdmin: boolean;
  canWriteFirestore: boolean;
};

type AdminCheckPayload = {
  ok?: boolean;
  role?: string;
  canWriteFirestore?: boolean;
};

export function useAdminAccess() {
  const { currentUser, loading: authLoading } = useAuth();

  const query = useQuery<AdminAccessState>({
    queryKey: ['admin-access', currentUser?.uid ?? 'anonymous'],
    enabled: Boolean(currentUser),
    retry: false,
    queryFn: async () => {
      if (!currentUser) {
        return { isAdmin: false, canWriteFirestore: false };
      }

      const tokenResult = await currentUser.getIdTokenResult(true);
      if (tokenResult.claims.admin === true || tokenResult.claims.role === 'admin') {
        return { isAdmin: true, canWriteFirestore: true };
      }

      const [adminDoc, accessDoc] = await Promise.all([
        getDoc(doc(db, 'admins', currentUser.uid)).catch(() => null),
        getDoc(doc(db, 'userAccess', currentUser.uid)).catch(() => null),
      ]);
      if (adminDoc?.exists()) {
        return { isAdmin: true, canWriteFirestore: true };
      }
      if (accessDoc?.exists() && accessDoc.data()?.role === 'admin') {
        return { isAdmin: true, canWriteFirestore: true };
      }

      const token = await currentUser.getIdToken(true);
      const response = await fetch('/api/admin/check', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        return { isAdmin: false, canWriteFirestore: false };
      }

      const payload = (await response.json()) as AdminCheckPayload;
      return {
        isAdmin: payload.ok === true && payload.role === 'admin',
        canWriteFirestore: payload.canWriteFirestore === true,
      };
    },
  });

  return {
    currentUser,
    isAuthLoading: authLoading,
    isAdmin: query.data?.isAdmin === true,
    canWriteFirestore: query.data?.canWriteFirestore === true,
    isCheckingAdmin: authLoading || (Boolean(currentUser) && query.isLoading),
    error: query.error,
    refetch: query.refetch,
  };
}
