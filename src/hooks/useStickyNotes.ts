
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { auth, db, ensureFirestorePersistence } from '@/firebase/config';
import {
    collection,
    deleteDoc,
    doc,
    getDocs,
    onSnapshot,
    query,
    serverTimestamp,
    setDoc,
    writeBatch
} from 'firebase/firestore';
import {
    StickyNote,
    StickyNoteColor,
    StickyNoteColorSchema,
    StickyNoteSchema
} from '@/types/stickyNote';
import { SmartMemoFields } from '@/types/stickyNote';
import { normalizeSmartMemoPatch } from '@/utils/smartMemo';
import {
    createId,
    clamp,
    getMaxZIndex,
    getStorageKey,
    getTagColorsStorageKey,
    normalizeTagKey,
} from '@/utils/stickyNoteUtils';

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const CANVAS_WIDTH = 4000;
const CANVAS_HEIGHT = 2400;
const FIRESTORE_BATCH_LIMIT = 450;

const StickyNotesLocalStateV1Schema = z.object({
    version: z.literal(1),
    notes: z.array(StickyNoteSchema),
}).strict();

const StickyNotesTagColorsLocalStateV1Schema = z.object({
    version: z.literal(1),
    colors: z.record(z.string(), StickyNoteColorSchema),
}).strict();

const FirestoreMillisSchema = z.unknown().transform((value, ctx) => {
    if (value === null || value === undefined) return Date.now();
    if (typeof value === 'number') return value;
    if (typeof value === 'object' && value !== null && 'toMillis' in value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
        return (value as { toMillis: () => number }).toMillis();
    }
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid timestamp' });
    return z.NEVER;
});

const FirestoreStickyNoteSchema = z.object({
    content: z.string().default(''),
    x: z.number().default(120),
    y: z.number().default(120),
    w: z.number().default(280),
    h: z.number().default(240),
    zIndex: z.number().default(1),
    color: StickyNoteColorSchema.default('sun'),
    tags: z.array(z.string()).default([]),
    isPinned: z.boolean().default(false),
    isArchived: z.boolean().default(false),
    createdAt: FirestoreMillisSchema,
    updatedAt: FirestoreMillisSchema,
    ...SmartMemoFields,
}).passthrough();

const toFirestoreStickyNote = (note: StickyNote): Omit<StickyNote, 'id'> => ({
    content: note.content,
    x: note.x,
    y: note.y,
    w: note.w,
    h: note.h,
    zIndex: note.zIndex,
    color: note.color,
    tags: note.tags,
    isPinned: note.isPinned,
    isArchived: note.isArchived,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    ...(note.memoType !== undefined ? { memoType: note.memoType } : {}),
    ...(note.checklistItems !== undefined ? { checklistItems: note.checklistItems } : {}),
    ...(note.priority !== undefined ? { priority: note.priority } : {}),
    ...(note.reminderAt !== undefined ? { reminderAt: note.reminderAt } : {}),
    ...(note.reminderAcknowledgedAt !== undefined ? { reminderAcknowledgedAt: note.reminderAcknowledgedAt } : {}),
});

const parseFirestoreStickyNote = (id: string, data: unknown): StickyNote | null => {
    const parsed = FirestoreStickyNoteSchema.safeParse(data);
    if (!parsed.success) {
        console.warn('[StickyNotes] Ignored invalid Firestore document.', { documentId: id });
        return null;
    }

    return { id, ...parsed.data } as StickyNote;
};

// Shared across view remounts: a delete must follow every already-started write.
const noteWriteChains = new Map<string, Promise<void>>();
const deletedNoteKeys = new Set<string>();
const serializeNoteWrite = (uid: string, id: string, operation: () => Promise<void>) => {
    const key = `${uid}/${id}`;
    const next = (noteWriteChains.get(key) ?? Promise.resolve()).then(operation);
    const settled = next.catch(() => {});
    noteWriteChains.set(key, settled);
    void settled.then(() => {
        if (noteWriteChains.get(key) === settled) noteWriteChains.delete(key);
    });
    return next;
};

