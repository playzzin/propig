'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/firebase/config';

export class AdminBudgetRequestError extends Error {}
export function useAdminBudgetTasks(uid: string) {
  const lifecycle = useRef({ live: false, generation: 0 });
  const controllers = useRef(new Set<AbortController>());
  useLayoutEffect(() => {
    lifecycle.current.live = true; lifecycle.current.generation += 1;
    let observed = auth.currentUser?.uid ?? null;
    const invalidate = () => { lifecycle.current.live = false; lifecycle.current.generation += 1; controllers.current.forEach(controller => controller.abort()); };
    const stop = onAuthStateChanged(auth, user => { if ((user?.uid ?? null) !== observed) { observed = user?.uid ?? null; invalidate(); } });
    return () => { stop(); invalidate(); };
  }, [uid]);
  return useCallback(() => {
    const generation = lifecycle.current.generation;
    const isCurrent = () => lifecycle.current.live && lifecycle.current.generation === generation && auth.currentUser?.uid === uid;
    const request = async (path: string, method = 'GET', body?: unknown): Promise<unknown> => {
      const controller = new AbortController(); controllers.current.add(controller);
      const assert = () => { if (!isCurrent() || controller.signal.aborted) throw new AdminBudgetRequestError('이전 계정의 요청이 중단되었습니다.'); };
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        assert();
        return await Promise.race([
          (async () => {
            const user = auth.currentUser!;
            const token = await user.getIdToken(); assert();
            const response = await fetch(path, { method, signal: controller.signal, cache: 'no-store', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); assert();
            const result: unknown = await response.json(); assert();
            if (!response.ok) throw new AdminBudgetRequestError(response.status === 409 ? '저장 버전 또는 정산 상태가 달라졌습니다. 최신 기록을 다시 조회해 주세요.' : response.status === 403 ? '전체 관리자 권한이 필요합니다.' : response.status === 401 ? '로그인이 만료되었습니다. 다시 로그인해 주세요.' : response.status === 404 ? '대상 사용자 또는 비용 기록이 없습니다.' : response.status === 400 ? '입력값을 확인해 주세요. 정산에는 확인 근거가 필요합니다.' : '결과를 확인하지 못했습니다. 현재 기록을 다시 조회해 주세요.');
            return result;
          })(),
          new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new AdminBudgetRequestError('요청 시간이 초과되었습니다. 반영 여부를 다시 조회해 확인해 주세요.')); }, 20_000); }),
        ]);
      } finally { clearTimeout(timer); controllers.current.delete(controller); }
    };
    return { isCurrent, request };
  }, [uid]);
}
