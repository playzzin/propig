'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type SetStateAction } from 'react';
import type { SiteDataType } from '@/types/menu';

export type MenuSaveMode = 'manual' | 'auto';

/** Owns the editor draft, not the shared query cache. Only an acknowledged revision is clean. */
export function useMenuSaveLifecycle({ remoteData, canSave, identity, persist, autoSave }: {
  remoteData: SiteDataType | undefined;
  canSave: boolean;
  identity: string | undefined;
  persist: (data: SiteDataType, mode: MenuSaveMode) => Promise<void>;
  autoSave: boolean;
}) {
  const [sitesData, setDraft] = useState<SiteDataType>({});
  const [hasUnsavedChanges, setDirty] = useState(false);
  const [isSaving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [retryRequired, setRetryRequired] = useState(false);
  const state = useRef({ draft: {} as SiteDataType, revision: 0, dirty: false, inFlight: false,
    paused: false, mounted: false, canSave, identity, authorityRevision: 0, persist });

  useLayoutEffect(() => {
    const s = state.current;
    if (s.canSave !== canSave || s.identity !== identity) {
      s.authorityRevision += 1;
      if (s.dirty || s.inFlight) s.paused = true;
    }
    Object.assign(s, { canSave, identity, persist });
  }, [canSave, identity, persist]);

  useEffect(() => {
    const s = state.current;
    s.mounted = true;
    return () => { s.mounted = false; };
  }, []);

  useEffect(() => {
    if (!state.current.paused) return;
    queueMicrotask(() => {
      if (!state.current.mounted || !state.current.paused) return;
      setRetryRequired(true);
      setSaveError('권한 상태가 변경되어 자동 저장을 중지했습니다. 권한 확인 후 다시 저장해 주세요.');
    });
  }, [canSave, identity]);

  useEffect(() => {
    if (!remoteData) return;
    let cancelled = false;
    queueMicrotask(() => {
      const s = state.current;
      if (cancelled || !s.mounted || s.dirty || s.inFlight) return;
      s.draft = remoteData;
      setDraft(remoteData);
    });
    return () => { cancelled = true; };
  }, [remoteData]);

  const setSitesData = useCallback((update: SetStateAction<SiteDataType>) => {
    const s = state.current;
    s.draft = typeof update === 'function' ? update(s.draft) : update;
    setDraft(s.draft);
  }, []);

  const markDirty = useCallback(() => {
    const s = state.current;
    s.revision += 1;
    s.dirty = true;
    setDirty(true);
    // Editing must not silently resume a failed or permission-blocked automatic save.
    if (!s.paused) setSaveError('');
    setSaveMessage('');
  }, []);

  const runSave = useCallback(async (mode: MenuSaveMode) => {
    const s = state.current;
    if (!s.mounted || s.inFlight || !s.dirty || (mode === 'auto' && s.paused)) return;
    if (!s.canSave) {
      s.paused = true;
      setRetryRequired(true);
      setSaveError('메뉴 관리 권한을 확인한 후 다시 저장해 주세요.');
      return;
    }
    const revision = s.revision;
    const authorityRevision = s.authorityRevision;
    const snapshot = s.draft;
    s.inFlight = true; // Synchronous lock also guards two clicks in one React batch.
    setSaving(true);
    setSaveError('');
    setSaveMessage('');
    try {
      await s.persist(snapshot, mode);
      if (!s.mounted) return;
      if (!s.canSave || s.authorityRevision !== authorityRevision) {
        s.paused = true;
        setRetryRequired(true);
        setSaveError('저장 중 권한 상태가 변경되었습니다. 변경 내용은 유지되며 권한 확인 후 다시 저장해야 합니다.');
        return;
      }
      s.paused = false;
      setRetryRequired(false);
      setLastSavedAt(new Date());
      if (s.revision === revision) {
        s.dirty = false;
        setDirty(false);
        setSaveMessage(mode === 'auto' ? '자동 저장됨' : '저장됨');
      }
    } catch (error) {
      if (!s.mounted) return;
      s.paused = true;
      setRetryRequired(true);
      setSaveError('저장 실패. 변경 내용은 유지됩니다. 다시 저장을 눌러 주세요.');
      console.error('Save failed:', error);
    } finally {
      s.inFlight = false;
      if (s.mounted) setSaving(false);
    }
  }, []);

  useEffect(() => {
    if (!autoSave || !canSave || !hasUnsavedChanges || isSaving || retryRequired) return;
    const timer = window.setTimeout(() => { void runSave('auto'); }, 1200);
    return () => window.clearTimeout(timer);
  }, [autoSave, canSave, hasUnsavedChanges, isSaving, retryRequired, runSave, sitesData]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedChanges]);

  return { sitesData, setSitesData, hasUnsavedChanges, isSaving, saveError, setSaveError,
    saveMessage, setSaveMessage, lastSavedAt, retryRequired, markDirty, runSave };
}