export function useStickyNotes() {
    const { currentUser } = useAuth();

    const [notes, setNotesState] = useState<StickyNote[]>([]);
    const [tagColors, setTagColors] = useState<Record<string, StickyNoteColor>>({});
    const [storageError, setStorageError] = useState<string | null>(null);

    const notesRef = useRef<StickyNote[]>([]);
    const pendingFirestoreWritesRef = useRef<Map<string, Record<string, unknown>>>(new Map());
    const inFlightFirestoreWritesRef = useRef<Set<string>>(new Set());
    const pendingDeletedNoteIdsRef = useRef<Set<string>>(new Set());
    const firestoreWriteTimerRef = useRef<number | null>(null);
    const didAutoImportRef = useRef<Record<string, boolean>>({});
    const didAutoImportTagColorsRef = useRef<Record<string, boolean>>({});
    const pendingUserDocWritesRef = useRef<Record<string, unknown> | null>(null);
    const userDocWriteTimerRef = useRef<number | null>(null);

    const storageKey = useMemo(() => getStorageKey(currentUser?.uid ?? null), [currentUser?.uid]);
    const tagColorsStorageKey = useMemo(() => getTagColorsStorageKey(currentUser?.uid ?? null), [currentUser?.uid]);

    const clearPendingWrites = useCallback(() => {
        if (typeof window !== 'undefined' && firestoreWriteTimerRef.current !== null) {
            window.clearTimeout(firestoreWriteTimerRef.current);
            firestoreWriteTimerRef.current = null;
        }
        if (typeof window !== 'undefined' && userDocWriteTimerRef.current !== null) {
            window.clearTimeout(userDocWriteTimerRef.current);
            userDocWriteTimerRef.current = null;
        }
        pendingFirestoreWritesRef.current.clear();
        pendingUserDocWritesRef.current = null;
    }, []);

    const deleteStickyNoteDocs = useCallback(async (uid: string) => {
        await Promise.all(Array.from(noteWriteChains.entries())
            .filter(([key]) => key.startsWith(`${uid}/`)).map(([, pending]) => pending));
        await ensureFirestorePersistence();
        if (auth.currentUser?.uid !== uid) return;
        const snapshot = await getDocs(collection(db, 'users', uid, 'stickyNotes'));

        for (let index = 0; index < snapshot.docs.length; index += FIRESTORE_BATCH_LIMIT) {
            const batch = writeBatch(db);
            snapshot.docs.slice(index, index + FIRESTORE_BATCH_LIMIT).forEach((noteDoc) => {
                batch.delete(noteDoc.ref);
            });
            await batch.commit();
        }
    }, []);

    const flushFirestoreWrites = useCallback((uid: string) => {
        const pending = pendingFirestoreWritesRef.current;
        const deleted = pendingDeletedNoteIdsRef.current;
        const inFlight = inFlightFirestoreWritesRef.current;
        const entries = Array.from(pending.entries());
        const writes = new Map<string, Promise<void>>();
        pending.clear();
        for (const [id, patch] of entries) {
            if (deleted.has(id)) continue;
            inFlight.add(id);
            const write = serializeNoteWrite(uid, id, async () => {
                await ensureFirestorePersistence();
                if (auth.currentUser?.uid !== uid || deleted.has(id) || deletedNoteKeys.has(`${uid}/${id}`)) return;
                await setDoc(doc(db, 'users', uid, 'stickyNotes', id),
                    { ...patch, updatedAt: serverTimestamp() }, { merge: true });
            });
            writes.set(id, write);
            void write.catch(() => setStorageError('Sync failed')).finally(() => inFlight.delete(id));
        }
        return writes;
    }, []);

    // Flush using the owning UID, never the next render's identity. Local edits
    // are already durable; network completion during page exit is best effort.
    useEffect(() => {
        const uid = currentUser?.uid;
        return () => {
            if (uid && auth.currentUser?.uid === uid) flushFirestoreWrites(uid);
            clearPendingWrites();
            pendingFirestoreWritesRef.current = new Map();
            inFlightFirestoreWritesRef.current = new Set();
            pendingDeletedNoteIdsRef.current = new Set();
        };
    }, [currentUser?.uid, clearPendingWrites, flushFirestoreWrites]);

    const notesOwnerRef = useRef<string | null>(null);
    const recoveryBlockedRef = useRef<string | null>(null);
    const setNotes = useCallback((action: StickyNote[] | ((prev: StickyNote[]) => StickyNote[])) => {
        if (getStorageKey(auth.currentUser?.uid ?? null) !== storageKey) return;
        if (typeof action === 'function' && notesOwnerRef.current !== storageKey) return;
        if (recoveryBlockedRef.current === storageKey) {
            setStorageError('기존 메모 원본을 보존 중입니다. 저장 공간을 확보한 뒤 새로고침해주세요.');
            return;
        }
        const next = typeof action === 'function' ? action(notesRef.current) : action;
        notesRef.current = next;
        notesOwnerRef.current = storageKey;
        // Synchronous persistence also covers edit + unmount in the same batch.
        if (typeof window !== 'undefined') {
            try {
                window.localStorage.setItem(storageKey, JSON.stringify({ version: 1, notes: next }));
                setStorageError(null);
            } catch {
                setStorageError('저장 공간 부족으로 로컬 저장 실패');
            }
        }
        setNotesState(next);
    }, [storageKey]);

    // Load from Local Storage (Notes)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        let cancelled = false;
        queueMicrotask(() => {
            if (cancelled) return;
            let raw: string | null = null;
            try {
                raw = window.localStorage.getItem(storageKey);
                if (!raw) { setNotes([]); setStorageError(null); return; }
                const parsedJson = JSON.parse(raw);
                const parsed = StickyNotesLocalStateV1Schema.safeParse(parsedJson);

                if (!parsed.success) {
                    window.localStorage.setItem(`${storageKey}:recovery`, raw);
                    const candidates = isPlainRecord(parsedJson) && Array.isArray(parsedJson.notes) ? parsedJson.notes : [];
                    const recovered = candidates.flatMap(value => {
                        const note = StickyNoteSchema.safeParse(value);
                        return note.success ? [note.data] : [];
                    });
                    notesRef.current = recovered;
                    notesOwnerRef.current = storageKey;
                    setNotesState(recovered);
                    setStorageError('읽을 수 있는 메모를 복구했습니다. 원본 데이터는 복구 사본으로 보존했습니다.');
                    return;
                }
                // Hydration reads an already durable payload; do not synchronously
                // stringify/write the entire collection again on every mount.
                if (getStorageKey(auth.currentUser?.uid ?? null) !== storageKey) return;
                if (recoveryBlockedRef.current === storageKey) return;
                notesRef.current = parsed.data.notes;
                notesOwnerRef.current = storageKey;
                setNotesState(parsed.data.notes);
                setStorageError(null);
            } catch {
                if (raw) {
                    try { window.localStorage.setItem(`${storageKey}:recovery`, raw); }
                    catch { recoveryBlockedRef.current = storageKey; }
                }
                notesRef.current = [];
                notesOwnerRef.current = storageKey;
                setNotesState([]);
                setStorageError('저장된 메모를 읽지 못했습니다. 원본은 삭제하지 않았습니다.');
            }
        });
        return () => { cancelled = true; };
    }, [storageKey, setNotes]);

    // Load from Local Storage (Tag Colors)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        queueMicrotask(() => {
            const raw = window.localStorage.getItem(tagColorsStorageKey);
            if (!raw) {
                setTagColors({});
                return;
            }
            try {
                const parsedJson = JSON.parse(raw);
                const parsed = StickyNotesTagColorsLocalStateV1Schema.safeParse(parsedJson);
                if (!parsed.success) {
                    setTagColors({});
                    return;
                }
                const normalized: Record<string, StickyNoteColor> = {};
                for (const k of Object.keys(parsed.data.colors)) {
                    const v = parsed.data.colors[k];
                    const key = normalizeTagKey(k);
                    if (key) normalized[key] = v;
                }
                setTagColors(normalized);
            } catch {
                setTagColors({});
            }
        });
    }, [tagColorsStorageKey]);

    // Save to Local Storage (Tag Colors)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handle = window.setTimeout(() => {
            const payload = { version: 1, colors: tagColors } as const;
            try {
                window.localStorage.setItem(tagColorsStorageKey, JSON.stringify(payload));
            } catch {
                // ignore
            }
        }, 250);
        return () => window.clearTimeout(handle);
    }, [tagColors, tagColorsStorageKey]);

    const queueUserDocWrite = useCallback((patch: Record<string, unknown>) => {
        if (!currentUser) return;
        if (typeof window === 'undefined') return;

        const prev = pendingUserDocWritesRef.current ?? {};
        pendingUserDocWritesRef.current = { ...prev, ...patch };

        if (userDocWriteTimerRef.current !== null) return;

        userDocWriteTimerRef.current = window.setTimeout(() => {
            const p = pendingUserDocWritesRef.current;
            pendingUserDocWritesRef.current = null;
            userDocWriteTimerRef.current = null;
            if (!p) return;

            const uid = currentUser.uid;
            ensureFirestorePersistence().then(() => {
                if (auth.currentUser?.uid !== uid) return;
                return setDoc(doc(db, 'users', uid), p, { merge: true }).catch(() => setStorageError('Firestore 동기화 실패'));
            });
        }, 450);
    }, [currentUser]);

    const mergeSyncedNotes = useCallback((currentNotes: StickyNote[], syncedNotes: StickyNote[]): StickyNote[] => {
        const currentById = new Map(currentNotes.map((note) => [note.id, note]));
        const syncedIds = new Set(syncedNotes.map((note) => note.id));
        const protectedIds = new Set<string>([
            ...pendingFirestoreWritesRef.current.keys(),
            ...inFlightFirestoreWritesRef.current,
            ...Array.from(noteWriteChains.keys())
                .filter((key) => key.startsWith(`${currentUser?.uid}/`))
                .map((key) => key.slice(key.indexOf('/') + 1)),
        ]);
        const deletedIds = pendingDeletedNoteIdsRef.current;

        const merged = syncedNotes
            .filter((note) => !deletedIds.has(note.id) && !deletedNoteKeys.has(`${currentUser?.uid}/${note.id}`))
            .map((syncedNote) => {
                const currentNote = currentById.get(syncedNote.id);
                if (currentNote && protectedIds.has(syncedNote.id)) {
                    return currentNote;
                }
                return syncedNote;
            });

        for (const currentNote of currentNotes) {
            if (!protectedIds.has(currentNote.id) || syncedIds.has(currentNote.id) || deletedIds.has(currentNote.id)) {
                continue;
            }
            merged.push(currentNote);
        }

        return merged;
    }, [currentUser?.uid]);

    // Firestore Sync Setup
    useEffect(() => {
        if (!currentUser) return;
        if (typeof window === 'undefined') return;

        let unsubscribeNotes: (() => void) | null = null;
        let unsubscribeUserDoc: (() => void) | null = null;
        let didCancel = false;

        const bootstrap = async () => {
            try {
                await ensureFirestorePersistence();
                if (didCancel) return;
                setStorageError(null);

                const col = collection(db, 'users', currentUser.uid, 'stickyNotes');
                const q = query(col);

                unsubscribeNotes = onSnapshot(q, (snapshot) => {
                    if (didCancel || auth.currentUser?.uid !== currentUser.uid) return;
                    // Auto Import Logic
                    if (snapshot.empty && !didAutoImportRef.current[currentUser.uid]) {
                        didAutoImportRef.current[currentUser.uid] = true;
                        const rawLocal = window.localStorage.getItem(getStorageKey(currentUser.uid));
                        if (rawLocal) {
                            try {
                                const parsedLocal = StickyNotesLocalStateV1Schema.safeParse(JSON.parse(rawLocal));
                                if (parsedLocal.success && parsedLocal.data.notes.length > 0) {
                                    Promise.all(parsedLocal.data.notes.map(async (note) => {
                                        const ref = doc(db, 'users', currentUser.uid, 'stickyNotes', note.id);
                                        await serializeNoteWrite(currentUser.uid, note.id, async () => {
                                            if (didCancel || auth.currentUser?.uid !== currentUser.uid || pendingDeletedNoteIdsRef.current.has(note.id)) return;
                                            await setDoc(ref, toFirestoreStickyNote(note));
                                        });
                                    })).catch(() => setStorageError('메모 가져오기에 실패했습니다.'));
                                }
                            } catch {
                                setStorageError('저장된 메모 데이터가 손상되어 가져오지 못했습니다.');
                            }
                        }
                    }

                    const next: StickyNote[] = [];
                    snapshot.forEach((documentSnapshot) => {
                        const note = parseFirestoreStickyNote(documentSnapshot.id, documentSnapshot.data());
                        if (note) next.push(note);
                    });
                    setNotes((currentNotes) => mergeSyncedNotes(currentNotes, next));
                }, (err) => {
                    console.error(err);
                    setStorageError('Firestore Connection Failed');
                });

                const userDocRef = doc(db, 'users', currentUser.uid);
                unsubscribeUserDoc = onSnapshot(userDocRef, (snap) => {
                    const rawData = snap.data({ serverTimestamps: 'estimate' }) as unknown;
                    const rawColors = isPlainRecord(rawData) ? rawData.stickyNotesTagColors : undefined;

                    if (rawColors === undefined) {
                        if (!didAutoImportTagColorsRef.current[currentUser.uid]) {
                            didAutoImportTagColorsRef.current[currentUser.uid] = true;
                            const rawLocal = window.localStorage.getItem(getTagColorsStorageKey(currentUser.uid));
                            if (rawLocal) {
                                try {
                                    const parsedLocal = StickyNotesTagColorsLocalStateV1Schema.parse(JSON.parse(rawLocal));
                                    const normalized: Record<string, StickyNoteColor> = {};
                                    for (const k of Object.keys(parsedLocal.colors)) {
                                        const key = normalizeTagKey(k);
                                        if (key) normalized[key] = parsedLocal.colors[k];
                                    }
                                    if (Object.keys(normalized).length > 0) {
                                        queueUserDocWrite({ stickyNotesTagColors: normalized });
                                    }
                                } catch { }
                            }
                        }
                        return;
                    }

                    const parsed = z.record(z.string(), StickyNoteColorSchema).safeParse(rawColors);
                    if (parsed.success) {
                        const normalized: Record<string, StickyNoteColor> = {};
                        for (const k of Object.keys(parsed.data)) {
                            const key = normalizeTagKey(k);
                            if (key) normalized[key] = parsed.data[k];
                        }
                        setTagColors(normalized);
                    }
                }, () => setStorageError('User data sync fail'));

            } catch {
                if (!didCancel) setStorageError('Init fail');
            }
        };

        bootstrap();

        return () => {
            didCancel = true;
            unsubscribeNotes?.();
            unsubscribeUserDoc?.();
        };
    }, [currentUser, mergeSyncedNotes, queueUserDocWrite, setNotes]);

    const queueFirestoreWrite = useCallback((noteId: string, patch: Record<string, unknown>) => {
        if (!currentUser || auth.currentUser?.uid !== currentUser.uid || pendingDeletedNoteIdsRef.current.has(noteId) || deletedNoteKeys.has(`${currentUser.uid}/${noteId}`)) return;
        if (typeof window === 'undefined') return;

        const prev = pendingFirestoreWritesRef.current.get(noteId) ?? {};
        pendingFirestoreWritesRef.current.set(noteId, { ...prev, ...patch });

        if (firestoreWriteTimerRef.current !== null) return;

        const uid = currentUser.uid;
        firestoreWriteTimerRef.current = window.setTimeout(() => {
            firestoreWriteTimerRef.current = null;
            flushFirestoreWrites(uid);
        }, 450);
    }, [currentUser, flushFirestoreWrites]);

    // Actions
    const createNote = useCallback((viewport?: { scrollLeft: number, scrollTop: number, clientWidth?: number, clientHeight?: number }) => {
        const nextId = createId();

        setNotes(prev => {
            const maxZ = getMaxZIndex(prev);
            const isCompactViewport = typeof viewport?.clientWidth === 'number' && viewport.clientWidth <= 520;
            const noteWidth = isCompactViewport
                ? clamp((viewport?.clientWidth ?? 320) - 32, 240, 320)
                : 280;
            const noteHeight = isCompactViewport ? 340 : 240;
            const baseX = viewport ? viewport.scrollLeft + (isCompactViewport ? 16 : 80) : 120;
            const baseY = viewport ? viewport.scrollTop + (isCompactViewport ? 16 : 80) : 120;
            const stagger = (prev.length % 10) * 22;

            const next: StickyNote = {
                id: nextId,
                content: '',
                x: clamp(baseX + stagger, 0, CANVAS_WIDTH - noteWidth),
                y: clamp(baseY + stagger, 0, CANVAS_HEIGHT - noteHeight),
                w: noteWidth, h: noteHeight, zIndex: maxZ + 1,
                color: 'sun', tags: [], isPinned: false, isArchived: false,
                createdAt: Date.now(), updatedAt: Date.now()
            };

            if (currentUser) {
                queueFirestoreWrite(next.id, {
                    content: next.content, x: next.x, y: next.y, w: next.w, h: next.h,
                    zIndex: next.zIndex, color: next.color, tags: next.tags,
                    isPinned: next.isPinned, isArchived: next.isArchived,
                    createdAt: serverTimestamp()
                });
            }
            return [...prev, next];
        });

        return nextId;
    }, [currentUser, queueFirestoreWrite, setNotes]);

    const updateNote = useCallback((noteId: string, patch: Partial<StickyNote>) => {
        setNotes(prev => prev.map(n => {
            if (n.id !== noteId) return n;
            const safePatch = normalizeSmartMemoPatch(n, patch);
            const next = { ...n, ...safePatch, updatedAt: Date.now() };
            if (currentUser) {
                const firestorePatch: Record<string, unknown> = {};
                for (const [key, value] of Object.entries(safePatch)) {
                    if (value === undefined || key === 'id' || key === 'createdAt' || key === 'updatedAt') continue;
                    firestorePatch[key] = value;
                }
                if (Object.keys(firestorePatch).length > 0) queueFirestoreWrite(noteId, firestorePatch);
            }
            return next;
        }));
    }, [currentUser, queueFirestoreWrite, setNotes]);

    const deleteNote = useCallback((noteId: string) => {
        if (getStorageKey(auth.currentUser?.uid ?? null) !== storageKey) return;
        const removedNote = notesRef.current.find((note) => note.id === noteId);
        const deletedIds = pendingDeletedNoteIdsRef.current;
        pendingDeletedNoteIdsRef.current.add(noteId);
        if (currentUser) deletedNoteKeys.add(`${currentUser.uid}/${noteId}`);
        pendingFirestoreWritesRef.current.delete(noteId);
        setNotes(prev => prev.filter(n => n.id !== noteId));
        if (currentUser) {
            const uid = currentUser.uid;
            void serializeNoteWrite(uid, noteId, async () => {
                await ensureFirestorePersistence();
                if (auth.currentUser?.uid !== uid) return;
                await deleteDoc(doc(db, 'users', uid, 'stickyNotes', noteId));
            }).catch(() => {
                deletedIds.delete(noteId);
                deletedNoteKeys.delete(`${uid}/${noteId}`);
                if (auth.currentUser?.uid === uid && removedNote) {
                    setNotes((prev) => prev.some((note) => note.id === noteId) ? prev : [...prev, removedNote]);
                    setStorageError('메모를 삭제하지 못했습니다. 내용을 복원했으니 다시 시도해주세요.');
                }
            });
        }
    }, [currentUser, setNotes, storageKey]);

    const restoreNote = useCallback((note: StickyNote) => {
        if (getStorageKey(auth.currentUser?.uid ?? null) !== storageKey) return;
        pendingDeletedNoteIdsRef.current.delete(note.id);
        if (currentUser) deletedNoteKeys.delete(`${currentUser.uid}/${note.id}`);
        setNotes(previous => {
            if (previous.some(existing => existing.id === note.id)) return previous;
            if (currentUser) queueFirestoreWrite(note.id, { ...toFirestoreStickyNote(note) });
            return [...previous, note];
        });
    }, [currentUser, queueFirestoreWrite, setNotes, storageKey]);

    const clearNotes = useCallback(async () => {
        clearPendingWrites();
        setNotes([]);

        if (!currentUser) return;

        didAutoImportRef.current[currentUser.uid] = true;
        await deleteStickyNoteDocs(currentUser.uid);
    }, [clearPendingWrites, currentUser, deleteStickyNoteDocs, setNotes]);

    const clearAllNotesData = useCallback(async () => {
        clearPendingWrites();
        setNotes([]);
        setTagColors({});

        if (!currentUser) return;

        didAutoImportRef.current[currentUser.uid] = true;
        didAutoImportTagColorsRef.current[currentUser.uid] = true;
        await deleteStickyNoteDocs(currentUser.uid);
        await setDoc(doc(db, 'users', currentUser.uid), { stickyNotesTagColors: {} }, { merge: true });
    }, [clearPendingWrites, currentUser, deleteStickyNoteDocs, setNotes]);

    const bringToFront = useCallback((noteId: string) => {
        setNotes(prev => {
            const maxZ = getMaxZIndex(prev);
            const next = prev.map(n => n.id === noteId ? { ...n, zIndex: maxZ + 1, updatedAt: Date.now() } : n);
            if (currentUser) queueFirestoreWrite(noteId, { zIndex: maxZ + 1 });
            return next;
        });
    }, [currentUser, queueFirestoreWrite, setNotes]);

    const flushNote = useCallback(async (noteId: string) => {
        const uid = currentUser?.uid;
        if (!uid || auth.currentUser?.uid !== uid) throw new Error('로그인이 필요합니다.');
        const note = notesRef.current.find(item => item.id === noteId);
        if (!note || deletedNoteKeys.has(`${uid}/${noteId}`)) throw new Error('메모를 찾을 수 없습니다.');
        pendingFirestoreWritesRef.current.set(noteId, toFirestoreStickyNote(note));
        await flushFirestoreWrites(uid).get(noteId);
        if (auth.currentUser?.uid !== uid) throw new Error('계정이 변경되었습니다.');
    }, [currentUser?.uid, flushFirestoreWrites]);

    return {
        notes,
        storageError,
        createNote,
        updateNote,
        deleteNote,
        restoreNote,
        flushNote,
        clearNotes,
        clearAllNotesData,
        bringToFront,
        setNotes
    };
}
