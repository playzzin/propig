import type { User } from 'firebase/auth';

export async function buildJsonAuthHeaders(currentUser: User | null): Promise<Record<string, string>> {
  if (!currentUser) {
    throw new Error('로그인이 필요합니다.');
  }

  const token = await currentUser.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}
